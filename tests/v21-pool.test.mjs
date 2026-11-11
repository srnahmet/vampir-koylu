import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gameHarness} from './helpers/game-harness.mjs';

test('V2.1 exhaustive active role pool: 472,392 settings/capacity combinations',async t=>{
 const h=await gameHarness();t.after(()=>h.db.close());
 const options=['doctor','jester','mayor','hunter','shaman','gunslinger','vampire_cub','wizard','fanatic'];
 await h.q('select setseed(0.141592)');
 const result=(await h.q(`with configs as materialized (
  select n,jsonb_object_agg(k,(array['never','random','always'])[1+(n/power(3,i-1)::int)%3])||'{"rules_version":3}'::jsonb cfg
  from generate_series(0,19682) n cross join unnest($1::text[]) with ordinality opt(k,i) group by n
 ), draws as materialized (
  select cfg,slots,vk_private.draw_roles(cfg,slots) drawn from configs cross join generate_series(0,23) slots
 ), checks as (
  select *,(select count(*) from jsonb_each_text(cfg) e where e.value='always') required from draws
 ) select count(*)::int cases,count(*) filter(where drawn is null or cardinality(drawn)>slots
  or cardinality(drawn)<>(select count(distinct k) from unnest(drawn) k)
  or exists(select 1 from unnest(drawn) k where cfg->>k='never' or not(k=any($1::text[])))
  or(required<=slots and exists(select 1 from jsonb_each_text(cfg) e where e.value='always' and not(e.key=any(drawn))))
  or(required>slots and(cardinality(drawn)<>slots or exists(select 1 from unnest(drawn) k where cfg->>k<>'always')))
 )::int violations from checks`,[options]))[0];
 assert.equal(result.cases,472392);assert.equal(result.violations,0);
 const counts=(await h.q(`with samples as materialized (
  select vk_private.draw_roles($1::jsonb,23) rs from generate_series(1,4096)
 ) select k,count(*)::int n from samples cross join unnest(rs) k group by k`,[JSON.stringify({rules_version:3,...Object.fromEntries(options.map(k=>[k,'random']))})]));
 assert.equal(counts.length,9);for(const c of counts)assert.ok(c.n>1750&&c.n<2350,JSON.stringify(c));
});
