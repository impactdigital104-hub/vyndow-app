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

  // Load run detail
  useEffect(() => {
    async function loadRunDetail() {
      if (!authReady) return;
      if (!runId) return;

      try {
        setLoading(true);
        setError("");
        setRun(null);
        setPages([]);

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
      } catch (e) {
        setError(e?.message || "Unknown error loading run detail.");
      } finally {
        setLoading(false);
      }
    }

    loadRunDetail();
  }, [authReady, runId, websiteId]);

  const sortedPages = useMemo(() => {
    const arr = Array.isArray(pages) ? [...pages] : [];
    // keep stable, but if you later add "createdAt" you can sort here
    return arr;
  }, [pages]);

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
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPages.map((p) => (
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
                              {p.status || "—"}
                            </td>
                          </tr>
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
