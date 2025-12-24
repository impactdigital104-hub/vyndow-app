// api/websites/team/accept.js
import admin from "../../firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "HTTP_405" });
  }

  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const userEmail = (decoded.email || "").toLowerCase();

    const { token: inviteToken } = req.body || {};
    if (!inviteToken) return res.status(400).json({ ok: false, error: "Missing invite token." });

    const db = admin.firestore();

    // 2) Direct lookup (NO collectionGroup)
    const tokenRef = db.doc(`inviteTokens/${inviteToken}`);
    const tokenSnap = await tokenRef.get();

    if (!tokenSnap.exists) {
      return res.status(400).json({
        ok: false,
        error: "Invalid or expired invite token. (token not found)",
      });
    }

    const tokenData = tokenSnap.data() || {};
    const ownerUid = tokenData.ownerUid;
    const websiteId = tokenData.websiteId;
    const inviteId = tokenData.inviteId;
    const invitedEmail = (tokenData.email || "").toLowerCase();
    const role = tokenData.role || "member";

    if (!ownerUid || !websiteId || !inviteId || !invitedEmail) {
      return res.status(400).json({
        ok: false,
        error: "Invite token record is incomplete.",
        tokenData,
      });
    }

    // 3) Enforce: must be logged in as the invited email
    if (!userEmail || userEmail !== invitedEmail) {
      return res.status(403).json({
        ok: false,
        error: "You are logged in with a different email than the invite was sent to.",
        expectedEmail: invitedEmail,
        currentEmail: userEmail || "(no email on auth token)",
      });
    }

    const ownerRef = db.doc(`users/${ownerUid}`);
    const websiteRef = db.doc(`users/${ownerUid}/websites/${websiteId}`);
    const inviteRef = db.doc(`users/${ownerUid}/websites/${websiteId}/invites/${inviteId}`);
    const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${uid}`);

    // 4) Transaction: check seat limit + accept invite + add member
    await db.runTransaction(async (tx) => {
      const ownerSnap = await tx.get(ownerRef);
      if (!ownerSnap.exists) throw new Error("Owner account not found.");

      const owner = ownerSnap.data() || {};
      const seatLimit = Number(owner.usersIncluded || 1);

      const websiteSnap = await tx.get(websiteRef);
      if (!websiteSnap.exists) throw new Error("Website not found.");

      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) throw new Error("Invite not found (already removed?).");

      const invite = inviteSnap.data() || {};
      if (invite.status && invite.status !== "pending") {
        throw new Error(`Invite is not pending (status=${invite.status}).`);
      }

      // Count seats used (members count)
      const membersSnap = await tx.get(db.collection(`users/${ownerUid}/websites/${websiteId}/members`));
      const seatsUsed = membersSnap.size;

      // If already a member, treat as success (idempotent)
      const existingMemberSnap = await tx.get(memberRef);
      if (!existingMemberSnap.exists) {
        if (seatsUsed >= seatLimit) {
          throw new Error(`Seat limit reached (${seatsUsed}/${seatLimit}).`);
        }

        tx.set(memberRef, {
          uid,
          email: invitedEmail,
          role,
          name: decoded.name || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      tx.update(inviteRef, {
        status: "accepted",
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        acceptedByUid: uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // remove token mapping so link can’t be reused
      tx.delete(tokenRef);
    });

    return res.status(200).json({
      ok: true,
      ownerUid,
      websiteId,
      inviteId,
      acceptedUid: uid,
      acceptedEmail: userEmail,
    });
  } catch (e) {
    console.error("websites/team/accept error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Failed to accept invite." });
  }
}
