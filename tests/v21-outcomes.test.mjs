import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedHarness} from './helpers/shared-night.mjs';

test('V2.1 every faction has correct personal final outcome, including dead team members',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());
 const cast=['vampire','alpha_vampire','vampire_cub','doctor','wizard','hunter','fanatic','jester','villager','mayor','shaman','gunslinger','bodyguard'];
 const g=await h.make(cast);await h.q('update vk_private.players set alive=false where room_id=$1',[g.rid]);
 for(const winner of ['vampire','village','jester'])for(const earned of [false,true]){
  await h.q("update vk_private.rooms set phase='finished',winner=$2 where id=$1",[g.rid,winner]);
  await h.q('update vk_private.players set fanatic_won=$2 where id=$1',[g.players[6].id,earned]);
  const s=await h.state(g);
  for(const [i,p] of s.players.entries()){
   const expected=i===6?earned:i===7?winner==='jester':winner===(i<3?'vampire':'village');
   assert.equal(p.won,expected,`${cast[i]}/${winner}/${earned}`);
   assert.equal((await h.state(g,i)).me.won,expected);
  }
 }
});

test('V2.1 dead Fanatic can still earn a later execution; inherited self-target is reassigned privately',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['vampire','wizard','fanatic','doctor','villager','villager','villager','villager']);
 await h.q('update vk_private.players set fanatic_target=$1 where id=$2',[g.players[4].id,g.players[2].id]);
 await h.night(g);await h.choose(g,1,'swap',[2,4]);await h.deadline(g);
 let ps=await h.players(g);assert.equal(ps[4].role,'fanatic');assert.notEqual(ps[4].fanatic_target,ps[4].id);
 const target=ps[4].fanatic_target;await h.q("select vk_private.apply_death($1,$2,'vampire')",[g.rid,ps[4].id]);
 await h.q("select vk_private.apply_death($1,$2,'village')",[g.rid,target]);ps=await h.players(g);assert.equal(ps[4].fanatic_won,true);assert.equal(ps[4].alive,false);
});

test('V2.1 night grace validates, current RPC routes legacy clients safely and choices cannot be null',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['vampire','doctor','shaman','wizard','villager','villager','villager','villager']);
 for(const grace of [0,4,6,11,100])await assert.rejects(()=>h.rpc(g.host,'vk_create',['',JSON.stringify({night_grace_seconds:grace,host_plays:false})]));
 await h.night(g);await h.action(g,0,'kill',7);await h.action(g,1,'protect',7);await h.action(g,2,'silence',6);
 const r=await h.room(g);await assert.rejects(()=>h.rpc(g.users[0],'vk_night_action',[g.code,r.seq,'kill',null]));
 await h.deadline(g);const ps=await h.players(g);assert.equal(ps[7].alive,true);assert.equal(ps[6].muted_day,2);
 const actions=await h.q("select * from vk_private.round_actions where room_id=$1 and kind='protect'",[g.rid]);assert.equal(actions[0].details.outcome,'saved');
});
