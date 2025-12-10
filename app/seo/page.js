export default function SeoHomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px",
        boxSizing: "border-box",
        maxWidth: "1200px",
        margin: "0 auto"
      }}
    >
      <h1 style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
        Vyndow SEO — Next.js Shell
      </h1>
      <p style={{ fontSize: "1rem", lineHeight: 1.6, maxWidth: "720px" }}>
        This is the new <strong>/seo</strong> route, built with Next.js. 
        Over the next steps, we will bring the full Vyndow SEO Blog Generator UI 
        here and wire it to the existing <code>/api/generate</code> engine.
      </p>
      <p style={{ marginTop: "1.5rem", fontSize: "0.95rem" }}>
        For now, your original HTML-based V1 tool is still available at the root
        URL, so your team can keep using it while we migrate features into this
        new architecture.
      </p>
    </main>
  );
}
// Minor edit to trigger new Vercel deployment
