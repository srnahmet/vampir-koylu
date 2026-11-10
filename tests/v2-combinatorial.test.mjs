import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, optionalRoles } from './helpers/game-harness.mjs';

test('Exhaustive role-pool invariants and seeded probability checks', async t => {
  const h = await gameHarness(); t.after(() => h.db.close());
  const { q } = h;
  await q('select setseed(0.271828)');
  // All 3^8 settings combinations at every capacity from zero through 23. Materialize
  // volatile draws once so the assertions always inspect the same sample.
  const result = (await q(`with configs as materialized (
    select n, jsonb_object_agg(k, (array['never','random','always'])[1+(n/power(3,i-1)::int)%3]) cfg
    from generate_series(0,6560) n cross join unnest($1::text[]) with ordinality opt(k,i) group by n
  ), draws as materialized (
    select cfg,slots,vk_private.draw_roles(cfg,slots) drawn from configs cross join generate_series(0,23) slots
  ), checks as (
    select *, (select count(*) from jsonb_each_text(cfg) e where e.value='always') required from draws
  ) select count(*)::int cases, count(*) filter(where drawn is null or cardinality(drawn)>slots
    or cardinality(drawn)<>(select count(distinct k) from unnest(drawn) k)
    or exists(select 1 from unnest(drawn) k where cfg->>k='never')
    or (required<=slots and exists(select 1 from jsonb_each_text(cfg) e where e.value='always' and not (e.key=any(drawn))))
    or (required>slots and (cardinality(drawn)<>slots or exists(select 1 from unnest(drawn) k where cfg->>k<>'always')))
  )::int violations from checks`, [optionalRoles]))[0];
  assert.equal(result.cases, 157464); assert.equal(result.violations, 0);
  t.diagnostic(`${result.cases} role-setting/capacity combinations checked`);

  for (const [mode, slots, expected] of [['always',3,1536], ['random',8,2048], ['random',3,1442]]) {
    await q('select setseed(0.314159)');
    const cfg = Object.fromEntries(optionalRoles.map(k => [k, mode]));
    const counts = await q(`with draws as materialized (
      select vk_private.draw_roles($1::jsonb,$2) drawn from generate_series(1,4096)
    ) select k,count(*)::int n from draws cross join lateral unnest(drawn) k group by k order by k`, [JSON.stringify(cfg),slots]);
    assert.equal(counts.length,8);
    for (const row of counts) assert.ok(Math.abs(row.n-expected)<expected*0.14, `${mode}/${row.k}: ${row.n}`);
    t.diagnostic(`${mode}: 4096 draws; per-role inclusion range ${Math.min(...counts.map(r=>r.n))}–${Math.max(...counts.map(r=>r.n))}`);
  }
});

test('Exhaustive simultaneous double-attack / doctor / bodyguard resolution', async t => {
  const h = await gameHarness(); t.after(() => h.db.close());
  const { make, q } = h;
  const g = await make(['vampire','vampire','doctor','bodyguard','hunter','shaman','gunslinger','villager'], {two_vampires:true});
  const id = i => g.players[i].id;
  const literalArray = values => `array[${values.map(v=>`'${v}'::uuid`).join(',')}]`;
  const rows=[]; let n=0;
  for(let a=2;a<8;a++) for(let b=2;b<8;b++) if(a!==b)
    for(let doctor=0;doctor<8;doctor++) for(let guard=0;guard<8;guard++) if(guard!==3) {
      // Independent simultaneous model, using a snapshot before either attack.
      const dead=new Set();
      for(const victim of [a,b]) if(victim!==doctor) dead.add(victim===guard?3:victim);
      rows.push(`(${++n},'${id(a)}'::uuid,'${id(b)}'::uuid,'${id(doctor)}'::uuid,'${id(guard)}'::uuid,${literalArray([...dead].map(id))},${dead.has(4)?`'${id(4)}'::uuid`:'null::uuid'})`);
    }
  assert.equal(n,1680);
  await h.db.exec(`begin;
    create temporary table resolution_cases(n int,a uuid,b uuid,doctor uuid,guard uuid,dead uuid[],hunter uuid);
    insert into resolution_cases values ${rows.join(',')};
    do $matrix$ declare c record; actual uuid[]; pending uuid; begin
      for c in select * from resolution_cases order by n loop
        update vk_private.players set alive=true,eliminated_by=null where room_id='${g.rid}';
        update vk_private.rooms set victim=c.a,extra_victim=c.b,protected=c.doctor,guard_target=c.guard,
          silence_target=null,hunter_pending=null,events='[]' where id='${g.rid}';
        perform vk_private.resolve_night('${g.rid}');
        select coalesce(array_agg(id order by id),'{}'::uuid[]) into actual from vk_private.players where room_id='${g.rid}' and not alive;
        if not (actual @> c.dead and actual <@ c.dead) then raise exception 'Double-attack matrix case %: actual %, expected %',c.n,actual,c.dead; end if;
        select hunter_pending into pending from vk_private.rooms where id='${g.rid}';
        if pending is distinct from c.hunter then raise exception 'Hunter pending mismatch in case %',c.n; end if;
      end loop;
    end $matrix$;
    rollback;`);
  t.diagnostic(`${n} ordered attack/protection combinations matched an independent simultaneous-death model`);
});
