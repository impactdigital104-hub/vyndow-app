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

  setExpandedFixByPageId((prev) => ({ ...prev, [pid]: true }));
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
                          <th style={{ padding: "10px 8px" }}>Status</th>
                          <th style={{ padding: "10px 8px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
{sortedPages.map((p) => (
  <>
    <tr
      key={p.id || p.url}
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
                            <td style={{ padding: "10px 8px" }}>
                              {normalizeStatus(p.status) || "—"}
                            </td>
                              <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
<button
 className="btn btn-primary"
 disabled={generatingPageId === (p.id || p.pageId) || !isAnalyzedStatus(p.status)}
  onClick={() => handleGenerateFix(p)}
  title={
    !isAnalyzedStatus(p.status)
      ? "Fix can be generated after analysis is complete."
      : ""
  }
>
{generatingPageId === (p.id || p.pageId) ? "Generating…" : "Generate Fix"}
</button>


{generateErrorByPageId?.[p.id || p.pageId] ? (
    <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 12 }}>
{generateErrorByPageId[p.id || p.pageId]}

    </div>
  ) : null}

  <div style={{ marginTop: 8 }}>
    <button
      className="btn btn-secondary"
      style={{ padding: "6px 10px", fontSize: 12, opacity: 0.9 }}
onClick={() =>
  setExpandedFixByPageId((prev) => ({
    ...prev,
    [p.id || p.pageId]: !prev?.[p.id || p.pageId],
  }))
}

      type="button"
    >
{expandedFixByPageId?.[p.id || p.pageId] ? "Hide Fix Output" : "Show Fix Output"}
    </button>
  </div>
</td>
                          </tr>
{expandedFixByPageId?.[p.id || p.pageId] ? (
  <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
    <td colSpan={3} style={{ padding: "10px 8px", background: "#fafafa" }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Fix Output</div>

      {p?.fixes ? (
        <pre
          style={{
            margin: 0,
            padding: 12,
            border: "1px solid #eee",
            borderRadius: 8,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.4,
            background: "white",
          }}
        >
          {JSON.stringify(p.fixes, null, 2)}
        </pre>
      ) : (
        <div style={{ opacity: 0.75, fontSize: 13 }}>
          No fixes saved yet for this page. Click “Generate Fix”.
        </div>
      )}
    </td>
  </tr>
) : null}
  </>
))}
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
