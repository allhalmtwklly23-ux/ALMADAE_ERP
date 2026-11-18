"use client";

import { ErpSectionHeader, ErpShell } from "@/components/erp-shell";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type InvoiceLine = {
  productId: string;
  qty: string;
  unitPrice: string;
};

const entityOptions = [
  { value: "journalEntries", label: "القيود اليومية" },
  { value: "accounts", label: "الحسابات" },
  { value: "customers", label: "العملاء" },
  { value: "vendors", label: "الموردون" },
  { value: "suppliers", label: "الموردين" },
  { value: "products", label: "المنتجات" },
  { value: "itemGroups", label: "مجموعات الأصناف" },
  { value: "salesInvoices", label: "فواتير المبيعات" },
  { value: "purchaseInvoices", label: "فواتير المشتريات" },
  { value: "warehouses", label: "المستودعات" },
  { value: "employees", label: "الموظفون" },
  { value: "payrollRuns", label: "مسيرات الرواتب" },
  { value: "projectTasks", label: "مهام المشاريع" },
  { value: "shipments", label: "الشحنات" },
  { value: "onlineOrders", label: "طلبات التجارة الإلكترونية" },
  { value: "aiRequests", label: "طلبات الذكاء والتحليلات" },
  { value: "reportJobs", label: "عمليات التقارير" },
  { value: "settingsRecords", label: "عمليات الإعدادات" },
  { value: "businessOperations", label: "عمليات الأعمال العامة" },
  { value: "cashVouchers", label: "سندات القبض" },
  { value: "bankTransfers", label: "التحويلات المالية" },
  { value: "expenses", label: "المصروفات" },
  { value: "revenues", label: "الإيرادات" },
  { value: "stockAdjustments", label: "التسويات المخزنية" },
  { value: "purchaseOrders", label: "أوامر الشراء" },
  { value: "salesReturns", label: "مرتجعات المبيعات" },
  { value: "purchaseReturns", label: "مرتجعات المشتريات" },
  { value: "costCenters", label: "مراكز التكلفة" },
  { value: "openingBalances", label: "الأرصدة الافتتاحية" },
  { value: "bankingOperations", label: "العمليات البنكية" },
];

