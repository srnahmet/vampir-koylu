import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedHarness} from './helpers/shared-night.mjs';

const cast=['alpha_vampire','vampire','doctor','shaman','wizard','hunter','fanatic','villager','jester','gunslinger'];
const vampires=new Set(['vampire','alpha_vampire','vampire_cub']);

test('V2.1 Wizard fate matrix: 864 swaps, attacks and protection combinations',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast,{two_vampires:true});
 const others=[0,1,2,3,5,6,7,8,9];let scenarios=0;
 for(let ai=0;ai<others.length;ai++)for(const b of others.slice(ai+1))for(const target of [2,3,4,5,6,7,8,9])for(const protect of [null,target,(target+1)%10]){
  const a=others[ai],dest=i=>i===a?b:i===b?a:i;
  await h.q("update vk_private.players set alive=true,eliminated_by=null,self_heal_used=false,wizard_used=false,hunter_used=false,alpha_used=false,fanatic_won=false,fanatic_target=null,role_notices='[]' where room_id=$1",[g.rid]);
  for(const [i,role] of cast.entries())await h.q('update vk_private.players set role=$1 where id=$2',[role,g.players[i].id]);
  await h.night(g);await h.choose(g,0,'kill',[target]);await h.choose(g,4,'swap',[a,b]);
  if(protect!==null)await h.choose(g,2,'protect',[protect]);
  await h.deadline(g);const ps=await h.players(g);
  const dead=new Set();if(protect!==target)dead.add(dest(target));if(vampires.has(cast[a])||vampires.has(cast[b]))dead.add(4);
  for(const [i,p] of ps.entries()){
   assert.equal(p.alive,!dead.has(i),`a=${a},b=${b},attack=${target},protect=${protect},player=${i}`);
   assert.equal(p.role,cast[dest(i)]);
  }
  assert.equal(ps[4].wizard_used,true);assert.equal(ps[a].role_notices.length,1);assert.equal(ps[b].role_notices.length,1);
  assert.ok(!JSON.stringify(ps[a].role_notices).includes(g.players[4].id));scenarios++;
 }
 assert.equal(scenarios,864);
});

test('V2.1 Wizard moves role rights and committed actions; cannot reuse spell',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast);
 await h.q('update vk_private.players set shot_used=true where id=$1',[g.players[9].id]);
 await h.q('update vk_private.players set self_heal_used=true where id=$1',[g.players[2].id]);
 await h.night(g);await h.choose(g,4,'swap',[2,9]);await h.choose(g,2,'protect',[7]);await h.choose(g,0,'kill',[7]);
 await h.deadline(g);let ps=await h.players(g);assert.equal(ps[7].alive,true);
 assert.equal(ps[9].role,'doctor');assert.equal(ps[9].self_heal_used,true);assert.equal(ps[2].role,'gunslinger');assert.equal(ps[2].shot_used,true);
 const s=await h.state(g,9);assert.equal(s.me.role,'doctor');assert.equal(s.me.faction,'village');assert.equal(s.me.role_notices[0].kind,'wizard');
 await h.night(g);assert.equal((await h.state(g,4)).my_turn,false);await assert.rejects(()=>h.choose(g,4,'swap',[6,7]));
});

for(const saved of [false,true])test(`V2.1 Alpha conversion ${saved?'blocked by doctor':'cancels both vampire attacks and stays private'}`,async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast,{two_vampires:true});await h.night(g);
 await h.q('update vk_private.rooms set bonus_attacks=2 where id=$1',[g.rid]);
 await h.choose(g,0,'bite',[7]);await h.choose(g,1,'kill',[8,9]);if(saved)await h.choose(g,2,'protect',[7]);
 await h.deadline(g);const ps=await h.players(g);assert.ok(ps.every(p=>p.alive));assert.equal(ps[0].alpha_used,true);assert.equal(ps[7].role,saved?'villager':'vampire');assert.equal((await h.room(g)).bonus_attacks,0);
 const target=await h.state(g,7);assert.equal(target.me.role_notices.length,saved?0:1);
 if(!saved){assert.match(target.me.role_notices[0].text,/Alfa vampir/);assert.equal(target.me.faction,'vampire');assert.equal(target.me.can_hunt,true);}
 for(const i of [undefined,2,4,6,8]){const s=await h.state(g,i);assert.ok(s.players.every(p=>p.role===null));assert.equal(s.announcement.kind,'saved');assert.ok(!JSON.stringify(s.events).includes('dönüşt'));}
 await h.night(g);await assert.rejects(()=>h.choose(g,0,'bite',[9]));await h.choose(g,0,'kill',[9]);await h.deadline(g);assert.equal((await h.players(g))[9].alive,false);
});

