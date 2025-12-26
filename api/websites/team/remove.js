// api/websites/team/remove.js
import admin from "../../firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 2) Validate inputs
    const websiteId = (req.body?.websiteId || "").trim();
    const memberUid = (req.body?.memberUid || "").trim();
    const inviteId = (req.body?.inviteId || "").trim();

    if (!websiteId) return res.status(400).json({ ok: false, error: "websiteId is required." });
    if (!memberUid && !inviteId) {
      return res.status(400).json({ ok: false, error: "Provide memberUid OR inviteId." });
    }

    // Safety: cannot remove self (owner) in V1
    if (memberUid && memberUid === uid) {
      return res.status(400).json({ ok: false, error: "Owner cannot be removed." });
    }

    const db = admin.firestore();

if (memberUid) {
  const websiteRef = db.doc(`users/${uid}/websites/${websiteId}`);
  const memberRef = db.doc(`users/${uid}/websites/${websiteId}/members/${memberUid}`);

  await db.runTransaction(async (tx) => {
    const websiteSnap = await tx.get(websiteRef);
    const website = websiteSnap.exists ? (websiteSnap.data() || {}) : {};
    const currentSeatsUsed = Number(website.seatsUsed ?? 1);

    tx.delete(memberRef);

    // Decrement seatsUsed but never go below 1 (owner seat)
    const nextSeatsUsed = Math.max(1, currentSeatsUsed - 1);
    tx.set(
      websiteRef,
      { seatsUsed: nextSeatsUsed, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
}


    if (inviteId) {
      const inviteRef = db.doc(`users/${uid}/websites/${websiteId}/invites/${inviteId}`);
      const inviteSnap = await inviteRef.get();
      const invite = inviteSnap.exists ? (inviteSnap.data() || {}) : {};

      // delete invite doc
      await inviteRef.delete();

      // ✅ also delete token lookup doc if token exists
      if (invite.token) {
        await db.doc(`inviteTokens/${invite.token}`).delete().catch(() => {});
      }
    }


    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("websites/team/remove error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error." });
  }
}
