// /api/geo/run.js
import admin from "../firebaseAdmin";
import { ensureWebsiteGeoModule } from "../geoModuleProvision";

function getMonthKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // e.g. 2026-01
}

// Same auth pattern as /api/generate.js and /api/geo/ensure.js
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");

  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// Same website ownership/membership model as /api/generate.js
async function resolveWebsiteContext({ uid, websiteId }) {
  const db = admin.firestore();

  const userWebsiteRef = db.doc(`users/${uid}/websites/${websiteId}`);
  const userWebsiteSnap = await userWebsiteRef.get();

  if (!userWebsiteSnap.exists) {
    const err = new Error("Website not found for this user.");
    err.code = "WEBSITE_NOT_FOUND";
    throw err;
  }

  const websiteData = userWebsiteSnap.data() || {};
  const ownerUid = (websiteData.ownerUid || uid).trim();

  if (ownerUid !== uid) {
    const memberRef = db.doc(
      `users/${ownerUid}/websites/${websiteId}/members/${uid}`
    );
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      const err = new Error("NO_ACCESS");
      err.code = "NO_ACCESS";
      throw err;
    }
  }

  return { ownerUid, websiteData };
}

// Load GEO module config with safe fallback:
// 1) users/{ownerUid}/websites/{websiteId}/modules/geo
// 2) users/{ownerUid}/modules/geo
async function loadGeoModule({ ownerUid, websiteId }) {
  const db = admin.firestore();

  const websiteModuleRef = db.doc(
    `users/${ownerUid}/websites/${websiteId}/modules/geo`
  );
  const websiteModuleSnap = await websiteModuleRef.get();
  if (websiteModuleSnap.exists) {
    return { module: websiteModuleSnap.data() || {}, moduleRef: websiteModuleRef };
  }

  const legacyModuleRef = db.doc(`users/${ownerUid}/modules/geo`);
  const legacyModuleSnap = await legacyModuleRef.get();
  if (legacyModuleSnap.exists) {
    return { module: legacyModuleSnap.data() || {}, moduleRef: legacyModuleRef };
  }

  const err = new Error("GEO module not configured for this website owner.");
  err.code = "NO_GEO_PLAN";
  throw err;
}

function normalizeDomain(domainRaw) {
  const d = String(domainRaw || "").trim().toLowerCase();
  if (!d) return "";
  return d.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

function urlBelongsToDomain(urlStr, websiteDomainRaw) {
  const websiteDomain = normalizeDomain(websiteDomainRaw);
  if (!websiteDomain) return true; // if no domain stored, do not block

  let host = "";
  try {
    const u = new URL(urlStr);
    host = String(u.hostname || "").toLowerCase();
  } catch {
    return false;
  }

  const hostNorm = host.replace(/^www\./, "");
  if (hostNorm === websiteDomain) return true;
  if (hostNorm.endsWith(`.${websiteDomain}`)) return true;
  return false;
}

function sanitizeUrls(rawUrls) {
  const arr = Array.isArray(rawUrls) ? rawUrls : [];
  const cleaned = arr
    .map((u) => String(u || "").trim())
    .filter(Boolean);

  // de-dupe while preserving order
  const seen = new Set();
  const unique = [];
  for (const u of cleaned) {
    if (!seen.has(u)) {
      seen.add(u);
      unique.push(u);
    }
  }

  const valid = [];
  const invalid = [];

  for (const u of unique) {
    try {
      const obj = new URL(u);
      const ok = obj.protocol === "http:" || obj.protocol === "https:";
      if (!ok) invalid.push(u);
      else valid.push(u);
    } catch {
      invalid.push(u);
    }
  }

  return { valid, invalid };
}
function sanitizeQuestions(rawQuestions) {
  const arr = Array.isArray(rawQuestions) ? rawQuestions : [];

  const cleaned = arr
    .map((q) => String(q || "").trim())
    .filter(Boolean);

  // de-dupe while preserving order (case-insensitive)
  const seen = new Set();
  const unique = [];
  for (const q of cleaned) {
    const key = q.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(q);
    }
  }

  return unique;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

 const { websiteId, urls, aiQuestions } = req.body || {};
    if (!websiteId) {
      return res.status(400).json({ ok: false, error: "Missing websiteId" });
    }

    const { valid, invalid } = sanitizeUrls(urls);
    if (invalid.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_URLS",
        invalid,
      });
    }
    if (valid.length === 0) {
      return res.status(400).json({ ok: false, error: "No valid URLs provided." });
    }
