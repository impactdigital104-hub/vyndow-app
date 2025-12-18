"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query, doc, getDoc } from "firebase/firestore";



import VyndowShell from "../VyndowShell";
import { db, auth } from "../firebaseClient";





export default function SeoHomePage() {
    const [uid, setUid] = useState(null);
const [websites, setWebsites] = useState([]);
    const [jsonLdCopied, setJsonLdCopied] = useState(false);
const [websitesLoading, setWebsitesLoading] = useState(true);
    const [websitesError, setWebsitesError] = useState("");
    const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
useEffect(() => {
  const unsub = onAuthStateChanged(auth, (user) => {
    if (!user) {
      router.replace("/login");
      return;
    }
      setUid(user.uid);
    setAuthReady(true);
  });

  return () => {
    if (typeof unsub === "function") unsub();
  };
}, [router]);
    const [selectedWebsite, setSelectedWebsite] = useState("");
useEffect(() => {
  async function loadWebsites() {
    if (!uid) return;

    try {
      setWebsitesLoading(true);
        setWebsitesError("");


      const colRef = collection(db, "users", uid, "websites");
      const q = query(colRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setWebsites(rows);

// pick first website automatically (first Firestore website)
if (rows.length && !selectedWebsite) {
  setSelectedWebsite(rows[0].id);
}


  } catch (e) {
  console.error("Failed to load websites:", e);
  setWebsites([]);
  setWebsitesError(e?.message || "Unknown Firestore error while loading websites.");
} finally {
  setWebsitesLoading(false);
}
  }

  loadWebsites();
}, [uid]);
    useEffect(() => {
  async function loadSeoModule() {
    if (!uid) return;

    try {
      setSeoModuleLoading(true);
      setSeoModuleError("");

      // users/{uid}/modules/seo
      const ref = doc(db, "users", uid, "modules", "seo");
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setSeoModule({ id: snap.id, ...snap.data() });
      } else {
        setSeoModule(null);
      }
    } catch (e) {
      console.error("Failed to load SEO module:", e);
      setSeoModule(null);
      setSeoModuleError(e?.message || "Unknown error while loading SEO module.");
    } finally {
      setSeoModuleLoading(false);
    }
  }

  loadSeoModule();
}, [uid]);
useEffect(() => {
  if (!selectedWebsite) return;
  if (!websites || !websites.length) return;

  const w = websites.find((x) => x.id === selectedWebsite);
  if (!w) return;

  applyWebsiteProfile(w);
}, [selectedWebsite, websites]);




  // GLOBAL BAR — Website / Brand + usage (now driven by websitesData)
 

    const [usedThisMonth, setUsedThisMonth] = useState(0);
const [usageLoading, setUsageLoading] = useState(false);

    const [seoModule, setSeoModule] = useState(null);
const [seoModuleLoading, setSeoModuleLoading] = useState(true);
const [seoModuleError, setSeoModuleError] = useState("");



  // SECTION A — Brand & Voice

  // SECTION A — Brand & Voice
  const [brandDescription, setBrandDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");

  // A3 — Tone of Voice (multi-select)
  const [toneOfVoice, setToneOfVoice] = useState([]);

  // A6 — Reading Level (Flesch/Kincaid-style)
  const [readingLevel, setReadingLevel] = useState("standard_8_9");

  // SECTION B — SEO Intent & Keywords
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [secondaryKeywordsRaw, setSecondaryKeywordsRaw] = useState("");

  // B4 — Internal URLs (one per line)
  const [existingBlogs, setExistingBlogs] = useState("");

  // B6 — SEO Intent
  const [seoIntent, setSeoIntent] = useState("informational");

  // B7 — Geo Target
  const [geoTarget, setGeoTarget] = useState("");

  // SECTION C — Article Brief
  const [topic, setTopic] = useState("");
  const [wordCount, setWordCount] = useState("1200");

  // C4 — Internal Linking Preference
  const [internalLinkingPreference, setInternalLinkingPreference] = useState(
    "auto_recommended"
  );

  // C5 — Image Style Preference
 const [imagePreference, setImagePreference] = useState("photorealistic");

  // C7 — Industry / Domain
  const [industry, setIndustry] = useState("health_recovery");

  // C8 — Additional Notes (optional)
  const [notes, setNotes] = useState("");
function applyWebsiteProfile(w) {
  const p = w?.profile || {};

  // Website profile -> auto-fill these
  setBrandDescription(p.brandDescription || "");
  setTargetAudience(p.targetAudience || "");
  setToneOfVoice(Array.isArray(p.toneOfVoice) ? p.toneOfVoice : []);
  setReadingLevel(p.readingLevel || "Accessible (Grade 7–9)");

  // LOCKED fields (set from website profile only)
  setGeoTarget(p.geoTarget || "India");
setIndustry(p.industry || "general");

}

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [outputs, setOutputs] = useState(null);
  // Gating state (UI-only for now)
  const [isQuotaReached, setIsQuotaReached] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState("");
  // Build the usage summary string based on the selected website's SEO plan
    function getMonthKeyClient() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // e.g. 2025-12
}
    async function refreshUsage(websiteId) {
  if (!uid || !websiteId) return;

  setUsageLoading(true);
  try {
    const monthKey = getMonthKeyClient();
    const usageRef = doc(db, "users", uid, "websites", websiteId, "usage", monthKey);
    const snap = await getDoc(usageRef);

    const used = snap.exists() ? (snap.data()?.usedThisMonth ?? 0) : 0;
    setUsedThisMonth(used);
  } catch (e) {
    console.error("Failed to load usage:", e);
    setUsedThisMonth(0);
  } finally {
    setUsageLoading(false);
  }
}

function buildUsageSummary() {
  if (seoModuleLoading) return "Loading SEO plan…";
  if (seoModuleError) return "SEO plan load error";
  if (!seoModule) return "No SEO plan found for this account.";

if (usageLoading) return "Loading usage…";
const used = usedThisMonth;


  const total = seoModule.blogsPerWebsitePerMonth ?? "?";
  const planType = (seoModule.plan || "").toLowerCase();

  let planLabel = "Plan";
  if (planType === "free") planLabel = "Free Plan";
  else if (planType === "small_business") planLabel = "Small Business Plan";
  else if (planType === "enterprise") planLabel = "Enterprise Plan";

const extra = seoModule.extraBlogCreditsThisMonth ?? 0;
const extraText = extra > 0 ? ` (+${extra})` : "";
return `${used} / ${total}${extraText} blogs this month · ${planLabel}`;

}

  // TODO [Phase 7]:
  // - Replace this front-end-only gating with a server-backed check:
  //     GET /api/usage?websiteKey=...&module=seo
  //   that returns the latest usage and limit for the current user/account.
  // - Move the "usedThisMonth" value out of static plan data into a
  //   dedicated usage collection/table (per website, per module, per month).

  // Whenever the selected website changes, update the pill + gating state
useEffect(() => {
  // Auto-fill inputs from selected website profile
  const w = websites.find((x) => x.id === selectedWebsite);
  if (w) applyWebsiteProfile(w);

  // Update usage pill text (from Firestore modules/seo)

refreshUsage(selectedWebsite);

  // UI-only gating for now (real usage tracking comes later)
  if (!seoModule || seoModule.blogsPerWebsitePerMonth == null) {
    setIsQuotaReached(false);
    setQuotaMessage("");
    return;
  }

const used = usedThisMonth;
const baseLimit = seoModule.blogsPerWebsitePerMonth ?? 0;
const extra = seoModule.extraBlogCreditsThisMonth ?? 0;
const totalAllowed = baseLimit + extra;

if (baseLimit > 0 && used >= totalAllowed) {
  setIsQuotaReached(true);
  setQuotaMessage(
    "You have used all blog credits for this website this month. To continue, buy extra blog credits or upgrade your plan."
  );
} else {
  setIsQuotaReached(false);
  setQuotaMessage("");
}

    }, [selectedWebsite, websites, seoModule, seoModuleLoading, seoModuleError, usedThisMonth]);





  function toggleTone(value) {
    setToneOfVoice((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setErrorMsg("");
    setOutputs(null);

    // TODO [Phase 7]:
    // - Before generating, call a secured endpoint such as:
    //     POST /api/usage/check-and-increment
    //   with { websiteKey: selectedWebsite, module: "seo" } so that the backend:
    //     * Verifies the user is authenticated and allowed.
    //     * Checks if quota is available.
    //     * Increments usage if allowed.
    //   If the backend says "no quota", show a proper error instead of
    //   calling /api/generate.

    // Front-end required field checks
    const missing = [];
    if (!brandDescription.trim()) missing.push("Brand Description");
    if (!targetAudience.trim()) missing.push("Target Audience Persona");
    if (toneOfVoice.length === 0) missing.push("Tone of Voice");
    if (!readingLevel) missing.push("Reading Level Preference");
    if (!primaryKeyword.trim()) missing.push("Primary Keyword");
    if (!topic.trim()) missing.push("Blog Topic / Working Title");
    if (!wordCount.trim()) missing.push("Desired Word Count");
    if (!existingBlogs.trim()) missing.push("Internal URLs for linking");
    if (!geoTarget.trim()) missing.push("Geo Target");
    if (!internalLinkingPreference)
      missing.push("Internal Linking Preference");
    if (!imagePreference) missing.push("Image Style Preference");
    if (!industry) missing.push("Industry / Domain");

    if (missing.length > 0) {
      setErrorMsg(
        "Please complete these required fields:\n• " + missing.join("\n• ")
      );
      return;
    }

    setIsSubmitting(true);

    // Split secondary keywords like the old UI (comma or newline separated)
    const secondaryKeywords = secondaryKeywordsRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const token = await auth.currentUser.getIdToken();

      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          // SECTION A
          brandDescription,
          targetAudience,
          toneOfVoice,
          readingLevel,

          // SECTION B
          topic,
          primaryKeyword,
          secondaryKeywords,
          wordCount: Number(wordCount) || 1200,
          seoIntent,
          existingBlogs,
          geoTarget,
          internalLinkingPreference,

          // SECTION C
          imagePreference,
          industry,
          notes,

          // REQUIRED for quota
          websiteId: selectedWebsite,
        }),
      });


   

      if (!resp.ok) {
        let msg =
          "Something went wrong generating the blog. Please review the required fields.";
        try {
          const errData = await resp.json();
          if (
            errData &&
            Array.isArray(errData.details) &&
            errData.details.length > 0
          ) {
            const pretty = errData.details.map((d) => {
              const match = d.match(/\(([^)]+)\)/);
              if (match && match[1]) {
                return "• " + match[1];
              }
              return "• " + d;
            });
            msg =
              "Please fill these required fields before generating:\n" +
              pretty.join("\n");
          } else if (errData && errData.error) {
            msg = errData.error;
          }
        } catch (err) {
          // ignore JSON parse failures
        }
        setErrorMsg(msg);
        return;
      }

      const data = await resp.json();
      const out = data.outputs || {};
      setOutputs(out);
        await refreshUsage(selectedWebsite);

        // TODO [Phase 7]:
      // - After a successful generation, refresh the usage pill by asking
      //   the backend for the latest usage, instead of relying on static
      //   plan.usedThisMonth in websitesData.js.
      // - This will keep the UI in sync with the real monthly counters.
    } catch (err) {
      console.error(err);
      setErrorMsg(
        "Something went wrong calling /api/generate. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }
    if (!authReady) {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      Checking login…
    </div>
  );
}
  return (
    <VyndowShell activeModule="seo">
      <main className="page">
     {/* Top bar: Website / Brand selector + usage (UI-only for now) */}
        <div className="project-bar">
          <div className="project-bar-left">
            <label htmlFor="websiteSelect" className="project-bar-label">
              Website / Brand
            </label>
<select
  id="websiteSelect"
  className="project-bar-select"
  value={selectedWebsite}
  onChange={(e) => setSelectedWebsite(e.target.value)}
>
{websitesLoading ? (
  <option value="">Loading websites...</option>
) : websitesError ? (
  <option value="">Error loading websites: {websitesError}</option>
) : websites.length === 0 ? (
  <option value="">No websites yet</option>
) : (
  websites.map((w) => (
    <option key={w.id} value={w.id}>
      {w.name} ({w.domain})
    </option>
  ))
)}

</select>



          </div>

         <div className="project-bar-right">
  <div className="project-bar-usage-label">SEO Usage</div>
  <div className="project-bar-usage-pill">{buildUsageSummary()}</div>

  {isQuotaReached ? (
    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <button
        type="button"
        onClick={() => router.push("/pricing")}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#fff",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Upgrade Plan
      </button>

      <button
        type="button"
        onClick={() => router.push("/pricing#credits")}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#fff",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Buy 2 Blog Credits
      </button>

      <button
        type="button"
        onClick={() => router.push("/websites")}
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Add Website
      </button>
    </div>
  ) : null}
</div>

        </div>
<header style={{ marginBottom: "20px" }}>
  <span className="badge">Enter details and generate the output</span>

  <h1>Vyndow SEO — Publishing Ready Blog Generator</h1>

  <p className="sub">
    Vyndow SEO is designed to keep things simple. Provide a few meaningful
    inputs, and Vyndow takes care of generating structured, publishing-ready SEO content.
  </p>
</header>


      {/* STEP 1 – INPUTS (2-column grid of cards) */}
      <section className="inputs-section">
        <h2>Step 1: Enter Details</h2>
{/* Helper: Filled example template (Phase X.1-A) */}
<details
  style={{
    marginTop: "10px",
    marginBottom: "14px",
    padding: "10px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    background: "#fff",
  }}
>
  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
    See a filled example (template)
  </summary>

  <div style={{ marginTop: "10px" }}>
    <div className="small" style={{ marginBottom: "10px" }}>
      Use this as a reference for what “good inputs” look like. You can copy the
      wording and edit it to match your brand.
    </div>
<div
  style={{
    padding: "10px",
    borderRadius: "10px",
    border: "1px solid #f1f5f9",
    background: "#fafafa",
    lineHeight: 1.5,
  }}
>
  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Brand Name:</strong>
    <div>GrowthNest Consulting</div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Brand Description:</strong>
    <div>
      GrowthNest Consulting helps small and mid-sized businesses improve their
      online visibility through practical SEO, content marketing, and
      conversion-focused strategies. We focus on sustainable growth, clear
      communication, and ethical digital practices rather than short-term hacks.
    </div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Target Audience:</strong>
    <div>
      Small business owners and marketing managers with limited in-house SEO
      expertise, looking for clear guidance and practical advice.
    </div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Tone of Voice:</strong>
    <div>Educational &amp; Insightful + Conversational &amp; Easy-to-read</div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Reading Level:</strong>
    <div>Grade 8–9</div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>SEO Intent:</strong>
    <div>Informational / Educational (How-to)</div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Blog Topic / Working Title:</strong>
    <div>Local SEO Checklist for Small Businesses (Step-by-step)</div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Desired Word Count:</strong>
    <div>1200</div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Primary Keyword:</strong>
    <div>local seo checklist</div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Secondary Keywords:</strong>
    <div>
      local search optimization, google business profile tips, local seo best
      practices
    </div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Internal URLs for Interlinking:</strong>
    <div>https://growthnest.com/local-seo-services</div>
    <div>https://growthnest.com/google-business-profile-setup</div>
  </div>

  <div style={{ marginBottom: "10px" }}>
    <strong style={{ color: "#111827" }}>Additional Notes:</strong>
    <div>
      Beginner-friendly how-to. Avoid tool comparisons. Use simple examples and
      actionable tips.
    </div>
  </div>

  <div>
    <strong style={{ color: "#111827" }}>Image Style Preference:</strong>
    <div>Minimal Illustration</div>
  </div>
</div>

  </div>
</details>

        <div className="inputs-grid">
          {/* LEFT CARD – Brand & Article Brief */}
          <div className="inputs-card">
            <p className="section-label">Brand &amp; Voice</p>

            <div className="field-group">
              <label htmlFor="brandDescription">Brand Description</label>
              <textarea
                id="brandDescription"
                placeholder="Describe what the brand does, who it serves, and what makes it unique."
                value={brandDescription}
                onChange={(e) => setBrandDescription(e.target.value)}
              />
                    <div className="small">
  2–4 sentences is ideal. Include what you do, who you serve, and what makes you different.
  Avoid slogans.
</div>

            </div>

            <div className="field-group">
              <label htmlFor="targetAudience">
                Target Audience Persona
              </label>
              <textarea
                id="targetAudience"
                placeholder="Describe key audience segments, pain points, demographics, etc."
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
              />
                    <div className="small">
  Be specific: role + situation + goal. Example: “Founders with basic SEO knowledge who want more leads.”
</div>

            </div>

            <div className="field-group">
              <label>Tone of Voice (select one or more)</label>
              <div className="inline-options">
                <label>
                  <input
                    type="checkbox"
                    checked={toneOfVoice.includes("warm_empathetic")}
                    onChange={() => toggleTone("warm_empathetic")}
                  />
                  Warm &amp; Empathetic
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={toneOfVoice.includes("expert_authoritative")}
                    onChange={() => toggleTone("expert_authoritative")}
                  />
                  Expert &amp; Authoritative
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={toneOfVoice.includes("educational_insightful")}
                    onChange={() => toggleTone("educational_insightful")}
                  />
                  Educational &amp; Insightful
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={toneOfVoice.includes("conversational_simple")}
                    onChange={() => toggleTone("conversational_simple")}
                  />
                  Conversational &amp; Easy-to-read
                </label>
              </div>
                    <div className="small">
  <div><strong>Warm &amp; Empathetic:</strong> Supportive, human, reassuring.</div>
  <div><strong>Expert &amp; Authoritative:</strong> Confident, professional, decision-ready.</div>
  <div><strong>Educational &amp; Insightful:</strong> Clear teaching tone, structured explanations.</div>
  <div><strong>Conversational &amp; Easy-to-read:</strong> Friendly, simple language, minimal jargon.</div>
</div>

            </div>

            <div className="field-group">
              <label htmlFor="readingLevel">Reading Level</label>
              <select
                id="readingLevel"
                value={readingLevel}
                onChange={(e) => setReadingLevel(e.target.value)}
              >
                <option value="easy_6_7">
                  Grade 6–7 (Very easy, simple language)
                </option>
                <option value="standard_8_9">
                  Grade 8–9 (Standard blog readability)
                </option>
                <option value="advanced_10_12">
                  Grade 10–12 (More advanced readers)
                </option>
                <option value="expert">Expert / Professional audience</option>
              </select>
                    <div className="small" style={{ marginTop: "8px" }}>
    <div><strong>Grades 6–7:</strong> Very simple language, short sentences, no jargon.</div>
    <div><strong>Grades 8–9:</strong> Clear and approachable; light terminology explained.</div>
    <div><strong>Grades 10–12:</strong> Moderate complexity; more detail, still readable.</div>
    <div><strong>Expert / Professional:</strong> Advanced vocabulary and domain terms for professionals.</div>
  </div>
            </div>

            <p className="section-label">Article Brief</p>

            <div className="field-group">
              <label htmlFor="topic">Blog Topic / Working Title</label>
              <input
                type="text"
                id="topic"
                placeholder="e.g. Top Accounts Payable KPIs to Track"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="wordCount">Desired Word Count</label>
              <input
                type="number"
                id="wordCount"
                placeholder="1200"
                value={wordCount}
                onChange={(e) => setWordCount(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="notes">
                Editorial Notes  (Optional)
              </label>
              <textarea
                id="notes"
                placeholder="Anything else you want Vyndow to keep in mind."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
                    <div className="small" style={{ marginTop: "8px" }}>
  Use this to control how the article is written (structure, depth, what to avoid).
  <div style={{ marginTop: "6px" }}>
    <strong>Examples:</strong>
    <ul style={{ margin: "6px 0 0 18px" }}>
      <li>“Beginner-friendly how-to. Avoid comparisons. Use practical examples.”</li>
      <li>“Write in an expert tone for CFOs. Include metrics and real-world implications.”</li>
      <li>“Explain simply, no jargon. Use bullets and short paragraphs.”</li>
      <li>“Compare approaches objectively and explain trade-offs.”</li>
    </ul>
  </div>
</div>

            </div>
          </div>

          {/* RIGHT CARD – SEO Levers */}
          <div className="inputs-card">
            <p className="section-label">SEO Intent &amp; Keywords</p>

            <div className="field-group">
              <label htmlFor="primaryKeyword">Primary Keyword</label>
              <input
                type="text"
                id="primaryKeyword"
                placeholder="e.g. accounts payable automation"
                value={primaryKeyword}
                onChange={(e) => setPrimaryKeyword(e.target.value)}
              />
                    <div className="small" style={{ marginTop: "8px" }}>
  Use one clear search phrase (not a full sentence). Example: <em>local seo checklist</em>
</div>

            </div>

            <div className="field-group">
              <label htmlFor="secondaryKeywords">Secondary Keywords</label>
              <textarea
                id="secondaryKeywords"
                placeholder="Optional – comma or line separated"
                value={secondaryKeywordsRaw}
                onChange={(e) => setSecondaryKeywordsRaw(e.target.value)}
              />
          <div className="small" style={{ marginTop: "8px" }}>
  Add 3–6 related phrases (comma separated). Avoid repeating the primary keyword.
</div>
    
            </div>

            <div className="field-group">
              <label htmlFor="existingBlogs">
                Internal URLs for Interlinking
              </label>
              <textarea
                id="existingBlogs"
                placeholder="One internal URL per line (your own site/blog pages)."
                value={existingBlogs}
                onChange={(e) => setExistingBlogs(e.target.value)}
              />
             <div className="small" style={{ marginTop: "8px" }}>
                 Paste 1–5 relevant URLs from your website (one per line). Vyndow will use these for internal linking.
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="seoIntent">SEO Intent</label>
              <select
                id="seoIntent"
                value={seoIntent}
                onChange={(e) => setSeoIntent(e.target.value)}
              >
                <option value="informational">Informational</option>
                <option value="commercial">Commercial</option>
                <option value="transactional">Transactional</option>
                <option value="mixed">Mixed</option>
              </select>
                    <div className="small" style={{ marginTop: "8px" }}>
  Choose why someone is searching this topic (learn, compare, decide, or take action). This helps shape the structure.
</div>

            </div>

            <div className="field-group">
              <label htmlFor="geoTarget">Geo Target</label>
            <input
  type="text"
  id="geoTarget"
  placeholder="Locked at website level"
  value={geoTarget}
  disabled
/>

            </div>

            <p className="section-label">Linking &amp; Images</p>

            <div className="field-group">
              <label htmlFor="internalLinkingPreference">
                Internal Linking Preference
              </label>
              <select
                id="internalLinkingPreference"
                value={internalLinkingPreference}
                onChange={(e) => setInternalLinkingPreference(e.target.value)}
              >
                <option value="auto_recommended">
                  Add internal links contextually (recommended)
                </option>
                <option value="minimal">
                  Minimal internal links, only when strongly relevant
                </option>
                <option value="only_relevant">
                  Only add internal links where absolutely relevant
                </option>
                <option value="none">Avoid adding internal links</option>
              </select>
            </div>

            <div className="field-group">
<label htmlFor="imagePreference">
  Image Style Preference
</label>
<select
  id="imagePreference"
  value={imagePreference}
  onChange={(e) => setImagePreference(e.target.value)}
>
  <option value="photorealistic">Photorealistic (default)</option>
  <option value="minimal_illustration">Minimal illustration</option>
  <option value="isometric">Isometric</option>
  <option value="vector_style">Vector style</option>
  <option value="abstract">Abstract</option>
</select>
<div className="small" style={{ marginTop: "8px" }}>
  <div><strong>Photorealistic:</strong> Realistic, photo-like images.</div>
  <div><strong>Minimal Illustration:</strong> Clean, simple illustrations with few details.</div>
  <div><strong>Isometric:</strong> 3D-style diagrams showing systems/processes.</div>
  <div><strong>Abstract:</strong> Conceptual visuals representing ideas.</div>
  <div><strong>Vector Style:</strong> Flat graphic illustrations with bold shapes.</div>
</div>

            </div>

            <div className="field-group">
              <label htmlFor="industry">Industry / Domain</label>
            <select
  id="industry"
  value={industry}
  disabled
>
<option value="general">General (not set)</option>
                <option value="health_recovery">
                  Rehab, Mental Health &amp; Recovery
                </option>
                <option value="healthcare_clinic">
                  Healthcare / Medical Clinic
                </option>
                <option value="finance">Finance / Investing / Banking</option>
                <option value="legal">Legal / Law Firms</option>
                <option value="education">Education / EdTech / Coaching</option>
                <option value="ecommerce_fmcg">
                  Ecommerce, FMCG &amp; Retail
                </option>
                <option value="travel_hospitality">
                  Travel, Tourism &amp; Hospitality
                </option>
                <option value="saas_tech">
                  Technology / B2B SaaS / Software
                </option>
                <option value="entertainment_media">
                  Entertainment, Media &amp; Creators
                </option>
                <option value="real_estate_home">
                  Real Estate &amp; Home Services
                </option>
                <option value="spirituality_wellness">
                  Spirituality, Wellness &amp; Coaching
                </option>
                <option value="generic">Generic / Other Business</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error + Generate button (full-width under both cards) */}
        {errorMsg && (
          <div
            className="error-box"
            style={{ whiteSpace: "pre-wrap", marginTop: "16px" }}
          >
            <strong>Fix these before generating:</strong>
            {errorMsg}
          </div>
        )}
{isQuotaReached && (
  <div
    className="error-box"
    style={{
      whiteSpace: "pre-wrap",
      marginTop: errorMsg ? "10px" : "16px",
    }}
  >
    <strong>Plan limit reached for this website.</strong>
    <br />
    {quotaMessage}
    <br />
    <span style={{ fontSize: "0.85rem" }}>
      Tip: Add another website in{" "}
      <strong>Websites &amp; Clients</strong> or upgrade this
      website&apos;s SEO plan when billing is live.
    </span>

    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => router.push("/pricing")}
        style={{
          padding: "10px 14px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#fff",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Upgrade Plan
      </button>

      <button
        type="button"
        onClick={() => router.push("/pricing#credits")}
        style={{
          padding: "10px 14px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#fff",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Buy 2 Blog Credits
      </button>

      <button
        type="button"
        onClick={() => router.push("/websites")}
        style={{
          padding: "10px 14px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Add Website
      </button>
    </div>
  </div>
)}


              <div style={{ marginTop: "18px" }}>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isSubmitting || isQuotaReached}
            style={{
              padding: "10px 24px",
              borderRadius: "999px",
              border: "none",
              background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
              color: "#f9fafb",
              fontWeight: 600,
              cursor:
                isSubmitting || isQuotaReached ? "not-allowed" : "pointer",
              opacity: isQuotaReached ? 0.6 : 1,
              boxShadow: "0 10px 25px rgba(15, 23, 42, 0.25)", // subtle glow
            }}
          >
            {isQuotaReached
              ? "Limit Reached"
              : isSubmitting
              ? "Generating…"
              : "Generate SEO Outputs"}
          </button>
        </div>

      </section>

      {/* STEP 2 – OUTPUT SUMMARY (2 cards) */}
      <section className="outputs-summary-section">
        <h2>Step 2: Review Outputs</h2>

        {!outputs && !errorMsg && (
          <div className="output-card">
            <h3>Your SEO content will appear here</h3>
            <p className="output-body">
              Once you click<strong>Generate SEO Outputs</strong>, Vyndow will create your complete ready-to-publish SEO-ready content — including titles, meta descriptions, and the full article — based on your inputs.
            </p>
          </div>
        )}

        {outputs && (
<div className="outputs-summary-grid">
  {/* LEFT CARD: 1–7 + 9–12 */}
  <div className="output-card">
    <h3>Core SEO &amp; Content Essentials</h3>

    <div style={{ marginBottom: "8px" }}>
      <strong>Blog Title Recommendation:</strong>
      <div className="output-body">
        {outputs.output1 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>H1:</strong>
      <div className="output-body">
        {outputs.output2 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>SEO Title:</strong>
      <div className="output-body">
        {outputs.output3 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>Meta Description:</strong>
      <div className="output-body">
        {outputs.output4 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>URL Slug:</strong>
      <div className="output-body">
        {outputs.output5 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>Primary Keyword:</strong>
      <div className="output-body">
        {outputs.output6 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <strong>Secondary Keywords:</strong>
      <div className="output-body">
        {outputs.output7 || "(No data returned)"}
      </div>
    </div>

    <hr style={{ margin: "8px 0 12px", border: "none", borderTop: "1px solid #e5e7eb" }} />

    <div style={{ marginBottom: "12px" }}>
      <strong>Internal Link Plan:</strong>
      <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
        {outputs.output9 || "(No data returned)"}
      </pre>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <strong>FAQ Draft (Q&amp;A):</strong>
      <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
        {outputs.output10 || "(No data returned)"}
      </pre>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <strong>Image Alt Text Suggestions:</strong>
      <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
        {outputs.output11 || "(No data returned)"}
      </pre>
    </div>

    <div style={{ marginBottom: "0" }}>
    <strong>Image Prompts (for AI generator):</strong>
      <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
        {outputs.output12 || "(No data returned)"}
      </pre>
    </div>
  </div>

{/* RIGHT CARD: JSON-LD Schemas (Output 13) */}
<div className="output-card">
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
  <h3 style={{ margin: 0 }}>Structured Data — JSON-LD Schemas</h3>

  <button
    type="button"
    onClick={async () => {
      try {
        const text = outputs?.output13 || "";
        await navigator.clipboard.writeText(text);
        setJsonLdCopied(true);
        setTimeout(() => setJsonLdCopied(false), 2000);
      } catch (e) {
        // silent fail (no disruption)
      }
    }}
    style={{
      padding: "6px 10px",
      borderRadius: "10px",
      border: "1px solid #e5e7eb",
      background: "#fff",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: 600,
    }}
    aria-label="Copy JSON-LD Schemas"
  >
    {jsonLdCopied ? "Copied ✓" : "Copy JSON-LD"}
  </button>
</div>

  {[
  { key: "output13", label: "JSON-LD Schemas" },
  ].map(({ key, label }) => (
    <div key={key} style={{ marginBottom: "12px" }}>
      <strong>{label}</strong>
      <pre
        className="output-body"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {outputs[key] || "(No data returned)"}
      </pre>
    </div>
  ))}
</div>


</div>


        )}
      </section>

      {/* FULL-WIDTH ARTICLE SECTION (Output 8) */}
      {outputs && (
        <section className="article-section">
          <div className="output-card">
            <h2>Full Article</h2>
            <div
              className="article-block"
              dangerouslySetInnerHTML={{
                __html:
                  outputs.output8 || "<p>(No data returned for Output 8)</p>",
              }}
            />
          </div>
        </section>
      )}
    </main>
   </VyndowShell>
  );
}
