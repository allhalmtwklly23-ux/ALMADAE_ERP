"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useErpSession } from "@/components/erp-session-provider";

export function ChangePasswordForm() {
  const router = useRouter();
  const { refresh } = useErpSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور الجديدتان غير متطابقتين.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? "تعذر تغيير كلمة المرور.");
      }

      await refresh();
      router.replace("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذر تغيير كلمة المرور.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-experience">
      <aside className="login-story">
        <div className="login-orbit login-orbit-one" />
        <div className="login-story-content">
          <div className="login-monogram" aria-hidden="true">N</div>
          <span className="login-story-kicker">إعداد آمن للحساب</span>
          <h1>خطوة أخيرة<br />لبدء العمل.</h1>
          <p>اختر كلمة مرور قوية وخاصة بك. لن يتم عرضها أو مشاركتها مع أي شخص.</p>
        </div>
      </aside>

      <section className="login-card">
        <div className="login-heading">
          <span className="login-welcome">حماية الحساب</span>
          <h2>تغيير كلمة المرور</h2>
          <p>يلزم تعيين كلمة مرور جديدة قبل استخدام النظام.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>كلمة المرور الحالية</span>
            <span className="login-input-wrap">
              <span className="login-field-icon" aria-hidden="true">⌑</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                autoComplete="current-password"
              />
            </span>
          </label>
          <label className="login-field">
            <span>كلمة المرور الجديدة</span>
            <span className="login-input-wrap">
              <span className="login-field-icon" aria-hidden="true">⌑</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </span>
          </label>
          <label className="login-field">
            <span>تأكيد كلمة المرور الجديدة</span>
            <span className="login-input-wrap">
              <span className="login-field-icon" aria-hidden="true">⌑</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </span>
          </label>
          <button className="button login-submit" type="submit" disabled={busy}>
            {busy ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
          </button>
        </form>

        {error && <p className="login-error" role="alert"><span aria-hidden="true">!</span>{error}</p>}
      </section>
    </div>
  );
}
