const m=require('./harness.js');
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}
const R=(s,a)=>m.gameReducer(s,a);

let s=m.makeSandboxState();
assert('sandbox: flag set', s.sandbox===true);
assert('sandbox: hands/stage empty', s.players[0].hand.length===0 && s.players[0].stage.every(x=>x===null));
assert('sandbox: deck filled (50)', s.players[0].deck.length===50);

// place a card on stage
s=R(s,{type:'SANDBOX_OP',op:'placeStage',pIdx:0,slot:0,key:'s_1000_concentrate',state:'stand'});
assert('placeStage', s.players[0].stage[0] && s.players[0].stage[0].key==='s_1000_concentrate' && s.players[0].stage[0].state==='stand');

// set state of that card
s=R(s,{type:'SANDBOX_OP',op:'setStageState',pIdx:0,slot:0,state:'rest'});
assert('setStageState rest', s.players[0].stage[0].state==='rest');

// add to hand
s=R(s,{type:'SANDBOX_OP',op:'addToZone',pIdx:0,zone:'hand',key:'s_9000_red3'});
assert('addToZone hand', s.players[0].hand.length===1 && s.players[0].hand[0].key==='s_9000_red3');

// set level count to 3
s=R(s,{type:'SANDBOX_OP',op:'setCount',pIdx:0,zone:'level',n:3});
assert('setCount level=3', s.players[0].level.length===3);

// set clock to 6
s=R(s,{type:'SANDBOX_OP',op:'setCount',pIdx:0,zone:'clock',n:6});
assert('setCount clock=6', s.players[0].clock.length===6);

// deckTop: put a known card on top (pop takes it)
s=R(s,{type:'SANDBOX_OP',op:'deckTop',pIdx:0,key:'cx_door'});
assert('deckTop is next pop', s.players[0].deck[s.players[0].deck.length-1].key==='cx_door');

// set stock to 2
s=R(s,{type:'SANDBOX_OP',op:'setCount',pIdx:0,zone:'stock',n:2});
assert('setCount stock=2', s.players[0].stock.length===2);

// switch turn + phase
s=R(s,{type:'SANDBOX_OP',op:'setTurn',value:1});
s=R(s,{type:'SANDBOX_OP',op:'setPhase',value:'attack'});
assert('setTurn/setPhase', s.turnPlayer===1 && s.phase==='attack');

// clearZone
s=R(s,{type:'SANDBOX_OP',op:'clearZone',pIdx:0,zone:'clock'});
assert('clearZone clock', s.players[0].clock.length===0);

// reset
s=R(s,{type:'SANDBOX_OP',op:'reset'});
assert('reset returns fresh sandbox', s.sandbox===true && s.players[0].hand.length===0 && s.players[0].level.length===0);

// integration: place concentrate on stage, level 0, deck known, stock 1, run concentrate
{
  let g=m.makeSandboxState();
  g=R(g,{type:'SANDBOX_OP',op:'placeStage',pIdx:0,slot:0,key:'s_1000_concentrate',state:'stand'});
  g=R(g,{type:'SANDBOX_OP',op:'setCount',pIdx:0,zone:'stock',n:1});
  g.turnPlayer=0;
  const before=g.players[0].deck.length;
  g=m.activateConcentrate(g,0);
  assert('integration: concentrate ran in sandbox', g.players[0].deck.length < before || g.players[0].wr.length>0, {deck:g.players[0].deck.length,wr:g.players[0].wr.length});
}
