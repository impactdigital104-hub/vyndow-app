// api/websites/team/invite.js
import admin from "../../firebaseAdmin";
import crypto from "crypto";
import { sendInviteEmail } from "../../_lib/email";


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
    const email = (req.body?.email || "").trim().toLowerCase();
    const name = (req.body?.name || "").trim();
    const role = (req.body?.role || "member").trim();

    if (!websiteId) return res.status(400).json({ ok: false, error: "websiteId is required." });
    if (!email) return res.status(400).json({ ok: false, error: "email is required." });

    // prevent inviting yourself
    const callerEmail = (decoded.email || "").toLowerCase();
    if (callerEmail && email === callerEmail) {
      return res.status(400).json({ ok: false, error: "You cannot invite yourself." });
    }

    const db = admin.firestore();

    function toPositiveInt(v) {
      const n = parseInt(String(v ?? ""), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    // 3) Robust seat limit (same fallback logic as list)
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    let usersIncluded = toPositiveInt(userSnap.exists ? userSnap.data()?.usersIncluded : undefined);

    if (!usersIncluded) {
      const seoRef = db.doc(`users/${uid}/modules/seo`);
      const seoSnap = await seoRef.get();
      usersIncluded = toPositiveInt(seoSnap.exists ? seoSnap.data()?.usersIncluded : undefined);
    }

    if (!usersIncluded) {
      const wRef = db.doc(`users/${uid}/websites/${websiteId}`);
      const wSnap = await wRef.get();
      usersIncluded = toPositiveInt(wSnap.exists ? wSnap.data()?.usersIncluded : undefined);
    }

    if (!usersIncluded) usersIncluded = 1;

    // 4) Enforce seats: usersIncluded vs current members
    const membersCol = db.collection(`users/${uid}/websites/${websiteId}/members`);
    const membersSnap = await membersCol.get();
    const seatsUsed = membersSnap.size;

    if (seatsUsed >= usersIncluded) {
      return res.status(403).json({
        ok: false,
        error: "SEAT_LIMIT_REACHED",
        details: `Seat limit: ${usersIncluded}, current members: ${seatsUsed}`,
      });
    }

    // 5) Prevent duplicate pending invites for same email
    const invitesCol = db.collection(`users/${uid}/websites/${websiteId}/invites`);
    const dupSnap = await invitesCol
      .where("email", "==", email)
      .where("status", "==", "pending")
      .get();

    if (!dupSnap.empty) {
      return res.status(409).json({
        ok: false,
        error: "INVITE_ALREADY_EXISTS",
        details: "A pending invite already exists for this email.",
      });
    }

    // 6) Create invite + token
    const inviteToken = crypto.randomBytes(32).toString("hex");

    const appBaseUrl = (process.env.APP_BASE_URL || "https://vyndow-app.vercel.app").replace(/\/+$/, "");
    const inviteUrl = `${appBaseUrl}/accept-invite?token=${inviteToken}`;

    // try to read website name (optional; fallback to "this website")
    let websiteName = "this website";
    try {
      const wSnap2 = await db.doc(`users/${uid}/websites/${websiteId}`).get();
      if (wSnap2.exists) {
        const wd = wSnap2.data() || {};
        websiteName = wd.name || wd.websiteName || wd.domain || "this website";
      }
    } catch (e) {
      // ignore
    }

    const ref = await invitesCol.add({
      email,
      name,
      role,
      status: "pending",
      token: inviteToken,
      tokenCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // 7 days validity (V1)
      tokenExpiresAt: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      ),
      invitedByUid: uid,
      invitedByEmail: decoded.email || "",
      invitedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 7) Send email (launch ready)
    // We do NOT fail the whole request if email sending fails; invite still exists in Pending Invites.
    try {
      await sendInviteEmail({
        to: email,
        inviteUrl,
        websiteName,
      });
    } catch (mailErr) {
      console.error("Invite email failed:", mailErr);
      return res.status(200).json({
        ok: true,
        inviteId: ref.id,
        emailSent: false,
        inviteUrl, // helpful for internal testing
        warning: "Invite created but email could not be sent.",
      });
    }

    return res.status(200).json({ ok: true, inviteId: ref.id, emailSent: true });

  } catch (e) {
    console.error("websites/team/invite error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error." });
  }
}
