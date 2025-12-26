// /api/generate.js
import admin from "./firebaseAdmin";
import { ensureWebsiteSeoModule } from "./seoModuleProvision";
function getMonthKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // e.g. 2025-12
}

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");

  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}
// Resolve the website "account context" (Model 1):
// - Get ownerUid from the caller's website stub users/{uid}/websites/{websiteId}
// - Verify membership in users/{ownerUid}/websites/{websiteId}/members/{uid}
// Returns { ownerUid, websiteData }
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
  const ownerUid = (websiteData.ownerUid || uid).trim(); // fallback for owner-created sites

  // Membership check (canonical truth = owner's members list)
  if (ownerUid !== uid) {
    const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      const err = new Error("NO_ACCESS");
      err.code = "NO_ACCESS";
      throw err;
    }
  }

  return { ownerUid, websiteData };
}

// Load SEO module config with safe fallback:
// 1) preferred (future-ready): users/{ownerUid}/websites/{websiteId}/modules/seo
// 2) fallback (legacy): users/{ownerUid}/modules/seo
async function loadSeoModule({ ownerUid, websiteId }) {
  const db = admin.firestore();

  const websiteModuleRef = db.doc(`users/${ownerUid}/websites/${websiteId}/modules/seo`);
  const websiteModuleSnap = await websiteModuleRef.get();
  if (websiteModuleSnap.exists) return { module: websiteModuleSnap.data() || {}, moduleRef: websiteModuleRef };

  const legacyModuleRef = db.doc(`users/${ownerUid}/modules/seo`);
  const legacyModuleSnap = await legacyModuleRef.get();
  if (legacyModuleSnap.exists) return { module: legacyModuleSnap.data() || {}, moduleRef: legacyModuleRef };

  const err = new Error("SEO module not configured for this website owner.");
  err.code = "NO_SEO_PLAN";
  throw err;
}

