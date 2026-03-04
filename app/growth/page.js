"use client";

import { useEffect, useState } from "react";
import VyndowShell from "../VyndowShell";
import AuthGate from "../components/AuthGate";
import { auth } from "../firebaseClient";

export default function GrowthWelcomePage() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setEmail(u?.email || "");
    });
    return () => unsub();
  }, []);

  return (
    <AuthGate>
      <VyndowShell activeModule="growth">
       <div style={{
  padding: 28,
  background:
    "linear-gradient(180deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.06) 50%, rgba(30,102,255,0.05) 100%)",
  borderRadius: 18
}}>
         <div style={{ 
  width: "100%", 
  maxWidth: 980, 
  margin: "0 auto",
  paddingTop: 6
}}>
            {/* Section 1 — Hero (Founder-led) */}
<h1 style={{
  margin: 0,
  fontSize: 22,
  lineHeight: 1.3,
  fontWeight: 600,
  background: "linear-gradient(90deg, #7c3aed, #1e66ff)",
WebkitBackgroundClip: "text",
WebkitTextFillColor: "transparent",
}}>
              Hey {email || "there"}
            </h1>

            <div style={{ marginTop: 10, color: "#111827", fontSize: 18, fontWeight: 700 }}>
              Welcome to Vyndow.
            </div>

            <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
              I built Vyndow to help brands grow online with clarity, structure and intelligent execution — not guesswork.
            </p>

            <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
              Over the past 30+ years in marketing, I’ve learned what consistently drives sustainable digital growth. Vyndow combines that experience with AI to give you a unified, intelligent growth engine for your business.
            </p>

            <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
              Let’s build your growth engine.
              <br />
              What would you like to do today?
            </p>

            {/* Section 2 — Start Here (Instructional) */}
            <div
              style={{
  marginTop: 22,
  padding: 22,
  borderRadius: 18,
  border: "1px solid rgba(124,58,237,0.35)",
  background:
    "linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.06) 100%)",
  boxShadow: "0 8px 26px rgba(0,0,0,0.05)"
}}
            >
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10, color: "#111827" }}>
                Start Here: Define Your Website
              </div>

              <p style={{ marginTop: 0, color: "#374151", lineHeight: 1.65 }}>
                To begin building your AI-enhanced marketing growth engine, the first step is defining the website or brand you want Vyndow to support.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                Vyndow builds a unified intelligence model around your selected website. Every pillar — from Organic to Social to Ads — uses this foundation to analyze, plan and execute growth.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                Please head to the Websites &amp; Clients section in the sidebar and enter your website details to get started.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                Because Vyndow builds deep intelligence around your selected website, this information cannot be changed once submitted. Please ensure the details are accurate before saving.
              </p>
            </div>

            {/* Section 3 — Vyndow Organic (Live) */}
            <div style={{ marginTop: 22 }}>
             <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10, color: "#111827" }}>
                Vyndow Organic (Live)
              </div>

              <p style={{ marginTop: 0, color: "#374151", lineHeight: 1.65 }}>
                Vyndow Organic is the foundation of your digital visibility and your long-term search and discovery engine.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                It helps your brand get found, ranked and trusted across both traditional search and emerging AI-driven discovery environments.
              </p>

              <div style={{ marginTop: 14, color: "#111827", fontWeight: 800 }}>
                Within Organic, you can build:
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(1, minmax(0, 1fr))", gap: 12 }}>
               <div style={{ padding: 14, border: "1px solid rgba(124,58,237,0.20)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Strategy</div>
                  <div style={{ color: "#374151", lineHeight: 1.65 }}>
                    Audit your website, define your on-page SEO framework, structure your content and page architecture, and generate a clear 90-day actionable growth blueprint — complete with ready-to-publish on-page assets.
                  </div>
                </div>

               <div style={{ padding: 14, border: "1px solid rgba(124,58,237,0.20)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>SEO</div>
                  <div style={{ color: "#374151", lineHeight: 1.65 }}>
                    Create brand-voice sensitive, ready-to-publish blogs with complete on-page assets designed to strengthen visibility and authority.
                  </div>
                </div>

                <div style={{ padding: 14, border: "1px solid rgba(124,58,237,0.20)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>GEO (Generative Engine Optimization)</div>
                  <div style={{ color: "#374151", lineHeight: 1.65 }}>
                    Prepare your website for AI-driven discovery so your content is structured, discoverable and context-ready for generative platforms.
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4 — What’s Coming Next (Visionary) */}
            <div style={{ marginTop: 22 }}>
             <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10, color: "#111827" }}>
                What’s Coming Next
              </div>

              <p style={{ marginTop: 0, color: "#374151", lineHeight: 1.65 }}>
                Over three decades in marketing, I’ve seen how businesses and agencies struggle — not because they lack ambition, but because they lack structured access to experienced marketing teams.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                Vyndow is being built to change that.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                Each upcoming pillar is designed to feel like having highly experienced marketing professionals working alongside you — enhanced with AI, structured for clarity, and focused on measurable growth.
              </p>

              <div style={{ marginTop: 14, color: "#111827", fontWeight: 800 }}>
                Here’s what’s next:
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 12,
                }}
              >
               <div style={{ padding: 14, border: "1px solid rgba(30,102,255,0.18)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800 }}>Vyndow Social — Launching April 2026</div>
                  <div style={{ marginTop: 6, color: "#374151", lineHeight: 1.65 }}>
                    AI-powered social media planning and execution. Think of this as having your own complete social media team working alongside you.
                  </div>
                </div>

               <div style={{ padding: 14, border: "1px solid rgba(30,102,255,0.18)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800 }}>Vyndow Ads — Launching May 2026</div>
                  <div style={{ marginTop: 6, color: "#374151", lineHeight: 1.65 }}>
                    Put your performance marketing team to work. Plan and execute structured campaigns across Google, Meta and other major platforms with clarity and control.
                  </div>
                </div>

                <div style={{ padding: 14, border: "1px solid rgba(30,102,255,0.18)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800 }}>Vyndow ABM — Launching June 2026</div>
                  <div style={{ marginTop: 6, color: "#374151", lineHeight: 1.65 }}>
                    Account-based marketing built for B2B growth. Think of it as having your own ABM team — defining your ICP, structuring your database, creating content, and executing precise outreach programs.
                  </div>
                </div>

               <div style={{ padding: 14, border: "1px solid rgba(30,102,255,0.18)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800 }}>Vyndow Analytics — Launching July 2026</div>
                  <div style={{ marginTop: 6, color: "#374151", lineHeight: 1.65 }}>
                    Unified growth performance visibility across your entire digital marketing ecosystem — website, SEO, social, advertising, email and ABM.
                  </div>
                </div>

               <div style={{ padding: 14, border: "1px solid rgba(30,102,255,0.18)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800 }}>Vyndow GTM — Launching August 2026</div>
                  <div style={{ marginTop: 6, color: "#374151", lineHeight: 1.65 }}>
                    Go-to-market frameworks designed to help you launch new brands digitally with confidence, structure and strategic clarity.
                  </div>
                </div>

               <div style={{ padding: 14, border: "1px solid rgba(30,102,255,0.18)", borderRadius: 14, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", boxShadow: "0 10px 26px rgba(15,23,42,0.06)" }}>
                  <div style={{ fontWeight: 800 }}>Vyndow CMO — Launching September 2026</div>
                  <div style={{ marginTop: 6, color: "#374151", lineHeight: 1.65 }}>
                    Your AI-enhanced Chief Marketing Officer — working alongside you to guide, coordinate and elevate all your digital and marketing efforts seamlessly.
                  </div>
                </div>
              </div>
            </div>

            {/* Section 5 — Strategic Guidance (Warm) */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10, color: "#111827" }}>
                Need Strategic Guidance?
              </div>

              <p style={{ marginTop: 0, color: "#374151", lineHeight: 1.65 }}>
                If you’d like to think through your growth strategy together, I’d be happy to help.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                You can book a 20-minute Growth Consultation with the Vyndow team to discuss your goals, challenges and next steps.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                To schedule a consultation, please write to feedback@vyndow.com
                <br />.
              </p>
            </div>

            {/* Section 6 — Founder Access (Warm) */}
            <div style={{ marginTop: 22, paddingBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 10, color: "#111827" }}>
                Have Something to Say to Me?
              </div>

              <p style={{ marginTop: 0, color: "#374151", lineHeight: 1.65 }}>
                If you have feedback, ideas, suggestions — or simply want to share what you’re building — feel free to reach out directly.
              </p>

              <p style={{ marginTop: 10, color: "#374151", lineHeight: 1.65 }}>
                You can email me at rajesh@vyndow.com
                <br />.
                <br />
                I personally read every message.
              </p>
            </div>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
