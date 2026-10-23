import type { Game } from "../game";
import { voiceEnabled, voiceWindow } from "./policy.ts";

export type VoicePeer = {
  session_id: string;
  player_id: string | null;
  name: string;
  number: number | null;
  mic_open: boolean;
  can_speak: boolean;
};
export type VoiceMember = VoicePeer & { speaking: boolean; connected: boolean };
type SignalPayload =
  | { type: "offer" | "answer"; sdp: string }
  | { type: "ice"; candidate: RTCIceCandidateInit };
type Message = { id: string; to: string; payload: SignalPayload };
type Reply = {
  enabled: boolean;
  peers: VoicePeer[];
  signals: { id: number; from: string; payload: SignalPayload }[];
  can_speak: boolean;
  server_now: string;
};
export type VoiceSnapshot = {
  status: "off" | "connecting" | "connected" | "reconnecting";
  mic: boolean;
  pending: boolean;
  deafened: boolean;
  playbackBlocked: boolean;
  error: string;
  members: VoiceMember[];
};
export const emptyVoice: VoiceSnapshot = {
  status: "off",
  mic: false,
  pending: false,
  deafened: false,
  playbackBlocked: false,
  error: "",
  members: [],
};
export type VoiceRpc = <T>(
  name: string,
  args: Record<string, unknown>,
) => Promise<T>;
type Meter = {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
  until: number;
};
type Link = {
  peer: VoicePeer;
  pc: RTCPeerConnection;
  sender?: RTCRtpSender;
  audio: HTMLAudioElement;
  queue: Promise<void>;
  candidates: RTCIceCandidateInit[];
  meter?: Meter;
};
type Options = {
  rpc: VoiceRpc;
  onChange: (state: VoiceSnapshot) => void;
  getMedia?: () => Promise<MediaStream>;
  silent?: boolean;
  iceServers?: RTCIceServer[];
};

export class VoiceController {
  private game: Game | null = null;
  private offset = 0;
  private windowKey: string | null = null;
  private windowTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private meterTimer?: ReturnType<typeof setInterval>;
  private sessionId = "";
  private code = "";
  private generation = 0;
  private micGeneration = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private localMeter?: Meter;
  private links = new Map<string, Link>();
  private peers: VoicePeer[] = [];
  private outbox: Message[] = [];
  private after = 0;
  private joinNext = true;
  private failures = 0;
  private active = false;
  private snapshot: VoiceSnapshot = { ...emptyVoice };

  private options: Options;
  constructor(options: Options) {
    this.options = options;
  }

  private emit(update: Partial<VoiceSnapshot> = {}) {
    this.snapshot = { ...this.snapshot, ...update };
    this.options.onChange({
      ...this.snapshot,
      members: [...this.snapshot.members],
    });
  }

  updateGame(game: Game | null, offset = 0) {
    this.game = game;
    this.offset = offset;
    if (this.active && (!voiceEnabled(game) || game.code !== this.code)) {
      this.disconnect();
      return;
    }
    clearTimeout(this.windowTimer);
    const window = voiceWindow(game, game?.me?.id || null, Date.now() + offset);
    if (window?.key !== this.windowKey || !window) this.stopMic();
    this.windowKey = window?.key || null;
    if (window)
      this.windowTimer = setTimeout(
        () => this.stopMic(),
        Math.max(0, window.ends - Date.now() - offset),
      );
    this.applyPlayback();
  }

  async connect() {
    if (this.active || !voiceEnabled(this.game)) return;
    if (!globalThis.RTCPeerConnection || !globalThis.AudioContext) {
      this.emit({ error: "Tarayıcın sesli sohbeti desteklemiyor." });
      return;
    }
    this.active = true;
    const generation = ++this.generation;
    this.sessionId = crypto.randomUUID();
    this.code = this.game.code;
    this.after = 0;
    this.outbox = [];
    this.joinNext = true;
    this.failures = 0;
    this.context = new AudioContext();
    void this.context
      .resume()
      .catch(() => this.emit({ playbackBlocked: true }));
    this.emit({ ...emptyVoice, status: "connecting" });
    this.meterTimer = setInterval(() => this.updateMeters(), 100);
    await this.sync(generation);
  }

