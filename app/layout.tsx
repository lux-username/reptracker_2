import type { Metadata } from "next";
import "./globals.css";
import Footer from "./Footer";

export const metadata: Metadata = {
  title: "Representative Tracker",
  description:
    "See what your federal representatives are working on — the committee action ahead and the bills they sponsor — in time to act.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
        {/* Skip-to-content: first focusable element, visible only on focus (spec §Accessibility). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-slate-900 focus:px-4 focus:py-2 focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
