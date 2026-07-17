// api/social/generateCreativeBrief.js
// Phase 2A-1 — server-owned Creative Brief load, generate, save and approve operations.

import admin from "../firebaseAdmin.js";
import { resolveSocialDocument } from "./socialDocumentResolver.js";
import {
  createApprovedData,
  createDraftData,
  normalizeEditableUserInput,
  normalizeModelOutput,
  normalizeStoredBrief,
} from "./creativeBriefSchema.js";

const ALLOWED_ACTIONS = new Set(["load", "generate", "save", "approve"]);
const RECENT_POST_LIMIT = 8;

const ERROR_STATUS = Object.freeze({
  METHOD_NOT_ALLOWED: 405,
  UNAUTHENTICATED: 401,
  NO_ACCESS: 403,
  WEBSITE_NOT_FOUND: 404,
  SOCIAL_NOT_FOUND: 404,
  PHASE3_NOT_COMPLETED: 400,
  POST_NOT_FOUND: 404,
  THEME_NOT_FOUND: 404,
  BRIEF_NOT_FOUND: 404,
  INVALID_ACTION: 400,
  INVALID_BRIEF: 400,
  MODEL_OUTPUT_NOT_JSON: 502,
  MODEL_OUTPUT_INVALID: 502,
  MODEL_PROVIDER_ERROR: 502,
  FIRESTORE_UPDATE_FAILED: 500,
  INTERNAL_ERROR: 500,
});

const ERROR_MESSAGES = Object.freeze({
  METHOD_NOT_ALLOWED: "This request method is not supported.",
  UNAUTHENTICATED: "Please sign in again and retry.",
  NO_ACCESS: "You do not have access to this website.",
  WEBSITE_NOT_FOUND: "Website not found.",
  SOCIAL_NOT_FOUND: "Social module not found.",
  PHASE3_NOT_COMPLETED: "Complete and lock Phase 3 before creating a creative brief.",
  POST_NOT_FOUND: "The selected Phase 4 post could not be found.",
  THEME_NOT_FOUND: "The full selected theme could not be found. Return to the calendar and select a valid theme.",
  BRIEF_NOT_FOUND: "Generate a creative brief before saving or approving it.",
  INVALID_ACTION: "Invalid creative brief action.",
  INVALID_BRIEF: "Complete every required creative brief field before continuing.",
  MODEL_OUTPUT_NOT_JSON: "The creative brief generator returned an unreadable response. Please regenerate it.",
  MODEL_OUTPUT_INVALID: "The generated creative brief was incomplete or invalid. Please regenerate it.",
  MODEL_PROVIDER_ERROR: "The creative brief generator is temporarily unavailable. Please try again.",
  FIRESTORE_UPDATE_FAILED: "The creative brief could not be saved. Please try again.",
  INTERNAL_ERROR: "Something went wrong while processing the creative brief.",
});

function makeError(code, message) {
  const error = new Error(message || ERROR_MESSAGES[code] || ERROR_MESSAGES.INTERNAL_ERROR);
  error.code = code || "INTERNAL_ERROR";
  return error;
}

function sendError(res, code, message) {
  const safeCode = ERROR_STATUS[code] ? code : "INTERNAL_ERROR";
  return res.status(ERROR_STATUS[safeCode]).json({
    ok: false,
    error: message || ERROR_MESSAGES[safeCode],
    code: safeCode,
  });
}

function safeString(value, maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeStringArray(value, limit = 20, itemLength = 300) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().slice(0, itemLength))
    .filter(Boolean)
    .slice(0, limit);
}

function safePrimitiveObject(value, limit = 30) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, limit)) {
    if (typeof item === "string") output[key] = item.trim().slice(0, 300);
    else if (typeof item === "number" && Number.isFinite(item)) output[key] = item;
    else if (typeof item === "boolean") output[key] = item;
  }
  return output;
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function authenticate(req) {
  const token = getBearerToken(req);
  if (!token) throw makeError("UNAUTHENTICATED");

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!decoded?.uid) throw makeError("UNAUTHENTICATED");
    return decoded.uid;
  } catch (error) {
    if (error?.code === "UNAUTHENTICATED") throw error;
    throw makeError("UNAUTHENTICATED");
  }
}

function findCalendarPost(socialData, postId) {
  const calendars = socialData?.phase3?.calendars || {};
  const platforms = ["linkedin", "instagram"];

  for (const platform of platforms) {
    const posts = Array.isArray(calendars[platform]) ? calendars[platform] : [];
    const post = posts.find((item) => safeString(item?.id, 200) === postId);
    if (post) {
      return {
        id: postId,
        platform,
        intent: safeString(post.intent, 300),
        format: safeString(post.format, 300),
        date: safeString(post.date, 100),
        themeId: safeString(post.themeId, 300),
        themeTitle: safeString(post.themeTitle, 500),
      };
    }
  }

  return null;
}

