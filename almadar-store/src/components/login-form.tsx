"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useErpSession } from "@/components/erp-session-provider";

export function LoginForm() {
  const router = useRouter();
  const { refresh } = useErpSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "فشل تسجيل الدخول.");
      }
      if (!await refresh()) throw new Error("تم تسجيل الدخول لكن تعذر التحقق من الجلسة. حدّث الصفحة وحاول مجدداً.");

      if (payload.mustChangePassword) {
        router.replace("/change-password");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر تسجيل الدخول الآن.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-experience">
      <aside className="login-story">
        <div className="login-orbit login-orbit-one" />
        <div className="login-orbit login-orbit-two" />
        <div className="login-story-content">
          <div className="login-monogram" aria-hidden="true">N</div>
          <span className="login-story-kicker">NEXA BUSINESS SUITE</span>
          <h1>وضوح أكبر.<br />قرارات أذكى.</h1>
          <p>مساحة موحدة لإدارة المال والعمليات، بتجربة مصممة لتبقي التفاصيل تحت السيطرة.</p>
          <div className="login-story-foot">
            <span className="login-live-dot" />
            <span>بيئة عمل آمنة ومتصلة</span>
          </div>
        </div>
      </aside>

      <section className="login-card auth-card">
        <div className="login-heading">
          <span className="login-welcome">مرحباً بعودتك</span>
          <h2>تسجيل الدخول</h2>
          <p>أدخل بيانات حسابك للوصول إلى مساحة العمل.</p>
        </div>

        <form className="login-form auth-form" onSubmit={handleSubmit}>
          <label className="login-field" htmlFor="login-username">
            <span>اسم المستخدم</span>
            <span className="login-input-wrap">
              <span className="login-field-icon" aria-hidden="true">♙</span>
              <input
                id="login-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="مثال: A123"
              />
            </span>
          </label>

          <label className="login-field" htmlFor="login-password">
            <span>كلمة المرور</span>
            <span className="login-input-wrap">
              <span className="login-field-icon" aria-hidden="true">⌑</span>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                placeholder="أدخل كلمة المرور"
              />
              <button
                type="button"
                className="password-visibility"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                aria-pressed={showPassword}
              >
                {showPassword ? "إخفاء" : "إظهار"}
              </button>
            </span>
          </label>

          <div className="login-options">
            <label className="remember-option">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
              <span>تذكرني على هذا الجهاز</span>
            </label>
            <span className="login-help-hint">نسيت كلمة المرور؟ تواصل مع مدير النظام.</span>
          </div>

          <button className="button login-submit" type="submit" disabled={busy}>
            {busy ? <><span className="login-spinner" aria-hidden="true" /> جارٍ التحقق...</> : <>دخول آمن <span aria-hidden="true">←</span></>}
          </button>
        </form>

        {error && <p className="login-error auth-error" role="alert"><span aria-hidden="true">!</span>{error}</p>}
        <div className="login-security-note"><span aria-hidden="true">◈</span> جلسة محمية بتشفير واتصال آمن</div>
      </section>
    </div>
  );
}
