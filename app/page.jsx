"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Auth from "../components/Auth";
import CentralFinanceira from "../components/CentralFinanceira";

export default function Page() {
  const [session, setSession] = useState(undefined); // undefined = carregando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", background: "#070812" }} />;
  }
  if (!session) return <Auth />;
  return <CentralFinanceira userId={session.user.id} />;
}
