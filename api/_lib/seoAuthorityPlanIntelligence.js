// api/_lib/seoAuthorityPlanIntelligence.js
//
// STEP 8A — Authority Growth Plan (90-Day Blueprint)
// Helper utilities ONLY (no Firestore writes here).
//
// IMPORTANT:
// - Keep this file dependency-free (no npm libs).
// - Deterministic output (no OpenAI calls here).
// - Uses Step 5 finalVersion.pillars[] as the source of truth.

export function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function normalize01(values) {
  const arr = Array.isArray(values) ? values.map((v) => Number(v)) : [];
  let min = Infinity;
  let max = -Infinity;

  for (const v of arr) {
    const n = Number.isFinite(v) ? v : 0;
    if (n < min) min = n;
    if (n > max) max = n;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return arr.map(() => 0);
  }

  return arr.map((v) => (Number.isFinite(v) ? (v - min) / (max - min) : 0));
}

function safeStr(x) {
  return String(x ?? "").trim();
}

function safeLower(x) {
  return safeStr(x).toLowerCase();
}

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function log1p(x) {
  const n = Math.max(0, safeNum(x, 0));
  return Math.log(1 + n);
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function slugify(s) {
  const raw = safeLower(s);
  const cleaned = raw
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "blog";
}

function intentKey(intent) {
  const k = safeLower(intent);
  if (k === "informational") return "informational";
  if (k === "commercial") return "commercial";
  if (k === "transactional") return "transactional";
  if (k === "navigational") return "navigational";
  return "other";
}

function monthIntentPreference(month) {
  // Month 1: informational first
  // Month 2: balanced
  // Month 3: commercial/transactional higher
  if (month === 1) {
    return {
      informational: 1,
      other: 2,
      navigational: 3,
      commercial: 4,
      transactional: 5,
    };
  }
  if (month === 2) {
    return {
      informational: 2,
      other: 1,
      navigational: 3,
      commercial: 4,
      transactional: 5,
    };
  }
  return {
    transactional: 1,
    commercial: 2,
    informational: 3,
    other: 4,
    navigational: 5,
  };
}

function impactTagForRow({ geoMode, intent }) {
  const gm = safeLower(geoMode);
  const ik = intentKey(intent);

  if (gm === "local") return "Local Visibility Boost";

  if (ik === "transactional") return "Commercial Intent";
  if (ik === "commercial") return "Conversion Support";
  if (ik === "informational") return "Authority Builder";
  return "Traffic Driver";
}

function titleTemplate({ pillarName, primaryKeyword, intent }) {
  const ik = intentKey(intent);

  if (ik === "transactional") {
    return `Best ${pillarName}: What to Choose + Key Buying Checks (${primaryKeyword})`;
  }
  if (ik === "commercial") {
    return `${pillarName} Options Compared: Pricing, Pros/Cons, and What Fits You (${primaryKeyword})`;
  }
  if (ik === "navigational") {
    return `${pillarName}: Key Pages, Resources, and Next Steps (${primaryKeyword})`;
  }
  // informational / other
  return `${pillarName} Guide: Meaning, Benefits, Process, and Common Questions (${primaryKeyword})`;
}

function synopsisTemplate({ pillarName, primaryKeyword, intent, geoMode, location_name }) {
  const ik = intentKey(intent);
  const gm = safeLower(geoMode);

  const localLine =
    gm === "local" && safeStr(location_name)
      ? `This is tailored for searches in ${safeStr(location_name)}. `
      : "";

  if (ik === "transactional") {
    return (
      `${localLine}This article helps readers who are ready to take action around ${pillarName}. ` +
      `It explains what to check before choosing, how to compare options, typical pricing signals, ` +
      `and how to avoid common mistakes—anchored to the primary search intent: ${primaryKeyword}.`
    );
  }

  if (ik === "commercial") {
    return (
      `${localLine}This comparison-style post supports people evaluating ${pillarName}. ` +
      `It covers decision criteria, real-world trade-offs, and what to prioritize based on outcomes, ` +
      `with the topic framed around the key query: ${primaryKeyword}.`
    );
  }

  // informational / other / navigational
  return (
    `${localLine}This guide builds clarity and authority around ${pillarName}. ` +
    `It explains the concept, answers common questions, and outlines the right approach step-by-step, ` +
    `aligned to the main query: ${primaryKeyword}.`
  );
}

function targetAudienceTemplate({ pillarName, intent }) {
  const ik = intentKey(intent);
  if (ik === "transactional") return `People ready to choose or purchase within ${pillarName}`;
  if (ik === "commercial") return `People comparing providers/options within ${pillarName}`;
  if (ik === "navigational") return `People looking for the best next step in ${pillarName}`;
  return `People researching and learning about ${pillarName}`;
}

function ctaFocusTemplate({ pillarName, intent }) {
  const ik = intentKey(intent);
  if (ik === "transactional") return `Start with the best-fit option in ${pillarName}`;
  if (ik === "commercial") return `Compare and shortlist your best-fit ${pillarName} choice`;
  return `Explore related resources in ${pillarName}`;
}

function flattenPillarKeywords(pillar) {
  const clusters = asArray(pillar?.clusters);
  const out = [];

  for (const c of clusters) {
    const kws = asArray(c?.keywords);
    for (const kw of kws) {
      const keyword = safeStr(kw?.keyword);
      if (!keyword) continue;

      out.push({
        keyword,
        volume: safeNum(kw?.volume, 0),
        intent: intentKey(kw?.intent),
        competition_index: kw?.competition_index,
        clusterId: safeStr(c?.clusterId),
        clusterName: safeStr(c?.name),
      });
    }
  }

  return out;
}

function computePillarSignals(pillar) {
  const kws = flattenPillarKeywords(pillar);
  const clusters = asArray(pillar?.clusters);
  const clusterCount = clusters.length;

  const sumVolume = kws.reduce((acc, k) => acc + safeNum(k.volume, 0), 0);

  const intentsSet = new Set(kws.map((k) => intentKey(k.intent)));
  intentsSet.delete(""); // safety
  const distinctIntents = intentsSet.size;

  const commercialCount = kws.filter((k) => k.intent === "commercial" || k.intent === "transactional").length;
  const commercialDensity = kws.length ? commercialCount / kws.length : 0;

  // Opportunity: inverse avg competition_index (0..100 expected sometimes)
  // If missing, neutral 0.5
  let opp = 0.5;
  const compVals = kws
    .map((k) => safeNum(k.competition_index, NaN))
    .filter((n) => Number.isFinite(n));

  if (compVals.length) {
    const avg = compVals.reduce((a, b) => a + b, 0) / compVals.length;
    // Normalize comp to 0..1 (if already 0..1 keep; if 0..100 bring down)
    const comp01 = avg > 1 ? clamp01(avg / 100) : clamp01(avg);
    opp = clamp01(1 - comp01);
  }

  return {
    sumVolume,
    distinctIntents,
    commercialDensity,
    clusterCount,
    opportunity: opp,
  };
}

export function computeAuthorityScores(pillars) {
  const ps = asArray(pillars);

  const signals = ps.map((p) => computePillarSignals(p));

  // Components (normalized)
  const volumeRaw = signals.map((s) => log1p(s.sumVolume));
  const volumeScore = normalize01(volumeRaw);

  // intent diversity: distinct intents count normalized using min-max
  const intentRaw = signals.map((s) => safeNum(s.distinctIntents, 0));
  const intentDiversityScore = normalize01(intentRaw);

  const commercialDensityScore = signals.map((s) => clamp01(s.commercialDensity));

  const depthRaw = signals.map((s) => safeNum(s.clusterCount, 0));
  const clusterDepthScore = normalize01(depthRaw);

  const opportunityScore = signals.map((s) => clamp01(s.opportunity));

  // ADS formula per baton
  const ads = ps.map((p, i) => {
    const v = clamp01(volumeScore[i]);
    const id = clamp01(intentDiversityScore[i]);
    const cd = clamp01(commercialDensityScore[i]);
    const dp = clamp01(clusterDepthScore[i]);
    const op = clamp01(opportunityScore[i]);

    const score = v * 0.4 + id * 0.25 + cd * 0.15 + dp * 0.1 + op * 0.1;
    return clamp01(score);
  });

  // Normalize ADS to 0..1 for display
  const authorityScore = normalize01(ads).map((x) => clamp01(x));

  // Weights for allocations: ADS / sum(ADS)
  const sumAds = ads.reduce((a, b) => a + b, 0);
  const weights =
    sumAds > 0 ? ads.map((x) => x / sumAds) : ps.map(() => (ps.length ? 1 / ps.length : 0));

  return ps.map((p, i) => ({
    pillarId: safeStr(p?.pillarId),
    pillarName: safeStr(p?.name) || "Pillar",
    authorityScore: authorityScore[i],
    adsBreakdown: {
      volumeScore: clamp01(volumeScore[i]),
      intentDiversityScore: clamp01(intentDiversityScore[i]),
      commercialDensityScore: clamp01(commercialDensityScore[i]),
      clusterDepthScore: clamp01(clusterDepthScore[i]),
      opportunityScore: clamp01(opportunityScore[i]),
    },
    weight: weights[i],
    _signals: signals[i],
  }));
}

export function recommendTotalBlogs(pillars) {
  // globalDemand = sum(log(sum(volume)+1)) across pillars
  const ps = asArray(pillars);
  const demandRaw = ps.map((p) => {
    const s = computePillarSignals(p);
    return log1p(s.sumVolume);
  });

  const globalDemand = demandRaw.reduce((a, b) => a + b, 0);

  // Map to [12..36] with typical outcomes 18–30:
  // Use a smooth mapping: x -> 12 + 24*(1 - e^(-x/k))
  // k controls how fast it saturates. k=6 gives reasonable range.
  const k = 6;
  const mapped = 12 + 24 * (1 - Math.exp(-globalDemand / k));

  const recommended = Math.round(mapped);

  const bounded = Math.max(12, Math.min(36, recommended));

  const sliderMin = Math.floor(bounded * 0.8);
  const sliderMax = Math.ceil(bounded * 1.2);

  return {
    recommendedTotalBlogs: bounded,
    sliderMin,
    sliderMax,
  };
}

export function allocateBlogs(scores, adjustedTotalBlogs) {
  const rows = asArray(scores);
  const total = Math.max(0, Math.round(safeNum(adjustedTotalBlogs, 0)));

  if (!rows.length || total <= 0) {
    return rows.map((r) => ({ ...r, allocatedBlogs: 0 }));
  }

  // Initial rounding
  const allocations = rows.map((r) => Math.round((r.weight || 0) * total));
  let drift = total - allocations.reduce((a, b) => a + b, 0);

  // Fix drift: add/subtract starting from highest weight pillars
  const order = rows
    .map((r, i) => ({ i, w: safeNum(r.weight, 0) }))
    .sort((a, b) => b.w - a.w)
    .map((x) => x.i);

  let cursor = 0;
  while (drift !== 0 && order.length) {
    const ix = order[cursor % order.length];
    if (drift > 0) {
      allocations[ix] += 1;
      drift -= 1;
    } else {
      // drift < 0
      if (allocations[ix] > 0) {
        allocations[ix] -= 1;
        drift += 1;
      }
    }
    cursor += 1;
    // Safety stop
    if (cursor > 10000) break;
  }

  return rows.map((r, i) => ({ ...r, allocatedBlogs: allocations[i] }));
}

function allocateIntoMonthsForPillar({
  allocatedBlogs,
  pillarRank, // 0 = highest authorityScore
}) {
  const total = Math.max(0, Math.round(allocatedBlogs || 0));
  if (total === 0) return { m1: 0, m2: 0, m3: 0 };

  // Base month weights: 40/35/25
  let w1 = 0.4;
  let w2 = 0.35;
  let w3 = 0.25;

  // Front-load top 1–2 pillars (small boost to Month 1)
  if (pillarRank === 0) {
    w1 += 0.05;
    w3 -= 0.05;
  } else if (pillarRank === 1) {
    w1 += 0.03;
    w3 -= 0.03;
  }

  // Normalize weights
  const sum = w1 + w2 + w3;
  w1 /= sum;
  w2 /= sum;
  w3 /= sum;

  let m1 = Math.round(total * w1);
  let m2 = Math.round(total * w2);
  let m3 = total - m1 - m2;

  // Fix negatives if any
  if (m3 < 0) {
    m3 = 0;
    const rem = total - m3;
    m1 = Math.round(rem * 0.55);
    m2 = rem - m1;
  }

  return { m1, m2, m3 };
}

function pickKeywordsForMonth({ keywords, month, count, usedSet }) {
  const pref = monthIntentPreference(month);

  // Score keywords so we pick in month-appropriate order:
  // intent preference (lower is better), then volume desc
  const ranked = keywords
    .filter((k) => !usedSet.has(safeLower(k.keyword)))
    .map((k) => ({
      ...k,
      _intentRank: pref[intentKey(k.intent)] ?? 99,
      _vol: safeNum(k.volume, 0),
    }))
    .sort((a, b) => {
      if (a._intentRank !== b._intentRank) return a._intentRank - b._intentRank;
      return b._vol - a._vol;
    });

  const out = [];
  for (const k of ranked) {
    if (out.length >= count) break;
    usedSet.add(safeLower(k.keyword));
    out.push(k);
  }

  // If not enough unique keywords, allow re-use (fallback)
  if (out.length < count) {
    const more = keywords
      .map((k) => ({
        ...k,
        _intentRank: pref[intentKey(k.intent)] ?? 99,
        _vol: safeNum(k.volume, 0),
      }))
      .sort((a, b) => {
        if (a._intentRank !== b._intentRank) return a._intentRank - b._intentRank;
        return b._vol - a._vol;
      });

    for (const k of more) {
      if (out.length >= count) break;
      out.push(k);
    }
  }

  return out.slice(0, count);
}

function buildRow({
  month,
  pillarName,
  geoMode,
  location_name,
  primaryKeyword,
  intent,
  rowIndex,
  slugUniq,
}) {
  const title = titleTemplate({ pillarName, primaryKeyword, intent });
  const baseSlug = slugify(primaryKeyword);
  const slug = slugUniq(baseSlug, month);

  return {
    id: `${month}-${slug}-${rowIndex}`,
    month,
    pillarName,
    blogTitle: title,
    slug,
    primaryKeyword,
    secondaryKeywords: [],
    intent: intentKey(intent),
    targetAudience: targetAudienceTemplate({ pillarName, intent }),
    synopsis: synopsisTemplate({
      pillarName,
      primaryKeyword,
      intent,
      geoMode,
      location_name,
    }),
    internalLinkTargets: [],
    ctaFocus: ctaFocusTemplate({ pillarName, intent }),
    impactTag: impactTagForRow({ geoMode, intent }),
  };
}

export function build90DayPlan({
  pillars,
  scoredAllocations, // output of allocateBlogs()
  geoMode,
  location_name,
  language_code,
}) {
  const allocations = asArray(scoredAllocations);

  // Rank pillars by authorityScore desc (for front-load month tweak)
  const ranked = allocations
    .map((p, i) => ({ ...p, _idx: i }))
    .sort((a, b) => safeNum(b.authorityScore, 0) - safeNum(a.authorityScore, 0));

  const usedKeywords = new Set();

  const months = { month1: [], month2: [], month3: [] };

  // Slug uniqueness helper across entire plan
  const usedSlugs = new Set();
  const slugUniq = (baseSlug, month) => {
    let s = baseSlug;
    let n = 1;
    while (usedSlugs.has(s)) {
      n += 1;
      s = `${baseSlug}-m${month}-${n}`;
    }
    usedSlugs.add(s);
    return s;
  };

  for (let r = 0; r < ranked.length; r++) {
    const p = ranked[r];
    const pillarName = safeStr(p.pillarName) || "Pillar";
    const alloc = Math.max(0, Math.round(p.allocatedBlogs || 0));
    if (alloc === 0) continue;

    const originalPillar = asArray(pillars).find((x) => safeStr(x?.pillarId) === safeStr(p.pillarId)) || null;
    const keywords = originalPillar ? flattenPillarKeywords(originalPillar) : [];

    // If pillar has no keywords for any reason, skip rows safely
    if (!keywords.length) continue;

    const { m1, m2, m3 } = allocateIntoMonthsForPillar({
      allocatedBlogs: alloc,
      pillarRank: r,
    });

    const k1 = pickKeywordsForMonth({ keywords, month: 1, count: m1, usedSet: usedKeywords });
    const k2 = pickKeywordsForMonth({ keywords, month: 2, count: m2, usedSet: usedKeywords });
    const k3 = pickKeywordsForMonth({ keywords, month: 3, count: m3, usedSet: usedKeywords });

    let idx = 0;

    for (const k of k1) {
      idx += 1;
      months.month1.push(
        buildRow({
          month: 1,
          pillarName,
          geoMode,
          location_name,
          primaryKeyword: safeStr(k.keyword),
          intent: k.intent,
          rowIndex: idx,
          slugUniq,
        })
      );
    }

    for (const k of k2) {
      idx += 1;
      months.month2.push(
        buildRow({
          month: 2,
          pillarName,
          geoMode,
          location_name,
          primaryKeyword: safeStr(k.keyword),
          intent: k.intent,
          rowIndex: idx,
          slugUniq,
        })
      );
    }

    for (const k of k3) {
      idx += 1;
      months.month3.push(
        buildRow({
          month: 3,
          pillarName,
          geoMode,
          location_name,
          primaryKeyword: safeStr(k.keyword),
          intent: k.intent,
          rowIndex: idx,
          slugUniq,
        })
      );
    }
  }

  // Consultant-grade short reasoning summary (deterministic)
  const topPillars = ranked.slice(0, 2).map((p) => safeStr(p.pillarName)).filter(Boolean);
  const bullets = [
    `Plan is distributed across pillars using an Authority Demand Score (volume + intent diversity + commercial density + depth + opportunity).`,
    `Month 1 is front-loaded to build topical authority faster${topPillars.length ? ` (extra focus on: ${topPillars.join(", ")}).` : "."}`,
    `Intent progression is deliberate: informational first, balanced mid, and more commercial/transactional in Month 3.`,
  ];

  const notes =
    `Recommended totals and pillar allocations come from your Step 5 clustering data. ` +
    `Each blog row is anchored to an actual keyword inside the pillar, keeping the plan practical and directly executable.`;

  return {
    version: 1,
    geoMode: safeStr(geoMode) || "country",
    location_name: safeStr(location_name) || "",
    language_code: safeStr(language_code) || "en",
    pillarAllocations: ranked
      .map((p) => ({
        pillarName: safeStr(p.pillarName) || "Pillar",
        authorityScore: clamp01(safeNum(p.authorityScore, 0)),
        adsBreakdown: {
          volumeScore: clamp01(safeNum(p.adsBreakdown?.volumeScore, 0)),
          intentDiversityScore: clamp01(safeNum(p.adsBreakdown?.intentDiversityScore, 0)),
          commercialDensityScore: clamp01(safeNum(p.adsBreakdown?.commercialDensityScore, 0)),
          clusterDepthScore: clamp01(safeNum(p.adsBreakdown?.clusterDepthScore, 0)),
          opportunityScore: clamp01(safeNum(p.adsBreakdown?.opportunityScore, 0)),
        },
        allocatedBlogs: Math.max(0, Math.round(p.allocatedBlogs || 0)),
      }))
      .sort((a, b) => safeNum(b.authorityScore, 0) - safeNum(a.authorityScore, 0)),
    months,
    reasoningSummary: { bullets, notes },
  };
}
