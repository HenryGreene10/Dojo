import type { Metadata } from "next";
import "./globals.css";

function getMetadataBase() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // Fall through to the local default so a bad/blank deploy env never breaks the build.
    }
  }

  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  title: {
    default: "Mahjong Dojo",
    template: "%s · Mahjong Dojo",
  },
  description: "A simple, delightful way to gather your Mah Jong table.",
  metadataBase: getMetadataBase(),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
