// Development-only visual QA. Vite removes its conditional import in production.
import { EventScene, type SceneKind } from "./EventScene";
export default function ScenePreview() {
  return (
    <main className="scene-preview">
      <h1>Köyden küçük hikâyeler</h1>
      <p>GISM 🤝 SPTLS · Piksel sahneleri</p>
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
