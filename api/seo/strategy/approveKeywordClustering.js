// api/seo/strategy/approveKeywordClustering.js
//
// STEP 5 — Approve & Lock
// Enforces guardrails. If valid:
// - finalVersion = userVersion
// - approved=true, approvedAt=timestamp
//
// HARD BLOCKS (non-negotiable):
// - shortlist >= 60
// - pillars <= 6
// - each pillar has >= 1 cluster
// - each cluster has >= 3 keywords
// - no duplicate keyword across clusters

import admin from "../../firebaseAdmin";

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
    return { effectiveUid: uid, effectiveWebsiteId: websiteId };
  }

  const w = snap.data() || {};
  const effectiveUid = w.ownerUid || uid;
  const effectiveWebsiteId = w.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId };
}

function safeKey(s) {
  return String(s || "").trim().toLowerCase();
}

function collectBlockers({ pillars, shortlist }) {
  const blockers = [];

  const shortlistCount = Array.isArray(shortlist) ? shortlist.length : 0;
  if (shortlistCount < 60) {
    blockers.push({
      code: "MIN_KEYWORDS",
      message: "Total shortlisted keywords must be at least 60.",
    });
  }

  const pillarCount = Array.isArray(pillars) ? pillars.length : 0;
  if (pillarCount > 6) {
    blockers.push({
      code: "MAX_PILLARS",
      message: "Pillars must be 6 or fewer.",
    });
  }

  // Each pillar must have >= 1 cluster
  for (const p of pillars || []) {
    const clusters = Array.isArray(p?.clusters) ? p.clusters : [];
    if (clusters.length < 1) {
      blockers.push({
        code: "PILLAR_NO_CLUSTERS",
        message: `Pillar ${p?.pillarId || ""} must have at least 1 cluster.`,
      });
    }
  }

  // Each cluster must have >= 3 keywords
  for (const p of pillars || []) {
    for (const c of p?.clusters || []) {
      const kws = Array.isArray(c?.keywords) ? c.keywords : [];
      if (kws.length < 3) {
        blockers.push({
          code: "CLUSTER_TOO_SMALL",
          message: `Cluster ${c?.clusterId || ""} must have at least 3 keywords.`,
        });
      }
    }
  }

  // No duplicates across clusters
  const seen = new Map(); // kw -> "p::c"
  for (const p of pillars || []) {
    for (const c of p?.clusters || []) {
      for (const kw of c?.keywords || []) {
        const k = safeKey(kw?.keyword);
        if (!k) continue;
        const loc = `${p.pillarId}::${c.clusterId}`;
        if (seen.has(k) && seen.get(k) !== loc) {
          blockers.push({
            code: "DUPLICATE_KEYWORD",
            message: `Duplicate keyword across clusters: "${kw.keyword}"`,
          });
        } else {
          seen.set(k, loc);
        }
      }
    }
  }

  return { blockers, shortlistCount };
}

const WARNING_TEXT =
  "Your current keyword structure is too narrow. Reducing strategic breadth below 60 keywords may limit topical authority, weaken rankings, and reduce long-term SEO impact. Please add/restore keywords before locking.";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const { websiteId } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const { effectiveUid, effectiveWebsiteId } =
      await resolveEffectiveContext(uid, websiteId);

    const db = admin.firestore();

    const keywordClusteringRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/keywordClustering`
    );

    const snap = await keywordClusteringRef.get();
    if (!snap.exists) {
      return res.status(400).json({
        error: "keywordClustering doc missing. Generate Step 5 first.",
      });
    }

    const existing = snap.data() || {};

    if (existing?.approved === true) {
      return res.status(200).json({
        ok: true,
        alreadyApproved: true,
      });
    }

    const userVersion = existing?.userVersion || {};
    const pillars = Array.isArray(userVersion?.pillars) ? userVersion.pillars : [];
    const shortlist = Array.isArray(userVersion?.shortlist) ? userVersion.shortlist : [];

    const { blockers, shortlistCount } = collectBlockers({ pillars, shortlist });

    if (blockers.length) {
      await keywordClusteringRef.set(
        {
          validation: {
            minKeywordsRequired: 60,
            currentShortlistCount: shortlistCount,
            blockers,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return res.status(400).json({
        error: "Approval blocked by validation rules.",
        warning: WARNING_TEXT,
        blockers,
      });
    }

    // Approve: freeze finalVersion from userVersion
    await keywordClusteringRef.set(
      {
        finalVersion: {
          pillars,
          shortlist,
        },
        approved: true,
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        validation: {
          minKeywordsRequired: 60,
          currentShortlistCount: shortlistCount,
          blockers: [],
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, approved: true });
  } catch (e) {
    console.error("approveKeywordClustering error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
