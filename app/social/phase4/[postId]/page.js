"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";

import AuthGate from "../../../components/AuthGate";
import VyndowShell from "../../../VyndowShell";
import { auth, db } from "../../../firebaseClient";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";


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
  const [idToken, setIdToken] = useState("");
  const [ownerUid, setOwnerUid] = useState(null);



  const [post, setPost] = useState(null);
  const [text, setText] = useState({
  visualHeadline: "",
  visualSubHeadline: "",
  caption: "",
  cta: "",
  hashtags: [],
});

const [textLoading, setTextLoading] = useState(false);
const [textError, setTextError] = useState("");
  const [copyLocked, setCopyLocked] = useState(false);
const [lockSaving, setLockSaving] = useState(false);
  const [visualLoading, setVisualLoading] = useState(false);
const [visualError, setVisualError] = useState("");
const [staticImageUrl, setStaticImageUrl] = useState("");
const [carouselImageUrls, setCarouselImageUrls] = useState([]);


 async function lockCopyNow() {
  try {
    if (!uid || !websiteId || !postId) return;

    setLockSaving(true);

    const saveRef = doc(
      db,
      "users",
      uid,
      "websites",
      websiteId,
      "modules",
      "social",
      "phase4Posts",
      postId
    );

    await setDoc(
      saveRef,
      {
        copyLocked: true,
        lockedAt: serverTimestamp(),
        lockedBy: uid,
        status: "locked",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setCopyLocked(true);
    setLockSaving(false);
  } catch (e) {
    console.error("lockCopy error:", e);
    setLockSaving(false);
  }
}
 
useEffect(() => {
  if (!uid || !websiteId || !postId) return;

  let cancelled = false;

  async function loadDraft() {
    try {
const draftRef = doc(
  db,
  "users",
  uid,
  "websites",
  websiteId,
  "modules",
  "social",
  "phase4Posts",
  postId
);


      const snap = await getDoc(draftRef);
      if (cancelled) return;
      if (!snap.exists()) return;

      const d = snap.data() || {};

      const hasAny =
        (typeof d.visualHeadline === "string" && d.visualHeadline.trim().length > 0) ||
        (typeof d.visualSubHeadline === "string" && d.visualSubHeadline.trim().length > 0) ||
        (typeof d.caption === "string" && d.caption.trim().length > 0) ||
        (typeof d.cta === "string" && d.cta.trim().length > 0) ||
        (Array.isArray(d.hashtags) && d.hashtags.length > 0);

      if (!hasAny) return;

      setText({
        visualHeadline: d.visualHeadline || "",
        visualSubHeadline: d.visualSubHeadline || "",
        caption: d.caption || "",
        cta: d.cta || "",
        hashtags: Array.isArray(d.hashtags) ? d.hashtags : [],
      });
      setCopyLocked(!!d.copyLocked);
      setStaticImageUrl(typeof d.staticImageUrl === "string" ? d.staticImageUrl : "");
setCarouselImageUrls(Array.isArray(d.carouselImageUrls) ? d.carouselImageUrls : []);


    } catch (e) {
      console.error("loadDraft error:", e);
    }
  }

  loadDraft();

  return () => {
    cancelled = true;
  };
}, [uid, websiteId, postId]);



  // Read-only brief values
  const [toneLabel, setToneLabel] = useState("-");
  const [riskLabel, setRiskLabel] = useState("-");

useEffect(() => {
  const unsub = auth.onAuthStateChanged(async (u) => {
    setUid(u?.uid || null);
    try {
      const t = u ? await u.getIdToken() : "";
      setIdToken(t || "");
    } catch {
      setIdToken("");
    }
  });
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
        // ownerUid is either stored on website doc or defaults to uid
// For now, we assume uid is owner unless your system sets ownerUid elsewhere.
setOwnerUid(uid);


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
    async function saveDraft(nextText) {
  try {
    if (!uid || !websiteId || !postId) return;

const saveRef = doc(
  db,
  "users",
  uid,
  "websites",
  websiteId,
  "modules",
  "social",
  "phase4Posts",
  postId
);


    await setDoc(
      saveRef,
      {
        visualHeadline: nextText.visualHeadline || "",
        visualSubHeadline: nextText.visualSubHeadline || "",
        caption: nextText.caption || "",
        cta: nextText.cta || "",
        hashtags: Array.isArray(nextText.hashtags) ? nextText.hashtags : [],
        status: "draft",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error("saveDraft error:", e);
  }
}
  useEffect(() => {
  if (!post) return;
    if (copyLocked) return;


  const isEmpty =
    (!text.visualHeadline || text.visualHeadline.trim() === "") &&
    (!text.caption || text.caption.trim() === "") &&
    (!text.cta || text.cta.trim() === "") &&
    (!text.hashtags || text.hashtags.length === 0) &&
    (!text.visualSubHeadline || text.visualSubHeadline.trim() === "");

  if (isEmpty) return;

  const t = setTimeout(() => {
    saveDraft(text);
  }, 600);

  return () => clearTimeout(t);
}, [text, post, copyLocked]);

async function generateVisual(mode) {
  try {
    setVisualError("");

    // Only allow visuals when copy is locked
    if (!copyLocked) {
      setVisualError("Lock copy first. Visual generation is only allowed for locked copy.");
      return;
    }

    if (!idToken) {
      setVisualError("Not logged in. Please refresh and try again.");
      return;
    }

    setVisualLoading(true);

    const response = await fetch("/api/social/generatePostVisual", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        mode,
        postId,
        websiteId,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data?.ok) {
      setVisualError(data?.error || "Could not generate visual. Please try again.");
      setVisualLoading(false);
      return;
    }

    if (mode === "static") {
      const url = data?.url || "";
      if (!url) {
        setVisualError("No static image URL returned.");
        setVisualLoading(false);
        return;
      }
      setStaticImageUrl(url);
    }

    if (mode === "carousel") {
      const urls = Array.isArray(data?.urls) ? data.urls : [];
      if (!urls.length) {
        setVisualError("No carousel image URLs returned.");
        setVisualLoading(false);
        return;
      }
      setCarouselImageUrls(urls);
    }

    setVisualLoading(false);
  } catch (e) {
    console.error("generateVisual UI error:", e);
    setVisualError("Could not generate visual. Please try again.");
    setVisualLoading(false);
  }
}

async function generateText() {
  try {
    setTextError("");
    setTextLoading(true);

    if (!idToken) {
      setTextError("Not logged in. Please refresh and try again.");
      setTextLoading(false);
      return;
    }

    const resp = await fetch("/api/social/generatePostText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        websiteId,
        post: {
          platform: post?.platform || "",
          intent: post?.intent || "",
          format: post?.format || "",
          themeTitle: post?.themeTitle || "",
          date: post?.date || "",
        },
      }),
    });

    const data = await resp.json();

    if (!resp.ok || !data?.ok) {
      setTextError(data?.error || "Could not generate text. Please try again.");
      setTextLoading(false);
      return;
    }

    const t = data.text || {};
    const next = {
      visualHeadline: t.visualHeadline || "",
      visualSubHeadline: t.visualSubHeadline || "",
      caption: t.caption || "",
      cta: t.cta || "",
      hashtags: Array.isArray(t.hashtags) ? t.hashtags : [],
    };

    setText(next);
    await saveDraft(next);

    setTextLoading(false);
  } catch (e) {
    console.error("generateText UI error:", e);
    setTextError("Could not generate text. Please try again.");
    setTextLoading(false);
  }
}


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

{/* Step 4A — TEXT FIRST GENERATION (TEXT ONLY) */}
<div style={{ marginTop: 16, padding: 14, borderRadius: 14, border: "1px solid #e5e7eb", background: "white" }}>
  <div style={{ fontWeight: 800, marginBottom: 10 }}>Step 4A — Text</div>

  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
    <button
  disabled={textLoading || copyLocked}
      onClick={generateText}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: textLoading ? "#f3f4f6" : "white",
        cursor: textLoading ? "not-allowed" : "pointer",
        fontWeight: 700,
      }}
    >
      {textLoading ? "Generating…" : text.visualHeadline ? "Regenerate text" : "Generate text"}
    </button>
      <button
  disabled={lockSaving || copyLocked || !text.visualHeadline}
  onClick={lockCopyNow}
  style={{
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: copyLocked ? "#f3f4f6" : "white",
    cursor: copyLocked ? "not-allowed" : "pointer",
    fontWeight: 800,
  }}
>
  {copyLocked ? "Copy locked" : lockSaving ? "Locking…" : "Lock copy"}
</button>

  </div>

  {textError ? (
    <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>
      {textError}
    </div>
  ) : null}

  <div style={{ marginTop: 12, fontSize: 13, color: "#6b7280" }}>
    Text-only generation. You can edit any section after generation.
      {copyLocked ? (
  <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 13 }}>
    ✅ Copy is locked. Editing and regeneration are disabled. Visual generation in Step 3 will use only this locked copy.
  </div>
) : (
  <div style={{ marginTop: 10, fontSize: 13, color: "#6b7280" }}>
    Lock the copy when you are satisfied. Visual generation will only use locked copy.
  </div>
)}

  </div>
      {/* 4 required sections (editable) */}
