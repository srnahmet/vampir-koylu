import {gameHarness} from './game-harness.mjs';

export async function sharedHarness() {
 const h=await gameHarness();
 const night=async g=>{
  await h.q("update vk_private.rooms set phase='night',night_step='all',seq=seq+1,started_at=now(),night_base_ends_at=now()+interval '15 seconds',ends_at=now()+interval '25 seconds',vote_candidates='{}',victim=null,extra_victim=null,protected=null,hunter_pending=null,hunter_resume=null where id=$1",[g.rid]);
  return h.state(g);
 };
 const choose=async(g,i,kind,targets=[])=>h.rpc(g.users[i],'vk_night_action',[g.code,(await h.room(g)).seq,kind,targets.map(t=>typeof t==='number'?g.players[t].id:t)]);
 const base=async g=>{await h.q("update vk_private.rooms set night_base_ends_at=now()-interval '1 second' where id=$1",[g.rid]);return h.state(g);};
 const deadline=async g=>{await h.q("update vk_private.rooms set night_base_ends_at=now()-interval '11 seconds',ends_at=now()-interval '1 second' where id=$1",[g.rid]);return h.state(g);};
 return {...h,night,choose,base,deadline};
}
