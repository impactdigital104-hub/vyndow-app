"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";

import AuthGate from "../../../components/AuthGate";
import VyndowShell from "../../../VyndowShell";
import { auth, db } from "../../../firebaseClient";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const EMPTY_CREATIVE_BRIEF = {
  marketingAngle: "",
  audienceInsight: "",
  coreMessage: "",
  campaignObjective: "",
  funnelStage: "awareness",
  visualConcept: "",
  subject: "",
  environment: "",
  mood: "",
  lighting: "",
  composition: "",
  negativeSpace: "",
  headlineDirection: "",
  ctaDirection: "",
  avoid: [],
  uniquenessNotes: "",
};

const CREATIVE_BRIEF_FIELDS = [
  ["marketingAngle", "Marketing angle"],
  ["audienceInsight", "Audience insight"],
  ["coreMessage", "Core message"],
  ["campaignObjective", "Campaign objective"],
  ["visualConcept", "Visual concept"],
  ["subject", "Subject"],
  ["environment", "Environment"],
  ["mood", "Mood"],
  ["lighting", "Lighting"],
  ["composition", "Composition"],
  ["negativeSpace", "Negative space"],
  ["headlineDirection", "Headline direction"],
  ["ctaDirection", "CTA direction"],
  ["uniquenessNotes", "Uniqueness notes"],
];

function editableBriefFrom(value) {
  const brief = value && typeof value === "object" ? value : {};
  return {
    ...EMPTY_CREATIVE_BRIEF,
    ...Object.fromEntries(
      CREATIVE_BRIEF_FIELDS.map(([key]) => [
        key,
        typeof brief[key] === "string" ? brief[key] : "",
      ])
    ),
    funnelStage: ["awareness", "consideration", "conversion", "retention"].includes(brief.funnelStage)
      ? brief.funnelStage
      : "awareness",
    avoid: Array.isArray(brief.avoid)
      ? brief.avoid.filter((item) => typeof item === "string")
      : [],
  };
}

function formatBriefDate(value) {
  if (!value) return "-";
  let date = null;
  if (typeof value === "string" || typeof value === "number") date = new Date(value);
  else if (typeof value?.toDate === "function") date = value.toDate();
  else if (typeof value?._seconds === "number") date = new Date(value._seconds * 1000);
  else if (typeof value?.seconds === "number") date = new Date(value.seconds * 1000);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "-";
}


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
const [visualLoadingMode, setVisualLoadingMode] = useState("");
const [visualError, setVisualError] = useState("");
const [staticImageUrl, setStaticImageUrl] = useState("");
const [carouselImageUrls, setCarouselImageUrls] = useState([]);
const [downloadLoading, setDownloadLoading] = useState(false);
const [downloadError, setDownloadError] = useState("");

const [creativeBrief, setCreativeBrief] = useState(null);
const [creativeBriefForm, setCreativeBriefForm] = useState(EMPTY_CREATIVE_BRIEF);
const [creativeBriefLoading, setCreativeBriefLoading] = useState(false);
const [creativeBriefAction, setCreativeBriefAction] = useState("");
const [creativeBriefError, setCreativeBriefError] = useState("");
const [creativeBriefEditing, setCreativeBriefEditing] = useState(false);


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
  if (!idToken || !websiteId || !postId) return;

  let cancelled = false;

  async function loadCreativeBrief() {
    try {
      setCreativeBriefLoading(true);
      setCreativeBriefError("");
      const response = await fetch("/api/social/generateCreativeBrief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action: "load", websiteId, postId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Could not load the creative brief.");
      }
      if (cancelled) return;
      setCreativeBrief(data.brief || null);
      setCreativeBriefForm(editableBriefFrom(data.brief));
      setCreativeBriefEditing(data.brief?.status !== "approved");
    } catch (error) {
      if (!cancelled) setCreativeBriefError(error?.message || "Could not load the creative brief.");
    } finally {
      if (!cancelled) setCreativeBriefLoading(false);
    }
  }

  loadCreativeBrief();
  return () => {
    cancelled = true;
  };
}, [idToken, websiteId, postId]);


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