<div style={{ marginTop: 14, display: "grid", gap: 14 }}>
  {/* 1) Visual Copy (On-Image) */}
  <div style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
    <div style={{ fontWeight: 800, marginBottom: 8 }}>1) Visual Copy (On-Image)</div>

    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Headline (mandatory)</div>
   <input
  value={text.visualHeadline}
  disabled={copyLocked}
  onChange={(e) => setText((prev) => ({ ...prev, visualHeadline: e.target.value }))}
  placeholder="Headline will appear here…"
  style={{
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: copyLocked ? "#f3f4f6" : "white",
    fontSize: 14,
  }}
/>


    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 10, marginBottom: 6 }}>Sub-headline (optional)</div>
    
  </div>

  {/* 2) Caption */}
  <div style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
    <div style={{ fontWeight: 800, marginBottom: 8 }}>2) Caption</div>
<input
  value={text.visualSubHeadline}
  disabled={copyLocked}
  onChange={(e) => setText((prev) => ({ ...prev, visualSubHeadline: e.target.value }))}
  placeholder="Optional sub-headline…"
  style={{
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: copyLocked ? "#f3f4f6" : "white",
    fontSize: 14,
  }}
/>

   <textarea
  value={text.caption}
  disabled={copyLocked}
  onChange={(e) => setText((prev) => ({ ...prev, caption: e.target.value }))}
  placeholder="Caption will appear here…"
  rows={6}
  style={{
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: copyLocked ? "#f3f4f6" : "white",
    fontSize: 14,
    resize: "vertical",
  }}
