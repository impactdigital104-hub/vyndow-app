import crypto from "node:crypto";
import admin from "../firebaseAdmin.js";
import { resolveSocialDocument } from "./socialDocumentResolver.js";

const REQUIRED_VISUAL_BRIEF_FIELDS = Object.freeze([
  "visualConcept",
  "subject",
  "environment",
  "mood",
  "lighting",
  "composition",
  "negativeSpace",
  "uniquenessNotes",
]);

const CAROUSEL_ROLES = Object.freeze([
  "Hero/cover execution of the main visual concept.",
  "Closer or alternate perspective on the same subject and environment.",
  "Supporting detail or contextual visual from the same creative world.",
  "Concluding campaign-style frame using the same art direction.",
]);

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  if (!h.startsWith("Bearer ")) return "";
  return h.slice("Bearer ".length).trim();
}

function getStorageBucketName() {
  if (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) {
    return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  }

  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!raw) throw new Error("Missing Firebase Storage bucket configuration");

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    serviceAccount = JSON.parse(raw.replace(/\\n/g, "\n"));
  }

  if (!serviceAccount?.project_id) {
    throw new Error("Unable to determine Firebase project ID for Storage");
  }

  return `${serviceAccount.project_id}.appspot.com`;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateApprovedCreativeBrief(brief) {
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    return { ok: false, code: "BRIEF_NOT_FOUND" };
  }

  if (brief.status !== "approved") {
    return { ok: false, code: "BRIEF_NOT_APPROVED" };
  }

  const requiredFieldsValid = REQUIRED_VISUAL_BRIEF_FIELDS.every((field) =>
    isNonEmptyString(brief[field])
  );

  const avoidValid =
    Array.isArray(brief.avoid) &&
    brief.avoid.every((item) => typeof item === "string" && item.trim().length > 0);

  const canvasValid =
    brief.canvas &&
    typeof brief.canvas === "object" &&
    !Array.isArray(brief.canvas) &&
    brief.canvas.width === 1080 &&
    brief.canvas.height === 1080 &&
    brief.canvas.aspectRatio === "1:1";

  if (!requiredFieldsValid || !avoidValid || !canvasValid) {
    return { ok: false, code: "INVALID_BRIEF" };
  }

  return { ok: true };
}

function creativeBriefErrorResponse(res, validation) {
  if (validation.code === "BRIEF_NOT_FOUND") {
    return res.status(400).json({
      ok: false,
      error: "Generate and approve the Creative Brief before creating visuals.",
      code: "BRIEF_NOT_FOUND",
    });
  }

  if (validation.code === "BRIEF_NOT_APPROVED") {
    return res.status(400).json({
      ok: false,
      error: "Approve the Creative Brief before creating visuals.",
      code: "BRIEF_NOT_APPROVED",
    });
  }

  return res.status(400).json({
    ok: false,
    error: "The approved Creative Brief is incomplete. Edit and approve it again.",
    code: "INVALID_BRIEF",
  });
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function extractResponseText(payload) {
  if (isNonEmptyString(payload?.output_text)) {
    return payload.output_text.trim();
  }

  const chunks = [];
  const output = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (isNonEmptyString(part?.text)) chunks.push(part.text.trim());
      if (isNonEmptyString(part?.output_text)) chunks.push(part.output_text.trim());
    }
  }

  return chunks.join("\n").trim();
}

function validateCreativeDirection(direction) {
  if (!direction || typeof direction !== "object" || Array.isArray(direction)) {
    return false;
  }

  const required = [
    "creativeVision",
    "visualStory",
    "subjectDirection",
    "environmentDirection",
    "compositionDirection",
    "cameraAndLighting",
    "typographyDirection",
    "negativeSpaceDirection",
    "staticExecution",
  ];

  if (!required.every((field) => isNonEmptyString(direction[field]))) {
    return false;
  }

  if (
    !Array.isArray(direction.qualityGuardrails) ||
    direction.qualityGuardrails.length === 0 ||
    !direction.qualityGuardrails.every(isNonEmptyString)
  ) {
    return false;
  }

  if (
    !Array.isArray(direction.carouselExecutions) ||
    direction.carouselExecutions.length !== 4 ||
    !direction.carouselExecutions.every(isNonEmptyString)
  ) {
    return false;
  }

  return true;
}

