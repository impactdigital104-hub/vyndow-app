export const metadata = {
  title: "Vyndow – Refund & Cancellation Policy",
};

export default function RefundPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px", lineHeight: 1.6 }}>
      <h1>Refund & Cancellation Policy</h1>

      <p>
        Vyndow is a subscription-based SaaS platform operated by
        <strong> Impact Digital Services Pvt Ltd</strong>.
      </p>

      <h2>Refunds</h2>
      <p>
        Subscription fees are non-refundable once paid, unless explicitly stated otherwise.
        Refunds, if approved, are processed at the sole discretion of Vyndow.
      </p>

      <h2>Cancellations</h2>
      <p>
        Users may cancel their subscription at any time. Cancellation will stop future billing but
        access will continue until the end of the current billing cycle.
      </p>

      <h2>Contact</h2>
      <p>
        For refund or cancellation queries, contact <strong>feedback@vyndow.com</strong>.
      </p>

      <h2>Jurisdiction</h2>
      <p>
        This policy is governed by the laws of India, with jurisdiction in <strong>Delhi</strong>.
      </p>
    </main>
  );
}
