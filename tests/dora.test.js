import test from 'node:test';
import assert from 'node:assert/strict';
import {IDS,doraFromIndicator,countDora,evaluateWin} from '../engine.js';
const copies=(t,n)=>Array(n).fill(t);
const tiles=[...copies('m1',3),...copies('m9',3),...copies('p1',3),...copies('east',3),...copies('red',2)];
const ctx={melds:[],seat:2,dealer:0,winType:'ron',winningTile:'m1'};

test('all thirteen dora indicators have the correct successor',()=>{
  const next=['m9','m1','p9','p1','s9','s1','south','west','north','east','green','red','white'];
  assert.deepEqual(IDS.map(doraFromIndicator),next);
});

test('repeated visible indicators stack and are added to han',()=>{
  const base=evaluateWin(tiles,ctx);
  const win=evaluateWin(tiles,{...ctx,doraIndicators:['m9','m9','green']});
  assert.equal(win.yakuman,0);
  assert.equal(win.dora,8); // m1 triplet twice + red pair once
  assert.equal(win.uraDora,0);
  assert.equal(win.han,base.han+8);
  assert.ok(win.yaku.some(y=>y.name==='ドラ'&&y.han===8));
});

test('ura-dora only count for riichi winning hands',()=>{
  const doraIndicators=['m9'];
  const uraIndicators=['p9','p9'];
  const noRiichi=evaluateWin(tiles,{...ctx,doraIndicators,uraIndicators});
  const riichi=evaluateWin(tiles,{...ctx,riichi:true,doraIndicators,uraIndicators});
  assert.equal(noRiichi.dora,3);assert.equal(noRiichi.uraDora,0);
  assert.equal(riichi.dora,3);assert.equal(riichi.uraDora,6);
  assert.ok(riichi.yaku.some(y=>y.name==='裏ドラ'&&y.han===6));
  const open=evaluateWin([...tiles.slice(0,9),...copies('red',2)],{...ctx,riichi:true,melds:[{tile:'east',kind:'pon',open:true,from:1}],doraIndicators,uraIndicators});
  assert.equal(open.uraDora,0);
});

test('kan adds four dora tiles, not just three',()=>{
  assert.equal(countDora([...copies('p1',3),...copies('red',2)],[{tile:'m1',kind:'kan',open:false,from:0}],['m9','m9']),8);
});

test('yakuman ignore both dora and ura-dora',()=>{
  const yakuman=evaluateWin(tiles,{...ctx,winType:'tsumo',winningTile:'red',riichi:true,doraIndicators:['m9','m9'],uraIndicators:['p9']});
  assert.ok(yakuman.yakuman>0);
  assert.equal(yakuman.dora,0);assert.equal(yakuman.uraDora,0);
  assert.ok(yakuman.yaku.every(y=>!['ドラ','裏ドラ'].includes(y.name)));
});
