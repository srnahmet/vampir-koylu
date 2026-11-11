import { Sprite } from "./art";
import type { Role } from "./domain";
import "./role-effects.css";

const effects: Record<string, { role: Role; symbol: string; title: string }> = {
  wizard: { role: "wizard", symbol: "✧", title: "KADERLER YER DEĞİŞTİRDİ" },
  alpha_vampire: { role: "alpha_vampire", symbol: "☾", title: "YENİ BİR KAN BAĞI" },
  fanatic: { role: "fanatic", symbol: "◎", title: "TAKINTI TAMAMLANDI" },
  bodyguard: { role: "bodyguard", symbol: "⛨", title: "KALKANIN SON SÖZÜ" },
  silence: { role: "shaman", symbol: "☾", title: "SESSİZLİK BÜYÜSÜ" },
  hunter: { role: "hunter", symbol: "➶", title: "AVCININ SON OKU" },
  gunslinger: { role: "gunslinger", symbol: "✦", title: "TEK ATIŞIN YANKISI" },
  guilt: { role: "gunslinger", symbol: "◌", title: "YANLIŞ ATIŞIN BEDELİ" },
  mayor: { role: "mayor", symbol: "⚖", title: "MUHTARIN KARARI" },
  vampire_cub: { role: "vampire_cub", symbol: "✧", title: "KÜÇÜK DİŞLERİN MİRASI" },
};
export function RoleEffect({ kind, small = false }: { kind: string; small?: boolean }) {
  const effect = effects[kind] || effects.vampire_cub;
  return <div className={`role-effect effect-${kind} ${small ? "small" : ""}`} role="img" aria-label={effect.title}>
    <div className="effect-orbit" aria-hidden="true"><i /><i /><i /></div>
    <span className="effect-symbol" aria-hidden="true">{effect.symbol}</span>
    <Sprite role={effect.role} />
    <span className="effect-caption">{effect.title}</span>
  </div>;
}
