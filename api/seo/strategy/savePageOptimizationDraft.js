// api/seo/strategy/savePageOptimizationDraft.js
//
// STEP 7 — Auto-save + Page Approval + Global Lock
//
// HARD RULES:
// - Refuse if strategy/pageOptimization.locked === true
// - Update ONLY the specified page (pages.{pageId}.*) — do not rewrite whole doc
// - User can edit: title, metaDescription, h1, h2Structure text, internalLinks
// - User can approve/reject: advisoryBlocks (status), schemaSuggestions (status)
// - User CANNOT modify schemaSuggestions[].json (server enforces immutability)
// - User CANNOT modify contentBlocks heading/purpose (only status allowed)
//
// Supported actions (req.body.action):
// - "autosave" (default)
// - "approvePage"
// - "lockStep"
//
// Firestore doc:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/pageOptimization

import admin from "../../firebaseAdmin";

// -------------------- AUTH --------------------
async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

// -------------------- EFFECTIVE CONTEXT --------------------
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

// -------------------- HELPERS --------------------
function nowTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function safeStr(x) {
  return String(x || "").trim();
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function clampArrayStrings(arr, max = 12) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => safeStr(x))
    .filter(Boolean)
    .slice(0, max);
}

function sanitizeInternalLinks(arr, max = 10) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (!isPlainObject(x)) continue;
    const anchorText = safeStr(x.anchorText);
    const targetUrl = safeStr(x.targetUrl);
    if (!anchorText || !targetUrl) continue;
    out.push({ anchorText, targetUrl });
    if (out.length >= max) break;
  }
  return out;
}

function normalizeStatus(v, allowedA, allowedB, fallback) {
  if (v === allowedA) return allowedA;
  if (v === allowedB) return allowedB;
  return fallback;
}

// advisoryBlocks: only allow status changes; message+rationale immutable
function mergeAdvisoryBlocks(existing, incoming) {
  if (!Array.isArray(existing)) return [];
  if (!Array.isArray(incoming)) return existing;

  // try to match by (message + rationale)
  const out = existing.map((e) => ({ ...e }));
  const idxByKey = new Map();
  for (let i = 0; i < out.length; i++) {
    const k = `${safeStr(out[i].message)}||${safeStr(out[i].rationale)}`.toLowerCase();
    idxByKey.set(k, i);
  }

  for (const inc of incoming) {
    if (!isPlainObject(inc)) continue;
    const key = `${safeStr(inc.message)}||${safeStr(inc.rationale)}`.toLowerCase();
    const idx = idxByKey.get(key);
    if (idx === undefined) continue;

    out[idx].status = normalizeStatus(inc.status, "approved", "rejected", out[idx].status || "approved");
  }

  return out;
}

// schemaSuggestions: json immutable; only status allowed, matched by type
function mergeSchemaSuggestions(existing, incoming) {
  if (!Array.isArray(existing)) return [];
  if (!Array.isArray(incoming)) return existing;

  const out = existing.map((e) => ({ ...e }));
  const idxByType = new Map();
  for (let i = 0; i < out.length; i++) {
    const t = safeStr(out[i].type).toLowerCase();
    if (t) idxByType.set(t, i);
  }

  for (const inc of incoming) {
    if (!isPlainObject(inc)) continue;
    const t = safeStr(inc.type).toLowerCase();
    if (!t) continue;

    const idx = idxByType.get(t);
    if (idx === undefined) continue;

    // enforce JSON immutability: ignore inc.json completely
    out[idx].status = normalizeStatus(inc.status, "accepted", "rejected", out[idx].status || "accepted");
  }

  return out;
}

// contentBlocks: heading/purpose immutable; allow only status changes, matched by heading
function mergeContentBlocks(existing, incoming) {
  if (!Array.isArray(existing)) return [];
  if (!Array.isArray(incoming)) return existing;

  const out = existing.map((e) => ({ ...e }));
  const idxByHeading = new Map();
  for (let i = 0; i < out.length; i++) {
    const h = safeStr(out[i].heading).toLowerCase();
    if (h) idxByHeading.set(h, i);
  }

  for (const inc of incoming) {
    if (!isPlainObject(inc)) continue;
    const h = safeStr(inc.heading).toLowerCase();
    if (!h) continue;

    const idx = idxByHeading.get(h);
    if (idx === undefined) continue;

    out[idx].status = normalizeStatus(inc.status, "approved", "rejected", out[idx].status || "approved");
  }

  return out;
}

// recompute allPagesApproved
function computeAllApproved(pagesObj) {
  if (!pagesObj || typeof pagesObj !== "object") return false;
  const keys = Object.keys(pagesObj);
  if (!keys.length) return false;
  for (const k of keys) {
    if (pagesObj[k]?.approved !== true) return false;
  }
  return true;
}

