"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  deleteDoc,
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
        style={{
          ...inputStyle,
          maxWidth: 440,
          padding: "9px 10px",
          border: `1px solid rgba(30,102,255,0.28)`,
          background: "rgba(30,102,255,0.04)",
          boxShadow: "0 0 0 3px rgba(30,102,255,0.06)",
        }}
        title="Add a relevant keyword to this cluster."
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
          border: `1px solid ${HOUSE.primaryBlue}`,
          background: "white",
          color: HOUSE.primaryBlue,
          cursor: "pointer",
          fontWeight: 900,
        }}
        title="Add keyword"
      >
        Add
      </button>
      <div style={{ fontSize: 12, color: HOUSE.subtext }}>
        Metrics may be unavailable in some cases. We always report only the facts, never made up numbers.
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

// Step 2 lock enforcement (Sprint 1)
const [pageDiscoveryLocked, setPageDiscoveryLocked] = useState(false); // canonical: pageDiscovery.locked === true
const [pageDiscoveryLockedAt, setPageDiscoveryLockedAt] = useState(null);
	const [pageDiscoveryAuditLocked, setPageDiscoveryAuditLocked] = useState(false); // canonical: pageDiscovery.auditLocked === true
const [pageDiscoveryAuditLockedAt, setPageDiscoveryAuditLockedAt] = useState(null);


const [lockUrlsState, setLockUrlsState] = useState("idle"); // idle | locking | locked | error
const [lockUrlsError, setLockUrlsError] = useState("");

const [resetUrlsState, setResetUrlsState] = useState("idle"); // idle | resetting | done | error
const [resetUrlsError, setResetUrlsError] = useState("");

// =========================

// Step 3 — Pure On-Page Audit (run + resume)
// Firestore:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/auditResults/{urlId}
// =========================
const [auditRunState, setAuditRunState] = useState("idle"); // idle | running | done | error
const [auditConfirmState, setAuditConfirmState] = useState("idle"); // idle | confirming | done | error
const [auditConfirmError, setAuditConfirmError] = useState("");

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
	// Keyword generation limits: 2 total runs per website (1 regeneration allowed)
const keywordPoolGenerationCount = keywordPoolMeta?.generationCount || 0;
const keywordPoolRemaining = Math.max(0, 2 - keywordPoolGenerationCount);
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
	const [kcExplainOpen, setKcExplainOpen] = useState(false);

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
	const [kmExplainOpen, setKmExplainOpen] = useState(false);

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
// =========================
// Step 7 — Page Optimization Blueprint (resume-safe)
// Firestore:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/pageOptimization
// =========================
const [pageOptimizationState, setPageOptimizationState] = useState("idle"); // idle | loading | generating | ready | error
const [pageOptimizationError, setPageOptimizationError] = useState("");
const [pageOptimizationExists, setPageOptimizationExists] = useState(false);

const [poLocked, setPoLocked] = useState(false);
const [poAllPagesApproved, setPoAllPagesApproved] = useState(false);

const [poPages, setPoPages] = useState({}); // { [pageId]: pageData }
const [poActivePageId, setPoActivePageId] = useState("");
	const [poGenTotal, setPoGenTotal] = useState(0);
const [poGenDone, setPoGenDone] = useState(0);
const [poGenLastMessage, setPoGenLastMessage] = useState("");
	const [poGenStatus, setPoGenStatus] = useState("");

const [poSaveState, setPoSaveState] = useState("idle"); // idle | saving | saved | error
const [poSaveError, setPoSaveError] = useState("");
	const [poExportState, setPoExportState] = useState("idle"); // idle | exporting | error
const [poExportError, setPoExportError] = useState("");
// =========================
// Step 8A — Authority Plan (resume-safe)
// Firestore:
// users/{effectiveUid}/websites/{effectiveWebsiteId}/modules/seo/strategy/authorityPlan
// =========================
const [authorityPlanState, setAuthorityPlanState] = useState("idle"); // idle | loading | generating | ready | error
const [authorityPlanError, setAuthorityPlanError] = useState("");
const [authorityPlanExists, setAuthorityPlanExists] = useState(false);

const [authorityPlanLocked, setAuthorityPlanLocked] = useState(false);

const [authorityRecommendedTotal, setAuthorityRecommendedTotal] = useState(0);
const [authorityAdjustedTotal, setAuthorityAdjustedTotal] = useState(0);
const [authoritySliderMin, setAuthoritySliderMin] = useState(0);
const [authoritySliderMax, setAuthoritySliderMax] = useState(0);

const [authorityGeoMode, setAuthorityGeoMode] = useState("");
const [authorityLocationName, setAuthorityLocationName] = useState("");
const [authorityLanguageCode, setAuthorityLanguageCode] = useState("");

const [authorityPillarAllocations, setAuthorityPillarAllocations] = useState([]);
const [authorityMonths, setAuthorityMonths] = useState({ month1: [], month2: [], month3: [] });
const [authorityReasoning, setAuthorityReasoning] = useState({ bullets: [], notes: "" });

const [authorityActiveMonth, setAuthorityActiveMonth] = useState(1);
const [authorityFilterPillar, setAuthorityFilterPillar] = useState("all");
const [authoritySearch, setAuthoritySearch] = useState("");
	// =========================
// Step 8B — Blog Draft Bridge (UI-only state)
// =========================
const [blogDraftCreatingRowId, setBlogDraftCreatingRowId] = useState(null);
const [blogDraftRowErrors, setBlogDraftRowErrors] = useState({}); // { [rowId]: "error" }



const poSaveTimerRef = useRef(null);
const poLastSavedAtRef = useRef(0);






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

  // Step 1 form fields (MUST be declared before we compute isStep1Valid)
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [geography, setGeography] = useState("");
  const [revenueGoal, setRevenueGoal] = useState("");
  const [averageOrderValue, setAverageOrderValue] = useState("");
  const [primaryOffer, setPrimaryOffer] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [competitorsRaw, setCompetitorsRaw] = useState("");

  // Step 1 → Step 2 hard gate

  // Step 1 is "valid" only if required existing fields are filled (trimmed)
  const isStep1Valid =
    String(businessName || "").trim().length > 0 &&
    String(industry || "").trim().length > 0 &&
    String(geography || "").trim().length > 0 &&
    String(primaryOffer || "").trim().length > 0 &&
    String(targetCustomer || "").trim().length > 0;

  // Step 1 is considered "saved/completed" ONLY when:
  // 1) Firestore draft exists AND 2) required fields are valid
  const step1Saved = profileExists === true && isStep1Valid;

  const [stepGateError, setStepGateError] = useState("");

  // Clear gate error automatically once Step 1 is saved
  useEffect(() => {
    if (step1Saved) setStepGateError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step1Saved]);

  // Guard Step 2 accordion open
  const setOpenStepWithStep1Gate = (next) => {
    if (next === "step2" && !step1Saved) {
      setStepGateError("Complete Step 1 first.");
      return;
    }
    setStepGateError("");
    setOpenStep(next);
  };

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
  setKeywordPoolLocked((d?.generationCount || 0) >= 2);
  setKeywordPoolMeta({
    generatedAt: d?.generatedAt ? safeToDate(d.generatedAt) : null,
	  generationCount: d?.generationCount || 0,
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
 if (keywordPoolRemaining === 0) return;

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
	// =========================
// Step 7 — Firestore docRef + loader (resume-safe)
// =========================
function pageOptimizationDocRef() {
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
    "pageOptimization"
  );
}
	// =========================
// Step 8A — Firestore docRef + loader (resume-safe)
// =========================
function authorityPlanDocRef() {
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
    "authorityPlan"
  );
}

function hydrateAuthorityPlanFromDoc(d) {
  const data = d || {};

  setAuthorityPlanExists(true);
  setAuthorityPlanLocked(data.locked === true);

  setAuthorityGeoMode(String(data.geoMode ?? ""));
  setAuthorityLocationName(String(data.location_name ?? ""));
  setAuthorityLanguageCode(String(data.language_code ?? ""));

  setAuthorityRecommendedTotal(Number(data.recommendedTotalBlogs || 0));
  setAuthorityAdjustedTotal(Number(data.adjustedTotalBlogs || 0));
  setAuthoritySliderMin(Number(data.sliderMin || 0));
  setAuthoritySliderMax(Number(data.sliderMax || 0));

  setAuthorityPillarAllocations(Array.isArray(data.pillarAllocations) ? data.pillarAllocations : []);

  const m = data.months && typeof data.months === "object" ? data.months : {};
  setAuthorityMonths({
    month1: Array.isArray(m.month1) ? m.month1 : [],
    month2: Array.isArray(m.month2) ? m.month2 : [],
    month3: Array.isArray(m.month3) ? m.month3 : [],
  });

  const r = data.reasoningSummary && typeof data.reasoningSummary === "object" ? data.reasoningSummary : {};
  setAuthorityReasoning({
    bullets: Array.isArray(r.bullets) ? r.bullets : [],
    notes: String(r.notes ?? ""),
  });

  setAuthorityPlanState("ready");
  setAuthorityPlanError("");
}

async function loadExistingAuthorityPlan() {
  try {
    setAuthorityPlanState("loading");
    setAuthorityPlanError("");

    const ref = authorityPlanDocRef();
    if (!ref) {
      setAuthorityPlanState("idle");
      return;
    }

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      setAuthorityPlanExists(false);
      setAuthorityPlanLocked(false);

      setAuthorityRecommendedTotal(0);
      setAuthorityAdjustedTotal(0);
      setAuthoritySliderMin(0);
      setAuthoritySliderMax(0);

      setAuthorityPillarAllocations([]);
      setAuthorityMonths({ month1: [], month2: [], month3: [] });
      setAuthorityReasoning({ bullets: [], notes: "" });

      setAuthorityPlanState("idle");
      return;
    }

    hydrateAuthorityPlanFromDoc(snap.data() || {});
  } catch (e) {
    console.error("loadExistingAuthorityPlan error:", e);
    setAuthorityPlanState("error");
    setAuthorityPlanError(e?.message || "Failed to load Step 8A authorityPlan.");
  }
}
async function generateOrUpdateAuthorityPlan({ useAdjustedTotal }) {
  try {
    // Gate on UI also (backend will enforce again)
    const gateOk =
      businessContextApproved === true &&
      keywordClusteringApproved === true &&
      keywordMappingApproved === true &&
      poLocked === true;

    if (!gateOk) {
      setAuthorityPlanState("error");
      setAuthorityPlanError("Step 8A is locked until Steps 4.5, 5, 6 are approved and Step 7 is locked.");
      return;
    }

    if (authorityPlanLocked === true) {
      setAuthorityPlanState("error");
      setAuthorityPlanError("This plan is locked and cannot be regenerated.");
      return;
    }

    setAuthorityPlanState("generating");
    setAuthorityPlanError("");

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Missing login token.");

    const res = await fetch("/api/seo/strategy/generateAuthorityPlan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        websiteId: selectedWebsiteId,
        adjustedTotalBlogs: useAdjustedTotal ? authorityAdjustedTotal : null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Failed to generate Step 8A plan.");
    }

    // Always re-load from Firestore
    await loadExistingAuthorityPlan();
    setAuthorityPlanState("ready");
  } catch (e) {
    console.error("generateOrUpdateAuthorityPlan error:", e);
    setAuthorityPlanState("error");
    setAuthorityPlanError(e?.message || "Failed to generate Step 8A plan.");
  }
}
// =========================
// Step 8B — Create Blog Draft + Redirect to /seo
// =========================
async function createBlogDraftAndOpenSeo(row) {
  try {
    const rowId = String(
      row?.id ||
        `${authorityActiveMonth}|${row?.pillarName || ""}|${row?.primaryKeyword || ""}|${row?.blogTitle || ""}`
    );

    // Hard gates (UI): must have a website selected + Step 8A plan exists
    if (!selectedWebsiteId) throw new Error("Please select a website first.");
    if (authorityPlanExists !== true) throw new Error("Please generate Step 8A plan first.");

    setBlogDraftCreatingRowId(rowId);
    setBlogDraftRowErrors((prev) => ({ ...prev, [rowId]: "" }));

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Missing login token.");

    const month = Number(authorityActiveMonth || 1);

    const payload = {
      websiteId: selectedWebsiteId,
      month,
      pillarName: row?.pillarName || "",
      blogTitle: row?.blogTitle || "",
      slug: row?.slug || "",
      intent: row?.intent || "",
      targetAudience: row?.targetAudience || "",
      synopsis: row?.synopsis || "",
      primaryKeyword: row?.primaryKeyword || "",
      secondaryKeywords: Array.isArray(row?.secondaryKeywords) ? row.secondaryKeywords : [],
      internalLinks: Array.isArray(row?.internalLinkTargets) ? row.internalLinkTargets : [],
      ctaFocus: row?.ctaFocus || "",
      impactTag: row?.impactTag || "",
    };

    const res = await fetch("/api/seo/strategy/createBlogDraft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Failed to create blog draft.");
    }

    const draftId = String(data?.draftId || "").trim();
    if (!draftId) throw new Error("Draft created but draftId missing.");

    // Redirect user into the existing /seo generator flow with draftId
    router.push(`/seo?draftId=${encodeURIComponent(draftId)}&from=strategy`);
  } catch (e) {
    const rowId = String(
      row?.id ||
        `${authorityActiveMonth}|${row?.pillarName || ""}|${row?.primaryKeyword || ""}|${row?.blogTitle || ""}`
    );
    const msg = e?.message || "Failed to create blog draft.";
    if (rowId) {
      setBlogDraftRowErrors((prev) => ({ ...prev, [rowId]: msg }));
    }
  } finally {
    setBlogDraftCreatingRowId(null);
  }
}


