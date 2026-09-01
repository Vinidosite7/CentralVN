import { supabase } from "./supabase";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function subscribePush(userIdArg) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "unsupported" };

    // pega o usuário DIRETO da sessão atual (evita prop desatualizada de conta antiga)
    const { data: sess } = await supabase.auth.getUser();
    const userId = sess?.user?.id || userIdArg;
    if (!userId) return { ok: false, reason: "no-user" };

    const perm = await Notification.requestPermission();
    if (perm !== "granted") return { ok: false, reason: "denied" };

    const key = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim().replace(/\s/g, "");
    if (!key) return { ok: false, reason: "no-key" };

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    const json = sub.toJSON();

    // remove registro antigo desse endpoint (de tentativas anteriores)
    await supabase.from("push_subscriptions").delete().eq("endpoint", json.endpoint);

    const { error } = await supabase.from("push_subscriptions").insert({
      user_id: userId,
      endpoint: json.endpoint,
      subscription: json,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, reason: "db:" + (error.message || "").slice(0, 40) };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.name ? e.name : "error") };
  }
}

export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
