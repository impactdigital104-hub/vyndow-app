"use client";
import VyndowShell from "../VyndowShell";

export default function PricingPage() {
  return (
    <VyndowShell activeModule="pricing">
      <main className="page">
        <header style={{ marginBottom: "20px" }}>
          <span className="badge">Billing (Phase 10)</span>
          <h1>Billing &amp; Plans</h1>
          <p className="sub">
            Pricing and checkout will be enabled here. For now, this page is a placeholder while Razorpay integration is in progress.
          </p>
        </header>

        <section style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
          <h2>Plans</h2>
          <ul>
            <li><b>Free:</b> 1 website + 2 blogs/month</li>
            <li><b>Small Business:</b> 1 website + 6 blogs/month</li>
            <li><b>Enterprise:</b> 1 website + 15 blogs/month + 3 users</li>
          </ul>

          <h2 id="credits" style={{ marginTop: 18 }}>Add-on Credits</h2>
          <p>Buy additional blog credits in packs of 2 (₹199). (Checkout will be enabled soon.)</p>

          <h2 style={{ marginTop: 18 }}>Add-on Websites</h2>
          <p>Buy additional website capacity. Then add the website from Websites &amp; Clients.</p>
        </section>
      </main>
    </VyndowShell>
  );
}
