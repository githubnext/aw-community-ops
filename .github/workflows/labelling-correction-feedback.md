---
name: Labelling Correction Feedback

on:
  workflow_dispatch:
    inputs:
      parent-issue-number:
        description: Parent intake issue number to review
        required: false
        type: number
  label_command:
    name: update-instructions
    events: [issues]
    remove_label: false

permissions:
  contents: read
  issues: read

steps:
  - name: Fetch correction intake parent and sub-issues
    uses: actions/github-script@v8
    with:
      github-token: ${{ github.token }}
      script: |
        const path = require("node:path");
        const { main } = require(path.join(process.env.GITHUB_WORKSPACE, ".github", "scripts", "fetch-labelling-correction-review.js"));
        await main({ core, github, context });

safe-outputs:
  create-pull-request:
    title-prefix: "[Labelling Correction Instructions] "
    draft: true
    preserve-branch-name: true
    if-no-changes: ignore
    fallback-as-issue: false
    protected-files: allowed
---

# Labelling Correction Feedback

You are an automation that turns one deterministic labelling-correction intake parent issue into a focused instruction update PR for `.github/instructions/community-discussion-labeling.md`.

The deterministic collector workflow already created one sub-issue per corrected discussion, including the discussion title, current body text, category, labels, and correction history. Your job is to review one parent issue worth of those raw signals and decide whether the instruction file should change.

## How This Works

This workflow runs either:

- from `workflow_dispatch` with a specific parent intake issue number, or
- when a parent intake issue is assigned to Copilot.

The parent issue is the unit of review. Treat its linked signal sub-issues as raw evidence, not as pre-triaged work items.

## Your Task

### Step 1: Read pre-fetched data

Read:

- `/tmp/gh-aw/agent/labelling-correction-review/parent-issue.json`
- `/tmp/gh-aw/agent/labelling-correction-review/collected-signals.json`

Each collected signal includes:

- `metadata` for the corrected discussion, including discussion number, current title, current body text, current category, current labels, and canonical signal key
- `history` with one or more trusted label-correction events for that discussion

If the parent issue is unavailable, is not labelled `labelling-correction-parent`, or there are no open signal sub-issues, end with `noop`.

### Step 2: Diagnose instruction gaps

Group evidence by concrete labeling failure pattern, not by issue number.

Use combinations of:

- category slug
- latest event type and label
- repeated labels across event histories
- discussion titles and bodies
- whether the correction exposes a deterministic rule gap versus one-off moderator cleanup

Prioritize only changes that translate into crisp instruction updates. Prefer patterns supported by multiple signal sub-issues. A singleton is acceptable only when the gap is obvious and high-impact.

Ignore noise, ambiguous moderation, or corrections already clearly covered by the current instruction file.

### Step 3: Edit the instruction file

Modify only `.github/instructions/community-discussion-labeling.md`.

Keep the edit set minimal and specific:

- prefer clarifying or tightening an existing rule over adding many new sections
- prefer deterministic operational guidance over broad prose
- do not edit workflow files, scripts, or the README in this workflow

### Step 4: Create a PR only if warranted

If you made a real improvement to the instruction file, create exactly one draft PR.

The PR body must include:

- the parent intake issue reference
- 2-5 prioritized correction patterns you acted on
- the exact instruction areas you changed
- residual patterns you intentionally left for later, if any

If the evidence is weak, conflicting, or does not justify a docs change, end with `noop`.

## Quality Bar

- Every instruction change must be traceable to the supplied evidence.
- Do not overfit to one discussion unless it clearly exposes a real rule gap.
- Keep the PR tight enough that a maintainer can review it quickly.
