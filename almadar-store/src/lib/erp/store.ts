import fs from "fs";
import path from "path";
import { calculateDiscountedSalesVat, calculateSalesVat, isSalesVatMode, SALES_DISCOUNT_VAT_MODE, SALES_VAT_MODE } from "@/lib/erp/sales-tax";

export type OperationEntity =
  | "accounts"
  | "customers"
  | "vendors"
  | "suppliers"
  | "products"
  | "itemGroups"
  | "warehouses"
  | "journalEntries"
  | "salesInvoices"
  | "purchaseInvoices"
  | "cashVouchers"
  | "bankTransfers"
  | "expenses"
  | "revenues"
  | "stockAdjustments"
  | "purchaseOrders"
  | "salesReturns"
  | "purchaseReturns"
  | "costCenters"
  | "openingBalances"
  | "bankingOperations"
  | "fixedAssets"
  | "assetMovements"
  | "maintenanceOrders"
  | "maintenancePlans"
  | "qualityInspections"
  | "nonConformities"
  | "supportTickets"
  | "serviceRequests"
  | "contracts"
  | "contractRenewals";

export type StoredRecord = Record<string, unknown> & {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
};

export type StoreState = {
  version: number;
  updatedAt: string;
  collections: Record<string, StoredRecord[]>;
};

export const ENTITY_NAMES: OperationEntity[] = [
  "accounts",
  "customers",
  "vendors",
  "suppliers",
  "products",
  "itemGroups",
  "warehouses",
  "journalEntries",
  "salesInvoices",
  "purchaseInvoices",
  "cashVouchers",
  "bankTransfers",
  "expenses",
  "revenues",
  "stockAdjustments",
  "purchaseOrders",
  "salesReturns",
  "purchaseReturns",
  "costCenters",
  "openingBalances",
  "bankingOperations",
  "fixedAssets",
  "assetMovements",
  "maintenanceOrders",
  "maintenancePlans",
  "qualityInspections",
  "nonConformities",
  "supportTickets",
  "serviceRequests",
  "contracts",
  "contractRenewals",
];

const ENTITY_LABELS: Record<OperationEntity, string> = {
  accounts: "الحسابات",
  customers: "العملاء",
  vendors: "الموردون",
  suppliers: "الموردين",
  products: "المنتجات",
  itemGroups: "مجموعات الأصناف",
  warehouses: "المستودعات",
  journalEntries: "القيود اليومية",
  salesInvoices: "فواتير المبيعات",
  purchaseInvoices: "فواتير المشتريات",
  cashVouchers: "سندات القبض",
  bankTransfers: "التحويلات المالية",
  expenses: "المصروفات",
  revenues: "الإيرادات",
  stockAdjustments: "التسويات المخزنية",
  purchaseOrders: "أوامر الشراء",
  salesReturns: "مرتجعات المبيعات",
  purchaseReturns: "مرتجعات المشتريات",
  costCenters: "مراكز التكلفة",
  openingBalances: "الأرصدة الافتتاحية",
  bankingOperations: "العمليات البنكية",
  fixedAssets: "الأصول الثابتة",
  assetMovements: "حركات الأصول",
  maintenanceOrders: "أوامر الصيانة",
  maintenancePlans: "خطط الصيانة",
  qualityInspections: "فحوص الجودة",
  nonConformities: "حالات عدم المطابقة",
  supportTickets: "تذاكر الدعم",
  serviceRequests: "طلبات الخدمة",
  contracts: "العقود",
  contractRenewals: "تجديدات العقود",
};

export const REQUIRED_FIELDS: Record<OperationEntity, string[]> = {
  accounts: ["code", "name", "type"],
  customers: ["name"],
  vendors: ["name"],
  suppliers: ["name"],
  products: ["name", "sku", "barcode"],
  itemGroups: ["name"],
  warehouses: ["name"],
  journalEntries: ["reference", "date", "description"],
  salesInvoices: ["reference", "customerName", "date", "items"],
  purchaseInvoices: ["reference", "vendorName", "date", "items"],
  cashVouchers: ["reference", "amount", "date"],
  bankTransfers: ["reference", "amount", "date"],
  expenses: ["reference", "amount", "date"],
  revenues: ["reference", "amount", "date"],
  stockAdjustments: ["reference", "warehouseName", "date"],
  purchaseOrders: ["reference", "vendorName", "date"],
  salesReturns: ["reference", "customerName", "date"],
  purchaseReturns: ["reference", "vendorName", "date"],
  costCenters: ["name"],
  openingBalances: ["reference", "amount", "date"],
  bankingOperations: ["reference", "bankName", "amount", "date"],
  fixedAssets: ["assetCode", "name", "acquisitionDate", "acquisitionCost"],
  assetMovements: ["reference", "assetCode", "movementType", "date"],
  maintenanceOrders: ["reference", "assetCode", "issueType", "requestedDate"],
  maintenancePlans: ["name", "assetCode", "frequency", "nextDueDate"],
  qualityInspections: ["reference", "subject", "inspectionDate", "result"],
  nonConformities: ["reference", "subject", "reportedDate"],
  supportTickets: ["reference", "subject", "customerName", "openedDate"],
  serviceRequests: ["reference", "customerName", "serviceType", "requestedDate"],
  contracts: ["reference", "subject", "partyName", "startDate", "endDate"],
  contractRenewals: ["reference", "contractReference", "renewalDate"],
};

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(STORE_DIR, "erp-store.json");
const BACKUP_DIR = path.join(STORE_DIR, "backups");