  disconnect() {
    const oldCode = this.code,
      oldSession = this.sessionId;
    const wasActive = this.active;
    this.active = false;
    ++this.generation;
    clearTimeout(this.pollTimer);
    clearTimeout(this.windowTimer);
    clearInterval(this.meterTimer);
    this.stopMic();
    for (const id of this.links.keys()) this.closeLink(id);
    this.peers = [];
    this.outbox = [];
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.emit({ ...emptyVoice });
    if (wasActive)
      void this.options
        .rpc("vk_voice_leave", { p_code: oldCode, p_session: oldSession })
        .catch(() => {});
  }

  stopMic() {
    ++this.micGeneration;
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.localMeter?.source.disconnect();
    this.localMeter = undefined;
    for (const link of this.links.values())
      void link.sender?.replaceTrack(null).catch(() => {});
    if (this.snapshot.mic || this.snapshot.pending)
      this.emit({ mic: false, pending: false });
  }

  async toggleMic() {
    if (this.stream || this.snapshot.pending) {
      this.stopMic();
      return;
    }
    const allowed = voiceWindow(
      this.game,
      this.game?.me?.id || null,
      Date.now() + this.offset,
    );
    if (!this.active || !allowed || this.snapshot.status !== "connected")
      return;
    const generation = this.generation,
      key = allowed.key,
      micGeneration = ++this.micGeneration;
    this.emit({ pending: true, error: "" });
    try {
      const permission = await this.options.rpc<Reply>("vk_voice_sync", {
        p_code: this.code,
        p_session: this.sessionId,
        p_after: this.after,
        p_messages: [],
        p_join: false,
        p_mic: false,
      });
      if (
        generation !== this.generation ||
        micGeneration !== this.micGeneration
      )
        return;
      if (!permission.enabled || !permission.can_speak) {
        this.stopMic();
        this.emit({ error: "Şu anda söz hakkın yok; mikrofon kapalı kaldı." });
        return;
      }
      const stream = await (this.options.getMedia
        ? this.options.getMedia()
        : navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
            },
            video: false,
          }));
      if (
        !this.active ||
        generation !== this.generation ||
        micGeneration !== this.micGeneration ||
        !this.snapshot.pending ||
        voiceWindow(
          this.game,
          this.game?.me?.id || null,
          Date.now() + this.offset,
        )?.key !== key
      ) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const confirmed = await this.options.rpc<Reply>("vk_voice_sync", {
        p_code: this.code,
        p_session: this.sessionId,
        p_after: this.after,
        p_messages: [],
        p_join: false,
        p_mic: true,
      });
      if (
        generation !== this.generation ||
        micGeneration !== this.micGeneration
      )
        return;
      if (!confirmed.enabled || !confirmed.can_speak) {
        this.stopMic();
        return;
      }
      this.localMeter = this.makeMeter(stream);
      const track = stream.getAudioTracks()[0];
      track.onended = () => this.stopMic();
      await Promise.all(
        [...this.links.values()].map((link) =>
          link.sender?.replaceTrack(track),
        ),
      );
      if (micGeneration !== this.micGeneration) return;
      if (
        !this.active ||
        !this.stream ||
        !voiceWindow(
          this.game,
          this.game?.me?.id || null,
          Date.now() + this.offset,
        )
      ) {
        this.stopMic();
        return;
      }
      this.emit({ mic: true, pending: false });
    } catch (e) {
      if (
        generation !== this.generation ||
        micGeneration !== this.micGeneration
      )
        return;
      this.stopMic();
      const name = (e as DOMException)?.name;
      this.emit({
        pending: false,
        error:
          name === "NotAllowedError"
            ? "Mikrofon izni verilmedi. Tarayıcının site izinlerinden açıp yeniden deneyebilirsin."
            : name === "NotFoundError"
              ? "Bir mikrofon bulunamadı."
              : "Mikrofon açılamadı. Bağlantını ve cihaz izinlerini kontrol et.",
      });
    }
  }

  async enablePlayback() {
    try {
      await this.context?.resume();
      await Promise.all(
        [...this.links.values()]
          .filter((l) => l.audio.srcObject)
          .map((l) => l.audio.play()),
      );
      this.emit({ playbackBlocked: false });
    } catch {
      this.emit({ playbackBlocked: true });
    }
  }

  toggleDeafened() {
    this.emit({ deafened: !this.snapshot.deafened });
    this.applyPlayback();
  }

  private makeMeter(stream: MediaStream): Meter | undefined {
    if (!this.context || !stream.getAudioTracks().length) return;
    const source = this.context.createMediaStreamSource(stream);
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    return { source, analyser, samples: new Float32Array(512), until: 0 };
  }

  private speaking(meter: Meter | undefined, allowed: boolean) {
    if (!meter || !allowed) return false;
    meter.analyser.getFloatTimeDomainData(meter.samples);
    const rms = Math.sqrt(
      meter.samples.reduce((sum, x) => sum + x * x, 0) / meter.samples.length,
    );
    if (rms > 0.018) meter.until = Date.now() + 350;
    return meter.until > Date.now();
  }

  private updateMeters() {
    if (!this.active) return;
    if (
      this.stream &&
      !voiceWindow(
        this.game,
        this.game?.me?.id || null,
        Date.now() + this.offset,
      )
    )
      this.stopMic();
    this.applyPlayback();
    const members = this.peers.map((peer) => {
      const self = peer.session_id === this.sessionId;
      const link = this.links.get(peer.session_id);
      const permitted = !!voiceWindow(
        this.game,
        peer.player_id,
        Date.now() + this.offset,
      );
      const mic = self
        ? this.snapshot.mic
        : peer.mic_open && peer.can_speak && permitted;
      return {
        ...peer,
        mic_open: mic,
        connected: self || link?.pc.connectionState === "connected",
        speaking: this.speaking(self ? this.localMeter : link?.meter, mic),
      };
    });
    if (JSON.stringify(members) !== JSON.stringify(this.snapshot.members))
      this.emit({ members });
  }

  private applyPlayback() {
    for (const link of this.links.values()) {
      const wasMuted = link.audio.muted;
      link.audio.muted =
        !!this.options.silent ||
        this.snapshot.deafened ||
        !link.peer.mic_open ||
        !link.peer.can_speak ||
        !voiceWindow(this.game, link.peer.player_id, Date.now() + this.offset);
      if (wasMuted && !link.audio.muted && link.audio.srcObject)
        void link.audio.play().catch(() => {
          if (this.active) this.emit({ playbackBlocked: true });
        });
    }
  }

  private closeLink(id: string) {
    const link = this.links.get(id);
    if (!link) return;
    link.pc.onicecandidate = null;
    link.pc.ontrack = null;
    link.pc.onconnectionstatechange = null;
    link.pc.close();
    link.audio.pause();
    link.audio.srcObject = null;
    link.meter?.source.disconnect();
    this.links.delete(id);
  }

  private linkFor(peer: VoicePeer): Link {
    const existing = this.links.get(peer.session_id);
    if (existing) {
      existing.peer = peer;
      return existing;
    }
    const pc = new RTCPeerConnection({
      iceServers: this.options.iceServers || [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
          ],
        },
      ],
      bundlePolicy: "max-bundle",
    });
    // Only the offerer creates a transceiver. The answerer must use the one
    // supplied by the remote offer, otherwise its sender has no negotiated mid.
    const sender =
      this.sessionId < peer.session_id
        ? pc.addTransceiver("audio", { direction: "sendrecv" }).sender
        : undefined;
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.muted = true;
    const link: Link = {
      peer,
      pc,
      sender,
      audio,
      queue: Promise.resolve(),
      candidates: [],
    };
    this.links.set(peer.session_id, link);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && this.active && this.links.get(peer.session_id) === link)
        this.send(peer.session_id, {
          type: "ice",
          candidate: candidate.toJSON(),
        });
    };
    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] || new MediaStream([track]);
      audio.srcObject = stream;
      link.meter?.source.disconnect();
      link.meter = this.makeMeter(stream);
      this.applyPlayback();
      void audio.play().catch(() => this.emit({ playbackBlocked: true }));
    };
    pc.onconnectionstatechange = () => {
      if (!this.active || this.links.get(peer.session_id) !== link) return;
      if (pc.connectionState === "failed")
        this.emit({
          error:
            "Bir ses bağlantısı kurulamadı. Yeniden bağlanmayı dene; bazı ağlarda ses için aktarım sunucusu gerekir.",
        });
      this.updateMeters();
    };
    if (this.stream)
      void sender
        ?.replaceTrack(this.stream.getAudioTracks()[0])
        .catch(() => this.stopMic());
    return link;
  }

  private enqueue(link: Link, task: () => Promise<void>) {
    link.queue = link.queue
      .then(async () => {
        if (!this.active || this.links.get(link.peer.session_id) !== link)
          return;
        await task();
      })
      .catch(() => {
        if (this.active)
          this.emit({
            error:
              "Ses bağlantısı tamamlanamadı. Sesten ayrılıp yeniden katılabilirsin.",
          });
      });
  }

  private send(to: string, payload: SignalPayload) {
    if (this.active) this.outbox.push({ id: crypto.randomUUID(), to, payload });
  }

  private async sync(generation: number) {
    if (!this.active || generation !== this.generation) return;
    const messages = this.outbox.splice(0, 40);
    let delay = 1000;
    try {
      const reply = await this.options.rpc<Reply>("vk_voice_sync", {
        p_code: this.code,
        p_session: this.sessionId,
        p_after: this.after,
        p_messages: messages,
        p_join: this.joinNext,
        p_mic: this.snapshot.mic,
      });
      if (!this.active || generation !== this.generation) return;
      if (!reply.enabled) {
        this.disconnect();
        return;
      }
      this.joinNext = false;
      if (this.failures) this.emit({ error: "" });
      this.failures = 0;
      this.peers = reply.peers;
      if (!reply.can_speak) this.stopMic();
      const ids = new Set(reply.peers.map((p) => p.session_id));
      for (const id of this.links.keys()) if (!ids.has(id)) this.closeLink(id);
      for (const peer of reply.peers) {
        if (
          peer.session_id === this.sessionId ||
          this.links.has(peer.session_id)
        )
          continue;
        const link = this.linkFor(peer);
        if (this.sessionId < peer.session_id)
          this.enqueue(link, async () => {
            await link.pc.setLocalDescription(await link.pc.createOffer());
            this.send(peer.session_id, {
              type: "offer",
              sdp: link.pc.localDescription!.sdp,
            });
          });
      }
      for (const peer of reply.peers) {
        const link = this.links.get(peer.session_id);
        if (link) link.peer = peer;
      }
      for (const signal of reply.signals) {
        this.after = Math.max(this.after, signal.id);
        const peer = reply.peers.find((p) => p.session_id === signal.from);
        if (!peer || signal.from === this.sessionId) continue;
        const link = this.linkFor(peer);
        this.enqueue(link, async () => {
          const payload = signal.payload;
          if (payload.type === "ice") {
            if (link.pc.remoteDescription)
              await link.pc.addIceCandidate(payload.candidate);
            else link.candidates.push(payload.candidate);
            return;
          }
          await link.pc.setRemoteDescription({
            type: payload.type,
            sdp: payload.sdp,
          });
          if (payload.type === "offer") {
            const transceiver = link.pc
              .getTransceivers()
              .find((t) => t.receiver.track.kind === "audio");
            if (!transceiver) throw new Error("Ses kanalı bulunamadı.");
            transceiver.direction = "sendrecv";
            link.sender = transceiver.sender;
            await link.sender.replaceTrack(
              this.stream?.getAudioTracks()[0] || null,
            );
          }
          for (const candidate of link.candidates.splice(0))
            await link.pc.addIceCandidate(candidate);
          if (payload.type === "offer") {
            await link.pc.setLocalDescription(await link.pc.createAnswer());
            this.send(signal.from, {
              type: "answer",
              sdp: link.pc.localDescription!.sdp,
            });
          }
        });
      }
      this.emit({ status: "connected" });
      this.updateMeters();
    } catch (e) {
      if (!this.active || generation !== this.generation) return;
      this.outbox.unshift(...messages);
      this.failures++;
      this.stopMic();
      const text = String((e as { message?: string })?.message || e);
      if (/başka sekmede|katılmalısın|Masa bulunamadı/i.test(text)) {
        this.disconnect();
        this.emit({ error: text });
        return;
      }
      this.emit({
        status: "reconnecting",
        error:
          "Ses bağlantısı kesildi; mikrofon kapatıldı. Yeniden bağlanılıyor…",
      });
      delay = Math.min(8000, 1000 * 2 ** this.failures);
    }
    if (this.active && generation === this.generation)
      this.pollTimer = setTimeout(() => void this.sync(generation), delay);
  }

  // Only the development QA page reads packet counters; no media is recorded.
  async packetCounts() {
    let received = 0;
    for (const link of this.links.values()) {
      const stats = await link.pc.getStats();
      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "audio")
          received += report.packetsReceived || 0;
      });
    }
    return received;
  }
}
