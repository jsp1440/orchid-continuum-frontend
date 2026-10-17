# Agent Branch Ownership

Each agent pushes only to its own branches. An independent checker verifies one exact commit. If another agent pushes onto that branch, the verification no longer describes it.

## Rules

1. **Claude owns `claude/**` and `field-journal/**`.** Only Claude pushes to these branches. Only Claude merges the pull request's own base into them.
2. **Copilot and every other agent work on their own branches and pull requests.** They do not push to a Claude-owned branch for any reason. That covers merging or rebasing `main` or an integration branch into it, "Update branch", fix-ups and conflict resolution. If a Claude PR needs that work, open a separate PR, or leave a comment for Claude.
3. **No agent invalidates another agent's exact-commit verification.** Do not add commits to, rewrite or force-update a head that is under independent review, in any lane. To build on a verified head, start a new branch from it.
4. **A foreign head is never integrated.** If a Claude-owned PR's head carries a foreign commit, it is not the verified head. Supersede the PR from the last Claude-made, checker-verified commit. Do not merge the foreign head and do not rewrite the branch.

Claude's identity is the git author and committer `Claude <noreply@anthropic.com>`, with a GitHub-verified signature. Claude pushes through the Claude GitHub App (app id `1236702`, slug `claude`). The app uses a user-to-server token, so `github.actor` on Claude's pushes is the owner account `jsp1440`.

## What happened (October 2026)

On backend PRs #1971, #1979 and #1984, Copilot pushed merges of `main` or `oc-autonomous-integration` onto Claude-owned branches:

| PR | Foreign head | Commit author / committer | Push actor |
| --- | --- | --- | --- |
| #1971 | `c05336f6`, `a5dec9df` | `copilot-swe-agent[bot]` / `GitHub <noreply@github.com>` (web-flow) | `Copilot` |
| #1979 | `e9cd103c` | same | `Copilot` |
| #1984 | `b7632baa` | same | `Copilot` |

The pushes did not come from the "Update branch" API, which writes a commit authored by the user who clicks it. They came from Copilot cloud-agent sessions on the existing PRs:

- each timeline shows `copilot_work_started` with actor `jsp1440`;
- a `Running Copilot cloud agent` dynamic workflow run (actor `Copilot`) appears on the branch;
- the commits are authored by `copilot-swe-agent[bot]`;
- Copilot's comments carry `performed_via_github_app: copilot-swe-agent` and are posted as the owner.

None of these PRs had an `@copilot` comment or a Copilot assignment. The sessions were started on the owner account from outside the PR conversation, for example from the Copilot agents panel, Copilot Chat or the agent-tasks API.

The same sessions have kept running on other `claude/*` branches. Workflows triggered by Copilot pushes are held at `action_required`.

## Detection: `agent-branch-ownership` check

`.github/workflows/agent-branch-ownership.yml` runs on `pull_request` (opened, synchronize, reopened) and on pushes to `claude/**` and `field-journal/**`.

The check runs `scripts/agent_branch_ownership.py`. It always uses the default branch's copy of that script, so a foreign push cannot change what the check enforces.

The check fails when either of these holds:

- a commit in the PR's `base..head` range does not meet all three conditions:
  - git author is exactly `Claude <noreply@anthropic.com>`;
  - git committer is exactly `Claude <noreply@anthropic.com>`;
  - GitHub has verified the commit's signature;
- `github.actor` is not the Claude push identity (`jsp1440`; see above).

When Claude merges the PR's own base, the merged parents are already in the base. They never appear in `base..head`, so the check allows those merges. A merge of anything else brings foreign commits into the range, and the check flags them.

On a violation, the check:

- adds the label `ownership-violation`;
- posts one PR comment naming the foreign commits, marked `<!-- agent-branch-ownership:v1 -->`, and updates that same comment on later runs.

The workflow has `contents: read`. It never pushes, reverts, resets or force-updates anything.

### Limits of the check

- Because Claude pushes as `jsp1440`, the actor allow-list cannot tell Claude from the owner. The commit-identity rule tells them apart: "Update branch" and web merges are authored by the owner.
- A workflow triggered by a Copilot push is held at `action_required` until someone approves it. Until then, the check does not run for that head either. The held runs are themselves the signal. Do not approve them to "make CI green": approval makes the result visible but does not make the head valid.
- This check detects violations. Only the ruleset below prevents them.

## Enforcement: owner-applied ruleset

`docs/rulesets/claude-owned-branches.json` is in GitHub's ruleset import format. It targets `refs/heads/claude/**` and `refs/heads/field-journal/**` with these rules:

- `update`: restrict updates;
- `non_fast_forward`: block force pushes;
- `deletion`: restrict deletions.

The only bypass actor is the Claude GitHub App (`Integration`, id `1236702`). Branch creation is not restricted, so Claude can still start new branches.

The ruleset has no `required_status_checks` rule, on purpose. A required check on the owned branches themselves would gate pushes to them, which would include Claude's own direct pushes. To require this check, add `agent-branch-ownership` to the protection of the **base** branches (`main`, `oc-autonomous-integration`). There it gates merging a Claude PR, not pushing to it.

Only the owner can apply the ruleset. Agents must not apply, edit or disable it.

### Import steps

1. Open **Settings → Rules → Rulesets**:
   - backend: <https://github.com/jsp1440/orchid-calyx-backend/settings/rules>
   - frontend: <https://github.com/jsp1440/orchid-continuum-frontend/settings/rules>
2. Choose **New ruleset → Import a ruleset**, and select `docs/rulesets/claude-owned-branches.json` from that repository.
3. Check that the bypass list shows the **Claude** app. If it does not, add it under **Bypass list → Add bypass → Apps → Claude**, and set it to always allow.
4. Save the ruleset with enforcement **Active**.
5. Verify it with Claude's next push to a `claude/*` branch:
   - the push must succeed;
   - a push to the same branch from any other actor (for example "Update branch") must be rejected.

   If Claude's push is rejected, set the ruleset's enforcement to **Disabled** and report it. The bypass may not apply to the app's user-to-server pushes. Do not add a broader bypass, such as the admin role or the owner account. That would readmit the owner-account pushes this ruleset exists to stop.

## Before merging any PR

Read every review thread, including `chatgpt-codex-connector` findings, as well as the checks. A P1 or an unresolved security finding blocks the merge. P2 findings are either fixed or answered in the thread. The durable record is `docs/AGENT-OPERATING-MEMORY.md` in `jsp1440/orchid-calyx-backend`.
