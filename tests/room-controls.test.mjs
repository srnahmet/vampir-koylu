import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gameHarness} from './helpers/game-harness.mjs';

async function lobby(h,settings={},size=6){
 const g=await h.make(null,settings,size);await h.rpc(g.host,'vk_return_lobby',[g.code,(await h.room(g)).seq]);return g;
}
const spectate=async(h,g,caller,index,value)=>h.rpc(caller,'vk_set_spectator',[g.code,(await h.room(g)).seq,g.players[index].id,value]);
async function start(h,g){const r=await h.room(g);for(const p of await h.players(g))if(p.participating)await h.rpc(p.user_id,'vk_ready',[g.code,r.seq,true]);await h.rpc(g.host,'vk_start',[g.code]);}

test('Spectators opt in themselves or via host, never rejoin on heartbeat and do not count toward readiness/dealing',async t=>{
 const h=await gameHarness();t.after(()=>h.db.close());const g=await lobby(h);
 await spectate(h,g,g.users[5],5,true);await spectate(h,g,g.host,4,true);
 let s=await h.state(g,5);assert.equal(s.is_observer,true);assert.equal(s.me,null);assert.equal(s.member.spectator,true);assert.equal(s.players.length,4);assert.equal(s.spectators.length,2);
 for(let i=0;i<3;i++)await h.state(g,5);assert.equal((await h.players(g))[5].participating,false);
 await h.rpc(g.users[5],'vk_rename',[g.code,s.seq,'Seyirci']);assert.equal((await h.state(g,5)).member.name,'Seyirci');
 await assert.rejects(async()=>h.rpc(g.users[5],'vk_ready',[g.code,s.seq,true]));
 await start(h,g);s=await h.state(g,5);assert.equal(s.phase,'dealing');assert.equal(s.my_turn,false);assert.equal(s.players.length,4);assert.equal(s.spectators.length,2);assert.equal(s.me,null);
 await assert.rejects(()=>spectate(h,g,g.users[5],5,false));
 await h.force(g,'voting');await assert.rejects(()=>h.action(g,5,'vote',0));
 await h.force(g,'intro');await assert.rejects(()=>h.action(g,5,'early'));
 await h.force(g,'night','all');await assert.rejects(async()=>h.rpc(g.users[5],'vk_night_action',[g.code,(await h.room(g)).seq,'skip',[]]));
 assert.equal((await h.state(g,5)).can_vote,false);
});

test('Spectator controls enforce ownership, phase tokens, living-player minimum and reset ready consensus',async t=>{
 const h=await gameHarness();t.after(()=>h.db.close());const g=await lobby(h,{two_vampires:true});const r=await h.room(g);
 await h.rpc(g.users[0],'vk_ready',[g.code,r.seq,true]);
 await assert.rejects(()=>spectate(h,g,g.users[0],1,true));await assert.rejects(()=>spectate(h,g,randomUUID(),1,true));
 await assert.rejects(async()=>h.rpc(g.host,'vk_set_spectator',[g.code,r.seq-1,g.players[1].id,true]));
 await assert.rejects(async()=>h.rpc(g.host,'vk_set_spectator',[g.code,r.seq,randomUUID(),true]));
 await spectate(h,g,g.users[5],5,true);assert.ok((await h.players(g)).every(p=>!p.ready));
 await assert.rejects(()=>start(h,g),/en az 6/);await spectate(h,g,g.users[5],5,false);await start(h,g);
 const small=await lobby(h,{},4);await spectate(h,small,small.host,3,true);await assert.rejects(()=>start(h,small),/en az 4/);
});

test('Spectators cannot see roles, personal outcomes, private actions or recap even after the game ends',async t=>{
 const h=await gameHarness();t.after(()=>h.db.close());const g=await lobby(h);await spectate(h,g,g.host,5,true);await start(h,g);
 for(const phase of ['night','finished']){
  await h.q("update vk_private.rooms set phase=$2,night_step='all',ends_at=now()+interval '1 minute',night_base_ends_at=now()+interval '1 minute',winner='village' where id=$1",[g.rid,phase]);
  const s=await h.state(g,5);assert.equal(s.role_details_hidden,true);assert.equal(s.me,null);assert.equal(s.summary,null);assert.equal(s.vampire_team,null);assert.equal(s.night_choice,null);assert.equal(s.tally,null);
  assert.ok(s.players.every(p=>p.role===null&&p.won===null&&!p.fanatic_target_mark));
 }
 assert.ok((await h.state(g,0)).players.every(p=>p.role));
 await h.rpc(g.host,'vk_rematch',[g.code,(await h.room(g)).seq]);assert.equal((await h.state(g,5)).member.spectator,true);assert.equal((await h.players(g))[5].alive,false);
});

