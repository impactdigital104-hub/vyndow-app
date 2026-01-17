// api/geoModuleProvision.js
// Shared helper to keep GEO module config workspace-scoped.
// Creates users/{ownerUid}/websites/{websiteId}/modules/geo if missing.

export function normalizePlan(plan) {
  const p = (plan || "").toLowerCase().trim();
  if (p === "small_business") return "small_business";
  if (p === "small-business") return "small_business";
  if (p === "small business") return "small_business";
  if (p === "smallbusiness") return "small_business";
  if (p === "enterprise") return "enterprise";
  if (p === "free") return "free";
  return "free";
}

export function geoPlanDefaults(planRaw) {
  const plan = normalizePlan(planRaw);

  if (plan === "enterprise") {
    return { plan, pagesPerMonth: 500 };
  }
  if (plan === "small_business") {
    return { plan, pagesPerMonth: 100 };
  }
  return { plan: "free", pagesPerMonth: 10 };
}

/**
 * Ensure workspace GEO module exists at:
 * users/{ownerUid}/websites/{websiteId}/modules/geo
 *
 * SAFE to call on every request (idempotent).
 */
export async function ensureWebsiteGeoModule({ admin, ownerUid, websiteId }) {
  const db = admin.firestore();

  const websiteModuleRef = db.doc(
    `users/${ownerUid}/websites/${websiteId}/modules/geo`
  );
  const websiteModuleSnap = await websiteModuleRef.get();
  if (websiteModuleSnap.exists) {
    return { ref: websiteModuleRef, data: websiteModuleSnap.data() || {} };
  }

  // Optional legacy source (future-proofing)
  const legacyRef = db.doc(`users/${ownerUid}/modules/geo`);
  const legacySnap = await legacyRef.get();
  const legacy = legacySnap.exists ? legacySnap.data() || {} : {};

  const base = geoPlanDefaults(legacy.plan);

  const payload = {
    moduleId: "geo",
    plan: base.plan,
    pagesPerMonth: Number(legacy.pagesPerMonth ?? base.pagesPerMonth),
    extraGeoCreditsThisMonth: Number(legacy.extraGeoCreditsThisMonth ?? 0),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await websiteModuleRef.set(payload, { merge: true });
  return { ref: websiteModuleRef, data: payload };
}
