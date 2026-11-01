import test from 'node:test';
import assert from 'node:assert/strict';
import {createWall,getForms,getWaits,missingTiles,evaluateWin,baseFromHanFu,calculatePayments,seatWind,IDS} from '../engine.js';
const ctx=(overrides={})=>({melds:[],seat:1,dealer:0,winType:'tsumo',winningTile:'m1',...overrides});
const many=(t,n)=>Array(n).fill(t);
test('156 tiles, exactly 12 of every one of 13 distinct kinds',()=>{
  const wall=createWall();assert.equal(wall.length,156);
  assert.equal(new Set(wall).size,13);
  for(const t of IDS)assert.equal(wall.filter(x=>x===t).length,12);
});
test('kokushi',()=>{
  const hand=[...IDS,'m1'];
  assert.equal(getForms(hand)[0].kind,'kokushi');
  const score=evaluateWin(hand,ctx());
  assert.equal(score.yakuman,1);
  assert.equal(score.yaku[0].name,'国士無双');
  assert.equal(getWaits(IDS).length,13);
});
test('seven pairs use seven different tiles',()=>{
  const hand=[...many('m1',2),...many('m9',2),...many('p1',2),...many('p9',2),...many('s1',2),...many('s9',2),...many('east',2)];
  assert.ok(getForms(hand).some(f=>f.kind==='chiitoi'));
  const score=evaluateWin(hand,ctx({winningTile:'east'}));
  assert.equal(score.form,'chiitoi');assert.ok(score.han>=4);
  assert.equal(score.fu,25);
  const dup=[...many('m1',4),...many('m9',2),...many('p1',2),...many('p9',2),...many('s1',2),...many('s9',2)];
  assert.equal(getForms(dup).length,0);
});
test('standard triplets and pair, even when the same tile forms 2 triples and a pair',()=>{
  const hand=[...many('m1',8),...many('p1',3),...many('red',3)];
  assert.equal(getForms(hand)[0].kind,'standard');
});
test('yakuman: big three dragons + all honors',()=>{
  const hand=[...many('white',3),...many('green',3),...many('red',3),...many('east',3),...many('north',2)];
  const score=evaluateWin(hand,ctx({seat:0}));
  assert.equal(score.yakuman,3); // 大三元, 四暗刻, 字一色
  assert.equal(score.base,24000);
});
test('yakuman: all terminals',()=>{
  const hand=[...many('m1',3),...many('m9',3),...many('p1',3),...many('s1',3),...many('s9',2)];
  const score=evaluateWin(hand,ctx());
  assert.ok(score.yaku.some(x=>x.name==='清老頭'));
});
test('open pon and non-open hand scoring',()=>{
  const tiles=[...many('m1',3),...many('m9',3),...many('east',3),...many('red',2)];
  const melds=[{tile:'p1',from:2}];
  assert.ok(getForms(tiles,melds).some(x=>x.kind==='standard'));
  const score=evaluateWin(tiles,ctx({melds,winType:'ron',winningTile:'east'}));
  assert.ok(score.yaku.some(x=>x.name==='対々和'));
  assert.ok(!score.yaku.some(x=>x.name==='四暗刻'));
});
test('ron on a head wait can complete four concealed triplets',()=>{
  const tiles=[...many('m1',3),...many('m9',3),...many('p1',3),...many('red',3),...many('south',2)];
  const score=evaluateWin(tiles,ctx({winType:'ron',winningTile:'south'}));
  assert.ok(score.yaku.some(x=>x.name==='四暗刻'));
});
test('shanten distance is one for a single wait',()=>{
  const hand=[...many('m1',3),...many('m9',3),...many('p1',3),...many('east',3),'red'];
  assert.equal(missingTiles(hand),1);
  assert.deepEqual(getWaits(hand),['red']);
});
test('payments respect dealer/nondealer, tsumo and ron',()=>{
  assert.equal(baseFromHanFu(4,40),2000);
  assert.equal(baseFromHanFu(4,25),1600);
  assert.deepEqual(calculatePayments(2000,'ron',1,0,2).delta,[0,8000,-8000,0]);
  assert.deepEqual(calculatePayments(2000,'tsumo',1,0).delta,[-4000,8000,-2000,-2000]);
  assert.deepEqual(calculatePayments(8000,'tsumo',0,0).delta,[48000,-16000,-16000,-16000]);
  assert.equal(seatWind(1,1),'east');
});
test('with twelve copies, two triplets of one yakuhai earn two instances of the yaku',()=>{
  const tiles=[...many('red',6),...many('m1',3),...many('p1',3),...many('south',2)];
  const score=evaluateWin(tiles,ctx({seat:1,winType:'ron',winningTile:'red'}));
  assert.equal(score.yaku.filter(x=>x.name==='役牌・中').length,2);
});

test('12 copies permit four same triplets plus a pair of different type',()=>{
  const hand=[...many('red',12),...many('south',2)];
  assert.ok(getForms(hand).some(f=>f.kind==='standard' && f.sets.length===4));
  assert.equal(missingTiles([...many('red',12),'south']),1);
});
test('concealed kan keeps hand closed; kan fu and yaku count',()=>{
  const melds=[{tile:'m1',kind:'kan',open:false,from:1}];
  const tiles=[...many('m9',3),...many('p1',3),...many('s1',3),...many('red',2)];
  const score=evaluateWin(tiles,ctx({melds,winningTile:'red'}));
  assert.ok(score.yaku.some(x=>x.name==='四暗刻'));
  assert.deepEqual(getWaits(tiles.slice(0,-1),melds),['red']);
});
test('rinshan and chankan add one han when not yakuman',()=>{
  const melds=[{tile:'east',from:0,kind:'pon',open:true}];
  const tiles=[...many('m1',3),...many('m9',3),...many('p1',3),...many('red',2)];
  const base=ctx({melds,winningTile:'red'});
  const tsumo=evaluateWin(tiles,{...base,rinshan:true});
  const ron=evaluateWin(tiles,{...base,winType:'ron',chankan:true});
  assert.ok(tsumo.yaku.some(x=>x.name==='嶺上開花'));
  assert.ok(ron.yaku.some(x=>x.name==='槍槓'));
});
test('four kan melds score 四槓子',()=>{
  const melds=['m1','m9','p1','p9'].map(tile=>({tile,kind:'kan',open:true,from:2}));
  const score=evaluateWin(['red','red'],ctx({melds,winningTile:'red'}));
  assert.ok(score.yaku.some(x=>x.name==='四槓子'));
});
