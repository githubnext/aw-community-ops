---
name: Labelling Health Report

on:
  schedule: every 2 days

permissions:
  contents: read
  issues: read
  actions: read

steps:
  - name: Fetch labelling health data
    uses: actions/github-script@v8
    with:
      github-token: ${{ github.token }}
      script: |
        const fs = require("node:fs");
        const path = require("node:path");

        const outputDir = "/tmp/gh-aw/agent/labelling-health";
        fs.mkdirSync(outputDir, { recursive: true });

        const summaryTitlePrefix = "[Daily Auto-labelling Summary]";
        const signalLabel = "labelling-correction-signal";
        const parentLabel = "labelling-correction-parent";
        const workflowPaths = new Set([
          ".github/workflows/labelling-correction-collector.yml",
          ".github/workflows/auto-labelling.lock.yml",
          ".github/workflows/labelling-correction-feedback.lock.yml",
        ]);

        const now = new Date();
        const daysAgo = (days) => {
          const value = new Date(now);
          value.setUTCDate(value.getUTCDate() - days);
          return value;
        };

        const sevenDaysAgo = daysAgo(7);
        const fourteenDaysAgo = daysAgo(14);
        const thirtyDaysAgo = daysAgo(30);

        const labelName = (label) => (typeof label === "string" ? label : label?.name || "");
        const hasLabel = (issue, wantedLabel) => Array.isArray(issue.labels) && issue.labels.some((label) => labelName(label) === wantedLabel);

        const parseSummaryMetrics = (body) => {
          if (!body) {
            return { reviewed: null, changed: null };
          }

          const reviewedMatch = body.match(/total discussions reviewed[^0-9]*(\d+)/i);
          const changedMatch = body.match(/total label changes applied[^0-9]*(\d+)/i);

          return {
            reviewed: reviewedMatch ? Number(reviewedMatch[1]) : null,
            changed: changedMatch ? Number(changedMatch[1]) : null,
          };
        };

        const parseHiddenJson = (body, marker) => {
          if (!body) {
            return null;
          }

          const match = body.match(new RegExp(`<!-- ${marker}\\n([\\s\\S]*?)\\n-->`));
          if (!match) {
            return null;
          }

          try {
            return JSON.parse(match[1]);
          } catch {
            return null;
          }
        };

        const issues = await github.paginate(github.rest.issues.listForRepo, {
          owner: context.repo.owner,
          repo: context.repo.repo,
          state: "all",
          per_page: 100,
          sort: "created",
          direction: "desc",
        });

        const autoLabellingSummaries = issues
          .filter((issue) => !issue.pull_request)
          .filter((issue) => typeof issue.title === "string" && issue.title.startsWith(summaryTitlePrefix))
          .filter((issue) => new Date(issue.created_at) >= thirtyDaysAgo)
          .map((issue) => {
            const metrics = parseSummaryMetrics(issue.body || "");
            return {
              number: issue.number,
              title: issue.title,
              state: issue.state,
              created_at: issue.created_at,
              updated_at: issue.updated_at,
              closed_at: issue.closed_at,
              html_url: issue.html_url,
              reviewed: metrics.reviewed,
              changed: metrics.changed,
              body: issue.body || "",
            };
          });

        const correctionSignals = issues
          .filter((issue) => !issue.pull_request)
          .filter((issue) => hasLabel(issue, signalLabel))
          .map((issue) => {
            const metadata = parseHiddenJson(issue.body || "", "labelling-correction-metadata") || {};
            const history = parseHiddenJson(issue.body || "", "labelling-correction-history") || [];
            const latest = history[history.length - 1] || null;

            return {
              number: issue.number,
              title: issue.title,
              state: issue.state,
              created_at: issue.created_at,
              updated_at: issue.updated_at,
              closed_at: issue.closed_at,
              html_url: issue.html_url,
              signal_key: metadata.signal_key || null,
              discussion_number: metadata.discussion_number || null,
              category_slug: metadata.category_slug || null,
              category_name: metadata.category_name || null,
              current_labels: Array.isArray(metadata.current_labels) ? metadata.current_labels : [],
              correction_count: history.length,
              latest_event_type: latest?.event_type || null,
              latest_label: latest?.label || null,
              labels: (issue.labels || []).map(labelName).filter(Boolean),
              body: issue.body || "",
            };
          });

        const correctionParents = issues
          .filter((issue) => !issue.pull_request)
          .filter((issue) => hasLabel(issue, parentLabel))
          .map((issue) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            closed_at: issue.closed_at,
            html_url: issue.html_url,
          }));

        const workflows = await github.paginate(github.rest.actions.listRepoWorkflows, {
          owner: context.repo.owner,
          repo: context.repo.repo,
          per_page: 100,
        });

        const selectedWorkflows = workflows.filter((workflow) => workflowPaths.has(workflow.path));

        const workflowRuns = [];
        for (const workflow of selectedWorkflows) {
          const runsResponse = await github.rest.actions.listWorkflowRuns({
            owner: context.repo.owner,
            repo: context.repo.repo,
            workflow_id: workflow.id,
            per_page: 30,
          });

          for (const run of runsResponse.data.workflow_runs || []) {
            if (new Date(run.created_at) < thirtyDaysAgo) {
              continue;
            }

            workflowRuns.push({
              workflow_name: workflow.name,
              workflow_path: workflow.path,
              run_id: run.id,
              run_number: run.run_number,
              event: run.event,
              status: run.status,
              conclusion: run.conclusion,
              created_at: run.created_at,
              updated_at: run.updated_at,
              html_url: run.html_url,
            });
          }
        }

        const payload = {
          generated_at: now.toISOString(),
          windows: {
            last_7_days_start: sevenDaysAgo.toISOString(),
            previous_7_days_start: fourteenDaysAgo.toISOString(),
            last_30_days_start: thirtyDaysAgo.toISOString(),
          },
          auto_labelling_summaries: autoLabellingSummaries,
          correction_signals: correctionSignals,
          correction_parents: correctionParents,
          workflow_runs: workflowRuns.sort((left, right) => new Date(right.created_at) - new Date(left.created_at)),
        };

        fs.writeFileSync(path.join(outputDir, "health-data.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

safe-outputs:
  github-token: ${{ secrets.WRITE_TO_COMM_OPS_TOKEN }}
  mentions: false
  allowed-github-references: []
  create-issue:
    title-prefix: "[Labelling Health]"
    close-older-issues: true
    expires: 30d
---

## Labelling Health Report

You are an automation that reviews recent labelling activity in this repository and publishes one concise health report issue every 2 days.

Your goal is to answer a practical question for maintainers: is the current discussion labelling system improving, flat, or regressing based on recent auto-labelling activity, trusted correction pressure, and unresolved instruction debt.

## Your Task

Read `/tmp/gh-aw/agent/labelling-health/health-data.json`.

It contains:

- `windows` with ISO timestamps for the last 7 days, previous 7 days, and last 30 days
- `auto_labelling_summaries` with recent daily summary issues, including parsed `reviewed` and `changed` counts when available
- `correction_signals` with open and closed deterministic correction signal issues, including category and latest-label metadata when present
- `correction_parents` with parent intake issues used to group signal sub-issues
- `workflow_runs` for the `Label Discussions`, `Labelling Correction Collector`, and `Labelling Correction Feedback` workflows over the last 30 days

## Analysis Goals

Use the data to estimate the current health of the labelling system over time.

At minimum, calculate or infer:

- Discussions reviewed in the last 7 days
- Label changes applied in the last 7 days
- Label-change rate over the last 7 days, ideally as $changed / reviewed$
- Comparison with the previous 7-day window when enough data exists
- Number of correction-collector workflow runs in the last 7 days as a proxy for incoming trusted correction signals
- Count of currently open correction signals
- Count of correction signals created in the last 7 and 30 days
- Oldest open correction signal age
- The highest-pressure open category / label / event clusters you can infer from the signal metadata

Do not overclaim precision. If a metric is incomplete because daily summary issues did not parse cleanly or runs are missing, say so directly and use the best conservative estimate from the available data.

## Output Requirements

Create exactly one report issue when there is enough recent activity to say something useful.

If there is effectively no relevant data in the last 30 days, call `noop` and say there was not enough recent activity to produce a meaningful labelling health report.

Use GitHub-flavored markdown. Start report sections at `###`, never `#` or `##`.

Keep the most important conclusions visible. Put verbose per-item detail inside `<details><summary><b>...</b></summary>` blocks.

## Report Structure

Use this structure:

### Summary

- Overall status: improving, flat, mixed, or regressing
- A 1-2 sentence explanation of why

### Key Metrics

- Discussions reviewed last 7 days
- Label changes applied last 7 days
- Change rate last 7 days
- Correction-collector runs last 7 days
- Open correction signals

### Correction Pressure

Explain where correction pressure is showing up.

Include the most repeated category / label / event clusters if available and note whether raw pressure appears to be concentrated into one or two parent intake issues or spread across many.

### Open Instruction Debt

Summarize whether the correction backlog is shrinking, steady, or growing.

Mention the age of the oldest open correction signal, how many open parent intake issues exist, and whether the backlog looks actionable or stale.

### Recommendations

Provide 2-4 concrete next steps for maintainers. Prefer actions tied to `.github/instructions/community-discussion-labeling.md`, parent intake issue triage, recurring patterns, or operational cleanup.

Use `<details>` blocks for:

- Recent daily summary issue breakdowns
- Open correction signal breakdowns
- Recent workflow run references

Under `### References`, include up to 3 of the most relevant workflow run URLs using `[§RUN_NUMBER](RUN_URL)` format.

Do not mention individual human actors. Focus on the system, the rules, and the backlog.
