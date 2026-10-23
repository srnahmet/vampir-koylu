import { test } from "node:test";
import assert from "node:assert/strict";
import { SoundEffects } from "../src/sound/effects.ts";

function fakeContext() {
  const nodes = [];
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  return {
    state: "suspended",
    currentTime: 0,
    destination: {},
    nodes,
    closed: 0,
    resume() {
      this.state = "running";
      return Promise.resolve();
    },
    close() {
      this.closed++;
      this.state = "closed";
      return Promise.resolve();
    },
    createGain() {
      return {
        gain: param(),
        connect() {
          return this;
        },
        disconnect() {},
      };
    },
    createOscillator() {
      const node = {
        frequency: param(),
        started: 0,
        stopped: 0,
        connect() {
          return this;
        },
        disconnect() {},
        start() {
          this.started++;
        },
        stop() {
          this.stopped++;
        },
      };
      nodes.push(node);
      return node;
    },
  };
}

test("effects stay silent without opt-in; muting stops queued tones and releases audio resources", async () => {
  let created = 0;
  const context = fakeContext();
  const effects = new SoundEffects(() => {
    created++;
    return context;
  });
  await effects.play("tap", true);
  assert.equal(created, 0);
  assert.equal(await effects.enable(), true);
  await effects.play("night");
  assert.ok(context.nodes.every((node) => node.started === 1));
  effects.disable();
  assert.ok(context.nodes.every((node) => node.stopped >= 2));
  assert.equal(context.closed, 1);
  const before = context.nodes.length;
  await effects.play("day", true);
  assert.equal(context.nodes.length, before);
});

test("muting while autoplay permission is pending prevents a late sound", async () => {
  const context = fakeContext();
  let resume;
  context.resume = () =>
    new Promise((resolve) => {
      resume = resolve;
    });
  const effects = new SoundEffects(() => context);
  const enabling = effects.enable();
  effects.disable();
  context.state = "running";
  resume();
  assert.equal(await enabling, false);
  await effects.play("enabled");
  assert.equal(context.nodes.length, 0);
});

test("unsupported or rejected audio leaves controls usable and allocates no sound sources", async () => {
  const unsupported = new SoundEffects(() => {
    throw new Error("unsupported");
  });
  assert.equal(await unsupported.enable(), false);
  await unsupported.play("tap", true);
  const context = fakeContext();
  context.resume = () => Promise.reject(new Error("blocked"));
  const blocked = new SoundEffects(() => context);
  assert.equal(await blocked.enable(), false);
  assert.equal(context.closed, 1);
  assert.equal(context.nodes.length, 0);
});