function buildEmptyCollections(): Record<string, StoredRecord[]> {
  return ENTITY_NAMES.reduce((acc, entity) => {
    acc[entity] = [];
    return acc;
  }, {} as Record<string, StoredRecord[]>);
}

export function ensureStorage(): StoreState {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  if (!fs.existsSync(STORE_FILE)) {
    const initialState: StoreState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      collections: buildEmptyCollections(),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initialState, null, 2), "utf8");
    return initialState;
  }

  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    const safeState: StoreState = {
      version: parsed.version ?? 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      collections: {
        ...buildEmptyCollections(),
        ...(parsed.collections ?? {}),
      },
    };

    for (const entity of ENTITY_NAMES) {
      safeState.collections[entity] = Array.isArray(safeState.collections[entity]) ? safeState.collections[entity] : [];
    }

    for (const entity of Object.keys(safeState.collections)) {
      if (!ENTITY_NAMES.includes(entity as OperationEntity)) {
        safeState.collections[entity] = Array.isArray(safeState.collections[entity]) ? safeState.collections[entity] : [];
      }
    }

    fs.writeFileSync(STORE_FILE, JSON.stringify(safeState, null, 2), "utf8");
    return safeState;
  } catch (error) {
    const fallbackState: StoreState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      collections: buildEmptyCollections(),
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(fallbackState, null, 2), "utf8");
    return fallbackState;
  }
}

function writeStore(state: StoreState) {
  const updatedState: StoreState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  const tempFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(updatedState, null, 2), "utf8");
  fs.renameSync(tempFile, STORE_FILE);
  return updatedState;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  return value;
}

function normalizeInvoiceItems(items: unknown): unknown {
  if (Array.isArray(items)) {
    return items.map((item) => {
      const candidate: Record<string, unknown> = typeof item === "object" && item !== null ? { ...(item as Record<string, unknown>) } : { label: String(item) };
      const qtyValue = candidate["qty"] ?? candidate["quantity"] ?? 1;
      const unitPriceValue = candidate["unitPrice"] ?? candidate["price"] ?? 0;
      const amountValue = candidate["amount"] ?? ((Number(qtyValue) || 0) * (Number(unitPriceValue) || 0));
      const qty = Number(qtyValue);
      const unitPrice = Number(unitPriceValue);
      const amount = Number(amountValue);

      return {
        ...candidate,
        qty: Number.isFinite(qty) ? qty : 1,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        amount: Number.isFinite(amount) ? amount : 0,
      };
    });
  }

  if (typeof items === "string") {
    const trimmed = items.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeInvoiceItems(parsed);
    } catch {
      return trimmed
        .split(/\r?\n|,/) 
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ label: line }));
    }
  }

  return [];
}

export function normalizeRecordPayload(entity: string, payload: Record<string, unknown>) {
  const next = { ...payload };

  if (entity === "salesInvoices" && next.taxCalculation === SALES_VAT_MODE) {
    Object.assign(next, calculateSalesVat(next.items));
  }
  if (entity === "salesInvoices" && next.taxCalculation === SALES_DISCOUNT_VAT_MODE) {
    Object.assign(next, calculateDiscountedSalesVat(next.items, next.invoiceDiscountType, next.invoiceDiscountValue));
  }

  if (entity === "products") {
    const numericKeys = ["unitCost", "unitPrice", "stockQty", "amount", "quantity"]; 
    for (const key of numericKeys) {
      if (next[key] !== undefined && next[key] !== null && next[key] !== "") {
        next[key] = Number(next[key]);
      }
    }
  }

  if (entity === "salesInvoices" || entity === "purchaseInvoices") {
    next.items = normalizeInvoiceItems(next.items);
    if (next.amount !== undefined && next.amount !== null && next.amount !== "") {
      next.amount = Number(next.amount);
    }
  }

  return next;
}

