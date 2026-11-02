const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const engine=fs.readFileSync(path.join(__dirname,'../engine.js'),'utf8').replaceAll('export ','');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/^import .*?\n/,'');
function setup(){
  const timers=[];
  const ctx={console,Math,localStorage:{getItem(){return null},setItem(){}},setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},confirm(){return true},document:{querySelector(){return {innerHTML:'',textContent:''}},addEventListener(){}}};
  vm.createContext(ctx);
  vm.runInContext(engine+'\n'+app,ctx);
  return code=>vm.runInContext(code,ctx);
}
const waitHand=()=>['m1','m1','m9','m9','m9','p1','p1','p1','s1','s1','s1','red','red'];
const notWaiting=()=>[...Array(12).fill('green'),'east'];

test('triple ron pays all three winners and checks bust only after all payments',()=>{
  const run=setup();
  const r=run(`(()=>{state.round=4;state.dealer=3;state.players.forEach((p,i)=>{p.points=[10000,90000,50000,50000][i];p.hand=i===0?[]:${JSON.stringify(waitHand())};p.discards=[];p.melds=[];p.riichi=false;p.tempFuriten=false;p.riichiPassed=false;});state.players[0].discards=['m1'];state.lastDiscard={seat:0,tile:'m1'};state.phase='resolving';resolveDiscard();const before={phase:state.phase,type:state.outcome.type,names:state.outcome.winners.map(w=>w.winner),payments:state.outcome.winners.map(w=>w.pay.total),points:state.players.map(p=>p.points)};const resultHTML=renderOutcome();nextRound();return {before,resultHTML,end:state.phase,sum:state.players.reduce((n,p)=>n+p.points,0)+state.riichiPot};})()`);
  assert.equal(r.before.phase,'hand-end');
  assert.equal(r.before.type,'multi-win');
  assert.deepEqual([...r.before.names],[1,2,3]);
  assert.equal(r.before.payments.length,3);
  assert.equal(r.before.points[0],10000-r.before.payments.reduce((n,p)=>n+p,0));
  assert.equal(r.sum,200000);
  assert.match(r.resultHTML,/トリロン/);
  assert.match(r.resultHTML,/CPU・青龍/);assert.match(r.resultHTML,/CPU・白虎/);assert.match(r.resultHTML,/CPU・朱雀/);
  assert.equal(r.end,'game-end'); // dealer is among winners, but bust has priority.
});

test('human accepts a double ron; score both before bust',()=>{
  const run=setup();
  const r=run(`(()=>{state.players.forEach((p,i)=>{p.hand=(i===0||i===2)?${JSON.stringify(waitHand())}:${JSON.stringify(notWaiting())};p.discards=[];p.melds=[];p.tempFuriten=false;p.riichiPassed=false;p.riichi=false;});state.players[1].discards=['m1'];state.lastDiscard={seat:1,tile:'m1'};state.phase='resolving';resolveDiscard();const pending={phase:state.phase,kind:state.pending?.kind,claimants:state.pending?.candidates.map(x=>x.winner)};humanRespond(true);return {pending,outcome:state.outcome.type,winners:state.outcome.winners.map(x=>x.winner),html:renderOutcome(),sum:state.players.reduce((n,p)=>n+p.points,0)+state.riichiPot};})()`);
  assert.equal(r.pending.phase,'human-response');
  assert.equal(r.pending.kind,'ron-multi');
  assert.deepEqual([...r.pending.claimants],[2,0]);
  assert.equal(r.outcome,'multi-win');
  assert.deepEqual([...r.winners],[2,0]);
  assert.equal(r.sum,200000);assert.match(r.html,/ダブロン/);
});

