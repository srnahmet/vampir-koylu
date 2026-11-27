import { defaults, type Game, type Player, type Role } from "../domain";
import { validateDemo, type DemoSeat } from "./config";
export { demoCast, demoNames, validateDemo, type DemoSeat } from "./config";

export type DemoPlayer = Player & { role: Role; user_id: string };

// The production SQL runs in a disposable, in-memory database. Only its clock is
// substituted: real time never advances the demo or disconnects a bot.
export async function createDemoSession(sql: string, seats: DemoSeat[], runtime: { fsBundle: Blob; wasmModule: WebAssembly.Module } | undefined = undefined) {
  const error = validateDemo(seats);
  if (error) throw new Error(error);
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(runtime);
  const host = crypto.randomUUID();
  let code = "";
  let roomId = "";
  let viewer: string = host;
  const query = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;
  async function rpc<T>(uid: string, fn: string, args: unknown[] = []): Promise<T> {
    if (roomId) {
      await query("update vk_private.players set last_seen=vk_demo.now() where room_id=$1", [roomId]);
      await query("update vk_private.rooms set host_seen_at=vk_demo.now() where id=$1", [roomId]);
    }
    await query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await db.exec("begin; set local role authenticated");
    try {
      const rows = await query<{ result: T }>(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`, args);
      await db.exec("commit");
      return rows[0].result;
    } catch (e) { await db.exec("rollback"); throw e; }
  }
  const roster = () => query<DemoPlayer>("select * from vk_private.players where room_id=$1 order by number", [roomId]);
  const state = () => rpc<Game>(viewer, "vk_state", [code]);
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create schema vk_demo; create table vk_demo.clock (at timestamptz not null);
      insert into vk_demo.clock values ('2026-11-27T12:00:00Z');
      create function vk_demo.now() returns timestamptz language sql stable security definer set search_path='' as $$select at from vk_demo.clock$$;
      grant usage on schema vk_demo to authenticated,anon;`);
    await db.exec(sql.replace(/\bnow\(\)/g, "vk_demo.now()"));
    code = await rpc<string>(host, "vk_create", ["", JSON.stringify({ ...defaults, host_plays: false, two_vampires: seats.filter(p => ["vampire", "alpha_vampire"].includes(p.role)).length === 2 })]);
    roomId = (await query<{ id: string }>("select id from vk_private.rooms where code=$1", [code]))[0].id;
    for (const seat of seats) {
      const uid = crypto.randomUUID();
      await rpc(uid, "vk_join", [code, seat.name.trim()]);
      await rpc(uid, "vk_ready", [code, 0, true]);
    }
    await rpc(host, "vk_start", [code]);
    for (const [i, p] of (await roster()).entries()) {
      await query("update vk_private.players set role=$2,fanatic_target=null where id=$1", [p.id, seats[i].role]);
    }
    const players = await roster();
    for (const p of players.filter(p => p.role === "fanatic")) {
      await query("update vk_private.players set fanatic_target=$2 where id=$1", [p.id, players.find(t => t.id !== p.id && t.role === "villager")?.id || players.find(t => t.id !== p.id)!.id]);
    }
    viewer = players[0].user_id;
  } catch (e) { await db.close(); throw e; }

  async function action(kind: string, target: string | null = null) {
    const game = await state();
    return rpc(viewer, ["shoot", "revenge", "decide", "silence_breach"].includes(kind) ? "vk_ability" : "vk_act", [code, game.seq, kind, target]);
  }
  async function choose(kind: string, targets: string[]) {
    const game = await state();
    return rpc(viewer, "vk_night_action", [code, game.seq, kind, targets]);
  }
  async function next() {
    const before = await state();
    if (before.phase === "finished") return before;
    // Bots see only the same private state as their own seat. Existing choices,
    // including manual passes, are kept when the user changes perspective.
    for (const p of await roster()) {
      const g = await rpc<Game>(p.user_id, "vk_state", [code]);
      if (g.seq !== before.seq) break;
      const others = g.players.filter(t => t.alive && t.id !== p.id);
      if (g.phase === "night" && g.my_turn && !g.has_chosen) {
        let kind: string = g.night_action || "skip";
        let targets: string[] = [];
        const town = others.filter(t => !g.vampire_team?.some(v => v.id === t.id));
        if (kind === "kill") {
          // Shared first-night suspicion, then differing proposals on later nights.
          const ordered = town.slice().reverse();
          const at = g.day === 1 ? 0 : (g.day + p.number) % Math.max(1, ordered.length);
          if (ordered[at]) targets = [ordered[at].id];
          if (g.me?.role === "alpha_vampire" && !g.me.alpha_used && g.day > 1) kind = "bite";
          else if (g.attack_number === 2 && ordered.length > 1) targets.push(ordered[(at + 1) % ordered.length].id);
        } else if (kind === "protect") {
          const target = g.day === 1 ? g.players.filter(t => t.alive).at(-1) : !g.me?.self_heal_used ? g.me : others[(g.day - 1) % Math.max(1, others.length)];
          if (target) targets = [target.id];
        } else if (["silence", "guard"].includes(kind) && others.length) targets = [others[(g.day + p.number) % others.length].id];
        // The wizard saves the one-use power for a manual experiment.
        if (!targets.length) kind = "skip";
        await rpc(p.user_id, "vk_night_action", [code, g.seq, kind, targets]);
      } else if (g.phase === "voting" && g.me?.alive && g.can_vote !== false && !g.my_vote) {
        let candidates = others.filter(t => !g.vote_candidates?.length || g.vote_candidates.includes(t.id));
        const nonTeam = candidates.filter(t => !g.vampire_team?.some(v => v.id === t.id));
        if (nonTeam.length) candidates = nonTeam;
        // A common suspicion lets a believable majority form without knowing roles.
        const suspect = ((g.day - 2) * 3) % Math.max(1, g.players.length);
        const target = candidates.find(t => t.number > suspect) || candidates[0];
        if (target) await rpc(p.user_id, "vk_act", [code, g.seq, "vote", target.id]);
      } else if (["hunter", "mayor_decision"].includes(g.phase) && g.my_turn) {
        const candidates = g.phase === "mayor_decision" ? g.players.filter(t => t.alive && g.vote_candidates?.includes(t.id)) : others;
        if (candidates[0]) await rpc(p.user_id, "vk_ability", [code, g.seq, g.phase === "hunter" ? "revenge" : "decide", candidates[0].id]);
      }
    }
    const current = await state();
    if (current.seq === before.seq) {
      await query("update vk_demo.clock set at=$1::timestamptz+interval '1 millisecond'", [current.ends_at]);
    }
    return state();
  }
  return {
    state, roster, action, choose, next,
    async view(id: string | null) {
      const p = id ? (await roster()).find(p => p.id === id) : null;
      if (id && !p) throw new Error("Demo oyuncusu bulunamadı.");
      viewer = p?.user_id || host;
      return state();
    },
    close: () => db.close(),
  };
}

export type DemoSession = Awaited<ReturnType<typeof createDemoSession>>;
