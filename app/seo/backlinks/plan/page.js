"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";

import VyndowShell from "../../../VyndowShell";
import AuthGate from "../../../components/AuthGate";
import { auth } from "../../../firebaseClient";
import { runSuiteLifecycleCheck } from "../../../suiteLifecycleClient";

const PAGE_BG =
  "linear-gradient(180deg, rgba(124,58,237,0.08) 0%, rgba(6,182,212,0.06) 50%, rgba(30,102,255,0.05) 100%)";
const CARD_BG = "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)";
const CARD_BORDER = "1px solid rgba(124,58,237,0.20)";
const SHADOW = "0 10px 26px rgba(15,23,42,0.06)";

export default function BacklinkAuthorityPlanPage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        await runSuiteLifecycleCheck(user.uid);
      } catch (e) {
        console.error("Suite lifecycle check failed:", e);
      }
    });

    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [router]);

  return (
    <AuthGate>
      <VyndowShell>
        <div
          style={{
            minHeight: "100vh",
            background: PAGE_BG,
            padding: "28px 20px 60px",
          }}
        >
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div
              style={{
                borderRadius: 24,
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(255,255,255,0.72)",
                boxShadow: SHADOW,
                backdropFilter: "blur(10px)",
                padding: 24,
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: 30,
                  lineHeight: 1.15,
                  fontWeight: 900,
                  color: "#111827",
                  letterSpacing: "-0.02em",
                }}
              >
                Backlink Authority Plan
              </h1>

              <p
                style={{
                  marginTop: 10,
                  color: "#374151",
                  lineHeight: 1.65,
                  fontSize: 16,
                  maxWidth: 900,
                }}
              >
                Identify backlink opportunities and generate a structured authority-building roadmap based on your competitors.
              </p>

              <div
                style={{
                  marginTop: 22,
                  padding: 22,
                  borderRadius: 18,
                  border: CARD_BORDER,
                  background: CARD_BG,
                  boxShadow: SHADOW,
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
                  Generate Backlink Authority Plan
                </div>

                <p
                  style={{
                    marginTop: 0,
                    color: "#374151",
                    lineHeight: 1.7,
                    maxWidth: 860,
                  }}
                >
                  Vyndow will analyze referring domains linking to your competitors and identify backlink opportunities your website has not yet acquired.
                </p>

                <p
                  style={{
                    marginTop: 0,
                    color: "#374151",
                    lineHeight: 1.7,
                    maxWidth: 860,
                  }}
                >
                  This analysis will help you close the authority gap and systematically build domain credibility.
                </p>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => console.log("Backlink plan generation coming in Stage 5")}
                  style={{ marginTop: 8 }}
                >
                  Generate Backlink Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      </VyndowShell>
    </AuthGate>
  );
}
