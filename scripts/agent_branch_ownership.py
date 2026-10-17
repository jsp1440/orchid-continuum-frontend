#!/usr/bin/env python3
"""Detect foreign commits and pushes on Claude-owned agent branches.

Claude owns ``claude/**`` and ``field-journal/**``. Another agent pushing onto
one of those branches (a Copilot cloud-agent session merging ``main`` into it,
an "Update branch" click, a hand-made commit) replaces the head an independent
checker verified, so exact-commit verification no longer describes the branch.
See docs/AGENT-BRANCH-OWNERSHIP.md.

This module only reads. It is fed the complete base..head range as GitHub API
commit objects (``.commits`` of ``GET /repos/{repo}/compare/{base}...{head}``,
every page) together with GitHub's ``total_commits`` for it, and the push
actor. It refuses a range that does not match the total, and reports which
commits and which actor are foreign. The calling
workflow labels and comments; nothing here, or there, pushes, reverts or
rewrites a branch.

Exit codes: 0 no violation (or branch not owned), 1 violation, 2 bad or
incomplete input (including a commit range shorter than GitHub's total).
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

OWNED_BRANCH_PREFIXES = ("claude/", "field-journal/")

CLAUDE_NAME = "Claude"
CLAUDE_EMAIL = "noreply@anthropic.com"

# Claude Code pushes through the Claude GitHub App (app id 1236702, slug
# "claude") with a user-to-server token, so `github.actor` on its pushes is the
# owner account the app acts for. Observed on every pull_request run at a
# Claude-authored head in jsp1440/orchid-calyx-backend (e.g. a272828a,
# 25bca38d, eb4027d0). Copilot cloud-agent pushes show actor "Copilot".
ALLOWED_PUSH_ACTORS = frozenset({"jsp1440"})

COMMENT_MARKER = "<!-- agent-branch-ownership:v1 -->"
VIOLATION_LABEL = "ownership-violation"


@dataclass(frozen=True)
class CommitFinding:
    sha: str
    author: str
    committer: str
    reasons: tuple[str, ...]
    summary: str = ""


@dataclass
class OwnershipReport:
    head_ref: str
    owned: bool
    actor: str
    commits_checked: int = 0
    findings: list[CommitFinding] = field(default_factory=list)
    actor_violation: str | None = None
    repo_violation: str | None = None

    @property
    def violated(self) -> bool:
        return bool(self.findings or self.actor_violation or self.repo_violation)

    def to_json(self) -> dict[str, Any]:
        return {
            "head_ref": self.head_ref,
            "owned": self.owned,
            "actor": self.actor,
            "commits_checked": self.commits_checked,
            "violated": self.violated,
            "actor_violation": self.actor_violation,
            "repo_violation": self.repo_violation,
            "foreign_commits": [
                {
                    "sha": f.sha,
                    "author": f.author,
                    "committer": f.committer,
                    "reasons": list(f.reasons),
                    "summary": f.summary,
                }
                for f in self.findings
            ],
        }


def is_owned_ref(ref: str) -> bool:
    ref = ref.removeprefix("refs/heads/")
    return any(ref.startswith(p) and len(ref) > len(p) for p in OWNED_BRANCH_PREFIXES)


def _identity(person: Mapping[str, Any] | None) -> tuple[str, str]:
    person = person or {}
    return str(person.get("name") or ""), str(person.get("email") or "")


def _is_claude(name: str, email: str) -> bool:
    return name == CLAUDE_NAME and email.lower() == CLAUDE_EMAIL


def _fmt(name: str, email: str) -> str:
    return f"{name} <{email}>" if name or email else "(missing)"


def classify_commit(commit: Mapping[str, Any]) -> CommitFinding | None:
    """Return a finding when ``commit`` is not a Claude-made commit.

    A commit is Claude's only when the git author AND the git committer are
    exactly ``Claude <noreply@anthropic.com>`` and GitHub reports the
    signature as verified. A merge commit is held to the same rule: Claude
    merging the PR's own base is allowed (those parents are in the base, so
    they never appear in base..head), but a merge someone else made is foreign
    whatever it merged.
    """

    sha = str(commit.get("sha") or "")
    git = commit.get("commit") or {}
    author_name, author_email = _identity(git.get("author"))
    committer_name, committer_email = _identity(git.get("committer"))
    reasons: list[str] = []
    if not _is_claude(author_name, author_email):
        reasons.append("non-Claude author")
    if not _is_claude(committer_name, committer_email):
        reasons.append("non-Claude committer")
    verification = git.get("verification") or {}
    if not reasons and verification.get("verified") is not True:
        # Claude's own commits are signed and verified. An unverified commit
        # wearing Claude's identity is an impersonation candidate.
        reasons.append(
            "Claude identity without a verified signature"
            f" ({verification.get('reason') or 'no verification data'})"
        )
    if not reasons:
        return None
    summary = str(git.get("message") or "").split("\n", 1)[0][:120]
    return CommitFinding(
        sha=sha,
        author=_fmt(author_name, author_email),
        committer=_fmt(committer_name, committer_email),
        reasons=tuple(reasons),
        summary=summary,
    )


def evaluate(
    *,
    head_ref: str,
    actor: str,
    commits: Iterable[Mapping[str, Any]],
    head_repo: str | None = None,
    base_repo: str | None = None,
    allowed_actors: Iterable[str] = ALLOWED_PUSH_ACTORS,
    check_actor: bool = True,
) -> OwnershipReport:
    """Check ``commits`` (the complete base..head range) and the push actor.

    ``check_actor`` is True only for events that moved the head (a push, or
    pull_request ``synchronize``). On ``opened``/``reopened`` the actor is
    whoever performed that PR action, not whoever pushed, so only the commit
    identities are judged.
    """
    report = OwnershipReport(
        head_ref=head_ref, owned=is_owned_ref(head_ref), actor=actor
    )
    if not report.owned:
        return report
    if head_repo and base_repo and head_repo.lower() != base_repo.lower():
        report.repo_violation = (
            f"head repository {head_repo} is not {base_repo}; owned branch names"
            " are only valid in the repository itself"
        )
    if check_actor and actor not in set(allowed_actors):
        report.actor_violation = (
            f"push actor `{actor or '(missing)'}` is not the Claude push identity"
        )
    for commit in commits:
        report.commits_checked += 1
        finding = classify_commit(commit)
        if finding is not None:
            report.findings.append(finding)
    return report


def render_markdown(report: OwnershipReport, *, run_url: str = "") -> str:
    lines = [COMMENT_MARKER, "## Agent branch ownership violation", ""]
    lines.append(
        f"`{report.head_ref}` is a Claude-owned branch (see"
        " `docs/AGENT-BRANCH-OWNERSHIP.md`). Only Claude may push to it; other"
        " agents work on their own branches and pull requests."
    )
    lines.append("")
    if report.repo_violation:
        lines += [f"- Repository: {report.repo_violation}", ""]
    if report.actor_violation:
        lines += [f"- Push actor: {report.actor_violation}", ""]
    if report.findings:
        lines += [
            f"Foreign commits ({len(report.findings)} of {report.commits_checked} checked):",
            "",
            "| Commit | Author | Committer | Why | Subject |",
            "| --- | --- | --- | --- | --- |",
        ]
        for f in report.findings:
            subject = f.summary.replace("|", "\\|")
            lines.append(
                f"| `{f.sha[:12]}` | {f.author} | {f.committer} | {'; '.join(f.reasons)} | {subject} |"
            )
        lines.append("")
    lines.append(
        "Exact-commit verification of this branch is no longer valid. This check"
        " never pushes, reverts or force-updates anything: the branch owner decides"
        " whether to supersede the PR from the last Claude-made, checker-verified commit."
    )
    if run_url:
        lines += ["", f"Run: {run_url}"]
    return "\n".join(lines) + "\n"


def load_commits(path: Path) -> list[dict[str, Any]]:
    """Read a JSON array, or JSON Lines (``gh api --paginate --jq '.[]'``)."""

    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    if text.startswith("["):
        data = json.loads(text)
        if not isinstance(data, list):
            raise ValueError("commit file must hold a JSON array")
        return data
    commits = [json.loads(line) for line in text.splitlines() if line.strip()]
    if not all(isinstance(c, dict) for c in commits):
        raise ValueError("every JSON line must be a commit object")
    return commits


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--head-ref", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--commits", required=True, type=Path)
    parser.add_argument("--head-repo", default="")
    parser.add_argument("--base-repo", default="")
    parser.add_argument("--run-url", default="")
    parser.add_argument("--markdown-out", type=Path)
    parser.add_argument("--json-out", type=Path)
    parser.add_argument(
        "--expected-count",
        type=int,
        required=True,
        help="total_commits GitHub reports for base...head; the range must match it",
    )
    parser.add_argument(
        "--skip-actor-check",
        action="store_true",
        help="the event did not move the head (pull_request opened/reopened)",
    )
    args = parser.parse_args(argv)

    try:
        commits = load_commits(args.commits)
    except (OSError, ValueError) as exc:
        print(f"::error::cannot read commits: {exc}", file=sys.stderr)
        return 2
    shas = {str(c.get("sha") or "") for c in commits} - {""}
    if args.expected_count < 0 or not (
        len(commits) == len(shas) == args.expected_count
    ):
        # Fail closed: a partial range proves nothing about the commits that
        # were not listed.
        print(
            f"::error::commit range not fully enumerated: got {len(commits)}"
            f" ({len(shas)} distinct SHAs),"
            f" GitHub reports {args.expected_count}",
            file=sys.stderr,
        )
        return 2

    report = evaluate(
        head_ref=args.head_ref,
        actor=args.actor,
        commits=commits,
        head_repo=args.head_repo or None,
        base_repo=args.base_repo or None,
        check_actor=not args.skip_actor_check,
    )
    if args.json_out:
        args.json_out.write_text(
            json.dumps(report.to_json(), indent=2) + "\n", encoding="utf-8"
        )
    if not report.owned:
        print(f"{args.head_ref} is not a Claude-owned branch; nothing to check.")
        return 0
    if not report.violated:
        print(
            f"Ownership check passed: {report.commits_checked} commit(s) on"
            f" {args.head_ref} are Claude's, pushed by {args.actor}."
        )
        return 0
    markdown = render_markdown(report, run_url=args.run_url)
    if args.markdown_out:
        args.markdown_out.write_text(markdown, encoding="utf-8")
    print(f"::error::Foreign push or commits on Claude-owned branch {args.head_ref}.")
    print(markdown)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
