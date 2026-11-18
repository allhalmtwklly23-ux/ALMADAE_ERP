"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useErpSession } from "@/components/erp-session-provider";
import type { TeamContact, TeamConversation, TeamCursor, TeamMessage } from "@/lib/erp/team-types";

type SummaryResponse = { success?: boolean; message?: string; contacts?: TeamContact[]; conversations?: TeamConversation[] };
type MessagesResponse = { success?: boolean; message?: string; messages?: TeamMessage[] };

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
}

export function TeamWorkspace() {
  const { user } = useErpSession();
  return <TeamWorkspaceInner key={`${user?.companyId ?? "local"}:${user?.id ?? "none"}`} />;
}

function TeamWorkspaceInner() {
  const { user, loading } = useErpSession();
  const [contacts, setContacts] = useState<TeamContact[]>([]);
  const [conversations, setConversations] = useState<TeamConversation[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [selected, setSelected] = useState("");
  const [audit, setAudit] = useState(false);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const cursor = useRef<TeamCursor | null>(null);
  const selectedRef = useRef("");
  const messageListRef = useRef<HTMLDivElement>(null);
  const forceBottom = useRef(false);
  const restoreScroll = useRef<{ height: number; top: number } | null>(null);

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/team?view=conversations", { cache: "no-store", signal });
      const result = await response.json() as SummaryResponse;
      if (!response.ok || !result.success || !result.contacts || !result.conversations) throw new Error(result.message ?? "تعذر تحميل المحادثات.");
      if (signal?.aborted) return;
      setContacts(result.contacts);
      setConversations(result.conversations);
      setSummaryLoaded(true);
    } catch (loadError) {
      if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : "تعذر تحميل المحادثات.");
    }
  }, []);

  const loadConversation = useCallback(async (contactId: string, options: { initial?: boolean; older?: TeamCursor; signal?: AbortSignal } = {}) => {
    try {
      const params = new URLSearchParams({ view: "conversation", contactId });
      if (options.initial || options.older) params.set("activity", "1");
      if (options.older) {
        params.set("beforeAt", options.older.createdAt);
        params.set("beforeId", options.older.id);
      }
      const response = await fetch(`/api/team?${params}`, { cache: "no-store", signal: options.signal });
      const result = await response.json() as MessagesResponse;
      if (!response.ok || !result.success || !result.messages) throw new Error(result.message ?? "تعذر تحميل الرسائل.");
      if (options.signal?.aborted || selectedRef.current !== contactId) return;
      const page = result.messages;
      if (options.initial || options.older) {
        const last = page.at(-1);
        cursor.current = last ? { createdAt: last.createdAt, id: last.id } : null;
        setHasOlder(page.length === 50);
      }
      if (options.initial) forceBottom.current = true;
      setMessages((current) => {
        const seen = new Set(page.map((message) => message.id));
        if (options.older) return [...current, ...page.filter((message) => !current.some((item) => item.id === message.id))];
        return [...page, ...current.filter((message) => !seen.has(message.id))];
      });
      setMessagesLoaded(true);

      const unreadIds = page.filter((message) => message.recipientId === user?.id && !message.readAt).map((message) => message.id);
      if (unreadIds.length && document.visibilityState === "visible" && document.hasFocus()) {
        const readResponse = await fetch("/api/team", {
          method: "PATCH", headers: { "Content-Type": "application/json" }, signal: options.signal,
          body: JSON.stringify({ contactId, ids: unreadIds }),
        });
        const readResult = await readResponse.json() as { success?: boolean; message?: string };
        if (!readResponse.ok || !readResult.success) throw new Error(readResult.message ?? "تعذر تحديث حالة القراءة.");
        if (options.signal?.aborted || selectedRef.current !== contactId) return;
        const readSet = new Set(unreadIds);
        const readAt = new Date().toISOString();
        setMessages((current) => current.map((message) => readSet.has(message.id) ? { ...message, readAt } : message));
        window.dispatchEvent(new Event("erp:team-updated"));
        await loadSummary(options.signal);
      }
    } catch (loadError) {
      if (!options.signal?.aborted && selectedRef.current === contactId) {
        setError(loadError instanceof Error ? loadError.message : "تعذر تحميل الرسائل.");
      }
    }
  }, [loadSummary, user?.id]);

  const loadAudit = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/team?scope=all", { cache: "no-store", signal });
      const result = await response.json() as MessagesResponse;
      if (!response.ok || !result.success || !result.messages) throw new Error(result.message ?? "تعذر تحميل سجل الرسائل.");
      if (!signal?.aborted && !selectedRef.current) {
        setMessages(result.messages);
        setMessagesLoaded(true);
      }
    } catch (loadError) {
      if (!signal?.aborted) setError(loadError instanceof Error ? loadError.message : "تعذر تحميل سجل الرسائل.");
    }
  }, []);

  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => loadSummary(controller.signal));
    const timer = window.setInterval(() => void loadSummary(controller.signal), 20000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [loadSummary, user]);

  useEffect(() => {
    if (!user || user.mustChangePassword || (!selected && !audit)) return;
    const controller = new AbortController();
    const refresh = (initial = false) => audit
      ? loadAudit(controller.signal)
      : loadConversation(selected, { initial, signal: controller.signal });
    void Promise.resolve().then(() => refresh(true));
    const timer = window.setInterval(() => void refresh(), 20000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [audit, loadAudit, loadConversation, selected, user]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    if (restoreScroll.current) {
      list.scrollTop = restoreScroll.current.top + list.scrollHeight - restoreScroll.current.height;
      restoreScroll.current = null;
    } else if (forceBottom.current || list.scrollHeight - list.scrollTop - list.clientHeight < 160) {
      list.scrollTop = list.scrollHeight;
      forceBottom.current = false;
    }
  }, [messages]);

  const entries = useMemo(() => {
    const map = new Map<string, { id: string; name: string; detail: string; active: boolean; conversation?: TeamConversation }>();
    for (const contact of contacts) {
      if (contact.id !== user?.id) map.set(contact.id, {
        id: contact.id, name: contact.fullName, detail: `${contact.department} · ${contact.title}`, active: true,
      });
    }
    for (const conversation of conversations) {
      const existing = map.get(conversation.contactId);
      map.set(conversation.contactId, existing
        ? { ...existing, conversation }
        : { id: conversation.contactId, name: conversation.contactName, detail: "المستخدم غير متاح حالياً", active: false, conversation });
    }
    const term = search.trim().toLocaleLowerCase();
    return [...map.values()].filter((entry) => `${entry.name} ${entry.detail}`.toLocaleLowerCase().includes(term))
      .sort((a, b) => (b.conversation?.lastAt ?? "").localeCompare(a.conversation?.lastAt ?? "") || a.name.localeCompare(b.name, "ar"));
  }, [contacts, conversations, search, user?.id]);
  const recipient = entries.find((entry) => entry.id === selected)
    ?? contacts.filter((contact) => contact.id === selected).map((contact) => ({
      id: contact.id, name: contact.fullName, detail: `${contact.department} · ${contact.title}`, active: true,
    }))[0]
    ?? (conversations.find((conversation) => conversation.contactId === selected)
      ? { id: selected, name: conversations.find((conversation) => conversation.contactId === selected)!.contactName, detail: "المستخدم غير متاح حالياً", active: false }
      : undefined);

  function chooseContact(id: string) {
    if (!audit && selectedRef.current === id) return;
    selectedRef.current = id;
    setSelected(id);
    setAudit(false);
    setMessages([]);
    setMessagesLoaded(false);
    setHasOlder(false);
    setError("");
    cursor.current = null;
    forceBottom.current = true;
  }

  function chooseAudit() {
    if (audit) return;
    selectedRef.current = "";
    setSelected("");
    setAudit(true);
    setMessages([]);
    setMessagesLoaded(false);
    setError("");
    forceBottom.current = true;
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = drafts[selected] ?? "";
    if (!recipient?.active || sending || !body.trim()) return;
    const target = recipient.id;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/team", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: target, body }),
      });
      const result = await response.json() as { success?: boolean; message?: string };
      if (!response.ok || !result.success) throw new Error(result.message ?? "تعذر إرسال الرسالة.");
      if (selectedRef.current === target) {
        forceBottom.current = true;
        await loadConversation(target);
      }
      setDrafts((current) => current[target] === body ? { ...current, [target]: "" } : current);
      await loadSummary();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "تعذر إرسال الرسالة.");
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!selected || !cursor.current || loadingOlder) return;
    const list = messageListRef.current;
    if (list) restoreScroll.current = { height: list.scrollHeight, top: list.scrollTop };
    setLoadingOlder(true);
    await loadConversation(selected, { older: cursor.current });
    setLoadingOlder(false);
  }

  if (loading) return <div className="team-page" role="status">جارٍ تحميل الجلسة…</div>;
  if (!user || user.mustChangePassword) return <div className="team-page">سجّل الدخول وأكمل تغيير كلمة المرور لاستخدام التواصل.</div>;
  const chronological = messages.slice().reverse();
  const body = drafts[selected] ?? "";
  return (
    <div className="team-page">
      <header className="team-heading">
        <div><span className="team-eyebrow">التعاون داخل المنشأة</span><h1>تواصل فريق العمل</h1><p>محادثات محفوظة تجمع فريقك في مكان واحد.</p></div>
        <span className="team-privacy">يمكن لمدير النظام الاطلاع على الرسائل</span>
      </header>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="team-layout">
        <aside className="team-contacts" aria-label="قائمة المحادثات">
          <div className="team-contacts-heading"><div><h2>المحادثات</h2><p>فريق العمل</p></div><span aria-hidden="true">✉</span></div>
          <label className="team-search"><span className="team-sr-only">البحث عن زميل</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن اسم أو قسم…" /></label>
          {user.role === "super_admin" && <button type="button" className={audit ? "team-audit active" : "team-audit"} onClick={chooseAudit}>سجل الرسائل · إشراف المدير</button>}
          <div className="team-contact-list">
            {entries.map((entry) => (
              <button type="button" className={!audit && selected === entry.id ? "team-contact active" : "team-contact"} key={entry.id} onClick={() => chooseContact(entry.id)}>
                <span className="team-avatar" aria-hidden="true">{entry.name.slice(0, 1)}</span>
                <span className="team-contact-content">
                  <span className="team-contact-row"><strong>{entry.name}</strong>{entry.conversation && <time dateTime={entry.conversation.lastAt}>{timeLabel(entry.conversation.lastAt)}</time>}</span>
                  <span className="team-contact-row"><small>{entry.conversation ? `${entry.conversation.lastSenderId === user.id ? "أنت: " : ""}${entry.conversation.lastBody}` : entry.detail}</small>{Boolean(entry.conversation?.unreadCount) && <b className="team-unread">{entry.conversation?.unreadCount}</b>}</span>
                </span>
              </button>
            ))}
            {summaryLoaded && entries.length === 0 && <p className="team-empty">لا يوجد زملاء مطابقون.</p>}
          </div>
        </aside>
        <section className="team-conversation" aria-label="المحادثة">
          {selected || audit ? (
            <>
              <header className="team-chat-header">
                <span className="team-avatar" aria-hidden="true">{audit ? "⌕" : recipient?.name.slice(0, 1)}</span>
                <div><h2>{audit ? "سجل رسائل المنشأة" : recipient?.name ?? "المحادثة"}</h2><p>{audit ? "آخر ٢٠٠ رسالة · إشراف مدير النظام" : recipient?.detail}</p></div>
              </header>
              <div className="team-message-list" ref={messageListRef} aria-live="polite">
                {!audit && hasOlder && <button type="button" className="team-older" onClick={() => void loadOlder()} disabled={loadingOlder}>{loadingOlder ? "جارٍ التحميل…" : "عرض الرسائل الأقدم"}</button>}
                {!messagesLoaded && <p className="team-empty">جارٍ تحميل الرسائل…</p>}
                {messagesLoaded && chronological.length === 0 && <p className="team-empty">ابدأ محادثتك برسالة جديدة.</p>}
                {chronological.map((message, index) => {
                  const previous = chronological[index - 1];
                  const showDate = !previous || dateLabel(previous.createdAt) !== dateLabel(message.createdAt);
                  return (
                    <div className="team-message-group" key={message.id}>
                      {showDate && <div className="team-date">{dateLabel(message.createdAt)}</div>}
                      <article className={message.senderId === user.id ? "team-bubble mine" : "team-bubble"}>
                        {audit && <strong className="team-bubble-name">{message.senderName} ← {message.recipientName}</strong>}
                        <p>{message.body}</p>
                        <div className="team-bubble-meta"><time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time>{message.senderId === user.id && <span className={message.readAt ? "team-read" : ""} title={message.readAt ? "مقروءة" : "لم تُقرأ بعد"} aria-label={message.readAt ? "مقروءة" : "لم تُقرأ بعد"}>{message.readAt ? "✓✓" : "✓"}</span>}</div>
                      </article>
                    </div>
                  );
                })}
              </div>
              {!audit && recipient?.active && (
                <form className="team-compose" onSubmit={(event) => void send(event)}>
                  <label htmlFor="team-message" className="team-sr-only">اكتب رسالتك</label>
                  <textarea id="team-message" value={body} onChange={(event) => { const value = event.target.value; setDrafts((current) => ({ ...current, [selected]: value })); }} maxLength={4000} required rows={2} placeholder="اكتب رسالة…"
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
                  <button type="submit" className="team-send" disabled={sending || !body.trim()} aria-label="إرسال الرسالة">{sending ? "…" : "➤"}</button>
                </form>
              )}
              {!audit && recipient && !recipient.active && <p className="team-disabled">هذا المستخدم غير متاح حالياً، ويمكنك الاطلاع على سجل المحادثة.</p>}
            </>
          ) : (
            <div className="team-welcome"><span aria-hidden="true">✉</span><h2>مساحة تجمع فريقك</h2><p>اختر زميلاً من القائمة لبدء محادثة أو متابعة رسائلك المحفوظة.</p><small>تُحدّث المحادثات كل ٢٠ ثانية أثناء فتح التطبيق.</small></div>
          )}
        </section>
      </div>
      <p className="team-footnote">الأوامر والتسلسل الإداري وإشعارات التطبيقات الأخرى لم تُفعّل بعد. الرسائل محفوظة وتظهر لمدير النظام.</p>
    </div>
  );
}
