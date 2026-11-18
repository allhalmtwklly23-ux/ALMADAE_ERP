"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErpShell } from "@/components/erp-shell";
import { hasErpPermission, useErpSession } from "@/components/erp-session-provider";
import {
  getAssignableHrEmployeePermissions,
  HR_EMPLOYEE_PERMISSIONS,
} from "@/lib/erp/hr-employee-access";

type EmployeeAccount = {
  id: string;
  username: string;
  fullName: string;
  role: string;
  department: string;
  title: string;
  active: boolean;
  email?: string;
  permissions: string[];
  lastLoginAt?: string | null;
};

type EmployeeForm = {
  id: string;
  username: string;
  fullName: string;
  department: string;
  title: string;
  email: string;
  password: string;
  active: boolean;
  permissions: string[];
};

type ApiPayload = {
  success?: boolean;
  message?: string;
  data?: EmployeeAccount[];
};

type StatusFilter = "all" | "active" | "inactive";
type ViewMode = "cards" | "table";

const emptyForm: EmployeeForm = {
  id: "",
  username: "",
  fullName: "",
  department: "",
  title: "",
  email: "",
  password: "",
  active: true,
  permissions: [],
};

async function readResponse(response: Response) {
  const payload = await response.json() as ApiPayload;
  if (!response.ok || !payload.success) throw new Error(payload.message ?? "تعذر إكمال العملية.");
  return payload;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("") || "م";
}

function formatLastLogin(value?: string | null) {
  if (!value) return "لم يسجل الدخول";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ar-SA");
}

