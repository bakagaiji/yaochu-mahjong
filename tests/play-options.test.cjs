const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const engine=fs.readFileSync(path.join(__dirname,'../engine.js'),'utf8').replaceAll('export ','');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/^import .*?\n/,'');
const readyHand=['m1','m1','m9','m9','m9','p1','p1','p1','s1','s1','s1','red','red'];

function setup(seed={}){
  const data={...seed};
  const storage={getItem(key){return data[key]??null;},setItem(key,value){data[key]=value;}};
  const ctx={console,Math,localStorage:storage,confirm(){return true},
    setTimeout(){return 1},clearTimeout(){},
    document:{querySelector(){return {innerHTML:'',textContent:''};},addEventListener(){}}
  };
  vm.createContext(ctx);
  vm.runInContext(engine+'\n'+app,ctx);
  return {run:code=>vm.runInContext(code,ctx),data};
}

test('both controls expose three distinct modes, default OFF, and persistent modes survive new matches',()=>{
  const {run,data}=setup();
  assert.deepEqual([...Object.values(run('playOptions'))],['off','off']);
  let html=run('renderHand()');
  for(const label of ['鳴き無し','自動アガリ'])assert.match(html,new RegExp(label));
  for(const mode of ['hand','always','off'])assert.match(html,new RegExp('data-play-mode="'+mode+'"'));
  assert.match(html,/ONはこの局のみ／常時ONは次局以降も継続/);
  assert.match(html,/data-play-option="noCalls" data-play-mode="off" aria-pressed="true"/);
  assert.match(html,/data-play-option="autoWin" data-play-mode="off" aria-pressed="true"/);
  run("setPlayOption('noCalls','always');setPlayOption('autoWin','always')");
  html=run('renderHand()');
  assert.match(html,/data-play-option="noCalls" data-play-mode="always" aria-pressed="true"/);
  assert.match(html,/data-play-option="autoWin" data-play-mode="always" aria-pressed="true"/);
  run('newGame()');
  assert.equal(run('playOptions.noCalls'),'always');
  assert.equal(run('playOptions.autoWin'),'always');
  assert.deepEqual(JSON.parse(data['yaochu-mahjong-play-options-v1']),{noCalls:'always',autoWin:'always'});
  assert.equal(run('state.version'),5);
  const reloaded=setup(data);
  assert.equal(reloaded.run('playOptions.noCalls'),'always');
  assert.equal(reloaded.run('playOptions.autoWin'),'always');
});

test('ON applies only to the current hand while 常時ON persists through next hands',()=>{
  const {run,data}=setup();
  run("setPlayOption('noCalls','hand');setPlayOption('autoWin','always')");
  assert.equal(run("isPlayOptionEnabled('noCalls')"),true);
  assert.equal(run("isPlayOptionEnabled('autoWin')"),true);
  const reloaded=setup(data);
  assert.equal(reloaded.run('playOptions.noCalls'),'hand');
  assert.equal(reloaded.run('playOptions.autoWin'),'always');
  const updated=run('(()=>{startRound();return {noCalls:playOptions.noCalls,autoWin:playOptions.autoWin};})()');
  assert.equal(updated.noCalls,'off');
  assert.equal(updated.autoWin,'always');
  assert.deepEqual(JSON.parse(data['yaochu-mahjong-play-options-v1']),{noCalls:'off',autoWin:'always'});
});

test('both temporary modes are reset on a new match; modes remain independent',()=>{
  const {run}=setup();
  run("setPlayOption('noCalls','hand');setPlayOption('autoWin','hand')");
  const status=run('(()=>{newGame();return {noCalls:playOptions.noCalls,autoWin:playOptions.autoWin};})()');
  assert.equal(status.noCalls,'off');
  assert.equal(status.autoWin,'off');
  run("setPlayOption('noCalls','always');setPlayOption('autoWin','hand')");
  const second=run('(()=>{startRound();return {noCalls:playOptions.noCalls,autoWin:playOptions.autoWin};})()');
  assert.equal(second.noCalls,'always');
  assert.equal(second.autoWin,'off');
});

test('previous ON/OFF settings migrate safely without changing prior preferences',()=>{
  const enabled=setup({'yaochu-mahjong-play-options-v1':JSON.stringify({noCalls:true,autoWin:false})});
  assert.equal(enabled.run('playOptions.noCalls'),'always');
  assert.equal(enabled.run('playOptions.autoWin'),'off');
  const disabled=setup({'yaochu-mahjong-play-options-v1':JSON.stringify({noCalls:false,autoWin:true})});
  assert.equal(disabled.run('playOptions.noCalls'),'off');
  assert.equal(disabled.run('playOptions.autoWin'),'always');
});
test('no-calls skips an already open human pon/daiminkan prompt',()=>{
  const {run}=setup();
  const result=run(`(()=>{
    state.players[0].hand=['m1','m1','m1','red'];
    state.players[2].hand=[];state.players[3].hand=[];
    state.lastDiscard={seat:1,tile:'m1'};
    state.phase='resolving';
    offerPonOrAdvance();
    const offered={kind:state.pending.kind,canKan:state.pending.canKan};
    setPlayOption('noCalls','hand');
    return {offered,phase:state.phase,pending:state.pending,hand:state.players[0].hand.length};
  })()`);
  assert.equal(result.offered.kind,'call');
  assert.equal(result.offered.canKan,true);
  assert.equal(result.phase,'turn-start');
  assert.equal(result.pending,null);
  assert.equal(result.hand,4);
});

