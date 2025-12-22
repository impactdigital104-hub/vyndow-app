// api/websites/team/accept.js
import admin from "../../firebaseAdmin";

export default async function handler(req, res) {
  // IMPORTANT: to avoid "HTTP_405" surprises, we always return JSON even for wrong method
  if (req.method !== "POST") {
    return res.status(200).json({ ok: false, error: "USE_POST" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const inviteeUid = decoded.uid;
    const inviteeEmail = (decoded.email || "").toLowerCase();

    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "Missing invite token." });

    const db = admin.firestore();

    // ✅ Your Firestore shows invites store `token`, NOT `tokenHash`
    const q = await db.collectionGroup("invites").where("token", "==", token).limit(1).get();
    if (q.empty) return res.status(404).json({ ok: false, error: "INVITE_NOT_FOUND" });

    const inviteDoc = q.docs[0];
    const invite = inviteDoc.data() || {};

    // Expected path: users/{ownerUid}/websites/{websiteId}/invites/{inviteId}
    const parts = inviteDoc.ref.path.split("/");
    const ownerUid = parts[1];
    const websiteId = parts[3];
    const inviteId = parts[5];

    if (!ownerUid || !websiteId || !inviteId) {
      return res.status(500).json({ ok: false, error: "INVITE_PATH_INVALID" });
    }

    // Email must match invite email
    const invitedEmail = (invite.email || "").toLowerCase();
    if (!invitedEmail || !inviteeEmail || invitedEmail !== inviteeEmail) {
      return res.status(403).json({
        ok: false,
        error: "EMAIL_MISMATCH",
        details: "Login email must match the invited email.",
      });
    }

    // Expiry check
    if (invite.tokenExpiresAt && invite.tokenExpiresAt.toDate) {
      const exp = invite.tokenExpiresAt.toDate().getTime();
      if (Date.now() > exp) return res.status(410).json({ ok: false, error: "INVITE_EXPIRED" });
    }

    const ownerUserRef = db.doc(`users/${ownerUid}`);
    const websiteRef = db.doc(`users/${ownerUid}/websites/${websiteId}`);
    const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${inviteeUid}`);
    const inviteRef = db.doc(`users/${ownerUid}/websites/${websiteId}/invites/${inviteId}`);
    const inviteeWebsiteRef = db.doc(`users/${inviteeUid}/websites/${websiteId}`);

    await db.runTransaction(async (tx) => {
      const [ownerSnap, websiteSnap, memberSnap, inviteSnap] = await Promise.all([
        tx.get(ownerUserRef),
        tx.get(websiteRef),
        tx.get(memberRef),
        tx.get(inviteRef),
      ]);

      const freshInvite = inviteSnap.exists ? inviteSnap.data() : null;
      if (!freshInvite) throw new Error("INVITE_NOT_FOUND");
      if (freshInvite.status !== "pending") throw new Error("INVITE_NOT_PENDING");

      const usersIncluded = ownerSnap.exists ? Number(ownerSnap.data()?.usersIncluded ?? 1) : 1;

      const website = websiteSnap.exists ? (websiteSnap.data() || {}) : {};
      const currentCountRaw = website.memberCount;
      const memberCount = Number.isFinite(currentCountRaw) ? Number(currentCountRaw) : 1; // default owner=1

      const isNewMember = !memberSnap.exists;

      if (isNewMember && memberCount >= usersIncluded) {
        const e = new Error("SEAT_LIMIT_REACHED");
        e.details = `Seat limit ${usersIncluded}, current ${memberCount}`;
        throw e;
      }

      // Add member
      tx.set(
        memberRef,
        {
          uid: inviteeUid,
          email: inviteeEmail,
          role: freshInvite.role || "member",
          name: freshInvite.name || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Mark invite accepted & remove token so link cannot be reused
      tx.set(
        inviteRef,
        {
          status: "accepted",
          acceptedByUid: inviteeUid,
          acceptedByEmail: inviteeEmail,
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          token: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Increment counter if new member
      if (isNewMember) {
        tx.set(
          websiteRef,
          {
            memberCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      // Create website copy under invitee so it appears in dropdown
      tx.set(
        inviteeWebsiteRef,
        {
          name: website.name || "Shared Website",
          domain: website.domain || "",
          ownerUid,
          shared: true,
          sourceWebsiteId: websiteId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          profile: website.profile || {},
        },
        { merge: true }
      );
    });

    return res.status(200).json({ ok: true, ownerUid, websiteId, inviteId });
  } catch (e) {
    console.error("team/accept error:", e);
    const msg = e?.message || "Unknown error";

    if (msg === "INVITE_NOT_PENDING") return res.status(409).json({ ok: false, error: "INVITE_NOT_PENDING" });
    if (msg === "SEAT_LIMIT_REACHED") return res.status(403).json({ ok: false, error: "SEAT_LIMIT_REACHED", details: e.details || "" });

    return res.status(500).json({ ok: false, error: msg, details: e?.stack || "" });
  }
}
