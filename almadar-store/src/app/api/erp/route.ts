import { connection, NextResponse } from "next/server";
import { dashboardMetrics, executiveDashboard, financeRows, roleMatrix, auditTrail } from "@/data/erp-data";
import { postedProductPurchases } from "@/lib/erp/product-history";
import {
  backupStore,
  createRecord,
  deleteRecord,
  ENTITY_NAMES,
  getAllCollections,
  getEntityLabel,
  getRecord,
  listBackupFiles,
  listRecords,
  postInvoice,
  restoreStore,
  updateRecord,
} from "@/lib/erp/store";
import {
  getSessionTokenFromHeader,
  getSessionUserFromToken,
  userHasPermission,
} from "@/lib/erp/auth-system";
import {
  createDatabaseBackup,
  createDatabaseRecord,
  deleteDatabaseRecord,
  getDatabaseCollections,
  getDatabaseRecord,
  getDatabaseSessionUser,
  getPersistenceMode,
  listDatabaseBackups,
  listDatabaseAuditLog,
  listDatabaseRecords,
  postDatabaseInvoice,
  requireDatabasePermission,
  restoreDatabaseBackup,
  updateDatabaseRecord,
  withDatabaseRequestCompany,
} from "@/lib/erp/database";

async function requireAuthUser(request: Request, mode: "json" | "supabase") {
  const token = getSessionTokenFromHeader(request.headers.get("cookie"));
  const user = mode === "supabase"
    ? await getDatabaseSessionUser(token)
    : getSessionUserFromToken(token);
  if (!user) {
    throw new Error("unauthorized");
  }
  if (user.mustChangePassword) {
    throw new Error("password_change_required");
  }
  return user;
}

async function requirePermission(
  request: Request,
  mode: "json" | "supabase",
  entity: string,
  action: "view" | "create" | "edit" | "delete" | "post",
) {
  const user = await requireAuthUser(request, mode);
  const allowed = mode === "supabase"
    ? await requireDatabasePermission(user, entity, action)
    : userHasPermission(user, entity, action);
  if (!allowed) {
    throw new Error("forbidden");
  }
  return user;
}

async function canViewProductCosts(
  user: NonNullable<Awaited<ReturnType<typeof requireAuthUser>>>,
  mode: "json" | "supabase",
) {
  return user.role === "sales_manager" || (mode === "supabase"
    ? await requireDatabasePermission(user, "productCosts", "view") || await requireDatabasePermission(user, "purchaseInvoices", "view")
    : userHasPermission(user, "productCosts", "view") || userHasPermission(user, "purchaseInvoices", "view"));
}

function withoutProductCost<T extends Record<string, unknown>>(product: T) {
  const visible = { ...product };
  delete visible.unitCost;
  return visible;
}

export function GET(request: Request) {
  return withDatabaseRequestCompany(request, () => handleGet(request));
}

