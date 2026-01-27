import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import { Toaster } from "@/components/ui/sonner"

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Center Settlement Management",
  description: "B2B SaaS for Counseling Center Settlement",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main className="pb-20 min-h-screen bg-gray-50">
          {children}
        </main>
        <BottomNav />
        <Toaster />
      </body>
    </html>
  );
}