// -------------------- MAIN HANDLER --------------------
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const uid = await getUidFromRequest(req);
    const { websiteId, action } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(uid, websiteId);
    const db = admin.firestore();

    const pageOptimizationRef = db.doc(
      `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/pageOptimization`
    );

    const snap = await pageOptimizationRef.get();
    if (!snap.exists) return res.status(400).json({ error: "Missing pageOptimization. Generate Step 7 first." });

    const doc = snap.data() || {};
    if (doc.locked === true) {
      return res.status(400).json({ error: "Step 7 is locked. No further edits allowed." });
    }

    const act = safeStr(action) || "autosave";

    // -------------------- LOCK STEP (global) --------------------
    if (act === "lockStep") {
      const allOk = doc.allPagesApproved === true || computeAllApproved(doc.pages);
      if (!allOk) {
        return res.status(400).json({ error: "Cannot lock Step 7 until all pages are approved." });
      }

      await pageOptimizationRef.update({
        locked: true,
        autoSavedAt: nowTs(),
      });

      return res.status(200).json({ ok: true, locked: true });
    }

    // From here on, pageId is required
    const { pageId } = req.body || {};
    if (!pageId) return res.status(400).json({ error: "Missing pageId" });

    const pages = doc.pages || {};
    const existingPage = pages[pageId];
    if (!existingPage) return res.status(400).json({ error: "Invalid pageId (page not found in pageOptimization)." });

    // -------------------- APPROVE PAGE --------------------
    if (act === "approvePage") {
      const pagePathApproved = `pages.${pageId}.approved`;
      const pagePathApprovedAt = `pages.${pageId}.approvedAt`;
      const pagePathAutoSavedAt = `pages.${pageId}.autoSavedAt`;

      await pageOptimizationRef.update({
        [pagePathApproved]: true,
        [pagePathApprovedAt]: nowTs(),
        [pagePathAutoSavedAt]: nowTs(),
      });

      // recompute allPagesApproved (needs latest values)
      const afterSnap = await pageOptimizationRef.get();
      const after = afterSnap.data() || {};
      const allPagesApproved = computeAllApproved(after.pages || {});

      if (allPagesApproved !== (after.allPagesApproved === true)) {
        await pageOptimizationRef.update({
          allPagesApproved,
          autoSavedAt: nowTs(),
        });
      }

      return res.status(200).json({ ok: true, approved: true, allPagesApproved });
    }

    // -------------------- AUTOSAVE (default) --------------------
    const {
      title,
      metaDescription,
      h1,
      h2Structure,
      internalLinks,
      advisoryBlocks,
      schemaSuggestions,
      contentBlocks,
    } = req.body || {};

    // If page already approved, we still allow edits until locked? Baton says "Approve Page locks that page only."
    // So we enforce: if approved === true, block edits to that page.
    if (existingPage.approved === true) {
      return res.status(400).json({ error: "This page is approved and locked. Unapprove is not supported." });
    }

    const updateMap = {};
    const base = `pages.${pageId}`;

    if (title !== undefined) updateMap[`${base}.title`] = safeStr(title);
    if (metaDescription !== undefined) updateMap[`${base}.metaDescription`] = safeStr(metaDescription);
    if (h1 !== undefined) updateMap[`${base}.h1`] = safeStr(h1);

    if (h2Structure !== undefined) {
      updateMap[`${base}.h2Structure`] = clampArrayStrings(h2Structure, 14);
    }

    if (internalLinks !== undefined) {
      updateMap[`${base}.internalLinks`] = sanitizeInternalLinks(internalLinks, 14);
    }

    // advisoryBlocks: status only
    if (advisoryBlocks !== undefined) {
      const merged = mergeAdvisoryBlocks(existingPage.advisoryBlocks || [], advisoryBlocks);
      updateMap[`${base}.advisoryBlocks`] = merged;
    }

    // schemaSuggestions: status only; json immutable
    if (schemaSuggestions !== undefined) {
      const merged = mergeSchemaSuggestions(existingPage.schemaSuggestions || [], schemaSuggestions);
      updateMap[`${base}.schemaSuggestions`] = merged;
    }

    // contentBlocks: allow status only (optional)
    if (contentBlocks !== undefined) {
      const merged = mergeContentBlocks(existingPage.contentBlocks || [], contentBlocks);
      updateMap[`${base}.contentBlocks`] = merged;
    }

    // always bump autosave timestamps
    updateMap[`${base}.autoSavedAt`] = nowTs();
    updateMap[`autoSavedAt`] = nowTs();

    // If no valid fields were provided, still return ok (so UI doesn’t break)
    if (Object.keys(updateMap).length === 0) {
      return res.status(200).json({ ok: true, saved: false });
    }

    await pageOptimizationRef.update(updateMap);

    return res.status(200).json({ ok: true, saved: true });
  } catch (e) {
    console.error("savePageOptimizationDraft error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
