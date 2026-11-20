const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const engine=read('engine.js').replaceAll('export ','');
const app=read('app.js').replace(/^import .*?\n/,'');
const markup=read('index.html');
const stylesheet=read('style.css');

function setup(seed={}){
  const data={...seed},nodes=new Map(),handlers=new Map();
  const node=key=>{
    if(!nodes.has(key))nodes.set(key,{
      innerHTML:'',textContent:'',hidden:false,className:'',attributes:{},
      setAttribute(key,value){this.attributes[key]=value;}
    });
    return nodes.get(key);
  };
  const ctx={
    console,Math,
    localStorage:{getItem(key){return data[key]??null;},setItem(key,value){data[key]=value;}},
    setTimeout(){return 1;},clearTimeout(){},
    confirm(){return true;},
    document:{querySelector:node,addEventListener(type,handler){handlers.set(type,handler);}}
  };
  vm.createContext(ctx);
  vm.runInContext(engine+'\n'+app,ctx);
  return {
    data,node,run:code=>vm.runInContext(code,ctx),
    click(action){
      handlers.get('click')({target:{
        closest(selector){
          return selector==='[data-action]'?{dataset:{action}}:null;
        }
      }});
    }
  };
}

test('two table modes exist in both the interface and stylesheet',()=>{
  for(const id of ['view-standard','view-tabletop','standard-table','standard-player-zone',
    'topdown-view','td-seat-1','td-seat-2','td-seat-3',
    'td-river-0','td-river-1','td-river-2','td-river-3','td-hand-panel','td-notice']){
    assert.match(markup,new RegExp('id="'+id+'"'));
  }
  assert.match(stylesheet,/\.topdown-mat/);
  assert.match(stylesheet,/\.td-river-top/);
  assert.match(stylesheet,/\[hidden\]\{display:none!important\}/);
  assert.match(markup,/卓上表示/);
});

test('standard mode is the default, and switching preserves the entire match state',()=>{
  const {run,node,click,data}=setup();
  assert.equal(run('viewMode'),'standard');
  assert.equal(node('#standard-table').hidden,false);
  assert.equal(node('#standard-player-zone').hidden,false);
  assert.equal(node('#topdown-view').hidden,true);
  const before=run('JSON.stringify(state)');
  click('view-tabletop');
  assert.equal(run('viewMode'),'tabletop');
  assert.equal(node('#standard-table').hidden,true);
  assert.equal(node('#standard-player-zone').hidden,true);
  assert.equal(node('#topdown-view').hidden,false);
  assert.equal(node('#view-tabletop').attributes['aria-pressed'],'true');
  assert.equal(data['yaochu-mahjong-table-view-v1'],'tabletop');
  assert.equal(run('JSON.stringify(state)'),before);
  click('view-standard');
  assert.equal(run('viewMode'),'standard');
  assert.equal(node('#view-standard').attributes['aria-pressed'],'true');
  assert.equal(run('JSON.stringify(state)'),before);
});

test('tabletop shows the actual positions, hidden opponent hands and four discards',()=>{
  const {run,node}=setup();
  run(`(()=>{
    state.players[2].discards=['m1','red'];
    state.players[3].discards=['p9'];
    state.players[1].melds=[{tile:'south',kind:'pon',open:true,from:3}];
    state.players[1].hand=['white','green','red'];
    state.lastDiscard={seat:2,tile:'red'};
    state.turn=2;
    state.players[2].points=65000;
    setViewMode('tabletop');
  })()`);
  assert.match(node('#td-seat-2').innerHTML,/CPU・白虎/);
  assert.match(node('#td-seat-1').innerHTML,/CPU・青龍/);
  assert.match(node('#td-seat-3').innerHTML,/CPU・朱雀/);
  assert.match(node('#td-seat-2').innerHTML,/65,000/);
  assert.match(node('#td-seat-1').innerHTML,/class="tile-back"/);
  assert.doesNotMatch(node('#td-seat-1').innerHTML,/class="tile-face dragon white/);
  assert.match(node('#td-river-2').innerHTML,/last-discard/);
  assert.match(node('#td-river-2').innerHTML,/一萬/);
  assert.match(node('#td-river-3').innerHTML,/九筒/);
  assert.match(node('#td-river-0').innerHTML,/あなた/);
  assert.match(node('#td-dora').innerHTML,/ドラ表示牌/);
  assert.equal(node('#td-seat-2').className.includes('is-active'),true);
  assert.match(node('#td-hand-panel').innerHTML,/data-play-option="fullAi"/);
});

test('tabletop mode persists when reloading without modifying match save',()=>{
  const first=setup();
  first.run("setViewMode('tabletop')");
  const second=setup(first.data);
  assert.equal(second.run('viewMode'),'tabletop');
  assert.equal(second.node('#topdown-view').hidden,false);
  assert.equal(second.node('#standard-table').hidden,true);
  second.click('view-standard');
  const third=setup(second.data);
  assert.equal(third.run('viewMode'),'standard');
});

test('mode changes still leave the regular hand and action markup intact',()=>{
  const {run,node}=setup();
  run(`(()=>{
    const p=state.players[0];
    p.hand=['m1','m9','p1','p9','s1','s9','east','south','west','north','white','green','red','m1'];
    p.drawIndex=13;state.phase='human-turn';
    setViewMode('tabletop');
  })()`);
  const hand=node('#td-hand-panel').innerHTML;
  assert.match(hand,/data-discard="13"/);
  assert.match(hand,/data-action="discard-drawn"/);
  assert.match(hand,/data-play-option="noCalls"/);
  assert.equal(hand,node('#hand-panel').innerHTML);
  assert.match(node('#td-self-score').textContent,/50,000 点/);
});
