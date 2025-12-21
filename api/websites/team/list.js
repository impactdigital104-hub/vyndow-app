// api/websites/team/list.js
import admin from "../../firebaseAdmin";
const debugVersion = "team-list-v2";


export default async function handler(req, res) {
  if (req.method !== "GET") {
   return res.status(200).json({ ok: true, message: "Use GET.", debugVersion });
  }

  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing auth token.", debugVersion });


    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 2) Validate inputs
    const websiteId = (req.query?.websiteId || "").trim();
    if (!websiteId) {
   return res.status(400).json({ ok: false, error: "websiteId is required.", debugVersion });

    }

    const db = admin.firestore();

    // 3) Load seat limit (robust)
    // Priority:
    // A) users/{uid}.usersIncluded
    // B) users/{uid}/modules/seo.usersIncluded
    // C) users/{uid}/websites/{websiteId}.usersIncluded (if you store it there)
    // D) default = 1
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();

    let usersIncludedRaw = userSnap.exists ? userSnap.data()?.usersIncluded : undefined;

    function toPositiveInt(v) {
      const n = parseInt(String(v ?? ""), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    let usersIncluded = toPositiveInt(usersIncludedRaw);

    // Fallback to modules/seo if needed
    if (!usersIncluded) {
      const seoRef = db.doc(`users/${uid}/modules/seo`);
      const seoSnap = await seoRef.get();
      usersIncluded = toPositiveInt(seoSnap.exists ? seoSnap.data()?.usersIncluded : undefined);
    }

    // Fallback to website doc if needed
    if (!usersIncluded) {
      const wRef = db.doc(`users/${uid}/websites/${websiteId}`);
      const wSnap = await wRef.get();
      usersIncluded = toPositiveInt(wSnap.exists ? wSnap.data()?.usersIncluded : undefined);
    }

    // Final fallback
    if (!usersIncluded) usersIncluded = 1;

    // 4) Ensure owner is always a member (force write, idempotent)
    const ownerMemberRef = db.doc(`users/${uid}/websites/${websiteId}/members/${uid}`);
    await ownerMemberRef.set(
      {
        uid,
        email: decoded.email || "",
        name: decoded.name || "",
        role: "owner",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // only set createdAt if missing (approximation: keep it stable after first write)
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );


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
      debugVersion,
      websiteId,
      seatLimit: usersIncluded,
      seatsUsed: members.length,
      members,
      invites,
    });
  } catch (e) {
    console.error("websites/team/list error:", e);
   return res.status(500).json({ ok: false, error: e?.message || "Unknown error.", debugVersion });
  }
}
