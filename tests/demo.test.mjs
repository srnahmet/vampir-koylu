import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const { createDemoSession, validateDemo } = loadTs(new URL("../src/demo/engine.ts", import.meta.url));
const { NightChoices } = loadTs(new URL("../src/NightChoices.tsx", import.meta.url));
const sql = await readFile(new URL("../supabase/setup.sql", import.meta.url), "utf8");
const seats = count => ["vampire", count === 2 ? "vampire" : "villager", "doctor", "wizard", "shaman", "hunter", "villager", "villager"].map((role, i) => ({ name: `Bot ${i + 1}`, role }));
async function toNight(demo) {
  for (let i = 0; i < 5; i++) {
    const g = await demo.state();
    if (g.phase === "night") return g;
    await demo.next();
  }
  assert.fail("Demo did not reach the first night");
}

for (const count of [1, 2]) test(`${count} vampire demo: enabled targets, independent editable choices, real resolution and complete bot game`, async t => {
  const demo = await createDemoSession(sql, seats(count)); t.after(() => demo.close());
  const players = await demo.roster();
  let g = await toNight(demo);
  const frozen = g.server_now;
  for (let i = 0; i < 3; i++) assert.equal((await demo.state()).server_now, frozen);
  const vampires = players.filter(p => p.role === "vampire");
  for (const vampire of vampires) {
    g = await demo.view(vampire.id);
    assert.equal(g.my_turn, true); assert.equal(g.night_action, "kill");
    const markup = renderToStaticMarkup(createElement(NightChoices, { game: g, busy: false, offset: Date.parse(g.server_now) - Date.now(), onSubmit() {} }));
    assert.match(markup, /Hedefimi onayla/);
    assert.match(markup, /aria-pressed="false"><span class="number-badge">7<\/span>/);
    await assert.rejects(() => demo.choose("kill", [vampire.id]), /Kendini|takım/);
    if (vampires.length === 2) await assert.rejects(() => demo.choose("kill", [vampires.find(v => v.id !== vampire.id).id]), /takım/);
    await demo.choose("kill", [players[6].id]);
    await demo.choose("kill", [players[7].id]);
    assert.equal((await demo.state()).night_choice.targets[0], players[7].id);
  }
  await demo.view(players[2].id); await demo.choose("protect", [players[7].id]);
  for (const vampire of vampires) {
    g = await demo.view(vampire.id);
    assert.equal(g.has_chosen, true);
    assert.equal(g.vampire_team.find(p => p.id === vampire.id).target, players[7].id);
  }
  g = await demo.view(null); assert.equal(g.vampire_team, null); assert.equal(g.me, null);
  assert.ok(g.players.every(p => p.role === null));
  await demo.next();
  assert.ok((await demo.roster()).every(p => p.alive), "doctor must save the agreed victim");
  for (let i = 0; i < 100 && (await demo.state()).phase !== "finished"; i++) await demo.next();
  assert.equal((await demo.state()).phase, "finished");
  assert.ok((await demo.state()).summary.actions.length > 0);
});

test("wizard demo: vampire contact kills the wizard despite doctor protection; roles and private notices move", async t => {
  const demo = await createDemoSession(sql, seats(2)); t.after(() => demo.close());
  const p = await demo.roster(); await toNight(demo);
  await demo.view(p[0].id); await demo.choose("skip", []);
  await demo.view(p[1].id); await demo.choose("skip", []);
  await demo.view(p[2].id); await demo.choose("protect", [p[3].id]);
  await demo.view(p[3].id); await demo.choose("swap", [p[0].id, p[6].id]);
  await demo.next(); const result = await demo.roster();
  assert.equal(result[3].alive, false); assert.equal(result[3].eliminated_by, "magic");
  assert.equal(result[0].role, "villager"); assert.equal(result[6].role, "vampire");
  assert.equal((await demo.view(p[6].id)).me.role_notices.at(-1).kind, "wizard");
  assert.equal((await demo.state()).me.role, "vampire");
});

test("demo rejects unsupported casts and manual night stays actionable regardless of wall clock", async () => {
  assert.match(validateDemo(seats(2).slice(0, 5)), /en az 6/);
  assert.match(validateDemo(seats(1).map(p => ({ ...p, role: "villager" }))), /yetişkin vampir/);
  const game = { players: [{ id:"v", number:1, name:"Vampir", alive:true }, { id:"t", number:2, name:"Hedef", alive:true }], me:{id:"v",role:"vampire"}, my_turn:true, night_action:"kill", ends_at:"2000-01-01T00:00:00Z", settings:{night_seconds:15,night_grace_seconds:10}, vampire_team:[{id:"v",target:null}] };
  const markup = renderToStaticMarkup(createElement(NightChoices, { game, busy:false, offset:0, manual:true, onSubmit() {} }));
  assert.match(markup, /Demo duraklatıldı/); assert.doesNotMatch(markup, /saniye ana süre/);
  assert.match(markup, /aria-pressed="false"><span class="number-badge">2<\/span>/);
});