const baseFieldLayout = [
  { key: "reference", label: "المرجع", type: "text" },
  { key: "date", label: "التاريخ", type: "date" },
  { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
  { key: "amount", label: "المبلغ", type: "number" },
  { key: "description", label: "الوصف", type: "textarea" },
  { key: "attachments", label: "المرفقات", type: "text" },
];

const entityFieldMap: Record<string, typeof baseFieldLayout> = {
  accounts: [
    { key: "code", label: "الكود", type: "text" },
    { key: "name", label: "اسم الحساب", type: "text" },
    { key: "type", label: "نوع الحساب", type: "select", options: ["asset", "liability", "equity", "revenue", "expense"] },
    ...baseFieldLayout,
  ],
  customers: [
    { key: "name", label: "اسم العميل", type: "text" },
    { key: "phone", label: "الجوال", type: "text" },
    { key: "creditLimit", label: "حد الائتمان", type: "number" },
    ...baseFieldLayout,
  ],
  vendors: [
    { key: "name", label: "اسم المورد", type: "text" },
    { key: "category", label: "الفئة", type: "text" },
    { key: "creditLimit", label: "حد الائتمان", type: "number" },
    ...baseFieldLayout,
  ],
  suppliers: [
    { key: "name", label: "اسم المورد", type: "text" },
    { key: "company", label: "الشركة", type: "text" },
    { key: "phone", label: "الهاتف", type: "text" },
    { key: "category", label: "الفئة", type: "text" },
    { key: "creditLimit", label: "حد الائتمان", type: "number" },
    ...baseFieldLayout,
  ],
  products: [
    { key: "name", label: "اسم الصنف", type: "text" },
    { key: "sku", label: "SKU", type: "text" },
    { key: "barcode", label: "باركود الصنف", type: "text" },
    { key: "group", label: "مجموعة الصنف", type: "text" },
    { key: "category", label: "الفئة", type: "text" },
    { key: "unitCost", label: "التكلفة للوحدة", type: "number" },
    { key: "unitPrice", label: "سعر البيع للوحدة", type: "number" },
    { key: "stockQty", label: "الرصيد الحالي", type: "number" },
    ...baseFieldLayout,
  ],
  itemGroups: [
    { key: "name", label: "اسم المجموعة", type: "text" },
    { key: "code", label: "رمز المجموعة", type: "text" },
    { key: "description", label: "الوصف", type: "textarea" },
    { key: "status", label: "الحالة", type: "select", options: ["active", "inactive"] },
  ],
  warehouses: [
    { key: "name", label: "اسم المستودع", type: "text" },
    { key: "location", label: "الموقع", type: "text" },
    ...baseFieldLayout,
  ],
  journalEntries: [
    { key: "reference", label: "رقم القيد", type: "text" },
    { key: "date", label: "تاريخ القيد", type: "date" },
    { key: "description", label: "الشرح", type: "textarea" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "attachments", label: "المرفقات", type: "text" },
  ],
  salesInvoices: [
    { key: "reference", label: "رقم الفاتورة", type: "text" },
    { key: "customerName", label: "اسم العميل", type: "text" },
    { key: "date", label: "تاريخ الفاتورة", type: "date" },
    { key: "amount", label: "إجمالي الفاتورة", type: "number" },
    { key: "items", label: "بنود الفاتورة: JSON أو سطر بسطر", type: "textarea" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "ملاحظات", type: "textarea" },
  ],
  purchaseInvoices: [
    { key: "reference", label: "رقم الفاتورة", type: "text" },
    { key: "vendorName", label: "اسم المورد", type: "text" },
    { key: "date", label: "تاريخ الفاتورة", type: "date" },
    { key: "amount", label: "الإجمالي", type: "number" },
    { key: "items", label: "بنود الشراء: JSON أو سطر بسطر", type: "textarea" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "ملاحظات", type: "textarea" },
  ],
  cashVouchers: [
    { key: "reference", label: "رقم السند", type: "text" },
    { key: "customerName", label: "الاسم", type: "text" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "البيان", type: "textarea" },
  ],
  bankTransfers: [
    { key: "reference", label: "رقم التحويل", type: "text" },
    { key: "bankName", label: "اسم البنك", type: "text" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "البيان", type: "textarea" },
  ],
  expenses: [
    { key: "reference", label: "رقم المصروف", type: "text" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "تفاصيل المصروف", type: "textarea" },
  ],
  revenues: [
    { key: "reference", label: "رقم الإيراد", type: "text" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "تفاصيل الإيراد", type: "textarea" },
  ],
  stockAdjustments: [
    { key: "reference", label: "رقم التسوية", type: "text" },
    { key: "warehouseName", label: "المستودع", type: "text" },
    { key: "amount", label: "القيمة", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "التفاصيل", type: "textarea" },
  ],
  purchaseOrders: [
    { key: "reference", label: "رقم الطلب", type: "text" },
    { key: "vendorName", label: "المورد", type: "text" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "amount", label: "الإجمالي", type: "number" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "الوصف", type: "textarea" },
  ],
  salesReturns: [
    { key: "reference", label: "رقم المرتجع", type: "text" },
    { key: "customerName", label: "اسم العميل", type: "text" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "ملاحظات", type: "textarea" },
  ],
  purchaseReturns: [
    { key: "reference", label: "رقم المرتجع", type: "text" },
    { key: "vendorName", label: "اسم المورد", type: "text" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "ملاحظات", type: "textarea" },
  ],
  costCenters: [
    { key: "name", label: "اسم مركز التكلفة", type: "text" },
    { key: "code", label: "الكود", type: "text" },
    { key: "description", label: "الوصف", type: "textarea" },
    { key: "status", label: "الحالة", type: "select", options: ["active", "inactive"] },
  ],
  openingBalances: [
    { key: "reference", label: "مرجع الرصيد", type: "text" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "الوصف", type: "textarea" },
  ],
  bankingOperations: [
    { key: "reference", label: "رقم العملية", type: "text" },
    { key: "bankName", label: "اسم البنك", type: "text" },
    { key: "amount", label: "المبلغ", type: "number" },
    { key: "date", label: "التاريخ", type: "date" },
    { key: "status", label: "الحالة", type: "select", options: ["draft", "approved", "posted", "cancelled"] },
    { key: "description", label: "الوصف", type: "textarea" },
  ],
};

function createDefaultForm(fields: typeof baseFieldLayout) {
  return Object.fromEntries(
    fields.map((field) => [field.key, field.type === "select" ? (field.options?.[0] ?? "") : ""])
  );
}

export default function OperationsPage() {
  return (
    <Suspense fallback={<div className="erp-page">جاري تحميل نموذج العملية...</div>}>
      <OperationsContent />
    </Suspense>
  );
}

function OperationsContent() {
  const searchParams = useSearchParams();
  const requestedEntity = searchParams.get("entity");
  return (
    <OperationsWorkspace
      key={searchParams.toString()}
      requestedEntity={requestedEntity}
      initialCustomerId={searchParams.get("customerId") ?? ""}
      initialSearch={searchParams.get("search") ?? ""}
      initialModule={searchParams.get("module") ?? "عام"}
    />
  );
}

function OperationsWorkspace({
  requestedEntity,
  initialCustomerId,
  initialSearch,
  initialModule,
}: {
  requestedEntity: string | null;
  initialCustomerId: string;
  initialSearch: string;
  initialModule: string;
}) {
  const initialEntity = entityOptions.find((option) => option.value === requestedEntity)?.value ?? "journalEntries";
  const [selectedEntity, setSelectedEntity] = useState(initialEntity);
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("البيانات محفوظة محلياً داخل التطبيق.");
  const [form, setForm] = useState<Record<string, string>>(() =>
    createDefaultForm(entityFieldMap[initialEntity] ?? baseFieldLayout)
  );
  const [customEntityName, setCustomEntityName] = useState("");
  const [customModule, setCustomModule] = useState(initialModule);
  const [customLinkedEntity, setCustomLinkedEntity] = useState("products");
  const [customLinkedId, setCustomLinkedId] = useState("");
  const [products, setProducts] = useState<Record<string, unknown>[]>([]);
  const [partners, setPartners] = useState<Record<string, unknown>[]>([]);
  const [partnerId, setPartnerId] = useState(() =>
    initialEntity === "salesInvoices" ? initialCustomerId : ""
  );
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);

  const fields = useMemo(() => entityFieldMap[selectedEntity] ?? baseFieldLayout, [selectedEntity]);
  const isInvoice = selectedEntity === "salesInvoices" || selectedEntity === "purchaseInvoices";
  const isPurchaseInvoice = selectedEntity === "purchaseInvoices";
  const invoiceTotal = invoiceLines.reduce((total, line) => {
    const quantity = Number(line.qty);
    const unitPrice = Number(line.unitPrice);
    return total + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0);
  }, 0);

  const loadRecords = useCallback(async (entity = selectedEntity) => {
    const params = new URLSearchParams({ entity });
    if (search) params.set("search", search);
    if (status && status !== "all") params.set("status", status);

    const response = await fetch(`/api/erp?${params.toString()}`);
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message ?? "تعذر تحميل سجلات العملية.");
    }
    return Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
  }, [search, selectedEntity, status]);

  useEffect(() => {
    let active = true;
    loadRecords()
      .then((data) => {
        if (active) setRecords(data);
      })
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "تعذر تحميل سجلات العملية.");
      });
    return () => {
      active = false;
    };
  }, [loadRecords]);

  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [productsResponse, partnersResponse] = await Promise.all([
          fetch("/api/erp?entity=products"),
          fetch(`/api/erp?entity=${selectedEntity === "purchaseInvoices" ? "suppliers" : "customers"}`),
        ]);
        const [productsResult, partnersResult] = await Promise.all([
          productsResponse.json(),
          partnersResponse.json(),
        ]);
        setProducts(Array.isArray(productsResult.data) ? productsResult.data : []);
        setPartners(Array.isArray(partnersResult.data) ? partnersResult.data : []);
      } catch {
        setMessage("تعذر تحميل الأصناف أو بيانات العميل/المورد.");
      }
    };

    if (selectedEntity === "salesInvoices" || selectedEntity === "purchaseInvoices") {
      loadMasterData();
    }
  }, [selectedEntity]);

  const changeEntity = (entity: string) => {
    setSelectedEntity(entity);
    setForm(createDefaultForm(entityFieldMap[entity] ?? baseFieldLayout));
    setSelectedId(null);
    setInvoiceLines([]);
    setPartnerId(entity === "salesInvoices" ? initialCustomerId : "");
  };

  const updateField = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(createDefaultForm(fields));
    setSelectedId(null);
    setInvoiceLines([]);
    setPartnerId("");
  };

  useEffect(() => {
    const handleCreateOperation = () => {
      const defaults: Record<string, string> = {};
      for (const field of fields) {
        defaults[field.key] = field.type === "select" ? (field.options?.[0] ?? "") : "";
      }
      setForm(defaults);
      setSelectedId(null);
      setInvoiceLines([]);
      setPartnerId("");
      setCustomEntityName("");
      setCustomLinkedId("");
      setMessage("نموذج عملية جديد جاهز.");
      document.getElementById("operation-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    window.addEventListener("erp:create-operation", handleCreateOperation);
    return () => window.removeEventListener("erp:create-operation", handleCreateOperation);
  }, [fields]);

  const addInvoiceLine = () => {
    const firstProduct = products[0];
    if (!firstProduct) {
      setMessage("أضف صنفاً إلى سجل المنتجات أولاً.");
      return;
    }
    setInvoiceLines((current) => [
      ...current,
      {
        productId: String(firstProduct.id ?? ""),
        qty: "1",
        unitPrice: String(
          isPurchaseInvoice
            ? Number(firstProduct.unitCost ?? 0)
            : Number(firstProduct.unitPrice ?? 0)
        ),
      },
    ]);
  };

  const updateInvoiceLine = (index: number, patch: Partial<InvoiceLine>) => {
    setInvoiceLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...patch };
        if (patch.productId) {
          const product = products.find((candidate) => candidate.id === patch.productId);
          if (product) {
            next.unitPrice = String(
              isPurchaseInvoice
                ? Number(product.unitCost ?? 0)
                : Number(product.unitPrice ?? 0)
            );
          }
        }
        return next;
      })
    );
  };

  const slugifyEntityName = (value: string) => {
    const base = value.trim();
    if (!base) return "custom_operation";
    return base
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "") || "custom_operation";
  };

  const submitRecord = async () => {
    const resolvedEntity = customEntityName.trim() ? slugifyEntityName(customEntityName) : selectedEntity;
    const payload: Record<string, unknown> = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== "")
    );
    if (isInvoice && !customEntityName.trim()) {
      payload.status = "draft";
    }
    if (customModule.trim()) {
      payload.module = customModule.trim();
    }

    if (isInvoice && !customEntityName.trim()) {
      const partner = partners.find((candidate) => candidate.id === partnerId);
      if (!partner) {
        setMessage(isPurchaseInvoice ? "اختر المورد قبل حفظ الفاتورة." : "اختر العميل قبل حفظ الفاتورة.");
        return;
      }
      if (invoiceLines.length === 0) {
        setMessage("أضف صنفاً واحداً على الأقل إلى الفاتورة.");
        return;
      }

      const items = invoiceLines.map((line) => {
        const product = products.find((candidate) => candidate.id === line.productId);
        return {
          productId: line.productId,
          productName: String(product?.name ?? ""),
          sku: String(product?.sku ?? ""),
          barcode: String(product?.barcode ?? ""),
          qty: Number(line.qty),
          unitPrice: Number(line.unitPrice),
          amount: Number(line.qty) * Number(line.unitPrice),
        };
      });

      if (items.some((item) => !item.productId || !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
        setMessage("تحقق من الصنف والكمية والسعر في كل بند.");
        return;
      }

      payload.items = items;
      payload.amount = invoiceTotal;
      if (isPurchaseInvoice) {
        payload.vendorId = partnerId;
        payload.vendorName = String(partner.name ?? "");
      } else {
        payload.customerId = partnerId;
        payload.customerName = String(partner.name ?? "");
      }
    }

    if (customEntityName.trim()) {
      payload.recordType = customEntityName.trim();
      payload.module = customModule || "عام";
      payload.linkedEntity = customLinkedEntity || "";
      payload.linkedId = customLinkedId || "";
    }

    if (!isInvoice && (selectedEntity === "salesInvoices" || selectedEntity === "purchaseInvoices")) {
      const itemsValue = payload.items;
      if (typeof itemsValue === "string") {
        const rawItems = itemsValue.trim();
        if (rawItems) {
          try {
            const parsed = JSON.parse(rawItems);
            payload.items = Array.isArray(parsed) ? parsed : rawItems;
          } catch {
            payload.items = rawItems
              .split(/\r?\n|,/) 
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => ({ label: item }));
          }
        }
      }
    }

    if (selectedEntity === "products") {
      const numericKeys = ["unitCost", "unitPrice", "stockQty", "amount"];
      for (const key of numericKeys) {
        const currentValue = payload[key];
        if (currentValue !== undefined && currentValue !== "") {
          payload[key] = Number(currentValue);
        }
      }
    }

    const method = selectedId ? "PUT" : "POST";
    const response = await fetch("/api/erp", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: resolvedEntity,
        id: selectedId,
        data: payload,
      }),
    });

    const result = await response.json() as {
      success?: boolean;
      message?: string;
      data?: Record<string, unknown>;
    };
    let responseMessage = result.message ?? (selectedId ? "تم تحديث العملية بنجاح." : "تم حفظ العملية بنجاح.");
    let invoicePosted = false;
    if (result.success && isInvoice && !customEntityName.trim()) {
      const invoiceId = selectedId ?? String(result.data?.id ?? "");
      if (invoiceId) {
        try {
          const postResponse = await fetch("/api/erp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "postInvoice", entity: selectedEntity, id: invoiceId }),
          });
          const postResult = await postResponse.json() as { success?: boolean; message?: string };
          if (!postResponse.ok || !postResult.success) {
            throw new Error(postResult.message ?? "تعذر ترحيل الفاتورة.");
          }
          invoicePosted = true;
          responseMessage = "تم حفظ الفاتورة وترحيلها تلقائياً، وتم تحديث المخزون.";
        } catch (postingError) {
          responseMessage = `تم حفظ الفاتورة كمسودة، لكن لم يتم تحديث المخزون: ${postingError instanceof Error ? postingError.message : "تعذر الترحيل."}`;
        }
      } else {
        responseMessage = "تم حفظ الفاتورة، لكن تعذر تحديدها للترحيل التلقائي.";
      }
    }
    setMessage(responseMessage);
    if (result.success) {
      resetForm();
      setCustomEntityName("");
      setCustomLinkedId("");
      if (!customEntityName.trim()) {
        setSelectedEntity(resolvedEntity);
      }
      setRecords(await loadRecords(resolvedEntity));
      if (invoicePosted) {
        const productsResponse = await fetch("/api/erp?entity=products");
        const productsResult = await productsResponse.json() as { success?: boolean; data?: Record<string, unknown>[] };
        if (productsResponse.ok && productsResult.success && Array.isArray(productsResult.data)) {
          setProducts(productsResult.data);
        }
      }
    }
  };

  const editRecord = (record: Record<string, unknown>) => {
    const nextForm: Record<string, string> = {};
    for (const field of fields) {
      const value = record[field.key];
      nextForm[field.key] = value === undefined || value === null ? "" : String(value);
    }
    setForm(nextForm);
    setSelectedId(String(record.id ?? ""));
    if (isInvoice) {
      const recordPartnerId = String(
        record[isPurchaseInvoice ? "vendorId" : "customerId"] ?? ""
      );
      const matchedPartner = partners.find((partner) =>
        partner.id === recordPartnerId ||
        partner.name === record[isPurchaseInvoice ? "vendorName" : "customerName"]
      );
      setPartnerId(String(matchedPartner?.id ?? ""));
      setInvoiceLines(
        Array.isArray(record.items)
          ? record.items.map((rawItem) => {
              const item = typeof rawItem === "object" && rawItem !== null
                ? rawItem as Record<string, unknown>
                : {};
              const product = products.find((candidate) =>
                candidate.id === item.productId ||
                candidate.barcode === item.barcode ||
                candidate.sku === item.sku
              );
              return {
                productId: String(product?.id ?? item.productId ?? ""),
                qty: String(item.qty ?? item.quantity ?? 1),
                unitPrice: String(item.unitPrice ?? item.price ?? 0),
              };
            })
          : []
      );
    }
  };

  const deleteRecord = async (recordId: string) => {
    const response = await fetch("/api/erp", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: selectedEntity, id: recordId }),
    });
    const result = await response.json();
    setMessage(result.message ?? "تم حذف العملية.");
    setRecords(await loadRecords(selectedEntity));
  };

  const backupStore = async () => {
    const response = await fetch("/api/erp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "backup" }),
    });
    const result = await response.json();
    setMessage(result.message ?? "تم إنشاء نسخة احتياطية بنجاح.");
  };

  const postInvoiceRecord = async (recordId: string) => {
    const response = await fetch("/api/erp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "postInvoice", entity: selectedEntity, id: recordId }),
    });
    const result = await response.json();
    setMessage(result.message ?? "تعذر ترحيل الفاتورة.");
    if (result.success) {
      const [nextRecords, productsResponse] = await Promise.all([
        loadRecords(selectedEntity),
        fetch("/api/erp?entity=products"),
      ]);
      const productsResult = await productsResponse.json();
      setRecords(nextRecords);
      setProducts(Array.isArray(productsResult.data) ? productsResult.data : []);
    }
  };

  return (
    <ErpShell>
      <div className="erp-page">
        <ErpSectionHeader title="مركز العمليات" subtitle="إنشاء، حفظ، تعديل، استرجاع، وحفظ كل عملية بشكل فعلي داخل النظام" />

        <div className="stats-grid four-col">
          <div className="stat-card"><span className="stat-label">النوع المختار</span><strong>{entityOptions.find((item) => item.value === selectedEntity)?.label}</strong><small>قابل للتحديث والبحث</small></div>
          <div className="stat-card"><span className="stat-label">السجلات الحالية</span><strong>{records.length}</strong><small>حدّثت من قاعدة بيانات التخزين</small></div>
          <div className="stat-card"><span className="stat-label">النسخ الاحتياطي</span><strong>فعال</strong><small>يمكن الاستعادة في أي وقت</small></div>
          <div className="stat-card"><span className="stat-label">حالة النظام</span><strong>مستقر</strong><small>{message}</small></div>
        </div>

        <div className="erp-panel" id="operation-form">
          <div className="panel-head">
            <h3>إنشاء أو تحديث عملية</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button type="button" className="ghost-button small" onClick={backupStore}>نسخ احتياطي</button>
              <button type="button" className="ghost-button small" onClick={resetForm}>مسح النموذج</button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span>نوع العملية</span>
                <select value={selectedEntity} onChange={(event) => changeEntity(event.target.value)}>
                  {entityOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <span>البحث</span>
                <input type="text" placeholder="ابحث بأي كلمة" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, padding: 12, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span>اسم التطبيق / القسم</span>
                <input type="text" value={customModule} onChange={(event) => setCustomModule(event.target.value)} placeholder="مثل: المبيعات / المخزن / HR" />
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <span>اسم العملية المخصصة</span>
                <input type="text" value={customEntityName} onChange={(event) => setCustomEntityName(event.target.value)} placeholder="مثل: طلبات العملاء" />
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <span>ربط مع</span>
                <select value={customLinkedEntity} onChange={(event) => setCustomLinkedEntity(event.target.value)}>
                  {entityOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <span>معرّف السجل المرتبط</span>
                <input type="text" value={customLinkedId} onChange={(event) => setCustomLinkedId(event.target.value)} placeholder="ID أو رقم  المرجع" />
              </label>
            </div>

            {isInvoice && !customEntityName.trim() ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
                  {fields
                    .filter((field) => ["reference", "date", "description"].includes(field.key))
                    .map((field) => (
                      <label key={field.key} style={{ display: "grid", gap: 8 }}>
                        <span>{field.label}</span>
                        {field.type === "textarea" ? (
                          <textarea value={form[field.key] ?? ""} onChange={(event) => updateField(field.key, event.target.value)} rows={2} />
                        ) : (
                          <input type={field.type} value={form[field.key] ?? ""} onChange={(event) => updateField(field.key, event.target.value)} />
                        )}
                      </label>
                    ))}
                  <label style={{ display: "grid", gap: 8 }}>
                    <span>{isPurchaseInvoice ? "المورد" : "العميل"}</span>
                    <select value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
                      <option value="">اختر {isPurchaseInvoice ? "المورد" : "العميل"}</option>
                      {partners.map((partner) => (
                        <option key={String(partner.id)} value={String(partner.id)}>
                          {String(partner.name ?? partner.company ?? partner.id)}
                        </option>
                      ))}
                    </select>
                    {partners.length === 0 && (
                      <small>لا توجد سجلات؛ أنشئ {isPurchaseInvoice ? "موردًا" : "عميلًا"} من مركز العمليات أولاً.</small>
                    )}
                  </label>
                </div>

                <section className="erp-panel" aria-label="بنود الفاتورة">
                  <div className="panel-head">
                    <h3>أصناف الفاتورة</h3>
                    <button type="button" className="ghost-button small" onClick={addInvoiceLine}>إضافة صنف</button>
                  </div>
                  {invoiceLines.length === 0 ? (
                    <p>أضف صنفاً محفوظاً مسبقاً. سيُحفظ الصنف والباركود والكمية والسعر ضمن الفاتورة.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {invoiceLines.map((line, index) => {
                        const product = products.find((candidate) => candidate.id === line.productId);
                        return (
                          <div key={`${index}-${line.productId}`} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) 1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
                            <label style={{ display: "grid", gap: 8 }}>
                              <span>الصنف / الباركود</span>
                              <select value={line.productId} onChange={(event) => updateInvoiceLine(index, { productId: event.target.value })}>
                                <option value="">اختر الصنف</option>
                                {products.map((item) => (
                                  <option key={String(item.id)} value={String(item.id)}>
                                    {String(item.name)} — {String(item.barcode ?? item.sku ?? "")}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label style={{ display: "grid", gap: 8 }}>
                              <span>الكمية</span>
                              <input type="number" min="0.001" step="any" value={line.qty} onChange={(event) => updateInvoiceLine(index, { qty: event.target.value })} />
                            </label>
                            <label style={{ display: "grid", gap: 8 }}>
                              <span>سعر الوحدة</span>
                              <input type="number" min="0" step="any" value={line.unitPrice} onChange={(event) => updateInvoiceLine(index, { unitPrice: event.target.value })} />
                            </label>
                            <div>
                              <span>الإجمالي</span>
                              <strong style={{ display: "block" }}>
                                {(Number(line.qty || 0) * Number(line.unitPrice || 0)).toLocaleString("ar-SA")}
                              </strong>
                              {product && <small>الرصيد: {String(product.stockQty ?? 0)}</small>}
                            </div>
                            <button type="button" className="ghost-button small" onClick={() => setInvoiceLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>حذف</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
                    <strong>إجمالي الفاتورة</strong>
                    <strong>{invoiceTotal.toLocaleString("ar-SA")}</strong>
                  </div>
                </section>
              </>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              {(isInvoice ? fields.filter((field) => field.key !== "status") : fields).map((field) => (
                <label key={field.key} style={{ display: "grid", gap: 8 }}>
                  <span>{field.label}</span>
                  {field.type === "textarea" ? (
                    <textarea value={form[field.key] ?? ""} onChange={(event) => updateField(field.key, event.target.value)} rows={3} />
                  ) : field.type === "select" ? (
                    <select value={form[field.key] ?? ""} onChange={(event) => updateField(field.key, event.target.value)}>
                      {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input type={field.type} value={form[field.key] ?? ""} onChange={(event) => updateField(field.key, event.target.value)} />
                  )}
                </label>
              ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-start", gap: 12 }}>
              <button type="button" className="primary-button" onClick={submitRecord}>{selectedId ? "تحديث العملية" : "حفظ العملية"}</button>
            </div>
          </div>
        </div>

        <div className="erp-panel" style={{ marginTop: 24 }}>
          <div className="panel-head">
            <h3>سجلات العملية</h3>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">كل الحالات</option>
              <option value="draft">مسودة</option>
              <option value="approved">معتمدة</option>
              <option value="posted">مرحلة</option>
              <option value="cancelled">ملغاة</option>
            </select>
          </div>

          <table className="erp-table">
            <thead>
              <tr>
                <th>المرجع</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>المبلغ</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={String(record.id)}>
                  <td>{String(record.reference ?? record.code ?? record.name ?? record.id)}</td>
                  <td>{String(record.date ?? record.createdAt ?? "-")}</td>
                  <td><span className="status-pill neutral">{String(record.status ?? "draft")}</span></td>
                  <td>{String(record.amount ?? record.creditLimit ?? record.unitPrice ?? "-")}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      {record.status !== "posted" && (
                        <button type="button" className="ghost-button small" onClick={() => editRecord(record)}>تعديل</button>
                      )}
                      {isInvoice && (record.status === "draft" || record.status === "approved") && (
                        <button type="button" className="ghost-button small" onClick={() => postInvoiceRecord(String(record.id))}>ترحيل وتحديث المخزون</button>
                      )}
                      {record.status !== "posted" && (
                        <button type="button" className="ghost-button small" onClick={() => deleteRecord(String(record.id))}>حذف</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ErpShell>
  );
}
