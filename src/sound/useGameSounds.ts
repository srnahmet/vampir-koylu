import { useEffect, useRef, useState } from "react";
import { SoundEffects, type SoundCue } from "./effects";

export function useGameSounds({
  panel,
  room,
  phase,
  nightPreview,
  onNotice,
}: {
  panel: string | null;
  room: string;
  phase: string | null;
  nightPreview: boolean;
  onNotice: (text: string) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const effects = useRef<SoundEffects | null>(null);
  if (!effects.current) effects.current = new SoundEffects();
  const previousPanel = useRef(panel);
  const previousPhase = useRef("");
  const previousNight = useRef(nightPreview);
  const toggleGeneration = useRef(0);

  useEffect(() => {
    const player = effects.current!;
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || document.hidden) return;
      const control = event.target.closest(
        'button, a[href], input[type="checkbox"], input[type="radio"], select, summary, [role="button"], [role="radio"], [role="switch"]',
      );
      if (
        !control ||
        control.closest("[data-sound-toggle]") ||
        control.matches(':disabled, [aria-disabled="true"]')
      )
        return;
      void player.play("tap", true);
    };
    const visibility = () => {
      if (document.hidden) player.stop();
    };
    document.addEventListener("click", click, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      ++toggleGeneration.current;
      document.removeEventListener("click", click, true);
      document.removeEventListener("visibilitychange", visibility);
      player.disable();
    };
  }, []);

  useEffect(() => {
    if (panel !== previousPanel.current && !document.hidden)
      void effects.current!.play(panel ? "open" : "close");
    previousPanel.current = panel;
  }, [panel]);
  useEffect(() => {
    const key = phase ? `${room}:${phase}` : "";
    if (
      key &&
      previousPhase.current &&
      key !== previousPhase.current &&
      !document.hidden
    ) {
      const cue: SoundCue =
        phase === "night"
          ? "night"
          : phase === "voting"
            ? "vote"
            : phase === "finished"
              ? "enabled"
              : ["intro", "day", "runoff"].includes(phase!)
                ? "day"
                : "result";
      void effects.current!.play(cue);
    }
    previousPhase.current = key;
  }, [room, phase]);
  useEffect(() => {
    if (!phase && previousNight.current !== nightPreview && !document.hidden)
      void effects.current!.play(nightPreview ? "night" : "day");
    previousNight.current = nightPreview;
  }, [nightPreview, phase]);

  async function toggle() {
    const generation = ++toggleGeneration.current;
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    if (!next) {
      effects.current!.disable();
      onNotice("Oyun efektleri kapalı.");
      return;
    }
    const ready = await effects.current!.enable();
    if (!enabledRef.current || generation !== toggleGeneration.current) return;
    if (!ready) {
      enabledRef.current = false;
      setEnabled(false);
      onNotice("Bu tarayıcıda oyun efektleri açılamadı.");
      return;
    }
    void effects.current!.play("enabled");
    onNotice("Oyun efektleri açık: tıklamalarda ve geçişlerde hafif sesler.");
  }
  return { enabled, toggle: () => void toggle() };
}
