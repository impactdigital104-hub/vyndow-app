import admin from "../firebaseAdmin";
import { decodeState, getGscOAuthClient } from "../_lib/gscAuth";

export default async function handler(req, res) {
  const code = String(req.query?.code || "").trim();
  const stateString = String(req.query?.state || "").trim();
  const state = decodeState(stateString);

  const websiteId = state?.websiteId ? encodeURIComponent(state.websiteId) : "";
  const successRedirect = `/websites?gscAuth=success&gscWebsiteId=${websiteId}`;

  if (!code || !state?.uid || !state?.websiteId) {
    return res.redirect(`/websites?gscAuth=error&gscMessage=${encodeURIComponent("Google connection could not be completed.")}`);
  }

  try {
    const client = getGscOAuthClient();
    const { tokens } = await client.getToken(code);

    const db = admin.firestore();
    await db.doc(`users/${state.uid}/integrations/google/searchConsole`).set(
      {
        refreshToken: tokens.refresh_token || "",
        accessToken: tokens.access_token || "",
        expiryDate: tokens.expiry_date || null,
        scope: tokens.scope || "",
        tokenType: tokens.token_type || "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.redirect(successRedirect);
  } catch (e) {
    console.error("gsc/callback error:", e);
    return res.redirect(`/websites?gscAuth=error&gscWebsiteId=${websiteId}&gscMessage=${encodeURIComponent(e?.message || "Google connection failed.")}`);
  }
}
