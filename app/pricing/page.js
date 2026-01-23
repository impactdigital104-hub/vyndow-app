"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import VyndowShell from "../VyndowShell";

/**
 * Pricing Page
 * Phase 8 Step 1:
 * - Convert into accordion: SEO + GEO
 * - GEO shows pricing + buttons (wired in next steps)
 */

export default function PricingPage() {
  const router = useRouter();

  // Which accordion section is open (seo | geo)
  const [openSection, setOpenSection] = useState("seo");

  // SEO plan intent from CTA (/pricing?plan=small_business etc.)
  const [seoPlanIntent, setSeoPlanIntent] = useState(null);

  // Current plans
  const [currentSeoPlan, setCurrentSeoPlan] = useState(null); // free | small_business | enterprise
  const [currentGeoPlan, setCurrentGeoPlan] = useState(null); // free | small_business | enterprise

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const plan = qs.get("plan"); // legacy SEO intent
      const open = qs.get("open"); // open=geo or open=seo

      setSeoPlanIntent(plan);

      if (open === "geo") setOpenSection("geo");
      else if (open === "seo") setOpenSection("seo");
      else setOpenSection("seo");
    } catch (e) {
      setSeoPlanIntent(null);
      setOpenSection("seo");
    }
  }, []);

  // Load current plans from Firestore
  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setCurrentSeoPlan("free");
        setCurrentGeoPlan("free");
        return;
      }

      try {
        const db = getFirestore();

        // SEO master plan
        const seoRef = doc(db, `users/${user.uid}/modules/seo`);
        const seoSnap = await getDoc(seoRef);
        if (seoSnap.exists()) setCurrentSeoPlan(seoSnap.data().plan || "free");
        else setCurrentSeoPlan("free");

        // GEO master plan
        const geoRef = doc(db, `users/${user.uid}/modules/geo`);
        const geoSnap = await getDoc(geoRef);
        if (geoSnap.exists()) setCurrentGeoPlan(geoSnap.data().plan || "free");
        else setCurrentGeoPlan("free");
      } catch (e) {
        console.error("Failed to load plan(s)", e);
        setCurrentSeoPlan("free");
        setCurrentGeoPlan("free");
      }
    });

    return () => unsubscribe();
  }, []);

  function isCurrentSeo(plan) {
    return currentSeoPlan === plan;
  }
  function isIntentSeo(plan) {
    return seoPlanIntent === plan && !isCurrentSeo(plan);
  }

  // ---------------------------
  // Razorpay loader (shared)
  // ---------------------------
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

  // ===========================
  // SEO CHECKOUTS (unchanged)
  // ===========================

  async function startSeoSubscriptionCheckout(plan) {
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
        router.push("/login");
        return;
      }

      const token = await user.getIdToken();

      const resp = await fetch("/api/razorpay/createSubscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const json = await resp.json();

      if (!resp.ok || !json.ok) {
        alert("Could not start payment: " + (json.error || "Unknown error"));
        return;
      }

      const options = {
        key: json.razorpayKeyId,
        subscription_id: json.subscriptionId,
        name: "Vyndow SEO",
        description:
          plan === "enterprise" ? "Enterprise Monthly" : "Small Business Monthly",
        prefill: {
          email: user.email || "",
        },
        notes: {
          uid: user.uid,
          vyndowPlan: plan,
        },
        handler: function () {
          alert(
            "Payment received. Activating plan... Please refresh in 10–20 seconds."
          );
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert("Error: " + (e?.message || String(e)));
    }
  }

  async function startSeoBlogCreditsCheckout() {
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
        router.push("/login");
        return;
      }

      const token = await user.getIdToken();

      const resp = await fetch("/api/razorpay/createBlogCreditsOrder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await resp.json();

      if (!resp.ok || !json.ok) {
        alert("Could not start payment: " + (json.error || "Unknown error"));
        return;
      }

      const options = {
        key: json.razorpayKeyId,
        order_id: json.orderId,
        name: "Vyndow SEO",
        description: "Extra Blog Credits (+2)",
        prefill: { email: user.email || "" },
        notes: {
          uid: user.uid,
          addonType: "extra_blog_credits",
          qty: "2",
        },
        handler: function () {
          alert(
            "Payment received. Credits will reflect shortly. Please refresh in 10–20 seconds."
          );
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert("Error: " + (e?.message || String(e)));
    }
  }

  async function startSeoAddWebsiteCheckout() {
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
        router.push("/login");
        return;
      }

      if (currentSeoPlan !== "small_business" && currentSeoPlan !== "enterprise") {
        alert("Please upgrade to a paid plan before buying an additional website.");
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

      const json = await resp.json();

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
        name: "Vyndow SEO",
        description:
          currentSeoPlan === "enterprise"
            ? "Add Website (Enterprise)"
            : "Add Website (Small Business)",
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

  // ===========================
  // GEO CHECKOUTS (wired next)
  // ===========================
  function geoNotWiredYet() {
    alert(
      "GEO billing buttons are added in Phase 8 Step 1.\n\nNext we will wire Razorpay + APIs + webhook.\n\nFor now, please create GEO plans in Razorpay Test mode and share the plan_ids."
    );
  }

  // ---------------------------
  // UI helpers
  // ---------------------------
  function renderSeoPlanButton(plan, priceLabel) {
    const base = {
      padding: "12px 18px",
      borderRadius: 999,
      fontWeight: 900,
      border: "1px solid rgba(148,163,184,0.45)",
      cursor: "pointer",
      transition: "all 0.15s ease",
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
          Free Plan
        </button>
      );
    }

    if (isCurrentSeo(plan)) {
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

    if (isIntentSeo(plan)) {
      return (
        <button
          type="button"
          onClick={() => startSeoSubscriptionCheckout(plan)}
          style={{
            ...base,
            border: "0",
            color: "#fff",
            background: "linear-gradient(135deg, #7C3AED, #06B6D4)",
            boxShadow: "0 14px 30px rgba(124,58,237,0.22)",
          }}
        >
          Activate {priceLabel}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => startSeoSubscriptionCheckout(plan)}
        style={{
          ...base,
          border: "0",
          color: "#fff",
          background: "#6D28D9",
          boxShadow: "0 14px 30px rgba(109,40,217,0.18)",
        }}
      >
        Upgrade
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
        {/* HEADER */}
        <header style={{ marginBottom: 18 }}>
          <span className="badge">Billing</span>
          <h1>Billing &amp; Plans</h1>
          <p className="sub">
            Choose a module below. SEO billing is live. GEO billing will be wired
            in the next Phase 8 steps.
          </p>
        </header>

        {/* ACCORDION */}
        <section style={{ display: "grid", gap: 12, marginBottom: 18 }}>
          <AccordionHeader
            title="Vyndow SEO"
            subtitle="Blog credits + Website add-on (live)"
            active={openSection === "seo"}
            onClick={() => setOpenSection("seo")}
          />
          {openSection === "seo" && (
            <div style={{ padding: "10px 4px 0 4px" }}>
              {/* SEO PLAN CARDS */}
              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 20,
                  marginBottom: 24,
                }}
              >
                <PlanCard
                  title="Free"
                  price="₹0"
                  highlight={false}
                  muted={isCurrentSeo("free")}
                  features={["1 Website", "2 Blogs / website / month"]}
                >
                  {renderSeoPlanButton("free", "Free")}
                </PlanCard>

                <PlanCard
                  title="Small Business"
                  price="₹499 / month"
                  highlight={isIntentSeo("small_business")}
                  muted={isCurrentSeo("small_business")}
                  badge="Most Popular"
                  features={["1 Website", "6 Blogs / website / month"]}
                >
                  {renderSeoPlanButton("small_business", "₹499")}
                </PlanCard>

                <PlanCard
                  title="Enterprise"
                  price="₹999 / month"
                  highlight={isIntentSeo("enterprise")}
                  muted={isCurrentSeo("enterprise")}
                  features={["1 Website", "15 Blogs / website / month", "3 Users"]}
                >
                  {renderSeoPlanButton("enterprise", "₹999")}
                </PlanCard>
              </section>

              {/* SEO ADD-ONS */}
              <section style={{ marginBottom: 10 }}>
                <h2>Add-ons</h2>

                <AddOnCard
                  title="Extra Blog Credits"
                  price="₹199"
                  description="+2 blog credits (used after monthly limit)"
                  actionLabel="Buy 2 Credits"
                  onAction={startSeoBlogCreditsCheckout}
                />

                <AddOnCard
                  title="Additional Website"
                  price={
                    currentSeoPlan === "enterprise"
                      ? "₹999 / month"
                      : currentSeoPlan === "small_business"
                      ? "₹499 / month"
                      : "Upgrade to buy"
                  }
                  description="Adds capacity for 1 more website with full monthly quota"
                  actionLabel={currentSeoPlan === "free" ? "Upgrade first" : "Add Website"}
                  onAction={
                    currentSeoPlan === "free"
                      ? () => router.push("/pricing?plan=small_business&open=seo")
                      : startSeoAddWebsiteCheckout
                  }
                />
              </section>
            </div>
          )}

          <AccordionHeader
            title="Vyndow GEO"
            subtitle="Pages/month + Extra URL packs + Add website (wiring next)"
            active={openSection === "geo"}
            onClick={() => setOpenSection("geo")}
          />
          {openSection === "geo" && (
            <div style={{ padding: "10px 4px 0 4px" }}>
              {/* GEO PLAN CARDS */}
              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 20,
                  marginBottom: 24,
                }}
              >
                <PlanCard
                  title="Free"
                  price="₹0"
                  highlight={false}
                  muted={currentGeoPlan === "free"}
                  features={["5 Pages / month", "1 Website"]}
                >
                  <button
                    type="button"
                    disabled
                    style={{
                      padding: "12px 18px",
                      borderRadius: 999,
                      fontWeight: 900,
                      border: "1px solid rgba(148,163,184,0.45)",
                      cursor: "not-allowed",
                      background: "#E5E7EB",
                      color: "#111827",
                      opacity: 0.9,
                    }}
                  >
                    Free Plan
                  </button>
                </PlanCard>

                <PlanCard
                  title="Small Business"
                  price="₹799 / month"
                  highlight={false}
                  muted={currentGeoPlan === "small_business"}
                  badge="Most Popular"
                  features={["20 Pages / month", "1 Website"]}
                >
                  <button
                    type="button"
                    onClick={geoNotWiredYet}
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
                    Upgrade
                  </button>
                </PlanCard>

                <PlanCard
                  title="Enterprise"
                  price="₹1599 / month"
                  highlight={false}
                  muted={currentGeoPlan === "enterprise"}
                  features={["50 Pages / month", "1 Website"]}
                >
                  <button
                    type="button"
                    onClick={geoNotWiredYet}
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
                    Upgrade
                  </button>
                </PlanCard>
              </section>

              {/* GEO ADD-ONS */}
              <section style={{ marginBottom: 10 }}>
                <h2>Add-ons</h2>

                <AddOnCard
                  title="Extra URL Pack (+5)"
                  price="₹249 (one-time)"
                  description="Adds +5 pages for this month (one-time purchase)"
                  actionLabel="Buy +5 URLs"
                  onAction={geoNotWiredYet}
                />

                <AddOnCard
                  title="Additional Website"
                  price={
                    currentGeoPlan === "enterprise"
                      ? "₹1599 / month"
                      : currentGeoPlan === "small_business"
                      ? "₹799 / month"
                      : "Upgrade to buy"
                  }
                  description="Adds capacity for 1 more website with full monthly GEO quota"
                  actionLabel={currentGeoPlan === "free" ? "Upgrade first" : "Add Website"}
                  onAction={geoNotWiredYet}
                />
              </section>
            </div>
          )}
        </section>

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
        <strong style={{ color: "#6D28D9" }}>{title}</strong>
        <div style={{ fontSize: "0.9rem", color: "#6b7280" }}>{description}</div>
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
            border: "0",
            background: "#6D28D9",
            color: "#fff",
            boxShadow: "0 14px 30px rgba(109,40,217,0.18)",
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
