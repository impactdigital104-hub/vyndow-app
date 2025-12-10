export const metadata = {
  title: "Vyndow CMO",
  description: "Vyndow SEO — MVP assistant for CMOs"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        backgroundColor: "#0f172a",
        color: "#e5e7eb"
      }}>
        {children}
      </body>
    </html>
  );
}
