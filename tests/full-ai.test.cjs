const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const engine=fs.readFileSync(path.join(__dirname,'../engine.js'),'utf8').replaceAll('export ','');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/^import .*?\n/,'');
const readyHand=['m1','m1','m9','m9','m9','p1','p1','p1','s1','s1','s1','red','red'];

function setup(initial={}){
  const data={...initial},jobs=[];
  let nextId=0;
  const ctx={
    console,Math,
    localStorage:{getItem(key){return data[key]??null;},setItem(key,v){data[key]=v;}},
    setTimeout(fn,ms){const id=++nextId;jobs.push({id,fn,ms});return id;},
    clearTimeout(id){const i=jobs.findIndex(t=>t.id===id);if(i>=0)jobs.splice(i,1);},
    confirm(){return true},
    document:{querySelector(){return {innerHTML:'',textContent:''}},addEventListener(){}},
  };
  vm.createContext(ctx);
  vm.runInContext(engine+'\n'+app,ctx,{filename:'mahjong.js'});
  return {run:x=>vm.runInContext(x,ctx),jobs,data,
    step(){assert.ok(jobs.length,'Expected an automated event to be pending');jobs.shift().fn();}};
}
const hand14=['m1','m9','p1','p9','s1','s9','east','south','west','north','white','green','green','p1'];

test('full AI is opt-in, exposes ON/always/OFF, and persists independently of other switches',()=>{
  const {run,data}=setup();
  assert.equal(run('playOptions.fullAi'),'off');
  assert.match(run('renderHand()'),/お任せAI/);
  assert.match(run('renderHand()'),/data-play-option="fullAi" data-play-mode="off" aria-pressed="true"/);
  run("setPlayOption('fullAi','always')");
  assert.equal(run('playOptions.fullAi'),'always');
  assert.equal(JSON.parse(data['yaochu-mahjong-play-options-v1']).fullAi,'always');
  const reopened=setup(data);
  assert.equal(reopened.run('playOptions.fullAi'),'always');
  assert.equal(reopened.run('playOptions.noCalls'),'off');
});

test('delegated turn uses CPU logic to discard, without using the blind tsumogiri switch',()=>{
  const {run,step,jobs}=setup();
  const status=run(`(()=>{
    const p=state.players[0];
    p.hand=${JSON.stringify(hand14)};p.discards=[];p.drawIndex=13;
    p.melds=[];p.riichi=false;p.forbidden=null;state.phase='human-turn';state.turn=0;
    setPlayOption('autoDiscard','off');
    setPlayOption('fullAi','hand');
    return {phase:state.phase,enabled:isAiEnabled(),drawn:p.hand[13]};
  })()`);
  assert.equal(status.enabled,true);
  assert.equal(status.phase,'human-turn');
  assert.ok(jobs.length);
  step();
  const after=run('({phase:state.phase,discarded:state.players[0].discards.length,hand:state.players[0].hand.length})');
  assert.equal(after.phase,'resolving');
  assert.equal(after.discarded,1);
  assert.equal(after.hand,13);
});

test('full AI takes a valid tsumo even when the separate auto-win setting is OFF',()=>{
  const {run,step}=setup();
  run(`(()=>{
    const p=state.players[0];
    p.hand=[...${JSON.stringify(readyHand)},'m1'];p.drawIndex=13;p.discards=[];p.riichi=false;
    state.phase='human-turn';state.turn=0;
    setPlayOption('fullAi','hand');
  })()`);
  step();
  const result=run('({phase:state.phase,type:state.outcome.type,winner:state.outcome.winner,winType:state.outcome.winType})');
  assert.equal(result.phase,'hand-end');
  assert.equal(result.type,'win');
  assert.equal(result.winner,0);
  assert.equal(result.winType,'tsumo');
});