// Phase 5C: questions are allowed only for single-URL runs (to avoid ambiguity)
let safeQuestions = [];
if (valid.length === 1) {
  safeQuestions = sanitizeQuestions(aiQuestions).slice(0, 5);
}

    const { ownerUid, websiteData } = await resolveWebsiteContext({ uid, websiteId });

    // Basic v1 domain check (must belong to the website's domain)
    const websiteDomain = websiteData?.domain || "";
    const notBelonging = valid.filter((u) => !urlBelongsToDomain(u, websiteDomain));
    if (notBelonging.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "URL_DOMAIN_MISMATCH",
        websiteDomain,
        invalidForWebsite: notBelonging,
      });
    }

    // Ensure module docs exist (idempotent)
    await ensureWebsiteGeoModule({ admin, ownerUid, websiteId });

    const db = admin.firestore();
    const monthKey = getMonthKey();

    const { moduleRef } = await loadGeoModule({ ownerUid, websiteId });

    const pagesToReserve = valid.length;

    // Usage doc (GEO-specific; monthly key auto-resets)
    const usageRef = db.doc(
      `users/${ownerUid}/websites/${websiteId}/geoUsage/${monthKey}`
    );

    const result = await db.runTransaction(async (tx) => {
      const moduleSnap = await tx.get(moduleRef);
      const module = moduleSnap.exists ? (moduleSnap.data() || {}) : {};

      const usageSnap = await tx.get(usageRef);
      const usageData = usageSnap.exists ? (usageSnap.data() || {}) : {};
      const used = Number(usageData.usedPagesThisMonth ?? 0);

      const baseLimit = Number(module.pagesPerMonth ?? 0);
      if (!baseLimit || baseLimit <= 0) {
        throw new Error("GEO plan limit missing or invalid (pagesPerMonth).");
      }

      const usedAfter = used + pagesToReserve;
      const overflow = Math.max(0, usedAfter - baseLimit);

      let extraRemaining = Number(module.extraGeoCreditsThisMonth ?? 0);

      if (overflow > 0) {
        if (extraRemaining < overflow) {
          const err = new Error("QUOTA_EXCEEDED");
          err.code = "QUOTA_EXCEEDED";
          err.used = used;
          err.limit = baseLimit;
          err.requested = pagesToReserve;
          err.extraRemaining = extraRemaining;
          throw err;
        }

        extraRemaining = extraRemaining - overflow;

        tx.set(
          moduleRef,
          {
            extraGeoCreditsThisMonth: extraRemaining,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      tx.set(
        usageRef,
        {
          month: monthKey,
          usedPagesThisMonth: usedAfter,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Create run + page docs atomically
      const runRef = db.collection("geoRuns").doc();

      tx.set(
        runRef,
        {
          ownerUid,
          websiteId,
          createdByUid: uid,
          month: monthKey,
          pagesCount: pagesToReserve,
          status: "queued",
                    aiQuestions: safeQuestions,
          aiQuestionsCreatedAt: safeQuestions.length
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      for (const url of valid) {
        const pageRef = runRef.collection("pages").doc();
        tx.set(
          pageRef,
          {
            url,
            status: "queued",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      return {
        runId: runRef.id,
        ownerUid,
        websiteId,
        monthKey,
        usedAfter,
        baseLimit,
        extraRemaining,
        overflowUsed: overflow,
        pagesReserved: pagesToReserve,
      };
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error("GEO run error:", e);

    // Friendly JSON error shape
    const code = e?.code || e?.message || "UNKNOWN_ERROR";

    if (code === "QUOTA_EXCEEDED") {
      return res.status(403).json({
        ok: false,
        error: "QUOTA_EXCEEDED",
        details: {
          used: e.used,
          limit: e.limit,
          requested: e.requested,
          extraRemaining: e.extraRemaining,
        },
      });
    }

    return res.status(400).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}