export function validateRecordPayload(entity: string, payload: Record<string, unknown>) {
  const knownEntity = entity as OperationEntity;
  const required = REQUIRED_FIELDS[knownEntity] ?? [];
  const missing = required.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || String(normalizeValue(value)).length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required fields for ${ENTITY_LABELS[entity as OperationEntity] ?? entity}: ${missing.join(", ")}`);
  }

  if (entity === "salesInvoices" || entity === "purchaseInvoices") {
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error("Invoice must contain at least one item");
    }
  }
}

function validateEntity(entity: string, payload: Record<string, unknown>) {
  validateRecordPayload(entity, payload);

  const duplicateFields: Array<[string, string]> = [
    ["accounts", "code"],
    ["products", "sku"],
    ["products", "barcode"],
    ["customers", "name"],
    ["vendors", "name"],
    ["suppliers", "name"],
    ["warehouses", "name"],
    ["itemGroups", "name"],
  ];

  const duplicateMatch = duplicateFields.filter(([key]) => key === entity);
  if (duplicateMatch.length > 0) {
    for (const [, fieldName] of duplicateMatch) {
      const value = normalizeValue(payload[fieldName]);
      if (value === undefined || value === null || String(value).length === 0) continue;
      const store = ensureStorage();
      const exists = (store.collections[entity] ?? []).some((item) => String(item[fieldName]) === String(value));
      if (exists) {
        throw new Error(`Duplicate value detected for ${fieldName}`);
      }
    }
  }
}

export function listRecords(entity: string, filters?: { search?: string; status?: string; sortField?: string; direction?: "asc" | "desc" }) {
  const state = ensureStorage();
  const rows = (state.collections[entity] ?? []) as StoredRecord[];
  const search = (filters?.search ?? "").trim().toLowerCase();
  const status = filters?.status ?? "all";

  const filtered = rows.filter((row) => {
    if (status !== "all" && row.status !== status) return false;
    if (!search) return true;
    const haystack = Object.values(row).join(" ").toLowerCase();
    return haystack.includes(search);
  });

  const sortField = filters?.sortField ?? "updatedAt";
  const direction = filters?.direction ?? "desc";

  filtered.sort((a, b) => {
    const left = a[sortField] ?? "";
    const right = b[sortField] ?? "";
    const comparison = String(left).localeCompare(String(right), undefined, { numeric: true });
    return direction === "asc" ? comparison : -comparison;
  });

  return filtered;
}

export function getAllCollections() {
  const state = ensureStorage();
  const collections = ENTITY_NAMES.reduce((acc, entity) => {
    acc[entity] = state.collections[entity] ?? [];
    return acc;
  }, {} as Record<string, StoredRecord[]>);

  for (const entity of Object.keys(state.collections)) {
    collections[entity] = state.collections[entity] ?? [];
  }

  return collections;
}

export function createRecord(entity: string, data: Record<string, unknown>) {
  const state = ensureStorage();
  const normalizedData = normalizeRecordPayload(entity, data ?? {});
  validateEntity(entity, normalizedData);

  const now = new Date().toISOString();
  const record: StoredRecord = {
    ...(normalizedData ?? {}),
    id: String(normalizedData.id ?? createId(entity.replace(/s$/, ""))),
    status: String(normalizedData.status ?? "draft"),
    createdAt: String(normalizedData.createdAt ?? now),
    updatedAt: String(normalizedData.updatedAt ?? now),
  };

  state.collections[entity] = [...(state.collections[entity] ?? []), record];
  writeStore(state);
  return record;
}

export function updateRecord(entity: string, id: string, data: Record<string, unknown>) {
  const state = ensureStorage();
  const index = (state.collections[entity] ?? []).findIndex((row) => String(row.id) === String(id));
  if (index === -1) {
    throw new Error(`Record not found in ${ENTITY_LABELS[entity as OperationEntity] ?? entity}`);
  }

  const existing = state.collections[entity][index] as StoredRecord;
  if ((entity === "salesInvoices" || entity === "purchaseInvoices") && existing.status === "posted") {
    throw new Error("Posted invoices cannot be edited");
  }
  const invoiceData = entity === "salesInvoices" && isSalesVatMode(existing.taxCalculation)
    ? { ...existing, ...data, taxCalculation: existing.taxCalculation }
    : data;
  const normalizedData = normalizeRecordPayload(entity, invoiceData ?? {});
  const updatedRecord: StoredRecord = {
    ...existing,
    ...normalizedData,
    id: String(id),
    updatedAt: new Date().toISOString(),
    status: String(normalizedData.status ?? existing.status ?? "draft"),
  };

  state.collections[entity][index] = updatedRecord;
  writeStore(state);
  return updatedRecord;
}

export function postInvoice(entity: string, id: string) {
  if (entity !== "salesInvoices" && entity !== "purchaseInvoices") {
    throw new Error("Only sales and purchase invoices can be posted");
  }

  const state = ensureStorage();
  const invoice = (state.collections[entity] ?? []).find((row) => row.id === id);
  if (!invoice) {
    throw new Error(`Record not found in ${ENTITY_LABELS[entity]}`);
  }
  if (invoice.status === "posted") {
    throw new Error("This invoice has already been posted");
  }
  if (invoice.status !== "draft" && invoice.status !== "approved") {
    throw new Error("Only draft or approved invoices can be posted");
  }

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  if (items.length === 0) {
    throw new Error("Invoice must contain at least one item");
  }

  const products = state.collections.products ?? [];
  const stockChanges = new Map<string, { product: StoredRecord; quantity: number }>();

  for (const rawItem of items) {
    if (typeof rawItem !== "object" || rawItem === null) {
      throw new Error("Invoice contains an invalid item");
    }

    const item = rawItem as Record<string, unknown>;
    const quantity = Number(item.qty ?? item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Item quantities must be greater than zero");
    }

    const product = products.find((candidate) =>
      (item.productId && candidate.id === item.productId) ||
      (item.barcode && candidate.barcode === item.barcode) ||
      (item.sku && candidate.sku === item.sku)
    );
    if (!product) {
      throw new Error(`Product not found for item ${String(item.productName ?? item.barcode ?? item.sku ?? "")}`);
    }

    const previous = stockChanges.get(product.id)?.quantity ?? 0;
    const signedQuantity = entity === "purchaseInvoices" ? quantity : -quantity;
    stockChanges.set(product.id, { product, quantity: previous + signedQuantity });
  }

  for (const { product, quantity } of stockChanges.values()) {
    const currentStock = Number(product.stockQty ?? 0);
    if (!Number.isFinite(currentStock)) {
      throw new Error(`Product ${String(product.name ?? product.id)} has an invalid stock balance`);
    }
    if (entity === "salesInvoices" && currentStock + quantity < 0) {
      throw new Error(`Insufficient stock for ${String(product.name ?? product.id)}`);
    }
  }

  for (const { product, quantity } of stockChanges.values()) {
    product.stockQty = Number(product.stockQty ?? 0) + quantity;
    product.updatedAt = new Date().toISOString();
  }

  const postedInvoice: StoredRecord = {
    ...invoice,
    status: "posted",
    postedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.collections[entity] = (state.collections[entity] ?? []).map((row) =>
    row.id === id ? postedInvoice : row
  );
  writeStore(state);
  return postedInvoice;
}

export function deleteRecord(entity: string, id: string) {
  const state = ensureStorage();
  const existing = (state.collections[entity] ?? []).find((row) => row.id === id);
  if ((entity === "salesInvoices" || entity === "purchaseInvoices") && existing?.status === "posted") {
    throw new Error("Posted invoices cannot be deleted");
  }
  const beforeCount = state.collections[entity]?.length ?? 0;
  state.collections[entity] = (state.collections[entity] ?? []).filter((row) => String(row.id) !== String(id));
  if ((state.collections[entity]?.length ?? 0) === beforeCount) {
    throw new Error(`Record not found in ${ENTITY_LABELS[entity as OperationEntity] ?? entity}`);
  }
  writeStore(state);
  return true;
}

export function getRecord(entity: string, id: string) {
  const state = ensureStorage();
  return (state.collections[entity] ?? []).find((row) => String(row.id) === String(id)) ?? null;
}

export function backupStore() {
  const state = ensureStorage();
  const fileName = `erp-backup-${Date.now()}.json`;
  const backupFile = path.join(BACKUP_DIR, fileName);
  fs.writeFileSync(backupFile, JSON.stringify(state, null, 2), "utf8");
  return {
    fileName,
    filePath: backupFile,
    createdAt: new Date().toISOString(),
  };
}

export function restoreStore(fileName: string) {
  const backupFile = path.join(BACKUP_DIR, fileName);
  if (!fs.existsSync(backupFile)) {
    throw new Error("Backup file not found");
  }

  const raw = fs.readFileSync(backupFile, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoreState>;
  if (!parsed.collections) {
    throw new Error("Invalid backup file");
  }

  const freshState: StoreState = {
    version: parsed.version ?? 1,
    updatedAt: new Date().toISOString(),
    collections: {
      ...buildEmptyCollections(),
      ...(parsed.collections ?? {}),
    },
  };

  writeStore(freshState);
  return freshState;
}

export function listBackupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((name) => name.endsWith(".json")).sort().reverse();
}

export function getEntityLabel(entity: string) {
  return ENTITY_LABELS[entity as OperationEntity] ?? entity;
}
