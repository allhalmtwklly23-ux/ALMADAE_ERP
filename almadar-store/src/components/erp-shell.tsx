"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { navItems } from "@/data/erp-data";
import { erpModules } from "@/lib/erp/module-config";
import { hasErpPermission, useErpSession } from "@/components/erp-session-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { TeamNotifications } from "@/components/team-notifications";

const createTargets: Record<string, { entity: string; module: string }> = {
  "/": { entity: "journalEntries", module: "الرئيسية" },
  "/dashboard": { entity: "journalEntries", module: "لوحة التحكم" },
  "/operations": { entity: "journalEntries", module: "العمليات" },
  "/finance": { entity: "journalEntries", module: "المحاسبة" },
  "/sales": { entity: "salesInvoices", module: "المبيعات" },
  "/pos": { entity: "salesInvoices", module: "نقطة البيع" },
  "/procurement": { entity: "purchaseInvoices", module: "المشتريات" },
  "/inventory": { entity: "stockAdjustments", module: "المخزون" },
  "/warehouse": { entity: "warehouses", module: "المستودعات" },
  "/crm": { entity: "customers", module: "إدارة العملاء" },
  "/hr": { entity: "employees", module: "الموارد البشرية" },
  "/payroll": { entity: "payrollRuns", module: "الرواتب" },
  "/projects": { entity: "projectTasks", module: "المشاريع" },
  "/logistics": { entity: "shipments", module: "اللوجستيات" },
  "/ecommerce": { entity: "onlineOrders", module: "التجارة الإلكترونية" },
  "/ai": { entity: "aiRequests", module: "الذكاء والتحليلات" },
  "/reports": { entity: "reportJobs", module: "التقارير" },
  "/settings": { entity: "settingsRecords", module: "الإعدادات" },
  "/assets": { entity: "fixedAssets", module: "الأصول" },
  "/maintenance": { entity: "maintenanceOrders", module: "الصيانة" },
  "/quality": { entity: "qualityInspections", module: "الجودة" },
  "/support": { entity: "supportTickets", module: "خدمة العملاء" },
  "/contracts": { entity: "contracts", module: "العقود" },
};

