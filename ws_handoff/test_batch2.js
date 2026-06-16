const m=require('./harness.js');
const {DEFS,initialState,resolvePending,checkLevelUp,gameReducer,endTurn,encoreCost,pb}=m;
let _id=700000; const uid=()=>_id++;
function card(key){return {id:uid(),key,def:DEFS[key],state:'stand'};}
const FILLER='v0_3000';
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}

// ===== buff2: encoreCost =====
{
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{cheapEncore:true});
  assert('B2: player encoreCost=1', encoreCost(s,0)===1, encoreCost(s,0));
  assert('B2: NPC encoreCost=3 (buff only player)', encoreCost(s,1)===3, encoreCost(s,1));
}
{
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{});
  assert('B2: no buff -> player encoreCost=3', encoreCost(s,0)===3, encoreCost(s,0));
}
{
  const s=initialState('npc',{p0:'你',p1:'NPC'});
  assert('B2: non-nightmare -> playerBuffs null, encoreCost=3', encoreCost(s,0)===3 && s.playerBuffs===null, {ec:encoreCost(s,0),pb:s.playerBuffs});
}

// ===== buff1: noClockDraw disables CLOCK_DISCARD, enables PB_DRAW_DISCARD =====
{
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{noClockDraw:true});
  s.turnPlayer=0; s.phase='clock';
  const P=s.players[0];
  P.clock=[]; P.hand=[card(FILLER),card(FILLER)];
  const handBefore=P.hand.length, clockBefore=P.clock.length;
  // CLOCK_DISCARD should be a no-op
  const s2=gameReducer(s,{type:'CLOCK_DISCARD',id:P.hand[0].id});
  assert('B1: CLOCK_DISCARD no-op under buff1', s2.players[0].hand.length===handBefore && s2.players[0].clock.length===clockBefore, {hand:s2.players[0].hand.length,clock:s2.players[0].clock.length});
}
{
  // PB_DRAW_DISCARD launches step-by-step STEP_DRAW chain (see test_buff1step.js for full flow)
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{noClockDraw:true});
  s.turnPlayer=0; s.phase='clock'; s.pbDrawUsedThisTurn=false;
  const P=s.players[0];
  P.hand=[card(FILLER)]; P.deck=Array.from({length:10},()=>card(FILLER)); P.clock=[];
  const s2=gameReducer(s,{type:'PB_DRAW_DISCARD'});
  assert('B1: launches STEP_DRAW(pbClock)', s2.pending&&s2.pending.type==='STEP_DRAW'&&s2.pending.pbClock===true, s2.pending);
  assert('B1: pbDrawUsedThisTurn set', s2.pbDrawUsedThisTurn===true);
  assert('B1: clock unchanged (no self-damage)', s2.players[0].clock.length===0, {clock:s2.players[0].clock.length});
  // second PB_DRAW_DISCARD same turn (pending present) -> blocked
  const s4=gameReducer(s2,{type:'PB_DRAW_DISCARD'});
  assert('B1: 2nd draw2discard1 blocked (still STEP_DRAW, drawn=0)', s4.pending&&s4.pending.type==='STEP_DRAW'&&(s4.pending.drawn||0)===0, s4.pending);
}

// ===== buff3: lastStand defers death, settles at player turn end =====
{
  // Player at Lv3 + 7 clock during NPC turn (turnPlayer=1) with lastStand -> NOT lose, lastStand active
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{lastStand:true});
  s.turnPlayer=1;
  const P=s.players[0];
  P.level=Array.from({length:3},()=>card(FILLER));
  P.clock=Array.from({length:7},()=>card(FILLER));
  checkLevelUp(s,0);
  assert('B3: Lv3+7 in NPC turn -> NOT lose (lastStand)', s.winner===null, {winner:s.winner});
  assert('B3: pbLastStandActive set', s.pbLastStandActive===true);
  assert('B3: player advanced to Lv4', P.level.length===4, {lv:P.level.length});
  // further damage during last-stand -> absorbed, no death
  P.clock=Array.from({length:7},()=>card(FILLER));
  checkLevelUp(s,0);
  assert('B3: further lethal absorbed, still alive', s.winner===null, {winner:s.winner});
  assert('B3: absorbed clock cleared', P.clock.length===0, {clock:P.clock.length});
}
{
  // Settle: player turn ends while lastStand active and NPC not beaten -> player loses
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{lastStand:true});
  s.turnPlayer=0; s.phase='encore'; s.pbLastStandActive=true; s.winner=null;
  s.players[0].hand=[]; // no discard-to-7
  const s2=endTurn(s);
  assert('B3: player turn end + lastStand + NPC alive -> player loses', s2.winner===1, {winner:s2.winner});
}
{
  // If player beats NPC during final turn, that wins (winner=0 takes priority over settle)
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{power:true},{lastStand:true});
  s.turnPlayer=0; s.phase='encore'; s.pbLastStandActive=true; s.winner=0; // player already won
  s.players[0].hand=[];
  const s2=endTurn(s);
  assert('B3: player won during final turn -> winner stays 0', s2.winner===0, {winner:s2.winner});
}

// ===== display helpers =====
{
  const s=initialState('nightmare',{p0:'你',p1:'NPC'},{dmg9level:true,lv5win:true},{});
  assert('DISP: NPC clockThreshold=9', m.clockThresholdFor(s,1)===9, m.clockThresholdFor(s,1));
  assert('DISP: NPC loseLevel=5', m.loseLevelFor(s,1)===5, m.loseLevelFor(s,1));
  assert('DISP: player clockThreshold=7', m.clockThresholdFor(s,0)===7, m.clockThresholdFor(s,0));
  assert('DISP: player loseLevel=4', m.loseLevelFor(s,0)===4, m.loseLevelFor(s,0));
}
