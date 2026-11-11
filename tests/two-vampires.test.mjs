// Archived V2 contract: sequential nights remain supported for rounds already running at migration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("two vampires choose privately and resolve after the deadline", async t => {
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`create role anon; create role authenticated; create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const read=async _f=>readFile(new URL('./fixtures/setup-v2.sql',import.meta.url),'utf8');
  await db.exec(await read('setup.sql')); const migration=await read('v2.sql'); await db.exec(migration); await db.exec(migration);
  const q=async (sql,p=[]) => (await db.query(sql,p)).rows;
  const call=async(uid,fn,args=[])=>{ await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]); return (await q(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args))[0].result; };
  async function game(n=6,doctor='never') {
    const host=randomUUID(), users=Array.from({length:n},()=>randomUUID());
    const code=await call(host,'vk_create',['',JSON.stringify({host_plays:false,two_vampires:true,doctor})]);
    for(const [i,u] of users.entries()) { await call(u,'vk_join',[code,`Kişi ${i}`]); await call(u,'vk_ready',[code,0,true]); }
    return {host,users,code};
  }
  const small=await game(5); await assert.rejects(()=>call(small.host,'vk_start',[small.code]),/en az 6/);
  const g=await game(); await call(g.host,'vk_start',[g.code]);
  const players=await q('select p.* from vk_private.players p join vk_private.rooms r on r.id=p.room_id where r.code=$1 order by number',[g.code]);
  const v=players.filter(p=>p.role==='vampire'), victims=players.filter(p=>p.role!=='vampire'); assert.equal(v.length,2);
  await q("update vk_private.rooms set phase='night',seq=12,night_step='vampire',ends_at=now()+interval '1 minute' where code=$1",[g.code]);
  const state=u=>call(u,'vk_state',[g.code]);
  const act=(u,target)=>call(u,'vk_act',[g.code,12,'kill',target]);
  await assert.rejects(()=>act(v[0].user_id,v[1].id),/takım arkadaşını/);
  await act(v[0].user_id,victims[0].id);
  assert.equal((await state(v[1].user_id)).vampire_team.find(x=>x.id===v[0].id).target,victims[0].id);
  assert.equal((await state(victims[0].user_id)).vampire_team,null);
  assert.equal((await state(g.host)).vampire_team,null);
  await act(v[0].user_id,victims[1].id); // Can revise while the clock runs.
  await act(v[1].user_id,victims[0].id);
  assert.equal((await state(v[0].user_id)).phase,'night');
  await q("update vk_private.rooms set ends_at=now()-interval '1 second' where code=$1",[g.code]);
  const result=await state(v[0].user_id);
  assert.equal(result.phase,'night_result'); assert.equal(result.vampire_decision.random,true);
  assert.ok([victims[0].id,victims[1].id].includes(result.vampire_decision.target));
  assert.equal((await state(g.host)).vampire_decision,null);
  const dead=(await q('select id from vk_private.players where room_id=$1 and not alive',[players[0].room_id])).map(x=>x.id);
  assert.deepEqual(dead,[result.vampire_decision.target]);
  const actions=await q("select target,details from vk_private.round_actions where room_id=$1 and kind='kill' order by id",[players[0].room_id]);
  assert.equal(actions.length,2); assert.equal(actions.filter(x=>x.details.outcome==='missed').length,1);
});

test("agreement, doctor protection, and surviving vampire preserve the rules", async t => {
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await db.exec(await readFile(new URL('./fixtures/setup-v2.sql',import.meta.url),'utf8'));
  const q=async(s,p=[]) => (await db.query(s,p)).rows;
  const call=async(uid,fn,args=[])=>{await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return (await q(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args))[0].result};
  const host=randomUUID(),users=Array.from({length:7},()=>randomUUID());
  const code=await call(host,'vk_create',['',JSON.stringify({host_plays:false,two_vampires:true,doctor:'always'})]);
  for(const [i,u] of users.entries()){await call(u,'vk_join',[code,`Oyuncu ${i}`]);await call(u,'vk_ready',[code,0,true]);}
  await call(host,'vk_start',[code]);
  const ps=await q('select p.* from vk_private.players p join vk_private.rooms r on r.id=p.room_id where r.code=$1',[code]);
  const vs=ps.filter(p=>p.role==='vampire'),doctor=ps.find(p=>p.role==='doctor'), target=ps.find(p=>p.role==='villager');
  await q("update vk_private.rooms set phase='night',seq=40,night_step='vampire',ends_at=now()+interval '10 seconds' where code=$1",[code]);
  for(const v of vs) await call(v.user_id,'vk_act',[code,40,'kill',target.id]);
  await q("update vk_private.rooms set ends_at=now()-interval '1 second' where code=$1",[code]);
  let s=await call(doctor.user_id,'vk_state',[code]);assert.equal(s.phase,'night'); assert.equal(s.my_turn,true);
  assert.equal((await call(vs[0].user_id,'vk_state',[code])).vampire_decision.random,false);
  await call(doctor.user_id,'vk_act',[code,s.seq,'protect',target.id]);
  await q("update vk_private.rooms set ends_at=now()-interval '1 second' where code=$1",[code]);
  s=await call(host,'vk_state',[code]);assert.equal(s.phase,'night_result');
  assert.equal((await q('select alive from vk_private.players where id=$1',[target.id]))[0].alive,true);
  await q("update vk_private.rooms set phase='voting',seq=60,ends_at=now()-interval '1 second' where code=$1",[code]);
  for(const p of ps) await q('insert into vk_private.votes(room_id,seq,voter,target) values($1,60,$2,$3)',[p.room_id,p.id,p.id===vs[0].id?vs[1].id:vs[0].id]);
  s=await call(host,'vk_state',[code]);assert.equal(s.phase,'execution');assert.equal(s.winner,null);
});
