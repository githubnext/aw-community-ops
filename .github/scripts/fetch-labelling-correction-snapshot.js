"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  normalizeDispatchPayload,
  normalizeText,
  buildSignalKey,
} = require("./labelling-correction-helpers");

const OUTPUT_DIR = "/tmp/gh-aw/agent/labelling-correction-collector";
const SNAPSHOT_PATH = path.join(OUTPUT_DIR, "snapshot.json");

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchDiscussion(github, targetRepository, discussionNumber) {
  const result = await github.graphql(
    `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $number) {
            number
            title
            url
            bodyText
            createdAt
            updatedAt
            category {
              name
              slug
            }
            labels(first: 50) {
              nodes {
                name
              }
            }
          }
        }
      }
    `,
    {
      owner: targetRepository.owner,
      repo: targetRepository.repo,
      number: discussionNumber,
    }
  );

  const discussion = result?.repository?.discussion;
  if (!discussion) {
    throw new Error(`Discussion #${discussionNumber} was not found in ${targetRepository.full_name}`);
  }

  return {
    discussion_number: discussion.number,
    discussion_title: discussion.title,
    discussion_url: discussion.url,
    discussion_body_text: normalizeText(discussion.bodyText),
    category_name: discussion.category?.name || "unknown",
    category_slug: discussion.category?.slug || "unknown",
    current_labels: Array.isArray(discussion.labels?.nodes)
      ? discussion.labels.nodes.map((label) => label?.name).filter(Boolean).sort((left, right) => left.localeCompare(right))
      : [],
    discussion_created_at: discussion.createdAt,
    discussion_updated_at: discussion.updatedAt,
  };
}

async function main({ core, github, context }) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const normalized = normalizeDispatchPayload(context.payload?.client_payload || {});
  if (normalized.skipped) {
    writeJson(SNAPSHOT_PATH, normalized);
    core.info(normalized.skip_reason);
    return;
  }

  const metadata = await fetchDiscussion(
    github,
    normalized.target_repository,
    normalized.correction.discussion_number
  );

  const snapshot = {
    skipped: false,
    target_repository: normalized.target_repository.full_name,
    signal_key: buildSignalKey({
      target_repository: normalized.target_repository.full_name,
      discussion_number: metadata.discussion_number,
    }),
    correction: normalized.correction,
    ...metadata,
  };

  writeJson(SNAPSHOT_PATH, snapshot);
  core.info(`Prepared deterministic correction snapshot for ${snapshot.signal_key}`);
}

module.exports = { main };