// Reserve 1 credit BEFORE generating (atomic), rollback if generation fails
async function reserveOneBlogCredit({ uid, websiteId }) {
  const db = admin.firestore();
  const monthKey = getMonthKey();

  // Model 1: resolve ownerUid + verify membership
  const { ownerUid } = await resolveWebsiteContext({ uid, websiteId });
  // Ensure website-scoped module exists (auto-backfill from legacy if needed)
await ensureWebsiteSeoModule({ admin, ownerUid, websiteId });


  // Model 1: plan belongs to owner+website (fallback to legacy owner plan)
  const { module, moduleRef } = await loadSeoModule({ ownerUid, websiteId });

  // Usage belongs to owner+website (shared quota)
  const usageRef = db.doc(`users/${ownerUid}/websites/${websiteId}/usage/${monthKey}`);

  const result = await db.runTransaction(async (tx) => {
    const usageSnap = await tx.get(usageRef);

    const usageData = usageSnap.exists ? (usageSnap.data() || {}) : {};
    const used = usageData.usedThisMonth ?? 0;

    const baseLimit = module.blogsPerWebsitePerMonth ?? 0;
    if (!baseLimit || baseLimit <= 0) {
      throw new Error("SEO plan limit missing or invalid.");
    }

    // CASE 1: Still within base plan quota
    if (used < baseLimit) {
      tx.set(
        usageRef,
        {
          month: monthKey,
          usedThisMonth: used + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        usedAfter: used + 1,
        baseLimit,
        extraCreditsRemaining: module.extraBlogCreditsThisMonth ?? 0,
        usedExtraCredit: false,
        ownerUid,
      };
    }

    // CASE 2: Base quota exhausted → use extra credits
    let extraCredits = module.extraBlogCreditsThisMonth ?? 0;

    if (extraCredits <= 0) {
      const err = new Error("QUOTA_EXCEEDED");
      err.code = "QUOTA_EXCEEDED";
      err.used = used;
      err.limit = baseLimit;
      err.extraCreditsRemaining = 0;
      throw err;
    }

    // consume one extra blog credit
    extraCredits = extraCredits - 1;

    tx.set(
      moduleRef,
      {
        extraBlogCreditsThisMonth: extraCredits,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      usageRef,
      {
        month: monthKey,
        usedThisMonth: used + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      usedAfter: used + 1,
      baseLimit,
      extraCreditsRemaining: extraCredits,
      usedExtraCredit: true,
      ownerUid,
    };
  });

  return result;
}


async function rollbackOneBlogCredit({ uid, websiteId, ownerUid, usedExtraCredit }) {
  const db = admin.firestore();
  const monthKey = getMonthKey();
  const usageRef = db.doc(`users/${ownerUid}/websites/${websiteId}/usage/${monthKey}`);
    const websiteModuleRef = db.doc(`users/${ownerUid}/websites/${websiteId}/modules/seo`);
  const legacyModuleRef = db.doc(`users/${ownerUid}/modules/seo`);


  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      if (!snap.exists) return;

      const used = snap.data()?.usedThisMonth ?? 0;
      if (used <= 0) return;

           // Restore extra blog credit if reserve had consumed one (best effort)
      if (usedExtraCredit) {
        const websiteModuleSnap = await tx.get(websiteModuleRef);

        if (websiteModuleSnap.exists) {
          const currentExtra = websiteModuleSnap.data()?.extraBlogCreditsThisMonth ?? 0;
          tx.set(
            websiteModuleRef,
            {
              extraBlogCreditsThisMonth: currentExtra + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          const legacySnap = await tx.get(legacyModuleRef);
          if (legacySnap.exists) {
            const currentExtra = legacySnap.data()?.extraBlogCreditsThisMonth ?? 0;
            tx.set(
              legacyModuleRef,
              {
                extraBlogCreditsThisMonth: currentExtra + 1,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
          }
        }
      }
      tx.update(usageRef, {
        usedThisMonth: used - 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (e) {
    // best-effort rollback
    console.error("Rollback failed:", e);
  }
}

// Two-step generation architecture for 1500-word article reliability

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({
      ok: true,
      message:
        "Vyndow SEO /api/generate is live. Use POST with JSON body.",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY is missing."
    });
  }
  // Helper: check mandatory fields and apply defaults
  function normalizeBrief(raw) {
    const b = raw || {};
    const errors = [];

    function isBlank(value) {
      return (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      );
    }

    // ---------------------------
    // MANDATORY FIELDS (no defaults)
    // ---------------------------

    // A1: Brand Description
    if (isBlank(b.brandDescription)) {
      errors.push("A1 (Brand Description) is required.");
    }

    // A2: Target Audience Persona
    if (isBlank(b.targetAudience)) {
      errors.push("A2 (Target Audience Persona) is required.");
    }

    // B1: Primary Keyword
    if (isBlank(b.primaryKeyword)) {
      errors.push("B1 (Primary Keyword) is required.");
    }

    // C1: Blog Topic / Working Title
    if (isBlank(b.topic)) {
      errors.push("C1 (Blog Topic / Working Title) is required.");
    }

    // C2: Desired Word Count
    if (isBlank(b.wordCount)) {
      errors.push("C2 (Desired Word Count) is required.");
    }
// Website (for plan + usage enforcement)
if (isBlank(b.websiteId)) {
  errors.push("WebsiteId (selected website) is required.");
}

     // ---------------------------
    // OPTIONAL FIELDS WITH DEFAULTS
    // ---------------------------

    // Industry mode: choose how strict / what kind of guardrails to apply
    const industry = !isBlank(b.industry)
      ? b.industry
      : "health_recovery";

    const defaultIndustryRestrictions = !isBlank(b.industryRestrictions)
      ? b.industryRestrictions
      : industry === "health_recovery"
      ? "Provide trauma-informed, recovery-focused, non-judgmental educational content. Avoid medical diagnoses or prescriptions, avoid promising outcomes, avoid instructions for self-detox, and avoid triggering or sensational language."
      : industry === "healthcare_clinic"
      ? "Provide general educational medical information. Do not diagnose individual patients, prescribe specific treatments, or claim guaranteed outcomes."
      : industry === "finance"
      ? "Provide general educational financial information. Do not give personalised investment advice, guarantee returns, or encourage high-risk speculation."
      : industry === "legal"
      ? "Provide general educational legal information. Do not give personalised legal advice or encourage illegal activity."
      : industry === "education"
      ? "Provide supportive, educational information suitable for learners. Avoid harmful, abusive, or discriminatory content and avoid unrealistic promises of outcomes."
      : industry === "ecommerce_fmcg"
      ? "Provide honest, clear product information. Avoid misleading claims, illegal content, or unsafe usage instructions."
      : industry === "travel_hospitality"
      ? "Provide inspiring but accurate information about travel and stays. Avoid unsafe travel advice or misleading promises."
      : industry === "saas_tech"
      ? "Provide accurate, benefit-focused information about software and technology. Avoid misleading performance or ROI guarantees."
      : industry === "entertainment_media"
      ? "Provide engaging descriptions of content and creators. Avoid hate, harassment, explicit adult content, or incitement to violence."
      : industry === "real_estate_home"
      ? "Provide clear, accurate information about properties and home services. Avoid misleading investment promises or false claims."
      : industry === "spirituality_wellness"
      ? "Provide supportive, non-coercive spiritual or wellness information. Avoid medical claims, miracle cures, or shaming language."
      : "Follow standard ethical guidelines: avoid harmful, illegal, or unsafe advice. Do not encourage self-harm, hate, or violence.";

    const normalized = {
      ...b,
      industry,


      // A3: Tone of Voice
      toneOfVoice: !isBlank(b.toneOfVoice)
        ? b.toneOfVoice
        : "Conversational, easy-to-read, warm and reassuring.",

      // A4: Brand Values
      brandValues: !isBlank(b.brandValues)
        ? b.brandValues
        : "Empathetic, ethical, helpful, non-judgmental.",

            // A5: Prohibited Words / Claims
      prohibitedClaims: !isBlank(b.prohibitedClaims)
        ? b.prohibitedClaims
        : "Avoid exaggerated claims, absolute guarantees, unsafe advice, or content that sounds like personalised medical, legal, or financial guidance.",


      // B2: Secondary Keywords (ensure array)
      secondaryKeywords: Array.isArray(b.secondaryKeywords)
        ? b.secondaryKeywords
        : [],

      // B3: Long-tail phrases (if you add this later)
      longTailPhrases: Array.isArray(b.longTailPhrases)
        ? b.longTailPhrases
        : [],

      // B4: Existing blogs for internal links (B4)
      existingBlogs: !isBlank(b.existingBlogs) ? b.existingBlogs : "",

      // B5: Competitor URLs
      competitorUrls: Array.isArray(b.competitorUrls)
        ? b.competitorUrls
        : [],

      // B6: SEO Intent
      seoIntent: !isBlank(b.seoIntent) ? b.seoIntent : "informational",

      // B7: Geography
      geography: !isBlank(b.geography)
        ? b.geography
        : "Global / not region-specific.",

      // C3: Writing Style
      stylePreferences: !isBlank(b.stylePreferences)
        ? b.stylePreferences
        : "Clear, structured, educational and empathetic, with smooth flow.",

      // C4: Internal linking preference
      internalLinkingPreference: !isBlank(b.internalLinkingPreference)
        ? b.internalLinkingPreference
        : "Add internal links contextually (recommended).",

      // C5: Image preference
      imagePreference: !isBlank(b.imagePreference)
        ? b.imagePreference
        : "Photorealistic, human-centric, warm and hopeful.",

      // C6: Layout preference
      layoutPreference: !isBlank(b.layoutPreference)
        ? b.layoutPreference
        : "Short paragraphs, meaningful sub-headings, and some bullet points for readability.",

            // D1: Industry restrictions
      industryRestrictions: defaultIndustryRestrictions,


      // D2: Sensitivity notes
      sensitivityNotes: !isBlank(b.sensitivityNotes)
        ? b.sensitivityNotes
        : "",

      // E1–E3: Optional premium inputs
      contentPillar: !isBlank(b.contentPillar) ? b.contentPillar : "",
      competitorGaps: !isBlank(b.competitorGaps) ? b.competitorGaps : "",
      futureTopicHints: !isBlank(b.futureTopicHints)
        ? b.futureTopicHints
        : ""
    };

    return { brief: normalized, errors };
  }
  
   // Receive and normalize the brief from frontend
  const { brief, errors } = normalizeBrief(req.body);
    // --- AUTH + QUOTA (Phase 9A) ------------------------------------
  let uid = null;
  try {
    uid = await getUidFromRequest(req);
  } catch (e) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHENTICATED",
      detail: e?.message || "Missing/invalid login token.",
    });
  }

  const websiteId = brief.websiteId;


  // If mandatory fields are missing, stop and send a clear error
  if (errors.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "Missing or invalid required fields in the Vyndow brief.",
      details: errors
    });
  }
    // Reserve 1 blog credit BEFORE generating (atomic)
  let reservation = null;
  try {
    reservation = await reserveOneBlogCredit({ uid, websiteId });
  } catch (e) {
    if (e?.code === "QUOTA_EXCEEDED") {
      return res.status(403).json({
        ok: false,
        error: "QUOTA_EXCEEDED",
        used: e.used,
        limit: e.limit,
      });
    }
        if (e?.code === "NO_ACCESS") {
      return res.status(403).json({
        ok: false,
        error: "NO_ACCESS",
        detail: "You do not have access to this website.",
      });
    }

    if (e?.code === "WEBSITE_NOT_FOUND") {
      return res.status(404).json({
        ok: false,
        error: "WEBSITE_NOT_FOUND",
        detail: "Website not found for this user.",
      });
    }

    if (e?.code === "NO_SEO_PLAN") {
      return res.status(403).json({
        ok: false,
        error: "NO_SEO_PLAN",
        detail: "SEO plan is not configured for the website owner.",
      });
    }

    return res.status(500).json({
      ok: false,
      error: "QUOTA_CHECK_FAILED",
      detail: e?.message || String(e),
    });
  }
  // ----------------------------------------------------------------


  // Normalise requested word count and define a tight band
  const requestedWordsRaw = Number(brief.wordCount);
  const requestedWords = !isNaN(requestedWordsRaw) && requestedWordsRaw > 0
    ? requestedWordsRaw
    : 1200;

  // Aim for roughly ±10% around the requested length
  const minWords = Math.max(600, Math.round(requestedWords * 0.9));
  const maxWords = Math.round(requestedWords * 1.1);
  // ---------------------------------------
  // STEP 1 — PROMPT FOR THE LONG ARTICLE
  // ---------------------------------------
  
const LONG_ARTICLE_PROMPT = `
You are VYNDOW SEO, an expert long-form SEO writer.

You will write a comprehensive, deeply detailed article of around ${requestedWords} words in clean HTML (<h1>, <h2>, <h3>, <p>).
Absolutely NO JSON for this step.
Do NOT include any <!DOCTYPE>, <html>, <head>, or <body> tags.
Start directly with the main content (an <h1>), followed by <p> paragraphs, etc.

CRITICAL LENGTH REQUIREMENTS:
- ABSOLUTE MINIMUM LENGTH: ${minWords} words.
- TARGET LENGTH BAND: ${minWords}–${maxWords} words. Stay within this band.

STRUCTURE REQUIREMENTS:
- Include AT LEAST EIGHT <h2> sections.
- Each <h2> section MUST contain 3–4 detailed, well-developed paragraphs.
- Use <h3> sub-sections wherever helpful.
- Add examples, scenarios, analogies, and practical guidance to earn the length (no filler).

NON-NEGOTIABLE EDITOR INSTRUCTION (MUST OVERRIDE EVERYTHING ELSE):
The user has provided EDITOR NOTES for this specific blog. You MUST follow these notes.
- The article must clearly reflect the angle, argument, and framing demanded by the notes.
- If the notes ask you to argue strongly for a position, you MUST do so with clear reasoning and examples.
- If any instruction conflicts with safety restrictions, follow safety — otherwise Notes override all other preferences.

EDITOR NOTES (MANDATORY):
${(brief.notes || "").trim()}

BRAND CONTEXT:
Brand description:
${brief.brandDescription || ""}

Target audience:
${brief.targetAudience || ""}

Geography / market focus:
${brief.geography || brief.geoTarget || ""}

VOICE & STYLE (MUST BE FELT IN THE WRITING):
Tone of voice:
${Array.isArray(brief.toneOfVoice) ? brief.toneOfVoice.join(", ") : (brief.toneOfVoice || "")}

Writing style preferences:
${brief.stylePreferences || ""}

Brand values:
${brief.brandValues || ""}

Prohibited claims / guardrails:
${brief.prohibitedClaims || ""}

Industry restrictions:
${brief.industryRestrictions || ""}

EDITORIAL POSTURE & DECISION MODE (STRICTLY CONDITIONAL)

ACTIVATION RULE:
Only activate the instructions in this section if (and only if)
the Editor Notes explicitly ask for:
- comparison or evaluation
- competitors or alternatives
- “X vs Y” framing
- strengths vs weaknesses
- positioning one option as superior

IF ACTIVATED, write in an expert, analyst-style “decision support” posture:
Assume the reader is already knowledgeable; write to help them decide, not to educate from scratch.
- State conclusions clearly and confidently (without hype).
- Avoid hedging phrases such as:
  “may help”, “can be useful”, “often”, “in some cases”.
- It is acceptable to point out limitations directly,
  as long as statements are factual, professional, and non-exaggerated.
- Do not sound promotional. Sound informed.
- Do not be neutral for the sake of neutrality; provide reasoned judgment.

When comparing tools, approaches, or alternatives, you MUST:
- Explain trade-offs, not just features.
- Identify workflow friction, hidden effort or setup cost,
  what breaks down as usage scales, and why this matters in practice.
- Use cause → effect → consequence language, for example:
  - “This leads to…”
  - “The result is…”
  - “In practice, this means…”
  - “At scale, this becomes a problem because…”
- Mention who each option is best suited for.
- Where appropriate, include a short subsection such as:
  “When to choose X / When to choose Y”.

IF NOT ACTIVATED (i.e., Notes do NOT request comparison or evaluation):
- Do NOT introduce competitors, alternatives, or “versus” framing.
- Do NOT evaluate other approaches unless explicitly asked.
- Write a focused single-topic article (how-to / guide / explainer).
- Maintain a neutral, informative expert tone aligned with the brand voice.



SEO REQUIREMENTS:
Primary keyword: ${brief.primaryKeyword || ""}
Secondary keywords: ${(brief.secondaryKeywords || []).join(", ")}
Topic / working title: ${brief.topic || ""}

IMPORTANT LINK RULE (STEP 1):
- Do NOT create any HTML hyperlinks in this article.
- Do NOT use <a> tags at all.
- Do NOT include any href="" attributes.
(Internal links will be applied later.)

QUALITY CONTROL (MANDATORY):
- The first 2 paragraphs must make the intended angle obvious (as per the Notes).
- Avoid generic AI phrasing like “In today’s world…” or “This comprehensive guide…”.
- Don’t pad for length. Every paragraph must add a new idea, example, or explanation.

Write the full article now. Return ONLY HTML.
`;

  // -----------------------------
  // STEP 1 — CALL OPENAI
  // -----------------------------
  let articleText = "";
  try {
    const longResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: LONG_ARTICLE_PROMPT }],
          temperature: 0.7,
          max_tokens: 12000 // plenty of room for long article
        }),
      }
    );

    const longData = await longResponse.json();
    articleText =
      longData.choices?.[0]?.message?.content ||
      "(Article generation failed.)";
    // Extra safety: remove any HTML links if the model still adds them
