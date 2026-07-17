// api/social/creativeBriefSchema.js
// Dependency-free normalization and validation helpers for Phase 2A-1 creative briefs.

const VERSION = 1;

const FUNNEL_STAGES = Object.freeze([
  "awareness",
  "consideration",
  "conversion",
  "retention",
]);

const STATUSES = Object.freeze(["draft", "approved"]);

const FIXED_CANVAS = Object.freeze({
  width: 1080,
  height: 1080,
  aspectRatio: "1:1",
});

const REQUIRED_STRING_FIELDS = Object.freeze([
  "marketingAngle",
  "audienceInsight",
  "coreMessage",
  "campaignObjective",
  "visualConcept",
  "subject",
  "environment",
  "mood",
  "lighting",
  "composition",
  "negativeSpace",
  "headlineDirection",
  "ctaDirection",
  "uniquenessNotes",
]);

const EDITABLE_FIELDS = Object.freeze([
  ...REQUIRED_STRING_FIELDS,
  "funnelStage",
  "avoid",
]);

function schemaError(message, details = []) {
  const error = new Error(message);
  error.code = "INVALID_BRIEF";
  error.details = Array.isArray(details) ? details : [];
  return error;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function trimString(value, fieldName) {
  if (typeof value !== "string") {
    throw schemaError(`${fieldName} must be a string.`, [fieldName]);
  }
  return value.trim();
}

function cloneCanvas() {
  return {
    width: FIXED_CANVAS.width,
    height: FIXED_CANVAS.height,
    aspectRatio: FIXED_CANVAS.aspectRatio,
  };
}

function cleanAvoidItem(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function isValidFunnelStage(value) {
  return typeof value === "string" && FUNNEL_STAGES.includes(value.trim());
}

export function validateFunnelStage(value) {
  const normalized = trimString(value, "funnelStage");
  if (!FUNNEL_STAGES.includes(normalized)) {
    throw schemaError(
      `funnelStage must be one of: ${FUNNEL_STAGES.join(", ")}.`,
      ["funnelStage"]
    );
  }
  return normalized;
}

export function isValidStatus(value) {
  return typeof value === "string" && STATUSES.includes(value.trim());
}

export function validateStatus(value) {
  const normalized = trimString(value, "status");
  if (!STATUSES.includes(normalized)) {
    throw schemaError(`status must be one of: ${STATUSES.join(", ")}.`, ["status"]);
  }
  return normalized;
}

export function normalizeAvoid(value) {
  let items;

  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "string") {
    items = value.split(/\r?\n|,/g);
  } else if (value === undefined || value === null) {
    items = [];
  } else {
    throw schemaError("avoid must be an array of strings or multiline text.", ["avoid"]);
  }

  const seen = new Set();
  const normalized = [];

  for (const item of items) {
    if (typeof item !== "string") {
      throw schemaError("avoid must contain strings only.", ["avoid"]);
    }

    const cleaned = cleanAvoidItem(item);
    if (!cleaned) continue;

    const dedupeKey = cleaned.toLocaleLowerCase();
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    normalized.push(cleaned);
  }

  return normalized;
}

export function validateRequiredStringFields(value) {
  if (!isPlainObject(value)) {
    throw schemaError("Creative brief must be a plain object.");
  }

  const missing = [];
  const normalized = {};

  for (const field of REQUIRED_STRING_FIELDS) {
    if (isPlainObject(value[field]) || Array.isArray(value[field])) {
      throw schemaError(`${field} must be a string.`, [field]);
    }

    const cleaned = trimString(value[field], field);
    if (!cleaned) missing.push(field);
    normalized[field] = cleaned;
  }

  if (missing.length) {
    throw schemaError(
      `Required creative brief fields are missing: ${missing.join(", ")}.`,
      missing
    );
  }

  return normalized;
}

export function removeUnsupportedFields(value) {
  if (!isPlainObject(value)) {
    throw schemaError("Creative brief must be a plain object.");
  }

  const supported = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      supported[field] = value[field];
    }
  }
  return supported;
}

export function normalizeEditableUserInput(value) {
  const supported = removeUnsupportedFields(value);
  const requiredStrings = validateRequiredStringFields(supported);

  return {
    ...requiredStrings,
    funnelStage: validateFunnelStage(supported.funnelStage),
    avoid: normalizeAvoid(supported.avoid),
  };
}

export function normalizeModelOutput(value) {
  if (!isPlainObject(value)) {
    const error = new Error("Model output must be a JSON object.");
    error.code = "MODEL_OUTPUT_INVALID";
    throw error;
  }

  try {
    return normalizeEditableUserInput(value);
  } catch (cause) {
    const error = new Error(cause?.message || "Model output is incomplete or malformed.");
    error.code = "MODEL_OUTPUT_INVALID";
    error.details = Array.isArray(cause?.details) ? cause.details : [];
    throw error;
  }
}

function normalizeTimestampOrNull(value) {
  if (value === undefined || value === null) return null;
  return value;
}

export function toFirestoreSafeObject(value) {
  if (value === undefined) return null;
  if (value === null) return null;

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toFirestoreSafeObject(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    output[key] = toFirestoreSafeObject(item);
  }
  return output;
}

export function createDraftData(editableInput, options = {}) {
  const editable = normalizeEditableUserInput(editableInput);
  const generatedAt = normalizeTimestampOrNull(options.generatedAt);
  const updatedAt = normalizeTimestampOrNull(options.updatedAt);

  return toFirestoreSafeObject({
    version: VERSION,
    status: "draft",
    ...editable,
    canvas: cloneCanvas(),
    generatedAt,
    updatedAt,
    approvedAt: null,
    approvedBy: null,
  });
}

export function createApprovedData(editableInput, options = {}) {
  const editable = normalizeEditableUserInput(editableInput);
  const generatedAt = normalizeTimestampOrNull(options.generatedAt);
  const updatedAt = normalizeTimestampOrNull(options.updatedAt);
  const approvedAt = normalizeTimestampOrNull(options.approvedAt);
  const approvedBy = typeof options.approvedBy === "string" ? options.approvedBy.trim() : "";

  if (!approvedAt) {
    throw schemaError("approvedAt is required when approving a creative brief.", ["approvedAt"]);
  }
  if (!approvedBy) {
    throw schemaError("approvedBy is required when approving a creative brief.", ["approvedBy"]);
  }

  return toFirestoreSafeObject({
    version: VERSION,
    status: "approved",
    ...editable,
    canvas: cloneCanvas(),
    generatedAt,
    updatedAt,
    approvedAt,
    approvedBy,
  });
}

export function normalizeStoredBrief(value) {
  if (!isPlainObject(value)) {
    throw schemaError("Stored creative brief is invalid.");
  }

  const editable = normalizeEditableUserInput(value);
  const status = validateStatus(value.status);

  return toFirestoreSafeObject({
    version: VERSION,
    status,
    ...editable,
    canvas: cloneCanvas(),
    generatedAt: normalizeTimestampOrNull(value.generatedAt),
    updatedAt: normalizeTimestampOrNull(value.updatedAt),
    approvedAt: status === "approved" ? normalizeTimestampOrNull(value.approvedAt) : null,
    approvedBy:
      status === "approved" && typeof value.approvedBy === "string"
        ? value.approvedBy.trim() || null
        : null,
  });
}

export const creativeBriefSchema = Object.freeze({
  version: VERSION,
  funnelStages: [...FUNNEL_STAGES],
  statuses: [...STATUSES],
  requiredStringFields: [...REQUIRED_STRING_FIELDS],
  editableFields: [...EDITABLE_FIELDS],
  canvas: cloneCanvas(),
});