function hydratePageOptimizationFromDoc(d) {
  const data = d || {};
  const pages = data.pages && typeof data.pages === "object" ? data.pages : {};

  setPageOptimizationExists(true);
  setPoLocked(data.locked === true);
  setPoAllPagesApproved(data.allPagesApproved === true);

  setPoPages(pages);
	  // Hydrate generation counters/status so UI can correctly show "done" without refresh
  const gen = data.generation && typeof data.generation === "object" ? data.generation : {};
  const pagesCount = Object.keys(pages || {}).length;

  const total =
    typeof gen.totalPages === "number" && Number.isFinite(gen.totalPages)
      ? gen.totalPages
      : pagesCount;

  const done =
    typeof gen.donePages === "number" && Number.isFinite(gen.donePages)
      ? gen.donePages
      : pagesCount;

  const status = typeof gen.status === "string" ? gen.status : "";

  setPoGenTotal(total);
  setPoGenDone(done);
  setPoGenStatus(status);

  // pick a stable active page
  const keys = Object.keys(pages);
  if (keys.length) {
    setPoActivePageId((prev) => (prev && pages[prev] ? prev : keys[0]));
  } else {
    setPoActivePageId("");
  }

  if (pageOptimizationState !== "generating") {
  setPageOptimizationState("ready");
}
  setPageOptimizationError("");
}

async function loadExistingPageOptimization() {
  try {
    if (pageOptimizationState !== "generating") {
  setPageOptimizationState("loading");
}
    setPageOptimizationError("");

    const ref = pageOptimizationDocRef();
    if (!ref) {
      setPageOptimizationState("idle");
      return;
    }

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      setPageOptimizationExists(false);
      setPoLocked(false);
      setPoAllPagesApproved(false);
      setPoPages({});
      setPoActivePageId("");
      setPageOptimizationState("idle");
      return;
    }

    hydratePageOptimizationFromDoc(snap.data() || {});
  } catch (e) {
    console.error("loadExistingPageOptimization error:", e);
    setPageOptimizationState("error");
    setPageOptimizationError(e?.message || "Failed to load Step 7 pageOptimization.");
  }
}
async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(String(str || "")));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeUrlForId(u) {
  try {
    const url = new URL(String(u));
    if (!(url.protocol === "http:" || url.protocol === "https:")) return null;
    url.hash = "";
    url.search = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function pageIdFromExistingUrl(u) {
  const nu = normalizeUrlForId(u);
  if (!nu) return null;
  const hex = await sha256Hex(nu);
  return hex.slice(0, 24);
}

async function pageIdFromGap(slug, primaryKeyword) {
  const basis = `gap|${String(slug || "")}|${String(primaryKeyword || "")}`;
  const hex = await sha256Hex(basis);
  return `gap_${hex.slice(0, 24)}`;
}
	
async function generatePageOptimization() {
  try {
    if (keywordMappingApproved !== true) {
      setPageOptimizationState("error");
      setPageOptimizationError("Step 7 is locked. Please approve Step 6 (Keyword Mapping) first.");
      return;
    }

    setPageOptimizationState("generating");
    setPageOptimizationError("");
    setPoGenLastMessage("");

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Missing login token.");

    // Build a full list of pageIds to generate (existing + accepted gap)
    const all = [];

    // Resume-safe: treat ONLY real blueprint objects as "already generated"
    const alreadyGeneratedIds = new Set(
      Object.entries(poPages || {})
        .filter(([_, v]) => {
          if (!v || typeof v !== "object") return false;
          const hasCore =
            Boolean((v.title || "").trim()) ||
            Boolean((v.metaDescription || "").trim()) ||
            Boolean((v.h1 || "").trim()) ||
            Array.isArray(v.contentBlocks) ||
            v.approved === true;
          return hasCore;
        })
        .map(([k]) => k)
    );

    // UX scaffold: show meaningful page cards immediately (NO Firestore reads in loop)
    let scaffoldPages = { ...(poPages || {}) };

    for (const p of kmExistingPages || []) {
      const id = await pageIdFromExistingUrl(p?.url);
      if (!id) continue;

      const pk = getPrimaryKeywordString(p);
      const existing = scaffoldPages[id];

      const hasRealBlueprint =
        existing &&
        typeof existing === "object" &&
        (Boolean((existing.title || "").trim()) ||
          Boolean((existing.metaDescription || "").trim()) ||
          Boolean((existing.h1 || "").trim()) ||
          Array.isArray(existing.contentBlocks));

      if (!hasRealBlueprint) {
        scaffoldPages[id] = {
          ...(existing && typeof existing === "object" ? existing : {}),
          pageId: id,
          pageSource: "existing",
          pageType: "existing",
          url: String(p?.url || existing?.url || "").trim(),
          primaryKeyword: String(pk || existing?.primaryKeyword || "").trim(),
          _isGenerating: false,
          _isDone: existing?._isDone === true,
        };
      } else {
        // Keep real blueprint, but ensure basic labels exist for the card
        scaffoldPages[id] = {
          ...(existing || {}),
          pageId: id,
          pageSource: existing?.pageSource || "existing",
          pageType: existing?.pageType || "existing",
          url: String(existing?.url || p?.url || "").trim(),
          primaryKeyword: String(existing?.primaryKeyword || pk || "").trim(),
        };
      }

      all.push({ pageId: id, pageSource: "existing" });
    }

    for (const g of kmGapPages || []) {
      if (g?.accepted === false) continue;

      const id = await pageIdFromGap(g?.suggestedSlug, g?.primaryKeyword);
      if (!id) continue;

      const slug = String(g?.suggestedSlug || "").trim();
      const slugPath = slug ? `/${slug.replace(/^\/+/, "")}` : "";
      const pk = String(g?.primaryKeyword || "").trim();
      const existing = scaffoldPages[id];

      const hasRealBlueprint =
        existing &&
        typeof existing === "object" &&
        (Boolean((existing.title || "").trim()) ||
          Boolean((existing.metaDescription || "").trim()) ||
          Boolean((existing.h1 || "").trim()) ||
          Array.isArray(existing.contentBlocks));

      if (!hasRealBlueprint) {
        scaffoldPages[id] = {
          ...(existing && typeof existing === "object" ? existing : {}),
          pageId: id,
          pageSource: "gap",
          pageType: "gap",
          url: String(existing?.url || slugPath || "").trim(),
          slug: String(existing?.slug || slug || "").trim(),
          primaryKeyword: String(existing?.primaryKeyword || pk || "").trim(),
          _isGenerating: false,
          _isDone: existing?._isDone === true,
        };
      } else {
        scaffoldPages[id] = {
          ...(existing || {}),
          pageId: id,
          pageSource: existing?.pageSource || "gap",
          pageType: existing?.pageType || "gap",
          url: String(existing?.url || slugPath || "").trim(),
          slug: String(existing?.slug || slug || "").trim(),
          primaryKeyword: String(existing?.primaryKeyword || pk || "").trim(),
        };
      }

      all.push({ pageId: id, pageSource: "gap" });
    }

    // Push scaffold to UI so cards are never blank during generation
    setPoPages(scaffoldPages);

    // pick a stable active page for the right-side panel, if none selected yet
    if (!poActivePageId) {
      const keys = Object.keys(scaffoldPages || {});
      if (keys.length) setPoActivePageId(keys[0]);
    }

    const total = all.length;
    setPoGenTotal(total);

    // Skip already-generated pages (resume-safe)
    const remaining = all.filter((x) => !alreadyGeneratedIds.has(x.pageId));

    const doneStart = total - remaining.length;
    setPoGenDone(doneStart);

    if (remaining.length === 0) {
      setPoGenLastMessage("All pages are already generated.");
      await loadExistingPageOptimization();
      setPageOptimizationState("ready");
      return;
    }

    // Generate sequentially, one page at a time
    let done = doneStart;

    // Track locally during loop — DO NOT reload Firestore mid-loop
    let localPages = { ...(scaffoldPages || {}) };

    for (const item of remaining) {
      setPoGenLastMessage(`Generating ${done + 1} / ${total}…`);
		      // Mark the current page as "Generating…" in the UI scaffold (no Firestore reads)
      localPages = {
        ...localPages,
        [item.pageId]: { ...(localPages?.[item.pageId] || {}), _isGenerating: true },
      };
      setPoPages(localPages);

      const res = await fetch("/api/seo/strategy/generatePageOptimization", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          websiteId: selectedWebsiteId,
          pageId: item.pageId,
          pageSource: item.pageSource,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate page optimization (single-page).");
      }

      done += 1;
      setPoGenDone(done);

      // Mark this page as completed in the UI scaffold (no Firestore reads)
      localPages = {
        ...localPages,
        [item.pageId]: { ...(localPages?.[item.pageId] || {}), _isGenerating: false, _isDone: true },
      };
      setPoPages(localPages);
    }

    // Single Firestore refresh AFTER loop completes
    await loadExistingPageOptimization();

    setPoGenLastMessage(`Done: ${total} / ${total}`);
    setPageOptimizationState("ready");
} catch (e) {
  console.error("generatePageOptimization error:", e);
  setPageOptimizationState("ready");
  setPageOptimizationError(e?.message || "Failed to generate Step 7 blueprint.");
  setPoGenLastMessage("Stopped. You can resume generation.");
  await loadExistingPageOptimization();
}
}

function computePageStatus(p) {
  // Local scaffold statuses during generation (UI-only)
  if (p?._isGenerating === true) return { tone: "warning", text: "Generating…" };
  if (p?._isDone === true && p?.approved !== true) return { tone: "neutral", text: "Draft Ready" };

  if (!p) return { tone: "warning", text: "Draft" };
  if (p.approved === true) return { tone: "success", text: "Approved" };
  const ok = Boolean((p.title || "").trim()) && Boolean((p.metaDescription || "").trim()) && Boolean((p.h1 || "").trim());
  return ok ? { tone: "neutral", text: "Optimized" } : { tone: "warning", text: "Draft" };
}

function buildStep7SavePayloadFromPage(p) {
  const page = p || {};

  // IMPORTANT: do not send schema json back; server ignores it but keep payload clean.
  const schemaSuggestions = Array.isArray(page.schemaSuggestions)
    ? page.schemaSuggestions.map((s) => ({ type: s?.type, status: s?.status }))
    : [];

  const advisoryBlocks = Array.isArray(page.advisoryBlocks)
    ? page.advisoryBlocks.map((a) => ({ message: a?.message, rationale: a?.rationale, status: a?.status }))
    : [];

  const contentBlocks = Array.isArray(page.contentBlocks)
    ? page.contentBlocks.map((c) => ({ heading: c?.heading, status: c?.status }))
    : [];

  return {
    title: page.title || "",
    metaDescription: page.metaDescription || "",
    h1: page.h1 || "",
    h2Structure: Array.isArray(page.h2Structure) ? page.h2Structure : [],
    internalLinks: Array.isArray(page.internalLinks) ? page.internalLinks : [],
    advisoryBlocks,
    schemaSuggestions,
    contentBlocks,
  };
}

function scheduleStep7Autosave(pageId) {
  try {
    if (!pageId) return;
    if (poLocked === true) return;

    const current = poPages?.[pageId];
    if (!current) return;
    if (current.approved === true) return;

    // debounce 700ms
    if (poSaveTimerRef.current) {
      clearTimeout(poSaveTimerRef.current);
      poSaveTimerRef.current = null;
    }

    setPoSaveState("saving");
    setPoSaveError("");

    poSaveTimerRef.current = setTimeout(async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error("Missing login token.");

        const payload = buildStep7SavePayloadFromPage(poPages?.[pageId] || {});
        const res = await fetch("/api/seo/strategy/savePageOptimizationDraft", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            websiteId: selectedWebsiteId,
            action: "autosave",
            pageId,
            ...payload,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Auto-save failed.");

        poLastSavedAtRef.current = Date.now();
        setPoSaveState("saved");
      } catch (e) {
        console.error("Step 7 autosave error:", e);
        setPoSaveState("error");
        setPoSaveError(e?.message || "Auto-save failed.");
      }
    }, 700);
  } catch (e) {
    console.error("scheduleStep7Autosave error:", e);
  }
}

async function approveStep7Page(pageId) {
  try {
    if (!pageId) return;
    if (poLocked === true) return;

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Missing login token.");

    const res = await fetch("/api/seo/strategy/savePageOptimizationDraft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        websiteId: selectedWebsiteId,
        action: "approvePage",
        pageId,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Approve page failed.");

    // optimistic UI update
    setPoPages((prev) => ({
      ...(prev || {}),
      [pageId]: { ...(prev?.[pageId] || {}), approved: true, approvedAt: new Date() },
    }));

    // reload to pick up allPagesApproved flag accurately
    await loadExistingPageOptimization();
  } catch (e) {
    console.error("approveStep7Page error:", e);
    setPoSaveState("error");
    setPoSaveError(e?.message || "Failed to approve page.");
  }
}

async function lockStep7() {
  try {
    if (poLocked === true) return;
    if (poAllPagesApproved !== true) {
      setPoSaveState("error");
      setPoSaveError("Approve all pages before locking Step 7.");
      return;
    }

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Missing login token.");

    const res = await fetch("/api/seo/strategy/savePageOptimizationDraft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        websiteId: selectedWebsiteId,
        action: "lockStep",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Lock Step 7 failed.");

    await loadExistingPageOptimization();
  } catch (e) {
    console.error("lockStep7 error:", e);
    setPoSaveState("error");
    setPoSaveError(e?.message || "Failed to lock Step 7.");
  }
}
	async function exportOnPageBlueprint() {
  try {
    setPoExportState("exporting");
    setPoExportError("");

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Missing login token.");

    // website label for filename
    const ws = Array.isArray(websites) ? websites.find((w) => w?.id === selectedWebsiteId) : null;
    const websiteLabel =
      (ws?.name || ws?.websiteName || ws?.domain || ws?.url || ws?.websiteUrl || ws?.siteUrl || "").toString().trim() ||
      "Website";

    // geo header info (does NOT change Firestore; only for Excel header row)
    const geoMode =
      (keywordPoolMeta?.geo_mode || keywordGeoMode || "").toString().trim() || "";
    const locationName =
      (keywordPoolMeta?.location_name || keywordLocationName || "").toString().trim() || "";

    const res = await fetch("/api/seo/strategy/exportPageOptimization", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        websiteId: selectedWebsiteId,
        websiteName: websiteLabel,
        geoMode,
        locationName,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Export failed.");
    }

    const blob = await res.blob();

    // download without refresh
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${websiteLabel}_OnPage_Blueprint.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    setPoExportState("idle");
  } catch (e) {
    console.error("exportOnPageBlueprint error:", e);
    setPoExportState("error");
    setPoExportError(e?.message || "Export failed.");
  }
}


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
   "Please paste at least 3 seed keywords in Step 5 (Seed Keywords box), then click Generate Keyword Research, and only then click Regenerate here."
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
      setLockUrlsState("idle");
      setLockUrlsError("");
      setResetUrlsState("idle");
      setResetUrlsError("");

      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setPageDiscoveryExists(false);
        setLastPagesSavedAt(null);
        setUrlListRaw("");

// canonical defaults when doc is absent
setPageDiscoveryLocked(false);
setPageDiscoveryLockedAt(null);
setPageDiscoveryAuditLocked(false);
setPageDiscoveryAuditLockedAt(null);
return;
      }

      const d = snap.data() || {};
      setPageDiscoveryExists(true);

      const urls = Array.isArray(d.urls) ? d.urls : [];
      setUrlListRaw(urls.join("\n"));
      setLastPagesSavedAt(safeToDate(d.updatedAt));

// canonical lock fields (missing => false)
const locked = d.locked === true;
setPageDiscoveryLocked(locked);
setPageDiscoveryLockedAt(safeToDate(d.lockedAt));

// audit confirmation lock (missing => false)
const auditLocked = d.auditLocked === true;
setPageDiscoveryAuditLocked(auditLocked);
setPageDiscoveryAuditLockedAt(safeToDate(d.auditLockedAt));

    } catch (e) {
      console.error("Failed to load page discovery:", e);
      setPageDiscoveryExists(false);

// safe fallback
setPageDiscoveryLocked(false);
setPageDiscoveryLockedAt(null);
setPageDiscoveryAuditLocked(false);
setPageDiscoveryAuditLockedAt(null);

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
// Load existing Step 7 page optimization (resume-safe)
useEffect(() => {
  if (!uid || !selectedWebsiteId || !websites?.length) return;
  loadExistingPageOptimization();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, selectedWebsiteId, websites]);
// Load existing Step 8A authority plan (resume-safe)
useEffect(() => {
  if (!uid || !selectedWebsiteId || !websites?.length) return;
  loadExistingAuthorityPlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [uid, selectedWebsiteId, websites]);




async function handleSavePages() {
	  if (!step1Saved) {
    setStepGateError("Complete Step 1 first.");
    return;
  }
  const ref = pageDiscoveryDocRef();
  if (!ref) return;

  // If locked, do nothing (UI should already disable, but we keep it safe)
  if (pageDiscoveryLocked) return;

  setSavePagesState("saving");
  setSavePagesError("");

  let createdAt = null;
  let existingLocked = false;
  let existingLockedAt = null;

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      createdAt = existing.data()?.createdAt || null;

      // Preserve lock fields if they exist (canonical defaults: missing => false)
      existingLocked = existing.data()?.locked === true;
      existingLockedAt = existing.data()?.lockedAt || null;
    }
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

        // canonical lock fields
        locked: existingLocked === true ? true : false,
        lockedAt: existingLocked === true ? (existingLockedAt || serverTimestamp()) : null,
      },
      { merge: true }
    );

    setPageDiscoveryExists(true);
    setSavePagesState("saved");
    setLastPagesSavedAt(new Date());

    // keep canonical lock state in UI
    setPageDiscoveryLocked(existingLocked === true);
    setPageDiscoveryLockedAt(existingLocked === true ? new Date() : null);

    // Normalize textarea to capped + valid only
    setUrlListRaw(cappedValidUrls.join("\n"));

    setTimeout(() => setSavePagesState("idle"), 1500);
  } catch (e) {
    console.error("Failed to save page discovery:", e);
    setSavePagesState("error");
    setSavePagesError(e?.message || "Failed to save URLs.");
  }
}