async function runCreativeBriefAction(action) {
  if (creativeBriefLoading) return;

  try {
    setCreativeBriefError("");
    if (!idToken) {
      setCreativeBriefError("Not logged in. Please refresh and try again.");
      return;
    }

    if (action === "generate" && creativeBrief) {
      const confirmed = window.confirm(
        "The current creative brief will be replaced and approval will reset to Draft. Existing copy and images will remain unchanged."
      );
      if (!confirmed) return;
    }

    setCreativeBriefLoading(true);
    setCreativeBriefAction(action);

    const payload = { action, websiteId, postId };
    if (action === "save" || action === "approve") payload.brief = creativeBriefForm;

    const response = await fetch("/api/social/generateCreativeBrief", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Could not update the creative brief.");
    }

    setCreativeBrief(data.brief || null);
    setCreativeBriefForm(editableBriefFrom(data.brief));
    setCreativeBriefEditing(data.brief?.status !== "approved");
  } catch (error) {
    setCreativeBriefError(error?.message || "Could not update the creative brief.");
  } finally {
    setCreativeBriefLoading(false);
    setCreativeBriefAction("");
  }
}

function updateCreativeBriefField(key, value) {
  setCreativeBriefForm((current) => ({ ...current, [key]: value }));
}

async function generateVisual(mode) {
  if (visualLoading) return;

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
    setVisualLoadingMode(mode);

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

    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (e) {
      data = null;
    }

    if (!response.ok || !data?.ok) {
      const msg =
        data?.error ||
        (raw && raw.length ? raw.slice(0, 200) : "") ||
        "Could not generate visual. Please try again.";
      setVisualError(msg);
      return;
    }

    if (mode === "static") {
      const url = data?.url || "";
      if (!url) {
        setVisualError("No static image URL returned.");
        return;
      }
      setStaticImageUrl(url);
    }

    if (mode === "carousel") {
      const urls = Array.isArray(data?.urls) ? data.urls : [];
      if (!urls.length) {
        setVisualError("No carousel image URLs returned.");
        return;
      }
      setCarouselImageUrls(urls);
    }
  } catch (e) {
    console.error("generateVisual UI error:", e);
    setVisualError("Could not generate visual. Please try again.");
  } finally {
    setVisualLoading(false);
    setVisualLoadingMode("");
  }
}

