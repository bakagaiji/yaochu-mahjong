import test from 'node:test';
import assert from 'node:assert/strict';
import {baseFromHanFu,calculatePayments,scoreName,nextHandState} from '../engine.js';

test('counted yakuman tiers include all han, including dora and ura dora',()=>{
  for(const [han,expected] of [[13,8000],[25,8000],[26,16000],[38,16000],[39,24000],[51,24000],[52,32000]]){
    assert.equal(baseFromHanFu(han,30),expected);
  }
  assert.equal(scoreName({han:13,yakuman:0}),'数え役満');
  assert.equal(scoreName({han:26,yakuman:0}),'ダブル役満（数え26翻）');
  assert.equal(scoreName({han:39,yakuman:0}),'トリプル役満（数え39翻）');
  assert.equal(scoreName({yakuman:1}),'役満');
  assert.equal(scoreName({yakuman:2}),'ダブル役満');
  assert.equal(scoreName({yakuman:3}),'トリプル役満');
});

test('ron honba adds 300 per stick to loser payment',()=>{
  const p=calculatePayments(8000,'ron',1,0,2,3);
  assert.deepEqual(p.delta,[0,32900,-32900,0]);
  assert.equal(p.honbaBonus,900);
  assert.match(p.description,/3本場/);
  assert.equal(p.delta.reduce((a,b)=>a+b,0),0);
});

test('tsumo honba adds 100 per stick from each player',()=>{
  const p=calculatePayments(16000,'tsumo',0,0,null,2);
  assert.deepEqual(p.delta,[96600,-32200,-32200,-32200]);
  assert.equal(p.honbaBonus,600);
  const child=calculatePayments(2000,'tsumo',1,0,null,2);
  assert.deepEqual(child.delta,[-4200,8600,-2200,-2200]);
  assert.equal(child.delta.reduce((a,b)=>a+b,0),0);
});

test('dealer win repeats and builds honba even on East 4',()=>{
  assert.deepEqual(nextHandState(1,0,0,{type:'win',winner:0}),{round:1,honba:1,repeat:true,finished:false});
  assert.deepEqual(nextHandState(4,5,3,{type:'win',winner:3}),{round:4,honba:6,repeat:true,finished:false});
});
test('non-dealer win moves dealer, clears honba and finishes after East 4',()=>{
  assert.deepEqual(nextHandState(2,3,1,{type:'win',winner:2}),{round:3,honba:0,repeat:false,finished:false});
  assert.deepEqual(nextHandState(4,2,3,{type:'win',winner:0}),{round:4,honba:0,repeat:false,finished:true});
});
test('draw increases honba and dealer repeats only when tenpai',()=>{
  assert.deepEqual(nextHandState(3,2,2,{type:'draw',ready:[false,false,true,false]}),{round:3,honba:3,repeat:true,finished:false});
  assert.deepEqual(nextHandState(3,2,2,{type:'draw',ready:[true,false,false,false]}),{round:4,honba:3,repeat:false,finished:false});
  assert.deepEqual(nextHandState(4,1,3,{type:'draw',ready:[true,false,false,false]}),{round:4,honba:2,repeat:false,finished:true});
});
test('eight kan abort repeats and increases honba',()=>{
  assert.deepEqual(nextHandState(1,0,0,{type:'abort'}),{round:1,honba:1,repeat:true,finished:false});
  assert.deepEqual(nextHandState(4,3,3,{type:'abort'}),{round:4,honba:4,repeat:true,finished:false});
});
