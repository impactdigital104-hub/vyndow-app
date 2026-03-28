import admin from "../firebaseAdmin";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

async function resolveEffectiveContext(uid, websiteId) {
  const ref = admin.firestore().doc(`users/${uid}/websites/${websiteId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    return { effectiveUid: uid, effectiveWebsiteId: websiteId, website: null };
  }

  const website = snap.data() || {};
  const effectiveUid = website.ownerUid || uid;
  const effectiveWebsiteId = website.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId, website };
}

function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
}

function isLikelyDomain(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return false;
  if (v.includes(" ")) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v);
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function asNum(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function classifyCategory(domain) {
  const value = String(domain || "").toLowerCase();

  if (
    /(directory|directories|citation|citations|yellowpages|business-listing|businesslisting|local-listing|localdirectory|submitlink|webdirectory)/.test(
      value
    )
  ) {
    return "directory";
  }

  if (/(association|society|council|chamber|federation|guild|institute|academy)/.test(value)) {
    return "association";
  }

  if (/(forum|community|discuss|discussion|quora|reddit|stackexchange|discourse)/.test(value)) {
    return "forum";
  }

  if (
    /(news|magazine|journal|media|press|times|post|herald|chronicle|gazette|wire|medium|substack)/.test(
      value
    )
  ) {
    return "publication";
  }

  if (/(blog|blogs)/.test(value)) {
    return "blog";
  }

  return "other";
}

function categoryToMethod(category) {
  switch (category) {
    case "directory":
      return "directory listing";
    case "blog":
      return "guest article";
    case "publication":
      return "guest article";
    case "association":
      return "membership";
    case "forum":
      return "manual review";
    default:
      return "manual review";
  }
}

function categoryToDifficulty(category) {
  switch (category) {
    case "directory":
      return "easy";
    case "blog":
    case "forum":
      return "medium";
    case "publication":
    case "association":
      return "hard";
    default:
      return "medium";
  }
}

async function postDataForSeoBulkRanksBatch(domains) {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;

  if (!login || !password) {
    throw new Error("Missing DATAFORSEO credentials on server.");
  }

  const safeDomains = uniqueStrings(
    domains.map((item) => normalizeDomain(item)).filter((item) => isLikelyDomain(item))
  );

  if (!safeDomains.length) {
    return new Map();
  }

  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  const response = await fetch("https://api.dataforseo.com/v3/backlinks/bulk_ranks/live", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        targets: safeDomains,
      },
    ]),
  });

  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch (e) {
    json = null;
  }

  if (!json) {
    throw new Error("DataForSEO returned a non-JSON response.");
  }

  if (json?.status_code !== 20000) {
    throw new Error(json?.status_message || "DataForSEO request failed.");
  }

  const task = Array.isArray(json?.tasks) ? json.tasks[0] : null;

  if (!task || task.status_code !== 20000) {
    throw new Error(task?.status_message || "DataForSEO bulk ranks task failed.");
  }

  const result = Array.isArray(task?.result) ? task.result[0] || {} : {};
  const items = Array.isArray(result?.items) ? result.items : [];

  const out = new Map();

  safeDomains.forEach((domain) => {
    out.set(domain, null);
  });

  items.forEach((item) => {
    const target = normalizeDomain(item?.target || "");
    if (!target) return;

    const rankValue = asNum(item?.rank, null);
    out.set(target, rankValue != null ? Math.round(rankValue) : null);
  });

  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);
    const { websiteId } = req.body || {};

    if (!websiteId) {
      return res.status(400).json({ error: "Missing websiteId" });
    }

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);

    const db = admin.firestore();
    const backlinksModuleRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/backlinks`
    );

    const backlinksSnap = await backlinksModuleRef.get();
    const backlinksData = backlinksSnap.exists ? backlinksSnap.data() || {} : {};

    const gapOpportunities = Array.isArray(backlinksData?.gapOpportunities)
      ? backlinksData.gapOpportunities
      : [];

    if (!gapOpportunities.length) {
      return res.status(400).json({
        error: "Run Gap Analysis first to generate backlink opportunities.",
      });
    }

    const existingEnriched = Array.isArray(backlinksData?.enrichedGapOpportunities)
      ? backlinksData.enrichedGapOpportunities
      : [];

    const existingRankMap = new Map(
      existingEnriched
        .map((item) => [
          normalizeDomain(item?.normalizedDomain || item?.referringDomain || item?.domain || ""),
          asNum(item?.domainRank, null),
        ])
        .filter(([domain]) => domain)
    );

    const baseRows = gapOpportunities
      .map((item) => {
        const normalizedDomain = normalizeDomain(
          item?.normalizedDomain || item?.referringDomain || item?.domain || ""
        );

        const linkedCompetitors = uniqueStrings(
          (
            Array.isArray(item?.linkedCompetitors)
              ? item.linkedCompetitors
              : Array.isArray(item?.competitors)
              ? item.competitors
              : []
          ).map((entry) => normalizeDomain(entry))
        ).filter(Boolean);

        const linkedCompetitorCount = Number.isFinite(Number(item?.linkedCompetitorCount))
          ? Number(item.linkedCompetitorCount)
          : Number.isFinite(Number(item?.competitorCount))
          ? Number(item.competitorCount)
          : linkedCompetitors.length;

        return {
          domain: normalizedDomain,
          referringDomain: normalizedDomain,
          normalizedDomain,
          linkedCompetitors,
          competitors: linkedCompetitors,
          linkedCompetitorCount,
          competitorCount: linkedCompetitorCount,
          discoveredAt: item?.discoveredAt || null,
          updatedAt: item?.updatedAt || null,
          source: String(item?.source || "competitor_gap").trim() || "competitor_gap",
        };
      })
      .filter((item) => isLikelyDomain(item.normalizedDomain));

    const BATCH_SIZE = 50;
 const PROCESS_LIMIT = 500;

    const rankMap = new Map();

    for (let start = 0; start < baseRows.length; start += BATCH_SIZE) {
      const batch = baseRows.slice(start, start + BATCH_SIZE);
      const batchRanks = await postDataForSeoBulkRanksBatch(
        batch.map((row) => row.normalizedDomain)
      );

      for (const row of batch) {
        const rank =
          batchRanks.get(row.normalizedDomain) ??
          existingRankMap.get(row.normalizedDomain) ??
          null;

        rankMap.set(row.normalizedDomain, rank);
      }
    }

    const rankedRows = baseRows
      .map((row) => ({
        ...row,
        domainRank:
          rankMap.get(row.normalizedDomain) ??
          existingRankMap.get(row.normalizedDomain) ??
          null,
      }))
      .sort((a, b) => {
        if (b.linkedCompetitorCount !== a.linkedCompetitorCount) {
          return b.linkedCompetitorCount - a.linkedCompetitorCount;
        }

        const aRank = Number.isFinite(Number(a.domainRank)) ? Number(a.domainRank) : -1;
        const bRank = Number.isFinite(Number(b.domainRank)) ? Number(b.domainRank) : -1;

        if (bRank !== aRank) {
          return bRank - aRank;
        }

        return a.normalizedDomain.localeCompare(b.normalizedDomain);
      });

    const rowsToProcess = rankedRows.slice(0, PROCESS_LIMIT);
    const nowIso = new Date().toISOString();

    let partialCount = 0;

    const enrichedGapOpportunities = rowsToProcess.map((row) => {
      const category = classifyCategory(row.normalizedDomain);
      const method = categoryToMethod(category);
      const difficulty = categoryToDifficulty(category);

      if (!Number.isFinite(Number(row.domainRank))) {
        partialCount += 1;
      }

      return {
        domain: row.normalizedDomain,
        referringDomain: row.referringDomain,
        normalizedDomain: row.normalizedDomain,
        linkedCompetitors: row.linkedCompetitors,
        competitors: row.competitors,
        linkedCompetitorCount: row.linkedCompetitorCount,
        competitorCount: row.competitorCount,
        domainRank: Number.isFinite(Number(row.domainRank)) ? Number(row.domainRank) : null,
        category,
        method,
        acquisitionMethod: method,
        difficulty,
        source: "competitor_gap_enriched",
        discoveredAt: row.discoveredAt || nowIso,
        enrichedAt: nowIso,
        updatedAt: nowIso,
      };
    });

     const enrichmentMeta = {
      totalEnriched: enrichedGapOpportunities.length,
      processedCount: rowsToProcess.length,
      partialCount,
      capped: false,
      capUsed: rowsToProcess.length,
      source: "dataforseo_backlinks_bulk_ranks_live + lightweight_classification",
      generatedAt: nowTs(),
      updatedAt: nowTs(),
    };

const existing = docSnap.data()?.enrichedGapOpportunities || [];

const merged = [...existing, ...enrichedGapOpportunities];

await backlinksModuleRef.set(
  {
    enrichedGapOpportunities: merged,
    enrichmentMeta,
    updatedAt: nowTs(),
  },
  { merge: true }
);

    return res.status(200).json({
      ok: true,
      enrichedGapOpportunities,
           enrichmentMeta: {
        totalEnriched: enrichedGapOpportunities.length,
        processedCount: rowsToProcess.length,
        partialCount,
        capped: false,
        capUsed: rowsToProcess.length,
        source: "dataforseo_backlinks_bulk_ranks_live + lightweight_classification",
        generatedAt: nowIso,
        updatedAt: nowIso,
      },
    });
  } catch (e) {
    console.error("enrich-opportunities error:", e);
    return res.status(500).json({
      error: "We could not analyze backlink opportunities right now. Please try again.",
      message: e?.message || String(e),
    });
  }
}
