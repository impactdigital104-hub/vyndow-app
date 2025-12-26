// api/websites/team/accept.js
import admin from "../../firebaseAdmin";
import { ensureWebsiteSeoModule } from "../../seoModuleProvision";


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
    code: "WRONG_EMAIL",
    invitedEmail: invitedEmail,
    currentEmail: userEmail || "",
    error:
      "You are logged in with a different email than the invite was sent to. Please sign out and sign in with the invited email to accept.",
  });
}


    const ownerRef = db.doc(`users/${ownerUid}`);
    const websiteRef = db.doc(`users/${ownerUid}/websites/${websiteId}`);
    const inviteRef = db.doc(`users/${ownerUid}/websites/${websiteId}/invites/${inviteId}`);
    const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${uid}`);
    const membersCol = db.collection(`users/${ownerUid}/websites/${websiteId}/members`);
    const inviteeWebsiteRef = db.doc(`users/${uid}/websites/${websiteId}`);
    // Ensure website-scoped SEO module exists for this workspace (auto-backfill)
await ensureWebsiteSeoModule({ admin, ownerUid, websiteId });

const websiteSeoModuleRef = db.doc(`users/${ownerUid}/websites/${websiteId}/modules/seo`);


    // 4) Transaction: check seat limit + accept invite + add member
    await db.runTransaction(async (tx) => {
      const ownerSnap = await tx.get(ownerRef);
      if (!ownerSnap.exists) throw new Error("Owner account not found.");

// Seat limit must come from the WEBSITE module (Model 1)
const websiteSeoSnap = await tx.get(websiteSeoModuleRef);
const seatsIncluded = websiteSeoSnap.exists ? (websiteSeoSnap.data() || {}).seatsIncluded : null;
const seatLimit = Number(seatsIncluded ?? 1);


      const websiteSnap = await tx.get(websiteRef);
      if (!websiteSnap.exists) throw new Error("Website not found.");
            const website = websiteSnap.data() || {};


      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) throw new Error("Invite not found (already removed?).");

      const invite = inviteSnap.data() || {};
      if (invite.status && invite.status !== "pending") {
        throw new Error(`Invite is not pending (status=${invite.status}).`);
      }

      // Robust seat enforcement (counter on website doc)
      const existingMemberSnap = await tx.get(memberRef);

      // If already a member, treat as success (idempotent)
      if (!existingMemberSnap.exists) {
      const membersSnap = await tx.get(membersCol);
const seatsUsed = Math.max(1, membersSnap.size);


        if (seatsUsed >= seatLimit) {
          throw new Error(`Seat limit reached (${seatsUsed}/${seatLimit}).`);
        }

        // Create member
        tx.set(memberRef, {
          uid,
          email: invitedEmail,
          role,
          name: decoded.name || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // ✅ Make the invited website appear in the invitee’s dashboard + SEO dropdown
        tx.set(
          inviteeWebsiteRef,
          {
            name: website.name || "Shared Website",
            domain: website.domain || "",
            ownerUid,
            shared: true,
          ownerWebsiteId: websiteId,
sourceWebsiteId: websiteId,

            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            profile: website.profile || {},
          },
          { merge: true }
        );

        // Increment seatsUsed safely
        tx.set(
          websiteRef,
          {
            seatsUsed: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
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
