import type { Metadata } from "next"
import { JetBrains_Mono, Manrope } from "next/font/google"

import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
})

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
})

export const metadata: Metadata = {
  title: "Артель",
  description:
    "Локальный оркестратор AI-агентов: Claude, Claude Code, Codex и Cursor. Любой проект, подагенты, живой стрим.",
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/artel-icon.png", type: "image/png" }],
    apple: "/artel-icon.png",
  },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`dark ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden bg-[#0d0e12] font-sans text-zinc-100">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
      </body>
    </html>
  )
}
