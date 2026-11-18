"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ErpShell } from "@/components/erp-shell";
import { hasErpPermission, useErpSession } from "@/components/erp-session-provider";
import { erpModuleMap, type ErpModule, type ModuleField, type ModuleSection } from "@/lib/erp/module-config";
import { calculateDiscountedSalesVat, calculateSalesVat, isSalesVatMode, SALES_DISCOUNT_VAT_MODE, SALES_VAT_MODE } from "@/lib/erp/sales-tax";
import { reviewSalesStock } from "@/lib/erp/sales-stock-review";
import { searchInvoicePartners } from "@/lib/erp/partner-search";

type ErpRecord = Record<string, unknown> & { id: string; status?: string };
type InvoiceLine = { productId: string; qty: string; unitPrice: string; discountType: "amount" | "percent"; discountValue: string };
type ApiResult = { success?: boolean; message?: string; data?: unknown };
type ProductHistory = {
  unitCost: unknown;
  history: { invoiceId: string; reference: string; date: string; supplier: string; quantity: unknown; unitCost: unknown }[];
};

const financialSources = [
  { entity: "journalEntries", label: "قيد يومي" },
  { entity: "salesInvoices", label: "فاتورة مبيعات" },
  { entity: "purchaseInvoices", label: "فاتورة مشتريات" },
  { entity: "cashVouchers", label: "سند قبض" },
  { entity: "bankTransfers", label: "تحويل مالي" },
  { entity: "bankingOperations", label: "عملية بنكية" },
  { entity: "expenses", label: "مصروف" },
  { entity: "revenues", label: "إيراد" },
  { entity: "salesReturns", label: "مرتجع مبيعات" },
  { entity: "purchaseReturns", label: "مرتجع مشتريات" },
  { entity: "openingBalances", label: "رصيد افتتاحي" },
  { entity: "stockAdjustments", label: "تسوية مخزنية" },
] as const;

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  posted: "مرحّلة",
  cancelled: "ملغاة",
  active: "نشط",
  inactive: "غير نشط",
  on_hold: "موقوف",
  on_leave: "إجازة",
};
const statuses = ["draft", "approved", "posted", "cancelled"] as const;

const moneyFormatter = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 2,
});

function defaultForm(section: ModuleSection) {
  return Object.fromEntries(section.fields.map((field) => {
    if (field.type === "select") return [field.key, field.options?.[0] ?? ""];
    return [field.key, ""];
  }));
}

function getFormGroups(section: ModuleSection) {
  if (section.entity === "products") {
    const identityKeys = new Set(["name", "sku", "barcode", "group", "category"]);
    return [
      {
        title: "تعريف الصنف",
        description: "بيانات تساعدك على التعرف على الصنف والبحث عنه.",
        fields: section.fields.filter((field) => identityKeys.has(field.key)),
      },
      {
        title: "التسعير والمخزون",
        description: "أدخل التكلفة وسعر البيع والرصيد الافتتاحي.",
        fields: section.fields.filter((field) => !identityKeys.has(field.key)),
      },
    ];
  }

  return [{
    title: section.invoiceParty ? "بيانات الفاتورة" : "بيانات العملية",
    description: section.invoiceParty
      ? "رقم الفاتورة وتاريخها وحالتها."
      : `أدخل بيانات ${section.singular} المطلوبة.`,
    fields: section.fields,
  }];
}

async function requestJson(url: string, init?: RequestInit): Promise<ApiResult> {
  const response = await fetch(url, init);
  const result = await response.json() as ApiResult;
  if (!response.ok || !result.success) {
    throw new Error(result.message ?? "تعذر إكمال العملية.");
  }
  return result;
}

async function fetchEntity(entity: string) {
  const params = new URLSearchParams({ entity });
  const result = await requestJson(`/api/erp?${params.toString()}`);
  return Array.isArray(result.data) ? result.data as ErpRecord[] : [];
}

