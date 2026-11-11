import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sharedHarness} from './helpers/shared-night.mjs';
const optionalRoles=['doctor','jester','mayor','hunter','shaman','gunslinger','vampire_cub','wizard','alpha_vampire','fanatic'];

function random(seed) {
  let x=seed>>>0;
  return () => { x=(Math.imul(x,1664525)+1013904223)>>>0; return x/4294967296; };
}

test('V2.1 seeded full games converge with simultaneous actions, role changes and conversion', async t => {
  const h=await sharedHarness();t.after(()=>h.db.close());
  const phases=new Set(), abilities=new Set();let transitions=0,maxSteps=0,departures=0;
  for(let seed=1;seed<=84;seed++) {
    const rng=random(seed*7919), n=4+(seed-1)%21, two=n>=6 && seed%2===0;
    const pick=xs=>xs[Math.floor(rng()*xs.length)];
    const settings={two_vampires:two,turn_based:seed%3===0,voice_enabled:seed%3===0,
      ...Object.fromEntries(optionalRoles.map(k=>[k,pick(['always','always','random','never'])]))};
    await h.q('select setseed($1)',[seed/100-0.5]);
    const g=await h.make(null,settings,n);
    let oldSeq=-1, oldLiving=n, finished=false;
    let debugRoom;
    const context=()=>`seed=${seed}, n=${n}, two=${two}, room=${JSON.stringify(debugRoom)}`;
    const doAction=async(p,kind,target)=>{abilities.add(kind);await h.action(g,g.users.indexOf(p.user_id),kind,target.id);};
    for(let step=0;step<600;step++) {
      maxSteps=Math.max(maxSteps,step+1);
      await h.q('update vk_private.players set last_seen=now() where room_id=$1 and alive',[g.rid]);
      let s=await h.state(g), ps=await h.players(g), living=ps.filter(p=>p.alive);
      // Deterministic connection failures after dealing, including active actors,
      // finalists, and future speakers. Reconcile before the next heartbeat.
      if(step>2 && living.length>4 && rng()<0.075 && s.phase!=='finished') {
        const departed=pick(living);await h.disconnect(g,g.users.indexOf(departed.user_id));departures++;
        s=await h.state(g);ps=await h.players(g);living=ps.filter(p=>p.alive);
      }
      const r=await h.room(g); debugRoom=r; phases.add(s.phase);transitions++;
      assert.ok(s.seq>=oldSeq,await context());oldSeq=s.seq;
      assert.ok(living.length<=oldLiving,await context());oldLiving=living.length;
      if(s.phase==='finished') {
        const predators=living.filter(p=>['vampire','alpha_vampire','vampire_cub'].includes(p.role));
        assert.ok(['vampire','village','jester'].includes(s.winner),await context());
        if(s.winner==='village')assert.equal(predators.length,0,await context());
        if(s.winner==='vampire')assert.ok(predators.length>0,await context());
        if(s.winner==='jester')assert.ok(ps.some(p=>p.role==='jester' && !p.alive && p.eliminated_by==='village'),await context());
        finished=true;break;
      }
      assert.equal(s.summary,null,await context());assert.equal(s.me,null,await context());assert.equal(s.vampire_team,null,await context());
      assert.ok(s.players.every(p=>p.role===null),await context());
      if(['dealing','countdown','execution','night_result','nightfall'].includes(s.phase)) {await h.expire(g);continue;}
      if(['intro','day','runoff'].includes(s.phase)) {
        const gun=living.find(p=>p.role==='gunslinger' && !p.shot_used && p.muted_day!==r.day);
        if(gun && rng()<0.6) {await doAction(gun,'shoot',pick(living.filter(p=>p.id!==gun.id)));continue;}
        // Speakers all voluntarily finish before the free discussion deadline.
        if(s.speech && !s.speech.group) {
          const speaker=ps.find(p=>p.id===s.speech.speaker_id);
          assert.ok(speaker?.alive && speaker.muted_day!==r.day,await context());
          await h.rpc(speaker.user_id,'vk_speak',[g.code,s.seq,s.speech.turn_index]);continue;
        }
        await h.expire(g);continue;
      }
      if(s.phase==='voting') {
        const candidates=s.vote_candidates.length?living.filter(p=>s.vote_candidates.includes(p.id)):living;
        assert.ok(candidates.length>0,await context());const target=pick(candidates);
        for(const p of living) {
          const choices=candidates.filter(x=>x.id!==p.id);if(!choices.length)continue;
          const voted=(await h.q('select target from vk_private.votes where room_id=$1 and seq=$2 and voter=$3',[g.rid,s.seq,p.id])).length;
          if(!voted)await doAction(p,'vote',target.id!==p.id?target:pick(choices));
        }
        await h.expire(g);continue;
      }
      if(s.phase==='hunter') {
        const hunter=ps.find(p=>p.id===r.hunter_pending);assert.ok(hunter && !hunter.alive,await context());
        if(rng()<0.25 || hunter.kicked)await h.expire(g);else await doAction(hunter,'revenge',pick(living));
        continue;
      }
      if(s.phase==='mayor_decision') {
        const mayor=living.find(p=>p.role==='mayor');
        if(!mayor || rng()<0.25)await h.expire(g);else await doAction(mayor,'decide',pick(living.filter(p=>s.vote_candidates.includes(p.id))));
        continue;
      }
      if(s.phase==='night') {
        assert.equal(r.night_step,'all',context());
        for(const p of living) {
          const own=await h.state(g,g.users.indexOf(p.user_id));
          if(!own.my_turn)continue;
          let kind=own.night_action, targets=[];
          const valid=living.filter(q=>q.id!==p.id || (kind==='protect' && !p.self_heal_used));
          if(kind==='kill') {
            const prey=valid.filter(q=>!['vampire','alpha_vampire','vampire_cub'].includes(q.role));
            if(p.role==='alpha_vampire' && !p.alpha_used && rng()<0.6)kind='bite';
            const first=pick(prey);targets=[first.id];
            if(kind==='kill' && own.attack_number===2 && prey.length>1)targets.push(pick(prey.filter(q=>q.id!==first.id)).id);
          } else if(kind==='swap') {
            const first=pick(valid);targets=[first.id,pick(valid.filter(q=>q.id!==first.id)).id];
          } else targets=[pick(valid).id];
          if(rng()<0.1){kind='skip';targets=[];}
          abilities.add(kind);await h.choose(g,g.users.indexOf(p.user_id),kind,targets);
        }
        await h.deadline(g);continue;
      }
      assert.fail(`Unknown phase ${s.phase}; ${await context()}`);
    }
    assert.ok(finished,`Game did not converge: ${await context()}`);
  }
  for(const phase of ['dealing','countdown','intro','night','night_result','day','voting','execution','hunter','finished'])assert.ok(phases.has(phase),phase);
  for(const ability of ['kill','protect','silence','shoot','revenge','vote','swap','bite','skip'])assert.ok(abilities.has(ability),ability);
  t.diagnostic(`84 V2.1 complete games, sizes 4–24, ${transitions} observed states, ${departures} disconnects, longest game ${maxSteps} driver steps; all converged within 600`);
});
