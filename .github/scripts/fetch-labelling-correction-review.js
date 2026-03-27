"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  PARENT_LABEL,
  parseSignalIssue,
} = require("./labelling-correction-helpers");

const OUTPUT_DIR = "/tmp/gh-aw/agent/labelling-correction-review";

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseParentIssueNumber(context) {
  const fromIssueEvent = context.payload?.issue?.number;
  if (Number.isInteger(fromIssueEvent) && fromIssueEvent > 0) {
    return fromIssueEvent;
  }

  const rawInput = context.payload?.inputs?.["parent-issue-number"];
  const fromInput = Number.parseInt(String(rawInput || ""), 10);
  if (Number.isInteger(fromInput) && fromInput > 0) {
    return fromInput;
  }

  return null;
}

async function resolveParentIssueNumber(github, owner, repo, explicitNumber) {
  if (explicitNumber) {
    return explicitNumber;
  }

  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: "open",
    labels: PARENT_LABEL,
    per_page: 100,
  });

  const parent = issues
    .filter((issue) => !issue.pull_request)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];

  return parent ? parent.number : null;
}

async function fetchParentAndSignals(github, owner, repo, issueNumber) {
  const subIssues = [];
  let parent = null;
  let hasNextPage = true;
  let after = null;

  while (hasNextPage) {
    const result = await github.graphql(
      `
        query($owner: String!, $repo: String!, $issueNumber: Int!, $after: String) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issueNumber) {
              number
              title
              body
              url
              state
              createdAt
              updatedAt
              labels(first: 20) {
                nodes {
                  name
                }
              }
              subIssues(first: 50, after: $after) {
                totalCount
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  number
                  title
                  body
                  url
                  state
                  createdAt
                  updatedAt
                  labels(first: 20) {
                    nodes {
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `,
      {
        owner,
        repo,
        issueNumber,
        after,
      }
    );

    const issue = result?.repository?.issue;
    if (!issue) {
      throw new Error(`Issue #${issueNumber} was not found in ${owner}/${repo}`);
    }

    parent = {
      number: issue.number,
      title: issue.title,
      body: issue.body || "",
      url: issue.url,
      state: issue.state,
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      labels: (issue.labels?.nodes || []).map((label) => label?.name).filter(Boolean),
      sub_issue_total_count: issue.subIssues?.totalCount || 0,
    };

    for (const subIssue of issue.subIssues?.nodes || []) {
      subIssues.push({
        number: subIssue.number,
        title: subIssue.title,
        body: subIssue.body || "",
        url: subIssue.url,
        state: subIssue.state,
        created_at: subIssue.createdAt,
        updated_at: subIssue.updatedAt,
        labels: (subIssue.labels?.nodes || []).map((label) => label?.name).filter(Boolean),
      });
    }

    hasNextPage = Boolean(issue.subIssues?.pageInfo?.hasNextPage);
    after = issue.subIssues?.pageInfo?.endCursor || null;
  }

  return { parent, subIssues };
}

async function main({ core, github, context }) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const requestedIssueNumber = parseParentIssueNumber(context);
  const parentIssueNumber = await resolveParentIssueNumber(github, owner, repo, requestedIssueNumber);

  if (!parentIssueNumber) {
    writeJson(path.join(OUTPUT_DIR, "parent-issue.json"), {
      available: false,
      reason: "No parent issue number was provided and no open intake parent issue was found.",
    });
    writeJson(path.join(OUTPUT_DIR, "collected-signals.json"), []);
    core.info("No intake parent issue available for review");
    return;
  }

  const { parent, subIssues } = await fetchParentAndSignals(github, owner, repo, parentIssueNumber);
  const parsedSignals = subIssues
    .filter((issue) => issue.state === "OPEN")
    .map((issue) => ({
      ...issue,
      parsed: parseSignalIssue(issue),
    }))
    .filter((issue) => issue.parsed.metadata);

  writeJson(path.join(OUTPUT_DIR, "parent-issue.json"), {
    available: true,
    valid_parent: parent.labels.includes(PARENT_LABEL),
    ...parent,
  });

  writeJson(
    path.join(OUTPUT_DIR, "collected-signals.json"),
    parsedSignals.map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      labels: issue.labels,
      metadata: issue.parsed.metadata,
      history: issue.parsed.history,
    }))
  );

  core.info(`Prepared ${parsedSignals.length} open correction signal(s) from parent issue #${parentIssueNumber}`);
}

module.exports = { main };