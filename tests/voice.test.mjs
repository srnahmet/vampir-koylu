import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Voice room access, signaling isolation and speaking permissions", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await db.exec(
    await readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8"),
  );
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  async function rpc(uid, fn, args = [], types = []) {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid || ""]);
    return (
      await q(
        `select public.${fn}(${args.map((_, i) => `$${i + 1}${types[i] || ""}`).join(",")}) result`,
        args,
      )
    )[0].result;
  }
  async function make(settings = {}) {
    const host = randomUUID();
    const users = Array.from({ length: 4 }, () => randomUUID());
    const code = await rpc(
      host,
      "vk_create",
      [
        "",
        JSON.stringify({
          host_plays: false,
          turn_based: true,
          voice_enabled: true,
          ...settings,
        }),
      ],
      ["", "::jsonb"],
    );
    for (let i = 0; i < 4; i++)
      await rpc(users[i], "vk_join", [code, `Kişi ${i + 1}`]);
    for (const uid of users) await rpc(uid, "vk_ready", [code, 0, true]);
    await rpc(host, "vk_start", [code]);
    const p = await q(
      "select p.* from vk_private.players p join vk_private.rooms r on r.id=p.room_id where r.code=$1 order by number",
      [code],
    );
    const sessions = [...users, host].map(() => randomUUID());
    await q(
      "update vk_private.rooms set phase='intro',seq=seq+1,ends_at=now()+interval '5 minutes',speech_order=$2::uuid[],speech_turn=0,speech_slot_ms=15000,speech_ends_at=now()+interval '15 seconds' where code=$1",
      [code, p.map((x) => x.id)],
    );
    return { host, users, code, p, sessions };
  }
  const sync = (g, i, extra = {}) =>
    rpc(
      i === 4 ? g.host : g.users[i],
      "vk_voice_sync",
      [
        g.code,
        g.sessions[i],
        extra.after || 0,
        JSON.stringify(extra.messages || []),
        extra.join ?? true,
        extra.mic ?? false,
      ],
      ["", "::uuid", "::bigint", "::jsonb", "::boolean", "::boolean"],
    );

  await t.test(
    "voice defaults off and cannot be enabled without turn-based discussion",
    async () => {
      for (const cfg of [{ turn_based: false }, { voice_enabled: false }]) {
        const g = await make(cfg);
        assert.equal((await sync(g, 0)).enabled, false);
        assert.equal(
          (await rpc(g.users[0], "vk_state", [g.code])).settings.voice_enabled,
          false,
        );
      }
      const uid = randomUUID();
      const c = await rpc(uid, "vk_create", ["Kurucu"]);
      assert.equal(
        (await rpc(uid, "vk_state", [c])).settings.voice_enabled,
        false,
      );
    },
  );
  await t.test(
    "only the current living speaker can publish an open mic; observer only listens",
    async () => {
      const g = await make();
      for (let i = 0; i < 5; i++) {
        const s = await sync(g, i, { mic: true });
        assert.equal(s.can_speak, i === 0);
      }
      const s = await sync(g, 0, { mic: true, join: false });
      assert.equal(s.peers.length, 5);
      assert.deepEqual(
        s.peers.filter((p) => p.mic_open).map((p) => p.player_id),
        [g.p[0].id],
      );
      assert.ok(s.peers.every((p) => !("role" in p) && !("user_id" in p)));
      assert.equal(s.peers.find((p) => p.player_id === null).can_speak, false);
      await q(
        "update vk_private.rooms set speech_turn=1,speech_ends_at=now()+interval '15 seconds' where code=$1",
        [g.code],
      );
      assert.equal(
        (await sync(g, 0, { join: false, mic: true })).can_speak,
        false,
      );
      assert.equal(
        (await sync(g, 1, { join: false, mic: true })).can_speak,
        true,
      );
    },
  );
  await t.test(
    "deadlines, elimination, night and voting close microphones; group and runoff allow living players",
    async () => {
      const g = await make();
      await q("update vk_private.players set role=case when id=$1 then 'vampire' else 'villager' end where room_id=$2", [g.p[1].id,g.p[0].room_id]);
      await sync(g, 0);
      await q(
        "update vk_private.rooms set speech_ends_at=now()-interval '1 second' where code=$1",
        [g.code],
      );
      assert.equal(
        (await sync(g, 0, { join: false, mic: true })).can_speak,
        false,
      );
      await q("update vk_private.rooms set speech_turn=8 where code=$1", [
        g.code,
      ]);
      assert.equal(
        (await sync(g, 0, { join: false, mic: true })).can_speak,
        true,
      );
      await q("update vk_private.players set alive=false where id=$1", [
        g.p[0].id,
      ]);
      assert.equal(
        (await sync(g, 0, { join: false, mic: true })).can_speak,
        false,
      );
      await q("update vk_private.players set alive=true where id=$1", [g.p[0].id]);
      for (const phase of [
        "night",
        "voting",
        "lobby",
        "dealing",
        "execution",
      ]) {
        await q("update vk_private.rooms set phase=$2 where code=$1", [
          g.code,
          phase,
        ]);
        assert.equal((await sync(g, 1, { mic: true })).can_speak, false);
      }
      await q("update vk_private.rooms set phase='runoff' where code=$1", [
        g.code,
      ]);
      assert.equal(
        (await sync(g, 1, { join: false, mic: true })).can_speak,
        true,
      );
      await q(
        "update vk_private.rooms set ends_at=now()-interval '1 second' where code=$1",
        [g.code],
      );
      assert.equal(
        (await sync(g, 1, { join: false, mic: true })).can_speak,
        false,
      );
      await q("update vk_private.rooms set phase='finished' where code=$1", [
        g.code,
      ]);
      assert.equal(
        (await sync(g, 1, { join: false, mic: true })).enabled,
        false,
      );
    },
  );
  await t.test(
    "turn-based mode being disabled revokes the entire voice session",
    async () => {
      const g = await make();
      await sync(g, 0, { mic: true });
      await q(
        "update vk_private.rooms set settings=jsonb_set(settings,'{turn_based}','false') where code=$1",
        [g.code],
      );
      const s = await sync(g, 0, { join: false, mic: true });
      assert.equal(s.enabled, false);
      assert.equal(s.can_speak, false);
      assert.deepEqual(s.peers, []);
      assert.deepEqual(s.signals, []);
    },
  );
  await t.test(
    "outsiders, unauthenticated callers and forged sessions cannot access voice",
    async () => {
      const g = await make();
      await sync(g, 0);
      const args = [g.code, g.sessions[0]];
      await assert.rejects(
        () => rpc(null, "vk_voice_sync", args, ["", "::uuid"]),
        /giriş/,
      );
      await assert.rejects(
        () => rpc(randomUUID(), "vk_voice_sync", args, ["", "::uuid"]),
        /katıl/,
      );
      await assert.rejects(
        () => rpc(g.users[1], "vk_voice_sync", args, ["", "::uuid"]),
        /oturum/,
      );
    },
  );
  await t.test(
    "messages are addressed, room-scoped, idempotent and cursor-based",
    async () => {
      const g = await make(),
        h = await make();
      for (let i = 0; i < 3; i++) await sync(g, i);
      await sync(h, 0);
      const message = {
        id: randomUUID(),
        to: g.sessions[1],
        payload: { type: "offer", sdp: "v=0" },
      };
      await sync(g, 0, { join: false, messages: [message] });
      await sync(g, 0, { join: false, messages: [message] });
      const inbox = await sync(g, 1, { join: false });
      assert.equal(inbox.signals.length, 1);
      assert.equal(inbox.signals[0].from, g.sessions[0]);
      assert.deepEqual((await sync(g, 2, { join: false })).signals, []);
      assert.deepEqual(
        (await sync(g, 1, { join: false, after: inbox.signals[0].id })).signals,
        [],
      );
      await sync(g, 0, {
        join: false,
        messages: [{ ...message, id: randomUUID(), to: h.sessions[0] }],
      });
      assert.deepEqual((await sync(h, 0, { join: false })).signals, []);
      await assert.rejects(
        () =>
          sync(g, 0, {
            join: false,
            messages: Array.from({ length: 41 }, () => message),
          }),
        /çok büyük/,
      );
      await assert.rejects(
        () =>
          sync(g, 0, {
            join: false,
            messages: [{ ...message, payload: { type: "unknown" } }],
          }),
        /Geçersiz/,
      );
    },
  );
  await t.test(
    "one voice tab per player; leaving only removes the caller's own session",
    async () => {
      const g = await make();
      await sync(g, 0);
      await sync(g, 1);
      const old = g.sessions[0];
      g.sessions[0] = randomUUID();
      await sync(g, 0);
      await assert.rejects(
        () => rpc(g.users[0], "vk_voice_sync", [g.code, old], ["", "::uuid"]),
        /oturum/,
      );
      await rpc(
        g.users[1],
        "vk_voice_leave",
        [g.code, g.sessions[0]],
        ["", "::uuid"],
      );
      assert.equal((await sync(g, 1, { join: false })).peers.length, 2);
      await rpc(
        g.users[0],
        "vk_voice_leave",
        [g.code, g.sessions[0]],
        ["", "::uuid"],
      );
      assert.equal((await sync(g, 1, { join: false })).peers.length, 1);
    },
  );
  await t.test(
    "expired peers and old signaling disappear without exposing private tables",
    async () => {
      const g = await make();
      await sync(g, 0);
      await sync(g, 1);
      await sync(g, 0, {
        join: false,
        messages: [
          {
            id: randomUUID(),
            to: g.sessions[1],
            payload: {
              type: "ice",
              candidate: { candidate: "candidate:test" },
            },
          },
        ],
      });
      await q(
        "update vk_private.voice_peers set last_seen=now()-interval '30 seconds' where session_id=$1",
        [g.sessions[0]],
      );
      await q(
        "update vk_private.voice_signals set created_at=now()-interval '3 minutes'",
      );
      const s = await sync(g, 1, { join: false });
      assert.equal(s.peers.length, 1);
      assert.deepEqual(s.signals, []);
      await db.exec("set role authenticated");
      await assert.rejects(
        () => q("select * from vk_private.voice_peers"),
        /permission denied/,
      );
      await assert.rejects(
        () => q("select * from vk_private.voice_signals"),
        /permission denied/,
      );
      await db.exec("reset role");
    },
  );
  await db.close();
});
