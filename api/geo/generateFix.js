// api/geo/generateFix.js
import admin from "../firebaseAdmin";

/* ---------------- AUTH ---------------- */

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

/* ---------------- ACCESS CONTROL ---------------- */

// Same membership resolution pattern as /api/geo/runDetail.js
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
    const memberRef = db.doc(
      `users/${ownerUid}/websites/${websiteId}/members/${uid}`
    );
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      const err = new Error("NO_ACCESS");
      err.code = "NO_ACCESS";
      throw err;
    }
  }

  return { ownerUid };
}

/* ---------------- OPENAI ---------------- */

async function callOpenAIForFixes({ url, signals }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error("OPENAI_API_KEY is missing.");
    err.code = "OPENAI_KEY_MISSING";
    throw err;
  }

  // Keep prompts small + deterministic. Output MUST be JSON only.
  const system = `
You are Vyndow GEO Fix Generator.
Return ONLY valid JSON (no markdown, no commentary).
Do NOT invent facts. If a fact is unknown, use a placeholder like {{ADD_DATE}} or {{ADD_ENTITY}}.
No external links.
Language: English.
  `.trim();

  const user = `
We analyzed a web page for GEO readiness.

URL: ${url}

Signals:
- title: ${JSON.stringify(signals.title || "")}
- h1Count: ${Number(signals.h1Count || 0)}
- h2Count: ${Number(signals.h2Count || 0)}
- wordCount: ${Number(signals.wordCount || 0)}
- jsonLdPresent: ${Boolean(signals.jsonLdPresent)}
- updatedSignalFound: ${Boolean(signals.updatedSignalFound)}
- geoScore: ${typeof signals.geoScore === "number" ? signals.geoScore : null}
- issues: ${JSON.stringify(Array.isArray(signals.issues) ? signals.issues : [])}
- suggestions: ${JSON.stringify(
    Array.isArray(signals.suggestions) ? signals.suggestions : []
  )}

Task:
Generate paste-ready improvement blocks for this page to improve GEO score.

Return JSON with EXACT keys:
{
  "tldr": string,
  "implementationMap": array,
  "combinedPatchPack": string,
  "updatedReviewedSnippet": string,
  "entityBlock": string,
  "faqHtml": string,
  "faqJsonLd": object,
  "faqJsonLdScript": string
}


Rules:
- Output must be READY TO PUBLISH (copy/paste), not advice.
- Do NOT invent facts. If a fact is unknown, use placeholders like {{ADD_DURATION}}, {{ADD_PRICE}}, {{ADD_DATE}}.
- updatedReviewedSnippet: short HTML snippet (1-2 lines) suitable to place directly below the page title.
  - If updatedSignalFound is false, include "Updated on: {{ADD_DATE}}".
- entityBlock: HTML block (not plain text). Use a small heading + bullet list.
- faqHtml: HTML section with 4–6 FAQs. Keep questions specific to this page’s topic.
- faqJsonLd: valid FAQPage JSON object (not a string).
- faqJsonLdScript: MUST be a full <script type="application/ld+json">...</script> string containing the faqJsonLd JSON.
- implementationMap: array of 4–6 steps. Each step MUST be an object:
  { "step": number, "title": string, "whereToPaste": string, "copyKey": string, "notes": string }
- copyKey must be one of:
  "updatedReviewedSnippet" | "entityBlock" | "faqHtml" | "faqJsonLdScript" | "combinedPatchPack"
- combinedPatchPack: a SINGLE paste-ready bundle that contains, in this order:
  1) updatedReviewedSnippet
  2) entityBlock
  3) faqHtml
  4) faqJsonLdScript
  Wrap it with:
  <!-- VYNDOW GEO PATCH PACK START -->
  <!-- VYNDOW GEO PATCH PACK END -->
- Keep tldr to 2-4 bullets, each starting with "- ".
- No markdown, no code fences, JSON only.
  `.trim();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
