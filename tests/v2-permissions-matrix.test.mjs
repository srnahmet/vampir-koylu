// Archived V2 contract: sequential nights remain supported for rounds already running at migration.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gameHarness} from './helpers/game-harness.mjs';

test('Every role/action/phase permission is checked through the authenticated RPC boundary',async t=>{
  const h=await gameHarness({legacy:true});t.after(()=>h.db.close());
  const {q,db}=h;
  const roles=['villager','vampire','doctor','jester','mayor','bodyguard','hunter','shaman','gunslinger','vampire_cub'];
  const phases=['lobby','dealing','countdown','intro','day','runoff','voting','night','night_result','execution','hunter','mayor_decision','finished'];
  const actions=['early','vote','kill','protect','guard','silence','shoot','revenge','decide'];
  const g=await h.make(['villager','vampire','doctor','bodyguard','hunter','shaman','gunslinger','jester','vampire_cub','mayor']);
  let cases=0;
  for(const role of roles)for(const phase of phases)for(const action of actions) {
    const isHunter=phase==='hunter' && role==='hunter';
    const step=({protect:'doctor',guard:'bodyguard',silence:'shaman'})[action]||'vampire';
    await q('update vk_private.players set role=$2,alive=$3,shot_used=false,muted_day=null where id=$1',[g.players[0].id,role,!isHunter]);
    await q(`update vk_private.rooms set phase=$2,night_step=$3,seq=100,ends_at=now()+interval '1 minute',victim=null,extra_victim=null,
      protected=null,guard_target=null,silence_target=null,hunter_pending=$4,hunter_resume=jsonb_build_object('phase','day','remaining',60,'paused_at',now()),
      vote_candidates=array[$5::uuid] where id=$1`,[g.rid,phase,step,phase==='hunter'?(isHunter?g.players[0].id:g.players[4].id):null,g.players[2].id]);
    const expected=(action==='early' && ['intro','day','runoff'].includes(phase)) ||
      (action==='vote' && phase==='voting') ||
      (action==='kill' && phase==='night' && role==='vampire') ||
      (action==='protect' && phase==='night' && role==='doctor') ||
      (action==='guard' && phase==='night' && role==='bodyguard') ||
      (action==='silence' && phase==='night' && role==='shaman') ||
      (action==='shoot' && ['intro','day','runoff'].includes(phase) && role==='gunslinger') ||
      (action==='revenge' && isHunter) || (action==='decide' && phase==='mayor_decision' && role==='mayor');
    await q("select set_config('request.jwt.claim.sub',$1,false)",[g.users[0]]);
    await db.exec('begin;set local role authenticated');
    let succeeded=false,error;
    try {
      const fn=['early','vote','kill','protect'].includes(action)?'vk_act':'vk_ability';
      await q(`select public.${fn}($1,$2,$3,$4)`,[g.code,100,action,g.players[2].id]);succeeded=true;
    } catch(e){error=e;} finally {await db.exec('rollback');}
    const label=`${role}/${phase}/${action}`;
    assert.equal(succeeded,expected,`${label}: ${error?.message}`);
    if(error)assert.equal(error.code,'P0001',label);
    cases++;
  }
  assert.equal(cases,1170);t.diagnostic(`${cases} authenticated permission cases; no unexpected database error codes`);
});
