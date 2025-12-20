"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
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


const [currentPlan, setCurrentPlan] = useState(null); 
// free | small_business | enterprise

useEffect(() => {
  async function loadPlan() {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      const db = getFirestore();
      const ref = doc(db, `users/${user.uid}/modules/seo`);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        setCurrentPlan(snap.data().plan || "free");
      } else {
        setCurrentPlan("free");
      }
    } catch (e) {
      console.error("Failed to load plan", e);
      setCurrentPlan("free");
    }
  }

  loadPlan();
}, []);


  function isCurrent(plan) {
    return currentPlan === plan;
  }

  function isIntent(plan) {
    return planIntent === plan && !isCurrent(plan);
  }

  function renderPlanButton(plan, priceLabel) {
  const baseBtn = {
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 800,
    cursor: "pointer",
    border: "1px solid #e5e7eb",
  };

  if (isCurrent(plan)) {
    return (
      <button
        type="button"
        style={{
          ...baseBtn,
          background: "#f3f4f6",
          color: "#6b7280",
          cursor: "not-allowed",
        }}
        disabled
      >
        Current Plan
      </button>
    );
  }

  if (isIntent(plan)) {
    return (
      <button
        type="button"
        style={{
          ...baseBtn,
          background: "#6D28D9",
          borderColor: "#6D28D9",
          color: "#fff",
          boxShadow: "0 10px 24px rgba(109,40,217,0.22)",
        }}
      >
        Activate {priceLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      style={{
        ...baseBtn,
        background: "#fff",
        color: "#111827",
      }}
    >
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
        border: highlight
          ? "2px solid #6D28D9"
          : muted
          ? "2px solid #6D28D9"
          : "1px solid #E5E7EB",
        borderRadius: 18,
        padding: 22,
        background: highlight
          ? "#F5F3FF"
          : muted
          ? "#FAF5FF"
          : "#FFFFFF",
        boxShadow: highlight
          ? "0 16px 34px rgba(109,40,217,0.18)"
          : muted
          ? "0 14px 30px rgba(109,40,217,0.10)"
          : "0 10px 24px rgba(0,0,0,0.06)",
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

      <ul style={{ paddingLeft: 18, marginBottom: 16 }}>
        {features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      {children}
    </div>
  );
}


function AddOnCard({ title, price, description, actionLabel, onAction = () => {} }) {
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
<button
  type="button"
  onClick={onAction}
  style={{
    padding: "10px 14px",
    borderRadius: 999,
    fontWeight: 800,
    cursor: "pointer",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#111827",
  }}
>
  {actionLabel}
</button>

      </div>
    </div>
  );
}