body: JSON.stringify({
  model: "gpt-4o",
  messages: [
    { role: "system", content: system },
    { role: "user", content: user },
  ],
  temperature: 0.2,
  response_format: { type: "json_object" },
}),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg =
      data?.error?.message ||
      `OpenAI error (status ${resp.status}) generating fixes`;
    throw new Error(msg);
  }

  const text = data?.choices?.[0]?.message?.content || "";

  function extractJsonObject(s) {
    const str = String(s || "").trim();

    // If wrapped in ```json ... ```
    const fenced = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) return fenced[1].trim();

    // Try to locate first {...} block
    const firstBrace = str.indexOf("{");
    const lastBrace = str.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return str.slice(firstBrace, lastBrace + 1);
    }
    return str;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    try {
      parsed = JSON.parse(extractJsonObject(text));
    } catch (e2) {
      throw new Error("MODEL_RETURNED_NON_JSON");
    }
  }

  // Minimal shape validation
  const required = [
    "tldr",
    "implementationMap",
    "combinedPatchPack",
    "updatedReviewedSnippet",
    "entityBlock",
    "faqHtml",
    "faqJsonLd",
    "faqJsonLdScript",
  ];

  for (const k of required) {
    if (!(k in parsed)) throw new Error(`MISSING_KEY_${k}`);
  }

  if (!Array.isArray(parsed.implementationMap)) {
    throw new Error("BAD_IMPLEMENTATION_MAP");
  }
  if (typeof parsed.combinedPatchPack !== "string") {
    throw new Error("BAD_PATCH_PACK");
  }


  return parsed;
}

/* ---------------- HANDLER ---------------- */

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);
    const { runId, websiteId, pageId } = req.body || {};

    if (!websiteId)
      return res.status(400).json({ ok: false, error: "Missing websiteId" });
    if (!runId)
      return res.status(400).json({ ok: false, error: "Missing runId" });
    if (!pageId)
      return res.status(400).json({ ok: false, error: "Missing pageId" });

    const { ownerUid } = await resolveWebsiteContext({ uid, websiteId });

    const db = admin.firestore();

    // Load + verify run ownership
    const runRef = db.doc(`geoRuns/${runId}`);
    const runSnap = await runRef.get();
    if (!runSnap.exists) {
      return res.status(404).json({ ok: false, error: "RUN_NOT_FOUND" });
    }
    const run = runSnap.data() || {};
    if (run.ownerUid !== ownerUid || run.websiteId !== websiteId) {
      return res.status(403).json({ ok: false, error: "NO_ACCESS_TO_RUN" });
    }

    // Load page
    const pageRef = runRef.collection("pages").doc(pageId);
    const pageSnap = await pageRef.get();
    if (!pageSnap.exists) {
      return res.status(404).json({ ok: false, error: "PAGE_NOT_FOUND" });
    }

    const page = pageSnap.data() || {};
    if ((page.status || "") !== "analyzed") {
      return res.status(400).json({
        ok: false,
        error: "PAGE_NOT_ANALYZED_YET",
      });
    }

    const url = page.url || "";
    if (!url) {
      return res.status(400).json({ ok: false, error: "PAGE_URL_MISSING" });
    }

    const signals = {
      title: page.title || "",
      h1Count: page.h1Count || 0,
      h2Count: page.h2Count || 0,
      wordCount: page.wordCount || 0,
      jsonLdPresent: Boolean(page.jsonLdPresent),
      updatedSignalFound: Boolean(page.updatedSignalFound),
      geoScore: typeof page.geoScore === "number" ? page.geoScore : null,
      issues: Array.isArray(page.issues) ? page.issues : [],
      suggestions: Array.isArray(page.suggestions) ? page.suggestions : [],
    };

    // Generate fixes
    const fixes = await callOpenAIForFixes({ url, signals });

    // Save fixes to Firestore
    await pageRef.set(
      {
        fixes,
        fixesGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Re-read updated doc to return to UI
    const updatedSnap = await pageRef.get();
    const updated = updatedSnap.data() || {};

    // Return in the UI-friendly shape (id matches your UI usage)
    return res.status(200).json({
      ok: true,
      page: {
        id: pageId,
        pageId,
        url: updated.url || url,
        status: updated.status || page.status,
        geoScore: updated.geoScore ?? null,
        issues: updated.issues ?? [],
        suggestions: updated.suggestions ?? [],
        fixes: updated.fixes ?? null,
        fixesGeneratedAt: updated.fixesGeneratedAt ?? null,
        updatedAt: updated.updatedAt ?? null,
      },
    });
  } catch (e) {
    console.error("GEO generateFix error:", e);
    return res.status(400).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
