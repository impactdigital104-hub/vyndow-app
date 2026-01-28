"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "../../components/AuthGate";
import VyndowShell from "../../VyndowShell";
import { auth, db } from "../../firebaseClient";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export default function SocialPhase2ThemesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading themes…</div>}>
      <SocialPhase2ThemesInner />
    </Suspense>
  );
}

function SocialPhase2ThemesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const websiteId = useMemo(() => {
    return searchParams?.get("websiteId") || "";
  }, [searchParams]);

  const [uid, setUid] = useState(null);
  const [idToken, setIdToken] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [platformFocus, setPlatformFocus] = useState("");
  const [phase1Completed, setPhase1Completed] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [generated, setGenerated] = useState({ linkedin: [], instagram: [] });
  const [selected, setSelected] = useState({ linkedin: [], instagram: [] });
  const [priorities, setPriorities] = useState({ linkedin: {}, instagram: {} });
  const [phase2Meta, setPhase2Meta] = useState({ phase2Completed: false });


  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const autosaveTimer = useRef(null);

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

  const workshopUrl = websiteId
    ? `/social/workshop?websiteId=${encodeURIComponent(websiteId)}`
    : "/social/workshop";

  useEffect(() => {
    if (!uid) return;

    async function load() {
      try {
        setLoading(true);
        setLoadError("");

        if (!websiteId) {
          setLoading(false);
          setLoadError("Missing websiteId in URL.");
          return;
        }

        const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : null;

        const p1 = !!data?.phase1Completed;
        setPhase1Completed(p1);
        setPlatformFocus(data?.platformFocus || "");

        if (!p1) {
          router.replace(workshopUrl);
          setLoading(false);
          return;
        }

        const p2 = data?.phase2 || {};
        const step = typeof p2.currentStep === "number" ? p2.currentStep : 1;
        setCurrentStep(step);

        const gen = p2.generated || {};
        setGenerated({
          linkedin: Array.isArray(gen.linkedin) ? gen.linkedin : [],
          instagram: Array.isArray(gen.instagram) ? gen.instagram : [],
        });

        const themes = p2.themes || {};
        const selLinkedIn = Array.isArray(themes.linkedin) ? themes.linkedin : [];
        const selInstagram = Array.isArray(themes.instagram) ? themes.instagram : [];

        setSelected({
          linkedin: selLinkedIn.map((t) => t.themeId).filter(Boolean),
          instagram: selInstagram.map((t) => t.themeId).filter(Boolean),
        });
        setPriorities({
          linkedin: Object.fromEntries(selLinkedIn.map((t) => [t.themeId, t.priority])),
          instagram: Object.fromEntries(selInstagram.map((t) => [t.themeId, t.priority])),
        });

      setConfirmed(!!p2?.meta?.phase2Completed);
setPhase2Meta(p2?.meta || { phase2Completed: false });

      } catch (e) {
        console.error("Phase 2 load error:", e);
        setLoadError(e?.message || "Failed to load Phase 2.");
      } finally {
        setLoading(false);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, websiteId]);

  useEffect(() => {
    if (!uid || !websiteId || !phase1Completed || !idToken) return;

    const wantLinkedIn = platformFocus === "linkedin" || platformFocus === "both";
    const wantInstagram = platformFocus === "instagram" || platformFocus === "both";
    const hasAnyGenerated =
      (wantLinkedIn && (generated.linkedin || []).length > 0) ||
      (wantInstagram && (generated.instagram || []).length > 0);

    if (hasAnyGenerated) return;

    async function generateOnce() {
      try {
        setSaving(true);
        setSaveError("");

        const resp = await fetch("/api/social/generateThemes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ websiteId }),
        });
      const rawText = await resp.text();
let data = null;

try {
  data = rawText ? JSON.parse(rawText) : null;
} catch {
  data = null;
}

if (!resp.ok || !data?.ok) {
  const msg =
    data?.error ||
    rawText ||
    `Request failed (HTTP ${resp.status})`;
  throw new Error(msg);
}


        const nextGenerated = {
          linkedin: Array.isArray(data?.generated?.linkedin) ? data.generated.linkedin : [],
          instagram: Array.isArray(data?.generated?.instagram) ? data.generated.instagram : [],
        };

        setGenerated(nextGenerated);

        const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
        await setDoc(
          ref,
          {
            phase2: {
              currentStep: 1,
              generated: { ...nextGenerated, generatedAt: serverTimestamp() },
              themes: { linkedin: [], instagram: [] },
              meta: { phase2Completed: false, updatedAt: serverTimestamp() },
            },
          },
          { merge: true }
        );

        setCurrentStep(1);
      } catch (e) {
        console.error("Generate themes error:", e);
        setSaveError(e?.message || "Failed to generate themes.");
      } finally {
        setSaving(false);
      }
    }

    generateOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, websiteId, phase1Completed, idToken, platformFocus]);

  function platformList() {
    if (platformFocus === "both") return ["linkedin", "instagram"];
    if (platformFocus === "linkedin") return ["linkedin"];
    if (platformFocus === "instagram") return ["instagram"];
    return [];
  }
async function regenerateThemes() {
  if (!uid || !websiteId || !idToken) return;

  setSaving(true);
  setSaveError("");

  try {
    const resp = await fetch("/api/social/generateThemes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ websiteId }),
    });

    const rawText = await resp.text();
    const data = rawText ? JSON.parse(rawText) : null;

    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || "Failed to regenerate themes");
    }

    const nextGenerated = {
      linkedin: Array.isArray(data.generated?.linkedin) ? data.generated.linkedin : [],
      instagram: Array.isArray(data.generated?.instagram) ? data.generated.instagram : [],
    };

    // RESET LOCAL STATE
    setGenerated(nextGenerated);
    setSelected({ linkedin: [], instagram: [] });
    setPriorities({ linkedin: {}, instagram: {} });
    setCurrentStep(1);
    setConfirmed(false);

    // RESET FIRESTORE (PHASE 2 ONLY)
    const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");
    await setDoc(
      ref,
      {
        phase2: {
          currentStep: 1,
          generated: { ...nextGenerated, generatedAt: serverTimestamp() },
          themes: { linkedin: [], instagram: [] },
          meta: {
            phase2Completed: false,
            updatedAt: serverTimestamp(),
          },
        },
      },
      { merge: true }
    );
  } catch (e) {
    setSaveError(e.message || "Failed to regenerate themes");
  } finally {
    setSaving(false);
  }
}

  function themeById(platform, themeId) {
    const list = platform === "linkedin" ? generated.linkedin : generated.instagram;
    return (list || []).find((t) => t.themeId === themeId) || null;
  }

  async function saveDraft(nextStep) {
    if (!uid || !websiteId) return;
    setSaving(true);
    setSaveError("");

    try {
      const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");

      const outThemes = {
        linkedin: selected.linkedin
          .map((id) => {
            const t = themeById("linkedin", id);
            if (!t) return null;
            return { ...t, priority: Number(priorities.linkedin?.[id]) || null };
          })
          .filter(Boolean),
        instagram: selected.instagram
          .map((id) => {
            const t = themeById("instagram", id);
            if (!t) return null;
            return { ...t, priority: Number(priorities.instagram?.[id]) || null };
          })
          .filter(Boolean),
      };

      await setDoc(
        ref,
        {
          phase2: {
            currentStep: nextStep,
            generated: {
              linkedin: generated.linkedin || [],
              instagram: generated.instagram || [],
            },
            themes: outThemes,
            meta: {
              phase2Completed: false,
              updatedAt: serverTimestamp(),
            },
          },
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Phase 2 draft save error:", e);
      setSaveError(e?.message || "Failed to save draft.");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!uid || !websiteId) return;
    if (currentStep !== 2) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      saveDraft(2).catch(() => {});
    }, 450);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, priorities, currentStep]);

  function toggleTheme(platform, themeId) {
    setSelected((prev) => {
      const list = platform === "linkedin" ? prev.linkedin : prev.instagram;
      const exists = list.includes(themeId);
      const nextList = exists ? list.filter((x) => x !== themeId) : [...list, themeId];
      return platform === "linkedin" ? { ...prev, linkedin: nextList } : { ...prev, instagram: nextList };
    });

    setPriorities((prev) => {
      if (platform === "linkedin") {
        const next = { ...(prev.linkedin || {}) };
        if (next[themeId]) delete next[themeId];
        return { ...prev, linkedin: next };
      }
      const next = { ...(prev.instagram || {}) };
      if (next[themeId]) delete next[themeId];
      return { ...prev, instagram: next };
    });
  }

  function setPriority(platform, themeId, value) {
    setPriorities((prev) => {
      const nextMap = platform === "linkedin" ? { ...(prev.linkedin || {}) } : { ...(prev.instagram || {}) };
      if (!value) delete nextMap[themeId];
      else nextMap[themeId] = Number(value);
      return platform === "linkedin" ? { ...prev, linkedin: nextMap } : { ...prev, instagram: nextMap };
    });
  }

  function validatePlatform(platform) {
    const sel = platform === "linkedin" ? selected.linkedin : selected.instagram;
    const pri = platform === "linkedin" ? priorities.linkedin : priorities.instagram;

    const count = sel.length;
    if (count < 3 || count > 4) return { ok: false, reason: "Select 3–4 themes." };

    const assigned = sel.map((id) => pri?.[id]).filter((x) => typeof x === "number" && x >= 1 && x <= 4);
    if (assigned.length !== sel.length) return { ok: false, reason: "Assign a priority for each selected theme." };

    const unique = new Set(assigned);
    if (unique.size !== assigned.length) return { ok: false, reason: "Priorities must be unique." };

    return { ok: true, reason: "" };
  }

  function canContinueStep2() {
    const platforms = platformList();
    if (platforms.length === 0) return false;
    return platforms.every((p) => validatePlatform(p).ok);
  }

  async function goToStep(nextStep) {
    await saveDraft(nextStep);
    setCurrentStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmThemesFinal() {
    if (!uid || !websiteId) return;

    setConfirming(true);
    setSaveError("");

    try {
      const ref = doc(db, "users", uid, "websites", websiteId, "modules", "social");

      const finalThemes = {
        linkedin: selected.linkedin
          .map((id) => {
            const t = themeById("linkedin", id);
            if (!t) return null;
            return { ...t, priority: Number(priorities.linkedin?.[id]) || null };
          })
          .filter(Boolean)
          .sort((a, b) => (a.priority || 999) - (b.priority || 999)),
        instagram: selected.instagram
          .map((id) => {
            const t = themeById("instagram", id);
            if (!t) return null;
            return { ...t, priority: Number(priorities.instagram?.[id]) || null };
          })
          .filter(Boolean)
          .sort((a, b) => (a.priority || 999) - (b.priority || 999)),
      };

      await setDoc(
        ref,
        {
          phase2: {
            currentStep: 3,
            generated: {
              linkedin: generated.linkedin || [],
              instagram: generated.instagram || [],
            },
            themes: finalThemes,
            meta: {
              phase2Completed: true,
              updatedAt: serverTimestamp(),
              completedAt: serverTimestamp(),
            },
          },
        },
        { merge: true }
      );

      setCurrentStep(3);
      setConfirmed(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error("Confirm themes error:", e);
      setSaveError(e?.message || "Failed to confirm themes.");
    } finally {
      setConfirming(false);
    }
  }

  function StepHeader({ title, microcopy }) {
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
        {microcopy ? <div style={{ marginTop: 6, color: "#374151", lineHeight: 1.5 }}>{microcopy}</div> : null}
      </div>
    );
  }

  function ThemeCard({ theme }) {
    return (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, background: "#fff" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{theme.title}</div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>What this is about</div>
          <div style={{ color: "#111827", marginTop: 4, lineHeight: 1.5 }}>{theme.what}</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Why this fits your brand</div>
          <div style={{ color: "#111827", marginTop: 4, lineHeight: 1.5 }}>{theme.whyFit}</div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Typical content examples</div>
          <ul style={{ margin: "6px 0 0 18px", color: "#111827" }}>
            {(theme.examples || []).slice(0, 2).map((x, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  function PlatformBlockLabel({ platform }) {
    return <div style={{ marginTop: 18, marginBottom: 10, fontWeight: 800 }}>{platform === "linkedin" ? "LinkedIn" : "Instagram"}</div>;
  }

  function renderStep1() {
    const platforms = platformList();
    return (
      <div>
<StepHeader
  title="Recommended content themes for your brand"
  microcopy="These themes are based on your brand strategy. You’ll choose what to focus on next."
/>

<button
  onClick={async () => {
    const hasSelections =
      selected.linkedin.length > 0 || selected.instagram.length > 0;

    if (hasSelections) {
      const ok = window.confirm(
        "This will replace the current theme suggestions. Your selected priorities will be reset. Continue?"
      );
      if (!ok) return;
    }

    await regenerateThemes();
  }}
  style={{
    marginBottom: 14,
    textDecoration: "underline",
    color: "#4b5563",
    fontSize: 14,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
  }}
>
  Regenerate themes
</button>


        {platforms.map((p) => {
          const list = p === "linkedin" ? generated.linkedin : generated.instagram;
          return (
            <div key={p} style={{ marginBottom: 22 }}>
              <PlatformBlockLabel platform={p} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {(list || []).map((t) => (
                  <ThemeCard key={t.themeId} theme={t} />
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => goToStep(2)} disabled={saving} style={primaryBtnStyle(saving)}>
            Select themes to focus on
          </button>
          <a href={workshopUrl} style={{ color: "#374151", textDecoration: "none" }}>
            Back to Phase 1
          </a>
        </div>
      </div>
    );
  }

  function renderStep2() {
    const platforms = platformList();
    return (
      <div>
        <StepHeader
          title="Choose your core content themes"
          microcopy="Strong brands don’t talk about everything. Pick the themes that matter most."
        />

        {platforms.map((p) => {
          const list = p === "linkedin" ? generated.linkedin : generated.instagram;
          const sel = p === "linkedin" ? selected.linkedin : selected.instagram;
          const pri = p === "linkedin" ? priorities.linkedin : priorities.instagram;
          const v = validatePlatform(p);

          return (
            <div key={p} style={{ marginBottom: 22 }}>
              <PlatformBlockLabel platform={p} />

              <div style={{ color: "#374151", marginBottom: 10 }}>
                Select <b>3–4</b> themes and assign unique priorities (1–4).
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
                {(list || []).map((t) => {
                  const checked = sel.includes(t.themeId);
                  const currentPriority = pri?.[t.themeId] || "";
                  return (
                    <div
                      key={t.themeId}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 14,
                        background: checked ? "#fff7ed" : "#fff",
                      }}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTheme(p, t.themeId)}
                          style={{ marginTop: 4 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800 }}>{t.title}</div>
                          <div style={{ marginTop: 6, color: "#374151", lineHeight: 1.5 }}>{t.what}</div>

                          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Priority</div>
                            <select
                              value={currentPriority}
                              onChange={(e) => setPriority(p, t.themeId, e.target.value)}
                              disabled={!checked}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                minWidth: 90,
                              }}
                            >
                              <option value="">—</option>
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                              <option value="4">4</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!v.ok ? (
                <div style={{ marginTop: 10, color: "#b91c1c" }}>⚠️ {v.reason}</div>
              ) : (
                <div style={{ marginTop: 10, color: "#065f46" }}>✅ Looks good.</div>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: 8, color: "#374151" }}>These priorities will drive your content calendar.</div>

        <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => goToStep(1)} disabled={saving} style={secondaryBtnStyle(saving)}>
            Back
          </button>
          <button
            onClick={() => goToStep(3)}
            disabled={!canContinueStep2() || saving}
            style={primaryBtnStyle(!canContinueStep2() || saving)}
          >
            Lock themes &amp; continue
          </button>
        </div>
      </div>
    );
  }

  function renderStep3() {
    const platforms = platformList();

    return (
      <div>
        <StepHeader title="Review your content strategy" microcopy={null} />

        {platforms.map((p) => {
          const selIds = p === "linkedin" ? selected.linkedin : selected.instagram;
          const pri = p === "linkedin" ? priorities.linkedin : priorities.instagram;

          const list = selIds
            .map((id) => {
              const t = themeById(p, id);
              if (!t) return null;
              return { ...t, priority: Number(pri?.[id]) || null };
            })
            .filter(Boolean)
            .sort((a, b) => (a.priority || 999) - (b.priority || 999));

          return (
            <div key={p} style={{ marginBottom: 22 }}>
              <PlatformBlockLabel platform={p} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {list.map((t) => (
                  <div key={t.themeId} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 900 }}>{t.title}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>Priority {t.priority}</div>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>What</div>
                    <div style={{ marginTop: 4, color: "#111827", lineHeight: 1.5 }}>{t.what}</div>

                    <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>WhyFit</div>
                    <div style={{ marginTop: 4, color: "#111827", lineHeight: 1.5 }}>{t.whyFit}</div>

                    <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>Examples</div>
                    <ul style={{ margin: "6px 0 0 18px", color: "#111827" }}>
                      {(t.examples || []).slice(0, 2).map((x, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => goToStep(2)} disabled={confirming} style={secondaryBtnStyle(confirming)}>
            Back
          </button>
          <button onClick={confirmThemesFinal} disabled={confirming} style={primaryBtnStyle(confirming)}>
            Confirm Themes (final)
          </button>
        </div>
      </div>
    );
  }

  function renderSuccess() {
    return (
      <div>
        <StepHeader title="Phase 2 Complete — Content Strategy Locked" microcopy={null} />
      <div className="mt-6">
  <h3 className="font-semibold mb-3">
    Your selected content themes
  </h3>

  {["linkedin", "instagram"].map((platform) => {
<div style={{ marginTop: 18 }}>
  <div style={{ fontWeight: 800, marginBottom: 10 }}>Your selected content themes</div>

  {["linkedin", "instagram"].map((platform) => {
    const selIds = platform === "linkedin" ? selected.linkedin : selected.instagram;
    const priMap = platform === "linkedin" ? priorities.linkedin : priorities.instagram;

    if (!selIds || selIds.length === 0) return null;

    const rows = selIds
      .map((id) => {
        const t = themeById(platform, id);
        if (!t) return null;
        return { themeId: id, title: t.title, priority: Number(priMap?.[id]) || 999 };
      })
      .filter(Boolean)
      .sort((a, b) => a.priority - b.priority);

    return (
      <div key={platform} style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          {platform === "linkedin" ? "LinkedIn" : "Instagram"}
        </div>
        <ul style={{ margin: "0 0 0 18px" }}>
          {rows.map((r) => (
            <li key={r.themeId} style={{ marginBottom: 4 }}>
              {r.priority}. {r.title}
            </li>
          ))}
        </ul>
      </div>
    );
  })}
</div>


        <div style={{ color: "#374151", lineHeight: 1.6 }}>Your core themes and priorities are saved for this website.</div>
        <div style={{ marginTop: 18 }}>
          <a href={workshopUrl} style={{ color: "#111827" }}>
            View Phase 1 Brand Profile
          </a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24 }}>Loading Phase 2…</div>
        </VyndowShell>
      </AuthGate>
    );
  }

  if (!websiteId) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24, color: "#b91c1c" }}>Missing websiteId in URL.</div>
        </VyndowShell>
      </AuthGate>
    );
  }

  if (!phase1Completed) {
    return (
      <AuthGate>
        <VyndowShell activeModule="social">
          <div style={{ padding: 24 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Complete Phase 1 to proceed.</div>
            <a href={workshopUrl}>Go to Phase 1</a>
          </div>
        </VyndowShell>
      </AuthGate>
    );
  }

  const platforms = platformList();
  const ready =
    platforms.length > 0 &&
    (platformFocus !== "linkedin" || (generated.linkedin || []).length > 0) &&
    (platformFocus !== "instagram" || (generated.instagram || []).length > 0) &&
    (platformFocus !== "both" ||
      ((generated.linkedin || []).length > 0 && (generated.instagram || []).length > 0));

  return (
    <AuthGate>
      <VyndowShell activeModule="social">
        <div style={{ padding: 24, maxWidth: 1040 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22 }}>Vyndow Social — Phase 2</h1>
              <div style={{ marginTop: 6, color: "#6b7280" }}>Content Themes &amp; Strategic Narratives</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Draft autosave: {saving ? "Saving…" : "On"}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Step {currentStep}/3</div>
            </div>
          </div>

          {loadError ? <div style={{ marginTop: 12, color: "#b91c1c" }}>{loadError}</div> : null}
          {saveError ? <div style={{ marginTop: 12, color: "#b91c1c" }}>{saveError}</div> : null}

          {!ready ? (
            <div style={{ marginTop: 18, color: "#374151" }}>Preparing your themes…</div>
          ) : confirmed ? (
            <div style={{ marginTop: 18 }}>{renderSuccess()}</div>
          ) : (
            <div style={{ marginTop: 18 }}>
              {currentStep === 1 ? renderStep1() : null}
              {currentStep === 2 ? renderStep2() : null}
              {currentStep === 3 ? renderStep3() : null}
            </div>
          )}
        </div>
      </VyndowShell>
    </AuthGate>
  );
}

function primaryBtnStyle(disabled) {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: disabled ? "#f3f4f6" : "#111827",
    color: disabled ? "#6b7280" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function secondaryBtnStyle(disabled) {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: disabled ? "#6b7280" : "#111827",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
