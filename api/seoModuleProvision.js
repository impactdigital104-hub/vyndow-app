// api/seoModuleProvision.js
// Shared helper to keep SEO module config workspace-scoped (Model 1).
// Creates users/{ownerUid}/websites/{websiteId}/modules/seo if missing,
// copying from legacy users/{ownerUid}/modules/seo when available.

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

export function planDefaults(planRaw) {
  const plan = normalizePlan(planRaw);

  if (plan === "enterprise") {
    return { plan, blogsPerWebsitePerMonth: 15, seatsIncluded: 3 };
  }
  if (plan === "small_business") {
    return { plan, blogsPerWebsitePerMonth: 6, seatsIncluded: 1 };
  }
  return { plan: "free", blogsPerWebsitePerMonth: 2, seatsIncluded: 1 };
}

/**
 * Ensure workspace SEO module exists at:
 * users/{ownerUid}/websites/{websiteId}/modules/seo
 *
 * SAFE to call on every request (idempotent).
 */
export async function ensureWebsiteSeoModule({ admin, ownerUid, websiteId }) {
  const db = admin.firestore();

  const websiteModuleRef = db.doc(`users/${ownerUid}/websites/${websiteId}/modules/seo`);
  const websiteModuleSnap = await websiteModuleRef.get();
  if (websiteModuleSnap.exists) {
    return { ref: websiteModuleRef, data: websiteModuleSnap.data() || {} };
  }

  // Legacy source (owner root)
  const legacyRef = db.doc(`users/${ownerUid}/modules/seo`);
  const legacySnap = await legacyRef.get();
  const legacy = legacySnap.exists ? (legacySnap.data() || {}) : {};

  const base = planDefaults(legacy.plan);

  const payload = {
    moduleId: "seo",
    plan: base.plan,
    blogsPerWebsitePerMonth: Number(legacy.blogsPerWebsitePerMonth ?? base.blogsPerWebsitePerMonth),
    seatsIncluded: Number(legacy.seatsIncluded ?? legacy.usersIncluded ?? base.seatsIncluded),
    extraBlogCreditsThisMonth: Number(legacy.extraBlogCreditsThisMonth ?? 0),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await websiteModuleRef.set(payload, { merge: true });
  return { ref: websiteModuleRef, data: payload };
}
