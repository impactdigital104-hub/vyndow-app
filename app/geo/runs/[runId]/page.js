"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../../../VyndowShell";
import { auth } from "../../../firebaseClient";
// ---------- GEO UI styles (Phase 6: visual polish) ----------
const GEO_UI = {
  card: {
    border: "1px solid #ececf6",
    borderRadius: 14,
    background: "linear-gradient(180deg, #fbfaff 0%, #ffffff 70%)",
    boxShadow: "0 1px 10px rgba(17, 24, 39, 0.05)",
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 900,
    color: "#2d1b69",
    marginBottom: 10,
    fontSize: 14,
  },
  sectionChip: {
    fontSize: 12,
    fontWeight: 800,
    padding: "4px 10px",
    borderRadius: 999,
    background: "#f5f3ff",
    border: "1px solid #e9d5ff",
    color: "#4c1d95",
  },
  headerWrap: {
    ...({
      border: "1px solid #ececf6",
      borderRadius: 14,
      padding: 14,
      background: "linear-gradient(135deg, #f5f3ff 0%, #ffffff 60%)",
      boxShadow: "0 1px 12px rgba(17, 24, 39, 0.05)",
    }),
  },
  statPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #ececf6",
    background: "#ffffff",
    fontSize: 12,
    fontWeight: 800,
    color: "#111827",
  },
  statLabel: { fontSize: 11, opacity: 0.7, fontWeight: 800 },
  breakdownGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 12,
    fontSize: 13,
  },
  breakdownCard: {
    border: "1px solid #e9d5ff",
    borderRadius: 12,
    padding: 10,
    background: "linear-gradient(180deg, #fbf7ff 0%, #ffffff 70%)",
  },
  list: { marginTop: 0, marginBottom: 0, paddingLeft: 0, listStyle: "none" },
  listItem: {
    border: "1px solid #ececf6",
    borderRadius: 12,
    padding: 12,
    background: "#ffffff",
    marginBottom: 10,
  },
  muted: { opacity: 0.75 },
};
// ------------------------------------------------------------

export default function GeoRunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const runId = params?.runId;
  const websiteId = searchParams?.get("websiteId") || "";

  const [authReady, setAuthReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [run, setRun] = useState(null);
  const [pages, setPages] = useState([]);
    // Phase 3 auto-worker (make analysis automatic on this page)
  const [autoWorkerRunning, setAutoWorkerRunning] = useState(false);
  const [autoWorkerMsg, setAutoWorkerMsg] = useState("");
  const [autoWorkerErr, setAutoWorkerErr] = useState("");


  // Phase 4 UI state (Generate Fix)
  const [generatingPageId, setGeneratingPageId] = useState(null);
  const [generateErrorByPageId, setGenerateErrorByPageId] = useState({});
  const [expandedFixByPageId, setExpandedFixByPageId] = useState({});
  const [expandedAuditByPageId, setExpandedAuditByPageId] = useState({});
    // Phase 4 Part C UI state (Fix Output accordion + copy feedback)
  const [openFixSectionByPageId, setOpenFixSectionByPageId] = useState({});
  const [copiedByKey, setCopiedByKey] = useState({});

  function setCopied(pid, section) {
    const key = `${pid}:${section}`;
    setCopiedByKey((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopiedByKey((prev) => ({ ...prev, [key]: false }));
    }, 1200);
  }

  async function copyToClipboard(text, pid, section) {
    try {
      const value = String(text || "");
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(pid, section);
    } catch (e) {
      // ignore
    }
  }

  function hasPlaceholders(str) {
    return /\{\{[^}]+\}\}/.test(String(str || ""));
  }

function extractPlaceholders(str) {
  const s = String(str || "");
  const found = new Set();
  const re = /\{\{([^}]+)\}\}/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) found.add(m[1].trim());
  }
  return Array.from(found);
}

