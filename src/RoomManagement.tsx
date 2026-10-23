import { useEffect, useState } from "react";
import { UserMinus, WifiOff } from "lucide-react";
import type { Game, Player } from "./game";
import "./room-management.css";

export function ConnectionStatus({ player, offset }: { player: Player; offset: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!player.disconnect_ends_at) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [player.disconnect_ends_at]);
  if (!player.alive || player.online || !player.disconnect_ends_at) return null;
  const left = Math.max(0, Math.ceil((Date.parse(player.disconnect_ends_at) - now - offset) / 1000));
  return <span className="connection-countdown" role="status"><WifiOff size={12} />{left ? `${left} sn bekleniyor` : "Bağlantı süresi doldu"}</span>;
}

export function KickButton({ game, player, busy, onKick }: { game: Game; player: Player; busy: boolean; onKick: (id: string) => void }) {
  if (!game.is_host || player.id === game.me?.id || player.eliminated_by === "kicked") return null;
  return <button type="button" className="icon-button kick-player" disabled={busy} onClick={() => onKick(player.id)} title={`${player.name} oyuncusunu masadan çıkar`} aria-label={`${player.name} oyuncusunu masadan çıkar`}><UserMinus size={15} /></button>;
}

export function eliminationText(reason?: string) {
  if (reason === "vampire") return "Vampir tarafından öldürüldün.";
  if (reason === "disconnected") return "Bağlantı bekleme süren dolduğu için bu turdan elendin.";
  if (reason === "kicked") return "Masadan çıkarıldın.";
  return "Köyün kararıyla idam edildin.";
}
