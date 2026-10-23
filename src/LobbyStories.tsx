import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { Sprite } from "./art";
import {
  storyInterval,
  randomStoryIndex,
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

export function LobbyStories() {
  const [index, setIndex] = useState(() => randomStoryIndex());

  useEffect(() => {
    const timer = setTimeout(
      () => setIndex(randomStoryIndex(index)),
      storyInterval,
    );
    return () => clearTimeout(timer);
  }, [index]);

  const story = villageStories[index];
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
      aria-live="off"
    >
      <div className="story-heading">
        <span>
          <BookOpen size={16} /> Ateş başı hikâyeleri
        </span>
      </div>
      <article className="story-slide" key={story.id} aria-label={story.title}>
        <StoryArtwork story={story} />
        <div className="story-copy">
          <span className={`story-kind ${story.kind}`}>{kind}</span>
          <h2>{story.title}</h2>
          <p>{story.text}</p>
        </div>
      </article>
      <div className="story-footer">
        <span className="story-cadence">
          Bunları biliyor muydun? · Her 15 saniyede yeni bir sır
        </span>
      </div>
      <div className="story-progress" aria-hidden="true">
        <span key={story.id} />
      </div>
    </section>
  );
}
