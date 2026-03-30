import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorksRecorded Reddit Bot",
  description: "Hourly Reddit AI posting dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
