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
  const dispatchData = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const labelName = dispatchData.label;
  const actor = dispatchData.actor || "";
  const eventType = dispatchData.event_type;

  if (eventType !== "labeled" && eventType !== "unlabeled") {
    throw new Error(`Unsupported dispatch event type: ${eventType || "<empty>"}`);
  }

  if (!labelName || !actor || !dispatchData.discussion_number) {
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
        number: dispatchData.discussion_number,
        title: dispatchData.discussion_title || "unknown",
        updatedAt: dispatchData.createdAt || new Date().toISOString(),
        category: dispatchData.category || "unknown",
        categorySlug: dispatchData.category_slug || "unknown",
      },
    ],
    events: [
      {
        discussion_number: dispatchData.discussion_number,
        discussion_title: dispatchData.discussion_title || "unknown",
        category: dispatchData.category || "unknown",
        category_slug: dispatchData.category_slug || "unknown",
        event_type: eventType,
        label: labelName,
        actor,
        createdAt: dispatchData.createdAt || new Date().toISOString(),
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
