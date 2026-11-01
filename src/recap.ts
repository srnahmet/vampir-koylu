import type { Player, RoundAction } from "./game";

export function recapGroups(actions: RoundAction[]) {
  const groups: { key: string; title: string; actions: RoundAction[] }[] = [];
  const voteNumbers = new Map<number, number>();
  for (const action of actions) {
    const night = action.kind === "kill" || action.kind === "protect";
    const key = night ? `night:${action.day}` : `vote:${action.day}:${action.seq}`;
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const n = night ? 0 : (voteNumbers.get(action.day) || 0) + 1;
      if (!night) voteNumbers.set(action.day, n);
      group = { key, title: night ? `${action.day}. gece` : `${action.day}. gün · ${n}. oylama`, actions: [] };
      groups.push(group);
    }
    group.actions.push(action);
  }
  return groups;
}

export function recapLine(action: RoundAction, players: Player[]) {
  const name = (id: string | null) => {
    const p = players.find(p => p.id === id);
    return p ? `#${p.number} ${p.name}` : "Masadan ayrılan oyuncu";
  };
  const actor = name(action.actor), target = name(action.target);
  const cancelled = action.status === "cancelled" ? " Oyuncu ayrıldığı için bu hamle geçersiz kaldı." : "";
  if (action.kind === "vote_result") {
    return action.status === "tie"
      ? `Birincilik eşit: ${(action.details.candidates || []).map(name).join(", ")}. Tekrar oylamasına yalnızca bu adaylar kaldı.`
      : `${target} idam edildi.`;
  }
  if (action.kind === "vote") return `${actor} → ${target} için oy verdi.${cancelled}${action.status === "pending" ? " Oylama tamamlanmadan oyun bitti." : ""}`;
  if (action.kind === "kill") return `${actor} → ${target} oyuncusunu hedefledi.${cancelled}${action.status === "pending" ? " Gece tamamlanmadan oyun bitti." : action.status === "resolved" ? action.details.outcome === "saved" ? " Doktor hedefi kurtardı." : " Hedef öldü." : ""}`;
  return `${actor} → ${target} oyuncusunu korudu.${cancelled}${action.status === "pending" ? " Gece tamamlanmadan oyun bitti." : action.status === "resolved" ? action.details.outcome === "saved" ? " Koruma hayat kurtardı." : " Saldırı başka bir oyuncuyaydı." : ""}`;
}
