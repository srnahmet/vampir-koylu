import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sharedHarness} from './helpers/shared-night.mjs';

const cast=['vampire','vampire','doctor','shaman','wizard','hunter','fanatic','villager','jester','villager'];

test('V2.1 all night roles act together; base time, grace, explicit pass, no automatic attack',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast,{two_vampires:true});
 await h.night(g);const seq=(await h.room(g)).seq;
 for(const i of [0,1,2,3,4])assert.equal((await h.state(g,i)).my_turn,true);
 for(const i of [5,6,7,8,9])assert.equal((await h.state(g,i)).my_turn,false);
 await h.choose(g,2,'protect',[7]);await h.choose(g,3,'silence',[8]);await h.choose(g,4,'skip');await h.choose(g,0,'skip');await h.choose(g,1,'skip');
 assert.equal((await h.state(g)).seq,seq);assert.equal((await h.base(g)).phase,'night_result');
 assert.ok((await h.players(g)).every(p=>p.alive));assert.equal((await h.players(g))[8].muted_day,2);
 await h.night(g);await h.choose(g,0,'kill',[7]);assert.equal((await h.base(g)).phase,'night');
 assert.equal((await h.deadline(g)).phase,'night_result');assert.equal((await h.players(g))[7].alive,false);
 await h.night(g);await h.deadline(g);assert.equal((await h.players(g)).filter(p=>!p.alive).length,1);
 for(let i=0;i<20;i++)await h.state(g);assert.equal((await h.players(g)).filter(p=>!p.alive).length,1);
});

test('V2.1 choices editable without spending self-save; stale, foreign, dead and invalid actions rejected',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast);const other=await h.make(cast);
 await h.night(g);const seq=(await h.room(g)).seq;
 await h.choose(g,2,'protect',[2]);assert.equal((await h.players(g))[2].self_heal_used,false);
 await h.choose(g,2,'protect',[7]);await h.choose(g,0,'kill',[7]);await h.choose(g,0,'kill',[9]);
 const state=await h.state(g,0);assert.equal(state.night_choice.targets[0],g.players[9].id);
 await assert.rejects(()=>h.choose(g,7,'kill',[0]));await assert.rejects(()=>h.choose(g,0,'kill',[1]));
 await assert.rejects(()=>h.choose(g,0,'kill',[other.players[7].id]));await assert.rejects(()=>h.choose(g,4,'swap',[2,2]));
 await assert.rejects(()=>h.choose(g,4,'swap',[4,7]));await assert.rejects(()=>h.choose(g,0,'bite',[7]));
 await assert.rejects(()=>h.choose(g,3,'silence',[3]));await assert.rejects(()=>h.choose(g,0,'skip',[7]));
 await assert.rejects(()=>h.choose(g,0,'kill',[null]));await assert.rejects(()=>h.choose(g,0,'kill',[7,8,9]));
 await assert.rejects(()=>h.rpc(randomUUID(),'vk_night_action',[g.code,seq,'skip',[]]));
 await h.deadline(g);assert.equal((await h.players(g))[9].alive,false);assert.equal((await h.players(g))[2].self_heal_used,false);
 await assert.rejects(()=>h.rpc(g.users[0],'vk_night_action',[g.code,seq,'kill',[g.players[7].id]]));
 await h.night(g);await h.choose(g,2,'protect',[2]);await h.deadline(g);assert.equal((await h.players(g))[2].self_heal_used,true);
 await h.night(g);await assert.rejects(()=>h.choose(g,2,'protect',[2]));
});

test('V2.1 disconnect invalidates a pending action without restarting or spending abilities',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast);await h.night(g);
 await h.choose(g,4,'swap',[7,9]);await h.choose(g,2,'protect',[2]);await h.disconnect(g,7);await h.disconnect(g,2);
 const before=await h.room(g);await h.state(g);const after=await h.room(g);assert.equal(after.seq,before.seq);assert.deepEqual(after.ends_at,before.ends_at);
 await h.deadline(g);const ps=await h.players(g);assert.equal(ps[4].wizard_used,false);assert.equal(ps[2].self_heal_used,false);assert.equal(ps[9].role,'villager');
});

test('V2.1 private selections and objectives never leak to town, observer or outsider',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast);
 await h.q('update vk_private.players set fanatic_target=$1 where id=$2',[g.players[7].id,g.players[6].id]);
 await h.night(g);await h.choose(g,0,'kill',[7]);await h.choose(g,4,'swap',[2,9]);
 for(const i of [undefined,2,3,4,6,7]){
  const s=await h.state(g,i);assert.ok(s.players.every(p=>p.role===null && p.won===null && !p.fanatic_target_mark));
  assert.equal(s.summary,null);assert.equal(s.vampire_team,null);assert.equal(s.vampire_decision,null);
  assert.ok(s.players.every(p=>!('fanatic_target'in p)&&!('role_notices'in p)));
 }
 assert.equal((await h.state(g,6)).me.fanatic_target,g.players[7].id);
 assert.equal((await h.state(g,1)).vampire_team.find(p=>p.id===g.players[0].id).target,g.players[7].id);
 await assert.rejects(()=>h.rpc(randomUUID(),'vk_state',[g.code]));
 await h.db.exec('set role authenticated');
 for(const sql of ['select * from vk_private.night_choices','select vk_private.resolve_shared_night(null)'])await assert.rejects(()=>h.q(sql));
 await h.db.exec('reset role');
});
