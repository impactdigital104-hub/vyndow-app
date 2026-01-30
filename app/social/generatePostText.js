// api/social/generatePostText.js
// Phase 4 v1 — Step 4A Text-first generation (TEXT ONLY)

import admin from "../firebaseAdmin.js";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");

  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// Same website ownership/membership model used elsewhere
async function resolveWebsiteContext({ uid, websiteId }) {
  const db = admin.firestore();

  const userWebsiteRef = db.doc(`users/${uid}/websites/${websiteId}`);
  const userWebsiteSnap = await userWebsiteRef.get();

  if (!userWebsiteSnap.exists) {
    const err = new Error("Website not found for this user.");
    err.code = "WEBSITE_NOT_FOUND";
    throw err;
  }

  const websiteData = userWebsiteSnap.data() || {};
  const ownerUid = (websiteData.ownerUid || uid).trim();

  if (ownerUid !== uid) {
    const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      const err = new Error("NO_ACCESS");
      err.code = "NO_ACCESS";
      throw err;
    }
  }

  return { ownerUid };
}

function safeStr(v) {
  return typeof v === "string" ? v : "";
}

function toToneLabel(voiceSliders = {}) {
  const labels = [];
  if ((voiceSliders.formalConversational ?? 50) >= 65) labels.push("Formal");
  if ((voiceSliders.aspirationalPractical ?? 50) >= 65) labels.push("Aspirational");
  if ((voiceSliders.authorityRelatable ?? 50) >= 65) labels.push("Relatable");
  return labels.length ? labels.join(" · ") : "Neutral";
}

function toRiskLabel(guardrails = {}) {
  const hasToneAvoid = Array.isArray(guardrails.toneToAvoid) && guardrails.toneToAvoid.length > 0;
  const hasTopicsAvoid = typeof guardrails.topicsToAvoid === "string" && guardrails.topicsToAvoid.trim().length > 0;
  const hasVisualAvoid = Array.isArray(guardrails.visualAvoid) && guardrails.visualAvoid.length > 0;

  let risk = "Low";
  if (hasToneAvoid && hasTopicsAvoid) risk = "Medium";
  if (hasToneAvoid && hasTopicsAvoid && hasVisualAvoid) risk = "High";
  return risk;
}

async function callOpenAI({ prompt, apiKey }) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "You write high-quality, platform-native social media copy for professionals. You must follow the user's constraints exactly. Output must be valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`OpenAI error: ${resp.status} ${text}`);
    err.code = "OPENAI_ERROR";
    throw err;
  }

  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return content;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "OPENAI_API_KEY is missing." });
      return;
    }

    const uid = await getUidFromRequest(req);

    const { websiteId, post } = req.body || {};
    if (!websiteId) {
      res.status(400).json({ error: "Missing websiteId" });
      return;
    }
    if (!post || !post.platform || !post.intent || !post.format) {
      res.status(400).json({ error: "Missing post (platform, intent, format required)" });
      return;
    }

    const { ownerUid } = await resolveWebsiteContext({ uid, websiteId });

    const db = admin.firestore();
    const socialRef = db.doc(`users/${ownerUid}/websites/${websiteId}/modules/social`);
    const snap = await socialRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: "Social module not found" });
      return;
    }

    const social = snap.data() || {};

    // Must be Phase 3 locked (calendar exists and is completed)
    if (!social?.phase3?.phase3Completed) {
      res.status(400).json({ error: "Phase 3 is not completed/locked yet." });
      return;
    }

    // Phase 1 identity inputs (must be respected; text uses voice/guardrails)
    const brandName = safeStr(social.brandName) || "Brand";
    const businessType = safeStr(social.businessType) || "";
    const industry = safeStr(social.industry) || "";
    const geography = safeStr(social.geography) || "";

    const voiceSliders = social.voiceSliders || {};
    const guardrails = social.guardrails || {};

    const toneLabel = toToneLabel(voiceSliders);
    const riskLabel = toRiskLabel(guardrails);

    const toneToAvoid = Array.isArray(guardrails.toneToAvoid) ? guardrails.toneToAvoid : [];
    const topicsToAvoid = safeStr(guardrails.topicsToAvoid);
    const visualAvoid = Array.isArray(guardrails.visualAvoid) ? guardrails.visualAvoid : [];

    const platform = safeStr(post.platform);
    const intent = safeStr(post.intent);
    const format = safeStr(post.format);
    const themeTitle = safeStr(post.themeTitle || "");
    const date = safeStr(post.date || "");

    // JSON-only contract (4 sections required by baton pass)
    const prompt = `
You are generating TEXT ONLY for one social media post.

Brand: ${brandName}
Business type: ${businessType}
Industry: ${industry}
Geography: ${geography}

Post:
- Platform: ${platform}
- Intent: ${intent}
- Format: ${format}
- Theme: ${themeTitle}
- Date: ${date}

Tone (read-only, derived): ${toneLabel}
Risk level (read-only, derived): ${riskLabel}

Guardrails:
- Tones to avoid: ${toneToAvoid.length ? toneToAvoid.join(", ") : "None specified"}
- Topics to avoid: ${topicsToAvoid || "None specified"}
- Visual avoid list (for awareness only; DO NOT mention visuals in output): ${visualAvoid.length ? visualAvoid.join(", ") : "None specified"}

STRICT REQUIREMENTS:
- Generate TEXT ONLY. Do NOT include any image directions or generation.
- Output MUST be valid JSON only (no markdown, no backticks).
- Must contain exactly these keys:
  visualHeadline (string, mandatory)
  visualSubHeadline (string or null)
  caption (string, platform-native for ${platform})
  cta (string: explicit CTA OR "None required")
  hashtags (array of strings, platform-appropriate, contextual, not generic)

HASHTAG RULES:
- LinkedIn: 3–6 hashtags max
- Instagram: 8–15 hashtags max
- No generic hashtags like #love #instagood #viral

CAPTION RULES:
- ${platform} native voice
- Based on intent "${intent}" and theme "${themeTitle}"
- Avoid the tones/topics in guardrails

Return only JSON.
`.trim();

    const raw = await callOpenAI({ prompt, apiKey });

    // Parse JSON safely
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // If model returns extra text, fail clearly (no guessing)
      res.status(500).json({
        error: "MODEL_OUTPUT_NOT_JSON",
        raw,
      });
      return;
    }

    // Minimal validation
    const out = {
      visualHeadline: safeStr(parsed.visualHeadline),
      visualSubHeadline: parsed.visualSubHeadline === null ? null : safeStr(parsed.visualSubHeadline),
      caption: safeStr(parsed.caption),
      cta: safeStr(parsed.cta),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h) => safeStr(h)).filter(Boolean) : [],
    };

    if (!out.visualHeadline || !out.caption) {
      res.status(500).json({ error: "MODEL_OUTPUT_MISSING_FIELDS", raw, parsed: out });
      return;
    }

    res.status(200).json({ ok: true, text: out });
  } catch (e) {
    console.error("generatePostText error:", e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
}
