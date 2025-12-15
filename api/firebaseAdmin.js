// api/firebaseAdmin.js
import admin from "firebase-admin";

function getServiceAccount() {
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!raw) throw new Error("Missing FIREBASE_ADMIN_CREDENTIALS env var.");

  // Vercel env sometimes stores JSON with newlines; this handles both cases.
  try {
    return JSON.parse(raw);
  } catch {
    // If the JSON was pasted with escaped newlines
    return JSON.parse(raw.replace(/\\n/g, "\n"));
  }
}

if (!admin.apps.length) {
  const serviceAccount = getServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
