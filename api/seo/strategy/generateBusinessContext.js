// api/seo/strategy/generateBusinessContext.js
//
// Step 4.5 — Business Context Intelligence Layer (CRITICAL)
// Builds a structured business understanding JSON + stores to Firestore.

import admin from "../../firebaseAdmin";

// -------------------- AUTH --------------------
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// -------------------- EFFECTIVE CONTEXT --------------------
async function resolveEffectiveContext(uid, websiteId) {
  const ref = admin.firestore().doc(`users/${uid}/websites/${websiteId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return { effectiveUid: uid, effectiveWebsiteId: websiteId };
  }

  const w = snap.data() || {};
  const effectiveUid = w.ownerUid || uid;
  const effectiveWebsiteId = w.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId };
}

// -------------------- OPENAI --------------------
async function callOpenAI({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a business context extraction engine for SEO strategy. Return STRICT JSON only. No markdown. No extra keys.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json?.error?.message || "OpenAI request failed.");
  }

  const content = json?.choices?.[0]?.message?.content || "";
  return content;
}

function safeJsonParse(str) {
  const raw = String(str || "").trim();

  // If model accidentally wraps in code-fence, strip it.
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(stripped);
}

function wordCount(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function pickHomepageTitle(auditDocs) {
  // Prefer audited URL with pathname "/"
  for (const d of auditDocs) {
    try {
      const u = new URL(d.url);
      if (u.pathname === "/" || u.pathname === "") {
        return d?.extracted?.title || "";
      }
    } catch (e) {
      // ignore
    }
  }
  // fallback: first audited title
  return auditDocs?.[0]?.extracted?.title || "";
}

function dedupeList(arr, max = 40) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const v = String(x || "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// -------------------- MAIN HANDLER --------------------
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const { websiteId, seeds = [], language_code = "en" } = req.body || {};

    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(
      uid,
      websiteId
    );

    const db = admin.firestore();

    // -------------------- LOAD INPUT DATA --------------------
    const businessProfileRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessProfile`
    );
    const keywordPoolRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordPool`
    );
    const auditColRef = db.collection(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/auditResults/urls`
    );

    const [bpSnap, kpSnap, auditSnap] = await Promise.all([
      businessProfileRef.get(),
      keywordPoolRef.get(),
      auditColRef.get(),
    ]);

    if (!bpSnap.exists) {
      return res.status(400).json({ error: "Missing businessProfile in Firestore." });
    }
    if (!kpSnap.exists) {
      return res.status(400).json({ error: "Missing keywordPool in Firestore." });
    }
    if (auditSnap.empty) {
      return res.status(400).json({ error: "Missing auditResults in Firestore." });
    }

    const businessProfile = bpSnap.data() || {};
    const keywordPool = kpSnap.data() || {};

    const auditDocs = auditSnap.docs.map((d) => d.data() || {});
    const auditedUrls = dedupeList(auditDocs.map((x) => x.url), 20);

    const h1s = [];
    const h2s = [];
    for (const d of auditDocs) {
      const ex = d.extracted || {};
      if (ex.h1) h1s.push(ex.h1);
      if (Array.isArray(ex.h2List)) {
        for (const h of ex.h2List) h2s.push(h);
      }
    }

    const factsBundle = {
      user_declared_industry: String(businessProfile.industry || "").trim(),
      user_declared_services: String(businessProfile.primaryOffer || "").trim(),
      homepage_title: String(pickHomepageTitle(auditDocs) || "").trim(),
      deduplicated_h1_themes: dedupeList(h1s, 25),
      deduplicated_h2_themes: dedupeList(h2s, 35),
      representative_service_urls: auditedUrls.slice(0, 6),
      geo_mode: String(keywordPool.geo_mode || "").trim(),
      location_name: String(keywordPool.location_name || "").trim(),
      seed_keywords: Array.isArray(seeds) ? dedupeList(seeds, 10) : [],
      language_code: String(keywordPool.language_code || language_code || "en").trim(),
      keyword_source: String(keywordPool.source || "").trim(),
    };

    // -------------------- PROMPT CONTRACT --------------------
    const prompt = `
You will receive a FACTS_BUNDLE derived from a website audit + user inputs.
Your job: produce VALID JSON with EXACT keys and no extra keys.

REQUIRED JSON SCHEMA (EXACT KEYS):
{
  "one_liner": string,
  "summary": string,
  "primary_services": string[],
  "secondary_themes": string[],
  "target_audience": string,
  "geo_target": { "mode": string, "location": string },
  "assumptions": string[],
  "mismatch_check": {
    "user_industry": string,
    "detected_industry": string,
    "confidence": number,
    "warning": string
  }
}

SUMMARY RULES (NON-NEGOTIABLE):
- 120–180 words
- neutral, factual, strategic (NOT marketing copy)
- no superlatives, no promotional language
- MUST explicitly mention GEO target using mode + location from FACTS_BUNDLE
- MUST reflect services/themes derived from H1/H2 and homepage_title

MISMATCH LOGIC:
- Compare FACTS_BUNDLE.user_declared_industry vs inferred detected_industry from headings/themes
- If they appear different, set warning to:
  "The selected industry appears to differ from detected website content."
  Otherwise set warning to "" (empty string)
- confidence must be 0.0–1.0

FACTS_BUNDLE:
${JSON.stringify(factsBundle, null, 2)}
`;

    // -------------------- GENERATE --------------------
    const raw = await callOpenAI({ prompt });

    let out = null;
    try {
      out = safeJsonParse(raw);
    } catch (e) {
      return res.status(500).json({
        error: "Model returned invalid JSON",
        raw,
      });
    }

    // -------------------- VALIDATE KEYS --------------------
    const requiredKeys = [
      "one_liner",
      "summary",
      "primary_services",
      "secondary_themes",
      "target_audience",
      "geo_target",
      "assumptions",
      "mismatch_check",
    ];

    for (const k of requiredKeys) {
      if (!(k in out)) {
        return res.status(500).json({ error: `Missing key: ${k}` });
      }
    }

    const wc = wordCount(out.summary);
    if (wc < 120 || wc > 180) {
      return res.status(500).json({
        error: "Summary word count out of range (120–180).",
        wordCount: wc,
        summary: out.summary,
      });
    }

    // -------------------- STORE --------------------
    const businessContextRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessContext`
    );

    const mismatchWarning = String(out?.mismatch_check?.warning || "");

    await businessContextRef.set({
      aiVersion: out,
      userVersion: null,
      finalVersion: { summaryText: String(out.summary || "").trim() },
      geoMode: factsBundle.geo_mode,
      location_name: factsBundle.location_name,
      geoSource: factsBundle.keyword_source,
      mismatchWarning,
      approved: false,
      approvedAt: null,
      editedByUser: false,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({
      error: "Unhandled server error",
      message: e?.message || String(e),
    });
  }
}
