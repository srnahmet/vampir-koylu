import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Observer, early transitions, and two-round speaking", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const setup = await readFile(
    new URL("../supabase/setup.sql", import.meta.url),
    "utf8",
  );
  await db.exec(setup);
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  async function rpc(uid, fn, args = [], types = []) {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid || ""]);
    return (
      await q(
        `select public.${fn}(${args.map((_, i) => `$${i + 1}${types[i] || ""}`).join(",")}) result`,
        args,
      )
    )[0].result;
  }
  async function make(n = 4, settings = {}) {
    const host = randomUUID();
    const code = await rpc(
      host,
      "vk_create",
      ["", JSON.stringify({ host_plays: false, ...settings })],
      ["", "::jsonb"],
    );
    const users = [];
    for (let i = 0; i < n; i++) {
      const uid = randomUUID();
      await rpc(uid, "vk_join", [code, `Kişi ${i + 1}`]);
      users.push(uid);
    }
    return { host, code, users };
  }
  const state = (g, uid = g.host) => rpc(uid, "vk_state", [g.code]);
  const expire = (g) =>
    q(
      "update vk_private.rooms set ends_at=now()-interval '1 second' where code=$1",
      [g.code],
    );
  async function intro(g) {
    for (const uid of g.users) await rpc(uid, "vk_ready", [g.code, 0, true]);
    await rpc(g.host, "vk_start", [g.code]);
    await expire(g);
    await state(g);
    await expire(g);
    return state(g);
  }
  async function early(g, i) {
    const s = await state(g);
    return rpc(
      g.users[i],
      "vk_act",
      [g.code, s.seq, "early", null],
      ["", "::int", "", "::uuid"],
    );
  }
  async function speak(g, s, uid) {
    return rpc(
      uid,
      "vk_speak",
      [g.code, s.seq, s.speech.turn_index],
      ["", "::int", "::int"],
    );
  }
  async function speaker(g, s) {
    return (
      await q("select user_id from vk_private.players where id=$1", [
        s.speech.speaker_id,
      ])
    )[0].user_id;
  }

  await t.test(
    "observing host needs no name, no player row, no number and no role",
    async () => {
      const g = await make(0);
      const s = await state(g);
      assert.equal(s.is_host, true);
      assert.equal(s.is_observer, true);
      assert.equal(s.me, null);
      assert.deepEqual(s.players, []);
      assert.equal(s.my_turn, false);
      await assert.rejects(() => rpc(g.host, "vk_start", [g.code]), /en az 4/);
    },
  );
  await t.test(
    "observer not counted toward minimum; numbered players start at one",
    async () => {
      const g = await make(3);
      await assert.rejects(() => rpc(g.host, "vk_start", [g.code]), /en az 4/);
      const uid = randomUUID();
      await rpc(uid, "vk_join", [g.code, "Dördüncü"]);
      for (const player of [...g.users, uid]) await rpc(player, "vk_ready", [g.code, 0, true]);
      await rpc(g.host, "vk_start", [g.code]);
      const s = await state(g);
      assert.deepEqual(
        s.players.map((p) => p.number),
        [1, 2, 3, 4],
      );
      assert.equal(s.me, null);
      assert.ok(s.players.every((p) => p.role === null));
    },
  );
  await t.test(
    "observer reconnect and own invite do not silently enroll host",
    async () => {
      const g = await make();
      await rpc(g.host, "vk_join", [g.code, ""]);
      const s = await state(g);
      assert.equal(s.players.length, 4);
      assert.equal(s.me, null);
      await assert.rejects(
        () => rpc(randomUUID(), "vk_state", [g.code]),
        /katıl/,
      );
    },
  );
  await t.test(
    "observing host cannot vote, advance by majority, or perform role actions",
    async () => {
      const g = await make();
      let s = await intro(g);
      for (const action of ["early", "vote", "kill", "protect"])
        await assert.rejects(
          () =>
            rpc(
              g.host,
              "vk_act",
              [g.code, s.seq, action, s.players[0].id],
              ["", "::int", "", "::uuid"],
            ),
          /yaşayan/,
        );
      assert.equal((await state(g)).early_count, 0);
    },
  );
  await t.test(
    "intro skips to night only at strict living majority; duplicate request has no effect",
    async () => {
      const g = await make();
      await intro(g);
      await early(g, 0);
      await early(g, 0);
      await early(g, 1);
      let s = await state(g);
      assert.equal(s.phase, "intro");
      assert.equal(s.early_count, 2);
      await early(g, 2);
      assert.equal((await state(g)).phase, "night");
    },
  );
  await t.test("runoff can also be shortened by majority", async () => {
    const g = await make();
    await intro(g);
    await q(
      "update vk_private.rooms set phase='runoff',seq=seq+1,ends_at=now()+interval '1 hour' where code=$1",
      [g.code],
    );
    await early(g, 0);
    await early(g, 1);
    assert.equal((await state(g)).phase, "runoff");
    await early(g, 2);
    assert.equal((await state(g)).phase, "voting");
  });
  await t.test(
    "same public random order shown to host and players; observer receives no own-role payload",
    async () => {
      const g = await make(4, { turn_based: true, doctor: true, jester: true });
      const s = await intro(g);
      const p = await state(g, g.users[0]);
      assert.deepEqual(s.speech, p.speech);
      assert.equal(s.speech.order.length, 4);
      assert.equal(new Set(s.speech.order).size, 4);
      assert.equal(s.speech.round, 1);
      assert.equal(s.me, null);
      assert.equal(s.tally, null);
      assert.ok(s.players.every((p) => p.role === null));
    },
  );
  await t.test(
    "only active speaker can finish; stale turn does not skip next player",
    async () => {
      const g = await make(4, { turn_based: true });
      const s = await intro(g);
      const uid = await speaker(g, s);
      const other = g.users.find((u) => u !== uid);
      await assert.rejects(() => speak(g, s, other), /başka bir oyuncu/);
      await assert.rejects(() => speak(g, s, g.host), /Sadece/);
      await speak(g, s, uid);
      await assert.rejects(() => speak(g, s, uid), /sırası değişti/);
      assert.equal((await state(g)).speech.turn_index, 1);
    },
  );
  await t.test(
    "exactly two turns per player, then free discussion with original day clock",
    async () => {
      const g = await make(4, { turn_based: true });
      let s = await intro(g);
      const ends = s.ends_at,
        seq = s.seq;
      const turns = [];
      await early(g, 0);
      for (let i = 0; i < 8; i++) {
        s = await state(g);
        turns.push(s.speech.speaker_id);
        assert.equal(s.speech.round, i < 4 ? 1 : 2);
        await speak(g, s, await speaker(g, s));
      }
      s = await state(g);
      assert.equal(s.phase, "intro");
      assert.equal(s.speech.group, true);
      assert.equal(s.speech.speaker_id, null);
      assert.equal(s.ends_at, ends);
      assert.equal(s.seq, seq);
      assert.equal(s.early_count, 1);
      for (const id of s.speech.order)
        assert.equal(turns.filter((p) => p === id).length, 2);
    },
  );
  await t.test(
    "speaking timeout automatically advances while leaving voting requests intact",
    async () => {
      const g = await make(4, { turn_based: true });
      let s = await intro(g);
      await early(g, 0);
      await q(
        "update vk_private.rooms set speech_ends_at=now()-interval '1 millisecond' where code=$1",
        [g.code],
      );
      s = await state(g);
      assert.equal(s.speech.turn_index, 1);
      assert.equal(s.early_count, 1);
    },
  );
  await t.test(
    "new day assigns speaking order only to living players",
    async () => {
      const g = await make(5, { turn_based: true });
      let s = await intro(g);
      const dead = s.players[0].id;
      await q("update vk_private.players set alive=false where id=$1", [dead]);
      await q(
        "update vk_private.rooms set phase='night_result',ends_at=now()-interval '1 second' where code=$1",
        [g.code],
      );
      s = await state(g);
      assert.equal(s.phase, "day");
      assert.equal(s.speech.order.length, 4);
      assert.ok(!s.speech.order.includes(dead));
    },
  );
  await t.test(
    "observer sees voting progress without secret tallies or target information",
    async () => {
      const g = await make();
      await intro(g);
      await q(
        "update vk_private.rooms set phase='voting',seq=seq+1,ends_at=now()+interval '1 hour' where code=$1",
        [g.code],
      );
      let s = await state(g, g.users[0]);
      await rpc(
        g.users[0],
        "vk_act",
        [g.code, s.seq, "vote", s.players[1].id],
        ["", "::int", "", "::uuid"],
      );
      s = await state(g);
      assert.equal(s.votes_cast, 1);
      assert.equal(s.tally, null);
      assert.equal(s.my_vote, null);
      assert.equal(s.me, null);
    },
  );
  await t.test(
    "idempotent setup preserves an existing room and its memberships",
    async () => {
      const g = await make();
      await db.exec(setup);
      const s = await state(g);
      assert.equal(s.players.length, 4);
      assert.equal(s.is_observer, true);
    },
  );
  await db.close();
});
