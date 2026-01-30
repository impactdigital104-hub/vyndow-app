"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";

import AuthGate from "../../../components/AuthGate";
import VyndowShell from "../../../VyndowShell";
import { auth, db } from "../../../firebaseClient";

import { doc, getDoc } from "firebase/firestore";

// IMPORTANT: Suspense wrapper (required for useSearchParams in Next App Router)
export default function SocialPhase4PostPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading post…</div>}>
      <SocialPhase4PostInner />
    </Suspense>
  );
}

function SocialPhase4PostInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const websiteId = useMemo(() => searchParams?.get("websiteId") || "", [searchParams]);
  const postId = useMemo(() => (params?.postId ? String(params.postId) : ""), [params]);

  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);

  const [post, setPost] = useState(null);

  // Read-only brief values
  const [toneLabel, setToneLabel] = useState("-");
  const [riskLabel, setRiskLabel] = useState("-");

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

        if (!postId) {
          setLoading(false);
          return;
        }

        const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          router.replace(`/social/workshop?websiteId=${encodeURIComponent(websiteId)}`);
          return;
        }

        const data = snap.data() || {};

        // Must be Phase 3 locked
        if (!data?.phase3?.phase3Completed) {
          router.replace(`/social/calendar?websiteId=${encodeURIComponent(websiteId)}`);
          return;
        }

        // Find this post from the locked calendar
        const calendars = data?.phase3?.calendars || { linkedin: [], instagram: [] };
        const all = [
          ...(calendars.linkedin || []).map((x) => ({ ...x, platform: "linkedin" })),
          ...(calendars.instagram || []).map((x) => ({ ...x, platform: "instagram" })),
        ];
        const found = all.find((x) => x.id === postId) || null;

        if (!found) {
          router.replace(`/social/phase4?websiteId=${encodeURIComponent(websiteId)}`);
          return;
        }

        setPost(found);

        // ----- Tone (display-only) from voiceSliders -----
        const vs = data?.voiceSliders || {};
        const labels = [];
        if ((vs.formalConversational ?? 50) >= 65) labels.push("Formal");
        if ((vs.aspirationalPractical ?? 50) >= 65) labels.push("Aspirational");
        if ((vs.authorityRelatable ?? 50) >= 65) labels.push("Relatable");
        setToneLabel(labels.length ? labels.join(" · ") : "Neutral");

        // ----- Risk level (display-only) from guardrails presence -----
        const g = data?.guardrails || {};
        const hasToneAvoid = Array.isArray(g.toneToAvoid) && g.toneToAvoid.length > 0;
        const hasTopicsAvoid = typeof g.topicsToAvoid === "string" && g.topicsToAvoid.trim().length > 0;
        const hasVisualAvoid = Array.isArray(g.visualAvoid) && g.visualAvoid.length > 0;

        let risk = "Low";
        if (hasToneAvoid && hasTopicsAvoid) risk = "Medium";
        if (hasToneAvoid && hasTopicsAvoid && hasVisualAvoid) risk = "High";
        setRiskLabel(risk);

        setLoading(false);
      } catch (e) {
        console.error("Phase 4 post load error:", e);
        setLoading(false);
      }
    }

    load();
  }, [uid, websiteId, postId, router]);

  if (!websiteId) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24, maxWidth: 980 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Missing websiteId</div>
            <div style={{ marginTop: 8 }}>Please return to Phase 4 entry and try again.</div>
          </div>
        </VyndowShell>
      </AuthGate>
    );
  }

  if (loading) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24 }}>Loading post…</div>
        </VyndowShell>
      </AuthGate>
    );
  }

  if (!post) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24 }}>Post not found. Returning…</div>
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
              <h1 style={{ margin: 0 }}>Create post</h1>
              <p style={{ marginTop: 8, color: "#374151" }}>
                Platform: <b style={{ textTransform: "capitalize" }}>{post.platform}</b> · Date: <b>{post.date}</b>
              </p>
            </div>

            <div style={{ alignSelf: "center" }}>
              <a href={`/social/phase4?websiteId=${encodeURIComponent(websiteId)}`} style={{ textDecoration: "none" }}>
                ← Back to Phase 4 calendar
              </a>
            </div>
          </div>

          {/* Step 3 — Creative Brief Preview (Read-only) */}
          <div style={{ marginTop: 14, padding: 14, borderRadius: 14, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Creative brief (read-only)</div>

            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, fontSize: 14 }}>
              <div style={{ color: "#6b7280" }}>Platform</div>
              <div style={{ textTransform: "capitalize" }}>{post.platform}</div>

              <div style={{ color: "#6b7280" }}>Theme</div>
              <div>{post.themeTitle || "-"}</div>

              <div style={{ color: "#6b7280" }}>Intent</div>
              <div>{post.intent || "-"}</div>

              <div style={{ color: "#6b7280" }}>Tone</div>
              <div>{toneLabel}</div>

              <div style={{ color: "#6b7280" }}>Risk level</div>
              <div>{riskLabel}</div>
            </div>
          </div>

          {/* Placeholder: Step 4A will come next */}
          <div style={{ marginTop: 16, padding: 14, borderRadius: 14, border: "1px dashed #e5e7eb" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Step 4A — Text (coming next)</div>
            <div style={{ color: "#6b7280", fontSize: 14 }}>
              Next, we will implement Text-First Generation here (Visual Copy, Caption, CTA, Hashtags) with regenerate + manual edit.
            </div>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
