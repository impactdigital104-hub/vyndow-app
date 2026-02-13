"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import VyndowShell from "../../VyndowShell";
import { auth, db } from "../../firebaseClient";

// =========================
// Step 1 — Business Profile (save + resume)
// Firestore:
// users/{uid}/websites/{websiteId}/modules/seo/strategy/businessProfile
// =========================

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  outline: "none",
};

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
  color: "#111827",
};

const helpStyle = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 6,
  lineHeight: 1.4,
};
function safeToDate(ts) {
  try {
    return ts?.toDate ? ts.toDate() : null;
  } catch (e) {
    return null;
  }
}

function normalizeWebsiteBaseUrl(w) {
  const raw = (w?.websiteUrl || w?.domain || "").trim();
  if (!raw) return "";

  const withScheme =
    raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `https://${raw}`;

  try {
    const u = new URL(withScheme);
    return u.origin;
  } catch (e) {
    return "";
  }
}

function parseUrlList(raw) {
  const lines = String(raw || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const valid = [];
  const invalid = [];
  const seen = new Set();

  for (const line of lines) {
    try {
      const u = new URL(line);
      const isHttp = u.protocol === "http:" || u.protocol === "https:";
      if (!isHttp) {
        invalid.push(line);
        continue;
      }
      const normalized = u.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        valid.push(normalized);
      }
    } catch (e) {
      invalid.push(line);
    }
  }

  return { valid, invalid };
}


export default function SeoStrategyPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [uid, setUid] = useState(null);

  // Website context (reuse conventions from /seo)
  const [websites, setWebsites] = useState([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [websitesError, setWebsitesError] = useState("");
  const [selectedWebsiteId, setSelectedWebsiteId] = useState("");
  // SEO module plan — used only for Step 2 caps
const [seoModule, setSeoModule] = useState(null);
const [seoModuleLoading, setSeoModuleLoading] = useState(true);
const [seoModuleError, setSeoModuleError] = useState("");

// Step 2 data — Page Discovery
const [urlListRaw, setUrlListRaw] = useState("");
const [loadingPages, setLoadingPages] = useState(false);
const [pageDiscoveryExists, setPageDiscoveryExists] = useState(false);
const [savePagesState, setSavePagesState] = useState("idle"); // idle | saving | saved | error
const [savePagesError, setSavePagesError] = useState("");
  const [discoverState, setDiscoverState] = useState("idle"); // idle | discovering | done | error
const [discoverError, setDiscoverError] = useState("");
const [lastPagesSavedAt, setLastPagesSavedAt] = useState(null);
  // =========================
// Step 3 — Pure On-Page Audit (run + resume)
// Firestore:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/auditResults/{urlId}
// =========================
const [auditRunState, setAuditRunState] = useState("idle"); // idle | running | done | error
const [auditError, setAuditError] = useState("");
const [auditedUrlSet, setAuditedUrlSet] = useState(new Set()); // Set of URL strings
const [auditProgress, setAuditProgress] = useState({ done: 0, total: 0 });
const [auditCurrentUrl, setAuditCurrentUrl] = useState("");
  // Step 3.5 — Audit Results Viewer UI (resume-safe)
const [auditRows, setAuditRows] = useState([]); // [{ id, url, extracted, flags, status, lastAuditedAt }]
const [auditRowsLoading, setAuditRowsLoading] = useState(false);
const [auditRowsError, setAuditRowsError] = useState("");
const [expandedAuditRowId, setExpandedAuditRowId] = useState(null);
  // =========================
// Step 4B — Keyword Pool UI wiring (resume-safe)
// Firestore:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/keywordPool
// =========================
const [seedKeywordsRaw, setSeedKeywordsRaw] = useState("");
const [seedKeywordsError, setSeedKeywordsError] = useState("");
const [keywordPoolState, setKeywordPoolState] = useState("idle"); // idle | loading | generating | ready | error
const [keywordPoolError, setKeywordPoolError] = useState("");
const [keywordPoolExists, setKeywordPoolExists] = useState(false);
const [keywordPoolLocked, setKeywordPoolLocked] = useState(false);
const [keywordPoolRows, setKeywordPoolRows] = useState([]); // [{ keyword, volume, competition, cpc, competition_index }]
const [keywordPoolMeta, setKeywordPoolMeta] = useState(null); // { generatedAt, seedCount, location_code, language_code }



function auditResultsColRef() {
  if (!uid || !selectedWebsiteId) return null;

  const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);
  if (!effectiveUid || !effectiveWebsiteId) return null;

  return collection(
    db,
    "users",
    effectiveUid,
    "websites",
    effectiveWebsiteId,
    "modules",
    "seo",
    "strategy",
    "auditResults",
    "urls"
  );
}


async function loadExistingAuditResults() {
  const colRef = auditResultsColRef();
  if (!colRef) return;

  try {
    setAuditRowsLoading(true);
    setAuditRowsError("");

    const snap = await getDocs(colRef);

    // 1) auditedUrlSet (resume-safe)
    const s = new Set();

    // 2) auditRows (viewer table)
    const rows = snap.docs.map((d) => {
      const data = d.data() || {};
      const url = data.url ? String(data.url) : "";
      if (url) s.add(url);

      return {
        id: d.id,
        url,
        extracted: data.extracted || {},
        flags: data.flags || {},
        status: data.status || "",
        lastAuditedAt: data.lastAuditedAt || null,
      };
    });

    // Stable table ordering (no scoring / no severity sorting)
    rows.sort((a, b) => (a.url || "").localeCompare(b.url || ""));

    setAuditedUrlSet(s);
    setAuditRows(rows);
  } catch (e) {
    console.error("Failed to load audit results:", e);
    setAuditRowsError(e?.message || "Failed to load audit results.");
    // non-blocking
  } finally {
    setAuditRowsLoading(false);
  }
}



  // Step 1 data
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileExists, setProfileExists] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [geography, setGeography] = useState("");
  const [revenueGoal, setRevenueGoal] = useState("");
  const [averageOrderValue, setAverageOrderValue] = useState("");
  const [primaryOffer, setPrimaryOffer] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [competitorsRaw, setCompetitorsRaw] = useState("");
