import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedHarness} from './helpers/shared-night.mjs';

test('V2.1 exhaustive night permissions: 1,274 role × phase × action cases',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['villager','vampire','doctor','shaman','wizard','hunter','fanatic','villager']);
 const roles=['villager','vampire','alpha_vampire','vampire_cub','doctor','jester','mayor','bodyguard','hunter','shaman','gunslinger','wizard','fanatic'];
 const phases=['lobby','dealing','countdown','intro','day','runoff','voting','night','night_result','execution','nightfall','hunter','mayor_decision','finished'];
 const actions=['skip','kill','bite','protect','guard','silence','swap'];let count=0;
 for(const role of roles)for(const phase of phases)for(const action of actions){
  await h.q('update vk_private.players set role=$2,alive=true,self_heal_used=false,wizard_used=false,alpha_used=false where id=$1',[g.players[0].id,role]);
  await h.q("update vk_private.rooms set phase=$2,seq=100,night_step='all',night_base_ends_at=now()+interval '15 seconds',ends_at=now()+interval '25 seconds',winner=null,hunter_pending=null,hunter_resume=null where id=$1",[g.rid,phase]);
  await h.q('delete from vk_private.night_choices where room_id=$1',[g.rid]);
  const targets=action==='skip'?[]:action==='swap'?[3,7]:[3];
  const allowed=phase==='night' && (action==='skip'?['vampire','alpha_vampire','doctor','shaman','wizard','bodyguard'].includes(role):
   action==='kill'?['vampire','alpha_vampire'].includes(role):action==='bite'?role==='alpha_vampire':action==='protect'?role==='doctor':action==='guard'?role==='bodyguard':action==='silence'?role==='shaman':role==='wizard');
  const attempt=()=>h.choose(g,0,action,targets);const label=`${role}/${phase}/${action}`;
  if(allowed)await attempt();else await assert.rejects(attempt,label);
  count++;
 }
 assert.equal(count,1274);
 await h.db.exec('begin;set local role anon');
 try{await assert.rejects(()=>h.q("select public.vk_night_action('ABCDEF',0,'skip','{}')"));}finally{await h.db.exec('rollback');}
});

test('V2.1 rematch resets every private role flag, target, notice, choice token and tie streak',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['alpha_vampire','doctor','wizard','fanatic','villager','villager','villager','villager']);
 await h.night(g);await h.choose(g,0,'bite',[4]);await h.choose(g,2,'swap',[3,5]);await h.deadline(g);
 await h.q("update vk_private.players set fanatic_won=true,fanatic_won_target=$2,wizard_used=true,alpha_used=true where room_id=$1",[g.rid,g.players[6].id]);
 await h.q("update vk_private.rooms set phase='finished',winner='vampire',tie_streak=2 where id=$1",[g.rid]);
 const old=await h.room(g);await h.rpc(g.host,'vk_rematch',[g.code,old.seq]);const r=await h.room(g);
 assert.equal(r.rules_version,3);assert.equal(r.tie_streak,0);assert.equal(r.night_base_ends_at,null);assert.equal(r.round_number,old.round_number+1);
 for(const p of await h.players(g)){assert.equal(p.wizard_used,false);assert.equal(p.alpha_used,false);assert.equal(p.fanatic_won,false);assert.equal(p.fanatic_won_target,null);assert.equal(p.fanatic_target,null);assert.deepEqual(p.role_notices,[]);}
 for(const uid of g.users)await h.rpc(uid,'vk_ready',[g.code,r.seq,true]);await h.rpc(g.host,'vk_start',[g.code]);
 await h.expire(g);await h.expire(g);await h.expire(g);assert.equal((await h.state(g,0)).night_choice,null);
});
