const m=require('./harness.js');
const {DEFS,initialState,gameReducer,resolvePending}=m;
let _id=600000; const uid=()=>_id++;
function card(key){return {id:uid(),key,def:DEFS[key],state:'stand'};}
const FILLER='v0_3000';
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}

// buff1 step flow: PB_DRAW_DISCARD -> STEP_DRAW pending(pbClock) -> draw twice -> STEP_DRAW_DISCARD -> discard -> phase main
{
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{noClockDraw:true});
  s.turnPlayer=0; s.phase='clock'; s.pbDrawUsedThisTurn=false;
  const P=s.players[0];
  P.hand=[card(FILLER)]; P.deck=Array.from({length:10},()=>card(FILLER)); P.clock=[];
  const handBefore=P.hand.length;

  let st=gameReducer(s,{type:'PB_DRAW_DISCARD'});
  assert('B1step: launches STEP_DRAW with pbClock', st.pending&&st.pending.type==='STEP_DRAW'&&st.pending.pbClock===true, st.pending);
  assert('B1step: pbDrawUsedThisTurn set', st.pbDrawUsedThisTurn===true);

  // draw 1st
  st=resolvePending(st,{draw:true});
  assert('B1step: after draw1 still STEP_DRAW', st.pending&&st.pending.type==='STEP_DRAW', st.pending&&st.pending.type);
  assert('B1step: hand +1 after draw1', st.players[0].hand.length===handBefore+1, {hand:st.players[0].hand.length});
  assert('B1step: pbClock carried', st.pending.pbClock===true);

  // draw 2nd -> reaches max 2 -> STEP_DRAW_DISCARD
  st=resolvePending(st,{draw:true});
  assert('B1step: after draw2 -> STEP_DRAW_DISCARD', st.pending&&st.pending.type==='STEP_DRAW_DISCARD', st.pending&&st.pending.type);
  assert('B1step: hand +2', st.players[0].hand.length===handBefore+2, {hand:st.players[0].hand.length});
  assert('B1step: discard pending carries pbClock', st.pending.pbClock===true);
  assert('B1step: clock still empty (no self-damage)', st.players[0].clock.length===0, {clock:st.players[0].clock.length});

  // discard one
  const dropId=st.players[0].hand[0].id;
  st=resolvePending(st,{id:dropId});
  assert('B1step: after discard hand +1 net', st.players[0].hand.length===handBefore+1, {hand:st.players[0].hand.length});
  assert('B1step: dropped to wr', st.players[0].wr.some(c=>c.id===dropId));
  assert('B1step: AUTO advanced to main', st.phase==='main', st.phase);
  assert('B1step: no pending', !st.pending);
}

// buff1: choosing NOT to draw (choice.draw=false) at start still discards then advances
{
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{noClockDraw:true});
  s.turnPlayer=0; s.phase='clock'; s.pbDrawUsedThisTurn=false;
  const P=s.players[0];
  P.hand=[card(FILLER),card(FILLER)]; P.deck=Array.from({length:10},()=>card(FILLER)); P.clock=[];
  let st=gameReducer(s,{type:'PB_DRAW_DISCARD'});
  // immediately stop drawing -> has hand -> STEP_DRAW_DISCARD
  st=resolvePending(st,{draw:false});
  assert('B1step(no-draw): -> STEP_DRAW_DISCARD', st.pending&&st.pending.type==='STEP_DRAW_DISCARD', st.pending&&st.pending.type);
  const dropId=st.players[0].hand[0].id;
  st=resolvePending(st,{id:dropId});
  assert('B1step(no-draw): advanced to main after discard', st.phase==='main', st.phase);
}

// regression: 3lv card STEP_DRAW (no pbClock) must NOT advance phase
{
  const s=initialState('npc',{p0:'你',p1:'NPC'});
  s.turnPlayer=0; s.phase='main';
  const P=s.players[0];
  P.hand=[card(FILLER)]; P.deck=Array.from({length:10},()=>card(FILLER));
  s.pending={type:'STEP_DRAW',pIdx:0,drawn:0,max:2}; // no pbClock
  let st=resolvePending(s,{draw:true});
  st=resolvePending(st,{draw:true});
  // STEP_DRAW_DISCARD, no pbClock
  assert('3lv regression: STEP_DRAW_DISCARD no pbClock', st.pending&&st.pending.type==='STEP_DRAW_DISCARD'&&!st.pending.pbClock, st.pending);
  const dropId=st.players[0].hand[0].id;
  st=resolvePending(st,{id:dropId});
  assert('3lv regression: phase NOT changed by discard', st.phase==='main', st.phase);
  assert('3lv regression: no pending after', !st.pending);
}