function buildCreativeDirectorInput({
  creativeBrief,
  visualHeadline,
  visualSubHeadline,
  cta,
  colors,
  typography,
  visualStyle,
}) {
  return `
Create the art direction for one premium square LinkedIn marketing campaign.

APPROVED STRATEGIC BRIEF
Marketing angle: ${creativeBrief.marketingAngle || ""}
Audience insight: ${creativeBrief.audienceInsight || ""}
Core message: ${creativeBrief.coreMessage || ""}
Campaign objective: ${creativeBrief.campaignObjective || ""}
Funnel stage: ${creativeBrief.funnelStage || ""}

APPROVED VISUAL BRIEF
Visual concept: ${creativeBrief.visualConcept}
Subject: ${creativeBrief.subject}
Environment: ${creativeBrief.environment}
Mood: ${creativeBrief.mood}
Lighting: ${creativeBrief.lighting}
Composition: ${creativeBrief.composition}
Negative space: ${creativeBrief.negativeSpace}
Headline direction: ${creativeBrief.headlineDirection || ""}
CTA direction: ${creativeBrief.ctaDirection || ""}
Uniqueness notes: ${creativeBrief.uniquenessNotes}
Avoid: ${(creativeBrief.avoid || []).join(" | ") || "none supplied"}

LOCKED ON-IMAGE COPY
Headline: ${visualHeadline}
Sub-headline: ${visualSubHeadline || "(none)"}
CTA: ${cta || "(none)"}

SUPPORTING BRAND INPUTS
Colors: ${colors.join(", ") || "not supplied"}
Typography: ${typography || "not supplied"}
Visual style: ${visualStyle || "photorealistic"}

The approved brief and locked copy are fixed. Develop the strongest visual execution without changing their meaning or wording. Do not invent a logo, statistics, labels, campaign claims, or additional copy.
`.trim();
}

async function callCreativeDirector({
  creativeBrief,
  visualHeadline,
  visualSubHeadline,
  cta,
  colors,
  typography,
  visualStyle,
  apiKey,
}) {
  if (!apiKey) {
    const err = new Error("Missing OPENAI_API_KEY");
    err.code = "OPENAI_KEY_MISSING";
    throw err;
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "creativeVision",
      "visualStory",
      "subjectDirection",
      "environmentDirection",
      "compositionDirection",
      "cameraAndLighting",
      "typographyDirection",
      "negativeSpaceDirection",
      "qualityGuardrails",
      "staticExecution",
      "carouselExecutions",
    ],
    properties: {
      creativeVision: { type: "string" },
      visualStory: { type: "string" },
      subjectDirection: { type: "string" },
      environmentDirection: { type: "string" },
      compositionDirection: { type: "string" },
      cameraAndLighting: { type: "string" },
      typographyDirection: { type: "string" },
      negativeSpaceDirection: { type: "string" },
      qualityGuardrails: {
        type: "array",
        minItems: 3,
        maxItems: 10,
        items: { type: "string" },
      },
      staticExecution: { type: "string" },
      carouselExecutions: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: { type: "string" },
      },
    },
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_CREATIVE_DIRECTOR_MODEL || "gpt-5.6",
      instructions:
        "You are an elite executive creative director and advertising art director. Convert an approved marketing and visual brief into precise, original, production-ready art direction for a world-class commercial image model. Think strategically and visually. Preserve all supplied demographic descriptors, brand intent, and exact locked copy. Avoid generic stock-photo solutions. Return only the requested structured JSON.",
      input: buildCreativeDirectorInput({
        creativeBrief,
        visualHeadline,
        visualSubHeadline,
        cta,
        colors,
        typography,
        visualStyle,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "visual_creative_direction",
          strict: true,
          schema,
        },
      },
    }),
  });

  if (!resp.ok) {
    console.error("Creative director provider error", { status: resp.status });
    const err = new Error("Creative direction generation failed");
    err.code = "CREATIVE_DIRECTOR_ERROR";
    throw err;
  }

  const payload = await resp.json();
  const rawText = extractResponseText(payload);
  let direction;

  try {
    direction = JSON.parse(rawText);
  } catch {
    const err = new Error("Creative direction was not valid JSON");
    err.code = "CREATIVE_DIRECTOR_INVALID";
    throw err;
  }

  if (!validateCreativeDirection(direction)) {
    const err = new Error("Creative direction was incomplete");
    err.code = "CREATIVE_DIRECTOR_INVALID";
    throw err;
  }

  return {
    creativeVision: cleanString(direction.creativeVision),
    visualStory: cleanString(direction.visualStory),
    subjectDirection: cleanString(direction.subjectDirection),
    environmentDirection: cleanString(direction.environmentDirection),
    compositionDirection: cleanString(direction.compositionDirection),
    cameraAndLighting: cleanString(direction.cameraAndLighting),
    typographyDirection: cleanString(direction.typographyDirection),
    negativeSpaceDirection: cleanString(direction.negativeSpaceDirection),
    qualityGuardrails: direction.qualityGuardrails.map(cleanString).filter(Boolean),
    staticExecution: cleanString(direction.staticExecution),
    carouselExecutions: direction.carouselExecutions.map(cleanString),
  };
}

