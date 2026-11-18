"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErpShell } from "@/components/erp-shell";
import { hasErpPermission, useErpSession } from "@/components/erp-session-provider";
import type {
  EmployeeEmploymentStatus,
  EmployeeRecordStatus,
} from "@/lib/erp/hr-employee-profiles";

type EmployeeProfile = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hiredOn: string | null;
  employmentStatus: EmployeeEmploymentStatus;
  recordStatus: EmployeeRecordStatus;
  createdAt: string;
  updatedAt: string;
};

type ProfileForm = {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  phone: string;
  hiredOn: string;
  employmentStatus: EmployeeEmploymentStatus;
  recordStatus: EmployeeRecordStatus;
};

type ApiResult<T> = { success?: boolean; message?: string; data?: T };

const EMPTY_FORM: ProfileForm = {
  id: "",
  employeeNumber: "",
  fullName: "",
  email: "",
  phone: "",
  hiredOn: "",
  employmentStatus: "active",
  recordStatus: "active",
};

const EMPLOYMENT_STATUS_LABELS: Record<EmployeeEmploymentStatus, string> = {
  active: "على رأس العمل",
  on_leave: "إجازة",
  suspended: "موقوف",
  terminated: "منتهية خدمته",
};

const RECORD_STATUS_LABELS: Record<EmployeeRecordStatus, string> = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
};

async function readResponse<T>(response: Response) {
  const payload = await response.json() as ApiResult<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.message ?? "تعذر إكمال العملية.");
  }
  return payload;
}

