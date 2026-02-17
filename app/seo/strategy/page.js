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

// =========================
// House palette + Step accordion UI helpers (Option B)
// =========================
const HOUSE = {
  primaryBlue: "#1E66FF",     // Deep SaaS Blue (primary)
  primaryPurple: "#6D28D9",   // Brand purple
  accentTeal: "#06B6D4",      // Brand teal (used lightly)
  success: "#16A34A",         // Muted green
  warning: "#F59E0B",         // Amber
  bgSoft: "#FFF7ED",          // Very soft neutral (warm)
  cardBorder: "#E6E6EB",
  text: "#0F172A",
  subtext: "#475569",
};

const STEP_CARD_STYLE = {
  marginTop: 14,
  background: "white",
  borderRadius: 16,
  border: `1px solid ${HOUSE.cardBorder}`,
  boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
  overflow: "hidden",
};

const STEP_HEADER_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 18px",
  cursor: "pointer",
  userSelect: "none",
  background: `linear-gradient(90deg, rgba(109,40,217,0.10), rgba(30,102,255,0.08))`,
  borderBottom: `1px solid ${HOUSE.cardBorder}`,
};

const STEP_TITLE_STYLE = {
  fontWeight: 900,
  fontSize: 20,
  color: HOUSE.primaryPurple,
  letterSpacing: "-0.2px",
};

const STEP_SUBTITLE_STYLE = {
  marginTop: 4,
  fontSize: 13,
  color: HOUSE.subtext,
  lineHeight: 1.35,
};

const PILL_BASE = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
  border: "1px solid transparent",
  whiteSpace: "nowrap",
};

function StatusPill({ tone = "neutral", children }) {
  const toneStyle =
    tone === "success"
      ? { background: "rgba(22,163,74,0.12)", color: HOUSE.success, borderColor: "rgba(22,163,74,0.25)" }
      : tone === "warning"
      ? { background: "rgba(245,158,11,0.12)", color: HOUSE.warning, borderColor: "rgba(245,158,11,0.25)" }
      : { background: "rgba(30,102,255,0.08)", color: HOUSE.primaryBlue, borderColor: "rgba(30,102,255,0.18)" };

  return <span style={{ ...PILL_BASE, border: `1px solid ${toneStyle.borderColor}`, ...toneStyle }}>{children}</span>;
}

