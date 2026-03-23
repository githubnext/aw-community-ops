# Community Discussion Labeling

Review prepared discussions from `community/community` and assign label changes through safe outputs.

- Use the staged safe-output `update-discussion` action when a label change is warranted.
- Use `/tmp/gh-aw/agent/discussion-scan/` as the source of truth, especially `discussions.jsonl`, `request.json`, `summary.json`, and `allowlists.json`.
- Review every prepared discussion in the current input set, including discussions that already have labels.
- If `target_discussion_number` is present in `request.json`, treat the run as a targeted follow-up for a discussion that was just created or recategorized.
- Only propose labels from the allowlist. If no allowed label fits or confidence is low, skip.
- Base decisions on visible signals only: category, title, body, current labels, and repeated keywords.
- Use `inactive` when `inactive_signal.eligible` is `true`. Treat it as eligible when either the discussion has had no comments for at least 30 days or it has had no updates for at least 30 days.
- Propose the smallest useful label change.
- Output may include discussion numbers and titles, but not direct discussion URLs.
- If no discussion in the batch warrants a change, end with `noop`.

## Division of Responsibilities

Many labels are applied automatically by other workflows at discussion creation time. Do not duplicate or compete with those systems. Your role is to fill the gaps they leave — complementary labels, lifecycle labels, and corrections on older discussions that predate the automation.

### Labels set automatically by other workflows — do not re-apply unless clearly missing

The following workflows run in `community/community` (production) and `community/category-forms-staging` (staging). They fire at discussion creation time, before this workflow runs its daily batch.

| Label(s) | Set by |
| --- | --- |
| `Bug`, `Question`, `Product Feedback` | `reason-for-posting-labeler.yml` — parsed from the `🏷️ Discussion Type` template dropdown |
| Category/topic-area labels (e.g. `Actions`, `VS Code`, `Copilot`, `Repositories`, `Issues`) | `feature-topic-area-labeler.yml` — parsed from the `💬 Feature/Topic Area` template dropdown |
| `Workflow Deployment`, `Workflow Configuration`, `Schedule & Cron Jobs`, `Metrics & Insights` | `actions_labeller.yml` — keyword matching on Actions-category discussions |
| `Welcome 🎉` | `welcome_first_time_discussion_author_live.yml` — first-time author detection |
| `source:ui`, `source:other` | `source_check.py` — template vs. API submission detection |

Only restore one of these labels when it is clearly absent and the evidence is unambiguous (for example, a discussion that predates the automation and has no topic label at all).

### Labels never applied by this workflow

The following labels are owned by other teams, product cycles, or program workflows. Do not apply or remove them regardless of discussion content:

- **Release / product cycle**: `:rocket: Shipped`, `🛣 On the Roadmap`, `:mega: ANNOUNCEMENT`, `Incident :exclamation:`, `Beta`
- **Event-specific**: `Universe 2023`, `Universe 2024`, `Universe 2025`, `Opus 4.5 availability`, `Opus 4.5 multiplier update`
- **Maintainer triage**: `Transferred`, `In Backlog`, `Temp`, `Duplicate`, `More Information Needed`
- **Program-specific**: `Campus Experts`, `From Campus to Community`, `Octernships`, `Graduation`, `Speaker`, `Maintainer Love :heart:`, `Show & Tell`, `Monthly Digest`, `Community Check-In`, `Community Activity`
- **Education sub-labels**: all `Education: *` labels (set via form dropdowns by the user or education team)

## Pre-computed Signals

Each discussion includes a `label_hints` object with a pre-computed signal. Use it as a hard, deterministic input.

- `label_hints.welcome_candidate`: `true` when this is the author's first discussion in the community repository. Apply `Welcome 🎉` whenever this field is `true` (the normal automation may not have run yet for this batch).

## Key Label Rules

### `Welcome 🎉`

Apply `Welcome 🎉` when `label_hints.welcome_candidate` is `true`. This is a deterministic signal set by the prep script and does not require additional confirmation from the discussion content.

### `Question`

Apply `Question` when the discussion is clearly asking for help, guidance, or an answer, and no `Question` label is already present. Strong signals: title ends with `?`, title begins with an interrogative word (How, What, Why, Where, Can I, Is it), or the body explicitly requests help. A discussion can carry both `Question` and a topic label such as `Actions` or `Copilot`.


### `Copilot` vs. `Copilot in GitHub`

- Use `Copilot in GitHub` when the discussion specifically concerns using Copilot on github.com or inside an IDE extension (VS Code, JetBrains, Neovim, Visual Studio, etc.), including inline suggestions, the Copilot extension, or editor-specific configuration.
- Use the generic `Copilot` label only for broad discussions about GitHub Copilot that do not target a specific product surface or integration.
- Do not apply both labels to the same discussion. `Copilot in GitHub` takes precedence when the evidence points to IDE or github.com usage.
- For discussions specifically about `Copilot Agent Mode`, `Copilot Coding Agent`, or `Copilot Workspace`, prefer those narrower labels over the generic `Copilot` label.
- For plan/tier discussions (billing, seat limits, admin controls), use `Copilot for Business` or `Copilot Enterprise` as appropriate. Do not apply both.

### `GitHub Education Benefits`

Apply `GitHub Education Benefits` only when the discussion explicitly concerns the GitHub Student or Teacher Developer Pack or the redemption of academic discounts. For general GitHub Education topics, prefer `GitHub Education`, `GitHub Education Verification`, or the appropriate `Education:` sub-label instead. Do not apply any `Education: *` sub-label — these are set via form dropdowns.

### `Accessibility`

Apply `Accessibility` when the discussion is specifically about accessibility features, screen readers, WCAG compliance, ARIA attributes, keyboard navigation, or other assistive technology concerns. Require explicit mention of accessibility in the title or body before applying this label.