async function handleLockUrlsAndProceed() {
	  if (!step1Saved) {
    setStepGateError("Complete Step 1 first.");
    return;
  }
  const ref = pageDiscoveryDocRef();
  if (!ref) return;

  setLockUrlsState("locking");
  setLockUrlsError("");

  try {
    // Lock MUST also persist the latest edited URL list (prevents stale audits)
    await setDoc(
      ref,
      {
        urls: cappedValidUrls,
        invalidCount: parsedUrls.invalid.length,
        status: "draft",
        cap: urlCap,
        locked: true,
        lockedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Normalize textarea to what was locked
    setUrlListRaw(cappedValidUrls.join("\n"));

    setPageDiscoveryExists(true);
    setPageDiscoveryLocked(true);
    setPageDiscoveryLockedAt(new Date());
    setLockUrlsState("locked");

    // proceed to Step 3 (accordion open)
    setOpenStep("step3");

    setTimeout(() => setLockUrlsState("idle"), 1500);
  } catch (e) {
    console.error("Failed to lock URL list:", e);
    setLockUrlsState("error");
    setLockUrlsError(e?.message || "Failed to lock URL list.");
  }
}

async function handleResetUrlList() {
	  if (!step1Saved) {
    setStepGateError("Complete Step 1 first.");
    return;
  }

  const ref = pageDiscoveryDocRef();
  if (!ref) return;

  setResetUrlsState("resetting");
  setResetUrlsError("");

  try {
    // 1) Unlock Step 2 canonically
    await setDoc(
      ref,
      {
        locked: false,
        lockedAt: null,
        auditLocked: false,
        auditLockedAt: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

setPageDiscoveryAuditLocked(false);
setPageDiscoveryAuditLockedAt(null);

    // 2) Clear ALL audit results under strategy/auditResults/urls/*
    const colRef = auditResultsColRef();
    if (colRef) {
      const snap = await getDocs(colRef);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }

    // 3) Reset local Step 3 UI state so it doesn't look "accumulated"
    setAuditedUrlSet(new Set());
    setAuditRows([]);
    setAuditProgress({ done: 0, total: 0 });
    setAuditRunState("idle");
    setAuditError("");
    setAuditCurrentUrl("");
    setExpandedAuditRowId(null);

    // 4) Back to editable Step 2 state
    setPageDiscoveryLocked(false);
    setPageDiscoveryLockedAt(null);

    // Step 3 must be disabled again until re-lock
    setOpenStep("step2");

    setResetUrlsState("done");
    setTimeout(() => setResetUrlsState("idle"), 1500);
  } catch (e) {
    console.error("Failed to reset URL list:", e);
    setResetUrlsState("error");
    setResetUrlsError(e?.message || "Failed to reset URL list.");
  }
}

async function handleContinueToStep3() {
	  if (!step1Saved) {
    setStepGateError("Complete Step 1 first.");
    return;
  }
  const ref = pageDiscoveryDocRef();
  if (!ref) return;

  try {
    const snap = await getDoc(ref);
    const d = snap.data() || {};

    // Strict canonical gating: only when pageDiscovery.locked === true
    if (d.locked === true) {
      setOpenStep("step3");
      return;
    }

    // Missing field or false => treat as not locked
    setLockUrlsState("error");
    setLockUrlsError("URL list is not locked. Please go to Step 2 and lock the URL list before proceeding.");
  } catch (e) {
    setLockUrlsState("error");
    setLockUrlsError(e?.message || "Could not verify URL lock status. Please try again.");
  }
}
	
async function handleDiscoverUrls() {
	  if (!step1Saved) {
    setStepGateError("Complete Step 1 first.");
    return;
  }

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

// Canonical gating: Step 3 actions only when pageDiscovery.locked === true
if (d.locked !== true) {
  setAuditRunState("error");
  setAuditError("URL list is not locked. Please go to Step 2 and lock the URL list before running the audit.");
  return;
}
	  // New Sprint 1 rule: once audit is confirmed + locked, audits cannot be re-run
if (d.auditLocked === true) {
  setAuditRunState("error");
  setAuditError("Audit is confirmed and locked. To run audits again, use Reset URL List in Step 2.");
  return;
}


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

async function handleConfirmAuditAndLock() {
  const ref = pageDiscoveryDocRef();
  if (!ref) return;

  setAuditConfirmState("confirming");
  setAuditConfirmError("");

  try {
    await setDoc(
      ref,
      {
        auditLocked: true,
        auditLockedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setPageDiscoveryAuditLocked(true);
    setPageDiscoveryAuditLockedAt(new Date());

    setAuditConfirmState("done");
    setTimeout(() => setAuditConfirmState("idle"), 1500);
  } catch (e) {
    console.error("Failed to confirm audit lock:", e);
    setAuditConfirmState("error");
    setAuditConfirmError(e?.message || "Failed to confirm and lock audit.");
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
	      // Block empty/invalid saves (prevents Step 2 unlocking from an empty draft)
    if (!isStep1Valid) {
      setSaveState("idle");
      setSaveError("Please complete required fields before saving.");
      return;
    }

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
                       SEO Strategy Builder
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
              <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: "-0.3px" }}>
          SEO Strategy Builder
        </h1>

        <div style={{ marginTop: 8, color: "#6b7280", fontSize: 14, lineHeight: 1.5, maxWidth: 900 }}>
          Build a complete SEO strategy for your website — from pages and audits to keywords, on-page blueprints, and a 90-day authority plan.
        </div>

        <ul style={{ marginTop: 12, color: "#374151", fontSize: 14, lineHeight: 1.6, paddingLeft: 18 }}>
          <li>Complete each step in order. Each step unlocks the next.</li>
          <li>Your work is saved for this website as you go.</li>
          <li>At the end, you’ll export an optimization blueprint and generate blog drafts in Vyndow SEO.</li>
        </ul>

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
                                    Your work is saved for this website as you go.
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
			              {!step1Saved ? (
                <div style={{ marginTop: 6, fontSize: 13, fontWeight: 900, color: "#991b1b" }}>
                  This draft is incomplete. Fill required fields in Step 1 and Save to unlock Step 2.
                </div>
              ) : null}
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
   subtitle={
    <>
      <div>Tell us what your business offers and who it serves.</div>
      <div>We use this to keep keywords and strategy recommendations aligned to your actual services.</div>
      <div style={{ marginTop: 6, opacity: 0.75 }}>
        Tip: Updating this later may change downstream strategy steps.
      </div>
    </>
  }
  statusTone={step1Saved ? "success" : profileExists ? "warning" : "neutral"}
  statusText={step1Saved ? "Saved" : profileExists ? "Incomplete" : "Not started"}
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
                            disabled={!selectedWebsiteId || saveState === "saving" || !isStep1Valid}
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
              {!isStep1Valid ? (
                <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c", fontWeight: 800 }}>
                  Fill required fields to enable Save.
                </div>
              ) : null}

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
              type="button"
              disabled={!step1Saved}
              onClick={() => {
                if (!step1Saved) {
                  setStepGateError("Complete Step 1 first.");
                  return;
                }
                setStepGateError("");
                setOpenStep("step2");
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: step1Saved ? "#111827" : "#f3f4f6",
                color: step1Saved ? "#ffffff" : "#6b7280",
                cursor: step1Saved ? "pointer" : "not-allowed",
              }}
              title={step1Saved ? "Continue to Step 2" : "Complete Step 1 first"}
            >
              Continue to Step 2
            </button>
				  {stepGateError ? (
  <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>
    {stepGateError}
  </div>
) : null}
          </div>

          {saveError ? (
            <div style={{ marginTop: 12, color: "#b91c1c" }}>{saveError}</div>
          ) : null}
      </StepCard>
{/* Step 2 */}
<StepCard
  id="step2"
  step="Step 2"
  title="URL Page Selection"
  subtitle={
  <>
    <div>Select the website pages that should be included in your SEO strategy.</div>
    <div>
      These URLs will be audited and used to generate keyword mapping and on-page optimization blueprints.
    </div>
    <div style={{ marginTop: 6, fontWeight: 800 }}>
      Important: Everything after this step depends on the URLs you lock here.
    </div>
    <div>To proceed, you must review and lock your selected URLs.</div>
  </>
}
  statusTone={pageDiscoveryExists ? "success" : "neutral"}
  statusText={pageDiscoveryExists ? "Saved" : "Not started"}
  openStep={openStep}
   setOpenStep={setOpenStepWithStep1Gate}
>
  {stepGateError ? (
    <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
      {stepGateError}
    </div>
  ) : null}

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
<div>
  <div>You can include up to:</div>
  <div style={{ marginTop: 6, lineHeight: 1.6 }}>
    <div>Free: 4 URLs</div>
    <div>Small Business: 10 URLs</div>
    <div>Enterprise: 25 URLs</div>
  </div>

  <div style={{ marginTop: 10 }}>
    You can either scan your website automatically or manually add URLs.
  </div>

  <div style={{ marginTop: 10 }}>
    Your current plan allows up to <b>{urlCap}</b> URLs.
  </div>
</div>
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
  className="btn btn-soft-primary"
  onClick={handleDiscoverUrls}
  disabled={!selectedWebsiteId || discoverState === "discovering" || pageDiscoveryLocked}
  title={
    pageDiscoveryLocked
      ? "URL list is locked"
      : "Discover URLs using sitemap.xml first, else a lightweight crawl (no AI)"
  }
>
  {discoverState === "discovering" ? "Scanning…" : "Scan Website for URLs"}
</button>
</div>

<textarea
  value={urlListRaw}
  onChange={(e) => setUrlListRaw(e.target.value)}
  disabled={pageDiscoveryLocked}
  placeholder={`https://example.com/\nhttps://example.com/about\nhttps://example.com/services`}
  rows={8}
  style={{
    ...inputStyle,
    resize: "vertical",
    background: pageDiscoveryLocked ? "#f9fafb" : "white",
    cursor: pageDiscoveryLocked ? "not-allowed" : "text",
    opacity: pageDiscoveryLocked ? 0.85 : 1,
  }}
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
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
<button
  type="button"
  className="btn btn-outline-primary"
  onClick={handleSavePages}
  disabled={!selectedWebsiteId || savePagesState === "saving" || pageDiscoveryLocked}
>
  {savePagesState === "saving" ? "Saving…" : "Save URLs"}
</button>

        {savePagesState === "saved" ? (
          <div style={{ color: "#065f46", fontWeight: 800 }}>Saved</div>
        ) : null}

        {savePagesState === "error" ? (
          <div style={{ color: "#b91c1c", fontWeight: 700 }}>Save failed</div>
        ) : null}

        {/* State 2: Saved but Unlocked */}
        {pageDiscoveryExists && !pageDiscoveryLocked ? (
<button
  type="button"
  className="btn btn-primary"
  onClick={handleLockUrlsAndProceed}
  disabled={!selectedWebsiteId || lockUrlsState === "locking"}
  title="Lock this URL list and proceed to Step 3"
>
  {lockUrlsState === "locking" ? "Locking…" : "Lock URLs & Proceed"}
</button>
        ) : null}

        {/* State 3: Locked */}
        {pageDiscoveryLocked ? (
          <div style={{ fontSize: 13, color: "#111827" }}>
            <span style={{ fontWeight: 900 }}>URL list locked</span>
            {pageDiscoveryLockedAt ? (
              <span style={{ marginLeft: 8, color: "#6b7280" }}>
                (Locked: {pageDiscoveryLockedAt.toLocaleString()})
              </span>
            ) : null}
          </div>
        ) : null}

        {lockUrlsState === "error" && lockUrlsError ? (
          <div style={{ color: "#b91c1c", fontWeight: 700 }}>{lockUrlsError}</div>
        ) : null}

        {resetUrlsState === "error" && resetUrlsError ? (
          <div style={{ color: "#b91c1c", fontWeight: 700 }}>{resetUrlsError}</div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {pageDiscoveryLocked ? (
     <button
  type="button"
  className="btn btn-primary"
  onClick={handleContinueToStep3}
  title="Continue to Step 3"
>
  Continue to Step 3
</button>
        ) : (
<button
  disabled
  className="btn btn-disabled"
  title="Lock the URL list in Step 2 to enable Step 3"
>
  Continue to Step 3
</button>
        )}

        {pageDiscoveryLocked ? (
<button
  type="button"
  className="btn btn-outline-primary"
  onClick={handleResetUrlList}
  disabled={resetUrlsState === "resetting"}
  title="Unlock Step 2 and clear audit results"
>
  {resetUrlsState === "resetting" ? "Resetting…" : "Reset URL List"}
</button>
        ) : null}
      </div>
    </div>

    {savePagesError ? (

      <div style={{ marginTop: 12, color: "#b91c1c" }}>{savePagesError}</div>
    ) : null}
</div>
</StepCard>
<StepCard
  id="step3"
  step="Step 3"
  title="Step 3: On-Page SEO Audit Diagnostics"
  subtitle="This step audits the URLs you locked in Step 2 and generates a diagnostic on-page SEO report. This is a diagnostics-only step. We will improve and optimize these pages later in the On-Page Optimization Blueprint step."
  statusTone={auditProgress?.done > 0 ? "success" : "neutral"}
  statusText={auditProgress?.done > 0 ? `${auditProgress.done} audited` : "Not started"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>

  {!pageDiscoveryLocked ? (
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
      Please lock your URL list in Step 2 to continue to Step 3.
    </div>
  ) : null}

  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
<button
  type="button"
  onClick={handleRunAudit}
  disabled={!selectedWebsiteId || auditRunState === "running" || !pageDiscoveryLocked || pageDiscoveryAuditLocked}
  className="btn btn-primary"
>
      {auditRunState === "running" ? "Running Audit…" : "Run Audit"}

    </button>

{selectedWebsiteId && pageDiscoveryLocked !== true ? (
  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
    Step 3 is locked until you Lock URLs in Step 2.
  </div>
) : null}

    {auditRunState === "done" ? (
      <div style={{ color: "#065f46", fontWeight: 800 }}>Audit complete</div>
    ) : null}

    {auditRunState === "error" ? (
      <div style={{ color: "#b91c1c", fontWeight: 700 }}>Audit failed</div>
    ) : null}
{pageDiscoveryAuditLocked ? (
  <div style={{ color: "#374151", fontWeight: 700 }}>
    Audit confirmed and locked.
  </div>
) : null}

{auditConfirmError ? (
  <div style={{ color: "#b91c1c", fontWeight: 700 }}>{auditConfirmError}</div>
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
  step="Step 4"
  title="On-Page Audit Report"
  subtitle="This report shows the on-page SEO diagnostics for your selected URLs. Red indicators highlight issues that require attention. Click any URL row to expand and view detailed findings."
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
<div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>

  <div style={{ marginBottom: 8, fontSize: 12, color: "#6b7280", fontWeight: 400, lineHeight: 1.5 }}>
    To proceed to the next step, you must confirm and lock this audit report.
    <br />
    Note: All SEO corrections and improvements will be implemented later in the On-Page Optimization Blueprint step.
  </div>

<button
  type="button"
  onClick={handleConfirmAuditAndLock}
  disabled={
    auditConfirmState === "confirming" ||
    pageDiscoveryLocked !== true ||
    pageDiscoveryAuditLocked === true ||
    !Array.isArray(auditRows) ||
    auditRows.length === 0
  }
  className="btn btn-primary"
  title={
    pageDiscoveryLocked !== true
      ? "Lock URLs in Step 2 first"
      : !Array.isArray(auditRows) || auditRows.length === 0
      ? "Run audit in Step 3 first"
      : pageDiscoveryAuditLocked === true
      ? "Audit already confirmed"
      : ""
  }
>
    {auditConfirmState === "confirming" ? "Confirming…" : "Confirm Audit & Lock"}
  </button>

  {pageDiscoveryAuditLocked ? (
    <div style={{ color: "#065f46", fontWeight: 800 }}>
      Audit confirmed and locked.
    </div>
  ) : null}

  {auditConfirmState === "done" ? (
    <div style={{ color: "#065f46", fontWeight: 800 }}>Saved</div>
  ) : null}
</div>
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
			<div
  style={{
    padding: 12,
    borderBottom: "1px solid #f3f4f6",
    background: "#fafafa",
    color: "#374151",
    fontSize: 13,
    lineHeight: 1.5,
  }}
>
  <div style={{ fontWeight: 800, color: "#111827" }}>Audit Complete.</div>
  <div>Review the findings below. Confirm and lock the report once you are satisfied.</div>
</div>
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
  step="Step 5:"
  title="Keyword Research"
  subtitle="Based on your Business Profile and selected Location, we will generate a large keyword set relevant to your business."
  statusTone={keywordPoolExists ? "success" : "neutral"}
  statusText={keywordPoolExists ? "Generated" : "Not started"}
  openStep={openStep}
  setOpenStep={(next) => {
  const allowStep4 =
    pageDiscoveryLocked === true && pageDiscoveryAuditLocked === true;

  if (!allowStep4) return;
  setOpenStep(next);
}}

>


          <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            Based on your Business Profile and selected Location, we will generate a large keyword set relevant to your business.

<div style={{ marginTop: 8 }}>
  Enter 3–10 seed keywords (services, offerings, or topics). We will use them to discover related keywords.
</div>

<div style={{ marginTop: 8 }}>
  You will see a sample of the generated keywords below. These will later be refined and used for URL mapping and on-page optimization.
</div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
  <div>
    <label style={labelStyle}>Geo Strategy Mode</label>
    <select
      value={keywordGeoMode}
      onChange={(e) => setKeywordGeoMode(e.target.value)}
      style={inputStyle}
      disabled={keywordPoolRemaining === 0}
    >
      <option value="country">Country-level strategy (recommended)</option>
      <option value="local">Local strategy (city/state)</option>
    </select>
    <div style={helpStyle}>You must explicitly choose a mode. No fallback is used.</div>
  </div>

  <div>
    <label style={labelStyle}>
     Location
    </label>
{keywordGeoMode === "country" ? (
  <input
    value={keywordLocationName}
    onChange={(e) => {
      setKeywordLocationName(e.target.value);
    }}
    placeholder="Example: India"
    style={inputStyle}
    disabled={keywordPoolRemaining === 0}
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
        disabled={keywordPoolRemaining === 0}
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
          border: "1px solid #111827",
background: "#111827",
color: "white",
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

<div style={helpStyle}>Type a country or location</div>
  </div>
</div>

          </div>

<div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "white", fontSize: 13, lineHeight: 1.4, color: "#111827" }}>
  {keywordPoolGenerationCount === 0 ? (
    <b>You can generate keywords up to 2 times for this website.</b>
  ) : keywordPoolGenerationCount === 1 ? (
    <>You have 1 regeneration remaining for this website.</>
  ) : (
    <b>No regenerations remaining. Keywords are now locked for this website.</b>
  )}
</div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Seed Keywords</label>
            <textarea
              value={seedKeywordsRaw}
              onChange={(e) => setSeedKeywordsRaw(e.target.value)}
              rows={4}
              placeholder={`Example:\nplumbing services\nwater heater repair\nplumber near me`}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              disabled={keywordPoolRemaining === 0}
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
  className="btn btn-primary"
  disabled={
    keywordPoolState === "generating" ||
    keywordPoolState === "loading" ||
    keywordPoolRemaining === 0
  }
>
  {keywordPoolState === "generating" ? "Generating…" : "Generate Keyword Research"}
</button>

     {selectedWebsiteId && pageDiscoveryAuditLocked !== true ? (
  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
    Step 4 requires you to Confirm Audit & Lock in Step 3.5.
  </div>
) : null}

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
     <div>
  <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>Sample Keywords</div>
  <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
    This is just a sample of the total keywords that were generated. We will further select the most relevant keywords in the next steps for your website.
  </div>
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
  step="Step 6"
  title="Business Profiling"
  statusTone={businessContextApproved ? "success" : "warning"}
  statusText={businessContextApproved ? "Approved" : "Not approved"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>

                 <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
            This section builds a structured understanding of your business based on your Business Profile, selected Location, and keyword research.
            <br />
            <br />
            It defines how your services, themes, and positioning will be interpreted for keyword scoring and content clustering in the next steps.
            <br />
            <br />
            Please review and edit this summary carefully. Any changes here will directly influence how your content pillars and keyword mapping are created.
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
           <label style={labelStyle}>Business Summary (Editable)</label>
            <textarea
              value={businessContextSummary}
              onChange={(e) => setBusinessContextSummary(e.target.value)}
              rows={7}
              style={{ ...inputStyle, resize: "vertical" }}
             placeholder='Click "Generate Business Profile" to create a structured summary of your business.'
            />
            <div style={helpStyle}>
              Click "Generate Business Profile" to create a structured summary of your business. You can edit this summary before approval. Once approved, this will unlock the next step in your SEO strategy workflow.
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
                className="btn btn-primary"
              >
                {businessContextState === "generating" ? "Generating…" : "Generate Business Profile"}
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
                className="btn btn-primary"
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
  step="Step 7"
  title="SEO Pillars and Content Cluster Architecture"
  statusTone={keywordClusteringApproved ? "success" : "warning"}
  statusText={keywordClusteringApproved ? "Locked" : "Unlocked"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>


  {/* Collapsible explanation (single place) */}
  <div
    style={{
      marginTop: 6,
      padding: 12,
      borderRadius: 12,
      border: `1px solid rgba(30,102,255,0.18)`,
      background: "rgba(30,102,255,0.04)",
      color: HOUSE.subtext,
      fontSize: 13,
      lineHeight: 1.55,
    }}
  >
    {!kcExplainOpen ? (
      <div>
        <div style={{ fontWeight: 800, color: HOUSE.text }}>
          Pillars and clusters help you build authority and structure across your site.
        </div>
        <div style={{ marginTop: 4 }}>
          Vyndow semantically filters keywords, shortlists ~100, then creates up to 6 pillars with clusters.
          <button
            type="button"
            onClick={() => setKcExplainOpen(true)}
            style={{
              marginLeft: 8,
              border: "none",
              background: "transparent",
              color: HOUSE.primaryBlue,
              fontWeight: 900,
              cursor: "pointer",
              padding: 0,
            }}
          >
            Read more
          </button>
        </div>
      </div>
    ) : (
      <div>
        <div style={{ fontWeight: 900, color: HOUSE.primaryPurple, fontSize: 14 }}>
          Why pillars and clusters matter
        </div>
        <div style={{ marginTop: 6 }}>
          Pillars create clear themes, and clusters deepen coverage within each theme. This structure helps search engines understand your authority and makes your content plan easier to execute.
        </div>

        <div style={{ marginTop: 10, fontWeight: 900, color: HOUSE.primaryPurple, fontSize: 14 }}>
          What Vyndow does
        </div>
        <div style={{ marginTop: 6 }}>
          Vyndow semantically filters your keyword pool, builds a shortlist (~100), and generates up to 6 pillars with clusters to form your SEO architecture.
        </div>

        <div style={{ marginTop: 10, fontWeight: 900, color: HOUSE.primaryPurple, fontSize: 14 }}>
          What you can do
        </div>
        <div style={{ marginTop: 6 }}>
          You can rename pillar labels (label only), remove keywords, and add new keywords under the most relevant pillar theme.
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: HOUSE.subtext, fontWeight: 800 }}>
          Metrics may be unavailable in some cases. We always report only the facts, never made up numbers.
        </div>

        <button
          type="button"
          onClick={() => setKcExplainOpen(false)}
          style={{
            marginTop: 10,
            border: "none",
            background: "transparent",
            color: HOUSE.primaryBlue,
            fontWeight: 900,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Show less
        </button>
      </div>
    )}
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
        border: `1px solid ${keywordClusteringExists ? "rgba(30,102,255,0.20)" : HOUSE.primaryBlue}`,
        cursor: (!businessContextApproved || keywordClusteringApproved) ? "not-allowed" : "pointer",
        background: (!businessContextApproved || keywordClusteringApproved)
          ? "#f3f4f6"
          : keywordClusteringExists
          ? "white"
          : HOUSE.primaryBlue,
        color: (!businessContextApproved || keywordClusteringApproved)
          ? "#6b7280"
          : keywordClusteringExists
          ? HOUSE.primaryBlue
          : "white",
        opacity: keywordClusteringState === "generating" ? 0.75 : 1,
        fontWeight: 900,
      }}
      title={
        !businessContextApproved
          ? "Approve Business Profiling to unlock this step."
          : keywordClusteringApproved
          ? "This step is approved and locked. To regenerate, delete the architecture document from Firestore."
          : ""
      }
    >
      {keywordClusteringState === "generating" ? "Generating…" : "Generate SEO Architecture"}
    </button>

{selectedWebsiteId && businessContextApproved !== true ? (
  <div style={{ marginTop: 6, fontSize: 12, color: HOUSE.subtext, fontWeight: 700 }}>
    Approve Business Profiling to continue.
  </div>
) : null}

    <button
      type="button"
      onClick={handleSaveKeywordClusteringDraft}
      disabled={!keywordClusteringExists || keywordClusteringApproved || kcDraftState === "saving"}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${HOUSE.primaryBlue}`,
        cursor: (!keywordClusteringExists || keywordClusteringApproved) ? "not-allowed" : "pointer",
        background: "white",
        color: HOUSE.primaryBlue,
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
        border: `1px solid ${HOUSE.primaryBlue}`,
        cursor: (!keywordClusteringExists || keywordClusteringApproved) ? "not-allowed" : "pointer",
        background: HOUSE.primaryBlue,
        color: "white",
        opacity: (!keywordClusteringExists || keywordClusteringApproved) ? 0.6 : 1,
        fontWeight: 900,
      }}
      title={keywordClusteringApproved ? "Already approved" : ""}
    >
      {keywordClusteringApproved ? "Approved ✓" : kcApproveState === "approving" ? "Approving…" : "Approve and Lock"}
    </button>

    <div style={{ marginLeft: "auto", color: HOUSE.subtext, fontSize: 13 }}>
      Status:{" "}
      <b style={{ color: keywordClusteringApproved ? "#065f46" : HOUSE.text }}>
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
<div style={{ fontSize: 14, fontWeight: 900, color: HOUSE.primaryPurple }}>
  Pillar Labels (Max 6) — rename allowed (label only)
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
  border: `1px solid rgba(30,102,255,0.22)`,
  borderRadius: 12,
  padding: 12,
  background: "#fff",
  boxShadow: "0 8px 22px rgba(15,23,42,0.05)",
  gridColumn: expanded ? "1 / -1" : "auto",   // expanded pillar becomes full-width
}}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ flex: 1 }}>

                  <input
                    value={p.name || ""}
                    onChange={(e) => handleRenamePillarLabel(p.pillarId, e.target.value)}
                    disabled={keywordClusteringApproved}
                    style={{
  ...inputStyle,
  marginTop: 6,
  padding: "8px 10px",
  fontWeight: 900,
  color: HOUSE.primaryPurple,
  border: `1px solid rgba(30,102,255,0.24)`,
  background: "rgba(30,102,255,0.03)",
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
  border: `1px solid ${HOUSE.primaryBlue}`,
  background: "white",
  color: HOUSE.primaryBlue,
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
    title={
      h === "Intent"
        ? "Search intent type (informational / commercial / navigational)."
        : h === "Vol"
        ? "Estimated monthly searches (where available)."
        : h === "Score"
        ? "Vyndow’s priority score based on relevance + opportunity."
        : ""
    }
    style={{
      textAlign: "left",
      fontSize: 12,
      color: "#6b7280",
      padding: "8px 6px",
      borderBottom: "1px solid #eee",
      whiteSpace: "nowrap",
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
                                        Metrics may be unavailable in some cases. We always report only the facts, never made up numbers.
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
                  {["Keyword", "Pillar", "Cluster", "Volume", "Intent", "Strategy Score"].map((h) => (
  <th
    key={h}
    title={
      h === "Pillar"
        ? "Primary theme to build authority around."
        : h === "Cluster"
        ? "Supporting keywords that deepen coverage within the pillar."
        : h === "Volume"
        ? "Estimated monthly searches (where available)."
        : h === "Intent"
        ? "Search intent type (informational / commercial / navigational)."
        : h === "Strategy Score"
        ? "Vyndow’s priority score based on relevance + opportunity."
        : ""
    }
    style={{
      textAlign: "left",
      fontSize: 12,
      color: "#6b7280",
      padding: "8px 6px",
      borderBottom: "1px solid #eee",
      whiteSpace: "nowrap",
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
  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
    <button
      type="button"
      onClick={() => setKcExcludedOpen(!kcExcludedOpen)}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${HOUSE.primaryBlue}`,
        background: "white",
        color: HOUSE.primaryBlue,
        cursor: "pointer",
        fontWeight: 900,
      }}
      title="Read-only list of excluded keywords."
    >
      {kcExcludedOpen ? "Hide" : "Show"} Excluded Keywords (read-only)
    </button>

    <div style={{ fontSize: 12, color: HOUSE.subtext, fontWeight: 700 }}>
      Tip: If you find any keyword useful here, copy it and add it under the relevant Pillar theme.
    </div>
  </div>

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
        ? "No architecture generated yet for this website."
        : "Approve Step 4.5 to unlock Step 5."}
    </div>
  )}
</StepCard>

{/* >>> STEP 6 UI SHELL (START) */}
<StepCard
  id="step8"
  step="Step 8"
  title="Keyword Mapping"
  subtitle="Map shortlisted keywords to your existing audited pages, recommend gap pages, and produce a deployable SEO blueprint."
  statusTone={keywordMappingApproved ? "success" : "warning"}
  statusText={keywordMappingApproved ? "Approved" : "Not approved"}
  openStep={openStep}
  setOpenStep={setOpenStep}
>

  <div style={{ padding: 18, paddingBottom: 0 }}>
    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
      <div>This section assigns primary and secondary keywords to your existing URLs.</div>
      <div>It also identifies new Gap Pages required to improve coverage.</div>
    </div>

    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setKmExplainOpen((v) => !v)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "pointer",
          color: HOUSE.primaryBlue,
          fontWeight: 900,
          fontSize: 13,
        }}
        title="Click to expand"
      >
        {kmExplainOpen ? "How mapping improves SEO structure ▴" : "How mapping improves SEO structure ▾"}
      </button>

      {kmExplainOpen ? (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${HOUSE.primaryBlue}22`,
            background: HOUSE.bgSoft,
            color: "#374151",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <div>Each URL should target one unique Primary keyword to avoid internal competition.</div>
          <div style={{ marginTop: 8 }}>Secondary keywords support broader topical coverage for that page.</div>
          <div style={{ marginTop: 8 }}>Coverage % shows how many of your shortlisted keywords are mapped to existing or planned pages.</div>
          <div style={{ marginTop: 8 }}>Gap Pages represent important keywords that do not yet have a dedicated URL. Creating these pages strengthens your overall topical authority and search visibility.</div>
          <div style={{ marginTop: 8 }}>Mapping prevents keyword cannibalization and ensures each page has a clear search intent focus.</div>
          <div style={{ marginTop: 8 }}>Review and refine mappings carefully before approval, as this structure directly influences your on-page optimization blueprint.</div>
        </div>
      ) : null}
    </div>
  </div>
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
      Step 8 is locked. Please approve Step 7 (Pilloar and Content Architecture) first.
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
            Click on Generate Mapping to map your URLs to keywords.
      Once mapped, you can edit the primary and secondary keywords.
      When you are satisfied, approve the mapping to proceed to the next step.
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
        border: `1px solid ${HOUSE.primaryBlue}`,
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
            : HOUSE.primaryBlue,
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

{selectedWebsiteId && keywordClusteringApproved !== true ? (
  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
    Approve & Lock Keyword Clustering to proceed.
  </div>
) : null}

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
        border: `1px solid ${HOUSE.primaryBlue}`,
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
         : "white",
        color:
          keywordClusteringApproved !== true ||
          keywordMappingExists !== true ||
          keywordMappingApproved === true
            ? "#6b7280"
          : HOUSE.primaryBlue,
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
       border: `1px solid ${HOUSE.primaryBlue}`,
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
          : HOUSE.primaryBlue,
        color:
          keywordClusteringApproved !== true ||
          keywordMappingExists !== true ||
          keywordMappingApproved === true
            ? "#6b7280"
          : "white",
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
          border: `1px solid ${HOUSE.primaryBlue}22`,
        background: HOUSE.bgSoft,
          color: "#374151",
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
              <div style={{ fontWeight: 900, color: HOUSE.primaryBlue }}>Mapping Summary</div>

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
  {" "}• <span title="Percentage of shortlisted keywords mapped to existing or planned pages.">Coverage %</span>:{" "}
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
                   border: `1px solid ${HOUSE.primaryBlue}22`,
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
                                           <div
                        style={{ fontSize: 12, color: HOUSE.primaryBlue, fontWeight: 800 }}
                        title="The main keyword this page should rank for. Must be unique across all URLs."
                      >
                        Primary keyword (unique)
                      </div>


                      {keywordMappingApproved ? (
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "#111827" }}>
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
   fontWeight: 600,
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
                                           <div
                        style={{ fontSize: 12, color: HOUSE.primaryBlue, fontWeight: 800 }}
                        title="Supporting keywords that reinforce topical depth."
                      >
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
                                      fontWeight: 600,
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
                                            <div style={{ fontSize: 12, color: HOUSE.primaryBlue, fontWeight: 800 }} title="The authority theme this page belongs to.">Pillar</div>
                   <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#111827" }}>

                        {p?.pillar || "—"}
                      </div>
                      {p?.cluster ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                          Cluster: <b style={{ color: "#111827" }}>{p.cluster}</b>
                        </div>
                      ) : null}
                    </div>

                    <div>
                                          <div style={{ fontSize: 12, color: HOUSE.primaryBlue, fontWeight: 800 }} title="AI-based confidence score for the keyword-page fit.">Confidence</div>
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
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          {Number.isFinite(confidence) ? `${confidence}%` : "—"}
                        </span>
                      </div>
                    </div>

                    <div>
<div style={{ fontSize: 12, color: HOUSE.primaryBlue, fontWeight: 800 }} title="Suggested internal linking opportunities based on mapping.">
  Internal links
</div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: "#111827" }}>
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

               <div style={{ fontSize: 13, fontWeight: 900, color: HOUSE.primaryBlue }} title="Keywords requiring a new dedicated page to improve coverage.">
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
            border: `1px solid ${HOUSE.primaryBlue}22`,
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
               Primary: <span style={{ color: "#111827", fontWeight: 600 }}>{g?.primaryKeyword || "—"}</span>
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                Pillar: <span style={{ color: "#111827", fontWeight: 600 }}>{g?.pillar || "—"}</span>
              </div>

<div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
  {/* Slug */}
  <div>
    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800, marginBottom: 6 }}>
      Slug
    </div>

    {keywordMappingApproved ? (
     <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
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
         fontWeight: 600,
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
<div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
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
          fontWeight: 600,
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
                    border: `1px solid ${HOUSE.primaryBlue}`,
                    background: accepted ? HOUSE.bgSoft : "white",
                    color: HOUSE.primaryBlue,
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
	{/* >>> STEP 7 UI SHELL (START) */}
<StepCard
  id="step7"
  step="Step 9"
  title="On-Page Optimization Blueprint"
  subtitle="Generate a page-by-page On-Page SEO blueprint for publishing (Title, Meta, H1/H2, structure, internal links, and on-page improvements). Review every page and approve it — approvals are required to unlock the next step."
  statusTone={
  poLocked
    ? "success"
    : pageOptimizationExists === true && poGenTotal > 0 && poGenDone >= poGenTotal
    ? "neutral"
    : poAllPagesApproved
    ? "neutral"
    : "warning"
}
 statusText={
  poLocked
    ? "Locked"
    : pageOptimizationExists === true && poGenTotal > 0 && poGenDone >= poGenTotal
    ? "Generated"
    : poAllPagesApproved
    ? "All pages approved"
    : "In progress"
}
  openStep={openStep}
  setOpenStep={setOpenStep}
>
  <div style={{ padding: 18 }}>
    {/* Gate on Step 6 approval */}
{keywordMappingApproved !== true ? (
  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
    Approve & Lock Keyword Mapping to continue.
  </div>
) : (
      <>
        {/* Generate / Resume row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <StatusPill tone={pageOptimizationExists ? "neutral" : "warning"}>
              {pageOptimizationExists ? "Blueprint exists" : "Not generated"}
            </StatusPill>

            <StatusPill tone={poSaveState === "saved" ? "success" : poSaveState === "error" ? "warning" : "neutral"}>
              {poSaveState === "saving"
                ? "Saving…"
                : poSaveState === "saved"
                ? "Saved"
                : poSaveState === "error"
                ? "Save error"
                : "Auto-save"}
            </StatusPill>

            {poSaveState === "error" && poSaveError ? (
              <span style={{ color: HOUSE.warning, fontWeight: 700, fontSize: 12 }}>{poSaveError}</span>
            ) : null}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
             onClick={loadExistingPageOptimization}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${HOUSE.cardBorder}`,
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Refresh
            </button>

            <button
              onClick={generatePageOptimization}
            disabled={
  pageOptimizationState === "generating" ||
  pageOptimizationState === "loading" ||
  poLocked === true ||
  (pageOptimizationExists === true && poGenTotal > 0 && poGenDone >= poGenTotal)
}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "0",
                background:
                  pageOptimizationState === "generating" || pageOptimizationState === "loading" || poLocked === true || !selectedWebsiteId
                    ? "rgba(30,102,255,0.25)"
                    : HOUSE.primaryBlue,
                color: "white",
                fontWeight: 900,
                cursor:
                  pageOptimizationState === "generating" || pageOptimizationState === "loading" || poLocked === true || !selectedWebsiteId
                    ? "not-allowed"
                    : "pointer",
              }}
              title={poLocked === true ? "Step 7 is locked." : ""}
            >
            {pageOptimizationState === "generating"
  ? `Generating ${poGenDone} / ${poGenTotal}…`
  : pageOptimizationExists === true && poGenTotal > 0 && poGenDone >= poGenTotal
  ? "Blueprint Ready"
  : pageOptimizationExists === true
  ? "Resume Generation"
  : "Generate Blueprint"}
            </button>
<button
  onClick={exportOnPageBlueprint}
  disabled={poAllPagesApproved !== true || poExportState === "exporting"}
  style={{
    padding: "9px 12px",
    borderRadius: 12,
    border: `1px solid ${HOUSE.cardBorder}`,
    background: poAllPagesApproved === true ? "white" : "rgba(229,231,235,0.8)",
    fontWeight: 700,
    cursor: poAllPagesApproved === true ? "pointer" : "not-allowed",
  }}
  title={
    poAllPagesApproved === true
      ? "Download Excel blueprint (approved pages)."
      : "Approve all pages to enable export."
  }
>
  {poExportState === "exporting" ? "Exporting…" : "Export On-Page Blueprint"}
</button>
{poLocked !== true ? (
  <button
    onClick={lockStep7}
    disabled={poAllPagesApproved !== true}
    style={{
      padding: "10px 14px",
      borderRadius: 12,
      border: "0",
      background: poAllPagesApproved === true ? HOUSE.primaryPurple : "rgba(109,40,217,0.25)",
      color: "white",
      fontWeight: 900,
      cursor: poAllPagesApproved === true ? "pointer" : "not-allowed",
    }}
    title={poAllPagesApproved === true ? "" : "Approve all pages to enable locking."}
  >
    Approve &amp; Lock Step 9
  </button>
) : null}
          </div>
        </div>
{(pageOptimizationState === "generating" || pageOptimizationState === "error") && poGenTotal > 0 ? (
  <div style={{ marginTop: 10, color: "#6b7280", fontWeight: 800 }}>
    {poGenLastMessage}
  </div>
) : null}
{pageOptimizationState === "generating" ? (
  <div style={{ marginTop: 8, color: "#6b7280", fontWeight: 700, fontSize: 13 }}>
    Please be patient — our AI will populate all pages with details once the generation is complete.
  </div>
) : null}

{pageOptimizationExists === true && poGenTotal > 0 && poGenDone >= poGenTotal ? (
  <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #dcfce7", background: "#f0fdf4", color: "#065f46" }}>
    <div style={{ fontWeight: 900 }}>
      The On-Page Optimization Blueprint is complete.
    </div>
    <div style={{ marginTop: 6, fontSize: 13 }}>
      Please review each page carefully and approve it. This is required for the next step.
    </div>
  </div>
) : null}
        {/* Error */}
        {pageOptimizationState === "error" && pageOptimizationError ? (
          <div style={{ marginTop: 12, color: "#b91c1c", fontWeight: 800 }}>
            {pageOptimizationError}
          </div>
        ) : null}

        {/* Page selector pills */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, color: HOUSE.text, marginBottom: 8 }}>
            Pages
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 6,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {Object.keys(poPages || {}).length === 0 ? (
              <div style={{ color: HOUSE.subtext, fontWeight: 700 }}>
                No pages loaded yet. Click “Generate Blueprint”.
              </div>
            ) : (
              Object.entries(poPages || {}).map(([pid, p]) => {
                const st = computePageStatus(p);
                const isActive = pid === poActivePageId;
                const urlLabel = (p?.url || "").trim() || "(new page)";
                const pk = (p?.primaryKeyword || "").trim();

                return (
                  <button
                    key={pid}
                    onClick={() => setPoActivePageId(pid)}
                    style={{
                      minWidth: 240,
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: isActive ? `2px solid ${HOUSE.primaryBlue}` : `1px solid ${HOUSE.cardBorder}`,
                      background: isActive ? "rgba(30,102,255,0.06)" : "white",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 900, color: HOUSE.text, fontSize: 12, lineHeight: 1.2 }}>
                      {urlLabel}
                    </div>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ color: HOUSE.subtext, fontWeight: 800, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 155 }}>
                        {pk || "—"}
                      </div>
                      <StatusPill tone={st.tone}>{st.text}</StatusPill>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Active page workspace */}
        {poActivePageId && poPages?.[poActivePageId] ? (
          <div
            style={{
              marginTop: 14,
              borderRadius: 16,
              border: `1px solid ${HOUSE.cardBorder}`,
              background: "white",
              padding: 16,
              boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
            }}
          >
            {(() => {
              const page = poPages[poActivePageId];
              const isPageLocked = poLocked === true || page?.approved === true;

              const setField = (field, value) => {
                setPoPages((prev) => {
                  const next = { ...(prev || {}) };
                  next[poActivePageId] = { ...(next[poActivePageId] || {}), [field]: value };
                  return next;
                });
                scheduleStep7Autosave(poActivePageId);
              };

              const setH2FromTextarea = (txt) => {
                const arr = String(txt || "")
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean);
                setField("h2Structure", arr);
              };

              const setInternalLinks = (links) => {
                setField("internalLinks", links);
              };

              const setSchemaStatus = (type, status) => {
                const list = Array.isArray(page.schemaSuggestions) ? page.schemaSuggestions : [];
                const next = list.map((s) =>
                  String(s?.type || "").toLowerCase() === String(type || "").toLowerCase()
                    ? { ...s, status }
                    : s
                );
                setField("schemaSuggestions", next);
              };

              const setAdvisoryStatus = (message, rationale, status) => {
                const list = Array.isArray(page.advisoryBlocks) ? page.advisoryBlocks : [];
                const next = list.map((a) => {
                  const k1 = `${String(a?.message || "")}||${String(a?.rationale || "")}`.toLowerCase();
                  const k2 = `${String(message || "")}||${String(rationale || "")}`.toLowerCase();
                  return k1 === k2 ? { ...a, status } : a;
                });
                setField("advisoryBlocks", next);
              };

              const setContentBlockStatus = (heading, status) => {
                const list = Array.isArray(page.contentBlocks) ? page.contentBlocks : [];
                const next = list.map((c) =>
                  String(c?.heading || "").toLowerCase() === String(heading || "").toLowerCase()
                    ? { ...c, status }
                    : c
                );
                setField("contentBlocks", next);
              };

              const internalLinks = Array.isArray(page.internalLinks) ? page.internalLinks : [];
              const h2Text = Array.isArray(page.h2Structure) ? page.h2Structure.join("\n") : "";

              return (
                <>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 900, color: HOUSE.primaryBlue, fontSize: 16 }}>
                        {page.url || "(new page)"}
                      </div>
                      <div style={{ marginTop: 6, color: HOUSE.subtext, fontWeight: 800 }}>
                        Primary: {page.primaryKeyword || "—"}
                      </div>
                    </div>

<button
                      onClick={() => approveStep7Page(poActivePageId)}
                      disabled={isPageLocked === true}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: "0",
                        background: isPageLocked ? "rgba(30,102,255,0.25)" : HOUSE.primaryBlue,
                        color: "white",
                        fontWeight: 900,
                        cursor: isPageLocked ? "not-allowed" : "pointer",
                      }}
                      title={isPageLocked ? "This page is already approved (or Step 7 is locked)." : ""}
                    >
                      {page.approved ? "Approved ✓" : "Approve Page"}
                    </button>

                  </div>

                  <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                    {/* Title */}
                    <div style={{ border: `1px solid ${HOUSE.cardBorder}`, borderRadius: 14, padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 6, color: HOUSE.primaryPurple }}>Title Optimization</div>
                      <input
                        value={page.title || ""}
                        onChange={(e) => setField("title", e.target.value)}
                        disabled={isPageLocked}
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: `1px solid ${HOUSE.cardBorder}`,
                        }}
                      />
                      <div style={{ marginTop: 6, color: HOUSE.subtext, fontWeight: 700, fontSize: 12 }}>
                        Target ~55–60 characters.
                      </div>
                    </div>

                    {/* Meta */}
                    <div style={{ border: `1px solid ${HOUSE.cardBorder}`, borderRadius: 14, padding: 12 }}>
                   <div style={{ fontWeight: 900, marginBottom: 6, color: HOUSE.primaryPurple }}>Meta Description</div>
                      <textarea
                        value={page.metaDescription || ""}
                        onChange={(e) => setField("metaDescription", e.target.value)}
                        disabled={isPageLocked}
                        rows={3}
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: `1px solid ${HOUSE.cardBorder}`,
                          resize: "vertical",
                        }}
                      />
                      <div style={{ marginTop: 6, color: HOUSE.subtext, fontWeight: 700, fontSize: 12 }}>
                        Target ~150–160 characters.
                      </div>
                    </div>

                    {/* H1 */}
                    <div style={{ border: `1px solid ${HOUSE.cardBorder}`, borderRadius: 14, padding: 12 }}>
                   <div style={{ fontWeight: 900, marginBottom: 6, color: HOUSE.primaryPurple }}>H1 Recommendation</div>
                      <input
                        value={page.h1 || ""}
                        onChange={(e) => setField("h1", e.target.value)}
                        disabled={isPageLocked}
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: `1px solid ${HOUSE.cardBorder}`,
                        }}
                      />
                    </div>

                    {/* H2 plan */}
                    <div style={{ border: `1px solid ${HOUSE.cardBorder}`, borderRadius: 14, padding: 12 }}>
                      <div style={{ fontWeight: 900, marginBottom: 6, color: HOUSE.primaryPurple }}>H2 Structure Plan</div>
                      <textarea
                        value={h2Text}
                        onChange={(e) => setH2FromTextarea(e.target.value)}
                        disabled={isPageLocked}
                        rows={7}
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: `1px solid ${HOUSE.cardBorder}`,
                          resize: "vertical",
                        }}
                        placeholder={"One H2 per line"}
                      />
                    </div>

                    {/* Content blocks */}
                    <div style={{ border: `1px solid ${HOUSE.cardBorder}`, borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 10, color: HOUSE.primaryPurple }}>Content Expansion Blocks</div>
                      {(Array.isArray(page.contentBlocks) ? page.contentBlocks : []).length === 0 ? (
                        <div style={{ color: HOUSE.subtext, fontWeight: 700 }}>No blocks suggested.</div>
                      ) : (
                        (page.contentBlocks || []).map((b, idx) => (
                          <div key={idx} style={{ padding: 10, borderRadius: 12, border: `1px solid ${HOUSE.cardBorder}`, marginBottom: 10 }}>
                            <div style={{ fontWeight: 900 }}>{b.heading}</div>
                            <div style={{ marginTop: 6, color: HOUSE.subtext, fontWeight: 700 }}>{b.purpose}</div>

                            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button
                                disabled={isPageLocked}
                                onClick={() => setContentBlockStatus(b.heading, "approved")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: b.status === "approved" ? `1px solid ${HOUSE.primaryBlue}` : `1px solid ${HOUSE.cardBorder}`,
                                  background: b.status === "approved" ? "rgba(30,102,255,0.12)" : "white",
                                  color: HOUSE.text,
                                  fontWeight: 900,
                                  cursor: isPageLocked ? "not-allowed" : "pointer",
                                }}
                              >
                                {b.status === "approved" ? "Approved ✓" : "Approve"}
                              </button>

                              <button
                                disabled={isPageLocked}
                                onClick={() => setContentBlockStatus(b.heading, "rejected")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: `1px solid ${HOUSE.cardBorder}`,
                                  background: b.status === "rejected" ? "rgba(245,158,11,0.12)" : "white",
                                  color: HOUSE.text,
                                  fontWeight: 900,
                                  cursor: isPageLocked ? "not-allowed" : "pointer",
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Schema suggestions */}
                    <div style={{ border: `1px solid ${HOUSE.cardBorder}`, borderRadius: 14, padding: 12 }}>
<div style={{ fontWeight: 900, marginBottom: 10, color: HOUSE.primaryPurple }}>Schema Suggestions</div>
                      {(Array.isArray(page.schemaSuggestions) ? page.schemaSuggestions : []).length === 0 ? (
                        <div style={{ color: HOUSE.subtext, fontWeight: 700 }}>No schema suggested.</div>
                      ) : (
                        (page.schemaSuggestions || []).map((s, idx) => (
                          <div key={idx} style={{ padding: 10, borderRadius: 12, border: `1px solid ${HOUSE.cardBorder}`, marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                              <div style={{ fontWeight: 900 }}>{s.type}</div>
                              <div style={{ display: "flex", gap: 10 }}>
                                <button
                                  disabled={isPageLocked}
                                  onClick={() => setSchemaStatus(s.type, "accepted")}
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: `1px solid ${HOUSE.cardBorder}`,
                                    background: s.status === "accepted" ? "rgba(22,163,74,0.12)" : "white",
                                    fontWeight: 900,
                                    cursor: isPageLocked ? "not-allowed" : "pointer",
                                  }}
                                >
                                  Accept
                                </button>
                                <button
                                  disabled={isPageLocked}
                                  onClick={() => setSchemaStatus(s.type, "rejected")}
                                  style={{
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: `1px solid ${HOUSE.cardBorder}`,
                                    background: s.status === "rejected" ? "rgba(245,158,11,0.12)" : "white",
                                    fontWeight: 900,
                                    cursor: isPageLocked ? "not-allowed" : "pointer",
                                  }}
                                >
                                  Reject
                                </button>
                              </div>
                            </div>

                            <div style={{ marginTop: 10 }}>
                              <div style={{ color: HOUSE.subtext, fontWeight: 800, fontSize: 12, marginBottom: 6 }}>
                                JSON (read-only)
                              </div>
                              <pre
                                style={{
                                  margin: 0,
                                  padding: 10,
                                  borderRadius: 12,
                                  border: `1px solid ${HOUSE.cardBorder}`,
                                  background: "rgba(15,23,42,0.04)",
                                  overflowX: "auto",
                                  fontSize: 12,
                                }}
                              >
                                {JSON.stringify(s.json || {}, null, 2)}
                              </pre>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Internal linking */}
                    <div style={{ border: `1px solid ${HOUSE.cardBorder}`, borderRadius: 14, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                       <div style={{ fontWeight: 900, color: HOUSE.primaryPurple }}>Internal Linking Plan</div>
                        <button
                          disabled={isPageLocked}
                          onClick={() => {
                            const next = [...internalLinks, { anchorText: "", targetUrl: "" }];
                            setInternalLinks(next);
                            scheduleStep7Autosave(poActivePageId);
                          }}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: `1px solid ${HOUSE.cardBorder}`,
                            background: "white",
                            fontWeight: 900,
                            cursor: isPageLocked ? "not-allowed" : "pointer",
                          }}
                        >
                          + Add Link
                        </button>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        {internalLinks.length === 0 ? (
                          <div style={{ color: HOUSE.subtext, fontWeight: 700 }}>No internal links suggested.</div>
                        ) : (
                          internalLinks.map((l, idx) => (
                            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, marginBottom: 10 }}>
                              <input
                                value={l.anchorText || ""}
                                disabled={isPageLocked}
                                onChange={(e) => {
                                  const next = internalLinks.map((x, i) => (i === idx ? { ...x, anchorText: e.target.value } : x));
                                  setInternalLinks(next);
                                  scheduleStep7Autosave(poActivePageId);
                                }}
                                placeholder="Anchor text"
                                style={{ padding: 10, borderRadius: 10, border: `1px solid ${HOUSE.cardBorder}` }}
                              />
                              <input
                                value={l.targetUrl || ""}
                                disabled={isPageLocked}
                                onChange={(e) => {
                                  const next = internalLinks.map((x, i) => (i === idx ? { ...x, targetUrl: e.target.value } : x));
                                  setInternalLinks(next);
                                  scheduleStep7Autosave(poActivePageId);
                                }}
                                placeholder="Target URL"
                                style={{ padding: 10, borderRadius: 10, border: `1px solid ${HOUSE.cardBorder}` }}
                              />
                              <button
                                disabled={isPageLocked}
                                onClick={() => {
                                  const next = internalLinks.filter((_, i) => i !== idx);
                                  setInternalLinks(next);
                                  scheduleStep7Autosave(poActivePageId);
                                }}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  border: `1px solid ${HOUSE.cardBorder}`,
                                  background: "white",
                                  fontWeight: 900,
                                  cursor: isPageLocked ? "not-allowed" : "pointer",
                                }}
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Advisory blocks */}
                    <div style={{ border: `1px solid ${HOUSE.cardBorder}`, borderRadius: 14, padding: 12 }}>
                     <div style={{ fontWeight: 900, marginBottom: 10, color: HOUSE.primaryPurple }}>Advisory Blocks</div>
                      {(Array.isArray(page.advisoryBlocks) ? page.advisoryBlocks : []).length === 0 ? (
                        <div style={{ color: HOUSE.subtext, fontWeight: 700 }}>No advisories suggested.</div>
                      ) : (
                        (page.advisoryBlocks || []).map((a, idx) => (
                          <div key={idx} style={{ padding: 10, borderRadius: 12, border: `1px solid ${HOUSE.cardBorder}`, marginBottom: 10 }}>
                            <div style={{ fontWeight: 900 }}>{a.message}</div>
                            <div style={{ marginTop: 6, color: HOUSE.subtext, fontWeight: 700 }}>{a.rationale}</div>

                            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>

       <button
                                disabled={isPageLocked}
                                onClick={() => setAdvisoryStatus(a.message, a.rationale, "approved")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: a.status === "approved" ? `1px solid ${HOUSE.primaryBlue}` : `1px solid ${HOUSE.cardBorder}`,
                                  background: a.status === "approved" ? "rgba(30,102,255,0.12)" : "white",
                                  fontWeight: 900,
                                  cursor: isPageLocked ? "not-allowed" : "pointer",
                                }}
                              >
                                {a.status === "approved" ? "Approved ✓" : "Approve"}
                              </button>
                       <button
                                disabled={isPageLocked}
                                onClick={() => setAdvisoryStatus(a.message, a.rationale, "rejected")}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: `1px solid ${HOUSE.cardBorder}`,
                                  background: a.status === "rejected" ? "rgba(245,158,11,0.12)" : "white",
                                  fontWeight: 900,
                                  cursor: isPageLocked ? "not-allowed" : "pointer",
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {isPageLocked ? (
                    <div style={{ marginTop: 12, color: HOUSE.subtext, fontWeight: 800 }}>
                      This page is locked (approved) or Step 7 is locked.
                    </div>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}
      </>
    )}
  </div>
</StepCard>
{/* >>> STEP 7 UI SHELL (END) */}
{/* >>> STEP 8A UI SHELL (START) */}
<StepCard
  id="step8a"
  step="Step 8A"
  title="Authority Growth Plan (90-Day Blueprint)"
  subtitle="Create a 90-day blog plan distributed across pillars using an authority demand score model. (Step 8B drafting comes later.)"
  statusTone={
    businessContextApproved === true &&
    keywordClusteringApproved === true &&
    keywordMappingApproved === true &&
    poLocked === true
      ? authorityPlanExists
        ? "success"
        : "neutral"
      : "warning"
  }
  statusText={
    businessContextApproved === true &&
    keywordClusteringApproved === true &&
    keywordMappingApproved === true &&
    poLocked === true
      ? authorityPlanExists
        ? "Ready"
        : "Not generated"
      : "Locked"
  }
  openStep={openStep}
  setOpenStep={setOpenStep}
>
  {(() => {
    const gateOk =
      businessContextApproved === true &&
      keywordClusteringApproved === true &&
      keywordMappingApproved === true &&
      poLocked === true;

    const missing = [];
    if (businessContextApproved !== true) missing.push("Step 4.5 (Business Context) must be approved");
    if (keywordClusteringApproved !== true) missing.push("Step 5 (Keyword Clustering) must be approved");
    if (keywordMappingApproved !== true) missing.push("Step 6 (Keyword Mapping) must be approved");
    if (poLocked !== true) missing.push("Step 7 (Page Optimization) must be locked");

    const geoModeChip =
      (authorityPlanExists ? authorityGeoMode : (keywordPoolMeta?.geo_mode || keywordGeoMode || "")) || "";
    const locationChip =
      (authorityPlanExists ? authorityLocationName : (keywordPoolMeta?.location_name || keywordLocationName || "")) || "";

    return (
      <div>
        {/* Header row strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: 12,
            borderRadius: 14,
            border: `1px solid ${HOUSE.cardBorder}`,
            background: "rgba(30,102,255,0.03)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 260 }}>
            <div style={{ fontWeight: 900, color: HOUSE.text }}>
              Recommended:{" "}
              <span style={{ color: HOUSE.primaryPurple }}>
                {authorityPlanExists ? authorityRecommendedTotal : "—"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, color: HOUSE.text }}>
                Adjusted:{" "}
                <span style={{ color: HOUSE.primaryBlue }}>
                  {authorityPlanExists ? authorityAdjustedTotal : "—"}
                </span>
              </div>

              <div style={{ color: HOUSE.subtext, fontWeight: 800, fontSize: 12 }}>
                {authorityPlanExists ? `(${authoritySliderMin} … ${authoritySliderMax})` : ""}
              </div>
            </div>

            {/* Slider (enabled only after plan exists) */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input
                type="range"
                min={authoritySliderMin || 0}
                max={authoritySliderMax || 0}
                value={authorityAdjustedTotal || 0}
                disabled={!authorityPlanExists || authorityPlanLocked === true}
                onChange={(e) => setAuthorityAdjustedTotal(Number(e.target.value || 0))}
                style={{ width: 280 }}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {geoModeChip ? <StatusPill tone="neutral">{String(geoModeChip)}</StatusPill> : null}
                {locationChip ? <StatusPill tone="neutral">{String(locationChip)}</StatusPill> : null}
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
           {!authorityPlanExists ? (<>
              <button
                disabled={!gateOk || authorityPlanState === "generating"}
                onClick={() => generateOrUpdateAuthorityPlan({ useAdjustedTotal: false })}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${HOUSE.cardBorder}`,
                  background: !gateOk ? "#f3f4f6" : HOUSE.primaryPurple,
                  color: !gateOk ? "#6b7280" : "white",
                  fontWeight: 900,
                  cursor: !gateOk ? "not-allowed" : "pointer",
                }}
              >
                {authorityPlanState === "generating" ? "Generating…" : "Generate 90-Day Plan"}
              </button>

{selectedWebsiteId && businessContextApproved === true && keywordClusteringApproved === true && keywordMappingApproved === true && poLocked !== true ? (
  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
    Lock Page Optimization Blueprint to generate Authority Plan.
  </div>
) : null}

                      </>) : (
              <button
                disabled={!gateOk || authorityPlanLocked === true || authorityPlanState === "generating"}
                onClick={() => generateOrUpdateAuthorityPlan({ useAdjustedTotal: true })}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${HOUSE.cardBorder}`,
                  background:
                    !gateOk || authorityPlanLocked === true ? "#f3f4f6" : HOUSE.primaryBlue,
                  color:
                    !gateOk || authorityPlanLocked === true ? "#6b7280" : "white",
                  fontWeight: 900,
                  cursor:
                    !gateOk || authorityPlanLocked === true ? "not-allowed" : "pointer",
                }}
                title={authorityPlanLocked === true ? "Locked plan cannot be updated" : ""}
              >
                {authorityPlanState === "generating" ? "Updating…" : "Update Plan"}
              </button>
            )}

            {authorityPlanLocked === true ? (
              <StatusPill tone="warning">Locked</StatusPill>
            ) : null}
          </div>
        </div>

        {/* Gate message */}
        {!gateOk ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, border: `1px solid ${HOUSE.cardBorder}`, background: "rgba(245,158,11,0.07)" }}>
            <div style={{ fontWeight: 900, color: HOUSE.warning, marginBottom: 8 }}>
              Step 8A is locked. Complete these first:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: HOUSE.text, fontWeight: 800, lineHeight: 1.5 }}>
              {missing.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Error */}
        {authorityPlanState === "error" && authorityPlanError ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, border: `1px solid ${HOUSE.cardBorder}`, background: "rgba(239,68,68,0.07)" }}>
            <div style={{ fontWeight: 900, color: "#b91c1c" }}>Error</div>
            <div style={{ marginTop: 6, color: HOUSE.text, fontWeight: 800 }}>{authorityPlanError}</div>
          </div>
        ) : null}

        {/* Empty state (when gate ok but no plan yet) */}
        {gateOk && !authorityPlanExists ? (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 14, border: `1px solid ${HOUSE.cardBorder}`, background: "white" }}>
            <div style={{ fontWeight: 900, color: HOUSE.text }}>No plan generated yet.</div>
            <div style={{ marginTop: 6, color: HOUSE.subtext, fontWeight: 800, lineHeight: 1.5 }}>
              Click <b>Generate 90-Day Plan</b> to create a blueprint. After generation, you can use the slider and click <b>Update Plan</b>.
            </div>
            <div style={{ marginTop: 10, color: HOUSE.subtext, fontWeight: 800 }}>
              Action column will be enabled in Step 8B. For now it will stay disabled.
            </div>
          </div>
        ) : null}

        {/* Minimal “plan exists” placeholder (tables come next step) */}
{gateOk && authorityPlanExists ? (() => {
  const monthKey = authorityActiveMonth === 1 ? "month1" : authorityActiveMonth === 2 ? "month2" : "month3";
  const activeRows = (authorityMonths && authorityMonths[monthKey]) ? authorityMonths[monthKey] : [];

  const pillarOptions = Array.isArray(authorityPillarAllocations)
    ? authorityPillarAllocations.map((p) => String(p.pillarName || "").trim()).filter(Boolean)
    : [];

  const searchText = String(authoritySearch || "").toLowerCase().trim();

  const filteredRows = activeRows.filter((r) => {
    const pn = String(r?.pillarName || "").trim();
    if (authorityFilterPillar !== "all" && pn !== authorityFilterPillar) return false;

    if (!searchText) return true;

    const t = String(r?.blogTitle || "").toLowerCase();
    const pk = String(r?.primaryKeyword || "").toLowerCase();
    return t.includes(searchText) || pk.includes(searchText);
  });

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Section 2 — Reasoning Summary (collapsible) */}
      <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${HOUSE.cardBorder}`, background: "white" }}>
        <details>
<summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, color: HOUSE.text, lineHeight: 1.4 }}>
  Reasoning Summary (click to open)
</summary>


          <div style={{ marginTop: 10 }}>
          <ul style={{ margin: 0, paddingLeft: 18, color: HOUSE.subtext, fontWeight: 600, fontSize: 13, lineHeight: 1.65 }}>
              {(authorityReasoning?.bullets || []).map((b, idx) => (
                <li key={idx}>{String(b || "")}</li>
              ))}
            </ul>

            {authorityReasoning?.notes ? (
             <div style={{ marginTop: 10, color: HOUSE.subtext, fontWeight: 600, fontSize: 13, lineHeight: 1.65 }}>
                {String(authorityReasoning.notes)}
              </div>
            ) : null}
          </div>
        </details>
      </div>

      {/* Section 3 — Pillar Allocation Table (always visible) */}
      <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${HOUSE.cardBorder}`, background: "white" }}>
<div style={{ fontWeight: 900, color: HOUSE.primaryPurple, marginBottom: 10 }}>
  Pillar Allocation
</div>


        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: `1px solid ${HOUSE.cardBorder}` }}>
                <th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext }}>Pillar</th>