async function handleGet(request: Request) {
  try {
    await connection();
    const mode = getPersistenceMode();
    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity");
    const search = searchParams.get("search") ?? "";
    const status = searchParams.get("status") ?? "all";

    if (searchParams.get("view") === "productPurchaseHistory") {
      const productId = searchParams.get("productId")?.trim();
      if (!productId) {
        return NextResponse.json({ success: false, message: "معرف الصنف مطلوب." }, { status: 400 });
      }
      const user = await requirePermission(request, mode, "products", "view");
      const permitted = await canViewProductCosts(user, mode);
      if (!permitted) throw new Error("forbidden");
      const product = mode === "supabase"
        ? await getDatabaseRecord("products", productId)
        : getRecord("products", productId);
      if (!product) {
        return NextResponse.json({ success: false, message: "الصنف غير موجود." }, { status: 404 });
      }
      const invoices = mode === "supabase"
        ? await listDatabaseRecords("purchaseInvoices")
        : listRecords("purchaseInvoices");
      const history = postedProductPurchases(product, invoices);
      return NextResponse.json({
        success: true,
        data: { unitCost: product.unitCost ?? null, history },
      });
    }

    if (searchParams.get("view") === "customer360") {
      const customerId = searchParams.get("customerId")?.trim();
      if (!customerId) {
        return NextResponse.json({ success: false, message: "معرف العميل مطلوب." }, { status: 400 });
      }

      const user = await requirePermission(request, mode, "customers", "view");
      const customer = mode === "supabase"
        ? await getDatabaseRecord("customers", customerId)
        : getRecord("customers", customerId);
      if (!customer) {
        return NextResponse.json({ success: false, message: "العميل غير موجود." }, { status: 404 });
      }

      const relatedEntities = ["salesInvoices", "salesReturns", "cashVouchers", "contracts"] as const;
      const visibleEntities = await Promise.all(relatedEntities.map(async (candidate) => {
        const allowed = mode === "supabase"
          ? await requireDatabasePermission(user, candidate, "view")
          : userHasPermission(user, candidate, "view");
        return allowed ? candidate : null;
      }));
      const relatedRecords = await Promise.all(visibleEntities.map(async (candidate) => {
        if (!candidate) return [];
        return mode === "supabase"
          ? listDatabaseRecords(candidate, { search: "", status: "all", sortField: "updatedAt", direction: "desc" })
          : listRecords(candidate, { search: "", status: "all", sortField: "updatedAt", direction: "desc" });
      }));
      const related = Object.fromEntries(visibleEntities.flatMap((candidate, index) =>
        candidate ? [[candidate, relatedRecords[index]]] : []
      ));
      const normalizedName = String(customer.name ?? "").trim().toLocaleLowerCase();
      const linked: Record<string, unknown[]> = {};
      const unverified: Record<string, unknown[]> = {};

      for (const [candidate, rows] of Object.entries(related)) {
        const records = rows as Record<string, unknown>[];
        linked[candidate] = records.filter((record) => String(record.customerId ?? "") === customerId);
        const partyNameField = candidate === "contracts" ? "partyName" : "customerName";
        unverified[candidate] = records.filter((record) =>
          !String(record.customerId ?? "").trim()
          && normalizedName !== ""
          && String(record[partyNameField] ?? "").trim().toLocaleLowerCase() === normalizedName
        );
      }

      return NextResponse.json({
        success: true,
        data: { customer, linked, unverified },
        timestamp: new Date().toISOString(),
      });
    }

    if (entity) {
      const user = await requirePermission(request, mode, entity, "view");
      const filters = { search, status, sortField: "updatedAt", direction: "desc" as const };
      const data = mode === "supabase"
        ? await listDatabaseRecords(entity, filters)
        : listRecords(entity, filters);
      return NextResponse.json({
        success: true,
        entity,
        label: getEntityLabel(entity),
        data: entity === "products" && !(await canViewProductCosts(user, mode))
          ? data.map(withoutProductCost)
          : data,
        timestamp: new Date().toISOString(),
      });
    }

    const user = await requireAuthUser(request, mode);
    const allCollections = mode === "supabase" ? await getDatabaseCollections() : getAllCollections();
    const visibleEntities = await Promise.all(ENTITY_NAMES.map(async (candidate) => {
      const allowed = mode === "supabase"
        ? await requireDatabasePermission(user, candidate, "view")
        : userHasPermission(user, candidate, "view");
      return allowed ? candidate : null;
    }));
    const collections = Object.fromEntries(
      visibleEntities
        .filter((candidate): candidate is (typeof ENTITY_NAMES)[number] => candidate !== null)
        .map((candidate) => [candidate, allCollections[candidate] ?? []]),
    );
    if (collections.products && !(await canViewProductCosts(user, mode))) {
      collections.products = collections.products.map(withoutProductCost);
    }
    const backups = user.role === "super_admin"
      ? mode === "supabase" ? await listDatabaseBackups() : listBackupFiles()
      : [];
    const canViewAudit = mode === "supabase"
      ? await requireDatabasePermission(user, "audit", "view")
      : userHasPermission(user, "audit", "view");
    const dashboardAuditTrail = canViewAudit
      ? mode === "supabase" ? await listDatabaseAuditLog() : auditTrail
      : [];
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dashboard: dashboardMetrics,
      finance: financeRows,
      roles: roleMatrix,
      auditTrail: dashboardAuditTrail,
      executiveDashboard,
      collections,
      backups,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "تعذر تحميل بيانات النظام.";
    const status = rawMessage === "unauthorized" ? 401 : rawMessage === "forbidden" || rawMessage === "password_change_required" ? 403 : 503;
    const message = rawMessage === "unauthorized"
      ? "غير مسجل الدخول."
      : rawMessage === "forbidden"
        ? "غير مصرح لك بالوصول."
        : rawMessage === "password_change_required"
          ? "يجب تغيير كلمة المرور قبل استخدام النظام."
        : rawMessage;
    return NextResponse.json({ success: false, message }, { status });
  }
}

