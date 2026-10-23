import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Readiness, rematch, recovery, room PIN and host removal", async t => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  const setup = await readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8");
  await db.exec(setup);
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  async function api(uid, fn, args = []) {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid || ""]);
    return (await q(`select public.${fn}(${args.map((_, i) => `$${i+1}`).join(",")}) result`, args))[0].result;
  }
  async function make(n = 5, settings = {}, pin = null) {
    const host = randomUUID(), users = Array.from({length:n}, () => randomUUID());
    const code = await api(host,"vk_create",["",JSON.stringify({host_plays:false,...settings}),pin]);
    for (let i=0; i<n; i++) assert.equal((await api(users[i],"vk_enter",[code,`Oyuncu ${i+1}`,pin])).code,code);
    const rid = (await q("select id from vk_private.rooms where code=$1",[code]))[0].id;
    const players = await q("select * from vk_private.players where room_id=$1 order by number",[rid]);
    return {host,users,code,rid,players};
  }
  const state = (g,uid=g.host) => api(uid,"vk_state",[g.code]);
  async function start(g) {
    const s=await state(g);
    for (const uid of g.users) await api(uid,"vk_ready",[g.code,s.seq,true]);
    await api(g.host,"vk_start",[g.code]);
    // Deterministic roles for targeted recovery scenarios; all are legitimate participants.
    await q("update vk_private.players set role=case when number=1 then 'vampire' when number=2 then 'doctor' when number=3 then 'jester' else 'villager' end where room_id=$1",[g.rid]);
  }
  async function phase(g,p,extra="") {
    await q(`update vk_private.rooms set phase=$2,seq=seq+1,ends_at=now()+interval '1 hour' ${extra} where id=$1`,[g.rid,p]);
    return state(g);
  }
  const expire = g => q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);
  const age = (g,i,seconds=61) => q("update vk_private.players set last_seen=now()-make_interval(secs=>$2::int) where id=$1",[g.players[i].id,seconds]);
  const act = (g,i,s,action,target=null) => api(g.users[i],"vk_act",[g.code,s.seq,action,target]);
  const kick = (g,i,seq) => api(g.host,"vk_kick",[g.code,seq,g.players[i].id]);

  await t.test("readiness is individual, reversible, live and required; observer host is excluded",async()=>{
    const g=await make(4);
    let s=await state(g);
    assert.equal(s.me,null); assert.equal(s.round_number,1);
    assert.ok(s.players.every(p=>p.ready===false && p.role===null));
    await assert.rejects(()=>api(g.host,"vk_start",[g.code]),/bütün oyuncular/);
    await assert.rejects(()=>api(g.host,"vk_ready",[g.code,0,true]),/yalnızca/);
    await assert.rejects(()=>api(randomUUID(),"vk_ready",[g.code,0,true]),/yalnızca/);
    await api(g.users[0],"vk_ready",[g.code,0,true]);
    s=await state(g); assert.deepEqual(s.players.map(p=>p.ready),[true,false,false,false]);
    await api(g.users[0],"vk_ready",[g.code,0,false]);
    assert.equal((await state(g)).players[0].ready,false);
    for (const uid of g.users) await api(uid,"vk_ready",[g.code,0,true]);
    await age(g,3,25);
    await assert.rejects(()=>api(g.host,"vk_start",[g.code]),/bağlı/);
    await state(g,g.users[3]);
    await api(g.host,"vk_start",[g.code]);
    await assert.rejects(()=>api(g.users[0],"vk_ready",[g.code,0,true]),/yeni aşamaya/);
    assert.equal((await state(g)).phase,"dealing");
  });
  await t.test("new arrivals must ready; null and stale phase tokens cannot change readiness",async()=>{
    const g=await make(3);
    await assert.rejects(()=>api(g.host,"vk_start",[g.code]),/en az 4/);
    await assert.rejects(()=>api(g.users[0],"vk_ready",[g.code,null,true]),/aşamaya/);
    await assert.rejects(()=>api(g.users[0],"vk_ready",[g.code,0,null]),/belirt/);
    for (const uid of g.users) await api(uid,"vk_ready",[g.code,0,true]);
    await api(randomUUID(),"vk_enter",[g.code,"Yeni",null]);
    await assert.rejects(()=>api(g.host,"vk_start",[g.code]),/bütün oyuncular/);
  });
  await t.test("actual completed game rematches in the same room without quota; privacy, tokens and state reset",async()=>{
    const g=await make(4,{doctor:"always",jester:"always",turn_based:true,voice_enabled:true,pin_enabled:true},"0427");
    await start(g); let s=await phase(g,"voting");
    for (let i=0;i<4;i++) await act(g,i,s,"vote",g.players[i===0?1:0].id);
    await expire(g); s=await state(g); assert.equal(s.winner,"village");
    const oldSeq=s.seq, oldRoom=(await q("select * from vk_private.rooms where id=$1",[g.rid]))[0];
    const allowance=(await api(g.host,"vk_quota")).used;
    await q("update vk_private.players set self_heal_used=true where room_id=$1",[g.rid]);
    await q("insert into vk_private.voice_peers(room_id,user_id,session_id) values($1,$2,$3)",[g.rid,g.host,randomUUID()]);
    await assert.rejects(()=>api(g.users[0],"vk_rematch",[g.code,oldSeq]),/yalnızca/);
    await api(g.host,"vk_rematch",[g.code,oldSeq]);
    s=await state(g,g.users[0]);
    assert.equal(s.phase,"lobby"); assert.equal(s.round_number,2); assert.equal(s.seq,oldSeq+1);
    assert.equal(s.me.role,null); assert.equal(s.me.self_heal_used,false); assert.equal(s.me.eliminated_by,null);
    assert.ok(s.players.every(p=>p.alive && !p.ready && p.role===null));
    assert.deepEqual(s.players.map(p=>[p.id,p.number]),g.players.map(p=>[p.id,p.number]));
    assert.equal(s.announcement,null); assert.deepEqual(s.events,[]); assert.equal(s.speech,null);
    assert.equal((await api(g.host,"vk_quota")).used,allowance);
    const newRoom=(await q("select * from vk_private.rooms where id=$1",[g.rid]))[0];
    for (const key of ["id","code","created_at","host_id","pin_hash"]) assert.deepEqual(newRoom[key],oldRoom[key]);
    assert.deepEqual(newRoom.settings,oldRoom.settings);
    assert.equal((await q("select count(*)::int n from vk_private.voice_peers where room_id=$1",[g.rid]))[0].n,0);
    await api(g.users[0],"vk_ready",[g.code,s.seq,true]);
    await api(g.host,"vk_rematch",[g.code,oldSeq]);
    assert.equal((await state(g,g.users[0])).me.ready,true);
    await assert.rejects(()=>act(g,0,{seq:oldSeq},"early"),/aşamaya/);
    for (const uid of g.users) await api(uid,"vk_ready",[g.code,s.seq,true]);
    await api(g.host,"vk_start",[g.code]);
    const next=await state(g,g.users[0]);
    assert.equal(next.phase,"dealing"); assert.ok(next.me.role); assert.ok(next.players.every(p=>p.role===null));
    assert.equal(next.my_vote,null); assert.equal(next.votes_cast,0); assert.equal(next.early_count,0);
  });
  await t.test("recovery before timeout preserves identity and role; late heartbeat does not resurrect",async()=>{
    const g=await make(5,{disconnect_seconds:90}); await start(g); await phase(g,"day");
    await age(g,3,45); let s=await state(g);
    const offline=s.players.find(p=>p.id===g.players[3].id);
    assert.equal(offline.online,false); assert.equal(offline.alive,true); assert.ok(offline.disconnect_ends_at);
    s=await state(g,g.users[3]); assert.equal(s.me.alive,true); assert.equal(s.me.id,g.players[3].id); assert.equal(s.me.role,"villager");
    await age(g,3,91); s=await state(g,g.users[3]);
    assert.equal(s.me.alive,false); assert.equal(s.me.eliminated_by,"disconnected"); assert.equal(s.phase,"day");
    await state(g,g.users[3]); assert.equal((await state(g,g.users[3])).me.alive,false);
    await assert.rejects(()=>act(g,3,s,"early"),/yaşayan/);
    assert.ok(s.players.every(p=>p.role===null));
  });
  await t.test("default 60s lobby timeout frees a seat and readiness; returning after start is a spectator",async()=>{
    const g=await make(5);
    assert.equal((await state(g)).settings.disconnect_seconds,60);
    await api(g.users[4],"vk_ready",[g.code,0,true]); await age(g,4);
    assert.equal((await state(g)).players.length,4);
    for (const uid of g.users.slice(0,4)) await api(uid,"vk_ready",[g.code,0,true]);
    await api(g.host,"vk_start",[g.code]);
    let s=await state(g,g.users[4]); assert.equal(s.is_observer,true); assert.equal(s.me,null);
    assert.equal(s.players.length,4); assert.ok(s.players.every(p=>p.role===null));
    await assert.rejects(()=>act(g,4,s,"early"),/yaşayan/);
    const h=await make(4); await age(h,3); await state(h);
    s=await state(h,h.users[3]); assert.equal(s.players.length,4); assert.equal(s.me.ready,false); assert.equal(s.me.number,4);
  });
  await t.test("vampire disconnect ends for village; jester disconnect never wins; day 3 and night 3 apply rules",async()=>{
    const g=await make(4); await start(g); await phase(g,"day"); await age(g,0);
    assert.equal((await state(g)).winner,"village");
    const h=await make(4); await start(h); await phase(h,"day"); await age(h,2);
    let s=await state(h); assert.equal(s.winner,null); assert.equal(s.phase,"day");
    assert.equal(s.players.find(p=>p.number===3).eliminated_by,"disconnected");
    s=await phase(h,"night",",night_step='vampire',victim=null"); assert.equal(s.winner,"vampire");
    const k=await make(4); await start(k); await phase(k,"day"); await age(k,2); await age(k,3);
    assert.equal((await state(k)).winner,"vampire");
  });
  await t.test("departed voters and targets release invalid ballots; majority uses remaining living players",async()=>{
    const g=await make(6); await start(g); let s=await phase(g,"voting");
    await act(g,0,s,"vote",g.players[5].id); await act(g,5,s,"vote",g.players[4].id);
    await age(g,5); s=await state(g,g.users[0]);
    assert.equal(s.my_vote,null); assert.equal(s.tally,null); assert.equal(s.votes_cast,0);
    for(let i=0;i<5;i++) await act(g,i,s,"vote",g.players[i===2?0:2].id);
    await expire(g); assert.equal((await state(g)).winner,"jester");
    const h=await make(6); await start(h); s=await phase(h,"day");
    await act(h,0,s,"early"); await act(h,1,s,"early"); await act(h,2,s,"early");
    assert.equal((await state(h)).phase,"day"); await age(h,5);
    assert.equal((await state(h)).phase,"voting");
  });
  await t.test("night recovery skips departed doctor and releases a departed victim; dead speaker is skipped",async()=>{
    const g=await make(6,{doctor:"always"}); await start(g); let s=await phase(g,"night",",night_step='vampire',victim=null,protected=null");
    await act(g,0,s,"kill",g.players[4].id); await expire(g); s=await state(g);
    await age(g,1); await expire(g); s=await state(g);
    assert.equal(s.phase,"night_result"); assert.equal(s.players.find(p=>p.number===5).eliminated_by,"vampire");
    const h=await make(6); await start(h); s=await phase(h,"night",",night_step='vampire',victim=null,protected=null");
    await act(h,0,s,"kill",h.players[5].id); await age(h,5); s=await state(h,h.users[0]);
    assert.equal(s.my_turn,true); assert.equal(s.has_chosen,false);
    await act(h,0,s,"kill",h.players[4].id);
    const k=await make(5,{turn_based:true}); await start(k);
    await q("update vk_private.rooms set phase='day',speech_order=$2::uuid[],speech_turn=0,speech_slot_ms=10000,speech_ends_at=now()+interval '1 hour' where id=$1",[k.rid,k.players.map(p=>p.id)]);
    await age(k,0); // vampire leaves: first verify win takes priority over speech.
    assert.equal((await state(k)).winner,"village");
    const j=await make(5,{turn_based:true}); await start(j);
    await q("update vk_private.rooms set phase='day',speech_order=$2::uuid[],speech_turn=0,speech_slot_ms=10000,speech_ends_at=now()+interval '1 hour' where id=$1",[j.rid,[j.players[3].id,...j.players.slice(0,3).map(p=>p.id),j.players[4].id]]);
    await age(j,3); s=await state(j); assert.equal(s.speech.turn_index,1); assert.equal(s.speech.speaker_id,j.players[0].id);
  });
  await t.test("only host can kick, cannot kick self or another room; removal persists across rematch",async()=>{
    const g=await make(5), h=await make(4); let s=await state(g);
    await assert.rejects(()=>api(g.users[0],"vk_kick",[g.code,s.seq,g.players[1].id]),/yalnızca/);
    await assert.rejects(()=>api(g.host,"vk_kick",[g.code,s.seq,h.players[0].id]),/masada değil/);
    const host=await api(randomUUID(),"vk_create",["Host"]);
    const owner=(await q("select host_id from vk_private.rooms where code=$1",[host]))[0].host_id;
    const own=await api(owner,"vk_state",[host]);
    await assert.rejects(()=>api(owner,"vk_kick",[host,0,own.me.id]),/Kendini/);
    await kick(g,4,s.seq); await kick(g,4,s.seq); assert.equal((await state(g)).players.length,4);
    for (const fn of [()=>state(g,g.users[4]),()=>api(g.users[4],"vk_enter",[g.code,"Geri",null]),()=>api(g.users[4],"vk_join",[g.code,"Geri"]),()=>api(g.users[4],"vk_ready",[g.code,s.seq,true]),()=>api(g.users[4],"vk_voice_sync",[g.code,randomUUID()])]) await assert.rejects(fn,e=>e.code==="VK001");
    g.users=g.users.slice(0,4); await start(g); s=await phase(g,"day"); await kick(g,0,s.seq);
    s=await state(g); assert.equal(s.winner,"village");
    await api(g.host,"vk_rematch",[g.code,s.seq]); s=await state(g);
    assert.equal(s.players.length,3); assert.ok(s.players.every(p=>p.number!==1 && p.number!==5));
    await assert.rejects(()=>state(g,g.users[0]),e=>e.code==="VK001");
  });
  await t.test("cancelled night target returns an unresolved doctor's self-save and restarts the minimum clock",async()=>{
    const g=await make(6,{doctor:"always"}); await start(g);
    let s=await phase(g,"night",",night_step='vampire',victim=null,protected=null");
    await act(g,0,s,"kill",g.players[5].id); await expire(g); s=await state(g,g.users[1]);
    await act(g,1,s,"protect",g.players[1].id);
    assert.equal((await state(g,g.users[1])).me.self_heal_used,true);
    await age(g,5); s=await state(g,g.users[1]);
    assert.equal(s.me.self_heal_used,false);
    assert.equal(Date.parse(s.ends_at)-Date.parse(s.started_at),15000);
    await act(g,0,s,"kill",g.players[4].id); await expire(g); s=await state(g,g.users[1]);
    await act(g,1,s,"protect",g.players[1].id);
    assert.equal((await state(g,g.users[1])).me.self_heal_used,true);
  });
  await t.test("kicking jester is not execution and a living target's removal frees its votes",async()=>{
    const g=await make(5); await start(g); let s=await phase(g,"voting");
    await act(g,0,s,"vote",g.players[2].id); await kick(g,2,s.seq);
    s=await state(g,g.users[0]); assert.equal(s.my_vote,null); assert.equal(s.winner,null);
    assert.equal(s.players.find(p=>p.number===3).eliminated_by,"kicked");
  });
  await t.test("PIN is optional, exactly four digits, salted and never exposed in game state",async()=>{
    for(const pin of [null,"123","12345","abcd"]) await assert.rejects(()=>make(0,{pin_enabled:true},pin),/4 rakam/);
    const g=await make(1,{pin_enabled:true},"0123"), h=await make(1,{pin_enabled:true},"0123");
    const hashes=await q("select pin_hash from vk_private.rooms where id in ($1,$2)",[g.rid,h.rid]);
    assert.equal(hashes[0].pin_hash.length,64); assert.notEqual(hashes[0].pin_hash,hashes[1].pin_hash);
    assert.ok(!JSON.stringify(await state(g)).includes("pin_hash"));
    const uid=randomUUID();
    await assert.rejects(()=>api(uid,"vk_join",[g.code,"Yeni"]),/şifreli/);
    assert.ok((await api(uid,"vk_enter",[g.code,"Yeni","1111"])).error);
    await assert.rejects(()=>state(g,uid),/katıl/);
    assert.equal((await api(uid,"vk_enter",[g.code,"Yeni","0123"])).code,g.code);
    assert.equal((await api(uid,"vk_enter",[g.code,"Yeni",null])).code,g.code);
    const plain=await make(0); assert.equal((await api(uid,"vk_enter",[plain.code,"Yeni",null])).code,plain.code);
  });
  await t.test("five failed guesses persist and lock for five minutes, scoped by room and identity",async()=>{
    const g=await make(0,{pin_enabled:true},"8888"), uid=randomUUID();
    for(let i=0;i<5;i++) assert.ok((await api(uid,"vk_enter",[g.code,"Yeni","0000"])).error);
    assert.match((await api(uid,"vk_enter",[g.code,"Yeni","8888"])).error,/5 dakika/);
    assert.equal((await q("select failures from vk_private.join_attempts where room_id=$1 and user_id=$2",[g.rid,uid]))[0].failures,5);
    assert.equal((await api(randomUUID(),"vk_enter",[g.code,"Diğer","8888"])).code,g.code);
    const h=await make(0,{pin_enabled:true},"8888"); assert.equal((await api(uid,"vk_enter",[h.code,"Diğer","8888"])).code,h.code);
    await q("update vk_private.join_attempts set locked_until=now()-interval '1 second',window_start=now()-interval '6 minutes' where room_id=$1 and user_id=$2",[g.rid,uid]);
    assert.equal((await api(uid,"vk_enter",[g.code,"Yeni","8888"])).code,g.code);
  });
  await t.test("migration preserves existing room and bans; new RPCs require auth, private data inaccessible",async()=>{
    const g=await make(4); const before=await state(g); await db.exec(setup);
    assert.deepEqual((await state(g)).players,before.players);
    for(const secs of [29,601]) await assert.rejects(()=>make(0,{disconnect_seconds:secs}),/aralıkta/);
    for(const [fn,args] of [["vk_enter",[g.code,"X",null]],["vk_create",["X","{}",null]],["vk_kick",[g.code,0,g.players[0].id]],["vk_ready",[g.code,0,true]],["vk_rematch",[g.code,0]]]) await assert.rejects(()=>api(null,fn,args),/giriş/);
    await db.exec("set role authenticated");
    await assert.rejects(()=>q("select * from vk_private.join_attempts"),/permission denied/);
    await assert.rejects(()=>q("select vk_private.create_room('X','{}',null)"),/permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(()=>q("select public.vk_enter('ABC123','X',null)"),/permission denied/);
    await db.exec("reset role");
  });
  await db.close();
});
