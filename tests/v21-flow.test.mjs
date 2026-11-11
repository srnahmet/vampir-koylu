import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gameHarness} from './helpers/game-harness.mjs';
import {sharedHarness} from './helpers/shared-night.mjs';

test('V2.1 full install and both additive entry points contain identical rules',async()=>{
 const read=p=>readFile(new URL(p,import.meta.url),'utf8').then(s=>s.replaceAll('\r\n','\n'));
 const setup=await read('../supabase/setup.sql');
 for(const file of ['../supabase/v2.sql','../supabase/v2-1.sql']){
  const upgrade=await read(file);assert.equal(upgrade.slice(upgrade.indexOf('-- Vampir Köylü V2.1.')),setup);
 }
});

test('V2.1 two tied votes go through a visible nightfall and cannot start a third ballot',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['vampire','doctor','wizard','fanatic','villager','villager','villager','villager']);
 await h.force(g,'voting');await h.q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);
 for(let i=0;i<8;i++)await h.action(g,i,'vote',i%2===0?1:0);
 let s=await h.state(g);assert.equal(s.phase,'runoff');assert.equal(s.tie_streak,1);assert.equal(s.vote_candidates.length,2);
 await h.expire(g);s=await h.state(g);assert.equal(s.phase,'voting');assert.equal(s.tie_streak,1);
 await h.q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);
 for(let i=0;i<8;i++)await h.action(g,i,'vote',i%2===0?1:0);
 s=await h.state(g);assert.equal(s.phase,'nightfall');assert.equal(s.tie_streak,2);assert.match(s.announcement.text,/İkinci/);
 assert.ok(s.players.every(p=>p.alive));const oldseq=s.seq;await h.expire(g);s=await h.state(g);assert.equal(s.phase,'night');assert.equal(s.tie_streak,0);assert.equal(s.seq,oldseq+1);
 assert.equal((await h.room(g)).night_step,'all');assert.equal((Date.parse(s.ends_at)-Date.parse(s.started_at))/1000,25);
 await h.deadline(g);await h.expire(g);s=await h.state(g);assert.equal(s.phase,'day');
});

test('V2.1 a mayor can settle the first tie, second tie bypasses mayor and reaches night',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['vampire','mayor','villager','villager','villager','villager','villager','villager','villager']);
 // Nine players, ten weighted votes: two finalists at 5 each.
 const votes=[1,0,1,0,1,0,1,0,1];
 await h.force(g,'voting');await h.q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);
 for(let i=0;i<9;i++)await h.action(g,i,'vote',votes[i]);
 let s=await h.state(g);assert.equal(s.phase,'mayor_decision');assert.equal(s.tie_streak,1);
 await h.expire(g);await h.expire(g);assert.equal((await h.state(g)).phase,'voting');
 await h.q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);
 for(let i=0;i<9;i++)await h.action(g,i,'vote',votes[i]);
 assert.equal((await h.state(g)).phase,'nightfall');
 await assert.rejects(()=>h.action(g,1,'decide',0));
 const second=await h.make(['vampire','mayor','fanatic','villager','villager','villager','villager','villager','villager']);
 await h.q('update vk_private.players set fanatic_target=$1 where id=$2',[second.players[3].id,second.players[2].id]);
 await h.force(second,'mayor_decision');await h.q('update vk_private.rooms set tie_streak=1,vote_candidates=$2::uuid[] where id=$1',[second.rid,[second.players[3].id,second.players[4].id]]);
 await h.action(second,1,'decide',3);assert.equal((await h.room(second)).tie_streak,0);assert.equal((await h.players(second))[2].fanatic_won,true);assert.equal((await h.state(second)).phase,'execution');
});

