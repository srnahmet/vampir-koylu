import { useEffect, useState } from "react";
import { Check, Clock, MessagesSquare, Mic } from "lucide-react";
import type { Game } from "./game";
import { Sprite } from "./art";

export function SpeechPanel({
  game,
  offset,
  busy,
  onFinish,
}: {
  game: Game;
  offset: number;
  busy: boolean;
  onFinish: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const speech = game.speech;
  if (!speech) return null;
  const speaker = game.players.find((p) => p.id === speech.speaker_id);
  const yours = !!speaker && game.me?.id === speaker.id;
  const left = speech.ends_at
    ? Math.max(0, Math.ceil((Date.parse(speech.ends_at) - now - offset) / 1000))
    : 0;
  return (
    <section
      className={`speech-panel ${speech.group ? "group-talk" : ""}`}
      aria-label="Konuşma sırası"
    >
      {speech.group ? (
        <>
          <div className="speech-banner">
            <MessagesSquare size={21} />
            <div>
              <span className="eyebrow">İKİ TUR DA TAMAMLANDI</span>
              <h3>Şimdi söz hepinizde!</h3>
            </div>
          </div>
          <p>
            Kalan süre boyunca herkes serbestçe konuşabilir. Şüpheleri masaya
            dökün.
          </p>
        </>
      ) : (
        <>
          <div className="speech-meta">
            <span className="pill">
              <Mic size={13} />
              {speech.round}. TUR / 2
            </span>
            <span className="speech-clock">
              <Clock size={14} />
              {left > 0 ? `${left} sn` : "Sıra değişiyor…"}
            </span>
          </div>
          <div className="active-speaker">
            <div className="speaker-avatar">
              <Sprite neutral />
            </div>
            <div>
              <span className="eyebrow">
                {yours ? "MİKROFON SENDE" : "ŞİMDİ ONU DİNLİYORUZ"}
              </span>
              <h3>
                #{speaker?.number} {speaker?.name}
              </h3>
              <p>
                {yours
                  ? "Köye söylemek istediklerini anlat."
                  : "Diğer oyuncuların sırası birazdan gelecek."}
              </p>
            </div>
          </div>
          {yours && (
            <button
              className="button secondary full"
              onClick={onFinish}
              disabled={busy}
            >
              <Check size={17} /> Sözümü bitirdim
            </button>
          )}
          <p className="small muted">
            Süre dolunca otomatik geçilir. Konuşmacı isterse erken bitirebilir.
          </p>
        </>
      )}
      <div className="speaking-order" aria-label="Rastgele konuşma sırası">
        {speech.order.map((id, i) => {
          const p = game.players.find((p) => p.id === id);
          const index = (speech.round - 1) * speech.order.length + i;
          const done = speech.group || index < speech.turn_index;
          return (
            <span
              key={id}
              className={`order-person ${id === speech.speaker_id ? "active" : ""} ${done ? "done" : ""}`}
              title={`${p?.name}${done ? " · Konuştu" : ""}`}
            >
              <span className="order-position">{i + 1}</span>
              <strong>#{p?.number}</strong>
              <span>{p?.name}</span>
              {done ? (
                <Check size={12} />
              ) : id === speech.speaker_id ? (
                <Mic size={12} />
              ) : null}
            </span>
          );
        })}
      </div>
    </section>
  );
}
