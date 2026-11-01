import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const setup = await readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/host-summary-runoff.sql", import.meta.url), "utf8");
const legacy = await readFile(new URL("./fixtures/setup-v4.sql", import.meta.url), "utf8");

async function harness(sql = setup) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await db.exec(sql);
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  async function api(uid, fn, args = []) {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid || ""]);
    // Real production ACLs apply even in tests; exceptions roll back exactly as RPCs do.
    await db.exec("begin; set local role authenticated");
    try {
      const result = (await q(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(",")}) result`, args))[0].result;
      await db.exec("commit");
      return result;
    } catch (e) { await db.exec("rollback"); throw e; }
  }
  async function make(n = 7, observer = true, settings = {}) {
    const host = randomUUID();
    const users = observer ? Array.from({length:n},randomUUID) : [host,...Array.from({length:n-1},randomUUID)];
    const code = await api(host,"vk_create",[observer ? "" : "Ada",JSON.stringify({host_plays:!observer,doctor:"always",jester:"always",...settings}),settings.pin_enabled ? "0123" : null]);
    for (let i=observer?0:1;i<n;i++) await api(users[i],"vk_enter",[code,["Ada","Bora","Cem","Deniz","Ece","Fırat","Gül","Hale"][i] || `Oyuncu ${i+1}`,settings.pin_enabled?"0123":null]);
    const r = (await q("select * from vk_private.rooms where code=$1",[code]))[0];
    const players = await q("select * from vk_private.players where room_id=$1 order by number",[r.id]);
    return {host,users,code,rid:r.id,players};
  }
  const state = (g,uid=g.host)=>api(uid,"vk_state",[g.code]);
  async function start(g) {
    const s=await state(g);
    for(const uid of g.users) await api(uid,"vk_ready",[g.code,s.seq,true]);
    await api(g.host,"vk_start",[g.code]);
    await q("update vk_private.players set role=case when number=1 then 'vampire' when number=2 then 'doctor' when number=3 then 'jester' else 'villager' end where room_id=$1",[g.rid]);
  }
  const phase=async(g,p,extra="")=>{
    await q(`update vk_private.rooms set phase=$2,seq=seq+1,ends_at=now()+interval '1 hour' ${extra} where id=$1`,[g.rid,p]);
    return state(g);
  };
  const expire=g=>q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);
  const act=(g,i,s,kind,target)=>api(g.users[i],"vk_act",[g.code,s.seq,kind,target]);
  async function ballot(g,targets,s=undefined) {
    s ||= await state(g);
    for(let i=0;i<targets.length;i++) if(targets[i]!==null) await act(g,i,s,"vote",g.players[targets[i]].id);
    return state(g);
  }
  async function tie(g,targets=[1,2,0,0,1,2,3]) {
    const s=await phase(g,"voting"); await ballot(g,targets,s); await expire(g);
    const next=await state(g); assert.equal(next.phase,"runoff"); return next;
  }
  const transfer=(g,uid,target,revision)=>api(uid,"vk_transfer_host",[g.code,revision,g.players[target].id]);
  return {db,q,api,make,state,start,phase,expire,act,ballot,tie,transfer};
}

test("Host handover, hidden recap and finalist-only voting", async t => {
  const h=await harness(); const {db,q,api,make,state,start,phase,expire,act,ballot,tie,transfer}=h;
  t.after(()=>db.close());

  await t.test("three tied leaders only; every living player votes, outsiders and self-votes rejected",async()=>{
    const g=await make(); await start(g); let s=await tie(g);
    assert.deepEqual(new Set(s.vote_candidates),new Set(g.players.slice(0,3).map(p=>p.id)));
    assert.equal(s.players.filter(p=>p.alive).length,7);
    await expire(g); s=await state(g); assert.equal(s.phase,"voting"); assert.equal(s.votes_required,7);
    await assert.rejects(()=>act(g,3,s,"vote",g.players[4].id),/birincilikte eşit/);
    await assert.rejects(()=>act(g,0,s,"vote",g.players[0].id),/Kendine/);
    await assert.rejects(()=>act(g,3,{seq:s.seq-1},"vote",g.players[0].id),/aşamaya/);
    assert.equal((await state(g,g.users[3])).summary,null);
    assert.equal((await state(g,g.users[3])).tally,null);
    await ballot(g,[1,0,0,0,0,0,0],s);
    assert.equal((await state(g)).phase,"voting","all votes still wait for minimum time");
    await expire(g); s=await state(g); assert.equal(s.phase,"finished"); assert.equal(s.winner,"village");
  });
  await t.test("a second tie narrows three finalists to two; excluded candidates cannot return",async()=>{
    const g=await make(); await start(g); await tie(g); await expire(g); let s=await state(g);
    await ballot(g,[1,0,0,0,1,1,2],s); // 3–3–1
    await expire(g); s=await state(g); assert.equal(s.phase,"runoff");
    assert.deepEqual(new Set(s.vote_candidates),new Set(g.players.slice(0,2).map(p=>p.id)));
    await expire(g); s=await state(g);
    await assert.rejects(()=>act(g,3,s,"vote",g.players[2].id),/birincilikte eşit/);
    assert.equal(s.votes_cast,0); assert.equal(s.my_vote,null); assert.equal(s.votes_required,7);
  });
  await t.test("repeat voting waits for the last voter even after its minimum; a finalist may win as Soytarı",async()=>{
    const g=await make(); await start(g); await tie(g); await expire(g); let s=await state(g);
    await ballot(g,[2,2,0,2,2,2,null],s); await expire(g);
    assert.equal((await state(g)).phase,"voting");
    await act(g,6,s,"vote",g.players[2].id);
    s=await state(g); assert.equal(s.winner,"jester"); assert.equal(s.phase,"finished");
    assert.equal(s.summary.actions.filter(a=>a.kind==="vote_result").length,2);
    assert.ok(s.summary.actions.some(a=>a.kind==="vote_result" && a.status==="execution" && a.target===g.players[2].id));
  });
  await t.test("a non-vampire finalist's execution clears restrictions before the next day",async()=>{
    const g=await make(); await start(g);
    await q("update vk_private.players set role='villager' where id=$1",[g.players[2].id]);
    await tie(g); await expire(g); let s=await state(g);
    await ballot(g,[1,0,1,1,1,1,1],s); await expire(g); s=await state(g);
    assert.equal(s.phase,"execution"); assert.deepEqual(s.vote_candidates,[]);
    await expire(g); s=await state(g); assert.equal(s.phase,"night"); assert.deepEqual(s.vote_candidates,[]);
  });
  await t.test("early-runoff transition still uses living majority and keeps the restricted candidates",async()=>{
    const g=await make(); await start(g); let s=await tie(g);
    for(let i=0;i<3;i++) await act(g,i,s,"early",null);
    assert.equal((await state(g)).phase,"runoff");
    await act(g,3,s,"early",null); s=await state(g); assert.equal(s.phase,"voting"); assert.equal(s.vote_candidates.length,3);
  });
  await t.test("two-way repeated tie retains both candidates",async()=>{
    const g=await make(6); await start(g); await tie(g,[1,0,0,1,2,2]); await expire(g);
    let s=await state(g); await ballot(g,[1,0,0,1,0,1],s); await expire(g); s=await state(g);
    assert.equal(s.phase,"runoff"); assert.equal(s.vote_candidates.length,2);
    await expire(g); s=await state(g); await ballot(g,[1,0,0,1,0,1],s); await expire(g);
    assert.equal((await state(g)).phase,"runoff");
  });
  await t.test("departing finalists are removed; with one left, only that player is excused, no deadlock",async()=>{
    const g=await make(7); await start(g); let s=await tie(g);
    await api(g.host,"vk_kick",[g.code,s.seq,g.players[1].id]);
    s=await state(g); assert.equal(s.vote_candidates.length,2);
    await api(g.host,"vk_kick",[g.code,s.seq,g.players[2].id]);
    s=await state(g); assert.deepEqual(s.vote_candidates,[g.players[0].id]);
    await expire(g); s=await state(g); assert.equal(s.phase,"voting"); assert.equal(s.votes_required,4);
    assert.equal((await state(g,g.users[0])).can_vote,false);
    for(let i=3;i<7;i++) await act(g,i,s,"vote",g.players[0].id);
    assert.equal((await state(g)).phase,"voting"); await expire(g);
    s=await state(g); assert.equal(s.winner,"village");
  });
  await t.test("losing all finalists reopens living targets; invalidated ballots may be recast",async()=>{
    const g=await make(8); await start(g);
    await q("update vk_private.players set role=case when number=8 then 'vampire' else 'villager' end where room_id=$1",[g.rid]);
    await tie(g,[1,0,0,1,2,2,3,4]); await expire(g); let s=await state(g);
    await act(g,3,s,"vote",g.players[0].id);
    for(let i=0;i<3;i++) await api(g.host,"vk_kick",[g.code,s.seq,g.players[i].id]);
    s=await state(g,g.users[3]); assert.deepEqual(s.vote_candidates,[]); assert.equal(s.my_vote,null);
    await act(g,3,s,"vote",g.players[4].id);
    assert.equal((await state(g,g.users[3])).my_vote,g.players[4].id);
  });
  await t.test("disconnecting finalist obeys normal win rules, never gives Soytarı a win",async()=>{
    for(const index of [0,2]){
      const g=await make(); await start(g); await tie(g);
      await q("update vk_private.players set last_seen=now()-interval '61 seconds' where id=$1",[g.players[index].id]);
      const s=await state(g); assert.notEqual(s.winner,"jester");
      if(index===0) assert.equal(s.winner,"village"); else assert.equal(s.vote_candidates.length,2);
    }
  });
  await t.test("manual observer handover keeps observer access and privacy, host player's identity and readiness",async()=>{
    const g=await make(4,true,{pin_enabled:true}); let s=await state(g);
    await api(g.users[1],"vk_ready",[g.code,s.seq,true]);
    const before=await state(g,g.users[1]);
    await transfer(g,g.host,1,s.host.revision);
    const after=await state(g,g.users[1]); assert.equal(after.is_host,true); assert.deepEqual(after.me,before.me); assert.equal(after.seq,before.seq);
    const old=await state(g); assert.equal(old.is_host,false); assert.equal(old.is_observer,true); assert.equal(old.me,null); assert.equal(old.summary,null);
    assert.equal((await api(g.host,"vk_enter",[g.code,"",null])).code,g.code);
    await assert.rejects(()=>api(g.host,"vk_start",[g.code]),/yalnızca masa sahibi/);
    const voice=await api(g.host,"vk_voice_sync",[g.code,randomUUID(),0,"[]",false,true]); assert.equal(voice.can_speak,false);
  });
  await t.test("playing host handover preserves role, ballots, timers, speech, night targets and phase sequence",async()=>{
    const g=await make(7,false,{turn_based:true}); await start(g); const s=await phase(g,"night",",night_step='vampire',victim=null,protected=null");
    await act(g,0,s,"kill",g.players[4].id);
    const before=(await q("select * from vk_private.rooms where id=$1",[g.rid]))[0];
    await transfer(g,g.host,1,s.host.revision);
    const after=(await q("select * from vk_private.rooms where id=$1",[g.rid]))[0];
    for(const k of ["phase","seq","day","started_at","ends_at","victim","protected","speech_order","speech_turn","settings","creator_id"]) assert.deepEqual(after[k],before[k]);
    const old=await state(g); assert.equal(old.me.role,"vampire"); assert.equal(old.is_observer,false); assert.equal(old.is_host,false); assert.equal(old.has_chosen,true);
    assert.equal((await state(g,g.users[1])).is_host,true);
  });
  await t.test("only current host may transfer; same-room, online target and revision required",async()=>{
    const g=await make(), other=await make(); const s=await state(g);
    await assert.rejects(()=>transfer(g,g.users[0],1,s.host.revision),/yalnızca masa sahibi/);
    await assert.rejects(()=>api(null,"vk_transfer_host",[g.code,0,g.players[0].id]),/giriş/);
    await assert.rejects(()=>api(g.host,"vk_transfer_host",[g.code,null,g.players[0].id]),/yönetimi değişti/);
    await assert.rejects(()=>api(g.host,"vk_transfer_host",[g.code,0,other.players[0].id]),/bağlı olan/);
    await q("update vk_private.players set last_seen=now()-interval '21 seconds' where id=$1",[g.players[1].id]);
    await assert.rejects(()=>transfer(g,g.host,1,0),/bağlı olan/);
    await transfer(g,g.host,0,0);
    await assert.rejects(()=>transfer(g,g.host,2,0),/yalnızca masa sahibi/);
    await assert.rejects(()=>transfer(g,g.users[0],2,0),/yönetimi değişti/);
    await assert.rejects(()=>transfer(g,g.users[0],0,1),/Zaten masa/);
    assert.equal((await state(g,g.users[0])).host.revision,1);
    await assert.rejects(()=>api(g.host,"vk_kick",[g.code,s.seq,g.players[3].id]),/yalnızca masa sahibi/);
    await assert.rejects(()=>api(g.host,"vk_rematch",[g.code,s.seq]),/yalnızca masa sahibi/);
  });
  await t.test("creator quota stays with original creator across repeated transfers",async()=>{
    const g=await make(); const initial=(await api(g.host,"vk_quota")).used;
    await transfer(g,g.host,0,0); await transfer(g,g.users[0],1,1);
    assert.equal((await api(g.host,"vk_quota")).used,initial);
    for(const uid of g.users.slice(0,2)) assert.equal((await api(uid,"vk_quota")).used,0);
    for(let i=1;i<10;i++) await api(g.host,"vk_create",["","{\"host_plays\":false}",null]);
    await assert.rejects(()=>api(g.host,"vk_create",["","{\"host_plays\":false}",null]),/10 masa/);
  });
  await t.test("observer host waits configured grace; automatic heir stable; returning old host cannot reclaim",async()=>{
    const g=await make(5,true,{disconnect_seconds:90}); await start(g); await phase(g,"day");
    await q("update vk_private.rooms set host_seen_at=now()-interval '89 seconds' where id=$1",[g.rid]);
    assert.equal((await state(g,g.users[2])).is_host,false);
    await q("update vk_private.rooms set host_seen_at=now()-interval '91 seconds' where id=$1",[g.rid]);
    const s=await state(g,g.users[2]); assert.equal(s.host.player_id,g.players[0].id); assert.equal(s.host.revision,1);
    const old=await state(g); assert.equal(old.is_host,false); assert.equal(old.me,null);
    assert.equal((await state(g,g.users[0])).is_host,true); assert.equal((await state(g,g.users[1])).host.revision,1);
  });
  await t.test("playing host disconnect eliminates by normal rules while leadership still transfers",async()=>{
    const g=await make(5,false); await start(g); await phase(g,"day");
    await q("update vk_private.rooms set host_seen_at=now()-interval '61 seconds' where id=$1",[g.rid]);
    await q("update vk_private.players set last_seen=now()-interval '61 seconds' where id=$1",[g.players[0].id]);
    const s=await state(g,g.users[1]); assert.equal(s.is_host,true); assert.equal(s.winner,"village");
    assert.equal(s.players[0].eliminated_by,"disconnected");
    await api(g.users[1],"vk_rematch",[g.code,s.seq]);
    assert.equal((await state(g,g.users[1])).phase,"lobby");
  });
  await t.test("finished games can elect a host, skip banned/offline players and let eliminated players manage",async()=>{
    const g=await make(5); await start(g); await phase(g,"finished",",winner='village'");
    await q("update vk_private.players set kicked=true,alive=false where id=$1",[g.players[0].id]);
    await q("update vk_private.players set last_seen=now()-interval '30 seconds' where id=$1",[g.players[1].id]);
    await q("update vk_private.players set alive=false where id=$1",[g.players[2].id]);
    await q("update vk_private.rooms set host_seen_at=now()-interval '61 seconds' where id=$1",[g.rid]);
    const s=await state(g,g.users[3]); assert.equal(s.is_host,true);
    await transfer(g,g.users[3],2,s.host.revision);
    const deadHost=await state(g,g.users[2]); assert.equal(deadHost.is_host,true); assert.equal(deadHost.me.alive,false);
    await api(g.users[2],"vk_rematch",[g.code,deadHost.seq]);
    assert.equal((await state(g,g.users[2])).me.alive,true);
  });
  await t.test("no connected successor waits without fabricating membership; first returning player can inherit",async()=>{
    const g=await make();
    await q("update vk_private.players set last_seen=now()-interval '61 seconds' where room_id=$1",[g.rid]);
    await q("update vk_private.rooms set host_seen_at=now()-interval '61 seconds' where id=$1",[g.rid]);
    await q("select vk_private.maintain_host($1)",[g.rid]);
    assert.equal((await q("select host_id from vk_private.rooms where id=$1",[g.rid]))[0].host_id,g.host);
    const s=await state(g,g.users[4]); assert.equal(s.is_host,true); assert.equal(s.me.alive,true);
  });
  await t.test("summary hidden from every role and observer until finish; exact night targets, protection and votes shown afterwards",async()=>{
    const g=await make(6); await start(g); let s=await phase(g,"night",",night_step='vampire',victim=null,protected=null");
    await act(g,0,s,"kill",g.players[4].id); await expire(g); s=await state(g);
    await act(g,1,s,"protect",g.players[4].id); await expire(g); s=await state(g); assert.equal(s.announcement.kind,"saved");
    for(const uid of [g.host,...g.users]) { const view=await state(g,uid); assert.equal(view.summary,null); assert.ok(view.players.every(p=>p.role===null)); }
    s=await phase(g,"voting"); await ballot(g,[1,0,0,0,0,0],s); await expire(g); s=await state(g);
    assert.equal(s.phase,"finished"); assert.equal(s.summary.complete,true);
    const actions=s.summary.actions; assert.equal(actions.length,9);
    assert.deepEqual(actions.filter(a=>a.kind==="kill").map(a=>[a.actor,a.target,a.details.outcome]),[[g.players[0].id,g.players[4].id,"saved"]]);
    assert.deepEqual(actions.filter(a=>a.kind==="protect").map(a=>[a.actor,a.target,a.details.outcome]),[[g.players[1].id,g.players[4].id,"saved"]]);
    assert.equal(actions.filter(a=>a.kind==="vote" && a.status==="counted").length,6);
    for(const uid of g.users) assert.deepEqual((await state(g,uid)).summary,s.summary);
    assert.ok(!JSON.stringify(s).includes("user_id")); assert.ok(!JSON.stringify(s).includes("pin_hash"));
    await assert.rejects(()=>state(g,randomUUID()),/katıl/);
  });
  await t.test("wrong protection and night death recorded correctly; unfinished night marked pending",async()=>{
    const g=await make(); await start(g); let s=await phase(g,"night",",night_step='vampire',victim=null,protected=null");
    await act(g,0,s,"kill",g.players[4].id); await expire(g); s=await state(g);
    await act(g,1,s,"protect",g.players[5].id); await expire(g); await state(g);
    s=await phase(g,"finished",",winner='vampire'");
    assert.equal(s.summary.actions.find(a=>a.kind==="kill").details.outcome,"killed");
    assert.equal(s.summary.actions.find(a=>a.kind==="protect").details.outcome,"missed");
    const h=await make(); await start(h); let z=await phase(h,"night",",night_step='vampire',victim=null,protected=null");
    await act(h,0,z,"kill",h.players[4].id); z=await phase(h,"finished",",winner='village'");
    assert.equal(z.summary.actions[0].status,"pending");
  });
  await t.test("invalidated ballots and cancelled nights stay labelled; rejected actions never enter recap",async()=>{
    const g=await make(); await start(g); let s=await phase(g,"night",",night_step='vampire',victim=null,protected=null");
    await act(g,0,s,"kill",g.players[4].id); await expire(g); s=await state(g);
    await act(g,1,s,"protect",g.players[1].id);
    await api(g.host,"vk_kick",[g.code,s.seq,g.players[4].id]);
    s=await phase(g,"voting"); await act(g,3,s,"vote",g.players[5].id);
    await assert.rejects(()=>act(g,3,s,"vote",g.players[0].id),/değiştirilemez/);
    await api(g.host,"vk_kick",[g.code,s.seq,g.players[5].id]);
    s=await phase(g,"finished",",winner='village'");
    assert.equal(s.summary.actions.length,3); assert.ok(s.summary.actions.every(a=>a.status==="cancelled"));
  });
  await t.test("rematch clears public summary, isolates rounds and keeps the new host and former observer",async()=>{
    const g=await make(5); await start(g); let s=await phase(g,"voting");
    await ballot(g,[1,0,0,0,0],s); await expire(g); s=await state(g); const old=s.summary;
    await transfer(g,g.host,1,s.host.revision); await api(g.users[1],"vk_rematch",[g.code,s.seq]);
    let next=await state(g); assert.equal(next.summary,null); assert.equal(next.me,null); assert.equal(next.is_host,false); assert.deepEqual(next.vote_candidates,[]);
    const seq=next.seq; for(const uid of g.users) await api(uid,"vk_ready",[g.code,seq,true]);
    await api(g.users[1],"vk_start",[g.code]);
    next=await phase(g,"finished",",winner='village'"); assert.deepEqual(next.summary.actions,[]); assert.equal(next.summary.complete,true);
    assert.ok(old.actions.length>0); assert.equal(next.round_number,2);
  });
  await t.test("banned players cannot inherit hosting; the new owner can start and kick",async()=>{
    const g=await make(5); let s=await state(g);
    await api(g.host,"vk_kick",[g.code,s.seq,g.players[4].id]);
    await assert.rejects(()=>transfer(g,g.host,4,0),/bağlı olan/);
    await transfer(g,g.host,1,0);
    for(const uid of g.users.slice(0,4)) await api(uid,"vk_ready",[g.code,s.seq,true]);
    await api(g.users[1],"vk_start",[g.code]);
    s=await state(g,g.users[1]); assert.equal(s.phase,"dealing"); assert.equal(s.is_host,true);
    await api(g.users[1],"vk_kick",[g.code,s.seq,g.players[3].id]);
    assert.equal((await state(g,g.users[1])).players.find(p=>p.id===g.players[3].id).eliminated_by,"kicked");
  });
  await t.test("exact timeout permits automatic transfer and stale actions cannot reclaim hosting",async()=>{
    const g=await make(4); const s=await state(g);
    await q("begin");
    await q("update vk_private.rooms set host_seen_at=now()-interval '60 seconds' where id=$1",[g.rid]);
    await q("select vk_private.maintain_host($1)",[g.rid]);
    assert.equal((await q("select host_id from vk_private.rooms where id=$1",[g.rid]))[0].host_id,g.users[0]);
    await q("commit");
    await assert.rejects(()=>api(g.host,"vk_start",[g.code]),/yalnızca masa sahibi/);
    await assert.rejects(()=>transfer(g,g.users[0],1,s.host.revision),/yönetimi değişti/);
  });
  await t.test("private history and host helper cannot be read/called; transfer is authenticated only",async()=>{
    const g=await make(); await start(g);
    await db.exec("set role authenticated");
    await assert.rejects(()=>q("select * from vk_private.round_actions"),/permission denied/);
    await assert.rejects(()=>q("select vk_private.maintain_host($1)",[g.rid]),/permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(()=>q("select public.vk_transfer_host($1,0,$2)",[g.code,g.players[0].id]),/permission denied/);
    await db.exec("reset role");
  });
});

test("v4 → v5 production migration preserves active games and runs twice safely", async t=>{
  const {db,q,api,make,state,start,phase,expire,ballot,transfer}=await harness(legacy);
  t.after(()=>db.close());
  const g=await make(7,true,{pin_enabled:true}); await start(g); let s=await phase(g,"voting");
  await ballot(g,[1,2,0,0,1,2,3],s); await expire(g); s=await state(g); assert.equal(s.phase,"runoff");
  const before=(await q("select * from vk_private.rooms where id=$1",[g.rid]))[0];
  const ballots=await q("select * from vk_private.votes where room_id=$1 order by voter",[g.rid]);
  const players=await q("select * from vk_private.players where room_id=$1 order by number",[g.rid]);
  await db.exec(migration); await db.exec(migration);
  const after=(await q("select * from vk_private.rooms where id=$1",[g.rid]))[0];
  for(const key of Object.keys(before)) assert.deepEqual(after[key],before[key],key);
  assert.deepEqual(await q("select * from vk_private.votes where room_id=$1 order by voter",[g.rid]),ballots);
  assert.deepEqual(await q("select * from vk_private.players where room_id=$1 order by number",[g.rid]),players);
  assert.equal(after.creator_id,g.host); assert.deepEqual(after.observer_ids,[g.host]);
  assert.deepEqual(new Set(after.vote_candidates),new Set(g.players.slice(0,3).map(p=>p.id)));
  assert.equal((await api(g.host,"vk_quota")).used,1);
  await transfer(g,g.host,1,0); assert.equal((await state(g)).me,null);
  await expire(g); s=await state(g); await ballot(g,[2,2,0,2,2,2,2],s); await expire(g); s=await state(g);
  assert.equal(s.winner,"jester"); assert.equal(s.summary.complete,false); assert.equal(s.summary.actions.length,8);
  // Every changed function in the standalone migration is exactly the full setup version.
  for(const m of migration.matchAll(/create or replace function [\w.]+\([^]*?end \$\$;/g)) assert.ok(setup.includes(m[0]),m[0].slice(0,80));
});

test("both upgrades preserve finalists when a v4 runoff vote is already open",async()=>{
  for(const sql of [migration,setup]) {
    const h=await harness(legacy), {db,make,state,start,phase,ballot,expire}=h;
    try {
      const g=await make(); await start(g); let s=await phase(g,"voting");
      await ballot(g,[1,2,0,0,1,2,3],s); await expire(g); await state(g);
      await expire(g); s=await state(g); assert.equal(s.phase,"voting");
      await h.act(g,3,s,"vote",g.players[0].id);
      await h.act(g,4,s,"vote",g.players[5].id); // Accepted by v4, outside the new finalist set.
      await db.exec(sql); s=await state(g,g.users[3]);
      assert.deepEqual(new Set(s.vote_candidates),new Set(g.players.slice(0,3).map(p=>p.id)));
      assert.equal(s.my_vote,g.players[0].id); assert.equal(s.votes_cast,1);
      assert.equal((await state(g,g.users[4])).my_vote,null,"excluded legacy votes are released for a valid recast");
      await assert.rejects(()=>h.act(g,4,s,"vote",g.players[5].id),/birincilikte eşit/);
      await h.act(g,4,s,"vote",g.players[1].id);
    } finally { await db.close(); }
  }
});
