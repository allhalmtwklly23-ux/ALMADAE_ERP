import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/cart-provider";
import { AuthProvider } from "@/components/auth-provider";
import { FavoritesProvider } from "@/components/favorites-provider";
import { ErpSessionProvider } from "@/components/erp-session-provider";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Nexa ERP | نظام محاسبي وإدارة أعمال متكامل",
  description: "منصة ERP متكاملة لإدارة المحاسبة، المشتريات، المبيعات، المخزون، الرواتب، التقارير، والتكاملات التجارية.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth">
      <body>
        <ErpSessionProvider>
          <CartProvider>
            <AuthProvider>
              <FavoritesProvider>
                <SiteHeader />
                <main>{children}</main>
                <SiteFooter />
              </FavoritesProvider>
            </AuthProvider>
          </CartProvider>
        </ErpSessionProvider>
        <Analytics />
      </body>
    </html>
  );
}
