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

  // Phase 7 locked limits
  if (plan === "enterprise") {
    return { plan, pagesPerMonth: 50 };
  }
  if (plan === "small_business") {
    return { plan, pagesPerMonth: 20 };
  }
  return { plan: "free", pagesPerMonth: 5 };
}


/**
 * Ensure workspace GEO module exists at:
 * users/{ownerUid}/websites/{websiteId}/modules/geo
 *
 * SAFE to call on every request (idempotent).
 */
export async function ensureWebsiteGeoModule({ admin, ownerUid, websiteId }) {  // 1) Ensure user-level GEO module exists (SEO-style master)
  const db = admin.firestore();

  const userModuleRef = db.doc(`users/${ownerUid}/modules/geo`);
  const userModuleSnap = await userModuleRef.get();

  if (!userModuleSnap.exists) {
    const baseUser = geoPlanDefaults("free"); // default master plan for now

    await userModuleRef.set(
      {
        moduleId: "geo",
        plan: baseUser.plan,
        pagesPerMonth: baseUser.pagesPerMonth, // free = 5 (we fixed this)
        extraGeoCreditsThisMonth: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  

  const websiteModuleRef = db.doc(
    `users/${ownerUid}/websites/${websiteId}/modules/geo`
  );
  const websiteModuleSnap = await websiteModuleRef.get();
  if (websiteModuleSnap.exists) {
    return { ref: websiteModuleRef, data: websiteModuleSnap.data() || {} };
  }

  // Use user-level GEO module as the master source of truth (SEO-style)
  const masterRef = db.doc(`users/${ownerUid}/modules/geo`);
  const masterSnap = await masterRef.get();
  const master = masterSnap.exists ? masterSnap.data() || {} : {};

  const base = geoPlanDefaults(master.plan);

  const payload = {
    moduleId: "geo",
    plan: base.plan,
    pagesPerMonth: Number(master.pagesPerMonth ?? base.pagesPerMonth),
    extraGeoCreditsThisMonth: Number(master.extraGeoCreditsThisMonth ?? 0),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };


  await websiteModuleRef.set(payload, { merge: true });
  return { ref: websiteModuleRef, data: payload };
}
