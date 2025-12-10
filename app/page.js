export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        boxSizing: "border-box",
        textAlign: "center"
      }}
    >
      <h1 style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
        Vyndow CMO
      </h1>
      <p style={{ maxWidth: "640px", fontSize: "1rem", lineHeight: 1.6 }}>
        This is the new Next.js shell for{" "}
        <strong>Vyndow SEO V1</strong>. Your existing{" "}
        <code>/api/generate.js</code> engine stays as is.
        Next step: we will recreate the SEO input/output screen here.
      </p>
    </main>
  );
}