function buildImagePrompt({
  creativeBrief,
  creativeDirection,
  visualHeadline,
  visualSubHeadline,
  cta,
  colors,
  typography,
  visualStyle,
  executionDirection,
  modeLabel,
}) {
  return `
Create one premium, agency-quality square LinkedIn campaign creative.

APPROVED CREATIVE BRIEF — FIXED
Visual concept: ${creativeBrief.visualConcept}
Subject: ${creativeBrief.subject}
Environment: ${creativeBrief.environment}
Mood: ${creativeBrief.mood}
Lighting: ${creativeBrief.lighting}
Composition: ${creativeBrief.composition}
Negative space: ${creativeBrief.negativeSpace}
Uniqueness: ${creativeBrief.uniquenessNotes}

EXECUTIVE CREATIVE DIRECTION
Creative vision: ${creativeDirection.creativeVision}
Visual story: ${creativeDirection.visualStory}
Subject direction: ${creativeDirection.subjectDirection}
Environment direction: ${creativeDirection.environmentDirection}
Composition: ${creativeDirection.compositionDirection}
Camera and lighting: ${creativeDirection.cameraAndLighting}
Typography and hierarchy: ${creativeDirection.typographyDirection}
Negative space: ${creativeDirection.negativeSpaceDirection}
${modeLabel} execution: ${executionDirection}

LOCKED ON-IMAGE COPY — USE EXACTLY
Headline: ${visualHeadline}
Sub-headline: ${visualSubHeadline || "(none)"}
CTA: ${cta || "(none)"}

SUPPORTING BRAND STYLE
Colors: ${colors.join(", ") || "not supplied"}
Typography: ${typography || "modern premium sans-serif"}
Visual style: ${visualStyle || "photorealistic"}

QUALITY GUARDRAILS
${creativeDirection.qualityGuardrails.map((item) => `- ${item}`).join("\n")}
${(creativeBrief.avoid || []).map((item) => `- Avoid: ${item}`).join("\n")}
- Photorealistic premium commercial campaign quality.
- Preserve every specific subject and demographic descriptor.
- Do not replace the specified subject or environment with generic stock-office imagery.
- Do not add any words beyond the supplied headline, sub-headline, and CTA.
- Do not invent statistics, dashboard labels, interface copy, logos, wordmarks, symbols, or watermarks.
- Do not create, imitate, redraw, approximate, or spell a brand logo.
- Keep the upper-right logo area genuinely quiet and free of text, faces, interface elements, and bright focal details.
- No illustration, vector art, cartoon, 3D-render look, malformed anatomy, duplicate people, or synthetic stock-photo appearance.

Use professional visual judgement. The result must feel designed as one cohesive campaign creative, not like a stock photograph with text placed over it.
`.trim();
}

