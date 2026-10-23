import {
  AlertCircle,
  Headphones,
  LogOut,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { Game } from "../game";
import type { VoiceState } from "./useVoice";
import "./voice.css";

export function VoiceBadge({
  playerId,
  voice,
}: {
  playerId: string;
  voice: VoiceState;
}) {
  if (!voice.enabled || voice.status === "off") return null;
  const person = voice.members.find((p) => p.player_id === playerId);
  if (!person) return null;
  return (
    <span
      className={`voice-badge ${person.speaking ? "is-speaking" : ""}`}
      title={
        person.speaking
          ? "Konuşuyor"
          : person.mic_open
            ? "Mikrofon açık"
            : "Mikrofon kapalı"
      }
    >
      {person.mic_open ? <Mic size={13} /> : <MicOff size={13} />}
      {person.speaking && (
        <>
          <span className="voice-waves" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>Konuşuyor</span>
        </>
      )}
    </span>
  );
}

export function VoicePanel({ game, voice }: { game: Game; voice: VoiceState }) {
  if (!voice.enabled) return null;
  const off = voice.status === "off";
  const talking = voice.members.filter((p) => p.speaking);
  const hint = !game.me
    ? "Paylaşım ekranında yalnızca dinleyebilirsin."
    : !game.me.alive
      ? "Elendiğin için yalnızca dinleyebilirsin."
      : voice.canSpeak
        ? "Söz hakkın var. İstersen mikrofonunu aç."
        : ["intro", "day"].includes(game.phase)
          ? "Mikrofonun sıran geldiğinde açılabilir."
          : game.phase === "lobby"
            ? "Konuşma başlayana kadar mikrofonlar kapalı."
            : "Bu aşamada mikrofonlar kapalı.";
  return (
    <section
      className="voice-panel paper-card"
      aria-label="Masada sesli sohbet"
    >
      <div className="voice-panel-heading">
        <Headphones size={21} />
        <div>
          <h2>Masada ses</h2>
          <span>
            {off
              ? "İsteğe bağlı · Mikrofon başlangıçta kapalı"
              : voice.status === "connecting"
                ? "Ses bağlantısı kuruluyor…"
                : voice.status === "reconnecting"
                  ? "Yeniden bağlanılıyor…"
                  : `${voice.members.length} kişi sesli sohbette`}
          </span>
        </div>
      </div>
      <div className="voice-controls">
        {off ? (
          <button className="button secondary" onClick={voice.join}>
            <Headphones size={17} /> Sesli sohbete katıl
          </button>
        ) : (
          <>
            <button
              className={`button ${voice.mic ? "primary" : "secondary"}`}
              onClick={voice.toggleMic}
              disabled={!voice.canSpeak || voice.status !== "connected"}
            >
              {voice.mic ? <Mic size={17} /> : <MicOff size={17} />}
              {voice.pending
                ? "İzin isteğini iptal et"
                : voice.mic
                  ? "Mikrofonu kapat"
                  : "Mikrofonu aç"}
            </button>
            <button
              className="icon-button"
              onClick={voice.toggleDeafened}
              aria-label={
                voice.deafened
                  ? "Diğer oyuncuların sesini aç"
                  : "Diğer oyuncuların sesini kapat"
              }
            >
              {voice.deafened ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button className="text-button" onClick={voice.leave}>
              <LogOut size={14} /> Sesten ayrıl
            </button>
          </>
        )}
      </div>
      <p className="voice-hint">{hint}</p>
      {!off && (
        <p className="voice-activity" aria-live="polite">
          {talking.length ? (
            <>
              <Mic size={14} />
              {talking
                .map((p) => (p.number ? `#${p.number} ${p.name}` : p.name))
                .join(", ")}{" "}
              konuşuyor
            </>
          ) : (
            "Şu an kimse konuşmuyor."
          )}
        </p>
      )}
      {voice.playbackBlocked && (
        <button className="text-button" onClick={voice.enablePlayback}>
          <Volume2 size={15} /> Sesleri duymak için dokun
        </button>
      )}
      {voice.error && (
        <p className="voice-error" role="status">
          <AlertCircle size={15} />
          {voice.error}
        </p>
      )}
      <details className="voice-notes">
        <summary>Bağlantı ve performans bilgisi</summary>
        <p>
          Sesli sohbet internet, pil ve işlemci kullanımını artırır; kalabalık
          masalarda gecikme olabilir. Kulaklık önerilir. Bazı okul veya iş
          ağlarında doğrudan ses bağlantısı kurulamayabilir. Ses kaydı tutulmaz.
        </p>
      </details>
    </section>
  );
}
