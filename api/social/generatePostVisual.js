import OpenAI from "openai";
import admin from "../firebaseAdmin";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function getBearerToken(req) {
  const h = req.headers?.authorization || "";
  if (!h.startsWith("Bearer ")) return "";
  return h.slice("Bearer ".length).trim();
}

function asDataUrlPng(base64) {
  return `data:image/png;base64,${base64}`;
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

    // Phase 4 post doc (must already contain locked copy)
    const postRef = db
      .collection("users")
      .doc(uid)
      .collection("websites")
      .doc(websiteId)
      .collection("modules")
      .doc("social")
      .collection("phase4Posts")
      .doc(postId);

    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      return res.status(404).json({ ok: false, error: "Post draft not found" });
    }

    const post = postSnap.data() || {};
    if (!post.copyLocked) {
      return res.status(400).json({ ok: false, error: "Copy is not locked" });
    }

    // Locked copy fields ONLY
    const visualHeadline = (post.visualHeadline || "").trim();
    const visualSubHeadline = (post.visualSubHeadline || "").trim();
    const caption = (post.caption || "").trim();
    const cta = (post.cta || "").trim();
    const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];

    if (!visualHeadline) {
      return res.status(400).json({ ok: false, error: "Locked headline missing" });
    }

    // Phase 1 brand inputs (read-only)
    const socialRef = db
      .collection("users")
      .doc(uid)
      .collection("websites")
      .doc(websiteId)
      .collection("modules")
      .doc("social");

    const socialSnap = await socialRef.get();
    const social = socialSnap.exists ? socialSnap.data() || {} : {};

    const colors = Array.isArray(social.colors) ? social.colors : [];
    const typography = social.typography || "";
    const visualStyle = social.visualStyle || "";
    const logoUrl = social.logoUrl || "";

    // Prompt (no text regeneration; only visual composition)
    const basePrompt = `
Create high-quality social media marketing visuals for a brand.

Brand Inputs:
- Colors: ${colors.join(", ") || "not provided"}
- Typography: ${typography || "not provided"}
- Visual Style: ${visualStyle || "not provided"}
- Logo URL (if present): ${logoUrl || "not provided"}

Locked Copy (MUST be used exactly; do NOT rewrite):
- Visual headline: ${visualHeadline}
- Visual sub-headline: ${visualSubHeadline || "(none)"}
- Caption: ${caption || "(none)"}
- CTA: ${cta || "(none)"}
- Hashtags: ${(hashtags || []).join(" ") || "(none)"}

Rules:
- Do NOT rewrite or improve any text.
- Use the headline (and sub-headline if present) as the on-image text.
- Keep layout clean with strong hierarchy and good readability.
- Produce a polished, agency-quality design.
`.trim();

    if (mode === "static") {
      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: basePrompt + "\n\nOutput: ONE static square image (1:1).",
        size: "1024x1024",
      });

      const b64 = img?.data?.[0]?.b64_json;
      if (!b64) {
        return res.status(500).json({ ok: false, error: "No image returned" });
      }

      const url = asDataUrlPng(b64);

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

    // carousel mode: 4 slides (within your 3–5 rule)
    const slideCount = 4;
    const urls = [];

    for (let i = 1; i <= slideCount; i++) {
      const slidePrompt =
        basePrompt +
        `

Carousel Rules:
- This is slide ${i} of ${slideCount}.
- Maintain consistent style across all slides.
- Use the same locked headline/sub-headline text (no rewriting).
- Slide ${i} should feel like part of a cohesive carousel set.
Output: ONE square image (1:1) for this slide.`;

      const img = await openai.images.generate({
        model: "gpt-image-1",
        prompt: slidePrompt,
        size: "1024x1024",
      });

      const b64 = img?.data?.[0]?.b64_json;
      if (!b64) {
        return res.status(500).json({ ok: false, error: `No image returned for slide ${i}` });
      }

      urls.push(asDataUrlPng(b64));
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