function resolveFullTheme(socialData, calendarPost) {
  const platform = calendarPost?.platform;
  const themes = socialData?.phase2?.themes?.[platform];
  if (!Array.isArray(themes)) return null;

  const usableThemeId = safeString(calendarPost.themeId, 300);
  if (usableThemeId) {
    const byId = themes.find((theme) => safeString(theme?.themeId, 300) === usableThemeId);
    if (byId) return normalizeTheme(byId);
    return null;
  }

  const legacyTitle = safeString(calendarPost.themeTitle, 500);
  if (!legacyTitle) return null;

  const normalizedTitle = legacyTitle.toLocaleLowerCase();
  const matches = themes.filter(
    (theme) => safeString(theme?.title, 500).toLocaleLowerCase() === normalizedTitle
  );

  return matches.length === 1 ? normalizeTheme(matches[0]) : null;
}

function normalizeTheme(theme) {
  return {
    themeId: safeString(theme?.themeId, 300),
    title: safeString(theme?.title, 500),
    what: safeString(theme?.what, 1800),
    whyFit: safeString(theme?.whyFit, 1800),
    examples: safeStringArray(theme?.examples, 4, 500),
    anchorType: safeString(theme?.anchorType, 200),
  };
}

function normalizeExistingCopy(postData) {
  return {
    visualHeadline: safeString(postData?.visualHeadline, 500),
    visualSubHeadline: safeString(postData?.visualSubHeadline, 500),
    caption: safeString(postData?.caption, 3000),
    cta: safeString(postData?.cta, 500),
    hashtags: safeStringArray(postData?.hashtags, 20, 100),
  };
}

function normalizeRecentPost(postId, data) {
  const brief = data?.creativeBrief && typeof data.creativeBrief === "object"
    ? data.creativeBrief
    : null;

  return {
    postId: safeString(postId, 200),
    visualHeadline: safeString(data?.visualHeadline, 300),
    visualSubHeadline: safeString(data?.visualSubHeadline, 300),
    caption: safeString(data?.caption, 1000),
    cta: safeString(data?.cta, 200),
    creativeBrief: brief
      ? {
          marketingAngle: safeString(brief.marketingAngle, 500),
          coreMessage: safeString(brief.coreMessage, 500),
          visualConcept: safeString(brief.visualConcept, 500),
          subject: safeString(brief.subject, 300),
          environment: safeString(brief.environment, 300),
          composition: safeString(brief.composition, 500),
          headlineDirection: safeString(brief.headlineDirection, 300),
          uniquenessNotes: safeString(brief.uniquenessNotes, 500),
        }
      : null,
  };
}

async function loadRecentPosts(socialRef, currentPostId) {
  try {
    const snapshot = await socialRef
      .collection("phase4Posts")
      .limit(RECENT_POST_LIMIT + 1)
      .get();

    return snapshot.docs
      .filter((docSnap) => docSnap.id !== currentPostId)
      .slice(0, RECENT_POST_LIMIT)
      .map((docSnap) => normalizeRecentPost(docSnap.id, docSnap.data() || {}));
  } catch (error) {
    console.warn("generateCreativeBrief recent-post lookup skipped:", error?.message || error);
    return [];
  }
}

function buildGenerationContext({ socialData, calendarPost, theme, existingCopy, recentPosts }) {
  const strategy = socialData?.strategy || {};
  const guardrails = socialData?.guardrails || {};

  return {
    brand: {
      name: safeString(socialData?.brandName, 500),
      businessType: safeString(socialData?.businessType, 500),
      industry: safeString(socialData?.industry, 500),
      geography: safeString(socialData?.geography, 500),
    },
    post: {
      platform: calendarPost.platform,
      intent: calendarPost.intent,
      format: calendarPost.format,
      date: calendarPost.date,
    },
    selectedTheme: theme,
    strategy: {
      primaryObjective: safeString(strategy.primaryObjective, 700),
      secondaryObjective: safeString(strategy.secondaryObjective, 700),
      riskAppetite: safeString(strategy.riskAppetite, 300),
    },
    voiceSliders: safePrimitiveObject(socialData?.voiceSliders),
    guardrails: {
      topicsToAvoid: safeString(guardrails.topicsToAvoid, 1500),
      tonesToAvoid: safeStringArray(guardrails.toneToAvoid, 20, 300),
      visualsToAvoid: safeStringArray(guardrails.visualAvoid, 20, 300),
    },
    existingCopy,
    recentPhase4Posts: recentPosts,
  };
}