/>

  </div>

  {/* 3) CTA */}
  <div style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
    <div style={{ fontWeight: 800, marginBottom: 8 }}>3) CTA</div>

   <input
  value={text.cta}
  disabled={copyLocked}
  onChange={(e) => setText((prev) => ({ ...prev, cta: e.target.value }))}
  placeholder='e.g., "Book a demo" or "None required"'
  style={{
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: copyLocked ? "#f3f4f6" : "white",
    fontSize: 14,
  }}
/>

  </div>

  {/* 4) Hashtags */}
  <div style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
    <div style={{ fontWeight: 800, marginBottom: 8 }}>4) Hashtags</div>

    <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
      One per line (we’ll store as a list).
    </div>

   <textarea
  value={(text.hashtags || []).join("\n")}
  disabled={copyLocked}
  onChange={(e) =>
    setText((prev) => ({
      ...prev,
      hashtags: e.target.value
        .split("\n")
        .map((h) => h.trim())
        .filter(Boolean),
    }))
  }
  placeholder={"#example\n#another"}
  rows={5}
  style={{
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: copyLocked ? "#f3f4f6" : "white",
    fontSize: 14,
    resize: "vertical",
  }}
/>

  </div>
</div>

</div>

        </div>
      </VyndowShell>
    </AuthGate>
  );
}
