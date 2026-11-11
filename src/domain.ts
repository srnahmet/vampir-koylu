export type Role = "villager" | "vampire" | "doctor" | "jester" | UpcomingRole;
export type RoleMode = "always" | "random" | "never";
export type UpcomingRole =
  | "mayor"
  | "bodyguard"
  | "hunter"
  | "shaman"
  | "gunslinger"
  | "vampire_cub"
  | "wizard"
  | "alpha_vampire"
  | "fanatic";
export type ArtworkRole = Role | UpcomingRole;
export type RoomQuota = {
  limit: number;
  used: number;
  remaining: number;
  next_refresh_at: string | null;
  server_now: string;
};
export const roleModeLabels: Record<RoleMode, string> = {
  always: "Kesin olsun",
  random: "Şansa bırak",
  never: "Olmasın",
};
export const upcomingRoles: {
  id: UpcomingRole;
  name: string;
  flavor: string;
  features: string;
}[] = [
  {
    id: "mayor",
    name: "Muhtar",
    flavor: "Köy meydanının tanıdık yüzü.",
    features:
      "Verdiği oy iki sayılır. Oylama eşit biterse kimin idam edileceğine o karar verir.",
  },
  {
    id: "bodyguard",
    name: "Koruma",
    flavor: "Kalkanı hazır, gözü kapıda.",
    features: "Koruduğu kişi saldırıya uğrarsa onun yerine ölür.",
  },
  {
    id: "hunter",
    name: "Avcı",
    flavor: "Ormandan yeni izlerle geliyor.",
    features: "Öldüğünde seçtiği bir oyuncuyu yanında götürür.",
  },
  {
    id: "shaman",
    name: "Şaman",
    flavor: "Rüzgâr ona bir şeyler fısıldıyor.",
    features:
      "Her gece bir köylüyü susturur. Ertesi gün tartışmada konuşamaz, yalnızca oy verebilir. Konuşursa elenir.",
  },
  {
    id: "gunslinger",
    name: "Silahşör",
    flavor: "Şapkasının altında yeni bir sır.",
    features:
      "Oyun boyunca bir kez bir oyuncuyu vurabilir. Köylüyü vurursa ertesi gün vicdan azabıyla kendi canına kıyar.",
  },
  {
    id: "vampire_cub",
    name: "Yavru Vampir",
    flavor: "Küçük dişler. Kocaman bir sır.",
    features:
      "İdam edilirse vampir ertesi gece iki kişiye saldırabilir. Vampir ölürse onun avlanma yeteneğini devralır.",
  },
];
export type Theme = "classic" | "lavender" | "forest" | "peach" | "ocean" | "sunset" | "moonlight";
export type Settings = {
  day_seconds: number;
  two_vampires: boolean;
  turn_seconds: number;
  random_theme: boolean;
  night_seconds: number;
  night_grace_seconds: number;
  wizard: RoleMode;
  alpha_vampire: RoleMode;
  fanatic: RoleMode;
  vote_seconds: number;
  runoff_seconds: number;
  mayor: RoleMode;
  bodyguard: RoleMode;
  hunter: RoleMode;
  shaman: RoleMode;
  gunslinger: RoleMode;
  vampire_cub: RoleMode;
  doctor: RoleMode;
  jester: RoleMode;
  theme: Theme;
  host_plays: boolean;
  turn_based: boolean;
  voice_enabled: boolean;
  disconnect_seconds: number;
  pin_enabled: boolean;
};
export const defaults: Settings = {
  day_seconds: 300,
  two_vampires: false,
  turn_seconds: 30,
  random_theme: false,
  night_seconds: 15,
  night_grace_seconds: 10,
  wizard: "never",
  alpha_vampire: "never",
  fanatic: "never",
  vote_seconds: 20,
  runoff_seconds: 60,
  mayor: "never",
  bodyguard: "never",
  hunter: "never",
  shaman: "never",
  gunslinger: "never",
  vampire_cub: "never",
  doctor: "never",
  jester: "never",
  theme: "classic",
  host_plays: true,
  turn_based: false,
  voice_enabled: false,
  disconnect_seconds: 60,
  pin_enabled: false,
};
export type Player = {
  id: string;
  number: number;
  name: string;
  alive: boolean;
  online?: boolean;
  ready: boolean;
  disconnect_ends_at?: string | null;
  role: Role | null;
  eliminated_by?: string;
  self_heal_used?: boolean;
  shot_used?: boolean;
  silenced?: boolean;
  can_hunt?: boolean;
  faction?: "village" | "vampire" | "independent";
  won?: boolean | null;
  wizard_used?: boolean;
  alpha_used?: boolean;
  fanatic_target?: string | null;
  fanatic_won?: boolean;
  fanatic_target_mark?: boolean;
  role_notices?: { id: string; kind: string; text: string; role: Role }[];
};
export type Game = {
  code: string;
  phase: string;
  rules_version?: number;
  tie_streak?: number;
  night_base_ends_at?: string | null;
  night_choice?: { kind: string; targets: string[] } | null;
  seq: number;
  day: number;
  round_number: number;
  started_at: string;
  ends_at: string;
  server_now: string;
  settings: Settings;
  is_host: boolean;
  is_observer: boolean;
  host?: {
    player_id: string | null;
    name: string;
    online: boolean;
    revision: number;
    recovery_ends_at: string | null;
  };
  vote_candidates?: string[];
  votes_required?: number;
  can_vote?: boolean;
  summary?: { complete: boolean; actions: RoundAction[] } | null;
  players: Player[];
  me: Player | null;
  speech: {
    order: string[];
    turn_index: number;
    round: number;
    speaker_id: string | null;
    ends_at: string | null;
    slot_ms: number;
    group: boolean;
  } | null;
  night_action?: "kill" | "protect" | "guard" | "silence" | "swap" | null;
  attack_number?: number;
  excluded_targets?: string[];
  vampire_decision?: { target: string; random: boolean; automatic?: boolean } | null;
  vampire_team?: { id: string; target: string | null; kind?: string | null }[] | null;
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
export type RoundAction = {
  id: number;
  day: number;
  seq: number;
  kind: "vote" | "kill" | "protect" | "vote_result" | "guard" | "silence" | "shoot" | "revenge" | "decide" | "silence_breach" | "swap" | "bite";
  actor: string | null;
  target: string | null;
  status: "pending" | "cancelled" | "counted" | "resolved" | "tie" | "execution";
  details: { outcome?: "saved" | "killed" | "missed" | "guarded" | "converted"; automatic?: boolean; candidates?: string[]; other_target?: string; cursed?: boolean };
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
  wizard: { name: "Büyücü", tag: "KADERİN İKİ UCUNU BAĞLA", description: "Eski değirmende saklanan büyü kitabı, iki insanın kaderini birbirine bağlar. En az 8 oyuncuda dağıtılır. Oyun boyunca bir gece, kendin dışında yaşayan iki kişinin rollerini ve kullanılmamış yetenek haklarını değiştirirsin. Onlar yalnızca ‘Büyülendin’ bilgisini ve yeni rollerini görür. Aynı gecenin saldırı, koruma ve susturma seçimleri de rollerle birlikte taşınır: hedef alınan rolü devralan kişi ölür veya korunur. İki rolden biri vampir takımındaysa büyünün bedeli olarak doğrudan ölürsün; doktor bu bedeli engelleyemez. Pas geçersen hakkın kalır.", win: "Köy takımındasın. Vampir takımının tüm üyeleri elenirse ölmüş olsan da kazanırsın.", lose: "Vampir takımı veya soytarı kazanırsa kaybedersin.", color: "#8d75b5" },
  alpha_vampire: { name: "Alfa Vampir", tag: "İLK ISIRIK, YENİ BİR YOLDAŞ", description: "Köyün ilk karanlığından gelen Alfa, kan bağını bir kez daha kurabilir. En az 8 oyuncuda mevcut vampirlerden birinin yerini alır; başlangıçtaki vampir sayısını artırmaz. Oyun boyunca bir gece öldürmek yerine bir oyuncuyu vampire dönüştürebilirsin. O gece takımının bütün öldürme saldırıları iptal olur; Yavru Vampir’in ek saldırısı da kullanılmış sayılır. Doktor hedefi korursa dönüşüm engellenir ve hakkın harcanır. Dönüşümü yalnızca yeni vampir öğrenir. Başka bir yetenek ölüm yaratmadıysa köy ‘kimse ölmedi’ bilgisini görür. Dönüşüm hakkından sonra normal avlanmaya devam edersin.", win: "Vampir takımındasın. Vampirler hayattayken köy 3 veya daha az kişiyle geceye girerse ya da yalnızca vampirler kalırsa takımın kazanır. Elenmiş olsan da takımınla kazanırsın.", lose: "Vampir takımının tamamı elenirse veya soytarı idam edilirse kaybedersin.", color: "#ad687f" },
  fanatic: { name: "Sapkın", tag: "TEK İSİM, TEK TAKINTI", description: "Meydanın kıyısında bekleyen Sapkın’ın defterinde tek bir isim yazılıdır. En az 6 oyuncuda dağıtılır. Başlangıçta sana gizlice bir hedef oyuncu gösterilir; hedefinin rolünü öğrenmezsin. Yalnızca bu kişi köy oylamasıyla veya muhtar kararıyla idam edilirse kişisel zaferin kesinleşir. Oyun sürer; sonradan ölsen ya da rolün değişse bile kazanmış sayılırsın. Hedefin gece veya başka bir yetenekle ölürse bu görevle kazanamazsın. Hedefin oyun sonunda damgalanır.", win: "Bağımsızsın. Hedefinin köy kararıyla idam edilmesi gerekir; köyün veya vampirlerin takım zaferi tek başına seni kazandırmaz.", lose: "Hedefin idam edilmeden oyun biterse kaybedersin. Vampirin hedefini öldürmesi zafer sağlamaz.", color: "#ba875f" },
  mayor: { name: "Muhtar", tag: "SON SÖZÜN AĞIRLIĞI", description: "Verdiğin oy iki oy sayılır. En yüksek oy eşitse yaşayan muhtar, eşit adaylardan birini seçerek idamı belirler. Kendini de seçebilirsin. 30 saniyede karar vermezsen ek tartışma ve tekrar oylaması yapılır.", win: "Vampir takımının tüm üyeleri elenirse köyle birlikte kazanırsın.", lose: "Vampir takımı veya soytarı kazanırsa kaybedersin.", color: "#577f8d" },
  bodyguard: { name: "Koruma", tag: "KALKANIN BİR SÖZ", description: "Her gece başka birini koru. Hedefin doktor tarafından kurtarılmamışsa saldırıda onun yerine ölürsün. Doktorun seni koruması bu fedakârlığı durdurmaz. Bir gecede en fazla bir saldırıyı üstlenirsin. O gece kendin de hedef olsan bile seçtiğin kişiyi korursun.", win: "Köy takımıyla kazanırsın; fedakârlık yapmış olman bunu değiştirmez.", lose: "Vampir takımı veya soytarı kazanırsa kaybedersin.", color: "#779897" },
  hunter: { name: "Avcı", tag: "SON BİR OK", description: "Oyun içinde öldüğünde hayatta olan bir oyuncuyu son okunla elersin. 30 saniyede hedef seçmezsen rastgele hedef belirlenir. Bağlantıdan elenme veya masadan çıkarılma son atış vermez. Son atış sonuçlanmadan takım zaferi hesaplanmaz.", win: "Vampir takımının tüm üyeleri elenirse köyle kazanırsın.", lose: "Vampir takımı veya soytarı kazanırsa kaybedersin.", color: "#7d995e" },
  shaman: { name: "Şaman", tag: "SESSİZLİĞİN FISILTISI", description: "Her gece başka bir oyuncuyu ertesi gün için sustur. Susturulan oyuncu oy kullanabilir ama konuşma sırasına girmez ve uygulama mikrofonunu açamaz. Aynı ortamda konuşursa masa sahibi ‘Konuştu’ ile sessizlik ihlalini işaretler ve oyuncu elenir. Etki bir gündür.", win: "Köy takımıyla kazanırsın.", lose: "Vampir takımı veya soytarı kazanırsa kaybedersin.", color: "#9b83b5" },
  gunslinger: { name: "Silahşör", tag: "TEK ATIŞ, TEK KARAR", description: "İlk konuşma, gündüz veya ek tartışmada oyun boyunca bir kez başka bir oyuncuyu vurabilirsin. Vurduğun kişi köy takımındaysa bir sonraki gün başında sen de elenirsin. Vampir takımını veya soytarıyı vurmak bu bedeli doğurmaz; soytarı vurularak kazanamaz.", win: "Köy takımıyla kazanırsın.", lose: "Vampir takımı veya soytarı kazanırsa kaybedersin.", color: "#a36e63" },
  vampire_cub: { name: "Yavru Vampir", tag: "KÜÇÜK DİŞLER, BÜYÜK MİRAS", description: "Vampir takımındasın. Yetişkin vampirler hayattayken geceleri bekle; son yetişkin elenince avlanmayı devralırsın. İdam edilirsen takımın sonraki gece iki farklı hedefe saldırır. Diğer ölüm türleri bu ek saldırıyı açmaz.", win: "Vampir takımı kazanırsa elenmiş olsan da kazanırsın. Sen hayattayken köy vampir takımını bitirmiş sayılmaz.", lose: "Vampir takımının tüm üyeleri elenirse veya soytarı idam edilirse kaybedersin.", color: "#a18abb" },
  villager: {
    name: "Köylü",
    tag: "KÖYÜNE SAHİP ÇIK",
    description:
      "Gündüz ipuçlarını birleştir, şüphelileri dinle ve oyunu kullan. Gece gizli bir hamlen yok.",
    win: "Vampir takımının tüm üyeleri elenirse köy takımı kazanır. Sen elensen de takımın kazanabilir.",
    lose: "Vampir veya soytarı kazanırsa köy takımı kaybeder.",
    color: "#e6ae54",
  },
  vampire: {
    name: "Vampir",
    tag: "MASUM GİBİ DAVRAN",
    description:
      "Her gece hayatta olan başka bir oyuncuyu gizlice hedefle. Gündüz kimliğini belli etme!",
    win: "Hayattayken 3 veya daha az kişiyle geceye girersen kazanırsın.",
    lose: "Vampir takımının tüm üyeleri elenirse kaybedersin. Soytarı idam edilirse oyun onun olur.",
    color: "#a594d1",
  },
  doctor: {
    name: "Doktor",
    tag: "BU KÖY SANA EMANET",
    description:
      "Diğer gece karakterleriyle aynı anda, vampirin hedefini bilmeden birini koru. Alfa’nın dönüşümünü de engellersin. Kendini tüm oyunda yalnızca 1 kez koruyabilirsin; başkalarını tekrar koruyabilirsin. İstersen pas geçebilirsin.",
    win: "Vampir takımının tüm üyeleri elenirse köy takımıyla kazanırsın. Elenmiş olman bunu değiştirmez.",
    lose: "Vampir veya soytarı kazanırsa kaybedersin.",
    color: "#7cbda7",
  },
  jester: {
    name: "Soytarı",
    tag: "BİRAZ ŞÜPHELİ OL",
    description:
      "Amacın köyü senin vampir olduğuna inandırmak. Tartışmayı biraz karıştır!",
    win: "En çok oyu tek başına alıp veya muhtar kararıyla idam edilirsen ana zaferi kazanırsın ve oyun biter. Görevini daha önce tamamlayan Sapkın kişisel zaferini korur.",
    lose: "Vampir seni öldürürse veya başka bir taraf kazanırsa kaybedersin.",
    color: "#e49a97",
  },
};
export const activeRoles: Role[] = ["villager", "vampire", "doctor", "jester", "mayor", "hunter", "shaman", "gunslinger", "vampire_cub", "wizard", "alpha_vampire", "fanatic"];
export const optionalRoles = activeRoles.filter((role): role is Exclude<Role, "villager" | "vampire"> => role !== "villager" && role !== "vampire");
export function factionOf(role: Role): "village" | "vampire" | "independent" {
  return ["vampire", "alpha_vampire", "vampire_cub"].includes(role) ? "vampire" : ["jester", "fanatic"].includes(role) ? "independent" : "village";
}
export const factionLabels = { village: "Köy takımı", vampire: "Vampir takımı", independent: "Bağımsız" };
export function minimumPlayers(role: Role) { return role === "wizard" || role === "alpha_vampire" ? 8 : role === "fanatic" ? 6 : 4; }
export const themes: { id: Theme; name: string; colors: string[] }[] = [
  { id: "ocean", name: "Deniz Esintisi", colors: ["#e0f2f3", "#77b9bb", "#42768c"] },
  { id: "sunset", name: "Gün Batımı", colors: ["#fff0db", "#e9a279", "#b56a66"] },
  { id: "moonlight", name: "Ay Işığı", colors: ["#e9ecf8", "#949fca", "#62658f"] },
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