async function downloadStaticImage() {
  if (!staticImageUrl || downloadLoading) return;

  const filename = `vyndow-social-static-${postId}.png`;

  function openDirectDownloadFallback() {
    const link = document.createElement("a");
    link.href = staticImageUrl;
    link.download = filename;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  try {
    setDownloadError("");
    setDownloadLoading(true);

    try {
      const response = await fetch(staticImageUrl, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (fetchError) {
      console.warn("Blob download unavailable; using direct download fallback:", fetchError);
      openDirectDownloadFallback();
    }
  } catch (e) {
    console.error("downloadStaticImage error:", e);
    setDownloadError(
      "Could not start the image download. Please try again."
    );
  } finally {
    setDownloadLoading(false);
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

          {/* Existing post context */}
          <div style={{ marginTop: 14, padding: 14, borderRadius: 14, border: "1px solid #e5e7eb", background: "#f9fafb" }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Post context</div>

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



{/* Phase 2A-1 — Creative Brief */}
<div style={{ marginTop: 16, padding: 14, borderRadius: 14, border: "1px solid #dbeafe", background: "#ffffff" }}>
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <div>
      <div style={{ fontWeight: 800, fontSize: 17 }}>Creative Brief</div>
      <div style={{ marginTop: 4, color: "#6b7280", fontSize: 13 }}>
        Define and approve the strategic and visual direction for this post. Approval is not yet required for copy or image generation.
      </div>
    </div>
    {creativeBrief ? (
      <span style={{ padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, background: creativeBrief.status === "approved" ? "#dcfce7" : "#fef3c7", color: creativeBrief.status === "approved" ? "#166534" : "#92400e" }}>
        {creativeBrief.status === "approved" ? "Approved" : "Draft"}
      </span>
    ) : null}
  </div>

  {creativeBriefError ? (
    <div role="alert" style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
      {creativeBriefError}
    </div>
  ) : null}

  {creativeBriefLoading && creativeBriefAction === "" ? (
    <div style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>Loading creative brief…</div>
  ) : null}

  {!creativeBrief && !creativeBriefLoading ? (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 12, border: "1px dashed #cbd5e1", background: "#f8fafc" }}>
      <div style={{ fontWeight: 700 }}>No creative brief has been generated for this post.</div>
      <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>Generate one from the confirmed brand, calendar post and selected theme.</div>
      <button type="button" onClick={() => runCreativeBriefAction("generate")} disabled={creativeBriefLoading} style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid #2563eb", background: creativeBriefLoading ? "#f3f4f6" : "#2563eb", color: creativeBriefLoading ? "#6b7280" : "white", cursor: creativeBriefLoading ? "not-allowed" : "pointer", fontWeight: 800 }}>
        {creativeBriefAction === "generate" ? "Generating…" : "Generate Creative Brief"}
      </button>
    </div>
  ) : null}

  {creativeBrief ? (
    <>
      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => runCreativeBriefAction("generate")} disabled={creativeBriefLoading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: creativeBriefLoading ? "#f3f4f6" : "white", cursor: creativeBriefLoading ? "not-allowed" : "pointer", fontWeight: 800 }}>
          {creativeBriefAction === "generate" ? "Regenerating…" : "Regenerate Creative Brief"}
        </button>
        {creativeBrief.status === "approved" && !creativeBriefEditing ? (
          <button type="button" onClick={() => setCreativeBriefEditing(true)} disabled={creativeBriefLoading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontWeight: 800 }}>Edit approved brief</button>
        ) : null}
        {creativeBriefEditing ? (
          <>
            <button type="button" onClick={() => runCreativeBriefAction("save")} disabled={creativeBriefLoading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: creativeBriefLoading ? "#f3f4f6" : "white", cursor: creativeBriefLoading ? "not-allowed" : "pointer", fontWeight: 800 }}>
              {creativeBriefAction === "save" ? "Saving…" : "Save changes"}
            </button>
            <button type="button" onClick={() => runCreativeBriefAction("approve")} disabled={creativeBriefLoading} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #166534", background: creativeBriefLoading ? "#f3f4f6" : "#166534", color: creativeBriefLoading ? "#6b7280" : "white", cursor: creativeBriefLoading ? "not-allowed" : "pointer", fontWeight: 800 }}>
              {creativeBriefAction === "approve" ? "Approving…" : "Approve brief"}
            </button>
          </>
        ) : null}
      </div>

      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", fontSize: 13 }}>
        The current creative brief will be replaced and approval will reset to Draft. Existing copy and images will remain unchanged.
      </div>

      {creativeBrief.status === "approved" ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", fontSize: 13 }}>
          <b>Approved by you</b> · {formatBriefDate(creativeBrief.approvedAt)}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Funnel stage</div>
          <select value={creativeBriefForm.funnelStage} disabled={!creativeBriefEditing} onChange={(e) => updateCreativeBriefField("funnelStage", e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: creativeBriefEditing ? "white" : "#f3f4f6", fontSize: 14 }}>
            <option value="awareness">Awareness</option>
            <option value="consideration">Consideration</option>
            <option value="conversion">Conversion</option>
            <option value="retention">Retention</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Canvas (fixed)</div>
          <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f3f4f6", fontSize: 14 }}>1080 × 1080 · 1:1</div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
        {CREATIVE_BRIEF_FIELDS.map(([key, label]) => (
          <div key={key}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{label}</div>
            <textarea value={creativeBriefForm[key]} disabled={!creativeBriefEditing} onChange={(e) => updateCreativeBriefField(key, e.target.value)} rows={key === "coreMessage" || key === "visualConcept" || key === "uniquenessNotes" ? 4 : 3} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: creativeBriefEditing ? "white" : "#f3f4f6", fontSize: 14, resize: "vertical" }} />
          </div>
        ))}
        <div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>Avoid — one item per line</div>
          <textarea value={(creativeBriefForm.avoid || []).join("\n")} disabled={!creativeBriefEditing} onChange={(e) => updateCreativeBriefField("avoid", e.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} rows={5} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: creativeBriefEditing ? "white" : "#f3f4f6", fontSize: 14, resize: "vertical" }} />
        </div>
      </div>

      <div style={{ marginTop: 12, color: "#6b7280", fontSize: 12 }}>
        Generated: {formatBriefDate(creativeBrief.generatedAt)} · Last updated: {formatBriefDate(creativeBrief.updatedAt)}
      </div>
    </>
  ) : null}
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
{/* Step 4B — Visuals */}
<div style={{ marginTop: 16, padding: 14, borderRadius: 14, border: "1px solid #e5e7eb", background: "white" }}>
  <div style={{ fontWeight: 800, marginBottom: 10 }}>Step 4B — Visuals</div>

  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
    Visual generation is enabled only after copy is locked. This step will not change your text.
  </div>

  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
    <button
      disabled={visualLoading || !copyLocked}
      onClick={() => generateVisual("static")}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: visualLoading || !copyLocked ? "#f3f4f6" : "white",
        cursor: visualLoading || !copyLocked ? "not-allowed" : "pointer",
        fontWeight: 800,
      }}
    >
      {visualLoadingMode === "static"
        ? "Generating static…"
        : staticImageUrl
          ? "Regenerate static"
          : "Generate static"}
    </button>

    <button
      disabled={visualLoading || !copyLocked}
      onClick={() => generateVisual("carousel")}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: visualLoading || !copyLocked ? "#f3f4f6" : "white",
        cursor: visualLoading || !copyLocked ? "not-allowed" : "pointer",
        fontWeight: 800,
      }}
    >
      {visualLoadingMode === "carousel"
        ? "Generating carousel…"
        : carouselImageUrls?.length
          ? "Regenerate carousel"
          : "Generate carousel"}
    </button>
  </div>

  {!copyLocked ? (
    <div style={{ marginTop: 10, fontSize: 13, color: "#b45309" }}>
      🔒 Lock copy first to enable visual generation.
    </div>
  ) : null}

  {visualLoading ? (
    <div
      role="status"
      aria-live="polite"
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 10,
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
        color: "#1e3a8a",
        fontSize: 13,
      }}
    >
      {visualLoadingMode === "static"
        ? "Image is being generated. Please wait — this may take up to a minute."
        : "Carousel is being generated. Please wait — this may take up to a minute."}
    </div>
  ) : null}

  {visualError ? (
    <div
      role="alert"
      style={{
        marginTop: 10,
        padding: 12,
        borderRadius: 10,
        border: "1px solid #fecaca",
        background: "#fef2f2",
        color: "#991b1b",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 800 }}>Image generation failed</div>
      <div style={{ marginTop: 4 }}>{visualError}</div>
      <div style={{ marginTop: 4 }}>Please try again.</div>
    </div>
  ) : null}

  {staticImageUrl ? (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Static preview</div>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#f9fafb" }}>
        <img
          src={staticImageUrl}
          alt="Static visual"
          style={{
            width: "100%",
            maxWidth: 760,
            height: "auto",
            maxHeight: "78vh",
            objectFit: "contain",
            display: "block",
            margin: "0 auto",
          }}
        />
      </div>
      <button
        type="button"
        disabled={downloadLoading}
        onClick={downloadStaticImage}
        style={{
          marginTop: 10,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: downloadLoading ? "#f3f4f6" : "white",
          cursor: downloadLoading ? "not-allowed" : "pointer",
          fontWeight: 800,
        }}
      >
        {downloadLoading ? "Preparing download…" : "Download Static Image"}
      </button>
      {downloadError ? (
        <div
          role="alert"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: 13,
          }}
        >
          {downloadError}
        </div>
      ) : null}
    </div>
  ) : null}

  {carouselImageUrls?.length ? (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Carousel preview</div>
      <div style={{ display: "grid", gap: 10 }}>
        {(carouselImageUrls || []).map((u, i) => (
          <div key={u + i} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#f9fafb" }}>
            <img src={u} alt={`Carousel slide ${i + 1}`} style={{ width: "100%", display: "block" }} />
          </div>
        ))}
      </div>
    </div>
  ) : null}
</div>

</div>

        </div>
      </VyndowShell>
    </AuthGate>
  );
}
