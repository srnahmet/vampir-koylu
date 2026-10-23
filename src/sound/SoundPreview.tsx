// Development-only audio QA. Offline rendering measures sound without playing it.
import { useState } from "react";
import { cues, scheduleCue, type SoundCue } from "./effects";

export function SoundPreview() {
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState("");
  async function measure() {
    setResult("Ölçülüyor…");
    setLines([]);
    try {
      const measurements: string[] = [];
      for (const cue of Object.keys(cues) as SoundCue[]) {
        const context = new OfflineAudioContext(1, 22050, 44100);
        const output = context.createGain();
        output.gain.value = 0.35;
        output.connect(context.destination);
        scheduleCue(context, output, cue);
        const data = (await context.startRendering()).getChannelData(0);
        const peak = data.reduce(
          (max, sample) => Math.max(max, Math.abs(sample)),
          0,
        );
        const end =
          data.reduce(
            (last, sample, index) =>
              Math.abs(sample) > 0.00001 ? index : last,
            0,
          ) / 44100;
        if (
          !Number.isFinite(peak) ||
          peak < 0.001 ||
          peak > 0.06 ||
          end > 0.4 ||
          data[0] !== 0 ||
          Math.abs(data[data.length - 1]) > 0.00001
        )
          throw new Error(`${cue}: ses düzeyi veya süre uygun değil.`);
        measurements.push(
          `${cue}: tepe ${peak.toFixed(3)} · ${end.toFixed(2)} sn · temiz başlangıç ve bitiş`,
        );
      }
      setLines(measurements);
      setResult("8 SES EFEKTİ BAŞARILI");
    } catch (error) {
      setResult(String(error));
    }
  }
  return (
    <section className="paper-card" style={{ padding: 24, marginBottom: 24 }}>
      <h2>Küçük sesler · Ölçüm</h2>
      <p>
        Ses çalmadan, gerçek Web Audio motoruyla süre, ses düzeyi ve sessiz
        bitiş kontrol edilir.
      </p>
      <button className="button secondary" onClick={() => void measure()}>
        Ses efektlerini ölç
      </button>
      <h3>{result}</h3>
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
