import { useState } from "react";
import { type Game, factionLabels, factionOf, roles } from "./domain";
import { RoleEffect } from "./RoleEffect";

export function PersonalObjective({ game }: { game: Game }) {
  const me = game.me;
  if (!me || ["lobby", "finished"].includes(game.phase)) return null;
  const target = game.players.find(p => p.id === me.fanatic_target);
  if (me.fanatic_won) return <div className="personal-objective achieved" role="status"><strong>✦ Kişisel zaferin kesinleşti.</strong> Oyun devam ediyor; elensen veya rolün değişse bile bu zafer sende kalır.</div>;
  if (me.role !== "fanatic" || !target) return null;
  return <div className="personal-objective"><strong>Gizli hedefin: #{target.number} {target.name}</strong><p>{target.alive ? "Bu oyuncu köy oylamasıyla veya muhtar kararıyla idam edilirse kazanırsın. Gece ölmesi zafer sağlamaz." : "Hedefin idam edilmeden elendi. Bu görev artık kişisel zafer sağlamaz."}</p></div>;
}

export function PrivateRoleNotices({ game }: { game: Game }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  if (!game.me || ["lobby", "finished"].includes(game.phase)) return null;
  const prefix = `vk-role-notice:${game.code}:${game.round_number}:${game.me.id}:`;
  const notices = game.me.role_notices?.filter(n => !dismissed.includes(prefix + n.id) && localStorage.getItem(prefix + n.id) !== "read") || [];
  if (!notices.length) return null;
  const currentRole = game.me.role || "villager";
  return <section className="private-role-notice paper-card" aria-label="Gizli rol değişikliği" role="status">
    {notices.map(n => <div key={n.id}><RoleEffect kind={n.kind} small /><strong>{n.text}</strong></div>)}
    <h3>Şimdiki rolün: {roles[currentRole].name}</h3>
    <span className={`faction-badge ${factionOf(currentRole)}`}>{factionLabels[factionOf(currentRole)]}</span><p>{roles[currentRole].win}</p>
    <button type="button" className="button secondary" onClick={() => { const ids = notices.map(n => prefix + n.id); ids.forEach(id => localStorage.setItem(id, "read")); setDismissed([...dismissed, ...ids]); }}>Yeni rolümü anladım</button>
  </section>;
}