test('Host can stop every game phase, clear pending state and bring all members back with spectator choices preserved',async t=>{
 const h=await gameHarness();t.after(()=>h.db.close());const g=await lobby(h,{theme:'ocean',random_theme:true});await spectate(h,g,g.host,5,true);
 const ids=(await h.players(g)).map(p=>[p.id,p.name,p.number]);
 for(const phase of ['dealing','intro','night','voting','hunter','finished']){
  await h.q("update vk_private.rooms set phase=$2,seq=seq+1,hunter_pending=$3,hunter_resume='{}',tie_streak=1,speech_order=array[$3::uuid],speech_turn=1,speech_ends_at=now()+interval '30 seconds' where id=$1",[g.rid,phase,g.players[1].id]);
  await h.q("update vk_private.players set shot_used=true,self_heal_used=true,alpha_used=true,wizard_used=true,fanatic_won=true,role_notices='[{\"id\":\"old\"}]' where room_id=$1",[g.rid]);
  const before=await h.room(g);await assert.rejects(async()=>h.rpc(g.users[0],'vk_return_lobby',[g.code,before.seq]));
  await h.rpc(g.host,'vk_return_lobby',[g.code,before.seq]);const after=await h.room(g),ps=await h.players(g);
  assert.equal(after.phase,'lobby');assert.equal(after.seq,before.seq+1);assert.equal(after.round_number,before.round_number+1);assert.deepEqual(after.settings,before.settings);assert.equal(after.hunter_pending,null);assert.equal(after.hunter_resume,null);assert.equal(after.speech_ends_at,null);assert.equal(after.tie_streak,0);
  assert.deepEqual(ps.map(p=>[p.id,p.name,p.number]),ids);assert.ok(ps.every(p=>!p.ready&&!p.shot_used&&!p.self_heal_used&&!p.alpha_used&&!p.wizard_used&&!p.fanatic_won&&p.role_notices.length===0));assert.equal(ps[5].spectator,true);assert.equal(ps[5].participating,false);
  await h.rpc(g.host,'vk_return_lobby',[g.code,before.seq]);assert.equal((await h.room(g)).round_number,after.round_number);
  await assert.rejects(async()=>h.rpc(g.users[0],'vk_act',[g.code,before.seq,'early',null]));
 }
});

test('Closing is host-only and lobby-only; all members get the home-screen signal and the code cannot reopen',async t=>{
 const h=await gameHarness();t.after(()=>h.db.close());const g=await lobby(h);await spectate(h,g,g.host,5,true);let r=await h.room(g);
 await assert.rejects(async()=>h.rpc(g.users[0],'vk_close_room',[g.code,r.seq]));await assert.rejects(async()=>h.rpc(g.host,'vk_close_room',[g.code,r.seq-1]));
 await start(h,g);await assert.rejects(async()=>h.rpc(g.host,'vk_close_room',[g.code,(await h.room(g)).seq]));
 await h.rpc(g.host,'vk_return_lobby',[g.code,(await h.room(g)).seq]);r=await h.room(g);await h.rpc(g.host,'vk_close_room',[g.code,r.seq]);
 const closed=await h.room(g);assert.equal(closed.phase,'closed');assert.ok(closed.closed_at);
 for(const uid of [g.host,...g.users])await assert.rejects(async()=>h.rpc(uid,'vk_state',[g.code]),e=>e.code==='VK001'&&e.message==='Bu masa kapatıldı.');
 await assert.rejects(async()=>h.rpc(g.users[0],'vk_join',[g.code,'Yeni isim']),/kapatıldı/);await assert.rejects(async()=>h.rpc(randomUUID(),'vk_enter',[g.code,'Yabancı',null]),/kapatıldı/);
 await assert.rejects(async()=>h.rpc(g.host,'vk_start',[g.code]));await assert.rejects(async()=>h.rpc(g.host,'vk_rematch',[g.code,closed.seq]));await assert.rejects(async()=>h.rpc(g.host,'vk_transfer_host',[g.code,closed.host_revision,g.players[0].id]),/kapatıldı/);
 await h.rpc(g.host,'vk_close_room',[g.code,r.seq]);assert.deepEqual(await h.room(g),closed);
});

test('A spectator can manage the table but can never publish an active microphone',async t=>{
 const h=await gameHarness();t.after(()=>h.db.close());const g=await lobby(h,{turn_based:true,voice_enabled:true});await spectate(h,g,g.host,5,true);
 await h.rpc(g.host,'vk_transfer_host',[g.code,(await h.room(g)).host_revision,g.players[5].id]);assert.equal((await h.state(g,5)).is_host,true);await start({...h,rpc:(uid,fn,args)=>h.rpc(fn==='vk_start'?g.users[5]:uid,fn,args)},g);
 const s=await h.rpc(g.users[5],'vk_voice_sync',[g.code,randomUUID(),0,'[]',true,true]);assert.equal(s.can_speak,false);assert.ok(s.peers.every(p=>!p.mic_open));
});

test('Spectator migration preserves a running V2.1 night, and reapplying it is idempotent',async t=>{
 const h=await gameHarness({setupFile:new URL('./fixtures/setup-v21.sql',import.meta.url)});t.after(()=>h.db.close());const g=await h.make(['vampire','doctor','wizard','shaman','villager','villager','villager','villager']);
 await h.q("update vk_private.rooms set phase='night',night_step='all',seq=seq+1,night_base_ends_at=now()+interval '15 seconds',ends_at=now()+interval '25 seconds' where id=$1",[g.rid]);
 const r=await h.room(g);await h.rpc(g.users[0],'vk_night_action',[g.code,r.seq,'kill',[g.players[7].id]]);const before=await h.players(g),choices=await h.q('select * from vk_private.night_choices where room_id=$1',[g.rid]);
 const upgrade=await readFile(new URL('../supabase/spectators-room-controls.sql',import.meta.url),'utf8');await h.db.exec(upgrade);await h.db.exec(upgrade);
 for(const[k,v]of Object.entries(r))assert.deepEqual((await h.room(g))[k],v,k);
 for(const[i,p]of before.entries())for(const[k,v]of Object.entries(p))assert.deepEqual((await h.players(g))[i][k],v,k);
 assert.deepEqual(await h.q('select * from vk_private.night_choices where room_id=$1',[g.rid]),choices);assert.equal((await h.state(g,0)).night_choice.targets[0],g.players[7].id);
 await h.db.exec('begin;set local role anon');try{await assert.rejects(()=>h.q("select public.vk_close_room('ABCDEF',0)"));}finally{await h.db.exec('rollback');}
});
