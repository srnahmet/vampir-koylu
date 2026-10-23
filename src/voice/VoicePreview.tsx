// Development-only integration QA: real WebRTC audio, a disposable in-browser
// PostgreSQL engine, and generated tones. No microphone permission or recording.
import { useRef, useState } from "react";
import { PGlite } from "@electric-sql/pglite";
import wasmUrl from "../../node_modules/@electric-sql/pglite/dist/pglite.wasm?url";
import bundleUrl from "../../node_modules/@electric-sql/pglite/dist/pglite.data?url";
import setup from "../../supabase/setup.sql?raw";
import type { Game } from "../game";
import {
  VoiceController,
  type VoiceRpc,
  type VoiceSnapshot,
} from "./VoiceController";

export default function VoicePreview() {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const controllers = useRef<VoiceController[]>([]);
  const log = (text: string) => setLines((old) => [...old, text]);
  async function run() {
    setRunning(true);
    setLines([]);
    setResult("");
    const tones = new AudioContext();
    await tones.resume();
    let db: PGlite;
    const streams: MediaStream[] = [];
    const snapshots: (VoiceSnapshot | null)[] = [null, null];
    let chain: Promise<unknown> = Promise.resolve();
    const q = async (sql: string, args: unknown[] = []) =>
      (await db.query(sql, args)).rows as Record<string, any>[];
    const call =
      (uid: string): VoiceRpc =>
      <T,>(name: string, args: Record<string, unknown>): Promise<T> => {
        const work = chain.then(async () => {
          await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
          const vals = Object.values(args),
            names = Object.keys(args);
          return (
            await q(
              `select public.${name}(${names.map((n, i) => `${n} => $${i + 1}`).join(",")}) result`,
              vals.map((v) =>
                typeof v === "object" && v !== null ? JSON.stringify(v) : v,
              ),
            )
          )[0].result as T;
        });
        chain = work.catch(() => {});
        return work;
      };
    const check = (condition: unknown, message: string) => {
      if (!condition) throw new Error(message);
      log(`✓ ${message}`);
    };
    const wait = async (
      condition: () => boolean | Promise<boolean>,
      timeout = 10000,
    ) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        if (await condition()) return;
        await new Promise((r) => setTimeout(r, 120));
      }
      throw new Error(
        "Zaman aşımı: " +
          JSON.stringify(
            snapshots.map((s) => ({
              status: s?.status,
              error: s?.error,
              members: s?.members.map((p) => ({
                connected: p.connected,
                mic: p.mic_open,
                speaking: p.speaking,
              })),
            })),
          ),
      );
    };
    try {
      const [wasmModule, fsBundle] = await Promise.all([
        fetch(wasmUrl)
          .then((r) => r.arrayBuffer())
          .then((b) => WebAssembly.compile(b)),
        fetch(bundleUrl).then((r) => r.blob()),
      ]);
      db = await PGlite.create({ wasmModule, fsBundle });
      await db.exec(`create role anon; create role authenticated; create schema auth;
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
      await db.exec(setup);
      const users = Array.from({ length: 4 }, () => crypto.randomUUID());
      const apis = users.map(call);
      const code = await apis[0]<string>("vk_create", {
        p_name: "Ses QA 1",
        p_settings: { turn_based: true, voice_enabled: true, day_seconds: 600 },
      });
      for (let i = 1; i < 4; i++)
        await apis[i]("vk_join", { p_code: code, p_name: `Ses QA ${i + 1}` });
      await apis[0]("vk_start", { p_code: code });
      const players = await q(
        "select p.* from vk_private.players p join vk_private.rooms r on p.room_id=r.id where r.code=$1 order by p.number",
        [code],
      );
      await q(
        "update vk_private.rooms set phase='intro',seq=seq+1,ends_at=now()+interval '10 minutes',speech_order=$2::uuid[],speech_turn=8,speech_slot_ms=15000,speech_ends_at=null where code=$1",
        [code, players.map((p) => p.id)],
      );
      const refresh = async () => {
        for (let i = 0; i < 2; i++)
          controllers.current[i].updateGame(
            await apis[i]<Game>("vk_state", { p_code: code }),
          );
      };
      const media = () => {
        const destination = tones.createMediaStreamDestination();
        const oscillator = tones.createOscillator();
        const gain = tones.createGain();
        gain.gain.value = 0.07;
        oscillator.frequency.value = 330;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        streams.push(destination.stream);
        return Promise.resolve(destination.stream);
      };
      controllers.current = apis.slice(0, 2).map(
        (rpc, i) =>
          new VoiceController({
            rpc,
            onChange: (s) => {
              snapshots[i] = s;
            },
            getMedia: media,
            silent: true,
            iceServers: [],
          }),
      );
      await refresh();
      await Promise.all(controllers.current.map((c) => c.connect()));
      await wait(() =>
        snapshots.every(
          (s) => s?.members.length === 2 && s.members.every((p) => p.connected),
        ),
      );
      check(streams.length === 0, "Sese katılmak mikrofonu açmadı.");
      await controllers.current[0].toggleMic();
      await wait(
        async () => (await controllers.current[1].packetCounts()) > 10,
      );
      const packets = await controllers.current[1].packetCounts();
      check(
        packets > 10,
        `İki gerçek WebRTC eşi arasında ses taşındı (${packets} paket).`,
      );
      await wait(
        () =>
          !!snapshots[1]?.members.some(
            (p) => p.player_id === players[0].id && p.speaking,
          ),
      );
      check(true, "Karşı oyuncunun ses etkinliği Konuşuyor olarak algılandı.");
      // Turn one must revoke the previously open microphone, without reopening it later.
      await q(
        "update vk_private.rooms set speech_turn=1,speech_ends_at=now()+interval '30 seconds' where code=$1",
        [code],
      );
      await refresh();
      check(
        streams[0].getAudioTracks()[0].readyState === "ended" &&
          !snapshots[0]?.mic,
        "Sıra değişince önceki mikrofonun ses izi durduruldu.",
      );
      const before = streams.length;
      await controllers.current[0].toggleMic();
      check(
        streams.length === before,
        "Sırası gelmeyen oyuncu mikrofon açamadı.",
      );
      await controllers.current[1].toggleMic();
      await wait(
        async () => (await controllers.current[0].packetCounts()) > 10,
      );
      check(
        !!snapshots[1]?.mic,
        "Yeni konuşmacı kendi isteğiyle mikrofon açabildi.",
      );
      await q("update vk_private.players set alive=false where id=$1", [
        players[1].id,
      ]);
      await refresh();
      check(
        !snapshots[1]?.mic &&
          streams.at(-1)!.getAudioTracks()[0].readyState === "ended",
        "Oyuncu elenince mikrofon tamamen kapandı.",
      );
      await q(
        "update vk_private.rooms set settings=jsonb_set(settings,'{turn_based}','false') where code=$1",
        [code],
      );
      await refresh();
      check(
        snapshots.every((s) => s?.status === "off"),
        "Sıralı konuşma kapatılınca bütün ses oturumları kapandı.",
      );
      setResult("BAŞARILI");
    } catch (e) {
      setResult("BAŞARISIZ");
      log(String((e as Error).message || e));
    } finally {
      controllers.current.forEach((c) => c.disconnect());
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      await chain;
      await tones.close();
      if (db!) await db.close();
      setRunning(false);
    }
  }
  return (
    <main className="scene-preview">
      <h1>Sesli masa · Entegrasyon testi</h1>
      <p>
        Üretilmiş test tonu kullanılır. Gerçek mikrofon, kullanıcı hesabı veya
        canlı masa kullanılmaz.
      </p>
      <button
        className="button primary"
        disabled={running}
        onClick={() => void run()}
      >
        {running ? "Test sürüyor…" : "Ses bağlantısını test et"}
      </button>
      <h2>{result}</h2>
      <ol>
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </main>
  );
}
