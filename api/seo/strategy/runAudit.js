// api/seo/strategy/runAudit.js
// PURE On-Page Audit (no AI, no fixes)

import crypto from "crypto";
import admin from "../../firebaseAdmin";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    if (!(url.protocol === "http:" || url.protocol === "https:")) return null;
    url.hash = "";
    url.search = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch (e) {
    return null;
  }
}

function urlIdFromUrl(url) {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
}

function stripTags(s) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(s) {
  // Small, safe decoder for common entities (no external deps).
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagInner(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  if (!m) return "";
  return decodeHtmlEntities(stripTags(m[1]));
}

function getAllTagInner(html, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(decodeHtmlEntities(stripTags(m[1])));
  }
  return out.filter(Boolean);
}

function parseAttrs(tagHtml) {
  const attrs = {};
  const re = /(\w[\w:-]*)\s*=\s*["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(tagHtml)) !== null) {
    const k = String(m[1] || "").toLowerCase();
    const v = String(m[2] || "");
    attrs[k] = v;
  }
  return attrs;
}

function getMetaContent(html, nameValue) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const wanted = String(nameValue || "").toLowerCase();

  for (const t of tags) {
    const a = parseAttrs(t);
    const name = String(a.name || "").toLowerCase();
    if (name === wanted) return String(a.content || "").trim();
  }

  // handle property= / other ordering (best-effort)
  for (const t of tags) {
    const a = parseAttrs(t);
    const prop = String(a.property || "").toLowerCase();
    if (prop === wanted) return String(a.content || "").trim();
  }

  return "";
}

function getCanonical(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const t of tags) {
    const a = parseAttrs(t);
    const rel = String(a.rel || "").toLowerCase();
    if (rel === "canonical") return String(a.href || "").trim();
  }
  return "";
}

function hasJsonLd(html) {
  return /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
}

function countWordsFromHtml(html) {
  const text = stripTags(html);
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length;
}

function getImgStats(html) {
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  let missingAlt = 0;
  for (const t of tags) {
    const a = parseAttrs(t);
    const alt = a.alt;
    if (alt == null || String(alt).trim() === "") missingAlt += 1;
  }
  return { imageCount: tags.length, imagesMissingAlt: missingAlt };
}

function getLinkStats(html, pageUrl) {
  const aTags = html.match(/<a\b[^>]*>/gi) || [];
  let internal = 0;
  let external = 0;

  let pageHost = "";
  try {
    pageHost = new URL(pageUrl).host;
  } catch (e) {
    pageHost = "";
  }

  for (const t of aTags) {
    const attrs = parseAttrs(t);
    const hrefRaw = String(attrs.href || "").trim();
    if (!hrefRaw) continue;

    if (
      hrefRaw.startsWith("#") ||
      /^javascript:/i.test(hrefRaw) ||
      /^mailto:/i.test(hrefRaw) ||
      /^tel:/i.test(hrefRaw)
    ) {
      continue;
    }

    // relative => internal
    if (hrefRaw.startsWith("/")) {
      internal += 1;
      continue;
    }

    // absolute
    if (/^https?:\/\//i.test(hrefRaw)) {
      try {
        const u = new URL(hrefRaw);
        const isInternal = pageHost && u.host === pageHost;
        if (isInternal) internal += 1;
        else external += 1;
      } catch (e) {
        // ignore invalid
      }
      continue;
    }

    // other relative forms like "about" => treat as internal
    internal += 1;
  }

  return { internalLinkCount: internal, externalLinkCount: external };
}

async function fetchHtml(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "VyndowSEO/1.0 (+https://app.vyndow.com)",
        accept: "text/html,*/*",
      },
    });

    const html = await res.text();
    return { ok: res.ok, status: res.status, html };
  } catch (e) {
    return { ok: false, status: 0, html: "" };
  } finally {
    clearTimeout(t);
  }
}

