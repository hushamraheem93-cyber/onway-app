import Link from "next/link";

// Root-level 404. Kept minimal since it renders outside the locale layout.
export default function NotFound() {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          background: "#fff",
          color: "#141419",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "3rem", margin: 0, color: "#F4600A" }}>404</h1>
        <p style={{ margin: 0, color: "#6B6B76" }}>
          الصفحة غير موجودة · Page not found
        </p>
        <Link
          href="/ar"
          style={{
            marginTop: "0.5rem",
            background: "#F4600A",
            color: "#fff",
            padding: "0.75rem 1.5rem",
            borderRadius: "999px",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          العودة إلى الرئيسية
        </Link>
      </body>
    </html>
  );
}
