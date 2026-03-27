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

tools:
  github:
    github-token: ${{ secrets.WRITE_TO_COMM_OPS_TOKEN }}
    toolsets: [repos]

safe-outputs:
  allowed-github-references: [community/community-ops]
  create-issue:
    max: 1
    close-older-issues: false
---

# Labelling Correction Feedback

You are an automation that inspects discussion timeline events in the target repository, identifies label changes made by trusted staff actors, and surfaces recurring correction patterns as suggested improvements to the auto-labelling workflow instructions.

When a trusted actor adds or removes a label on a discussion, that is a correction signal — it suggests the auto-labelling workflow either missed something, applied the wrong label, or over-labelled. When the same correction appears across multiple discussions, it is worth encoding into the instructions rather than correcting by hand each time.

## How This Works

This workflow is dispatch-only. The target repository forwards every non-bot label or unlabel discussion event through `repository_dispatch`, and this sidecar workflow applies the trusted-actor and ignored-label filters locally.

Each repository-dispatched run analyses only the forwarded event payload it receives. Once the event survives local filtering, treat it as immediately actionable because the run represents a single correction signal.

## Your Task

### Step 1: Read context

Read the following files written by the prep steps:

- `/tmp/gh-aw/agent/labelling-correction/event_name.txt` — will be `repository_dispatch`
- `/tmp/gh-aw/agent/labelling-correction/context.json` — contains:
  - `event_name`
  - `intake_mode`
  - `dispatch_payload`

### Step 2: Read pre-fetched data

The prep steps have already prepared data for the current intake mode. Read:

- `/tmp/gh-aw/agent/labelling-correction/discussions.json` — array of relevant discussions, each with:
  - `number`
  - `title`
  - `updatedAt`
  - `category`
- `/tmp/gh-aw/agent/labelling-correction/events.json` — array of filtered correction events, each with:
  - `discussion_number`
  - `discussion_title`
  - `category`
  - `event_type` (`labeled` or `unlabeled`)
  - `label`
  - `actor`
  - `createdAt`

Events have already been filtered to:

- Only trusted actors from the allow-list
- Excluding bot accounts and ignored labels (`inactive`, `Welcome :tada:`, `source:ui`, `source:other`, `A Welcome to GitHub`, `Welcome 🎉`)

The incoming payload may originate from any human actor. The prep script is responsible for applying the trusted-actor and ignored-label filtering before writing `events.json`.

If `events.json` is empty, end with `noop`.

### Step 3: Analyse corrections for patterns

Group the events from `events.json` by `(label, event_type)` pair. For each group:

- Count distinct `discussion_number` values
- Note all unique categories represented

A pattern is **actionable** when:

- `repository_dispatch` triggered this run and the pattern appears in **1 or more distinct discussions**

### Step 4: Create a feedback issue or noop

If actionable patterns were found, create a feedback issue using the format below.

If no actionable patterns exist, end with `noop`.

## Issue Format

**Title:** `[Feedback] Auto-labelling correction patterns — YYYY-MM-DD`

**Body structure:**

Include a brief note near the top:
> The following patterns were detected from `LabeledEvent` / `UnlabeledEvent` timeline items on recently updated discussions, filtered to changes made by trusted staff actors.

For each actionable pattern, include:

- The label name and whether it was added or removed
- Number of distinct corrections (with discussion numbers)
- The discussion category or categories where it occurred
- A concrete suggested instruction change in plain language — for example: "Consider adding a rule that applies `Troubleshooting` to Codespaces discussions describing a setup failure"

Close with:
> Review and close this issue once the relevant instruction changes have been applied, or mark patterns as noise if they are intentional edge cases.

Keep the issue factual and specific. This is input for instruction fine-tuning, not an alert. Do not include individual actor names in the issue body.
