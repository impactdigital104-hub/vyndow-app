"use client";

import { useState } from "react";

export default function SeoHomePage() {
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

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [outputs, setOutputs] = useState(null);

  function toggleTone(value) {
    setToneOfVoice((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setErrorMsg("");
    setOutputs(null);

    // Front-end required field checks
    const missing = [];
    if (!brandDescription.trim()) missing.push("A1. Brand Description");
    if (!targetAudience.trim()) missing.push("A2. Target Audience Persona");
    if (toneOfVoice.length === 0) missing.push("A3. Tone of Voice");
    if (!readingLevel) missing.push("A6. Reading Level Preference");
    if (!primaryKeyword.trim()) missing.push("B1. Primary Keyword");
    if (!topic.trim()) missing.push("C1. Blog Topic / Working Title");
    if (!wordCount.trim()) missing.push("C2. Desired Word Count");
    if (!existingBlogs.trim()) missing.push("B4. Internal URLs for linking");
    if (!geoTarget.trim()) missing.push("B7. Geo Target");
    if (!internalLinkingPreference)
      missing.push("C4. Internal Linking Preference");
    if (!imagePreference) missing.push("C5. Image Style Preference");
    if (!industry) missing.push("C7. Industry / Domain");

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
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // SECTION A
          brandDescription,
          targetAudience,
          toneOfVoice, // array of tone tags
          readingLevel, // new — safe for future prompt use

          // SECTION B
          topic,
          primaryKeyword,
          secondaryKeywords,
          wordCount: Number(wordCount) || 1200,
          seoIntent,
          existingBlogs, // B4 — internal URLs (one per line)
          geoTarget, // B7 — geography target
          internalLinkingPreference, // C4

          // SECTION C
          imagePreference, // C5
          industry, // C7
          notes, // C8 — additional notes, optional
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
    } catch (err) {
      console.error(err);
      setErrorMsg(
        "Something went wrong calling /api/generate. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <header style={{ marginBottom: "20px" }}>
        <span className="badge">Input Blueprint: Sections A–C</span>
        <h1>Vyndow SEO — Blog Generator (Next.js UI)</h1>
        <p className="sub">
          This is the new React-based version of your Vyndow SEO tool. It keeps
          only the inputs that truly shape the content and sends them to the
          existing <code>/api/generate</code> engine.
        </p>
      </header>

      {/* STEP 1 – INPUTS (2-column grid of cards) */}
      <section className="inputs-section">
        <h2>Step 1: Enter Inputs</h2>

        <div className="inputs-grid">
          {/* LEFT CARD – Brand & Article Brief */}
          <div className="inputs-card">
            <p className="section-label">A. Brand &amp; Voice</p>

            <div className="field-group">
              <label htmlFor="brandDescription">A1. Brand Description</label>
              <textarea
                id="brandDescription"
                placeholder="Describe what the brand does, who it serves, and what makes it unique."
                value={brandDescription}
                onChange={(e) => setBrandDescription(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="targetAudience">
                A2. Target Audience Persona
              </label>
              <textarea
                id="targetAudience"
                placeholder="Describe key audience segments, pain points, demographics, etc."
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label>A3. Tone of Voice (select one or more)</label>
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
            </div>

            <div className="field-group">
              <label htmlFor="readingLevel">A6. Reading Level</label>
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
            </div>

            <p className="section-label">C. Article Brief</p>

            <div className="field-group">
              <label htmlFor="topic">C1. Blog Topic / Working Title</label>
              <input
                type="text"
                id="topic"
                placeholder="e.g. Top Accounts Payable KPIs to Track"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="wordCount">C2. Desired Word Count</label>
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
                C8. Additional Notes for the Writer (Optional)
              </label>
              <textarea
                id="notes"
                placeholder="Anything else you want Vyndow to keep in mind."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* RIGHT CARD – SEO Levers */}
          <div className="inputs-card">
            <p className="section-label">B. SEO Intent &amp; Keywords</p>

            <div className="field-group">
              <label htmlFor="primaryKeyword">B1. Primary Keyword</label>
              <input
                type="text"
                id="primaryKeyword"
                placeholder="e.g. accounts payable automation"
                value={primaryKeyword}
                onChange={(e) => setPrimaryKeyword(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="secondaryKeywords">B2. Secondary Keywords</label>
              <textarea
                id="secondaryKeywords"
                placeholder="Optional – comma or line separated"
                value={secondaryKeywordsRaw}
                onChange={(e) => setSecondaryKeywordsRaw(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="existingBlogs">
                B4. Internal URLs for Interlinking
              </label>
              <textarea
                id="existingBlogs"
                placeholder="One internal URL per line (your own site/blog pages)."
                value={existingBlogs}
                onChange={(e) => setExistingBlogs(e.target.value)}
              />
              <div className="small">
                Used for Output 9. This should be URLs from your own website or
                blog that you want Vyndow to reference and interlink.
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="seoIntent">B6. SEO Intent</label>
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
            </div>

            <div className="field-group">
              <label htmlFor="geoTarget">B7. Geo Target</label>
              <input
                type="text"
                id="geoTarget"
                placeholder="e.g. India, UK, Pune, North America"
                value={geoTarget}
                onChange={(e) => setGeoTarget(e.target.value)}
              />
            </div>

            <p className="section-label">C. Linking &amp; Images</p>

            <div className="field-group">
              <label htmlFor="internalLinkingPreference">
                C4. Internal Linking Preference
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
  C5. Image Style Preference
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


              <div className="small">
                Used for Output 11 &amp; 12 (image ideas and alt-text).
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="industry">C7. Industry / Domain</label>
              <select
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              >
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

        <div style={{ marginTop: "18px" }}>
      <button
  type="submit"
  disabled={isSubmitting}
  style={{
    padding: "10px 24px",
    borderRadius: "999px",
    border: "none",
    background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
    color: "#f9fafb",
    fontWeight: 600,
    cursor: isSubmitting ? "default" : "pointer",
    boxShadow: "0 10px 25px rgba(15, 23, 42, 0.25)", // subtle glow
  }}
>
  {isSubmitting ? "Generating…" : "Generate SEO Outputs"}
</button>

        </div>
      </section>

      {/* STEP 2 – OUTPUT SUMMARY (2 cards) */}
      <section className="outputs-summary-section">
        <h2>Step 2: Review Outputs</h2>

        {!outputs && !errorMsg && (
          <div className="output-card">
            <h3>Outputs will appear here</h3>
            <p className="output-body">
              After you click <strong>Generate SEO Outputs</strong>, Vyndow
              will call the existing <code>/api/generate</code> engine and show
              all 15 outputs below – including the full article.
            </p>
          </div>
        )}

        {outputs && (
<div className="outputs-summary-grid">
  {/* LEFT CARD: 1–7 + 9–12 */}
  <div className="output-card">
    <h3>Core SEO &amp; Content Essentials (1–7, 9–12)</h3>

    <div style={{ marginBottom: "8px" }}>
      <strong>Output 1 – Blog Title Recommendation:</strong>
      <div className="output-body">
        {outputs.output1 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>Output 2 – H1:</strong>
      <div className="output-body">
        {outputs.output2 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>Output 3 – SEO Title:</strong>
      <div className="output-body">
        {outputs.output3 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>Output 4 – Meta Description:</strong>
      <div className="output-body">
        {outputs.output4 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>Output 5 – URL Slug:</strong>
      <div className="output-body">
        {outputs.output5 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "8px" }}>
      <strong>Output 6 – Primary Keyword:</strong>
      <div className="output-body">
        {outputs.output6 || "(No data returned)"}
      </div>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <strong>Output 7 – Secondary Keywords:</strong>
      <div className="output-body">
        {outputs.output7 || "(No data returned)"}
      </div>
    </div>

    <hr style={{ margin: "8px 0 12px", border: "none", borderTop: "1px solid #e5e7eb" }} />

    <div style={{ marginBottom: "12px" }}>
      <strong>Output 9 – Internal Link Plan:</strong>
      <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
        {outputs.output9 || "(No data returned)"}
      </pre>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <strong>Output 10 – FAQ Draft (Q&amp;A):</strong>
      <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
        {outputs.output10 || "(No data returned)"}
      </pre>
    </div>

    <div style={{ marginBottom: "12px" }}>
      <strong>Output 11 – Image Alt Text Suggestions:</strong>
      <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
        {outputs.output11 || "(No data returned)"}
      </pre>
    </div>

    <div style={{ marginBottom: "0" }}>
    <strong>Output 12 – Image Prompts (for AI generator):</strong>
      <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
        {outputs.output12 || "(No data returned)"}
      </pre>
    </div>
  </div>

{/* RIGHT CARD: JSON-LD Schemas (Output 13) */}
<div className="output-card">
  <h3>Structured Data — JSON-LD Schemas (Output 13)</h3>
  {[
    { key: "output13", label: "Output 13 – JSON-LD Schemas" },
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
            <h2>Full Article (Output 8)</h2>
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
  );
}