export function ErpShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, companies, multiTenantEnabled, loading, refresh } = useErpSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [companySwitchPending, setCompanySwitchPending] = useState(false);
  const [companySwitchError, setCompanySwitchError] = useState("");

  const createableEntities = useMemo(
    () => erpModules.flatMap((module) => module.sections.map((section) => section.entity))
      .filter((entity) => hasErpPermission(user, entity, "create")),
    [user],
  );
  const visibleNavItems = useMemo(() => navItems.filter((item) => {
    if (!user) return false;
    if (item.href === "/organization") {
      return hasErpPermission(user, "organization", "view");
    }
    if (item.href === "/" || item.href === "/dashboard" || item.href === "/operations") {
      return erpModules.some((module) => module.sections.some((section) =>
        hasErpPermission(user, section.entity, "view")
      ));
    }

    const matchedModule = erpModules.find((candidate) => candidate.href === item.href);
    return matchedModule?.sections.some((section) => hasErpPermission(user, section.entity, "view")) ?? false;
  }), [user]);

  const createOperation = () => {
    const requestedTarget = createTargets[pathname];
    const fallbackEntity = createableEntities[0];
    const fallbackModule = erpModules.find((module) =>
      module.sections.some((section) => section.entity === fallbackEntity)
    );
    const target = requestedTarget && hasErpPermission(user, requestedTarget.entity, "create")
      ? requestedTarget
      : fallbackEntity
        ? { entity: fallbackEntity, module: fallbackModule?.label ?? "العمليات" }
        : null;
    if (!target) return;

    if (pathname === "/operations") {
      window.dispatchEvent(new CustomEvent("erp:create-operation", { detail: target }));
      return;
    }

    if (target && pathname !== "/" && pathname !== "/dashboard") {
      window.dispatchEvent(new CustomEvent("erp:create-operation", { detail: target }));
      return;
    }

    const operationTarget = target ?? { entity: "journalEntries", module: "المحاسبة" };
    const params = new URLSearchParams(operationTarget);
    router.push(`/operations?${params.toString()}`);
  };

  const logout = async () => {
    setLogoutPending(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const result = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "تعذر تسجيل الخروج.");
      }
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "تعذر تسجيل الخروج.");
      setLogoutPending(false);
    }
  };

  const switchCompany = async (targetCompanyId: string) => {
    if (!targetCompanyId || targetCompanyId === user?.companyId) return;
    setCompanySwitchPending(true);
    setCompanySwitchError("");
    try {
      const response = await fetch("/api/auth/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: targetCompanyId }),
      });
      const result = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !result.success) {
        throw new Error(result.message ?? "تعذر تبديل المنشأة.");
      }
      await refresh();
      router.refresh();
    } catch (error) {
      setCompanySwitchError(error instanceof Error ? error.message : "تعذر تبديل المنشأة.");
    } finally {
      setCompanySwitchPending(false);
    }
  };

  return (
    <div className={`erp-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
    <aside className={`erp-sidebar${sidebarCollapsed ? " is-collapsed" : ""}${mobileNavOpen ? " is-mobile-open" : ""}`}>
        <Link href="/" className="erp-brand" aria-label="العودة إلى تطبيقات Nexa ERP">
          <div className="erp-brand-mark">N</div>
          <div>
            <strong>Nexa ERP</strong>
            <span>Business Suite</span>
          </div>
        </Link>
      <button
        type="button"
        className="sidebar-collapse-toggle"
        onClick={() => setSidebarCollapsed((current) => !current)}
        aria-label={sidebarCollapsed ? "توسيع القائمة" : "تصغير القائمة"}
        aria-expanded={!sidebarCollapsed}
      >
        {sidebarCollapsed ? "⇤" : "⇥"}
      </button>

        <nav className="erp-nav">
        {loading
          ? <div className="erp-nav-loading" role="status">جارٍ تحميل القائمة...</div>
          : visibleNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
            <Link key={item.href} href={item.href} title={item.label} onClick={() => setMobileNavOpen(false)} className={isActive ? "erp-nav-item active" : "erp-nav-item"}>
              <span aria-hidden="true">{item.icon}</span>
              <span className="erp-nav-label">{item.label}</span>
              </Link>
            );
        })}
        </nav>

        <div className="erp-side-card">
          <small>مستوى النظام</small>
          <strong>Enterprise</strong>
          <p>متكامل بالكامل مع المحاسبة والمخزون والتقارير</p>
        </div>
      </aside>
      {mobileNavOpen && (
        <button
          type="button"
          className="erp-nav-backdrop"
          aria-label="إغلاق القائمة"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main className="erp-main">
        <header className="erp-topbar">
          <button
            type="button"
            className="mobile-nav-toggle"
            onClick={() => setMobileNavOpen((current) => !current)}
            aria-label={mobileNavOpen ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={mobileNavOpen}
          >
            ☰
          </button>
          <div className="topbar-search">
            <span>⌕</span>
            <input
              type="search"
              placeholder="بحث سريع ..."
              value={quickSearch}
              onChange={(event) => setQuickSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && quickSearch.trim()) {
                  router.push(`/operations?search=${encodeURIComponent(quickSearch.trim())}`);
                  setQuickSearch("");
                }
              }}
              aria-label="بحث سريع في العمليات"
            />
          </div>

          <div className="topbar-actions">
            {user && !user.mustChangePassword && <TeamNotifications key={`${user.companyId ?? "local"}:${user.id}`} />}
            <ThemeToggle />
            {createableEntities.length > 0 && pathname !== "/organization" && pathname !== "/hr" && (
              <button type="button" className="primary-button" onClick={createOperation}>＋ جديد</button>
            )}
            {user && (
              <details className="erp-account-menu">
                <summary aria-label="قائمة حساب المستخدم">
                  <span className="erp-account-avatar" aria-hidden="true">
                    {(user.fullName || user.username).slice(0, 1)}
                  </span>
                  <span className="erp-account-label">
                    <strong>{user.fullName || user.username}</strong>
                    <small dir="ltr">@{user.username}</small>
                  </span>
                  <span className="erp-account-chevron" aria-hidden="true">⌄</span>
                </summary>
                <div className="erp-account-popover">
                  <div className="erp-account-details">
                    <strong>{user.fullName || user.username}</strong>
                    <span dir="ltr">@{user.username}</span>
                    <small>{user.role === "super_admin" ? "مدير النظام" : "مستخدم النظام"}</small>
                  </div>
                  {multiTenantEnabled && companies.length > 1 && (
                    <label className="erp-company-switcher">
                      <span>المنشأة الحالية</span>
                      <select
                        value={user.companyId ?? ""}
                        onChange={(event) => void switchCompany(event.target.value)}
                        disabled={companySwitchPending}
                      >
                        {companies.map((company) => (
                          <option key={company.id} value={company.id}>{company.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {companySwitchError && <p className="erp-account-error" role="alert">{companySwitchError}</p>}
                  {logoutError && <p className="erp-account-error" role="alert">{logoutError}</p>}
                  <button type="button" onClick={() => void logout()} disabled={logoutPending}>
                    <span aria-hidden="true">↪</span>
                    {logoutPending ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
                  </button>
                </div>
              </details>
            )}
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}

export function ErpSectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="section-header">
      <div>
        <span className="eyebrow dark">نظرة عامة</span>
        <h2>{title}</h2>
      </div>
      <p>{subtitle}</p>
    </div>
  );
}