function StepCard({
  id,
  step,
  title,
  subtitle,
  statusTone,
  statusText,
  openStep,
  setOpenStep,
  children,
}) {
  const isOpen = openStep === id;

  return (
    <div style={STEP_CARD_STYLE}>
      <div
        style={STEP_HEADER_STYLE}
        onClick={() => setOpenStep(isOpen ? null : id)}
        role="button"
        aria-expanded={isOpen}
      >
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div style={STEP_TITLE_STYLE}>
            {step}: {title}
          </div>
          {subtitle ? <div style={STEP_SUBTITLE_STYLE}>{subtitle}</div> : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {statusText ? <StatusPill tone={statusTone}>{statusText}</StatusPill> : null}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: `1px solid ${HOUSE.cardBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: HOUSE.text,
              background: "white",
              fontWeight: 900,
            }}
          >
            {isOpen ? "–" : "+"}
          </div>
        </div>
      </div>

      {isOpen ? <div style={{ padding: 18 }}>{children}</div> : null}
    </div>
  );
}

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

function AddKeywordInline({ onAdd }) {
  const [val, setVal] = useState("");

  return (
    <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Add a keyword (example: rehab center in pune)"
        style={{ ...inputStyle, maxWidth: 420, padding: "8px 10px" }}
      />
      <button
        type="button"
        onClick={() => {
          const t = String(val || "").trim();
          if (!t) return;
          onAdd(t);
          setVal("");
        }}
        style={{
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "white",
          cursor: "pointer",
          fontWeight: 900,
        }}
      >
        Add
      </button>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Note: Metrics may be unavailable in v1 (we never fake numbers).
      </div>
    </div>
  );
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
const [keywordGeoMode, setKeywordGeoMode] = useState("country"); // "country" | "local"
const [keywordLocationName, setKeywordLocationName] = useState(""); // location_name typed by user
const [keywordPoolMeta, setKeywordPoolMeta] = useState(null); // { generatedAt, seedCount, geo_mode, location_name, language_code, source, resultCount, apiCost }
const [localLocQuery, setLocalLocQuery] = useState(""); // user types short city/state e.g. "London"
const [localLocMatches, setLocalLocMatches] = useState([]); // [{ location_name, location_type, location_code }]
const [localLocOpen, setLocalLocOpen] = useState(false); // show/hide dropdown
const [localLocLoading, setLocalLocLoading] = useState(false);
const [localLocError, setLocalLocError] = useState("");
const [localLocSelected, setLocalLocSelected] = useState(false); // TRUE only when user clicks a suggestion
  // =========================
// Step 4.5 — Business Context Intelligence Layer (resume-safe)
// Firestore:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/businessContext
// =========================
const [businessContextState, setBusinessContextState] = useState("idle"); // idle | loading | generating | ready | error
const [businessContextError, setBusinessContextError] = useState("");
const [businessContextExists, setBusinessContextExists] = useState(false);

const [businessContextAi, setBusinessContextAi] = useState(null); // full JSON output
const [businessContextSummary, setBusinessContextSummary] = useState(""); // editable textarea value
  const [businessContextLastSavedSummary, setBusinessContextLastSavedSummary] = useState("");
const [businessContextApproved, setBusinessContextApproved] = useState(false);

const [businessContextGeoMode, setBusinessContextGeoMode] = useState("");
const [businessContextLocationName, setBusinessContextLocationName] = useState("");
const [businessContextGeoSource, setBusinessContextGeoSource] = useState("");

const [businessContextPrimaryServices, setBusinessContextPrimaryServices] = useState([]);
const [businessContextMismatchWarning, setBusinessContextMismatchWarning] = useState("");
  // =========================
// Step 5 — Keyword Clustering (resume-safe)
// Firestore:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/keywordClustering
// =========================
const [keywordClusteringState, setKeywordClusteringState] = useState("idle"); // idle | loading | generating | ready | error
const [keywordClusteringError, setKeywordClusteringError] = useState("");
const [keywordClusteringExists, setKeywordClusteringExists] = useState(false);
const [keywordClusteringApproved, setKeywordClusteringApproved] = useState(false);

const [kcAiExcluded, setKcAiExcluded] = useState([]); // read-only excluded list
const [kcPillars, setKcPillars] = useState([]); // editable pillars (userVersion)
const [kcShortlist, setKcShortlist] = useState([]); // editable shortlist (userVersion)

const [kcExpandedPillarId, setKcExpandedPillarId] = useState(null);
const [kcExcludedOpen, setKcExcludedOpen] = useState(false);

const [kcDraftState, setKcDraftState] = useState("idle"); // idle | saving | saved | error
const [kcDraftError, setKcDraftError] = useState("");

const [kcApproveState, setKcApproveState] = useState("idle"); // idle | approving | approved | blocked | error
const [kcApproveWarning, setKcApproveWarning] = useState("");
const [kcApproveBlockers, setKcApproveBlockers] = useState([]);
// =========================
// Step 6 — Keyword Mapping (resume-safe)
// Firestore:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/keywordMapping
// =========================
const [keywordMappingState, setKeywordMappingState] = useState("idle"); // idle | loading | generating | ready | error
const [keywordMappingError, setKeywordMappingError] = useState("");
const [keywordMappingExists, setKeywordMappingExists] = useState(false);
const [keywordMappingApproved, setKeywordMappingApproved] = useState(false);
  const [openStep, setOpenStep] = useState("step1"); // Option B accordion: one step open at a time


const [kmExistingPages, setKmExistingPages] = useState([]); // editable working version
const [kmGapPages, setKmGapPages] = useState([]); // editable working version
const [kmDeploymentStats, setKmDeploymentStats] = useState(null);

const [kmDraftState, setKmDraftState] = useState("idle"); // idle | saving | saved | error
const [kmDraftError, setKmDraftError] = useState("");
  const [kmSecondaryPicker, setKmSecondaryPicker] = useState({}); // { [rowIndex]: "keyword string" }
  // >>> STEP 6: UI COMPAT ALIASES (START)
// The Step 6 UI uses existingSecondaryDraft naming in JSX.
// We alias it to the actual state kmSecondaryPicker to avoid ReferenceError crashes.
const existingSecondaryDraft = kmSecondaryPicker;
const setExistingSecondaryDraft = setKmSecondaryPicker;
// >>> STEP 6: UI COMPAT ALIASES (END)



const [kmApproveState, setKmApproveState] = useState("idle"); // idle | approving | approved | blocked | error
const [kmApproveWarning, setKmApproveWarning] = useState("");






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
    geo_mode: d?.geo_mode ?? null,
    location_name: d?.location_name ?? null,
    language_code: d?.language_code ?? null,
    source: d?.source ?? null,
    resultCount: d?.resultCount ?? null,
    apiCost: d?.apiCost ?? null,
    seeds: Array.isArray(d?.seeds) ? d.seeds : [],
  });

  // Keep selector/input in sync when resuming from Firestore
  if (d?.geo_mode === "country" || d?.geo_mode === "local") setKeywordGeoMode(d.geo_mode);
  if (d?.location_name) setKeywordLocationName(String(d.location_name));
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
  // -------------------------
// Step 4.5 helpers — Business Context (Firestore resume + UI wiring)
// -------------------------
function businessContextDocRef() {
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
    "businessContext"
  );
}

function hydrateBusinessContextFromDoc(d) {
  const ai = d?.aiVersion || null;

  setBusinessContextAi(ai);
  setBusinessContextApproved(Boolean(d?.approved));

  const summaryText =
    d?.finalVersion?.summaryText ||
    ai?.summary ||
    "";

  setBusinessContextSummary(String(summaryText));
  setBusinessContextLastSavedSummary(String(summaryText));


  setBusinessContextGeoMode(String(d?.geoMode || ""));
  setBusinessContextLocationName(String(d?.location_name || ""));
  setBusinessContextGeoSource(String(d?.geoSource || ""));

  setBusinessContextPrimaryServices(
    Array.isArray(ai?.primary_services) ? ai.primary_services : []
  );

  setBusinessContextMismatchWarning(String(d?.mismatchWarning || ""));
}

async function loadExistingBusinessContext() {
  const ref = businessContextDocRef();
  if (!ref) return;

  try {
    setBusinessContextState("loading");
    setBusinessContextError("");

    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setBusinessContextExists(false);
      setBusinessContextAi(null);
      setBusinessContextSummary("");
      setBusinessContextApproved(false);
      setBusinessContextPrimaryServices([]);
      setBusinessContextMismatchWarning("");
      setBusinessContextState("idle");
      return;
    }

    const d = snap.data() || {};
    setBusinessContextExists(true);
    hydrateBusinessContextFromDoc(d);
    setBusinessContextState("ready");
  } catch (e) {
    console.error("Failed to load business context:", e);
    setBusinessContextState("error");
    setBusinessContextError(e?.message || "Failed to load business context.");
  }
}

async function searchLocalLocations(q) {
  try {
    setLocalLocLoading(true);
    setLocalLocError("");

    const token = await auth.currentUser.getIdToken();

    const res = await fetch("/api/seo/strategy/searchLocations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ q }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Location search failed");

    const matches = Array.isArray(data?.matches) ? data.matches : [];
    setLocalLocMatches(matches);
    setLocalLocOpen(true);
    if (!matches.length) setLocalLocError("No matches found. Try adding state or country.");
  } catch (e) {
    setLocalLocMatches([]);
    setLocalLocOpen(true);
    setLocalLocError(e?.message || "Location search failed");
  } finally {
    setLocalLocLoading(false);
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
    const geo_mode = keywordGeoMode;
const location_name = String(keywordLocationName || "").trim();
const language_code = "en";

if (!location_name) {
  setKeywordPoolState("idle");
  setKeywordPoolError("Please enter a location before generating keywords.");
  return;
}

// Idiot-proof local mode: user must pick from suggestions
if (geo_mode === "local" && !localLocSelected) {
  setKeywordPoolState("idle");
  setKeywordPoolError("For Local strategy, please search and select a location from the suggestions.");
  return;
}




    const res = await fetch("/api/seo/strategy/generateKeywordPool", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
body: JSON.stringify({
  websiteId: selectedWebsiteId,
  seeds,
  geo_mode,
  location_name,
  language_code,
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
// -------------------------
  // -------------------------
// Step 5 helpers — Keyword Clustering (Firestore resume + UI wiring)
// -------------------------
function keywordClusteringDocRef() {
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
    "keywordClustering"
  );
}

function safeKeyKc(s) {
  return String(s || "").trim().toLowerCase();
}

function rebuildShortlistFromPillars(pillars) {
  const rows = [];
  for (const p of pillars || []) {
    for (const c of p?.clusters || []) {
      for (const kw of c?.keywords || []) {
rows.push({
  ...kw,
  pillarId: p.pillarId,
  pillarName: p.name,
  clusterId: c.clusterId,
  clusterName: c.name,
});

      }
    }
  }
  // Sort by strategyScore (desc), push nulls to bottom
  rows.sort((a, b) => (Number(b.strategyScore ?? -1) - Number(a.strategyScore ?? -1)));
  return rows;
}

function hydrateKeywordClusteringFromDoc(d) {
  setKeywordClusteringExists(true);
  setKeywordClusteringApproved(Boolean(d?.approved));

  // excluded is from aiVersion only (read-only)
  const excluded = Array.isArray(d?.aiVersion?.excluded) ? d.aiVersion.excluded : [];
  setKcAiExcluded(excluded);

  // editable working version = userVersion (if present) else aiVersion
  const pillars =
    Array.isArray(d?.userVersion?.pillars) ? d.userVersion.pillars :
    Array.isArray(d?.aiVersion?.pillars) ? d.aiVersion.pillars : [];

  const shortlist =
    Array.isArray(d?.userVersion?.shortlist) ? d.userVersion.shortlist :
    Array.isArray(d?.aiVersion?.shortlist) ? d.aiVersion.shortlist : rebuildShortlistFromPillars(pillars);

  setKcPillars(pillars);
  setKcShortlist(shortlist);

  setKeywordClusteringState("ready");
  setKeywordClusteringError("");
}

async function loadExistingKeywordClustering() {
  const ref = keywordClusteringDocRef();
  if (!ref) return;

  try {
    setKeywordClusteringState("loading");
    setKeywordClusteringError("");

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      setKeywordClusteringExists(false);
      setKeywordClusteringApproved(false);
      setKcAiExcluded([]);
      setKcPillars([]);
      setKcShortlist([]);
      setKeywordClusteringState("idle");
      return;
    }

    hydrateKeywordClusteringFromDoc(snap.data() || {});
  } catch (e) {
    console.error("Failed to load keyword clustering:", e);
    setKeywordClusteringState("error");
    setKeywordClusteringError(e?.message || "Failed to load Step 5 data.");
  }
}
  // =========================
// Step 6 — Firestore loader (resume-safe)
// =========================
function keywordMappingDocRef() {
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
    "keywordMapping"
  );
}


function hydrateKeywordMappingFromDoc(data) {
  const km = data || {};

  // if approved, lock state but still show content
  const approved = km.approved === true;

  // Prefer finalVersion if approved, else userVersion if exists, else base arrays
  const source =
    approved && km.finalVersion
      ? km.finalVersion
      : km.userVersion
      ? km.userVersion
      : {
          existingPages: km.existingPages || [],
          gapPages: km.gapPages || [],
          deploymentStats: km.deploymentStats || null,
        };

  setKeywordMappingExists(true);
  setKeywordMappingApproved(approved);

  setKmExistingPages(Array.isArray(source.existingPages) ? source.existingPages : []);
  setKmGapPages(Array.isArray(source.gapPages) ? source.gapPages : []);
  setKmDeploymentStats(source.deploymentStats || km.deploymentStats || null);

  setKeywordMappingState("ready");
}

async function loadExistingKeywordMapping() {
  try {
    setKeywordMappingState("loading");
    setKeywordMappingError("");

    const ref = keywordMappingDocRef();
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setKeywordMappingExists(false);
      setKeywordMappingApproved(false);
      setKmExistingPages([]);
      setKmGapPages([]);
      setKmDeploymentStats(null);
      setKeywordMappingState("idle");
      return;
    }

    hydrateKeywordMappingFromDoc(snap.data());
  } catch (e) {
    console.error("loadExistingKeywordMapping error:", e);
    setKeywordMappingError(e?.message || "Failed to load Step 6 keyword mapping.");
    setKeywordMappingState("error");
  }
}
// >>> STEP 6: GENERATE KEYWORD MAPPING (START)
async function generateKeywordMapping() {
  try {
    if (keywordClusteringApproved !== true) {
      setKeywordMappingState("error");
      setKeywordMappingError("Step 6 is locked. Please approve Step 5 first.");
      return;
    }

    setKeywordMappingState("generating");
    setKeywordMappingError("");

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Missing login token.");

    const res = await fetch("/api/seo/strategy/generateKeywordMapping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ websiteId: selectedWebsiteId }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Failed to generate keyword mapping.");
    }

    // If generation is locked because doc exists, still hydrate from returned data
    if (data?.data) {
      hydrateKeywordMappingFromDoc(data.data);
    } else {
      // fallback: load from firestore
      await loadExistingKeywordMapping();
    }

    setKeywordMappingState("ready");
  } catch (e) {
    console.error("generateKeywordMapping error:", e);
    setKeywordMappingState("error");
    setKeywordMappingError(e?.message || "Failed to generate keyword mapping.");
  }
}
  // >>> STEP 6: APPROVE KEYWORD MAPPING (START)
async function approveKeywordMapping() {
  try {
    if (keywordMappingApproved) return;

    setKmApproveState("approving");
    setKmApproveWarning("");

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Missing login token.");

    const res = await fetch("/api/seo/strategy/approveKeywordMapping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ websiteId: selectedWebsiteId }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Failed to approve keyword mapping.");
    }

    setKeywordMappingApproved(true);
    setKmApproveState("approved");

  } catch (e) {
    console.error("approveKeywordMapping error:", e);
    setKmApproveState("error");
    setKmApproveWarning(e?.message || "Failed to approve mapping.");
  }
}
// >>> STEP 6: APPROVE KEYWORD MAPPING (END)
  // >>> STEP 6: SAVE KEYWORD MAPPING DRAFT (START)
async function saveKeywordMappingDraft() {
  try {
    if (keywordMappingApproved) return;

    if (keywordClusteringApproved !== true) {
      setKmDraftState("error");
      setKmDraftError("Step 6 is locked. Please approve Step 5 first.");
      return;
    }

    if (keywordMappingExists !== true) {
      setKmDraftState("error");
      setKmDraftError("Nothing to save yet. Please generate the mapping first.");
      return;
    }

    const ref = keywordMappingDocRef();
    if (!ref) throw new Error("Missing website context (keywordMappingDocRef).");

    setKmDraftState("saving");
    setKmDraftError("");

    const payload = {
      userVersion: {
        existingPages: Array.isArray(kmExistingPages) ? kmExistingPages : [],
        gapPages: Array.isArray(kmGapPages) ? kmGapPages : [],
        deploymentStats: kmDeploymentStats || null,
      },
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, payload, { merge: true });

    setKmDraftState("saved");
  } catch (e) {
    console.error("saveKeywordMappingDraft error:", e);
    setKmDraftState("error");
    setKmDraftError(e?.message || "Failed to save Step 6 draft.");
  }
}
// >>> STEP 6: SAVE KEYWORD MAPPING DRAFT (END)
  // >>> STEP 6: EDITING HELPERS (START)
function getPrimaryKeywordString(p) {
  if (!p) return "";
  if (typeof p.primaryKeyword === "string") return p.primaryKeyword;
  if (typeof p.primaryKeyword === "object" && p.primaryKeyword?.keyword) return String(p.primaryKeyword.keyword);
  return "";
}

function getSecondaryKeywordStrings(p) {
  const s = p?.secondaryKeywords;
  if (!Array.isArray(s)) return [];
  // can be string[] or object[]
  return s
    .map((x) => (typeof x === "string" ? x : x?.keyword))
    .filter(Boolean)
    .map(String);
}

function buildAllShortlistedKeywordStrings(existingPages) {
  const pool = new Set();

  (kcShortlist || [])
    .map((x) => (typeof x === "string" ? x : x?.keyword))
    .filter(Boolean)
    .forEach((k) => pool.add(String(k).trim()));

  (existingPages || []).forEach((p) => {
    const pk = getPrimaryKeywordString(p);
    if (pk) pool.add(pk);

    getSecondaryKeywordStrings(p).forEach((k) => pool.add(k));
  });

  return Array.from(pool).sort((a, b) => a.localeCompare(b));
}

function buildPrimaryOptionsForPage(pageIndex) {
  const all = buildAllShortlistedKeywordStrings(kmExistingPages);

  const usedByOthers = new Set(
    (kmExistingPages || [])
      .map((p, idx) => (idx === pageIndex ? "" : getPrimaryKeywordString(p)))
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase())
  );

  const current = getPrimaryKeywordString((kmExistingPages || [])[pageIndex] || "");
  const currentNorm = String(current || "").trim().toLowerCase();

  const filtered = all.filter((kw) => {
    const n = String(kw || "").trim().toLowerCase();
    if (!n) return false;
    if (n === currentNorm) return true;
    return !usedByOthers.has(n);
  });

  return filtered;
}

function buildCandidateKeywordPool(existingPages) {
  return buildAllShortlistedKeywordStrings(existingPages);
}
function hasDuplicatePrimary(existingPages, nextKeyword, exceptIndex) {
  const needle = String(nextKeyword || "").trim().toLowerCase();
  if (!needle) return false;

  for (let i = 0; i < (existingPages || []).length; i++) {
    if (i === exceptIndex) continue;
    const pk = getPrimaryKeywordString(existingPages[i]).trim().toLowerCase();
    if (pk && pk === needle) return true;
  }
  return false;
}


function setPrimaryKeywordAtIndex(pageIndex, nextKeyword) {
  const next = String(nextKeyword || "").trim();

  setKmExistingPages((prev) => {
    const arr = Array.isArray(prev) ? [...prev] : [];
    if (!arr[pageIndex]) return arr;

    if (hasDuplicatePrimary(arr, next, pageIndex)) {
      setKeywordMappingError(`Duplicate primary keyword not allowed: "${next}" is already used on another page.`);
      return arr;
    }

    setKeywordMappingError("");

    const current = { ...(arr[pageIndex] || {}) };

    // Keep object shape for consistency with API
    current.primaryKeyword = next
      ? { keyword: next } // minimal; similarity/score not recomputed in UI
      : null;

    arr[pageIndex] = current;
    return arr;
  });
}

function removeSecondaryKeywordAtIndex(pageIndex, keywordToRemove) {
  const rm = String(keywordToRemove || "").trim().toLowerCase();
  if (!rm) return;

  setKmExistingPages((prev) => {
    const arr = Array.isArray(prev) ? [...prev] : [];
    if (!arr[pageIndex]) return arr;

    const current = { ...(arr[pageIndex] || {}) };
    const sec = current.secondaryKeywords;

    if (!Array.isArray(sec)) return arr;

    const filtered = sec.filter((x) => {
      const k = (typeof x === "string" ? x : x?.keyword) || "";
      return String(k).trim().toLowerCase() !== rm;
    });

    current.secondaryKeywords = filtered;
    arr[pageIndex] = current;
    return arr;
  });
}
  function setGapFieldAtIndex(gapIndex, field, value) {
  setKmGapPages((prev) => {
    const arr = Array.isArray(prev) ? [...prev] : [];
    if (!arr[gapIndex]) return arr;

    arr[gapIndex] = {
      ...arr[gapIndex],
      [field]: value,
    };

    return arr;
  });
}

function toggleGapAccepted(gapIndex) {
  setKmGapPages((prev) => {
    const arr = Array.isArray(prev) ? [...prev] : [];
    if (!arr[gapIndex]) return arr;

    const current = arr[gapIndex];
    const nextAccepted = !(current?.accepted ?? true);

    arr[gapIndex] = {
      ...current,
      accepted: nextAccepted,
    };

    return arr;
  });
}


  function addSecondaryKeywordAtIndex(pageIndex, nextKeyword) {
  const next = String(nextKeyword || "").trim();
  if (!next) return;

  setKmExistingPages((prev) => {
    const arr = Array.isArray(prev) ? [...prev] : [];
    if (!arr[pageIndex]) return arr;

    const current = { ...(arr[pageIndex] || {}) };
    const sec = Array.isArray(current.secondaryKeywords) ? [...current.secondaryKeywords] : [];

    // normalize existing strings
    const existing = sec
      .map((x) => (typeof x === "string" ? x : x?.keyword))
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase());

    const needle = next.toLowerCase();
    const primaryHere = String(getPrimaryKeywordString(current) || "").trim().toLowerCase();
if (primaryHere && primaryHere === needle) {
  setKeywordMappingError("Secondary keyword cannot be the same as the primary keyword for this page.");
  return arr;
}


    if (existing.includes(needle)) return arr;

    if (sec.length >= 5) {
      setKeywordMappingError("You can add a maximum of 5 secondary keywords per page.");
      return arr;
    }

    setKeywordMappingError("");

    // Store as string for simplicity (API can handle string[] or object[])
    sec.push(next);
    current.secondaryKeywords = sec;
    arr[pageIndex] = current;
    return arr;
  });
}
// >>> STEP 6: UI WRAPPER FUNCTIONS (START)
// These names are referenced by the Step 6 JSX. They delegate to the actual helper functions.

function updateExistingPrimary(pageIndex, nextKeyword) {
  setPrimaryKeywordAtIndex(pageIndex, nextKeyword);
}

function removeExistingSecondary(pageIndex, keywordToRemove) {
  removeSecondaryKeywordAtIndex(pageIndex, keywordToRemove);
}

function addExistingSecondary(pageIndex) {
  const next = String(existingSecondaryDraft?.[pageIndex] || "").trim();
  if (!next) return;

  addSecondaryKeywordAtIndex(pageIndex, next);

  // clear dropdown after add
  setExistingSecondaryDraft((prev) => ({
    ...(prev || {}),
    [pageIndex]: "",
  }));
}
// >>> STEP 6: UI WRAPPER FUNCTIONS (END)

// >>> STEP 6: EDITING HELPERS (END)



// >>> STEP 6: GENERATE KEYWORD MAPPING (END)


// Step 4.5 handlers — Business Context (Generate / Save Edit / Approve)
// -------------------------
async function handleGenerateBusinessContext() {
  // Basic prerequisites: we need website + keyword pool present (since geo target comes from there)
  if (!selectedWebsiteId) return;

  if (!keywordPoolExists) {
    setBusinessContextError("Please generate the Keyword Pool (Step 4B) before generating Business Context.");
    setBusinessContextState("error");
    return;
  }

 // Prefer seeds from the UI textarea, but fallback to Firestore keywordPool seeds if user left it blank.
let seeds = parseSeedKeywords(seedKeywordsRaw);

// Prefer seeds from the UI textarea, but fallback to Firestore keywordPool seeds.
// This avoids the deadlock where the seed box is disabled after Step 4B is generated.
if (seeds.length < 3) {
  const fallback = Array.isArray(keywordPoolMeta?.seeds) ? keywordPoolMeta.seeds : [];
  if (fallback.length >= 3) seeds = fallback;
}



if (seeds.length < 3) {
  setBusinessContextError(
   "Please paste at least 3 seed keywords in Step 4B (Seed Keywords box), then click Generate Keyword Pool, and only then click Regenerate here."
  );
  setBusinessContextState("error");
  return;
}


  setBusinessContextState("generating");
  setBusinessContextError("");

  try {
    const token = await auth.currentUser.getIdToken();

    const res = await fetch("/api/seo/strategy/generateBusinessContext", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        websiteId: selectedWebsiteId,
        seeds,
        language_code: "en",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || data?.message || "Business Context generation failed.");
    }

    // Reload from Firestore (resume-safe)
    await loadExistingBusinessContext();
    setBusinessContextExists(true);
    setBusinessContextState("ready");
  } catch (e) {
    console.error("Business Context generation failed:", e);
    setBusinessContextState("error");
    setBusinessContextError(e?.message || "Business Context generation failed.");
  }
}

async function handleSaveBusinessContextEdit() {
  const ref = businessContextDocRef();
  if (!ref) return;

  try {
    setBusinessContextState("loading");
    setBusinessContextError("");

    const txt = String(businessContextSummary || "").trim();

     const changed =
      String(txt) !== String(businessContextLastSavedSummary || "");

    const payload = {
      userVersion: { summaryText: txt },
      finalVersion: { summaryText: txt },
      editedByUser: true,
    };

    // Only reset approval if the text actually changed
    if (changed) {
      payload.approved = false;
      payload.approvedAt = null;
    }

    await setDoc(ref, payload, { merge: true });


    await loadExistingBusinessContext();
    setBusinessContextState("ready");
  } catch (e) {
    console.error("Failed to save business context edit:", e);
    setBusinessContextState("error");
    setBusinessContextError(e?.message || "Failed to save edit.");
  }
}

async function handleApproveBusinessContext() {
  const ref = businessContextDocRef();
  if (!ref) return;

  try {
    setBusinessContextState("loading");
    setBusinessContextError("");

    await setDoc(
      ref,
      {
        approved: true,
        approvedAt: serverTimestamp(),
      },
      { merge: true }
    );

await loadExistingBusinessContext();
setBusinessContextState("ready");
  } catch (e) {
    console.error("Failed to approve business context:", e);
    setBusinessContextState("error");
    setBusinessContextError(e?.message || "Failed to approve.");
  }
}
  // -------------------------
// Step 5 handlers — Generate / Save Draft / Approve & Lock
// -------------------------
async function handleGenerateKeywordClustering() {
  if (!selectedWebsiteId) return;

  if (!businessContextApproved) {
    setKeywordClusteringError("Step 5 is locked. Please approve Step 4.5 first.");
    setKeywordClusteringState("error");
    return;
  }

  setKeywordClusteringState("generating");
  setKeywordClusteringError("");
  setKcDraftError("");
  setKcApproveWarning("");
  setKcApproveBlockers([]);
  setKcApproveState("idle");

  try {
    const token = await auth.currentUser.getIdToken();

    const res = await fetch("/api/seo/strategy/generateKeywordClustering", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ websiteId: selectedWebsiteId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Step 5 generation failed.");

    // If generation is locked because doc exists, hydrate from returned doc
    if (data?.source === "existing" && data?.data) {
      hydrateKeywordClusteringFromDoc(data.data);
      setKeywordClusteringState("ready");
      return;
    }

    // Newly generated: load from Firestore (resume-safe)
    await loadExistingKeywordClustering();
    setKeywordClusteringState("ready");
  } catch (e) {
    console.error("Step 5 generation failed:", e);
    setKeywordClusteringState("error");
    setKeywordClusteringError(e?.message || "Step 5 generation failed.");
  }
}

function kcHasDuplicateInPillars(pillars, keyword) {
  const k = safeKeyKc(keyword);
  if (!k) return true;
  for (const p of pillars || []) {
    for (const c of p?.clusters || []) {
      for (const kw of c?.keywords || []) {
        if (safeKeyKc(kw?.keyword) === k) return true;
      }
    }
  }
  return false;
}

async function handleSaveKeywordClusteringDraft() {
  if (!selectedWebsiteId) return;
  if (!keywordClusteringExists) return;

  setKcDraftState("saving");
  setKcDraftError("");

  try {
    const token = await auth.currentUser.getIdToken();

    const res = await fetch("/api/seo/strategy/saveKeywordClusteringDraft", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        websiteId: selectedWebsiteId,
        userVersion: {
          pillars: kcPillars,
          shortlist: kcShortlist,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to save draft.");

    setKcDraftState("saved");
    setTimeout(() => setKcDraftState("idle"), 1200);

    // Reload doc for resume-safety
    await loadExistingKeywordClustering();
  } catch (e) {
    console.error("Save draft failed:", e);
    setKcDraftState("error");
    setKcDraftError(e?.message || "Failed to save draft.");
  }
}

async function handleApproveKeywordClustering() {
  if (!selectedWebsiteId) return;
  if (!keywordClusteringExists) return;

  setKcApproveState("approving");
  setKcApproveWarning("");
  setKcApproveBlockers([]);

  try {
    const token = await auth.currentUser.getIdToken();

    const res = await fetch("/api/seo/strategy/approveKeywordClustering", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ websiteId: selectedWebsiteId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setKcApproveState("blocked");
      setKcApproveWarning(data?.warning || "");
      setKcApproveBlockers(Array.isArray(data?.blockers) ? data.blockers : []);
      return;
    }

    setKcApproveState("approved");
    await loadExistingKeywordClustering();
  } catch (e) {
    console.error("Approve Step 5 failed:", e);
    setKcApproveState("error");
    setKcApproveWarning(e?.message || "Approve failed.");
  }
}

// -------------------------
// Step 5 local UI edit actions (no Firestore write until Save Draft)
// -------------------------
function handleRenamePillarLabel(pillarId, newName) {
  const next = (kcPillars || []).map((p) =>
    p.pillarId === pillarId ? { ...p, name: newName } : p
  );
  setKcPillars(next);
  setKcShortlist(rebuildShortlistFromPillars(next));
}

function handleRemoveKeywordFromCluster(pillarId, clusterId, keyword) {
  const k = safeKeyKc(keyword);

  const next = (kcPillars || []).map((p) => {
    if (p.pillarId !== pillarId) return p;
    return {
      ...p,
      clusters: (p.clusters || []).map((c) => {
        if (c.clusterId !== clusterId) return c;
        return {
          ...c,
          keywords: (c.keywords || []).filter((kw) => safeKeyKc(kw?.keyword) !== k),
        };
      }),
    };
  });

  setKcPillars(next);
  setKcShortlist(rebuildShortlistFromPillars(next));
}

function handleAddKeywordToCluster(pillarId, clusterId, rawKeyword) {
  const kwText = String(rawKeyword || "").trim();
  if (!kwText) return;

  if (kcHasDuplicateInPillars(kcPillars, kwText)) {
    alert("Duplicate keyword: this keyword already exists in your clusters.");
    return;
  }

const placeholderKw = {
  keyword: kwText,
  volume: null,
  cpc: null,
  competition: null,
  competition_index: null,
  intent: "other",
  businessFitScore: null,
  strategyScore: null,
  metricsStatus: "loading", // will become "ok" or "unavailable"
};


  const next = (kcPillars || []).map((p) => {
    if (p.pillarId !== pillarId) return p;
    return {
      ...p,
      clusters: (p.clusters || []).map((c) => {
        if (c.clusterId !== clusterId) return c;
        return {
          ...c,
          keywords: [...(c.keywords || []), placeholderKw],
        };
      }),
    };
  });

  setKcPillars(next);
  setKcShortlist(rebuildShortlistFromPillars(next));
  // Fetch real metrics for this manually added keyword (same geo context as Step 4)
(async () => {
  try {
    const token = await auth.currentUser.getIdToken();

    const res = await fetch("/api/seo/strategy/fetchKeywordMetrics", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        websiteId: selectedWebsiteId,
        keyword: kwText,
      }),
    });

    const data = await res.json();

    // Update the keyword row inside kcPillars
    setKcPillars((prev) => {
      const updated = (prev || []).map((p) => {
        if (p.pillarId !== pillarId) return p;
        return {
          ...p,
          clusters: (p.clusters || []).map((c) => {
            if (c.clusterId !== clusterId) return c;
            return {
              ...c,
              keywords: (c.keywords || []).map((kw) => {
                if (safeKeyKc(kw.keyword) !== safeKeyKc(kwText)) return kw;

                if (!data?.ok) {
                  return { ...kw, metricsStatus: "unavailable" };
                }

                return {
                  ...kw,
                  volume: data.volume ?? null,
                  cpc: data.cpc ?? null,
                  competition: data.competition ?? null,
                  competition_index: data.competition_index ?? null,
                  metricsStatus: "ok",
                };
              }),
            };
          }),
        };
      });

      // keep shortlist consistent with new metrics
      setKcShortlist(rebuildShortlistFromPillars(updated));
      return updated;
    });
  } catch (e) {
    console.error("fetchKeywordMetrics failed:", e);
    // Mark as unavailable
    setKcPillars((prev) => {
      const updated = (prev || []).map((p) => {
        if (p.pillarId !== pillarId) return p;
        return {
          ...p,
          clusters: (p.clusters || []).map((c) => {
            if (c.clusterId !== clusterId) return c;
            return {
              ...c,
              keywords: (c.keywords || []).map((kw) => {
                if (safeKeyKc(kw.keyword) !== safeKeyKc(kwText)) return kw;
                return { ...kw, metricsStatus: "unavailable" };
              }),
            };
          }),
        };
      });
      setKcShortlist(rebuildShortlistFromPillars(updated));
      return updated;
    });
  }
})();

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

const getEffectiveContext = (websiteId) => {
  const id = websiteId || selectedWebsiteId;
  const w = websites.find((x) => x.id === id);

  const effectiveUid = w && w.ownerUid ? w.ownerUid : uid;
  const effectiveWebsiteId = w && w.ownerWebsiteId ? w.ownerWebsiteId : id;

  return { effectiveUid, effectiveWebsiteId };
};


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
// Load existing Step 4.5 business context (resume-safe)
useEffect(() => {
  if (!uid || !selectedWebsiteId || !websites?.length) return;
  loadExistingBusinessContext();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, selectedWebsiteId, websites]);
  // Load existing Step 5 keyword clustering (resume-safe)
useEffect(() => {
  if (!uid || !selectedWebsiteId || !websites?.length) return;
  loadExistingKeywordClustering();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, selectedWebsiteId, websites]);
// Load existing Step 6 keyword mapping (resume-safe)
useEffect(() => {
  if (!uid || !selectedWebsiteId || !websites?.length) return;
  loadExistingKeywordMapping();
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
      <div style={{ padding: 32, maxWidth: 1100 }}>
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
<StepCard
  id="step1"
  step="Step 1"
  title="Business Profile"
  subtitle="We will use this to build a revenue-aligned SEO strategy. Do not add keywords here."
  statusTone={profileExists ? "success" : "neutral"}
  statusText={profileExists ? "Saved" : "Not started"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>


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
      </StepCard>
{/* Step 2 */}
<StepCard
  id="step2"
  step="Step 2"
  title="Page Discovery"
  subtitle="Add the key URLs you want to include in this SEO strategy. This step only saves URLs — no audit, no AI calls, no fixes."
  statusTone={pageDiscoveryExists ? "success" : "neutral"}
  statusText={pageDiscoveryExists ? "Saved" : "Not started"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>


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
</StepCard>
{/* STEP 3 */}
<StepCard
  id="step3"
  step="Step 3"
  title="Pure On-Page Audit (Diagnostics)"
  subtitle="This runs a diagnostics audit only (no AI, no fixes). It audits only the URLs saved in Step 2. It is resume-safe and skips URLs already audited."
  statusTone={auditProgress?.done > 0 ? "success" : "neutral"}
  statusText={auditProgress?.done > 0 ? `${auditProgress.done} audited` : "Not started"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>

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
</StepCard>
{/* STEP 3.5 */}
<StepCard
  id="step3_5"
  step="Step 3.5"
  title="Audit Results Viewer"
  subtitle="Resume-safe: results render automatically if audits already exist. Click a row to expand details."
  statusTone={auditProgress?.done > 0 ? "success" : "neutral"}
  statusText={auditProgress?.done > 0 ? "Ready" : "Waiting"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>


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
</StepCard>


{/* STEP 4B */}
<StepCard
  id="step4b"
  step="Step 4B"
  title="Keyword Pool"
  subtitle="Enter 3–10 seed keywords (comma or newline separated). Generate is locked per website once created."
  statusTone={keywordPoolExists ? "success" : "neutral"}
  statusText={keywordPoolExists ? "Generated" : "Not started"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>


          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            Enter 3–10 seed keywords (comma or newline separated). Generate is locked per website once created.
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
  <div>
    <label style={labelStyle}>Geo Strategy Mode</label>
    <select
      value={keywordGeoMode}
      onChange={(e) => setKeywordGeoMode(e.target.value)}
      style={inputStyle}
      disabled={keywordPoolExists && keywordPoolLocked}
    >
      <option value="country">Country-level strategy (recommended)</option>
      <option value="local">Local strategy (city/state)</option>
    </select>
    <div style={helpStyle}>You must explicitly choose a mode. No fallback is used.</div>
  </div>

  <div>
    <label style={labelStyle}>
      {keywordGeoMode === "country" ? "Country" : "City / State"}
    </label>
{keywordGeoMode === "country" ? (
  <input
    value={keywordLocationName}
    onChange={(e) => {
      setKeywordLocationName(e.target.value);
    }}
    placeholder="Example: India"
    style={inputStyle}
    disabled={keywordPoolExists && keywordPoolLocked}
  />
) : (
  <div style={{ position: "relative" }}>
    <div style={{ display: "flex", gap: 8 }}>
      <input
        value={localLocQuery}
        onChange={(e) => {
          const v = e.target.value;
          setLocalLocQuery(v);
          setLocalLocSelected(false); // reset selection if user types again
          setKeywordLocationName(""); // clear final location_name until user selects
        }}
        placeholder="Type your city/state (example: London)"
        style={{ ...inputStyle, flex: 1 }}
        disabled={keywordPoolExists && keywordPoolLocked}
      />

      <button
        type="button"
        onClick={() => searchLocalLocations(localLocQuery)}
        disabled={
          keywordPoolExists && keywordPoolLocked
            ? true
            : localLocLoading || String(localLocQuery || "").trim().length < 2
        }
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "white",
          cursor: "pointer",
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}
        title="Search valid Google Ads locations"
      >
        {localLocLoading ? "Searching…" : "Search"}
      </button>
    </div>

    <div style={{ marginTop: 8, fontSize: 12, color: "#374151" }}>
      Selected:{" "}
      <b>{keywordLocationName ? keywordLocationName : "None (please select from suggestions)"}</b>
    </div>

    {localLocOpen ? (
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 54,
          zIndex: 5,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          background: "white",
          boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
      >
        {localLocError ? (
          <div style={{ padding: 12, fontSize: 13, color: "#b91c1c" }}>
            {localLocError}
          </div>
        ) : null}

        {localLocMatches?.length ? (
          <div style={{ maxHeight: 220, overflow: "auto" }}>
            {localLocMatches.map((m, idx) => (
              <div
                key={`${m.location_name}-${idx}`}
                onClick={() => {
                  setKeywordLocationName(m.location_name); // IMPORTANT: exact string
                  setLocalLocSelected(true);
                  setLocalLocOpen(false);
                  setLocalLocError("");
                }}
                style={{
                  padding: 12,
                  fontSize: 13,
                  cursor: "pointer",
                  borderTop: idx === 0 ? "none" : "1px solid #f3f4f6",
                }}
                title="Click to select"
              >
                <div style={{ fontWeight: 900, color: "#111827" }}>{m.location_name}</div>
                <div style={{ marginTop: 4, color: "#6b7280", fontSize: 12 }}>
                  {m.location_type ? `Type: ${m.location_type}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : !localLocError ? (
          <div style={{ padding: 12, fontSize: 13, color: "#6b7280" }}>
           Type a city or state, click Search, then choose the correct location.
          </div>
        ) : null}

        <div style={{ padding: 10, borderTop: "1px solid #f3f4f6", background: "#fafafa" }}>
          <button
            type="button"
            onClick={() => setLocalLocOpen(false)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </div>
    ) : null}
  </div>
)}

    <div style={helpStyle}>
      {keywordGeoMode === "country"
        ? "Type a country name exactly (e.g., India, United Kingdom, United States)."
        : "Type a city/state/country string (e.g., London,England,United Kingdom)."}
    </div>
  </div>