function renderPlaceholderNote(text) {
  const ph = extractPlaceholders(text);
  if (!ph.length) return null;

  
  return (
    <div style={{ marginTop: 8, fontSize: 12, color: "#92400e" }}>
      <b>Inputs needed before publishing:</b>{" "}
      {ph.map((p, i) => (
        <span key={p}>
          <code>{`{{${p}}}`}</code>{i < ph.length - 1 ? ", " : ""}
        </span>
      ))}
    </div>
  );
}


  function parseTldrToBullets(tldr) {
    const raw = String(tldr || "");
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^[-*•]\s*/, ""));
    return lines.length ? lines : raw ? [raw] : [];
  }



  async function handleExportPdf() {
    try {
      if (!runId || !websiteId) {
        alert("Missing runId or websiteId.");
        return;
      }

      const user = auth?.currentUser;
      if (!user) {
        alert("You are not logged in.");
        return;
      }

      const token = await user.getIdToken();

      const resp = await fetch("/api/geo/exportPdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ runId, websiteId }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data?.error || "PDF export failed");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e?.message || "PDF export failed");
    }
  }

  // Auth gate
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setAuthReady(true);
    });
    return () => (typeof unsub === "function" ? unsub() : undefined);
  }, [router]);

   async function refreshRunDetail() {
    if (!authReady) return;
    if (!runId) return;

    const token = await auth.currentUser.getIdToken();
    const resp = await fetch("/api/geo/runDetail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ runId, websiteId }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || "Failed to load run detail");
    }

    setRun(data.run || null);
    setPages(Array.isArray(data.pages) ? data.pages : []);
  }

  // Load run detail
  useEffect(() => {
    async function load() {
      if (!authReady) return;
      if (!runId) return;

      try {
        setLoading(true);
        setError("");
        setRun(null);
        setPages([]);

        await refreshRunDetail();
      } catch (e) {
        setError(e?.message || "Unknown error loading run detail.");
      } finally {
        setLoading(false);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, runId, websiteId]);

  // Auto-trigger Phase 3 worker while pages are queued/processing.
  // This makes "Create Audit Run" feel automatic: user lands here and it starts moving.
  useEffect(() => {
    if (!authReady) return;
    if (!runId) return;
    if (!websiteId) return;
    if (!run) return;
    if (!Array.isArray(pages) || pages.length === 0) return;

    const unfinished = pages.filter((p) =>
      ["queued", "fetching", "processing"].includes(
        String(p.status || "").toLowerCase()
      )
    );

    // Stop if everything is done
    if (unfinished.length === 0) {
      setAutoWorkerMsg("Analysis complete.");
      setAutoWorkerErr("");
      setAutoWorkerRunning(false);
      return;
    }

    // If worker is already running, don't start another
    if (autoWorkerRunning) return;

    let cancelled = false;

    async function tick() {
      try {
        setAutoWorkerRunning(true);
        setAutoWorkerErr("");
        setAutoWorkerMsg(
          `Analyzing… ${pages.length - unfinished.length}/${pages.length} completed`
        );

        const token = await auth.currentUser.getIdToken();

        const resp = await fetch("/api/geo/worker/process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.ok) {
          throw new Error(data?.error || "Worker failed");
        }

        // Refresh run detail after worker does a pass
        await refreshRunDetail();

        if (!cancelled) {
          setAutoWorkerMsg(
            data?.message ||
              `Worker ran. Analyzed: ${data?.analyzedCount ?? 0} page(s).`
          );
        }
      } catch (e) {
        if (!cancelled) setAutoWorkerErr(e?.message || "Worker error");
      } finally {
        if (!cancelled) setAutoWorkerRunning(false);
      }
    }

    // Run one pass now
    tick();

    // Poll every 4 seconds until done (safe + simple)
    const interval = setInterval(() => {
      if (!cancelled) tick();
    }, 4000);


    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, runId, websiteId, run, pages]);

  async function handleGenerateFix(page) {
 const pid = page?.id || page?.pageId;
if (!pid) return;


    try {
setGeneratingPageId(pid);
      setGenerateErrorByPageId((prev) => ({ ...prev, [pid]: "" }));

      const token = await auth.currentUser.getIdToken();

      const resp = await fetch("/api/geo/generateFix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          runId,
          websiteId,
          pageId: pid,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to generate fix");
      }

      // Expect API to return an updated page doc
if (data.page) {
  setPages((prev) =>
    (Array.isArray(prev) ? prev : []).map((p) => {
      const left = p?.id || p?.pageId;
      const right = data?.page?.id || data?.page?.pageId;
      return left === right ? { ...p, ...data.page } : p;
    })
  );

  // auto-open audit + fix output once generated
  setExpandedAuditByPageId((prev) => ({ ...prev, [pid]: true }));
  setExpandedFixByPageId((prev) => ({ ...prev, [pid]: true }));
    setOpenFixSectionByPageId((prev) => ({ ...prev, [pid]: "combinedPatchPack" }));


}

    } catch (e) {
      setGenerateErrorByPageId((prev) => ({
        ...prev,
   [pid]: e?.message || "Unknown error generating fix",
      }));
    } finally {
      setGeneratingPageId(null);
    }
  }

  const sortedPages = useMemo(() => {
    const arr = Array.isArray(pages) ? [...pages] : [];
    // keep stable, but if you later add "createdAt" you can sort here
    return arr;
  }, [pages]);
  // ---------- GEO STATUS HELPERS (DO NOT EDIT) ----------
function normalizeStatus(s) {
  return String(s || "").toLowerCase().trim();
}

function isAnalyzedStatus(s) {
  const x = normalizeStatus(s);
  return x === "analyzed" || x === "analysed";
}
function getRunDisplayStatus(pagesArr) {
  const arr = Array.isArray(pagesArr) ? pagesArr : [];
  if (!arr.length) return "processing";

  const statuses = arr.map((p) => normalizeStatus(p?.status));
  const hasError = statuses.includes("error");
  const unfinished = statuses.some((s) =>
    ["queued", "fetching", "processing"].includes(s)
  );

  if (hasError) return "error";
  if (unfinished) return "processing";
  return "complete";
}

function renderRunStatusPill(status) {
  const s = normalizeStatus(status);

  const style =
    s === "complete"
      ? { background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0" }
      : s === "error"
      ? { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }
      : { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" };

  const label = s === "complete" ? "Complete" : s === "error" ? "Error" : "Processing";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 900,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

function renderStrengthPill(strength) {
  const s = String(strength || "").toLowerCase();
  const label = s === "strong" ? "Strong" : s === "medium" ? "Medium" : "Weak";

  const style =
    s === "strong"
      ? { background: "#ecfdf5", color: "#065f46" }
      : s === "medium"
      ? { background: "#fffbeb", color: "#92400e" }
      : { background: "#fef2f2", color: "#991b1b" };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        ...style,
      }}
    >
      {label}
    </span>
  );
}

// -----------------------------------------------------


  if (!authReady) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Checking login…
      </div>
    );
  }

  return (
    <VyndowShell activeModule="geo">
      <main className="page">
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ marginBottom: 6 }}>Run Details</h1>
            <p style={{ marginTop: 0, opacity: 0.9 }}>
              Run ID:{" "}
              <span
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {runId}
              </span>
            </p>
          </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
  <button
    className="btn btn-soft-primary"
    onClick={() => alert("PDF export is temporarily disabled while the report format is being finalized.")}
    disabled={!runId || !websiteId}
    title="Export a client-ready PDF report"
  >
    Export PDF
  </button>

  <button
    className="btn btn-secondary"
    onClick={() => router.push("/geo/runs")}
  >
    ← Back to Runs
  </button>
