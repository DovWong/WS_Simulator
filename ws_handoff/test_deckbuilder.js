const m=require('./harness.js');
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}

// makeRandomDeckList: 50 cards (or capped by pool), each key <=4
{
  const l=m.makeRandomDeckList();
  const cnt={}; l.forEach(k=>cnt[k]=(cnt[k]||0)+1);
  assert('random deck size <=50 and >0', l.length>0 && l.length<=50, {len:l.length});
  assert('random deck each key <=4', Object.values(cnt).every(n=>n<=4), cnt);
}
// deckMapToList
{
  const list=m.deckMapToList({v0_3000:4, cx_door:2});
  assert('deckMapToList expands counts', list.length===6 && list.filter(k=>k==='v0_3000').length===4, {len:list.length});
}
// export/import round-trip (mimic builder code)
{
  const deck={v0_3000:4, cx_door:4, s_9000_red3:3};
  const code='WSDECK:'+Buffer.from(unescape(encodeURIComponent(JSON.stringify(deck))),'binary').toString('base64');
  const raw=code.replace(/^WSDECK:/,'');
  const obj=JSON.parse(decodeURIComponent(escape(Buffer.from(raw,'base64').toString('binary'))));
  assert('export/import round-trip', JSON.stringify(obj)===JSON.stringify(deck), obj);
}
// initialState with custom decks builds correct decks
{
  const myList=m.deckPairsToKeys([['v0_3000',50]]);
  const npcList=m.BUILTIN_DECKS['初始'].slice();
  const s=m.initialState('npc',{p0:'你',p1:'NPC'},null,null,{p0:myList,p1:npcList});
  const p0all=s.players[0].deck.concat(s.players[0].hand);
  const p1all=s.players[1].deck.concat(s.players[1].hand);
  assert('p0 uses custom deck (all v0_3000)', p0all.every(c=>c.key==='v0_3000') && p0all.length===50, {len:p0all.length});
  assert('p1 uses 初始 deck (50)', p1all.length===50, {len:p1all.length});
  // 初始 deck has 8 CX
  assert('p1 初始 has 8 CX', p1all.filter(c=>c.def.type==='CX').length===8, {cx:p1all.filter(c=>c.def.type==='CX').length});
}
// save/load decks persistence
{
  m.saveDecks({'測試組':{deck:{v0_3000:4},total:4,savedAt:1}});
  const loaded=m.loadDecks();
  assert('save/load decks', loaded['測試組'] && loaded['測試組'].total===4, Object.keys(loaded));
}
// every card has rarity TD
{
  assert('all 初始 cards rarity TD', Object.keys(m.DEFS).filter(k=>(m.DEFS[k]['作品']||'初始')==='初始').every(k=>m.DEFS[k].rarity==='TD'));
}
