import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Heart,
  Headphones,
  HelpCircle,
  Link,
  LoaderCircle,
  LockKeyhole,
  Moon,
  Monitor,
  MessagesSquare,
  Palette,
  Play,
  Plus,
  Shield,
  Sparkles,
  Sun,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import {
  defaults,
  friendlyError,
  roles,
  roleModeLabels,
  upcomingRoles,
  rpc,
  session,
  themes,
  type Game,
  type Player,
  type Role,
  type Settings,
  type Theme,
  type RoomQuota,
} from "./game";
import { Sprite, Village } from "./art";
import { EventScene } from "./EventScene";
import { SpeechPanel } from "./SpeechPanel";
import { EarlyAdvance } from "./EarlyAdvance";
import { RoomAllowance } from "./RoomAllowance";
import { RoleOptions } from "./RoleOptions";
import { VampireAttack } from "./VampireAttack";
import { useVoice } from "./voice/useVoice";
import { VoicePanel, VoiceBadge } from "./voice/VoicePanel";
import { useGameSounds } from "./sound/useGameSounds";
import { LobbyStories } from "./LobbyStories";
import { LobbyReadiness, RematchControls } from "./LobbyReadiness";
import { ConnectionStatus, KickButton, eliminationText } from "./RoomManagement";

type Panel = "create" | "join" | "rules" | "theme" | "role" | null;
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      aria-label={title}
      className={`modal ${wide ? "wide" : ""}`}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function Timer({
  ends,
  offset = 0,
  waiting = true,
}: {
  ends: string;
  offset?: number;
  waiting?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((Date.parse(ends) - now - offset) / 1000));
  return (
    <span className={`timer ${left === 0 ? "waiting" : ""}`}>
      {left === 0 ? (
        <>
          <Clock size={17} />{" "}
          {waiting ? "Seçimler bekleniyor" : "Yeni aşamaya geçiliyor"}
        </>
      ) : (
        <>
          <Clock size={17} />
          {String(Math.floor(left / 60)).padStart(2, "0")}:
          {String(left % 60).padStart(2, "0")}
        </>
      )}
    </span>
  );
}
function RoleInfo({ role }: { role: Role }) {
  const r = roles[role];
  return (
    <div className="role-detail">
      <div className={`role-portrait ${role}`}>
        <Sprite role={role} />
        <Sparkles className="portrait-star" size={20} />
      </div>
      <span className="eyebrow">{r.tag}</span>
      <h3>{r.name}</h3>
      <p>{r.description}</p>
      <div className="rule-box">
        <strong>
          <Heart size={16} /> Nasıl kazanırsın?
        </strong>
        <p>{r.win}</p>
      </div>
      <p className="muted small">{r.lose}</p>
    </div>
  );
}
function Rules() {
  return (
    <div className="rules-content">
      <p>
        Moderatör yok, şüphe çok. Masayı kuran kişi ister oynar, ister ortak
        ekranı yönetir.
      </p>
      <ol>
        <li>
          <strong>Masaya toplanın.</strong> 4–24 kişi katılır. Herkese sabit bir
          numara ve gizli bir rol verilir. Oyuna katılmayan masa sahibi numara
          veya rol almaz; oyuncu sayısına katılmaz.
        </li>
        <li>
          <strong>Önce sohbet.</strong> İlk konuşma bittiğinde gece başlar. İlk
          gün idam yoktur. Yaşayanların yarısından fazlası “Geceye geçelim”
          derse ilk konuşma erken biter.
        </li>
        <li>
          <strong>Gece sessizlik.</strong> Vampir hedefini, varsa doktor
          ardından korumasını seçer. Her aşama en az ayarlanan süre kadar sürer;
          seçim olmadan geçilmez.
        </li>
        <li>
          <strong>Gündüz şüphe.</strong> Konuşma süresi dolunca oylama açılır.
          Yaşayanların yarısından fazlası isterse erkenden açılır.
        </li>
        <li>
          <strong>Herkese iki söz.</strong> Sıra bazlı konuşma açıksa her gündüz
          rastgele sırayla iki tur konuşulur. Konuşmacı “Sözümü bitirdim”
          diyebilir; süre dolunca sıra otomatik geçer. Ardından kalan süre
          serbest sohbettir.
        </li>
        <li>
          <strong>Tek oy, kesin karar.</strong> Kendine oy veremezsin. Oyun
          değişmez; oy verdikten sonra sayıları görürsün. Herkes oy verene ve
          asgari süre dolana kadar beklenir.
        </li>
        <li>
          <strong>Çoğunluk şart.</strong> Yaşayanların yarısından fazlasının
          seçtiği oyuncu idam edilir. Sonuç çıkmazsa ek tartışma ve yeni oylama
          yapılır.
        </li>
      </ol>
      <div className="rule-box">
        Vampir 3 veya daha az kişiyle geceye girerse kazanır. Vampir idam
        edilirse köy, soytarı idam edilirse yalnızca soytarı kazanır. Ölenlerin
        rolleri oyun sonunda açılır. Bağlantı veya çıkarma sonrası vampirle
        birlikte yalnızca 2 kişi kalırsa da vampir kazanır.
      </div>
      <p className="small muted">
        Bağlantın koparsa masada belirlenen bekleme süresi içinde aynı tarayıcıdan dön.
        Numaran ve rolün korunur. Süre dolarsa o turdan elenirsin; oyun kalan oyuncularla devam eder.
        Soytarı bağlantı nedeniyle elenerek kazanamaz. Vampir elenirse köy kazanır.
      </p>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(location.search);
  const invite = params.get("oda")?.toUpperCase() || "";
  const saved = localStorage.getItem("vk-room") || "";
  const [code, setCode] = useState(invite && invite === saved ? invite : "");
  const codeRef = useRef(code);
  codeRef.current = code;
  const [panel, setPanel] = useState<Panel>(
    invite && invite !== saved ? "join" : null,
  );
  const [roomInput, setRoomInput] = useState(invite);
  const [name, setName] = useState(localStorage.getItem("vk-name") || "");
  const [roomPin, setRoomPin] = useState("");
  const [cfg, setCfg] = useState<Settings>({ ...defaults });
  const [quota, setQuota] = useState<RoomQuota | null>(null);
  const [quotaError, setQuotaError] = useState("");
  const [quotaOffset, setQuotaOffset] = useState(0);
  const loadQuota = useCallback(async () => {
    try {
      await session();
      const start = Date.now();
      const data = await rpc<RoomQuota>("vk_quota", {});
      setQuotaOffset(Date.parse(data.server_now) - (start + Date.now()) / 2);
      setQuota(data);
      setQuotaError("");
    } catch (e) {
      setQuotaError(friendlyError(e));
    }
  }, []);
  useEffect(() => {
    if (code) return;
    void loadQuota();
    const timer = setInterval(() => void loadQuota(), 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void loadQuota();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [code, loadQuota]);
  useEffect(() => {
    if (code || !quota?.next_refresh_at) return;
    const delay = Date.parse(quota.next_refresh_at) - Date.now() - quotaOffset;
    const timer = setTimeout(
      () => void loadQuota(),
      Math.max(250, delay + 100),
    );
    return () => clearTimeout(timer);
  }, [code, quota?.next_refresh_at, quotaOffset, loadQuota]);
  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem("vk-theme") as Theme) || "classic",
  );
  const [nightPreview, setNightPreview] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [offset, setOffset] = useState(0);
  const voice = useVoice(game, offset);
  const sound = useGameSounds({
    panel,
    room: code,
    phase: game?.phase || null,
    nightPreview,
    onNotice: setNotice,
  });
  const activeNight = game ? game.phase === "night" : nightPreview;
  const actualTheme = game?.settings.theme || theme;
  useEffect(() => {
    document.documentElement.dataset.theme = actualTheme;
    document.documentElement.dataset.time = activeNight ? "night" : "day";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", activeNight ? "#28273c" : "#f7f1e3");
  }, [actualTheme, activeNight]);
  const removed = useCallback((e: unknown) => {
    if ((e as { code?: string })?.code !== "VK001") return false;
    codeRef.current = "";
    localStorage.removeItem("vk-room");
    setCode(""); setGame(null); setPanel(null); setError(""); setConnectionError("");
    setNotice("Masa sahibi seni masadan çıkardı.");
    history.replaceState(null, "", location.pathname);
    return true;
  }, []);
  const refresh = useCallback(async () => {
    if (!code) return;
    const start = Date.now();
    const data = await rpc<Game>("vk_state", { p_code: code });
    if (codeRef.current !== code) return;
    setGame((prev) =>
      prev &&
      prev.code === data.code &&
      (prev.seq > data.seq ||
        (prev.seq === data.seq &&
          (prev.speech?.turn_index || 0) > (data.speech?.turn_index || 0)))
        ? prev
        : data,
    );
    setOffset(Date.parse(data.server_now) - (start + Date.now()) / 2);
    setConnectionError("");
    return data;
  }, [code]);
  useEffect(() => {
    if (!code) {
      setGame(null);
      return;
    }
    let stopped = false;
    let t: ReturnType<typeof setTimeout>;
    let polling = false;
    async function poll() {
      if (polling || stopped) return;
      polling = true;
      try {
        await session();
        if (stopped) return;
        await refresh();
      } catch (e) {
        if (!stopped && !removed(e)) setConnectionError(friendlyError(e));
      } finally {
        polling = false;
        if (!stopped) t = setTimeout(poll, 1800);
      }
    }
    poll();
    const visible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(t);
        poll();
      }
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [code, refresh, removed]);
  useEffect(() => {
    setSelected(null);
  }, [game?.code, game?.seq]);
  useEffect(() => {
    if (selected && !game?.players.some(p => p.id === selected && p.alive)) setSelected(null);
  }, [game?.players, selected]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    if (!game || game.phase !== "lobby") return;
    const link = shareLink(game.code);
    let active = true;
    QRCode.toDataURL(link, {
      width: 250,
      margin: 1,
      color: { dark: "#343247", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((x) => {
        if (active) setQr(x);
      })
      .catch(() => setQr(""));
    return () => {
      active = false;
    };
  }, [game?.code, game?.phase]);
  function shareLink(c: string) {
    const u = new URL(location.href);
    u.search = "";
    u.hash = "";
    u.searchParams.set("oda", c);
    return u.href;
  }
  function enter(c: string) {
    codeRef.current = c;
    localStorage.setItem("vk-room", c);
    localStorage.setItem("vk-name", name.trim());
    setGame(null);
    setConnectionError("");
    setCode(c);
    setPanel(null);
    setRoomPin("");
    const u = new URL(location.href);
    u.searchParams.set("oda", c);
    history.replaceState(null, "", u);
  }
  async function submit(e: FormEvent, create: boolean) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await session();
      if (create) {
        const c = await rpc<string>("vk_create", { p_name: cfg.host_plays ? name : "", p_settings: cfg, p_pin: cfg.pin_enabled ? roomPin : null });
        enter(c);
      } else {
        const result = await rpc<{ code?: string; error?: string }>("vk_enter", { p_name: name, p_code: roomInput, p_pin: roomPin || null });
        if (result.error || !result.code) throw new Error(result.error || "Masaya katılınamadı.");
        enter(result.code);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      if (create) void loadQuota();
    }
  }
  async function act(action: string, target: string | null = null) {
    if (!game || busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "start") await rpc("vk_start", { p_code: code });
      else if (action === "ready") await rpc("vk_ready", { p_code: code, p_seq: game.seq, p_ready: !game.me?.ready });
      else if (action === "kick") await rpc("vk_kick", { p_code: code, p_seq: game.seq, p_target: target });
      else if (action === "rematch") await rpc("vk_rematch", { p_code: code, p_seq: game.seq });
      else if (action === "speak")
        await rpc("vk_speak", {
          p_code: code,
          p_seq: game.seq,
          p_turn: game.speech?.turn_index,
        });
      else
        await rpc("vk_act", {
          p_code: code,
          p_seq: game.seq,
          p_action: action,
          p_target: target,
        });
      await refresh();
      setSelected(null);
    } catch (e) {
      if (!removed(e)) {
        setError(friendlyError(e));
        await refresh().catch(removed);
      }
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Kopyalandı. Arkadaşlarına gönder!");
    } catch {
      setNotice("Kopyalanamadı. Masa kodunu arkadaşlarınla paylaşabilirsin.");
    }
  }
  function home() {
    codeRef.current = "";
    setCode("");
    setGame(null);
    setPanel(null);
    setError("");
    setConnectionError("");
    history.replaceState(null, "", location.pathname);
  }
  function open(p: Panel) {
    setRoomPin("");
    setError("");
    setPanel(p);
  }
  const alive = game?.players.filter((p) => p.alive) || [];
  const needed = Math.floor(alive.length / 2) + 1;
  const canChoose =
    !!game &&
    game.me?.alive &&
    ((game.phase === "voting" && !game.my_vote) ||
      (game.phase === "night" && game.my_turn && !game.has_chosen));
  const allowed = (p: Player) =>
    p.alive &&
    (game?.phase === "night" && game.me?.role === "doctor"
      ? p.id !== game.me?.id || !game.me?.self_heal_used
      : p.id !== game?.me?.id);
  const currentRole = game?.me?.role || "villager";
  const phaseText: Record<string, string> = {
    lobby: "Ateşin etrafında toplanıyoruz",
    dealing: "Kader kartların karılıyor…",
    countdown: "Herkes hazır mı?",
    intro: "Önce biraz tanışalım",
    night: "Köy uykuya daldı",
    night_result: "Güneş yeniden doğuyor",
    day: "Peki, sence vampir kim?",
    voting: "Köy kararını veriyor",
    runoff: "Köy henüz anlaşamadı",
    execution: "Köyün kararı belli oldu",
    finished: "Köydeki sır çözüldü!",
  };
  const didWin =
    game?.winner === "village"
      ? ["villager", "doctor"].includes(currentRole)
      : game?.winner === currentRole;

  return (
    <>
      <VampireAttack
        eventKey={
          game &&
          !game.is_observer &&
          game.phase !== "finished" &&
          game.me &&
          !game.me.alive &&
          game.me.eliminated_by === "vampire"
            ? `${game.code}:${game.round_number || 1}:${game.me.id}`
            : null
        }
      />
      <div className="app-shell">
        <div className="co-production" aria-label="GISM ve SPTLS ortak yapımı">
          <strong>GISM</strong>
          <span aria-hidden="true">🤝</span>
          <strong>SPTLS</strong>
          <span>ortak yapımı</span>
        </div>
        <header className="site-header">
          <button
            className="brand"
            onClick={home}
            aria-label="Vampir Köylü ana sayfa"
          >
            <img src="./icon.svg" alt="" />
            <span>
              vampir<span className="brand-dot">·</span>köylü
            </span>
          </button>
          <nav aria-label="Üst menü">
            <button
              className="nav-link"
              aria-label="Nasıl oynanır?"
              onClick={() => open("rules")}
            >
              <HelpCircle size={17} />
              <span>Nasıl oynanır?</span>
            </button>
            <span className="nav-divider" />
            <button
              className="icon-button sound-toggle"
              data-sound-toggle
              onClick={sound.toggle}
              aria-label={
                sound.enabled ? "Oyun efektlerini kapat" : "Oyun efektlerini aç"
              }
              aria-pressed={sound.enabled}
              title="Buton tıklamaları ve ekran geçişleri için hafif ses efektleri"
            >
              {sound.enabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
              <span className="sound-status">
                <strong>Efektler</strong>
                <small>{sound.enabled ? "Açık" : "Kapalı"}</small>
              </span>
            </button>
            <button
              className="icon-button"
              onClick={() => open("theme")}
              aria-label="Renk paketleri"
            >
              <Palette size={19} />
            </button>
            {!game && (
              <button
                className="icon-button"
                onClick={() => setNightPreview(!nightPreview)}
                aria-label={
                  nightPreview ? "Gündüz temasını gör" : "Gece temasını gör"
                }
              >
                {nightPreview ? <Sun size={19} /> : <Moon size={19} />}
              </button>
            )}
          </nav>
        </header>

        {!code ? (
          <main className="home-main">
            <div className="hero">
              <div className="hero-copy">
                <div className="pill">
                  <span className="status-dot" /> MODERATÖRSÜZ. BOL ŞÜPHELİ.
                </div>
                <h1>
                  Köyde bir
                  <br />
                  şeyler{" "}
                  <span>
                    dönüyor<span className="pixel-period">.</span>
                  </span>
                </h1>
                <p className="hero-sub">
                  Arkadaşların yanında. Vampir de öyle.
                  <br />
                  Bir masa kur, rolünü kap, kimseye güvenme.
                </p>
                <div className="hero-actions">
                  <button
                    className="button primary"
                    disabled={quota?.remaining === 0}
                    onClick={() => {
                      setCfg({ ...defaults, theme });
                      open("create");
                    }}
                  >
                    <Plus size={21} /> Oyun kur <ArrowRight size={20} />
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => open("join")}
                  >
                    <Link size={19} /> Masaya katıl
                  </button>
                </div>
                <RoomAllowance
                  quota={quota}
                  offset={quotaOffset}
                  error={quotaError}
                  onRefresh={() => void loadQuota()}
                />
                <div className="hero-meta">
                  <span>
                    <Users size={15} /> 4–24 oyuncu
                  </span>
                  <span>
                    <Shield size={15} /> Gizli roller
                  </span>
                  <span>
                    <Heart size={15} /> Aynı masa, bol kahkaha
                  </span>
                </div>
                {saved && (
                  <button className="resume-link" onClick={() => enter(saved)}>
                    Son masana dön <ArrowRight size={14} />
                  </button>
                )}
              </div>
              <div className="hero-art">
                <div className="scene-top">
                  <span>
                    <span className="tiny-square" /> KÜÇÜK BİR KÖY, BÜYÜK SIRLAR
                  </span>
                  <span>LVL. 01</span>
                </div>
                <Village night={activeNight} />
                <div className="speech-bubble">
                  “Ben kesin köylüyüm.” <span>— muhtemelen vampir</span>
                </div>
                <span className="pixel-spark one">✦</span>
                <span className="pixel-spark two">+</span>
              </div>
            </div>
            <section className="how-strip" aria-label="Üç adımda oyun">
              <div>
                <span className="step-number">01</span>
                <p>
                  <strong>Masayı kur</strong>
                  <span>QR kodu veya linki paylaş.</span>
                </p>
              </div>
              <span className="step-dots">···</span>
              <div>
                <span className="step-number">02</span>
                <p>
                  <strong>Rolünü keşfet</strong>
                  <span>Bir küçük sır, sadece sana.</span>
                </p>
              </div>
              <span className="step-dots">···</span>
              <div>
                <span className="step-number">03</span>
                <p>
                  <strong>Köyü birbirine kat</strong>
                  <span>Konuş, şüphelen, oy ver!</span>
                </p>
              </div>
            </section>
            <section className="roles-section">
              <div className="section-top">
                <div>
                  <span className="eyebrow">HERKESİN BİR SIRRI VAR</span>
                  <h2>Bu köyde sen kimsin?</h2>
                </div>
                <span className="small muted">
                  Roller rastgele. Bahaneler sana kalmış.
                </span>
              </div>
              <div className="role-grid">
                {(Object.keys(roles) as Role[]).map((role) => (
                  <article className={`role-card ${role}`} key={role}>
                    <div className="role-card-top">
                      <Sprite role={role} />
                      <span className="role-kind">
                        {role === "villager" || role === "vampire"
                          ? "KLASİK ROL"
                          : "İSTEĞE BAĞLI"}
                      </span>
                    </div>
                    <h3>{roles[role].name}</h3>
                    <p>
                      {role === "villager"
                        ? "İçimizdeki vampiri bul. Sezgilerine güven."
                        : role === "vampire"
                          ? "Gece avlan. Gündüz masumu oyna."
                          : role === "doctor"
                            ? "Gece birini koru. Köyün umudu ol."
                            : "Şüpheleri üstüne çek. İdam edil, kazan."}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <section
              className="upcoming-section"
              aria-labelledby="upcoming-title"
            >
              <div className="section-top">
                <div>
                  <span className="eyebrow">KÖYE YENİ YÜZLER GELİYOR</span>
                  <h2 id="upcoming-title">Bavullar hazır. Sırlar da.</h2>
                </div>
                <span className="small muted">
                  Yeni roller henüz oynanamıyor.
                </span>
              </div>
              <div className="upcoming-grid">
                {upcomingRoles.map((role) => (
                  <button
                    type="button"
                    disabled
                    className={`upcoming-role ${role.id}`}
                    key={role.id}
                    aria-label={`${role.name} — Yakında, henüz oynanamıyor`}
                    aria-describedby={`upcoming-${role.id}-features`}
                  >
                    <span className="upcoming-portrait">
                      <span className="pixel-glimmer" aria-hidden="true">
                        ✦
                      </span>
                      <Sprite role={role.id} />
                    </span>
                    <span className="upcoming-role-name">{role.name}</span>
                    <span className="upcoming-flavor">{role.flavor}</span>
                    <span
                      className="upcoming-features"
                      id={`upcoming-${role.id}-features`}
                    >
                      <strong>Özellikler</strong>
                      <span>{role.features}</span>
                    </span>
                    <span className="upcoming-label">
                      <LockKeyhole size={12} /> YAKINDA
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <div className="coming-soon">
              <div className="coming-icon">
                <Sprite role="vampire" />
                <Sprite role="vampire" />
              </div>
              <div>
                <strong>İki vampir, iki kat kaos?</strong>
                <span>Köy bu kadarına henüz hazır değil.</span>
              </div>
              <button disabled className="button disabled">
                <LockKeyhole size={15} /> Çok vampirli mod{" "}
                <span className="soon-tag">YAKINDA</span>
              </button>
            </div>
          </main>
        ) : !game ? (
          <main className="loading-state">
            <LoaderCircle className="spin" size={32} />
            <h2>Masana dönüyoruz…</h2>
            {connectionError && (
              <>
                <p role="alert">{connectionError}</p>
                <button className="button secondary" onClick={home}>
                  Ana sayfaya dön
                </button>
              </>
            )}
          </main>
        ) : (
          <main className="game-main">
            <div className="game-top">
              <button className="text-button" onClick={home}>
                <ArrowLeft size={17} /> Ana sayfa
              </button>
              <span className="pill">
                MASA <strong>{game.code}</strong>
              </span>
              {game.round_number > 1 && <span className="pill">Rövanş · {game.round_number}. oyun</span>}
              {game.is_observer ? (
                <span className="observer-badge">
                  <Monitor size={15} /> {game.is_host ? "Paylaşım ekranı" : "İzleyici"}
                </span>
              ) : (
                <button
                  className="text-button"
                  onClick={() => open("role")}
                  disabled={game.phase === "lobby"}
                >
                  <Eye size={17} /> Rolüm
                </button>
              )}
            </div>
            {game.is_observer && (
              <div className="observer-notice">
                <Monitor size={18} />
                <span>
                  <strong>{game.is_host ? "Masayı yönetiyorsun." : "Bu turu izliyorsun."}</strong> Oyuncu değilsin; bu
                  ekran gizli rolleri ve gece hedeflerini göstermez. Ekranını
                  paylaşabilirsin.
                </span>
              </div>
            )}
            {connectionError && (
              <div className="error connection" role="status">
                <WifiOff size={18} />
                <span>{connectionError} Yeniden bağlanılıyor…</span>
              </div>
            )}
            <div className="game-heading">
              <span className="eyebrow">
                {game.phase === "lobby"
                  ? "ARKADAŞLARINI ÇAĞIR"
                  : game.phase === "finished"
                    ? "BİR TUR DAHA?"
                    : `${game.day}. GÜN · ${game.phase === "night" ? "İYİ GECELER" : "KÖY MEYDANI"}`}
              </span>
              <h1>{phaseText[game.phase]}</h1>
              {game.phase !== "lobby" && game.phase !== "finished" && (
                <Timer
                  ends={game.ends_at}
                  offset={offset}
                  waiting={game.phase === "night" || game.phase === "voting"}
                />
              )}
            </div>
            {game.announcement?.kind === "departure" && game.phase !== "finished" && <div className="departure-notice" role="status"><WifiOff size={18} /><span>{game.announcement.text}</span></div>}
            <VoicePanel game={game} voice={voice} />
            {["intro", "day", "runoff"].includes(game.phase) && (
              <EarlyAdvance
                game={game}
                busy={busy}
                onRequest={() => act("early")}
              />
            )}
            {game.phase === "lobby" ? (
              <>
                <LobbyStories key={game.code} />
                <div className="lobby-layout">
                  <section className="paper-card invite-card">
                    <div className="qr-frame">
                      {qr ? (
                        <img
                          src={qr}
                          alt={`Masaya katılma QR kodu, masa ${game.code}`}
                        />
                      ) : (
                        <LoaderCircle className="spin" />
                      )}
                    </div>
                    <h2>Bir kod, bütün arkadaşlar.</h2>
                    <p>
                      Kamerayı koda tut ya da linki gönder.
                      <br />
                      Birlikte oynayın, herkes kendi telefonunda.
                    </p>
                    <div className="room-code">
                      <span>{game.code}</span>
                      <button
                        className="icon-button"
                        aria-label="Masa kodunu kopyala"
                        onClick={() => copy(game.code)}
                      >
                        <Copy size={18} />
                      </button>
                    </div>
                    <button
                      className="button secondary"
                      onClick={() => copy(shareLink(game.code))}
                    >
                      <Link size={17} /> Davet linkini kopyala
                    </button>
                  </section>
                  <section className="paper-card lobby-players">
                    <div className="section-top">
                      <h2>Köy ahalisi</h2>
                      <span className="pill">
                        <Users size={15} />
                        {game.players.length}/24
                      </span>
                    </div>
                    <div className="player-list">
                      {game.players.length === 0 && (
                        <div className="empty-village">
                          <Users size={28} />
                          <p>
                            Henüz kimse gelmedi.
                            <br />
                            Davet linkini gönder, köy dolsun!
                          </p>
                        </div>
                      )}
                      {game.players.map((p) => (
                        <div className="lobby-player" key={p.id}>
                          <span className="number-badge">{p.number}</span>
                          <span className="player-name">
                            {p.name}
                            {p.id === game.me?.id && <small> (sen)</small>}
                          </span>
                          <VoiceBadge playerId={p.id} voice={voice} />
                          <span className="player-status">
                            <span className={`presence ${!p.online ? "away" : p.ready ? "" : "preparing"}`}>{!p.online ? "Bağlantı bekleniyor" : p.ready ? "Hazır" : "Hazırlanıyor"}</span>
                            <ConnectionStatus player={p} offset={offset} />
                          </span>
                          <KickButton game={game} player={p} busy={busy} onKick={(id) => act("kick", id)} />
                        </div>
                      ))}
                    </div>
                    <div className="lobby-settings">
                      {game.settings.pin_enabled && <span><LockKeyhole size={15} /> Şifreli masa</span>}
                      <span><WifiOff size={15} /> Bağlantı bekleme · {game.settings.disconnect_seconds || 60} sn</span>
                      {game.settings.turn_based && (
                        <span>
                          <MessagesSquare size={15} /> Sıra bazlı konuşma · 2
                          tur
                        </span>
                      )}
                      <span>
                        <Clock size={15} />
                        {game.settings.day_seconds} sn gündüz
                      </span>
                      <span>
                        <Moon size={15} />
                        {game.settings.night_seconds} sn gece
                      </span>
                      <span>
                        Doktor: {roleModeLabels[game.settings.doctor]}
                      </span>
                      <span>
                        Soytarı: {roleModeLabels[game.settings.jester]}
                      </span>
                    </div>
                    <LobbyReadiness game={game} busy={busy} onToggle={() => act("ready")} onStart={() => act("start")} />
                    <p className="small muted center">
                      {game.is_host && game.is_observer ? (
                        "Sen masa sahibisin. En az 4 oyuncu hazır olduğunda oyunu başlatabilirsin."
                      ) : game.is_observer ? (
                        "Şu anda masa dolu. Bir koltuk boşalınca hazırlığa katılabilirsin."
                      ) : (
                        <>
                          Sen #{game.me?.number} numaralı oyuncusun. Numaran
                          oyun boyunca değişmez.
                        </>
                      )}
                    </p>
                  </section>
                </div>
              </>
            ) : (
              <>
                {game.phase === "dealing" || game.phase === "countdown" ? (
                  game.is_observer ? (
                    <section className="paper-card reveal-stage public-reveal">
                      <EventScene kind="roles" />
                      <span className="eyebrow">
                        HERKESİN SIRRI KENDİ TELEFONUNDA
                      </span>
                      <h2>
                        {game.phase === "dealing"
                          ? "Roller oyunculara dağıtılıyor."
                          : "Köy birazdan uyanıyor!"}
                      </h2>
                      {game.phase === "countdown" ? (
                        <Countdown ends={game.ends_at} offset={offset} />
                      ) : (
                        <p>
                          Bu ekranda rol açılmaz. Oyuncular kendi ekranlarına
                          baksın; birazdan hep birlikte başlayacaksınız.
                        </p>
                      )}
                    </section>
                  ) : (
                    <section className="paper-card reveal-stage">
                      <div className="deal-cards">
                        <span />
                        <span />
                        <span>
                          <Sprite role={currentRole} />
                        </span>
                      </div>
                      <span className="eyebrow">
                        #{game.me?.number} · {game.me?.name}
                      </span>
                      <h2>
                        {game.phase === "dealing"
                          ? "Senin sırrın:"
                          : "Birazdan başlıyoruz"}
                      </h2>
                      {game.phase === "dealing" ? (
                        <>
                          <h3 className="revealed-role">
                            {roles[currentRole].name}
                          </h3>
                          <p>{roles[currentRole].description}</p>
                          <p className="small muted">
                            {roles[currentRole].win}
                          </p>
                        </>
                      ) : (
                        <Countdown ends={game.ends_at} offset={offset} />
                      )}
                      <span className="small muted">
                        <EyeOff size={14} /> Ekranını diğer oyunculardan gizle.
                      </span>
                    </section>
                  )
                ) : game.phase === "finished" ? (
                  <section className="paper-card final-stage">
                    <span className="eyebrow">
                      {game.is_observer
                        ? "KÖYÜN HİKÂYESİ TAMAMLANDI"
                        : didWin
                          ? "KAZANDIN!"
                          : "BU TUR OLMADI…"}
                    </span>
                    <EventScene
                      kind={
                        game.winner === "village"
                          ? "village_win"
                          : game.winner === "jester"
                            ? "jester_win"
                            : "vampire_win"
                      }
                    />
                    <h2>
                      {game.winner === "village"
                        ? "Köy huzura kavuştu!"
                        : game.winner === "jester"
                          ? "Soytarı hepinizi kandırdı!"
                          : "Bu gece köy vampirin!"}
                    </h2>
                    <p>
                      {game.winner === "village"
                        ? "Vampir oyun dışı kaldı. Köylüler ve doktor kazandı."
                        : game.winner === "jester"
                          ? "Soytarı idam edildi ve tek başına kazandı."
                          : "Vampir hayatta ve köyü ele geçirecek kadar az oyuncu kaldı."}
                    </p>
                    <div className="final-roles">
                      {game.players.map((p) => (
                        <div key={p.id}>
                          <Sprite role={p.role || "villager"} />
                          <strong>
                            #{p.number} {p.name}
                          </strong>
                          <span>{roles[p.role || "villager"].name}</span>
                        </div>
                      ))}
                    </div>
                    <RematchControls game={game} busy={busy} onRematch={() => act("rematch")} onNewTable={() => {
                        home();
                        setCfg({ ...defaults, theme });
                        open("create");
                      }} />
                  </section>
                ) : (
                  <div className="play-layout">
                    <section className="paper-card play-stage">
                      {game.phase === "night_result" ||
                      game.phase === "execution" ? (
                        <div className="announcement" aria-live="polite">
                          <EventScene
                            kind={
                              game.announcement?.kind === "departure" ? "discussion" : game.announcement?.kind === "saved"
                                ? "saved"
                                : game.phase === "execution"
                                  ? "execution"
                                  : "night_death"
                            }
                          />
                          <h2>{game.announcement?.text}</h2>
                          <p>
                            {!!game.me &&
                            !game.me.alive &&
                            game.me?.eliminated_by === "vampire"
                              ? "Vampir tarafından öldürüldün. Artık oyunu izleyebilirsin."
                              : !!game.me &&
                                  !game.me.alive &&
                                  game.me?.eliminated_by === "village"
                                ? "Köyün kararıyla idam edildin. Artık oyunu izleyebilirsin."
                                : "Birazdan köy yeniden hareketlenecek."}
                          </p>
                        </div>
                      ) : game.phase === "night" ? (
                        <>
                          <div className="night-heading">
                            <Moon size={27} />
                            <h2>
                              {game.my_turn && !game.has_chosen
                                ? currentRole === "doctor"
                                  ? "Bu gece kimi koruyacaksın?"
                                  : "Bu gece hedefin kim?"
                                : "Şşşt… herkes uyuyor."}
                            </h2>
                          </div>
                          <p className="stage-description">
                            {game.my_turn
                              ? game.has_chosen
                                ? "Seçimin kaydedildi. Gece tamamlanınca sonuç açıklanacak."
                                : currentRole === "doctor"
                                  ? `Vampirin hedefini bilmiyorsun. ${game.me?.self_heal_used ? "Kendini koruma hakkını kullandın." : "Kendini bir kez koruyabilirsin."}`
                                  : "Hayatta olan başka bir oyuncuyu seç. Kimliğin gizli kalacak."
                              : "Gece devam ediyor. Seçimler tamamlandığında güneş doğacak."}
                          </p>
                          <EventScene kind="night" small />
                          {Date.now() + offset > Date.parse(game.ends_at) && (
                            <div className="waiting-box">
                              <Clock size={17} /> Henüz tüm seçimler yapılmadı.
                              Gece devam ediyor.
                            </div>
                          )}
                        </>
                      ) : game.phase === "voting" ? (
                        <>
                          <EventScene kind="voting" small />
                          <span className="eyebrow">SÖZ SIRASI OYLARDA</span>
                          <h2>
                            {game.is_observer
                              ? "Oyuncular kararlarını veriyor."
                              : "Vampir olduğundan şüphelendiğin kişiyi seç."}
                          </h2>
                          <p className="stage-description">
                            {game.is_observer
                              ? `İdam için en az ${needed} oy gerekli. Bu ekranda yalnızca oylamanın ilerleyişi gösterilir.`
                              : game.my_vote
                                ? "Oyun kaydedildi ve değiştirilemez. Artık güncel oyları görebilirsin."
                                : `İdam için en az ${needed} oy gerekli. Oy verdikten sonra sayıları görebilirsin.`}
                          </p>
                          <div className="vote-progress">
                            <span>
                              {game.votes_cast}/{alive.length} kişi oy verdi
                            </span>
                            <span>Gereken: {needed}</span>
                          </div>
                          <div className="progress-track">
                            <span
                              style={{
                                width: `${(game.votes_cast / alive.length) * 100}%`,
                              }}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          {game.speech ? (
                            <SpeechPanel
                              game={game}
                              offset={offset}
                              busy={busy}
                              onFinish={() => act("speak")}
                            />
                          ) : (
                            <EventScene kind="discussion" small />
                          )}
                          <h2>
                            {game.phase === "intro"
                              ? "Herkesi tanı. Bahaneleri not et."
                              : game.phase === "runoff"
                                ? "Biraz daha konuşmaya ne dersiniz?"
                                : "Söz sizde, köy ahalisi."}
                          </h2>
                          <p className="stage-description">
                            {game.phase === "intro"
                              ? "İlk konuşma bittiğinde gece başlayacak. Şimdilik kimse idam edilmiyor."
                              : game.phase === "runoff"
                                ? game.announcement?.text
                                : "İpuçlarını birleştirin. Süre bitince oylama açılacak; çoğunluk isterse hemen başlayabilirsiniz."}
                          </p>
                        </>
                      )}
                      {canChoose && (
                        <div className="target-area">
                          <div className="target-grid">
                            {alive.map((p) => (
                              <button
                                key={p.id}
                                className={`target ${selected === p.id ? "selected" : ""}`}
                                disabled={!allowed(p) || busy}
                                onClick={() => setSelected(p.id)}
                              >
                                <span className="number-badge">{p.number}</span>
                                <strong>{p.name}</strong>
                                {p.id === game.me?.id && <small>Sen</small>}
                                {selected === p.id && <Check size={16} />}
                              </button>
                            ))}
                          </div>
                          <button
                            className="button primary full"
                            disabled={!selected || busy}
                            onClick={() =>
                              act(
                                game.phase === "voting"
                                  ? "vote"
                                  : currentRole === "doctor"
                                    ? "protect"
                                    : "kill",
                                selected,
                              )
                            }
                          >
                            {busy ? (
                              <LoaderCircle size={18} className="spin" />
                            ) : (
                              <Check size={18} />
                            )}{" "}
                            {game.phase === "voting"
                              ? "Oyumu kesinleştir"
                              : currentRole === "doctor"
                                ? "Korumayı kesinleştir"
                                : "Hedefi kesinleştir"}
                          </button>
                          <p className="small muted center">
                            Onayladıktan sonra seçimini değiştiremezsin.
                          </p>
                        </div>
                      )}
                      {game.phase === "voting" && game.my_vote && (
                        <div className="results-list">
                          {alive.map((p) => (
                            <div className="result-row" key={p.id}>
                              <span className="number-badge">{p.number}</span>
                              <strong>{p.name}</strong>
                              <span className="result-bar">
                                <span
                                  style={{
                                    width: `${((game.tally?.[p.id] || 0) / alive.length) * 100}%`,
                                  }}
                                />
                              </span>
                              <b>{game.tally?.[p.id] || 0} oy</b>
                              {p.id === game.my_vote && <Check size={16} />}
                            </div>
                          ))}
                        </div>
                      )}
                      {!!game.me && !game.me.alive && (
                        <div className="spectator">
                          <Eye size={18} />
                          <span>
                            {eliminationText(game.me?.eliminated_by)}{" "}
                            İzleyici olarak köyü takip edebilirsin; rolünü gizli
                            tut.
                          </span>
                        </div>
                      )}
                    </section>
                    <aside className="paper-card village-sidebar">
                      <div className="section-top">
                        <h2>Köy ahalisi</h2>
                        <span className="small muted">
                          {alive.length} hayatta
                        </span>
                      </div>
                      {game.players.map((p) => (
                        <div
                          className={`sidebar-player ${p.alive ? "" : "eliminated"}`}
                          key={p.id}
                        >
                          <span className="number-badge">{p.number}</span>
                          <span>
                            {p.name}
                            {p.id === game.me?.id && <small> (sen)</small>}
                          </span>
                          <VoiceBadge playerId={p.id} voice={voice} />
                          <span className="player-status">
                            {p.alive ? <><span className={`presence-dot ${p.online ? "" : "away"}`} title={p.online ? "Bağlı" : "Bağlantı bekleniyor"} /><ConnectionStatus player={p} offset={offset} /></> : <span className="small">{p.eliminated_by === "disconnected" ? "Bağlantı · elendi" : p.eliminated_by === "kicked" ? "Çıkarıldı" : "Elendi"}</span>}
                          </span>
                          <KickButton game={game} player={p} busy={busy} onKick={(id) => act("kick", id)} />
                        </div>
                      ))}
                      {game.me ? (
                        <div className="my-identity">
                          <Shield size={18} />
                          <span>
                            Sen:{" "}
                            <strong>
                              #{game.me.number} {game.me.name}
                            </strong>
                          </span>
                          <button
                            className="icon-button"
                            onClick={() => open("role")}
                            aria-label="Gizli rolümü göster"
                          >
                            <Eye size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="my-identity observer-identity">
                          <Monitor size={18} />
                          <span>
                            {game.is_host ? "Masayı yönetiyorsun." : "Bu turu izliyorsun."}
                            <br />
                            Gizli rolün veya oyun numaran yok.
                          </span>
                        </div>
                      )}
                    </aside>
                  </div>
                )}
                {game.events.length > 0 && (
                  <details className="event-log">
                    <summary>
                      Köy günlüğü <ChevronDown size={16} />
                    </summary>
                    {game.events.map((e, i) => (
                      <p key={i}>
                        <span>{e.day}. gün</span>
                        {e.text}
                      </p>
                    ))}
                  </details>
                )}
              </>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
                <button
                  className="icon-button"
                  onClick={() => setError("")}
                  aria-label="Uyarıyı kapat"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </main>
        )}
        <footer className="site-footer">
          <span>
            <span className="tiny-square" /> Küçük pikseller. Büyük şüpheler.
          </span>
          <span>
            Birlikte oynayın. Birbirinize pek güvenmeyin. <Heart size={13} />
          </span>
        </footer>
      </div>

      {panel === "create" && (
        <Modal
          title="Kendi köyünü kur"
          onClose={() => !busy && setPanel(null)}
          wide
        >
          <form onSubmit={(e) => submit(e, true)}>
            <p className="modal-subtitle">
              Arkadaşları çağır. Gerisini köy halleder.
            </p>
            <fieldset className="host-mode">
              <legend>Masada nasıl yer alacaksın?</legend>
              <div
                className="host-mode-options"
                role="radiogroup"
                aria-label="Kurucunun katılımı"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={cfg.host_plays}
                  className={cfg.host_plays ? "active" : ""}
                  onClick={() => setCfg({ ...cfg, host_plays: true })}
                >
                  <Users size={21} />
                  <strong>Ben de oynayacağım</strong>
                  <span>Bir numara ve gizli rol al.</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!cfg.host_plays}
                  className={!cfg.host_plays ? "active" : ""}
                  onClick={() => setCfg({ ...cfg, host_plays: false })}
                >
                  <Monitor size={21} />
                  <strong>Yalnızca masayı yönet</strong>
                  <span>Rol alma. Ekranını güvenle paylaş.</span>
                </button>
              </div>
            </fieldset>
            {cfg.host_plays && (
              <label className="field">
                Sana ne diyelim?
                <input
                  autoFocus
                  required
                  maxLength={20}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Köydeki adın"
                  autoComplete="nickname"
                />
              </label>
            )}
            {!cfg.host_plays && (
              <p className="share-hint">
                <Monitor size={15} /> İsim girmen gerekmez. Oyuncu sayısına
                katılmazsın; yalnızca oyunu başlatır ve akışı izlersin.
              </p>
            )}
            <div className="form-section">
              <div className="section-top">
                <h3>Biraz daha renk katalım</h3>
                <span className="small muted">İsteğe bağlı roller</span>
              </div>
              {(["doctor", "jester"] as const).map((role) => (
                <RoleOptions
                  key={role}
                  role={role}
                  value={cfg[role]}
                  onChange={(mode) => setCfg({ ...cfg, [role]: mode })}
                />
              ))}
              <p className="small muted">
                Şansa bırakılan roller birbirinden bağımsız çekilir. Doktor
                gelmese de gece aynı iki aşamayı bekler; çekiliş sonucu
                sürelerden anlaşılmaz.
              </p>
            </div>
            <div className="form-section room-security">
              <h3>Masaya kimler gelsin?</h3>
              <label className="role-toggle">
                <span className="feature-symbol"><LockKeyhole size={22} /></span>
                <span><strong>Şifreli masa</strong><small>Davet koduna ek olarak 4 haneli şifre sorulsun.</small></span>
                <input type="checkbox" aria-label="Şifreli masa" checked={cfg.pin_enabled} onChange={(e) => { setCfg({ ...cfg, pin_enabled: e.target.checked }); setRoomPin(""); }} /><span className="switch" />
              </label>
              {cfg.pin_enabled && <label className="field pin-field">Masa şifresi<input type="password" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{4}" minLength={4} maxLength={4} placeholder="4 rakam" value={roomPin} onChange={(e) => setRoomPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} /><small>Şifreyi arkadaşlarına ayrıca ilet. Link ve QR kod şifreyi içermez.</small></label>}
            </div>
            <div className="form-section">
              <h3>Herkesin sesi duyulsun</h3>
              <label className="role-toggle speaking-toggle">
                <span className="feature-symbol">
                  <MessagesSquare size={22} />
                </span>
                <span>
                  <strong>Sıra bazlı konuşma</strong>
                  <small>
                    Rastgele sıra, iki tur, ardından serbest sohbet.
                  </small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Sıra bazlı konuşma"
                  checked={cfg.turn_based}
                  onChange={(e) =>
                    setCfg({
                      ...cfg,
                      turn_based: e.target.checked,
                      voice_enabled: e.target.checked && cfg.voice_enabled,
                    })
                  }
                />
                <span className="switch" />
              </label>
              {cfg.turn_based && (
                <p className="small muted">
                  Gündüzün yaklaşık üçte ikisi iki konuşma turuna ayrılır.
                  Konuşmacı erken bitirebilir; süre dolunca sıra otomatik geçer.
                  Kalan süre serbest sohbettir. Kalabalık masalarda gündüzü
                  uzatabilirsin.
                </p>
              )}
              <label
                className={`role-toggle voice-toggle ${cfg.turn_based ? "" : "disabled"}`}
              >
                <span className="feature-symbol">
                  <Headphones size={22} />
                </span>
                <span>
                  <strong>Masada sesli sohbet</strong>
                  <small>
                    {cfg.turn_based
                      ? "Sıra gelince veya toplu konuşmada mikrofon açılabilir."
                      : "Önce sıra bazlı konuşmayı aç."}
                  </small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Masada sesli sohbet"
                  checked={cfg.voice_enabled}
                  disabled={!cfg.turn_based}
                  onChange={(e) =>
                    setCfg({ ...cfg, voice_enabled: e.target.checked })
                  }
                />
                <span className="switch" />
              </label>
              {cfg.voice_enabled && (
                <p className="voice-setup-note">
                  Sesli sohbet isteğe bağlıdır; herkes kendi isteğiyle katılır
                  ve mikrofonu kapalı başlar. İnternet, pil ve işlemci kullanımı
                  artar; kalabalık masalarda gecikme olabilir. Kulaklık
                  önerilir. Bazı kısıtlı ağlarda ses bağlantısı kurulamayabilir.
                </p>
              )}
            </div>
            <details className="settings-details" open>
              <summary>
                <Clock size={17} /> Masanın ritmi{" "}
                <span>
                  Süreleri özelleştir <ChevronDown size={16} />
                </span>
              </summary>
              <div className="duration-grid">
                {(
                  [
                    {
                      key: "day_seconds",
                      label: "Gündüz / ilk konuşma",
                      min: 30,
                      max: 1800,
                    },
                    {
                      key: "night_seconds",
                      label: "Her gece hamlesi",
                      min: 15,
                      max: 120,
                    },
                    {
                      key: "vote_seconds",
                      label: "Oylama alt sınırı",
                      min: 20,
                      max: 120,
                    },
                    {
                      key: "runoff_seconds",
                      label: "Kararsızlıkta ek tartışma",
                      min: 15,
                      max: 300,
                    },
                    { key: "disconnect_seconds", label: "Bağlantı kopunca bekleme", min: 30, max: 600 },
                  ] as const
                ).map((x) => (
                  <label className="field" key={x.key}>
                    {x.label}
                    <div className="input-suffix">
                      <input
                        required
                        type="number"
                        min={x.min}
                        max={x.max}
                        step={1}
                        value={cfg[x.key]}
                        onChange={(e) =>
                          setCfg({
                            ...cfg,
                            [x.key]:
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value),
                          })
                        }
                      />
                      <span>sn</span>
                    </div>
                    <small>
                      {x.min}–{x.max} saniye
                    </small>
                  </label>
                ))}
              </div>
              <p className="small muted">
                Gece ve oylama, süre dolsa da tüm gerekli seçimler tamamlanana
                kadar bekler. Bağlantısı kopan oyuncu, bekleme süresi dolarsa o turdan elenir.
              </p>
            </details>
            <div className="form-section">
              <h3>Köyün renkleri</h3>
              <div className="theme-options compact-themes">
                {themes.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={`theme-option ${cfg.theme === t.id ? "active" : ""}`}
                    onClick={() => setCfg({ ...cfg, theme: t.id })}
                  >
                    <span className="swatches">
                      {t.colors.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    <span>{t.name}</span>
                    {cfg.theme === t.id && <Check size={15} />}
                  </button>
                ))}
              </div>
              <p className="small muted">
                Köy Klasiği önerilir. Her pakette gündüz ve gece renkleri
                yumuşakça değişir.
              </p>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              disabled={
                busy ||
                quota?.remaining === 0 ||
                (cfg.host_plays && !name.trim())
              }
              className="button primary full"
              type="submit"
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Plus size={19} />
              )}{" "}
              Masayı oluştur <ArrowRight size={18} />
            </button>
            <p className="small muted center">
              {quota?.remaining === 0
                ? "Masa kurma hakkın doldu. Yeni hak gelene kadar başka bir masaya katılabilirsin."
                : quota
                  ? `${quota.remaining}/${quota.limit} masa kurma hakkın kaldı.`
                  : ""}
            </p>
            <p className="small muted center">
              {cfg.host_plays
                ? "Moderatör yok. Sen de köyün bir oyuncususun."
                : "Ortak ekran hazır. Gizli roller sadece oyuncuların telefonlarında."}
            </p>
          </form>
        </Modal>
      )}
      {panel === "join" && (
        <Modal
          title="Köy seni bekliyor"
          onClose={() => !busy && setPanel(null)}
        >
          <form onSubmit={(e) => submit(e, false)}>
            <p className="modal-subtitle">
              Arkadaşlarından aldığın masa kodunu yaz.
            </p>
            <label className="field">
              Masa kodu
              <input
                autoFocus={!roomInput}
                required
                pattern="[a-fA-F0-9]{6}"
                maxLength={6}
                placeholder="Örn. A3F921"
                className="code-input"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            <label className="field">
              Sana ne diyelim?
              <input
                autoFocus={!!roomInput}
                required
                maxLength={20}
                placeholder="Köydeki adın"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            </label>
            <label className="field pin-field">Masa şifresi (varsa)<input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} placeholder="Şifresiz masa için boş bırak" value={roomPin} onChange={(e) => setRoomPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} /></label>
            {error && <p className="error" role="alert">{error}</p>}
            <button
              className="button primary full"
              disabled={busy || !name.trim() || roomInput.length !== 6}
              type="submit"
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <ArrowRight size={19} />
              )}{" "}
              Masaya katıl
            </button>
            <p className="small muted center">
              Numaran katılınca otomatik verilecek. Rolünse küçük bir sır.
            </p>
          </form>
        </Modal>
      )}
      {panel === "rules" && (
        <Modal title="Köyün küçük kural kitabı" onClose={() => setPanel(null)}>
          <Rules />
        </Modal>
      )}
      {panel === "theme" && (
        <Modal title="Biraz renk değiştirelim" onClose={() => setPanel(null)}>
          <p className="modal-subtitle">
            {game
              ? "Masada herkes aynı renk paketini kullanır. Bir sonraki masanda farklı bir paket seçebilirsin."
              : "Gündüz sıcacık, gece biraz gizemli. Senin köyün hangisi?"}
          </p>
          <div className="theme-options">
            {themes.map((t) => (
              <button
                key={t.id}
                className={`theme-option ${actualTheme === t.id ? "active" : ""}`}
                disabled={!!game}
                onClick={() => {
                  setTheme(t.id);
                  localStorage.setItem("vk-theme", t.id);
                }}
              >
                <span className="swatches">
                  {t.colors.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                <span>
                  {t.name}
                  {t.id === "classic" && <small>Önerilen</small>}
                </span>
                {actualTheme === t.id && <Check size={18} />}
              </button>
            ))}
          </div>
          {!game && (
            <button
              className="button secondary full"
              onClick={() => setNightPreview(!nightPreview)}
            >
              {nightPreview ? <Sun size={18} /> : <Moon size={18} />}{" "}
              {nightPreview ? "Gündüzü göster" : "Geceyi göster"}
            </button>
          )}
        </Modal>
      )}
      {panel === "role" && game?.me && (
        <Modal
          title={`Sadece sana, #${game.me?.number}`}
          onClose={() => setPanel(null)}
        >
          <RoleInfo role={currentRole} />
          <button
            className="button secondary full"
            onClick={() => setPanel(null)}
          >
            <EyeOff size={17} /> Rolümü gizle
          </button>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
    </>
  );
}
function Countdown({ ends, offset }: { ends: string; offset: number }) {
  const [n, setN] = useState(5);
  useEffect(() => {
    const update = () =>
      setN(
        Math.max(1, Math.ceil((Date.parse(ends) - Date.now() - offset) / 1000)),
      );
    update();
    const t = setInterval(update, 100);
    return () => clearInterval(t);
  }, [ends, offset]);
  return (
    <div className="countdown-number" key={n}>
      {n}
    </div>
  );
}