// -------------------------
// Step 4B helpers — Keyword Pool (Firestore resume + UI wiring)
// -------------------------
function keywordPoolDocRef() {
  if (!uid || !selectedWebsiteId) return null;

  const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(selectedWebsiteId);
  if (!effectiveUid || !effectiveWebsiteId) return null;

  return doc(
    db,
    "users",
    effectiveUid,
    "websites",
    effectiveWebsiteId,
    "modules",
    "seo",
    "strategy",
    "keywordPool"
  );
}

function parseSeedKeywords(raw) {
  const parts = String(raw || "")
    .split(/[\n,]+/g)
    .map((x) => x.trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];

  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return out;
}

function hydrateKeywordPoolFromDoc(d) {
  const top = Array.isArray(d?.topKeywords) ? d.topKeywords : [];
  const all = Array.isArray(d?.allKeywords) ? d.allKeywords : [];
  const rows = (top.length ? top : all).slice(0, 200);

  setKeywordPoolRows(rows);
  setKeywordPoolLocked(Boolean(d?.generationLocked));
  setKeywordPoolMeta({
    generatedAt: d?.generatedAt ? safeToDate(d.generatedAt) : null,
    seedCount: d?.seedCount ?? null,
    location_code: d?.location_code ?? null,
    language_code: d?.language_code ?? null,
  });
}

async function loadExistingKeywordPool() {
  const ref = keywordPoolDocRef();
  if (!ref) return;

  try {
    setKeywordPoolState("loading");
    setKeywordPoolError("");

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setKeywordPoolExists(false);
      setKeywordPoolLocked(false);
      setKeywordPoolRows([]);
      setKeywordPoolMeta(null);
      setKeywordPoolState("idle");
      return;
    }

    const d = snap.data() || {};
    setKeywordPoolExists(true);
    hydrateKeywordPoolFromDoc(d);
    setKeywordPoolState("ready");
  } catch (e) {
    console.error("Failed to load keyword pool:", e);
    setKeywordPoolState("error");
    setKeywordPoolError(e?.message || "Failed to load keyword pool.");
  }
}

