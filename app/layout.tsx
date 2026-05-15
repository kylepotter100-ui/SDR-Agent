import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KP SDR Agent",
  description: "Autonomous prospecting agent for KP Solutions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
