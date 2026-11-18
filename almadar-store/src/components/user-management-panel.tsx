"use client";

import { useCallback, useEffect, useState } from "react";
import { useErpSession } from "@/components/erp-session-provider";

type UserRecord = {
  id: string;
  username: string;
  fullName: string;
  role: string;
  department: string;
  title: string;
  active: boolean;
  email?: string;
  permissions?: string[];
  mustChangePassword?: boolean;
  lastLoginAt?: string | null;
};

const ROLE_OPTIONS = [
  "super_admin",
  "finance_manager",
  "sales_manager",
  "inventory_manager",
  "hr_manager",
  "employee",
  "auditor",
] as const;

const roleLabels: Record<string, string> = {
  super_admin: "مدير النظام",
  finance_manager: "مدير المحاسبة",
  sales_manager: "مدير المبيعات",
  inventory_manager: "مدير المخزون",
  hr_manager: "مدير الموارد البشرية",
  employee: "موظف",
  auditor: "المراجع الداخلي",
};

export function UserManagementPanel() {
  const { user, multiTenantEnabled, refresh } = useErpSession();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [auditLog, setAuditLog] = useState<Array<{ action: string; createdAt: string; actorUsername?: string | null; details?: Record<string, unknown> }>>([]);
  const [form, setForm] = useState({
    id: "",
    username: "",
    fullName: "",
    role: "sales_manager",
    department: "عام",
    title: "موظف",
    email: "",
    password: "",
    active: true,
    mustChangePassword: false,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyBusy, setCompanyBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [usersResponse, auditResponse] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/auth/audit"),
      ]);

      const usersPayload = await usersResponse.json();
      const auditPayload = await auditResponse.json();

      if (!usersResponse.ok || !usersPayload.success) {
        throw new Error(usersPayload.message ?? "تعذر تحميل المستخدمين.");
      }
      if (!auditResponse.ok || !auditPayload.success) {
        setAuditLog([]);
      } else {
        setAuditLog(auditPayload.data ?? []);
      }

      setUsers(usersPayload.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل بيانات المستخدمين.");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const method = form.id ? "PUT" : "POST";
      const response = await fetch("/api/users", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: form.id || undefined }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "تعذر حفظ المستخدم.");
      }

      setMessage(payload.message ?? "تم حفظ المستخدم بنجاح.");
      setForm({
        id: "",
        username: "",
        fullName: "",
        role: "sales_manager",
        department: "عام",
        title: "موظف",
        email: "",
        password: "",
        active: true,
        mustChangePassword: false,
      });
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر حفظ المستخدم.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleUserStatus(user: UserRecord) {
    await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, active: !user.active }),
    });
    await loadData();
  }

  async function resetPassword(user: UserRecord) {
    const nextPassword = prompt(`أدخل كلمة المرور الجديدة لـ ${user.username}:`, "Aa123123");
    if (!nextPassword) return;
    await fetch("/api/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, password: nextPassword, mustChangePassword: true }),
    });
    await loadData();
  }

  async function toggleCostPreview(userRecord: UserRecord) {
    setError("");
    setMessage("");
    const permissions = userRecord.permissions ?? [];
    const hasExtraAccess = permissions.includes("productCosts:view");
    try {
      const response = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userRecord.id,
          permissions: hasExtraAccess
            ? permissions.filter((permission) => permission !== "productCosts:view")
            : [...permissions, "productCosts:view"],
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message ?? "تعذر تعديل الصلاحية.");
      setMessage(hasExtraAccess ? "تم إلغاء الصلاحية الإضافية." : "تم منح الصلاحية الإضافية لمعاينة التكاليف.");
      await loadData();
    } catch (permissionError) {
      setError(permissionError instanceof Error ? permissionError.message : "تعذر تعديل الصلاحية.");
    }
  }

  async function createCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCompanyBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "تعذر إنشاء المنشأة.");
      }

      setCompanyName("");
      setMessage("تم إنشاء المنشأة. يمكنك التبديل إليها من قائمة حسابك.");
      await refresh();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "تعذر إنشاء المنشأة.");
    } finally {
      setCompanyBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {multiTenantEnabled && user?.role === "super_admin" && (
        <section className="section">
          <div className="section-header">
            <div>
              <span className="eyebrow dark">تعدد المنشآت</span>
              <h2>إضافة منشأة</h2>
            </div>
            <p>تنشأ المنشأة بصلاحية مدير النظام الحالي، ويمكن التبديل إليها من قائمة الحساب.</p>
          </div>
          <form className="auth-form" onSubmit={createCompany}>
            <label>
              اسم المنشأة
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                maxLength={150}
                required
              />
            </label>
            <button type="submit" className="button" disabled={companyBusy}>
              {companyBusy ? "جارٍ إنشاء المنشأة…" : "إنشاء منشأة"}
            </button>
          </form>
        </section>
      )}

      <section className="section">
        <div className="section-header">
          <div>
            <span className="eyebrow dark">إدارة المستخدمين</span>
            <h2>المستخدمون والصلاحيات</h2>
          </div>
        </div>

        <form className="auth-form" onSubmit={submitForm}>
          <div className="three-col">
            <label>
              اسم المستخدم
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required />
            </label>
            <label>
              الاسم الكامل
              <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required />
            </label>
            <label>
              البريد الإلكتروني
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label>
              القسم
              <input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
            </label>
            <label>
              المنصب
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              الدور
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>{roleLabels[role]}</option>
                ))}
              </select>
            </label>
            <label>
              كلمة المرور
              <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!form.id} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              المستخدم نشط
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.mustChangePassword} onChange={(event) => setForm({ ...form, mustChangePassword: event.target.checked })} />
              يلزم تغيير كلمة المرور عند أول دخول
            </label>
          </div>

          <button type="submit" className="button" disabled={busy}>{busy ? "جارٍ الحفظ…" : form.id ? "تحديث المستخدم" : "إضافة مستخدم"}</button>
        </form>

        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-success" role="status">{message}</p>}
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <span className="eyebrow dark">قائمة المستخدمين</span>
            <h3>المستخدمون المسجلون</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>اسم المستخدم</th>
                <th>الاسم الكامل</th>
                <th>الدور</th>
                <th>القسم</th>
                <th>الحالة</th>
                <th>آخر دخول</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.fullName}</td>
                  <td>{roleLabels[user.role] ?? user.role}</td>
                  <td>{user.department}</td>
                  <td>{user.active ? "نشط" : "معطل"}</td>
                  <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("ar-SA") : "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="button button-secondary" type="button" onClick={() => setForm({ ...form, id: user.id, username: user.username, fullName: user.fullName, role: user.role, department: user.department, title: user.title, email: user.email ?? "", password: "", active: user.active, mustChangePassword: user.mustChangePassword ?? false })}>تعديل</button>
                      <button className="button button-secondary" type="button" onClick={() => void toggleUserStatus(user)}>{user.active ? "تعطيل" : "تفعيل"}</button>
                      <button className="button button-secondary" type="button" onClick={() => void resetPassword(user)}>إعادة تعيين</button>
                      {user.role !== "super_admin" && <button className="button button-secondary" type="button" onClick={() => void toggleCostPreview(user)}>{user.permissions?.includes("productCosts:view") ? "إلغاء صلاحية التكاليف الإضافية" : "منح صلاحية التكاليف الإضافية"}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <span className="eyebrow dark">سجل المراقبة</span>
            <h3>Audit Log</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الإجراء</th>
                <th>المستخدم</th>
                <th>التاريخ</th>
                <th>التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry, index) => (
                <tr key={`${entry.action}-${entry.createdAt}-${index}`}>
                  <td>{entry.action}</td>
                  <td>{entry.actorUsername ?? "النظام"}</td>
                  <td>{new Date(entry.createdAt).toLocaleString("ar-SA")}</td>
                  <td>{JSON.stringify(entry.details ?? {})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