test('no-calls never prompts on a new discard and does not prevent ron',()=>{
  const {run}=setup();
  const result=run(`(()=>{
    playOptions.noCalls='hand';
    state.players[0].hand=['m1','m1','m1','red'];
    state.players[2].hand=[];state.players[3].hand=[];
    state.lastDiscard={seat:1,tile:'m1'};
    state.phase='resolving';
    offerPonOrAdvance();
    return {phase:state.phase,pending:state.pending};
  })()`);
  assert.equal(result.phase,'turn-start');
  assert.equal(result.pending,null);
  const x=run(`(()=>{
    state.players[0].hand=${JSON.stringify(readyHand)};
    state.players[0].discards=[];state.players[0].riichi=false;
    state.players[0].tempFuriten=false;state.players[0].riichiPassed=false;
    state.players[1].discards=['m1'];
    state.lastDiscard={seat:1,tile:'m1'};state.phase='resolving';
    resolveDiscard();
    return {phase:state.phase,kind:state.pending?.kind};
  })()`);
  assert.equal(x.phase,'human-response');
  assert.equal(x.kind,'ron-multi');
});

test('auto-win immediately takes a ready tsumo when enabled during turn',()=>{
  const {run}=setup();
  const x=run(`(()=>{
    state.players[0].hand=[...${JSON.stringify(readyHand)},'m1'];
    state.players[0].drawIndex=13;state.players[0].discards=[];
    state.phase='human-turn';
    const before=state.players[0].points;
    setPlayOption('autoWin','hand');
    return {phase:state.phase,outcome:state.outcome.type,winType:state.outcome.winType,winner:state.outcome.winner,
      points:state.players[0].points,before};
  })()`);
  assert.equal(x.phase,'hand-end');
  assert.equal(x.outcome,'win');
  assert.equal(x.winType,'tsumo');
  assert.equal(x.winner,0);
  assert.ok(x.points>x.before);
});

test('auto-win accepts human multi-ron alongside the CPU without losing the other claim',()=>{
  const {run}=setup();
  const x=run(`(()=>{
    playOptions.autoWin='hand';
    state.players.forEach((p,i)=>{
      p.hand=(i===0||i===2)?${JSON.stringify(readyHand)}:[];
      p.discards=[];p.melds=[];p.riichi=false;p.tempFuriten=false;p.riichiPassed=false;
    });
    state.players[1].discards=['m1'];
    state.lastDiscard={seat:1,tile:'m1'};state.phase='resolving';
    resolveDiscard();
    return {phase:state.phase,type:state.outcome?.type,winners:state.outcome?.winners.map(w=>w.winner)};
  })()`);
  assert.equal(x.phase,'hand-end');
  assert.equal(x.type,'multi-win');
  assert.deepEqual([...x.winners],[2,0]);
});

test('auto-win accepts multiple chankan claims before upgrading the kan',()=>{
  const {run}=setup();
  const x=run(`(()=>{
    playOptions.autoWin='hand';
    state.players.forEach((p,i)=>{
      p.hand=(i===0||i===2)?${JSON.stringify(readyHand)}:[];
      p.discards=[];p.melds=[];p.riichi=false;p.tempFuriten=false;p.riichiPassed=false;
    });
    state.players[1].melds=[{tile:'m1',kind:'pon',open:true,from:3}];
    state.players[1].hand=['m1',...Array(10).fill('green')];
    state.players[1].drawIndex=10;
    declareKan(1,'kakan','m1');
    return {phase:state.phase,type:state.outcome?.type,winners:state.outcome?.winners.map(w=>w.winner),kind:state.players[1].melds[0].kind};
  })()`);
  assert.equal(x.phase,'hand-end');
  assert.equal(x.type,'multi-win');
  assert.deepEqual([...x.winners],[2,0]);
  assert.equal(x.kind,'pon');
});

test('enabling auto-win during an existing ron prompt takes the win immediately',()=>{
  const {run}=setup();
  const x=run(`(()=>{
    state.players[0].hand=${JSON.stringify(readyHand)};
    state.players[0].discards=[];state.players[0].tempFuriten=false;state.players[0].riichiPassed=false;
    state.players[1].discards=['m1'];
    state.players[2].hand=[];state.players[3].hand=[];
    state.lastDiscard={seat:1,tile:'m1'};state.phase='resolving';
    resolveDiscard();
    const pending=state.pending.kind;
    setPlayOption('autoWin','hand');
    return {pending,phase:state.phase,type:state.outcome?.type,winner:state.outcome?.winner};
  })()`);
  assert.equal(x.pending,'ron-multi');
  assert.equal(x.phase,'hand-end');
  assert.equal(x.type,'win');
  assert.equal(x.winner,0);
});

// Pace is changed independently of discard choice and scoring decisions.
test('CPU animation delays are 1.75x faster, while human prompts retain their timing',()=>{
  const {run}=setup();
  const actual=run('({factor:CPU_SPEED_FACTOR,delay650:cpuPace(650),delay560:cpuPace(560),delay430:cpuPace(430),delay610:cpuPace(610)})');
  assert.equal(actual.factor,1.75);
  assert.equal(actual.delay650,371);
  assert.equal(actual.delay560,320);
  assert.equal(actual.delay430,246);
  assert.equal(actual.delay610,349);
});
