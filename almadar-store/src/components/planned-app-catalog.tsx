"use client";

import { useMemo, useState } from "react";

const groups = [
  {
    name: "المبيعات والعملاء",
    apps: [
      { name: "عروض الأسعار", description: "إعداد عروض ومتابعتها وتحويل المقبول منها إلى مبيعات.", integration: "العملاء والمبيعات والأصناف" },
      { name: "التحصيل والمتابعة", description: "متابعة المستحقات والمدفوعات والفواتير المفتوحة.", integration: "الفواتير والعملاء والمحاسبة" },
      { name: "الأسعار والعروض", description: "إدارة قوائم الأسعار والعروض وشروطها.", integration: "الأصناف والعملاء والمبيعات" },
      { name: "عمولات المبيعات", description: "متابعة عمولات فرق المبيعات وفق سياسات محددة.", integration: "المبيعات والموظفون والمحاسبة" },
      { name: "ولاء العملاء", description: "إدارة برامج الولاء ومكافآت العملاء.", integration: "العملاء والمبيعات ونقطة البيع" },
      { name: "زيارات المندوبين", description: "يخطط مدير المبيعات زيارات العملاء للمناديب، مع مطابقة موقع الزيارة بموقع العميل.", integration: "العملاء والمبيعات والموظفون والمواقع" },
      { name: "المناطق وفرق المبيعات", description: "تنظيم مناطق العملاء وتوزيع فرق المبيعات والمناديب عليها.", integration: "العملاء والموظفون وزيارات المندوبين" },
      { name: "طلبات المندوبين", description: "تسجيل طلبات العملاء أثناء الزيارات ومتابعتها حتى مراجعتها.", integration: "العملاء والأصناف والمبيعات والزيارات" },
    ],
  },
  {
    name: "المشتريات والموردون",
    apps: [
      { name: "موافقات المشتريات", description: "مراجعة طلبات الشراء والموافقة عليها حسب الصلاحيات.", integration: "المشتريات والمستخدمون" },
      { name: "مقارنة عروض الموردين", description: "تسجيل عروض الموردين ومقارنتها قبل الشراء.", integration: "الموردون والأصناف والمشتريات" },
      { name: "بوابة الموردين", description: "مساحة مخططة لتبادل مستندات وطلبات الموردين.", integration: "الموردون والمشتريات والصلاحيات" },
      { name: "إعادة الطلب", description: "تخطيط احتياجات الشراء بناءً على أرصدة الأصناف.", integration: "المخزون والمشتريات" },
    ],
  },
  {
    name: "التصنيع والمخزون",
    apps: [
      { name: "التصنيع والتجميع", description: "إدارة أوامر الإنتاج وتجميع المنتجات.", integration: "الأصناف والمخزون والمحاسبة" },
      { name: "وصفات ومكونات الإنتاج", description: "تعريف مكونات المنتج وكمياتها لمراحل التصنيع.", integration: "الأصناف والتصنيع والمخزون" },
      { name: "الجرد الدوري", description: "تنظيم عمليات العد ومراجعة فروقات المخزون.", integration: "الأصناف والمستودعات والمخزون" },
      { name: "تتبع الدفعات والصلاحية", description: "متابعة دفعات الأصناف وتواريخ صلاحيتها وحركتها.", integration: "المخزون والمشتريات والمبيعات" },
    ],
  },
  {
    name: "المالية",
    apps: [
      { name: "المطابقة البنكية", description: "مطابقة الحركات المسجلة مع كشوف البنك.", integration: "البنوك والمحاسبة" },
      { name: "الميزانيات", description: "إعداد الميزانيات ومقارنة المخطط بالفعلي.", integration: "المحاسبة ومراكز التكلفة" },
      { name: "مستحقات الموردين", description: "متابعة فواتير الموردين والالتزامات المستحقة.", integration: "الموردون والمشتريات والمحاسبة" },
    ],
  },
  {
    name: "الموارد البشرية",
    apps: [
      { name: "الحضور والانصراف", description: "تنظيم سجلات حضور الموظفين وأوقات العمل.", integration: "الموظفون والرواتب" },
      { name: "الإجازات", description: "طلبات الإجازات ومراجعتها ومتابعة أرصدتها.", integration: "الموظفون والرواتب والموافقات" },
      { name: "التوظيف", description: "متابعة الوظائف الشاغرة والمرشحين ومراحل التوظيف.", integration: "الموارد البشرية والمستخدمون" },
      { name: "مصروفات الموظفين", description: "طلبات تعويض المصروفات ومراجعتها.", integration: "الموظفون والمحاسبة والموافقات" },
    ],
  },
  {
    name: "الإدارة والتعاون",
    apps: [
      { name: "المستندات والأرشفة", description: "تنظيم المستندات المرتبطة بالعمليات والملفات.", integration: "المبيعات والمشتريات والعملاء" },
      { name: "سير العمل والموافقات", description: "تصميم خطوات المراجعة والموافقات للعمليات.", integration: "المستخدمون والتطبيقات المعنية" },
      { name: "المواعيد والحجوزات", description: "تنظيم مواعيد الخدمات والمتابعات.", integration: "العملاء والموظفون وخدمة العملاء" },
      { name: "التنبيهات والمتابعة", description: "متابعة تذكيرات العمليات والمواعيد والاستحقاقات.", integration: "التطبيقات المعنية والمستخدمون" },
      { name: "الأوامر الإدارية", description: "توجيه الأوامر ومتابعتها وفق التسلسل الإداري للمنشأة.", integration: "المستخدمون والموظفون والصلاحيات والتسلسل الإداري" },
    ],
  },
] as const;

