"use client";

import { FormEvent, useState } from "react";

export default function AdminRecoveryPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirm) {
      setMessage("كلمتا المرور غير متطابقتين.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/admin-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-recovery-token": token },
        body: JSON.stringify({ newPassword: password }),
        cache: "no-store",
      });
      const result = await response.json();
      setMessage(result.message || (result.success ? "تمت الاستعادة." : "فشلت العملية."));
      if (result.success) {
        setToken("");
        setPassword("");
        setConfirm("");
      }
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main dir="rtl" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f6fa", padding: 24 }}>
      <form onSubmit={submit} autoComplete="off" style={{ width: "100%", maxWidth: 440, background: "#fff", padding: 28, borderRadius: 16, boxShadow: "0 10px 35px #10213b18" }}>
        <h1 style={{ color: "#020b2d", fontSize: 24, fontWeight: 700 }}>استعادة حساب المدير</h1>
        <p style={{ color: "#5b6475", lineHeight: 1.8 }}>هذه الصفحة مخصصة لاستعادة حساب A123 فقط. أدخل رمز الاستعادة الذي أعددته في Vercel وكلمة مرور جديدة قوية.</p>
        <label style={{ display: "block", marginTop: 18, fontWeight: 600 }}>رمز الاستعادة المؤقت</label>
        <input required type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" style={fieldStyle} />
        <label style={{ display: "block", marginTop: 16, fontWeight: 600 }}>كلمة المرور الجديدة (12 خانة على الأقل)</label>
        <input required minLength={12} maxLength={128} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" style={fieldStyle} />
        <label style={{ display: "block", marginTop: 16, fontWeight: 600 }}>تأكيد كلمة المرور</label>
        <input required minLength={12} maxLength={128} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" style={fieldStyle} />
        <button disabled={busy} type="submit" style={{ width: "100%", marginTop: 22, padding: 13, border: 0, borderRadius: 9, background: "#020b2d", color: "#fff", fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>{busy ? "جارٍ التنفيذ..." : "استعادة الحساب"}</button>
        {message && <p role="status" style={{ marginTop: 18, lineHeight: 1.8, color: "#26344a" }}>{message}</p>}
      </form>
    </main>
  );
}

const fieldStyle = { width: "100%", boxSizing: "border-box" as const, marginTop: 8, padding: 12, border: "1px solid #ccd2dc", borderRadius: 8, fontSize: 16 };
