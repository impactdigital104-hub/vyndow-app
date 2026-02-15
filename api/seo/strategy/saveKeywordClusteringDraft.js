// api/seo/strategy/saveKeywordClusteringDraft.js
//
// STEP 5 — Save Draft
// Writes ONLY userVersion (pillar label rename, add/remove keywords).
// Must validate: no duplicates across all clusters.

import admin from "../../firebaseAdmin";

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

function validateNoDuplicates(pillars) {
  const seen = new Map(); // kw -> "p::c"
  const dups = [];

  for (const p of pillars || []) {
    for (const c of p?.clusters || []) {
      for (const kw of c?.keywords || []) {
        const k = safeKey(kw?.keyword);
        if (!k) continue;
        const loc = `${p.pillarId}::${c.clusterId}`;
        if (seen.has(k) && seen.get(k) !== loc) {
          dups.push({ keyword: kw.keyword, first: seen.get(k), second: loc });
        } else {
          seen.set(k, loc);
        }
      }
    }
  }

  return dups;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const { websiteId, userVersion } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });
    if (!userVersion) return res.status(400).json({ error: "Missing userVersion" });

    const { effectiveUid, effectiveWebsiteId } =
      await resolveEffectiveContext(uid, websiteId);

    const db = admin.firestore();

    const keywordClusteringRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordClustering`
    );

    const snap = await keywordClusteringRef.get();
    if (!snap.exists) {
      return res.status(400).json({
        error: "keywordClustering doc missing. Generate Step 5 first.",
      });
    }

    const existing = snap.data() || {};

    if (existing?.approved === true) {
      return res.status(400).json({
        error:
          "Step 5 is already approved and locked. Draft edits are not allowed.",
      });
    }

    const pillars = Array.isArray(userVersion?.pillars) ? userVersion.pillars : [];
    const shortlist = Array.isArray(userVersion?.shortlist) ? userVersion.shortlist : [];

    const dups = validateNoDuplicates(pillars);
    if (dups.length) {
      return res.status(400).json({
        error: "Duplicate keywords detected across clusters. Please remove duplicates before saving.",
        duplicates: dups,
      });
    }

    // Persist draft
    await keywordClusteringRef.set(
      {
        userVersion: {
          pillars,
          shortlist,
          editedByUser: true,
        },
        validation: {
          ...(existing.validation || {}),
          currentShortlistCount: shortlist.length,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("saveKeywordClusteringDraft error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