async function handleGenerateKeywordPool() {
  // If already exists & locked, do nothing (UI should show lock notice)
  if (keywordPoolExists && keywordPoolLocked) return;

  const seeds = parseSeedKeywords(seedKeywordsRaw);

  if (seeds.length < 3) {
    setSeedKeywordsError("Please enter at least 3 unique seed keywords.");
    return;
  }
  if (seeds.length > 10) {
    setSeedKeywordsError("Please limit to 10 unique seed keywords.");
    return;
  }

  setSeedKeywordsError("");
  setKeywordPoolState("generating");
  setKeywordPoolError("");

  try {
    const token = await auth.currentUser.getIdToken();

    const res = await fetch("/api/seo/strategy/generateKeywordPool", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        websiteId: selectedWebsiteId,
        seeds,
        location_code: 2840,
        language_code: "en",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Keyword generation failed.");
    }

    // If API returned existing doc, hydrate immediately (no extra read needed)
    if (data?.source === "existing" && data?.data) {
      setKeywordPoolExists(true);
      hydrateKeywordPoolFromDoc(data.data);
      setKeywordPoolState("ready");
      return;
    }

    // Newly generated: read from Firestore (resume-safe)
    await loadExistingKeywordPool();
  } catch (e) {
    console.error("Keyword pool generation failed:", e);
    setKeywordPoolState("error");
    setKeywordPoolError(e?.message || "Keyword pool generation failed.");
  }
}

  // Feature flag (default should be false in Vercel until you enable it)
  const STRATEGY_ENABLED =
    process.env.NEXT_PUBLIC_SEO_STRATEGY_ENABLED === "true";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.uid);
      setAuthReady(true);
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [router]);

  // Load websites (same pattern as /seo)
  useEffect(() => {
    async function loadWebsites() {
      if (!uid) return;

      try {
        setWebsitesLoading(true);
        setWebsitesError("");

        const colRef = collection(db, "users", uid, "websites");
        const q = query(colRef, orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setWebsites(rows);

        // Restore previously selected website (if any)
        let restored = "";
        try {
          restored = localStorage.getItem("vyndow_selectedWebsiteId") || "";
        } catch (e) {
          // ignore
        }

        // Pick selected website: restored (if exists) else first
        const restoredExists = restored && rows.some((x) => x.id === restored);
        const pick = restoredExists ? restored : rows[0]?.id || "";
        setSelectedWebsiteId((prev) => prev || pick);
      } catch (e) {
        console.error("Failed to load websites:", e);
        setWebsites([]);
        setWebsitesError(
          e?.message || "Unknown Firestore error while loading websites."
        );
      } finally {
        setWebsitesLoading(false);
      }
    }

    loadWebsites();
  }, [uid]);

  // Persist selected website for other pages
  useEffect(() => {
    if (!selectedWebsiteId) return;
    try {
      localStorage.setItem("vyndow_selectedWebsiteId", selectedWebsiteId);
    } catch (e) {
      // ignore
    }
  }, [selectedWebsiteId]);

  function getEffectiveContext(websiteId) {
    const id = websiteId || selectedWebsiteId;
    const w = websites.find((x) => x.id === id);

    const effectiveUid = w && w.ownerUid ? w.ownerUid : uid;
    const effectiveWebsiteId = w && w.ownerWebsiteId ? w.ownerWebsiteId : id;

    return { effectiveUid, effectiveWebsiteId };
  }

  function businessProfileDocRef() {
    if (!uid || !selectedWebsiteId) return null;
    const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(
      selectedWebsiteId
    );
    if (!effectiveUid || !effectiveWebsiteId) return null;

    return doc(
      db,
      "users",
      effectiveUid,
      "websites",
      effectiveWebsiteId,
      "modules",
      "seo",
      "strategy",
      "businessProfile"
    );
  }
  function pageDiscoveryDocRef() {
  if (!uid || !selectedWebsiteId) return null;
  const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(
    selectedWebsiteId
  );
  if (!effectiveUid || !effectiveWebsiteId) return null;

  return doc(
    db,
    "users",
    effectiveUid,
    "websites",
    effectiveWebsiteId,
    "modules",
    "seo",
    "strategy",
    "pageDiscovery"
  );
}

function seoModuleDocRef() {
  if (!uid || !selectedWebsiteId) return null;
  const { effectiveUid, effectiveWebsiteId } = getEffectiveContext(
    selectedWebsiteId
  );
  if (!effectiveUid || !effectiveWebsiteId) return null;

  return doc(
    db,
    "users",
    effectiveUid,
    "websites",
    effectiveWebsiteId,
    "modules",
    "seo"
  );
}

// Load SEO module (plan) for caps (SB=10, Ent=25)
useEffect(() => {
  async function loadSeoModule() {
    const ref = seoModuleDocRef();
    if (!ref) return;

    try {
      setSeoModuleLoading(true);
      setSeoModuleError("");

      const snap = await getDoc(ref);
      if (snap.exists()) setSeoModule({ id: snap.id, ...snap.data() });
      else setSeoModule(null);
    } catch (e) {
      console.error("Failed to load SEO module:", e);
      setSeoModule(null);
      setSeoModuleError(e?.message || "Unknown error while loading SEO module.");
    } finally {
      setSeoModuleLoading(false);
    }
  }

  loadSeoModule();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, selectedWebsiteId, websites]);

function getUrlCap() {
  const planTypeRaw =
    seoModule?.plan ||
    seoModule?.planType ||
    seoModule?.tier ||
    seoModule?.pricingPlan ||
    "";

  const planType = String(planTypeRaw).toLowerCase();
  if (planType.includes("enterprise")) return 25;
  return 10; // small business OR unknown
}


const urlCap = getUrlCap();
const parsedUrls = useMemo(() => parseUrlList(urlListRaw), [urlListRaw]);
const cappedValidUrls = useMemo(
  () => parsedUrls.valid.slice(0, urlCap),
  [parsedUrls.valid, urlCap]
);

// Load existing Step 2 page discovery (resume)
useEffect(() => {
  async function loadPageDiscovery() {
    const ref = pageDiscoveryDocRef();
    if (!ref) return;

    try {
      setLoadingPages(true);
      setSavePagesState("idle");
      setSavePagesError("");

      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setPageDiscoveryExists(false);
        setLastPagesSavedAt(null);
        setUrlListRaw("");
        return;
      }

      const d = snap.data() || {};
      setPageDiscoveryExists(true);
      const urls = Array.isArray(d.urls) ? d.urls : [];
      setUrlListRaw(urls.join("\n"));
      setLastPagesSavedAt(safeToDate(d.updatedAt));
    } catch (e) {
      console.error("Failed to load page discovery:", e);
      setPageDiscoveryExists(false);
    } finally {
      setLoadingPages(false);
    }
  }

  loadPageDiscovery();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, selectedWebsiteId, websites]);
  // Load existing Step 3 audit results (resume)
useEffect(() => {
  if (!uid || !selectedWebsiteId || !websites?.length) return;
  loadExistingAuditResults();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, selectedWebsiteId, websites]);
  // Load existing Step 4B keyword pool (resume-safe)
useEffect(() => {
  if (!uid || !selectedWebsiteId || !websites?.length) return;
  loadExistingKeywordPool();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, selectedWebsiteId, websites]);



