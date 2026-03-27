---
name: Labelling Correction Feedback

on:
  repository_dispatch:
    types:
      - staff-label-correction

permissions:
  contents: read

steps:
  - name: Write feedback context
    env:
      EVENT_NAME: ${{ github.event_name }}
      CLIENT_PAYLOAD: ${{ toJson(github.event.client_payload) }}
    run: |
      mkdir -p /tmp/gh-aw/agent/labelling-correction
      printf '%s' "$EVENT_NAME" > /tmp/gh-aw/agent/labelling-correction/event_name.txt
      node <<'EOF'
      const fs = require("node:fs");
      const path = require("node:path");

      const outputPath = path.join("/tmp/gh-aw/agent/labelling-correction", "context.json");
      const eventName = process.env.EVENT_NAME;
      const context = {
        event_name: eventName,
        intake_mode: "dispatch",
      };

      if (eventName !== "repository_dispatch") {
        throw new Error(`Unsupported event name: ${eventName}`);
      }

      context.dispatch_payload = JSON.parse(process.env.CLIENT_PAYLOAD || "{}");

      fs.writeFileSync(outputPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
      EOF

  - name: Fetch label timeline events
    uses: actions/github-script@v8
    with:
      github-token: ${{ github.token }}
      script: |
        const path = require("node:path");
        const { main } = require(path.join(process.env.GITHUB_WORKSPACE, ".github", "scripts", "fetch-label-timeline-events.js"));
        await main({ core });

  - name: Fetch open correction work items
    uses: actions/github-script@v8
    with:
      github-token: ${{ secrets.WRITE_TO_COMM_OPS_TOKEN }}
      script: |
        const fs = require("node:fs");
        const path = require("node:path");

        const outputPath = path.join("/tmp/gh-aw/agent/labelling-correction", "open-issues.json");
        const workItemLabel = "labelling-correction-work-item";

        const issues = await github.paginate(github.rest.issues.listForRepo, {
          owner: context.repo.owner,
          repo: context.repo.repo,
          state: "open",
          per_page: 100,
        });

        const filtered = issues
          .filter((issue) => !issue.pull_request)
          .filter((issue) => Array.isArray(issue.labels) && issue.labels.some((label) => label && label.name === workItemLabel))
          .map((issue) => ({
            number: issue.number,
            title: issue.title,
            body: issue.body || "",
            html_url: issue.html_url,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
          }));

        fs.writeFileSync(outputPath, `${JSON.stringify(filtered, null, 2)}\n`, "utf8");

tools:
  github:
    github-token: ${{ secrets.WRITE_TO_COMM_OPS_TOKEN }}
    toolsets: [repos]

safe-outputs:
  allowed-github-references: [community/community-ops]
  create-issue:
    max: 3
    close-older-issues: false
    group: true
    labels: [labelling-correction-work-item]
    title-prefix: "[Labelling Correction Work Item]"
  update-issue:
    target: "*"
    title-prefix: "[Labelling Correction Work Item]"
    body: true
    max: 3
  close-issue:
    target: "*"
    required-labels: [labelling-correction-work-item]
    required-title-prefix: "[Labelling Correction Work Item]"
    max: 3
---

## Labelling Correction Feedback

You are an automation that inspects pre-filtered discussion label correction events from the target repository and turns recurring correction patterns into issue work items for updating the auto-labelling instruction file.

Each event is evidence, not a final work item by itself. Your output should help maintainers decide what to change in `.github/instructions/community-discussion-labeling.md`.

## How This Works

This workflow is dispatch-only. The target repository forwards label correction events through `repository_dispatch`, and this sidecar workflow applies the trusted-actor and ignored-label filters locally before you see the data.

Each repository-dispatched run represents a single forwarded correction signal. Use the currently open grouped sub-issues in this repository as the canonical state for unresolved patterns.

## Your Task

### Step 1: Read pre-fetched data

Read:

- `/tmp/gh-aw/agent/labelling-correction/events.json` — array of filtered correction events, each with:
  - `discussion_number`
  - `discussion_title`
  - `category`
  - `category_slug`
  - `event_type` (`labeled` or `unlabeled`)
  - `label`
  - `actor`
  - `createdAt`
- `/tmp/gh-aw/agent/labelling-correction/open-issues.json` — array of currently open correction work items in this repo carrying the `labelling-correction-work-item` label, each with:
  - `number`
  - `title`
  - `body`
  - `html_url`

Events are already filtered to trusted staff corrections and excluded ignored labels before they reach `events.json`.

If `events.json` is empty, end with `noop`.

### Step 2: Analyse corrections for patterns

Treat `events.json` as the current batch of evidence. Group the events by a stable pattern key:

- Prefer `(label, event_type, category_slug)` when category context matters
- Otherwise use `(label, event_type)`

For each pattern you consider:

- Decide whether it points to one concrete change in `.github/instructions/community-discussion-labeling.md`
- Derive a short stable `Pattern key:` line and use it consistently in issue bodies
- Review whether the current-batch evidence materially strengthens confidence in the pattern

A pattern is **actionable** when:

- The pattern maps to one clear instruction change, and
- The current batch provides enough evidence to justify an instruction-update work item

### Step 3: Create or update work items

Before creating a new issue, compare each actionable pattern against `open-issues.json`. Treat the existing grouped sub-issues as the source of truth for what is already being tracked.

- First look for an exact match on the `Pattern key:` line in an open issue body. If an exact match exists, update that issue instead of creating a new one.
- Only fall back to fuzzy matching on the broader instruction change when no exact `Pattern key:` match exists.
- If multiple open issues could plausibly match, prefer the one with the exact `Pattern key:`. If there is still ambiguity, create a new issue instead of guessing.
- Never create more than one work item for the same `pattern_key`.

When updating an existing issue, append a concise evidence update rather than replacing the body.

If a pattern is already tracked by an open issue but the current evidence shows the pattern is intentional noise, already covered by the current instructions, or otherwise does not need further action, close that issue instead of updating it.

If a pattern is actionable and does not already have an open canonical work item, create a new issue using the format below.

If no actionable patterns require a new or updated work item, end with `noop`.

## Issue Format

Use one issue per unresolved pattern. New issues will be grouped automatically as sub-issues under the workflow's parent tracking issue.

**Title:** `[Labelling Correction Work Item] <short human summary of the pattern>`

**Body structure:**

Include a brief note near the top:
> This issue tracks one recurring label-correction pattern that likely requires an update to `.github/instructions/community-discussion-labeling.md`.

Then include these sections:

- A `Pattern key:` line with the stable key you derived
- `### Proposed instruction update`
- `### Why this looks like an instruction gap`
- `### Evidence summary`
- `### Exit criteria`

For `Evidence summary`, include the distinct discussion count, discussion numbers, categories represented, and the first-seen / last-seen timestamps available from current plus prior evidence.

For `Exit criteria`, say that the issue can be closed once `.github/instructions/community-discussion-labeling.md` has been updated or the pattern has been explicitly marked as noise.

When you update an existing issue, append a short `### New evidence YYYY-MM-DD` section with only the new discussion numbers, category deltas, and any change in confidence.

When you close an existing issue, include a brief closing comment explaining whether the pattern is now covered by the instructions or has been reclassified as noise.

Keep every work item factual and specific. This is instruction debt tracking, not an alert. Do not include individual actor names in the issue body.
