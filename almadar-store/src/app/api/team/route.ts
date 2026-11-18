import { connection, NextResponse } from "next/server";
import { getSessionTokenFromHeader, getSessionUserFromToken } from "@/lib/erp/auth-system";
import {
  countDatabaseUnreadMessages, getDatabaseSessionUser, getPersistenceMode, isDatabaseTeamAdmin,
  listDatabaseTeamContacts, listDatabaseTeamMessages, markDatabaseTeamMessageRead,
  listDatabaseTeamConversations, listDatabaseConversationMessages, markDatabaseConversationRead,
  sendDatabaseTeamMessage, withDatabaseRequestCompany,
} from "@/lib/erp/database";
import {
  localTeamContacts, localTeamMessages, localUnreadCount, markLocalTeamMessageRead, sendLocalTeamMessage,
  localTeamConversations, localConversationMessages, markLocalConversationRead,
} from "@/lib/erp/team-local";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run(request: Request, method: "GET" | "POST" | "PATCH") {
  try {
    return await withDatabaseRequestCompany(request, async () => {
      await connection();
      const mode = getPersistenceMode();
      const token = getSessionTokenFromHeader(request.headers.get("cookie"));
      const touch = method !== "GET" || new URL(request.url).searchParams.get("activity") === "1";
      const actor = mode === "supabase" ? await getDatabaseSessionUser(token, { touch }) : getSessionUserFromToken(token, { touch });
      if (!actor) return NextResponse.json({ success: false, message: "يجب تسجيل الدخول." }, { status: 401 });
      if (actor.mustChangePassword) return NextResponse.json({ success: false, message: "يجب تغيير كلمة المرور أولاً." }, { status: 403 });

      if (method === "GET") {
        const params = new URL(request.url).searchParams;
        if (params.get("view") === "unread") {
          const count = mode === "supabase" ? await countDatabaseUnreadMessages(actor) : localUnreadCount(actor);
          return NextResponse.json({ success: true, count }, { headers: { "Cache-Control": "no-store" } });
        }
        if (params.get("view") === "conversations") {
          const [contacts, conversations] = mode === "supabase"
            ? await Promise.all([listDatabaseTeamContacts(), listDatabaseTeamConversations(actor)])
            : [localTeamContacts(), localTeamConversations(actor)];
          return NextResponse.json({ success: true, contacts, conversations }, { headers: { "Cache-Control": "no-store" } });
        }
        if (params.get("view") === "conversation") {
          const contactId = params.get("contactId") ?? "";
          const beforeAt = params.get("beforeAt");
          const beforeId = params.get("beforeId");
          if (!contactId || contactId.length > 200 || contactId === actor.id ||
              Boolean(beforeAt) !== Boolean(beforeId) ||
              (beforeAt && (!/^[0-9T:.\-+Z]{20,40}$/.test(beforeAt) || Number.isNaN(Date.parse(beforeAt)))) ||
              (beforeId && !uuid.test(beforeId))) {
            return NextResponse.json({ success: false, message: "بيانات المحادثة غير صالحة." }, { status: 400 });
          }
          const before = beforeAt && beforeId ? { createdAt: beforeAt, id: beforeId } : undefined;
          const messages = mode === "supabase"
            ? await listDatabaseConversationMessages(actor, contactId, before)
            : localConversationMessages(actor, contactId, before);
          return NextResponse.json({ success: true, messages }, { headers: { "Cache-Control": "no-store" } });
        }
        const all = params.get("scope") === "all";
        const inbox = params.get("view") === "inbox";
        if (all && (actor.role !== "super_admin" || (mode === "supabase" && !await isDatabaseTeamAdmin(actor)))) {
          return NextResponse.json({ success: false, message: "لا توجد صلاحية." }, { status: 403 });
        }
        const [contacts, messages] = mode === "supabase"
          ? await Promise.all([listDatabaseTeamContacts(), listDatabaseTeamMessages(actor, all, inbox)])
          : [localTeamContacts(), localTeamMessages(actor, all, inbox)];
        return NextResponse.json({ success: true, contacts, messages }, { headers: { "Cache-Control": "no-store" } });
      }

      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
        return NextResponse.json({ success: false, message: "صيغة الطلب غير صالحة." }, { status: 415 });
      }
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return NextResponse.json({ success: false, message: "بيانات الطلب غير صالحة." }, { status: 400 });
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return NextResponse.json({ success: false, message: "بيانات الطلب غير صالحة." }, { status: 400 });
      }
      const input = payload as Record<string, unknown>;
      if (method === "PATCH") {
        if (input.contactId !== undefined) {
          if (typeof input.contactId !== "string" || !input.contactId || input.contactId.length > 200 || input.contactId === actor.id ||
              !Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 50 ||
              !input.ids.every((id: unknown) => typeof id === "string" && uuid.test(id))) {
            return NextResponse.json({ success: false, message: "بيانات المحادثة غير صالحة." }, { status: 400 });
          }
          if (mode === "supabase") await markDatabaseConversationRead(actor, input.contactId, input.ids);
          else markLocalConversationRead(actor, input.contactId, input.ids);
          return NextResponse.json({ success: true });
        }
        if (typeof input.id !== "string" || !uuid.test(input.id)) {
          return NextResponse.json({ success: false, message: "معرف الرسالة غير صالح." }, { status: 400 });
        }
        const found = mode === "supabase"
          ? await markDatabaseTeamMessageRead(actor, input.id)
          : markLocalTeamMessageRead(actor, input.id);
        return found
          ? NextResponse.json({ success: true })
          : NextResponse.json({ success: false, message: "الرسالة غير موجودة." }, { status: 404 });
      }
      const body = typeof input.body === "string" ? input.body.trim() : "";
      if (typeof input.recipientId !== "string" || !input.recipientId || input.recipientId.length > 200 ||
          !body || Array.from(body).length > 4000 || input.recipientId === actor.id) {
        return NextResponse.json({ success: false, message: "اختر مستلماً آخر واكتب رسالة لا تزيد عن ٤٠٠٠ حرف." }, { status: 400 });
      }
      try {
        const message = mode === "supabase"
          ? await sendDatabaseTeamMessage(actor, input.recipientId, body)
          : sendLocalTeamMessage(actor, input.recipientId, body);
        return NextResponse.json({ success: true, message }, { status: 201 });
      } catch (error) {
        if (error instanceof Error && error.message === "recipient_unavailable") {
          return NextResponse.json({ success: false, message: "المستلم غير متاح في هذه المنشأة." }, { status: 400 });
        }
        throw error;
      }
    });
  } catch (error) {
    console.error("Team API failed:", error);
    return NextResponse.json({ success: false, message: "تعذرت خدمة التواصل. تحقق من إعداد التخزين وحاول مجدداً." }, { status: 500 });
  }
}

export function GET(request: Request) { return run(request, "GET"); }
export function POST(request: Request) { return run(request, "POST"); }
export function PATCH(request: Request) { return run(request, "PATCH"); }
