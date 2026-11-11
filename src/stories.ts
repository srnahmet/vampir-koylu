import type { ArtworkRole } from "./domain";

export type VillageStory = {
  id: string;
  title: string;
  text: string;
  cast: readonly ArtworkRole[];
  kind: "story" | "tip" | "upcoming";
  night?: boolean;
};

export const storyInterval = 15000;
export const villageStories: readonly VillageStory[] = [
  { id: "kader-kitabi", title: "Değirmenin gizli kitabı", text: "Büyücü iki insanın kaderini bağlar. Fakat sayfalara vampir kanı değerse bedeli kendi canıdır.", cast: ["wizard"], kind: "story", night: true },
  { id: "ilk-isirik", title: "İlk kan bağı", text: "Alfa bir gece avlanmaz. Sabah köy eksilmemiştir; karanlığın ailesi ise büyümüş olabilir.", cast: ["alpha_vampire", "villager"], kind: "story", night: true },
  { id: "tek-isim", title: "Defterdeki tek isim", text: "Sapkın meydanı izler. Onun için köyün kavgası, defterindeki ismin idamıyla biter; oyun başkaları için sürer.", cast: ["fanatic"], kind: "story" },
  {
    id: "ilk-savunma",
    title: "İlk savunma",
    text: "Köyde herkes ‘Ben kesin köylüyüm’ der. En çok prova yapanın pelerini biraz uzundur.",
    cast: ["villager", "vampire"],
    kind: "story",
  },
  {
    id: "gece-vardiyasi",
    title: "Gece vardiyası",
    text: "Vampir kapıları sayar, doktor ışıkları. Köy uyurken ikisinin de işi başlar.",
    cast: ["vampire", "doctor"],
    kind: "story",
    night: true,
  },
  {
    id: "yanlis-alkis",
    title: "Yanlış alkış",
    text: "Köy, ‘Suçluyu bulduk!’ diye sevindi. Soytarı herkesten önce alkışlamaya başladı.",
    cast: ["jester", "villager"],
    kind: "story",
  },
  {
    id: "tek-pansuman",
    title: "Tek kişilik pansuman",
    text: "Doktor başkalarını tekrar tekrar koruyabilir. Kendiniyse oyun boyunca yalnızca bir kez koruyabilir.",
    cast: ["doctor"],
    kind: "tip",
    night: true,
  },
  {
    id: "sabit-numara",
    title: "Numaran aynı, sırrın sende",
    text: "Numaran oyun boyunca değişmez. Rolünü ise oyun bitene kadar yalnızca sen görürsün.",
    cast: ["villager"],
    kind: "tip",
  },
  {
    id: "uc-kisi",
    title: "Üç kişi, uzun gece",
    text: "Vampir hayattayken üç veya daha az oyuncuyla gece başlarsa vampir kazanır.",
    cast: ["vampire"],
    kind: "tip",
    night: true,
  },
  {
    id: "soytarinin-dilegi",
    title: "Soytarının dileği",
    text: "Soytarı idam edilirse tek başına kazanır. Vampir tarafından öldürülmekse planını bozar.",
    cast: ["jester", "vampire"],
    kind: "tip",
  },
  {
    id: "gizli-sandik",
    title: "Sandığın küçük sırrı",
    text: "Oy sayıları, kendi oyunu verdikten sonra görünür. Kesinleşen oyunu sonradan değiştiremezsin.",
    cast: ["villager"],
    kind: "tip",
  },
  {
    id: "yarim-koy",
    title: "İki farklı karar",
    text: "Erken geçişte yarıdan fazla istek gerekir. İdamda tek başına en çok oyu alan elenir; birincilik eşitse yeniden oylanır.",
    cast: ["villager", "doctor"],
    kind: "tip",
  },
  {
    id: "erken-gece",
    title: "Güneşi erken uğurlamak",
    text: "İlk konuşmada yaşayanların çoğunluğu isterse geceye erken geçilir. Sonraki günlerde aynı istek oylamayı açar.",
    cast: ["villager", "vampire"],
    kind: "tip",
  },
  {
    id: "sapka-agirligi",
    title: "Şapkanın ağırlığı",
    text: "Muhtarın oyu iki sayılır. Sandıktan eşitlik çıkarsa son kararı yine o verir.",
    cast: ["mayor"],
    kind: "tip",
  },
  {
    id: "son-ok",
    title: "Son bir ok",
    text: "Avcı elense bile son sözünü söyleyebilir: öldüğünde seçtiği bir oyuncuyu yanında götürür.",
    cast: ["hunter"],
    kind: "tip",
  },
  {
    id: "sessiz-sabah",
    title: "Sabahın sessizliği",
    text: "Şamanın susturduğu köylü ertesi gün yalnızca oy verebilir. Tartışmada tek kelime konuşursa elenir.",
    cast: ["shaman", "villager"],
    kind: "tip",
    night: true,
  },
  {
    id: "tek-kursun",
    title: "Tek kurşun",
    text: "Silahşörün tek atışı vardır. Köylüyü vurursa ertesi gün vicdan azabıyla kendi canına kıyar.",
    cast: ["gunslinger", "villager"],
    kind: "tip",
  },
  {
    id: "kucuk-pelerin",
    title: "Küçük pelerin, büyük miras",
    text: "Vampir ölürse yavru vampir onun avlanma yeteneğini devralır. Küçük dişleri hafife alma.",
    cast: ["vampire_cub", "vampire"],
    kind: "tip",
    night: true,
  },
  {
    id: "cifte-iz",
    title: "Ertesi gece iki iz",
    text: "Yavru vampir idam edilirse vampir ertesi gece iki kişiye saldırabilir. Köyün kararı geceyi değiştirebilir.",
    cast: ["vampire_cub", "vampire"],
    kind: "tip",
    night: true,
  },
  {
    id: "iki-sapka",
    title: "İki şapka, bir gündem",
    text: "Muhtar köyün bütçesini anlatıyordu. Silahşör, ‘Benim masrafım az, tek kurşun yeter’ dedi.",
    cast: ["mayor", "gunslinger"],
    kind: "tip",
  },
  {
    id: "sessiz-suphe",
    title: "Sessiz şüphe",
    text: "Şaman sessizliği severdi. Soytarı, susarken bile şüphe çekmenin yolunu buldu.",
    cast: ["shaman", "jester"],
    kind: "tip",
  },
  {
    id: "sut-disleri",
    title: "Süt dişleri",
    text: "Doktor yavru vampirin dişlerine baktı. ‘Bunlar süt dişi mi?’ sorusu köyü uzun süre meşgul etti.",
    cast: ["doctor", "vampire_cub"],
    kind: "tip",
  },
  {
    id: "eski-ayna",
    title: "Eski model ayna",
    text: "Vampirin evindeki aynada kimse görünmüyordu. ‘Eski model,’ dedi. Köylü garanti belgesini istedi.",
    cast: ["vampire", "villager"],
    kind: "story",
    night: true,
  },
  {
    id: "orman-izleri",
    title: "Ormandaki izler",
    text: "Avcı ormanda ayak izleri buldu. Vampir, ‘Akşam yürüyüşü sağlıktır’ diyerek konuyu değiştirdi.",
    cast: ["hunter", "vampire"],
    kind: "tip",
    night: true,
  },
  {
    id: "gece-cantasi",
    title: "Gece çantası",
    text: "Doktorun çantasında bandaj, fener ve soğumuş çay vardı. Köyün umudu pek uyumamıştı.",
    cast: ["doctor"],
    kind: "story",
    night: true,
  },
  {
    id: "bos-sandalye",
    title: "Boş sandalye, aynı takım",
    text: "Vampir idam edilirse köylüler ve doktor kazanır. Daha önce elenmiş olmak takım zaferini engellemez.",
    cast: ["villager", "doctor"],
    kind: "tip",
  },
  {
    id: "iki-sir",
    title: "Bir gece, iki sır",
    text: "Doktor, vampirin kimi hedeflediğini bilmez. Koruyacağı kişiyi kendi tahminiyle seçer.",
    cast: ["doctor", "vampire"],
    kind: "tip",
    night: true,
  },
  {
    id: "sans-zarlari",
    title: "Şansın zarları",
    text: "Doktor ve soytarı şansa bırakılmışsa ikisi de, yalnızca biri veya hiçbiri oyuna gelebilir.",
    cast: ["doctor", "jester"],
    kind: "tip",
  },
  {
    id: "iki-tur-soz",
    title: "Herkese iki tur söz",
    text: "Sıra bazlı konuşmada herkes iki tur konuşur. Ardından kalan gündüz süresinde söz hepinizindir.",
    cast: ["villager", "doctor"],
    kind: "tip",
  },
  {
    id: "sabirli-sandik",
    title: "Sabırlı sandık",
    text: "Herkes oy verse bile oylamanın asgari süresi beklenir. Köy acele etse de sandık etmez.",
    cast: ["villager", "jester"],
    kind: "tip",
  },
];

// A fresh local draw, independent of room data and private player roles.
export function randomStoryIndex(previous: number | null = null) {
  const choice = Math.floor(
    Math.random() * (villageStories.length - (previous === null ? 0 : 1)),
  );
  return previous !== null && choice >= previous ? choice + 1 : choice;
}