test('human passes a ron, CPU still wins and human is furiten',()=>{
  const run=setup();
  const r=run(`(()=>{state.players.forEach((p,i)=>{p.hand=(i===0||i===2)?${JSON.stringify(waitHand())}:${JSON.stringify(notWaiting())};p.discards=[];p.melds=[];p.tempFuriten=false;p.riichiPassed=false;p.riichi=false;});state.players[1].discards=['m1'];state.lastDiscard={seat:1,tile:'m1'};state.phase='resolving';resolveDiscard();humanRespond(false);return {outcome:state.outcome.type,winner:state.outcome.winner,furiten:state.players[0].tempFuriten};})()`);
  assert.equal(r.outcome,'win');assert.equal(r.winner,2);assert.equal(r.furiten,true);
});

test('riichi pot goes once to nearest claimant, not to all of them',()=>{
  const run=setup();
  const r=run(`(()=>{state.players.forEach((p,i)=>{p.hand=i===0?[]:${JSON.stringify(waitHand())};p.discards=[];p.melds=[];p.riichi=false;p.tempFuriten=false;p.riichiPassed=false;});state.players[0].points-=2000;state.riichiPot=2000;state.players[0].discards=['m1'];state.lastDiscard={seat:0,tile:'m1'};state.phase='resolving';resolveDiscard();return {pots:state.outcome.winners.map(w=>w.pot),sum:state.players.reduce((n,p)=>n+p.points,0)+state.riichiPot};})()`);
  assert.deepEqual([...r.pots],[2000,0,0]);assert.equal(r.sum,200000);
});

test('dealer among multiple winners repeats even if dealer not nearest',()=>{
  const run=setup();
  const r=run(`(()=>{state.dealer=3;state.round=4;state.players.forEach((p,i)=>{p.points=i===0?200000:0;p.hand=i===0?[]:${JSON.stringify(waitHand())};p.melds=[];p.discards=[];p.riichi=false;p.tempFuriten=false;p.riichiPassed=false;});state.players[0].discards=['m1'];state.lastDiscard={seat:0,tile:'m1'};state.phase='resolving';resolveDiscard();const current=state.outcome.type;nextRound();return {current,round:state.round,honba:state.honba,dealer:state.dealer};})()`);
  assert.equal(r.current,'multi-win');assert.equal(r.round,4);assert.equal(r.honba,1);assert.equal(r.dealer,3);
});

test('multiple chankan claims are recognized before added kan is committed',()=>{
  const run=setup();
  const r=run(`(()=>{state.players.forEach((p,i)=>{p.hand=(i===0||i===2)?${JSON.stringify(waitHand())}:${JSON.stringify(notWaiting())};p.discards=[];p.melds=[];p.tempFuriten=false;p.riichiPassed=false;p.riichi=false;});state.players[1].melds=[{tile:'m1',kind:'pon',open:true,from:3}];state.players[1].hand=['m1',...Array(10).fill('green')];state.players[1].drawIndex=10;declareKan(1,'kakan','m1');const pending={kind:state.pending.kind,candidates:state.pending.candidates.length};humanRespond(true);return {pending,outcome:state.outcome.type,winners:state.outcome.winners.map(w=>w.winner),kind:state.players[1].melds[0].kind};})()`);
  assert.equal(r.pending.kind,'chankan-multi');assert.equal(r.pending.candidates,2);
  assert.equal(r.outcome,'multi-win');assert.deepEqual([...r.winners],[2,0]);assert.equal(r.kind,'pon');
});

test('pin and sou render compact digits, corner labels, and no central ornaments',()=>{
  const run=setup();
  const r=run(`({pin:tileMarkup('p1'),sou:tileMarkup('s9'),man:tileMarkup('m1')})`);
  assert.match(r.pin,/tile-badge">筒/);assert.match(r.sou,/tile-badge">索/);
  assert.match(r.pin,/tile-suit tile-suit-small/);assert.match(r.sou,/tile-suit tile-suit-small/);
  assert.match(r.pin,/>1</);assert.match(r.sou,/>9</);
  assert.doesNotMatch(r.pin,/tile-pattern/);assert.doesNotMatch(r.sou,/tile-pattern/);
  assert.doesNotMatch(r.man,/tile-badge/);
});
