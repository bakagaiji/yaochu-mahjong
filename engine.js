/** Pure rules and scoring for 么九麻雀. No DOM or network dependencies. */
export const TILE_TYPES = [
  { id:'m1', name:'一萬', group:'man', digit:'1', glyph:'萬' },
  { id:'m9', name:'九萬', group:'man', digit:'9', glyph:'萬' },
  { id:'p1', name:'一筒', group:'pin', digit:'1', glyph:'筒' },
  { id:'p9', name:'九筒', group:'pin', digit:'9', glyph:'筒' },
  { id:'s1', name:'一索', group:'sou', digit:'1', glyph:'索' },
  { id:'s9', name:'九索', group:'sou', digit:'9', glyph:'索' },
  { id:'east', name:'東', group:'honor', glyph:'東' },
  { id:'south', name:'南', group:'honor', glyph:'南' },
  { id:'west', name:'西', group:'honor', glyph:'西' },
  { id:'north', name:'北', group:'honor', glyph:'北' },
  { id:'white', name:'白', group:'dragon', glyph:'白' },
  { id:'green', name:'發', group:'dragon', glyph:'發' },
  { id:'red', name:'中', group:'dragon', glyph:'中' },
];
export const IDS = TILE_TYPES.map(t=>t.id);
export const TILE_INFO = Object.fromEntries(TILE_TYPES.map(t=>[t.id,t]));
const WINDS = ['east','south','west','north'];
const DRAGONS = ['white','green','red'];
export const WALL_COPIES = 12;
export const RINSHAN_TILES = 8;
export const ABORTIVE_KANS = 8;

