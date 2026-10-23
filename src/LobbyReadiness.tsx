import { Check, Clock, LoaderCircle, Play } from "lucide-react";
import type { Game } from "./game";
import "./lobby-readiness.css";

export function LobbyReadiness({ game, busy, onToggle, onStart }: { game: Game; busy: boolean; onToggle: () => void; onStart: () => void }) {
  const readyCount = game.players.filter(player => player.ready && player.online).length;
  const offline = game.players.filter(player => !player.online).length;
  const allReady = game.players.length >= 4 && readyCount === game.players.length;
  const pending = game.players.length - readyCount;
  return <div className="lobby-readiness">
    <div className={`ready-summary ${allReady ? "all-ready" : ""}`}>
      {allReady ? <Check size={17} /> : <Clock size={17} />}
      <span><strong>{readyCount}/{game.players.length} oyuncu hazır</strong><small>{allReady ? "Köy hazır. Hadi başlayalım!" : "Herkes hazır olduğunda oyun başlatılabilir."}</small></span>
    </div>
    {game.me && <button className={`button full ${game.me.ready ? "secondary" : "primary"}`} disabled={busy} onClick={onToggle} aria-pressed={game.me.ready} aria-label={game.me.ready ? "Hazır durumunu kaldır" : "Hazırım"}>
      {busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}{game.me.ready ? "Hazırım · Değiştir" : "Hazırım"}
    </button>}
    {game.is_host ? <button className="button primary full" disabled={!allReady || busy} onClick={onStart}>
      {busy ? <LoaderCircle className="spin" size={19} /> : <Play size={19} />}
      {game.players.length < 4 ? `${4-game.players.length} arkadaş daha bekleniyor` : offline ? `${offline} oyuncunun bağlantısı bekleniyor` : !allReady ? `${pending} oyuncu hazırlanıyor` : "Oyunu başlat"}
    </button> : <p className="small muted center">{!game.me ? "Bu masada boş koltuk bekliyorsun." : allReady ? "Herkes hazır! Masayı kuran kişinin başlatması bekleniyor." : game.me.ready ? "Hazırsın. Diğer oyuncular hazırlanıyor." : "Başlamadan önce Hazırım düğmesine dokun."}</p>}
  </div>;
}

export function RematchControls({ game, busy, onRematch, onNewTable }: { game: Game; busy: boolean; onRematch: () => void; onNewTable: () => void }) {
  return <div className="rematch-controls">
    {game.is_host ? <><button className="button primary" disabled={busy} onClick={onRematch}>{busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />} Aynı masada rövanş</button><p className="small muted">Kod ve oyuncu numaraları korunur. Herkes yeniden hazır olur; roller tekrar rastgele dağıtılır. Masa hakkı harcanmaz.</p></> : <p className="small muted">Masa sahibi rövanşı açtığında aynı kodla devam edebilirsiniz.</p>}
    <button className="text-button" onClick={onNewTable} disabled={busy}>Yeni bir masa kur</button>
  </div>;
}
