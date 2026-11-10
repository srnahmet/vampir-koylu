// Development-only visual QA. Vite removes its conditional import in production.
import { EventScene, type SceneKind } from "./EventScene";
import { useState } from "react";
import { VampireAttack } from "./VampireAttack";
import { RoleEffect } from "./RoleEffect";
import { Sprite } from "./art";
import { SoundPreview } from "./sound/SoundPreview";
import { LobbyRoleSettings } from "./LobbyRoleSettings";
import { defaults } from "./domain";
import { LobbyStories } from "./LobbyStories";
export default function ScenePreview() {
  const [attack, setAttack] = useState<string | null>(null);
  return (
    <main className="scene-preview">
      <VampireAttack eventKey={attack} />
      <h1>Köyden küçük hikâyeler</h1>
      <p>GISM 🤝 SPTLS · Piksel sahneleri</p>
      <section className="paper-card" style={{ padding:24, marginBottom:24 }}><h2>Masadaki karakter ayarları</h2><LobbyRoleSettings settings={{ ...defaults, two_vampires:true, doctor:"always", jester:"random", mayor:"never", bodyguard:"always", hunter:"random", shaman:"never", gunslinger:"random", vampire_cub:"always" }} /></section>
      <LobbyStories />
      <SoundPreview />
      <section className="paper-card" style={{ padding: 24, marginBottom: 24 }}>
        <Sprite role="vampire_cub" />
        <h2>Yavru Vampir · V2</h2>
        <button
          className="button primary"
          onClick={() => setAttack(`preview-${Date.now()}`)}
        >
          Ölüm efektini dene
        </button>
      </section>
      <div className="scene-preview-grid">{["mayor", "bodyguard", "hunter", "silence", "gunslinger", "guilt", "vampire_cub"].map(kind => <RoleEffect key={kind} kind={kind} />)}</div>
      <div className="scene-preview-grid">
        {(
          [
            "night",
            "voting",
            "night_death",
            "execution",
            "saved",
            "village_win",
            "vampire_win",
            "jester_win",
            "roles",
            "discussion",
          ] as SceneKind[]
        ).map((kind) => (
          <section key={kind}>
            <EventScene kind={kind} />
            <span>{kind}</span>
          </section>
        ))}
      </div>
    </main>
  );
}
