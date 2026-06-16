const m=require('./harness.js');
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}

// Simulate the host deck-collection handshake (mirrors netTryStart logic in the app).
function makeHost(){
  const ref={host:null, guest:null, started:null};
  function tryStart(){
    if(!ref.host || !ref.guest) return;
    ref.started=m.initialState('net',{p0:'房主',p1:'對手'},null,null,{p0:ref.host,p1:ref.guest});
    ref.started.phase='rps';
  }
  return {
    hostPick(list){ ref.host=list; tryStart(); },     // host onNetDeckPicked
    guestDeckArrives(list){ ref.guest=list; tryStart(); }, // host receives t:'deck'
    ref
  };
}

const hostDeck=m.deckPairsToKeys([['v0_3000',50]]);
const guestDeck=m.deckPairsToKeys([['v1_5500',50]]);

// Order A: host picks first, then guest deck arrives
{
  const h=makeHost();
  h.hostPick(hostDeck);
  assert('A: not started with only host deck', h.ref.started===null);
  h.guestDeckArrives(guestDeck);
  assert('A: started once both decks in', h.ref.started!==null);
  const p0=h.ref.started.players[0].deck.concat(h.ref.started.players[0].hand);
  const p1=h.ref.started.players[1].deck.concat(h.ref.started.players[1].hand);
  assert('A: host(p0) all v0_3000', p0.every(c=>c.key==='v0_3000')&&p0.length===50);
  assert('A: guest(p1) all v1_5500', p1.every(c=>c.key==='v1_5500')&&p1.length===50);
  assert('A: phase rps', h.ref.started.phase==='rps');
}
// Order B: guest deck arrives FIRST (guest picked faster), then host picks
{
  const h=makeHost();
  h.guestDeckArrives(guestDeck);
  assert('B: not started with only guest deck', h.ref.started===null);
  h.hostPick(hostDeck);
  assert('B: started once host also picks', h.ref.started!==null);
  const p0=h.ref.started.players[0].deck.concat(h.ref.started.players[0].hand);
  const p1=h.ref.started.players[1].deck.concat(h.ref.started.players[1].hand);
  assert('B: host(p0) all v0_3000', p0.every(c=>c.key==='v0_3000'));
  assert('B: guest(p1) all v1_5500', p1.every(c=>c.key==='v1_5500'));
}
// Both use builtin 初始 → 8 CX each
{
  const h=makeHost();
  h.hostPick(m.BUILTIN_DECKS['初始'].slice());
  h.guestDeckArrives(m.BUILTIN_DECKS['初始'].slice());
  const p0=h.ref.started.players[0].deck.concat(h.ref.started.players[0].hand);
  const p1=h.ref.started.players[1].deck.concat(h.ref.started.players[1].hand);
  assert('C: both 8 CX', p0.filter(c=>c.def.type==='CX').length===8 && p1.filter(c=>c.def.type==='CX').length===8);
}
