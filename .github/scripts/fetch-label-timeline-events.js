"use strict";

const fs = require("node:fs");
const path = require("node:path");

const OUTPUT_DIR = "/tmp/gh-aw/agent/labelling-correction";
const CONTEXT_PATH = path.join(OUTPUT_DIR, "context.json");

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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeOutputs(discussions, events) {
  writeJson(path.join(OUTPUT_DIR, "discussions.json"), discussions);
  writeJson(path.join(OUTPUT_DIR, "events.json"), events);
}

function normalizeDispatchPayload(context) {
  const payload = context.dispatch_payload || {};
  const labelName = payload.label;
  const actor = payload.actor || "";
  const eventType = payload.event_type;

  if (eventType !== "labeled" && eventType !== "unlabeled") {
    throw new Error(`Unsupported dispatch event type: ${eventType || "<empty>"}`);
  }

  if (!labelName || !actor || !payload.discussion_number) {
    throw new Error("Dispatch payload is missing one of: discussion_number, label, actor");
  }

  if (actor.endsWith("[bot]") || !TRUSTED_ACTORS.has(actor) || IGNORED_LABELS.has(labelName)) {
    return {
      discussions: [],
      events: [],
    };
  }

  return {
    discussions: [
      {
        number: payload.discussion_number,
        title: payload.discussion_title || "unknown",
        updatedAt: payload.createdAt || new Date().toISOString(),
        category: payload.category || "unknown",
        categorySlug: payload.category_slug || "unknown",
      },
    ],
    events: [
      {
        discussion_number: payload.discussion_number,
        discussion_title: payload.discussion_title || "unknown",
        category: payload.category || "unknown",
        event_type: eventType,
        label: labelName,
        actor,
        createdAt: payload.createdAt || new Date().toISOString(),
      },
    ],
  };
}
async function main({ core }) {
  const context = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf8"));

  if (context.intake_mode !== "dispatch") {
    throw new Error(`Unsupported intake mode: ${context.intake_mode || "<empty>"}`);
  }

  const { discussions, events } = normalizeDispatchPayload(context);
  core.info(`Received ${events.length} correction event(s) from repository_dispatch payload`);
  writeOutputs(discussions, events);
}

module.exports = { main };
