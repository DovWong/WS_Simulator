const m=require('./harness.js');
const {DEFS,initialState,activateConcentrate}=m;
let _id=1;const uid=()=>_id++;
const KEYS=Object.keys(DEFS);
function rndCard(){const k=KEYS[Math.floor(Math.random()*KEYS.length)];return{id:uid(),key:k,def:DEFS[k],state:'stand'};}
function totalCards(s){const P=s.players[0];return P.deck.length+P.wr.length+P.hand.length+P.clock.length+P.level.length+P.resolution.length+P.stage.filter(x=>x).length+P.stock.length;}
function idMultiset(s){const P=s.players[0];const all=[...P.deck,...P.wr,...P.hand,...P.clock,...P.level,...P.resolution,...P.stage.filter(x=>x),...P.stock];return all.map(c=>c.id).sort((a,b)=>a-b);}
let fails=0,runs=0;
for(let t=0;t<5000;t++){
  const deckN=Math.floor(Math.random()*8), wrN=Math.floor(Math.random()*8), stockN=1+Math.floor(Math.random()*3);
  const s=initialState('npc',{p0:'你',p1:'NPC'}); s.turnPlayer=0;
  const P=s.players[0];
  P.deck=Array.from({length:deckN},rndCard);
  P.wr=Array.from({length:wrN},rndCard);
  P.hand=[];P.clock=[];P.level=[];P.resolution=[];
  P.stock=Array.from({length:stockN},rndCard);
  const conc={id:uid(),key:'s_1000_concentrate',def:DEFS['s_1000_concentrate'],state:'stand'};
  P.stage=[conc,null,null,null,null];
  s.winner=null;s.log=[];s.banners=[];
  const before=totalCards(s), beforeIds=idMultiset(s).join(',');
  try{ activateConcentrate(s,0); }catch(e){ console.log('CRASH',{deckN,wrN,stockN},e.message); fails++; continue; }
  runs++;
  const after=totalCards(s), afterIds=idMultiset(s).join(',');
  if(before!==after){console.log('CARD COUNT CHANGED',{deckN,wrN,stockN,before,after});fails++;}
  else if(beforeIds!==afterIds){console.log('CARD IDENTITY CHANGED (dup/loss)',{deckN,wrN,stockN});fails++;}
  // resolution must always be emptied after concentrate completes
  if(P.resolution.length!==0){console.log('RESOLUTION NOT EMPTY',{deckN,wrN,stockN,res:P.resolution.length});fails++;}
}
console.log(`\nFUZZ done: ${runs} runs, ${fails} failures`);
process.exitCode=fails?1:0;
