export const metadata = {
  title: "Vyndow CMO",
  description: "Vyndow SEO — Blog & SEO Content Engine (V1)"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          backgroundColor: "#f3f4f6",
          color: "#111827"
        }}
      >
        {children}
      </body>
    </html>
  );
}
