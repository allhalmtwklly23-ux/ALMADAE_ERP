"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErpShell } from "@/components/erp-shell";
import { hasErpPermission, useErpSession } from "@/components/erp-session-provider";

type PosProduct = {
  id: string;
  name?: string;
  sku?: string;
  barcode?: string;
  group?: string;
  category?: string;
  unitPrice?: number | string;
  stockQty?: number | string;
};

type PosCustomer = {
  id: string;
  name?: string;
};

type PosInvoice = {
  id: string;
  reference?: string;
  date?: string;
  amount?: number | string;
  status?: string;
  source?: string;
};

type ApiResult<T = unknown> = {
  success?: boolean;
  message?: string;
  data?: T;
  saved?: boolean;
  invoiceId?: string;
};

const paymentMethods = ["نقدي", "بطاقة", "تحويل"];

function numberValue(value: number | string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(value);
}

async function getApiData<T>(response: Response) {
  const result = await response.json() as ApiResult<T>;
  if (!response.ok || !result.success || !Array.isArray(result.data)) {
    throw new Error(result.message ?? "تعذر تحميل بيانات نقطة البيع.");
  }
  return result.data as T;
}

export function PosCashier() {
  const { user } = useErpSession();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<PosInvoice[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("الكل");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(paymentMethods[0]);
  const [pendingInvoiceId, setPendingInvoiceId] = useState("");
  const [pendingReference, setPendingReference] = useState("");
  const [pendingInvoiceSaved, setPendingInvoiceSaved] = useState(false);
  const [lastInvoiceId, setLastInvoiceId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canViewProducts = hasErpPermission(user, "products", "view");
  const canViewInvoices = hasErpPermission(user, "salesInvoices", "view");
  const canCreateInvoices = hasErpPermission(user, "salesInvoices", "create");
  const canPostInvoices = hasErpPermission(user, "salesInvoices", "post");
  const canPrintInvoices = hasErpPermission(user, "salesInvoices", "print");
  const canUsePos = canViewProducts && canViewInvoices;
  const canCheckout = canCreateInvoices && canPostInvoices;

  const loadData = useCallback(async () => {
    if (!canUsePos) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const productsResponse = await fetch("/api/erp?entity=products", { cache: "no-store" });
      setProducts(await getApiData<PosProduct[]>(productsResponse));

      if (hasErpPermission(user, "customers", "view")) {
        const customersResponse = await fetch("/api/erp?entity=customers", { cache: "no-store" });
        if (customersResponse.ok) {
          setCustomers(await getApiData<PosCustomer[]>(customersResponse));
        }
      }

      const invoicesResponse = await fetch("/api/erp?entity=salesInvoices", { cache: "no-store" });
      const invoices = await getApiData<PosInvoice[]>(invoicesResponse);
      setRecentInvoices(invoices.filter((invoice) => invoice.source === "pos").slice(0, 5));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "تعذر تحميل بيانات نقطة البيع.");
    } finally {
      setLoading(false);
    }
  }, [canUsePos, user]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  useEffect(() => {
    const handleCreateShortcut = (event: Event) => {
      const customEvent = event as CustomEvent<{ entity?: string }>;
      if (customEvent.detail?.entity === "salesInvoices") {
        scanInputRef.current?.focus();
      }
    };
    window.addEventListener("erp:create-operation", handleCreateShortcut);
    return () => window.removeEventListener("erp:create-operation", handleCreateShortcut);
  }, []);

  const categories = useMemo(() => {
    const names = products
      .map((product) => product.group || product.category || "")
      .filter(Boolean);
    return ["الكل", ...Array.from(new Set(names))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const productCategory = product.group || product.category || "";
      const matchesCategory = category === "الكل" || productCategory === category;
      const matchesSearch = !query || [
        product.name,
        product.sku,
        product.barcode,
      ].some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [category, products, search]);

  const cartLines = useMemo(
    () => Object.entries(cart).flatMap(([productId, quantity]) => {
      const product = products.find((candidate) => candidate.id === productId);
      return product ? [{ product, quantity, amount: numberValue(product.unitPrice) * quantity }] : [];
    }),
    [cart, products],
  );
  const total = cartLines.reduce((sum, line) => sum + line.amount, 0);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const cartLocked = Boolean(pendingInvoiceId);

  const addProduct = (product: PosProduct) => {
    setError("");
    setMessage("");
    const nextQuantity = (cart[product.id] ?? 0) + 1;
    if (nextQuantity > numberValue(product.stockQty)) {
      setError(`الكمية المتاحة من ${product.name ?? "الصنف"} غير كافية.`);
      return;
    }
    setCart((current) => ({
      ...current,
      [product.id]: Math.min(numberValue(product.stockQty), (current[product.id] ?? 0) + 1),
    }));
  };

  const updateQuantity = (product: PosProduct, quantity: number) => {
    setError("");
    if (quantity <= 0) {
      setCart((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      return;
    }
    if (quantity > numberValue(product.stockQty)) {
      setError(`الكمية المتاحة من ${product.name ?? "الصنف"} هي ${numberValue(product.stockQty)} فقط.`);
      return;
    }
    setCart((current) => ({ ...current, [product.id]: quantity }));
  };

  const handleScan = () => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return;
    const product = products.find((candidate) =>
      [candidate.barcode, candidate.sku].some((value) => String(value ?? "").toLocaleLowerCase() === query)
    );
    if (!product) {
      setError("لم يتم العثور على صنف بهذا الباركود أو رمز الصنف.");
      return;
    }
    addProduct(product);
    setSearch("");
  };

  const completeSale = async () => {
    if (!canCheckout || !cartLines.length || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    const invoiceId = pendingInvoiceId || `pos-${crypto.randomUUID()}`;
    const reference = pendingReference || `POS-${invoiceId.slice(-8).toUpperCase()}`;

    if (!pendingInvoiceId) {
      setPendingInvoiceId(invoiceId);
      setPendingReference(reference);
      setPendingInvoiceSaved(false);
    }

    const invoiceData = {
      id: invoiceId,
      reference,
      date: new Date().toISOString().slice(0, 10),
      status: "draft",
      source: "pos",
      channel: "pos",
      storeName: "نقطة البيع",
      cashier: user?.fullName ?? user?.username ?? "",
      customerId: selectedCustomer?.id ?? "",
      customerName: selectedCustomer?.name ?? "عميل نقدي",
      paymentMethod,
      items: cartLines.map(({ product, quantity }) => ({
        productId: product.id,
        productName: product.name ?? "",
        sku: product.sku ?? "",
        barcode: product.barcode ?? "",
        qty: quantity,
        unitPrice: numberValue(product.unitPrice),
        amount: numberValue(product.unitPrice) * quantity,
      })),
      amount: total,
    };

    try {
      const response = await fetch("/api/erp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "posCheckout", id: invoiceId, data: invoiceData }),
      });
      const result = await response.json() as ApiResult<PosInvoice>;
      if (!response.ok || !result.success) {
        if (result.saved && result.invoiceId) {
          setPendingInvoiceId(result.invoiceId);
          setPendingReference(reference);
          setPendingInvoiceSaved(true);
          throw new Error(`حُفظت الفاتورة ${reference} كمسودة، لكن لم يتغير المخزون. ${result.message ?? "أصلح السبب ثم أعد المحاولة من الفاتورة."}`);
        }
        setPendingInvoiceId("");
        setPendingReference("");
        setPendingInvoiceSaved(false);
        throw new Error(result.message ?? "تعذر إتمام عملية البيع.");
      }

      setCart({});
      setPendingInvoiceId("");
      setPendingReference("");
      setPendingInvoiceSaved(false);
      setLastInvoiceId(invoiceId);
      setMessage(`تم إصدار الفاتورة ${reference} وتحديث المخزون بنجاح.`);
      await loadData();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "تعذر إتمام عملية البيع.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ErpShell>
      <div className="pos-page">
        <header className="pos-header">
          <div>
            <span className="eyebrow dark">المبيعات والمخزون</span>
            <h1>الكاشير</h1>
            <p>اختر الأصناف، أكمل الدفع، وستصدر فاتورة مبيعات مع تحديث المخزون مباشرة.</p>
          </div>
          <Link className="pos-sales-link" href="/sales">عرض فواتير المبيعات</Link>
        </header>

        {!canUsePos ? (
          <section className="pos-notice" role="alert">
            لا تتوفر لك صلاحية عرض الأصناف وفواتير المبيعات. اطلب من مدير النظام تفعيل صلاحية عرض المنتجات وفواتير المبيعات.
          </section>
        ) : !canCheckout ? (
          <section className="pos-notice" role="alert">
            يلزم تفعيل صلاحيتي إنشاء فواتير المبيعات وترحيلها لإتمام البيع وتحديث المخزون.
          </section>
        ) : null}

        {error && <p className="pos-feedback is-error" role="alert">{error}</p>}
        {message && (
          <p className="pos-feedback is-success" role="status">
            {message}
            {lastInvoiceId && (
              <>{" "}<Link href={`/invoices/salesInvoices/${lastInvoiceId}`}>{canPrintInvoices ? "فتح الفاتورة وطباعتها" : "فتح الفاتورة"}</Link></>
            )}
          </p>
        )}

        <div className="pos-layout">
          <section className="pos-catalog" aria-label="الأصناف">
            <div className="pos-catalog-tools">
              <label className="pos-search">
                <span>بحث أو مسح باركود</span>
                <input
                  ref={scanInputRef}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleScan();
                    }
                  }}
                  placeholder="اسم الصنف، SKU، أو الباركود"
                  disabled={!canUsePos || loading || cartLocked}
                />
              </label>
              <button type="button" className="pos-refresh-button" onClick={() => void loadData()} disabled={loading}>
                تحديث الأصناف
              </button>
            </div>

            {categories.length > 1 && (
              <div className="pos-category-list" aria-label="تصنيفات الأصناف">
                {categories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={category === name ? "pos-category active" : "pos-category"}
                    onClick={() => setCategory(name)}
                    disabled={cartLocked}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div className="pos-empty-state" role="status">جارٍ تحميل الأصناف...</div>
            ) : filteredProducts.length ? (
              <div className="pos-product-grid">
                {filteredProducts.map((product) => {
                  const stock = numberValue(product.stockQty);
                  const quantity = cart[product.id] ?? 0;
                  const unavailable = stock <= quantity;
                  return (
                    <button
                      type="button"
                      key={product.id}
                      className="pos-product-card"
                      onClick={() => addProduct(product)}
                      disabled={cartLocked || unavailable}
                    >
                      <span className="pos-product-category">{product.group || product.category || "صنف"}</span>
                      <strong>{product.name || "صنف بدون اسم"}</strong>
                      <span className="pos-product-sku">{product.sku || product.barcode || "—"}</span>
                      <span className="pos-product-bottom">
                        <b>{formatCurrency(numberValue(product.unitPrice))}</b>
                        <small>المتوفر {stock}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="pos-empty-state">
                {products.length ? "لا توجد أصناف تطابق البحث." : "لا توجد أصناف مسجلة في المخزون."}
              </div>
            )}
          </section>

          <aside className="pos-cart-panel" aria-label="سلة المبيعات">
            <div className="pos-cart-heading">
              <div>
                <span className="eyebrow dark">عملية جديدة</span>
                <h2>سلة البيع</h2>
              </div>
              <span className="pos-cart-count">{cartLines.reduce((sum, line) => sum + line.quantity, 0)} صنف</span>
            </div>

            {pendingInvoiceId && (
              <div className="pos-pending-notice" role="alert">
                  {pendingInvoiceSaved
                    ? `الفاتورة ${pendingReference} محفوظة كمسودة ولم تُرحّل. أصلح السبب ثم أعد المحاولة.`
                    : `لم يكتمل تأكيد الفاتورة ${pendingReference}. أعد المحاولة، وسيُستخدم الرقم نفسه لمنع التكرار.`}
                  {pendingInvoiceSaved && <Link href={`/invoices/salesInvoices/${pendingInvoiceId}`}>فتح الفاتورة</Link>}
              </div>
            )}

            <div className="pos-cart-lines">
              {cartLines.map(({ product, quantity, amount }) => (
                <div className="pos-cart-line" key={product.id}>
                  <div className="pos-cart-line-name">
                    <strong>{product.name}</strong>
                    <small>{formatCurrency(numberValue(product.unitPrice))} للوحدة</small>
                  </div>
                  <div className="pos-quantity-control" aria-label={`كمية ${product.name}`}>
                    <button type="button" onClick={() => updateQuantity(product, quantity - 1)} disabled={cartLocked}>−</button>
                    <span>{quantity}</span>
                    <button type="button" onClick={() => updateQuantity(product, quantity + 1)} disabled={cartLocked || quantity >= numberValue(product.stockQty)}>＋</button>
                  </div>
                  <strong className="pos-line-total">{formatCurrency(amount)}</strong>
                </div>
              ))}
              {!cartLines.length && <div className="pos-cart-empty">أضف صنفاً لبدء عملية البيع.</div>}
            </div>

            <div className="pos-checkout-fields">
              <label>
                العميل
                <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} disabled={cartLocked}>
                  <option value="">عميل نقدي</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name || "عميل"}</option>
                  ))}
                </select>
              </label>
              <label>
                وسيلة الدفع
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={cartLocked}>
                  {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
            </div>

            <div className="pos-total-row">
              <span>الإجمالي</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
            <button
              type="button"
              className="pos-checkout-button"
              onClick={() => void completeSale()}
              disabled={!canCheckout || !cartLines.length || saving}
            >
              {saving ? "جارٍ إصدار الفاتورة..." : pendingInvoiceId ? "إعادة محاولة الترحيل" : "إتمام البيع وإصدار الفاتورة"}
            </button>
            {!canPrintInvoices && (
              <p className="pos-print-hint">لا تتوفر صلاحية طباعة الفواتير؛ يمكن لمدير النظام تفعيلها من الصلاحيات.</p>
            )}
          </aside>
        </div>

        {canViewInvoices && recentInvoices.length > 0 && (
          <section className="pos-recent-sales">
            <div className="pos-recent-heading">
              <h2>آخر فواتير الكاشير</h2>
              <Link href="/sales">كل فواتير المبيعات</Link>
            </div>
            <div className="pos-recent-list">
              {recentInvoices.map((invoice) => (
                <Link href={`/invoices/salesInvoices/${invoice.id}`} key={invoice.id} className="pos-recent-invoice">
                  <strong>{invoice.reference || "فاتورة مبيعات"}</strong>
                  <span>{invoice.date || "—"}</span>
                  <b>{formatCurrency(numberValue(invoice.amount))}</b>
                  <small>{invoice.status || "—"}</small>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </ErpShell>
  );
}
