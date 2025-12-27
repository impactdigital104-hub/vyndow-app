export const metadata = {
  title: "Vyndow – Terms of Use",
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 20px", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Vyndow – Terms of Use</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        Effective Date: {new Date().toISOString().slice(0, 10)}
      </p>

      <p>
        Welcome to <strong>Vyndow</strong>, a software-as-a-service (SaaS) platform operated by{" "}
        <strong>Impact Digital Services Pvt Ltd</strong>, having its registered office at{" "}
        <strong>2nd Floor, Centrul Mall, Sultanpur, New Delhi-110010</strong>.
      </p>

      <p>
        By accessing or using Vyndow (the “Service”) through <strong>https://app.vyndow.com</strong>,
        you agree to be bound by these Terms of Use (“Terms”). If you do not agree, please do not use
        the Service.
      </p>

      <h2>1. Use of the Platform</h2>
      <p>
        Vyndow provides AI-powered marketing and SEO tools intended for business and professional
        use. You agree to use the platform only for lawful purposes and in compliance with
        applicable laws.
      </p>
      <ul>
        <li>Do not misuse or attempt to disrupt the Service</li>
        <li>Do not reverse engineer, copy, or resell the platform</li>
        <li>Do not use the Service for unlawful, misleading, or harmful activities</li>
      </ul>

      <h2>2. Accounts and Access</h2>
      <p>
        You are responsible for maintaining the confidentiality of your login credentials and all
        activities carried out under your account. Vyndow reserves the right to suspend or terminate
        access if misuse, abuse, or violation of these Terms is detected.
      </p>

      <h2>3. Subscription and Payments</h2>
      <p>
        Certain features of Vyndow may require payment. Pricing, plans, and usage limits are
        displayed within the platform. Payments are processed through third-party payment gateways.
        Vyndow does not store your card or banking information.
      </p>

      <h2>4. Intellectual Property</h2>
      <p>
        All content, software, logos, and branding associated with Vyndow are the intellectual
        property of Impact Digital Services Pvt Ltd. Unauthorized use is strictly prohibited.
      </p>

      <h2>5. Limitation of Liability</h2>
      <p>
        The Service is provided on an “as-is” and “as-available” basis. Vyndow does not guarantee
        uninterrupted or error-free operation. To the maximum extent permitted by law, Vyndow shall
        not be liable for any indirect, incidental, or consequential damages arising from use of the
        Service.
      </p>

      <h2>6. Termination</h2>
      <p>
        Vyndow may suspend or terminate your access at its discretion for violation of these Terms
        or applicable laws.
      </p>

      <h2>7. Governing Law</h2>
      <p>
        These Terms shall be governed by and construed in accordance with the laws of India, with
        exclusive jurisdiction in the courts of <strong>Delhi</strong>.
      </p>

      <h2>8. Contact Information</h2>
      <p>
        For questions regarding these Terms, please contact:{" "}
        <strong>feedback@vyndow.com</strong>
      </p>
    </main>
  );
}
