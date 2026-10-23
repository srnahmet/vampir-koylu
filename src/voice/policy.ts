import type { Game } from "../game";

export function voiceEnabled(game: Game | null): game is Game {
  return (
    !!game?.settings.voice_enabled &&
    game.settings.turn_based &&
    game.phase !== "finished"
  );
}

// Both sending and playback use this gate. A server deadline closes the mic
// even if the next game-state request has not arrived yet.
export function voiceWindow(
  game: Game | null,
  playerId: string | null,
  now: number,
) {
  if (
    !voiceEnabled(game) ||
    !playerId ||
    !game.players.some((p) => p.id === playerId && p.alive)
  )
    return null;
  const ends = Date.parse(game.ends_at);
  if (!Number.isFinite(ends) || ends <= now) return null;
  if (game.phase === "runoff") return { key: `${game.seq}:group`, ends };
  if (game.phase !== "intro" && game.phase !== "day") return null;
  if (game.speech?.group) return { key: `${game.seq}:group`, ends };
  if (game.speech?.speaker_id !== playerId) return null;
  const turnEnds = Math.min(ends, Date.parse(game.speech.ends_at || ""));
  return Number.isFinite(turnEnds) && turnEnds > now
    ? { key: `${game.seq}:${game.speech.turn_index}`, ends: turnEnds }
    : null;
}
