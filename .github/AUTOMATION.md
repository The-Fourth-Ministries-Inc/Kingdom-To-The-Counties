# Automated issue diagnosis

`.github/workflows/claude-issue-triage.yml` reads an issue, works out what is
actually wrong, and then either opens a pull request with the fix or comments
on the issue saying exactly what it still needs to know.

It is deliberately willing to say "I don't know yet". A wrong PR against this
app costs more than a question does — the thing runs on volunteers' phones on
crusade day.

## Turning it on

1. **Add the API key.** Settings → Secrets and variables → Actions → New
   repository secret, named `ANTHROPIC_API_KEY`, holding a key from
   [the Claude Console](https://console.anthropic.com).

   To bill a Claude subscription instead of the API, run `claude setup-token`
   locally, store the result as `CLAUDE_CODE_OAUTH_TOKEN`, and swap the line in
   the workflow:

   ```yaml
   claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
   ```

2. **Allow Actions to open pull requests.** Settings → Actions → General →
   Workflow permissions → tick *Allow GitHub Actions to create and approve pull
   requests*. Without this the fix gets pushed but the PR call fails.

3. **Protect `main`.** The workflow is told never to push to the default
   branch, but a branch protection rule is what actually guarantees it.

That is the whole setup. Labels are created by the workflow on its first run,
so there is nothing to click for those.

## How an issue gets picked up

| Trigger | When |
| --- | --- |
| Issue opened or reopened | Immediately, for issues from owners, members and collaborators |
| `claude-fix` label added | Immediately — use this to retry an issue, or to run one that was opened by someone outside the repo |
| Scheduled sweep | Every 6 hours, takes the oldest issue nothing has looked at yet |
| Run workflow → *Claude issue triage* | On demand, against one issue number |

The sweep is what makes this a system rather than a hook. Issues opened by
people without write access are skipped by the event trigger on purpose — the
action refuses to run agents on behalf of outside accounts — and the sweep is
what brings them back in, because scheduled runs are attributed to the
repository rather than to the reporter.

## Labels

| Label | Meaning |
| --- | --- |
| `claude-triaged` | Diagnosed. A PR was opened, or the issue was answered |
| `needs-info` | Waiting on the reporter. Will not be picked up again until answered |
| `claude-fix` | Add by hand to run (or re-run) diagnosis |
| `claude-skip` | Never touch this issue |

`claude-triaged`, `needs-info` and `claude-skip` all take an issue out of the
sweep. Once someone answers a `needs-info` question, remove that label and add
`claude-fix` to send it back through.

## What it does to the code

The prompt carries the parts of `CLAUDE.md` that are easiest to get wrong, and
the run fails to open a PR if `npm test` does not pass. In particular it is
told to bump all three version markers together — the badge in `index.html`,
`CACHE` in `sw.js`, and the README marker — because a stale service worker on a
volunteer's phone is how a fix silently fails to arrive.

It cannot edit anything under `.github/`, so it cannot rewrite its own rules.

## Tuning

**Sweep frequency** — the `cron` line. Every 6 hours costs about 120 runner
minutes a month when nothing is found.

**Cost per run** — `--max-turns 60` and `timeout-minutes: 30` are the ceilings.
Lower them to cap spend; a straightforward fix uses far fewer turns.

**Model** — the action uses the Claude Code default. Pin one by adding
`--model <model-id>` to `claude_args`.

**Commands the agent may run** — `--allowedTools` lists them explicitly rather
than granting shell access, so an instruction smuggled into an issue body
cannot pipe a script into a shell. If a run reports a denied command that it
genuinely needed, add that one command to the list.

**Outside contributors** — to diagnose their issues immediately instead of
waiting for the sweep, add `allowed_non_write_users` to the action's `with:`
block. Consider what that means first: it lets people outside the repo start an
agent that writes code.

## Known trade-off

The workflow passes `github_token: ${{ secrets.GITHUB_TOKEN }}`, so it works
without installing the Claude GitHub App. The cost is that GitHub does not fire
workflow events for commits made with that token — so if CI is added to this
repo later, it will not run on these PRs on its own. At that point, install the
[Claude GitHub App](https://github.com/apps/claude) and delete the
`github_token` line; the action then authenticates as the app and CI triggers
normally.

Until then, the `npm test` the agent runs inside the job is the check, and the
PR body says how the fix was verified.

## When it gets something wrong

Close the PR and say why in the issue. The diagnosis comment stays on the
issue, which is usually still worth having — it names the files someone should
look at next.
