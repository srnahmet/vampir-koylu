import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { BookOpen, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Sprite } from "./art";
import {
  storyFrame,
  storyInterval,
  storyOrder,
  villageStories,
  type VillageStory,
} from "./stories";
import "./lobby-stories.css";

function StoryArtwork({ story }: { story: VillageStory }) {
  return (
    <div
      className={`story-art ${story.night ? "story-art-night" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 180 120" shapeRendering="crispEdges">
        <path d="M0 88H180V120H0Z" fill="currentColor" opacity=".13" />
        <path
          d="M8 58H39V91H8M4 58L23 42L43 58Z"
          fill="currentColor"
          opacity=".2"
        />
        <path d="M15 65H22V73H15M28 65H35V73H28" fill="#edcf8a" />
        <path
          d="M151 43H155V90H151M139 68L153 49L167 68Z"
          fill="currentColor"
          opacity=".25"
        />
        {story.night ? (
          <>
            <path
              d="M128 13H140V17H136V29H140V33H128V29H124V17H128Z"
              fill="#f5d99b"
            />
            <path
              d="M36 20H39V23H36M91 11H94V14H91M159 34H162V37H159"
              fill="#f5e7c3"
            />
          </>
        ) : (
          <>
            <path d="M123 15H139V31H123Z" fill="#e8bf77" />
            <path
              d="M56 30H72V26H84V30H93V35H56Z"
              fill="#fff8e6"
              opacity=".7"
            />
          </>
        )}
        <path d="M77 109H103V113H77M82 105H98V109H82" fill="#8e7161" />
        <path d="M85 104V97H89V92H93V98H97V105Z" fill="#dca270" />
        <path d="M89 104V99H93V104Z" fill="#f1cc82" />
      </svg>
      <div className={`story-cast ${story.cast.length === 1 ? "solo" : ""}`}>
        {story.cast.map((role) => (
          <Sprite role={role} key={role} />
        ))}
      </div>
      <span className="story-spark">✦</span>
    </div>
  );
}

function StoryProgress({
  elapsed,
  paused,
}: {
  elapsed: number;
  paused: boolean;
}) {
  const initialElapsed = useRef(elapsed).current;
  return (
    <div className="story-progress" aria-hidden="true">
      <span
        style={
          {
            animationDelay: `-${initialElapsed}ms`,
            animationPlayState: paused ? "paused" : "running",
          } as CSSProperties
        }
      />
    </div>
  );
}

export function LobbyStories({
  code,
  startedAt,
  offset = 0,
}: {
  code: string;
  startedAt: string;
  offset?: number;
}) {
  const fallbackStart = useRef(Date.now());
  const parsedStart = Date.parse(startedAt);
  const start = Number.isFinite(parsedStart)
    ? parsedStart
    : fallbackStart.current;
  const order = useMemo(() => storyOrder(code), [code]);
  const [frame, setFrame] = useState(() =>
    storyFrame(start, Date.now() + offset),
  );
  const [frozen, setFrozen] = useState<{
    turn: number;
    elapsed: number;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const paused = frozen !== null;

  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const next = storyFrame(start, Date.now() + offset);
      setFrame((previous) => (previous.turn === next.turn ? previous : next));
      timer = setTimeout(tick, storyInterval - next.elapsed + 10);
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [start, offset, paused]);

  const turn = frozen?.turn ?? frame.turn;
  const index = ((turn % order.length) + order.length) % order.length;
  const story = villageStories[order[index]];
  function step(direction: number) {
    const next = turn + direction;
    setFrozen({ turn: next, elapsed: 0 });
    const position = ((next % order.length) + order.length) % order.length;
    setAnnouncement(
      `${position + 1}. hikâye. ${villageStories[order[position]].title}. Akış duraklatıldı.`,
    );
  }
  function togglePause() {
    const current = storyFrame(start, Date.now() + offset);
    setFrame(current);
    setFrozen(paused ? null : { turn, elapsed: current.elapsed });
    setAnnouncement(
      paused
        ? "Hikâyeler yeniden 15 saniyede bir değişecek."
        : "Hikâye duraklatıldı.",
    );
  }
  const kind =
    story.kind === "tip"
      ? "Oyun ipucu"
      : story.kind === "upcoming"
        ? "Yakında · Yeni roller"
        : "Köyden bir hikâye";
  return (
    <section
      className="lobby-stories paper-card"
      aria-label="Ateş başı hikâyeleri"
      aria-roledescription="slayt gösterisi"
    >
      <div className="story-heading">
        <span>
          <BookOpen size={16} /> Ateş başı hikâyeleri
        </span>
        <span className="story-count">
          {String(index + 1).padStart(2, "0")}{" "}
          <span>/ {villageStories.length}</span>
        </span>
      </div>
      <article
        className="story-slide"
        key={story.id}
        aria-label={`${index + 1}. hikâye`}
      >
        <StoryArtwork story={story} />
        <div className="story-copy">
          <span className={`story-kind ${story.kind}`}>{kind}</span>
          <h2>{story.title}</h2>
          <p>{story.text}</p>
        </div>
      </article>
      <div className="story-footer">
        <span className="story-cadence">
          {paused
            ? "Okumak için küçük bir mola"
            : "Bunları biliyor muydun? · Her 15 saniyede yeni bir sır"}
        </span>
        <div className="story-controls">
          <button
            className="icon-button"
            aria-label="Önceki hikâye"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="story-pause text-button"
            aria-label={
              paused ? "Hikâyeleri devam ettir" : "Hikâyeleri duraklat"
            }
            aria-pressed={paused}
            onClick={togglePause}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            <span>{paused ? "Devam et" : "Duraklat"}</span>
          </button>
          <button
            className="icon-button"
            aria-label="Sonraki hikâye"
            onClick={() => step(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <StoryProgress
        key={`${turn}:${paused}`}
        elapsed={frozen?.elapsed ?? frame.elapsed}
        paused={paused}
      />
      <span className="story-announcement" role="status">
        {announcement}
      </span>
    </section>
  );
}
