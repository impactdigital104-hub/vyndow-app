"use client";

import { useState } from "react";

export default function SeoHomePage() {
  // Mandatory field state
  const [brandDescription, setBrandDescription] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [topic, setTopic] = useState("");
  const [wordCount, setWordCount] = useState("1200");

  // Optional / later fields (stubbed for now)
  const [secondaryKeywordsRaw, setSecondaryKeywordsRaw] = useState("");
  const [seoIntent, setSeoIntent] = useState("informational");
  const [notes, setNotes] = useState("");
  const [existingBlogs, setExistingBlogs] = useState("");
  const [imagePreference, setImagePreference] = useState("");
  const [industry, setIndustry] = useState("health_recovery");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [outputs, setOutputs] = useState(null);

  async function handleGenerate(e) {
    e.preventDefault();

    setErrorMsg("");
    setOutputs(null);
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

          // SECTION B / C
          topic,
          primaryKeyword,
          secondaryKeywords,
          wordCount: Number(wordCount) || 1200,
          seoIntent,
          notes,

          // B4 – Existing internal blog URLs (one per line)
          existingBlogs,

          // C5 – Image style preference
          imagePreference,

          // C7 – Industry / Domain
          industry,
        }),
      });

      if (!resp.ok) {
        // Decode structured error like the V1 HTML page
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
        } catch {
          // fall back to generic message
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
        <span className="badge">Input Blueprint: Sections A–E</span>
        <h1>Vyndow SEO — Blog Generator (Next.js UI)</h1>
        <p className="sub">
          This is the new React-based version of your Vyndow SEO tool. We&apos;ll
          gradually bring all fields and outputs here and connect it to the
          existing <code>/api/generate</code> engine.
        </p>
      </header>

      <section className="main-layout">
        {/* LEFT: Step 1 – Inputs */}
        <div className="left">
          <h2>Step 1: Enter Inputs</h2>

          <p className="section-label">A. Brand &amp; Voice Information</p>

          <div className="field-group">
            <label htmlFor="brandDescription">A1. Brand Description</label>
            <textarea
              id="brandDescription"
              placeholder="Describe what the brand does, who it serves, and what makes it unique."
              value={brandDescription}
              onChange={(e) => setBrandDescription(e.target.value)}
            />
            <div className="small">
              Same intent as A1 in your current V1 form – we&apos;ll copy the
              exact helper text later.
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="targetAudience">A2. Target Audience Persona</label>
            <textarea
              id="targetAudience"
              placeholder="Describe key audience segments, pain points, demographics, etc."
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
            />
          </div>

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
            <label htmlFor="notes">Misc notes for the writer (optional)</label>
            <textarea
              id="notes"
              placeholder="Anything else you want Vyndow to keep in mind."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Error box */}
          {errorMsg && (
            <div className="error-box" style={{ whiteSpace: "pre-wrap" }}>
              <strong>Fix these before generating:</strong>
              {errorMsg}
            </div>
          )}

          <div style={{ marginTop: "18px" }}>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isSubmitting}
              style={{
                padding: "10px 20px",
                borderRadius: "999px",
                border: "none",
                background: "#111827",
                color: "#f9fafb",
                fontWeight: 600,
                cursor: isSubmitting ? "default" : "pointer",
              }}
            >
              {isSubmitting ? "Generating…" : "Generate SEO Outputs"}
            </button>
          </div>
        </div>

        {/* RIGHT: Step 2 – Outputs */}
        <div className="right">
          <h2>Step 2: Review Outputs</h2>

          {!outputs && !errorMsg && (
            <div className="output-card">
              <h3>Outputs will appear here</h3>
              <p className="output-body">
                After you click <strong>Generate SEO Outputs</strong>, Vyndow
                will call the existing <code>/api/generate</code> engine and
                display all 15 outputs here – Title, H1, SEO Title, Meta
                Description, full blog article, FAQ schema, and more.
              </p>
            </div>
          )}

          {outputs && (
            <div className="outputs-grid">
              <div className="outputs-column">
                <div className="output-card">
                  <h3>Outputs 1–7: Core SEO Elements</h3>
                  <pre className="output-body" style={{ whiteSpace: "pre-wrap" }}>
{`Blog Title Recommendation: ${outputs.output1 || ""}

H1: ${outputs.output2 || ""}

SEO Title: ${outputs.output3 || ""}

Meta Description: ${outputs.output4 || ""}

URL Slug: ${outputs.output5 || ""}

Primary Keyword: ${outputs.output6 || ""}

Secondary Keywords: ${outputs.output7 || ""}`}
                  </pre>
                </div>

                <div className="output-card">
                  <h3>Output 8: Full Article</h3>
                  <div
                    className="article-block"
                    dangerouslySetInnerHTML={{
                      __html:
                        outputs.output8 ||
                        "<p>(No data returned for Output 8)</p>",
                    }}
                  />
                </div>
              </div>

              <div className="outputs-column">
                {[
                  { key: "output9", label: "Output 9" },
                  { key: "output10", label: "Output 10" },
                  { key: "output11", label: "Output 11" },
                  { key: "output12", label: "Output 12" },
                  { key: "output13", label: "Output 13" },
                  { key: "output14", label: "Output 14" },
                  { key: "output15", label: "Output 15" },
                ].map(({ key, label }) => (
                  <div key={key} className="output-card">
                    <h3>{label}</h3>
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
        </div>
      </section>
    </main>
  );
}
