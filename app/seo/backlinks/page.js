"use client";

import VyndowShell from "../../VyndowShell";
import AuthGate from "../../components/AuthGate";

export default function BacklinkAuthorityPage() {
  return (
    <AuthGate>
      <VyndowShell activeModule="seo">
        <div
          style={{
            padding: 28,
            background:
              "linear-gradient(180deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.06) 50%, rgba(30,102,255,0.05) 100%)",
            borderRadius: 18,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 980,
              margin: "0 auto",
              paddingTop: 6,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                lineHeight: 1.2,
                fontWeight: 800,
                color: "#111827",
              }}
            >
              Backlink Authority
            </h1>

            <p
              style={{
                marginTop: 10,
                color: "#374151",
                lineHeight: 1.65,
                fontSize: 16,
              }}
            >
              Build domain authority and close the gap with your competitors.
            </p>

            <div
              style={{
                marginTop: 22,
                padding: 22,
                borderRadius: 18,
                border: "1px solid rgba(124,58,237,0.20)",
                background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
                boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#111827",
                  marginBottom: 10,
                }}
              >
                Backlink Authority Plan
              </div>

              <p
                style={{
                  marginTop: 0,
                  color: "#374151",
                  lineHeight: 1.7,
                }}
              >
                This module will analyze your current backlink profile, compare it
                with your competitors, and generate a plan-based monthly backlink
                action list.
              </p>

              <button
                type="button"
                className="btn btn-primary"
                style={{ marginTop: 8 }}
              >
                Generate Backlink Plan
              </button>

              <p
                style={{
                  marginTop: 14,
                  marginBottom: 0,
                  color: "#6b7280",
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                Context and backlink analysis will be connected in the next stage.
              </p>
            </div>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
