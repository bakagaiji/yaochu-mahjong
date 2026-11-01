const fs=require('node:fs'); const vm=require('node:vm'); const path=require('node:path');
const engine=fs.readFileSync(path.join(__dirname,'../engine.js'),'utf8').replaceAll('export ','');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8').replace(/^import .*?\n/,'');
const dummynode=()=>({innerHTML:'',textContent:''});
function simulate(){
 const timers=[];let counter=0;
 const ctx={console,setTimeout(fn,ms){const id=++counter;timers.push({id,fn});return id;},clearTimeout(id){const idx=timers.findIndex(x=>x.id===id);if(idx>=0)timers.splice(idx,1);},Math,localStorage:{getItem(){return null},setItem(){}},document:{querySelector:dummynode,addEventListener(){}},confirm(){return true}};
 vm.createContext(ctx);
 let run=`${engine}\n${app}\n`;
 vm.runInContext(run,ctx,{filename:'majiang.js'});
 const status=()=>vm.runInContext('({phase:state.phase, round:state.round, wall:state.wall.length, kans:state.kanCount, points:state.players.map(p=>p.points), pot:state.riichiPot})',ctx);
 let step=0;const max=3000;
 while(step<max){
  const s=status();
  if(s.phase==='game-end')return {s,step};
  let expression=null;
  if(s.phase==='human-turn')expression=`{const p=state.players[0];if(p.drawIndex>=0&&makeWinCheck(0,p.hand[p.drawIndex],'tsumo'))humanTsumo();else{const candidates=handOptions(p);if(!candidates.length)throw Error('No human discard');humanDiscard(candidates[0].index);}}`;
  else if(s.phase==='human-response')expression=`humanRespond(state.pending.kind==='ron'||state.pending.kind==='chankan'?'ron':state.pending.canKan?'kan':'pon')`;
  else if(s.phase==='hand-end')expression=`nextRound()`;
  if(expression)vm.runInContext(expression,ctx);
  else {
   if(!timers.length)throw Error('Deadlock '+JSON.stringify(s));
   const {fn}=timers.shift();fn();
  }
  step++;
 }
 throw Error('too many steps '+JSON.stringify(status()));
}
for(let j=0;j<5;j++){
  const {s,step}=simulate();
  const total=s.points.reduce((a,b)=>a+b,0)+s.pot;
  if(total!==200000)throw Error('Point leak: '+JSON.stringify(s));
  if((j+1)%1===0)console.log('completed',j+1,'games last steps',step,'points',s.points);
}
