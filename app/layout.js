import "./globals.css";

export const metadata = {
  title: "Vyndow CMO",
  description: "Vyndow SEO V1 – Blog Generator and CMO assistant shell",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
