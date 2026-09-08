import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SupportLink } from "@/components/shared/support-link";
const geist = Geist({
  subsets: ["latin", "cyrillic"],
  variable: "--font-geist",
});
export const metadata: Metadata = {
  title: {
    default: "TutorGate — пространство обучения",
    template: "%s · TutorGate",
  },
  description: "Закрытое пространство для учеников и репетиторов.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={geist.variable}>{children}<SupportLink /><Toaster /></body>
    </html>
  );
}
