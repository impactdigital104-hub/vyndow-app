// api/websites/team/accept.js
import admin from "../../../firebaseAdmin";


export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, message: "Use POST." });
  }

  try {
    // 1) Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!bearer) return res.status(401).json({ ok: false, error: "Missing auth token." });

    const decoded = await admin.auth().verifyIdToken(bearer);
    const inviteeUid = decoded.uid;
    const inviteeEmail = (decoded.email || "").toLowerCase();

    // 2) Validate input
    const inviteToken = (req.body?.token || "").trim();
    if (!inviteToken) return res.status(400).json({ ok: false, error: "token is required." });

    const db = admin.firestore();

    // 3) Find invite by token across all owners/websites
    const q = await db.collectionGroup("invites").where("token", "==", inviteToken).limit(1).get();
    if (q.empty) return res.status(404).json({ ok: false, error: "INVITE_NOT_FOUND" });

    const inviteDoc = q.docs[0];
    const inviteData = inviteDoc.data() || {};

    // Expected path: users/{ownerUid}/websites/{websiteId}/invites/{inviteId}
    const parts = inviteDoc.ref.path.split("/");
    const ownerUid = parts[1];
    const websiteId = parts[3];
    const inviteId = parts[5];

    if (!ownerUid || !websiteId || !inviteId) {
      return res.status(500).json({ ok: false, error: "INVITE_PATH_INVALID" });
    }

    // 4) Basic checks
    if (inviteData.status && inviteData.status !== "pending") {
      // idempotent: if already accepted, treat as ok
      if (inviteData.status === "accepted") {
        return res.status(200).json({ ok: true, ownerUid, websiteId, inviteId, alreadyAccepted: true });
      }
      return res.status(409).json({ ok: false, error: "INVITE_NOT_PENDING", status: inviteData.status });
    }

    const invitedEmail = (inviteData.email || "").toLowerCase();
    if (invitedEmail && inviteeEmail && invitedEmail !== inviteeEmail) {
      return res.status(403).json({
        ok: false,
        error: "EMAIL_MISMATCH",
        details: "You are logged in with a different email than the invite was sent to.",
      });
    }

    if (inviteData.tokenExpiresAt && inviteData.tokenExpiresAt.toDate) {
      const exp = inviteData.tokenExpiresAt.toDate().getTime();
      if (Date.now() > exp) return res.status(410).json({ ok: false, error: "INVITE_EXPIRED" });
    }

    const ownerUserRef = db.doc(`users/${ownerUid}`);
    const websiteRef = db.doc(`users/${ownerUid}/websites/${websiteId}`);
    const memberRef = db.doc(`users/${ownerUid}/websites/${websiteId}/members/${inviteeUid}`);
    const inviteRef = db.doc(`users/${ownerUid}/websites/${websiteId}/invites/${inviteId}`);
    const inviteeWebsiteRef = db.doc(`users/${inviteeUid}/websites/${websiteId}`);

    await db.runTransaction(async (tx) => {
      const [ownerSnap, websiteSnap, existingMemberSnap] = await Promise.all([
        tx.get(ownerUserRef),
        tx.get(websiteRef),
        tx.get(memberRef),
      ]);

      const usersIncluded = ownerSnap.exists ? Number(ownerSnap.data()?.usersIncluded ?? 1) : 1;

      // We keep a counter on the website doc to avoid query-reads inside transactions.
      // Default: 1 (owner) if not present.
      const website = websiteSnap.exists ? (websiteSnap.data() || {}) : {};
      const currentCountRaw = website.memberCount;
      const memberCount = Number.isFinite(currentCountRaw) ? Number(currentCountRaw) : 1;

      // If already a member, do nothing (idempotent)
      const isNewMember = !existingMemberSnap.exists;

      if (isNewMember && memberCount >= usersIncluded) {
        const err = new Error("SEAT_LIMIT_REACHED");
        err.code = "SEAT_LIMIT_REACHED";
        throw err;
      }

      // Add member doc (merge)
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

      // Mark invite accepted
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

      // Increment counter only if this is a new member
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

      // Create website copy for invitee so it appears in /seo dropdown
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
          profile:
            website.profile || {
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

    return res.status(200).json({ ok: true, ownerUid, websiteId, inviteId });
  } catch (e) {
    const msg = e?.message || "Unknown error";
    if (msg === "SEAT_LIMIT_REACHED" || e?.code === "SEAT_LIMIT_REACHED") {
      return res.status(403).json({ ok: false, error: "SEAT_LIMIT_REACHED" });
    }
    console.error("websites/team/accept error:", e);
    return res.status(500).json({ ok: false, error: msg });
  }
}
