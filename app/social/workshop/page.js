"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "../../components/AuthGate";
import VyndowShell from "../../VyndowShell";
import { auth, db } from "../../firebaseClient";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";


export default function SocialWorkshopPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading workshop…</div>}>
      <SocialWorkshopInner />
    </Suspense>
  );
}

function SocialWorkshopInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const websiteId = useMemo(() => {
    return searchParams?.get("websiteId") || "";
  }, [searchParams]);

  const [uid, setUid] = useState(null);

  // Workshop state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [currentStep, setCurrentStep] = useState(0);

  // Step 0 inputs
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [brandName, setBrandName] = useState("");
    // Step 1 inputs (Brand Context)
  const [industry, setIndustry] = useState("");
  const [businessType, setBusinessType] = useState(""); // b2b|b2c|hybrid
  const [geography, setGeography] = useState("");
    // Step 2 (Platform Focus)
  const [platformFocus, setPlatformFocus] = useState(""); // linkedin|instagram|both
    // Step 3 (Brand Voice & Personality)
  const [formalConversational, setFormalConversational] = useState(50);
  const [boldConservative, setBoldConservative] = useState(50);
  const [educationalOpinionated, setEducationalOpinionated] = useState(50);
  const [founderBrand, setFounderBrand] = useState(50);
  const [aspirationalPractical, setAspirationalPractical] = useState(50);
  const [authorityRelatable, setAuthorityRelatable] = useState(50);
    // Step 4 (Visual Direction)
  const [colors, setColors] = useState([]); // array of hex strings like "#111111"
  const [colorInput, setColorInput] = useState("#000000");
  const [visualStyle, setVisualStyle] = useState(""); // minimal|editorial|illustration|photo|data
  const [typography, setTypography] = useState(""); // modern|classic|playful|neutral
    // Step 5 (Strategic Intent + Risk Appetite)
  const [primaryObjective, setPrimaryObjective] = useState("");
  const [secondaryObjective, setSecondaryObjective] = useState("");
  const [riskAppetite, setRiskAppetite] = useState(""); // safe|balanced|bold


    // Step 6 (Guardrails) — optional
  const [topicsToAvoid, setTopicsToAvoid] = useState("");
  const [toneToAvoid, setToneToAvoid] = useState([]); // array of strings
  const [visualAvoid, setVisualAvoid] = useState([]); // array of strings

  const [logoFileMeta, setLogoFileMeta] = useState(null); // {name,size,type} (no upload yet)
  const [logoUrl, setLogoUrl] = useState(""); // download URL after upload
const [logoError, setLogoError] = useState(""); // inline validation message



  // Hard-stop rule: user must either accept defaults OR move each slider once
  const [acceptedDefaults, setAcceptedDefaults] = useState(false);
  const [touchedSliders, setTouchedSliders] = useState({
    formalConversational: false,
    boldConservative: false,
    educationalOpinionated: false,
    founderBrand: false,
    aspirationalPractical: false,
    authorityRelatable: false,
  });




  // Scan stub UI
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
    const [scanSuggestedColors, setScanSuggestedColors] = useState([]); // hex list from scan (stub)
  const colorPickerRef = useRef(null);


  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Auth → uid
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUid(u?.uid || null);
    });
    return () => unsub();
  }, []);

  // Load existing draft (resume)
  useEffect(() => {
    if (!uid) return;

    async function loadExisting() {
      try {
        setLoading(true);
        setLoadError("");

        if (!websiteId) {
          setLoading(false);
          return;
        }

        const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();

          // Resume fields if present
          setWebsiteUrl(data?.websiteUrl || "");
          setBrandName(data?.brandName || "");
                    setIndustry(data?.industry || "");
          setBusinessType(data?.businessType || "");
          setGeography(data?.geography || "");
                    setPlatformFocus(data?.platformFocus || "");
                    // Step 3 resume (if present)
          const vs = data?.voiceSliders || {};
          if (typeof vs.formalConversational === "number") setFormalConversational(vs.formalConversational);
          if (typeof vs.boldConservative === "number") setBoldConservative(vs.boldConservative);
          if (typeof vs.educationalOpinionated === "number") setEducationalOpinionated(vs.educationalOpinionated);
          if (typeof vs.founderBrand === "number") setFounderBrand(vs.founderBrand);
          if (typeof vs.aspirationalPractical === "number") setAspirationalPractical(vs.aspirationalPractical);
          if (typeof vs.authorityRelatable === "number") setAuthorityRelatable(vs.authorityRelatable);

          // If Step 3 already has values saved, allow continue without forcing re-click
          if (
            typeof vs.formalConversational === "number" &&
            typeof vs.boldConservative === "number" &&
            typeof vs.educationalOpinionated === "number" &&
            typeof vs.founderBrand === "number" &&
            typeof vs.aspirationalPractical === "number" &&
            typeof vs.authorityRelatable === "number"
          ) {
            setAcceptedDefaults(true);
            setTouchedSliders({
              formalConversational: true,
              boldConservative: true,
              educationalOpinionated: true,
              founderBrand: true,
              aspirationalPractical: true,
              authorityRelatable: true,
            });
          }
          // Step 4 resume (Visual)
          const v = data?.visual || {};
          if (Array.isArray(v.colors)) setColors(v.colors);
          if (typeof v.visualStyle === "string") setVisualStyle(v.visualStyle);
          if (typeof v.typography === "string") setTypography(v.typography);
          if (v.logoAssetRef) setLogoFileMeta(v.logoAssetRef);
          if (typeof v.logoUrl === "string") setLogoUrl(v.logoUrl);

                    // Step 5 resume (Strategy)
          const s = data?.strategy || {};
          if (typeof s.primaryObjective === "string") setPrimaryObjective(s.primaryObjective);
          if (typeof s.secondaryObjective === "string") setSecondaryObjective(s.secondaryObjective);
          if (typeof s.riskAppetite === "string") setRiskAppetite(s.riskAppetite);


                    // Step 6 resume (Guardrails)
          const g = data?.guardrails || {};
          if (typeof g.topicsToAvoid === "string") setTopicsToAvoid(g.topicsToAvoid);
          if (Array.isArray(g.toneToAvoid)) setToneToAvoid(g.toneToAvoid);
          if (Array.isArray(g.visualAvoid)) setVisualAvoid(g.visualAvoid);


                    // Suggested colors (from scan) if present
          const suggested = data?.meta?.scanSuggestedColors;
          if (Array.isArray(suggested)) setScanSuggestedColors(suggested);





          // Resume step if present
          if (typeof data?.currentStep === "number") {
            setCurrentStep(data.currentStep);
          } else {
            setCurrentStep(0);
          }
        } else {
          setCurrentStep(0);
        }
      } catch (e) {
        console.error("Social workshop load error:", e);
        setLoadError(e?.message || "Failed to load saved draft.");
      } finally {
        setLoading(false);
      }
    }

    loadExisting();
  }, [uid, websiteId]);

  async function checkHasTransparency(file) {
  // Best-effort check: ensure at least SOME pixels have alpha < 255.
  // This is not perfect, but it enforces “transparent PNG” better than a plain warning.
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // Sample pixels (every ~20px) to keep it fast
          const step = Math.max(1, Math.floor(Math.min(width, height) / 50));
          for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
              const i = (y * width + x) * 4;
              const alpha = data[i + 3]; // 0..255
              if (alpha < 250) {
                resolve(true);
                return;
              }
            }
          }
          resolve(false);
        } catch (e) {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);

      const url = URL.createObjectURL(file);
      img.src = url;
    } catch (e) {
      resolve(false);
    }
  });
}

