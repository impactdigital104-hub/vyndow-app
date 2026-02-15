// api/seo/strategy/saveKeywordMappingDraft.js
//
// STEP 6 — Save Draft (user edits) for keywordMapping
//
// HARD RULES enforced:
// - Cannot edit if keywordMapping.approved === true
// - No duplicate primary keywords across existingPages
// - Secondary keywords max 5 per page
// - No secondary keyword items with similarity < 0.75 (if provided with similarity)
// - Primary keyword must be present OR null (allowed), but if present must be unique
//
// Stores edits into:
// keywordMapping.userVersion
//
// Does NOT regenerate. Only saves user edits.

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

function safeKey(s) {
  return String(s || "").trim().toLowerCase();
}

function isFiniteNumber(x) {
  return Number.isFinite(Number(x));
}

function validateExistingPages(existingPages) {
  if (!Array.isArray(existingPages)) throw new Error("existingPages must be an array.");

  // Unique primary keywords across pages
  const seen = new Set();

  for (const p of existingPages) {
    const pk = p?.primaryKeyword;

    if (pk === null || pk === undefined) {
      // allowed
    } else if (typeof pk === "string") {
      const key = safeKey(pk);
      if (key) {
        if (seen.has(key)) throw new Error(`Duplicate primary keyword not allowed: "${pk}"`);
        seen.add(key);
      }
    } else if (typeof pk === "object") {
      // allow either {keyword: "..."} or null
      const kw = pk?.keyword;
      const key = safeKey(kw);
      if (key) {
        if (seen.has(key)) throw new Error(`Duplicate primary keyword not allowed: "${kw}"`);
        seen.add(key);
      }
    } else {
      throw new Error("primaryKeyword must be string | object | null");
    }

    // secondary keywords cap
    const secondary = p?.secondaryKeywords;
    if (secondary !== undefined && secondary !== null) {
      if (!Array.isArray(secondary)) throw new Error("secondaryKeywords must be an array if provided.");
      if (secondary.length > 5) throw new Error("secondaryKeywords cannot exceed 5 per page.");

      // optional similarity threshold check (only if similarity provided)
      for (const s of secondary) {
        if (typeof s === "string") continue;
        if (typeof s === "object") {
          if (s?.similarity !== undefined && s?.similarity !== null) {
            if (!isFiniteNumber(s.similarity)) throw new Error("secondaryKeywords[].similarity must be a number.");
            if (Number(s.similarity) < 0.75) {
              throw new Error(`Cannot save secondary keyword with similarity < 0.75: "${s.keyword || ""}"`);
            }
          }
          continue;
        }
        throw new Error("secondaryKeywords items must be string or object.");
      }
    }
  }
}

function validateGapPages(gapPages) {
  if (!Array.isArray(gapPages)) throw new Error("gapPages must be an array.");

  for (const g of gapPages) {
    // minimal checks (UI may allow edits)
    if (g?.suggestedSlug && typeof g.suggestedSlug !== "string") throw new Error("gapPages[].suggestedSlug must be string.");
    if (g?.pageType && typeof g.pageType !== "string") throw new Error("gapPages[].pageType must be string.");
    if (g?.recommendedWordCount !== undefined && g?.recommendedWordCount !== null) {
      if (!isFiniteNumber(g.recommendedWordCount)) throw new Error("gapPages[].recommendedWordCount must be a number.");
    }

    const secondary = g?.secondaryKeywords;
    if (secondary !== undefined && secondary !== null) {
      if (!Array.isArray(secondary)) throw new Error("gapPages[].secondaryKeywords must be an array if provided.");
      if (secondary.length > 5) throw new Error("gapPages[].secondaryKeywords cannot exceed 5.");
    }
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const uid = await getUidFromRequest(req);
    const { websiteId, userVersion } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });
    if (!userVersion || typeof userVersion !== "object") {
      return res.status(400).json({ error: "Missing userVersion payload" });
    }

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);
    const db = admin.firestore();

    const keywordMappingRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordMapping`
    );

    const kmSnap = await keywordMappingRef.get();
    if (!kmSnap.exists) {
      return res.status(400).json({
        error: "keywordMapping does not exist yet. Run Step 6 Generate first.",
      });
    }

    const km = kmSnap.data() || {};
    if (km?.approved === true) {
      return res.status(400).json({
        error: "keywordMapping is already approved and locked. Manual deletion is required to regenerate.",
      });
    }

    // validate payload
    const existingPages = userVersion.existingPages;
    const gapPages = userVersion.gapPages;

    validateExistingPages(existingPages);
    validateGapPages(gapPages);

    // deploymentStats can be recomputed later; accept if present
    const next = {
      ...km,
      userVersion: {
        existingPages,
        gapPages,
        deploymentStats: userVersion.deploymentStats || km.deploymentStats || null,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await keywordMappingRef.set(next, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("saveKeywordMappingDraft error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
