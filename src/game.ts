import { createClient } from "@supabase/supabase-js";
export * from "./domain";
// This is a public browser key, never a service-role/secret key.
const url =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://pdqtsrwclrfenmrtsluh.supabase.co";
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_vQ4oPh7WDw0Tu__npkWFTw_SQ8-uhwS";
export const db = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
let signingIn: Promise<void> | null = null;
export async function session() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    // Allowance loading and a quick tap on Create must share one identity.
    signingIn ||= db.auth
      .signInAnonymously()
      .then(({ error }) => {
        if (error) throw error;
      })
      .finally(() => {
        signingIn = null;
      });
    await signingIn;
  }
}
export async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
export function friendlyError(e: unknown) {
  const msg =
    e instanceof Error
      ? e.message
      : String((e as { message?: string })?.message || e);
  if (/anonymous.*disabled/i.test(msg))
    return "Misafir girişi henüz açılmamış. Kurulumda Anonymous Sign-ins seçeneğini açın.";
  if (/schema cache|function.*not exist/i.test(msg))
    return "Köy hazırlanıyor. Supabase kurulum dosyasının çalıştırılması gerekiyor.";
  if (/fetch|network/i.test(msg))
    return "Bağlantı kurulamadı. İnternetini kontrol et; aynı ekrandan devam edebilirsin.";
  if (/rate limit/i.test(msg))
    return "Çok sayıda giriş denemesi oldu. Biraz sonra tekrar deneyin.";
  return msg;
}
