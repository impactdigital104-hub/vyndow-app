import crypto from "node:crypto";
import admin from "../firebaseAdmin.js";
import { resolveSocialDocument } from "./socialDocumentResolver.js";

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
      quality: "medium",
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

    const visualHeadline = (post.visualHeadline || "").trim();
    const visualSubHeadline = (post.visualSubHeadline || "").trim();
    const cta = (post.cta || "").trim();

    const social = resolved.socialData;
    const visual = social.visual || {};

    const colors = Array.isArray(visual.colors) ? visual.colors : [];
    const visualStyle = visual.visualStyle || "photorealistic";
    const typography = visual.typography || "";
    const logoUrl = visual.logoUrl || "";

    const basePrompt = `
Create a clean, premium, social-feed marketing visual for a brand.

Brand Inputs:
- Colors (use as accents; do not overload): ${colors.join(", ") || "not provided"}
- Typography (style inspiration only): ${typography || "not provided"}
- Visual Style (style inspiration only): ${visualStyle || "not provided"}
- Logo URL (if present; optional placement): ${logoUrl || "not provided"}

ON-IMAGE TEXT (USE EXACTLY; do NOT rewrite; do NOT add any other words):
1) Headline (required): ${visualHeadline}
2) Sub-headline (optional; MAX one line): ${visualSubHeadline || "(none)"}
3) Button text (required; short): ${cta || "(none)"}

STRICT RULES (non-negotiable):
- The image must contain ONLY the headline, optional sub-headline, and the button text. Nothing else.
- Do NOT print any labels like: "CTA", "Caption", "Hashtags", "Headline", "Sub-headline".
- Do NOT include caption text. Do NOT include hashtags. Do NOT include any extra copy, explanations, bullets, fine print, or paragraphs.
- Do NOT generate placeholder/lorem ipsum or tiny decorative text blocks.
- Do NOT add charts, tables, poll UI, bars, checkboxes, icons with text, or infographic elements.
- Do NOT rewrite, improve, paraphrase, or add words. Use the provided text exactly as-is.

LAYOUT RESTRAINT:
- Minimal text overall. Strong hierarchy: Headline (largest) → Sub-headline (small, one line) → Button text (smallest).
- Button text must be visible but NOT dominant. Render as a small button, tag, or footer strip.
- Clean layout with whitespace. Avoid clutter.
- Do NOT create a poster, flyer, infographic, or dense text layout.
- Social-feed appropriate, modern, brand-appropriate design.
`.trim();

    if (mode === "static") {
      const imageBuffer = await callOpenAIImage({
        prompt: `${basePrompt}\n\nOutput: ONE static square image (1:1).`,
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
      const slidePrompt = `${basePrompt}

Carousel Rules:
- This is slide ${i} of ${slideCount}.
- Maintain consistent style across all slides.
- Use the same locked headline/sub-headline text (no rewriting).
- Slide ${i} should feel like part of a cohesive carousel set.
Output: ONE square image (1:1) for this slide.`;

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
