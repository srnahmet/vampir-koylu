import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('V1 to V2 upgrade preserves an active night and can be applied twice',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 await db.exec(await readFile(new URL('./fixtures/setup-v4.sql',import.meta.url),'utf8'));
 const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
 const rpc=async(uid,fn,args=[])=>{await q("select set_config('request.jwt.claim.sub',$1,false)",[uid]);return (await q(`select public.${fn}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args))[0].result;};
 const host=randomUUID(),users=Array.from({length:6},()=>randomUUID());
 const code=await rpc(host,'vk_create',['',JSON.stringify({host_plays:false,doctor:'always'})]);
 for(const [i,uid] of users.entries()){await rpc(uid,'vk_join',[code,`Ad ${i}`]);await rpc(uid,'vk_ready',[code,0,true]);}
 await rpc(host,'vk_start',[code]);
 await q("update vk_private.rooms set phase='night',seq=10,night_step='vampire',ends_at=now()+interval '1 minute' where code=$1",[code]);
 const ps=await q('select p.* from vk_private.players p join vk_private.rooms r on r.id=p.room_id where r.code=$1 order by number',[code]);
 const vampire=ps.find(p=>p.role==='vampire'),target=ps.find(p=>p.role==='villager');
 await rpc(vampire.user_id,'vk_act',[code,10,'kill',target.id]);
 const room=(await q('select * from vk_private.rooms where code=$1',[code]))[0];
 const before=await q('select * from vk_private.players where room_id=$1 order by number',[room.id]);
 const setup=await readFile(new URL('../supabase/setup.sql',import.meta.url),'utf8');
 const upgrade=await readFile(new URL('../supabase/v2.sql',import.meta.url),'utf8');
 assert.equal(upgrade.slice(upgrade.indexOf('-- Vampir Köylü V2.')),setup);
 await db.exec(upgrade);await db.exec(upgrade);
 const after=(await q('select * from vk_private.rooms where code=$1',[code]))[0];
 for(const k of Object.keys(room))assert.deepEqual(after[k],room[k],k);
 const players=await q('select * from vk_private.players where room_id=$1 order by number',[room.id]);
 for(const [i,p] of before.entries())for(const k of Object.keys(p))assert.deepEqual(players[i][k],p[k],k);
 const state=await rpc(host,'vk_state',[code]);assert.equal(state.phase,'night');assert.equal(state.seq,10);assert.equal(state.me,null);assert.equal(state.summary,null);assert.ok(state.players.every(p=>p.role===null));
});
