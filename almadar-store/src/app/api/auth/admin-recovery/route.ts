import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getPersistenceMode, resetBootstrapAdminPassword } from "@/lib/erp/database";


const attempts = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const record = attempts.get(ip);
  if (record && record.until > now && record.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ success: false, message: "محاولات كثيرة. حاول بعد 10 دقائق." }, { status: 429 });
  }
  const secret = process.env.ERP_ADMIN_RECOVERY_TOKEN;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ success: false, message: "خدمة الاستعادة غير مفعّلة." }, { status: 503 });
  }

  const supplied = request.headers.get("x-admin-recovery-token") || "";
  if (!safeEqual(secret, supplied)) {
    const next = record && record.until > now ? { ...record, count: record.count + 1 } : { count: 1, until: now + WINDOW_MS };
    attempts.set(ip, next);
    return NextResponse.json({ success: false, message: "رمز الاستعادة غير صحيح." }, { status: 401 });
  }

  try {
    if (getPersistenceMode() !== "supabase") {
      return NextResponse.json({ success: false, message: "قاعدة البيانات غير متاحة." }, { status: 503 });
    }
    const body = await request.json();
    const password = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (password.length < 12 || password.length > 128) {
      return NextResponse.json({ success: false, message: "استخدم كلمة مرور من 12 إلى 128 خانة." }, { status: 400 });
    }
    await resetBootstrapAdminPassword(password);
    attempts.delete(ip);
    return NextResponse.json({ success: true, message: "تمت استعادة حساب A123 وإلغاء جلساته. احذف متغير الاستعادة من Vercel الآن ثم أعد النشر." });
  } catch {
    return NextResponse.json({ success: false, message: "تعذرت الاستعادة. تحقق من إعدادات قاعدة البيانات." }, { status: 500 });
  }
}
