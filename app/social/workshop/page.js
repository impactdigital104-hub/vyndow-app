"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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

  // Scan stub UI
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

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
        currentStep: nextStepNumber,
        phase1Completed: false,
        version: "v1.1",
        meta: {
          updatedAt: serverTimestamp(),
        },
      };

      await setDoc(
        ref,
        {
          ...payload,
          meta: {
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

              {currentStep !== 0 && (
                <div style={{ marginTop: 18, padding: 16, border: "1px solid #e5e7eb", borderRadius: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Step {currentStep} — Coming next</div>
                  <div style={{ marginTop: 8, color: "#374151" }}>
                    We’ve saved your Step 0 draft. Next we will build Step 1 (Brand Context) UI and autosave.
                  </div>
                  <div style={{ marginTop: 12 }}>
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
                      Back to Step 0
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