function buildPrompt(context) {
  return `You are a senior social creative strategist and art director.

Create one specific, execution-ready creative brief for the supplied Phase 4 social post.
The brief must be strategically distinct from recent posts and must use the complete selected theme, not merely its title.
Respect all brand strategy, voice sliders, guardrails, post intent, format and platform context.
Existing copy is context only: preserve its strategic meaning where useful, but do not rewrite or return the copy itself.

Return a single valid JSON object only. Do not use markdown or code fences.
Return exactly these editable keys and no others:
{
  "marketingAngle": "non-empty string",
  "audienceInsight": "non-empty string",
  "coreMessage": "non-empty string",
  "campaignObjective": "non-empty string",
  "funnelStage": "awareness | consideration | conversion | retention",
  "visualConcept": "non-empty string",
  "subject": "non-empty string",
  "environment": "non-empty string",
  "mood": "non-empty string",
  "lighting": "non-empty string",
  "composition": "non-empty string",
  "negativeSpace": "non-empty string",
  "headlineDirection": "non-empty string",
  "ctaDirection": "non-empty string",
  "avoid": ["specific item to avoid"],
  "uniquenessNotes": "non-empty string"
}

Requirements:
- Every string field must be concrete and non-empty.
- Do not include version, status, canvas, timestamps or approval metadata.
- Do not invent unsupported brand facts, claims, offers, statistics or visual assets.
- Make the visual concept suitable for a premium photorealistic 1080 x 1080 social image.
- Specify subject, environment, mood, lighting, composition and usable negative space clearly enough for later image generation.
- Headline and CTA directions are strategic directions, not finished copy.
- The avoid array must contain concise, relevant prohibitions and must respect all supplied guardrails.
- Uniqueness notes must explain how this execution avoids repetition with recent Phase 4 work.

Context:
${JSON.stringify(context, null, 2)}`;
}

async function callModel(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw makeError("MODEL_PROVIDER_ERROR");

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.55,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON only. Follow the requested schema exactly and never include protected server metadata.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch {
    throw makeError("MODEL_PROVIDER_ERROR");
  }

  if (!response.ok) {
    throw makeError("MODEL_PROVIDER_ERROR");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw makeError("MODEL_PROVIDER_ERROR");
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw makeError("MODEL_OUTPUT_NOT_JSON");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw makeError("MODEL_OUTPUT_NOT_JSON");
  }
}

async function resolveRequestContext({ db, uid, websiteId, postId }) {
  const candidateChecks = new Map();

  let resolved;
  try {
    resolved = await resolveSocialDocument({
      db,
      uid,
      websiteId,
      requiredData: (socialData, context) => {
        const phase3Completed = socialData?.phase3?.phase3Completed === true;
        const calendarPost = phase3Completed ? findCalendarPost(socialData, postId) : null;
        const theme = calendarPost ? resolveFullTheme(socialData, calendarPost) : null;

        candidateChecks.set(context.resolvedUid, {
          phase3Completed,
          calendarPost,
          theme,
        });

        return phase3Completed && Boolean(calendarPost) && Boolean(theme);
      },
    });
  } catch (error) {
    if (["WEBSITE_NOT_FOUND", "NO_ACCESS", "SOCIAL_NOT_FOUND"].includes(error?.code)) {
      throw makeError(error.code);
    }

    if (error?.code === "REQUIRED_SOCIAL_DATA_MISSING") {
      const checks = Array.from(candidateChecks.values());
      if (!checks.some((check) => check.phase3Completed)) {
        throw makeError("PHASE3_NOT_COMPLETED");
      }
      if (!checks.some((check) => Boolean(check.calendarPost))) {
        throw makeError("POST_NOT_FOUND");
      }
      throw makeError("THEME_NOT_FOUND");
    }

    throw error;
  }

  const selected = candidateChecks.get(resolved.resolvedUid) || {};
  return {
    ...resolved,
    calendarPost: selected.calendarPost,
    theme: selected.theme,
    postRef: resolved.socialRef.collection("phase4Posts").doc(postId),
  };
}

function responseBrief(brief) {
  if (!brief) return null;
  return normalizeStoredBrief(brief);
}

async function handleLoad({ res, context }) {
  const snapshot = await context.postRef.get();
  const data = snapshot.exists ? snapshot.data() || {} : {};
  const brief = data.creativeBrief ? responseBrief(data.creativeBrief) : null;

  return res.status(200).json({
    ok: true,
    brief,
    resolution: { source: context.source },
  });
}