async function uploadLogo(file) {
  setLogoError("");

  if (!file) return;

  // 1) PNG only
  if (file.type !== "image/png") {
    setLogoError("Please upload a PNG file only.");
    return;
  }

  // 2) Enforce transparency (best-effort)
  const hasTransparency = await checkHasTransparency(file);
  if (!hasTransparency) {
    setLogoError("Please upload a transparent PNG logo to continue.");
    return;
  }

  // 3) Upload to Firebase Storage
  try {
    setSaving(true);

    const storage = getStorage();
    const safeName = (file.name || "logo.png").replace(/\s+/g, "-");
    const path = `brand-logos/${uid}/${websiteId}-${Date.now()}-${safeName}`;
    const r = storageRef(storage, path);

    const snap = await uploadBytes(r, file, { contentType: "image/png" });
    const url = await getDownloadURL(snap.ref);

    // Save into state
    setLogoUrl(url);
    setLogoFileMeta({
      name: file.name,
      size: file.size,
      type: file.type,
      storagePath: path,
    });

    // Also persist immediately so refresh doesn’t lose it
    const refDoc = doc(db, "users", uid, "websites", websiteId, "modules", "social");
    await setDoc(
      refDoc,
      {
        visual: {
          logoUrl: url,
          logoAssetRef: {
            name: file.name,
            size: file.size,
            type: file.type,
            storagePath: path,
          },
          logoUploadedAt: serverTimestamp(),
        },
        meta: { updatedAt: serverTimestamp() },
      },
      { merge: true }
    );
  } catch (e) {
    console.error("Logo upload error:", e);
    setLogoError("Logo upload failed. Please try again.");
  } finally {
    setSaving(false);
  }
}

  function normalizeUrl(input) {
    const raw = (input || "").trim();
    if (!raw) return "";
    if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
      return `https://${raw}`;
    }
    return raw;
  }

  async function saveDraft(nextStepNumber) {
    if (!uid) return;
    if (!websiteId) return;

    setSaving(true);
    setSaveError("");

    try {
      const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");

      const payload = {
        websiteUrl: normalizeUrl(websiteUrl),
        brandName: (brandName || "").trim() || null,
                // Step 1
        industry: industry || null,
        businessType: businessType || null,
        geography: geography || null,
                // Step 2
        platformFocus: platformFocus || null,
                // Step 3 (voice sliders)
        voiceSliders: {
          formalConversational,
          boldConservative,
          educationalOpinionated,
          founderBrand,
          aspirationalPractical,
          authorityRelatable,
        },
        // Step 4 (Visual)
visual: {
  colors: colors || [],
  visualStyle: visualStyle || null,
  typography: typography || null,

  // Phase 1.1 — mandatory logo
  logoUrl: logoUrl || null,
  logoAssetRef: logoFileMeta || null,
  // (optional) timestamp will be written when upload happens; keep it out of draft payload to avoid overwriting
},

        // Step 5 (Strategy)
        strategy: {
          primaryObjective: primaryObjective || null,
          secondaryObjective: secondaryObjective || null,
          riskAppetite: riskAppetite || null,
        },
        // Step 6 (Guardrails)
        guardrails: {
          topicsToAvoid: (topicsToAvoid || "").trim() || null,
          toneToAvoid: Array.isArray(toneToAvoid) ? toneToAvoid : [],
          visualAvoid: Array.isArray(visualAvoid) ? visualAvoid : [],
        },



        currentStep: nextStepNumber,
        phase1Completed: false,
        version: "v1.1",
               meta: {
          updatedAt: serverTimestamp(),
          scanSuggestedColors: scanSuggestedColors || [],
        },

      };

      await setDoc(
        ref,
        {
          ...payload,
          meta: {
            ...(payload.meta || {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },

        },
        { merge: true }
      );
    } catch (e) {
      console.error("Social draft save error:", e);
      setSaveError(e?.message || "Failed to save draft.");
      throw e;
    } finally {
      setSaving(false);
    }
   }

  async function finishPhase1() {

    if (!uid) return;
    if (!websiteId) return;

    setSaving(true);
    setSaveError("");

    try {
      const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");

      await setDoc(
        ref,
        {
          phase1Completed: true,
          currentStep: 8,
          meta: {
            updatedAt: serverTimestamp(),
            completedAt: serverTimestamp(),
          },
        },
        { merge: true }
      );

      setCurrentStep(8);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error("Finish Phase 1 error:", e);
      setSaveError(e?.message || "Failed to finish Phase 1.");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function handleScan() {
    setScanMsg("");
    const url = normalizeUrl(websiteUrl);
    if (!url) {
      setScanMsg("Please enter your website URL first.");
      return;
    }

    setScanning(true);
    try {
      await new Promise((r) => setTimeout(r, 900));
      setScanMsg("Scan stub (v1): Website scan UI is ready. We’ll wire real detection later.");
            // Scan stub (v1): suggested colors (replace later with real detection)
      setScanSuggestedColors(["#111111", "#FF6A00", "#0EA5E9", "#16A34A", "#7C3AED"]);

    } finally {
      setScanning(false);
    }
  }

  async function handleContinue() {
    const url = normalizeUrl(websiteUrl);
    if (!url) return;

    await saveDraft(1);
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const canContinue = !!normalizeUrl(websiteUrl) && !saving;

  return (
    <AuthGate>
      <VyndowShell activeModule="social">
        <div style={{ padding: 24, maxWidth: 980 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>Vyndow Social — Phase 1 Workshop</h1>
              <p style={{ marginTop: 6, color: "#374151", lineHeight: 1.5 }}>
                Agency-style discovery workshop. We auto-save drafts so you can resume anytime.
              </p>
            </div>

            <div style={{ alignSelf: "center" }}>
              <a href="/social" style={{ textDecoration: "none" }}>← Back to Vyndow Social</a>
            </div>
          </div>

          {!websiteId ? (
            <div style={{ marginTop: 18, padding: 14, border: "1px solid #fecaca", borderRadius: 12, background: "#fff1f2" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Missing website context</div>
              <div style={{ color: "#374151" }}>
                Please start from <a href="/social">/social</a> so we know which website this Brand Profile belongs to.
              </div>
            </div>
          ) : loading ? (
            <div style={{ marginTop: 18, color: "#374151" }}>Loading your saved draft…</div>
          ) : loadError ? (
            <div style={{ marginTop: 18, color: "#b91c1c" }}>{loadError}</div>
          ) : (
            <>
              <div style={{ marginTop: 18, padding: 14, border: "1px solid #e5e7eb", borderRadius: 12 }}>
              <div style={{ fontWeight: 700 }}>Step {Math.min(currentStep, 7)} of 7</div>

                <div style={{ marginTop: 6, color: "#374151" }}>
                  {currentStep === 0 ? "Website Start + Scan" : "Next steps will be added one-by-one."}
                </div>
              </div>

              {currentStep === 0 && (
                <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Website Start + Scan</div>

                  <div style={{ marginTop: 8, color: "#374151" }}>
                    <div style={{ fontSize: 13, marginTop: 6 }}>
                      <b>Why this matters:</b> We use your website to understand your baseline voice and visuals.
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                      Website URL <span style={{ color: "#b91c1c" }}>*</span>
                    </label>
                    <input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="e.g., https://vyndow.com"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      We’ll save this as the baseline for your Brand Profile.
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                      Optional brand name
                    </label>
                    <input
                      value={brandName}
                      onChange={(e) => setBrandName(e.target.value)}
                      placeholder="Short name (optional)"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                  </div>

                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={handleScan}
                      disabled={scanning || saving}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        cursor: scanning ? "wait" : "pointer",
                        background: "white",
                      }}
                    >
                      {scanning ? "Scanning…" : "Scan website"}
                    </button>

                    <button
                      onClick={handleContinue}
                      disabled={!canContinue}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        cursor: canContinue ? "pointer" : "not-allowed",
                        background: canContinue ? "white" : "#f3f4f6",
                        fontWeight: 600,
                      }}
                    >
                      {saving ? "Saving…" : "Continue"}
                    </button>
                  </div>

                  {scanMsg ? <div style={{ marginTop: 10, color: "#374151" }}>{scanMsg}</div> : null}
                  {saveError ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{saveError}</div> : null}
                </div>
              )}

              {currentStep === 1 && (
                <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Brand Context</div>

                  <div style={{ marginTop: 14 }}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                      Industry / Category <span style={{ color: "#b91c1c" }}>*</span>
                    </label>
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "white",
                      }}
                    >
                      <option value="">Select an industry</option>
                      <option value="saas">SaaS / Software</option>
                      <option value="agency">Agency / Services</option>
                      <option value="ecommerce">E-commerce</option>
                      <option value="fintech">Fintech</option>
                      <option value="health">Healthcare</option>
                      <option value="education">Education</option>
                      <option value="manufacturing">Manufacturing</option>
                      <option value="realestate">Real Estate</option>
                      <option value="other">Other</option>
                    </select>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      Helps us match category norms — and intentionally break them where appropriate.
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                      Business type <span style={{ color: "#b91c1c" }}>*</span>
                    </label>
                    <select
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "white",
                      }}
                    >
                      <option value="">Select</option>
                      <option value="b2b">B2B</option>
                      <option value="b2c">B2C</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      Determines depth, tone, and CTA style.
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                      Geography <span style={{ color: "#b91c1c" }}>*</span>
                    </label>
                    <select
                      value={geography}
                      onChange={(e) => setGeography(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "white",
                      }}
                    >
                      <option value="">Select</option>
                      <option value="global">Global</option>
                      <option value="india">India</option>
                      <option value="uk">UK</option>
                      <option value="usa">USA</option>
                      <option value="middle-east">Middle East</option>
                      <option value="south-east-asia">South East Asia</option>
                      <option value="europe">Europe</option>
                      <option value="other">Other</option>
                    </select>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      Ensures language and cultural tone feel natural.
                    </div>
                  </div>

                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setCurrentStep(0)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      Back
                    </button>

                    <button
                      onClick={async () => {
                        if (!industry || !businessType || !geography) return;
                        await saveDraft(2);
                        setCurrentStep(2);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      disabled={!industry || !businessType || !geography || saving}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        cursor: !industry || !businessType || !geography || saving ? "not-allowed" : "pointer",
                        background: !industry || !businessType || !geography || saving ? "#f3f4f6" : "white",
                        fontWeight: 600,
                      }}
                    >
                      {saving ? "Saving…" : "Continue"}
                    </button>
                  </div>

                  {saveError ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{saveError}</div> : null}
                </div>
              )}

              {currentStep === 2 && (
                <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Platform Focus</div>

                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    Different platforms need different thinking. This guides tone, formats, and pacing.
                  </div>

                  <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                    <label
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        cursor: "pointer",
                        background: platformFocus === "linkedin" ? "#f9fafb" : "white",
                      }}
                    >
                      <input
                        type="radio"
                        name="platformFocus"
                        value="linkedin"
                        checked={platformFocus === "linkedin"}
                        onChange={() => setPlatformFocus("linkedin")}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>LinkedIn-first</div>
                      </div>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        cursor: "pointer",
                        background: platformFocus === "instagram" ? "#f9fafb" : "white",
                      }}
                    >
                      <input
                        type="radio"
                        name="platformFocus"
                        value="instagram"
                        checked={platformFocus === "instagram"}
                        onChange={() => setPlatformFocus("instagram")}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>Instagram-first</div>
                      </div>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        cursor: "pointer",
                        background: platformFocus === "both" ? "#f9fafb" : "white",
                      }}
                    >
                      <input
                        type="radio"
                        name="platformFocus"
                        value="both"
                        checked={platformFocus === "both"}
                        onChange={() => setPlatformFocus("both")}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>Both (balanced)</div>
                      </div>
                    </label>
                  </div>

                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => setCurrentStep(1)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: "pointer",
                      }}
                    >
                      Back
                    </button>

                    <button
                      onClick={async () => {
                        if (!platformFocus) return;
                        await saveDraft(3);
                        setCurrentStep(3);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      disabled={!platformFocus || saving}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        cursor: !platformFocus || saving ? "not-allowed" : "pointer",
                        background: !platformFocus || saving ? "#f3f4f6" : "white",
                        fontWeight: 600,
                      }}
                    >
                      {saving ? "Saving…" : "Continue"}
                    </button>
                  </div>

                  {saveError ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{saveError}</div> : null}
                </div>
              )}

              {currentStep === 3 && (
                <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Brand Voice &amp; Personality</div>

                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    All 6 sliders are required. You can either accept recommended defaults or adjust each slider once.
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={() => {
                        setFormalConversational(50);
                        setBoldConservative(50);
                        setEducationalOpinionated(50);
                        setFounderBrand(50);
                        setAspirationalPractical(50);
                        setAuthorityRelatable(50);
                        setAcceptedDefaults(true);
                        setTouchedSliders({
                          formalConversational: true,
                          boldConservative: true,
                          educationalOpinionated: true,
                          founderBrand: true,
                          aspirationalPractical: true,
                          authorityRelatable: true,
                        });
                      }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Use recommended defaults
                    </button>
                  </div>

                  {/* Slider helper */}
                  <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
                    {/* 1 */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                        <span>Formal</span>
                        <span>Conversational</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={formalConversational}
                        onChange={(e) => {
                          setFormalConversational(Number(e.target.value));
                          setTouchedSliders((p) => ({ ...p, formalConversational: true }));
                        }}
                        style={{ width: "100%" }}
                      />
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Decides sentence length, warmth, and professional distance.
                      </div>
                    </div>

                    {/* 2 */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                        <span>Bold</span>
                        <span>Conservative</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={boldConservative}
                        onChange={(e) => {
                          setBoldConservative(Number(e.target.value));
                          setTouchedSliders((p) => ({ ...p, boldConservative: true }));
                        }}
                        style={{ width: "100%" }}
                      />
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Controls how assertive or restrained your messaging should be.
                      </div>
                    </div>

                    {/* 3 */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                        <span>Educational</span>
                        <span>Opinionated</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={educationalOpinionated}
                        onChange={(e) => {
                          setEducationalOpinionated(Number(e.target.value));
                          setTouchedSliders((p) => ({ ...p, educationalOpinionated: true }));
                        }}
                        style={{ width: "100%" }}
                      />
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Balances teaching versus taking a clear point of view.
                      </div>
                    </div>

                    {/* 4 */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                        <span>Founder-led</span>
                        <span>Brand-led</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={founderBrand}
                        onChange={(e) => {
                          setFounderBrand(Number(e.target.value));
                          setTouchedSliders((p) => ({ ...p, founderBrand: true }));
                        }}
                        style={{ width: "100%" }}
                      />
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Determines whether content speaks as a person or organisation.
                      </div>
                    </div>

                    {/* 5 */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                        <span>Aspirational</span>
                        <span>Practical</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={aspirationalPractical}
                        onChange={(e) => {
                          setAspirationalPractical(Number(e.target.value));
                          setTouchedSliders((p) => ({ ...p, aspirationalPractical: true }));
                        }}
                        style={{ width: "100%" }}
                      />
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Shapes whether content inspires future outcomes or focuses on present realities.
                      </div>
                    </div>

                    {/* 6 */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                        <span>Authority</span>
                        <span>Relatability</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={authorityRelatable}
                        onChange={(e) => {
                          setAuthorityRelatable(Number(e.target.value));
                          setTouchedSliders((p) => ({ ...p, authorityRelatable: true }));
                        }}
                        style={{ width: "100%" }}
                      />
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        Defines whether your voice sounds like an expert guide or a peer sharing experience.
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const allTouched =
                      touchedSliders.formalConversational &&
                      touchedSliders.boldConservative &&
                      touchedSliders.educationalOpinionated &&
                      touchedSliders.founderBrand &&
                      touchedSliders.aspirationalPractical &&
                      touchedSliders.authorityRelatable;

                    const canProceed = (acceptedDefaults || allTouched) && !saving;

                    return (
                      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setCurrentStep(2)}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "white",
                            cursor: "pointer",
                          }}
                        >
                          Back
                        </button>

                        <button
                          onClick={async () => {
                            if (!canProceed) return;
                            await saveDraft(4);
                            setCurrentStep(4);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          disabled={!canProceed}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            cursor: canProceed ? "pointer" : "not-allowed",
                            background: canProceed ? "white" : "#f3f4f6",
                            fontWeight: 600,
                          }}
                        >
                          {saving ? "Saving…" : "Continue"}
                        </button>
                      </div>
                    );
                  })()}

                  {saveError ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{saveError}</div> : null}
                </div>
              )}

             {currentStep === 4 && (
  <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
    <div style={{ fontWeight: 700, fontSize: 16 }}>Visual Direction</div>

    <div style={{ marginTop: 14 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Brand colors <span style={{ color: "#b91c1c" }}>*</span>
      </label>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Used to maintain consistency across visuals.
      </div>

      {/* Micro-copy (required) */}
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6, marginBottom: 10 }}>
        Choose colors that visually feel like your brand. We’ll handle the technical details.
      </div>

      {/* Suggested colors from scan (if available) */}
      {Array.isArray(scanSuggestedColors) && scanSuggestedColors.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Suggested from your website scan
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {scanSuggestedColors.map((c) => (
              <button
                key={c}
                onClick={() => {
                  if (!colors.includes(c)) setColors([...colors, c]);
                }}
                title="Add this color"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: c,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Primary action: Choose color */}
      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => colorPickerRef.current?.click()}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Choose color
        </button>

        {/* Hidden native picker (PowerPoint-style feel) */}
        <input
          ref={colorPickerRef}
          type="color"
          value={colorInput}
          onChange={(e) => {
            const hex = e.target.value;
            setColorInput(hex);
            if (!colors.includes(hex)) setColors([...colors, hex]);
          }}
          style={{ width: 1, height: 1, opacity: 0, position: "absolute", pointerEvents: "none" }}
          aria-hidden="true"
          tabIndex={-1}
        />

        {/* Selected colors (removable) */}
        {colors.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {colors.map((c) => (
              <div
                key={c}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid #e5e7eb",
                  borderRadius: 999,
                  padding: "6px 10px",
                  background: "white",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: c,
                    border: "1px solid #e5e7eb",
                  }}
                />
             
                <button
                  onClick={() => setColors(colors.filter((x) => x !== c))}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "#6b7280",
                  }}
                  aria-label={`Remove ${c}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Advanced: allow hex entry (optional) */}
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "#6b7280" }}>Advanced</summary>
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={colorInput}
            onChange={(e) => setColorInput(e.target.value)}
            placeholder="#RRGGBB"
            style={{
              width: 140,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
            }}
          />
          <button
            onClick={() => {
              const hex = (colorInput || "").trim();
              const isHex = /^#([0-9A-Fa-f]{6})$/.test(hex);
              if (!isHex) return alert("Enter a valid hex like #1A1A1A");
              if (colors.includes(hex)) return;
              setColors([...colors, hex]);
              setColorInput("#000000");
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Add hex
          </button>
        </div>
      </details>


      {colors.length === 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
          Add at least one brand color to continue.
        </div>
      )}
    </div>

    <div style={{ marginTop: 16 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Visual style <span style={{ color: "#b91c1c" }}>*</span>
      </label>
      <select
        value={visualStyle}
        onChange={(e) => setVisualStyle(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <option value="">Select</option>
        <option value="minimal">Minimal</option>
        <option value="editorial">Editorial</option>
        <option value="illustration">Illustration</option>
        <option value="photo">Photo-first</option>
        <option value="data">Data-led</option>
      </select>
    </div>

    <div style={{ marginTop: 16 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Typography <span style={{ color: "#b91c1c" }}>*</span>
      </label>
      <select
        value={typography}
        onChange={(e) => setTypography(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      >
        <option value="">Select</option>
        <option value="modern">Modern</option>
        <option value="classic">Classic</option>
        <option value="playful">Playful</option>
        <option value="neutral">Neutral</option>
      </select>
        <div style={{ marginTop: 16 }}>
  <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
    Brand logo <span style={{ color: "#b91c1c" }}>*</span>
  </label>

  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
    Upload your brand logo (PNG with transparent background). This will be used across social creatives.
  </div>

  <input
    type="file"
    accept="image/png"
    onChange={async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      await uploadLogo(f);
    }}
  />

  <div style={{ marginTop: 8, fontSize: 12, color: "#374151" }}>
    {logoUrl ? (
      <span>
        ✅ Logo uploaded{" "}
        <a href={logoUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>
          View
        </a>
      </span>
    ) : (
      <span>Logo: Not uploaded</span>
    )}
  </div>

  {logoError ? (
    <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
      {logoError}
    </div>
  ) : null}
</div>

    </div>

    <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
      <button
        onClick={() => setCurrentStep(3)}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
          cursor: "pointer",
        }}
      >
        Back
      </button>

      <button
        onClick={async () => {
        if (colors.length === 0 || !visualStyle || !typography || !logoUrl) {
  if (!logoUrl) setLogoError("Please upload a transparent PNG logo to continue.");
  return;
}

          await saveDraft(5);
          setCurrentStep(5);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      disabled={colors.length === 0 || !visualStyle || !typography || !logoUrl}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
background: colors.length && visualStyle && typography && logoUrl ? "white" : "#f3f4f6",
fontWeight: 600,
cursor: colors.length && visualStyle && typography && logoUrl ? "pointer" : "not-allowed",
        }}
      >
        Continue
      </button>
    </div>
  </div>
)}




{currentStep === 5 && (
  <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
    <div style={{ fontWeight: 700, fontSize: 16 }}>Strategic Intent + Risk Appetite</div>

    {/* Primary objective */}
    <div style={{ marginTop: 14 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Primary objective <span style={{ color: "#b91c1c" }}>*</span>
      </label>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Determines content mix and CTA intensity.
      </div>

      <select
        value={primaryObjective}
        onChange={(e) => setPrimaryObjective(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
        }}
      >
        <option value="">Select</option>
        <option value="brand_awareness">Brand awareness</option>
        <option value="authority">Authority</option>
        <option value="lead_generation">Lead generation</option>
        <option value="hiring">Hiring</option>
        <option value="product_education">Product education</option>
      </select>
    </div>

    {/* Secondary objective */}
    <div style={{ marginTop: 16 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Secondary objective (optional)
      </label>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Used sparingly to balance your plan.
      </div>

      <select
        value={secondaryObjective}
        onChange={(e) => setSecondaryObjective(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
        }}
      >
        <option value="">None</option>
        <option value="brand_awareness">Brand awareness</option>
        <option value="authority">Authority</option>
        <option value="lead_generation">Lead generation</option>
        <option value="hiring">Hiring</option>
        <option value="product_education">Product education</option>
      </select>
    </div>

    {/* Risk appetite */}
    <div style={{ marginTop: 16 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Content risk appetite <span style={{ color: "#b91c1c" }}>*</span>
      </label>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Defines how far content can push beyond category norms.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", cursor: "pointer", background: riskAppetite === "safe" ? "#f9fafb" : "white" }}>
          <input type="radio" name="riskAppetite" checked={riskAppetite === "safe"} onChange={() => setRiskAppetite("safe")} />
          <div style={{ fontWeight: 600 }}>Safe &amp; conventional</div>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", cursor: "pointer", background: riskAppetite === "balanced" ? "#f9fafb" : "white" }}>
          <input type="radio" name="riskAppetite" checked={riskAppetite === "balanced"} onChange={() => setRiskAppetite("balanced")} />
          <div style={{ fontWeight: 600 }}>Balanced &amp; distinctive</div>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", cursor: "pointer", background: riskAppetite === "bold" ? "#f9fafb" : "white" }}>
          <input type="radio" name="riskAppetite" checked={riskAppetite === "bold"} onChange={() => setRiskAppetite("bold")} />
          <div style={{ fontWeight: 600 }}>Bold but credible</div>
        </label>
      </div>
    </div>

    {(() => {
      const canProceed = !!primaryObjective && !!riskAppetite && !saving;

      return (
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setCurrentStep(4)}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
          >
            Back
          </button>

          <button
            onClick={async () => {
              if (!canProceed) return;
              await saveDraft(6);
              setCurrentStep(6);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={!canProceed}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: canProceed ? "white" : "#f3f4f6",
              fontWeight: 600,
              cursor: canProceed ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </div>
      );
    })()}

    {saveError ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{saveError}</div> : null}
  </div>
)}
{currentStep === 6 && (
  <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
    <div style={{ fontWeight: 700, fontSize: 16 }}>Guardrails (What NOT to do)</div>

    {/* Topics to avoid (Text box #2 of max 2) */}
    <div style={{ marginTop: 14 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Topics to avoid (optional)
      </label>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        We will not generate content around these topics.
      </div>
      <input
        value={topicsToAvoid}
        onChange={(e) => setTopicsToAvoid(e.target.value)}
        placeholder="e.g., politics, personal opinions, competitor mentions…"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
        }}
      />
    </div>

    {/* Tone to avoid */}
    <div style={{ marginTop: 16 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Tone to avoid (optional)
      </label>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Helps maintain brand credibility.
      </div>

      {["Salesy", "Cheeky", "Aggressive", "Overly inspirational"].map((t) => (
        <label
          key={t}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: 10,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            marginBottom: 8,
            cursor: "pointer",
            background: toneToAvoid.includes(t) ? "#f9fafb" : "white",
          }}
        >
          <input
            type="checkbox"
            checked={toneToAvoid.includes(t)}
            onChange={() => {
              if (toneToAvoid.includes(t)) {
                setToneToAvoid(toneToAvoid.filter((x) => x !== t));
              } else {
                setToneToAvoid([...toneToAvoid, t]);
              }
            }}
          />
          <div style={{ fontWeight: 600 }}>{t}</div>
        </label>
      ))}
    </div>

    {/* Visual styles to avoid */}
    <div style={{ marginTop: 16 }}>
      <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
        Visual styles to avoid (optional)
      </label>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Prevents visuals that feel off-brand.
      </div>

      {["Stocky imagery", "Meme-heavy", "Loud colors", "Dark-moody"].map((v) => (
        <label
          key={v}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: 10,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            marginBottom: 8,
            cursor: "pointer",
            background: visualAvoid.includes(v) ? "#f9fafb" : "white",
          }}
        >
          <input
            type="checkbox"
            checked={visualAvoid.includes(v)}
            onChange={() => {
              if (visualAvoid.includes(v)) {
                setVisualAvoid(visualAvoid.filter((x) => x !== v));
              } else {
                setVisualAvoid([...visualAvoid, v]);
              }
            }}
          />
          <div style={{ fontWeight: 600 }}>{v}</div>
        </label>
      ))}
    </div>

    {/* Continue rule: Guardrails optional (allow skip) */}
    <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button
        onClick={() => setCurrentStep(5)}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
          cursor: "pointer",
        }}
      >
        Back
      </button>

      <button
        onClick={async () => {
          await saveDraft(7);
          setCurrentStep(7);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        disabled={saving}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: saving ? "#f3f4f6" : "white",
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Continue"}
      </button>
    </div>

    {saveError ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{saveError}</div> : null}
  </div>
)}
{currentStep === 7 && (
  <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
    <div style={{ fontWeight: 700, fontSize: 16 }}>Review &amp; Finish</div>
    <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
      Review your choices below. Use Edit if you want to change anything.
    </div>

    {/* Brand context */}
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Brand context</div>
        <button
          onClick={() => setCurrentStep(1)}
          style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}
        >
          Edit
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 13, color: "#374151", display: "grid", gap: 6 }}>
        <div><span style={{ color: "#6b7280" }}>Industry:</span> {industry || "—"}</div>
        <div><span style={{ color: "#6b7280" }}>Business type:</span> {businessType || "—"}</div>
        <div><span style={{ color: "#6b7280" }}>Geography:</span> {geography || "—"}</div>
      </div>
    </div>

    {/* Platform focus */}
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Platform focus</div>
        <button
          onClick={() => setCurrentStep(2)}
          style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}
        >
          Edit
        </button>
      </div>
      <div style={{ marginTop: 10, fontSize: 13, color: "#374151" }}>
        <span style={{ color: "#6b7280" }}>Selection:</span> {platformFocus || "—"}
      </div>
    </div>

    {/* Voice sliders */}
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Voice &amp; personality</div>
        <button
          onClick={() => setCurrentStep(3)}
          style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}
        >
          Edit
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: "#374151", display: "grid", gap: 6 }}>
        <div><span style={{ color: "#6b7280" }}>Formal ↔ Conversational:</span> {formalConversational}</div>
        <div><span style={{ color: "#6b7280" }}>Bold ↔ Conservative:</span> {boldConservative}</div>
        <div><span style={{ color: "#6b7280" }}>Educational ↔ Opinionated:</span> {educationalOpinionated}</div>
        <div><span style={{ color: "#6b7280" }}>Founder-led ↔ Brand-led:</span> {founderBrand}</div>
        <div><span style={{ color: "#6b7280" }}>Aspirational ↔ Practical:</span> {aspirationalPractical}</div>
        <div><span style={{ color: "#6b7280" }}>Authority ↔ Relatability:</span> {authorityRelatable}</div>
      </div>
    </div>

    {/* Visual direction */}
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Visual direction</div>
        <button
          onClick={() => setCurrentStep(4)}
          style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}
        >
          Edit
        </button>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13, color: "#374151" }}>
          <span style={{ color: "#6b7280" }}>Colors:</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(colors || []).length === 0 ? (
            <div style={{ fontSize: 13, color: "#374151" }}>—</div>
          ) : (
            colors.map((c) => (
              <div key={c} title={c} style={{ width: 22, height: 22, borderRadius: 8, background: c, border: "1px solid #e5e7eb" }} />
            ))
          )}
        </div>

        <div style={{ fontSize: 13, color: "#374151" }}>
          <span style={{ color: "#6b7280" }}>Visual style:</span> {visualStyle || "—"}
        </div>
        <div style={{ fontSize: 13, color: "#374151" }}>
          <span style={{ color: "#6b7280" }}>Typography:</span> {typography || "—"}
        </div>
        <div style={{ fontSize: 13, color: "#374151" }}>
      <span style={{ color: "#6b7280" }}>Logo:</span> {logoUrl ? "Present" : "Not uploaded"}
        </div>
      </div>
    </div>

    {/* Strategy */}
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Strategic intent</div>
        <button
          onClick={() => setCurrentStep(5)}
          style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}
        >
          Edit
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: "#374151", display: "grid", gap: 6 }}>
        <div><span style={{ color: "#6b7280" }}>Primary objective:</span> {primaryObjective || "—"}</div>
        <div><span style={{ color: "#6b7280" }}>Secondary objective:</span> {secondaryObjective || "—"}</div>
        <div><span style={{ color: "#6b7280" }}>Risk appetite:</span> {riskAppetite || "—"}</div>
      </div>
    </div>

    {/* Guardrails */}
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Guardrails</div>
        <button
          onClick={() => setCurrentStep(6)}
          style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}
        >
          Edit
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: "#374151", display: "grid", gap: 6 }}>
        <div><span style={{ color: "#6b7280" }}>Topics to avoid:</span> {topicsToAvoid ? topicsToAvoid : "—"}</div>
        <div><span style={{ color: "#6b7280" }}>Tone to avoid:</span> {(toneToAvoid || []).length ? toneToAvoid.join(", ") : "—"}</div>
        <div><span style={{ color: "#6b7280" }}>Visual styles to avoid:</span> {(visualAvoid || []).length ? visualAvoid.join(", ") : "—"}</div>
      </div>
    </div>

    {/* Navigation controls */}
    <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button
        onClick={() => setCurrentStep(6)}
        style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
      >
        Back
      </button>

      <button
onClick={async () => {
  if (saving) return;
  if (!logoUrl) {
    setLogoError("Please upload a transparent PNG logo to continue.");
    setCurrentStep(4);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  await finishPhase1();
}}

        disabled={saving}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: saving ? "#f3f4f6" : "white",
          fontWeight: 700,
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Finishing…" : "Finish Phase 1"}
      </button>
    </div>

    {saveError ? <div style={{ marginTop: 10, color: "#b91c1c" }}>{saveError}</div> : null}
  </div>
)}
{currentStep === 8 && (
  <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
    <div style={{ fontWeight: 800, fontSize: 18 }}>Phase 1 Complete ✅</div>
    <div style={{ marginTop: 8, color: "#374151" }}>
      Your Brand Profile has been saved and marked as completed.
    </div>

    <div style={{ marginTop: 14 }}>
      <button
      onClick={() => router.push(`/social/themes?websiteId=${encodeURIComponent(websiteId)}`)}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "white",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
       Proceed to Themes
      </button>
    </div>
  </div>
)}

            </>
          )}
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
