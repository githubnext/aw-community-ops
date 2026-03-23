# community-ops

This repository contains the production workflows that support discussion triage in [community/community](https://github.com/community/community/discussions).

Its main job is to label discussions consistently, keep the label allowlist aligned with upstream discussion templates, and surface repeated staff corrections as instruction feedback.

The workflows are written with [GitHub Agentic Workflows](https://github.com/github/gh-aw). Source files live in [`.github/workflows/`](.github/workflows/), while the compiled `.lock.yml` files are the workflow artifacts executed by GitHub Actions.

## What This Repo Does

This repo has three jobs:

1. Label discussions in `community/community`
2. Detect drift between upstream discussion templates and the label allowlist
3. Turn repeated staff label corrections into feedback for the labelling instructions

The runtime instruction file is [`.github/instructions/community-discussion-labeling.md`](.github/instructions/community-discussion-labeling.md). That file can be updated without recompiling the core labelling workflow.

## Workflow Summary

| Workflow | Purpose | Trigger | Production role |
| --- | --- | --- | --- |
| [`auto-labelling.md`](.github/workflows/auto-labelling.md), [`community-discussion-labeling.md`](.github/instructions/community-discussion-labeling.md) | Reviews recent discussions and applies allowed labels | daily, `workflow_dispatch` | Core production workflow |
| [`allowlist-drift-check.md`](.github/workflows/allowlist-drift-check.md) | Compares template dropdown values with the auto-labeler allowlist | `weekly`, `workflow_dispatch` | Deterministic guardrail |
| [`labelling-correction-feedback.md`](.github/workflows/labelling-correction-feedback.md) | Records recurring staff corrections and proposes instruction updates | `weekly`, `repository_dispatch`, `workflow_dispatch` | Feedback loop |

## Required Secrets

Configure these secrets in this repository:

| Secret | Required by | Access needed |
| --- | --- | --- |
| `COPILOT_GITHUB_TOKEN` | All workflows | GitHub Copilot CLI authentication for gh-aw execution |
| `READ_COMM_COMM_DISCUSSIONS_TOKEN` | All workflows | Read access to `community/community` discussions, org team membership, and `community/category-forms-staging` contents |

## Go-Live Checklist

1. Set `COPILOT_GITHUB_TOKEN` and `READ_COMM_COMM_DISCUSSIONS_TOKEN` in `community-ops`.
2. Run `workflow_dispatch` once for [`auto-labelling.md`](.github/workflows/auto-labelling.md).
3. Run `workflow_dispatch` once for [`labelling-correction-feedback.md`](.github/workflows/labelling-correction-feedback.md).
4. Trigger one real label change in `community/community` and confirm the relay dispatch reaches [`labelling-correction-feedback.md`](.github/workflows/labelling-correction-feedback.md).
5. Watch the first week of scheduled runs before changing thresholds, prompts, or schedules.

## Editing And Recompiling

After editing a workflow markdown file, recompile it:

```bash
gh aw compile <workflow-name>
```

Examples:

```bash
gh aw compile auto-labelling
gh aw compile allowlist-drift-check
gh aw compile labelling-correction-feedback
```

If you edit only [`.github/instructions/community-discussion-labeling.md`](.github/instructions/community-discussion-labeling.md), recompilation is not required.

## Practical Operating Notes

1. Treat [`auto-labelling.md`](.github/workflows/auto-labelling.md) as the main production surface.
2. Treat [`allowlist-drift-check.md`](.github/workflows/allowlist-drift-check.md) as a maintenance guardrail, not a product feature.
3. Treat [`labelling-correction-feedback.md`](.github/workflows/labelling-correction-feedback.md) as a learning loop that still depends on operational follow-through.
