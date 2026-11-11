import { useEffect, useState } from "react";
import { Check, Moon } from "lucide-react";
import { type Game } from "./domain";
import { RoleEffect } from "./RoleEffect";

export function NightChoices({ game, busy, offset, onSubmit }: { game: Game; busy: boolean; offset: number; onSubmit: (kind: string, targets: string[]) => void }) {
  const [kind, setKind] = useState(game.night_choice?.kind === "bite" ? "bite" : game.night_action || "kill");
  const [targets, setTargets] = useState<string[]>(game.night_choice?.targets || []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  const inGrace = !!game.night_base_ends_at && now + offset >= Date.parse(game.night_base_ends_at);
  const expired = now + offset >= Date.parse(game.ends_at);
  const max = kind === "swap" || (kind === "kill" && game.attack_number === 2) ? 2 : 1;
  const required = kind === "swap" ? 2 : 1;
  const alive = game.players.filter(p => p.alive);
  const validTargets = targets.filter(id => alive.some(p => p.id === id));
  function toggle(id: string) {
    setTargets(current => current.includes(id) ? current.filter(t => t !== id) : max === 1 ? [id] : current.length < max ? [...current, id] : [current[1], id]);
  }
  return <div className="shared-night">
    <div className="night-heading"><Moon size={27} /><h2>Herkes aynı gecede karar veriyor.</h2></div>
    <p className="stage-description">Gece yetenekleri aynı anda seçilir. Seçim yapmak zorunda değilsin; pas geçebilir veya süreyi bekleyebilirsin.</p>
    <div className={`night-window ${inGrace ? "grace" : ""}`} role="status">
      {inGrace ? `Ek süre: eksik seçimler için en fazla ${game.settings.night_grace_seconds} saniye. Ardından mevcut hamlelerle sabah olacak.` : `${game.settings.night_seconds} saniye ana süre + en fazla ${game.settings.night_grace_seconds} saniye ek süre. Herkes hazırsa ana süre sonunda çözülür.`}
    </div>
    {game.my_turn ? <>
      {game.night_action === "swap" && <><RoleEffect kind="wizard" small /><p>İki farklı oyuncu seç. Vampir takımından biriyle temas edersen ölürsün. Bu hak oyun boyunca bir kez kullanılabilir.</p></>}
      {game.night_action === "protect" && <p>{game.me?.self_heal_used ? "Kendini koruma hakkın kullanıldı." : "Kendini oyun boyunca bir kez koruyabilirsin."} Koruma, Alfa’nın dönüşümünü de engeller.</p>}
      {game.night_action === "silence" && <p>Bir oyuncuyu yarın için sustur. Oy vermesine engel olmaz.</p>}
      {game.me?.role === "alpha_vampire" && !game.me.alpha_used && <div className="night-mode" role="group" aria-label="Alfa vampir gece yeteneği">
        <button type="button" aria-pressed={kind === "kill"} disabled={busy || expired} onClick={() => { setKind("kill"); setTargets([]); }}>Avlan</button>
        <button type="button" aria-pressed={kind === "bite"} disabled={busy || expired} onClick={() => { setKind("bite"); setTargets([]); }}>Isır ve dönüştür · 1 hak</button>
      </div>}
      {kind === "bite" && <div className="rule-box"><RoleEffect kind="alpha_vampire" small />Bu seçim o gecenin tüm vampir saldırılarını durdurur. Doktor dönüşümü engelleyebilir; hakkın yine harcanır.</div>}
      {kind === "kill" && max === 2 && <p>Yavru Vampir’in mirası: istersen iki farklı hedef seç. Seçim sırası birinci ve ikinci saldırıyı belirler.</p>}
      {game.night_choice && <p className="night-saved" role="status">{game.night_choice.kind === "skip" ? "Bu gece pas geçtin." : `Seçimin kaydedildi: ${game.night_choice.targets.map(id => { const p = game.players.find(p => p.id === id); return p ? `#${p.number} ${p.name}` : "Ayrılan oyuncu"; }).join(" ve ")}.`} Gece çözülene kadar değiştirebilirsin.</p>}
      <div className="target-grid">
        {alive.map(p => {
          const self = p.id === game.me?.id;
          const forbidden = (kind === "kill" || kind === "bite") && game.vampire_team?.some(v => v.id === p.id);
          const disabled = busy || expired || forbidden || (self && (kind !== "protect" || game.me?.self_heal_used));
          return <button type="button" key={p.id} className={`target ${validTargets.includes(p.id) ? "selected" : ""}`} disabled={!!disabled} aria-pressed={validTargets.includes(p.id)} onClick={() => toggle(p.id)}>
            <span className="number-badge">{p.number}</span><strong>{p.name}</strong>{self && <small>Sen</small>}{validTargets.includes(p.id) && <span className="target-order">{max > 1 ? validTargets.indexOf(p.id) + 1 : <Check size={15} />}</span>}
          </button>;
        })}
      </div>
      <button type="button" className="button primary full" disabled={busy || expired || validTargets.length < required} onClick={() => onSubmit(kind, validTargets)}><Check size={18} />{kind === "swap" ? "Kaderleri değiştir" : kind === "bite" ? "Dönüşümü onayla" : kind === "kill" ? "Hedefimi onayla" : "Seçimimi onayla"}</button>
      <button type="button" className="button secondary full night-pass" disabled={busy || expired} onClick={() => { setTargets([]); onSubmit("skip", []); }}>Bu gece pas geç</button>
      {game.night_action === "kill" && !!game.vampire_team?.length && <div className="vampire-team-panel"><strong>Takımının gizli seçimleri</strong>{game.vampire_team.map(v => { const player = game.players.find(p => p.id === v.id); const target = game.players.find(p => p.id === v.target); return <p key={v.id}>{v.id === game.me?.id ? "Sen" : player?.name} → {v.kind === "skip" ? "Pas" : target ? `${target.name}${v.kind === "bite" ? " · dönüşüm" : ""}` : "Henüz seçim yok"}</p>; })}<small>Farklı av önerilerinden biri rastgele seçilir. Hiç öneri yoksa saldırı yapılmaz. Alfa dönüşüm seçerse o gece takım saldırmaz.</small></div>}
    </> : <p className="waiting-box">{game.me?.alive ? "Bu gece kullanabileceğin bir yetenek yok. Sabahı bekleyebilirsin." : "Gece devam ediyor. Sabahın sonucunu birlikte göreceksiniz."}</p>}
  </div>;
}
