import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const optionalRoles = ['doctor','jester','mayor','bodyguard','hunter','shaman','gunslinger','vampire_cub'];
export async function gameHarness({ legacy = false, setupFile = null } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await db.exec(await readFile(setupFile || new URL(legacy ? '../fixtures/setup-v2.sql' : '../../supabase/setup.sql', import.meta.url), 'utf8'));
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  async function rpc(uid, fn, args = []) {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid || '']);
    await db.exec('begin; set local role authenticated');
    try {
      const result = (await q(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args))[0].result;
      await db.exec('commit'); return result;
    } catch (error) { await db.exec('rollback'); throw error; }
  }
  async function make(cast = null, settings = {}, size = cast?.length || 8) {
    const host = randomUUID(), users = Array.from({ length: size }, () => randomUUID());
    const code = await rpc(host, 'vk_create', ['', JSON.stringify({ host_plays: false, disconnect_seconds: 600, ...settings })]);
    for (const [i, uid] of users.entries()) {
      await rpc(uid, 'vk_join', [code, `Oyuncu ${i + 1}`]);
      await rpc(uid, 'vk_ready', [code, 0, true]);
    }
    await rpc(host, 'vk_start', [code]);
    const players = await q('select p.* from vk_private.players p join vk_private.rooms r on r.id=p.room_id where r.code=$1 order by number', [code]);
    if (cast) for (const [i, p] of players.entries()) await q('update vk_private.players set role=$1 where id=$2', [cast[i] || 'villager', p.id]);
    return { host, users, code, players, rid: players[0].room_id };
  }
  const state = (g, i) => rpc(i === undefined ? g.host : g.users[i], 'vk_state', [g.code]);
  const room = async g => (await q('select * from vk_private.rooms where id=$1', [g.rid]))[0];
  const players = g => q('select * from vk_private.players where room_id=$1 order by number', [g.rid]);
  async function force(g, phase = 'night', step = 'vampire') {
    await q("update vk_private.rooms set phase=$2,night_step=$3,seq=seq+1,ends_at=now()+interval '1 minute',victim=null,extra_victim=null,protected=null,guard_target=null,silence_target=null,hunter_pending=null,hunter_resume=null,vote_candidates='{}' where id=$1", [g.rid, phase, step]);
    return state(g);
  }
  const expire = async g => { await q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1", [g.rid]); return state(g); };
  async function action(g, i, kind, target, seq) {
    const special = ['shoot','revenge','decide','silence','guard','silence_breach'].includes(kind);
    return rpc(i === undefined ? g.host : g.users[i], special ? 'vk_ability' : 'vk_act', [g.code, seq ?? (await room(g)).seq, kind, typeof target === 'number' ? g.players[target].id : target]);
  }
  const disconnect = (g, i) => q("update vk_private.players set last_seen=now()-interval '601 seconds' where id=$1", [g.players[i].id]);
  return { db, q, rpc, make, state, room, players, force, expire, action, disconnect };
}