async function uploadGeneratedImage({ imageBuffer, websiteId, postId, mode, slideNumber }) {
  const bucketName = getStorageBucketName();
  const bucket = admin.storage().bucket(bucketName);
  const token = crypto.randomUUID();
  const suffix = slideNumber ? `-slide-${slideNumber}` : "";
  const filePath = `social/${websiteId}/phase4/${postId}/${mode}${suffix}-${Date.now()}.png`;
  const file = bucket.file(filePath);

  await file.save(imageBuffer, {
    resumable: false,
    contentType: "image/png",
    metadata: {
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
}

async function callOpenAIImage({ prompt, apiKey }) {
  if (!apiKey) {
    const err = new Error("Missing OPENAI_API_KEY");
    err.code = "OPENAI_KEY_MISSING";
    throw err;
  }

  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      size: "1024x1024",
      quality: "high",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`OpenAI error: ${resp.status} ${text}`);
    err.code = "OPENAI_ERROR";
    throw err;
  }

  const data = await resp.json();
  const first = data?.data?.[0] || {};
  const base64Image = first?.b64_json;

  if (!base64Image) {
    const err = new Error("OpenAI returned no base64 image data");
    err.code = "OPENAI_NO_IMAGE";
    throw err;
  }

  return Buffer.from(base64Image, "base64");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing auth token" });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded?.uid;
    if (!uid) {
      return res.status(401).json({ ok: false, error: "Invalid auth token" });
    }

    const { mode, postId, websiteId } = req.body || {};
    if (!websiteId || !postId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId or postId" });
    }

    if (mode !== "static" && mode !== "carousel") {
      return res.status(400).json({ ok: false, error: "Invalid mode" });
    }

    const db = admin.firestore();
    const candidateChecks = new Map();
    let resolved;

    try {
      resolved = await resolveSocialDocument({
        db,
        uid,
        websiteId,
        requiredData: async (socialData, context) => {
          const socialValid = socialData?.phase1Completed === true;
          const postRef = context.socialRef.collection("phase4Posts").doc(postId);

          if (!socialValid) {
            candidateChecks.set(context.resolvedUid, {
              socialValid: false,
              postRef,
              postSnap: null,
              postExists: false,
              copyLocked: false,
              headlinePresent: false,
            });
            return false;
          }

          const postSnap = await postRef.get();
          const postData = postSnap.exists ? postSnap.data() || {} : {};
          const copyLocked = postData.copyLocked === true;
          const headlinePresent =
            typeof postData.visualHeadline === "string" &&
            postData.visualHeadline.trim().length > 0;

          candidateChecks.set(context.resolvedUid, {
            socialValid: true,
            postRef,
            postSnap,
            postExists: postSnap.exists,
            copyLocked,
            headlinePresent,
          });

          return postSnap.exists && copyLocked && headlinePresent;
        },
      });
    } catch (e) {
      if (e?.code === "WEBSITE_NOT_FOUND") {
        return res.status(404).json({ ok: false, error: "Website not found" });
      }
      if (e?.code === "NO_ACCESS") {
        return res.status(403).json({ ok: false, error: "Access denied" });
      }
      if (e?.code === "SOCIAL_NOT_FOUND" || e?.code === "REQUIRED_SOCIAL_DATA_MISSING") {
        const checks = Array.from(candidateChecks.values());
        const anyPost = checks.some((check) => check.postExists);
        const anyLockedPost = checks.some((check) => check.postExists && check.copyLocked);
        const anyValidSocial = checks.some((check) => check.socialValid);

        if (!anyValidSocial) {
          return res.status(400).json({ ok: false, error: "Complete Phase 1 to proceed" });
        }
        if (!anyPost) {
          return res.status(404).json({ ok: false, error: "Post draft not found" });
        }
        if (!anyLockedPost) {
          return res.status(400).json({ ok: false, error: "Copy is not locked" });
        }
        return res.status(400).json({ ok: false, error: "Locked headline missing" });
      }
      throw e;
    }

    const selectedCheck = candidateChecks.get(resolved.resolvedUid);
    const postRef =
      selectedCheck?.postRef || resolved.socialRef.collection("phase4Posts").doc(postId);
    const postSnap = selectedCheck?.postSnap || (await postRef.get());
    const post = postSnap.data() || {};

    const briefValidation = validateApprovedCreativeBrief(post.creativeBrief);
    if (!briefValidation.ok) {
      return creativeBriefErrorResponse(res, briefValidation);
    }

    const creativeBrief = post.creativeBrief;
    const visualHeadline = (post.visualHeadline || "").trim();
    const visualSubHeadline = (post.visualSubHeadline || "").trim();
    const cta = (post.cta || "").trim();

    const social = resolved.socialData;
    const visual = social.visual || {};

    const colors = Array.isArray(visual.colors)
      ? visual.colors.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
      : [];
    const visualStyle = isNonEmptyString(visual.visualStyle)
      ? visual.visualStyle.trim()
      : "photorealistic";
    const typography = isNonEmptyString(visual.typography) ? visual.typography.trim() : "";

    const creativeDirection = await callCreativeDirector({
      creativeBrief,
      visualHeadline,
      visualSubHeadline,
      cta,
      colors,
      typography,
      visualStyle,
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (mode === "static") {
      const imageBuffer = await callOpenAIImage({
        prompt: buildImagePrompt({
          creativeBrief,
          creativeDirection,
          visualHeadline,
          visualSubHeadline,
          cta,
          colors,
          typography,
          visualStyle,
          executionDirection: creativeDirection.staticExecution,
          modeLabel: "Static hero",
        }),
        apiKey: process.env.OPENAI_API_KEY,
      });

      const url = await uploadGeneratedImage({
        imageBuffer,
        websiteId,
        postId,
        mode: "static",
      });

      await postRef.set(
        {
          staticImageUrl: url,
          visualModeLast: "static",
          visualUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.status(200).json({ ok: true, url });
    }

    const slideCount = 4;
    const urls = [];

    for (let i = 1; i <= slideCount; i++) {
      const role = CAROUSEL_ROLES[i - 1];
      const slidePrompt = buildImagePrompt({
        creativeBrief,
        creativeDirection,
        visualHeadline,
        visualSubHeadline,
        cta,
        colors,
        typography,
        visualStyle,
        executionDirection: `${role} ${creativeDirection.carouselExecutions[i - 1]}`,
        modeLabel: `Carousel slide ${i} of ${slideCount}`,
      });

      const imageBuffer = await callOpenAIImage({
        prompt: slidePrompt,
        apiKey: process.env.OPENAI_API_KEY,
      });

      const url = await uploadGeneratedImage({
        imageBuffer,
        websiteId,
        postId,
        mode: "carousel",
        slideNumber: i,
      });

      urls.push(url);
    }

    await postRef.set(
      {
        carouselImageUrls: urls,
        visualModeLast: "carousel",
        visualUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, urls });
  } catch (e) {
    console.error("generatePostVisual error:", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