export function HrEmployeeProfilesPanel() {
  const { user, loading: sessionLoading } = useErpSession();
  const canView = hasErpPermission(user, "employees", "view");
  const canCreate = hasErpPermission(user, "employees", "create");
  const canEdit = hasErpPermission(user, "employees", "edit");
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProfiles = useCallback(async () => {
    const payload = await readResponse<EmployeeProfile[]>(
      await fetch("/api/hr/profiles", { cache: "no-store" }),
    );
    setProfiles(payload.data ?? []);
  }, []);

  const refreshProfiles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadProfiles();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل ملفات الموظفين.");
    } finally {
      setLoading(false);
    }
  }, [loadProfiles]);

  useEffect(() => {
    if (!canView) return;
    void Promise.resolve().then(refreshProfiles);
  }, [canView, refreshProfiles]);

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return profiles;
    return profiles.filter((profile) => [
      profile.employeeNumber,
      profile.fullName,
      profile.email,
      profile.phone,
    ].some((value) => String(value ?? "").toLocaleLowerCase().includes(query)));
  }, [profiles, search]);

  const stats = useMemo(() => ({
    total: profiles.length,
    working: profiles.filter((profile) => profile.employmentStatus === "active" && profile.recordStatus === "active").length,
    leave: profiles.filter((profile) => profile.employmentStatus === "on_leave").length,
    archived: profiles.filter((profile) => profile.recordStatus === "archived").length,
  }), [profiles]);

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  function openEditForm(profile: EmployeeProfile) {
    setForm({
      id: profile.id,
      employeeNumber: profile.employeeNumber,
      fullName: profile.fullName,
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      hiredOn: profile.hiredOn ?? "",
      employmentStatus: profile.employmentStatus,
      recordStatus: profile.recordStatus,
    });
    setError("");
    setMessage("");
    setIsFormOpen(true);
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const profileData = {
      employeeNumber: form.employeeNumber,
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      hiredOn: form.hiredOn || null,
      employmentStatus: form.employmentStatus,
    };
    const body = form.id
      ? { id: form.id, ...profileData, recordStatus: form.recordStatus }
      : profileData;

    try {
      const response = await fetch("/api/hr/profiles", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readResponse<EmployeeProfile>(response);
      setIsFormOpen(false);
      setForm(EMPTY_FORM);
      setMessage(payload.message ?? "تم حفظ ملف الموظف.");
      await loadProfiles();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر حفظ ملف الموظف.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ErpShell>
      <div className="organization-page hr-profiles-page" dir="rtl">
        {sessionLoading ? (
          <div className="organization-empty" role="status">جارٍ التحقق من صلاحياتك...</div>
        ) : !canView ? (
          <section className="organization-panel">
            <h1>لا تملك صلاحية عرض ملفات الموظفين</h1>
            <p>اطلب من مدير النظام أو مدير الموارد البشرية منحك صلاحية مناسبة.</p>
          </section>
        ) : (
          <>
            <header className="organization-header">
              <div>
                <span className="organization-eyebrow">إدارة الموارد البشرية</span>
                <h1>ملفات الموظفين</h1>
                <p>سجل وظيفي مستقل عن حساب الدخول؛ يمكن تسجيل الموظف حتى إن لم يحتج إلى دخول النظام.</p>
              </div>
              <Link className="organization-refresh" href="/hr">حسابات الدخول</Link>
            </header>

            <nav className="hr-people-route-tabs" aria-label="إدارة الموظفين">
              <Link href="/hr/profiles" aria-current="page">ملفات الموظفين</Link>
              <Link href="/hr">حسابات المستخدمين</Link>
            </nav>

            <section className="organization-stats" aria-label="ملخص ملفات الموظفين">
              <article><span>الملفات</span><strong>{stats.total}</strong><small>إجمالي السجلات الوظيفية</small></article>
              <article><span>على رأس العمل</span><strong>{stats.working}</strong><small>ملفات نشطة</small></article>
              <article><span>في إجازة</span><strong>{stats.leave}</strong><small>حسب الحالة الوظيفية</small></article>
              <article><span>مؤرشفة</span><strong>{stats.archived}</strong><small>محفوظة دون حذف</small></article>
            </section>

            {(error || message) && (
              <p className={`organization-feedback${error ? " is-error" : " is-success"}`} role={error ? "alert" : "status"}>
                {error || message}
              </p>
            )}

            <section className="organization-panel" aria-label="دليل ملفات الموظفين">
              <div className="organization-panel-heading">
                <div>
                  <h2>دليل الموظفين</h2>
                  <p>لا ينشئ هذا الإجراء حساب دخول أو كلمة مرور.</p>
                </div>
                <button type="button" className="organization-refresh" onClick={() => void refreshProfiles()} disabled={loading}>
                  {loading ? "جارٍ التحميل..." : "تحديث"}
                </button>
              </div>

              <div className="organization-tools">
                <label>
                  <span>البحث بالرقم أو الاسم أو التواصل</span>
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
                {canCreate && (
                  <button type="button" className="organization-primary" onClick={openCreateForm}>＋ ملف موظف</button>
                )}
              </div>

              {error.includes("تطبيق ترحيل قاعدة البيانات") && (
                <p className="organization-note">يلزم إعداد قاعدة اختبار معزولة وتشغيل ترحيل ملفات الموظفين عليها قبل إتاحة هذه الصفحة.</p>
              )}

              {isFormOpen && (
                <form className="organization-editor" onSubmit={saveProfile}>
                  <div className="organization-editor-heading">
                    <div>
                      <h3>{form.id ? "تعديل ملف الموظف" : "إنشاء ملف وظيفي"}</h3>
                      <p>بيانات الموظف لا تنشئ حساب دخول تلقائياً.</p>
                    </div>
                    <button type="button" className="organization-close" onClick={() => setIsFormOpen(false)} disabled={saving} aria-label="إغلاق النموذج">×</button>
                  </div>
                  <div className="organization-form-grid">
                    <label>
                      <span>الرقم الوظيفي <b>*</b></span>
                      <input required maxLength={50} value={form.employeeNumber} onChange={(event) => setForm({ ...form, employeeNumber: event.target.value })} />
                    </label>
                    <label>
                      <span>الاسم الكامل <b>*</b></span>
                      <input required maxLength={150} autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
                    </label>
                    <label>
                      <span>البريد الإلكتروني</span>
                      <input type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                    </label>
                    <label>
                      <span>رقم الهاتف</span>
                      <input type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                    </label>
                    <label>
                      <span>تاريخ التعيين</span>
                      <input type="date" value={form.hiredOn} onChange={(event) => setForm({ ...form, hiredOn: event.target.value })} />
                    </label>
                    <label>
                      <span>الحالة الوظيفية</span>
                      <select value={form.employmentStatus} onChange={(event) => setForm({ ...form, employmentStatus: event.target.value as EmployeeEmploymentStatus })}>
                        {Object.entries(EMPLOYMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    {form.id && (
                      <label>
                        <span>حالة الملف</span>
                        <select value={form.recordStatus} onChange={(event) => setForm({ ...form, recordStatus: event.target.value as EmployeeRecordStatus })}>
                          {Object.entries(RECORD_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  {error && <p className="organization-feedback is-error" role="alert">{error}</p>}
                  <div className="organization-form-actions">
                    <button type="button" className="organization-secondary" onClick={() => setIsFormOpen(false)} disabled={saving}>إلغاء</button>
                    <button type="submit" className="organization-primary" disabled={saving || (form.id ? !canEdit : !canCreate)}>
                      {saving ? "جارٍ الحفظ..." : form.id ? "حفظ التعديلات" : "إنشاء الملف"}
                    </button>
                  </div>
                </form>
              )}

              <div className="organization-table-wrap">
                <table className="organization-table">
                  <thead>
                    <tr><th>الرقم الوظيفي</th><th>الموظف</th><th>التواصل</th><th>تاريخ التعيين</th><th>الحالة الوظيفية</th><th>حالة الملف</th><th>الإجراءات</th></tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.map((profile) => (
                      <tr key={profile.id}>
                        <td dir="auto">{profile.employeeNumber}</td>
                        <td><strong>{profile.fullName}</strong></td>
                        <td>{profile.email || profile.phone || "—"}<small>{profile.email && profile.phone ? profile.phone : ""}</small></td>
                        <td dir="ltr">{profile.hiredOn || "—"}</td>
                        <td>{EMPLOYMENT_STATUS_LABELS[profile.employmentStatus]}</td>
                        <td><span className={`organization-status ${profile.recordStatus}`}>{RECORD_STATUS_LABELS[profile.recordStatus]}</span></td>
                        <td>
                          {canEdit
                            ? <button type="button" className="organization-row-action" onClick={() => openEditForm(profile)}>تعديل</button>
                            : <span className="organization-readonly">عرض فقط</span>}
                        </td>
                      </tr>
                    ))}
                    {!loading && filteredProfiles.length === 0 && (
                      <tr><td className="organization-empty" colSpan={7}>{error || "لا توجد ملفات مطابقة للبحث."}</td></tr>
                    )}
                    {loading && <tr><td className="organization-empty" colSpan={7}>جارٍ تحميل ملفات الموظفين...</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </ErpShell>
  );
}
