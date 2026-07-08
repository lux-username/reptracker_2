import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Representative Tracker",
  description:
    "See the upcoming decisions your federal representatives are about to make — in time to act.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