async function handleSavePages() {
  const ref = pageDiscoveryDocRef();
  if (!ref) return;

  setSavePagesState("saving");
  setSavePagesError("");

  let createdAt = null;
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) createdAt = existing.data()?.createdAt || null;
  } catch (e) {
    // ignore
  }

  try {
    await setDoc(
      ref,
      {
        urls: cappedValidUrls,
        invalidCount: parsedUrls.invalid.length,
        status: "draft",
        cap: urlCap,
        createdAt: createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setPageDiscoveryExists(true);
    setSavePagesState("saved");
    setLastPagesSavedAt(new Date());

    // Normalize textarea to capped + valid only
    setUrlListRaw(cappedValidUrls.join("\n"));

    setTimeout(() => setSavePagesState("idle"), 1500);
  } catch (e) {
    console.error("Failed to save page discovery:", e);
    setSavePagesState("error");
    setSavePagesError(e?.message || "Failed to save URLs.");
  }
}
async function handleDiscoverUrls() {
  const w = websites.find((x) => x.id === selectedWebsiteId);
  const origin = normalizeWebsiteBaseUrl(w);
  if (!origin) return;

  setDiscoverState("discovering");
  setDiscoverError("");

  try {
    const token = await auth.currentUser.getIdToken();

    const res = await fetch("/api/seo/strategy/discoverUrls", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        origin,
        planCap: urlCap,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Discovery failed");
    }

    const urls = Array.isArray(data?.urls) ? data.urls : [];
    setUrlListRaw(urls.join("\n"));

    setDiscoverState("done");
    setTimeout(() => setDiscoverState("idle"), 1500);
  } catch (e) {
    console.error("URL discovery failed:", e);
    setDiscoverState("error");
    setDiscoverError(e?.message || "URL discovery failed");
  }
}
async function handleRunAudit() {
  const ref = pageDiscoveryDocRef();
  if (!ref) return;

  setAuditRunState("running");
  setAuditError("");
  setAuditCurrentUrl("");

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      setAuditRunState("error");
      setAuditError("No saved URL list found. Please Save URLs in Step 2 first.");
      return;
    }

    const d = snap.data() || {};
    const savedUrls = Array.isArray(d.urls) ? d.urls : [];
    const cap = Number(d.cap) || savedUrls.length || 10;
    const urls = savedUrls.slice(0, cap);

    if (!urls.length) {
      setAuditRunState("error");
      setAuditError("Saved URL list is empty. Please Save URLs in Step 2 first.");
      return;
    }

    // Refresh audited set
    await loadExistingAuditResults();

    const already = auditedUrlSet || new Set();
    const toRun = urls.filter((u) => !already.has(u));

    setAuditProgress({ done: urls.length - toRun.length, total: urls.length });

    if (!toRun.length) {
      setAuditRunState("done");
      setAuditCurrentUrl("");
      return;
    }

    const token = await auth.currentUser.getIdToken();
    let doneCount = urls.length - toRun.length;

    for (const u of toRun) {
      setAuditCurrentUrl(u);

      const res = await fetch("/api/seo/strategy/runAudit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          websiteId: selectedWebsiteId,
          url: u,
        }),
      });

      const data = await res.json();

      if (!res.ok || data?.error) {
        throw new Error(data?.error || "Audit failed for one URL.");
      }

      doneCount += 1;
      setAuditProgress({ done: doneCount, total: urls.length });
    }

    await loadExistingAuditResults();

    setAuditRunState("done");
    setAuditCurrentUrl("");
  } catch (e) {
    console.error("Audit run failed:", e);
    setAuditRunState("error");
    setAuditError(e?.message || "Audit run failed.");
  }
}

  // Load existing Step 1 profile (resume)
  useEffect(() => {
    async function loadProfile() {
      const ref = businessProfileDocRef();
      if (!ref) return;

      try {
        setLoadingProfile(true);
        setSaveState("idle");
        setSaveError("");

        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setProfileExists(false);
          setLastSavedAt(null);
          return;
        }

        const d = snap.data() || {};
        setProfileExists(true);
        setBusinessName(d.businessName || "");
        setIndustry(d.industry || "");
        setGeography(d.geography || "");
        setRevenueGoal(d.revenueGoal || "");
        setAverageOrderValue(
          d.averageOrderValue != null ? String(d.averageOrderValue) : ""
        );
        setPrimaryOffer(d.primaryOffer || "");
        setTargetCustomer(d.targetCustomer || "");
        setCompetitorsRaw(
          Array.isArray(d.competitors) ? d.competitors.join("\n") : ""
        );

        const ua = d.updatedAt?.toDate ? d.updatedAt.toDate() : null;
        setLastSavedAt(ua);
      } catch (e) {
        console.error("Failed to load business profile:", e);
        // Non-blocking: user can still fill and save
        setProfileExists(false);
      } finally {
        setLoadingProfile(false);
      }
    }

    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, selectedWebsiteId, websites]);

  async function handleSaveDraft() {
    const ref = businessProfileDocRef();
    if (!ref) return;

    setSaveState("saving");
    setSaveError("");

    const competitors = (competitorsRaw || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    const competitorsCapped = competitors.slice(0, 20);

    const aovRaw = String(averageOrderValue || "").trim();
    const aovNum = aovRaw === "" ? null : Number(aovRaw);
    const aovFinal = aovNum == null || Number.isNaN(aovNum) ? null : aovNum;

    // Preserve createdAt if doc already exists
    let createdAt = null;
    try {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        const d = existing.data() || {};
        createdAt = d.createdAt || null;
      }
    } catch (e) {
      // ignore (we'll still write)
    }

    try {
      await setDoc(
        ref,
        {
          businessName: String(businessName || "").trim(),
          industry: String(industry || "").trim(),
          geography: String(geography || "").trim(),
          revenueGoal: String(revenueGoal || "").trim(),
          averageOrderValue: aovFinal,
          primaryOffer: String(primaryOffer || "").trim(),
          targetCustomer: String(targetCustomer || "").trim(),
          competitors: competitorsCapped,
          status: "draft",
          createdAt: createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfileExists(true);
      setSaveState("saved");
      setLastSavedAt(new Date());
      // Clear the "Saved" state after a short delay
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (e) {
      console.error("Failed to save draft:", e);
      setSaveState("error");
      setSaveError(e?.message || "Failed to save draft.");
    }
  }

  // If not enabled, keep this hidden from all real users (even if they guess the URL)
  if (!STRATEGY_ENABLED) {
    return (
      <VyndowShell>
        <div style={{ padding: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>
            SEO Strategy (Private Beta)
          </h1>
          <p style={{ marginTop: 8, color: "#555" }}>
            This feature is currently disabled.
          </p>
          <button
            onClick={() => router.replace("/seo")}
            style={{
              marginTop: 16,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Back to Vyndow SEO
          </button>
        </div>
      </VyndowShell>
    );
  }

  // Auth gate: show nothing until auth is ready (prevents flashes)
  if (!authReady) {
    return (
      <VyndowShell>
        <div style={{ padding: 24 }}>Loading…</div>
      </VyndowShell>
    );
  }

  return (
    <VyndowShell>
      <div style={{ padding: 24, maxWidth: 900 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>
            Build SEO Strategy
          </h1>
          <div
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              color: "#374151",
              background: "#fafafa",
            }}
          >
            Private Beta
          </div>
        </div>

        <p style={{ marginTop: 8, color: "#6b7280" }}>
          Step 1 of 9 — Business &amp; Revenue Alignment (no keywords)
        </p>

        {/* Website selector */}
        <div
          style={{
            marginTop: 14,
            padding: 14,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8, color: "#111827" }}>
            Website Context
          </div>

          {websitesLoading ? (
            <div style={{ color: "#374151" }}>Loading websites…</div>
          ) : websitesError ? (
            <div style={{ color: "#b91c1c" }}>{websitesError}</div>
          ) : !websites.length ? (
            <div style={{ color: "#374151", lineHeight: 1.5 }}>
              No websites found. Please create a website first.
              <div>
                <button
                  onClick={() => router.push("/websites")}
                  style={{
                    marginTop: 10,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    cursor: "pointer",
                    background: "white",
                  }}
                >
                  Go to Websites
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Selected website</label>
                <select
                  value={selectedWebsiteId}
                  onChange={(e) => setSelectedWebsiteId(e.target.value)}
                  style={{
                    ...inputStyle,
                    height: 42,
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  {websites.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.websiteUrl || w.domain || w.id}
                    </option>
                  ))}
                </select>
                <div style={helpStyle}>
                  Strategy data is saved per website under its SEO module.
                </div>
              </div>

              <button
                onClick={() => router.push("/seo")}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  cursor: "pointer",
                  background: "white",
                  height: 42,
                  marginTop: 22,
                }}
              >
                Back to Vyndow SEO
              </button>
            </div>
          )}
        </div>

        {/* Resume banner */}
        {selectedWebsiteId && profileExists ? (
          <div
            style={{
              marginTop: 14,
              padding: 14,
              border: "1px solid #dbeafe",
              borderRadius: 12,
              background: "#eff6ff",
              color: "#1e3a8a",
            }}
          >
            <div style={{ fontWeight: 800 }}>Resume Strategy Setup</div>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              A saved draft was found for this website.
              {lastSavedAt ? (
                <span> Last saved: {lastSavedAt.toLocaleString()}.</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Step 1 form */}
        <div
          style={{
            marginTop: 14,
            padding: 16,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>
            Step 1 — Business Profile
          </div>
          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            We will use this to build a revenue-aligned SEO strategy. Do not add
            keywords here.
          </div>

          {loadingProfile ? (
            <div style={{ marginTop: 12, color: "#374151" }}>
              Loading saved draft…
            </div>
          ) : null}

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <div>
              <label style={labelStyle}>Business name</label>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g., Acme Dental Care"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Industry</label>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g., Healthcare"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Target geography</label>
              <input
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                placeholder="e.g., USA (California)"
                style={inputStyle}
              />
              <div style={helpStyle}>
                Where do you want to rank and convert customers?
              </div>
            </div>

            <div>
              <label style={labelStyle}>Primary revenue goal</label>
              <select
                value={revenueGoal}
                onChange={(e) => setRevenueGoal(e.target.value)}
                style={{ ...inputStyle, height: 42, background: "white" }}
              >
                <option value="">Select one</option>
                <option value="generate_leads">Generate leads</option>
                <option value="increase_sales">Increase sales</option>
                <option value="book_appointments">Book appointments</option>
                <option value="increase_trials">Increase trials / demos</option>
                <option value="increase_store_visits">Increase store visits</option>
                <option value="brand_authority">Build brand authority</option>
              </select>
            </div>

            <div>
              <label style={labelStyle}>Average order value (optional)</label>
              <input
                value={averageOrderValue}
                onChange={(e) => setAverageOrderValue(e.target.value)}
                placeholder="e.g., 250"
                inputMode="decimal"
                style={inputStyle}
              />
              <div style={helpStyle}>
                If you are lead-gen, you can enter your average deal value.
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Primary offer / services</label>
            <textarea
              value={primaryOffer}
              onChange={(e) => setPrimaryOffer(e.target.value)}
              placeholder="What do you sell? What is your #1 offer?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Target customer</label>
            <textarea
              value={targetCustomer}
              onChange={(e) => setTargetCustomer(e.target.value)}
              placeholder="Who do you want to attract? (persona, segment, pain points)"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>
              Competitor URLs (optional, one per line)
            </label>
            <textarea
              value={competitorsRaw}
              onChange={(e) => setCompetitorsRaw(e.target.value)}
              placeholder="https://competitor1.com\nhttps://competitor2.com"
              rows={4}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={helpStyle}>
              Max 20 URLs. We will use these later for positioning and content
              direction.
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={handleSaveDraft}
                disabled={!selectedWebsiteId || saveState === "saving"}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  cursor:
                    !selectedWebsiteId || saveState === "saving"
                      ? "not-allowed"
                      : "pointer",
                  background: "#111827",
                  color: "white",
                  opacity:
                    !selectedWebsiteId || saveState === "saving" ? 0.6 : 1,
                }}
              >
                {saveState === "saving" ? "Saving…" : "Save Draft"}
              </button>

              {saveState === "saved" ? (
                <div style={{ color: "#065f46", fontWeight: 800 }}>Saved</div>
              ) : null}

              {saveState === "error" ? (
                <div style={{ color: "#b91c1c", fontWeight: 700 }}>
                  Save failed
                </div>
              ) : null}
            </div>

            <button
              disabled
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f3f4f6",
                color: "#6b7280",
                cursor: "not-allowed",
              }}
              title="Step 2 will be enabled after we finish Phase C"
            >
              Continue to Step 2 (next phase)
            </button>
          </div>

          {saveError ? (
            <div style={{ marginTop: 12, color: "#b91c1c" }}>{saveError}</div>
          ) : null}
        </div>
{/* STEP 2 */}
<div
  style={{
    marginTop: 14,
    padding: 16,
    border: "1px solid #eee",
    borderRadius: 12,
    background: "white",
  }}
>
  <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>
    Step 2 — Page Discovery
  </div>
  <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
    Add the key URLs you want to include in this SEO strategy. This step only
    saves URLs — no audit, no AI calls, no fixes.
  </div>

  <div
    style={{
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      border: "1px solid #f3f4f6",
      background: "#fafafa",
      color: "#374151",
      fontSize: 13,
      lineHeight: 1.5,
    }}
  >
    <div style={{ fontWeight: 800, color: "#111827" }}>Plan cap</div>
    {seoModuleLoading ? (
      <div>Loading SEO plan…</div>
    ) : seoModuleError ? (
      <div style={{ color: "#b91c1c" }}>SEO plan load error: {seoModuleError}</div>
    ) : (
      <div>
        You can save up to <b>{urlCap}</b> URLs for this website (Small Business:
        10, Enterprise: 25).
      </div>
    )}
  </div>

  {selectedWebsiteId && pageDiscoveryExists ? (
    <div
      style={{
        marginTop: 12,
        padding: 14,
        border: "1px solid #dcfce7",
        borderRadius: 12,
        background: "#f0fdf4",
        color: "#065f46",
      }}
    >
      <div style={{ fontWeight: 900 }}>Saved URL list found</div>
      <div style={{ marginTop: 6, fontSize: 13 }}>
        A saved page list was found for this website.
        {lastPagesSavedAt ? (
          <span> Last saved: {lastPagesSavedAt.toLocaleString()}.</span>
        ) : null}
      </div>
    </div>
  ) : null}

  {loadingPages ? (
    <div style={{ marginTop: 12, color: "#374151" }}>Loading saved URLs…</div>
  ) : null}

  <div style={{ marginTop: 12 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <label style={labelStyle}>URLs (one per line)</label>

<button
  type="button"
  onClick={handleDiscoverUrls}
  disabled={!selectedWebsiteId || discoverState === "discovering"}
  style={{
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    cursor:
      !selectedWebsiteId || discoverState === "discovering"
        ? "not-allowed"
        : "pointer",
    background: "white",
    opacity:
      !selectedWebsiteId || discoverState === "discovering" ? 0.6 : 1,
  }}
  title="Discover URLs using sitemap.xml first, else a lightweight crawl (no AI)"
>
  {discoverState === "discovering" ? "Discovering…" : "Discover URLs"}
</button>

    </div>

    <textarea
      value={urlListRaw}
      onChange={(e) => setUrlListRaw(e.target.value)}
      placeholder={`https://example.com/\nhttps://example.com/about\nhttps://example.com/services`}
      rows={8}
      style={{ ...inputStyle, resize: "vertical" }}
    />

    <div style={{ marginTop: 10, fontSize: 13, color: "#374151" }}>
      Valid URLs: <b>{parsedUrls.valid.length}</b> · Invalid:{" "}
      <b>{parsedUrls.invalid.length}</b>
      <span style={{ marginLeft: 10 }}>
        · Will save: <b>{cappedValidUrls.length}</b> / <b>{urlCap}</b>
      </span>
    </div>
{discoverError ? (
  <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
    Discovery error: {discoverError}
  </div>
) : null}


    {parsedUrls.valid.length > urlCap ? (
      <div
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 12,
          border: "1px solid #fde68a",
          background: "#fffbeb",
          color: "#92400e",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        You pasted more than the plan cap. We will save only the first{" "}
        <b>{urlCap}</b> valid URLs.
      </div>
    ) : null}

    <div
      style={{
        marginTop: 14,
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={handleSavePages}
          disabled={!selectedWebsiteId || savePagesState === "saving"}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #111827",
            cursor:
              !selectedWebsiteId || savePagesState === "saving"
                ? "not-allowed"
                : "pointer",
            background: "#111827",
            color: "white",
            opacity:
              !selectedWebsiteId || savePagesState === "saving" ? 0.6 : 1,
          }}
        >
          {savePagesState === "saving" ? "Saving…" : "Save URLs"}
        </button>

        {savePagesState === "saved" ? (
          <div style={{ color: "#065f46", fontWeight: 800 }}>Saved</div>
        ) : null}

        {savePagesState === "error" ? (
          <div style={{ color: "#b91c1c", fontWeight: 700 }}>Save failed</div>
        ) : null}
      </div>

      <button
        disabled
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#f3f4f6",
          color: "#6b7280",
          cursor: "not-allowed",
        }}
        title="Step 3 will be enabled after we finish Phase D"
      >
        Continue to Step 3 (next phase)
      </button>
    </div>

    {savePagesError ? (
      <div style={{ marginTop: 12, color: "#b91c1c" }}>{savePagesError}</div>
    ) : null}
  </div>
</div>
{/* STEP 3 */}
<div
  style={{
    marginTop: 14,
    padding: 16,
    border: "1px solid #eee",
    borderRadius: 12,
    background: "white",
  }}
>
  <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>
    Step 3 — Pure On-Page Audit (Diagnostics)
  </div>

  <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
    This runs a diagnostics audit only (no AI, no fixes). It audits only the URLs saved in Step 2.
    It is resume-safe and skips URLs already audited.
  </div>

  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
    <button
      type="button"
      onClick={handleRunAudit}
      disabled={!selectedWebsiteId || auditRunState === "running"}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #111827",
        cursor:
          !selectedWebsiteId || auditRunState === "running" ? "not-allowed" : "pointer",
        background: "#111827",
        color: "white",
        opacity: !selectedWebsiteId || auditRunState === "running" ? 0.6 : 1,
      }}
    >
      {auditRunState === "running" ? "Running Audit…" : "Run Audit"}
    </button>

    {auditRunState === "done" ? (
      <div style={{ color: "#065f46", fontWeight: 800 }}>Audit complete</div>
    ) : null}

    {auditRunState === "error" ? (
      <div style={{ color: "#b91c1c", fontWeight: 700 }}>Audit failed</div>
    ) : null}
  </div>

  <div
    style={{
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      border: "1px solid #f3f4f6",
      background: "#fafafa",
      color: "#374151",
      fontSize: 13,
      lineHeight: 1.5,
    }}
  >
    <div style={{ fontWeight: 800, color: "#111827" }}>Progress</div>

    {auditRunState === "running" ? (
      <>
        <div style={{ marginTop: 6 }}>
          Done: <b>{auditProgress.done}</b> / <b>{auditProgress.total}</b>
        </div>
        {auditCurrentUrl ? (
          <div style={{ marginTop: 6 }}>
            Current: <span style={{ wordBreak: "break-all" }}>{auditCurrentUrl}</span>
          </div>
        ) : null}
      </>
    ) : (
      <div style={{ marginTop: 6 }}>
        Already audited (resume): <b>{auditedUrlSet?.size || 0}</b> URLs
      </div>
    )}

    {auditError ? (
      <div style={{ marginTop: 10, color: "#b91c1c" }}>{auditError}</div>
    ) : null}
  </div>
</div>
{/* STEP 3.5 — Audit Results Viewer */}
<div
  style={{
    marginTop: 14,
    padding: 16,
    border: "1px solid #eee",
    borderRadius: 12,
    background: "white",
  }}
>
  <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>
    Step 3.5 — Audit Results Viewer
  </div>

  <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
    Resume-safe: results render automatically if audits already exist. Click a row to expand details.
  </div>

  {/* Dot helper */}
  {(() => {
    const Dot = ({ ok }) => (
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: ok ? "#16a34a" : "#dc2626",
          display: "inline-block",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      />
    );
    const Cell = ({ children }) => (
      <td
        style={{
          padding: "10px 10px",
          borderTop: "1px solid #f3f4f6",
          fontSize: 13,
          color: "#111827",
          verticalAlign: "top",
        }}
      >
        {children}
      </td>
    );

    const Header = ({ children }) => (
      <th
        style={{
          textAlign: "left",
          padding: "10px 10px",
          fontSize: 12,
          color: "#374151",
          fontWeight: 900,
          borderBottom: "1px solid #e5e7eb",
          background: "#fafafa",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        {children}
      </th>
    );

    const hasRows = Array.isArray(auditRows) && auditRows.length > 0;

    return (
      <div style={{ marginTop: 12 }}>
        {auditRowsLoading ? (
          <div style={{ color: "#374151" }}>Loading audit results…</div>
        ) : auditRowsError ? (
          <div style={{ color: "#b91c1c" }}>{auditRowsError}</div>
        ) : !hasRows ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #f3f4f6",
              background: "#fafafa",
              color: "#374151",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            No audit results found yet. Run Step 3 to generate results.
          </div>
        ) : (
          <div
            style={{
              marginTop: 10,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Header>URL</Header>
                    <Header>Thin Content</Header>
                    <Header>Missing Meta</Header>
                    <Header>No H1</Header>
                    <Header>Multiple H1</Header>
                    <Header>No H2</Header>
                    <Header>No Schema</Header>
                    <Header>No Internal Links</Header>
                    <Header>Word Count</Header>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => {
                    const flags = row.flags || {};
                    const extracted = row.extracted || {};
                    const isOpen = expandedAuditRowId === row.id;

                    const onRowClick = () => {
                      setExpandedAuditRowId((prev) =>
                        prev === row.id ? null : row.id
                      );
                    };

                    return (
                      <>
                        <tr
                          key={row.id}
                          onClick={onRowClick}
                          style={{
                            cursor: "pointer",
                            background: isOpen ? "#f9fafb" : "white",
                          }}
                          title="Click to expand"
                        >
                          <Cell>
                            <div style={{ fontWeight: 800, fontSize: 13 }}>
                              {row.url}
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                              {row.status ? `Status: ${row.status}` : ""}
                              {row.lastAuditedAt?.toDate ? (
                                <span>
                                  {row.status ? " · " : ""}
                                  {`Audited: ${row.lastAuditedAt.toDate().toLocaleString()}`}
                                </span>
                              ) : null}
                            </div>
                          </Cell>

                          <Cell>
                            <Dot ok={!Boolean(flags.thinContent)} />
                          </Cell>
                          <Cell>
                            <Dot ok={!Boolean(flags.missingMeta)} />
                          </Cell>
                          <Cell>
                            <Dot ok={!Boolean(flags.noH1)} />
                          </Cell>
                          <Cell>
                            <Dot ok={!Boolean(flags.multipleH1)} />
                          </Cell>
                          <Cell>
                            <Dot ok={!Boolean(flags.noH2)} />
                          </Cell>
                          <Cell>
                            <Dot ok={!Boolean(flags.noSchema)} />
                          </Cell>
                          <Cell>
                            <Dot ok={!Boolean(flags.noInternalLinks)} />
                          </Cell>
                          <Cell>
                            <div style={{ fontWeight: 800 }}>
                              {Number(extracted.wordCount || 0)}
                            </div>
                          </Cell>
                        </tr>

                        {isOpen ? (
                          <tr>
                            <td
                              colSpan={9}
                              style={{
                                padding: 12,
                                borderTop: "1px solid #f3f4f6",
                                background: "#ffffff",
                              }}
                            >
                              <div
                                style={{
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 12,
                                  padding: 12,
                                  background: "#fafafa",
                                }}
                              >
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: 12,
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      Title
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {extracted.title || "—"}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      Meta Description
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {extracted.metaDescription || "—"}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      H1
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {extracted.h1 || "—"}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      Word Count
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {Number(extracted.wordCount || 0)}
                                    </div>
                                  </div>

                                  <div style={{ gridColumn: "1 / -1" }}>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      H2 List
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {Array.isArray(extracted.h2List) && extracted.h2List.length ? (
                                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                                          {extracted.h2List.map((h2, idx) => (
                                            <li key={idx} style={{ marginBottom: 4 }}>
                                              {h2}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : (
                                        "—"
                                      )}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      Image Count
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {Number(extracted.imageCount || 0)}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      Images Missing Alt
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {Number(extracted.imagesMissingAlt || 0)}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      Canonical
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13, wordBreak: "break-all" }}>
                                      {extracted.canonical || "—"}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      Robots Meta
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {extracted.robotsMeta || "—"}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      Internal Link Count
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {Number(extracted.internalLinkCount || 0)}
                                    </div>
                                  </div>

                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                                      External Link Count
                                    </div>
                                    <div style={{ marginTop: 6, color: "#111827", fontSize: 13 }}>
                                      {Number(extracted.externalLinkCount || 0)}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  })()}
</div>

        {/* STEP 4B — Keyword Pool (Seed Keywords → Generate → Top 200) */}
        <div
          style={{
            marginTop: 14,
            padding: 16,
            border: "1px solid #eee",
            borderRadius: 12,
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>
            Step 4B — Keyword Pool (Top 200)
          </div>

          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            Enter 3–10 seed keywords (comma or newline separated). Generate is locked per website once created.
          </div>

          {keywordPoolExists && keywordPoolLocked ? (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              <b>Keywords already generated for this website (locked).</b> To regenerate, admin must delete the{" "}
              <code>keywordPool</code> Firestore doc.
            </div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Seed Keywords</label>
            <textarea
              value={seedKeywordsRaw}
              onChange={(e) => setSeedKeywordsRaw(e.target.value)}
              rows={4}
              placeholder={`Example:\nplumbing services\nwater heater repair\nplumber near me`}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              disabled={keywordPoolExists && keywordPoolLocked}
            />
            <div style={helpStyle}>
              Tip: We’ll trim + de-duplicate. Minimum 3, maximum 10 unique seeds.
            </div>
            {seedKeywordsError ? (
              <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 13 }}>
                {seedKeywordsError}
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={handleGenerateKeywordPool}
              disabled={
                keywordPoolState === "generating" ||
                keywordPoolState === "loading" ||
                (keywordPoolExists && keywordPoolLocked)
              }
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                cursor: "pointer",
                background: keywordPoolState === "generating" ? "#f9fafb" : "white",
                fontWeight: 800,
              }}
            >
              {keywordPoolState === "generating" ? "Generating…" : "Generate Keyword Pool"}
            </button>

            {keywordPoolMeta?.generatedAt ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Generated:{" "}
                <b>{new Date(keywordPoolMeta.generatedAt).toLocaleString()}</b>
              </div>
            ) : null}
          </div>

          {keywordPoolError ? (
            <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
              {keywordPoolError}
            </div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            {keywordPoolState === "loading" ? (
              <div style={{ color: "#374151" }}>Loading keyword pool…</div>
            ) : keywordPoolRows?.length ? (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ maxHeight: 420, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["Keyword", "Volume", "Ads Competition", "CPC", "Competition Index"].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: "10px 10px",
                              fontSize: 12,
                              color: "#374151",
                              fontWeight: 900,
                              borderBottom: "1px solid #e5e7eb",
                              background: "#fafafa",
                              position: "sticky",
                              top: 0,
                              zIndex: 1,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {keywordPoolRows.slice(0, 200).map((row, idx) => (
                        <tr key={`${row.keyword || "k"}-${idx}`}>
                          <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#111827" }}>
                            {row.keyword || "—"}
                          </td>
                          <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#111827" }}>
                            {row.volume != null ? Number(row.volume) : "—"}
                          </td>
                          <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#111827" }}>
                            {row.competition || "—"}
                          </td>
                          <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#111827" }}>
                            {row.cpc != null && row.cpc !== "" ? Number(row.cpc).toFixed(2) : "—"}
                          </td>
                          <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#111827" }}>
                            {row.competition_index != null ? Number(row.competition_index) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                No keyword pool found yet for this website.
              </div>
            )}
          </div>
        </div>

        {/* WIP link (not used in this phase) */}
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => router.push("/seo/control")}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
              background: "white",
            }}
          >
            Go to Strategy Control Center (WIP)
          </button>
        </div>
      </div>
    </VyndowShell>
  );
}