<th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext }}>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span>Authority Score</span>

    <details>
      <summary
      style={{
  listStyle: "none",
  cursor: "pointer",
  display: "inline-block",
  padding: "0px 5px",
  borderRadius: 999,
  border: `1px solid ${HOUSE.cardBorder}`,
  background: "rgba(30,102,255,0.08)",
  color: HOUSE.primaryBlue,
  fontWeight: 600,
  fontSize: 9,
  lineHeight: "14px",
}}

      >
        ?
      </summary>

      <div
style={{
  marginTop: 8,
  padding: 8,
  borderRadius: 10,
  border: `1px solid ${HOUSE.cardBorder}`,
  background: "white",
  color: HOUSE.subtext,
  fontWeight: 500,
  fontSize: 11,
  lineHeight: 1.45,
  maxWidth: 320,
}}

      >
       <div style={{ fontWeight: 600, fontSize: 11, color: HOUSE.text, marginBottom: 4 }}>
          What is Authority Score?
        </div>
        <div>
          A normalized score (0 to 1) based on:
         <ul style={{ margin: "6px 0 0 16px", padding: 0, lineHeight: 1.45, fontSize: 11 }}>
            <li>Volume (40%)</li>
            <li>Intent diversity (25%)</li>
            <li>Commercial density (15%)</li>
            <li>Cluster depth (10%)</li>
            <li>Opportunity (10%)</li>
          </ul>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 500 }}>
            Higher score = higher demand + stronger opportunity.
          </div>
        </div>
      </div>
    </details>
  </div>
