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
