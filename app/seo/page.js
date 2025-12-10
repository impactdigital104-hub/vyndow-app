"use client";

import { useState } from "react";

export default function SeoHomePage() {
  // We'll wire these up properly later
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleGenerate(e) {
    e.preventDefault();
    // Temporary placeholder – in the next step we'll call /api/generate
    alert("Vyndow SEO React UI is now live. API wiring will be added next.");
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
        {/* LEFT: Step 1 – Inputs (we'll expand this over a few passes) */}
        <div className="left">
          <h2>Step 1: Enter Inputs</h2>

          <p className="section-label">A. Brand &amp; Voice Information</p>

          <div className="field-group">
            <label htmlFor="brandDescription">A1. Brand Description</label>
            <textarea
              id="brandDescription"
              placeholder="Describe what the brand does, who it serves, and what makes it unique."
            />
            <div className="small">
              Same intent as A1 in your current V1 form – we&apos;ll copy exact
              helper text later.
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="targetAudience">A2. Target Audience Persona</label>
            <textarea
              id="targetAudience"
              placeholder="Describe key audience segments, pain points, demographics, etc."
            />
          </div>

          <div className="field-group">
            <label>A3. Tone of Voice (select one or more)</label>
            <div className="inline-options">
              <label className="checkbox-label">
                <input type="checkbox" /> Warm &amp; Empathetic
              </label>
              <label className="checkbox-label">
                <input type="checkbox" /> Expert &amp; Authoritative
              </label>
              <label className="checkbox-label">
                <input type="checkbox" /> Educational &amp; Insightful
              </label>
              <label className="checkbox-label">
                <input type="checkbox" /> Conversational &amp; Easy-to-read
              </label>
            </div>
          </div>

          {/* Generate button – API wiring comes in the next session */}
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
                cursor: "pointer"
              }}
            >
              {isSubmitting ? "Generating…" : "Generate SEO Outputs (Demo)"}
            </button>
          </div>
        </div>

        {/* RIGHT: Step 2 – Outputs (placeholder for now) */}
        <div className="right">
          <h2>Step 2: Review Outputs</h2>
          <div className="output-card">
            <h3>Outputs will appear here</h3>
            <p className="output-body">
              In the next step, we&apos;ll call the existing{" "}
              <code>/api/generate</code> endpoint from this React page and show
              all 15 outputs (Title, Meta Description, H1, Blog Article, FAQ
              Schema, etc.) in cards, just like your current V1 UI.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
