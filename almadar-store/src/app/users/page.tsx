import { UserManagementPanel } from "@/components/user-management-panel";

export default function UsersPage() {
  return (
    <main className="page-shell">
      <section className="page-intro">
        <div className="page-intro-inner">
          <span className="eyebrow">إدارة المستخدمين</span>
          <h1>إدارة المستخدمين والصلاحيات</h1>
          <p>إنشاء مستخدمين جدد، تفعيلهم، تعطيلهم، وتوزيع الأدوار داخل النظام.</p>
        </div>
      </section>
      <section className="section">
        <UserManagementPanel />
      </section>
    </main>
  );
}
