// api/websites/team/accept.js
import admin from "../../firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    // 1) Verify Firebase ID token (invitee must be logged in)
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(token);
    const inviteeUid = decoded.uid;
    const inviteeEmail = (decoded.email || "").toLowerCase();

    // 2) Validate input
    const inviteToken = (req.body?.token || "").trim();
    if (!inviteToken) return res.status(400).json({ ok: false, error: "token is required." });

    const db = admin.firestore();

    // 3) Find invite by token across all owners/websites (collectionGroup)
    const q = await db
      .collectionGroup("invites")
      .where("token", "==", inviteToken)
      .limit(1)
      .get();

    if (q.empty) {
      return res.status(404).json({ ok: false, error: "INVITE_NOT_FOUND" });
    }

    const inviteDoc = q.docs[0];
    const inviteData = inviteDoc.data() || {};

    // Expected path: users/{ownerUid}/websites/{websiteId}/invites/{inviteId}
    const path = inviteDoc.ref.path.split("/");
    const ownerUid = path[1];
    const websiteId = path[3];
    const inviteId = path[5];

    if (!ownerUid || !websiteId || !inviteId) {
      return res.status(500).json({ ok: false, error: "INVITE_PATH_INVALID" });
    }

    // 4) Basic checks
    if (inviteData.status && inviteData.status !== "pending") {
      return res.status(409).json({ ok: false, error: "INVITE_NOT_PENDING", status: inviteData.status });
    }

    // Email match safety (V1)
    const invitedEmail = (inviteData.email || "").toLowerCase();
    if (invitedEmail && inviteeEmail && invitedEmail !== inviteeEmail) {
      return res.status(403).json({
        ok: false,
        error: "EMAIL_MISMATCH",
        details: "You are logged in with a different email than the invite was sent to.",
      });
    }

    // Expiry check (if present)
    if (inviteData.tokenExpiresAt && inviteData.tokenExpiresAt.toDate) {
      const exp = inviteData.tokenExpiresAt.toDate().getTime();
      if (Date.now() > exp) {
        return res.status(410).json({ ok: false, error: "INVITE_EXPIRED" });
      }
    }

    const ownerUserRef = db.doc(`users/${ownerUid}`);
    const websiteRef = db.doc(`users/${ownerUid}/websites/${websiteId}`);
    const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${inviteeUid}`);
    const inviteRef = db.doc(`users/${ownerUid}/websites/${websiteId}/invites/${inviteId}`);

    // 5) Transaction: enforce seats + add member + mark invite accepted + create website copy for invitee
    await db.runTransaction(async (tx) => {
      // seat limit from owner user doc (already used elsewhere)
      const ownerSnap = await tx.get(ownerUserRef);
      const usersIncluded = ownerSnap.exists ? Number(ownerSnap.data()?.usersIncluded ?? 1) : 1;

      // count members
      const membersSnap = await tx.get(db.collection(`users/${ownerUid}/websites/${websiteId}/members`));
      const seatsUsed = membersSnap.size;

      if (seatsUsed >= usersIncluded) {
        throw new Error("SEAT_LIMIT_REACHED");
      }

      // load website details to copy
      const websiteSnap = await tx.get(websiteRef);
      const website = websiteSnap.exists ? (websiteSnap.data() || {}) : {};

      // add member
      tx.set(
        memberRef,
        {
          uid: inviteeUid,
          email: inviteeEmail || invitedEmail || "",
          name: inviteData.name || "",
          role: inviteData.role || "member",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // mark invite accepted (do not delete; keep audit trail)
      tx.set(
        inviteRef,
        {
          status: "accepted",
          acceptedByUid: inviteeUid,
          acceptedByEmail: inviteeEmail || "",
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // create "website copy" under invitee so it appears in /seo dropdown
      // IMPORTANT: /seo loads from users/{uid}/websites
      const inviteeWebsiteRef = db.doc(`users/${inviteeUid}/websites/${websiteId}`);
      tx.set(
        inviteeWebsiteRef,
        {
          name: website.name || website.websiteName || "Shared Website",
          domain: website.domain || "",
          ownerUid,
          shared: true,
          sourceWebsiteId: websiteId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          profile: website.profile || {
            brandDescription: "",
            targetAudience: "",
            toneOfVoice: [],
            readingLevel: "",
            geoTarget: "",
            industry: "general",
          },
        },
        { merge: true }
      );
    });

    return res.status(200).json({
      ok: true,
      ownerUid,
      websiteId,
      inviteId,
    });
  } catch (e) {
    const msg = e?.message || "Unknown error.";
    if (msg === "SEAT_LIMIT_REACHED") {
      return res.status(403).json({ ok: false, error: "SEAT_LIMIT_REACHED" });
    }
    console.error("websites/team/accept error:", e);
    return res.status(500).json({ ok: false, error: msg });
  }
}