async function fetchFinancialStatement() {
  const collections = await Promise.all(financialSources.map(async (source) => ({
    source,
    records: await fetchEntity(source.entity),
  })));

  return collections.flatMap(({ source, records }) => records.map((record) => ({
    ...record,
    id: `${source.entity}:${record.id}`,
    sourceEntity: source.entity,
    sourceLabel: source.label,
    reference: String(record.reference ?? record.id),
    date: String(record.date ?? record.createdAt ?? ""),
    party: String(record.customerName ?? record.vendorName ?? record.bankName ?? record.accountName ?? record.name ?? "—"),
    amount: Number(record.amount ?? record.totalAmount ?? 0),
    status: String(record.status ?? "draft"),
  }))).sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

async function fetchSectionRecords(section: ModuleSection) {
  return section.view === "statement" ? fetchFinancialStatement() : fetchEntity(section.entity);
}

function formatCell(key: string, value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (key === "status") return statusLabels[String(value)] ?? String(value);
  if (["amount", "totalAmount", "unitPrice", "unitCost", "salary", "creditLimit"].includes(key)) {
    const number = Number(value);
    return Number.isFinite(number) ? moneyFormatter.format(number) : String(value);
  }
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (Array.isArray(value)) return `${value.length} عناصر`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function downloadCsv(records: ErpRecord[], fields: Array<{ key: string; label: string }>, entity: string) {
  const escapeCell = (value: unknown) => {
    const raw = String(value ?? "");
    const safeValue = typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    const text = safeValue.replace(/"/g, '""');
    return `"${text}"`;
  };
  const rows = [
    fields.map((field) => escapeCell(field.label)).join(","),
    ...records.map((record) => fields.map((field) => escapeCell(record[field.key])).join(",")),
  ];
  const blob = new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${entity}-records.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ModuleField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "textarea") {
    return (
      <textarea
        id={`field-${field.key}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        required={field.required}
        rows={3}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        id={`field-${field.key}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
      >
        {(field.options ?? []).map((option) => (
          <option value={option} key={option}>{statusLabels[option] ?? option}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      id={`field-${field.key}`}
      type={field.type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      required={field.required}
      step={field.type === "number" ? "any" : undefined}
    />
  );
}

export function ErpModuleWorkspace({ moduleId }: { moduleId: string }) {
  const { user } = useErpSession();
  const moduleDefinition: ErpModule = erpModuleMap[moduleId] ?? erpModuleMap["sales"];
  const [activeEntity, setActiveEntity] = useState(moduleDefinition.sections[0].entity);
  const [records, setRecords] = useState<ErpRecord[]>([]);
  const [products, setProducts] = useState<ErpRecord[]>([]);
  const [partners, setPartners] = useState<ErpRecord[]>([]);
  const [accounts, setAccounts] = useState<ErpRecord[]>([]);
  const [form, setForm] = useState<Record<string, string>>(() => defaultForm(moduleDefinition.sections[0]));
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productGroup, setProductGroup] = useState("all");
  const [productSearchError, setProductSearchError] = useState("");
  const [previewProduct, setPreviewProduct] = useState<ErpRecord | null>(null);
  const [previewHistory, setPreviewHistory] = useState<ProductHistory | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [stockRefreshLoading, setStockRefreshLoading] = useState(false);
  const [stockRefreshMessage, setStockRefreshMessage] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [partnerSearch, setPartnerSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTaxMode, setEditingTaxMode] = useState<string>("");
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"amount" | "percent">("amount");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState("0");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState<"list" | "cards">(() => moduleId === "crm" ? "cards" : "list");
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "updatedAt", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(0);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(
    () => moduleDefinition.sections[0].listFields.map((field) => field.key)
  );
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const activeSection = useMemo(
    () => moduleDefinition.sections.find((item) => item.entity === activeEntity) ?? moduleDefinition.sections[0],
    [activeEntity, moduleDefinition],
  );
  const isCustomerManagement = moduleId === "crm" && activeSection.entity === "customers";
  const statusOptions = activeSection.fields.find((field) => field.key === "status")?.options ?? [...statuses];
  const canCreate = hasErpPermission(user, activeSection.entity, "create");
  const canEdit = hasErpPermission(user, activeSection.entity, "edit");
  const canDelete = hasErpPermission(user, activeSection.entity, "delete");
  const canPost = hasErpPermission(user, activeSection.entity, "post");
  const canPrint = hasErpPermission(user, activeSection.entity, "print");
  const canExport = hasErpPermission(user, activeSection.entity, "export");
  const canViewProductCosts = user?.role === "sales_manager"
    || hasErpPermission(user, "productCosts", "view")
    || hasErpPermission(user, "purchaseInvoices", "view");

  const reloadRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      setRecords(await fetchSectionRecords(activeSection));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل سجلات هذا التطبيق.");
      setRecords([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeSection]);

  useEffect(() => {
    let active = true;
    fetchSectionRecords(activeSection)
      .then((nextRecords) => {
        if (active) setRecords(nextRecords);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "تعذر تحميل سجلات هذا التطبيق.");
          setRecords([]);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [activeSection]);

  useEffect(() => {
    let active = true;
    const partyEntity = activeSection.invoiceParty?.entity;
    if (!partyEntity) {
      if (activeSection.view === "statement") {
        fetchEntity("accounts")
          .then((nextAccounts) => {
            if (active) setAccounts(nextAccounts);
          })
          .catch((error: unknown) => {
            if (active) setMessage(error instanceof Error ? error.message : "تعذر تحميل دليل الحسابات.");
          });
      }
      return () => { active = false; };
    }

    Promise.all([fetchEntity("products"), fetchEntity(partyEntity)])
      .then(([nextProducts, nextPartners]) => {
        if (active) {
          setProducts(nextProducts);
          setPartners(nextPartners);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(error instanceof Error ? error.message : "تعذر تحميل بيانات الأصناف والعملاء.");
        }
      });

    return () => { active = false; };
  }, [activeSection.invoiceParty?.entity, activeSection.view]);

  useEffect(() => {
    const handleCreate = (event: Event) => {
      const target = (event as CustomEvent<{ entity?: string }>).detail?.entity;
      const targetSection = moduleDefinition.sections.find((item) => item.entity === target) ?? activeSection;
      setActiveEntity(targetSection.entity);
      setEditingId(null);
      setForm(defaultForm(targetSection));
      setInvoiceLines([]);
      setStockRefreshMessage("");
      setInvoiceDiscountType("amount");
      setInvoiceDiscountValue("0");
      setProductSearch("");
      setProductGroup("all");
      setProductSearchError("");
      setPartnerId("");
      setPartnerSearch("");
      setVisibleColumnKeys(targetSection.listFields.map((field) => field.key));
      setCurrentPage(0);
      if (targetSection.entity !== activeSection.entity) setIsLoading(true);
      setIsFormOpen(true);
      setMessage(`نموذج ${targetSection.singular} جاهز للإدخال.`);
    };

    window.addEventListener("erp:create-operation", handleCreate);
    return () => window.removeEventListener("erp:create-operation", handleCreate);
  }, [activeSection, moduleDefinition.sections]);

  const visibleRecords = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return records.filter((record) => {
      if (statusFilter !== "all" && String(record.status ?? "draft") !== statusFilter) return false;
      const recordDate = String(record.date ?? "").slice(0, 10);
      if (activeSection.view === "statement" && dateFrom && recordDate < dateFrom) return false;
      if (activeSection.view === "statement" && dateTo && recordDate > dateTo) return false;
      if (activeSection.view === "statement" && selectedAccount !== "all") {
        const account = accounts.find((item) => item.id === selectedAccount);
        const linkedValues = [record.accountId, record.accountCode, record.accountName, record.account, record.fromAccount, record.toAccount]
          .filter((value) => value !== undefined && value !== null)
          .map(String);
        if (!account || !linkedValues.some((value) =>
          value === selectedAccount ||
          value === String(account.code ?? "") ||
          value === String(account.name ?? "")
        )) return false;
      }
      if (!normalizedSearch) return true;
      return Object.values(record).some((value) =>
        String(value ?? "").toLocaleLowerCase().includes(normalizedSearch)
      );
    });
  }, [accounts, activeSection.view, dateFrom, dateTo, records, search, selectedAccount, statusFilter]);

  const sortedRecords = useMemo(() => [...visibleRecords].sort((left, right) => {
    const leftValue = left[sort.key] ?? "";
    const rightValue = right[sort.key] ?? "";
    const leftNumber = Number(leftValue);
    const rightNumber = Number(rightValue);
    const comparison = String(leftValue) !== "" && String(rightValue) !== ""
      && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
      ? leftNumber - rightNumber
      : String(leftValue).localeCompare(String(rightValue), "ar", { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? comparison : -comparison;
  }), [sort, visibleRecords]);

  const pageSize = 10;
  const pageCount = Math.ceil(sortedRecords.length / pageSize);
  const safePage = Math.min(currentPage, Math.max(pageCount - 1, 0));
  const pageRecords = sortedRecords.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const amountTotal = useMemo(() => records.reduce((total, record) => {
    const value = Number(record.amount ?? record.totalAmount ?? 0);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0), [records]);
  const customerStatusCounts = isCustomerManagement
    ? {
        all: records.length,
        active: records.filter((record) => record.status === "active").length,
        inactive: records.filter((record) => record.status === "inactive").length,
        on_hold: records.filter((record) => record.status === "on_hold").length,
      }
    : null;

  const invoiceTotal = useMemo(() => invoiceLines.reduce((total, line) => {
    const quantity = Number(line.qty);
    const price = Number(line.unitPrice);
    return total + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
  }, 0), [invoiceLines]);
  const useSalesVat = activeSection.entity === "salesInvoices" && (!editingId || isSalesVatMode(editingTaxMode));
  const useDiscounts = useSalesVat && (!editingId || editingTaxMode === SALES_DISCOUNT_VAT_MODE);
  const salesTotals = useMemo(() => {
    if (!useSalesVat || invoiceLines.length === 0) return { value: null, discountValue: null, error: "" };
    try {
      if (useDiscounts) {
        const value = calculateDiscountedSalesVat(invoiceLines, invoiceDiscountType, invoiceDiscountValue);
        return { value, discountValue: value, error: "" };
      }
      return { value: calculateSalesVat(invoiceLines), discountValue: null, error: "" };
    } catch (error) {
      return { value: null, discountValue: null, error: error instanceof Error ? error.message : "تعذر احتساب الضريبة." };
    }
  }, [invoiceLines, invoiceDiscountType, invoiceDiscountValue, useDiscounts, useSalesVat]);
  const displayedTotal = useSalesVat ? salesTotals.value?.amount : invoiceTotal;
  const stockIssues = useMemo(() => activeSection.entity === "salesInvoices"
    ? reviewSalesStock(invoiceLines, products) : [], [activeSection.entity, invoiceLines, products]);
  const invalidPreviewLines = invoiceLines.some((line) => !line.qty.trim() || !line.unitPrice.trim()
    || !Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0
    || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0
    || !products.some((product) => product.id === line.productId));
  const previewTotal = invoiceLines.length === 0 || invalidPreviewLines ? undefined : displayedTotal;
  const productGroups = useMemo(() => Array.from(new Set(products
    .map((product) => String(product.group ?? "").trim()).filter(Boolean))).sort(), [products]);
  const matchingProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase();
    if (!query) return [];
    return products.filter((product) =>
      (productGroup === "all" || String(product.group ?? "") === productGroup)
      && [product.name, product.reference, product.sku, product.barcode, product.group, product.category]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(query))
    ).slice(0, 20);
  }, [products, productSearch, productGroup]);

  useEffect(() => {
    if (!previewProduct || !canViewProductCosts) return;
    let active = true;
    const params = new URLSearchParams({ view: "productPurchaseHistory", productId: previewProduct.id });
    requestJson(`/api/erp?${params.toString()}`)
      .then((result) => {
        if (active) setPreviewHistory(result.data as ProductHistory);
      })
      .catch((error: unknown) => {
        if (active) setPreviewError(error instanceof Error ? error.message : "تعذر تحميل سجل الصنف.");
      })
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [previewProduct, canViewProductCosts]);
  const formGroups = useMemo(() => getFormGroups(activeSection), [activeSection]);
  const selectedPartner = partners.find((partner) => partner.id === partnerId);
  const matchingPartners = useMemo(() => searchInvoicePartners(partners, partnerSearch), [partners, partnerSearch]);
  const partnerOptions = matchingPartners.slice(0, 50);
  if (selectedPartner && !partnerOptions.some((partner) => partner.id === selectedPartner.id)) {
    partnerOptions.unshift(selectedPartner);
  }
  const unitCostValue = form.unitCost === "" ? null : Number(form.unitCost);
  const unitPriceValue = form.unitPrice === "" ? null : Number(form.unitPrice);
  const productMargin = unitCostValue !== null && unitPriceValue !== null
    && Number.isFinite(unitCostValue) && Number.isFinite(unitPriceValue)
    ? unitPriceValue - unitCostValue
    : null;

  const openNewForm = (section = activeSection) => {
    setActiveEntity(section.entity);
    setEditingId(null);
    setForm(defaultForm(section));
    setInvoiceLines([]);
    setStockRefreshMessage("");
    setInvoiceDiscountType("amount");
    setInvoiceDiscountValue("0");
    setProductSearch("");
    setProductGroup("all");
    setProductSearchError("");
    setPartnerId("");
    setPartnerSearch("");
    setVisibleColumnKeys(section.listFields.map((field) => field.key));
    setCurrentPage(0);
    setIsFormOpen(true);
    setMessage(`نموذج ${section.singular} جاهز للإدخال.`);
  };

  const changeSection = (section: ModuleSection) => {
    setActiveEntity(section.entity);
    setIsLoading(true);
    setCurrentPage(0);
    setVisibleColumnKeys(section.listFields.map((field) => field.key));
    if (section.view === "statement") setView("list");
    setSearch("");
    setStatusFilter("all");
    setMessage("");
  };

  const changeSort = (key: string) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
    setCurrentPage(0);
  };

  const toggleColumn = (key: string) => {
    setVisibleColumnKeys((current) => current.includes(key)
      ? current.filter((column) => column !== key)
      : [...current, key]);
  };

  const addInvoiceLine = (selectedProduct?: ErpRecord) => {
    const product = selectedProduct ?? products[0];
    if (!product) {
      setMessage("أضف صنفاً من تطبيق المخزون قبل إنشاء الفاتورة.");
      return;
    }
    const isPurchase = activeSection.entity === "purchaseInvoices";
    setInvoiceLines((current) => [...current, {
      productId: String(product.id),
      qty: "1",
      unitPrice: String(Number(isPurchase ? product.unitCost ?? 0 : product.unitPrice ?? 0)),
      discountType: "amount",
      discountValue: "0",
    }]);
  };

  const openProductPreview = (product: ErpRecord) => {
    setPreviewProduct(product);
    setPreviewHistory(null);
    setPreviewError("");
    setPreviewLoading(canViewProductCosts);
  };

  const updateInvoiceLine = (index: number, patch: Partial<InvoiceLine>) => {
    setInvoiceLines((current) => current.map((line, currentIndex) => {
      if (currentIndex !== index) return line;
      const next = { ...line, ...patch };
      if (patch.productId) {
        const product = products.find((candidate) => candidate.id === patch.productId);
        if (product) {
          const isPurchase = activeSection.entity === "purchaseInvoices";
          next.unitPrice = String(Number(isPurchase ? product.unitCost ?? 0 : product.unitPrice ?? 0));
        }
      }
      return next;
    }));
  };

  const editRecord = (record: ErpRecord) => {
    const nextForm = Object.fromEntries(activeSection.fields.map((field) => [
      field.key,
      record[field.key] === undefined || record[field.key] === null ? "" : String(record[field.key]),
    ]));
    setForm(nextForm);
    setEditingId(record.id);
    setStockRefreshMessage("");
    setEditingTaxMode(String(record.taxCalculation ?? ""));
    setInvoiceDiscountType(record.invoiceDiscountType === "percent" ? "percent" : "amount");
    setInvoiceDiscountValue(String(record.invoiceDiscountValue ?? "0"));
    setPartnerId(String(record[activeSection.invoiceParty?.idField ?? ""] ?? ""));
    setPartnerSearch("");
    setProductSearch("");
    setProductGroup("all");
    setProductSearchError("");

    if (activeSection.invoiceParty) {
      const rawItems = Array.isArray(record.items) ? record.items : [];
      setInvoiceLines(rawItems.map((rawItem) => {
        const item = typeof rawItem === "object" && rawItem !== null ? rawItem as Record<string, unknown> : {};
        const product = products.find((candidate) =>
          candidate.id === item.productId || candidate.sku === item.sku || candidate.barcode === item.barcode
        );
        return {
          productId: String(product?.id ?? item.productId ?? ""),
          qty: String(item.qty ?? item.quantity ?? 1),
          unitPrice: String(item.unitPrice ?? item.price ?? 0),
          discountType: item.discountType === "percent" ? "percent" : "amount",
          discountValue: String(item.discountValue ?? "0"),
        };
      }));
    } else {
      setInvoiceLines([]);
    }

    setIsFormOpen(true);
    setMessage(`تعديل ${activeSection.singular}.`);
  };

  const refreshInvoiceStock = async () => {
    setStockRefreshLoading(true);
    setStockRefreshMessage("");
    try {
      setProducts(await fetchEntity("products"));
      setStockRefreshMessage("تم تحديث الأرصدة المعروضة.");
    } catch (error) {
      setStockRefreshMessage(error instanceof Error ? `تعذر تحديث الأرصدة: ${error.message}` : "تعذر تحديث الأرصدة.");
    } finally {
      setStockRefreshLoading(false);
    }
  };

  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    try {
      const payload: Record<string, unknown> = {};
      for (const field of activeSection.fields) {
        if (activeSection.invoiceParty && field.key === "status") continue;
        if (activeSection.entity === "products" && field.key === "unitCost" && !canViewProductCosts) continue;
        const value = form[field.key] ?? "";
        if (value === "") continue;
        payload[field.key] = field.type === "number" ? Number(value) : value;
      }

      if (activeSection.invoiceParty) {
        payload.status = "draft";
        const partner = partners.find((item) => item.id === partnerId);
        if (!partner) throw new Error(`اختر ${activeSection.invoiceParty.label} قبل حفظ الفاتورة.`);
        if (invoiceLines.length === 0) throw new Error("أضف صنفاً واحداً على الأقل إلى الفاتورة.");

        payload[activeSection.invoiceParty.idField] = partnerId;
        payload[activeSection.invoiceParty.nameField] = String(partner.name ?? partner.company ?? "");
        payload.items = invoiceLines.map((line) => {
          const product = products.find((item) => item.id === line.productId);
          const quantity = Number(line.qty);
          const unitPrice = Number(line.unitPrice);
          if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error("تحقق من الصنف والكمية والسعر في كل بند.");
          }
          return {
            productId: String(product.id),
            productName: String(product.name ?? ""),
            sku: String(product.sku ?? ""),
            barcode: String(product.barcode ?? ""),
            group: String(product.group ?? ""),
            category: String(product.category ?? ""),
            qty: useSalesVat ? line.qty : quantity,
            unitPrice: useSalesVat ? line.unitPrice : unitPrice,
            ...(useDiscounts ? { discountType: line.discountType, discountValue: line.discountValue } : {}),
            amount: quantity * unitPrice,
          };
        });
        if (useSalesVat) {
          if (!salesTotals.value) throw new Error(salesTotals.error || "تحقق من بنود الفاتورة.");
          payload.taxCalculation = useDiscounts ? SALES_DISCOUNT_VAT_MODE : SALES_VAT_MODE;
          if (useDiscounts) {
            payload.invoiceDiscountType = invoiceDiscountType;
            payload.invoiceDiscountValue = invoiceDiscountValue;
          }
          payload.amount = salesTotals.value.amount;
        } else {
          payload.amount = invoiceTotal;
        }
      }

      const savedResult = await requestJson("/api/erp", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: activeSection.entity, id: editingId, data: payload }),
      });
      setIsFormOpen(false);
      setEditingId(null);
      if (activeSection.invoiceParty) {
        const savedData = savedResult.data;
        const invoiceId = editingId ?? (
          typeof savedData === "object" && savedData !== null && "id" in savedData
            ? String(savedData.id)
            : ""
        );
        if (!invoiceId) throw new Error("تم حفظ الفاتورة، لكن تعذر تحديدها للترحيل التلقائي.");

        try {
          await requestJson("/api/erp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "postInvoice", entity: activeSection.entity, id: invoiceId }),
          });
        } catch (postingError) {
          await reloadRecords();
          setMessage(`تم حفظ الفاتورة كمسودة، لكن لم يتم تحديث المخزون: ${postingError instanceof Error ? postingError.message : "تعذر الترحيل."}`);
          return;
        }

        try {
          const nextRecords = await fetchSectionRecords(activeSection);
          setRecords(nextRecords);
          if (hasErpPermission(user, "products", "view")) {
            setProducts(await fetchEntity("products"));
          }
          setMessage("تم حفظ الفاتورة وترحيلها تلقائياً، وتم تحديث المخزون.");
        } catch (refreshError) {
          setMessage(`تم ترحيل الفاتورة وتحديث المخزون، لكن تعذر تحديث العرض: ${refreshError instanceof Error ? refreshError.message : "خطأ غير معروف."}`);
        }
      } else {
        setMessage(editingId ? "تم تحديث السجل بنجاح." : "تم حفظ السجل بنجاح.");
        await reloadRecords();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حفظ السجل.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRecord = async (record: ErpRecord) => {
    const label = String(record.reference ?? record.name ?? record.id);
    if (!window.confirm(`هل تريد حذف "${label}"؟`)) return;
    try {
      const result = await requestJson("/api/erp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: activeSection.entity, id: record.id }),
      });
      setMessage(result.message ?? "تم حذف السجل.");
      await reloadRecords();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر حذف السجل.");
    }
  };

  const postInvoice = async (record: ErpRecord) => {
    try {
      const result = await requestJson("/api/erp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "postInvoice", entity: activeSection.entity, id: record.id }),
      });
      const [nextRecords, nextProducts] = await Promise.all([
        fetchSectionRecords(activeSection),
        fetchEntity("products"),
      ]);
      setRecords(nextRecords);
      setProducts(nextProducts);
      setMessage(result.message ?? "تم ترحيل الفاتورة وتحديث المخزون.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر ترحيل الفاتورة.");
    }
  };

  return (
    <ErpShell>
      <div className={`erp-module-page tone-${moduleDefinition.color}${activeSection.view === "statement" ? " print-statement" : ""}${isCustomerManagement ? " crm-customer-management" : ""}`}>
        <div className="erp-module-hero">
          <div className="erp-module-heading">
            <div className="erp-module-icon" aria-hidden="true">{moduleDefinition.icon}</div>
            <div>
              <span className="eyebrow dark">تطبيق الأعمال</span>
              <h1>{moduleDefinition.label}</h1>
              <p>{moduleDefinition.description}</p>
            </div>
          </div>
          {activeSection.view !== "statement" && canCreate && (
            <button type="button" className="primary-button" onClick={() => openNewForm()}>
              <span aria-hidden="true">＋</span> إنشاء {activeSection.singular}
            </button>
          )}
        </div>

        {customerStatusCounts ? (
          <div className="erp-module-stats crm-customer-stats" aria-label="ملخص العملاء">
            {([
              ["all", "إجمالي العملاء"],
              ["active", "عملاء نشطون"],
              ["inactive", "عملاء غير نشطين"],
              ["on_hold", "عملاء موقوفون"],
            ] as const).map(([status, label]) => (
              <button
                type="button"
                className={`module-stat crm-customer-stat${statusFilter === status ? " is-selected" : ""}`}
                aria-pressed={statusFilter === status}
                key={status}
                onClick={() => { setStatusFilter(status); setCurrentPage(0); }}
              >
                <span>{label}</span>
                <strong>{customerStatusCounts[status]}</strong>
                <small>{status === "all" ? "اضغط لعرض القائمة كاملة" : "اضغط لتصفية القائمة"}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="erp-module-stats">
            <article className="module-stat">
              <span>السجلات في هذا القسم</span>
              <strong>{records.length}</strong>
              <small>{activeSection.label}</small>
            </article>
            <article className="module-stat">
              <span>مسودات</span>
              <strong>{records.filter((record) => (record.status ?? "draft") === "draft").length}</strong>
              <small>جاهزة للمراجعة</small>
            </article>
            <article className="module-stat">
              <span>معتمدة أو مرحّلة</span>
              <strong>{records.filter((record) => ["approved", "posted"].includes(String(record.status))).length}</strong>
              <small>ضمن السجلات الحالية</small>
            </article>
            <article className="module-stat">
              <span>إجمالي المبالغ</span>
              <strong>{moneyFormatter.format(amountTotal)}</strong>
              <small>من البيانات المحفوظة</small>
            </article>
          </div>
        )}

        <section className="erp-module-panel" aria-label={`أقسام ${moduleDefinition.label}`}>
          <div className="erp-module-tabs" role="tablist" aria-label="أقسام التطبيق">
            {moduleDefinition.sections.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={item.entity === activeSection.entity}
                className={item.entity === activeSection.entity ? "erp-module-tab active" : "erp-module-tab"}
                key={item.entity}
                onClick={() => changeSection(item)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="erp-record-toolbar">
            <div>
              <h2>{activeSection.label}</h2>
              <p>{isCustomerManagement
                ? `${visibleRecords.length} عميل في النتائج · افتح ملف العميل لعرض معاملاته وكشف حسابه.`
                : "السجلات محفوظة في قاعدة بيانات النظام ويمكن استرجاعها وتحديثها."}</p>
            </div>
            <div className="erp-record-actions">
              <label className="erp-record-search">
                <span className="sr-only">ابحث في {activeSection.label}</span>
                <input
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setCurrentPage(0); }}
                  placeholder={isCustomerManagement ? "ابحث بالاسم أو الجوال أو البريد أو المدينة..." : activeSection.entity === "salesInvoices" ? "ابحث أو امسح باركود مرجع الفاتورة..." : "بحث في السجلات..."}
                />
              </label>
              <label>
                <span className="sr-only">تصفية حسب الحالة</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">كل الحالات</option>
                  {statusOptions.map((status) => <option value={status} key={status}>{statusLabels[status] ?? status}</option>)}
                </select>
              </label>
              {activeSection.view === "statement" && (
                <>
                  <label>
                    <span className="sr-only">الحساب</span>
                    <select value={selectedAccount} onChange={(event) => setSelectedAccount(event.target.value)}>
                      <option value="all">كل الحسابات</option>
                      {accounts.map((account) => (
                        <option value={account.id} key={account.id}>
                          {String(account.code ?? "")} {String(account.name ?? account.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="erp-date-filter">
                    <span className="sr-only">من تاريخ</span>
                    <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                  </label>
                  <label className="erp-date-filter">
                    <span className="sr-only">إلى تاريخ</span>
                    <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                  </label>
                  {canPrint && <button type="button" className="ghost-button small print-hide" onClick={() => window.print()}>طباعة / PDF</button>}
                </>
              )}
              <div className="erp-view-toggle" aria-label="طريقة عرض السجلات">
                <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")}>قائمة</button>
                <button type="button" className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>بطاقات</button>
              </div>
              <details className="erp-columns-menu print-hide">
                <summary>الأعمدة</summary>
                <div className="erp-columns-options">
                  {activeSection.listFields.map((field) => (
                    <label key={field.key}>
                      <input
                        type="checkbox"
                        checked={visibleColumnKeys.includes(field.key)}
                        onChange={() => toggleColumn(field.key)}
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              </details>
              {canExport && (
                <button
                  type="button"
                  className="ghost-button small print-hide"
                  onClick={() => downloadCsv(sortedRecords, activeSection.listFields.filter((field) => visibleColumnKeys.includes(field.key)), activeSection.entity)}
                  disabled={visibleColumnKeys.length === 0 || sortedRecords.length === 0}
                >
                  تصدير CSV
                </button>
              )}
              <button type="button" className="ghost-button small print-hide" onClick={() => void reloadRecords()}>تحديث</button>
            </div>
          </div>

          {activeSection.view === "statement" && (
            <p className="erp-statement-note">
              الكشف يجمع القيود والفواتير والسندات والتحويلات والإيرادات والمصروفات المحفوظة.
              اختيار حساب محدد يعرض فقط المعاملات المرتبطة به في بياناتها.
            </p>
          )}

          {message && <p className="erp-message" role="status">{message}</p>}

          {isLoading ? (
            <div className="erp-empty-state" role="status">جارٍ تحميل السجلات...</div>
          ) : visibleRecords.length === 0 ? (
            <div className="erp-empty-state">
              <span className="erp-empty-icon" aria-hidden="true">{moduleDefinition.icon}</span>
              <h3>{search || statusFilter !== "all" ? "لا توجد نتائج مطابقة" : `لا توجد ${activeSection.label} بعد`}</h3>
              <p>{search || statusFilter !== "all" ? "غيّر كلمات البحث أو عامل التصفية." : `ابدأ بإنشاء أول ${activeSection.singular} في هذا التطبيق.`}</p>
              {!search && statusFilter === "all" && activeSection.view !== "statement" && canCreate && (
                <button type="button" className="primary-button" onClick={() => openNewForm()}>
                  إنشاء {activeSection.singular}
                </button>
              )}
            </div>
          ) : view === "list" ? (
            <div className="erp-table-wrap">
              <table className="erp-table erp-module-table">
                <thead>
                  <tr>
                    {activeSection.listFields.filter((field) => visibleColumnKeys.includes(field.key)).map((field) => (
                      <th
                        key={field.key}
                        aria-sort={sort.key === field.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"}
                      >
                        <button type="button" className="erp-sort-button" onClick={() => changeSort(field.key)}>
                          {field.label}
                          <span aria-hidden="true">{sort.key === field.key ? sort.direction === "asc" ? " ↑" : " ↓" : " ↕"}</span>
                        </button>
                      </th>
                    ))}
                    {activeSection.view !== "statement" && (canPrint || canPost || canEdit || canDelete) && <th className="print-hide">الإجراءات</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageRecords.map((record) => (
                    <tr key={record.id}>
                      {activeSection.listFields.filter((field) => visibleColumnKeys.includes(field.key)).map((field) => (
                        <td key={field.key}>
                          {activeSection.entity === "customers" && field.key === "name"
                            ? <Link className="customer-record-link" href={`/crm/${encodeURIComponent(record.id)}`}>{formatCell(field.key, record[field.key])}</Link>
                            : field.key === "status"
                              ? <span className={`status-pill status-${String(record.status ?? "draft")}`}>{formatCell(field.key, record[field.key] ?? "draft")}</span>
                              : formatCell(field.key, record[field.key])}
                        </td>
                      ))}
                      {activeSection.view !== "statement" && (canPrint || canPost || canEdit || canDelete) && <td className="print-hide">
                        <div className="erp-row-actions">
                          {activeSection.invoiceParty && canPrint && (
                            <Link className="invoice-open-link" href={`/invoices/${activeSection.entity}/${encodeURIComponent(record.id)}`}>
                              عرض / PDF
                            </Link>
                          )}
                          {activeSection.invoiceParty && canPost && ["draft", "approved"].includes(String(record.status ?? "draft")) && (
                            <button type="button" onClick={() => void postInvoice(record)}>ترحيل وتحديث المخزون</button>
                          )}
                          {canEdit && record.status !== "posted" && (
                            <button type="button" onClick={() => editRecord(record)}>تعديل</button>
                          )}
                          {canDelete && <button type="button" className="danger" onClick={() => void deleteRecord(record)}>حذف</button>}
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="erp-record-cards">
              {pageRecords.map((record) => (
                <article className="erp-record-card" key={record.id}>
                  <div className="erp-record-card-head">
                    <strong>
                      {activeSection.entity === "customers" && record.name
                        ? <Link className="customer-record-link" href={`/crm/${encodeURIComponent(record.id)}`}>{String(record.name)}</Link>
                        : String(record.reference ?? record.name ?? record.employeeNumber ?? record.id)}
                    </strong>
                    <span className={`status-pill status-${String(record.status ?? "draft")}`}>{formatCell("status", record.status ?? "draft")}</span>
                  </div>
                  {activeSection.listFields.filter((field) => visibleColumnKeys.includes(field.key) && !["reference", "name", "status"].includes(field.key)).slice(0, 4).map((field) => (
                    <div className="erp-record-card-line" key={field.key}>
                      <span>{field.label}</span>
                      <strong>{formatCell(field.key, record[field.key])}</strong>
                    </div>
                  ))}
                  {activeSection.view !== "statement" && <div className="erp-row-actions">
                    {isCustomerManagement && (
                      <Link className="invoice-open-link" href={`/crm/${encodeURIComponent(record.id)}`}>فتح ملف العميل</Link>
                    )}
                    {activeSection.invoiceParty && canPrint && <Link className="invoice-open-link" href={`/invoices/${activeSection.entity}/${encodeURIComponent(record.id)}`}>عرض / PDF</Link>}
                    {canEdit && record.status !== "posted" && <button type="button" onClick={() => editRecord(record)}>تعديل</button>}
                    {canDelete && <button type="button" className="danger" onClick={() => void deleteRecord(record)}>حذف</button>}
                  </div>}
                </article>
              ))}
            </div>
          )}

          {!isLoading && sortedRecords.length > pageSize && (
            <nav className="erp-pagination" aria-label="التنقل بين صفحات السجلات">
              <span>{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sortedRecords.length)} من {sortedRecords.length}</span>
              <div>
                <button type="button" className="ghost-button small" onClick={() => setCurrentPage((page) => Math.max(0, page - 1))} disabled={safePage === 0}>
                  السابق
                </button>
                <span>صفحة {safePage + 1} من {pageCount}</span>
                <button type="button" className="ghost-button small" onClick={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))} disabled={safePage >= pageCount - 1}>
                  التالي
                </button>
              </div>
            </nav>
          )}
        </section>

        {isFormOpen && (
          <div className="erp-modal-backdrop" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsFormOpen(false);
          }}>
            <section
              className={`erp-module-modal${activeSection.invoiceParty ? " is-invoice-form" : ""}${activeSection.entity === "products" ? " is-product-form" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="erp-form-title"
            >
              <div className="erp-modal-header">
                <div>
                  <span className="eyebrow dark">{moduleDefinition.label}</span>
                  <h2 id="erp-form-title">{editingId ? `تعديل ${activeSection.singular}` : `إنشاء ${activeSection.singular}`}</h2>
                  <p>{activeSection.invoiceParty
                    ? "أكمل بيانات الفاتورة وأضف الأصناف؛ عند الحفظ ستُرحّل الفاتورة تلقائياً ويُحدّث المخزون."
                    : activeSection.entity === "products"
                      ? "أضف بيانات واضحة للصنف لتسهيل استخدامه في الفواتير."
                      : `املأ الحقول المطلوبة لحفظ ${activeSection.singular} في النظام.`}</p>
                </div>
                <button type="button" className="erp-modal-close" onClick={() => setIsFormOpen(false)} aria-label="إغلاق النموذج">×</button>
              </div>

              <form className="erp-module-form" onSubmit={saveRecord}>
                {activeSection.entity === "salesInvoices" && (
                  <section className="sales-review-panel" aria-labelledby="invoice-review-heading">
                    <div className="sales-review-heading">
                      <div><h3 id="invoice-review-heading">مراجعة الفاتورة قبل الحفظ</h3><p>معاينة مؤقتة لا تحفظ الفاتورة ولا تحجز المخزون.</p></div>
                      <button type="button" className="ghost-button small" onClick={() => void refreshInvoiceStock()} disabled={stockRefreshLoading}>
                        {stockRefreshLoading ? "جارٍ التحديث..." : "تحديث المخزون"}
                      </button>
                    </div>
                    {stockRefreshMessage && <p className="sales-review-feedback" role="status">{stockRefreshMessage}</p>}
                    <div className="sales-review-checks">
                      {!selectedPartner && <p>اختر العميل.</p>}
                      {!form.reference?.trim() && <p>أدخل مرجع الفاتورة.</p>}
                      {!form.date && <p>أدخل تاريخ الفاتورة.</p>}
                      {invoiceLines.length === 0 && <p>أضف صنفاً واحداً على الأقل.</p>}
                      {invalidPreviewLines && <p>تحقق من الصنف والكمية وسعر الوحدة لكل بند.</p>}
                      {salesTotals.error && <p>{salesTotals.error}</p>}
                      {stockIssues.map((issue, index) => <p key={`${index}-${issue}`}>{issue}</p>)}
                      {stockIssues.length > 0 && <p>قد يُحفظ المستند كمسودة إذا فشل الترحيل؛ يُتحقق من الرصيد مرة أخرى عند الترحيل.</p>}
                    </div>
                    <p className="sales-review-note">الأرصدة المعروضة استرشادية وقد تتغير قبل الترحيل. الحفظ يحاول ترحيل الفاتورة وتحديث المخزون تلقائياً.</p>
                    <details className="sales-invoice-preview">
                      <summary>معاينة تفاصيل الفاتورة</summary>
                      <div className="sales-invoice-preview-content">
                        <dl className="sales-preview-facts">
                          <div><dt>العميل</dt><dd>{selectedPartner ? String(selectedPartner.name ?? selectedPartner.company ?? "—") : "لم يُحدد"}</dd></div>
                          <div><dt>المرجع</dt><dd dir="auto">{form.reference || "لم يُحدد"}</dd></div>
                          <div><dt>التاريخ</dt><dd>{form.date || "لم يُحدد"}</dd></div>
                        </dl>
                        <div className="sales-invoice-preview-table">
                          <table>
                            <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>{useSalesVat ? "بعد الخصم وقبل الضريبة" : "إجمالي البند"}</th>{useSalesVat && <><th>الضريبة</th><th>بعد الضريبة</th></>}</tr></thead>
                            <tbody>
                              {invoiceLines.map((line, index) => {
                                const product = products.find((candidate) => candidate.id === line.productId);
                                const taxLine = salesTotals.value?.items[index];
                                const discountLine = salesTotals.discountValue?.items[index];
                                const validLegacyLine = line.qty.trim() && line.unitPrice.trim()
                                  && Number.isFinite(Number(line.qty)) && Number(line.qty) > 0
                                  && Number.isFinite(Number(line.unitPrice)) && Number(line.unitPrice) >= 0;
                                return <tr key={`${index}-${line.productId}`}>
                                  <td>{String(product?.name ?? "الصنف غير موجود")}{discountLine && <small>خصم الصنف: {moneyFormatter.format(discountLine.lineDiscountAmount)}<br />نصيب خصم الفاتورة: {moneyFormatter.format(discountLine.invoiceDiscountShare)}</small>}</td>
                                  <td>{line.qty || "—"}</td>
                                  <td>{line.unitPrice.trim() && Number.isFinite(Number(line.unitPrice)) ? moneyFormatter.format(Number(line.unitPrice)) : "—"}</td>
                                  <td>{useSalesVat ? taxLine ? moneyFormatter.format(taxLine.amount) : "—" : validLegacyLine ? moneyFormatter.format(Number(line.qty) * Number(line.unitPrice)) : "—"}</td>
                                  {useSalesVat && <><td>{taxLine ? moneyFormatter.format(taxLine.taxAmount) : "—"}</td><td>{taxLine ? moneyFormatter.format(taxLine.totalWithTax) : "—"}</td></>}
                                </tr>;
                              })}
                            </tbody>
                          </table>
                          {invoiceLines.length === 0 && <p>لا توجد بنود للمعاينة.</p>}
                        </div>
                        {salesTotals.discountValue && <p>قبل الخصومات: {moneyFormatter.format(salesTotals.discountValue.grossAmount)} · خصومات الأصناف: {moneyFormatter.format(salesTotals.discountValue.lineDiscountAmount)} · خصم الفاتورة: {moneyFormatter.format(salesTotals.discountValue.invoiceDiscountAmount)}</p>}
                        {salesTotals.value && <p>المجموع قبل الضريبة: {moneyFormatter.format(salesTotals.value.subtotal)} · الضريبة: {moneyFormatter.format(salesTotals.value.taxAmount)}</p>}
                        {!useSalesVat && <p>فاتورة سابقة بلا احتساب ضريبة في هذا النموذج.</p>}
                        <p><strong>الإجمالي {previewTotal === undefined ? "غير متاح حتى تصحيح البنود" : moneyFormatter.format(previewTotal)}</strong></p>
                        <p>هذه معاينة غير محفوظة وليست فاتورة إلكترونية معتمدة.</p>
                      </div>
                    </details>
                  </section>
                )}
                {activeSection.invoiceParty && (
                  <>
                    <div className="erp-form-card invoice-party-card">
                      <div className="erp-form-card-heading">
                        <span className="erp-form-step">01</span>
                        <div>
                          <h3>الطرف والتاريخ</h3>
                          <p>حدد {activeSection.invoiceParty.label} المسؤول عن هذه الفاتورة.</p>
                        </div>
                      </div>
                      <div className="erp-form-grid">
                        <div className="erp-field invoice-partner-picker">
                          <label htmlFor="invoice-partner-search">البحث عن {activeSection.invoiceParty.label}</label>
                          <input id="invoice-partner-search" type="search" value={partnerSearch}
                            placeholder="الاسم، الهاتف، الرقم الضريبي أو البريد"
                            onChange={(event) => setPartnerSearch(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                            aria-describedby="invoice-partner-search-help" />
                          <small id="invoice-partner-search-help" role="status">
                            {matchingPartners.length === 0 ? "لا توجد نتائج مطابقة." : `${matchingPartners.length} نتيجة${matchingPartners.length > 50 ? "؛ تظهر أول ٥٠، ضيّق البحث للمزيد" : ""}.`}
                            {" "}البحث لا يغيّر الطرف المحدد حتى تختار من القائمة.
                          </small>
                          {partnerSearch.trim() && matchingPartners.length > 0 && <div className="invoice-partner-results" role="group" aria-label={`نتائج بحث ${activeSection.invoiceParty.label}`}>
                            {matchingPartners.slice(0, 6).map((partner) => <button type="button" key={partner.id} className={partner.id === partnerId ? "is-selected" : ""} aria-pressed={partner.id === partnerId} onClick={() => setPartnerId(partner.id)}>
                              <strong>{String(partner.name ?? partner.company ?? partner.id)}</strong>
                              <small>{[partner.phone, partner.email, partner.city].filter(Boolean).map(String).join(" · ") || "لا توجد بيانات تواصل إضافية"}</small>
                            </button>)}
                            {matchingPartners.length > 6 && <small>تظهر أول ٦ نتائج هنا؛ يمكنك تضييق البحث أو استخدام القائمة أدناه.</small>}
                          </div>}
                          <label htmlFor="invoice-partner-select">{activeSection.invoiceParty.label} <b>*</b></label>
                          <select id="invoice-partner-select" value={partnerId} onChange={(event) => setPartnerId(event.target.value)} required>
                            <option value="">اختر {activeSection.invoiceParty.label}</option>
                            {partnerOptions.map((partner) => (
                              <option key={partner.id} value={partner.id}>{String(partner.name ?? partner.company ?? partner.id)}</option>
                            ))}
                          </select>
                          {partnerId && !selectedPartner && <small role="alert">الطرف المسجل غير متاح؛ اختر طرفاً موجوداً قبل الحفظ.</small>}
                          {selectedPartner && <div className="invoice-partner-selected">
                            <strong>{String(selectedPartner.name ?? selectedPartner.company ?? selectedPartner.id)}</strong>
                            <span>{[selectedPartner.phone, selectedPartner.email, selectedPartner.taxNumber ? `الرقم الضريبي: ${String(selectedPartner.taxNumber)}` : "", selectedPartner.city].filter(Boolean).map(String).join(" · ") || "لا توجد بيانات تواصل إضافية مسجلة."}</span>
                          </div>}
                          {partners.length === 0 && (
                            <small>
                              لا توجد سجلات لهذا الطرف. أنشئه من
                              {" "}<Link href={activeSection.invoiceParty.entity === "customers" ? "/sales" : "/procurement"}>تطبيق {activeSection.invoiceParty.entity === "customers" ? "المبيعات" : "المشتريات"}</Link>
                              {" "}ثم عد إلى الفاتورة.
                            </small>
                          )}
                        </div>
                        {activeSection.fields.filter((field) => ["reference", "date"].includes(field.key)).map((field) => (
                          <label className="erp-field" htmlFor={`field-${field.key}`} key={field.key}>
                            <span>{field.label}{field.required && <b> *</b>}</span>
                            <FieldInput
                              field={field}
                              value={form[field.key] ?? ""}
                              onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="erp-invoice-lines">
                      <div className="erp-invoice-lines-head">
                        <div>
                          <span className="erp-form-step">02</span>
                          <div>
                            <strong>أصناف الفاتورة</strong>
                            <span>{invoiceLines.length} {invoiceLines.length === 1 ? "بند" : "بنود"}</span>
                          </div>
                        </div>
                        {activeSection.entity !== "salesInvoices" && <button type="button" className="ghost-button small" onClick={() => addInvoiceLine()} disabled={products.length === 0}>إضافة صنف</button>}
                      </div>
                      {activeSection.invoiceParty && products.length > 0 && (
                        <div className="sales-product-search">
                          <div className="sales-product-search-fields">
                            <label>
                              <span>البحث أو مسح الباركود</span>
                              <input
                                value={productSearch}
                                placeholder="اسم الصنف، الباركود، SKU أو التصنيف"
                                onChange={(event) => { setProductSearch(event.target.value); setProductSearchError(""); }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter") return;
                                  event.preventDefault();
                                  const query = productSearch.trim().toLocaleLowerCase();
                                  const exact = products.filter((product) =>
                                    [product.barcode, product.sku].some((value) => String(value ?? "").toLocaleLowerCase() === query));
                                  if (query && exact.length === 1) {
                                    addInvoiceLine(exact[0]);
                                    setProductSearch("");
                                    setProductSearchError("");
                                  } else {
                                    setProductSearchError("اختر الصنف من النتائج، أو أدخل باركوداً مطابقاً وفريداً.");
                                  }
                                }}
                              />
                            </label>
                            <label>
                              <span>المجموعة</span>
                              <select value={productGroup} onChange={(event) => setProductGroup(event.target.value)}>
                                <option value="all">كل المجموعات</option>
                                {productGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                              </select>
                            </label>
                          </div>
                          {productSearchError && <p className="sales-tax-notice" role="alert">{productSearchError}</p>}
                          {!productSearch.trim() ? <p className="sales-search-hint">اكتب اسم الصنف أو الرمز أو الباركود لإظهار النتائج.</p> : <div className="sales-product-results">
                            {matchingProducts.map((product) => (
                              <div className="sales-product-result" key={product.id}>
                                <div><strong>{String(product.name ?? product.id)}</strong><small>{String(product.sku ?? "—")} · {String(product.barcode ?? "—")} · {String(product.group || "بدون مجموعة")} · {String(product.category || "بدون تصنيف")}</small></div>
                                {activeSection.entity === "salesInvoices" && <span><small>سعر البيع</small><br />{formatCell("unitPrice", product.unitPrice)}</span>}
                                {canViewProductCosts && <span><small>التكلفة</small><br />{formatCell("unitCost", product.unitCost)}</span>}
                                <span><small>المتوفر</small><br />{String(product.stockQty ?? "—")}</span>
                                {useSalesVat && <span><small>الضريبة</small><br />١٥٪</span>}
                                <button type="button" className="ghost-button small" onClick={() => openProductPreview(product)}>معاينة</button>
                                <button type="button" className="primary-button small" onClick={() => { addInvoiceLine(product); setProductSearch(""); }}>إضافة</button>
                              </div>
                            ))}
                            {matchingProducts.length === 0 && <p>لا توجد أصناف مطابقة.</p>}
                            {matchingProducts.length === 20 && <p>تظهر أول ٢٠ نتيجة؛ ضيّق البحث للوصول إلى صنفك.</p>}
                          </div>}
                        </div>
                      )}
                      {products.length === 0 ? (
                        <div className="erp-invoice-empty">
                          <span aria-hidden="true">▦</span>
                          <div>
                            <strong>لا توجد أصناف للاختيار</strong>
                            <p>أضف الأصناف أولاً من تطبيق المخزون ثم ارجع لإكمال الفاتورة.</p>
                          </div>
                          <Link href="/inventory" className="ghost-button small">فتح المخزون</Link>
                        </div>
                      ) : invoiceLines.length === 0 ? (
                        <div className="erp-invoice-empty">
                          <span aria-hidden="true">＋</span>
                          <div>
                            <strong>ابدأ بإضافة صنف للفاتورة</strong>
                            <p>سيُحسب إجمالي البنود تلقائياً أثناء إدخال الكمية والسعر.</p>
                          </div>
                          {activeSection.entity !== "salesInvoices" && <button type="button" className="ghost-button small" onClick={() => addInvoiceLine()}>إضافة أول صنف</button>}
                        </div>
                      ) : (
                        <div className="erp-invoice-items">
                          {invoiceLines.map((line, index) => {
                            const product = products.find((candidate) => candidate.id === line.productId);
                            const quantity = Number(line.qty);
                            const unitPrice = Number(line.unitPrice);
                            const lineTotal = Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0;
                            const taxLine = salesTotals.value?.items[index];
                            const discountLine = salesTotals.discountValue?.items[index];
                            return (
                              <article className="erp-invoice-item-card" key={`${index}-${line.productId}`}>
                                <span className="erp-invoice-item-index">{String(index + 1).padStart(2, "0")}</span>
                                <div className="erp-invoice-line">
                                  {activeSection.entity === "salesInvoices" ? <div className="sales-line-product">
                                    <span>الصنف</span>
                                    <strong>{String(product?.name ?? "الصنف غير موجود")}</strong>
                                    {product && <small>{String(product.sku ?? "—")} · {String(product.group || "بدون مجموعة")} · {String(product.category || "بدون تصنيف")}</small>}
                                    {product && <button type="button" className="sales-preview-link" onClick={() => openProductPreview(product)}>معاينة بيانات الصنف</button>}
                                  </div> : <label>
                                    <span>الصنف</span>
                                    <select value={line.productId} onChange={(event) => updateInvoiceLine(index, { productId: event.target.value })} required>
                                      {products.map((item) => <option key={item.id} value={item.id}>{String(item.name ?? item.sku ?? item.id)}</option>)}
                                    </select>
                                    {product && <small>SKU: {String(product.sku ?? "—")} · الباركود: {String(product.barcode ?? "—")} · المجموعة: {String(product.group || "—")} · التصنيف: {String(product.category || "—")} · الرصيد: {String(product.stockQty ?? "—")}</small>}
                                  </label>}
                                  <label>
                                    <span>الكمية</span>
                                    <input type="number" min="0.001" step={useSalesVat ? "0.001" : "any"} value={line.qty} onChange={(event) => updateInvoiceLine(index, { qty: event.target.value })} required />
                                  </label>
                                  <label>
                                    <span>{useSalesVat ? "سعر البيع قبل الضريبة" : "سعر الوحدة"}</span>
                                    <input type="number" min="0" step={useSalesVat ? "0.01" : "any"} value={line.unitPrice} onChange={(event) => updateInvoiceLine(index, { unitPrice: event.target.value })} required />
                                  </label>
                                  <button type="button" className="erp-line-remove" onClick={() => setInvoiceLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label={`حذف البند ${index + 1}`}>×</button>
                                </div>
                                {useDiscounts && <div className="sales-discount-fields">
                                  <label><span>نوع خصم الصنف</span><select value={line.discountType} onChange={(event) => updateInvoiceLine(index, { discountType: event.target.value === "percent" ? "percent" : "amount" })}><option value="amount">مبلغ بالريال</option><option value="percent">نسبة مئوية</option></select></label>
                                  <label><span>قيمة خصم الصنف</span><input type="number" min="0" step="0.01" value={line.discountValue} onChange={(event) => updateInvoiceLine(index, { discountValue: event.target.value })} required /></label>
                                </div>}
                                <div className="erp-invoice-item-total">
                                  {product && canViewProductCosts && activeSection.entity === "salesInvoices" && <span>تكلفة الوحدة: {formatCell("unitCost", product.unitCost)}</span>}
                                  {discountLine && <span>خصم الصنف: {formatCell("amount", discountLine.lineDiscountAmount)} · نصيب خصم الفاتورة: {formatCell("amount", discountLine.invoiceDiscountShare)}</span>}
                                  <span>{useSalesVat ? "قبل الضريبة" : "إجمالي البند"}: {useSalesVat ? taxLine ? formatCell("amount", taxLine.amount) : "—" : moneyFormatter.format(lineTotal)}</span>
                                  {useSalesVat && <span>الضريبة ١٥٪: {taxLine ? formatCell("amount", taxLine.taxAmount) : "—"}</span>}
                                  {useSalesVat && <strong>بعد الضريبة: {taxLine ? formatCell("amount", taxLine.totalWithTax) : "—"}</strong>}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                      {useDiscounts && <div className="sales-discount-fields sales-invoice-discount">
                        <label><span>نوع خصم الفاتورة</span><select value={invoiceDiscountType} onChange={(event) => setInvoiceDiscountType(event.target.value === "percent" ? "percent" : "amount")}><option value="amount">مبلغ بالريال</option><option value="percent">نسبة مئوية</option></select></label>
                        <label><span>قيمة خصم الفاتورة</span><input type="number" min="0" step="0.01" value={invoiceDiscountValue} onChange={(event) => setInvoiceDiscountValue(event.target.value)} required /></label>
                        <small>بعد خصومات الأصناف وقبل الضريبة؛ يوزع على البنود بنسبة قيمتها.</small>
                      </div>}
                      {useSalesVat && <div className="sales-invoice-totals" aria-live="polite">
                        {salesTotals.discountValue && <>
                          <div><span>الإجمالي قبل الخصومات</span><strong>{moneyFormatter.format(salesTotals.discountValue.grossAmount)}</strong></div>
                          <div><span>خصومات الأصناف</span><strong>{moneyFormatter.format(salesTotals.discountValue.lineDiscountAmount)}</strong></div>
                          <div><span>خصم الفاتورة</span><strong>{moneyFormatter.format(salesTotals.discountValue.invoiceDiscountAmount)}</strong></div>
                        </>}
                        <div><span>المجموع قبل الضريبة</span><strong>{salesTotals.value ? moneyFormatter.format(salesTotals.value.subtotal) : "—"}</strong></div>
                        <div><span>ضريبة القيمة المضافة ١٥٪</span><strong>{salesTotals.value ? moneyFormatter.format(salesTotals.value.taxAmount) : "—"}</strong></div>
                      </div>}
                      <div className="erp-invoice-total">
                        <span>{useSalesVat ? "الإجمالي بعد الضريبة" : "إجمالي الفاتورة"} <small>({invoiceLines.length} بند)</small></span>
                        <strong>{displayedTotal === undefined ? "—" : moneyFormatter.format(displayedTotal)}</strong>
                      </div>
                      {salesTotals.error && <p className="sales-tax-notice" role="alert">{salesTotals.error} الكمية حتى ٣ منازل وسعر الوحدة حتى منزلتين عشريتين.</p>}
                      {activeSection.entity === "salesInvoices" && <p className="sales-tax-notice">{useSalesVat ? "تُطبّق نسبة ١٥٪ على جميع البنود وتُقرّب ضريبة كل بند لأقرب هللة." : "هذه فاتورة سابقة بلا احتساب ضريبة في هذا النموذج؛ لن تُضاف الضريبة تلقائياً."} لا يُعد هذا المستند فاتورة إلكترونية متوافقة مع متطلبات الهيئة بعد.</p>}
                    </div>
                  </>
                )}

                {formGroups.map((group, groupIndex) => {
                  const sectionFields = activeSection.invoiceParty
                    ? group.fields.filter((field) => !["reference", "date", "status"].includes(field.key))
                    : group.fields;
                  const fields = activeSection.entity === "products" && !canViewProductCosts
                    ? sectionFields.filter((field) => field.key !== "unitCost")
                    : sectionFields;
                  if (fields.length === 0) return null;
                  return (
                    <section className="erp-form-card" key={group.title}>
                      <div className="erp-form-card-heading">
                        {activeSection.invoiceParty && <span className="erp-form-step">{String(groupIndex + 3).padStart(2, "0")}</span>}
                        <div><h3>{group.title}</h3><p>{group.description}</p></div>
                      </div>
                      <div className="erp-form-grid">
                        {fields.map((field) => (
                          <label className={`erp-field ${field.type === "textarea" ? "wide" : ""}`} htmlFor={`field-${field.key}`} key={field.key}>
                            <span>{field.label}{field.required && <b> *</b>}</span>
                            <FieldInput
                              field={field}
                              value={form[field.key] ?? ""}
                              onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                            />
                          </label>
                        ))}
                      </div>
                      {activeSection.entity === "products" && groupIndex === 1 && (
                        <div className="erp-product-live-preview" aria-live="polite">
                          <div><span>سعر البيع</span><strong>{unitPriceValue !== null && Number.isFinite(unitPriceValue) ? moneyFormatter.format(unitPriceValue) : "—"}</strong></div>
                          {canViewProductCosts && <div><span>التكلفة</span><strong>{unitCostValue !== null && Number.isFinite(unitCostValue) ? moneyFormatter.format(unitCostValue) : "—"}</strong></div>}
                          {canViewProductCosts && <div><span>هامش الوحدة</span><strong className={productMargin !== null && productMargin < 0 ? "is-negative" : ""}>{productMargin !== null ? moneyFormatter.format(productMargin) : "—"}</strong></div>}
                          <div><span>الرصيد الافتتاحي</span><strong>{form.stockQty || "—"}</strong></div>
                        </div>
                      )}
                    </section>
                  );
                })}

                {activeSection.invoiceParty && (
                  <div className="erp-invoice-review">
                    <span>ملخص المراجعة</span>
                    <strong>{selectedPartner ? String(selectedPartner.name ?? selectedPartner.company ?? "—") : `اختر ${activeSection.invoiceParty.label}`}</strong>
                    <small>{invoiceLines.length} بند · الإجمالي {displayedTotal === undefined ? "—" : moneyFormatter.format(displayedTotal)}</small>
                  </div>
                )}

                {message && <p className="sales-form-message" role="status">{message}</p>}
                <div className="erp-modal-footer">
                  <button type="button" className="ghost-button" onClick={() => setIsFormOpen(false)}>إلغاء</button>
                  <button type="submit" className="primary-button" disabled={isSaving}>
                    {isSaving ? "جارٍ الحفظ..." : editingId ? "حفظ التعديلات" : "حفظ"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
        {previewProduct && (
          <div className="sales-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewProduct(null); }}>
            <section className="sales-preview" role="dialog" aria-modal="true" aria-labelledby="sales-preview-title">
              <div className="sales-preview-head"><div><span>بطاقة الصنف</span><h2 id="sales-preview-title">{String(previewProduct.name ?? previewProduct.id)}</h2></div><button type="button" onClick={() => setPreviewProduct(null)} aria-label="إغلاق معاينة الصنف">×</button></div>
              <dl className="sales-preview-facts">
                <div><dt>رمز الصنف</dt><dd>{String(previewProduct.sku || "—")}</dd></div>
                <div><dt>الباركود</dt><dd>{String(previewProduct.barcode || "—")}</dd></div>
                <div><dt>المجموعة</dt><dd>{String(previewProduct.group || "—")}</dd></div>
                <div><dt>التصنيف</dt><dd>{String(previewProduct.category || "—")}</dd></div>
                <div><dt>المخزون المسجل</dt><dd>{String(previewProduct.stockQty ?? "—")}</dd></div>
                <div><dt>سعر البيع</dt><dd>{formatCell("unitPrice", previewProduct.unitPrice)}</dd></div>
              </dl>
              {!canViewProductCosts ? <p>لا تتوفر لك صلاحية عرض التكاليف وسجل المشتريات.</p> : previewLoading ? <p role="status">جارٍ تحميل سجل المشتريات...</p> : previewError ? <p role="alert">{previewError}</p> : previewHistory && (
                <>
                  <p><strong>التكلفة المسجلة حالياً:</strong> {formatCell("unitCost", previewHistory.unitCost)}</p>
                  <h3>سجل المشتريات المرحّلة</h3>
                  {previewHistory.history.length === 0 ? <p>لا توجد مشتريات مرحّلة مرتبطة بهذا الصنف.</p> : (
                    <div className="sales-preview-history">
                      {previewHistory.history.map((entry, index) => <div key={`${entry.invoiceId}-${index}`}><strong>{entry.supplier}</strong><span>{entry.reference} · {entry.date || "—"}</span><small>الكمية: {String(entry.quantity ?? "—")} · سعر الوحدة: {formatCell("unitCost", entry.unitCost)}</small></div>)}
                    </div>
                  )}
                  <p className="sales-tax-notice">السجل يعرض المشتريات المرحّلة المرتبطة فقط، ولا يمثل احتساب تكلفة مخزنية أو متوسط تكلفة محاسبياً.</p>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </ErpShell>
  );
}
