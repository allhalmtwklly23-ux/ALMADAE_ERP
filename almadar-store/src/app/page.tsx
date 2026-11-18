"use client";

import Link from "next/link";
import { ErpShell } from "@/components/erp-shell";
import { PlannedAppCatalog } from "@/components/planned-app-catalog";
import { hasErpPermission, useErpSession } from "@/components/erp-session-provider";
import { erpAppCards, erpModules } from "@/lib/erp/module-config";

export default function AppLauncherPage() {
  const { user, loading } = useErpSession();
  const visibleApps = erpAppCards.filter((app) => {
    if (!user || loading) return false;
    if (app.id === "operations") {
      return erpModules.some((module) => module.sections.some((section) =>
        hasErpPermission(user, section.entity, "view")
      ));
    }

    return erpModules.find((module) => module.id === app.id)?.sections.some((section) =>
      hasErpPermission(user, section.entity, "view")
    ) ?? false;
  });

  return (
    <ErpShell>
      <div className="erp-launcher">
        <section className="erp-launcher-hero">
          <div>
            <span className="eyebrow dark">مساحة العمل</span>
            <h1>تطبيقات أعمالك، في مكان واحد</h1>
            <p>افتح التطبيق المطلوب لإدارة سجلاته وعملياته بشكل مستقل ومترابط.</p>
          </div>
          <Link className="launcher-dashboard-link" href="/dashboard">
            <span aria-hidden="true">▥</span>
            لوحة المؤشرات
          </Link>
        </section>

        <div className="erp-launcher-toolbar">
          <div>
            <h2>التطبيقات</h2>
            <p>{visibleApps.length + (user && !loading && !user.mustChangePassword ? 1 : 0)} تطبيقاً متاحاً في مساحة العمل</p>
          </div>
          <span className="launcher-hint">اختر تطبيقاً للبدء</span>
        </div>

        <div className="erp-app-grid">
          {user && !loading && !user.mustChangePassword && (
            <Link className="erp-app-card tone-blue" href="/team">
              <span className="erp-app-card-icon" aria-hidden="true">✉</span>
              <span className="erp-app-card-title">تواصل فريق العمل</span>
              <span className="erp-app-card-description">رسائل مباشرة وإشعارات الرسائل داخل المنشأة.</span>
              <span className="erp-app-card-open">فتح التطبيق <span aria-hidden="true">←</span></span>
            </Link>
          )}
          {visibleApps.map((app) => (
            <Link className={`erp-app-card tone-${app.color}`} href={app.href} key={app.id}>
              <span className="erp-app-card-icon" aria-hidden="true">{app.icon}</span>
              <span className="erp-app-card-title">{app.label}</span>
              <span className="erp-app-card-description">{app.description}</span>
              <span className="erp-app-card-open">فتح التطبيق <span aria-hidden="true">←</span></span>
            </Link>
          ))}
          {!loading && visibleApps.length === 0 && (!user || user.mustChangePassword) && (
            <div className="erp-empty-state">
              <span className="erp-empty-icon" aria-hidden="true">▦</span>
              <h3>لا توجد تطبيقات متاحة</h3>
              <p>اطلب من مدير النظام مراجعة صلاحيات حسابك.</p>
            </div>
          )}
        </div>
        {user && !loading && <PlannedAppCatalog />}
      </div>
    </ErpShell>
  );
}
