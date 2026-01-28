"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "../../components/AuthGate";
import VyndowShell from "../../VyndowShell";
import { auth, db } from "../../firebaseClient";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

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
  const [colorInput, setColorInput] = useState("#");
  const [visualStyle, setVisualStyle] = useState(""); // minimal|editorial|illustration|photo|data
  const [typography, setTypography] = useState(""); // modern|classic|playful|neutral
    // Step 5 (Strategic Intent + Risk Appetite)
  const [primaryObjective, setPrimaryObjective] = useState("");
  const [secondaryObjective, setSecondaryObjective] = useState("");
  const [riskAppetite, setRiskAppetite] = useState(""); // safe|balanced|bold
  const [logoFileMeta, setLogoFileMeta] = useState(null); // {name,size,type} (no upload yet)


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
                    // Step 5 resume (Strategy)
          const s = data?.strategy || {};
          if (typeof s.primaryObjective === "string") setPrimaryObjective(s.primaryObjective);
          if (typeof s.secondaryObjective === "string") setSecondaryObjective(s.secondaryObjective);
          if (typeof s.riskAppetite === "string") setRiskAppetite(s.riskAppetite);

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
          logoAssetRef: logoFileMeta || null,
        },
        // Step 5 (Strategy)
        strategy: {
          primaryObjective: primaryObjective || null,
          secondaryObjective: secondaryObjective || null,
          riskAppetite: riskAppetite || null,
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
                <div style={{ fontWeight: 700 }}>Step {currentStep} of 6</div>
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
              setColorInput("#");
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
          if (colors.length === 0 || !visualStyle || !typography) return;
          await saveDraft(5);
          setCurrentStep(5);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        disabled={colors.length === 0 || !visualStyle || !typography}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: colors.length && visualStyle && typography ? "white" : "#f3f4f6",
          fontWeight: 600,
          cursor: colors.length && visualStyle && typography ? "pointer" : "not-allowed",
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

            </>
          )}
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
