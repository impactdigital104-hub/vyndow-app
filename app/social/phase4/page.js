"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AuthGate from "../../components/AuthGate";
import VyndowShell from "../../VyndowShell";
import { auth, db } from "../../firebaseClient";

import { doc, getDoc } from "firebase/firestore";

// IMPORTANT: Suspense wrapper (required for useSearchParams in Next App Router)
export default function SocialPhase4EntryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading Phase 4…</div>}>
      <SocialPhase4EntryInner />
    </Suspense>
  );
}

function SocialPhase4EntryInner() {
  const router = useRouter();
  const params = useSearchParams();

  const websiteId = useMemo(() => params?.get("websiteId") || "", [params]);

  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);

  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [calendars, setCalendars] = useState({ linkedin: [], instagram: [] });

  const [selected, setSelected] = useState({ platform: "", postId: "" });

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => setUid(u?.uid || null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) return;

    async function load() {
      try {
        setLoading(true);

        if (!websiteId) {
          setLoading(false);
          return;
        }

        const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          router.replace(`/social/workshop?websiteId=${encodeURIComponent(websiteId)}`);
          return;
        }

        const data = snap.data();

        // Guard: must have Phase 3 completed (locked calendar)
        if (!data?.phase3?.phase3Completed) {
          router.replace(`/social/calendar?websiteId=${encodeURIComponent(websiteId)}`);
          return;
        }

        setWindowStart(data?.phase3?.windowStart || "");
        setWindowEnd(data?.phase3?.windowEnd || "");
        setCalendars(data?.phase3?.calendars || { linkedin: [], instagram: [] });

        setLoading(false);
      } catch (e) {
        console.error("Phase 4 entry load error:", e);
        setLoading(false);
      }
    }

    load();
  }, [uid, websiteId, router]);

  if (!websiteId) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24, maxWidth: 980 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Missing websiteId</div>
            <div style={{ marginTop: 8 }}>
              Please start from <a href="/social">/social</a> and open Phase 4 from there.
            </div>
          </div>
        </VyndowShell>
      </AuthGate>
    );
  }

  if (loading) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24 }}>Loading Phase 4…</div>
        </VyndowShell>
      </AuthGate>
    );
  }

  return (
    <AuthGate>
      <VyndowShell activeModule="social">
        <div style={{ padding: 24, maxWidth: 1100 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0 }}>Phase 4 — Creative Execution</h1>
              <p style={{ marginTop: 8, color: "#374151" }}>
                Locked calendar · Window: {windowStart} to {windowEnd}
              </p>

              <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
                You can now create the social media posts one by one for best results. Please select the post you want to work on.
              </div>
            </div>

            <div style={{ alignSelf: "center" }}>
              <a href={`/social/calendar?websiteId=${encodeURIComponent(websiteId)}`} style={{ textDecoration: "none" }}>
                ← Back to Calendar
              </a>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              disabled={!selected.postId}
              onClick={() => {
                router.push(`/social/phase4/${selected.postId}?websiteId=${encodeURIComponent(websiteId)}`);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: !selected.postId ? "#f3f4f6" : "white",
                cursor: !selected.postId ? "not-allowed" : "pointer",
                fontWeight: 700,
                opacity: !selected.postId ? 0.6 : 1,
              }}
            >
              Create post
            </button>
          </div>

          {Object.entries(calendars).map(([platform, items]) =>
            items.length ? (
              <div key={platform} style={{ marginTop: 24 }}>
                <h3 style={{ textTransform: "capitalize" }}>{platform}</h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px 160px 160px 1fr 120px",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#374151",
                    marginBottom: 10,
                  }}
                >
                  <div>Posting date</div>
                  <div>Post intent</div>
                  <div>Post format</div>
                  <div>Assigned theme</div>
                  <div>Select</div>
                </div>

                {items.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 160px 160px 1fr 120px",
                      gap: 12,
                      border: "1px solid #e5e7eb",
                      padding: 12,
                      marginBottom: 8,
                      borderRadius: 12,
                      background: selected.postId === p.id ? "#fff7ed" : "white",
                      alignItems: "center",
                    }}
                  >
                    <div>{p.date}</div>
                    <div>{p.intent}</div>
                    <div>{p.format}</div>
                    <div>{p.themeTitle || "-"}</div>

                    <div>
                      <button
                        onClick={() => setSelected({ platform, postId: p.id })}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: selected.postId === p.id ? "#111827" : "white",
                          color: selected.postId === p.id ? "white" : "#111827",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        {selected.postId === p.id ? "Selected" : "Select"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null
          )}
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
