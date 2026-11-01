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
  return {eval:(source)=>vm.runInContext(source,ctx)};
}
test('concealed kan consumes four tiles and draws from the reserved rinshan',()=>{
  const g=setup();
  const result=g.eval(`(()=>{const p=state.players[0];p.hand=['m1','m1','m1','m1','m9','m9','m9','p1','p1','p1','s1','s1','red','red'];p.drawIndex=13;state.turn=0;state.phase='human-turn';const wall=state.wall.length;declareKan(0,'ankan','m1');return {meld:p.melds[0],hand:p.hand.length,kan:state.kanCount,rinshan:state.rinshan.length,wall,wallAfter:state.wall.length,phase:state.phase,rinshanWin:state.rinshanWin};})()`);
  assert.equal(result.meld.kind,'kan');assert.equal(result.meld.open,false);
  assert.equal(result.hand,11);assert.equal(result.kan,1);assert.equal(result.rinshan,7);
  assert.equal(result.wallAfter,result.wall);assert.equal(result.phase,'human-turn');assert.equal(result.rinshanWin,true);
});
test('daiminkan consumes discard and three hand tiles',()=>{
  const g=setup();const r=g.eval(`(()=>{const p=state.players[0];p.hand=['p1','p1','p1','m1','m1','m1','m9','m9','m9','red','red','east','east'];state.players[1].discards=['p1'];executeDaiminkan(0,'p1',1);return {hand:p.hand.length,meld:p.melds[0],discards:state.players[1].discards.length,kan:state.kanCount};})()`);
  assert.equal(r.hand,11);assert.equal(r.meld.kind,'kan');assert.equal(r.discards,0);assert.equal(r.kan,1);
});
test('eighth kan aborts without drawing or moving points',()=>{
  const g=setup();const r=g.eval(`(()=>{state.kanCount=7;const before=state.rinshan.length;const points=state.players.map(p=>p.points);finishKan(0,'暗槓');return {phase:state.phase,outcome:state.outcome,kan:state.kanCount,before,after:state.rinshan.length,pointsAfter:state.players.map(p=>p.points),points};})()`);
  assert.equal(r.phase,'hand-end');assert.equal(r.outcome.type,'abort');assert.equal(r.kan,8);
  assert.equal(r.after,r.before);assert.deepEqual(r.pointsAfter,r.points);
});
test('three-set table reserves 8 rinshan and 8 paired indicators, starts with one visible dora',()=>{
  const g=setup();const r=g.eval(`(()=>{const seen=[...state.wall,...state.rinshan,...state.doraIndicators,...state.uraIndicators,...state.players.flatMap(p=>p.hand)];return {wall:state.wall.length,rinshan:state.rinshan.length,indicators:state.doraIndicators.length,ura:state.uraIndicators.length,total:seen.length,countByType:IDS.map(t=>seen.filter(x=>x===t).length),shown:context(0,'ron','m1').doraIndicators.length,hidden:context(0,'ron','m1').uraIndicators.length};})()`);
  assert.equal(r.wall,80);assert.equal(r.rinshan,8);assert.equal(r.indicators,8);assert.equal(r.ura,8);
  assert.equal(r.total,156);assert.ok(r.countByType.every(x=>x===12));
  assert.equal(r.shown,1);assert.equal(r.hidden,0);
});
test('one kan reveals one more indicator; ura indicators remain hidden without riichi',()=>{
  const g=setup();const r=g.eval(`(()=>{const p=state.players[0];p.hand=['m1','m1','m1','m1','m9','m9','m9','p1','p1','p1','s1','s1','red','red'];p.drawIndex=13;state.phase='human-turn';declareKan(0,'ankan','m1');const before=context(0,'tsumo','m1');p.riichi=true;const after=context(0,'tsumo','m1');return {shown:before.doraIndicators.length,hidden:before.uraIndicators.length,riichiHidden:after.uraIndicators.length};})()`);
  assert.equal(r.shown,2);assert.equal(r.hidden,0);assert.equal(r.riichiHidden,2);
});