test('full AI takes ron on a discard with multi-winner scoring unchanged',()=>{
  const {run}=setup();
  const result=run(`(()=>{
    playOptions.fullAi='always';
    state.players.forEach((p,i)=>{
      p.hand=(i===0||i===2)?${JSON.stringify(readyHand)}:[];
      p.discards=[];p.melds=[];p.riichi=false;p.tempFuriten=false;p.riichiPassed=false;
    });
    state.players[1].discards=['m1'];
    state.lastDiscard={seat:1,tile:'m1'};state.phase='resolving';
    resolveDiscard();
    return {phase:state.phase,type:state.outcome?.type,winners:state.outcome?.winners.map(x=>x.winner)};
  })()`);
  assert.equal(result.phase,'hand-end');
  assert.equal(result.type,'multi-win');
  assert.deepEqual([...result.winners],[2,0]);
});

test('AI honors no-calls mode and does not prompt for pon or daiminkan',()=>{
  const {run}=setup();
  const result=run(`(()=>{
    playOptions.fullAi='always';playOptions.noCalls='hand';
    state.players[0].hand=['m1','m1','m1','red'];
    state.players[2].hand=[];state.players[3].hand=[];
    state.lastDiscard={seat:1,tile:'m1'};state.phase='resolving';
    offerPonOrAdvance();
    return {phase:state.phase,pending:state.pending,melds:state.players[0].melds.length};
  })()`);
  assert.equal(result.phase,'turn-start');
  assert.equal(result.pending,null);
  assert.equal(result.melds,0);
});

test('AI handles a human call prompt and can safely pass it',()=>{
  const {run,step,jobs}=setup();
  run(`(()=>{
    state.players[0].hand=['m1','m1','m9','p1','p9','s1','s9','east','south','west','north','white','green'];
    state.players[2].hand=[];state.players[3].hand=[];
    state.players[1].discards=['m1'];
    state.lastDiscard={seat:1,tile:'m1'};state.phase='resolving';
    playOptions.fullAi='always';
    offerPonOrAdvance();
  })()`);
  assert.equal(run('state.phase'),'human-response');
  assert.equal(run('state.pending.kind'),'call');
  assert.ok(jobs.length);
  step();
  assert.notEqual(run('state.phase'),'human-response');
  assert.equal(run('state.pending'),null);
});

test('AI advances automatically after a readable result, with an interruptible stop button',()=>{
  const {run,jobs,step}=setup();
  run(`(()=>{
    state.phase='hand-end';state.handEnded=true;
    state.outcome={type:'draw',ready:[false,false,false,false],deltas:[0,0,0,0]};
    setPlayOption('fullAi','hand');
  })()`);
  assert.equal(run('state.phase'),'hand-end');
  assert.match(run('renderOutcome()'),/data-action="stop-ai"/);
  assert.ok(jobs.length);
  assert.equal(jobs[jobs.length-1].ms,4800);
  step();
  assert.equal(run('playOptions.fullAi'),'off');
  assert.equal(run('state.phase'),'turn-start');

  // A fresh result can be paused instead of automatically advancing.
  run(`(()=>{
    state.phase='hand-end';state.handEnded=true;
    state.outcome={type:'draw',ready:[false,false,false,false],deltas:[0,0,0,0]};
    setPlayOption('fullAi','always');
    setPlayOption('fullAi','off');
  })()`);
  assert.equal(run('state.phase'),'hand-end');
  assert.equal(jobs.length,0); // Turning the AI off cancels the pending result transition.
  assert.equal(run('playOptions.fullAi'),'off');
});

test('an all-CPU game finishes without manual intervention and conserves all points',()=>{
  const {run,jobs,step}=setup();
  run("setPlayOption('fullAi','always')");
  let count=0;
  while(run("state.phase")!=='game-end'&&count<6000){
    if(!jobs.length)throw Error('Deadlock after '+count+' steps: '+run('state.phase'));
    step();count++;
  }
  assert.equal(run('state.phase'),'game-end','Match should complete');
  assert.ok(count>10);
  assert.equal(run('state.players.reduce((a,p)=>a+p.points,0)+state.riichiPot'),200000);
});
