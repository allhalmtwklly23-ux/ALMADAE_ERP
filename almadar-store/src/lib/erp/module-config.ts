export type ModuleField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "number" | "textarea" | "select";
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export type ModuleSection = {
  entity: string;
  label: string;
  singular: string;
  fields: ModuleField[];
  listFields: { key: string; label: string }[];
  view?: "records" | "statement";
  invoiceParty?: {
    entity: "customers" | "suppliers";
    idField: "customerId" | "vendorId";
    nameField: "customerName" | "vendorName";
    label: string;
  };
};

export type ErpModule = {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  sections: ModuleSection[];
};

const statuses = ["draft", "approved", "posted", "cancelled"];
const activeStatuses = ["active", "inactive"];
const statusField: ModuleField = { key: "status", label: "الحالة", type: "select", options: statuses };
const customerStatusField: ModuleField = { key: "status", label: "الحالة", type: "select", options: ["active", "inactive", "on_hold"] };
const descriptionField: ModuleField = { key: "description", label: "الوصف", type: "textarea" };
const referenceField: ModuleField = { key: "reference", label: "المرجع", type: "text", required: true };
const dateField: ModuleField = { key: "date", label: "التاريخ", type: "date", required: true };
const amountField: ModuleField = { key: "amount", label: "المبلغ", type: "number", required: true };

function section(
  entity: string,
  label: string,
  singular: string,
  fields: ModuleField[],
  listFields: { key: string; label: string }[],
  invoiceParty?: ModuleSection["invoiceParty"],
  view: ModuleSection["view"] = "records",
): ModuleSection {
  return { entity, label, singular, fields, listFields, invoiceParty, view };
}

const salesInvoice = section(
  "salesInvoices",
  "فواتير المبيعات",
  "فاتورة مبيعات",
  [referenceField, dateField, statusField, { key: "accountName", label: "الحساب", type: "text" }, descriptionField],
  [
    { key: "reference", label: "رقم الفاتورة" },
    { key: "customerName", label: "العميل" },
    { key: "date", label: "التاريخ" },
    { key: "amount", label: "الإجمالي" },
    { key: "status", label: "الحالة" },
  ],
  { entity: "customers", idField: "customerId", nameField: "customerName", label: "العميل" },
);

const purchaseInvoice = section(
  "purchaseInvoices",
  "فواتير المشتريات",
  "فاتورة مشتريات",
  [referenceField, dateField, statusField, { key: "accountName", label: "الحساب", type: "text" }, descriptionField],
  [
    { key: "reference", label: "رقم الفاتورة" },
    { key: "vendorName", label: "المورد" },
    { key: "date", label: "التاريخ" },
    { key: "amount", label: "الإجمالي" },
    { key: "status", label: "الحالة" },
  ],
  { entity: "suppliers", idField: "vendorId", nameField: "vendorName", label: "المورد" },
);

const customerSection = section(
  "customers",
  "العملاء",
  "عميل",
  [
    { key: "name", label: "اسم العميل", type: "text", required: true },
    { key: "legalName", label: "الاسم القانوني", type: "text" },
    { key: "customerType", label: "نوع العميل", type: "select", options: ["شركة", "مؤسسة", "فرد"] },
    { key: "taxNumber", label: "الرقم الضريبي", type: "text" },
    { key: "commercialRegistration", label: "رقم السجل التجاري", type: "text" },
    { key: "phone", label: "رقم الجوال", type: "tel" },
    { key: "alternatePhone", label: "رقم تواصل إضافي", type: "tel" },
    { key: "email", label: "البريد الإلكتروني", type: "email" },
    { key: "website", label: "الموقع الإلكتروني", type: "text" },
    { key: "country", label: "الدولة", type: "text" },
    { key: "city", label: "المدينة", type: "text" },
    { key: "address", label: "العنوان", type: "textarea" },
    { key: "category", label: "التصنيف", type: "text" },
    { key: "source", label: "مصدر العميل", type: "text" },
    { key: "salesRep", label: "مسؤول المبيعات", type: "text" },
    { key: "paymentTerms", label: "شروط الدفع", type: "text" },
    { key: "paymentDays", label: "مدة السداد بالأيام", type: "number" },
    { key: "currency", label: "العملة الافتراضية", type: "text" },
    { key: "openingBalance", label: "الرصيد الافتتاحي (+ مدين / - دائن)", type: "number" },
    { key: "creditLimit", label: "حد الائتمان", type: "number" },
    customerStatusField,
    descriptionField,
  ],
  [
    { key: "name", label: "العميل" },
    { key: "customerType", label: "النوع" },
    { key: "phone", label: "الجوال" },
    { key: "email", label: "البريد الإلكتروني" },
    { key: "city", label: "المدينة" },
    { key: "category", label: "التصنيف" },
    { key: "creditLimit", label: "حد الائتمان" },
    { key: "status", label: "الحالة" },
  ],
);

