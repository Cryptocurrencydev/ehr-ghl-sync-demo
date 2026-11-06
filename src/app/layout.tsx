import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Familjen_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const display = Familjen_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Lumen booking sync",
  description: "A working demo of a booking sync between a clinic's EHR and GoHighLevel, using fictional patients.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        <footer className="site-footer">
          <p>Lumen Acupuncture is a fictional clinic and every patient here is invented.</p>
          <p>
            Demo by{" "}
            <a href="https://dctechltd.com" target="_blank" rel="noopener">
              DC Tech
            </a>
          </p>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
