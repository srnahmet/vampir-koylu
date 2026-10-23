import { useEffect, useRef, useState } from "react";
import { rpc, type Game } from "../game";
import { VoiceController, emptyVoice } from "./VoiceController";
import { voiceEnabled, voiceWindow } from "./policy";

export function useVoice(game: Game | null, offset: number) {
  const [state, setState] = useState({ ...emptyVoice });
  const controller = useRef<VoiceController | null>(null);
  if (!controller.current)
    controller.current = new VoiceController({ rpc, onChange: setState });
  useEffect(() => {
    controller.current!.updateGame(game, offset);
  }, [game, offset]);
  useEffect(() => {
    const c = controller.current!;
    const hidden = () => {
      if (document.visibilityState === "hidden") c.stopMic();
    };
    const leave = () => c.disconnect();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave);
      c.disconnect();
    };
  }, []);
  return {
    ...state,
    enabled: voiceEnabled(game),
    canSpeak: !!voiceWindow(game, game?.me?.id || null, Date.now() + offset),
    join: () => void controller.current!.connect(),
    leave: () => controller.current!.disconnect(),
    toggleMic: () => void controller.current!.toggleMic(),
    toggleDeafened: () => controller.current!.toggleDeafened(),
    enablePlayback: () => void controller.current!.enablePlayback(),
  };
}
export type VoiceState = ReturnType<typeof useVoice>;