</div>

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
           <div>
    <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
        {((keywordPoolMeta?.geo_mode || keywordGeoMode) === "country")
          ? "Top 200 Keywords"
          : "Top results (count depends on Google Ads availability)"}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Source: <b>{keywordPoolMeta?.source === "google_ads" ? "Google Ads" : "Labs"}</b>
        {keywordPoolMeta?.location_name ? (
          <>
            {" "}• Location: <b>{keywordPoolMeta.location_name}</b>
          </>
        ) : null}
        {keywordPoolMeta?.resultCount != null ? (
          <>
            {" "}• Results: <b>{Number(keywordPoolMeta.resultCount)}</b>
          </>
        ) : null}
      </div>
    </div>

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
 </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                No keyword pool found yet for this website.
              </div>
            )}
          </div>
</StepCard>

{/* STEP 4.5 */}
<StepCard
  id="step4_5"
  step="Step 4.5"
  title="AI Business Understanding"
  subtitle="This is a neutral, factual summary used for keyword relevance scoring and clustering. Please edit if needed and approve to unlock Step 5."
  statusTone={businessContextApproved ? "success" : "warning"}
  statusText={businessContextApproved ? "Approved" : "Not approved"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>

          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            This is a neutral, factual summary used for keyword relevance scoring and clustering.
            Please edit if needed and approve to unlock Step 5 in the next phase.
          </div>

          {/* Mismatch warning (does not block) */}
          {businessContextMismatchWarning ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#92400e",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 900 }}>Industry mismatch warning</div>
              <div style={{ marginTop: 6 }}>{businessContextMismatchWarning}</div>
            </div>
          ) : null}

          {/* Editable summary */}
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>AI Understanding of Your Business (editable)</label>
            <textarea
              value={businessContextSummary}
              onChange={(e) => setBusinessContextSummary(e.target.value)}
              rows={7}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Click Regenerate to create a summary from Business Profile + audited pages + keyword pool."
            />
            <div style={helpStyle}>
              Must be 120–180 words, neutral, no promotional language, must mention geo target.
            </div>
          </div>

          {/* Detected services */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
              Detected Core Services
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(businessContextPrimaryServices || []).length ? (
                businessContextPrimaryServices.map((t, idx) => (
                  <div
                    key={`${t}-${idx}`}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid #e5e7eb",
                      background: "#fafafa",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    {t}
                  </div>
                ))
              ) : (
                <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
                  Not generated yet.
                </div>
              )}
            </div>
          </div>

          {/* GEO target display */}
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
            <div style={{ fontWeight: 900, color: "#111827" }}>SEO Target Geography</div>
            <div style={{ marginTop: 6 }}>
              <div>
                Mode: <b>{businessContextGeoMode ? businessContextGeoMode : "—"}</b>
              </div>
              <div>
                Location:{" "}
                <b style={{ wordBreak: "break-word" }}>
                  {businessContextLocationName ? businessContextLocationName : "—"}
                </b>
              </div>
              <div>
                Source: <b>{businessContextGeoSource ? businessContextGeoSource : "—"}</b>
              </div>
            </div>
          </div>

          {/* Actions */}
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
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleGenerateBusinessContext}
                disabled={!selectedWebsiteId || businessContextState === "generating"}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  cursor:
                    !selectedWebsiteId || businessContextState === "generating"
                      ? "not-allowed"
                      : "pointer",
                  background: "#111827",
                  color: "white",
                  opacity:
                    !selectedWebsiteId || businessContextState === "generating" ? 0.6 : 1,
                }}
              >
                {businessContextState === "generating" ? "Generating…" : "Regenerate"}
              </button>

              <button
                type="button"
                onClick={handleSaveBusinessContextEdit}
                disabled={!selectedWebsiteId || businessContextState === "loading"}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  cursor: !selectedWebsiteId ? "not-allowed" : "pointer",
                  background: "white",
                  opacity: !selectedWebsiteId ? 0.6 : 1,
                }}
              >
                Save Edit
              </button>

              <button
                type="button"
                onClick={handleApproveBusinessContext}
                disabled={businessContextApproved || !selectedWebsiteId || !businessContextSummary?.trim()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #16a34a",
                  cursor:
                    !selectedWebsiteId || !businessContextSummary?.trim()
                      ? "not-allowed"
                      : "pointer",
                  background: "#16a34a",
                  color: "white",
                  opacity:
                    !selectedWebsiteId || !businessContextSummary?.trim() ? 0.6 : 1,
                }}
              >
               {businessContextApproved ? "Approved ✓" : "Approve & Continue"}
              </button>

              {businessContextApproved ? (
                <div style={{ color: "#065f46", fontWeight: 900 }}>Approved ✓</div>
              ) : null}
            </div>

            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Step 5 status:{" "}
              <b style={{ color: businessContextApproved ? "#065f46" : "#111827" }}>
                {businessContextApproved ? "Unlocked" : "Locked"}
              </b>
            </div>
          </div>

          {businessContextError ? (
            <div style={{ marginTop: 10, color: "#b91c1c" }}>{businessContextError}</div>
          ) : null}
         </StepCard>
{/* STEP 5 */}
<StepCard
  id="step5"
  step="Step 5"
  title="Pillars & Clusters (Keyword Architecture)"
  subtitle="Vyndow will filter keywords semantically, shortlist ~100, then create up to 6 pillars with clusters. You can rename pillar labels, remove keywords, or add keywords."
  statusTone={keywordClusteringApproved ? "success" : "warning"}
  statusText={keywordClusteringApproved ? "Locked" : "Unlocked"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>


  <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
    Vyndow will filter keywords semantically, shortlist ~100, then create up to 6 pillars with clusters.
    You can rename pillar labels (label-only), remove keywords, or add keywords (metrics may show as unavailable).
  </div>

  {/* Actions */}
  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
    <button
      type="button"
      onClick={handleGenerateKeywordClustering}
      disabled={!businessContextApproved || keywordClusteringState === "generating" || keywordClusteringApproved}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #111827",
        cursor: (!businessContextApproved || keywordClusteringApproved) ? "not-allowed" : "pointer",
        background: (!businessContextApproved || keywordClusteringApproved) ? "#f3f4f6" : "#111827",
        color: (!businessContextApproved || keywordClusteringApproved) ? "#6b7280" : "white",
        opacity: keywordClusteringState === "generating" ? 0.7 : 1,
        fontWeight: 900,
      }}
      title={
        !businessContextApproved
          ? "Approve Step 4.5 to unlock Step 5"
          : keywordClusteringApproved
          ? "Step 5 is approved and locked. Delete Firestore doc manually to regenerate."
          : ""
      }
    >
      {keywordClusteringState === "generating" ? "Generating…" : "Generate Step 5 Architecture"}
    </button>

    <button
      type="button"
      onClick={handleSaveKeywordClusteringDraft}
      disabled={!keywordClusteringExists || keywordClusteringApproved || kcDraftState === "saving"}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #ddd",
        cursor: (!keywordClusteringExists || keywordClusteringApproved) ? "not-allowed" : "pointer",
        background: "white",
        opacity: (!keywordClusteringExists || keywordClusteringApproved) ? 0.6 : 1,
        fontWeight: 900,
      }}
      title={keywordClusteringApproved ? "Locked after approval" : ""}
    >
      {kcDraftState === "saving" ? "Saving…" : kcDraftState === "saved" ? "Saved ✓" : "Save Draft"}
    </button>

    <button
      type="button"
      onClick={handleApproveKeywordClustering}
      disabled={!keywordClusteringExists || keywordClusteringApproved || kcApproveState === "approving"}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #16a34a",
        cursor: (!keywordClusteringExists || keywordClusteringApproved) ? "not-allowed" : "pointer",
        background: "#16a34a",
        color: "white",
        opacity: (!keywordClusteringExists || keywordClusteringApproved) ? 0.6 : 1,
        fontWeight: 900,
      }}
      title={keywordClusteringApproved ? "Already approved" : ""}
    >
      {keywordClusteringApproved ? "Approved ✓" : kcApproveState === "approving" ? "Approving…" : "Approve & Lock Step 5"}
    </button>

    <div style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
      Status:{" "}
      <b style={{ color: keywordClusteringApproved ? "#065f46" : "#111827" }}>
        {keywordClusteringApproved
          ? "Locked"
          : keywordClusteringExists
          ? "Draft (editable)"
          : businessContextApproved
          ? "Ready to generate"
          : "Locked"}
      </b>
    </div>
  </div>

  {keywordClusteringError ? (
    <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
      {keywordClusteringError}
    </div>
  ) : null}

  {kcDraftError ? (
    <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
      {kcDraftError}
    </div>
  ) : null}

  {/* Approval blockers */}
  {kcApproveState === "blocked" ? (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 900 }}>Approval blocked</div>
      <div style={{ marginTop: 6 }}>
        {kcApproveWarning ||
          "Please fix the issues below before locking Step 5."}
      </div>
      {kcApproveBlockers?.length ? (
        <ul style={{ marginTop: 8, paddingLeft: 18 }}>
          {kcApproveBlockers.map((b, i) => (
            <li key={`b-${i}`}>{b?.message || "Validation issue"}</li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null}

  {/* Pillars */}
  {keywordClusteringExists ? (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
        Pillars (max 6)
      </div>

     <div
  style={{
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  }}
>

        {(kcPillars || []).map((p) => {
          const kwCount = (p?.clusters || []).reduce((acc, c) => acc + (c?.keywords?.length || 0), 0);
          const expanded = kcExpandedPillarId === p.pillarId;

          return (
            <div
              key={p.pillarId}
style={{
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  background: "#fff",
  gridColumn: expanded ? "1 / -1" : "auto",   // expanded pillar becomes full-width
}}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 900 }}>
                    Pillar label (rename allowed — label-only)
                  </div>
                  <input
                    value={p.name || ""}
                    onChange={(e) => handleRenamePillarLabel(p.pillarId, e.target.value)}
                    disabled={keywordClusteringApproved}
                    style={{
                      ...inputStyle,
                      marginTop: 6,
                      padding: "8px 10px",
                      fontWeight: 900,
                    }}
                    title="Renaming is label-only; structure remains."
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setKcExpandedPillarId(expanded ? null : p.pillarId)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 900,
                    height: 40,
                  }}
                >
                  {expanded ? "Hide" : "View"}
                </button>
              </div>

              {p.description ? (
                <div style={{ marginTop: 8, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                  {p.description}
                </div>
              ) : null}

              <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                Keywords: <b style={{ color: "#111827" }}>{kwCount}</b>
              </div>

              {/* Expanded */}
              {expanded ? (
                <div style={{ marginTop: 12 }}>
                  {(p.clusters || []).map((c) => (
                    <div key={c.clusterId} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f3f4f6" }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: "#111827" }}>
                        Cluster: <span style={{ color: "#374151" }}>{c.name || "Cluster"}</span>{" "}
                        <span style={{ color: "#6b7280" }}>({c?.keywords?.length || 0})</span>
                      </div>

                      {/* Add keyword */}
                      {!keywordClusteringApproved ? (
                        <AddKeywordInline
                          onAdd={(val) => handleAddKeywordToCluster(p.pillarId, c.clusterId, val)}
                        />
                      ) : null}

                      <div style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ maxHeight: 240, overflow: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr>
                             {["Keyword", "Intent", "Vol", "Score", "Action"].map((h) => (
<th
  key={h}
  style={{
    textAlign: h === "Action" ? "right" : "left",
    width: h === "Action" ? 110 : "auto",
    padding: "8px 10px",
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
                              {(c.keywords || []).map((kw, i) => (
                                <tr key={`${kw.keyword}-${i}`}>
                                  <td style={{ padding: "8px 10px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#111827" }}>
                                    {kw.keyword}
                                    {kw.metricsStatus === "unavailable" ? (
                                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                                        Metrics unavailable (not faked)
                                      </div>
                                    ) : null}
                                  </td>
                                  <td style={{ padding: "8px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                                    {kw.intent || "—"}
                                  </td>
                                  <td style={{ padding: "8px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                                    {kw.volume != null ? Number(kw.volume) : "—"}
                                  </td>
                                  <td style={{ padding: "8px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                                    {kw.strategyScore != null ? Number(kw.strategyScore).toFixed(2) : "—"}
                                  </td>
                                 <td style={{ padding: "8px 10px", borderTop: "1px solid #f3f4f6", textAlign: "right" }}>
                                    {!keywordClusteringApproved ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveKeywordFromCluster(p.pillarId, c.clusterId, kw.keyword)}
                                        style={{
                                          padding: "6px 10px",
                                          borderRadius: 10,
                                          border: "1px solid #fecaca",
                                          background: "#fff1f2",
                                          color: "#9f1239",
                                          cursor: "pointer",
                                          fontWeight: 900,
                                          fontSize: 12,
                                        }}
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Shortlist view */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
          Shortlist (~90–110)
        </div>

        <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Keyword", "Pillar", "Cluster", "Volume", "Intent", "StrategyScore"].map((h) => (
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
                {(kcShortlist || []).map((row, idx) => (
                  <tr key={`${row.keyword}-${idx}`}>
                    <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#111827" }}>
                      {row.keyword}
                    </td>
                    <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                      {row.pillarName || "—"}
                    </td>
                    <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                      {row.clusterName || "—"}
                    </td>
                    <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                      {row.volume != null ? Number(row.volume) : "—"}
                    </td>
                    <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                      {row.intent || "—"}
                    </td>
                    <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                      {row.strategyScore != null ? Number(row.strategyScore).toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Excluded keywords (collapsed) */}
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => setKcExcludedOpen(!kcExcludedOpen)}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "white",
            cursor: "pointer",
            fontWeight: 900,
          }}
        >
          {kcExcludedOpen ? "Hide" : "Show"} Excluded Keywords (read-only)
        </button>

        {kcExcludedOpen ? (
          <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ maxHeight: 260, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Keyword", "Reason", "FitScore"].map((h) => (
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
                  {(kcAiExcluded || []).map((x, idx) => (
                    <tr key={`${x.keyword}-${idx}`}>
                      <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 13, color: "#111827" }}>
                        {x.keyword}
                      </td>
                      <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                        {(x.reasonTags || []).join(", ") || "—"}
                      </td>
                      <td style={{ padding: "10px 10px", borderTop: "1px solid #f3f4f6", fontSize: 12, color: "#374151" }}>
                        {x.businessFitScore != null ? Number(x.businessFitScore).toFixed(2) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  ) : (
    <div style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>
      {businessContextApproved
        ? "No Step 5 architecture generated yet for this website."
        : "Approve Step 4.5 to unlock Step 5."}
    </div>
  )}
</StepCard>

{/* >>> STEP 6 UI SHELL (START) */}
<StepCard
  id="step6"
  step="Step 6"
  title="Keyword-to-URL Mapping (Deployment Blueprint)"
  subtitle="Map shortlisted keywords to your existing audited pages, recommend gap pages, and produce a deployable SEO blueprint."
  statusTone={keywordMappingApproved ? "success" : "warning"}
  statusText={keywordMappingApproved ? "Approved" : "Not approved"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>


  {/* Gating message */}
  {keywordClusteringApproved !== true ? (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        border: "1px solid #fde68a",
        background: "#fffbeb",
        color: "#92400e",
        fontSize: 13,
        lineHeight: 1.5,
        fontWeight: 700,
      }}
    >
      Step 6 is locked. Please approve Step 5 (Keyword Architecture) first.
    </div>
  ) : (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        color: "#374151",
        fontSize: 13,
        lineHeight: 1.5,
        fontWeight: 700,
      }}
    >
      Step 6 is unlocked. Next we will add the “Generate Mapping” button and show the results here.
    </div>
  )}

  {/* Actions */}
  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>

    <button
      type="button"
      onClick={generateKeywordMapping}
      disabled={
        keywordClusteringApproved !== true ||
        keywordMappingApproved === true ||
        keywordMappingState === "generating" ||
        keywordMappingState === "loading"
      }
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #111827",
        cursor:
          keywordClusteringApproved !== true ||
          keywordMappingApproved === true ||
          keywordMappingState === "generating" ||
          keywordMappingState === "loading"
            ? "not-allowed"
            : "pointer",
        background:
          keywordClusteringApproved !== true || keywordMappingApproved === true
            ? "#f3f4f6"
            : "#111827",
        color:
          keywordClusteringApproved !== true || keywordMappingApproved === true
            ? "#6b7280"
            : "white",
        opacity: keywordMappingState === "generating" ? 0.7 : 1,
        fontWeight: 900,
      }}
      title={
        keywordClusteringApproved !== true
          ? "Approve Step 5 first"
          : keywordMappingApproved
          ? "Already approved and locked"
          : ""
      }
    >
      {keywordMappingState === "generating" ? "Generating…" : "Generate Mapping"}
    </button>
          <button
      type="button"
      onClick={saveKeywordMappingDraft}
      disabled={
        keywordClusteringApproved !== true ||
        keywordMappingExists !== true ||
        keywordMappingApproved === true ||
        kmDraftState === "saving"
      }
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #2563eb",
        cursor:
          keywordClusteringApproved !== true ||
          keywordMappingExists !== true ||
          keywordMappingApproved === true ||
          kmDraftState === "saving"
            ? "not-allowed"
            : "pointer",
        background:
          keywordClusteringApproved !== true ||
          keywordMappingExists !== true ||
          keywordMappingApproved === true
            ? "#f3f4f6"
            : "#eff6ff",
        color:
          keywordClusteringApproved !== true ||
          keywordMappingExists !== true ||
          keywordMappingApproved === true
            ? "#6b7280"
            : "#1d4ed8",
        opacity: kmDraftState === "saving" ? 0.7 : 1,
        fontWeight: 900,
      }}
      title={
        keywordClusteringApproved !== true
          ? "Approve Step 5 first"
          : keywordMappingExists !== true
          ? "Generate mapping first"
          : keywordMappingApproved
          ? "Already approved and locked"
          : ""
      }
    >
      {kmDraftState === "saving" ? "Saving…" : kmDraftState === "saved" ? "Draft Saved ✓" : "Save Draft"}
    </button>

    <button
      type="button"
      onClick={approveKeywordMapping}
      disabled={
        keywordClusteringApproved !== true ||
        keywordMappingExists !== true ||
        keywordMappingApproved === true ||
        kmApproveState === "approving"
      }
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #047857",
        cursor:
          keywordClusteringApproved !== true ||
          keywordMappingExists !== true ||
          keywordMappingApproved === true ||
          kmApproveState === "approving"
            ? "not-allowed"
            : "pointer",
        background:
          keywordClusteringApproved !== true ||
          keywordMappingExists !== true ||
          keywordMappingApproved === true
            ? "#f3f4f6"
            : "#ecfdf5",
        color:
          keywordClusteringApproved !== true ||
          keywordMappingExists !== true ||
          keywordMappingApproved === true
            ? "#6b7280"
            : "#047857",
        opacity: kmApproveState === "approving" ? 0.7 : 1,
        fontWeight: 900,
      }}
      title={
        keywordClusteringApproved !== true
          ? "Approve Step 5 first"
          : keywordMappingExists !== true
          ? "Generate mapping first"
          : keywordMappingApproved
          ? "Already approved and locked"
          : ""
      }
    >
      {kmApproveState === "approving" ? "Approving…" : "Approve Mapping"}
    </button>

    <div style={{ color: "#6b7280", fontSize: 13 }}>
      Status:{" "}
      <b style={{ color: keywordMappingExists ? "#065f46" : "#111827" }}>
        {keywordMappingExists ? "Generated" : "Not generated yet"}
      </b>
    </div>
  </div>
  {kmApproveWarning ? (
    <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
      {kmApproveWarning}
    </div>
  ) : null}
  {kmDraftError ? (
    <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 13 }}>
      {kmDraftError}
    </div>
  ) : null}


  {keywordMappingError ? (
    <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
      {keywordMappingError}
    </div>
  ) : null}

  {/* Results */}
  {keywordMappingExists ? (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          padding: 12,
          borderRadius: 12,
          border: "1px solid #f3f4f6",
          background: "#fafafa",
          color: "#374151",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 900, color: "#111827" }}>Mapping Summary</div>

<div style={{ marginTop: 6 }}>
  Existing pages mapped:{" "}
  <b>{Array.isArray(kmExistingPages) ? kmExistingPages.length : 0}</b>
  {" "}• Gap pages recommended:{" "}
  <b>{Array.isArray(kmGapPages) ? kmGapPages.length : 0}</b>
</div>

<div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
  Total shortlisted:{" "}
  <b>{kmDeploymentStats?.totalShortlisted ?? "—"}</b>
  {" "}• Mapped to existing:{" "}
  <b>{kmDeploymentStats?.mappedToExisting ?? "—"}</b>
  {" "}• New pages suggested:{" "}
  <b>{kmDeploymentStats?.suggestedNewPages ?? "—"}</b>
  {" "}• Coverage:{" "}
  <b>
    {kmDeploymentStats?.coveragePercentage != null
      ? `${Number(kmDeploymentStats.coveragePercentage).toFixed(0)}%`
      : "—"}
  </b>
</div>
</div>


      {/* Existing Pages */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
          Existing Pages (with assigned keywords)
        </div>

        {Array.isArray(kmExistingPages) && kmExistingPages.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              background: "transparent",
            }}
          >

{kmExistingPages.map((row, idx) => {
  const p = row;
  const confidence = Number(p?.mappingConfidence ?? 0);


              const confBg =
                confidence >= 75 ? "#ecfdf5" : confidence >= 55 ? "#fffbeb" : "#fef2f2";
              const confColor =
                confidence >= 75 ? "#047857" : confidence >= 55 ? "#b45309" : "#b91c1c";

              return (
                <div
                  key={`${p?.url || "url"}-${idx}`}
                  style={{
                    padding: 18,
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    background: "white",
                    boxShadow: "0 1px 2px rgba(16, 24, 40, 0.06)",
                  }}


                >
                  {/* Row 1: URL + Primary + Secondary */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: 14,
                      alignItems: "start",
                    }}
                  >
                    {/* URL */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
                        URL
                      </div>

                      <a
                        href={p?.url || "#"}
                        target="_blank"
                        rel="noreferrer"
                         style={{
                          display: "block",
                          marginTop: 6,
                          fontSize: 13,
                          fontWeight: 700,
                          color: HOUSE.primaryBlue,
                          textDecoration: "none",
                          wordBreak: "break-word",
                          lineHeight: 1.35,
                        }}
                        title={p?.url || ""}

                      >
                        {p?.url || "—"}
                      </a>
                    </div>

                    {/* Primary */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
                        Primary keyword (unique)
                      </div>


                      {keywordMappingApproved ? (
                        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#111827" }}>
                          {p?.primaryKeyword?.keyword || "—"}
                        </div>
                      ) : (
                        <select
                          value={p?.primaryKeyword?.keyword || ""}
                          onChange={(e) => updateExistingPrimary(idx, e.target.value)}
                          style={{
                            width: "100%",
                            marginTop: 6,
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "white",
                            fontSize: 13,
                            fontWeight: 900,
                            color: "#111827",
                          }}
                        >
<option value="">— No primary —</option>
                          {(Array.isArray(kcShortlist) ? kcShortlist : [])
                            .map((k) => (typeof k === "string" ? k : k?.keyword))
                            .filter(Boolean)
                            .map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}

                        </select>
                      )}

                      <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                        Note: this does not recompute similarity; it only changes assignment.
                      </div>
                    </div>

                    {/* Secondary */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
                        Secondary keywords (optional)
                      </div>

                      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
{Array.isArray(p?.secondaryKeywords) && p.secondaryKeywords.length ? (
  p.secondaryKeywords
    .map((sk) => (typeof sk === "string" ? sk : sk?.keyword))
    .filter(Boolean)
    .map((sk, sIdx) => (
      <span
        key={`${sk}-${sIdx}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 10px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#f8fafc",
          fontSize: 12,
                                      fontWeight: 700,
                            color: "#111827",
        }}
      >
        {sk}
        {!keywordMappingApproved ? (
          <button
            type="button"
            onClick={() => removeExistingSecondary(idx, sk)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 700,
              color: "#6b7280",
            }}
            title="Remove"
          >
            ×
          </button>
        ) : null}
      </span>
    ))
) : (
	  <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>
	    No secondary keywords
	  </div>

)}

                      </div>

                      {!keywordMappingApproved ? (
                        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <select
                            value={existingSecondaryDraft?.[idx] || ""}
                            onChange={(e) =>
                              setExistingSecondaryDraft((prev) => ({
                                ...(prev || {}),
                                [idx]: e.target.value,
                              }))
                            }
                            style={{
                              flex: "1 1 240px",
                              minWidth: 220,
                              padding: "10px 10px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "white",
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#111827",
                            }}
                          >
                            <option value="">— Add secondary —</option>
{(Array.isArray(kcShortlist) ? kcShortlist : [])
  .map((k) => (typeof k === "string" ? k : k?.keyword))
  .filter(Boolean)
  .filter((k) => k !== (p?.primaryKeyword?.keyword || ""))
  .filter(
  (k) =>
    !((p?.secondaryKeywords || [])
      .map((x) => (typeof x === "string" ? x : x?.keyword))
      .filter(Boolean)
      .includes(k))
)

  .map((k) => (
    <option key={k} value={k}>
      {k}
    </option>
  ))}

                          </select>

                          <button
                            type="button"
                            onClick={() => addExistingSecondary(idx)}
                            style={{
                              padding: "10px 14px",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "white",
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Add
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Row 2: Pillar + Confidence + Internal Links */}
                  <div
                    style={{
                      marginTop: 14,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 12,
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>Pillar</div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900, color: "#111827" }}>
                        {p?.pillar || "—"}
                      </div>
                      {p?.cluster ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                          Cluster: <b style={{ color: "#111827" }}>{p.cluster}</b>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>Confidence</div>
                      <div style={{ marginTop: 8 }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid #e5e7eb",
                            background: confBg,
                            color: confColor,
                            fontWeight: 900,
                            fontSize: 12,
                          }}
                        >
                          {Number.isFinite(confidence) ? `${confidence}%` : "—"}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
                        Internal links
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900, color: "#111827" }}>
                        {Array.isArray(p?.internalLinkTargets) && p.internalLinkTargets.length
                          ? `${p.internalLinkTargets.length} targets`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>
            No existing pages found in mapping.
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
          Gap Pages (recommended new pages)
        </div>


{(kmGapPages || []).length ? (
  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
    {(kmGapPages || []).map((g, idx) => {
      const accepted = g?.accepted ?? true;

      return (
        <div
          key={`${g?.suggestedSlug || g?.primaryKeyword || "gap"}-${idx}`}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            background: accepted ? "white" : "#fafafa",
            opacity: accepted ? 1 : 0.75,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: "#111827" }}>
                {g?.suggestedTitle || "—"}
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                Primary: <b style={{ color: "#111827" }}>{g?.primaryKeyword || "—"}</b>
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                Pillar: <b style={{ color: "#111827" }}>{g?.pillar || "—"}</b>
              </div>

<div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
  {/* Slug */}
  <div>
    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, marginBottom: 6 }}>
      Slug
    </div>

    {keywordMappingApproved ? (
      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
        {g?.suggestedSlug || "—"}
      </div>
    ) : (
      <input
        value={g?.suggestedSlug || ""}
        onChange={(e) => setGapFieldAtIndex(idx, "suggestedSlug", e.target.value)}
        placeholder="/example-slug/"
        style={{
          width: "100%",
          padding: "10px 10px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
          fontSize: 13,
          fontWeight: 900,
          color: "#111827",
        }}
      />
    )}
  </div>

  {/* Page Type */}
  <div>
    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, marginBottom: 6 }}>
      Page Type
    </div>

    {keywordMappingApproved ? (
      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
        {g?.pageType || "—"}
      </div>
    ) : (
      <select
        value={g?.pageType || ""}
        onChange={(e) => setGapFieldAtIndex(idx, "pageType", e.target.value)}
        style={{
          width: "100%",
          padding: "10px 10px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
          fontSize: 13,
          fontWeight: 900,
          color: "#111827",
        }}
      >
        <option value="">— Select —</option>
        <option value="Core Service Page">Core Service Page</option>
        <option value="Service / Comparison Page">Service / Comparison Page</option>
        <option value="Pillar Guide">Pillar Guide</option>
        <option value="Supporting Blog">Supporting Blog</option>
        <option value="Location Page">Location Page</option>
      </select>
    )}
  </div>

  {/* Word Count */}
  <div>
    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, marginBottom: 6 }}>
      Word Count
    </div>

    {keywordMappingApproved ? (
      <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
        {g?.recommendedWordCount ?? "—"}
      </div>
    ) : (
      <input
        type="number"
        value={g?.recommendedWordCount ?? ""}
        onChange={(e) =>
          setGapFieldAtIndex(
            idx,
            "recommendedWordCount",
            e.target.value === "" ? "" : Number(e.target.value)
          )
        }
        placeholder="1200"
        style={{
          width: "100%",
          padding: "10px 10px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
          fontSize: 13,
          fontWeight: 900,
          color: "#111827",
        }}
      />
    )}
  </div>
</div>

              <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                Secondary:{" "}
                <b style={{ color: "#111827" }}>
                  {Array.isArray(g?.secondaryKeywords) && g.secondaryKeywords.length
                    ? g.secondaryKeywords.join(", ")
                    : "—"}
                </b>
              </div>
            </div>

            <div style={{ width: 220 }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, marginBottom: 8 }}>
                Recommendation
              </div>

              {keywordMappingApproved ? (
                <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
                  {accepted ? "Accepted" : "Rejected"}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGapAccepted(idx)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: accepted ? "#ecfdf5" : "#fef2f2",
                    color: accepted ? "#047857" : "#b91c1c",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                  title={accepted ? "Click to reject this gap page" : "Click to accept this gap page"}
                >
                  {accepted ? "Accepted ✓ (click to reject)" : "Rejected ✕ (click to accept)"}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    })}
  </div>
) : (
  <div style={{ marginTop: 8, color: "#6b7280", fontSize: 13 }}>No gap pages found in mapping.</div>
)}

      </div>
    </div>
  ) : (
    <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
      No mapping generated yet for this website.
    </div>
  )}
</StepCard>

      </div>
    </VyndowShell>
  );
}