test('ankan exposes kan-dora before rinshan whereas daiminkan defers it',()=>{
  const an=setup();
  const r1=an.eval(`(()=>{const p=state.players[0];p.hand=['m1','m1','m1','m1','m9','m9','m9','p1','p1','p1','s1','s1','red','red'];p.drawIndex=13;state.phase='human-turn';declareKan(0,'ankan','m1');return {kan:state.kanCount,shown:state.revealedKanDora,pending:state.pendingKanDora,visible:context(0,'tsumo','m1').doraIndicators.length};})()`);
  assert.equal(r1.kan,1);assert.equal(r1.shown,1);assert.equal(r1.pending,0);assert.equal(r1.visible,2);
  const dm=setup();
  const r2=dm.eval(`(()=>{const p=state.players[0];p.hand=['p1','p1','p1','m1','m1','m1','m9','m9','m9','red','red','east','east'];state.players[1].discards=['p1'];executeDaiminkan(0,'p1',1);return {kan:state.kanCount,shown:state.revealedKanDora,pending:state.pendingKanDora,visible:context(0,'tsumo','p1').doraIndicators.length};})()`);
  assert.equal(r2.kan,1);assert.equal(r2.shown,0);assert.equal(r2.pending,1);assert.equal(r2.visible,1);
});

test('a completed discard reveals pending daiminkan dora',()=>{
  const g=setup();
  const r=g.eval(`(()=>{const p=state.players[0];p.hand=['p1','p1','p1','m1','m1','m1','m9','m9','m9','red','red','east','east'];state.players[1].discards=['p1'];executeDaiminkan(0,'p1',1);const before=context(0,'tsumo','m1').doraIndicators.length;discard(0,p.hand.indexOf('east'));const prior=state.revealedKanDora;for(const pl of state.players.slice(1))pl.riichi=true;offerPonOrAdvance();return {before,prior,after:state.revealedKanDora,pending:state.pendingKanDora,visible:context(0,'ron','m1').doraIndicators.length};})()`);
  assert.equal(r.before,1);assert.equal(r.prior,0);assert.equal(r.after,1);assert.equal(r.pending,0);assert.equal(r.visible,2);
});

test('ron on the discard prevents delayed kan-dora from being exposed',()=>{
  const g=setup();
  const r=g.eval(`(()=>{const p=state.players[0];p.hand=['p1','p1','p1','m1','m1','m1','m9','m9','m9','red','red','east','east'];state.players[1].discards=['p1'];executeDaiminkan(0,'p1',1);const win={base:2000,han:5,fu:40,yakuman:0,yaku:[],dora:0,uraDora:0};finishWin(1,'ron','east',0,win);return {shown:state.revealedKanDora,pending:state.pendingKanDora,indicators:state.outcome.doraIndicators.length};})()`);
  assert.equal(r.shown,0);assert.equal(r.pending,1);assert.equal(r.indicators,1);
});

test('kakan is delayed, a subsequent ankan reveals prior delayed indicator before drawing',()=>{
  const g=setup();
  const r=g.eval(`(()=>{const p=state.players[0];p.melds=[{tile:'p1',kind:'pon',open:true,from:1}];p.hand=['p1','m1','m1','m1','m1','m9','m9','m9','red','red','east'];p.drawIndex=p.hand.length-1;state.phase='human-turn';commitKakan(0,'p1');const afterKakan={shown:state.revealedKanDora,pending:state.pendingKanDora};declareKan(0,'ankan','m1');return {afterKakan,shown:state.revealedKanDora,pending:state.pendingKanDora,visible:context(0,'tsumo','m1').doraIndicators.length};})()`);
  assert.equal(r.afterKakan.shown,0);assert.equal(r.afterKakan.pending,1);
  assert.equal(r.shown,2);assert.equal(r.pending,0);assert.equal(r.visible,3);
});
