# community-ops

This repo hosts automated discussion labeling logic for [`community/community`](https://github.com/community/community) built with [GitHub Agentic Workflows](https://github.com/github/gh-aw).

## Workflows

| Workflow | What it does | Trigger |
| --- | --- | --- |
| [`auto-labelling.md`](.github/workflows/auto-labelling.md) | Labels discussions using the [instruction file](.github/instructions/community-discussion-labeling.md) | daily, `workflow_dispatch` |
| [`labelling-correction-feedback.md`](.github/workflows/labelling-correction-feedback.md) | Detects trusted staff label corrections and proposes instruction updates | `repository_dispatch` |

### Actions secrets

| Secret | Workflows | Permissions needed |
| --- | --- | --- |
| `COPILOT_GITHUB_TOKEN` | All | Copilot CLI auth |
| `READ_COMM_COMM_DISCUSSIONS_TOKEN` | `auto-labelling` | Discussions (read), Contents (read) on the `target-repo` |
| `WRITE_TO_COMM_OPS_TOKEN` | `auto-labelling`, `labelling-correction-feedback` | Issues (write) on this sidecar repo |
| `COMMUNITY_OPS_DISPATCH_TOKEN` | `labelling-correction-feedback` | Repository dispatch trigger on the `target-repo` |

## Recompiling

Edits to [the instruction file](.github/instructions/community-discussion-labeling.md) alone do *not* require recompilation.
Only use the `compile` command if you are making changes to the actual workflow files (e.g. `auto-labelling.md`, `labelling-correction-feedback.md`):

```bash
gh aw compile <workflow-name>   # e.g. auto-labelling, labelling-correction-feedback
```

## Go-Live

1. Set the [secrets](#actions-secrets) above in this repo and the target repo.
2. Navigate to the workflow in the [GitHub Actions](https://github.com/community/community-ops/actions) tab and trigger a `workflow_dispatch` for each workflow once.
3. Watch the first week of scheduled runs before tuning thresholds or prompts.
