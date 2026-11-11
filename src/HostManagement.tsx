import { useEffect, useState } from "react";
import { ArrowRightLeft, ChevronDown, Crown, WifiOff } from "lucide-react";
import type { Game } from "./game";
import "./host-management.css";

export function HostManagement({ game, busy, onTransfer }: {
  game: Game; busy: boolean; onTransfer: (id: string) => Promise<void>;
}) {
  const [target, setTarget] = useState("");
  const candidates = [...game.players, ...(game.spectators || [])].filter(p => p.online && p.id !== game.host?.player_id && p.eliminated_by !== "kicked");
  useEffect(() => setTarget(""), [game.code, game.host?.revision]);
  if (!game.host) return null;
  const validTarget = candidates.some(p => p.id === target);
  return <details className="host-management paper-card">
    <summary><Crown size={17} /><span>Masa sahibi <strong>{game.is_host ? "sensin" : game.host.name}</strong></span>
      {!game.host.online && <span className="host-offline"><WifiOff size={13} /> Bağlantı bekleniyor</span>}<ChevronDown size={15} />
    </summary>
    <div className="host-management-body">
      <p>Yönetim devredilince roller, oyunculuk ve oyun akışı korunur. Masa sahibi bağlantısını kaybederse masanın {game.settings.disconnect_seconds || 60} saniyelik bekleme süresi sonunda bağlı bir oyuncu yönetimi otomatik devralır.</p>
      {game.is_host ? <>
        <label className="field" htmlFor="next-host">Yönetimi kime devredeceksin?
          <select id="next-host" value={validTarget ? target : ""} disabled={busy} onChange={e => setTarget(e.target.value)}>
            <option value="">Bağlı bir oyuncu seç</option>
            {candidates.map(p => <option key={p.id} value={p.id}>#{p.number} · {p.name}</option>)}
          </select>
        </label>
        <button type="button" className="button secondary" disabled={busy || !validTarget} onClick={() => void onTransfer(target)}><ArrowRightLeft size={17} /> Yönetimi devret</button>
        {!candidates.length && <p className="small muted">Devretmek için başka bir oyuncunun bağlanması gerekiyor.</p>}
      </> : <p className="small muted">Başlatma, rövanş ve oyuncu çıkarma yetkileri masa sahibindedir.</p>}
    </div>
  </details>;
}
