import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
export const metadata: Metadata = {
  title: "BankWeave AI — Banking Intelligence & Operations",
  applicationName: "BankWeave AI",
  description:
    "Understand banking data, investigate risk and review customer workflows in one AI workspace. Local demonstration with synthetic data.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
