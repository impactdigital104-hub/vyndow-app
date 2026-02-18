// api/seo/strategy/createBlogDraft.js
//
// STEP 8B — Create a Firestore Blog Draft Bridge
//
// When user clicks "Generate in Vyndow SEO" on a Step 8 plan row:
// - Validate auth + website context
// - Validate authorityPlan exists and contains the requested row
// - Write draft doc at:
//   users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/blogDrafts/{draftId}
// - Return { ok:true, draftId }

import admin from "../../firebaseAdmin";

// -------------------- AUTH --------------------
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// -------------------- EFFECTIVE CONTEXT --------------------
async function resolveEffectiveContext(uid, websiteId) {
  const ref = admin.firestore().doc(`users/${uid}/websites/${websiteId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return { effectiveUid: uid, effectiveWebsiteId: websiteId };
  }

  const w = snap.data() || {};
  const effectiveUid = w.ownerUid || uid;
  const effectiveWebsiteId = w.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId };
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function asStr(x) {
  return String(x || "").trim();
}

function asArr(x) {
  return Array.isArray(x) ? x : [];
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function rowMatchesAuthorityPlanRow(planRow, reqRow) {
  const aTitle = normalize(planRow?.blogTitle);
  const aPK = normalize(planRow?.primaryKeyword);
  const aSlug = normalize(planRow?.slug);
  const aPillar = normalize(planRow?.pillarName);

  const rTitle = normalize(reqRow?.blogTitle);
  const rPK = normalize(reqRow?.primaryKeyword);
  const rSlug = normalize(reqRow?.slug);
  const rPillar = normalize(reqRow?.pillarName);

  // Prefer strict-ish match on title + primaryKeyword.
  if (aTitle && rTitle && aPK && rPK) {
    return aTitle === rTitle && aPK === rPK;
  }

  // Fallback to slug match if present.
  if (aSlug && rSlug) {
    return aSlug === rSlug;
  }

  // Last fallback: title match + pillar match.
  if (aTitle && rTitle && aPillar && rPillar) {
    return aTitle === rTitle && aPillar === rPillar;
  }

  return false;
}

function authorityPlanContainsRow(authorityPlan, reqRow) {
  const months = authorityPlan?.months || {};
  const monthKeys = ["month1", "month2", "month3"];
  for (const mk of monthKeys) {
    const rows = Array.isArray(months?.[mk]) ? months[mk] : [];
    for (const r of rows) {
      if (rowMatchesAuthorityPlanRow(r, reqRow)) return true;
    }
  }
  return false;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const body = req.body || {};
    const websiteId = asStr(body.websiteId);
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const month = Number(body.month);
    if (![1, 2, 3].includes(month)) {
      return res.status(400).json({ error: "Invalid month. Must be 1, 2, or 3." });
    }

    const blogTitle = asStr(body.blogTitle);
    const primaryKeyword = asStr(body.primaryKeyword);
    if (!blogTitle) {
      return res.status(400).json({ error: "Missing blogTitle" });
    }
    if (!primaryKeyword) {
      return res.status(400).json({ error: "Missing primaryKeyword" });
    }

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);

    const db = admin.firestore();
    const authorityPlanRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/authorityPlan`
    );

    const authorityPlanSnap = await authorityPlanRef.get();
    // =============================
// Load Strategy Step 1 Business Profile
// =============================
const businessProfileRef = db.doc(
  `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/businessProfile`
);

const businessProfileSnap = await businessProfileRef.get();
const businessProfile = businessProfileSnap.exists
  ? businessProfileSnap.data() || {}
  : {};

const businessIndustryText = String(businessProfile?.industry || "").trim();
const businessGeography = String(businessProfile?.geography || "").trim();

function mapIndustryToKey(text) {
  const t = String(text || "").toLowerCase();

  if (
    t.includes("rehab") ||
    t.includes("addiction") ||
    t.includes("alcohol") ||
    t.includes("drug") ||
    t.includes("recovery")
  ) {
    return "health_recovery";
  }

  if (
    t.includes("finance") ||
    t.includes("bank") ||
    t.includes("invest")
  ) {
    return "finance_investing";
  }

  return "general";
}

const industryKey = mapIndustryToKey(businessIndustryText);

    if (!authorityPlanSnap.exists) {
      return res.status(400).json({
        error: "Step 8B blocked: authorityPlan not found. Please generate Step 8A first.",
      });
    }

    const authorityPlan = authorityPlanSnap.data() || {};

    // Hard gate: authorityPlan must contain the row being clicked
    const reqRowForMatch = {
      blogTitle,
      primaryKeyword,
      slug: asStr(body.slug),
      pillarName: asStr(body.pillarName),
    };

    if (!authorityPlanContainsRow(authorityPlan, reqRowForMatch)) {
      return res.status(400).json({
        error:
          "Step 8B blocked: This blog row was not found in the current Step 8A authority plan. Please regenerate Step 8A and try again.",
      });
    }

    const geoMode = asStr(authorityPlan?.geoMode);
    const location_name = asStr(authorityPlan?.location_name);
    const language_code = asStr(authorityPlan?.language_code) || "en";

const draftRef = db
  .collection(
    `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/blogDrafts`
  )
  .doc();


    const draftId = draftRef.id;

    const outDoc = {
      version: 1,
      createdAt: nowTs(),
      createdByUid: uid,
      businessIndustryText,
businessGeography,
industryKey,
      source: "strategy_step8",
      authorityPlanRef: "strategy/authorityPlan",
      authorityPlanGeneratedAt: authorityPlan?.generatedAt || null,

      month,
      pillarName: asStr(body.pillarName),

      blogTitle,
      slug: asStr(body.slug),

      intent: asStr(body.intent) || "other",
      targetAudience: asStr(body.targetAudience),
      synopsis: asStr(body.synopsis),

      primaryKeyword,
      secondaryKeywords: asArr(body.secondaryKeywords).map(asStr).filter(Boolean),
      internalLinks: asArr(body.internalLinks)
        .map((x) => ({
          anchor: asStr(x?.anchor),
          url: asStr(x?.url),
        }))
        .filter((x) => x.anchor || x.url),

      ctaFocus: asStr(body.ctaFocus),
      impactTag: asStr(body.impactTag),

      // geo carryover
      geoMode,
      location_name,
      language_code,

      // lifecycle
      status: "draft",
      lastOpenedAt: null,
    };

    await draftRef.set(outDoc, { merge: false });

    return res.status(200).json({ ok: true, draftId });
  } catch (err) {
    const msg = String(err?.message || err || "Unknown error");
    return res.status(400).json({ error: msg });
  }
}
