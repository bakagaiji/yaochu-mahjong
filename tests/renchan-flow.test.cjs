const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const engine=fs.readFileSync(path.join(__dirname,'../engine.js'),'utf8').replaceAll('export ','');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/^import .*?\n/,'');
function setup(){
  const timers=[];
  const mock=()=>({innerHTML:'',textContent:''});
  const ctx={console,Math,localStorage:{getItem(){return null},setItem(){}},setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){},confirm(){return true},document:{querySelector:mock,addEventListener(){}}};
  vm.createContext(ctx);vm.runInContext(engine+'\n'+app,ctx);
  return source=>vm.runInContext(source,ctx);
}
const dummyWin=`({base:2000,han:5,fu:40,yakuman:0,yaku:[{name:'混老頭',han:2}]})`;

test('actual round progression: East 1 dealer win goes to East 1 1-honba',()=>{
  const run=setup();
  const result=run(`(()=>{state.round=1;state.dealer=0;state.honba=0;finishWin(0,'ron','red',1,${dummyWin});const before=state.players.map(p=>p.points);nextRound();return {round:state.round,honba:state.honba,dealer:state.dealer,points:before,pot:state.riichiPot};})()`);
  assert.equal(result.round,1);assert.equal(result.honba,1);assert.equal(result.dealer,0);
  assert.equal(result.points.reduce((a,b)=>a+b,0)+result.pot,200000);
});

test('actual round progression: child win rotates and resets honba',()=>{
  const run=setup();
  const result=run(`(()=>{state.round=1;state.dealer=0;state.honba=2;finishWin(1,'ron','red',2,${dummyWin});const pay=state.outcome.pay;nextRound();return {round:state.round,honba:state.honba,dealer:state.dealer,pay:pay.delta};})()`);
  assert.equal(result.round,2);assert.equal(result.dealer,1);assert.equal(result.honba,0);
  assert.deepEqual([...result.pay],[0,8600,-8600,0]);
});

test('actual round progression: dealer tenpai draw repeats',()=>{
  const run=setup();
  const result=run(`(()=>{state.round=2;state.dealer=1;state.honba=3;state.phase='hand-end';state.outcome={type:'draw',ready:[false,true,false,false]};nextRound();return {round:state.round,honba:state.honba,dealer:state.dealer};})()`);
  assert.equal(result.round,2);assert.equal(result.honba,4);assert.equal(result.dealer,1);
});

test('actual round progression: East 4 dealer win continues rather than showing final',()=>{
  const run=setup();
  const result=run(`(()=>{state.round=4;state.dealer=3;state.honba=2;finishWin(3,'tsumo','red',null,${dummyWin});nextRound();return {round:state.round,honba:state.honba,dealer:state.dealer,phase:state.phase};})()`);
  assert.equal(result.round,4);assert.equal(result.honba,3);assert.equal(result.dealer,3);
  assert.notEqual(result.phase,'game-end');
});

test('actual round progression: East 4 child win finishes',()=>{
  const run=setup();
  const result=run(`(()=>{state.round=4;state.dealer=3;state.honba=2;finishWin(0,'ron','red',1,${dummyWin});nextRound();return {phase:state.phase,round:state.round,honba:state.honba,points:state.players.map(p=>p.points),pot:state.riichiPot};})()`);
  assert.equal(result.phase,'game-end');assert.equal(result.pot,0);
  assert.equal(result.points.reduce((a,b)=>a+b,0),200000);
});

test('actual eight kan abort makes East 4 repeat with extra honba',()=>{
  const run=setup();
  const result=run(`(()=>{state.round=4;state.dealer=3;state.honba=1;finishAbort();nextRound();return {phase:state.phase,round:state.round,honba:state.honba};})()`);
  assert.equal(result.round,4);assert.equal(result.honba,2);
  assert.notEqual(result.phase,'game-end');
});

test('a negative score on a win stops the match immediately after result display',()=>{
  const run=setup();
  const result=run(`(()=>{state.round=1;state.dealer=0;state.honba=0;state.players[1].points=100;state.players[0].points+=49900;const win={base:8000,han:13,fu:0,yakuman:0,yaku:[],dora:0,uraDora:0};finishWin(0,'ron','red',1,win);const phaseBefore=state.phase;const notice=renderOutcome();const loses=state.players[1].points;nextRound();return {phaseBefore,notice,loses,phaseAfter:state.phase,round:state.round,points:state.players.map(p=>p.points),pot:state.riichiPot};})()`);
  assert.equal(result.phaseBefore,'hand-end');
  assert.ok(result.loses<0);
  assert.match(result.notice,/飛び終了：最終結果を見る/);
  assert.equal(result.phaseAfter,'game-end');assert.equal(result.round,1);
  assert.equal(result.points.reduce((a,b)=>a+b,0)+result.pot,200000);
});

test('a negative score from draw settlement also ends the match',()=>{
  const run=setup();
  const r=run(`(()=>{state.round=2;state.dealer=1;state.honba=1;state.players[0].points=-100;state.players[1].points=100100;state.phase='hand-end';state.outcome={type:'draw',ready:[false,true,false,false],deltas:[0,0,0,0]};const label=renderOutcome();nextRound();return {phase:state.phase,round:state.round,label};})()`);
  assert.equal(r.phase,'game-end');assert.equal(r.round,2);
  assert.match(r.label,/飛び終了/);
});

test('exactly zero points does not count as a bust',()=>{
  const run=setup();
  const r=run(`(()=>{state.round=1;state.dealer=0;state.honba=0;state.players[0].points=0;state.players[1].points=100000;state.phase='hand-end';state.outcome={type:'abort'};nextRound();return {phase:state.phase,round:state.round,honba:state.honba};})()`);
  assert.notEqual(r.phase,'game-end');assert.equal(r.round,1);assert.equal(r.honba,1);
});
