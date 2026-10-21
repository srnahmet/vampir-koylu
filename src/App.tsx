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
  rpc,
  session,
  themes,
  type Game,
  type Player,
  type Role,
  type Settings,
  type Theme,
} from "./game";
import { Sprite, Village } from "./art";
import { EventScene } from "./EventScene";
import { SpeechPanel } from "./SpeechPanel";
import { EarlyAdvance } from "./EarlyAdvance";

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
        edilirse köy, şarlatan idam edilirse yalnızca şarlatan kazanır.
        Ölenlerin rolleri oyun sonunda açılır.
      </div>
      <p className="small muted">
        Bağlantın koparsa aynı tarayıcıdan dön. Numaran ve rolün korunur. Seçim
        yapmayan biri varsa oyun onu bekler; otomatik eleme yoktur.
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
  const [cfg, setCfg] = useState<Settings>({ ...defaults });
  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem("vk-theme") as Theme) || "classic",
  );
  const [nightPreview, setNightPreview] = useState(false);
  const [sound, setSound] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [offset, setOffset] = useState(0);
  const audio = useRef<AudioContext | null>(null);
  const lastPhase = useRef("");
  const activeNight = game ? game.phase === "night" : nightPreview;
  const actualTheme = game?.settings.theme || theme;
  useEffect(() => {
    document.documentElement.dataset.theme = actualTheme;
    document.documentElement.dataset.time = activeNight ? "night" : "day";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", activeNight ? "#28273c" : "#f7f1e3");
  }, [actualTheme, activeNight]);
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
        if (!stopped) setConnectionError(friendlyError(e));
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
  }, [code, refresh]);
  useEffect(() => {
    setSelected(null);
    if (game && lastPhase.current !== `${game.phase}-${game.seq}`) {
      lastPhase.current = `${game.phase}-${game.seq}`;
      if (sound && audio.current) {
        const a = audio.current;
        const osc = a.createOscillator();
        const gain = a.createGain();
        osc.connect(gain);
        gain.connect(a.destination);
        osc.frequency.value = game.phase === "night" ? 330 : 660;
        gain.gain.setValueAtTime(0.045, a.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.35);
        osc.start();
        osc.stop(a.currentTime + 0.35);
      }
    }
  }, [game?.seq, sound]);
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
    localStorage.setItem("vk-room", c);
    localStorage.setItem("vk-name", name.trim());
    setGame(null);
    setConnectionError("");
    setCode(c);
    setPanel(null);
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
      const c = create
        ? await rpc<string>("vk_create", {
            p_name: cfg.host_plays ? name : "",
            p_settings: cfg,
          })
        : await rpc<string>("vk_join", { p_name: name, p_code: roomInput });
      enter(c);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string, target: string | null = null) {
    if (!game || busy) return;
    setBusy(true);
    setError("");
    try {
      if (action === "start") await rpc("vk_start", { p_code: code });
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
      setError(friendlyError(e));
      await refresh().catch(() => {});
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
    setCode("");
    setGame(null);
    setPanel(null);
    setError("");
    setConnectionError("");
    history.replaceState(null, "", location.pathname);
  }
  function open(p: Panel) {
    setError("");
    setPanel(p);
  }
  function toggleSound() {
    if (!sound) {
      audio.current ||= new AudioContext();
      void audio.current.resume();
    }
    setSound(!sound);
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
              className="icon-button"
              onClick={toggleSound}
              aria-label={sound ? "Sesi kapat" : "Sesi aç"}
            >
              {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
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
              {game.is_observer ? (
                <span className="observer-badge">
                  <Monitor size={15} /> Paylaşım ekranı
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
                  <strong>Masayı yönetiyorsun.</strong> Oyuncu değilsin; bu
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
            {["intro", "day", "runoff"].includes(game.phase) && (
              <EarlyAdvance
                game={game}
                busy={busy}
                onRequest={() => act("early")}
              />
            )}
            {game.phase === "lobby" ? (
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
                        <span className={`presence ${p.online ? "" : "away"}`}>
                          {p.online ? "Hazır" : "Bağlantı bekleniyor"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="lobby-settings">
                    {game.settings.turn_based && (
                      <span>
                        <MessagesSquare size={15} /> Sıra bazlı konuşma · 2 tur
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
                      {game.settings.doctor ? "Doktor var" : "Doktor yok"}
                    </span>
                    <span>
                      {game.settings.jester ? "Şarlatan var" : "Şarlatan yok"}
                    </span>
                  </div>
                  {game.is_host ? (
                    <button
                      className="button primary full"
                      disabled={game.players.length < 4 || busy}
                      onClick={() => act("start")}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={20} />
                      ) : (
                        <Play size={20} />
                      )}{" "}
                      {game.players.length < 4
                        ? `${4 - game.players.length} arkadaş daha bekleniyor`
                        : "Oyunu başlat"}
                    </button>
                  ) : (
                    <div className="waiting-box">
                      <LoaderCircle size={17} className="spin" /> Masayı kuran
                      oyuncunun başlatması bekleniyor.
                    </div>
                  )}
                  <p className="small muted center">
                    {game.is_observer ? (
                      "Sen masa sahibisin. En az 4 oyuncu katılınca oyunu başlatabilirsin."
                    ) : (
                      <>
                        Sen #{game.me?.number} numaralı oyuncusun. Numaran oyun
                        boyunca değişmez.
                      </>
                    )}
                  </p>
                </section>
              </div>
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
                          ? "Şarlatan hepinizi kandırdı!"
                          : "Bu gece köy vampirin!"}
                    </h2>
                    <p>
                      {game.winner === "village"
                        ? "Vampir idam edildi. Köylüler ve doktor kazandı."
                        : game.winner === "jester"
                          ? "Şarlatan idam edildi ve tek başına kazandı."
                          : "Vampir hayattayken 3 veya daha az oyuncuyla geceye girildi."}
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
                    <button
                      className="button primary"
                      onClick={() => {
                        home();
                        setCfg({ ...defaults, theme });
                        open("create");
                      }}
                    >
                      <Plus size={18} /> Yeni bir masa kur
                    </button>
                  </section>
                ) : (
                  <div className="play-layout">
                    <section className="paper-card play-stage">
                      {game.phase === "night_result" ||
                      game.phase === "execution" ? (
                        <div className="announcement" aria-live="polite">
                          <EventScene
                            kind={
                              game.announcement?.kind === "saved"
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
                            {game.me?.eliminated_by === "vampire"
                              ? "Vampir tarafından öldürüldün."
                              : "Köyün kararıyla idam edildin."}{" "}
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
                          {p.alive ? (
                            <span
                              className={`presence-dot ${p.online ? "" : "away"}`}
                              title={p.online ? "Bağlı" : "Bağlantı bekleniyor"}
                            />
                          ) : (
                            <span className="small">Elendi</span>
                          )}
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
                            Masayı yönetiyorsun.
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
                <label className="role-toggle" key={role}>
                  <Sprite role={role} />
                  <span>
                    <strong>{roles[role].name}</strong>
                    <small>
                      {role === "doctor"
                        ? "Her gece bir kişiyi korur."
                        : "İdam edilirse tek başına kazanır."}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    aria-label={`${roles[role].name} rolünü ekle`}
                    checked={cfg[role]}
                    onChange={(e) =>
                      setCfg({ ...cfg, [role]: e.target.checked })
                    }
                  />
                  <span className="switch" />
                </label>
              ))}
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
                    setCfg({ ...cfg, turn_based: e.target.checked })
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
                kadar bekler.
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
              disabled={busy || (cfg.host_plays && !name.trim())}
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
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
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
