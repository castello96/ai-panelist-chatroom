import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panel",
  description: "A chatroom where several AI models answer independently, then argue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
