import { useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Sprite } from "./art";
import { roles, type Role, type ArtworkRole } from "./game";

export const roleTips: Record<Role, string> = {
  mayor: "Çift oyun güçlüdür; eşitlikte karar vermeden önce herkesi dinle.",
  bodyguard: "Koruyacağın kişiyi seçerken kendini riske attığını unutma.",
  hunter: "Son atışın için gündüz konuşmalarındaki tutarsızlıkları aklında tut.",
  shaman: "Susturacağın kişinin ertesi gün tartışmaya etkisini düşün.",
  gunslinger: "Tek atışını kullanmadan önce hedefinin kim olabileceğini tart.",
  vampire_cub: "Yetişkin vampirler elense de sen oyunun gidişini değiştirebilirsin.",
  villager: "Oyları ve açıklamaları karşılaştır; farklı geceler arasındaki tutarsızlıklara dikkat et.",
  vampire: "Sakin kal ve tutarlı konuş. İki vampirli masada takım arkadaşının önerisini de takip et.",
  doctor: "Herkesin güvendiği oyuncu da hedef olabilir; kendini koruma hakkını dikkatli kullan.",
  jester: "Şüphe çek ama niyetini çok açık etme; köyün seni oylamak istemesini sağlamalısın.",
};
const characters = [
  ...(["villager", "vampire", "doctor", "jester", "mayor", "bodyguard", "hunter", "shaman", "gunslinger", "vampire_cub"] as Role[]).map(id => ({ id: id as ArtworkRole, name: roles[id].name, rules: id === "vampire" ? `${roles[id].description} İki vampirli masada iki vampir aynı anda hedef önerir; farklı hedeflerden biri süre sonunda rastgele seçilir.` : roles[id].description, win: roles[id].win, tip: roleTips[id], available: true })),

];
export function CharacterGallery() {
  const [index, setIndex] = useState(0);
  const character = characters[index];
  function step(n: number) { setIndex((index + n + characters.length) % characters.length); }
  return <div className="character-gallery">
    <div className="character-gallery-main">
      <button className="icon-button gallery-arrow" aria-label="Önceki karakter" onClick={() => step(-1)}><ChevronLeft size={24} /></button>
      <article className="character-gallery-card" aria-live="polite">
        <div className={`character-gallery-portrait ${character.id}`}><Sprite role={character.id} /></div>
        <span className="eyebrow">{character.available ? "OYUNDA" : "YAKINDA"} · {index + 1} / {characters.length}</span>
        <h3>{character.name}</h3>
        <div className="character-rules"><strong>Yetenek ve kurallar</strong><p>{character.rules}</p><strong>Nasıl kazanır?</strong><p>{character.win}</p><strong><Sparkles size={15} /> Taktik</strong><p>{character.tip}</p></div>
      </article>
      <button className="icon-button gallery-arrow" aria-label="Sonraki karakter" onClick={() => step(1)}><ChevronRight size={24} /></button>
    </div>
    <div className="character-thumbnails" aria-label="Karakter seçimi">
      {characters.map((item, i) => <button key={item.id} className={`character-thumbnail ${i === index ? "selected" : ""}`} aria-label={`${item.name}${item.available ? "" : " · yakında"}`} aria-pressed={i === index} onClick={() => setIndex(i)}><Sprite role={item.id} /><span>{item.name}</span></button>)}
    </div>
  </div>;
}
