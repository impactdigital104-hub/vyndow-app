"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import VyndowShell from "../VyndowShell";

/**
 * UI-ONLY Pricing Page
 * Payments (Razorpay) will be wired later.
 */
export default function PricingPage() {
  const router = useRouter();
 // plan intent from main site or CTA (read client-side to avoid prerender failures)
const [planIntent, setPlanIntent] = useState(null);

useEffect(() => {
  try {
    const p = new URLSearchParams(window.location.search).get("plan");
    setPlanIntent(p);
  } catch (e) {
    setPlanIntent(null);
  }
}, []);


  // TEMP: replace later with real Firestore data
  const [currentPlan, setCurrentPlan] = useState("free"); 
  // possible values: free | small_business | enterprise

  useEffect(() => {
    // later: fetch actual plan from Firestore
    // setCurrentPlan(...)
  }, []);

  function isCurrent(plan) {
    return currentPlan === plan;
  }

  function isIntent(plan) {
    return planIntent === plan && !isCurrent(plan);
  }

  function renderPlanButton(plan, priceLabel) {
    if (isCurrent(plan)) {
      return (
        <button className="btn-disabled">
          Current Plan
        </button>
      );
    }

    if (isIntent(plan)) {
      return (
        <button className="btn-primary">
          Activate {priceLabel}
        </button>
      );
    }

    return (
      <button className="btn-secondary">
        Upgrade
      </button>
    );
  }

  return (
    <VyndowShell activeModule="pricing">
      <main className="page">
        {/* ================= HEADER ================= */}
        <header style={{ marginBottom: 24 }}>
          <span className="badge">Billing</span>
          <h1>Billing &amp; Plans</h1>

          {planIntent ? (
            <p className="sub">
              You selected the <strong>{planIntent.replace("_", " ")}</strong> plan.
              Complete payment to activate it.
            </p>
          ) : (
            <p className="sub">
              Review your current plan or upgrade to unlock more usage.
            </p>
          )}
        </header>

        {/* ================= PLAN CARDS ================= */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
            marginBottom: 32,
          }}
        >
          {/* FREE */}
          <PlanCard
            title="Free"
            price="₹0"
            highlight={false}
            muted={isCurrent("free")}
            features={[
              "1 Website",
              "2 Blogs / website / month",
            ]}
          >
            {renderPlanButton("free", "Free")}
          </PlanCard>

          {/* SMALL BUSINESS */}
          <PlanCard
            title="Small Business"
            price="₹499 / month"
            highlight={isIntent("small_business")}
            muted={isCurrent("small_business")}
            badge="Most Popular"
            features={[
              "1 Website",
              "6 Blogs / website / month",
            ]}
          >
            {renderPlanButton("small_business", "₹499")}
          </PlanCard>

          {/* ENTERPRISE */}
          <PlanCard
            title="Enterprise"
            price="₹999 / month"
            highlight={isIntent("enterprise")}
            muted={isCurrent("enterprise")}
            features={[
              "1 Website",
              "15 Blogs / website / month",
              "3 Users",
            ]}
          >
            {renderPlanButton("enterprise", "₹999")}
          </PlanCard>
        </section>

        {/* ================= ADD-ONS ================= */}
        <section style={{ marginBottom: 32 }}>
          <h2>Add-ons</h2>

          {/* BLOG CREDITS */}
          <AddOnCard
            title="Extra Blog Credits"
            price="₹199"
            description="+2 blog credits (used after monthly limit)"
            actionLabel="Buy 2 Credits"
          />

          {/* ADD WEBSITE */}
          <AddOnCard
            title="Additional Website"
            price="As per plan"
            description="Adds capacity for 1 more website with full monthly quota"
            actionLabel="Add Website"
            onAction={() => router.push("/websites")}
          />
        </section>

        {/* ================= FOOTER NOTE ================= */}
        <footer style={{ fontSize: "0.85rem", color: "#6b7280" }}>
          Secure payments via Razorpay. Cancel or upgrade anytime.
        </footer>
      </main>
    </VyndowShell>
  );
}

/* ===================== COMPONENTS ===================== */

function PlanCard({ title, price, features, children, highlight, muted, badge }) {
  return (
    <div
      style={{
        border: highlight ? "2px solid #111827" : "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 20,
        background: muted ? "#f9fafb" : "#fff",
        opacity: muted ? 0.85 : 1,
      }}
    >
      {badge && (
        <div className="pill pill-dark" style={{ marginBottom: 8 }}>
          {badge}
        </div>
      )}

      <h3>{title}</h3>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{price}</div>

      <ul style={{ paddingLeft: 18, marginBottom: 16 }}>
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      {children}
    </div>
  );
}

function AddOnCard({ title, price, description, actionLabel, onAction }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <strong>{title}</strong>
        <div style={{ fontSize: "0.9rem", color: "#6b7280" }}>
          {description}
        </div>
      </div>

      <div style={{ textAlign: "right" }}>
        <div style={{ fontWeight: 700 }}>{price}</div>
        <button className="btn-secondary" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
