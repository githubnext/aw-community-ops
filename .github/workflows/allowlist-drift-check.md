---
name: Allowlist Drift Check

on:
  schedule: weekly
  workflow_dispatch:

permissions:
  contents: read

steps:
  - name: Fetch templates from category-forms-staging
    env:
      GH_TOKEN: ${{ secrets.READ_COMM_COMM_DISCUSSIONS_TOKEN }}
    run: |
      mkdir -p /tmp/gh-aw/agent/drift-check/templates
      gh api repos/community/category-forms-staging/contents/.github/DISCUSSION_TEMPLATE \
        --jq '.[].name' \
      | while IFS= read -r file; do
          gh api repos/community/category-forms-staging/contents/.github/DISCUSSION_TEMPLATE/"$file" \
            --jq '.content' \
          | tr -d '\n' | base64 -d \
          > /tmp/gh-aw/agent/drift-check/templates/"$file"
        done

  - id: drift
    run: |
      python3 - << 'PYEOF'
      import os, sys, json, re
      import yaml

      template_dir = '/tmp/gh-aw/agent/drift-check/templates'
      template_options = set()

      for fname in os.listdir(template_dir):
          if not fname.endswith(('.yml', '.yaml')):
              continue
          with open(os.path.join(template_dir, fname)) as f:
              data = yaml.safe_load(f)
          for field in (data.get('body') or []):
              label = (field.get('attributes') or {}).get('label', '')
              if ('Feature' in label or 'Topic Area' in label) and field.get('type') == 'dropdown':
                  for opt in (field.get('attributes') or {}).get('options', []):
                      if opt.strip():
                          template_options.add(opt.strip())

      with open('.github/workflows/auto-labelling.md') as f:
          raw = f.read()
      m = re.match(r'^---\n(.*?)\n---\n', raw, re.DOTALL)
      frontmatter = yaml.safe_load(m.group(1))
      allowed = set(l.strip() for l in frontmatter.get('allowed-labels', []) if l.strip())
      missing = sorted(template_options - allowed)
      stale   = sorted(allowed - template_options)

      result = {
          'missing_from_allowlist': missing,
          'stale_in_allowlist': stale,
          'has_drift': len(missing) > 0
      }

      with open('/tmp/gh-aw/agent/drift-check/drift.json', 'w') as f:
          json.dump(result, f, indent=2)

      if not result['has_drift']:
          print('No drift found — skipping agent activation')
          sys.exit(1)

      print(f'Drift detected — missing from allowlist: {missing}')
      PYEOF

if: needs.pre_activation.outputs.drift_result == 'success'

safe-outputs:
  create-issue:
    max: 1
    close-older-issues: true
---

# Allowlist Drift Check

You are an automation that reports drift between `💬 Feature/Topic Area` dropdown options in `community/category-forms-staging` templates and the `allowed-labels` list in `.github/workflows/auto-labelling.md`.

The prep step has already computed the diff. Read `/tmp/gh-aw/agent/drift-check/drift.json` and create an issue.

The `drift.json` file contains:

- `missing_from_allowlist`: options present in template dropdowns but absent from the allowlist — the auto-labelling workflow cannot apply these labels
- `stale_in_allowlist`: entries in the allowlist not present in any current template dropdown (informational)
- `has_drift`: always `true` when this agent runs (the workflow skips activation when false)

## Issue Format

**Title:** `[Drift] Feature/Topic Area template options out of sync with allowlist`

**Body:**

- List each entry in `missing_from_allowlist`, noting that it appears in a template dropdown but is absent from the allowlist
- List entries in `stale_in_allowlist` as informational (may be legacy or manually managed labels — no action required unless confirmed stale)
- Include a suggested YAML block ready to append under `allowed-labels:` in `.github/workflows/auto-labelling.md`

Keep the issue concise — this is a maintenance prompt, not a report.
