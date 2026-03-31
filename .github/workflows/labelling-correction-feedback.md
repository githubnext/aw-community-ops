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

Review one parent intake issue's correction signals and, if warranted, open a draft PR updating `.github/instructions/community-discussion-labeling.md`.

## Step 1: Read pre-fetched data

Read `/tmp/gh-aw/agent/labelling-correction-review/parent-issue.json` and `/tmp/gh-aw/agent/labelling-correction-review/collected-signals.json`.

If the parent issue is unavailable, is not labelled `labelling-correction-parent`, or has no open signal sub-issues, end with `noop`.

## Step 2: Diagnose instruction gaps

Group evidence by labeling failure pattern, not by issue number. Prioritize patterns supported by multiple signals. A singleton is acceptable only when the gap is obvious and high-impact.

Ignore noise, ambiguous moderation, or corrections already covered by the current instruction file.

## Step 3: Edit the instruction file

Modify only `.github/instructions/community-discussion-labeling.md`.

- Prefer clarifying or tightening an existing rule over adding new sections.
- Prefer deterministic operational guidance over broad prose.
- Do not edit workflow files, scripts, or the README.

## Step 4: Create a PR only if warranted

If you made a real improvement, create exactly one draft PR. The PR body must include:

- The parent intake issue reference
- 2–5 correction patterns you acted on
- The instruction areas you changed
- Residual patterns intentionally left for later, if any

If the evidence is weak, conflicting, or does not justify a change, end with `noop`. Every instruction change must be traceable to the supplied evidence.
