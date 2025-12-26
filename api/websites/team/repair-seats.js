// api/websites/team/repair-seats.js
import admin from "../../firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true, message: "Use POST." });

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const websiteId = (req.body?.websiteId || "").trim();
    if (!websiteId) return res.status(400).json({ ok: false, error: "websiteId is required." });

    const db = admin.firestore();
    const websiteRef = db.doc(`users/${uid}/websites/${websiteId}`);
    const membersCol = db.collection(`users/${uid}/websites/${websiteId}/members`);

    await db.runTransaction(async (tx) => {
      const membersSnap = await tx.get(membersCol);
      const seatsUsed = Math.max(1, membersSnap.size); // members includes owner doc
      tx.set(websiteRef, { seatsUsed, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("websites/team/repair-seats error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error." });
  }
}
