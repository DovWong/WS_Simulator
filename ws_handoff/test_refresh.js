const m = require('./harness.js');
const { DEFS, initialState, activateConcentrate } = m;
let _id=1; const uid=()=>_id++;
function card(key){ return { id:uid(), key, def:DEFS[key], state:'stand' }; }
const FILLER='v0_3000';
function setup({deckKeys, wrKeys=[]}){
  const s = initialState('npc', {p0:'你',p1:'NPC'});
  s.turnPlayer = 0;
  const P = s.players[0];
  P.deck = deckKeys.map(card);
  P.wr   = wrKeys.map(card);
  P.hand = []; P.stock=[card(FILLER)]; P.clock=[]; P.level=[]; P.resolution=[];
  const conc = card('s_1000_concentrate'); conc.state='stand';
  P.stage = [conc,null,null,null,null];
  s.winner=null; s.log=[]; s.banners=[];
  return s;
}
function summary(s){const P=s.players[0];return{deck:P.deck.length,wr:P.wr.length,hand:P.hand.length,clock:P.clock.length,resolution:P.resolution.length,refreshes:s.log.filter(l=>l.includes('Refresh！')).length,penalties:s.log.filter(l=>l.includes('罰傷')).length};}
function totalCards(s){const P=s.players[0];return P.deck.length+P.wr.length+P.hand.length+P.clock.length+P.level.length+P.resolution.length+P.stage.filter(x=>x).length+P.stock.length;}
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}

// deck=2 wr=3: flip2 -> resolution -> wr -> refresh penalty1
{const s=setup({deckKeys:[FILLER,FILLER],wrKeys:[FILLER,FILLER,FILLER]});const before=totalCards(s);activateConcentrate(s,0);const r=summary(s);
 assert('A deck2/wr3: 1 refresh',r.refreshes===1,r);assert('A: 1 penalty',r.penalties===1,r);assert('A: resolution empty',r.resolution===0);assert('A: no card lost',totalCards(s)===before,{before,after:totalCards(s)});assert('A: not deckout',s.winner===null);}

// deck=3 wr=4: flip3 -> deck0 wr has cards -> mid refresh penalty1 -> flip 4th -> resolve
{const s=setup({deckKeys:[FILLER,FILLER,FILLER],wrKeys:[FILLER,FILLER,FILLER,FILLER]});const before=totalCards(s);activateConcentrate(s,0);const r=summary(s);
 assert('B deck3/wr4: 1 refresh',r.refreshes===1,r);assert('B: 1 penalty',r.penalties===1,r);assert('B: flipped 4 (resolution empty, in wr)',r.resolution===0);assert('B: no card lost',totalCards(s)===before);assert('B: not deckout',s.winner===null);}

// deck=4 wr=2: flip4 -> deck0 after settle -> refresh penalty1
{const s=setup({deckKeys:[FILLER,FILLER,FILLER,FILLER],wrKeys:[FILLER,FILLER]});const before=totalCards(s);activateConcentrate(s,0);const r=summary(s);
 assert('C deck4/wr2: 1 refresh',r.refreshes===1,r);assert('C: 1 penalty',r.penalties===1,r);assert('C: no card lost',totalCards(s)===before);assert('C: not deckout',s.winner===null);}

// deck=5 wr=0: flip4, deck=1 left, NO refresh
{const s=setup({deckKeys:[FILLER,FILLER,FILLER,FILLER,FILLER],wrKeys:[]});const before=totalCards(s);activateConcentrate(s,0);const r=summary(s);
 assert('D deck5: no refresh',r.refreshes===0,r);assert('D: no penalty',r.penalties===0);assert('D: deck 1 left',r.deck===1,r);assert('D: no card lost',totalCards(s)===before);}

// deck=2 wr=0 (THE edge): flip2 (deck empties, wr empty -> stop) -> cards to wr -> final refresh penalty1. NOT deckout.
{const s=setup({deckKeys:[FILLER,FILLER],wrKeys:[]});const before=totalCards(s);activateConcentrate(s,0);const r=summary(s);
 assert('E deck2/wr0: NOT false deckout',s.winner===null,{winner:s.winner,...r});assert('E: 1 refresh',r.refreshes===1,r);assert('E: 1 penalty',r.penalties===1);assert('E: resolution empty',r.resolution===0);assert('E: no card lost',totalCards(s)===before,{before,after:totalCards(s)});}

// deck=0 wr=0 truly empty (only stock cost card exists): paying cost puts 1 in wr -> flips can refresh from it. observe not crash.
{const s=setup({deckKeys:[],wrKeys:[]});const before=totalCards(s);activateConcentrate(s,0);const r=summary(s);
 assert('F deck0/wr0: no card lost',totalCards(s)===before,{before,after:totalCards(s)});console.log('   [F]',JSON.stringify(r),'winner=',s.winner);}

console.log('--- corrected edge expectations ---');
// E-corrected: deck2 + cost1 = 3 real cards, concentrate needs 4 -> genuine deck out is CORRECT.
{const s=setup({deckKeys:[FILLER,FILLER],wrKeys:[]});activateConcentrate(s,0);
 assert('E* deck2/wr0: genuine deckout (only 3 cards, need 4)',s.winner===1,{winner:s.winner});}

// G: deck2 + wr1(non-cost) + cost1 = 4 cards total -> can flip exactly 4, no deckout.
{const s=setup({deckKeys:[FILLER,FILLER],wrKeys:[FILLER]});const before=totalCards(s);activateConcentrate(s,0);const r=summary(s);
 assert('G deck2/wr1(+cost): NOT deckout (4 cards avail)',s.winner===null,{winner:s.winner,...r});
 assert('G: no card lost',totalCards(s)===before,{before,after:totalCards(s)});}
