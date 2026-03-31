"use strict";

const DEFAULT_TARGET_REPOSITORY = "githubnext/aw-community-discussions";
const MAX_DISCUSSION_BODY_LENGTH = 4000;

const SIGNAL_LABEL = "labelling-correction-signal";
const PARENT_LABEL = "labelling-correction-parent";
const SIGNAL_TITLE_PREFIX = "[Labelling Correction Signal]";
const PARENT_TITLE_PREFIX = "[Labelling Correction Intake]";
const MAX_SUBISSUES_PER_PARENT = 120;

const IGNORED_LABELS = new Set([
  "inactive",
  "Welcome :tada:",
  "source:ui",
  "source:other",
  "A Welcome to GitHub",
  "Welcome 🎉",
]);

const TRUSTED_ACTORS = new Set([
  "samus-aran",
  "queenofcorgis",
  "akash1134",
  "ghostinhershell",
  "shinybrightstar",
  "ebndev",
  "mecodeatlas",
  "mnkiefer",
]);

function normalizeText(text, maxLength = MAX_DISCUSSION_BODY_LENGTH) {
  if (!text) {
    return "";
  }

  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function parseTargetRepository(fullName) {
  const trimmed = (fullName || "").trim();
  if (!trimmed) {
    throw new Error("Missing target repository");
  }

  const [owner, repo] = trimmed.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repository value '${trimmed}'`);
  }

  return {
    owner,
    repo,
    full_name: `${owner}/${repo}`,
  };
}

function normalizeDispatchPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const dispatchData = payload.data && typeof payload.data === "object" ? payload.data : payload;

  const eventType = dispatchData.event_type;
  const labelName = dispatchData.label;
  const actor = dispatchData.actor || "";
  const discussionNumber = Number.parseInt(String(dispatchData.discussion_number || ""), 10);

  if (eventType !== "labeled" && eventType !== "unlabeled") {
    throw new Error(`Unsupported dispatch event type: ${eventType || "<empty>"}`);
  }

  if (!Number.isInteger(discussionNumber) || discussionNumber <= 0 || !labelName || !actor) {
    throw new Error("Dispatch payload is missing one of: discussion_number, label, actor");
  }

  if (actor.endsWith("[bot]")) {
    return {
      skipped: true,
      skip_reason: `Ignored bot actor '${actor}'`,
    };
  }

  if (!TRUSTED_ACTORS.has(actor)) {
    return {
      skipped: true,
      skip_reason: `Ignored untrusted actor '${actor}'`,
    };
  }

  if (IGNORED_LABELS.has(labelName)) {
    return {
      skipped: true,
      skip_reason: `Ignored label '${labelName}'`,
    };
  }

  return {
    skipped: false,
    correction: {
      discussion_number: discussionNumber,
      discussion_title: dispatchData.discussion_title || "unknown",
      category: dispatchData.category || "unknown",
      category_slug: dispatchData.category_slug || "unknown",
      event_type: eventType,
      label: labelName,
      actor,
      createdAt: dispatchData.createdAt || new Date().toISOString(),
    },
    // source_repository in the dispatch payload is the discussions repo where the discussion lives.
    target_repository: parseTargetRepository(dispatchData.source_repository),
  };
}

function serializeHiddenJson(marker, value) {
  return `<!-- ${marker}\n${JSON.stringify(value, null, 2)}\n-->`;
}

function extractHiddenJson(body, marker) {
  const match = String(body || "").match(new RegExp(`<!-- ${marker}\\n([\\s\\S]*?)\\n-->`));
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function uniqueSorted(values) {
  return Array.from(new Set((values || []).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function truncateTitle(title, maxLength = 96) {
  const normalized = normalizeText(title, maxLength);
  return normalized || "Unknown discussion";
}

function buildSignalKey(metadata) {
  return `${metadata.target_repository}#${metadata.discussion_number}`;
}

function buildSignalIssueTitle(metadata) {
  return `Discussion #${metadata.discussion_number}: ${truncateTitle(metadata.discussion_title, 86)}`;
}

function buildSignalIssueBody(metadata, history) {
  const sortedHistory = [...history].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  const seenLabels = uniqueSorted(sortedHistory.map((event) => event.label));
  const seenEventTypes = uniqueSorted(sortedHistory.map((event) => event.event_type));
  const latest = sortedHistory[sortedHistory.length - 1] || null;
  const bodyText = String(metadata.discussion_body_text || "").replace(/```/g, "'''");

  const historyLines = sortedHistory.length
    ? sortedHistory.map((event) => `| ${event.createdAt} | ${event.event_type} | ${event.label} |`)
    : ["| none | none | none |"];

  return [
    "This issue records trusted label corrections for one discussion. It is a deterministic intake record for later agentic analysis of `.github/instructions/community-discussion-labeling.md`.",
    "",
    serializeHiddenJson("labelling-correction-metadata", metadata),
    serializeHiddenJson("labelling-correction-history", sortedHistory),
    `Signal key: ${metadata.signal_key}`,
    `Discussion number: ${metadata.discussion_number}`,
    `Target repository: ${metadata.target_repository}`,
    `Discussion URL: ${metadata.discussion_url}`,
    `Current category: ${metadata.category_name}`,
    `Current category slug: ${metadata.category_slug}`,
    `Current labels: ${metadata.current_labels.length ? metadata.current_labels.join(", ") : "none"}`,
    `Seen labels: ${seenLabels.length ? seenLabels.join(", ") : "none"}`,
    `Seen event types: ${seenEventTypes.length ? seenEventTypes.join(", ") : "none"}`,
    `Correction count: ${sortedHistory.length}`,
    `First correction seen: ${sortedHistory[0]?.createdAt || "unknown"}`,
    `Last correction seen: ${latest?.createdAt || "unknown"}`,
    `Latest event type: ${latest?.event_type || "unknown"}`,
    `Latest label: ${latest?.label || "unknown"}`,
    "",
    "### Discussion Snapshot",
    "",
    `**Title:** ${metadata.discussion_title}`,
    "",
    "```text",
    bodyText || "(empty body)",
    "```",
    "",
    "### Correction History",
    "",
    "| When | Event | Label |",
    "| --- | --- | --- |",
    ...historyLines,
  ].join("\n");
}

function buildParentIssueTitle(batchNumber) {
  return `${PARENT_TITLE_PREFIX} Batch ${String(batchNumber).padStart(2, "0")}`;
}

function buildParentIssueBody(batchNumber) {
  return [
    "This issue collects deterministic labelling-correction intake sub-issues for later agentic review of `.github/instructions/community-discussion-labeling.md`.",
    "",
    "When this intake issue has enough evidence, run the `Labelling Correction Feedback` workflow with this issue number or assign this issue to Copilot.",
    "",
    `<!-- labelling-correction-parent batch:${batchNumber} -->`,
    `Batch number: ${batchNumber}`,
    `Max sub-issues: ${MAX_SUBISSUES_PER_PARENT}`,
  ].join("\n");
}

function parseSignalIssue(issue) {
  return {
    ...issue,
    metadata: extractHiddenJson(issue.body || "", "labelling-correction-metadata"),
    history: extractHiddenJson(issue.body || "", "labelling-correction-history") || [],
  };
}

function parseParentBatch(title, body) {
  const titleMatch = String(title || "").match(/Batch\s+(\d+)/i);
  if (titleMatch) {
    return Number.parseInt(titleMatch[1], 10);
  }

  const bodyMatch = String(body || "").match(/Batch number:\s*(\d+)/i);
  if (bodyMatch) {
    return Number.parseInt(bodyMatch[1], 10);
  }

  return 0;
}

module.exports = {
  DEFAULT_TARGET_REPOSITORY,
  SIGNAL_LABEL,
  PARENT_LABEL,
  SIGNAL_TITLE_PREFIX,
  PARENT_TITLE_PREFIX,
  MAX_SUBISSUES_PER_PARENT,
  normalizeText,
  parseTargetRepository,
  normalizeDispatchPayload,
  serializeHiddenJson,
  extractHiddenJson,
  buildSignalKey,
  buildSignalIssueTitle,
  buildSignalIssueBody,
  buildParentIssueTitle,
  buildParentIssueBody,
  parseSignalIssue,
  parseParentBatch,
};