test('V2.1 three-way first tie narrows correctly, unique second result resets streak and awards Fanatic',async t=>{
 const h=await sharedHarness();t.after(()=>h.db.close());const g=await h.make(['vampire','fanatic','villager','villager','villager','villager']);
 await h.q('update vk_private.players set fanatic_target=$1 where id=$2',[g.players[2].id,g.players[1].id]);
 await h.force(g,'voting');await h.q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);
 for(const [i,target] of [1,2,0,0,1,2].entries())await h.action(g,i,'vote',target);
 assert.equal((await h.state(g)).vote_candidates.length,3);await h.expire(g);await h.q("update vk_private.rooms set ends_at=now()-interval '1 second' where id=$1",[g.rid]);
 for(let i=0;i<6;i++)await h.action(g,i,'vote',i===2?0:2);
 const s=await h.state(g);assert.equal(s.phase,'execution');assert.equal(s.tie_streak,0);assert.equal((await h.players(g))[1].fanatic_won,true);
});

test('V2.1 dealing thresholds, hidden lottery, Alpha replacement and bodyguard retirement for 4–24 players',async t=>{
 const h=await gameHarness();t.after(()=>h.db.close());
 const optional=['doctor','jester','mayor','bodyguard','hunter','shaman','gunslinger','vampire_cub','wizard','alpha_vampire','fanatic'];
 for(const size of [4,5,6,7,8,9,12,16,24])for(const two of size<6?[false]:[false,true]){
  const g=await h.make(null,{...Object.fromEntries(optional.map(k=>[k,'always'])),two_vampires:two},size);
  const ps=await h.players(g),rs=ps.map(p=>p.role),s=await h.state(g);
  assert.equal(rs.filter(r=>['vampire','alpha_vampire'].includes(r)).length,two?2:1);
  assert.equal(rs.includes('bodyguard'),false);assert.equal(rs.includes('alpha_vampire'),size>=8);
  if(size<8)assert.equal(rs.includes('wizard'),false);if(size<6)assert.equal(rs.includes('fanatic'),false);
  for(const p of ps.filter(p=>p.role==='fanatic'))assert.ok(ps.some(q=>q.id===p.fanatic_target && q.id!==p.id));
  assert.ok(s.players.every(p=>p.role===null));assert.equal(s.rules_version,3);assert.equal(s.me,null);
 }
 const counts={};for(let i=0;i<2048;i++){
  const roles=(await h.q("select vk_private.draw_roles($1::jsonb,1) rs",[JSON.stringify({rules_version:3,wizard:'always',doctor:'always',jester:'always',fanatic:'always'})]))[0].rs;
  assert.equal(roles.length,1);counts[roles[0]]=(counts[roles[0]]||0)+1;
 }
 for(const role of ['wizard','doctor','jester','fanatic'])assert.ok(counts[role]>350&&counts[role]<680,JSON.stringify(counts));
});

test('V2.1 migration twice preserves a real active V2 night and rematch adopts shared rules',async t=>{
 const h=await gameHarness({legacy:true});t.after(()=>h.db.close());const g=await h.make(['vampire','doctor','bodyguard','shaman','hunter','villager','villager','villager']);
 await h.force(g);await h.action(g,0,'kill',7);const room=await h.room(g),before=await h.players(g);
 const upgrade=await readFile(new URL('../supabase/v2-1.sql',import.meta.url),'utf8');
 await h.db.exec(upgrade);await h.db.exec(upgrade);const after=await h.room(g);
 for(const k of Object.keys(room))assert.deepEqual(after[k],room[k],k);
 for(const [i,p] of before.entries())for(const k of Object.keys(p))assert.deepEqual((await h.players(g))[i][k],p[k],k);
 assert.equal(after.rules_version,2);await h.expire(g);assert.equal((await h.room(g)).night_step,'doctor');
 await h.q("update vk_private.rooms set phase='finished' where id=$1",[g.rid]);await h.rpc(g.host,'vk_rematch',[g.code,(await h.room(g)).seq]);
 assert.equal((await h.room(g)).rules_version,3);assert.equal((await h.state(g)).settings.bodyguard,'never');
 for(const uid of g.users)await h.rpc(uid,'vk_ready',[g.code,(await h.room(g)).seq,true]);await h.rpc(g.host,'vk_start',[g.code]);
 await h.expire(g);await h.expire(g);await h.expire(g);assert.equal((await h.room(g)).night_step,'all');
});
