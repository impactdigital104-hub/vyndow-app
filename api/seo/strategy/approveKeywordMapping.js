// api/seo/strategy/approveKeywordMapping.js
//
// STEP 6 — Approve & Lock keywordMapping
//
// HARD RULES:
// - Cannot approve unless keywordClustering.approved === true
// - Cannot approve unless keywordMapping exists
// - If already approved, returns ok with generationLocked
// - On approval: sets approved=true, approvedAt=timestamp
//   and sets finalVersion = userVersion (if present) else keeps current doc
//
// After approval, Step 7 should remain disabled until keywordMapping.approved === true

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

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const uid = await getUidFromRequest(req);
    const { websiteId } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);
    const db = admin.firestore();

    const keywordClusteringRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordClustering`
    );

    const keywordMappingRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordMapping`
    );

    // Must have Step 5 approved
    const kcSnap = await keywordClusteringRef.get();
    if (!kcSnap.exists) {
      return res.status(400).json({ error: "Missing keywordClustering. Complete Step 5 first." });
    }
    const kc = kcSnap.data() || {};
    if (kc?.approved !== true) {
      return res.status(400).json({
        error: "Cannot approve Step 6 because Step 5 (keywordClustering) is not approved.",
      });
    }

    const kmSnap = await keywordMappingRef.get();
    if (!kmSnap.exists) {
      return res.status(400).json({
        error: "keywordMapping missing. Generate Step 6 first.",
      });
    }

    const km = kmSnap.data() || {};
    if (km?.approved === true) {
      return res.status(200).json({ ok: true, generationLocked: true });
    }

    const userVersion = km?.userVersion || null;

    const update = {
      approved: true,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      finalVersion: userVersion ? userVersion : {
        existingPages: km.existingPages || [],
        gapPages: km.gapPages || [],
        deploymentStats: km.deploymentStats || null,
      },
    };

    await keywordMappingRef.set(update, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("approveKeywordMapping error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
