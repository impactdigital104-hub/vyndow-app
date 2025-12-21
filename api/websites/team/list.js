// api/websites/team/list.js
import admin from "../../firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(200).json({ ok: true, message: "Use GET." });
  }

  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 2) Validate inputs
    const websiteId = (req.query?.websiteId || "").trim();
    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "websiteId is required." });
    }

    const db = admin.firestore();

    // 3) Load seat limit from user doc (usersIncluded)
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const usersIncluded = userSnap.exists ? Number(userSnap.data()?.usersIncluded ?? 1) : 1;

    // 4) Ensure owner is always a member (idempotent)
    const ownerMemberRef = db.doc(`users/${uid}/websites/${websiteId}/members/${uid}`);
    const ownerMemberSnap = await ownerMemberRef.get();
    if (!ownerMemberSnap.exists) {
      await ownerMemberRef.set(
        {
          uid,
          email: decoded.email || "",
          name: decoded.name || "",
          role: "owner",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // 5) Read members
    const membersSnap = await db.collection(`users/${uid}/websites/${websiteId}/members`).get();
    const members = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 6) Read pending invites
    const invitesSnap = await db
      .collection(`users/${uid}/websites/${websiteId}/invites`)
      .orderBy("invitedAt", "desc")
      .get();

    const invites = invitesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return res.status(200).json({
      ok: true,
      websiteId,
      seatLimit: usersIncluded,
      seatsUsed: members.length,
      members,
      invites,
    });
  } catch (e) {
    console.error("websites/team/list error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error." });
  }
}
