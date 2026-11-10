import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ThemeProvider } from "@/src/design-system/theme";
import { AppShell } from "@/components/AppShell";

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.klique.ch";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "KLIQUE | Le réseau au service des athlètes",
    template: "%s",
  },
  description: "Le réseau KLIQUE réunit athlètes, experts, partenaires, créatifs et médias.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="fr">
        <body>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