export function shuffle(arr, random=Math.random) {
  const result=[...arr];
  for(let i=result.length-1;i>0;i--){ const j=Math.floor(random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}
export function createWall(random=Math.random){ return shuffle(IDS.flatMap(id=>Array(WALL_COPIES).fill(id)),random); }
export function sortTiles(tiles){return [...tiles].sort((a,b)=>IDS.indexOf(a)-IDS.indexOf(b));}
export function tileCounts(tiles){const c=Array(13).fill(0);for(const t of tiles){const idx=IDS.indexOf(t);if(idx<0)throw new Error('Invalid tile '+t);c[idx]++;}return c;}
export function seatWind(seat,dealer){return WINDS[(seat-dealer+4)%4];}
export function getForms(tiles, melds=[]){
  const needed=14-3*melds.length;
  if(tiles.length!==needed)return [];
  const c=tileCounts(tiles), forms=[];
  if(!melds.length && c.every(v=>v>=1) && c.some(v=>v>=2))forms.push({kind:'kokushi'});
  if(!melds.length && c.filter(v=>v===2).length===7 && c.every(v=>v===0||v===2))forms.push({kind:'chiitoi'});
  for(let pair=0;pair<c.length;pair++){
    if(c[pair]<2)continue;
    const rest=[...c];rest[pair]-=2;
    if(rest.every(v=>v%3===0) && rest.reduce((n,v)=>n+v,0)===3*(4-melds.length)){
      const sets=[];
      rest.forEach((v,i)=>{for(let j=0;j<v/3;j++)sets.push(IDS[i]);});
      forms.push({kind:'standard',pair:IDS[pair],sets});
    }
  }
  return forms;
}
export function meldTiles(m){return Array(m.kind==='kan'?4:3).fill(m.tile);}
function fullTiles(tiles,melds){return [...tiles,...melds.flatMap(meldTiles)];}
function sameGroupOnly(whole,group){return whole.every(t=>TILE_INFO[t].group===group);}
function calcFu(form,context,allSets,completedTriplet){
  if(form.kind==='chiitoi')return 25;
  let fu=20;
  if(context.winType==='tsumo')fu+=2;
  else if(context.melds.length===0)fu+=10;
  const pair=form.pair;
  if(DRAGONS.includes(pair))fu+=2;
  if(pair===seatWind(context.seat,context.dealer))fu+=2;
  if(pair==='east')fu+=2;
  for(const set of allSets){
    const open=set.open || (completedTriplet===set.index);
    fu+=set.kan?(open?16:32):(open?4:8); // All sets are terminal/honor.
  }
  return Math.ceil(fu/10)*10;
}
export function baseFromHanFu(han,fu,yakuman=0){
  if(yakuman)return 8000*yakuman;
  if(han>=13)return 8000;
  if(han>=11)return 6000;
  if(han>=8)return 4000;
  if(han>=6)return 3000;
  if(han>=5 || (han===4&&fu>=40) || (han===3&&fu>=70))return 2000;
  return Math.min(2000,fu*(2**(han+2)));
}
const ceil100=n=>Math.ceil(n/100)*100;
export function calculatePayments(base,winType,winner,dealer,loser=null){
  const delta=[0,0,0,0];
  if(winType==='ron'){
    if(loser===null||loser===winner)throw new Error('Invalid ron loser');
    const amount=ceil100(base*(winner===dealer?6:4));
    delta[winner]+=amount;delta[loser]-=amount;
    return {delta,description:`ロン ${amount.toLocaleString('ja-JP')}点`,total:amount};
  }
  for(let s=0;s<4;s++){
    if(s===winner)continue;
    const amount=ceil100(base*(winner===dealer?2:s===dealer?2:1));
    delta[s]-=amount;delta[winner]+=amount;
  }
  const costs=winner===dealer?`${ceil100(base*2).toLocaleString('ja-JP')}点オール`:`${ceil100(base).toLocaleString('ja-JP')} / ${ceil100(base*2).toLocaleString('ja-JP')}点`;
  return {delta,description:`ツモ ${costs}`,total:delta[winner]};
}
function evaluateForm(form,tiles,context,completedAsPair){
  const {melds,winType,seat,dealer,riichi=false,ippatsu=false,rinshan=false,chankan=false}=context;
  const openHand=melds.some(m=>m.open!==false);
  const whole=fullTiles(tiles,melds);
  const allSets=[...melds.map((m,i)=>({tile:m.tile,open:m.open!==false,kan:m.kind==='kan',index:-1-i})),...(form.sets||[]).map((tile,i)=>({tile,open:false,index:i}))];
  const triplets=allSets.map(s=>s.tile);
  const yakuman=[];
  if(form.kind==='kokushi')yakuman.push('国士無双');
  if(form.kind==='standard'){
    if(DRAGONS.every(t=>triplets.includes(t)))yakuman.push('大三元');
    const winds=WINDS.filter(t=>triplets.includes(t)).length;
    if(winds===4)yakuman.push('大四喜');
    else if(winds===3&&WINDS.includes(form.pair))yakuman.push('小四喜');
    if(!openHand && (winType==='tsumo'||completedAsPair))yakuman.push('四暗刻');
    if(melds.filter(m=>m.kind==='kan').length===4)yakuman.push('四槓子');
  }
  if(whole.every(t=>['honor','dragon'].includes(TILE_INFO[t].group)))yakuman.push('字一色');
  if(whole.every(t=>!['honor','dragon'].includes(TILE_INFO[t].group)))yakuman.push('清老頭');
  const completedTriplet=(winType==='ron' && !completedAsPair && form.kind==='standard')
    ?form.sets.findIndex(t=>t===context.winningTile):-1;
  if(yakuman.length){
    return {form:form.kind, yaku:yakuman.map(name=>({name,han:0})),yakuman:yakuman.length,han:0,fu:0,base:baseFromHanFu(0,0,yakuman.length)};
  }
  const yaku=[];
  const add=(name,han)=>yaku.push({name,han});
  if(riichi && !openHand)add('立直',1);
  if(ippatsu && riichi && !openHand)add('一発',1);
  if(winType==='tsumo' && !openHand)add('門前清自摸和',1);
  if(rinshan && winType==='tsumo')add('嶺上開花',1);
  if(chankan && winType==='ron')add('槍槓',1);
  add('混老頭',2);
  if(form.kind==='standard'){
    add('対々和',2);
    // Eight copies of a tile may form two triplets: each yakuhai triplet scores separately.
    for(const t of DRAGONS)for(const found of triplets.filter(x=>x===t))add(`役牌・${TILE_INFO[found].glyph}`,1);
    const seatTile=seatWind(seat,dealer);
    for(const found of triplets.filter(x=>x===seatTile))add(`自風・${TILE_INFO[found].glyph}`,1);
    for(const found of triplets.filter(x=>x==='east'))add('場風・東',1);
    const closedTriplets=allSets.filter(s=>!s.open && s.index!==completedTriplet).length;
    if(closedTriplets>=3)add('三暗刻',2);
    if(melds.filter(m=>m.kind==='kan').length>=3)add('三槓子',2);
    if(DRAGONS.filter(t=>triplets.includes(t)).length===2 && DRAGONS.includes(form.pair))add('小三元',2);
    if(['1','9'].some(d=>['m','p','s'].every(g=>triplets.includes(`${g}${d}`))))add('三色同刻',2);
  } else if(form.kind==='chiitoi')add('七対子',2);
  const suitTypes=new Set(whole.filter(t=>!['honor','dragon'].includes(TILE_INFO[t].group)).map(t=>TILE_INFO[t].group));
  const haveHonor=whole.some(t=>['honor','dragon'].includes(TILE_INFO[t].group));
  if(suitTypes.size===1 && haveHonor)add('混一色',openHand?2:3);
  const han=yaku.reduce((n,y)=>n+y.han,0);
  const fu=calcFu(form,context,allSets,completedTriplet);
  return {form:form.kind,yaku,yakuman:0,han,fu,base:baseFromHanFu(han,fu)};
}
/** Context: {melds, seat, dealer, winType:'ron'|'tsumo', winningTile, riichi, ippatsu}. */
export function evaluateWin(tiles,context){
  const forms=getForms(tiles,context.melds||[]);
  if(!forms.length)return null;
  let best=null;
  for(const f of forms){
    const assignments=f.kind==='standard' && context.winType==='ron'
      ?[false,...(f.pair===context.winningTile?[true]:[])]:[false];
    for(const asPair of assignments){
      // If a ron tile is not used as the pair, it must complete one of the concealed triplets.
      if(context.winType==='ron'&&f.kind==='standard'&&!asPair&&!f.sets.includes(context.winningTile))continue;
      const r=evaluateForm(f,tiles,context,asPair);
      if(!best || r.base>best.base || (r.base===best.base&&r.han>best.han))best=r;
    }
  }
  return best;
}
/** Expected 13 - 3*melds concealed tiles. Returns winning tile ids (without using hidden knowledge). */
export function getWaits(tiles,melds=[]){
  if(tiles.length!==13-3*melds.length)return [];
  const c=tileCounts([...tiles,...melds.flatMap(meldTiles)]);
  return IDS.filter((id,i)=>c[i]<WALL_COPIES && getForms([...tiles,id],melds).length>0);
}
/** Minimum tiles to replace / draw until a complete 14-tile hand (one more than shanten). */
const missingMemo=new Map();
export function missingTiles(tiles,openMeldCount=0){
  const c=tileCounts(tiles),target=4-openMeldCount;
  const key=openMeldCount+':'+c.join(',');
  if(missingMemo.has(key))return missingMemo.get(key);
  let dp=Array.from({length:target+1},()=>[Infinity,Infinity]);dp[0][0]=0;
  for(const count of c){
    const next=Array.from({length:target+1},()=>[Infinity,Infinity]);
    for(let n=0;n<=target;n++)for(let p=0;p<=1;p++){
      const prior=dp[n][p];if(!Number.isFinite(prior))continue;
      for(let sets=0;sets<=Math.min(Math.floor(WALL_COPIES/3),target-n);sets++)for(let pair=0;pair<=1-p;pair++){
        const cost=Math.max(0,3*sets+2*pair-count);
        next[n+sets][p+pair]=Math.min(next[n+sets][p+pair],prior+cost);
      }
    }
    dp=next;
  }
  let missing=dp[target][1];
  if(!openMeldCount){
    const pairUse=c.map(v=>Math.min(v,2)).sort((a,b)=>b-a).slice(0,7).reduce((a,b)=>a+b,0);
    missing=Math.min(missing,14-pairUse);
    const distinct=c.filter(v=>v>0).length;
    missing=Math.min(missing,13-distinct+(c.some(v=>v>1)?0:1));
  }
  if(missingMemo.size>40000)missingMemo.clear();
  missingMemo.set(key,missing);
  return missing;
}
export function getTenpaiDiscards(hand,melds=[]){
  const found=[];
  for(let i=0;i<hand.length;i++){
    const copy=[...hand];copy.splice(i,1);
    if(getWaits(copy,melds).length)found.push(i);
  }
  return found;
}
