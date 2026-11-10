import type { Player, RoundAction } from "./domain";

export function recapGroups(actions: RoundAction[]) {
  const groups: { key: string; title: string; actions: RoundAction[] }[] = [];
  const voteNumbers = new Map<number, number>();
  for (const action of actions) {
    const night = ["kill", "protect", "guard", "silence"].includes(action.kind);
    const ability = ["shoot", "revenge", "decide", "silence_breach"].includes(action.kind);
    const key = ability ? `ability:${action.id}` : night ? `night:${action.day}` : `vote:${action.day}:${action.seq}`;
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const n = night ? 0 : (voteNumbers.get(action.day) || 0) + 1;
      if (!night) voteNumbers.set(action.day, n);
      group = { key, title: ability ? `${action.day}. gün · Özel yetenek` : night ? `${action.day}. gece` : `${action.day}. gün · ${n}. oylama`, actions: [] };
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
  const actor = action.actor === null && action.details.automatic ? "Otomatik gece seçimi" : name(action.actor), target = name(action.target);
  const cancelled = action.status === "cancelled" ? " Oyuncu ayrıldığı için bu hamle geçersiz kaldı." : "";
  if (action.kind === "vote_result") {
    return action.status === "tie"
      ? `Birincilik eşit: ${(action.details.candidates || []).map(name).join(", ")}. Tekrar oylamasına yalnızca bu adaylar kaldı.`
      : `${target} idam edildi.`;
  }
  const verbs: Partial<Record<RoundAction["kind"], string>> = { shoot: "tek atışını kullandı", revenge: "son okunu gönderdi", decide: "idam kararını verdi", silence: "ertesi gün için susturdu", guard: "kalkanıyla korudu", silence_breach: "sessizlik ihlaliyle elendi" };
  if (verbs[action.kind]) return `${actor} → ${target}: ${verbs[action.kind]}.${cancelled}${action.details.automatic ? " Süre dolduğu için hedef rastgele belirlendi." : ""}`;
  if (action.kind === "vote") return `${actor} → ${target} için oy verdi.${cancelled}${action.status === "pending" ? " Oylama tamamlanmadan oyun bitti." : ""}`;
  if (action.kind === "kill") return `${actor} → ${target} oyuncusunu hedefledi.${cancelled}${action.status === "pending" ? " Gece tamamlanmadan oyun bitti." : action.status === "resolved" ? action.details.outcome === "saved" ? " Doktor hedefi kurtardı." : action.details.outcome === "guarded" ? " Koruma saldırıyı üstlendi." : action.details.outcome === "missed" ? " Önerilen hedef seçilmedi." : " Hedef öldü." : ""}`;
  return `${actor} → ${target} oyuncusunu korudu.${cancelled}${action.status === "pending" ? " Gece tamamlanmadan oyun bitti." : action.status === "resolved" ? action.details.outcome === "saved" ? " Koruma hayat kurtardı." : " Saldırı başka bir oyuncuyaydı." : ""}`;
}