</th>

                <th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext }}>Allocated Blogs</th>
              </tr>
            </thead>
            <tbody>
              {(authorityPillarAllocations || []).map((p, idx) => (
                <tr key={idx} style={{ borderBottom: `1px solid ${HOUSE.cardBorder}` }}>
                 <td style={{ padding: "10px 8px", fontWeight: 600, fontSize: 13, color: HOUSE.text }}>
                    {String(p?.pillarName || "")}
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 600, color: HOUSE.text }}>
                    {typeof p?.authorityScore === "number" ? p.authorityScore.toFixed(2) : "—"}
                  </td>
                  <td style={{ padding: "10px 8px", fontWeight: 600, color: HOUSE.text }}>
                    {Number(p?.allocatedBlogs || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 4 — Month Tabs + Table */}
      <div style={{ padding: 14, borderRadius: 14, border: `1px solid ${HOUSE.cardBorder}`, background: "white" }}>
        {/* Month tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            onClick={() => setAuthorityActiveMonth(1)}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: `1px solid ${HOUSE.cardBorder}`,
              background: authorityActiveMonth === 1 ? "rgba(30,102,255,0.10)" : "white",
             fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Month 1
          </button>

          <button
            onClick={() => setAuthorityActiveMonth(2)}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: `1px solid ${HOUSE.cardBorder}`,
              background: authorityActiveMonth === 2 ? "rgba(30,102,255,0.10)" : "white",
             fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Month 2
          </button>

          <button
            onClick={() => setAuthorityActiveMonth(3)}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: `1px solid ${HOUSE.cardBorder}`,
              background: authorityActiveMonth === 3 ? "rgba(30,102,255,0.10)" : "white",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Month 3
          </button>

         <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", maxWidth: 720 }}>

            {/* Pillar filter */}
            <select
              value={authorityFilterPillar}
              onChange={(e) => setAuthorityFilterPillar(e.target.value)}
style={{
  padding: "8px 10px",
  borderRadius: 12,
  border: `1px solid ${HOUSE.cardBorder}`,
  fontWeight: 900,
  background: "white",
  minWidth: 220,
}}

            >
              <option value="all">All pillars</option>
              {pillarOptions.map((pn) => (
                <option key={pn} value={pn}>
                  {pn}
                </option>
              ))}
            </select>

            {/* Search */}
            <input
              value={authoritySearch}
              onChange={(e) => setAuthoritySearch(e.target.value)}
              placeholder="Search title or primary keyword…"
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: `1px solid ${HOUSE.cardBorder}`,
                fontWeight: 800,
                minWidth: 320,
              }}
            />
          </div>
        </div>

        {/* Month table */}
        <div style={{ overflowX: "auto" }}>
         <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>

            <thead>
              <tr style={{ textAlign: "left", borderBottom: `1px solid ${HOUSE.cardBorder}` }}>
