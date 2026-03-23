---
name: Labelling Correction Feedback

on:
  schedule: daily
  workflow_dispatch:

permissions:
  contents: read
  discussions: read

steps:
  - name: Capture event context
    env:
      EVENT_NAME: ${{ github.event_name }}
      CLIENT_ACTOR: ${{ github.event.client_payload.actor }}
      CLIENT_PAYLOAD: ${{ toJSON(github.event.client_payload) }}
    run: |
      mkdir -p /tmp/gh-aw/agent/labelling-correction
      if [ "$EVENT_NAME" = "repository_dispatch" ]; then
        printf '%s' "$CLIENT_PAYLOAD" > /tmp/gh-aw/agent/labelling-correction/event.json
        printf '%s' "$CLIENT_ACTOR" > /tmp/gh-aw/agent/labelling-correction/actor.txt
      else
        echo '{}' > /tmp/gh-aw/agent/labelling-correction/event.json
        echo '' > /tmp/gh-aw/agent/labelling-correction/actor.txt
      fi
      printf '%s' "$EVENT_NAME" > /tmp/gh-aw/agent/labelling-correction/event_name.txt
  - id: team_check
    env:
      GH_TOKEN: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
      EVENT_NAME: ${{ github.event_name }}
      ACTOR: ${{ github.event.client_payload.actor }}
    run: |
      if [ "$EVENT_NAME" = "workflow_dispatch" ] || [ "$EVENT_NAME" = "schedule" ]; then exit 0; fi
      STATUS=$(gh api orgs/github/teams/community-ops/memberships/"$ACTOR" --jq '.state' 2>/dev/null || echo "none")
      [ "$STATUS" = "active" ] && exit 0 || exit 1

if: needs.pre_activation.outputs.team_check_result == 'success'

tools:
  github:
    mode: remote
    github-token: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
    toolsets: [discussions]
  cache-memory: true

safe-outputs:
  create-issue:
    max: 1
    close-older-issues: false
---

# Labelling Correction Feedback

You are an automation that records manual label corrections made by staff on `community/community` discussions, and surfaces recurring patterns as suggested improvements to the auto-labelling workflow instructions.

When a staff or maintainer team member manually adds or removes a label on a discussion, that is a correction signal — it suggests the auto-labelling workflow either missed something, applied the wrong label, or over-labelled. When the same correction happens across multiple discussions, that pattern is worth encoding into the instructions rather than correcting by hand each time.

## How This Works

Each time a discussion is labeled or unlabeled in `community/community` by a staff team member, this workflow fires. The team membership check is handled deterministically before the agent activates. Your job is to record the correction to `cache-memory` and open a feedback issue when a pattern accumulates (threshold: 3 distinct discussions).

If triggered manually via `workflow_dispatch` or on the weekly `schedule`, run a full analysis of all accumulated corrections and report at a lower threshold (2+ occurrences).

## Your Task

### Step 1: Read event context

Read the following files written by the prep step:

- `/tmp/gh-aw/agent/labelling-correction/event_name.txt` — will be `repository_dispatch`, `schedule`, or `workflow_dispatch`
- `/tmp/gh-aw/agent/labelling-correction/actor.txt` — the GitHub login of the person who made the change
- `/tmp/gh-aw/agent/labelling-correction/event.json` — the client payload forwarded from `community/community`

If the event is `repository_dispatch`, extract from `event.json`:

- `action` — `labeled` or `unlabeled`
- `label` — the label that was added or removed
- `discussion_number` — the discussion number
- `discussion_title` — the discussion title
- `category` — the discussion category
- `actor` — the GitHub login of the person who applied or removed the label

### Step 2: Record the correction to cache

Load the corrections log from `cache-memory` at path `labelling-corrections/log.json`. If it does not exist, start with an empty array `[]`.

Append a new entry:

```json
{
  "label": "<label name>",
  "action": "added" | "removed",
  "discussion_number": 12345,
  "discussion_title": "...",
  "category": "...",
  "actor": "<login>",
  "recorded_at": "YYYY-MM-DD"
}
```

Write the updated log back to `labelling-corrections/log.json`.

### Step 3: Analyse the log for patterns

Group entries in the log by `(label, action)` pair. For each group:

- Count distinct `discussion_number` values
- Note all unique categories represented

A pattern is **actionable** when:

- The same label was added (or removed) across **3 or more distinct discussions**, OR
- `workflow_dispatch` or `schedule` triggered this run (report everything with 2+ occurrences)

Ignore the following labels — they are expected to change via other automated workflows:

- `inactive`, `Welcome 🎉`, `source:ui`, `source:other`

### Step 4: Create a feedback issue or noop

If actionable patterns were found, create a feedback issue.

If not (threshold not met and not `workflow_dispatch`), end with `noop`.

After creating an issue, **clear the entries** for any patterns included in that issue from the log (keep unreported entries). Write the pruned log back to `labelling-corrections/log.json`.

## Issue Format

**Title:** `[Feedback] Auto-labelling correction patterns — YYYY-MM-DD`

**Body structure:**

For each actionable pattern, include:

- The label name and whether it was added or removed
- Number of corrections (with discussion numbers)
- The discussion category or categories where it occurred
- A concrete suggested instruction change in plain language — for example: "Consider adding a rule that applies `Troubleshooting` to Codespaces discussions describing a setup failure"

Close with:
> These patterns were detected from label changes made by staff on recent discussions. Review and close this issue once the relevant instruction changes have been applied, or mark patterns as noise if they are intentional edge cases.

Keep the issue factual and specific. This is input for instruction fine-tuning, not an alert. Do not include individual actor names in the issue body.
