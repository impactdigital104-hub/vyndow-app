"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import VyndowShell from "../VyndowShell";

export default function PricingPage() {
  const router = useRouter();

  const [openSection, setOpenSection] = useState("organic");
  const [currentSuitePlan, setCurrentSuitePlan] = useState("free");

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const open = (qs.get("open") || "").toLowerCase();

      if (
        open === "organic" ||
        open === "social" ||
        open === "ads" ||
        open === "abm" ||
        open === "analytics" ||
        open === "gtm" ||
        open === "cmo"
      ) {
        setOpenSection(open);
      } else {
        setOpenSection("organic");
      }
    } catch (e) {
      setOpenSection("organic");
    }
  }, []);

  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentSuitePlan("free");
        return;
      }

      try {
        const db = getFirestore();
        const suiteRef = doc(db, `users/${user.uid}/entitlements/suite`);
        const suiteSnap = await getDoc(suiteRef);

        if (suiteSnap.exists()) {
          const plan = String(suiteSnap.data()?.plan || "free")
            .toLowerCase()
            .trim();
          setCurrentSuitePlan(plan || "free");
        } else {
          setCurrentSuitePlan("free");
        }
      } catch (e) {
        console.error("Failed to load suite plan", e);
        setCurrentSuitePlan("free");
      }
    });

    return () => unsubscribe();
  }, []);

  async function loadRazorpay() {
    if (typeof window === "undefined") return false;
    if (window.Razorpay) return true;

    return await new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function startSuiteSubscriptionCheckout(plan) {
    try {
      const ok = await loadRazorpay();
      if (!ok) {
        alert("Razorpay checkout failed to load. Please try again.");
        return;
      }

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        alert("Please login again.");
        router.push("/login?next=/pricing");
        return;
      }

      const token = await user.getIdToken();

      const resp = await fetch("/api/razorpay/createSuiteSubscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json.ok) {
        alert("Could not start payment: " + (json.error || "Unknown error"));
        return;
      }

      const planLabel =
        plan === "starter" ? "Starter" : plan === "growth" ? "Growth" : "Pro";

      const options = {
        key: json.razorpayKeyId,
        subscription_id: json.subscriptionId,
        name: "Vyndow Organic",
        description: `${planLabel} Monthly`,
        prefill: {
          email: user.email || "",
        },
        notes: {
          uid: user.uid,
          suitePlan: plan,
          module: "suite",
        },
        handler: function () {
          alert(
            "Payment received. Your plan should activate shortly. Please refresh in 10–20 seconds."
          );
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert("Error: " + (e?.message || String(e)));
    }
  }

  async function startAdditionalWebsiteCheckout() {
    try {
      const ok = await loadRazorpay();
      if (!ok) {
        alert("Razorpay checkout failed to load. Please try again.");
        return;
      }

      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        alert("Please login again.");
        router.push("/login?next=/pricing");
        return;
      }

      const token = await user.getIdToken();

      const resp = await fetch("/api/razorpay/createAddWebsiteSubscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json.ok) {
        if (json.error === "UPGRADE_REQUIRED") {
          alert("Please upgrade to a paid plan first.");
        } else {
          alert("Could not start payment: " + (json.error || "Unknown error"));
        }
        return;
      }

      const options = {
        key: json.razorpayKeyId,
        subscription_id: json.subscriptionId,
        name: "Vyndow Organic",
        description: "Additional Website",
        prefill: { email: user.email || "" },
        notes: {
          uid: user.uid,
          addonType: "additional_website",
          qty: "1",
        },
        handler: function () {
          alert(
            "Payment received. Website capacity will update shortly. Please refresh in 10–20 seconds."
          );
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert("Error: " + (e?.message || String(e)));
    }
  }

  function isCurrentPlan(plan) {
    return currentSuitePlan === plan;
  }

  function renderPlanButton(plan, buttonLabel) {
    const base = {
      padding: "12px 18px",
      borderRadius: 999,
      fontWeight: 900,
      border: "1px solid rgba(148,163,184,0.45)",
      cursor: "pointer",
      transition: "all 0.15s ease",
      width: "100%",
    };

    if (plan === "free") {
      return (
        <button
          type="button"
          disabled
          style={{
            ...base,
            cursor: "not-allowed",
            background: "#E5E7EB",
            color: "#111827",
            boxShadow: "none",
            opacity: 0.9,
          }}
        >
          Current Plan
        </button>
      );
    }

    if (isCurrentPlan(plan)) {
      return (
        <button
          type="button"
          disabled
          style={{
            ...base,
            cursor: "not-allowed",
            background: "#E5E7EB",
            color: "#111827",
            boxShadow: "none",
            opacity: 0.9,
          }}
        >
          Current Plan
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => startSuiteSubscriptionCheckout(plan)}
        style={{
          ...base,
          border: "0",
          color: "#fff",
          background: "#6D28D9",
          boxShadow: "0 14px 30px rgba(109,40,217,0.18)",
        }}
      >
        {buttonLabel}
      </button>
    );
  }

  function AccordionHeader({ title, subtitle, active, onClick }) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "14px 16px",
          borderRadius: 14,
          border: active ? "2px solid #6D28D9" : "1px solid #E5E7EB",
          background: active ? "#F5F3FF" : "#FFFFFF",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 14 }}>{title}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{subtitle}</div>
        </div>
        <div style={{ fontWeight: 900, color: "#6D28D9" }}>
          {active ? "Open" : "View"}
        </div>
      </button>
    );
  }

  return (
    <VyndowShell activeModule="pricing">
      <main className="page">
        <header style={{ marginBottom: 18 }}>
          <span className="badge">Billing</span>
          <h1>Pricing</h1>
          <p className="sub">
            Choose a Vyndow growth module below. More modules are being added over the coming months.
          </p>
        </header>

        <section style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          <AccordionHeader
            title="Vyndow Organic"
            subtitle="Strategy + SEO + GEO in one organic growth engine"
            active={openSection === "organic"}
            onClick={() => setOpenSection("organic")}
          />

          {openSection === "organic" && (
            <div style={{ padding: "10px 4px 0 4px" }}>
              <div
                style={{
                  padding: 18,
                  border: "1px solid #E5E7EB",
                  borderRadius: 18,
                  background: "#FFFFFF",
                  marginBottom: 18,
                  color: "#374151",
                  lineHeight: 1.6,
                }}
              >
                Vyndow Organic helps you build a complete organic growth engine — combining website strategy, brand-voice SEO blog generation, and generative search optimization (GEO). The platform also provides a 90-day SEO blueprint, monthly performance analysis, and backlink opportunity insights to help your brand grow organically with confidence.
              </div>

              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 20,
                  marginBottom: 20,
                }}
              >
                <PlanCard
                  title="Free"
                  price="$0"
                  highlight={currentSuitePlan === "free"}
                  muted={currentSuitePlan === "free"}
                  features={[
                    "1 website",
                    "Audit up to 2 pages",
                    "Generate up to 4 SEO blueprints",
                    "2 SEO blogs per month — built to your brand voice & personality",
                    "2 GEO pages per month",
                    "90-Day SEO Blueprint",
                  ]}
                >
                  {renderPlanButton("free", "Current Plan")}
                </PlanCard>

                <PlanCard
                  title="Starter"
                  price="$29 / month"
                  highlight={false}
                  muted={currentSuitePlan === "starter"}
                  features={[
                    "1 website",
                    "Audit up to 10 pages",
                    "Generate up to 15 SEO blueprints",
                    "6 SEO blogs per month — built to your brand voice & personality",
                    "10 GEO pages per month",
                    "90-Day SEO Blueprint",
                    "Monthly SEO performance analysis (launching soon)",
                    "Backlink analysis (launching soon)",
                    "Backlink opportunity blueprint (launching soon)",
                  ]}
                >
                  {renderPlanButton("starter", "Upgrade to Starter")}
                </PlanCard>

                <PlanCard
                  title="Growth"
                  price="$49 / month"
                  highlight={true}
                  muted={currentSuitePlan === "growth"}
                  badge="⭐ Most Popular"
                  features={[
                    "1 website",
                    "Audit up to 25 pages",
                    "Generate up to 37 SEO blueprints",
                    "15 SEO blogs per month — built to your brand voice & personality",
                    "25 GEO pages per month",
                    "90-Day SEO Blueprint",
                    "Monthly SEO performance analysis (launching soon)",
                    "Backlink analysis (launching soon)",
                    "Backlink opportunity blueprint (launching soon)",
                  ]}
                >
                  {renderPlanButton("growth", "Upgrade to Growth")}
                </PlanCard>

                <PlanCard
                  title="Pro"
                  price="$79 / month"
                  highlight={false}
                  muted={currentSuitePlan === "pro"}
                  badge="🚀 Best for Agencies"
                  features={[
                    "2 websites",
                    "Audit up to 50 pages per website",
                    "Generate up to 75 SEO blueprints per website",
                    "25 SEO blogs per month — built to your brand voice & personality",
                    "50 GEO pages per month",
                    "90-Day SEO Blueprint",
                    "Monthly SEO performance analysis (launching soon)",
                    "Backlink analysis (launching soon)",
                    "Backlink opportunity blueprint (launching soon)",
                  ]}
                >
                  {renderPlanButton("pro", "Upgrade to Pro")}
                </PlanCard>
              </section>

              <div
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: 18,
                  padding: 20,
                  background: "#FFFFFF",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    No lock-in • Cancel anytime
                  </div>
                  <div style={{ color: "#6b7280" }}>
                    Need more websites? Buy additional websites for $10 each
                  </div>
                </div>

                <button
                  type="button"
                  onClick={startAdditionalWebsiteCheckout}
                  style={{
                    padding: "12px 18px",
                    borderRadius: 999,
                    fontWeight: 900,
                    border: "0",
                    cursor: "pointer",
                    color: "#fff",
                    background: "#6D28D9",
                    boxShadow: "0 14px 30px rgba(109,40,217,0.18)",
                  }}
                >
                  Buy Additional Website
                </button>
              </div>
            </div>
          )}

          <AccordionHeader
            title="Vyndow Social"
            subtitle="Launching April"
            active={openSection === "social"}
            onClick={() => setOpenSection("social")}
          />
          {openSection === "social" && (
            <ComingSoonCard label="Vyndow Social is launching soon." />
          )}

          <AccordionHeader
            title="Vyndow Ads"
            subtitle="Launching May"
            active={openSection === "ads"}
            onClick={() => setOpenSection("ads")}
          />
          {openSection === "ads" && (
            <ComingSoonCard label="Vyndow Ads is launching soon." />
          )}

          <AccordionHeader
            title="Vyndow ABM"
            subtitle="Launching June"
            active={openSection === "abm"}
            onClick={() => setOpenSection("abm")}
          />
          {openSection === "abm" && (
            <ComingSoonCard label="Vyndow ABM is launching soon." />
          )}

          <AccordionHeader
            title="Vyndow Analytics"
            subtitle="Launching July"
            active={openSection === "analytics"}
            onClick={() => setOpenSection("analytics")}
          />
          {openSection === "analytics" && (
            <ComingSoonCard label="Vyndow Analytics is launching soon." />
          )}

          <AccordionHeader
            title="Vyndow GTM"
            subtitle="Launching August"
            active={openSection === "gtm"}
            onClick={() => setOpenSection("gtm")}
          />
          {openSection === "gtm" && (
            <ComingSoonCard label="Vyndow GTM is launching soon." />
          )}

          <AccordionHeader
            title="Vyndow CMO"
            subtitle="Launching September"
            active={openSection === "cmo"}
            onClick={() => setOpenSection("cmo")}
          />
          {openSection === "cmo" && (
            <ComingSoonCard label="Vyndow CMO is launching soon." />
          )}
        </section>

        <footer style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          Secure payments via Razorpay. Cancel anytime.
        </footer>
      </main>
    </VyndowShell>
  );
}

function PlanCard({ title, price, features, children, highlight, muted, badge }) {
  return (
    <div
      style={{
        border: highlight || muted ? "2px solid #6D28D9" : "1px solid #E5E7EB",
        borderRadius: 22,
        padding: 24,
        background: highlight || muted ? "#F5F3FF" : "#FFFFFF",
        boxShadow: "0 16px 34px rgba(2,6,23,0.08)",
      }}
    >
      {badge && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 999,
            background: "#6D28D9",
            color: "#fff",
            fontWeight: 800,
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {badge}
        </div>
      )}

      <h3>{title}</h3>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{price}</div>

      <ul style={{ paddingLeft: 18, marginBottom: 16, lineHeight: 1.65 }}>
        {features.map((f) => (
          <li key={f} style={{ marginBottom: 8 }}>
            {f}
          </li>
        ))}
      </ul>

      {children}
    </div>
  );
}

function ComingSoonCard({ label }) {
  return (
    <div style={{ padding: "10px 4px 0 4px" }}>
      <div
        style={{
          border: "1px solid #E5E7EB",
          borderRadius: 18,
          padding: 24,
          background: "#FFFFFF",
          color: "#6b7280",
        }}
      >
        {label}
      </div>
    </div>
  );
}
