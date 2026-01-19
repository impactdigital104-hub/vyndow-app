"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../../../VyndowShell";
import { auth } from "../../../firebaseClient";

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

  function renderPlaceholderNote(text) {
    return hasPlaceholders(text) ? (
      <div style={{ marginTop: 8, fontSize: 12, color: "#92400e" }}>
        Note: Replace placeholders like <code>{{"{{ADD_DATE}}"}}</code> before publishing.
      </div>
    ) : null;
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
    setOpenFixSectionByPageId((prev) => ({ ...prev, [pid]: "tldr" }));

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

          <button className="btn btn-secondary" onClick={() => router.push("/geo/runs")}>
            ← Back to Runs
          </button>
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
                    gap: 18,
                    flexWrap: "wrap",
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Status</div>
                    <div style={{ fontWeight: 700 }}>{run.status || "—"}</div>
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

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Created</div>
                    <div style={{ fontWeight: 700 }}>
                      {run.createdAt?.toDate
                        ? run.createdAt.toDate().toLocaleString()
                        : "—"}
                    </div>
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
        <>
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
                className="btn btn-secondary"
                style={{ padding: "6px 10px", fontSize: 12 }}
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
              <td colSpan={4} style={{ padding: "12px 8px", background: "#fafafa" }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>
                  Audit Report
                </div>

                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>GEO Score</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>
                      {typeof p.geoScore === "number" ? p.geoScore : "—"}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Status</div>
                    <div style={{ fontWeight: 700 }}>{statusText}</div>
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
            {/* SCORE BREAKDOWN (A–H) */}
<div
  style={{
    border: "1px solid #eee",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    background: "#fafafa",
  }}
>
  <div style={{ fontWeight: 700, marginBottom: 8 }}>
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
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: 8,
            background: "#fff",
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
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Issues Found</div>
                  {Array.isArray(p.issues) && p.issues.length > 0 ? (
                    <ul style={{ marginTop: 0, marginBottom: 0, paddingLeft: 18 }}>
{p.issues.map((it, idx) => (
  <li key={idx} style={{ marginBottom: 10 }}>
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
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Suggestions</div>
                  {Array.isArray(p.suggestions) && p.suggestions.length > 0 ? (
                    <ul style={{ marginTop: 0, marginBottom: 0, paddingLeft: 18 }}>
{p.suggestions.map((it, idx) => (
  <li key={idx} style={{ marginBottom: 10 }}>
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
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Fix Output</div>

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

  const sections = [
    {
      key: "tldr",
      title: "TL;DR (quick actions)",
      copyText: String(fixes.tldr || ""),
      body: (
        <div>
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
          <pre style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            background: "white",
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
          <pre style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            background: "white",
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
          <pre style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            background: "white",
          }}>{String(fixes.faqHtml || "")}</pre>
          {renderPlaceholderNote(fixes.faqHtml)}
        </div>
      )
    },
    {
      key: "faqJsonLd",
      title: "FAQ JSON-LD (paste into <script type=\"application/ld+json\">)",
      copyText: JSON.stringify(fixes.faqJsonLd || {}, null, 2),
      body: (
        <div>
          <pre style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.45,
            background: "white",
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
          <div key={s.key} style={{
            border: "1px solid #eee",
            borderRadius: 10,
            marginBottom: 10,
            overflow: "hidden",
            background: "#fff",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              background: "#fafafa",
              borderBottom: isOpen ? "1px solid #eee" : "none",
            }}>
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
                }}
                aria-expanded={isOpen}
              >
                {s.title}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "6px 10px", fontSize: 12, whiteSpace: "nowrap" }}
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

                    )}
                  </div>
                ) : null}
              </td>
            </tr>
          ) : null}
        </>
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
