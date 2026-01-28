
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
 const ownerUid = safeStr(websiteData.ownerUid) || uid;



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
// --- Phase 2 calibration helpers: domain inference from homepage ---
// Safe timeout fetch for homepage HTML. Never break generation if this fails.
async function fetchHomepageHtml(url, timeoutMs = 4500) {
  if (!url) return "";
  let u = url.trim();
  if (!u) return "";

  // Ensure protocol
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(u, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "VyndowBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!resp.ok) return "";
    const html = await resp.text();
    return typeof html === "string" ? html : "";
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

function stripTags(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHomepageSignals(html = "") {
  if (!html) {
    return { title: "", meta: "", h: [], nav: [], keywords: [] };
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]).slice(0, 140) : "";

  const metaMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const meta = metaMatch ? stripTags(metaMatch[1]).slice(0, 220) : "";

  // H1/H2 extraction (lightweight)
  const h = [];
  const hMatches = html.matchAll(/<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const m of hMatches) {
    const txt = stripTags(m[2]);
    if (txt && txt.length >= 3) h.push(txt.slice(0, 140));
    if (h.length >= 10) break;
  }

  // Nav labels (best-effort: <nav>...</nav> + anchor text)
  const nav = [];
  const navBlockMatch = html.match(/<nav[\s\S]*?<\/nav>/i);
  const navHtml = navBlockMatch ? navBlockMatch[0] : "";
  if (navHtml) {
    const aMatches = navHtml.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi);
    for (const m of aMatches) {
      const txt = stripTags(m[1]);
      if (txt && txt.length >= 2 && txt.length <= 40) nav.push(txt);
      if (nav.length >= 12) break;
    }
  }

  // Keyword-ish extraction from visible text (very rough frequency)
  const text = stripTags(html).toLowerCase();

  const STOP = new Set([
    "the","and","for","with","from","your","you","our","are","was","were","this","that",
    "into","over","under","more","less","have","has","had","will","can","may","how",
    "what","why","who","when","where","all","any","each","their","they","them",
    "about","home","contact","pricing","login","sign","up","in","on","at","to","of",
    "a","an","is","it","as","by","or","be","we","us","i"
  ]);

  const words = text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && w.length <= 22 && !STOP.has(w));

  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

  const keywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 18);

  return { title, meta, h, nav, keywords };
}

function buildDomainHints({ signals, phase1 }) {
  // Construct a compact “domain inference” string the model can use.
  const parts = [];
  if (signals.title) parts.push(`Title: ${signals.title}`);
  if (signals.meta) parts.push(`Meta: ${signals.meta}`);
  if (signals.h?.length) parts.push(`Headings: ${signals.h.slice(0, 6).join(" | ")}`);
  if (signals.nav?.length) parts.push(`Nav: ${signals.nav.slice(0, 8).join(" | ")}`);
  if (signals.keywords?.length) parts.push(`Keywords: ${signals.keywords.slice(0, 12).join(", ")}`);

  const industry = typeof phase1?.industry === "string" ? phase1.industry : "";
  const brandName = typeof phase1?.brandName === "string" ? phase1.brandName : "";
  const primaryObjective = typeof phase1?.strategy?.primaryObjective === "string" ? phase1.strategy.primaryObjective : "";

  if (industry) parts.push(`Phase1 industry: ${industry}`);
  if (brandName) parts.push(`Phase1 brandName: ${brandName}`);
  if (primaryObjective) parts.push(`Phase1 primaryObjective: ${primaryObjective}`);

  // Keep it short to avoid blowing token budget.
  return parts.join("\n").slice(0, 1800);
}

function buildDomainTerms({ signals, phase1 }) {
  // Terms used for post-validation (domain-anchored detection).
  const terms = new Set();

  // Add signal keywords
  (signals.keywords || []).forEach((k) => terms.add(String(k).toLowerCase()));

  // Add nav labels split into words
  (signals.nav || []).forEach((lbl) => {
    String(lbl)
      .toLowerCase()
      .split(/\s+/)
      .forEach((w) => {
        if (w.length >= 4) terms.add(w);
      });
  });

  // Add industry tokens
  const industry = (phase1?.industry || "").toString().toLowerCase();
  industry.split(/\s+/).forEach((w) => {
    if (w.length >= 4) terms.add(w);
  });

  // Keep a compact list
  return Array.from(terms).filter(Boolean).slice(0, 22);
}

function isDomainAnchored(theme, domainTerms) {
  const hay = `${theme?.title || ""} ${theme?.what || ""} ${theme?.whyFit || ""}`.toLowerCase();
  return domainTerms.some((t) => t && hay.includes(t));
}

async function generateWithEnforcement({ platform, phase1, domainHints, domainTerms, maxAttempts = 2 }) {
  // Attempt generation up to maxAttempts to ensure >=2 domain-anchored.
  let lastThemes = [];
  let lastDebug = { anchoredCount: 0 };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = buildPrompt({ platform, phase1, domainHints }); // buildPrompt will be updated below
    const text = await callOpenAI({ prompt });
    const themes = normalizeThemes(platform.toLowerCase(), parseJsonStrict(text));

    const anchoredCount = themes.filter((t) => isDomainAnchored(t, domainTerms)).length;
    lastThemes = themes;
    lastDebug = { anchoredCount, attempt };

    if (anchoredCount >= 2) return { themes, debug: lastDebug };
  }

  // Fallback: return best we got without failing
  return { themes: lastThemes, debug: lastDebug };
}

function safeStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function buildPrompt({ platform, phase1, domainHints }) {

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
- IMPORTANT MIX RULE (MANDATORY):
  - At least 2 of the themes MUST be "Domain-Anchored": explicitly tied to the brand’s functional domain/problem space.
  - Domain is inferred from website signals + Phase 1 context below. Do NOT write generic SaaS-only themes that ignore the domain.
  - Remaining themes can be product-in-context and broader category/thought leadership themes, but domain must still be clearly present in the overall set.
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

Domain inference signals (use these to anchor at least 2 themes to the real operating domain):
${domainHints || "(no website signals available — use Phase 1 fields only)"}

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

const raw = await resp.text();
let data = {};
try { data = JSON.parse(raw); } catch { data = { raw }; }

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

// --- Domain inference (safe fallback if fetch/extraction fails) ---
const websiteUrl = safeStr(phase1.websiteUrl);
const homepageHtml = await fetchHomepageHtml(websiteUrl, 4500);
const signals = extractHomepageSignals(homepageHtml);
const domainHints = buildDomainHints({ signals, phase1 });
const domainTerms = buildDomainTerms({ signals, phase1 });

const out = { linkedin: [], instagram: [] };
const debug = { linkedin: null, instagram: null, domainTerms, usedWebsiteSignals: !!homepageHtml };

if (wantLinkedIn) {
  const r = await generateWithEnforcement({
    platform: "LinkedIn",
    phase1,
    domainHints,
    domainTerms,
    maxAttempts: 2,
  });
  out.linkedin = r.themes;
  debug.linkedin = r.debug;
}

if (wantInstagram) {
  const r = await generateWithEnforcement({
    platform: "Instagram",
    phase1,
    domainHints,
    domainTerms,
    maxAttempts: 2,
  });
  out.instagram = r.themes;
  debug.instagram = r.debug;
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
  debug, // helps verify anchoredCount + whether website signals were used
});

  } catch (e) {
    console.error("Social generateThemes error:", e);
    return res.status(400).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
