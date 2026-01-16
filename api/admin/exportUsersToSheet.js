import { google } from "googleapis";
import admin from "../firebaseAdmin";

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  return JSON.parse(raw);
}

async function appendRows(rows) {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) throw new Error("Missing GOOGLE_SHEETS_ID");

  const sa = getServiceAccount();

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Sheet1!A:D",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows }
  });
}

export default async function handler(req, res) {
  try {
    const db = admin.firestore();

    const cursorRef = db.collection("exports").doc("users_to_sheets");
    const cursorSnap = await cursorRef.get();
    const lastCreatedAt = cursorSnap.exists
      ? cursorSnap.data().lastCreatedAt
      : null;

    let query = db.collection("users").orderBy("createdAt", "asc").limit(500);

    if (lastCreatedAt) {
      query = query.startAfter(lastCreatedAt);
    }

    const snap = await query.get();

    if (snap.empty) {
      return res.json({ ok: true, appended: 0 });
    }

    const rows = [];
    let newestCreatedAt = lastCreatedAt;

    snap.forEach(doc => {
      const d = doc.data() || {};
      const createdAt = d.createdAt?.toDate
        ? d.createdAt.toDate().toISOString()
        : "";

      rows.push([
        d.email || "",
        d.name || "",
        d.plan || "",
        createdAt
      ]);

      if (d.createdAt) newestCreatedAt = d.createdAt;
    });

    await appendRows(rows);

    await cursorRef.set(
      {
        lastCreatedAt: newestCreatedAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return res.json({ ok: true, appended: rows.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