export function PlannedAppCatalog() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const visibleGroups = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return groups
      .filter((group) => category === "all" || group.name === category)
      .map((group) => ({
        ...group,
        apps: group.apps.filter((app) =>
          [app.name, app.description, app.integration, group.name]
            .some((value) => value.toLocaleLowerCase().includes(search))
        ),
      }))
      .filter((group) => group.apps.length > 0);
  }, [category, query]);
  const count = visibleGroups.reduce((total, group) => total + group.apps.length, 0);

  return (
    <section className="planned-apps" aria-labelledby="planned-apps-title">
      <div className="planned-apps-header">
        <div>
          <span className="planned-apps-eyebrow">خارطة التطبيقات</span>
          <h2 id="planned-apps-title">تطبيقات أعمال مخططة</h2>
          <p>أفكار لتطويرها تطبيقاً تطبيقاً. هذه التطبيقات غير مفعّلة، والربط المذكور مخطط ولم يُنفّذ بعد.</p>
        </div>
        <span className="planned-apps-badge">مخطط · غير مفعّل</span>
      </div>
      <div className="planned-apps-filters">
        <label><span>البحث في التطبيقات المخططة</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم التطبيق أو الربط..." /></label>
        <label><span>مجال العمل</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">كل المجالات</option>{groups.map((group) => <option key={group.name} value={group.name}>{group.name}</option>)}</select></label>
      </div>
      <p className="planned-apps-count" role="status">{count} تطبيق مخطط</p>
      {visibleGroups.map((group) => (
        <div className="planned-app-group" key={group.name}>
          <h3>{group.name}</h3>
          <div className="planned-app-grid">
            {group.apps.map((app) => (
              <article className="planned-app-card" key={app.name}>
                <div><h4>{app.name}</h4><span>مخطط</span></div>
                <p>{app.description}</p>
                <small><strong>الربط المخطط:</strong> {app.integration}</small>
              </article>
            ))}
          </div>
        </div>
      ))}
      {count === 0 && <p className="planned-apps-empty">لا توجد تطبيقات مخططة مطابقة. غيّر البحث أو المجال.</p>}
    </section>
  );
}
