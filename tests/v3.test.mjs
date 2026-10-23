import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Hourly allowances and secret optional role draws", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const setup = await readFile(
    new URL("../supabase/setup.sql", import.meta.url),
    "utf8",
  );
  await db.exec(setup);
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  async function rpc(uid, fn, args = [], types = []) {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid || ""]);
    return (
      await q(
        `select public.${fn}(${args.map((_, i) => `$${i + 1}${types[i] || ""}`).join(",")}) result`,
        args,
      )
    )[0].result;
  }
  const create = (uid, settings = {}) =>
    rpc(
      uid,
      "vk_create",
      ["Kurucu", JSON.stringify(settings)],
      ["", "::jsonb"],
    );
  async function make(settings, count = 4) {
    const host = randomUUID();
    const users = Array.from({ length: count }, () => randomUUID());
    const code = await create(host, { host_plays: false, ...settings });
    for (let i = 0; i < users.length; i++)
      await rpc(users[i], "vk_join", [code, `Kişi ${i + 1}`]);
    for (const uid of users) await rpc(uid, "vk_ready", [code, 0, true]);
    await rpc(host, "vk_start", [code]);
    const players = await q(
      "select p.* from vk_private.players p join vk_private.rooms r on r.id=p.room_id where r.code=$1 order by p.number",
      [code],
    );
    return { host, users, code, players };
  }
  const state = (g, uid = g.host) => rpc(uid, "vk_state", [g.code]);
  const expire = (g) =>
    q(
      "update vk_private.rooms set ends_at=now()-interval '1 second' where code=$1",
      [g.code],
    );

  await t.test(
    "ten rooms allowed, eleventh refused, other hosts and joining unaffected",
    async () => {
      const host = randomUUID();
      const initial = await rpc(host, "vk_quota");
      assert.equal(initial.limit, 10);
      assert.equal(initial.remaining, 10);
      assert.equal(initial.next_refresh_at, null);
      const codes = [];
      for (let i = 0; i < 10; i++) codes.push(await create(host));
      assert.equal(new Set(codes).size, 10);
      const full = await rpc(host, "vk_quota");
      assert.equal(full.used, 10);
      assert.equal(full.remaining, 0);
      assert.ok(Date.parse(full.next_refresh_at) > Date.parse(full.server_now));
      await assert.rejects(() => create(host), /1 saatte 10 masa/);
      assert.equal((await rpc(host, "vk_quota")).used, 10);
      const other = randomUUID();
      const otherCode = await create(other);
      await rpc(host, "vk_join", [otherCode, "Misafir"]);
      assert.equal((await rpc(host, "vk_quota")).remaining, 0);
      assert.equal((await rpc(other, "vk_quota")).remaining, 9);
      await q(
        "update vk_private.rooms set created_at=now()-interval '61 minutes' where code=$1",
        [codes[0]],
      );
      assert.equal((await rpc(host, "vk_quota")).remaining, 1);
      await create(host);
      assert.equal((await rpc(host, "vk_quota")).remaining, 0);
    },
  );

  await t.test(
    "invalid creation spends no allowance; quota requires a session",
    async () => {
      const host = randomUUID();
      await assert.rejects(
        () => create(host, { doctor: "maybe" }),
        /Geçersiz rol/,
      );
      await assert.rejects(
        () => rpc(host, "vk_create", ["", "{}"], ["", "::jsonb"]),
        /İsmin/,
      );
      assert.equal((await rpc(host, "vk_quota")).remaining, 10);
      await assert.rejects(() => rpc(null, "vk_quota"), /giriş/);
    },
  );

  await t.test(
    "always/never options and old boolean settings deal exactly the requested roles",
    async () => {
      for (const [doctor, jester, expected] of [
        ["always", "always", ["doctor", "jester", "vampire", "villager"]],
        ["never", "never", ["vampire", "villager", "villager", "villager"]],
        [true, false, ["doctor", "vampire", "villager", "villager"]],
      ]) {
        const g = await make({ doctor, jester });
        assert.deepEqual(g.players.map((p) => p.role).sort(), expected.sort());
        const s = await state(g);
        assert.equal(s.settings.doctor, doctor === true ? "always" : doctor);
        assert.equal(s.settings.jester, jester === false ? "never" : jester);
        assert.equal(s.is_observer, true);
        assert.equal(s.me, null);
      }
    },
  );

  await t.test(
    "independent random draws can yield both, either, or neither; outcomes remain private",
    async () => {
      await q("select setseed(0.314159)");
      const combinations = new Set();
      for (let i = 0; i < 32; i++) {
        const g = await make({ doctor: "random", jester: "random" });
        const rs = g.players.map((p) => p.role);
        assert.equal(rs.filter((r) => r === "vampire").length, 1);
        assert.ok(rs.filter((r) => r === "doctor").length <= 1);
        assert.ok(rs.filter((r) => r === "jester").length <= 1);
        combinations.add(`${rs.includes("doctor")}/${rs.includes("jester")}`);
        for (const uid of [g.host, ...g.users]) {
          const s = await state(g, uid);
          assert.equal(s.settings.doctor, "random");
          assert.equal(s.settings.jester, "random");
          assert.ok(s.players.every((p) => p.role === null));
          if (s.me)
            assert.equal(
              s.me.role,
              g.players.find((p) => p.user_id === uid).role,
            );
        }
        await assert.rejects(
          () => rpc(g.host, "vk_start", [g.code]),
          /zaten başladı/,
        );
      }
      assert.deepEqual([...combinations].sort(), [
        "false/false",
        "false/true",
        "true/false",
        "true/true",
      ]);
    },
  );

  await t.test(
    "random doctor slot has the same public sequence and minimum duration when present, absent or dead",
    async () => {
      for (const doctorStatus of ["present", "absent", "dead"]) {
        const g = await make({ doctor: "random", jester: "never" }, 5);
        await q(
          "update vk_private.players set role='villager' where room_id=$1 and role='doctor'",
          [g.players[0].room_id],
        );
        const vampire = g.players.find((p) => p.role === "vampire");
        const candidates = g.players.filter((p) => p.id !== vampire.id);
        const doctor = candidates[0],
          victim = candidates[1];
        if (doctorStatus !== "absent")
          await q(
            "update vk_private.players set role='doctor',alive=$2 where id=$1",
            [doctor.id, doctorStatus === "present"],
          );
        await q(
          "update vk_private.rooms set phase='night',seq=seq+1,night_step='vampire',victim=null,protected=null,ends_at=now()+interval '1 hour' where code=$1",
          [g.code],
        );
        let s = await state(g, vampire.user_id);
        await rpc(
          vampire.user_id,
          "vk_act",
          [g.code, s.seq, "kill", victim.id],
          ["", "::int", "", "::uuid"],
        );
        await expire(g);
        s = await state(g);
        assert.equal(s.phase, "night");
        assert.equal(Date.parse(s.ends_at) - Date.parse(s.started_at), 15000);
        assert.equal(s.settings.doctor, "random");
        assert.equal(s.my_turn, false);
        assert.equal(s.has_chosen, false);
        assert.ok(s.players.every((p) => p.role === null));
        assert.equal(s.players.find((p) => p.id === victim.id).alive, true);
        if (doctorStatus === "present") {
          await expire(g);
          assert.equal((await state(g)).phase, "night");
          const ds = await state(g, doctor.user_id);
          assert.equal(ds.my_turn, true);
          await rpc(
            doctor.user_id,
            "vk_act",
            [g.code, ds.seq, "protect", vampire.id],
            ["", "::int", "", "::uuid"],
          );
        } else {
          assert.equal((await state(g)).phase, "night");
          await expire(g);
        }
        const result = await state(g);
        assert.equal(result.phase, "night_result");
        assert.equal(result.announcement.kind, "night_death");
      }
    },
  );

  await t.test(
    "upgrading an old boolean room preserves its roles, settings intent and quota",
    async () => {
      const g = await make({ doctor: true, jester: true });
      await q(
        "update vk_private.rooms set settings=jsonb_set(jsonb_set(settings,'{doctor}','true'),'{jester}','true') where code=$1",
        [g.code],
      );
      const before = await state(g);
      const beforeQuota = await rpc(g.host, "vk_quota");
      await db.exec(setup);
      const after = await state(g);
      assert.equal(after.seq, before.seq);
      assert.equal(after.settings.doctor, "always");
      assert.equal(after.settings.jester, "always");
      assert.deepEqual(
        after.players.map((p) => p.id),
        before.players.map((p) => p.id),
      );
      assert.equal(
        (await rpc(g.host, "vk_quota")).remaining,
        beforeQuota.remaining,
      );
    },
  );

  await t.test(
    "authenticated users cannot query another host's allowance via private helpers",
    async () => {
      await db.exec("set role authenticated");
      await assert.rejects(
        () => q("select vk_private.room_quota($1::uuid)", [randomUUID()]),
        /permission denied/,
      );
      await db.exec("reset role");
    },
  );
  await db.close();
});