if (typeof articleText === "string") {
  // Remove opening <a ...> tags
  articleText = articleText.replace(/<a\b[^>]*>/gi, "");
  // Remove closing </a> tags
  articleText = articleText.replace(/<\/a>/gi, "");
}
} catch (err) {
  // Roll back reserved credit because generation failed
   await rollbackOneBlogCredit({
    uid,
    websiteId,
    ownerUid: reservation.ownerUid,
    usedExtraCredit: reservation.usedExtraCredit,
  });


  return res.status(500).json({
    ok: false,
    error: "Error generating long article.",
    detail: String(err),
  });
}


  // ---------------------------------------
  // STEP 2 — PROMPT FOR SHORT OUTPUTS
  // ---------------------------------------
 // STEP 2 — PROMPT FOR SHORT OUTPUTS
// ---------------------------------------
  // ---------------------------------------
  // STEP 2 — PROMPT FOR SHORT OUTPUTS
  // ---------------------------------------
  const SHORT_OUTPUTS_PROMPT = `
You are VYNDOW SEO. Generate ONLY the remaining 14 SEO outputs for the blog.

Return ONLY a JSON object using EXACT keys: output1 to output7 and output9 to output15.
DO NOT include output8 (the article is already generated).
DO NOT include any commentary or text outside the JSON.
DO NOT include markdown fences.
CRITICAL FORMAT RULE:
- Every output value (output1, output2, ..., output7, output9, ..., output15) MUST be a SINGLE STRING.
- Never return arrays or nested objects for any output. If you need multiple rows/items, put them inside one string separated by line breaks.

Here is the blog brief:
${JSON.stringify(brief, null, 2)}

Here is the full HTML article that has ALREADY been generated in STEP 1.
It starts with an <h1> or <h2> and contains all the headings and paragraphs you must work with.
You will use this article text when deciding titles, FAQs, internal links, image ideas, schemas, etc.:
${articleText}

// The brief includes an "imagePreference" field that describes the desired
// visual style (for example: "photorealistic", "flat vector illustration",
// "isometric", etc.). Always honour this imagePreference when generating
// output11 (image alt texts) and output12 (image prompts).

Generate the rest of the outputs exactly as described:

1 → Blog Title Recommendation  
2 → H1  
3 → SEO Title (<= 60 chars)  
4 → Meta Description (<= 155 chars)  
5 → URL Slug  
6 → Primary Keyword  
7 → Secondary Keywords (comma-separated)  

9 → Internal links table as a single multiline string in plain text.

EDITORIAL LINKING RULES (must follow):
- Prefer placing internal links inside BODY PARAGRAPHS (<p>) mid-sentence. This is the default.
- NEVER choose anchor text that appears only in the <h1>. Never place links in <h1>.
- Only use <h2>/<h3> anchor placements occasionally, and ONLY if it is a brand/pillar phrase.
- If a good in-text anchor is not available, use "Further reading" placement (the system will append it).

ANCHOR TEXT RULES:
- You MUST choose anchor phrases ONLY from the actual article HTML shown above.
- Prefer anchor phrases found in <p> sections over those found in headings.
- Do NOT invent new anchor phrases that do not already appear in the article.
- Anchor length: 2–6 words (not a full sentence), and it must sound natural.

For each internal URL you plan to use:
- Scan the article HTML for a natural phrase that already exists in the BODY COPY.
- Use that exact phrase as the anchor text (character-for-character).
- For the URL column, always copy the actual URL from the brief exactly as it appears.
- Never invent domains, placeholders, or example.com.

Write the table in plain text with a header row "Anchor | URL | Purpose" and then one row per link, for example:
Anchor | URL | Purpose
Anchor text 1 | <actual URL from the brief> | Short purpose
Anchor text 2 | <actual URL from the brief> | Short purpose

10 → FAQs as one multiline string.
Include 4–5 Q/A pairs.

Guidelines for FAQ questions:
- Frame questions the way a curious, attentive reader might naturally ask
  after reading the article.
- Questions may clarify concepts, implications, usage, limitations,
  applicability, or common follow-up doubts.
- Avoid marketing-style phrasing or repeating section headings.
- Each question should address a distinct concern or angle.

Guidelines for answers:
- Each answer must be at least 50 words.
- Be clear, factual, and helpful.
- Explain implications or context where relevant.
- Do not exaggerate, promise outcomes, or make guarantees.

Use the format:
"Q1. ...\nA1. ...\n\nQ2. ...\nA2. ..."


11 → Image alt text suggestions as one multiline string.
Each line must start with "1. ", "2. ", "3. ", etc.
Write 3–5 alt texts, each 1–2 sentences, max ~160 characters.

Each alt text should:
- Describe WHAT is visible in the image (subject, action, context).
- Be descriptive and accessible (good for screen readers).
- Match the topic, brand description, target audience, and geography.
- Reflect the meaning and purpose of the image in the article section,
  NOT the image style or how it was created.

Do NOT:
- Mention image style or generation method (e.g. photorealistic, isometric, vector, AI-generated).
- Use phrases like "image of", "picture of", "illustration of".
- Include any HTML tags.

12 → Image prompts as one multiline string.
Each line must start with "1. ", "2. ", "3. ", etc.
Write 3–5 rich prompts for an AI image generator.

Each prompt must:
- Explicitly mention the imagePreference from the brief (e.g. "photorealistic", "flat vector illustration", "3D isometric").
- Reflect the brand description, target audience, topic, and geography (if present).
- Be context-aware: each prompt must be tied to a distinct key idea or section theme from the article (e.g., workflow friction, scaling, internal linking integrity, schema/technical SEO, decision-making).
- Avoid generic stock scenes unless the topic truly demands them (e.g., random “team meeting”, “people pointing at charts”, “floating icons”).
- Ensure variety: no two prompts should reuse the same core scene setup (dashboard/team/abstract). Each should depict a different scenario or visual metaphor.
- Be safe and on-brand for sensitive topics (no graphic imagery, no pills/needles/self-harm; focus on people, environment, emotions, and recovery).
- Be around 25–45 words.


13 → JSON-LD schemas as one multiline string.
Produce TWO numbered schemas:

1. Blog schema as a JSON-LD object with "@type": "BlogPosting".
   - Use the topic and brief to fill "headline" and "description".
   - If possible, infer a sensible "mainEntityOfPage" from the slug or URL info.
   - Use the brand/organization name from the brief where appropriate (e.g. as author or publisher).

2. FAQ schema as a JSON-LD object with "@type": "FAQPage".
   - Include 4–5 Question/acceptedAnswer pairs.
   - Questions and answers must align with the topic, brand description, and target audience.
   - Answers should be concise but informative (roughly 40–80 words).

Format everything as a single multiline STRING like:

1. { ...BlogPosting JSON-LD... }
2. { ...FAQPage JSON-LD... }

Do NOT include markdown fences or commentary. The outer response must remain valid JSON where output13 is a single string value containing these two numbered JSON-LD blocks.

14 → Readability & risk notes  
15 → Checklist verification  

Return strictly valid JSON now.
  `;

  // -----------------------------
  // STEP 2 — CALL OPENAI
  // -----------------------------
  let outputsPartial = {};
  try {
    const shortResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: SHORT_OUTPUTS_PROMPT }],
          temperature: 0.5,
          max_tokens: 3000
        }),
      }
    );

    const shortRaw = await shortResponse.json();
    let text = shortRaw.choices?.[0]?.message?.content || "";

    // Clean markdown fences
    if (text.startsWith("```")) {
      const firstNL = text.indexOf("\n");
      text = text.substring(firstNL + 1);
      const lastFence = text.lastIndexOf("```");
      if (lastFence !== -1) text = text.substring(0, lastFence);
    }

    outputsPartial = JSON.parse(text.trim());
} catch (err) {
  // Roll back reserved credit because generation failed
    await rollbackOneBlogCredit({
    uid,
    websiteId,
    ownerUid: reservation.ownerUid,
    usedExtraCredit: reservation.usedExtraCredit,
  });


  return res.status(500).json({
    ok: false,
    error: "Error generating secondary outputs.",
    detail: String(err),
  });
}

  // ---------------------------------------
  // OPTIONAL: apply internal links (Output 9) into the article HTML
  // ---------------------------------------
