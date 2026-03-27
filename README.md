# community-ops

This repo hosts automated discussion labeling logic for [`githubnext/aw-community-discussions`](https://github.com/githubnext/aw-community-discussions) built with [GitHub Agentic Workflows](https://github.com/github/gh-aw).

## Workflows

| Workflow | What it does | Trigger |
| --- | --- | --- |
| [`auto-labelling.md`](.github/workflows/auto-labelling.md) | Labels discussions using the [instruction file](.github/instructions/community-discussion-labeling.md) | daily, `workflow_dispatch` |
| [`labelling-correction-collector.yml`](.github/workflows/labelling-correction-collector.yml) | Deterministically collects trusted staff label corrections into parent issues with linked signal sub-issues | `repository_dispatch` |
| [`labelling-correction-feedback.md`](.github/workflows/labelling-correction-feedback.md) | Reviews one collected parent issue and raises an instruction-update PR when the evidence supports it | `workflow_dispatch`, `issues.assigned` |
| [`labelling-health-report.md`](.github/workflows/labelling-health-report.md) | Publishes a rolling report on labelling quality, correction pressure, and open instruction debt | every 2 days |

### Actions secrets

| Secret | Workflows | Permissions needed |
| --- | --- | --- |
| `COPILOT_GITHUB_TOKEN` | All | Copilot CLI auth |
| `READ_COMM_COMM_DISCUSSIONS_TOKEN` | `auto-labelling`, `labelling-correction-collector` | Discussions (read), Contents (read) on the target repo |
| `WRITE_TO_COMM_OPS_TOKEN` | `auto-labelling`, `labelling-correction-collector` | Issues (write) on the sidecar repo |

## Recompiling

Edits to [the instruction file](.github/instructions/community-discussion-labeling.md) alone do *not* require recompilation.
Only use the `compile` command if you are making changes to the actual markdown workflow files (e.g. `auto-labelling.md`, `labelling-correction-feedback.md`, `labelling-health-report.md`):

```bash
gh aw compile <workflow-name>   # e.g. auto-labelling, labelling-correction-feedback, labelling-health-report
```

## Go-Live

1. Set the [secrets](#actions-secrets) above in this repo and the target repo.
2. Trigger [`auto-labelling.md`](.github/workflows/auto-labelling.md) once with `workflow_dispatch` to verify the discussion scan and summary path.
3. Trigger [`labelling-correction-feedback.md`](.github/workflows/labelling-correction-feedback.md) once with a known parent intake issue number, or wait until a parent issue is assigned to Copilot.
4. Validate [`labelling-correction-collector.yml`](.github/workflows/labelling-correction-collector.yml) by sending one `staff-label-correction` `repository_dispatch` event.
5. Watch the first scheduled run of [`labelling-health-report.md`](.github/workflows/labelling-health-report.md) before tuning thresholds or prompts.

### Labelling correction feedback (deterministic intake + agentic instruction updates)

`labelling-correction-collector.yml` creates one deterministic **signal sub-issue** per corrected discussion and links it under a **parent intake issue**. Each signal sub-issue includes the corrected discussion's current title, current body text, current category, current labels, and full trusted-correction history.

### How to use the Parent Intake Issue

- Treat the **parent intake issue** as the source of truth for one review batch.
- Treat **signal sub-issues** as raw evidence, not as instruction-update work items.
- When a parent intake issue has enough evidence, either run `labelling-correction-feedback` with its issue number or assign that parent issue to Copilot.
- `labelling-correction-feedback` will review that one parent issue, update [the instruction file](.github/instructions/community-discussion-labeling.md) if warranted, and raise a single draft PR.
