import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SyncMeCal",
  description:
    "Sink the meeting, save the day. A scheduling app for dads in their late 30s.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
