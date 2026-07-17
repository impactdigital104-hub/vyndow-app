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

function buildAvoidInstructions(avoid) {
  const savedAvoid = avoid.map((item) => item.trim()).filter(Boolean);
  const universalAvoid = [
    "generic stock-photo composition",
    "generic hands typing on a laptop unless explicitly required by the brief",
    "anonymous office worker replacing the specified subject",
    "unrelated laptops, charts, dashboards, or screens",
    "fake interface text, invented statistics, meaningless graphs, or filler labels",
    "clipart, illustration, vector art, cartoon styling, or a 3D-render look",
    "duplicate people, distorted anatomy, malformed hands, or unnatural facial features",
    "fake logos, invented wordmarks, watermark-style marks, or random brand symbols",
    "dense flyer-like clutter, weak hierarchy, or synthetic AI-stock aesthetics",
  ];

  return [...savedAvoid, ...universalAvoid]
    .map((item) => `- ${item}`)
    .join("\n");
}

function buildBasePrompt({
  creativeBrief,
  visualHeadline,
  visualSubHeadline,
  cta,
  colors,
  typography,
  visualStyle,
}) {
  const subHeadline = visualSubHeadline || "(none)";
  const buttonText = cta || "(none)";

  return `
MISSION
Create a premium, agency-quality square LinkedIn campaign visual. Think and compose like a senior advertising art director, not like a template engine. The final image must feel intentionally designed, visually persuasive, polished, and worthy of a paid B2B campaign.

The approved Creative Brief is the creative authority. Interpret it intelligently and faithfully while choosing the strongest possible editorial composition, visual hierarchy, typography, pacing, and use of space.

APPROVED CREATIVE BRIEF
Visual concept: ${creativeBrief.visualConcept}
Subject: ${creativeBrief.subject}
Environment: ${creativeBrief.environment}
Mood: ${creativeBrief.mood}
Lighting: ${creativeBrief.lighting}
Composition: ${creativeBrief.composition}
Negative space: ${creativeBrief.negativeSpace}
Uniqueness: ${creativeBrief.uniquenessNotes}

ON-IMAGE COPY — USE THESE WORDS EXACTLY
Headline: ${visualHeadline}
Sub-headline: ${subHeadline}
CTA: ${buttonText}

CREATIVE DIRECTION

Use the approved Creative Brief below as the sole creative authority.

Create the strongest possible premium LinkedIn campaign visual while remaining completely faithful to that brief.

Use your own professional creative judgement.

Do not invent campaign messages.
Do not invent logos.
Do not add any text other than the supplied Headline, Sub-headline and CTA.

SUPPORTING BRAND STYLE
Brand colors as restrained accents: ${colors.join(", ") || "not provided"}
Typography direction: ${typography || "modern premium sans-serif"}
Visual style: ${visualStyle || "photorealistic"}

AVOID
${buildAvoidInstructions(creativeBrief.avoid)}

FINAL STANDARD
Produce one cohesive 1:1 campaign creative, not a generic poster and not a stock photograph with text pasted on top. Use only the supplied headline, sub-headline when present, and CTA when present. No captions, hashtags, labels, fine print, filler copy, lorem ipsum, invented statistics, or fake UI text.
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
      model: "gpt-image-1",
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

    const basePrompt = buildBasePrompt({
      creativeBrief,
      visualHeadline,
      visualSubHeadline,
      cta,
      colors,
      typography,
      visualStyle,
    });

    if (mode === "static") {
      const imageBuffer = await callOpenAIImage({
        prompt: `${basePrompt}\n\nSTATIC EXECUTION\nCreate one hero execution using the complete approved Creative Brief.`,
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
      const slidePrompt = `${basePrompt}

CAROUSEL EXECUTION
- This is slide ${i} of ${slideCount}.
- Visual role for this slide: ${role}
- Use the same subject, environment, creative world, mood, lighting, brand language, and overall art direction across all four slides.
- Create a controlled perspective or framing variation appropriate to this slide's role, not an unrelated concept.
- Keep the reserved upper-right logo area consistent.
- Use only the existing locked on-image text exactly as specified above; do not invent campaign claims or additional words.
- The four images must read as one cohesive campaign, not four unrelated stock images.

Output one square 1:1 image for this slide.`;

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