function applyInternalLinksToArticle(rawHtml, internalLinksTable) {
  if (!rawHtml || typeof rawHtml !== "string") return rawHtml;
  if (!internalLinksTable || typeof internalLinksTable !== "string") return rawHtml;

  const lines = internalLinksTable
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return rawHtml; // only header or empty

  // Parse rows: Anchor | URL | Purpose
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split("|").map((p) => p.trim());
    if (parts.length < 2) continue;
    const anchor = parts[0];
   let url = parts[1];

// Normalize URL: if user/model gives "www.domain.com" (no scheme),
// browsers treat it as relative and prefix current site.
// Force absolute https:// links.
if (url && !/^https?:\/\//i.test(url)) {
  url = "https://" + url.replace(/^\/+/, "");
}

    const purpose = parts[2] || "";
    if (!anchor || !url) continue;
    rows.push({ anchor, url, purpose });
  }
  if (!rows.length) return rawHtml;

  // Helper: attempt to link inside specific tag blocks (e.g., <p>...</p>)
  function linkInsideTagBlocks(html, tagName, row) {
    const { anchor, url } = row;
    const anchorEsc = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reBlock = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");

    let replaced = false;
    const out = html.replace(reBlock, (block) => {
      if (replaced) return block;

      // Never add links into blocks that already contain <a> (avoid nesting / weirdness)
      if (/<a\b/i.test(block)) return block;

      // Find anchor inside this block (case-insensitive)
      const reAnchor = new RegExp(anchorEsc, "i");
      const m = block.match(reAnchor);
      if (!m) return block;

      // Preserve the exact casing from the block
      const matchText = m[0];
      const linked = `<a href="${url}" target="_blank" rel="noopener noreferrer">${matchText}</a>`;

      // Replace only first occurrence within this block
      replaced = true;
      return block.replace(reAnchor, linked);
    });

    return { html: out, replaced };
  }

  let htmlWithLinks = rawHtml;
  const extraLinkLines = [];

  for (const row of rows) {
    // 1) Prefer BODY COPY: <p> blocks
    let r = linkInsideTagBlocks(htmlWithLinks, "p", row);
    htmlWithLinks = r.html;
    if (r.replaced) continue;

    // 2) Allow occasionally in <h2>/<h3> (but NEVER in <h1>)
    r = linkInsideTagBlocks(htmlWithLinks, "h2", row);
    htmlWithLinks = r.html;
    if (r.replaced) continue;

    r = linkInsideTagBlocks(htmlWithLinks, "h3", row);
    htmlWithLinks = r.html;
    if (r.replaced) continue;

    // 3) If no placement found, add to Further reading
    extraLinkLines.push(
      `<a href="${row.url}" target="_blank" rel="noopener noreferrer">${row.anchor}</a>` +
        (row.purpose ? ` — ${row.purpose}` : "")
    );
  }

  // Append "Further reading" if needed
  if (extraLinkLines.length > 0) {
    htmlWithLinks += `\n\n<p><strong>Further reading:</strong><br>${extraLinkLines.join("<br>")}</p>`;
  }

  // Absolute safety: ensure we did not accidentally link in <h1>
  htmlWithLinks = htmlWithLinks.replace(
    /(<h1\b[^>]*>[\s\S]*?)<a\b[^>]*>([\s\S]*?)<\/a>([\s\S]*?<\/h1>)/gi,
    "$1$2$3"
  );

  return htmlWithLinks;
}


  // Build article with internal links applied (if Output 9 is present)
  const articleWithLinks = applyInternalLinksToArticle(
    articleText,
    outputsPartial && outputsPartial.output9
  );

  // ---------------------------------------
  // STITCH FINAL OUTPUT
  // ---------------------------------------
  const finalOutputs = {
    ...outputsPartial,
    output8: articleWithLinks // insert long article with internal links applied
  };

  return res.status(200).json({
    ok: true,
    receivedBrief: brief,
    outputs: finalOutputs
  });
}
