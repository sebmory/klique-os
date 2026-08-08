import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/src/design-system/theme";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "KLIQUE OS",
  description: "Le cockpit opérationnel de KLIQUE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