const supplierSection = section(
  "suppliers",
  "الموردون",
  "مورد",
  [
    { key: "name", label: "اسم المورد", type: "text", required: true },
    { key: "legalName", label: "الاسم القانوني", type: "text" },
    { key: "taxNumber", label: "الرقم الضريبي", type: "text" },
    { key: "commercialRegistration", label: "رقم السجل التجاري", type: "text" },
    { key: "phone", label: "رقم الهاتف", type: "tel" },
    { key: "alternatePhone", label: "رقم تواصل إضافي", type: "tel" },
    { key: "email", label: "البريد الإلكتروني", type: "email" },
    { key: "city", label: "المدينة", type: "text" },
    { key: "address", label: "العنوان", type: "textarea" },
    { key: "category", label: "التصنيف", type: "text" },
    { key: "paymentTerms", label: "شروط الدفع", type: "text" },
    { key: "creditLimit", label: "حد الائتمان", type: "number" },
    statusField,
    descriptionField,
  ],
  [
    { key: "name", label: "المورد" },
    { key: "phone", label: "الهاتف" },
    { key: "category", label: "التصنيف" },
    { key: "status", label: "الحالة" },
  ],
);

const productSection = section(
  "products",
  "الأصناف",
  "صنف",
  [
    { key: "name", label: "اسم الصنف", type: "text", required: true },
    { key: "sku", label: "رمز الصنف SKU", type: "text", required: true },
    { key: "barcode", label: "الباركود", type: "text", required: true },
    { key: "group", label: "مجموعة الصنف", type: "text" },
    { key: "category", label: "تصنيف الصنف", type: "text" },
    { key: "unitCost", label: "تكلفة الوحدة", type: "number" },
    { key: "unitPrice", label: "سعر البيع", type: "number" },
    { key: "stockQty", label: "الرصيد الافتتاحي", type: "number" },
    statusField,
  ],
  [
    { key: "name", label: "الصنف" },
    { key: "sku", label: "SKU" },
    { key: "barcode", label: "الباركود" },
    { key: "stockQty", label: "الرصيد" },
    { key: "unitPrice", label: "سعر البيع" },
    { key: "status", label: "الحالة" },
  ],
);

const financialStatementSection = section(
  "financialStatement",
  "كشوف الحسابات",
  "كشف حساب",
  [],
  [
    { key: "date", label: "التاريخ" },
    { key: "sourceLabel", label: "نوع المعاملة" },
    { key: "reference", label: "المرجع" },
    { key: "party", label: "الطرف" },
    { key: "amount", label: "المبلغ" },
    { key: "status", label: "الحالة" },
  ],
  undefined,
  "statement",
);

