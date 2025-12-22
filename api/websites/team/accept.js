// api/websites/team/accept.js
import admin from "../../firebaseAdmin";
import crypto from "crypto";

function sha256(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

export default async function handler(req, res) {
  // IMPORTANT: allow POST only (but don't throw 405 from Vercel/Next confusion)
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    // 1) Verify Firebase ID token (the accepting user must be logged in)
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const accepterUid = decoded.uid;
    const accepterEmail = (decoded.email || "").toLowerCase();

    // 2) Validate input token (from the invite email URL)
    const token = (req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "Missing invite token." });

    const tokenHash = sha256(token);

    const db = admin.firestore();

    // 3) Find the invite by tokenHash (collectionGroup query)
    // This requires that your invite documents store `tokenHash`.
    const cg = await db.collectionGroup("invites").where("tokenHash", "==", tokenHash).limit(1).get();
    if (cg.empty) {
      return res.status(404).json({ ok: false, error: "INVITE_NOT_FOUND", details: "Token not found/expired." });
    }

    const inviteDoc = cg.docs[0];
    const inviteRef = inviteDoc.ref;
    const invite = inviteDoc.data() || {};

    // Path: users/{ownerUid}/websites/{websiteId}/invites/{inviteId}
    const parts = inviteRef.path.split("/");
    const ownerUid = parts[1];
    const websiteId = parts[3];
    const inviteId = parts[5];

    // 4) Enforce: must match invited email (security)
    const invitedEmail = (invite.email || "").toLowerCase();
    if (!accepterEmail || !invitedEmail || accepterEmail !== invitedEmail) {
      return res.status(403).json({
        ok: false,
        error: "INVITE_EMAIL_MISMATCH",
        details: "You must be logged in with the same email that received the invite.",
      });
    }

    // 5) Accept inside a transaction (seat check + member creation + invite update)
    await db.runTransaction(async (tx) => {
      const freshInviteSnap = await tx.get(inviteRef);
      if (!freshInviteSnap.exists) throw new Error("INVITE_NOT_FOUND");

      const fresh = freshInviteSnap.data() || {};
      if (fresh.status !== "pending") {
        throw new Error("INVITE_NOT_PENDING");
      }

      // seat limit lookup (same fallback pattern as invite.js v2)
      function toPositiveInt(v) {
        const n = parseInt(String(v ?? ""), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      }

      const userRef = db.doc(`users/${ownerUid}`);
      const userSnap = await tx.get(userRef);
      let usersIncluded = toPositiveInt(userSnap.exists ? userSnap.data()?.usersIncluded : undefined);

      if (!usersIncluded) {
        const seoRef = db.doc(`users/${ownerUid}/modules/seo`);
        const seoSnap = await tx.get(seoRef);
        usersIncluded = toPositiveInt(seoSnap.exists ? seoSnap.data()?.usersIncluded : undefined);
      }

      if (!usersIncluded) {
        const wRef = db.doc(`users/${ownerUid}/websites/${websiteId}`);
        const wSnap = await tx.get(wRef);
        usersIncluded = toPositiveInt(wSnap.exists ? wSnap.data()?.usersIncluded : undefined);
      }

      if (!usersIncluded) usersIncluded = 1;

      const membersCol = db.collection(`users/${ownerUid}/websites/${websiteId}/members`);
      const membersSnap = await tx.get(membersCol);
      const seatsUsed = membersSnap.size;

      if (seatsUsed >= usersIncluded) {
        const err = new Error("SEAT_LIMIT_REACHED");
        err.details = `Seat limit: ${usersIncluded}, current members: ${seatsUsed}`;
        throw err;
      }

      // prevent duplicate member
      const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${accepterUid}`);
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists) {
        tx.set(memberRef, {
          uid: accepterUid,
          email: accepterEmail,
          role: fresh.role || "member",
          joinedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // mark invite accepted & invalidate token
      tx.set(
        inviteRef,
        {
          status: "accepted",
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
          acceptedByUid: accepterUid,
          acceptedByEmail: accepterEmail,
          tokenHash: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return res.status(200).json({ ok: true, ownerUid, websiteId, inviteId });
  } catch (e) {
    console.error("websites/team/accept error:", e);
    const msg = e?.message || "Unknown error.";

    if (msg === "INVITE_NOT_PENDING") {
      return res.status(409).json({ ok: false, error: "INVITE_NOT_PENDING" });
    }
    if (msg === "SEAT_LIMIT_REACHED") {
      return res.status(403).json({ ok: false, error: "SEAT_LIMIT_REACHED", details: e.details || "" });
    }

    return res.status(500).json({ ok: false, error: msg });
  }
}
