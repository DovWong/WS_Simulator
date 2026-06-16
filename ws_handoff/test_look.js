const m=require('./harness.js');
const {DEFS,initialState,resolvePending}=m;
let _id=1;const uid=()=>_id++;
function card(key){return{id:uid(),key,def:DEFS[key],state:'stand'};}
const FILLER='v0_3000';
function totalCards(s){const P=s.players[0];return P.deck.length+P.wr.length+P.hand.length+P.clock.length+P.level.length+P.resolution.length+P.stage.filter(x=>x).length+P.stock.length;}
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}
function refreshes(s){return s.log.filter(l=>l.includes('Refresh！')).length;}
function penalties(s){return s.log.filter(l=>l.includes('罰傷')).length;}

// BLUE3_LOOK3 NPC path (resolvePending with pending.type BLUE3_LOOK3, NPC keepId given)
// deck=2: look should cap at 2 (can't look 3), pick 1, others to wr, THEN refresh.
function setupLook(deckN, wrN){
  const s=initialState('npc',{p0:'你',p1:'NPC'}); s.turnPlayer=0;
  const P=s.players[0];
  P.deck=Array.from({length:deckN},()=>card(FILLER));
  P.wr=Array.from({length:wrN},()=>card(FILLER));
  P.hand=[];P.clock=[];P.level=[];P.resolution=[];P.stock=[];
  P.stage=[null,null,null,null,null];
  s.winner=null;s.log=[];s.banners=[];
  return s;
}
// deck=2 wr=1, look-3 (capped to 2), keep first, refresh after pick
{
  const s=setupLook(2,1);const P=s.players[0];
  const top2=P.deck.slice(-2); // would be looked
  s.pending={type:'BLUE3_LOOK3',pIdx:0};
  const before=totalCards(s);
  // choice keepId = the would-be-first-looked card's id (top of deck = last in array)
  const keepId=P.deck[P.deck.length-1].id;
  resolvePending(s,{keepId});
  assert('LOOK deck2/wr1: capped look, not deckout',s.winner===null,{winner:s.winner});
  assert('LOOK: refresh fired after pick (deck emptied)',refreshes(s)===1,{r:refreshes(s),pen:penalties(s),deck:P.deck.length,wr:P.wr.length,hand:P.hand.length});
  assert('LOOK: 1 card kept to hand',P.hand.length===1,{hand:P.hand.length});
  assert('LOOK: no card lost',totalCards(s)===before,{before,after:totalCards(s)});
}
// deck=5 wr=0, look-3, keep 1 -> NO refresh (deck still has 2)
{
  const s=setupLook(5,0);const P=s.players[0];
  s.pending={type:'BLUE3_LOOK3',pIdx:0};
  const keepId=P.deck[P.deck.length-1].id;
  const before=totalCards(s);
  resolvePending(s,{keepId});
  assert('LOOK deck5: no refresh (2 left)',refreshes(s)===0,{r:refreshes(s),deck:P.deck.length});
  assert('LOOK deck5: deck has 2 left',P.deck.length===2,{deck:P.deck.length});
  assert('LOOK deck5: no card lost',totalCards(s)===before);
}