export function POST(request: Request) {
  return withDatabaseRequestCompany(request, () => handlePost(request));
}

async function handlePost(request: Request) {
  try {
    await connection();
    const mode = getPersistenceMode();
    const body = await request.json();
    const entity = String(body?.entity ?? "");

    if (body?.action === "backup") {
      const user = await requireAuthUser(request, mode);
      if (user.role !== "super_admin") throw new Error("forbidden");
      const result = mode === "supabase"
        ? await createDatabaseBackup(user)
        : backupStore();
      return NextResponse.json({ success: true, message: "تم إنشاء نسخة احتياطية بنجاح.", data: result });
    }

    if (body?.action === "restore") {
      const user = await requireAuthUser(request, mode);
      if (user.role !== "super_admin") throw new Error("forbidden");
      const result = mode === "supabase"
        ? await restoreDatabaseBackup(String(body.fileName ?? ""), user)
        : restoreStore(String(body.fileName ?? ""));
      return NextResponse.json({ success: true, message: "تمت استعادة النسخة الاحتياطية بنجاح.", data: result });
    }

    if (body?.action === "postInvoice") {
      const invoiceEntity = String(body.entity ?? "");
      const user = await requirePermission(request, mode, invoiceEntity, "post");
      const result = mode === "supabase"
        ? await postDatabaseInvoice(invoiceEntity, String(body.id ?? ""), user)
        : postInvoice(invoiceEntity, String(body.id ?? ""));
      return NextResponse.json({ success: true, message: "تم ترحيل الفاتورة وتحديث المخزون.", data: result });
    }

    if (body?.action === "posCheckout") {
      const user = await requirePermission(request, mode, "salesInvoices", "create");
      const canPost = mode === "supabase"
        ? await requireDatabasePermission(user, "salesInvoices", "post")
        : userHasPermission(user, "salesInvoices", "post");
      if (!canPost) throw new Error("forbidden");

      const invoiceId = String(body?.id ?? "").trim();
      if (!invoiceId) throw new Error("A POS invoice ID is required.");
      const invoiceData = body?.data;
      if (!invoiceData || typeof invoiceData !== "object" || Array.isArray(invoiceData)) {
        throw new Error("POS invoice data is required.");
      }
      const existing = mode === "supabase"
        ? await getDatabaseRecord("salesInvoices", invoiceId)
        : getRecord("salesInvoices", invoiceId);
      const invoicePayload = { ...invoiceData, id: invoiceId, source: "pos", channel: "pos", status: "draft" };
      const invoice = existing ?? (mode === "supabase"
        ? await createDatabaseRecord("salesInvoices", invoicePayload, user)
        : createRecord("salesInvoices", invoicePayload));
      if (invoice.status === "posted") {
        return NextResponse.json({
          success: true,
          message: "تم إصدار فاتورة نقطة البيع وتحديث المخزون.",
          data: invoice,
        });
      }
      let result;
      try {
        result = mode === "supabase"
          ? await postDatabaseInvoice("salesInvoices", invoiceId, user)
          : postInvoice("salesInvoices", invoiceId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "تعذر ترحيل الفاتورة.";
        return NextResponse.json({ success: false, saved: true, invoiceId, message }, { status: 409 });
      }
      return NextResponse.json({
        success: true,
        message: "تم إصدار فاتورة نقطة البيع وتحديث المخزون.",
        data: result,
      });
    }

    const user = await requirePermission(request, mode, entity || "journalEntries", "create");
    const hideProductCost = entity === "products" && !(await canViewProductCosts(user, mode));
    if (hideProductCost && Object.hasOwn(body?.data ?? {}, "unitCost")) throw new Error("forbidden");
    const result = mode === "supabase"
      ? await createDatabaseRecord(entity, body?.data ?? {}, user)
      : createRecord(entity, body?.data ?? {});
    return NextResponse.json({ success: true, message: "تم حفظ العملية بنجاح.", data: hideProductCost ? withoutProductCost(result) : result, actor: user.username });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل حفظ البيانات";
    const status = message === "unauthorized" ? 401 : message === "forbidden" || message === "password_change_required" ? 403 : message.includes("not configured") || message.includes("required.") ? 503 : message.startsWith("Failed to") ? 500 : 400;
    return NextResponse.json({ success: false, message: message === "unauthorized" ? "غير مسجل الدخول." : message === "forbidden" ? "غير مصرح لك بالوصول." : message === "password_change_required" ? "يجب تغيير كلمة المرور قبل استخدام النظام." : message }, { status });
  }
}

export function PUT(request: Request) {
  return withDatabaseRequestCompany(request, () => handlePut(request));
}

async function handlePut(request: Request) {
  try {
    await connection();
    const mode = getPersistenceMode();
    const body = await request.json();
    const entity = String(body?.entity ?? "");
    const user = await requirePermission(request, mode, entity || "journalEntries", "edit");
    const hideProductCost = entity === "products" && !(await canViewProductCosts(user, mode));
    if (hideProductCost && Object.hasOwn(body?.data ?? {}, "unitCost")) throw new Error("forbidden");
    const result = mode === "supabase"
      ? await updateDatabaseRecord(entity, String(body?.id ?? ""), body?.data ?? {}, user)
      : updateRecord(entity, body?.id, body?.data ?? {});
    return NextResponse.json({ success: true, message: "تم تحديث العملية بنجاح.", data: hideProductCost ? withoutProductCost(result) : result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل تحديث البيانات";
    const status = message === "unauthorized" ? 401 : message === "forbidden" || message === "password_change_required" ? 403 : message.includes("not configured") || message.includes("required.") ? 503 : message.startsWith("Failed to") ? 500 : 400;
    return NextResponse.json({ success: false, message: message === "unauthorized" ? "غير مسجل الدخول." : message === "forbidden" ? "غير مصرح لك بالوصول." : message === "password_change_required" ? "يجب تغيير كلمة المرور قبل استخدام النظام." : message }, { status });
  }
}

export function DELETE(request: Request) {
  return withDatabaseRequestCompany(request, () => handleDelete(request));
}

async function handleDelete(request: Request) {
  try {
    await connection();
    const mode = getPersistenceMode();
    const body = await request.json();
    const entity = String(body?.entity ?? "");
    const user = await requirePermission(request, mode, entity || "journalEntries", "delete");
    if (mode === "supabase") {
      await deleteDatabaseRecord(entity, String(body?.id ?? ""), user);
    } else {
      deleteRecord(entity, body?.id);
    }
    return NextResponse.json({ success: true, message: "تم حذف العملية بنجاح." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل حذف البيانات";
    const status = message === "unauthorized" ? 401 : message === "forbidden" || message === "password_change_required" ? 403 : message.includes("not configured") || message.includes("required.") ? 503 : message.startsWith("Failed to") ? 500 : 400;
    return NextResponse.json({ success: false, message: message === "unauthorized" ? "غير مسجل الدخول." : message === "forbidden" ? "غير مصرح لك بالوصول." : message === "password_change_required" ? "يجب تغيير كلمة المرور قبل استخدام النظام." : message }, { status });
  }
}
