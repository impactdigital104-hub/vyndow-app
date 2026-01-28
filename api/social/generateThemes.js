
// /api/social/generateThemes.js
// Phase 2 (Vyndow Social) — generate strategic content themes from Phase 1 Brand Profile

import admin from "../firebaseAdmin.js";


// Same auth pattern as /api/generate.js and /api/geo/ensure.js
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");

  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// Same website ownership/membership model as GEO/SEO
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
    const memberRef = admin
      .firestore()
      .doc(`users/${ownerUid}/websites/${websiteId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      const err = new Error("NO_ACCESS");
      err.code = "NO_ACCESS";
      throw err;
    }
  }

  return { ownerUid, websiteData };
}

function safeStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function buildPrompt({ platform, phase1 }) {
  const brandName = safeStr(phase1.brandName) || "(brand)";
  const industry = safeStr(phase1.industry) || "";
  const businessType = safeStr(phase1.businessType) || "";
  const geography = safeStr(phase1.geography) || "";

  const strategy = phase1.strategy || {};
  const voice = phase1.voiceSliders || {};
  const visual = phase1.visual || {};
  const guardrails = phase1.guardrails || {};

  return `You are a senior social strategy lead.

Task: Based on the brand profile below, create 6–8 strategic CONTENT THEMES (strategic narratives) for ${platform}.

Rules:
- Themes are strategic narratives, NOT post ideas.
- Each theme must include:
  1) title (short)
  2) what: what this theme is about (1–2 sentences)
  3) whyFit: why this fits the brand strategy (1–2 sentences)
  4) examples: 1–2 bullet examples (short phrases)
- Avoid forbidden topics/tones/visuals.
- Output STRICT JSON only (no markdown).

Return schema:
{
  "themes": [
    {
      "themeId": "${platform.toLowerCase()}-t1",
      "title": "...",
      "what": "...",
      "whyFit": "...",
      "examples": ["...", "..."]
    }
  ]
}

Brand Profile:
- brandName: ${brandName}
- websiteUrl: ${safeStr(phase1.websiteUrl)}
- industry: ${industry}
- businessType: ${businessType}
- geography: ${geography}

Strategy:
- primaryObjective: ${safeStr(strategy.primaryObjective)}
- secondaryObjective: ${safeStr(strategy.secondaryObjective)}
- riskAppetite: ${safeStr(strategy.riskAppetite)}

Voice sliders (0-100):
- formalConversational: ${voice.formalConversational ?? ""}
- boldConservative: ${voice.boldConservative ?? ""}
- educationalOpinionated: ${voice.educationalOpinionated ?? ""}
- founderBrand: ${voice.founderBrand ?? ""}
- aspirationalPractical: ${voice.aspirationalPractical ?? ""}
- authorityRelatable: ${voice.authorityRelatable ?? ""}

Visual direction:
- colors: ${(visual.colors || []).join(", ")}
- visualStyle: ${safeStr(visual.visualStyle)}
- typography: ${safeStr(visual.typography)}

Guardrails:
- topicsToAvoid: ${safeStr(guardrails.topicsToAvoid)}
- toneToAvoid: ${(guardrails.toneToAvoid || []).join(", ")}
- visualAvoid: ${(guardrails.visualAvoid || []).join(", ")}
`;
}

async function callOpenAI({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY env var.");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: "You produce concise, practical social strategy outputs. Return strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    const msg = data?.error?.message || "OpenAI request failed";
    throw new Error(msg);
  }

  const text = data?.choices?.[0]?.message?.content || "";
  return text;
}

function parseJsonStrict(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error("Failed to parse themes JSON.");
  }
}

function normalizeThemes(platform, raw) {
  const themes = Array.isArray(raw?.themes) ? raw.themes : [];
  const cleaned = themes
    .filter((t) => t && typeof t === "object")
    .map((t, idx) => {
      const themeId = safeStr(t.themeId) || `${platform.toLowerCase()}-t${idx + 1}`;
      const title = safeStr(t.title) || `Theme ${idx + 1}`;
      const what = safeStr(t.what);
      const whyFit = safeStr(t.whyFit);
      const examples = Array.isArray(t.examples)
        ? t.examples.map((x) => safeStr(x)).filter(Boolean).slice(0, 2)
        : [];
      return { themeId, title, what, whyFit, examples };
    })
    .filter((t) => t.title && t.what && t.whyFit);

  return cleaned.slice(0, 8);
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") return res.status(200).json({ ok: true });
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);
    const websiteId = req.body?.websiteId || "";
    if (!websiteId) return res.status(400).json({ ok: false, error: "Missing websiteId" });

    const { ownerUid } = await resolveWebsiteContext({ uid, websiteId });

    const db = admin.firestore();
    const socialRef = db.doc(`users/${ownerUid}/websites/${websiteId}/modules/social`);
    const socialSnap = await socialRef.get();
    const phase1 = socialSnap.exists ? socialSnap.data() || {} : {};

    if (!phase1?.phase1Completed) {
      return res.status(400).json({
        ok: false,
        error: "Complete Phase 1 to proceed.",
        code: "PHASE1_INCOMPLETE",
      });
    }

    const platformFocus = safeStr(phase1.platformFocus) || "";
    if (!platformFocus) {
      return res.status(400).json({
        ok: false,
        error: "Missing platformFocus in Phase 1.",
        code: "MISSING_PLATFORM_FOCUS",
      });
    }

    const wantLinkedIn = platformFocus === "linkedin" || platformFocus === "both";
    const wantInstagram = platformFocus === "instagram" || platformFocus === "both";

    const out = { linkedin: [], instagram: [] };

    if (wantLinkedIn) {
      const prompt = buildPrompt({ platform: "LinkedIn", phase1 });
      const text = await callOpenAI({ prompt });
      out.linkedin = normalizeThemes("linkedin", parseJsonStrict(text));
    }

    if (wantInstagram) {
      const prompt = buildPrompt({ platform: "Instagram", phase1 });
      const text = await callOpenAI({ prompt });
      out.instagram = normalizeThemes("instagram", parseJsonStrict(text));
    }

    return res.status(200).json({
      ok: true,
      websiteId,
      ownerUid,
      platformFocus,
      generated: {
        linkedin: out.linkedin,
        instagram: out.instagram,
      },
    });
  } catch (e) {
    console.error("Social generateThemes error:", e);
    return res.status(400).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
