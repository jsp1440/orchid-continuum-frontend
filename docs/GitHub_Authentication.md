# GitHub Authentication and Pull Requests

## GitHub CLI

```powershell
gh --version
gh auth login
gh auth status
```

Choose **GitHub.com**, **HTTPS**, and browser authentication. `gh auth status` must show the intended account.

## Branch, push, PR

```powershell
git switch main
git pull --ff-only origin main
git switch -c build-descriptive-name
git add <specific files>
git commit -m "type: concise description"
git push -u origin build-descriptive-name
gh pr create --base main --head build-descriptive-name --fill
```

If `gh` is unavailable, authenticate HTTPS Git when `git push` prompts and open the PR from GitHub’s browser interface.

## Connector 404 fallback

A connector `404` commonly means wrong `owner/repo`, app installation does not include the repo, or permissions are missing. Confirm the repository URL in a browser and connector permissions; do not guess names repeatedly. Then use local Git HTTPS to clone, branch, commit, push, and open a browser PR. Report the exact connector action, `owner/repo`, response, and local fallback result.

Stop when neither connector nor authenticated local push works, write permission is absent, or branch protection policy is unclear. Do not bypass protection or force-push.