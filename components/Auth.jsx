"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setMsg("");
    const fn = mode === "login"
      ? supabase.auth.signInWithPassword({ email, password: pw })
      : supabase.auth.signUp({ email, password: pw });
    const { error } = await fn;
    if (error) setMsg(error.message);
    else if (mode === "signup") setMsg("Conta criada. Confirme no e-mail e volte a entrar.");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#070812", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans',sans-serif", color: "#dcdcf0" }}>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: "-0.03em", color: "#f0f0ff", margin: "0 0 4px" }}>Central Financeira</h1>
        <p style={{ color: "#8a8aaa", fontSize: 13, margin: "0 0 24px" }}>{mode === "login" ? "Entra pra ver teu financeiro." : "Cria tua conta."}</p>
        <div style={{ display: "grid", gap: 12 }}>
          <input placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} type="email" />
          <input placeholder="senha" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inp} type="password" />
          <button onClick={submit} disabled={loading} style={btn}>{loading ? "..." : mode === "login" ? "Entrar" : "Criar conta"}</button>
          {msg && <p style={{ fontSize: 12, color: "#fbbf24", margin: 0 }}>{msg}</p>}
          <button onClick={() => setMode(mode === "login" ? "signup" : "login")} style={{ background: "none", border: "none", color: "#a78bfa", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            {mode === "login" ? "Não tenho conta" : "Já tenho conta"}
          </button>
        </div>
      </div>
    </div>
  );
}
const inp = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.055)", borderRadius: 11, padding: "12px 13px", color: "#dcdcf0", fontSize: 15, fontFamily: "inherit", outline: "none" };
const btn = { background: "linear-gradient(135deg,#7c6ef7,#a78bfa)", color: "#fff", border: "none", borderRadius: 12, padding: 13, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" };
