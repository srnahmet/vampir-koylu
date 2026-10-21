import { ArrowRight, Check, Users } from "lucide-react";
import type { Game } from "./game";
export function EarlyAdvance({
  game,
  busy,
  onRequest,
}: {
  game: Game;
  busy: boolean;
  onRequest: () => void;
}) {
  const alive = game.players.filter((p) => p.alive).length,
    needed = Math.floor(alive / 2) + 1;
  const night = game.phase === "intro";
  return (
    <section className="early-advance" aria-label="Konuşmayı erken bitir">
      <div className="early-heading">
        <span className="early-icon">
          <ArrowRight size={20} />
        </span>
        <div>
          <h3>Hazırsanız beklemeyin.</h3>
          <p>
            {night
              ? "İlk geceye erkenden geçebiliriz."
              : "Şüpheler hazırsa oyları toplayabiliriz."}
          </p>
        </div>
      </div>
      {game.is_observer ? (
        <div className="observer-progress">
          <Users size={17} />
          <span>
            {game.early_count}/{needed} oyuncu {night ? "geceye" : "oylamaya"}{" "}
            geçmek istiyor.
          </span>
        </div>
      ) : game.me?.alive ? (
        <button
          className={`button ${game.early_mine ? "secondary" : "primary"} full`}
          disabled={game.early_mine || busy}
          onClick={onRequest}
        >
          {game.early_mine ? (
            <Check size={18} />
          ) : night ? (
            <ArrowRight size={18} />
          ) : (
            <Users size={18} />
          )}{" "}
          {game.early_mine
            ? "İsteğin kaydedildi"
            : night
              ? "Geceye geçelim"
              : "Oylamaya geçelim"}
          <span className="vote-count">
            {game.early_count}/{needed}
          </span>
        </button>
      ) : (
        <div className="observer-progress">
          <Users size={16} />
          {game.early_count}/{needed} oyuncu geçiş istiyor.
        </div>
      )}
      <p className="small muted center">
        Yaşayanların yarısından fazlası isterse hemen geçilir. Gece hamleleri ve
        oylamanın asgari süreleri korunur.
      </p>
    </section>
  );
}
