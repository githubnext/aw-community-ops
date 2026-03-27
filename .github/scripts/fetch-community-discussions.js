"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TARGET_REPOSITORY = "githubnext/aw-community-discussions";
const DEFAULT_MAX_DISCUSSIONS = 100;
const DEFAULT_TARGET_CATEGORY = "all";
const OUTPUT_ROOT = process.env.OUTPUT_ROOT || "/tmp/gh-aw/agent/discussion-scan";
const MAX_BODY_LENGTH = 4000;
const INACTIVE_DAYS_THRESHOLD = 30;
const WORKSPACE_ROOT = process.env.GITHUB_WORKSPACE || process.cwd();

function getWorkflowPath() {
  const relativePath = (process.env.ALLOWLIST_WORKFLOW_FILE || "").trim() || ".github/workflows/auto-labelling.md";
  return path.join(WORKSPACE_ROOT, relativePath);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(filePath, rows) {
  const content = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(filePath, content ? `${content}\n` : "", "utf8");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function countIndent(line) {
  let count = 0;
  while (count < line.length && line[count] === " ") {
    count += 1;
  }

  return count;
}

function readWorkflowLines() {
  const workflowPath = getWorkflowPath();
  if (!fs.existsSync(workflowPath)) {
    return null;
  }

  return fs.readFileSync(workflowPath, "utf8").split("\n");
}

function normalizeText(text, maxLength = MAX_BODY_LENGTH) {
  if (!text) {
    return "";
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function normalizeDiscussionLabels(labelsConnection) {
  if (!Array.isArray(labelsConnection?.nodes)) {
    return [];
  }

  return labelsConnection.nodes
    .map((label) => label?.name)
    .filter((label) => typeof label === "string" && label.trim())
    .map((label) => ({ name: label.trim() }));
}

function parseMaxDiscussions(rawValue) {
  const parsed = Number.parseInt(rawValue || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_DISCUSSIONS;
  }

  return parsed;
}

function parseTargetRepository(fullName) {
  const trimmed = (fullName || "").trim();
  const [owner, repo] = trimmed.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid target repository: ${trimmed || "<empty>"}`);
  }

  return {
    full_name: `${owner}/${repo}`,
    owner,
    repo,
  };
}

function parseTargetCategory(rawValue) {
  const normalized = (rawValue || "").trim().toLowerCase();
  if (!normalized || normalized === DEFAULT_TARGET_CATEGORY) {
    return null;
  }

  return normalized;
}

function readTargetRepository(lines = readWorkflowLines()) {
  const envTargetRepository = (process.env.TARGET_REPOSITORY || "").trim();
  if (envTargetRepository) {
    return parseTargetRepository(envTargetRepository);
  }

  if (!lines) {
    return parseTargetRepository(DEFAULT_TARGET_REPOSITORY);
  }

  const updateDiscussionIndex = lines.findIndex((line) => /^\s*update-discussion:\s*$/.test(line));
  if (updateDiscussionIndex === -1) {
    return parseTargetRepository(DEFAULT_TARGET_REPOSITORY);
  }

  const sectionIndent = countIndent(lines[updateDiscussionIndex]);
  for (let index = updateDiscussionIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      continue;
    }

    const indent = countIndent(line);
    if (indent <= sectionIndent) {
      break;
    }

    const match = line.match(/^\s*target-repo:\s*([^\s]+)\s*$/);
    if (!match) {
      continue;
    }

    return parseTargetRepository(match[1]);
  }

  return parseTargetRepository(DEFAULT_TARGET_REPOSITORY);
}

function readTargetCategory() {
  return parseTargetCategory(process.env.TARGET_CATEGORY || DEFAULT_TARGET_CATEGORY);
}

function parseDiscussionNumber(rawValue) {
  const parsed = Number.parseInt(rawValue || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function readAllowlists(lines = readWorkflowLines()) {
  if (!lines) {
    return {
      staged_union: [],
    };
  }

  const anchorIndex = lines.findIndex((line) => /^\s*allowed-labels:\s*$/.test(line));
  if (anchorIndex === -1) {
    return {
      staged_union: [],
    };
  }

  const anchorIndent = countIndent(lines[anchorIndex]);
  const stagedUnion = [];
  for (let index = anchorIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      break;
    }

    const indent = countIndent(line);
    if (indent <= anchorIndent) {
      break;
    }

    const match = line.match(/^\s*-\s+(.*)$/);
    if (!match) {
      break;
    }

    const label = match[1].trim();
    if (label) {
      stagedUnion.push(label);
    }
  }

  return {
    staged_union: stagedUnion,
  };
}

function resolveTargetCategoryInfo(categories, targetCategory) {
  if (!targetCategory) {
    return null;
  }

  const match = categories.find((category) =>
    category.slug.toLowerCase() === targetCategory || category.name.toLowerCase() === targetCategory,
  );
  if (!match) {
    throw new Error(`Target category '${targetCategory}' was not found in ${categories.map((category) => category.slug).join(", ")}`);
  }

  return match;
}

function matchesTargetCategory(category, targetCategoryInfo) {
  if (!targetCategoryInfo) {
    return true;
  }

  return (category?.slug || "").toLowerCase() === targetCategoryInfo.slug.toLowerCase();
}

async function fetchAllDiscussionCategories(github, targetRepository) {
  const categories = [];
  let after = null;

  while (true) {
    const result = await github.graphql(
      `
        query($owner: String!, $repo: String!, $after: String) {
          repository(owner: $owner, name: $repo) {
            discussionCategories(first: 100, after: $after) {
              nodes {
                id
                name
                slug
                description
                isAnswerable
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      {
        owner: targetRepository.owner,
        repo: targetRepository.repo,
        after,
      },
    );

    const connection = result.repository.discussionCategories;
    for (const category of connection.nodes) {
      categories.push({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description || "",
        is_answerable: Boolean(category.isAnswerable),
      });
    }

    if (!connection.pageInfo.hasNextPage) {
      break;
    }

    after = connection.pageInfo.endCursor;
  }

  categories.sort((left, right) => left.slug.localeCompare(right.slug));
  return categories;
}

async function fetchAllLabels(github, targetRepository) {
  const labels = await github.paginate(
    github.rest.issues.listLabelsForRepo,
    {
      owner: targetRepository.owner,
      repo: targetRepository.repo,
      per_page: 100,
    },
    (response) =>
      response.data.map((label) => ({
        name: label.name,
        color: label.color,
        description: label.description || "",
      })),
  );

  labels.sort((left, right) => left.name.localeCompare(right.name));
  return labels;
}

async function resolveFirstPostAuthors(github, authorLogins, targetRepository) {
  if (authorLogins.length === 0) {
    return new Set();
  }

  // GitHub usernames are alphanumeric + hyphens only; skip any that don't match
  // to avoid unexpected search query behavior.
  const safeLoginPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
  const safeLogins = authorLogins.filter((login) => safeLoginPattern.test(login));

  const firstPostSet = new Set();
  const results = await Promise.allSettled(
    safeLogins.map((login) =>
      github.graphql(
        `query($q: String!) {
          search(query: $q, type: DISCUSSION, first: 1) {
            discussionCount
          }
        }`,
        { q: `repo:${targetRepository.owner}/${targetRepository.repo} author:${login}` },
      ).then((result) => ({ login, count: result.search.discussionCount })),
    ),
  );

  for (const settled of results) {
    if (settled.status === "fulfilled" && settled.value.count === 1) {
      firstPostSet.add(settled.value.login);
    }
  }

  return firstPostSet;
}

function buildInactiveSignal(createdAt, updatedAt, commentCount) {
  const createdTimestamp = Date.parse(createdAt || "");
  const updatedTimestamp = Date.parse(updatedAt || "");
  const ageDays = Number.isFinite(createdTimestamp)
    ? Math.max(0, Math.floor((Date.now() - createdTimestamp) / (1000 * 60 * 60 * 24)))
    : null;
  const inactivityDays = Number.isFinite(updatedTimestamp)
    ? Math.max(0, Math.floor((Date.now() - updatedTimestamp) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    eligible: Boolean(
      (commentCount === 0 && ageDays !== null && ageDays >= INACTIVE_DAYS_THRESHOLD)
        || (inactivityDays !== null && inactivityDays >= INACTIVE_DAYS_THRESHOLD),
    ),
    age_days: ageDays,
    inactivity_days: inactivityDays,
    threshold_days: INACTIVE_DAYS_THRESHOLD,
  };
}

function normalizeDiscussion(discussion, isFirstPost = false) {
  const commentCount = discussion.comments.totalCount;
  return {
    number: discussion.number,
    title: discussion.title,
    url: discussion.url,
    labels: normalizeDiscussionLabels(discussion.labels),
    created_at: discussion.createdAt,
    updated_at: discussion.updatedAt,
    author_login: discussion.author ? discussion.author.login : null,
    is_answered: Boolean(discussion.isAnswered),
    upvote_count: discussion.upvoteCount,
    comment_count: commentCount,
    category: {
      name: discussion.category ? discussion.category.name : "",
      slug: discussion.category ? discussion.category.slug : "",
    },
    body_text: normalizeText(discussion.bodyText),
    inactive_signal: buildInactiveSignal(discussion.createdAt, discussion.updatedAt, commentCount),
    label_hints: {
      welcome_candidate: Boolean(isFirstPost),
    },
  };
}

async function fetchDiscussionByNumber(github, discussionNumber, targetRepository, targetCategoryInfo) {
  const result = await github.graphql(
    `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          discussion(number: $number) {
            number
            title
            url
            bodyText
            labels(first: 20) {
              nodes {
                name
              }
            }
            createdAt
            updatedAt
            isAnswered
            upvoteCount
            author {
              login
            }
            category {
              name
              slug
            }
            comments {
              totalCount
            }
          }
        }
      }
    `,
    {
      owner: targetRepository.owner,
      repo: targetRepository.repo,
      number: discussionNumber,
    },
  );

  const discussion = result.repository.discussion;
  if (!discussion) {
    throw new Error(`Discussion #${discussionNumber} was not found in ${targetRepository.owner}/${targetRepository.repo}`);
  }
  if (!matchesTargetCategory(discussion.category, targetCategoryInfo)) {
    throw new Error(`Discussion #${discussionNumber} is not in target category '${targetCategoryInfo.slug}'`);
  }

  const authorLogin = discussion.author ? discussion.author.login : null;
  const firstPostAuthors = await resolveFirstPostAuthors(github, authorLogin ? [authorLogin] : [], targetRepository);
  const normalizedDiscussion = normalizeDiscussion(discussion, firstPostAuthors.has(authorLogin));
  return {
    totalCount: 1,
    inventoryDiscussions: [normalizedDiscussion],
    preparedDiscussions: [normalizedDiscussion],
  };
}

async function fetchDiscussions(github, maxDiscussions, targetRepository, targetCategoryInfo) {
  if (!targetCategoryInfo) {
    const collectedRaw = [];
    let totalCount = 0;
    let after = null;

    while (collectedRaw.length < maxDiscussions) {
      const pageSize = Math.min(maxDiscussions - collectedRaw.length, 100);
      const result = await github.graphql(
        `
          query($owner: String!, $repo: String!, $first: Int!, $after: String) {
            repository(owner: $owner, name: $repo) {
              discussions(first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
                totalCount
                nodes {
                  number
                  title
                  url
                  bodyText
                  labels(first: 20) {
                    nodes {
                      name
                    }
                  }
                  createdAt
                  updatedAt
                  isAnswered
                  upvoteCount
                  author {
                    login
                  }
                  category {
                    name
                    slug
                  }
                  comments {
                    totalCount
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        {
          owner: targetRepository.owner,
          repo: targetRepository.repo,
          first: pageSize,
          after,
        },
      );

      const connection = result.repository.discussions;
      totalCount = connection.totalCount;
      collectedRaw.push(...connection.nodes);

      if (!connection.pageInfo.hasNextPage) {
        break;
      }

      after = connection.pageInfo.endCursor;
    }

    const uniqueAuthors = [...new Set(collectedRaw.map((d) => d.author?.login).filter(Boolean))];
    const firstPostAuthors = await resolveFirstPostAuthors(github, uniqueAuthors, targetRepository);

    const discussions = collectedRaw.map((raw) =>
      normalizeDiscussion(raw, firstPostAuthors.has(raw.author?.login)),
    );

    return {
      totalCount,
      inventoryDiscussions: discussions,
      preparedDiscussions: discussions,
    };
  }

  const filteredRawDiscussions = [];
  let filteredTotalCount = 0;
  let after = null;

  while (true) {
    const result = await github.graphql(
      `
        query($owner: String!, $repo: String!, $first: Int!, $after: String) {
          repository(owner: $owner, name: $repo) {
            discussions(first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
              nodes {
                number
                title
                url
                bodyText
                labels(first: 20) {
                  nodes {
                    name
                  }
                }
                createdAt
                updatedAt
                isAnswered
                upvoteCount
                author {
                  login
                }
                category {
                  name
                  slug
                }
                comments {
                  totalCount
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
      {
        owner: targetRepository.owner,
        repo: targetRepository.repo,
        first: 100,
        after,
      },
    );

    const connection = result.repository.discussions;
    for (const discussion of connection.nodes) {
      if (!matchesTargetCategory(discussion.category, targetCategoryInfo)) {
        continue;
      }

      filteredTotalCount += 1;
      if (filteredRawDiscussions.length < maxDiscussions) {
        filteredRawDiscussions.push(discussion);
      }
    }

    if (!connection.pageInfo.hasNextPage) {
      break;
    }

    after = connection.pageInfo.endCursor;
  }

  const uniqueAuthors = [...new Set(filteredRawDiscussions.map((d) => d.author?.login).filter(Boolean))];
  const firstPostAuthors = await resolveFirstPostAuthors(github, uniqueAuthors, targetRepository);

  const discussions = filteredRawDiscussions.map((raw) =>
    normalizeDiscussion(raw, firstPostAuthors.has(raw.author?.login)),
  );

  return {
    totalCount: filteredTotalCount,
    inventoryDiscussions: discussions,
    preparedDiscussions: discussions,
  };
}

async function main({ core, github }) {
  const workflowLines = readWorkflowLines();
  const targetRepository = readTargetRepository(workflowLines);
  const targetCategory = readTargetCategory();
  const maxDiscussions = parseMaxDiscussions(process.env.MAX_DISCUSSIONS);
  const targetDiscussionNumber = parseDiscussionNumber(process.env.TARGET_DISCUSSION_NUMBER);

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  const [categories, labels] = await Promise.all([
    fetchAllDiscussionCategories(github, targetRepository),
    fetchAllLabels(github, targetRepository),
  ]);
  const targetCategoryInfo = resolveTargetCategoryInfo(categories, targetCategory);
  const allowlists = readAllowlists(workflowLines);

  const request = {
    target_repository: targetRepository.full_name,
    target_category: targetCategoryInfo ? targetCategoryInfo.slug : DEFAULT_TARGET_CATEGORY,
    target_discussion_number: targetDiscussionNumber,
    max_discussions: maxDiscussions,
    available_category_slugs: categories.map((category) => category.slug),
    label_count: labels.length,
  };

  writeJson(path.join(OUTPUT_ROOT, "request.json"), request);
  writeJson(path.join(OUTPUT_ROOT, "categories.json"), categories);
  writeJson(path.join(OUTPUT_ROOT, "labels.json"), labels);
  writeJson(path.join(OUTPUT_ROOT, "allowlists.json"), allowlists);

  const { totalCount, inventoryDiscussions, preparedDiscussions } = targetDiscussionNumber
    ? await fetchDiscussionByNumber(github, targetDiscussionNumber, targetRepository, targetCategoryInfo)
    : await fetchDiscussions(github, maxDiscussions, targetRepository, targetCategoryInfo);

  writeJsonl(path.join(OUTPUT_ROOT, "inventory.jsonl"), inventoryDiscussions);
  writeJsonl(path.join(OUTPUT_ROOT, "discussions.jsonl"), preparedDiscussions);
  fs.writeFileSync(path.join(OUTPUT_ROOT, "discussions.count.txt"), `${totalCount}\n`, "utf8");

  writeJson(path.join(OUTPUT_ROOT, "summary.json"), {
    target_repository: targetRepository.full_name,
    target_category: targetCategoryInfo ? targetCategoryInfo.slug : DEFAULT_TARGET_CATEGORY,
    target_discussion_number: targetDiscussionNumber,
    total_discussion_count: totalCount,
    inventory_discussion_count: inventoryDiscussions.length,
    prepared_discussion_count: preparedDiscussions.length,
    label_count: labels.length,
  });

  core.info("Prepared scan inputs for current discussion batch");
  core.info(`Available categories: ${categories.length}`);
  core.info(`Available labels: ${labels.length}`);
  core.info(`Target max discussions is ${maxDiscussions}`);
  core.info(`Target discussion category is ${targetCategoryInfo ? targetCategoryInfo.slug : DEFAULT_TARGET_CATEGORY}`);
  core.info(`Target discussion repository is ${targetRepository.full_name}`);
  if (targetDiscussionNumber) {
    core.info(`Targeted discussion run for #${targetDiscussionNumber}`);
  }
  core.info(`Fetched ${inventoryDiscussions.length} discussions and prepared ${preparedDiscussions.length} discussions out of ${totalCount}`);
}

module.exports = {
  main,
};