export function HrEmployeeAccountsPanel() {
  const { user, loading: sessionLoading } = useErpSession();
  const canView = hasErpPermission(user, "employees", "view");
  const canCreate = hasErpPermission(user, "employees", "create");
  const canEdit = hasErpPermission(user, "employees", "edit");
  const assignablePermissions = useMemo(
    () => user ? getAssignableHrEmployeePermissions(user) : [],
    [user],
  );
  const [employees, setEmployees] = useState<EmployeeAccount[]>([]);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadEmployees = useCallback(async () => {
    const payload = await readResponse(await fetch("/api/hr/employees", { cache: "no-store" }));
    setEmployees(payload.data ?? []);
  }, []);
  const refreshEmployees = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      await loadEmployees();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل حسابات الموظفين.");
    } finally {
      setIsLoading(false);
    }
  }, [loadEmployees]);

  useEffect(() => {
    if (!canView) return;
    void Promise.resolve().then(refreshEmployees);
  }, [canView, refreshEmployees]);

  useEffect(() => {
    if (!isFormOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setIsFormOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, isFormOpen]);

  const departments = useMemo(
    () => [...new Set(employees.map((employee) => employee.department.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar")),
    [employees],
  );
  const stats = useMemo(() => ({
    all: employees.length,
    active: employees.filter((employee) => employee.active).length,
    inactive: employees.filter((employee) => !employee.active).length,
    departments: departments.length,
  }), [departments.length, employees]);
  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return employees.filter((employee) => {
      if (statusFilter === "active" && !employee.active) return false;
      if (statusFilter === "inactive" && employee.active) return false;
      if (departmentFilter && employee.department !== departmentFilter) return false;
      if (!query) return true;
      return [
        employee.fullName,
        employee.username,
        employee.email,
        employee.department,
        employee.title,
      ].some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
    });
  }, [departmentFilter, employees, search, statusFilter]);

  function openCreateForm() {
    setError("");
    setMessage("");
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  function editEmployee(employee: EmployeeAccount) {
    setError("");
    setMessage("");
    setForm({
      id: employee.id,
      username: employee.username,
      fullName: employee.fullName,
      department: employee.department,
      title: employee.title,
      email: employee.email ?? "",
      password: "",
      active: employee.active,
      permissions: (employee.permissions ?? []).filter((permission) =>
        assignablePermissions.some((assignable) => assignable.key === permission),
      ),
    });
    setIsFormOpen(true);
  }

  function togglePermission(permission: string) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((value) => value !== permission)
        : [...current.permissions, permission],
    }));
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const body = form.id
      ? {
          id: form.id,
          username: form.username,
          fullName: form.fullName,
          email: form.email,
          department: form.department,
          title: form.title,
          password: form.password || undefined,
          active: form.active,
          permissions: form.permissions,
        }
      : {
          username: form.username,
          fullName: form.fullName,
          email: form.email,
          department: form.department,
          title: form.title,
          password: form.password,
          permissions: form.permissions,
        };

    try {
      const response = await fetch("/api/hr/employees", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await readResponse(response);
      setMessage(payload.message ?? "تم حفظ حساب الموظف.");
      setIsFormOpen(false);
      setForm(emptyForm);
      await loadEmployees();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر حفظ حساب الموظف.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(employee: EmployeeAccount) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/hr/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: employee.id, active: !employee.active }),
      });
      const payload = await readResponse(response);
      setMessage(payload.message ?? "تم تحديث حالة الحساب.");
      await loadEmployees();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "تعذر تحديث حالة الحساب.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ErpShell>
      <div className="hr-people-page">
        {sessionLoading ? (
          <div className="hr-people-loading" role="status"><span className="hr-people-spinner" /> جارٍ التحقق من صلاحياتك...</div>
        ) : !canView ? (
          <section className="hr-people-empty-state">
            <span className="hr-people-empty-icon" aria-hidden="true">⌁</span>
            <h1>لا تملك صلاحية عرض الموظفين</h1>
            <p>اطلب من مدير النظام أو مدير الموارد البشرية منحك صلاحية مناسبة.</p>
          </section>
        ) : (
          <>
            <header className="hr-people-hero">
              <div className="hr-people-hero-copy">
                <span className="hr-people-kicker"><span aria-hidden="true">✦</span> مساحة الموارد البشرية</span>
                <h1>فريق العمل</h1>
                <p>ملفات الموظفين وحساباتهم وأقسامهم وصلاحياتهم من مكان واحد.</p>
              </div>
              <div className="hr-people-hero-actions">
                {canCreate && (
                  <button type="button" className="hr-people-add-button" onClick={openCreateForm}>
                    <span aria-hidden="true">＋</span>
                    <span>إضافة موظف</span>
                  </button>
                )}
                <div className="hr-people-hero-note"><span aria-hidden="true">◈</span> كل حساب بصلاحيات محددة</div>
              </div>
              <span className="hr-people-hero-orb" aria-hidden="true" />
            </header>

            <nav className="hr-people-route-tabs" aria-label="إدارة الموظفين">
              <Link href="/hr/profiles">ملفات الموظفين</Link>
              <Link href="/hr" aria-current="page">حسابات المستخدمين</Link>
            </nav>

            <section className="hr-people-stats" aria-label="ملخص الموظفين">
              <button type="button" className={`hr-people-stat${statusFilter === "all" ? " is-selected" : ""}`} onClick={() => setStatusFilter("all")} aria-pressed={statusFilter === "all"}>
                <span className="hr-people-stat-icon is-blue" aria-hidden="true">♙</span>
                <span className="hr-people-stat-label">إجمالي الموظفين</span>
                <strong>{stats.all}</strong>
                <small>عرض جميع الحسابات</small>
              </button>
              <button type="button" className={`hr-people-stat${statusFilter === "active" ? " is-selected" : ""}`} onClick={() => setStatusFilter("active")} aria-pressed={statusFilter === "active"}>
                <span className="hr-people-stat-icon is-green" aria-hidden="true">✓</span>
                <span className="hr-people-stat-label">حسابات نشطة</span>
                <strong>{stats.active}</strong>
                <small>يمكنها تسجيل الدخول</small>
              </button>
              <button type="button" className={`hr-people-stat${statusFilter === "inactive" ? " is-selected" : ""}`} onClick={() => setStatusFilter("inactive")} aria-pressed={statusFilter === "inactive"}>
                <span className="hr-people-stat-icon is-amber" aria-hidden="true">Ⅱ</span>
                <span className="hr-people-stat-label">حسابات معطلة</span>
                <strong>{stats.inactive}</strong>
                <small>موقوفة مؤقتاً</small>
              </button>
              <article className="hr-people-stat">
                <span className="hr-people-stat-icon is-violet" aria-hidden="true">▦</span>
                <span className="hr-people-stat-label">الأقسام</span>
                <strong>{stats.departments}</strong>
                <small>ضمن ملفات الموظفين</small>
              </article>
            </section>

            <section className="hr-people-directory">
              <div className="hr-people-directory-head">
                <div>
                  <span className="hr-people-section-kicker">دليل الفريق</span>
                  <h2>الموظفون <span>{filteredEmployees.length}</span></h2>
                </div>
                <div className="hr-people-view-toggle" role="group" aria-label="طريقة عرض الموظفين">
                  <button type="button" className={viewMode === "cards" ? "is-active" : ""} onClick={() => setViewMode("cards")} aria-pressed={viewMode === "cards"} aria-label="عرض بطاقات">▦</button>
                  <button type="button" className={viewMode === "table" ? "is-active" : ""} onClick={() => setViewMode("table")} aria-pressed={viewMode === "table"} aria-label="عرض جدول">☷</button>
                </div>
              </div>

              <div className="hr-people-toolbar">
                <label className="hr-people-search">
                  <span aria-hidden="true">⌕</span>
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو المستخدم أو القسم..." aria-label="البحث عن موظف" />
                  {search && <button type="button" onClick={() => setSearch("")} aria-label="مسح البحث">×</button>}
                </label>
                <label className="hr-people-status-filter">
                  <span>الحالة</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                    <option value="all">جميع الحالات</option>
                    <option value="active">نشط</option>
                    <option value="inactive">معطل</option>
                  </select>
                </label>
                <label className="hr-people-status-filter">
                  <span>القسم</span>
                  <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} aria-label="فلترة القسم">
                    <option value="">كل الأقسام</option>
                    {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                </label>
              </div>

              {error && !isFormOpen && <p className="hr-people-feedback is-error" role="alert">{error}</p>}
              {message && <p className="hr-people-feedback is-success" role="status">{message}</p>}

              {isLoading ? (
                <div className="hr-people-loading" role="status"><span className="hr-people-spinner" /> جارٍ تحميل الموظفين...</div>
              ) : error && employees.length === 0 ? (
                    <div className="hr-people-empty-state">
                      <span className="hr-people-empty-icon" aria-hidden="true">!</span>
                      <h3>تعذر تحميل بيانات الموظفين</h3>
                      <p>{error}</p>
                      <button type="button" className="hr-people-retry-button" onClick={() => void refreshEmployees()}>إعادة المحاولة</button>
                    </div>
                  ) : filteredEmployees.length === 0 ? (
                <div className="hr-people-empty-state">
                      <span className="hr-people-empty-icon" aria-hidden="true">{employees.length > 0 ? "⌕" : "♙"}</span>
                      <h3>{employees.length === 0 ? canCreate ? "ابدأ بإضافة أول موظف" : "لا توجد حسابات موظفين" : "لا توجد نتائج مطابقة"}</h3>
                      <p>{employees.length === 0 ? canCreate ? "أنشئ حساب الموظف وحدد قسمه ومسمّاه وصلاحياته من نموذج واحد." : "ستظهر هنا حسابات الموظفين عند إضافتها." : "جرّب تغيير البحث أو عوامل التصفية."}</p>
                </div>
              ) : viewMode === "cards" ? (
                <div className="hr-people-card-grid">
                  {filteredEmployees.map((employee) => (
                    <article className="hr-person-card" key={employee.id}>
                      <div className="hr-person-card-top">
                        <div className="hr-person-avatar">{initials(employee.fullName)}</div>
                        <span className={`hr-person-status${employee.active ? " is-active" : " is-inactive"}`}>
                          <span aria-hidden="true" />{employee.active ? "نشط" : "معطل"}
                        </span>
                      </div>
                      <div className="hr-person-identity">
                        <h3>{employee.fullName}</h3>
                        <span dir="auto">@{employee.username}</span>
                      </div>
                      <div className="hr-person-tags">
                        <span>{employee.department || "بدون قسم"}</span>
                        <span>{employee.title || "بدون مسمى"}</span>
                      </div>
                      <div className="hr-person-meta">
                        {employee.email && <div><span aria-hidden="true">✉</span><span>{employee.email}</span></div>}
                        <div><span aria-hidden="true">◷</span><span>آخر دخول: {formatLastLogin(employee.lastLoginAt)}</span></div>
                      </div>
                      <div className="hr-person-permission-list">
                        {(employee.permissions ?? []).length === 0 ? (
                          <span className="is-empty">بدون صلاحيات إضافية</span>
                        ) : (
                          <>
                            {(employee.permissions ?? []).slice(0, 2).map((permission) => (
                              <span key={permission}>{HR_EMPLOYEE_PERMISSIONS.find((item) => item.key === permission)?.label ?? permission}</span>
                            ))}
                            {(employee.permissions ?? []).length > 2 && <small>+{employee.permissions.length - 2}</small>}
                          </>
                        )}
                      </div>
                      <div className="hr-person-card-footer">
                        <span>{employee.permissions?.length ?? 0} صلاحيات</span>
                        <div>
                          {canEdit && employee.id !== user?.id && (
                            <>
                              <button type="button" onClick={() => editEmployee(employee)}>تعديل</button>
                              <button type="button" className={employee.active ? "is-danger" : "is-enable"} disabled={busy} onClick={() => void toggleActive(employee)}>
                                {employee.active ? "تعطيل" : "تفعيل"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="hr-people-table-wrap">
                  <table className="hr-people-table">
                    <thead>
                      <tr><th>الموظف</th><th>القسم والمسمى</th><th>البريد</th><th>الصلاحيات</th><th>الحالة</th><th>آخر دخول</th><th>إجراءات</th></tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((employee) => (
                        <tr key={employee.id}>
                          <td><strong>{employee.fullName}</strong><small dir="auto">@{employee.username}</small></td>
                          <td>{employee.department}<small>{employee.title}</small></td>
                          <td>{employee.email || "—"}</td>
                          <td>{employee.permissions?.length ?? 0}</td>
                          <td><span className={`hr-person-status${employee.active ? " is-active" : " is-inactive"}`}><span aria-hidden="true" />{employee.active ? "نشط" : "معطل"}</span></td>
                          <td>{formatLastLogin(employee.lastLoginAt)}</td>
                          <td>
                            {canEdit && employee.id !== user?.id && (
                              <div className="hr-people-table-actions">
                                <button type="button" onClick={() => editEmployee(employee)}>تعديل</button>
                                <button type="button" disabled={busy} onClick={() => void toggleActive(employee)}>{employee.active ? "تعطيل" : "تفعيل"}</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {isFormOpen && (
          <div className="hr-people-modal-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setIsFormOpen(false);
          }}>
            <section className="hr-people-modal" role="dialog" aria-modal="true" aria-labelledby="hr-people-form-title">
              <header className="hr-people-modal-head">
                <div className="hr-people-modal-mark" aria-hidden="true">♙</div>
                <div>
                  <span className="hr-people-section-kicker">{form.id ? "تحديث بيانات الموظف" : "إضافة إلى فريقك"}</span>
                  <h2 id="hr-people-form-title">{form.id ? "تعديل ملف الموظف" : "موظف جديد"}</h2>
                  <p>الحساب والقسم والمسمى والصلاحيات في نموذج واحد.</p>
                </div>
                <button type="button" className="hr-people-modal-close" onClick={() => setIsFormOpen(false)} disabled={busy} aria-label="إغلاق النموذج">×</button>
              </header>

              <form className="hr-people-form" onSubmit={submitForm}>
                <section className="hr-people-form-section">
                  <div className="hr-people-form-section-title"><span>01</span><div><h3>البيانات الأساسية</h3><p>معلومات تعريف الموظف ووسيلة التواصل.</p></div></div>
                  <div className="hr-people-form-grid">
                    <label>الاسم الكامل<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} maxLength={150} autoComplete="name" required /></label>
                    <label>اسم المستخدم<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} maxLength={80} autoComplete="username" required /></label>
                    <label>البريد الإلكتروني <span className="hr-people-optional">اختياري</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} autoComplete="email" /></label>
                    <label>القسم<input list="hr-department-options" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} maxLength={120} placeholder="مثال: الموارد البشرية" required /><datalist id="hr-department-options">{departments.map((department) => <option key={department} value={department} />)}</datalist></label>
                    <label>المسمى الوظيفي<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={120} placeholder="مثال: أخصائي موارد بشرية" required /></label>
                    <label>{form.id ? "كلمة مرور جديدة" : "كلمة المرور المؤقتة"}{form.id && <span className="hr-people-optional">اختياري</span>}<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={8} maxLength={128} required={!form.id} autoComplete="new-password" placeholder={form.id ? "اتركها فارغة دون تغيير" : "8 أحرف على الأقل"} /></label>
                    {form.id && <label className="hr-people-active-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /><span>الحساب نشط</span></label>}
                  </div>
                </section>

                <section className="hr-people-form-section">
                  <div className="hr-people-form-section-title"><span>02</span><div><h3>صلاحيات الوصول</h3><p>لا يمنح المسمى الوظيفي صلاحيات تلقائية.</p></div></div>
                  <div className="hr-people-permissions">
                    {assignablePermissions.map(({ key, label }) => (
                      <label key={key} className={form.permissions.includes(key) ? "is-checked" : ""}>
                        <input type="checkbox" checked={form.permissions.includes(key)} onChange={() => togglePermission(key)} />
                        <span className="hr-people-permission-check" aria-hidden="true">{form.permissions.includes(key) ? "✓" : ""}</span>
                        <span>{label}</span>
                      </label>
                    ))}
                    {assignablePermissions.length === 0 && <p>لا توجد صلاحيات إضافية يمكنك منحها.</p>}
                  </div>
                  <p className="hr-people-security-note"><span aria-hidden="true">▣</span> لن يستطيع الموظف استخدام التطبيقات إلا بالصلاحيات المحددة أعلاه.</p>
                </section>

                {error && <p className="hr-people-feedback is-error" role="alert">{error}</p>}
                <footer className="hr-people-modal-footer">
                  <button type="button" className="hr-people-cancel-button" onClick={() => setIsFormOpen(false)} disabled={busy}>إلغاء</button>
                  <button type="submit" className="hr-people-add-button" disabled={busy || (form.id ? !canEdit : !canCreate)}>
                    {busy ? <><span className="hr-people-spinner is-light" /> جارٍ الحفظ...</> : form.id ? "حفظ التعديلات" : "إنشاء حساب الموظف"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}
      </div>
    </ErpShell>
  );
}
