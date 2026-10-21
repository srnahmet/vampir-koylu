import { createClient } from "@supabase/supabase-js";
export type Role = "villager" | "vampire" | "doctor" | "jester";
export type Theme = "classic" | "lavender" | "forest" | "peach";
export type Settings = {
  day_seconds: number;
  night_seconds: number;
  vote_seconds: number;
  runoff_seconds: number;
  doctor: boolean;
  jester: boolean;
  theme: Theme;
};
export const defaults: Settings = {
  day_seconds: 300,
  night_seconds: 15,
  vote_seconds: 20,
  runoff_seconds: 60,
  doctor: false,
  jester: false,
  theme: "classic",
};
export type Player = {
  id: string;
  number: number;
  name: string;
  alive: boolean;
  online?: boolean;
  role: Role | null;
  eliminated_by?: string;
  self_heal_used?: boolean;
};
export type Game = {
  code: string;
  phase: string;
  seq: number;
  day: number;
  started_at: string;
  ends_at: string;
  server_now: string;
  settings: Settings;
  is_host: boolean;
  players: Player[];
  me: Player;
  my_turn: boolean;
  has_chosen: boolean;
  my_vote: string | null;
  tally: Record<string, number> | null;
  early_count: number;
  early_mine: boolean;
  votes_cast: number;
  winner: string | null;
  announcement: {
    kind: string;
    text: string;
    number?: number;
    name?: string;
  } | null;
  events: { day: number; text: string }[];
};
export const roles: Record<
  Role,
  {
    name: string;
    tag: string;
    description: string;
    win: string;
    lose: string;
    color: string;
  }
> = {
  villager: {
    name: "Köylü",
    tag: "KÖYÜNE SAHİP ÇIK",
    description:
      "Gündüz ipuçlarını birleştir, şüphelileri dinle ve oyunu kullan. Gece gizli bir hamlen yok.",
    win: "Vampir idam edilirse köy takımı kazanır. Sen elensen de takımın kazanabilir.",
    lose: "Vampir veya şarlatan kazanırsa köy takımı kaybeder.",
    color: "#e6ae54",
  },
  vampire: {
    name: "Vampir",
    tag: "MASUM GİBİ DAVRAN",
    description:
      "Her gece hayatta olan başka bir oyuncuyu gizlice hedefle. Gündüz kimliğini belli etme!",
    win: "Hayattayken 3 veya daha az kişiyle geceye girersen kazanırsın.",
    lose: "İdam edilirsen kaybedersin. Şarlatan idam edilirse de oyun onun olur.",
    color: "#a594d1",
  },
  doctor: {
    name: "Doktor",
    tag: "BU KÖY SANA EMANET",
    description:
      "Vampirin ardından, hedefini bilmeden birini koru. Kendini tüm oyunda yalnızca 1 kez koruyabilirsin; başkalarını tekrar koruyabilirsin.",
    win: "Vampir idam edilirse köy takımıyla kazanırsın. Elenmiş olman bunu değiştirmez.",
    lose: "Vampir veya şarlatan kazanırsa kaybedersin.",
    color: "#7cbda7",
  },
  jester: {
    name: "Şarlatan",
    tag: "BİRAZ ŞÜPHELİ OL",
    description:
      "Amacın köyü senin vampir olduğuna inandırmak. Tartışmayı biraz karıştır!",
    win: "Çoğunluk oyuyla idam edilirsen yalnızca sen kazanırsın ve oyun biter.",
    lose: "Vampir seni öldürürse veya başka bir taraf kazanırsa kaybedersin.",
    color: "#e49a97",
  },
};
export const themes: { id: Theme; name: string; colors: string[] }[] = [
  {
    id: "classic",
    name: "Köy Klasiği",
    colors: ["#f6e9c8", "#9cae80", "#b1a3d0"],
  },
  {
    id: "lavender",
    name: "Lavanta Düşü",
    colors: ["#eee4f5", "#b2a4d1", "#8879ad"],
  },
  {
    id: "forest",
    name: "Orman Masalı",
    colors: ["#e4eee1", "#8bb79d", "#4e7b68"],
  },
  {
    id: "peach",
    name: "Şeftali Bahçesi",
    colors: ["#f8e1d3", "#e9aa96", "#b6798f"],
  },
];
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
export async function session() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const { error } = await db.auth.signInAnonymously();
    if (error) throw error;
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