async function resolveEffectiveContext(uid, websiteId) {
  // website doc exists under current user's namespace
  const ref = admin.firestore().doc(`users/${uid}/websites/${websiteId}`);
  const snap = await ref.get();

  if (!snap.exists) {
    // fall back to requested (best-effort)
    return { effectiveUid: uid, effectiveWebsiteId: websiteId };
  }

  const w = snap.data() || {};
  const effectiveUid = w.ownerUid || uid;
  const effectiveWebsiteId = w.ownerWebsiteId || websiteId;

  return { effectiveUid, effectiveWebsiteId };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const uid = await getUidFromRequest(req);

    const { websiteId, url } = req.body || {};
    if (!websiteId) return res.status(400).json({ error: "Missing websiteId" });
    if (!url) return res.status(400).json({ error: "Missing url" });

    const normalized = normalizeUrl(url);
    if (!normalized) return res.status(400).json({ error: "Invalid url" });

    const { effectiveUid, effectiveWebsiteId } = await resolveEffectiveContext(
      uid,
      websiteId
    );

    // Read URLs ONLY from strategy/pageDiscovery
    const pageDiscoveryRef = admin
      .firestore()
      .doc(
        `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/pageDiscovery`
      );

    const pdSnap = await pageDiscoveryRef.get();
    if (!pdSnap.exists) {
      return res.status(400).json({
        error: "No saved URLs found. Please save Step 2 (Page Discovery) first.",
      });
    }

    const pd = pdSnap.data() || {};
    const urls = Array.isArray(pd.urls) ? pd.urls : [];
    const cap = Number(pd.cap) || urls.length || 10;

    // PLAN CAP: enforce (even if doc is wrong)
    const capped = urls.slice(0, cap);

    // Only audit URLs that are already saved in Step 2
    if (!capped.includes(normalized)) {
      return res.status(400).json({
        error:
          "URL is not in the saved Step 2 list. Please save it in Page Discovery first.",
      });
    }

    const fetchRes = await fetchHtml(normalized);
    if (!fetchRes.ok || !fetchRes.html) {
      return res.status(200).json({
        url: normalized,
        status: "failed",
        error: `Failed to fetch HTML (status ${fetchRes.status || "0"})`,
      });
    }

    const html = fetchRes.html;

    const title = getTagInner(html, "title");
    const metaDescription = getMetaContent(html, "description");
    const robotsMeta = getMetaContent(html, "robots");
    const canonical = getCanonical(html);

    const h1s = getAllTagInner(html, "h1");
    const h2s = getAllTagInner(html, "h2");

    const wordCount = countWordsFromHtml(html);

    const imgStats = getImgStats(html);
    const linkStats = getLinkStats(html, normalized);

    const schemaPresent = hasJsonLd(html);

    const extracted = {
      title: title || "",
      metaDescription: metaDescription || "",
      h1: h1s[0] || "",
      h2List: h2s,
      wordCount,
      imageCount: imgStats.imageCount,
      imagesMissingAlt: imgStats.imagesMissingAlt,
      canonical: canonical || "",
      robotsMeta: robotsMeta || "",
      schemaPresent,
      internalLinkCount: linkStats.internalLinkCount,
      externalLinkCount: linkStats.externalLinkCount,
      h1Count: h1s.length,
    };

    const flags = {
      missingTitle: !extracted.title,
      titleTooShort: extracted.title ? extracted.title.length < 30 : false,
      titleTooLong: extracted.title ? extracted.title.length > 60 : false,
      missingMeta: !extracted.metaDescription,
      noH1: h1s.length === 0,
      multipleH1: h1s.length > 1,
      noH2: h2s.length === 0,
      thinContent: wordCount < 500,
      imagesMissingAlt: imgStats.imagesMissingAlt > 0,
      noSchema: !schemaPresent,
      noCanonical: !extracted.canonical,
      noInternalLinks: linkStats.internalLinkCount === 0,
    };

    const urlId = urlIdFromUrl(normalized);

    const auditRef = admin
      .firestore()
      .doc(
        `users/${effectiveUid}/websites/${effectiveWebsiteId}/modules/seo/strategy/auditResults/${urlId}`
      );

    await auditRef.set(
      {
        url: normalized,
        extracted,
        flags,
        status: "complete",
        lastAuditedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, url: normalized, urlId });
  } catch (e) {
    console.error("runAudit error:", e);
    return res.status(500).json({ error: e?.message || "Internal error" });
  }
}