async function handleGenerate({ res, context, postId }) {
  const postSnapshot = await context.postRef.get();
  const postData = postSnapshot.exists ? postSnapshot.data() || {} : {};
  const recentPosts = await loadRecentPosts(context.socialRef, postId);

  const generationContext = buildGenerationContext({
    socialData: context.socialData,
    calendarPost: context.calendarPost,
    theme: context.theme,
    existingCopy: normalizeExistingCopy(postData),
    recentPosts,
  });

  const rawModelOutput = await callModel(buildPrompt(generationContext));
  let editable;
  try {
    editable = normalizeModelOutput(rawModelOutput);
  } catch (error) {
    throw makeError("MODEL_OUTPUT_INVALID", error?.message);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const brief = createDraftData(editable, {
    generatedAt: now,
    updatedAt: now,
  });

  try {
    await context.postRef.set(
      {
        creativeBrief: brief,
        creativeBriefUpdatedAt: now,
      },
      { merge: true }
    );
  } catch {
    throw makeError("FIRESTORE_UPDATE_FAILED");
  }

  const saved = await context.postRef.get();
  const savedBrief = saved.exists ? saved.data()?.creativeBrief : null;

  return res.status(200).json({
    ok: true,
    brief: responseBrief(savedBrief),
    resolution: { source: context.source },
  });
}

async function handleSaveOrApprove({ res, context, uid, submittedBrief, approve }) {
  let editable;
  try {
    editable = normalizeEditableUserInput(submittedBrief);
  } catch (error) {
    throw makeError("INVALID_BRIEF", error?.message);
  }

  const db = admin.firestore();
  let resultingBrief = null;

  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(context.postRef);
      const postData = snapshot.exists ? snapshot.data() || {} : {};
      const existingBrief = postData.creativeBrief;

      if (!existingBrief) throw makeError("BRIEF_NOT_FOUND");

      let normalizedExisting;
      try {
        normalizedExisting = normalizeStoredBrief(existingBrief);
      } catch {
        throw makeError("INVALID_BRIEF", "The saved creative brief is invalid. Regenerate it before continuing.");
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      resultingBrief = approve
        ? createApprovedData(editable, {
            generatedAt: normalizedExisting.generatedAt,
            updatedAt: now,
            approvedAt: now,
            approvedBy: uid,
          })
        : createDraftData(editable, {
            generatedAt: normalizedExisting.generatedAt,
            updatedAt: now,
          });

      transaction.set(
        context.postRef,
        {
          creativeBrief: resultingBrief,
          creativeBriefUpdatedAt: now,
        },
        { merge: true }
      );
    });
  } catch (error) {
    if (["BRIEF_NOT_FOUND", "INVALID_BRIEF"].includes(error?.code)) throw error;
    throw makeError("FIRESTORE_UPDATE_FAILED");
  }

  const saved = await context.postRef.get();
  const savedBrief = saved.exists ? saved.data()?.creativeBrief : resultingBrief;

  return res.status(200).json({
    ok: true,
    brief: responseBrief(savedBrief),
    resolution: { source: context.source },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "METHOD_NOT_ALLOWED");
  }

  try {
    const uid = await authenticate(req);
    const body = req.body || {};
    const action = safeString(body.action, 50);
    const websiteId = safeString(body.websiteId, 300);
    const postId = safeString(body.postId, 300);

    if (!ALLOWED_ACTIONS.has(action)) {
      return sendError(res, "INVALID_ACTION");
    }
    if (!websiteId) {
      return sendError(res, "WEBSITE_NOT_FOUND");
    }
    if (!postId) {
      return sendError(res, "POST_NOT_FOUND");
    }

    const db = admin.firestore();
    const context = await resolveRequestContext({ db, uid, websiteId, postId });

    if (action === "load") {
      return await handleLoad({ res, context });
    }
    if (action === "generate") {
      return await handleGenerate({ res, context, postId });
    }
    if (action === "save") {
      return await handleSaveOrApprove({
        res,
        context,
        uid,
        submittedBrief: body.brief,
        approve: false,
      });
    }
    return await handleSaveOrApprove({
      res,
      context,
      uid,
      submittedBrief: body.brief,
      approve: true,
    });
  } catch (error) {
    const code = ERROR_STATUS[error?.code] ? error.code : "INTERNAL_ERROR";
    if (code === "INTERNAL_ERROR") {
      console.error("generateCreativeBrief error:", error);
    }
    return sendError(res, code, error?.message && code !== "INTERNAL_ERROR" ? error.message : undefined);
  }
}
