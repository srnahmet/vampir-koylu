import {test} from "node:test";
import assert from "node:assert/strict";
import {recapGroups,recapLine} from "../src/recap.ts";
const players=[{id:"a",number:1,name:"Ada"},{id:"b",number:2,name:"Bora"}];
const action=(kind,more={})=>({id:1,day:1,seq:4,kind,actor:"a",target:"b",status:"resolved",details:{},...more});
test("recap separates nights and repeated ballots without duplicating rounds or exposing incomplete outcomes",()=>{
  const groups=recapGroups([action("kill"),action("protect",{seq:5}),action("vote",{day:2,seq:7}),action("vote_result",{day:2,seq:7}),action("vote",{day:2,seq:9})]);
  assert.deepEqual(groups.map(g=>[g.title,g.actions.length]),[["1. gece",2],["2. gün · 1. oylama",2],["2. gün · 2. oylama",1]]);
  assert.match(recapLine(action("kill",{status:"pending"}),players),/Gece tamamlanmadan/);
  assert.match(recapLine(action("kill",{status:"cancelled"}),players),/geçersiz/);
  assert.doesNotMatch(recapLine(action("kill",{status:"cancelled"}),players),/Hedef öldü/);
  assert.match(recapLine(action("protect",{details:{outcome:"saved"}}),players),/hayat kurtardı/);
  assert.match(recapLine(action("protect",{details:{outcome:"missed"}}),players),/başka bir oyuncu/);
  assert.match(recapLine(action("vote_result",{status:"tie",details:{candidates:["a","b"]}}),players),/#1 Ada, #2 Bora/);
  assert.match(recapLine(action("vote",{target:"gone",status:"cancelled"}),players),/Masadan ayrılan oyuncu/);
});