<th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext, width: 190 }}>Pillar</th>
<th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext, width: 460 }}>Title</th>
<th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext, width: 180 }}>Primary KW</th>
<th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext, width: 130 }}>Intent</th>
<th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext, width: 220 }}>Audience</th>
<th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext, width: 170 }}>Impact</th>
<th style={{ padding: "10px 8px", fontWeight: 800, color: HOUSE.subtext, width: 160 }}>Action</th>

              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => (
                <tr
  key={String(r?.id || idx)}
  style={{
    borderBottom: `1px solid ${HOUSE.cardBorder}`,
    background: idx % 2 === 0 ? "white" : "rgba(30,102,255,0.02)",
  }}
>

<td
  style={{
    padding: "12px 8px",
    fontWeight: 700,
    fontSize: 13,
    color: HOUSE.primaryPurple,
  }}
>
  {String(r?.pillarName || "")}
</td>


                 <td style={{ padding: "12px 8px", fontWeight: 600, fontSize: 13, color: HOUSE.text, maxWidth: 520 }}>

<details>
  <summary
   style={{
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  color: HOUSE.text,
  lineHeight: 1.45,
}}

  >
    {String(r?.blogTitle || "")}
    <span style={{ marginLeft: 8, color: HOUSE.primaryBlue, fontWeight: 600, fontSize: 12 }}>
      View details
    </span>
  </summary>

  <div
    style={{
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      border: `1px solid ${HOUSE.cardBorder}`,
      background: "rgba(30,102,255,0.03)",
      color: HOUSE.subtext,
      fontWeight: 500,
      lineHeight: 1.6,
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        columnGap: 12,
        rowGap: 10,
        alignItems: "start",
      }}
    >
      {r?.slug ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 12, color: HOUSE.subtext }}>Slug</div>
          <div style={{ color: HOUSE.primaryBlue, fontWeight: 700, wordBreak: "break-word" }}>
            {String(r.slug)}
          </div>
        </>
      ) : null}

      {Array.isArray(r?.secondaryKeywords) && r.secondaryKeywords.length ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 12, color: HOUSE.subtext }}>Secondary</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {r.secondaryKeywords.map((k, i) => (
              <span key={i}>
                <StatusPill tone="neutral">{String(k)}</StatusPill>
              </span>
            ))}
          </div>
        </>
      ) : null}

      {r?.synopsis ? (
        <>
         <div style={{ fontWeight: 700, fontSize: 12, color: HOUSE.subtext }}>Synopsis</div>
          <div style={{ color: HOUSE.subtext, fontWeight: 500 }}>
            {String(r.synopsis)}
          </div>
        </>
      ) : null}

      {Array.isArray(r?.internalLinkTargets) && r.internalLinkTargets.length ? (
        <>
         <div style={{ fontWeight: 700, fontSize: 12, color: HOUSE.subtext }}>Internal links</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {r.internalLinkTargets.map((x, i) => (
              <div key={i} style={{ fontWeight: 700 }}>
                <span style={{ fontWeight: 700, color: HOUSE.text }}>
                  {String(x?.anchor || "")}
                </span>{" "}
                <span style={{ color: HOUSE.subtext }}>→</span>{" "}
                <span style={{ color: HOUSE.primaryBlue, fontWeight: 800, wordBreak: "break-word" }}>
                  {String(x?.url || "")}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {r?.ctaFocus ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 12, color: HOUSE.subtext }}>CTA focus</div>
          <div style={{ color: HOUSE.subtext, fontWeight: 500 }}>
            {String(r.ctaFocus)}
          </div>
        </>
      ) : null}
    </div>

  </div>
</details>

                  </td>

<td style={{ padding: "12px 8px", fontWeight: 600, fontSize: 13, color: HOUSE.text }}>
  {String(r?.primaryKeyword || "")}
</td>


<td style={{ padding: "12px 8px", fontWeight: 600, fontSize: 13, color: HOUSE.subtext }}>
  {String(r?.intent || "")}
</td>


<td style={{ padding: "12px 8px", fontWeight: 600, fontSize: 13, color: HOUSE.text }}>
  {String(r?.targetAudience || "")}
</td>



                  <td style={{ padding: "14px 8px" }}>
                    <StatusPill tone="neutral">{String(r?.impactTag || "")}</StatusPill>
                  </td>

              <td style={{ padding: "14px 8px" }}>
  {(() => {
    const rowId = String(
      r?.id ||
        `${authorityActiveMonth}|${r?.pillarName || ""}|${r?.primaryKeyword || ""}|${r?.blogTitle || ""}`
    );
    const isCreating = blogDraftCreatingRowId === rowId;

    // Hard gating:
    // 1) website must be selected
    // 2) Step 8A plan must exist
    const canUse = Boolean(selectedWebsiteId) && authorityPlanExists === true;

    const err = rowId ? String(blogDraftRowErrors?.[rowId] || "") : "";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          disabled={!canUse || isCreating}
          onClick={() => createBlogDraftAndOpenSeo(r)}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: `1px solid ${HOUSE.cardBorder}`,
            background: !canUse ? "#f3f4f6" : HOUSE.primaryBlue,
            color: !canUse ? "#6b7280" : "white",
            fontWeight: 900,
            cursor: !canUse ? "not-allowed" : "pointer",
          }}
          title={
            !selectedWebsiteId
              ? "Select a website first"
              : authorityPlanExists !== true
              ? "Generate Step 8A plan first"
              : ""
          }
        >
          {isCreating ? "Creating…" : "Generate blog in Vyndow SEO"}
        </button>

{selectedWebsiteId && authorityPlanExists !== true ? (
  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 400, lineHeight: 1.35 }}>
    Authority Plan must be generated before creating blog drafts.
  </div>
) : null}

        {err ? (
          <div
            style={{
              fontSize: 12,
              color: "#b91c1c",
              fontWeight: 800,
              lineHeight: 1.35,
            }}
          >
            {err}
          </div>
        ) : null}
      </div>
    );
  })()}
</td>

                </tr>
              ))}

 {!filteredRows.length ? (
  <tr>
    <td colSpan={7} style={{ padding: "16px 10px", color: HOUSE.subtext, fontWeight: 700 }}>
      No rows found for this filter.
    </td>
  </tr>
) : null}

            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
})() : null}

      </div>
    );
  })()}
</StepCard>


      </div>
    </VyndowShell>
  );
}

