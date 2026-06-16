const m=require('./harness.js');
const {DEFS,initialState,startPhaseChain}=m;
let _id=800000; const uid=()=>_id++;
function card(key){return {id:uid(),key,def:DEFS[key],state:'stand'};}
const FILLER='v0_3000';
const CXKEY=Object.keys(DEFS).find(k=>DEFS[k].type==='CX');
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}

for(let trial=0;trial<50;trial++){
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{cxRecycle:true});
  s.turnPlayer=0; s.phase='stand';
  const N=s.players[1];
  // wr: 3 CX + 4 fillers ; deck: 10 fillers
  N.wr=[card(CXKEY),card(CXKEY),card(CXKEY),card(FILLER),card(FILLER),card(FILLER),card(FILLER)];
  N.deck=Array.from({length:10},()=>card(FILLER));
  const cxInWrBefore=N.wr.filter(c=>c.def.type==='CX').length;
  const cxInDeckBefore=N.deck.filter(c=>c.def.type==='CX').length;
  startPhaseChain(s);
  const cxInDeckAfter=N.deck.filter(c=>c.def.type==='CX').length;
  const cxInWrAfter=N.wr.filter(c=>c.def.type==='CX').length;
  if(trial===0){
    assert('CXR: exactly 1 CX moved wr->deck', cxInDeckAfter===cxInDeckBefore+1, {before:cxInDeckBefore,after:cxInDeckAfter});
    assert('CXR: wr CX decreased by exactly 1', cxInWrAfter===cxInWrBefore-1, {before:cxInWrBefore,after:cxInWrAfter});
  }
  if(cxInDeckAfter!==cxInDeckBefore+1){assert('CXR trial '+trial+': 1 CX moved',false,{before:cxInDeckBefore,after:cxInDeckAfter});break;}
}
console.log('CXR: 50 trials, all moved exactly 1 CX');
