import {IDS,TILE_INFO,createWall,sortTiles,seatWind,evaluateWin,getWaits,getTenpaiDiscards,missingTiles,calculatePayments,scoreName,nextHandState,WALL_COPIES,RINSHAN_TILES,ABORTIVE_KANS,DORA_INDICATOR_PAIRS,meldTiles} from './engine.js';

const $=s=>document.querySelector(s);
const names=['あなた','CPU・青龍','CPU・白虎','CPU・朱雀'];
const windText={east:'東',south:'南',west:'西',north:'北'};
const storeKey='yaochu-mahjong-v5';
const legacyStoreKey='yaochu-mahjong-v4';
let state=null;
let timer=null;
let helpOpen=false;
let showWaits=false;
let busy=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function announce(message){state.notice=message;state.logs.unshift(message);state.logs=state.logs.slice(0,9);}
function save(){try{localStorage.setItem(storeKey,JSON.stringify(state));}catch{}}
function load(){
  try {
    const good=s=>Number.isInteger(s?.honba)&&s?.doraIndicators?.length===DORA_INDICATOR_PAIRS&&s?.uraIndicators?.length===DORA_INDICATOR_PAIRS;
    const current=JSON.parse(localStorage.getItem(storeKey));
    if(current?.version===5&&good(current)&&Number.isInteger(current.revealedKanDora)&&Number.isInteger(current.pendingKanDora))return current;
    // Old games remain playable: before v5 all kan-dora were revealed immediately.
    const old=JSON.parse(localStorage.getItem(legacyStoreKey));
    if(old?.version===4&&good(old))return {...old,version:5,revealedKanDora:Math.min(old.kanCount,ABORTIVE_KANS-1),pendingKanDora:0};
    return null;
  } catch {return null;}
}
function update(){render();save();}
function cancelTimer(){if(timer){clearTimeout(timer);timer=null;}}
function schedule(fn,ms=550){cancelTimer();timer=setTimeout(()=>{timer=null;fn();},ms);}
function newGame(){
  cancelTimer();busy=false;showWaits=false;
  state={version:5,round:1,honba:0,dealer:0,riichiPot:0,kanCount:0,revealedKanDora:0,pendingKanDora:0,rinshan:[],doraIndicators:[],uraIndicators:[],rinshanWin:false,players:names.map(name=>({name,points:50000,hand:[],melds:[],discards:[],riichi:false,ippatsu:false,justRiichi:false,riichiPassed:false,tempFuriten:false,forbidden:null,drawIndex:-1})),wall:[],turn:0,phase:'init',notice:'',logs:[],lastDiscard:null,pending:null,riichiSelecting:false,firstDiscard:[true,true,true,true],handEnded:false};
  startRound();
}
function startRound(){
  state.wall=createWall();
  state.rinshan=state.wall.splice(0,RINSHAN_TILES);
  // Each pair contains one visible indicator and one concealed ura indicator.
  const indicatorPool=state.wall.splice(0,DORA_INDICATOR_PAIRS*2);
  state.doraIndicators=indicatorPool.filter((_,i)=>i%2===0);
  state.uraIndicators=indicatorPool.filter((_,i)=>i%2===1);
  state.kanCount=0;state.revealedKanDora=0;state.pendingKanDora=0;state.rinshanWin=false;
  state.dealer=state.round-1;
  state.players.forEach(p=>{p.hand=[];p.melds=[];p.discards=[];p.riichi=false;p.ippatsu=false;p.justRiichi=false;p.riichiPassed=false;p.tempFuriten=false;p.drawIndex=-1;p.forbidden=null;});
  for(let i=0;i<13;i++)for(let p=0;p<4;p++)state.players[p].hand.push(state.wall.pop());
  for(const p of state.players)p.hand=sortTiles(p.hand);
  state.firstDiscard=[true,true,true,true];
  state.turn=state.dealer;
  state.phase='turn-start';state.pending=null;state.lastDiscard=null;state.riichiSelecting=false;
  announce(`東${state.round}局 ${state.honba}本場。親は${names[state.dealer]}。`);
  update();
  schedule(startTurn,700);
}
function context(seat,winType,winningTile){
  const p=state.players[seat];
  const indicators=Math.min(state.revealedKanDora+1,DORA_INDICATOR_PAIRS);
  return {melds:p.melds,seat,dealer:state.dealer,winType,winningTile,riichi:p.riichi,ippatsu:p.ippatsu,rinshan:state.rinshanWin,
    doraIndicators:state.doraIndicators.slice(0,indicators),uraIndicators:p.riichi?state.uraIndicators.slice(0,indicators):[]};
}
function makeWinCheck(seat,tile,type,extra={}){const p=state.players[seat];return evaluateWin(type==='tsumo'?p.hand:[...p.hand,tile],{...context(seat,type,tile),...extra});}
function isFuriten(seat){const p=state.players[seat];if(p.riichiPassed||p.tempFuriten)return true;const waits=getWaits(p.hand,p.melds);return waits.some(t=>p.discards.includes(t));}
function startTurn(){
  if(!state||state.handEnded)return;
  if(!state.wall.length){finishDraw();return;}
  const p=state.players[state.turn];
  p.tempFuriten=false;p.forbidden=null;
  state.rinshanWin=false;
  const tile=state.wall.pop();p.hand.push(tile);p.drawIndex=p.hand.length-1;
  state.lastDiscard=null;
  if(state.turn===0){
    state.phase='human-turn';
    const win=makeWinCheck(0,tile,'tsumo');
    announce(win?'ツモでアガれます！ 「ツモ」を押すか、牌を捨ててください。':'あなたの手番です。牌を選んで捨ててください。');
    update();
  }else{
    state.phase='cpu-turn';
    announce(`${p.name}の手番です。`);update();
    schedule(cpuTurn,650);
  }
}
function handOptions(p){const info=[];
  const seen=new Set();
  for(let i=0;i<p.hand.length;i++){
    if(p.riichi && i!==p.drawIndex)continue;
    if(p.forbidden && p.hand[i]===p.forbidden)continue;
    const copy=[...p.hand];const discarded=copy.splice(i,1)[0];
    const missing=missingTiles(copy,p.melds.length);
    let ukeire=0;
    const counts=Object.fromEntries(IDS.map(t=>[t,0]));
    for(const t of copy)counts[t]++;
    for(const m of p.melds)counts[m.tile]+=meldTiles(m).length;
    for(const pl of state.players){for(const t of pl.discards)counts[t]++;for(const m of pl.melds)if(m!==undefined && pl!==p)counts[m.tile]+=meldTiles(m).length;}
    for(const tile of IDS){
      const avail=Math.max(0,WALL_COPIES-counts[tile]);
      if(!avail)continue;
      const d=missingTiles([...copy,tile],p.melds.length);
      if(d<missing)ukeire+=avail;
    }
    const key=discarded;
    if(seen.has(key))continue;seen.add(key);
    // Prefer large improvement first, then broad acceptance; small randomness breaks ties.
    info.push({index:i,missing,ukeire,score:-missing*260+ukeire+(Math.random()*2)});
  }
  return info.sort((a,b)=>b.score-a.score);
}
function cpuTurn(){
  if(state.phase!=='cpu-turn')return;
  const seat=state.turn,p=state.players[seat];
  const tile=p.hand[p.drawIndex];
  const win=p.drawIndex>=0?makeWinCheck(seat,tile,'tsumo'):null;
  if(win){finishWin(seat,'tsumo',tile,null,win);return;}
  if(!p.riichi && p.drawIndex>=0){
    const candidates=getKanCandidates(p);
    if(candidates.length && Math.random()<0.86){
      const candidate=candidates[0];
      declareKan(seat,candidate.type,candidate.tile);return;
    }
  }
  const options=handOptions(p);
  const choice=options[0];
  if(!choice){console.error('CPU has no discard');return;}
  if(!p.riichi && !p.melds.length && p.points>=1000 && choice.missing===1 && Math.random()<0.82){
    declareRiichi(seat);
  }
  discard(seat,choice.index);
}
function declareRiichi(seat){
  const p=state.players[seat];p.points-=1000;state.riichiPot+=1000;p.riichi=true;p.ippatsu=true;p.justRiichi=true;
  announce(`${p.name}、リーチ！`);
}
function humanRiichi(){
  if(!state||state.phase!=='human-turn'||state.players[0].riichi)return;
  state.riichiSelecting=!state.riichiSelecting;
  if(state.riichiSelecting)announce('リーチする牌を選んでください。黄色い牌がリーチ可能な打牌です。');
  else announce('リーチ選択を解除しました。');
  update();
}
function humanTsumo(){
  if(!state||state.phase!=='human-turn')return;
  const p=state.players[0];if(p.drawIndex<0)return;
  const tile=p.hand[p.drawIndex],win=makeWinCheck(0,tile,'tsumo');
  if(win)finishWin(0,'tsumo',tile,null,win);
}
function humanDiscard(index){
  if(!state||state.phase!=='human-turn'||busy)return;
  const p=state.players[0];
  if(p.riichi && index!==p.drawIndex)return;
  if(p.forbidden && p.hand[index]===p.forbidden)return;
  if(state.riichiSelecting){
    if(!getTenpaiDiscards(p.hand,p.melds).includes(index))return;
    declareRiichi(0);
  }
  state.riichiSelecting=false;
  discard(0,index);
}
function discard(seat,index){
  const p=state.players[seat];
  const tile=p.hand.splice(index,1)[0];
  if(!tile)return;
  p.hand=sortTiles(p.hand);p.drawIndex=-1;p.forbidden=null;
  if(p.riichi && !state.firstDiscard[seat] && !state.riichiSelecting){
    // Ippatsu expires after the riichi player's next discard (unless that was the declaring discard).
    if(!p.justRiichi)p.ippatsu=false;
  }
  p.justRiichi=false;
  p.discards.push(tile);state.firstDiscard[seat]=false;state.rinshanWin=false;
  // A late-flip kan-dora is not exposed until this discard survives ron.
  state.lastDiscard={seat,tile};state.phase='resolving';
  announce(`${p.name}は${TILE_INFO[tile].name}を捨てました。`);update();
  schedule(resolveDiscard,seat===0?420:560);
}
function canRon(seat,discarder,tile){
  const p=state.players[seat];
  if(seat===discarder||isFuriten(seat))return null;
  return makeWinCheck(seat,tile,'ron');
}
function shouldCpuPon(seat,tile){
  const p=state.players[seat];if(p.riichi||p.hand.filter(t=>t===tile).length<2||p.melds.length>=4)return false;
  const before=missingTiles(p.hand,p.melds.length);
  const after=[...p.hand];after.splice(after.indexOf(tile),1);after.splice(after.indexOf(tile),1);
  let best=Infinity;
  for(let i=0;i<after.length;i++){
    if(after[i]===tile)continue;
    const remain=[...after];remain.splice(i,1);
    best=Math.min(best,missingTiles(remain,p.melds.length+1));
  }
  return best<before || (best===before && p.melds.length>0 && Math.random()<0.15);
}
function ronCandidates(disc,tile,extra={}){
  return [1,2,3].map(d=>(disc+d)%4).map(winner=>({
    winner,win:extra.chankan?(isFuriten(winner)?null:makeWinCheck(winner,tile,'ron',{chankan:true})):canRon(winner,disc,tile)
  })).filter(c=>c.win);
}
function finishRonCandidates(candidates,disc,tile){
  if(!candidates.length)throw new Error('No ron candidates');
  if(candidates.length===1){
    const {winner,win}=candidates[0];finishWin(winner,'ron',tile,disc,win);return;
  }
  // Every winner gets an independent ron settlement. Only the closest winner collects riichi sticks.
  cancelTimer();
  state.handEnded=true;state.phase='hand-end';state.pending=null;
  const pot=state.riichiPot;state.riichiPot=0;
  const indicators=Math.min(state.revealedKanDora+1,DORA_INDICATOR_PAIRS);
  const winners=candidates.map(({winner,win},i)=>{
    const p=state.players[winner];
    const pay=calculatePayments(win.base,'ron',winner,state.dealer,disc,state.honba);
    pay.delta.forEach((delta,seat)=>state.players[seat].points+=delta);
    const awardedPot=i===0?pot:0;
    if(awardedPot)state.players[winner].points+=awardedPot;
    return {winner,win,pay,pot:awardedPot,scoreName:scoreName(win),concealed:sortTiles([...p.hand]),melds:p.melds.map(m=>({...m})),
      doraIndicators:state.doraIndicators.slice(0,indicators),uraIndicators:p.riichi?state.uraIndicators.slice(0,indicators):[]};
  });
  state.outcome={type:'multi-win',winners,loser:disc,tile,honba:state.honba};
  announce(`${winners.length===2?'ダブロン':'トリロン'}！ ${winners.map(w=>names[w.winner]).join('・')}が${names[disc]}からアガりました。`);
  update();
}
function resolveDiscard(){
  if(!state||state.phase!=='resolving'||!state.lastDiscard)return;
  const {seat:disc,tile}=state.lastDiscard;
  // Resolve all simultaneous ron claims before any pon/kan. Everyone is paid by the discarder.
  const candidates=ronCandidates(disc,tile);
  if(!candidates.length){offerPonOrAdvance();return;}
  if(candidates.some(c=>c.winner===0)){
    state.phase='human-response';state.pending={kind:'ron-multi',tile,disc,candidates};
    announce(candidates.length>1?`ダブロン・トリロンのチャンス！ ${candidates.length}人がロンできます。`:'ロンできます。アガるか見送るかを選択してください。');
    update();return;
  }
  finishRonCandidates(candidates,disc,tile);

}
function offerPonOrAdvance(){
  revealPendingKanDora(); // Nobody won on the discard: reveal delayed daiminkan/kakan dora.
  const {seat:disc,tile}=state.lastDiscard;
  const p=state.players[0];
  if(disc!==0 && !p.riichi && p.melds.length<4 && p.hand.filter(t=>t===tile).length>=2){
    state.phase='human-response';state.pending={kind:'call',tile,disc,canKan:p.hand.filter(t=>t===tile).length>=3&&canKan()};
    announce(`${TILE_INFO[tile].name}を鳴けます。`);update();return;
  }
  cpuPonOrAdvance();
}
function cpuPonOrAdvance(){
  const {seat:disc,tile}=state.lastDiscard;
  for(const seat of [1,2,3].map(d=>(disc+d)%4)){
    if(seat!==0 && shouldCpuDaiminkan(seat,tile)){executeDaiminkan(seat,tile,disc);return;}
    if(seat!==0 && shouldCpuPon(seat,tile)){executePon(seat,tile,disc);return;}
  }
  state.pending=null;state.turn=(disc+1)%4;state.phase='turn-start';update();schedule(startTurn,430);
}
function humanRespond(accept){
  if(!state||state.phase!=='human-response'||!state.pending)return;
  const {kind,tile,disc,win,canKan:offeredKan,candidates}=state.pending;
  state.pending=null;
  if(kind==='ron-multi'||kind==='chankan-multi'){
    const remaining=accept?candidates:candidates.filter(c=>c.winner!==0);
    if(!accept){
      const p=state.players[0];p.tempFuriten=true;if(p.riichi)p.riichiPassed=true;
    }
    if(remaining.length){finishRonCandidates(remaining,disc,tile);return;}
    if(kind==='chankan-multi'){commitKakan(disc,tile);return;}
    state.phase='resolving';offerPonOrAdvance();return;
  }
  // Support decisions saved immediately before the multi-ron update.
  if(kind==='ron'){
    if(accept){finishWin(0,'ron',tile,disc,win);return;}
    const p=state.players[0];p.tempFuriten=true;if(p.riichi)p.riichiPassed=true;
    announce('ロンを見送りました。次の自摸まで同巡フリテンです。');state.phase='resolving';offerPonOrAdvance();return;
  }
  if(kind==='chankan'){
    if(accept){finishWin(0,'ron',tile,disc,win);return;}
    const p=state.players[0];p.tempFuriten=true;if(p.riichi)p.riichiPassed=true;
    commitKakan(disc,tile);return;
  }
  if(kind==='call' && accept){
    if(accept==='kan' && offeredKan){executeDaiminkan(0,tile,disc);return;}
    executePon(0,tile,disc);return;
  }
  state.phase='resolving';cpuPonOrAdvance();
}
function executePon(seat,tile,disc){
  const p=state.players[seat];
  for(let i=0;i<2;i++)p.hand.splice(p.hand.indexOf(tile),1);
  p.melds.push({tile,from:disc,kind:'pon',open:true});p.hand=sortTiles(p.hand);p.drawIndex=-1;p.forbidden=tile;
  state.players[disc].discards.pop();state.lastDiscard=null;
  state.players.forEach(pl=>pl.ippatsu=false);
  state.turn=seat;state.pending=null;
  announce(`${p.name}、ポン！`);
  if(seat===0){state.phase='human-turn';update();}
  else{state.phase='cpu-turn';update();schedule(cpuTurn,570);}
}
// One fixed 8-tile supplementary stack supports at most 7 successful kans.
function canKan(){return state.rinshan.length>0 && state.kanCount<ABORTIVE_KANS;}
function getKanCandidates(p){
  if(!canKan() || p.riichi || p.drawIndex<0)return [];
  const results=[];
  for(const tile of IDS){
    if(p.hand.filter(t=>t===tile).length>=4)results.push({type:'ankan',tile});
    if(p.hand.includes(tile) && p.melds.some(m=>m.tile===tile && m.kind!=='kan'))results.push({type:'kakan',tile});
  }
  return results;
}
function shouldCpuDaiminkan(seat,tile){
  const p=state.players[seat];
  return seat!==0 && !p.riichi && p.melds.length<4 && canKan() && p.hand.filter(t=>t===tile).length>=3 && Math.random()<0.76;
}
function humanKan(type,tile){
  if(!state || state.phase!=='human-turn' || busy)return;
  if(!getKanCandidates(state.players[0]).some(c=>c.type===type&&c.tile===tile))return;
  declareKan(0,type,tile);
}
function declareKan(seat,type,tile){
  const p=state.players[seat];
  if(!getKanCandidates(p).some(c=>c.type===type&&c.tile===tile))return;
  if(type==='kakan'){
    // A robbed added kan (chankan) is resolved before the tile is removed.
    const candidates=ronCandidates(seat,tile,{chankan:true});
    if(candidates.length){
      if(candidates.some(c=>c.winner===0)){
        state.phase='human-response';state.pending={kind:'chankan-multi',tile,disc:seat,candidates};
        announce(candidates.length>1?'槍槓で複数人がロンできます！':'槍槓でロンできます。');update();return;
      }
      finishRonCandidates(candidates,seat,tile);return;
    }
    commitKakan(seat,tile);return;
  }
  for(let i=0;i<4;i++)p.hand.splice(p.hand.indexOf(tile),1);
  p.melds.push({tile,from:seat,kind:'kan',open:false});
  finishKan(seat,'暗槓');
}
function commitKakan(seat,tile){
  const p=state.players[seat];
  const meld=p.melds.find(m=>m.tile===tile && m.kind!=='kan');
  if(!meld || !p.hand.includes(tile))return;
  p.hand.splice(p.hand.indexOf(tile),1);
  meld.kind='kan';meld.open=true;
  finishKan(seat,'加槓');
}
function executeDaiminkan(seat,tile,disc){
  const p=state.players[seat];
  if(!canKan() || p.hand.filter(t=>t===tile).length<3)return;
  for(let i=0;i<3;i++)p.hand.splice(p.hand.indexOf(tile),1);
  p.melds.push({tile,from:disc,kind:'kan',open:true});
  state.players[disc].discards.pop();
  finishKan(seat,'大明槓');
}
function revealPendingKanDora(){
  if(!state.pendingKanDora)return;
  state.revealedKanDora+=state.pendingKanDora;
  state.pendingKanDora=0;
  announce('カンドラがめくられました。');
}
function finishKan(seat,label){
  const p=state.players[seat];state.kanCount++;
  if(state.kanCount<ABORTIVE_KANS){
    // A consecutive kan exposes earlier deferred indicators before its next rinshan draw.
    revealPendingKanDora();
    if(label==='暗槓')state.revealedKanDora++;
    else state.pendingKanDora++; // Daiminkan and kakan: after a completed discard.
  }
  state.players.forEach(pl=>pl.ippatsu=false);
  state.pending=null;state.lastDiscard=null;state.riichiSelecting=false;
  state.turn=seat;p.forbidden=null;p.drawIndex=-1;
  announce(`${p.name}、${label}！ (${state.kanCount}カン)`);
  if(state.kanCount>=ABORTIVE_KANS){finishAbort();return;}
  if(!state.rinshan.length){finishAbort();return;}
  const tile=state.rinshan.pop();p.hand.push(tile);p.drawIndex=p.hand.length-1;
  state.rinshanWin=true;p.tempFuriten=false;
  const win=makeWinCheck(seat,tile,'tsumo');
  if(seat===0){
    state.phase='human-turn';announce(win?'嶺上開花でツモできます！':'嶺上牌を引きました。カンか打牌を選んでください。');update();
  }else{
    state.phase='cpu-turn';update();schedule(cpuTurn,610);
  }
}
function finishAbort(){
  cancelTimer();state.handEnded=true;state.phase='hand-end';state.pending=null;
  state.outcome={type:'abort',reason:'8カン流れ'};
  announce('8カン流れ！ この局は途中流局（点数移動なし）です。');update();
}
function finishWin(winner,winType,tile,loser,win){
  cancelTimer();
  state.handEnded=true;state.phase='hand-end';state.pending=null;
  const pay=calculatePayments(win.base,winType,winner,state.dealer,loser,state.honba);
  pay.delta.forEach((v,i)=>state.players[i].points+=v);
  const pot=state.riichiPot;state.players[winner].points+=pot;state.riichiPot=0;
  const scoreTitle=scoreName(win);
  const p=state.players[winner];
  const concealed=[...p.hand];
  if(winType==='tsumo' && p.drawIndex>=0)concealed.splice(p.drawIndex,1);
  const indicatorCount=Math.min(state.revealedKanDora+1,DORA_INDICATOR_PAIRS);
  state.outcome={type:'win',winner,winType,tile,loser,win,pay,pot,scoreName:scoreTitle,honba:state.honba,concealed:sortTiles(concealed),melds:p.melds.map(m=>({...m})),
    doraIndicators:state.doraIndicators.slice(0,indicatorCount),uraIndicators:p.riichi?state.uraIndicators.slice(0,indicatorCount):[]};
  announce(`${names[winner]}、${winType==='tsumo'?'ツモ':'ロン'}！ ${scoreTitle}${winner===state.dealer?'、親続行':''}。`);
  update();
}
function finishDraw(){
  cancelTimer();state.handEnded=true;state.phase='hand-end';state.pending=null;
  const ready=state.players.map(p=>getWaits(p.hand,p.melds).length>0);
  const n=ready.filter(Boolean).length;
  const deltas=[0,0,0,0];
  if(n>0&&n<4){
    const plus=3000/n,minus=3000/(4-n);
    for(let i=0;i<4;i++){deltas[i]=ready[i]?plus:-minus;state.players[i].points+=deltas[i];}
  }
  state.outcome={type:'draw',ready,deltas};
  announce('流局。テンパイ者とノーテン者で3,000点を精算します。');
  update();
}
function isTobi(){return state.players.some(p=>p.points<0);}
function nextRound(){
  if(!state||state.phase!=='hand-end')return;
  const next=nextHandState(state.round,state.honba,state.dealer,state.outcome);
  if(next.finished||isTobi()){
    if(state.riichiPot){const best=state.players.reduce((top,p,i)=>p.points>state.players[top].points?i:top,0);state.players[best].points+=state.riichiPot;state.riichiPot=0;}
    state.phase='game-end';state.handEnded=true;announce(isTobi()?'持ち点がマイナスになったため飛び終了。最終順位が決定しました。':'東風戦終了。最終順位が決定しました。');update();return;
  }
  state.round=next.round;state.honba=next.honba;state.handEnded=false;state.outcome=null;
  startRound();
}
function tileMarkup(id,additional='',kind='visible'){
  const t=TILE_INFO[id];if(!t)return '';
  let number='';
  if(t.id==='white'){
    number='<span class="tile-white-mark">白</span>';
  }else if(t.digit){
    const badge=t.group==='pin'?'<span class="tile-badge">筒</span>':
      t.group==='sou'?'<span class="tile-badge">索</span>':'';
    const suitClass=t.group==='man'?'tile-suit':'tile-suit tile-suit-small';
    number=`${badge}<span class="tile-num">${t.digit}</span><span class="${suitClass}">${t.glyph}</span>`;
  }else{
    number=`<span class="tile-kanji">${t.glyph}</span>`;
  }
  return `<span class="tile-face ${t.group} ${t.id} ${additional}" title="${t.name}">${number}</span>`;
}
function meldMarkup(m){
  const size=m.kind==='kan'?4:3;
  const tiles=Array.from({length:size},(_,i)=>m.open===false && (i===0||i===size-1)?'<span class="tile-back kan-back" title="暗槓"></span>':tileMarkup(m.tile)).join('');
  return `<span class="meld-tiles" title="${m.kind==='kan'?(m.open?'槓':'暗槓'):'ポン'}">${tiles}</span>`;
}
const f=n=>Number(n).toLocaleString('ja-JP');
function displayPlayer(p,i){
  const turn=state.turn===i && !state.handEnded;
  return `<div class="opp ${turn?'is-active':''}">
    <div class="opp-row"><span class="opp-avatar">${['人','龍','虎','雀'][i]}</span><div class="opp-title"><strong>${p.name}</strong><span>${windText[seatWind(i,state.dealer)]}家 ${p.riichi?'・リーチ':''}</span></div></div>
    <span class="opp-points">${f(p.points)} <small>点</small></span>
    <div class="opp-backs" aria-label="手牌${p.hand.length}枚">${Array.from({length:Math.min(p.hand.length,13)},()=>'<span class="tile-back"></span>').join('')}</div>
    ${p.melds.length?`<div class="opp-melds">${p.melds.map(m=>meldMarkup(m)).join('')}</div>`:''}
  </div>`;
}
function indicatorRow(label,indicators){
  return `<div class="indicator-row"><span class="indicator-caption">${label}</span><div class="indicator-tiles">${indicators.map(t=>tileMarkup(t)).join('')}</div></div>`;
}
function renderDoraIndicators(){
  const count=Math.min(state.revealedKanDora+1,DORA_INDICATOR_PAIRS);
  return indicatorRow('ドラ表示牌',state.doraIndicators.slice(0,count));
}
function renderResultDora(o){
  const visible=indicatorRow('ドラ表示牌',o.doraIndicators||[]);
  const ura=o.uraIndicators?.length?indicatorRow('裏ドラ表示牌',o.uraIndicators):'';
  const summary=o.win.yakuman?'役満のためドラ加算なし':`ドラ ${o.win.dora||0}翻 ／ 裏ドラ ${o.win.uraDora||0}翻`;
  return `<div class="result-indicators">${visible}${ura}<div class="dora-summary">${summary}</div></div>`;
}
function renderRiver(seat){
  const p=state.players[seat];const active=state.lastDiscard?.seat===seat;
  return `<div class="river river-${seat}"><div class="river-heading"><span>${p.name}</span><small>${p.discards.length}枚</small></div><div class="river-tiles">${p.discards.map((t,j)=>tileMarkup(t,active&&j===p.discards.length-1?'last-discard':'')).join('')}</div></div>`;
}
function renderHand(){
  const p=state.players[0];
  const canDiscard=state.phase==='human-turn';
  const readyChoices=state.riichiSelecting?getTenpaiDiscards(p.hand,p.melds):[];
  const drawnIndex=p.drawIndex;
  const canTsumo=canDiscard && drawnIndex>=0 && !!makeWinCheck(0,p.hand[drawnIndex],'tsumo');
  const canRiichi=canDiscard&&!p.riichi&&!p.melds.length&&p.points>=1000 && getTenpaiDiscards(p.hand,p.melds).length>0;
  const needAction=state.phase==='human-response';
  const showMelds=p.melds.length?`<div class="human-melds"><span class="small-caption">鳴き・カン</span>${p.melds.map(m=>`<div class="meld-block">${meldMarkup(m)}</div>`).join('')}</div>`:'';
  const buttons=p.hand.map((t,i)=>{
    const allowed=canDiscard && (!p.riichi||i===drawnIndex) && (!p.forbidden||p.forbidden!==t) && (!state.riichiSelecting||readyChoices.includes(i));
    return `<button class="hand-tile ${drawnIndex===i?'drawn':''} ${state.riichiSelecting&&readyChoices.includes(i)?'riichi-target':''}" data-discard="${i}" aria-label="${TILE_INFO[t].name}${drawnIndex===i?'（ツモ牌）':''}を捨てる" title="${TILE_INFO[t].name}" ${allowed?'':'disabled'}>${tileMarkup(t)}</button>`;
  }).join('');
  let action='';
  if(needAction){
    const isRon=['ron','ron-multi','chankan-multi'].includes(state.pending.kind);
    action=isRon||state.pending.kind==='chankan'?'<button class="btn btn-gold" data-action="accept">ロン！</button><button class="btn btn-light" data-action="decline">見送る</button>':`<button class="btn btn-gold" data-action="call-pon">ポン</button>${state.pending.canKan?'<button class="btn btn-gold" data-action="call-kan">大明槓</button>':''}<button class="btn btn-light" data-action="decline">見送る</button>`;
  }else if(canDiscard){
    action+=`<button class="btn btn-gold" data-action="tsumo" ${canTsumo?'':'disabled'}>ツモ！</button>`;
    action+=`<button class="btn ${state.riichiSelecting?'btn-gold':'btn-light'}" data-action="riichi" ${canRiichi||state.riichiSelecting?'':'disabled'}>${state.riichiSelecting?'リーチ解除':'リーチ −1,000'}</button>`;
    for(const candidate of getKanCandidates(p)){action+=`<button class="btn btn-light" data-kan-type="${candidate.type}" data-kan-tile="${candidate.tile}">${candidate.type==='ankan'?'暗槓':'加槓'}・${TILE_INFO[candidate.tile].name}</button>`;}
    action+=`<button class="btn btn-ghost" data-action="waits">${showWaits?'待ち表示を閉じる':'待ち牌を確認'}</button>`;
  }else{
    action=`<span class="waiting-action">${state.phase==='hand-end'?'この局は終了しました':state.phase==='game-end'?'東風戦終了':`対局進行中…`}</span>`;
  }
  let waitView='';
  if(showWaits){
    let waits=[];
    if(p.hand.length===13-3*p.melds.length){waits=getWaits(p.hand,p.melds);}
    else if(p.hand.length===14-3*p.melds.length){
      const choices=getTenpaiDiscards(p.hand,p.melds);
      waitView=choices.length?`<div class="wait-text">聴牌になる打牌：${[...new Set(choices.map(i=>TILE_INFO[p.hand[i]].name))].join('、')}</div>`:'<div class="wait-text">現状、捨て牌1枚でテンパイする形はありません。</div>';
    }
    if(waits.length)waitView=`<div class="wait-text">現在の待ち牌： ${waits.map(t=>TILE_INFO[t].name).join('、')}</div>`;
    else if(!waitView)waitView='<div class="wait-text">現在はテンパイしていません。</div>';
  }
  return `<div class="hand-top"><div><span class="section-kicker">YOUR HAND</span><h2>あなたの手牌 <small>${windText[seatWind(0,state.dealer)]}家</small></h2></div><span class="hand-detail">${p.hand.length+3*p.melds.length}枚 ${p.riichi?'・リーチ中':''}</span></div>
  <div class="hand-area" aria-label="あなたの手牌">${buttons}</div>${showMelds}<div class="control-row">${action}</div>${waitView}`;
}
function renderOutcome(){
  if(!['hand-end','game-end'].includes(state.phase))return '';
  if(state.phase==='game-end'){
    const ranking=state.players.map((p,i)=>({p,i})).sort((a,b)=>b.p.points-a.p.points);
    return `<div class="modal-layer"><section class="modal outcome" role="dialog" aria-modal="true" aria-label="対局終了"><span class="section-kicker">FINAL RESULT</span><h2>${isTobi()?'飛び終了':'東風戦 終了'}</h2><p>${isTobi()?'誰かの持ち点がマイナスになったため終局しました。':'東4局の親番終了まで戦い終えました。'}</p><div class="final-ranking">${ranking.map((o,i)=>`<div class="rank-row"><b>${i+1}位</b><span>${o.p.name}</span><strong>${f(o.p.points)}点</strong></div>`).join('')}</div><button class="btn btn-gold wide" data-action="restart">もう一度遊ぶ</button></section></div>`;
  }
  const o=state.outcome;
  if(!o)return '';
  const next=nextHandState(state.round,state.honba,state.dealer,o);
  const nextLabel=isTobi()?'飛び終了：最終結果を見る':next.finished?'最終結果を見る':next.repeat?`親続行：東${next.round}局 ${next.honba}本場へ`:`東${next.round}局 ${next.honba}本場へ進む`;
  const content=o.type==='multi-win'
  ?`<span class="section-kicker">MULTI RON · 東${state.round}局 ${state.honba}本場</span><h2>${o.winners.length===2?'ダブロン':'トリロン'}！</h2><p class="multi-ron-intro">${names[o.loser]}の捨て牌で${o.winners.length}人が同時にアガリました。放銃者がそれぞれに支払います。</p><div class="multi-win-list">${o.winners.map(w=>`<section class="multi-win-entry"><h3>${names[w.winner]}のアガリ</h3><div class="agari-row"><div class="agari-concealed">${w.concealed.map(t=>tileMarkup(t)).join('')}${tileMarkup(o.tile,'winning-tile')}</div>${w.melds.length?`<div class="agari-melds">${w.melds.map(m=>meldMarkup(m)).join('')}</div>`:''}</div>${renderResultDora(w)}<div class="big-score">${w.scoreName}</div><div class="pay-caption">${w.pay.description}${w.pot?` ＋供託${f(w.pot)}点`:''}</div><div class="yaku-list">${w.win.yaku.map(y=>`<span>${y.name}${y.han?` <b>${y.han}翻</b>`:''}</span>`).join('')}</div><p class="score-sub">${w.win.yakuman?'複合役満':w.win.han>=13?`数え${w.win.han}翻`:`${w.win.han}翻・${w.win.fu}符`}</p></section>`).join('')}</div>`
  :o.type==='win'
  ?`<span class="section-kicker">${o.winType==='tsumo'?'TSUMO':'RON'} · 東${state.round}局 ${state.honba}本場</span><h2>${names[o.winner]}のアガリ</h2><div class="agari-label">完成した手牌（右端がアガリ牌）</div><div class="agari-row"><div class="agari-concealed">${(o.concealed||[]).map(t=>tileMarkup(t)).join('')}${tileMarkup(o.tile,'winning-tile')}</div>${o.melds?.length?`<div class="agari-melds">${o.melds.map(m=>meldMarkup(m)).join('')}</div>`:''}</div>${renderResultDora(o)}<div class="big-score">${o.scoreName}</div><div class="pay-caption">${o.pay.description}${o.pot?` ＋供託${f(o.pot)}点`:''}</div><div class="yaku-list">${o.win.yaku.map(y=>`<span>${y.name}${y.han?` <b>${y.han}翻</b>`:''}</span>`).join('')}</div><p class="score-sub">${o.win.yakuman?'複合役満':o.win.han>=13?`数え${o.win.han}翻`:`${o.win.han}翻・${o.win.fu}符`}</p>`
  :o.type==='abort'?`<span class="section-kicker">ABORTIVE DRAW · 東${state.round}局 ${state.honba}本場</span><h2>8カン流れ</h2><p>8回目のカンが宣言されたため途中流局しました。ノーテン罰符はありません。</p>`
  :`<span class="section-kicker">RYŪKYOKU · 東${state.round}局 ${state.honba}本場</span><h2>流局</h2><p>山の牌がなくなりました。ノーテン罰符3,000点を精算します。</p><div class="draw-status">${state.players.map((p,i)=>`<div>${p.name}<b>${o.ready[i]?'テンパイ':'ノーテン'}</b><span>${o.deltas[i]>=0?'+':''}${f(o.deltas[i])}点</span></div>`).join('')}</div>`;
  return `<div class="modal-layer"><section class="modal outcome" role="dialog" aria-modal="true" aria-label="局の結果">${content}${isTobi()?'<p class="tobi-banner">持ち点がマイナスになったため、この局で終局します。</p>':''}<div class="mini-scores">${state.players.map((p,i)=>`<span>${p.name} <b>${f(p.points)}</b></span>`).join('')}</div><button class="btn btn-gold wide" data-action="next">${nextLabel}</button></section></div>`;
}
function renderHelp(){return `<div class="modal-layer" data-backdrop="help"><section class="modal help" role="dialog" aria-modal="true" aria-label="遊び方"><div class="modal-heading"><span class="section-kicker">HOW TO PLAY</span><button class="close" data-action="close-help" aria-label="閉じる">×</button></div><h2>么九麻雀の遊び方</h2><p>1・9の数牌6種類と字牌7種類だけを使い、あなた対CPU3人で戦う東風戦です。</p><div class="rule-grid"><div><b>牌は計156枚</b><span>13種類を各12枚。52枚を配牌、残り104枚のうち24枚をドラ表示牌8枚・裏ドラ表示牌8枚・嶺上牌8枚として確保します。通常山は80枚です。</span></div><div><b>アガリの形</b><span>刻子4組＋雀頭、七対子、国士無双。順子は作れません。</span></div><div><b>できる宣言</b><span>リーチ・ポン・ロン・ツモ・暗槓・大明槓・加槓。チー・赤ドラはありません。ドラ・裏ドラ・カンドラ・カン裏ドラがあります。</span></div><div><b>点数と進行</b><span>5万点持ち。通常の翻・符を基準に計算します。親アガリ・親テンパイ流局は親続行。ロンは1本場+300点、ツモは各家+100点。通常流局・8カン流れで本場が増えます。誰かの持ち点がマイナスになったら飛び終了です（0点ちょうどは続行）。</span></div><div><b>ロンとフリテン</b><span>自分の捨て牌に待ち牌があればロン不可。ロン見送り後は次の自摸まで不可（リーチ中の見送りは局終了まで不可）。同時ロンはダブロン・トリロンを認め、放銃者が各アガリ者に支払います。供託は放銃者から近い順の最初のアガリ者に渡し、全員分を精算した後に飛び判定します。</span></div><div><b>流局</b><span>通常の山が尽きると流局（3,000点精算）。8カン流れは途中流局（精算なし・親続行）。通常流局は親がテンパイなら親続行です。立直アガリには裏ドラ、暗槓は即めくり、明槓・加槓は打牌が成立してからめくります（連続カン時は次の嶺上ツモ前）。役満にはドラを加算しません。リーチ供託は次局へ持ち越し。</span></div></div><p class="help-note">么九牌12枚仕様に合わせたオリジナルルールです。ドラは1↔9、東→南→西→北→東、白→發→中→白の順で、重複表示牌のドラも重複計算します。カン後は嶺上牌を引き、嶺上開花・槍槓もあります。立直後のカンは不可。暗槓への国士無双の槍槓は採用しません。ポン直後の同種打牌は不可。CPUは他家の手牌を覗きません。</p><button class="btn btn-gold wide" data-action="close-help">対局に戻る</button></section></div>`;}
function render(){
  if(!state)return;
  $('#round-label').textContent=`東${state.round}局 ${state.honba}本場`;
  $('#dealer-label').textContent=`親：${names[state.dealer]}`;
  $('#wall-count').textContent=state.wall.length;
  $('#riichi-pot').textContent=f(state.riichiPot);
  $('#kan-count').textContent=state.kanCount;
  $('#dora-panel').innerHTML=renderDoraIndicators();
  $('#opp-grid').innerHTML=[1,2,3].map(i=>displayPlayer(state.players[i],i)).join('');
  $('#river-grid').innerHTML=[2,3,1,0].map(i=>renderRiver(i)).join('');
  $('#my-score').textContent=f(state.players[0].points);
  $('#hand-panel').innerHTML=renderHand();
  $('#notice').textContent=state.notice;
  $('#logs').innerHTML=state.logs.slice(0,5).map((s,i)=>`<div class="log-entry ${i===0?'latest':''}">${s}</div>`).join('');
  $('#overlays').innerHTML=(helpOpen?renderHelp():'')+(!helpOpen?renderOutcome():'');
}
document.addEventListener('click',event=>{
  const kan=event.target.closest('[data-kan-type]');if(kan){humanKan(kan.dataset.kanType,kan.dataset.kanTile);return;}
  const tile=event.target.closest('[data-discard]');if(tile){humanDiscard(Number(tile.dataset.discard));return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(!action)return;
  if(action==='tsumo')humanTsumo();
  else if(action==='riichi')humanRiichi();
  else if(action==='waits'){showWaits=!showWaits;update();}
  else if(action==='accept')humanRespond(true);
  else if(action==='decline')humanRespond(false);
  else if(action==='call-pon')humanRespond('pon');
  else if(action==='call-kan')humanRespond('kan');
  else if(action==='help'){helpOpen=true;render();}
  else if(action==='close-help'){helpOpen=false;render();}
  else if(action==='next')nextRound();
  else if(action==='restart')newGame();
  else if(action==='new-game'){if(confirm('現在の対局を終了し、新しく始めますか？'))newGame();}
});
// The game resumes safely after a browser refresh at the next unresolved action.
state=load();
if(!state){newGame();}
else{
  render();
  if(state.phase==='cpu-turn')schedule(cpuTurn,550);
  else if(state.phase==='turn-start')schedule(startTurn,550);
  else if(state.phase==='resolving')schedule(resolveDiscard,550);
}
