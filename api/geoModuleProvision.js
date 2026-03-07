// api/geoModuleProvision.js
// Shared helper to keep GEO module config workspace-scoped.
// Creates users/{ownerUid}/websites/{websiteId}/modules/geo if missing.

function normalizePlan(plan) {
  const p = (plan || "").toLowerCase().trim();

  if (p === "pro") return "pro";
  if (p === "growth") return "growth";
  if (p === "starter") return "starter";
  if (p === "free") return "free";

  // Legacy normalization safety
  if (p === "enterprise") return "growth";
  if (p === "small_business") return "starter";
  if (p === "small-business") return "starter";
  if (p === "small business") return "starter";
  if (p === "smallbusiness") return "starter";

  return "free";
}
function geoPlanDefaults(planRaw) {
  const plan = normalizePlan(planRaw);

  if (plan === "pro") {
    return { plan, pagesPerMonth: 50 };
  }
  if (plan === "growth") {
    return { plan, pagesPerMonth: 25 };
  }
  if (plan === "starter") {
    return { plan, pagesPerMonth: 10 };
  }
  return { plan: "free", pagesPerMonth: 2 };
}


/**
 * Ensure workspace GEO module exists at:
 * users/{ownerUid}/websites/{websiteId}/modules/geo
 *
 * SAFE to call on every request (idempotent).
 */
async function ensureWebsiteGeoModule({ admin, ownerUid, websiteId }) {
  // 1) Ensure user-level GEO module exists (SEO-style master)
  const db = admin.firestore();

  const userModuleRef = db.doc(`users/${ownerUid}/modules/geo`);
  const userModuleSnap = await userModuleRef.get();

  if (!userModuleSnap.exists) {
    const baseUser = geoPlanDefaults("free"); // default master plan for now

    await userModuleRef.set(
      {
        moduleId: "geo",
        plan: baseUser.plan,
                pagesPerMonth: baseUser.pagesPerMonth, // free = 2
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
// Always sync website GEO module from user-level master (SEO-style)
const masterRef = db.doc(`users/${ownerUid}/modules/geo`);
const masterSnap = await masterRef.get();
const master = masterSnap.exists ? masterSnap.data() || {} : {};

const base = geoPlanDefaults(master.plan);

const payload = {
  moduleId: "geo",
  plan: base.plan,
  pagesPerMonth: Number(master.pagesPerMonth ?? base.pagesPerMonth),
  extraGeoCreditsThisMonth: Number(master.extraGeoCreditsThisMonth ?? 0),
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

await websiteModuleRef.set(payload, { merge: true });
return { ref: websiteModuleRef, data: payload };
  }

  module.exports = {
  normalizePlan,
  geoPlanDefaults,
  ensureWebsiteGeoModule,
};


