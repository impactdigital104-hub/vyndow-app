import admin from "../firebaseAdmin";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

async function resolveEffectiveContext(uid, websiteId) {
  const ref = admin.firestore().doc(`users/${uid}/websites/${websiteId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return { effectiveUid: uid, effectiveWebsiteId: websiteId, website: null };
  }

  const website = snap.data() || {};
  const effectiveUid = website.ownerUid || uid;
  const effectiveWebsiteId = website.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId, website };
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function safeJsonParse(str) {
  const raw = String(str || "").trim();

  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(stripped);
}

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function cleanList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

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
            "You generate compact backlink execution guidance. Return STRICT JSON only. No markdown. No code fences. No extra keys.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const json = await resp.json();

  if (!resp.ok) {
    throw new Error(json?.error?.message || "OpenAI request failed.");
  }

  return json?.choices?.[0]?.message?.content || "";
}

function buildPrompt({
  websiteDomain,
  industry,
  geoMode,
  locationName,
  row,
}) {
  return `
Create compact execution guidance for ONE backlink opportunity.

BUSINESS CONTEXT
- Website: ${cleanText(websiteDomain, "Unknown")}
- Industry: ${cleanText(industry, "Unknown")}
- Geo mode: ${cleanText(geoMode, "Unknown")}
- Location: ${cleanText(locationName, "Unknown")}

BACKLINK OPPORTUNITY
- Domain: ${cleanText(row?.normalizedDomain)}
- Category: ${cleanText(row?.category, "other")}
- Method: ${cleanText(row?.method, "manual review")}
- Difficulty: ${cleanText(row?.difficulty, "medium")}
- Priority tier: ${cleanText(row?.priorityTier, "foundation")}
- Competitor count: ${Number(row?.competitorCount || 0)}
- Linked competitors: ${cleanList(row?.linkedCompetitors).join(", ") || "None provided"}
- Domain rank: ${Number.isFinite(Number(row?.domainRank)) ? Number(row.domainRank) : "Unknown"}

RETURN STRICT JSON WITH EXACT KEYS:
{
  "recommendedApproach": string,
  "whyItMatters": string,
  "executionSteps": string[],
  "suggestedAngle": string,
  "linkPlacementAdvice": string,
  "effortNote": string
}

RULES
- Keep it practical, compact, and action-oriented.
- Tailor the advice to the category, method, and difficulty.
- "executionSteps" must contain 3 to 5 short steps.
- Do not mention email outreach unless the method clearly needs it.
- Do not invent contact names, emails, or URLs.
- Do not return markdown.
`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);
    const { websiteId, row } = req.body || {};

    if (!websiteId) {
      return res.status(400).json({ error: "Missing websiteId" });
    }

    if (!row || !row.normalizedDomain) {
      return res.status(400).json({ error: "Missing row guidance context" });
    }

    const normalizedDomain = normalizeDomain(row.normalizedDomain);

    if (!normalizedDomain) {
      return res.status(400).json({ error: "Invalid normalizedDomain" });
    }

    const { effectiveUid, effectiveWebsiteId, website } = await resolveEffectiveContext(
      uid,
      websiteId
    );

    const db = admin.firestore();

    const guidanceRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/backlinks/guidance/${normalizedDomain}`
    );

    const guidanceSnap = await guidanceRef.get();

    if (guidanceSnap.exists) {
      const cached = guidanceSnap.data() || {};
      return res.status(200).json({
        ok: true,
        cached: true,
        normalizedDomain,
        guidance: cached.guidance || null,
      });
    }

    const businessProfileRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessProfile`
    );
    const keywordPoolRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordPool`
    );

    const [businessProfileSnap, keywordPoolSnap] = await Promise.all([
      businessProfileRef.get(),
      keywordPoolRef.get(),
    ]);

    const businessProfile = businessProfileSnap.exists ? businessProfileSnap.data() || {} : {};
    const keywordPool = keywordPoolSnap.exists ? keywordPoolSnap.data() || {} : {};

    const websiteDomain =
      cleanText(website?.domain) ||
      cleanText(website?.website) ||
      cleanText(website?.url) ||
      cleanText(website?.businessName);

    const industry = cleanText(businessProfile?.industry);
    const geoMode = cleanText(keywordPool?.geo_mode);
    const locationName = cleanText(keywordPool?.location_name);

    const prompt = buildPrompt({
      websiteDomain,
      industry,
      geoMode,
      locationName,
      row,
    });

    const raw = await callOpenAI({ prompt });
    const parsed = safeJsonParse(raw);

    const guidance = {
      recommendedApproach: cleanText(parsed?.recommendedApproach, "Manual review"),
      whyItMatters: cleanText(parsed?.whyItMatters, "This is a relevant backlink opportunity."),
      executionSteps: cleanList(parsed?.executionSteps).slice(0, 5),
      suggestedAngle: cleanText(
        parsed?.suggestedAngle,
        "Position the business in a natural and relevant way for this listing."
      ),
      linkPlacementAdvice: cleanText(
        parsed?.linkPlacementAdvice,
        "Prefer a natural brand or contextual link placement."
      ),
      effortNote: cleanText(parsed?.effortNote, "Expected effort: Medium"),
    };

    await guidanceRef.set(
      {
        normalizedDomain,
        referringDomain: cleanText(row?.referringDomain, normalizedDomain),
        guidance,
        source: "openai_backlink_guidance_v1",
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({
      ok: true,
      cached: false,
      normalizedDomain,
      guidance,
    });
  } catch (e) {
    console.error("generate-guidance error:", e);
    return res.status(500).json({
      error: "We could not generate guidance for this opportunity right now. Please try again.",
      message: e?.message || String(e),
    });
  }
}
