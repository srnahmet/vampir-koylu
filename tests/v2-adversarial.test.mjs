import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, optionalRoles } from './helpers/game-harness.mjs';

test('Adversarial V2 role interactions', async t => {
  const h = await gameHarness(); t.after(() => h.db.close());
  const { make, q, action, expire, state, force, room, players, disconnect } = h;
  await t.test('overflow starts with four players, preserves settings and hides the selected pool', async () => {
    const settings = Object.fromEntries(optionalRoles.map(k => [k, 'always']));
    const g = await make(null, settings, 4);
    const ps = await players(g), s = await state(g);
    assert.equal(ps.filter(p => p.role === 'vampire').length, 1);
    assert.equal(new Set(ps.map(p => p.role)).size, 4);
    assert.ok(s.players.every(p => p.role === null)); assert.equal(s.summary, null);
    for (const k of optionalRoles) assert.equal(s.settings[k], 'always');
    assert.ok(!('role_pool_overflow' in s));
    await force(g); const vamp = ps.find(p => p.role === 'vampire'), target = ps.find(p => !['vampire','vampire_cub'].includes(p.role));
    await action(g, g.users.indexOf(vamp.user_id), 'kill', target.id); await expire(g);
    assert.equal((await room(g)).night_step, 'doctor');
  });
  await t.test('double attack on guard and protected player is simultaneous in both orders', async () => {
    for (const targets of [[1,3], [3,1]]) {
      const g = await make(['vampire','bodyguard','doctor','villager','villager','villager','villager']);
      await force(g); await q('update vk_private.rooms set bonus_attacks=2 where id=$1', [g.rid]);
      await action(g,0,'kill',targets[0]); await expire(g);
      await action(g,0,'kill',targets[1]); await expire(g);
      await action(g,2,'protect',4); await expire(g); await action(g,1,'guard',3); await expire(g);
      const ps = await players(g); assert.equal(ps[1].alive,false); assert.equal(ps[3].alive,true, `target order ${targets}`);
      assert.equal(ps.filter(p => !p.alive).length,1);
    }
  });
  await t.test('hunter resolves if every living player disconnects during the last-shot screen', async () => {
    const g = await make(['vampire','hunter','villager','villager']);
    await force(g); await action(g,0,'kill',1); assert.equal((await expire(g)).phase,'hunter');
    for (const i of [0,2,3]) await disconnect(g,i);
    const s = await expire(g); assert.equal(s.phase,'finished'); assert.equal((await room(g)).hunter_pending,null);
  });
  await t.test('a village with only vampire-team survivors finishes immediately', async () => {
    const g = await make(['vampire','vampire','vampire_cub','villager','villager','villager'], { two_vampires:true });
    await force(g,'day');
    for (const i of [3,4,5]) await disconnect(g,i);
    const s = await state(g); assert.equal(s.phase,'finished'); assert.equal(s.winner,'vampire');
  });
  await t.test('two-vampire deadline resolves zero or one submitted choice without waiting forever', async () => {
    for(const submit of [false,true]) {
      const g=await make(['vampire','vampire','doctor','villager','villager','villager'],{two_vampires:true});
      await force(g);
      if(submit)await action(g,0,'kill',3);
      const before=await state(g,0);assert.equal(before.phase,'night');assert.equal(before.attack_number,1);
      await expire(g);const r=await room(g);assert.equal(r.night_step,'doctor');assert.ok(r.victim);
      if(submit)assert.equal(r.victim,g.players[3].id);
      assert.equal(r.vampire_decision.automatic,true);
      assert.ok(!g.players.slice(0,2).some(p=>p.id===r.victim));
      const publicState=await state(g);assert.equal(publicState.vampire_decision,null);
    }
  });
  await t.test('silence expires next day, blocks a shot and preserves the ballot', async () => {
    const g=await make(['vampire','shaman','gunslinger','hunter','villager','villager','villager']);
    await force(g,'day');await q('update vk_private.players set muted_day=1 where id=$1',[g.players[2].id]);
    await assert.rejects(()=>action(g,2,'shoot',4));
    await force(g,'voting');await action(g,2,'vote',0);
    await force(g,'night_result');await expire(g);assert.equal((await state(g,2)).me.silenced,false);
  });
  await t.test('kicking the hunter during a pending last shot still allows the timed fallback', async () => {
    const g=await make(['vampire','hunter','villager','villager','villager','villager']);
    await force(g);await action(g,0,'kill',1);assert.equal((await expire(g)).phase,'hunter');
    const r=await room(g);await h.rpc(g.host,'vk_kick',[g.code,r.seq,g.players[1].id]);
    await expire(g);assert.notEqual((await state(g)).phase,'hunter');
  });
  await t.test('stale ability tokens, repeated shots, foreign targets and outsider access are rejected', async () => {
    const g=await make(['vampire','gunslinger','hunter','villager','villager','villager']);
    const other=await make(['vampire','villager','villager','villager']);await force(g,'day');const r=await room(g);
    await assert.rejects(()=>action(g,1,'shoot',other.players[1].id));
    await assert.rejects(()=>action(g,1,'shoot',3,r.seq-1));
    await assert.rejects(()=>h.rpc(other.users[1],'vk_ability',[g.code,r.seq,'shoot',g.players[3].id]));
    await action(g,1,'shoot',3);await assert.rejects(()=>action(g,1,'shoot',4));
    assert.equal((await players(g)).filter(p=>!p.alive).length,1);
  });
  await t.test('second-attack target leaving restarts a valid night and cancels both old attacks', async () => {
    const g=await make(['vampire','doctor','villager','villager','villager','villager','villager']);
    await force(g);await q('update vk_private.rooms set bonus_attacks=2 where id=$1',[g.rid]);
    await action(g,0,'kill',2);await expire(g);await action(g,0,'kill',3);await expire(g);
    await disconnect(g,3);await state(g);const r=await room(g);
    assert.equal(r.night_step,'vampire');assert.equal(r.victim,null);assert.equal(r.extra_victim,null);
    const actions=await q("select status from vk_private.round_actions where room_id=$1 and kind='kill'",[g.rid]);
    assert.ok(actions.every(a=>a.status==='cancelled'));
  });
  await t.test('a departed guard loses its pending shield and the recap marks it cancelled', async () => {
    const g=await make(['vampire','doctor','bodyguard','shaman','villager','villager','villager','villager']);
    await force(g);await action(g,0,'kill',7);await expire(g);await action(g,1,'protect',6);await expire(g);
    await action(g,2,'guard',7);await expire(g);await disconnect(g,2);await state(g);
    assert.equal((await room(g)).guard_target,null);
    await action(g,3,'silence',4);await expire(g);assert.equal((await players(g))[7].alive,false);
    assert.equal((await q("select status from vk_private.round_actions where room_id=$1 and kind='guard'",[g.rid]))[0].status,'cancelled');
  });
  await t.test('a shaman killed in the same resolution still applies the precommitted silence', async () => {
    const g=await make(['vampire','shaman','villager','villager','villager','villager']);
    await force(g);await action(g,0,'kill',1);await expire(g);await action(g,1,'silence',2);await expire(g);await expire(g);
    const ps=await players(g);assert.equal(ps[1].alive,false);assert.equal((await state(g,2)).me.silenced,true);
  });
  await t.test('a cancelled self-save is refunded once, not on every subsequent poll',async()=>{
    const g=await make(['vampire','doctor','villager','villager','villager','villager','villager','villager']);
    await force(g);await action(g,0,'kill',5);await expire(g);await action(g,1,'protect',1);
    await disconnect(g,5);await state(g);assert.equal((await state(g,1)).me.self_heal_used,false);
    await action(g,0,'kill',6);await expire(g);await action(g,1,'protect',1);
    for(let i=0;i<3;i++)assert.equal((await state(g,1)).me.self_heal_used,true);
    await force(g,'night','doctor');await assert.rejects(()=>action(g,1,'protect',1),/koruma hakkını kullandın/);
  });
  await t.test('the lottery helper cannot expose drawn roles through authenticated SQL access',async()=>{
    await h.db.exec('begin;set local role authenticated');
    try{await assert.rejects(()=>q("select vk_private.draw_roles('{}'::jsonb,3)"),/permission denied/);}finally{await h.db.exec('rollback');}
  });
  await t.test('all role-specific flags and overflow sampling reset correctly across rematches',async()=>{
    const settings=Object.fromEntries(optionalRoles.map(k=>[k,'always']));
    const g=await make(null,{...settings,random_theme:true},4);const before=(await state(g)).settings.theme;
    await q("update vk_private.players set shot_used=true,self_heal_used=true,hunter_used=true,guilt_day=2,muted_day=1 where room_id=$1",[g.rid]);
    await q("update vk_private.rooms set phase='finished',winner='village',bonus_attacks=2,extra_victim=$2,hunter_pending=$2 where id=$1",[g.rid,g.players[0].id]);
    await h.rpc(g.host,'vk_rematch',[g.code,(await room(g)).seq]);
    let s=await state(g);assert.equal(s.phase,'lobby');assert.notEqual(s.settings.theme,before);assert.equal(s.summary,null);
    for(const p of await players(g)){assert.equal(p.shot_used,false);assert.equal(p.self_heal_used,false);assert.equal(p.hunter_used,false);assert.equal(p.guilt_day,null);assert.equal(p.muted_day,null);}
    const r=await room(g);assert.equal(r.bonus_attacks,0);assert.equal(r.extra_victim,null);assert.equal(r.hunter_pending,null);
    for(const uid of g.users)await h.rpc(uid,'vk_ready',[g.code,s.seq,true]);await h.rpc(g.host,'vk_start',[g.code]);
    s=await state(g);assert.equal(s.phase,'dealing');assert.equal(s.round_number,2);assert.equal(s.summary,null);
  });
  await t.test('repeated first-place ties remain actionable with increasing tokens and restricted candidates',async()=>{
    const g=await make(['vampire','villager','villager','villager','villager','villager']);
    await force(g,'voting');let previous=(await room(g)).seq;
    for(let i=0;i<12;i++) {
      // Exactly three ballots for each finalist, with no self-votes.
      for(const [voter,target] of [1,0,0,1,0,1].entries())await action(g,voter,'vote',target);
      let s=await expire(g);assert.equal(s.phase,'runoff');assert.deepEqual(new Set(s.vote_candidates),new Set(g.players.slice(0,2).map(p=>p.id)));
      assert.ok(s.seq>previous);previous=s.seq;
      s=await expire(g);assert.equal(s.phase,'voting');assert.ok(s.seq>previous);previous=s.seq;
      assert.equal(s.votes_cast,0);assert.equal(s.votes_required,6);
    }
  });
});
