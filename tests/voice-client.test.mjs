import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceWindow } from "../src/voice/policy.ts";
import { VoiceController } from "../src/voice/VoiceController.ts";

const fixture = () => ({
  code: "ABCDEF",
  phase: "intro",
  seq: 5,
  settings: { turn_based: true, voice_enabled: true },
  ends_at: new Date(Date.now() + 60000).toISOString(),
  me: { id: "one", alive: true },
  is_observer: false,
  players: [
    { id: "one", alive: true },
    { id: "two", alive: true },
  ],
  speech: {
    group: false,
    speaker_id: "one",
    turn_index: 0,
    ends_at: new Date(Date.now() + 20000).toISOString(),
  },
});

test("voice eligibility follows phase, living membership, server deadlines and each individual turn", () => {
  const g = fixture(),
    now = Date.now();
  assert.ok(voiceWindow(g, "one", now));
  assert.equal(voiceWindow(g, "two", now), null);
  assert.equal(voiceWindow(g, null, now), null);
  assert.equal(voiceWindow(g, "one", now + 25000), null);
  const first = voiceWindow(g, "one", now).key;
  g.speech.turn_index = 2;
  assert.notEqual(voiceWindow(g, "one", now).key, first);
  g.speech.group = true;
  assert.ok(voiceWindow(g, "two", now));
  for (const phase of [
    "night",
    "voting",
    "lobby",
    "dealing",
    "execution",
    "finished",
  ]) {
    g.phase = phase;
    assert.equal(voiceWindow(g, "one", now), null);
  }
  g.phase = "runoff";
  assert.ok(voiceWindow(g, "two", now));
  g.players[1].alive = false;
  assert.equal(voiceWindow(g, "two", now), null);
  g.settings.turn_based = false;
  assert.equal(voiceWindow(g, "one", now), null);
  g.settings.turn_based = true;
  g.settings.voice_enabled = false;
  assert.equal(voiceWindow(g, "one", now), null);
});

test("microphone capture is opt-in and pending permission is discarded after a turn changes", async () => {
  const oldRTC = globalThis.RTCPeerConnection,
    oldAudio = globalThis.AudioContext;
  globalThis.RTCPeerConnection = class {};
  globalThis.AudioContext = class {
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  };
  let requests = 0,
    resolveMedia,
    stopped = 0;
  const states = [];
  const g = fixture();
  const c = new VoiceController({
    onChange: (s) => states.push(s),
    getMedia: () => {
      requests++;
      return new Promise((r) => {
        resolveMedia = r;
      });
    },
    rpc: async () => ({
      enabled: true,
      peers: [],
      signals: [],
      can_speak: true,
    }),
  });
  try {
    c.updateGame(g);
    await c.toggleMic();
    assert.equal(requests, 0);
    await c.connect();
    assert.equal(requests, 0);
    const pending = c.toggleMic();
    await Promise.resolve();
    assert.equal(requests, 1);
    g.speech = { ...g.speech, speaker_id: "two", turn_index: 1 };
    c.updateGame(g);
    resolveMedia({
      getTracks: () => [
        {
          stop() {
            stopped++;
          },
        },
      ],
    });
    await pending;
    assert.equal(stopped, 1);
    assert.equal(states.at(-1).mic, false);
    await c.toggleMic();
    assert.equal(requests, 1);
    g.settings.turn_based = false;
    c.updateGame(g);
    assert.equal(states.at(-1).status, "off");
  } finally {
    c.disconnect();
    globalThis.RTCPeerConnection = oldRTC;
    globalThis.AudioContext = oldAudio;
  }
});
