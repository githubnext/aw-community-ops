"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  SIGNAL_LABEL,
  PARENT_LABEL,
  SIGNAL_TITLE_PREFIX,
  MAX_SUBISSUES_PER_PARENT,
  buildSignalIssueTitle,
  buildSignalIssueBody,
  buildParentIssueTitle,
  buildParentIssueBody,
  parseSignalIssue,
  parseParentBatch,
} = require("./labelling-correction-helpers");

const OUTPUT_DIR = "/tmp/gh-aw/agent/labelling-correction-collector";
const SNAPSHOT_PATH = path.join(OUTPUT_DIR, "snapshot.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function historyKey(event) {
  return [event.createdAt, event.event_type, event.label, event.actor].join("::");
}

function mergeHistory(existingHistory, nextEvent) {
  const allEvents = [...existingHistory, nextEvent];
  const seen = new Set();
  return allEvents.filter((event) => {
    const key = historyKey(event);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function listIssuesByLabel(github, owner, repo, label, state = "open") {
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state,
    labels: label,
    per_page: 100,
  });

  return issues.filter((issue) => !issue.pull_request);
}

async function getSubIssueCount(github, owner, repo, issueNumber) {
  const result = await github.graphql(
    `
      query($owner: String!, $repo: String!, $issueNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issueNumber) {
            subIssues(first: 1) {
              totalCount
            }
          }
        }
      }
    `,
    {
      owner,
      repo,
      issueNumber,
    }
  );

  return result?.repository?.issue?.subIssues?.totalCount || 0;
}

async function ensureParentIssue(github, owner, repo) {
  const openParents = (await listIssuesByLabel(github, owner, repo, PARENT_LABEL, "open"))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));

  for (const issue of openParents) {
    const subIssueCount = await getSubIssueCount(github, owner, repo, issue.number);
    if (subIssueCount < MAX_SUBISSUES_PER_PARENT) {
      return issue;
    }
  }

  const allParents = await listIssuesByLabel(github, owner, repo, PARENT_LABEL, "all");
  const nextBatch = allParents.reduce((maxBatch, issue) => {
    return Math.max(maxBatch, parseParentBatch(issue.title, issue.body || ""));
  }, 0) + 1;

  const created = await github.rest.issues.create({
    owner,
    repo,
    title: buildParentIssueTitle(nextBatch),
    body: buildParentIssueBody(nextBatch),
    labels: [PARENT_LABEL],
  });

  return created.data;
}

async function linkSubIssue(github, parentNodeId, subIssueNodeId) {
  await github.graphql(
    `
      mutation AddSubIssue($parentId: ID!, $subIssueId: ID!) {
        addSubIssue(input: { issueId: $parentId, subIssueId: $subIssueId }) {
          issue {
            number
          }
          subIssue {
            number
          }
        }
      }
    `,
    {
      parentId: parentNodeId,
      subIssueId: subIssueNodeId,
    }
  );
}

async function main({ core, github, context }) {
  const snapshot = readJson(SNAPSHOT_PATH);
  if (snapshot.skipped) {
    core.info(snapshot.skip_reason || "Collector snapshot was skipped");
    return;
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const metadata = {
    signal_key: snapshot.signal_key,
    target_repository: snapshot.target_repository,
    discussion_number: snapshot.discussion_number,
    discussion_url: snapshot.discussion_url,
    discussion_title: snapshot.discussion_title,
    discussion_body_text: snapshot.discussion_body_text,
    category_name: snapshot.category_name,
    category_slug: snapshot.category_slug,
    current_labels: snapshot.current_labels,
    discussion_created_at: snapshot.discussion_created_at,
    discussion_updated_at: snapshot.discussion_updated_at,
  };

  const openSignals = (await listIssuesByLabel(github, owner, repo, SIGNAL_LABEL, "open")).map(parseSignalIssue);
  const existing = openSignals.find((issue) => issue.metadata?.signal_key === snapshot.signal_key);
  const nextHistory = mergeHistory(existing?.history || [], snapshot.correction);
  const title = `${SIGNAL_TITLE_PREFIX} ${buildSignalIssueTitle(metadata)}`;
  const body = buildSignalIssueBody(metadata, nextHistory);

  if (existing) {
    await github.rest.issues.update({
      owner,
      repo,
      issue_number: existing.number,
      title,
      body,
    });
    core.info(`Updated correction signal issue #${existing.number} for ${snapshot.signal_key}`);
    return;
  }

  const parent = await ensureParentIssue(github, owner, repo);
  const created = await github.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels: [SIGNAL_LABEL],
  });

  if (!parent.node_id || !created.data.node_id) {
    throw new Error("Could not resolve node IDs for parent/sub-issue linking");
  }

  await linkSubIssue(github, parent.node_id, created.data.node_id);
  core.info(`Created correction signal issue #${created.data.number} under parent #${parent.number}`);
}

module.exports = { main };