import { ChevronDown, ScrollText } from "lucide-react";
import type { Game } from "./game";
import { recapGroups, recapLine } from "./recap";
import "./game-recap.css";

export function GameRecap({ game }: { game: Game }) {
  if (game.phase !== "finished" || !game.summary) return null;
  const groups = recapGroups(game.summary.actions);
  return <section className="paper-card game-recap" aria-labelledby="recap-title">
    <span className="eyebrow">SIRLAR ARTIK ORTAYA ÇIKABİLİR</span>
    <h2 id="recap-title"><ScrollText size={23} /> Perde arkası</h2>
    <p>Kim kime oy verdi, vampir kimi hedefledi, doktor kimi korudu? Bu oyunun hamleleri burada.</p>
    {!game.summary.complete && <p className="recap-note">Bu oyun güncellemeden önce başlamış. Özet yalnızca güncellemeden sonra kaydedilen hamleleri içerir.</p>}
    {!groups.length && <p className="small muted">Bu oyunda henüz kaydedilmiş bir hamle yok.</p>}
    {groups.map(group => <details key={group.key} className="recap-group" open>
      <summary><strong>{group.title}</strong><ChevronDown size={16} /></summary>
      <ul>{group.actions.map(action => <li key={action.id} className={action.status === "cancelled" ? "cancelled" : ""}>{recapLine(action, game.players)}</li>)}</ul>
    </details>)}
    <p className="small muted">Rövanş açılınca yeni oyunun özeti ayrı tutulur ve oyun bitene kadar gizlenir.</p>
  </section>;
}
