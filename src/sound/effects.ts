export type SoundCue =
  | "tap"
  | "open"
  | "close"
  | "enabled"
  | "day"
  | "night"
  | "vote"
  | "result";
type Note = {
  hz: number;
  end?: number;
  at?: number;
  duration: number;
  volume: number;
};
export const cues: Record<SoundCue, readonly Note[]> = {
  tap: [{ hz: 720, end: 520, duration: 0.045, volume: 0.055 }],
  open: [
    { hz: 440, duration: 0.07, volume: 0.065 },
    { hz: 660, at: 0.055, duration: 0.11, volume: 0.055 },
  ],
  close: [{ hz: 550, end: 370, duration: 0.09, volume: 0.06 }],
  enabled: [
    { hz: 523, duration: 0.1, volume: 0.06 },
    { hz: 659, at: 0.065, duration: 0.1, volume: 0.055 },
    { hz: 784, at: 0.13, duration: 0.13, volume: 0.05 },
  ],
  day: [
    { hz: 523, duration: 0.13, volume: 0.075 },
    { hz: 659, at: 0.09, duration: 0.16, volume: 0.065 },
  ],
  night: [
    { hz: 392, end: 262, duration: 0.2, volume: 0.07 },
    { hz: 220, at: 0.13, duration: 0.18, volume: 0.055 },
  ],
  vote: [
    { hz: 440, duration: 0.085, volume: 0.07 },
    { hz: 523, at: 0.1, duration: 0.11, volume: 0.06 },
  ],
  result: [{ hz: 440, end: 330, duration: 0.2, volume: 0.065 }],
};

// A soft attack/release avoids clicks; every sound is short and generated locally.
export function scheduleCue(
  context: BaseAudioContext,
  output: AudioNode,
  cue: SoundCue,
  onEnd?: (node: OscillatorNode) => void,
) {
  return cues[cue].map((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + 0.005 + (note.at || 0);
    const end = start + note.duration;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.hz, start);
    if (note.end)
      oscillator.frequency.exponentialRampToValueAtTime(note.end, end);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(note.volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, end - 0.008);
    gain.gain.linearRampToValueAtTime(0, end);
    oscillator.connect(gain).connect(output);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      onEnd?.(oscillator);
    };
    oscillator.start(start);
    oscillator.stop(end);
    return oscillator;
  });
}

export class SoundEffects {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private nodes = new Set<OscillatorNode>();
  private generation = 0;
  private active = false;
  private lastTap = -Infinity;
  private createContext: () => AudioContext;
  constructor(createContext: () => AudioContext = () => new AudioContext()) {
    this.createContext = createContext;
  }

  async enable() {
    const generation = ++this.generation;
    this.active = true;
    try {
      // This method is called directly from the user's toggle gesture.
      const context = this.context || this.createContext();
      this.context = context;
      if (!this.output) {
        this.output = context.createGain();
        this.output.gain.value = 0.35;
        this.output.connect(context.destination);
      }
      await context.resume();
      const ready =
        this.active &&
        generation === this.generation &&
        context.state === "running";
      if (!ready && generation === this.generation) this.disable();
      return ready;
    } catch {
      if (generation === this.generation) this.disable();
      return false;
    }
  }

  disable() {
    this.active = false;
    ++this.generation;
    if (this.output) this.output.gain.value = 0;
    this.stop();
    const context = this.context;
    this.context = null;
    this.output = null;
    if (context) void context.close().catch(() => {});
  }

  stop() {
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.nodes.clear();
  }

  async play(cue: SoundCue, gesture = false) {
    const context = this.context,
      output = this.output,
      generation = this.generation;
    if (!this.active || !context || !output) return;
    if (gesture && context.state !== "running") {
      try {
        await context.resume();
      } catch {
        return;
      }
    }
    if (
      !this.active ||
      generation !== this.generation ||
      context.state !== "running"
    )
      return;
    if (cue === "tap") {
      const now = performance.now();
      if (now - this.lastTap < 70) return;
      this.lastTap = now;
    }
    // Do not accumulate sounds when a user taps repeatedly.
    if (this.nodes.size > 12) return;
    for (const node of scheduleCue(context, output, cue, (node) =>
      this.nodes.delete(node),
    ))
      this.nodes.add(node);
  }
}