test('V2.1 Alpha bite follows swapped role; Wizard curse still kills during a conversion night',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast);await h.night(g);
 await h.choose(g,0,'bite',[7]);await h.choose(g,4,'swap',[0,7]);await h.choose(g,2,'protect',[4]);
 await h.deadline(g);const ps=await h.players(g);assert.equal(ps[7].role,'alpha_vampire');assert.equal(ps[7].alpha_used,true);assert.equal(ps[0].role,'vampire');assert.equal(ps[4].alive,false);assert.equal(ps[4].eliminated_by,'magic');
 const town=await h.state(g,2);assert.equal(town.players[4].eliminated_by,'night');assert.ok(!JSON.stringify(town.events).includes('Büyücü'));
 const s=await h.state(g,0);assert.equal(s.me.role_notices.length,2);assert.equal(s.me.role_notices.at(-1).role,'vampire');
});

test('V2.1 converted night actor still completes old committed action, cub inherits Alpha hunting',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['alpha_vampire','vampire_cub','doctor','shaman','villager','villager','villager','villager']);
 await h.night(g);await h.choose(g,0,'bite',[3]);await h.choose(g,3,'silence',[7]);await h.deadline(g);
 let ps=await h.players(g);assert.equal(ps[3].role,'vampire');assert.equal(ps[7].muted_day,2);
 await h.q("update vk_private.players set alive=false where id=any($1::uuid[])",[[ps[0].id,ps[3].id]]);await h.night(g);
 assert.equal((await h.state(g,1)).my_turn,true);await h.choose(g,1,'kill',[7]);await h.deadline(g);assert.equal((await h.players(g))[7].alive,false);
});

for(const reason of ['village','vampire','hunter','gunslinger','guilt','silence','disconnected','kicked'])test(`V2.1 Fanatic objective death cause: ${reason}`,async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast);await h.q('update vk_private.players set fanatic_target=$1 where id=$2',[g.players[7].id,g.players[6].id]);
 await h.q("select vk_private.apply_death($1,$2,$3)",[g.rid,g.players[7].id,reason]);
 assert.equal((await h.players(g))[6].fanatic_won,reason==='village');
 await h.q("select vk_private.apply_death($1,$2,'vampire')",[g.rid,g.players[6].id]);
 await h.q("update vk_private.rooms set phase='finished',winner='vampire' where id=$1",[g.rid]);
 const s=await h.state(g,6);assert.equal(s.me.won,reason==='village');assert.equal(s.players[7].fanatic_target_mark,true);assert.equal(s.players[6].won,reason==='village');
});

test('V2.1 earned Fanatic win persists through death, conversion and role exchange',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(cast);await h.q('update vk_private.players set fanatic_target=$1 where id=$2',[g.players[8].id,g.players[6].id]);
 await h.q("select vk_private.apply_death($1,$2,'village')",[g.rid,g.players[8].id]);
 await h.night(g);await h.choose(g,0,'bite',[6]);await h.choose(g,4,'swap',[6,7]);await h.deadline(g);
 let ps=await h.players(g);assert.equal(ps[6].fanatic_won,true);assert.equal(ps[7].role,'vampire');assert.equal(ps[7].fanatic_won,false);
 await h.q("select vk_private.apply_death($1,$2,'vampire')",[g.rid,g.players[6].id]);await h.q("update vk_private.rooms set phase='finished',winner='jester' where id=$1",[g.rid]);
 const s=await h.state(g);assert.equal(s.players[6].won,true);assert.equal(s.players[7].won,false);assert.equal(s.players[8].won,true);assert.equal(s.players[8].fanatic_target_mark,true);
});

test('V2.1 Hunter last shot resolves before victory after shared night and conversion',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['alpha_vampire','doctor','wizard','hunter','villager','villager','villager','villager']);
 await h.night(g);await h.choose(g,0,'kill',[3]);const s=await h.deadline(g);assert.equal(s.phase,'hunter');assert.equal(s.winner,null);
 await h.action(g,3,'revenge',0);const end=await h.state(g);assert.equal(end.phase,'finished');assert.equal(end.winner,'village');assert.equal(end.players[3].won,true);
});