const modules: ErpModule[] = [
  {
    id: "finance",
    href: "/finance",
    label: "المحاسبة",
    description: "الحسابات والقيود والسندات والإيرادات والمصروفات في مساحة مالية واحدة.",
    icon: "▤",
    color: "violet",
    sections: [
      financialStatementSection,
      section("accounts", "دليل الحسابات", "حساب", [
        { key: "code", label: "رمز الحساب", type: "text", required: true },
        { key: "name", label: "اسم الحساب", type: "text", required: true },
        { key: "type", label: "نوع الحساب", type: "select", required: true, options: ["asset", "liability", "equity", "revenue", "expense"] },
        { key: "parentCode", label: "الحساب الأب", type: "text" },
        statusField,
      ], [
        { key: "code", label: "الرمز" },
        { key: "name", label: "الحساب" },
        { key: "type", label: "النوع" },
        { key: "status", label: "الحالة" },
      ]),
      section("journalEntries", "القيود اليومية", "قيد يومي", [
        referenceField, dateField,
        { key: "accountName", label: "الحساب", type: "text" },
        { key: "description", label: "البيان", type: "textarea", required: true },
        amountField, statusField,
      ], [
        { key: "reference", label: "رقم القيد" },
        { key: "accountName", label: "الحساب" },
        { key: "date", label: "التاريخ" },
        { key: "description", label: "البيان" },
        { key: "amount", label: "المبلغ" },
        { key: "status", label: "الحالة" },
      ]),
      section("cashVouchers", "سندات القبض", "سند قبض", [
        referenceField,
        { key: "customerName", label: "العميل", type: "text" },
        { key: "accountName", label: "الحساب", type: "text" },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم السند" },
        { key: "customerName", label: "العميل" },
        { key: "accountName", label: "الحساب" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "المبلغ" },
        { key: "status", label: "الحالة" },
      ]),
      section("expenses", "المصروفات", "مصروف", [
        referenceField,
        { key: "category", label: "التصنيف", type: "text" },
        { key: "accountName", label: "الحساب", type: "text" },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "المرجع" },
        { key: "category", label: "التصنيف" },
        { key: "accountName", label: "الحساب" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "المبلغ" },
        { key: "status", label: "الحالة" },
      ]),
      section("revenues", "الإيرادات", "إيراد", [
        referenceField,
        { key: "category", label: "التصنيف", type: "text" },
        { key: "accountName", label: "الحساب", type: "text" },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "المرجع" },
        { key: "category", label: "التصنيف" },
        { key: "accountName", label: "الحساب" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "المبلغ" },
        { key: "status", label: "الحالة" },
      ]),
      section("bankTransfers", "التحويلات المالية", "تحويل مالي", [
        referenceField,
        { key: "bankName", label: "البنك", type: "text" },
        { key: "fromAccount", label: "من حساب", type: "text" },
        { key: "toAccount", label: "إلى حساب", type: "text" },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم التحويل" },
        { key: "bankName", label: "البنك" },
        { key: "fromAccount", label: "من حساب" },
        { key: "toAccount", label: "إلى حساب" },
        { key: "amount", label: "المبلغ" },
        { key: "status", label: "الحالة" },
      ]),
      section("bankingOperations", "العمليات البنكية", "عملية بنكية", [
        referenceField,
        { key: "bankName", label: "البنك", type: "text", required: true },
        { key: "accountName", label: "الحساب", type: "text" },
        { key: "operationType", label: "نوع العملية", type: "text" },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "المرجع" },
        { key: "bankName", label: "البنك" },
        { key: "accountName", label: "الحساب" },
        { key: "operationType", label: "النوع" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "المبلغ" },
        { key: "status", label: "الحالة" },
      ]),
      section("openingBalances", "الأرصدة الافتتاحية", "رصيد افتتاحي", [
        referenceField,
        { key: "accountName", label: "الحساب", type: "text" },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "المرجع" },
        { key: "accountName", label: "الحساب" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "الرصيد" },
        { key: "status", label: "الحالة" },
      ]),
      section("costCenters", "مراكز التكلفة", "مركز تكلفة", [
        { key: "code", label: "الرمز", type: "text" },
        { key: "name", label: "اسم مركز التكلفة", type: "text", required: true },
        { key: "parent", label: "المركز الأب", type: "text" },
        { key: "status", label: "الحالة", type: "select", options: activeStatuses },
        descriptionField,
      ], [
        { key: "code", label: "الرمز" },
        { key: "name", label: "مركز التكلفة" },
        { key: "parent", label: "المركز الأب" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "sales",
    href: "/sales",
    label: "المبيعات",
    description: "أنشئ فواتير البيع، أدِر العملاء، وتابع المرتجعات والتحصيل.",
    icon: "▱",
    color: "blue",
    sections: [
      salesInvoice,
      customerSection,
      section("salesReturns", "مرتجعات المبيعات", "مرتجع مبيعات", [
        referenceField,
        { key: "customerName", label: "العميل", type: "text", required: true },
        { key: "accountName", label: "الحساب", type: "text" },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم المرتجع" },
        { key: "customerName", label: "العميل" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "المبلغ" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "procurement",
    href: "/procurement",
    label: "المشتريات",
    description: "طلبات الشراء وفواتير الموردين والاستلام والمرتجعات في تطبيق مستقل.",
    icon: "▣",
    color: "orange",
    sections: [
      section("purchaseOrders", "طلبات الشراء", "طلب شراء", [
        referenceField, { key: "vendorName", label: "المورد", type: "text", required: true },
        dateField, amountField, statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم الطلب" },
        { key: "vendorName", label: "المورد" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "الإجمالي" },
        { key: "status", label: "الحالة" },
      ]),
      purchaseInvoice,
      supplierSection,
      section("purchaseReturns", "مرتجعات المشتريات", "مرتجع مشتريات", [
        referenceField,
        { key: "vendorName", label: "المورد", type: "text", required: true },
        { key: "accountName", label: "الحساب", type: "text" },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم المرتجع" },
        { key: "vendorName", label: "المورد" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "المبلغ" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "inventory",
    href: "/inventory",
    label: "المخزون",
    description: "كتالوج الأصناف، المجموعات، والأرصدة والتسويات المخزنية.",
    icon: "▦",
    color: "green",
    sections: [
      productSection,
      section("itemGroups", "مجموعات الأصناف", "مجموعة أصناف", [
        { key: "name", label: "اسم المجموعة", type: "text", required: true },
        { key: "code", label: "رمز المجموعة", type: "text" },
        statusField, descriptionField,
      ], [
        { key: "name", label: "المجموعة" },
        { key: "code", label: "الرمز" },
        { key: "description", label: "الوصف" },
        { key: "status", label: "الحالة" },
      ]),
      section("stockAdjustments", "التسويات المخزنية", "تسوية مخزنية", [
        referenceField,
        { key: "warehouseName", label: "المستودع", type: "text", required: true },
        dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم التسوية" },
        { key: "warehouseName", label: "المستودع" },
        { key: "date", label: "التاريخ" },
        { key: "description", label: "التفاصيل" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "warehouse",
    href: "/warehouse",
    label: "المستودعات",
    description: "تعريف مواقع التخزين وإدارة حركات وأرصدة المستودعات.",
    icon: "▥",
    color: "green",
    sections: [
      section("warehouses", "المستودعات", "مستودع", [
        { key: "name", label: "اسم المستودع", type: "text", required: true },
        { key: "code", label: "رمز المستودع", type: "text" },
        { key: "location", label: "الموقع", type: "text" },
        statusField, descriptionField,
      ], [
        { key: "name", label: "المستودع" },
        { key: "code", label: "الرمز" },
        { key: "location", label: "الموقع" },
        { key: "status", label: "الحالة" },
      ]),
      section("stockAdjustments", "حركات المخزون", "حركة مخزون", [
        referenceField,
        { key: "warehouseName", label: "المستودع", type: "text", required: true },
        { key: "productName", label: "الصنف", type: "text" },
        { key: "quantity", label: "الكمية", type: "number", required: true },
        dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "المرجع" },
        { key: "warehouseName", label: "المستودع" },
        { key: "productName", label: "الصنف" },
        { key: "quantity", label: "الكمية" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "crm",
    href: "/crm",
    label: "إدارة العملاء",
    description: "قاعدة العملاء وفرص البيع والمتابعات التجارية.",
    icon: "◎",
    color: "blue",
    sections: [
      customerSection,
      section("crmLeads", "فرص البيع", "فرصة بيع", [
        { key: "name", label: "اسم الفرصة", type: "text", required: true },
        { key: "customerName", label: "العميل", type: "text" },
        { key: "source", label: "مصدر الفرصة", type: "text" },
        { key: "stage", label: "المرحلة", type: "select", options: ["جديدة", "تواصل أولي", "عرض سعر", "تفاوض", "مغلقة"] },
        { key: "amount", label: "القيمة المتوقعة", type: "number" },
        { key: "nextAction", label: "المتابعة القادمة", type: "date" },
        descriptionField,
      ], [
        { key: "name", label: "الفرصة" },
        { key: "customerName", label: "العميل" },
        { key: "stage", label: "المرحلة" },
        { key: "amount", label: "القيمة المتوقعة" },
        { key: "nextAction", label: "المتابعة" },
      ]),
    ],
  },
  {
    id: "hr",
    href: "/hr",
    label: "الموارد البشرية",
    description: "ملفات الموظفين وبياناتهم الوظيفية في سجل مركزي.",
    icon: "♙",
    color: "purple",
    sections: [
      section("employees", "الموظفون", "موظف", [
        { key: "employeeNumber", label: "الرقم الوظيفي", type: "text", required: true },
        { key: "name", label: "اسم الموظف", type: "text", required: true },
        { key: "department", label: "القسم", type: "text", required: true },
        { key: "jobTitle", label: "المسمى الوظيفي", type: "text" },
        { key: "email", label: "البريد الإلكتروني", type: "email" },
        { key: "phone", label: "رقم الجوال", type: "tel" },
        { key: "hireDate", label: "تاريخ التعيين", type: "date" },
        { key: "salary", label: "الراتب الأساسي", type: "number" },
        { key: "status", label: "الحالة", type: "select", options: ["active", "on_leave", "inactive"] },
      ], [
        { key: "employeeNumber", label: "الرقم الوظيفي" },
        { key: "name", label: "الموظف" },
        { key: "department", label: "القسم" },
        { key: "jobTitle", label: "المسمى" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "payroll",
    href: "/payroll",
    label: "الرواتب",
    description: "مسيرات الرواتب والاستحقاقات والخصومات وحالة الصرف.",
    icon: "ر",
    color: "orange",
    sections: [
      section("payrollRuns", "مسيرات الرواتب", "مسير رواتب", [
        referenceField,
        { key: "period", label: "فترة الرواتب", type: "text", required: true, placeholder: "مثال: 2026-11" },
        { key: "employeeCount", label: "عدد الموظفين", type: "number" },
        { key: "totalAmount", label: "إجمالي الرواتب", type: "number", required: true },
        dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم المسير" },
        { key: "period", label: "الفترة" },
        { key: "employeeCount", label: "الموظفون" },
        { key: "totalAmount", label: "الإجمالي" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "projects",
    href: "/projects",
    label: "المشاريع",
    description: "المشاريع ومهام الفرق والمواعيد والأولويات.",
    icon: "◈",
    color: "violet",
    sections: [
      section("projectTasks", "المهام", "مهمة", [
        { key: "reference", label: "رقم المهمة", type: "text", required: true },
        { key: "projectName", label: "اسم المشروع", type: "text", required: true },
        { key: "name", label: "عنوان المهمة", type: "text", required: true },
        { key: "assignee", label: "المسؤول", type: "text" },
        { key: "priority", label: "الأولوية", type: "select", options: ["منخفضة", "متوسطة", "عالية", "عاجلة"] },
        { key: "dueDate", label: "تاريخ الاستحقاق", type: "date" },
        statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم المهمة" },
        { key: "name", label: "المهمة" },
        { key: "projectName", label: "المشروع" },
        { key: "assignee", label: "المسؤول" },
        { key: "dueDate", label: "الاستحقاق" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "pos",
    href: "/pos",
    label: "نقطة البيع",
    description: "عمليات نقاط البيع ومراجعة وسائل الدفع وإجماليات الجلسات.",
    icon: "▣",
    color: "blue",
    sections: [
      section("salesInvoices", "فواتير نقطة البيع", "فاتورة مبيعات", [
        referenceField,
        { key: "storeName", label: "نقطة البيع", type: "text", required: true },
        { key: "cashier", label: "الكاشير", type: "text" },
        { key: "paymentMethod", label: "وسيلة الدفع", type: "select", options: ["نقدي", "بطاقة", "تحويل"] },
        amountField, dateField, statusField,
      ], [
        { key: "reference", label: "رقم الفاتورة" },
        { key: "storeName", label: "نقطة البيع" },
        { key: "cashier", label: "الكاشير" },
        { key: "paymentMethod", label: "الدفع" },
        { key: "amount", label: "الإجمالي" },
        { key: "status", label: "الحالة" },
      ], { entity: "customers", idField: "customerId", nameField: "customerName", label: "العميل" }),
    ],
  },
  {
    id: "ecommerce",
    href: "/ecommerce",
    label: "التجارة الإلكترونية",
    description: "طلبات المتجر الإلكتروني والعملاء وحالة تنفيذ الطلب.",
    icon: "⌂",
    color: "green",
    sections: [
      section("onlineOrders", "طلبات المتجر", "طلب متجر", [
        referenceField,
        { key: "customerName", label: "اسم العميل", type: "text", required: true },
        { key: "channel", label: "قناة الطلب", type: "select", options: ["المتجر الإلكتروني", "التطبيق", "الهاتف"] },
        amountField, dateField, statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم الطلب" },
        { key: "customerName", label: "العميل" },
        { key: "channel", label: "القناة" },
        { key: "date", label: "التاريخ" },
        { key: "amount", label: "الإجمالي" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "logistics",
    href: "/logistics",
    label: "اللوجستيات",
    description: "الشحنات ومعلومات الناقل ومسارات التسليم.",
    icon: "➤",
    color: "orange",
    sections: [
      section("shipments", "الشحنات", "شحنة", [
        { key: "trackingNumber", label: "رقم التتبع", type: "text", required: true },
        { key: "customerName", label: "العميل", type: "text" },
        { key: "carrier", label: "شركة الشحن", type: "text", required: true },
        { key: "origin", label: "نقطة الانطلاق", type: "text" },
        { key: "destination", label: "الوجهة", type: "text", required: true },
        { key: "expectedDate", label: "موعد التسليم المتوقع", type: "date" },
        statusField, descriptionField,
      ], [
        { key: "trackingNumber", label: "رقم التتبع" },
        { key: "carrier", label: "الناقل" },
        { key: "customerName", label: "العميل" },
        { key: "destination", label: "الوجهة" },
        { key: "expectedDate", label: "التسليم المتوقع" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "ai",
    href: "/ai",
    label: "الذكاء والتحليلات",
    description: "طلبات التحليل ومخرجات ذكاء الأعمال ومتابعة التنفيذ.",
    icon: "✦",
    color: "violet",
    sections: [
      section("aiRequests", "طلبات التحليل", "طلب تحليل", [
        { key: "name", label: "اسم التحليل", type: "text", required: true },
        { key: "analysisType", label: "نوع التحليل", type: "text", required: true },
        { key: "requestedBy", label: "مقدم الطلب", type: "text" },
        dateField, statusField, descriptionField,
      ], [
        { key: "name", label: "التحليل" },
        { key: "analysisType", label: "النوع" },
        { key: "requestedBy", label: "مقدم الطلب" },
        { key: "date", label: "التاريخ" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "reports",
    href: "/reports",
    label: "التقارير",
    description: "طلبات التقارير المالية والتشغيلية وفتراتها وحالة تجهيزها.",
    icon: "▧",
    color: "blue",
    sections: [
      section("reportJobs", "تقارير النظام", "طلب تقرير", [
        { key: "name", label: "اسم التقرير", type: "text", required: true },
        { key: "category", label: "التصنيف", type: "text" },
        { key: "period", label: "الفترة", type: "text" },
        { key: "requestedBy", label: "مقدم الطلب", type: "text" },
        dateField, statusField, descriptionField,
      ], [
        { key: "name", label: "التقرير" },
        { key: "category", label: "التصنيف" },
        { key: "period", label: "الفترة" },
        { key: "date", label: "التاريخ" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "settings",
    href: "/settings",
    label: "الإعدادات",
    description: "إعدادات النظام والتكاملات والسياسات التشغيلية.",
    icon: "⚙",
    color: "slate",
    sections: [
      section("settingsRecords", "إعدادات النظام", "إعداد", [
        { key: "name", label: "اسم الإعداد", type: "text", required: true },
        { key: "category", label: "التصنيف", type: "text", required: true },
        { key: "value", label: "القيمة", type: "text" },
        { key: "owner", label: "المسؤول", type: "text" },
        { key: "status", label: "الحالة", type: "select", options: activeStatuses },
        descriptionField,
      ], [
        { key: "name", label: "الإعداد" },
        { key: "category", label: "التصنيف" },
        { key: "value", label: "القيمة" },
        { key: "owner", label: "المسؤول" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "assets",
    href: "/assets",
    label: "الأصول",
    description: "سجل الأصول الثابتة ومواقعها وحركتها ومسؤولي العهدة.",
    icon: "▣",
    color: "blue",
    sections: [
      section("fixedAssets", "سجل الأصول", "أصل", [
        { key: "assetCode", label: "رمز الأصل", type: "text", required: true },
        { key: "name", label: "اسم الأصل", type: "text", required: true },
        { key: "category", label: "التصنيف", type: "text" },
        { key: "serialNumber", label: "الرقم التسلسلي", type: "text" },
        { key: "acquisitionDate", label: "تاريخ الاقتناء", type: "date", required: true },
        { key: "acquisitionCost", label: "تكلفة الاقتناء", type: "number", required: true },
        { key: "usefulLifeYears", label: "العمر الإنتاجي (سنوات)", type: "number" },
        { key: "location", label: "الموقع", type: "text" },
        { key: "custodian", label: "مسؤول العهدة", type: "text" },
        statusField, descriptionField,
      ], [
        { key: "assetCode", label: "رمز الأصل" },
        { key: "name", label: "الأصل" },
        { key: "category", label: "التصنيف" },
        { key: "acquisitionDate", label: "تاريخ الاقتناء" },
        { key: "acquisitionCost", label: "التكلفة" },
        { key: "status", label: "الحالة" },
      ]),
      section("assetMovements", "حركة الأصول", "حركة أصل", [
        referenceField,
        { key: "assetCode", label: "رمز الأصل", type: "text", required: true },
        { key: "movementType", label: "نوع الحركة", type: "select", options: ["نقل", "تخصيص", "إرجاع", "استبعاد"] },
        dateField,
        { key: "fromLocation", label: "الموقع السابق", type: "text" },
        { key: "toLocation", label: "الموقع الجديد", type: "text" },
        { key: "custodian", label: "مسؤول العهدة", type: "text" },
        statusField, descriptionField,
      ], [
        { key: "reference", label: "المرجع" },
        { key: "assetCode", label: "رمز الأصل" },
        { key: "movementType", label: "الحركة" },
        { key: "date", label: "التاريخ" },
        { key: "toLocation", label: "الموقع الجديد" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "maintenance",
    href: "/maintenance",
    label: "الصيانة",
    description: "أوامر الصيانة الوقائية والطارئة وخطط متابعة الأصول.",
    icon: "⚒",
    color: "orange",
    sections: [
      section("maintenanceOrders", "أوامر الصيانة", "أمر صيانة", [
        referenceField,
        { key: "assetCode", label: "رمز الأصل", type: "text", required: true },
        { key: "issueType", label: "نوع الصيانة", type: "select", options: ["وقائية", "تصحيحية", "طارئة"], required: true },
        { key: "priority", label: "الأولوية", type: "select", options: ["منخفضة", "متوسطة", "عالية", "عاجلة"] },
        { key: "requestedDate", label: "تاريخ الطلب", type: "date", required: true },
        { key: "plannedDate", label: "التاريخ المخطط", type: "date" },
        { key: "assignedTo", label: "الفني المسؤول", type: "text" },
        { key: "cost", label: "التكلفة التقديرية", type: "number" },
        statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم الأمر" },
        { key: "assetCode", label: "رمز الأصل" },
        { key: "issueType", label: "النوع" },
        { key: "priority", label: "الأولوية" },
        { key: "plannedDate", label: "التاريخ المخطط" },
        { key: "status", label: "الحالة" },
      ]),
      section("maintenancePlans", "خطط الصيانة", "خطة صيانة", [
        { key: "name", label: "اسم الخطة", type: "text", required: true },
        { key: "assetCode", label: "رمز الأصل", type: "text", required: true },
        { key: "frequency", label: "التكرار", type: "select", options: ["أسبوعي", "شهري", "ربع سنوي", "سنوي"], required: true },
        { key: "nextDueDate", label: "موعد الصيانة القادمة", type: "date", required: true },
        { key: "assignedTo", label: "الفني المسؤول", type: "text" },
        { key: "estimatedCost", label: "التكلفة التقديرية", type: "number" },
        statusField, descriptionField,
      ], [
        { key: "name", label: "الخطة" },
        { key: "assetCode", label: "رمز الأصل" },
        { key: "frequency", label: "التكرار" },
        { key: "nextDueDate", label: "موعد الصيانة" },
        { key: "assignedTo", label: "الفني المسؤول" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "quality",
    href: "/quality",
    label: "الجودة",
    description: "فحوص الجودة وحالات عدم المطابقة والإجراءات التصحيحية.",
    icon: "✓",
    color: "green",
    sections: [
      section("qualityInspections", "فحوص الجودة", "فحص جودة", [
        referenceField,
        { key: "subject", label: "الصنف أو العملية", type: "text", required: true },
        { key: "inspectionDate", label: "تاريخ الفحص", type: "date", required: true },
        { key: "inspector", label: "مسؤول الفحص", type: "text" },
        { key: "inspectionType", label: "نوع الفحص", type: "select", options: ["استلام", "أثناء التشغيل", "نهائي"] },
        { key: "result", label: "النتيجة", type: "select", options: ["مطابق", "غير مطابق", "مطابق بشروط"], required: true },
        { key: "sampleSize", label: "حجم العينة", type: "number" },
        { key: "defectCount", label: "عدد العيوب", type: "number" },
        statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم الفحص" },
        { key: "subject", label: "الصنف أو العملية" },
        { key: "inspectionDate", label: "تاريخ الفحص" },
        { key: "inspector", label: "مسؤول الفحص" },
        { key: "result", label: "النتيجة" },
        { key: "status", label: "الحالة" },
      ]),
      section("nonConformities", "حالات عدم المطابقة", "حالة عدم مطابقة", [
        referenceField,
        { key: "subject", label: "وصف الحالة", type: "text", required: true },
        { key: "severity", label: "درجة الخطورة", type: "select", options: ["منخفضة", "متوسطة", "عالية", "حرجة"] },
        { key: "reportedBy", label: "مقدم البلاغ", type: "text" },
        { key: "assignedTo", label: "المسؤول عن المعالجة", type: "text" },
        { key: "reportedDate", label: "تاريخ البلاغ", type: "date", required: true },
        { key: "dueDate", label: "موعد الإغلاق", type: "date" },
        { key: "correctiveAction", label: "الإجراء التصحيحي", type: "textarea" },
        statusField,
      ], [
        { key: "reference", label: "المرجع" },
        { key: "subject", label: "الحالة" },
        { key: "severity", label: "الخطورة" },
        { key: "reportedDate", label: "تاريخ البلاغ" },
        { key: "assignedTo", label: "المسؤول" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "support",
    href: "/support",
    label: "خدمة العملاء",
    description: "تذاكر الدعم وطلبات الخدمة ومتابعة أوقات الاستجابة.",
    icon: "☏",
    color: "violet",
    sections: [
      section("supportTickets", "تذاكر الدعم", "تذكرة دعم", [
        referenceField,
        { key: "subject", label: "موضوع التذكرة", type: "text", required: true },
        { key: "customerName", label: "العميل", type: "text", required: true },
        { key: "channel", label: "قناة التواصل", type: "select", options: ["هاتف", "بريد إلكتروني", "بوابة الدعم", "دردشة"] },
        { key: "priority", label: "الأولوية", type: "select", options: ["منخفضة", "متوسطة", "عالية", "عاجلة"] },
        { key: "assignedTo", label: "الموظف المسؤول", type: "text" },
        { key: "openedDate", label: "تاريخ الفتح", type: "date", required: true },
        { key: "dueDate", label: "موعد الاستجابة", type: "date" },
        statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم التذكرة" },
        { key: "subject", label: "الموضوع" },
        { key: "customerName", label: "العميل" },
        { key: "priority", label: "الأولوية" },
        { key: "assignedTo", label: "المسؤول" },
        { key: "status", label: "الحالة" },
      ]),
      section("serviceRequests", "طلبات الخدمة", "طلب خدمة", [
        referenceField,
        { key: "customerName", label: "العميل", type: "text", required: true },
        { key: "serviceType", label: "نوع الخدمة", type: "text", required: true },
        { key: "requestedDate", label: "تاريخ الطلب", type: "date", required: true },
        { key: "scheduledDate", label: "موعد التنفيذ", type: "date" },
        { key: "assignedTo", label: "الموظف المسؤول", type: "text" },
        statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم الطلب" },
        { key: "customerName", label: "العميل" },
        { key: "serviceType", label: "الخدمة" },
        { key: "requestedDate", label: "تاريخ الطلب" },
        { key: "scheduledDate", label: "موعد التنفيذ" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
  {
    id: "contracts",
    href: "/contracts",
    label: "العقود",
    description: "سجل العقود وقيمها ومددها ومواعيد التجديد.",
    icon: "▤",
    color: "slate",
    sections: [
      section("contracts", "سجل العقود", "عقد", [
        referenceField,
        { key: "subject", label: "موضوع العقد", type: "text", required: true },
        { key: "partyName", label: "الطرف المتعاقد", type: "text", required: true },
        { key: "contractType", label: "نوع العقد", type: "text" },
        { key: "startDate", label: "تاريخ البداية", type: "date", required: true },
        { key: "endDate", label: "تاريخ الانتهاء", type: "date", required: true },
        { key: "value", label: "قيمة العقد", type: "number" },
        { key: "renewalDate", label: "موعد التجديد", type: "date" },
        { key: "owner", label: "المسؤول", type: "text" },
        statusField, descriptionField,
      ], [
        { key: "reference", label: "رقم العقد" },
        { key: "subject", label: "موضوع العقد" },
        { key: "partyName", label: "الطرف المتعاقد" },
        { key: "startDate", label: "البداية" },
        { key: "endDate", label: "الانتهاء" },
        { key: "value", label: "القيمة" },
        { key: "status", label: "الحالة" },
      ]),
      section("contractRenewals", "تجديدات العقود", "تجديد عقد", [
        referenceField,
        { key: "contractReference", label: "رقم العقد", type: "text", required: true },
        { key: "partyName", label: "الطرف المتعاقد", type: "text" },
        { key: "renewalDate", label: "تاريخ التجديد", type: "date", required: true },
        { key: "proposedEndDate", label: "تاريخ الانتهاء الجديد", type: "date" },
        { key: "proposedValue", label: "القيمة المقترحة", type: "number" },
        statusField, descriptionField,
      ], [
        { key: "reference", label: "مرجع التجديد" },
        { key: "contractReference", label: "رقم العقد" },
        { key: "partyName", label: "الطرف المتعاقد" },
        { key: "renewalDate", label: "تاريخ التجديد" },
        { key: "proposedEndDate", label: "الانتهاء الجديد" },
        { key: "status", label: "الحالة" },
      ]),
    ],
  },
];

export const erpModules = modules;
export const erpModuleMap = Object.fromEntries(modules.map((module) => [module.id, module])) as Record<string, ErpModule>;

export const erpAppCards = [
  ...modules.map(({ id, href, label, description, icon, color }) => ({ id, href, label, description, icon, color })),
  {
    id: "operations",
    href: "/operations",
    label: "مركز العمليات",
    description: "عرض مركزي ومتابعة كل السجلات والنسخ الاحتياطية.",
    icon: "↗",
    color: "slate",
  },
];
