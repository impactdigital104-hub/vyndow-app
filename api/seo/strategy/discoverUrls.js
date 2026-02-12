// api/seo/strategy/discoverUrls.js
import admin from "../../firebaseAdmin";

async function getUidFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("Missing Authorization Bearer token.");
  const idToken = match[1];
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded.uid;
}

function extractLocsFromXml(xml) {
  const locs = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const v = String(m[1] || "").trim();
    if (v) locs.push(v);
  }
  return locs;
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    if (!(url.protocol === "http:" || url.protocol === "https:")) return null;

    // remove hash + query
    url.hash = "";
    url.search = "";

    // normalize trailing slash (keep root "/")
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch (e) {
    return null;
  }
}

function isContentUrl(urlStr, origin) {
  try {
    const u = new URL(urlStr);
    if (u.origin !== origin) return false;

    const p = (u.pathname || "").toLowerCase();

    // exclude obvious non-content / utility
    const blocked = [
      "/privacy",
      "/privacy-policy",
      "/terms",
      "/terms-of-service",
      "/login",
      "/signin",
      "/signup",
      "/register",
      "/account",
      "/cart",
      "/checkout",
      "/wp-json",
      "/feed",
      "/tag/",
      "/tags/",
      "/category/",
      "/author/",
      "/search",
      "/sitemap",
    ];

    if (blocked.some((b) => p === b || p.startsWith(b))) return false;

    // exclude files
    const fileExt = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".pdf",
      ".zip",
      ".mp4",
      ".mp3",
      ".xml",
      ".json",
    ];
    if (fileExt.some((ext) => p.endsWith(ext))) return false;

    return true;
  } catch (e) {
    return false;
  }
}

async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "VyndowSEO/1.0 (+https://app.vyndow.com)",
        accept: "text/html,application/xml,text/xml,*/*",
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: "" };
  } finally {
    clearTimeout(t);
  }
}

async function discoverFromSitemap(origin, maxUrls) {
  const sitemapUrl = `${origin}/sitemap.xml`;
  const first = await fetchText(sitemapUrl);
  if (!first.ok || !first.text) return { ok: false, urls: [] };

  const xml = first.text;
  const isIndex = /<sitemapindex/i.test(xml);

  const out = [];
  const seen = new Set();

  function pushUrl(u) {
    const n = normalizeUrl(u);
    if (!n) return;
    if (!isContentUrl(n, origin)) return;
    if (seen.has(n)) return;
    seen.add(n);
    out.push(n);
  }

  if (!isIndex) {
    const locs = extractLocsFromXml(xml);
    for (const loc of locs) {
      pushUrl(loc);
      if (out.length >= maxUrls) break;
    }
    return { ok: out.length > 0, urls: out };
  }

  // sitemap index: fetch child sitemaps until we have enough
  const sitemapLocs = extractLocsFromXml(xml).slice(0, 20);
  for (const sm of sitemapLocs) {
    const child = await fetchText(sm);
    if (!child.ok || !child.text) continue;
    const locs = extractLocsFromXml(child.text);
    for (const loc of locs) {
      pushUrl(loc);
      if (out.length >= maxUrls) break;
    }
    if (out.length >= maxUrls) break;
  }

  return { ok: out.length > 0, urls: out };
}

function extractLinksFromHtml(html, origin) {
  const links = [];
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = String(m[1] || "").trim();
    if (!raw) continue;

    // ignore mailto/tel/js
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) continue;

    try {
      const u = new URL(raw, origin);
      const n = normalizeUrl(u.toString());
      if (!n) continue;
      links.push(n);
    } catch (e) {
      // ignore
    }
  }
  return links;
}

async function discoverByCrawl(origin, maxUrls) {
  const out = [];
  const seen = new Set();

  function push(u) {
    if (!u) return;
    if (!isContentUrl(u, origin)) return;
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
  }

  // BFS depth 2 (home -> depth1 -> depth2), strict fetch limit
  const queue = [{ url: origin, depth: 0 }];
  const fetched = new Set();
  const maxFetch = 18; // hard safety

  while (queue.length && out.length < maxUrls && fetched.size < maxFetch) {
    const cur = queue.shift();
    if (!cur) break;

    const n = normalizeUrl(cur.url);
    if (!n) continue;
    if (fetched.has(n)) continue;
    fetched.add(n);

    const res = await fetchText(n);
    if (!res.ok || !res.text) continue;

    push(n);

    const links = extractLinksFromHtml(res.text, origin);
    for (const link of links) {
      const ln = normalizeUrl(link);
      if (!ln) continue;
      if (!isContentUrl(ln, origin)) continue;
      push(ln);

      if (cur.depth < 1 && !fetched.has(ln)) {
        queue.push({ url: ln, depth: cur.depth + 1 });
      } else if (cur.depth === 1 && !fetched.has(ln)) {
        // depth 2 allowed but do not enqueue further
        // (we still push it as discovered)
      }

      if (out.length >= maxUrls) break;
    }
  }

  return { ok: out.length > 0, urls: out };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Require auth (matches your existing API pattern)
    await getUidFromRequest(req);

    const { origin, planCap } = req.body || {};
    if (!origin) return res.status(400).json({ error: "Missing origin" });

    let base;
    try {
      base = new URL(origin);
    } catch (e) {
      return res.status(400).json({ error: "Invalid origin" });
    }

    const cap = Number(planCap) || 10;
    const maxUrls = Math.min(cap * 3, 100);

    // Ensure origin (no path)
    const siteOrigin = base.origin;

    // sitemap-first
    const sm = await discoverFromSitemap(siteOrigin, maxUrls);
    let urls = sm.urls || [];
    let source = "sitemap";

    if (!sm.ok || urls.length === 0) {
      const crawl = await discoverByCrawl(siteOrigin, maxUrls);
      urls = crawl.urls || [];
      source = "crawl";
    }

    // Always include homepage if possible
    const home = normalizeUrl(siteOrigin);
    if (home && !urls.includes(home)) urls.unshift(home);

    // Final: top N by plan cap
    const finalUrls = urls.slice(0, cap);

    return res.status(200).json({ source, urls: finalUrls });
  } catch (e) {
    console.error("discoverUrls error:", e);
    return res.status(500).json({ error: e?.message || "Internal error" });
  }
}
