"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

type AuthView = "sign-in" | "sign-up" | "forgot" | "update-password";

export function AuthPanel() {
  const { user, loading, configured, authEvent, signIn, signUp, signOut, sendPasswordReset, updatePassword } = useAuth();
  const [view, setView] = useState<AuthView>("sign-in");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeView = authEvent === "PASSWORD_RECOVERY" ? "update-password" : view;

  const runAction = async (action: () => Promise<{ error: string | null }>, successMessage: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      if (result.error) setError(result.error);
      else setMessage(successMessage);
    } catch {
      setError("تعذر إكمال الطلب الآن. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="auth-state" role="status">جارٍ التحقق من حسابك…</div>;

  if (!configured) {
    return <section className="auth-setup"><span className="eyebrow">حساب المدار</span><h2>تسجيل الدخول جاهز للربط</h2><p>اربط مشروع Supabase لتفعيل إنشاء الحسابات وتسجيل الدخول بالبريد وكلمة المرور.</p><ol><li>أنشئ مشروعًا في Supabase وفعّل Email في Authentication.</li><li>انسخ القيم إلى ملف <code>.env.local</code> داخل المشروع.</li><li>أضف عنوان الموقع المحلي وعنوان Vercel إلى قائمة Redirect URLs في Supabase.</li></ol><pre>{"NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY"}</pre><p className="auth-security-note">كلمات المرور تُدار لدى Supabase ولا تُحفظ في ملفات المتجر. لا تضع مفتاح service role في الواجهة.</p></section>;
  }

  if (user && activeView !== "update-password") {
    const name = typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : "";
    return <section className="auth-account"><span className="eyebrow">حسابك في المدار</span><h2>أهلًا {name || "بك"}</h2><p>تم تسجيل الدخول بهذا البريد الإلكتروني:</p><strong className="account-email" dir="ltr">{user.email}</strong><div className="account-status"><span className="account-status-dot" />حسابك مسجل الدخول على هذا الجهاز</div><button className="button button-secondary" type="button" disabled={busy} onClick={() => void runAction(signOut, "تم تسجيل الخروج.")}>{busy ? "جارٍ تسجيل الخروج…" : "تسجيل الخروج"}</button>{message && <p className="auth-success" role="status">{message}</p>}</section>;
  }

  const title = activeView === "sign-up" ? "أنشئ حسابك" : activeView === "forgot" ? "استعادة كلمة المرور" : activeView === "update-password" ? "كلمة مرور جديدة" : "سجّل دخولك";
  return <section className="auth-card"><div className="auth-heading"><span className="eyebrow">حساب المدار</span><h2>{title}</h2><p>{activeView === "sign-up" ? "احفظ بياناتك لتعود إلى حسابك متى احتجت." : activeView === "forgot" ? "نرسل لك رابطًا آمنًا لإعادة تعيين كلمة المرور." : activeView === "update-password" ? "اختر كلمة مرور جديدة لحسابك." : "ادخل إلى حسابك وتابع تجربة المدار."}</p></div>
    <form className="auth-form" onSubmit={(event) => { event.preventDefault(); if (activeView === "sign-up") void runAction(() => signUp(fullName, email, password), "تم إنشاء الحساب. تحقق من بريدك إذا طُلب تأكيده."); else if (activeView === "forgot") void runAction(() => sendPasswordReset(email), "إذا كان البريد مسجلًا، سيصلك رابط الاستعادة."); else if (activeView === "update-password") void runAction(() => updatePassword(password), "تم تحديث كلمة المرور. يمكنك متابعة حسابك الآن."); else void runAction(() => signIn(email, password), "تم تسجيل الدخول."); }}>
      {activeView === "sign-up" && <label>الاسم الكامل<input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={80} /></label>}
      {activeView !== "update-password" && <label>البريد الإلكتروني<input type="email" autoComplete="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
      {activeView !== "forgot" && <label>{activeView === "update-password" ? "كلمة المرور الجديدة" : "كلمة المرور"}<input type="password" autoComplete={activeView === "sign-up" ? "new-password" : activeView === "update-password" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>}
      {activeView === "sign-in" && <button className="auth-inline-link" type="button" onClick={() => { setView("forgot"); setMessage(""); setError(""); }}>نسيت كلمة المرور؟</button>}
      <button className="button auth-submit" type="submit" disabled={busy}>{busy ? "لحظة من فضلك…" : activeView === "sign-up" ? "إنشاء الحساب" : activeView === "forgot" ? "إرسال رابط الاستعادة" : activeView === "update-password" ? "حفظ كلمة المرور" : "تسجيل الدخول"}<span aria-hidden="true">←</span></button>
    </form>
    {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="auth-success" role="status">{message}</p>}
    <div className="auth-switch">{activeView === "sign-in" ? <>ليس لديك حساب؟ <button type="button" onClick={() => { setView("sign-up"); setMessage(""); setError(""); }}>أنشئ حسابًا</button></> : activeView !== "update-password" ? <><span>تتذكر بياناتك؟</span><button type="button" onClick={() => { setView("sign-in"); setMessage(""); setError(""); }}>العودة لتسجيل الدخول</button></> : null}</div>
  </section>;
}
