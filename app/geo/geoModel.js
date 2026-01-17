// app/geo/geoModel.js
// Phase 2 Firestore model freeze (no writes in Phase 2.1)

// Top-level collection for GEO audit runs
export const GEO_RUNS_COLLECTION = "geoRuns";

// Sub-collection under each run (one doc per page/URL in that run)
export const GEO_RUN_PAGES_SUBCOLLECTION = "pages";

/**
 * Canonical paths:
 *
 * geoRuns/{runId}
 * geoRuns/{runId}/pages/{pageId}
 *
 * In Phase 2.2, we will store:
 * - run doc: ownerUid, websiteId, pagesCount, status, createdAt, updatedAt
 * - page doc: url, status, createdAt, updatedAt
 */
