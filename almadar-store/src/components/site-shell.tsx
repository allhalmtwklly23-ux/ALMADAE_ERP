"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatPrice, type Product } from "@/data/products";
import { useErpSession } from "@/components/erp-session-provider";
import { ThemeToggle } from "@/components/theme-toggle";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <div className="product-image" style={{ backgroundImage: `url("${product.image}")` }}>
        <Link className="image-link" href={`/products/${product.id}`} aria-label={`تفاصيل ${product.name}`} />
        {product.badge && <span className="product-badge">{product.badge}</span>}
      </div>
      <div className="product-info">
        <div>
          <h3>
            <Link href={`/products/${product.id}`}>{product.name}</Link>
          </h3>
          <p>{product.category}</p>
        </div>
        <span className="product-price">{formatPrice(product.price)}</span>
      </div>
      <Link className="text-link product-add" href={`/products/${product.id}`}>
        اختر المنتج <span aria-hidden="true">←</span>
      </Link>
    </article>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, error } = useErpSession();

  useEffect(() => {
    if (pathname === "/login" || pathname === "/change-password" || pathname === "/account") return;
    if (loading || error) return;
    if (!user) router.replace("/login");
    else if (user.mustChangePassword) router.replace("/change-password");
  }, [error, loading, pathname, router, user]);

  const nav = [
    { href: "/", label: "لوحة التحكم" },
    { href: "/operations", label: "العمليات" },
    { href: "/finance", label: "المحاسبة" },
    { href: "/sales", label: "المبيعات" },
    { href: "/inventory", label: "المخزون" },
    { href: "/procurement", label: "المشتريات" },
    { href: "/hr", label: "HR" },
    { href: "/reports", label: "التقارير" },
    { href: "/settings", label: "الإعدادات" },
  ];

  return (
    <>
      <div className="announcement">نظام ERP متكامل • إدارة الأعمال • المحاسبة • المشتريات • المخزون • الرواتب</div>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand-mark" href="/" aria-label="Nexa ERP الصفحة الرئيسية">
            <span className="brand-symbol" aria-hidden="true">N</span>
            <span className="brand-name">Nexa ERP<small>BUSINESS SUITE</small></span>
          </Link>

          <nav className={`main-nav${menuOpen ? " is-open" : ""}`} aria-label="القائمة الرئيسية">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>
            ))}
          </nav>

          <div className="header-actions">
            <ThemeToggle />
            <Link className="icon-link account-link" href="/users" aria-label="إدارة المستخدمين">
              <span aria-hidden="true">👥</span>
              <span className="account-label">المستخدمين</span>
            </Link>
            <Link className="icon-link account-link" href="/settings" aria-label="الإعدادات">
              <span aria-hidden="true">⚙</span>
              <span className="account-label">الإعدادات</span>
            </Link>
            <button
              className="button button-secondary"
              type="button"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.replace("/login");
                router.refresh();
              }}
            >
              تسجيل الخروج
            </button>
            <button
              className="mobile-menu-button"
              type="button"
              aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? "×" : "☰"}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-main">
          <div className="footer-about">
            <Link className="brand-mark" href="/">
              <span className="brand-symbol" aria-hidden="true">N</span>
              <span className="brand-name">Nexa ERP<small>BUSINESS SUITE</small></span>
            </Link>
            <p>نظام إدارة أعمال متكامل يدعم المحاسبة، المبيعات، المخزون، المشتريات، والرواتب في منصة موحدة.</p>
          </div>

          <div>
            <h2 className="footer-title">الوحدات</h2>
            <div className="footer-links">
              <Link href="/finance">المحاسبة</Link>
              <Link href="/sales">المبيعات</Link>
              <Link href="/inventory">المخزون</Link>
              <Link href="/procurement">المشتريات</Link>
            </div>
          </div>

          <div>
            <h2 className="footer-title">التحليل</h2>
            <div className="footer-links">
              <Link href="/hr">الموارد البشرية</Link>
              <Link href="/reports">التقارير</Link>
              <Link href="/settings">الإعدادات</Link>
            </div>
          </div>

          <div>
            <h2 className="footer-title">الدعم</h2>
            <div className="footer-links">
              <Link href="/">لوحة التحكم</Link>
              <Link href="/reports">تقارير الأداء</Link>
              <Link href="/settings">الأمان</Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© 2026 Nexa ERP. جميع الحقوق محفوظة.</span>
          <span>منصة إدارة أعمال موحدة</span>
        </div>
      </div>
    </footer>
  );
}
