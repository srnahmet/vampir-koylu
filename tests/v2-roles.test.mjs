// Archived V2 contract: sequential nights remain supported for rounds already running at migration.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('V2 complete character rules and private abilities', async t => {
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.exec(await readFile(new URL('./fixtures/setup-v2.sql',import.meta.url),'utf8'));
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 async function rpc(uid,fn,args=[]) {
  await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await db.exec('begin;set local role authenticated');
  try { const result=(await q(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args))[0].result; await db.exec('commit');return result; }
  catch(e){await db.exec('rollback');throw e;}
 }
 async function make(cast,settings={},n=7) {
  const host=randomUUID(),users=Array.from({length:n},()=>randomUUID());
  const code=await rpc(host,'vk_create',['',JSON.stringify({host_plays:false,...settings})]);
  for(const [i,uid] of users.entries()){await rpc(uid,'vk_join',[code,`Kişi ${i+1}`]);await rpc(uid,'vk_ready',[code,0,true]);}
  await rpc(host,'vk_start',[code]);
  const players=await q('select p.* from vk_private.players p join vk_private.rooms r on r.id=p.room_id where r.code=$1 order by p.number',[code]);
  if(cast) for(const [i,p] of players.entries()) await q('update vk_private.players set role=$1 where id=$2',[cast[i]||'villager',p.id]);
  return {host,users,code,players,rid:players[0].room_id};
 }
 const state=(g,i)=>rpc(i===undefined?g.host:g.users[i],'vk_state',[g.code]);
 async function force(g,phase='night',step='vampire') {await q("update vk_private.rooms set phase=$2,night_step=$3,seq=seq+1,ends_at=now()+interval '1 minute',victim=null,extra_victim=null,protected=null,guard_target=null,silence_target=null where id=$1",[g.rid,phase,step]);return state(g);}
 const expire=async g=>{await q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);return state(g);};
 const act=async(g,i,action,target)=>rpc(g.users[i],'vk_act',[g.code,(await state(g)).seq,action,g.players[target].id]);
 const ability=async(g,i,action,target)=>rpc(i===undefined?g.host:g.users[i],'vk_ability',[g.code,(await state(g)).seq,action,g.players[target].id]);
 const alive=async(g,i)=>(await q('select alive from vk_private.players where id=$1',[g.players[i].id]))[0].alive;
 async function votes(g,targets) { await force(g,'voting');for(const [i,target] of targets.entries()) await act(g,i,'vote',target);return expire(g); }
 await t.test('all ten roles can be dealt, guaranteed slots cannot be displaced',async()=>{
  const keys=['doctor','jester','mayor','bodyguard','hunter','shaman','gunslinger','vampire_cub'];
  const g=await make(null,{two_vampires:true,...Object.fromEntries(keys.map(k=>[k,'always']))},12);
  const ps=await q('select role from vk_private.players where room_id=$1',[g.rid]);
  for(const role of keys) assert.equal(ps.filter(p=>p.role===role).length,1,role);
  assert.equal(ps.filter(p=>p.role==='vampire').length,2);
  const s=await state(g);assert.ok(s.players.every(p=>p.role===null));assert.equal(s.me,null);
 });
 await t.test('oversubscribed guaranteed roles use the documented hidden lottery',async()=>{const g=await make(null,{doctor:'always',jester:'always',mayor:'always',bodyguard:'always'},4);assert.equal((await state(g)).phase,'dealing');});
 await t.test('bodyguard sacrifices only after doctor protection and recap is private',async()=>{
  const g=await make(['vampire','bodyguard','doctor']);await force(g);await act(g,0,'kill',3);await expire(g);
  await act(g,2,'protect',4);await expire(g);assert.equal((await state(g,1)).night_action,'guard');
  await ability(g,1,'guard',3);const s=await expire(g);
  assert.equal(await alive(g,3),true);assert.equal(await alive(g,1),false);assert.equal(s.announcement.kind,'bodyguard');assert.equal(s.summary,null);
 });
 await t.test('doctor saving attacked player prevents guard sacrifice',async()=>{
  const g=await make(['vampire','bodyguard','doctor']);await force(g);await act(g,0,'kill',3);await expire(g);await act(g,2,'protect',3);await expire(g);await ability(g,1,'guard',3);await expire(g);
  assert.equal(await alive(g,1),true);assert.equal(await alive(g,3),true);
 });
 await t.test('shaman silence excludes speech, blocks voice, preserves votes and permits host enforcement',async()=>{
  const g=await make(['vampire','shaman'],{turn_based:true,voice_enabled:true});await force(g);await act(g,0,'kill',6);await expire(g);await ability(g,1,'silence',2);await expire(g);let s=await expire(g);
  assert.equal(s.phase,'day');assert.equal(s.players[2].silenced,true);assert.ok(!s.speech.order.includes(g.players[2].id));
  const session=randomUUID();const voice=await rpc(g.users[2],'vk_voice_sync',[g.code,session,0,'[]',true,true]);assert.equal(voice.can_speak,false);
  await assert.rejects(()=>ability(g,3,'silence_breach',2));await ability(g,undefined,'silence_breach',2);assert.equal(await alive(g,2),false);
 });
 await t.test('dead hunter can use last shot; outsiders cannot; winner waits for revenge',async()=>{
  const g=await make(['vampire','hunter']);await force(g);await act(g,0,'kill',1);let s=await expire(g);assert.equal(s.phase,'hunter');assert.equal(s.winner,null);assert.equal((await state(g,1)).my_turn,true);
  await assert.rejects(()=>ability(g,2,'revenge',0));await ability(g,1,'revenge',0);s=await state(g);assert.equal(s.winner,'village');
 });
 await t.test('hunter timeout selects exactly one living target',async()=>{
  const g=await make(['vampire','hunter']);await force(g);await act(g,0,'kill',1);await expire(g);await expire(g);
  assert.equal((await q('select count(*)::int n from vk_private.players where room_id=$1 and not alive',[g.rid]))[0].n,2);
  const rows=await q("select * from vk_private.round_actions where room_id=$1 and kind='revenge'",[g.rid]);assert.equal(rows.length,1);assert.equal(rows[0].details.automatic,true);
 });
 await t.test('gunslinger shoots once and pays village hit at next day start',async()=>{
  const g=await make(['vampire','gunslinger']);await force(g,'day');await ability(g,1,'shoot',2);assert.equal(await alive(g,2),false);
  await assert.rejects(()=>ability(g,1,'shoot',3));await force(g,'night_result');await expire(g);assert.equal(await alive(g,1),false);
 });
 await t.test('shooting jester cannot grant jester victory or gunslinger guilt',async()=>{
  const g=await make(['vampire','gunslinger','jester']);await force(g,'day');await ability(g,1,'shoot',2);assert.equal((await state(g)).winner,null);await force(g,'night_result');await expire(g);assert.equal(await alive(g,1),true);
 });
 await t.test('mayor ballot weighs two and resolves an otherwise equal ballot',async()=>{
  const g=await make(['vampire','mayor'],{},6);const s=await votes(g,[3,2,3,2,2,3]);assert.equal(s.phase,'execution');assert.equal(await alive(g,2),false);
 });
 await t.test('mayor breaks first-place tie, cannot target outsiders, timeout falls back',async()=>{
  const g=await make(['vampire','mayor']);let s=await votes(g,[3,2,3,2,3,2,3]);assert.equal(s.phase,'mayor_decision');
  await assert.rejects(()=>ability(g,1,'decide',4));await assert.rejects(()=>ability(g,4,'decide',2));await ability(g,1,'decide',2);assert.equal(await alive(g,2),false);
  const h=await make(['vampire','mayor']);s=await votes(h,[3,2,3,2,3,2,3]);s=await expire(h);assert.equal(s.phase,'runoff');assert.equal(s.vote_candidates.length,2);
 });
 await t.test('cub inherits hunting after last adult dies, and prevents village victory',async()=>{
  const g=await make(['vampire','vampire_cub']);let s=await votes(g,[2,0,0,0,0,0,0]);assert.equal(s.phase,'execution');assert.equal(s.winner,null);
  await expire(g);s=await state(g,1);assert.equal(s.my_turn,true);assert.equal(s.me.can_hunt,true);await act(g,1,'kill',2);await expire(g);assert.equal(await alive(g,2),false);
 });
 await t.test('executed cub grants two distinct attacks for the next night only',async()=>{
  const g=await make(['vampire','vampire_cub']);await votes(g,[1,2,1,1,1,1,1]);await expire(g);await act(g,0,'kill',2);await expire(g);
  let s=await state(g,0);assert.equal(s.attack_number,2);await assert.rejects(()=>act(g,0,'kill',2),/farklı/);await act(g,0,'kill',3);s=await expire(g);
  assert.equal(s.phase,'night_result');assert.equal(await alive(g,2),false);assert.equal(await alive(g,3),false);
  assert.equal((await q('select bonus_attacks from vk_private.rooms where id=$1',[g.rid]))[0].bonus_attacks,0);
 });
 await t.test('ability helper and hidden role columns are inaccessible directly',async()=>{
  await db.exec('begin;set local role authenticated');
  try { await assert.rejects(()=>q('select * from vk_private.players')); } finally {await db.exec('rollback');}
  await db.exec('begin;set local role anon');
  try { await assert.rejects(()=>q("select public.vk_ability('ABCDEF',0,'shoot',null)")); } finally {await db.exec('rollback');}
 });
});
