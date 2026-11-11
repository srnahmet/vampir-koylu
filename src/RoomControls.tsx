import { useEffect, useRef, useState } from "react";
import { Eye, LogOut, RotateCcw, UserRoundPlus, X } from "lucide-react";
import type { Game, Player } from "./game";
import "./room-controls.css";

export function SpectatorChoice({ game, busy, onToggle }: { game: Game; busy: boolean; onToggle: (id: string) => void }) {
  if (game.phase !== "lobby" || !game.member) return null;
  return <button type="button" className="button secondary full" disabled={busy} onClick={() => onToggle(game.member!.id)}>
    {game.member.spectator ? <UserRoundPlus size={17} /> : <Eye size={17} />}
    {game.member.spectator ? "Oyuncu olarak katıl" : "Bu turu izleyici olarak izle"}
  </button>;
}

export function SpectatorAction({ game, player, spectator = false, busy, onToggle }: { game: Game; player: Player; spectator?: boolean; busy: boolean; onToggle: (id: string) => void }) {
  if (!game.is_host || game.phase !== "lobby" || player.id === game.member?.id) return null;
  return <button type="button" className="icon-button spectator-action" disabled={busy} onClick={() => onToggle(player.id)}
    title={spectator ? "Oyuncu yap" : "İzleyici yap"} aria-label={`${player.name} ${spectator ? "oyuncu yap" : "izleyici yap"}`}>
    {spectator ? <UserRoundPlus size={16} /> : <Eye size={16} />}
  </button>;
}

export function SpectatorList({ game, busy, onToggle, onKick }: { game: Game; busy: boolean; onToggle: (id: string) => void; onKick: (id: string) => void }) {
  if (!game.spectators?.length) return null;
  return <section className="spectators-list" aria-label="İzleyiciler"><h3><Eye size={16} /> İzleyiciler <span>{game.spectators.length}</span></h3>
    {game.spectators.map(p => <div className="spectator-row" key={p.id}><span>{p.name}{p.id === game.member?.id ? " (sen)" : ""}</span><small>{p.online ? "İzliyor" : "Çevrimdışı"}</small>
      <SpectatorAction game={game} player={p} spectator busy={busy} onToggle={onToggle} />
      {game.is_host && p.id !== game.member?.id && <button className="icon-button" type="button" disabled={busy} aria-label={`${p.name} oyuncusunu masadan çıkar`} onClick={() => onKick(p.id)}><X size={16} /></button>}
    </div>)}
  </section>;
}

export function RoomControls({ game, busy, onReturn, onClose }: { game: Game; busy: boolean; onReturn: () => Promise<void>; onClose: () => Promise<void> }) {
  const [confirm, setConfirm] = useState<"return" | "close" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (!game.is_host) setConfirm(null); }, [game.is_host]);
  useEffect(() => { if (!confirm) return; const el = dialog.current; el?.showModal(); return () => el?.close(); }, [confirm]);
  if (!game.is_host) return null;
  const closing = confirm === "close";
  return <div className="room-controls">
    <button type="button" className="text-button" disabled={busy} onClick={() => setConfirm(game.phase === "lobby" ? "close" : "return")}>
      {game.phase === "lobby" ? <LogOut size={16} /> : <RotateCcw size={16} />}{game.phase === "lobby" ? "Masayı kapat" : "Oyunu durdur ve lobiye dön"}
    </button>
    {confirm && <dialog className="modal room-confirm" ref={dialog} aria-labelledby="room-confirm-title" onCancel={e => { e.preventDefault(); if (!busy) setConfirm(null); }} onClick={e => { if (e.target === e.currentTarget && !busy) setConfirm(null); }}>
      <div className="modal-inner"><div className="modal-heading"><h2 id="room-confirm-title">Emin misiniz?</h2><button type="button" className="icon-button" aria-label="Kapat" disabled={busy} onClick={() => setConfirm(null)}><X size={19} /></button></div>
        <p>{closing ? "Masa tamamen kapatılacak. Oyuncular ve izleyiciler ana sayfaya dönecek; bu masa koduyla yeniden girilemeyecek." : "Bu oyun sonlandırılacak ve herkes bekleme odasına dönecek. Roller, hamleler ve hazır durumları sıfırlanacak. Masa ayarları, isimler ve izleyici seçimleri korunacak."}</p>
        <div className="room-confirm-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>Vazgeç</button>
          <button type="button" className="button danger" disabled={busy} onClick={async () => { await (closing ? onClose() : onReturn()); setConfirm(null); }}>{busy ? "İşleniyor…" : closing ? "Masayı kapat" : "Oyunu durdur ve lobiye dön"}</button>
        </div>
      </div>
    </dialog>}
  </div>;
}
