// app/websitesData.js
// Phase 5A — Website + Plan model (UI-only, no backend)

/**
 * Website shape (for reference only, not enforced by JS):
 *
 * Website = {
 *   id: string;           // internal id (for future database)
 *   key: string;          // short key used in dropdowns (e.g. "anatta")
 *   name: string;         // human name (e.g. "Anatta Rehab")
 *   domain: string;       // main site domain
 *   notes?: string;       // optional notes about the client/brand
 *   modules: {
 *     seo?: ModulePlan;   // plan info for Vyndow SEO
 *     // future: social?: ModulePlan;
 *     // future: ads?: ModulePlan;
 *   };
 * }
 *
 * ModulePlan = {
 *   planType: "free" | "small_business" | "enterprise";
 *   blogsPerMonth?: number;   // quota for blogs per month (SEO)
 *   postsPerMonth?: number;   // quota for posts per month (Social, future)
 *   usersAllowed: number;     // number of users who can access this module
 *   usedThisMonth: number;    // how many units have been used this month
 * };
 */

/**
 * TEMPORARY SAMPLE DATA (Phase 5 — UI only)
 * This will later be replaced by real data from the database.
 */
export const sampleWebsites = [
  {
    id: "site_1",
    key: "anatta", // matches the current dropdown value in /seo
    name: "Anatta Rehab",
    domain: "www.anatta.in",
    notes: "Sample rehab brand profile.",
    modules: {
      seo: {
        planType: "small_business",
        blogsPerMonth: 6,
        usersAllowed: 1,
        usedThisMonth: 2,
      },
    },
  },
  {
    id: "site_2",
    key: "vyndow", // matches the current dropdown value in /seo
    name: "Vyndow Marketing Site",
    domain: "www.vyndow.com",
    notes: "Vyndow’s own marketing website.",
    modules: {
      seo: {
        planType: "enterprise",
        blogsPerMonth: 15,
        usersAllowed: 3,
        usedThisMonth: 0,
      },
    },
  },
];

/**
 * Helper: find the SEO plan for a given website key.
 * Returns the SEO ModulePlan or null if not found.
 *
 * Example:
 *   const plan = getSeoPlanForWebsiteKey("anatta");
 *   if (plan) { console.log(plan.blogsPerMonth); }
 */
export function getSeoPlanForWebsiteKey(websiteKey) {
  const site = sampleWebsites.find((w) => w.key === websiteKey);
  if (!site || !site.modules || !site.modules.seo) {
    return null;
  }
  return site.modules.seo;
}
