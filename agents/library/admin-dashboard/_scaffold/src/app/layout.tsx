import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteTracker } from "@/components/analytics/site-tracker";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Acme",
  description: "Acme — starter scaffold.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <SiteTracker />
      </body>
    </html>
  );
}