</div>

        </header>
        {(autoWorkerMsg || autoWorkerErr) ? (
          <div style={{ marginTop: 10 }}>
            {autoWorkerMsg ? (
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                {autoWorkerMsg} {autoWorkerRunning ? "⏳" : ""}
              </div>
            ) : null}
            {autoWorkerErr ? (
              <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 13 }}>
                {autoWorkerErr}
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="inputs-section">
          <div className="output-card" style={{ width: "100%" }}>
            {loading ? (
              <div style={{ padding: 14 }}>Loading run…</div>
            ) : error ? (
              <div style={{ padding: 14, color: "#b91c1c" }}>{error}</div>
            ) : !run ? (
              <div style={{ padding: 14, opacity: 0.75 }}>
                No run found.
              </div>
            ) : (
              <div style={{ padding: 14 }}>
              <div
  style={{
    display: "flex",
    gap: 28,
    flexWrap: "wrap",
    marginBottom: 18,
  }}
>

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Status</div>
                    <div style={{ fontWeight: 700 }}>
  {renderRunStatusPill(getRunDisplayStatus(sortedPages))}
</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Pages</div>
                    <div style={{ fontWeight: 700 }}>
                      {run.pagesCount ?? "—"}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Month</div>
                    <div style={{ fontWeight: 700 }}>{run.month || "—"}</div>
                  </div>


                </div>

                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Pages in this run
                </div>

                {sortedPages.length === 0 ? (
                  <div style={{ opacity: 0.75 }}>No pages found.</div>
                ) : (
                  <div style={{ width: "100%", overflowX: "auto" }}>
   <table style={{ width: "100%", borderCollapse: "collapse" }}>
  <thead>
    <tr
      style={{
        textAlign: "left",
        borderBottom: "1px solid #eee",
      }}
    >
      <th style={{ padding: "10px 8px" }}>URL</th>
      <th style={{ padding: "10px 8px" }}>GEO Score</th>
      <th style={{ padding: "10px 8px" }}>Status</th>
      <th style={{ padding: "10px 8px" }}>Actions</th>
    </tr>
  </thead>

  <tbody>
    {sortedPages.map((p) => {
      const pid = p?.id || p?.pageId;
      const statusText = normalizeStatus(p.status) || "—";

return (
  <Fragment key={pid || p.url}>

          {/* Row 1: Summary */}
          <tr
            key={pid || p.url}
            style={{
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            <td style={{ padding: "10px 8px" }}>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: "underline" }}
              >
                {p.url}
              </a>
            </td>

            <td style={{ padding: "10px 8px", fontWeight: 700 }}>
              {typeof p.geoScore === "number" ? p.geoScore : "—"}
            </td>

            <td style={{ padding: "10px 8px" }}>{statusText}</td>

            <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
              <button
  className="btn btn-primary"
  style={{ padding: "6px 12px", fontSize: 12 }}

                type="button"
                onClick={() => {
                  if (!pid) return;
                  setExpandedAuditByPageId((prev) => ({
                    ...prev,
                    [pid]: !prev?.[pid],
                  }));
                }}
                title={!pid ? "Page id missing for this row" : ""}
              >
                {expandedAuditByPageId?.[pid] ? "Hide Audit" : "View Audit"}
              </button>
            </td>
          </tr>

          {/* Row 2: Expanded Audit Report + Generate Fix */}
          {pid && expandedAuditByPageId?.[pid] ? (
            <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
             <td colSpan={4} style={{ padding: "8px 8px", background: "#fafafa" }}>
<div style={GEO_UI.headerWrap}>
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
    <div style={GEO_UI.sectionTitle}>
      <span style={GEO_UI.sectionChip}>Audit Report</span>
      <span style={{ fontWeight: 900, color: "#111827" }}>GEO summary & diagnostics</span>
    </div>

    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <div style={GEO_UI.statPill}>
        <span style={GEO_UI.statLabel}>GEO Score</span>
        <span style={{ fontSize: 14 }}>
          {typeof p.geoScore === "number" ? p.geoScore : "—"}
        </span>
      </div>

      <div style={GEO_UI.statPill}>
        <span style={GEO_UI.statLabel}>Status</span>
        <span>{statusText}</span>
      </div>
    </div>
  </div>
</div>


                <div style={{ marginBottom: 10 }}>
            {/* SCORE BREAKDOWN (A–H) */}
<div style={{ ...GEO_UI.card, padding: 14, marginBottom: 16 }}>

  <div style={{ fontWeight: 900, marginBottom: 10, color: "#2d1b69" }}>
    Score Breakdown (A–H)
  </div>
      {/* GEO Category Legend */}
<div
  style={{
    fontSize: 12,
    color: "#555",
    marginBottom: 12,
    lineHeight: 1.6,
  }}
>
  <strong>A</strong> = Content Quality & Relevance&nbsp;&nbsp;|&nbsp;&nbsp;
  <strong>B</strong> = Freshness & Update Signals&nbsp;&nbsp;|&nbsp;&nbsp;
  <strong>C</strong> = E-E-A-T (Experience, Expertise, Authority, Trust)
  <br />
  <strong>D</strong> = On-Page Structure & Semantics&nbsp;&nbsp;|&nbsp;&nbsp;
  <strong>E</strong> = Structured Data / Schema&nbsp;&nbsp;|&nbsp;&nbsp;
  <strong>F</strong> = Intent & Decision Readiness
  <br />
  <strong>G</strong> = Internal & External Linking&nbsp;&nbsp;|&nbsp;&nbsp;
  <strong>H</strong> = Technical Accessibility & Indexability
</div>


  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
      gap: 10,
      fontSize: 13,
    }}
  >
    {p.breakdown &&
      Object.entries(p.breakdown).map(([key, val]) => (
      <div
  key={key}
  style={{
    ...GEO_UI.breakdownCard,
    background:
      (val.subScore ?? 0) >= 4
        ? "linear-gradient(180deg, #ecfdf5 0%, #ffffff 70%)"
        : (val.subScore ?? 0) >= 2
        ? "linear-gradient(180deg, #fffbeb 0%, #ffffff 70%)"
        : "linear-gradient(180deg, #fef2f2 0%, #ffffff 70%)",
    borderColor:
      (val.subScore ?? 0) >= 4
        ? "#a7f3d0"
        : (val.subScore ?? 0) >= 2
        ? "#fde68a"
        : "#fecaca",
  }}
>

          <div style={{ fontWeight: 700 }}>Category {key}</div>
          <div>Score: {val.subScore ?? 0} / 5</div>
          <div>Points: {val.points ?? 0}</div>
          <div>Weight: {val.weight ?? 0}</div>
        </div>
      ))}
  </div>
</div>
             <div style={GEO_UI.sectionTitle}>
  <span style={GEO_UI.sectionChip}>Issues Found</span>
  <span style={GEO_UI.muted}>What blocks AI from answering confidently</span>
</div>

                  {Array.isArray(p.issues) && p.issues.length > 0 ? (
                 <ul style={GEO_UI.list}>
{p.issues.map((it, idx) => (
<li
  key={idx}
  style={{
    ...GEO_UI.listItem,
    borderLeft: "4px solid #f59e0b",
    background: "#fffbeb",
  }}
>

    <div style={{ fontWeight: 700 }}>
      [{it?.category || "—"}] {it?.title || "Issue"}{" "}
      <span style={{ opacity: 0.75 }}>
        ({it?.severity || "—"})
      </span>
    </div>

    {it?.why ? (
      <div style={{ marginTop: 4 }}>
        <b>Why:</b> {it.why}
      </div>
    ) : null}

    {it?.fix ? (
      <div style={{ marginTop: 4 }}>
        <b>Fix:</b> {it.fix}
      </div>
    ) : null}
  </li>
))}

                    </ul>
                  ) : (
                   

                    <div style={{ opacity: 0.75 }}>No issues found.</div>
                  )}
                </div>

                <div style={{ marginBottom: 12 }}>
              <div style={GEO_UI.sectionTitle}>
  <span style={GEO_UI.sectionChip}>Suggestions</span>
  <span style={GEO_UI.muted}>Fast improvements that lift your score</span>
</div>
                  {Array.isArray(p.suggestions) && p.suggestions.length > 0 ? (
                    <ul style={GEO_UI.list}>
{p.suggestions.map((it, idx) => (
<li
  key={idx}
  style={{
    ...GEO_UI.listItem,
    borderLeft: "4px solid #3b82f6",
    background: "#eff6ff",
  }}
>

    <div style={{ fontWeight: 700 }}>
      [{it?.category || "—"}] {it?.title || "Suggestion"}
    </div>

    {it?.description ? (
      <div style={{ marginTop: 4 }}>
        {it.description}
      </div>
    ) : null}

    {it?.impact ? (
      <div style={{ marginTop: 4, opacity: 0.85 }}>
        <b>Impact:</b> {it.impact}
      </div>
    ) : null}
  </li>
))}

                    </ul>
                  ) : (
                    <div style={{ opacity: 0.75 }}>No suggestions available.</div>
                  )}
                </div>

                {/* Phase 5C: AI Answer Readiness */}
                {Array.isArray(run?.aiQuestions) && run.aiQuestions.length ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>
                      AI Answer Readiness (Max 5)
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10, lineHeight: 1.45 }}>
                      This simulates how confidently an AI can answer these questions using only the content on this page.
                      (Single-URL runs only.)
                    </div>

                    {p?.aiAnswerReadinessError ? (
                      <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 10 }}>
                        AI readiness error: {String(p.aiAnswerReadinessError)}
                      </div>
                    ) : null}

                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
                      Evaluated:{" "}
                      {p?.aiAnswerReadinessEvaluatedAt?.toDate
                        ? p.aiAnswerReadinessEvaluatedAt.toDate().toLocaleString()
                        : p?.aiAnswerReadinessEvaluatedAt
                        ? "Yes"
                        : "—"}
                    </div>

                    {Array.isArray(p?.aiAnswerReadiness) && p.aiAnswerReadiness.length ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        {p.aiAnswerReadiness.map((r, idx) => (
                          <div
                            key={idx}
                            style={{
                              border: "1px solid #eee",
                              borderRadius: 10,
                              padding: 12,
                              background: "#fff",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                              <div style={{ fontWeight: 900, lineHeight: 1.35 }}>
                                Q{idx + 1}. {r?.question || "—"}
                              </div>
                              {renderStrengthPill(r?.strength)}
                            </div>

                            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                              <b>Answer excerpt:</b>{" "}
                              <span style={{ opacity: 0.95 }}>
                                {r?.answerExcerpt || "—"}
                              </span>
                            </div>

                            {r?.missingReason ? (
                              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>
                                <b>What’s missing:</b>{" "}
                                <span style={{ opacity: 0.9 }}>{r.missingReason}</span>
                              </div>
                            ) : null}

                            {r?.sourceHint ? (
                              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                                <b>Source hint:</b> {r.sourceHint}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ opacity: 0.75, fontSize: 13 }}>
                        No AI readiness results yet. (It will appear once analysis completes.)
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Generate Fix is ONLY here (inside the audit report) */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    disabled={
                      generatingPageId === pid || !isAnalyzedStatus(p.status)
                    }
                    onClick={() => handleGenerateFix(p)}
                    title={
                      !isAnalyzedStatus(p.status)
                        ? "Fix can be generated only after analysis is complete."
                        : ""
                    }
                  >
                    {generatingPageId === pid ? "Generating…" : "Generate Fix"}
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ padding: "6px 10px", fontSize: 12, opacity: 0.9 }}
                    onClick={() =>
                      setExpandedFixByPageId((prev) => ({
                        ...prev,
                        [pid]: !prev?.[pid],
                      }))
                    }
                    type="button"
                  >
                    {expandedFixByPageId?.[pid] ? "Hide Fix Output" : "Show Fix Output"}
                  </button>
                </div>

                {generateErrorByPageId?.[pid] ? (
                  <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 12 }}>
                    {generateErrorByPageId[pid]}
                  </div>
                ) : null}

                {expandedFixByPageId?.[pid] ? (
                  <div style={{ marginTop: 12 }}>
                    <div
  style={{
    fontWeight: 900,
    marginBottom: 10,
    color: "#2d1b69",
    letterSpacing: "0.2px",
  }}
>
  Fix Output
</div>


            <div
  style={{
    fontSize: 12,
    opacity: 0.85,
    marginBottom: 10,
    lineHeight: 1.45,
  }}
>
  These are AI-generated suggestions. Please verify accuracy before publishing.
</div>

{p?.fixes ? (() => {
  const fixes = p.fixes || {};
  const openKey = openFixSectionByPageId?.[pid] || "";

 const impactByKey = {
  combinedPatchPack: { level: "High", note: "Fastest path: one copy-paste bundle that improves machine readability + trust signals." },
  implementationMap: { level: "High", note: "Tells exactly where each block goes so a non-technical user can implement safely." },
  tldr: { level: "Medium", note: "Quick summary of what changed and why." },
  updatedReviewedSnippet: { level: "High", note: "Adds recency signal. Improves trust for answer engines." },
  entityBlock: { level: "Medium", note: "Clarifies entities + basic E-E-A-T/contact cues." },
  faqHtml: { level: "High", note: "Adds answerable content to match user intents." },
  faqJsonLdScript: { level: "High", note: "Structured FAQ for extraction by answer engines." },
  faqJsonLd: { level: "Medium", note: "Raw JSON for developers to merge with existing schema." },
};

function renderImpactBadge(key) {
  const meta = impactByKey[key];
  if (!meta) return null;

  const color = meta.level === "High" ? "#065f46" : meta.level === "Medium" ? "#1f2937" : "#6b7280";
  const bg = meta.level === "High" ? "#ecfdf5" : meta.level === "Medium" ? "#f3f4f6" : "#f9fafb";

  return (
    <div style={{ marginBottom: 10 }}>
      <span style={{ display: "inline-block", fontSize: 12, fontWeight: 800, padding: "4px 8px", borderRadius: 999, background: bg, color }}>
        Impact: {meta.level}
      </span>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>{meta.note}</div>
    </div>
  );
}
  function estimateUpliftRange(page) {
    const breakdown = page?.breakdown || {};
    // Points per category are already computed by Phase 4 worker.
    const pts = (k) => Number(breakdown?.[k]?.points || 0);
    const max = { A: 18, B: 12, C: 16, D: 12, E: 14, F: 14, G: 8, H: 6 };

    // Combined Patch Pack primarily improves: B (freshness), E (schema), A (answerability via FAQ),
    // plus a bit of C (entity clarity).
    const impacted = ["B", "E", "A", "C"];

    // Remaining gap in impacted categories
    let gap = 0;
    for (const k of impacted) {
      gap += Math.max(0, (max[k] || 0) - pts(k));
    }

    // Directional band: we assume user implements correctly, but we stay conservative.
    const low = Math.max(0, Math.round(gap * 0.35));
    const high = Math.max(low, Math.round(gap * 0.65));

    // Cap the band so it never looks crazy (and never implies certainty)
    const cappedLow = Math.min(low, 18);
    const cappedHigh = Math.min(high, 28);

    return { low: cappedLow, high: cappedHigh };
  }

  const sections = [
    {
  key: "implementationMap",
  title: "Implementation Steps (where to paste what)",
  copyText: JSON.stringify(fixes.implementationMap || [], null, 2),
  body: (
    <div>
          {renderImpactBadge("implementationMap")}
      {Array.isArray(fixes.implementationMap) && fixes.implementationMap.length ? (
        <ol style={{ marginTop: 0, marginBottom: 0, paddingLeft: 18 }}>
          {fixes.implementationMap.map((s, i) => (
            <li key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 800 }}>{s?.title || `Step ${i + 1}`}</div>
              {s?.whereToPaste ? (
                <div style={{ marginTop: 4 }}>
                  <b>Where:</b> {s.whereToPaste}
                </div>
              ) : null}
              {s?.copyKey ? (
                <div style={{ marginTop: 4 }}>
                  <b>Copy this block:</b>{" "}
                  <code style={{ fontSize: 12 }}>{s.copyKey}</code>
                </div>
              ) : null}
              {s?.notes ? (
                <div style={{ marginTop: 4, opacity: 0.9 }}>
                  <b>Note:</b> {s.notes}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <div style={{ opacity: 0.75 }}>No implementation steps available.</div>
      )}
      {renderPlaceholderNote(JSON.stringify(fixes.implementationMap || []))}
    </div>
  ),
},
{
  key: "combinedPatchPack",
  title: "Combined Patch Pack (Copy All)",
  copyText: String(fixes.combinedPatchPack || ""),
  body: (
    <div>
        {renderImpactBadge("combinedPatchPack")}
              {(() => {
        const band = estimateUpliftRange(p);
        return (
          <div style={{
            marginBottom: 10,
            padding: "10px 12px",
            border: "1px solid #fde68a",
            background: "#fffbeb",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.45
          }}>
            <div style={{ fontWeight: 900 }}>
              Estimated GEO readiness uplift: +{band.low} to +{band.high} points
            </div>
            <div style={{ marginTop: 4, opacity: 0.9 }}>
              Directional estimate based on likely gains from freshness signals, structured data, and FAQ answerability.
              Not a re-scan and not a guarantee.
            </div>
          </div>
        );
      })()}
              <div style={{
        marginBottom: 14,
        padding: "12px 14px",
        border: "1px solid #e5e7eb",
        background: "#f9fafb",
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.5
      }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>
          What will change if you apply this fix
        </div>
{(() => {
  const bullets = [];

  const hasUpdated = String(fixes?.updatedReviewedSnippet || "").trim().length > 0;
  const hasFaqHtml = String(fixes?.faqHtml || "").trim().length > 0;
  const hasFaqJson = String(fixes?.faqJsonLdScript || "").trim().length > 0;
  const hasEntities = String(fixes?.entityBlock || "").trim().length > 0;

  if (hasUpdated) {
    bullets.push("Your page will clearly indicate when it was last updated.");
  }

  if (hasFaqHtml || hasFaqJson) {
    bullets.push("Search engines will detect structured FAQ-style answers instead of plain paragraphs.");
  }

  if (hasEntities) {
    bullets.push("Important entities (brand, product, location, topic) will become explicit and machine-readable.");
  }

  // Always true when any patch pack exists (safe, non-technical benefit)
  bullets.push("The content becomes easier for AI systems to extract and summarize accurately.");

  return (
    <ul style={{ paddingLeft: 18, margin: 0 }}>
      {bullets.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
})()}

      </div>

                   
      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10, lineHeight: 1.45 }}>
        Copy and paste this as a single bundle. If your page already has JSON-LD, merge instead of duplicating.
      </div>
      <pre style={{
        margin: 0,
        padding: 12,
        border: "1px solid #eee",
        borderRadius: 8,
        overflowX: "auto",
        fontSize: 12,
        lineHeight: 1.45,
        background: "white",
          borderLeft: "4px solid #7c3aed",
background: "#ffffff",
borderRadius: 10,
boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
padding: 14,
      }}>{String(fixes.combinedPatchPack || "")}</pre>
      {renderPlaceholderNote(fixes.combinedPatchPack)}
    </div>
  ),
},

    {
      key: "tldr",
      title: "TL;DR (quick actions)",
      copyText: String(fixes.tldr || ""),
      body: (
        <div>
              {renderImpactBadge("tldr")}
          {parseTldrToBullets(fixes.tldr).length ? (
            <ul style={{ marginTop: 0, marginBottom: 0, paddingLeft: 18 }}>
              {parseTldrToBullets(fixes.tldr).map((b, i) => (
                <li key={i} style={{ marginBottom: 6 }}>{b}</li>
              ))}
            </ul>
          ) : (
            <div style={{ opacity: 0.75 }}>No TL;DR available.</div>
          )}
          {renderPlaceholderNote(fixes.tldr)}
        </div>
      )
    },
    {
      key: "updatedReviewedSnippet",
      title: "Updated / Reviewed snippet (HTML)",
      copyText: String(fixes.updatedReviewedSnippet || ""),
      body: (
        <div>
              {renderImpactBadge("updatedReviewedSnippet")}
          <pre style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            background: "white",
            borderLeft: "4px solid #7c3aed",
background: "#ffffff",
borderRadius: 10,
boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
padding: 14,
          }}>{String(fixes.updatedReviewedSnippet || "")}</pre>
          {renderPlaceholderNote(fixes.updatedReviewedSnippet)}
        </div>
      )
    },
    {
      key: "entityBlock",
      title: "Entities covered block",
      copyText: String(fixes.entityBlock || ""),
      body: (
        <div>
              {renderImpactBadge("entityBlock")}
          <pre style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            background: "white",
            borderLeft: "4px solid #7c3aed",
background: "#ffffff",
borderRadius: 10,
boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
padding: 14,
          }}>{String(fixes.entityBlock || "")}</pre>
          {renderPlaceholderNote(fixes.entityBlock)}
        </div>
      )
    },
    {
      key: "faqHtml",
      title: "FAQ block (HTML)",
      copyText: String(fixes.faqHtml || ""),
      body: (
        <div>
              {renderImpactBadge("faqHtml")}
          <pre style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            background: "white",
            borderLeft: "4px solid #7c3aed",
background: "#ffffff",
borderRadius: 10,
boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
padding: 14,
          }}>{String(fixes.faqHtml || "")}</pre>
          {renderPlaceholderNote(fixes.faqHtml)}
        </div>
      )
    },
    {
  key: "faqJsonLdScript",
  title: "FAQ JSON-LD Script Tag (ready to paste)",
  copyText: String(fixes.faqJsonLdScript || ""),
  body: (
    <div>
          {renderImpactBadge("faqJsonLdScript")}
      <pre style={{
        margin: 0,
        padding: 12,
        border: "1px solid #eee",
        borderRadius: 8,
        overflowX: "auto",
        fontSize: 12,
        lineHeight: 1.45,
        background: "white",
        borderLeft: "4px solid #7c3aed",
background: "#ffffff",
borderRadius: 10,
boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
padding: 14,
      }}>{String(fixes.faqJsonLdScript || "")}</pre>
      {renderPlaceholderNote(fixes.faqJsonLdScript)}
    </div>
  )
},
     {
      key: "faqJsonLd",
      title: "FAQ JSON-LD (paste into <script type=\"application/ld+json\">)",
      copyText: JSON.stringify(fixes.faqJsonLd || {}, null, 2),
      body: (
        <div>
              {renderImpactBadge("faqJsonLd")}
          <pre style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            background: "white",
            borderLeft: "4px solid #7c3aed",
background: "#ffffff",
borderRadius: 10,
boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
padding: 14,
          }}>{JSON.stringify(fixes.faqJsonLd || {}, null, 2)}</pre>
          {renderPlaceholderNote(JSON.stringify(fixes.faqJsonLd || {}))}
        </div>
      )
    },
  ];

  return (
    <div>
      {sections.map((s) => {
        const isOpen = openKey === s.key;
        const copiedKey = `${pid}:${s.key}`;
        const copied = Boolean(copiedByKey?.[copiedKey]);

        return (
<div
  key={s.key}
  style={{
    border: "1px solid #ececf6",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    background: "#ffffff",
    boxShadow: "0 1px 8px rgba(17,24,39,0.05)",
  }}
>

<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    background: isOpen
      ? "linear-gradient(90deg, #f5f3ff 0%, #ffffff 70%)"
      : "#f8fafc",
    borderBottom: "1px solid #e9d5ff",
    borderLeft: isOpen ? "4px solid #7c3aed" : "4px solid transparent",
  }}
>

              <button
                type="button"
                onClick={() =>
                  setOpenFixSectionByPageId((prev) => ({
                    ...prev,
                    [pid]: prev?.[pid] === s.key ? "" : s.key,
                  }))
                }
                style={{
                  appearance: "none",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                  fontWeight: 800,
                  fontSize: 13,
                  flex: 1,
                  color: "#2d1b69",
lineHeight: 1.25,

                }}
                aria-expanded={isOpen}
              >
                {s.title}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
               style={{
  padding: "6px 14px",
  fontSize: 12,
  whiteSpace: "nowrap",
  borderRadius: 999,
  background: copied ? "#ecfdf5" : "#ffffff",
  border: copied ? "1px solid #a7f3d0" : "1px dashed #e9d5ff",
  color: copied ? "#065f46" : "#6d28d9",
  fontWeight: 800,
}}

                onClick={() => copyToClipboard(s.copyText, pid, s.key)}
                title="Copy to clipboard"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>

            {isOpen ? (
              <div style={{ padding: 12 }}>
                {s.body}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
})() : (
  <div style={{ opacity: 0.75, fontSize: 13 }}>
    No fixes saved yet for this page. Click “Generate Fix”.
  </div>
)}

                  </div>
                ) : null}
              </td>
            </tr>
          ) : null}
            </Fragment>
      );
    })}
  </tbody>
</table>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </VyndowShell>
  );
}
