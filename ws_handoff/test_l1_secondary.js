const m=require('./harness.js');
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}
const card=(k,st)=>m.mkCard(k,st||'stand');

// にとり top-check to hand
{
  let s=m.makeSandboxState({p0:'你',p1:'對手'},'東方Project');
  s.turnPlayer=0;
  s.players[0].stage[0]=card('thp_017_nitori');
  s.players[0].stage[1]=card('thp_t05_youmu'); // other genso
  // give cx_door a fake choice trigKind for test
  const choiceCx=card('cx_door'); choiceCx.def=Object.assign({},choiceCx.def,{trigKind:'choice'});
  s.players[0].cx=[choiceCx];
  s.players[0].deck.push(card('thp_045_yamame')); // top = genso char
  const handBefore=s.players[0].hand.length;
  s=m.runAttackFx(s,{aPIdx:0,dPIdx:1,slot:0,dslot:0,mode:'front'});
  assert('にとり: choice-CX + genso char top -> hand +1', s.players[0].hand.length===handBefore+1, {h:s.players[0].hand.length});
  // no CX -> no effect
  let s2=m.makeSandboxState({p0:'你',p1:'對手'},'東方Project');
  s2.turnPlayer=0; s2.players[0].stage[0]=card('thp_017_nitori'); s2.players[0].stage[1]=card('thp_t05_youmu');
  s2.players[0].cx=[card('cx_door')]; // non-choice CX -> should NOT fire
  s2.players[0].deck.push(card('thp_045_yamame'));
  const hb=s2.players[0].hand.length;
  s2=m.runAttackFx(s2,{aPIdx:0,dPIdx:1,slot:0,dslot:0,mode:'front'});
  assert('にとり: non-choice CX -> no draw', s2.players[0].hand.length===hb, {h:s2.players[0].hand.length});
}

// てゐ battle-opp-reverse move (now via TEWI_SELECT pending or NPC auto)
{
  let s=m.makeSandboxState({p0:'你',p1:'對手'},'東方Project');
  s.turnPlayer=0;
  s.players[0].stage[0]=card('thp_012_tewi','stand');
  s.players[0].stage[1]=card('thp_t05_youmu','stand');
  s.players[1].stage[0]=card('thp_p17_reitaisai','stand');
  s.attackCtx={aPIdx:0,dPIdx:1,slot:0,dslot:0,mode:'front',hasDefender:true};
  s.players[0].stage[0].autoBuff={power:5000,soul:0};
  s=m.attackBattleStep(s);
  // sandbox => both human => てゐ should pend TEWI_SELECT
  assert('てゐ: TEWI_SELECT pending (human)', s.pending&&s.pending.type==='TEWI_SELECT', s.pending&&s.pending.type);
  // resolve: pick youmu(slot1) to rest+move to back
  s=m.resolvePending(s,{slot:1});
  const backFilled = s.players[0].stage[3]||s.players[0].stage[4];
  assert('てゐ: chosen ally moved to back(rest)', !!backFilled && backFilled.state==='rest', {b3:!!s.players[0].stage[3],b4:!!s.players[0].stage[4]});
  assert('てゐ: slot1 now empty', !s.players[0].stage[1]);
}
// てゐ NPC-auto + 後列滿 → 只橫置不移動
{
  let s=m.makeSandboxState({p0:'你',p1:'對手'},'東方Project');
  s.sandbox=false; s.mode='npc'; // P1=NPC(non-human) for auto path
  s.turnPlayer=1; // てゐ on NPC side attacking
  s.players[1].stage[0]=card('thp_012_tewi','stand');
  s.players[1].stage[1]=card('thp_t05_youmu','stand');
  s.players[1].stage[3]=card('thp_045_yamame','stand'); // back full
  s.players[1].stage[4]=card('thp_p03_flandre','stand'); // back full
  s.players[0].stage[0]=card('thp_p17_reitaisai','stand');
  s.attackCtx={aPIdx:1,dPIdx:0,slot:0,dslot:0,mode:'front',hasDefender:true};
  s.players[1].stage[0].autoBuff={power:5000,soul:0};
  s=m.attackBattleStep(s);
  // back full → youmu stays slot1 but rested
  assert('てゐ NPC 後列滿: 夥伴只橫置留原位', s.players[1].stage[1]&&s.players[1].stage[1].state==='rest', {st:s.players[1].stage[1]&&s.players[1].stage[1].state});
}

// 自身encore: こいし discard green
{
  let s=m.makeSandboxState({p0:'你',p1:'對手'},'東方Project');
  s.turnPlayer=1; s.phase='encore';
  // こいし reverse on P0 stage; P0 has a green card in hand
  s.players[0].stage[0]=card('thp_050_koishi','reverse');
  s.players[0].hand=[card('thp_045_yamame')]; // green (ヤマメ green)
  assert('こいし: canSelfEncore (has green)', m.canSelfEncore(s.players[0], s.players[0].stage[0]));
  // new flow: processEncore -> ENCORE_SELECT (highlight) -> click こいし -> SELF_ENCORE_ASK
  s=m.processEncore(s);
  assert('こいし: ENCORE_SELECT pending first', s.pending&&s.pending.type==='ENCORE_SELECT', s.pending&&s.pending.type);
  const koishiSlot=0;
  s=m.resolvePending(s,{slot:koishiSlot});
  assert('こいし: click -> SELF_ENCORE_ASK', s.pending&&s.pending.type==='SELF_ENCORE_ASK', s.pending&&s.pending.type);
  const did=s.players[0].hand[0].id;
  s=m.resolvePending(s,{discardId:did});
  assert('こいし: survived on stage', !!s.players[0].stage[0] && s.players[0].stage[0].key==='thp_050_koishi', {onstage:!!s.players[0].stage[0]});
  assert('こいし: green discarded to wr', s.players[0].wr.some(c=>c.key==='thp_045_yamame'));
}
// 自身encore decline -> falls to normal (no green) goes wr
{
  let s=m.makeSandboxState({p0:'你',p1:'對手'},'東方Project');
  s.turnPlayer=1; s.phase='encore';
  s.players[0].stage[0]=card('thp_t10_mokou','reverse');
  s.players[0].hand=[card('thp_t05_youmu')]; // genso char -> mokou can self-encore
  assert('妹紅: canSelfEncore (has genso char)', m.canSelfEncore(s.players[0], s.players[0].stage[0]));
}
// 一般角色 Encore: ENCORE_SELECT -> click -> ENCORE_CONFIRM -> yes -> pay 3 stock
{
  let s=m.makeSandboxState({p0:'你',p1:'對手'},'東方Project');
  s.turnPlayer=1; s.phase='encore';
  s.players[0].stage[0]=card('thp_t05_youmu','reverse'); // normal char, no selfEncore
  s.players[0].stock=[card('thp_p03_flandre'),card('thp_p03_flandre'),card('thp_p03_flandre')];
  s=m.processEncore(s);
  assert('一般: ENCORE_SELECT pending', s.pending&&s.pending.type==='ENCORE_SELECT', s.pending&&s.pending.type);
  s=m.resolvePending(s,{slot:0});
  assert('一般: click -> ENCORE_CONFIRM', s.pending&&s.pending.type==='ENCORE_CONFIRM', s.pending&&s.pending.type);
  s=m.resolvePending(s,{yes:true});
  assert('一般: 確認後付3錢復活(在場且扣3錢)', !!s.players[0].stage[0] && s.players[0].stage[0].key==='thp_t05_youmu' && s.players[0].stock.length===0, {onstage:!!s.players[0].stage[0],stock:s.players[0].stock.length});
}
// 自身encore選付3錢: SELF_ENCORE_ASK -> useStock
{
  let s=m.makeSandboxState({p0:'你',p1:'對手'},'東方Project');
  s.turnPlayer=1; s.phase='encore';
  s.players[0].stage[0]=card('thp_050_koishi','reverse');
  s.players[0].hand=[card('thp_045_yamame')]; // green available
  s.players[0].stock=[card('thp_p03_flandre'),card('thp_p03_flandre'),card('thp_p03_flandre')];
  s=m.processEncore(s); // ENCORE_SELECT
  s=m.resolvePending(s,{slot:0}); // -> SELF_ENCORE_ASK
  s=m.resolvePending(s,{useStock:true}); // pay 3 stock instead of discard
  assert('自身encore選付3錢: 在場且扣3錢、綠卡仍在手', !!s.players[0].stage[0] && s.players[0].stock.length===0 && s.players[0].hand.some(c=>c.key==='thp_045_yamame'), {onstage:!!s.players[0].stage[0],stock:s.players[0].stock.length});
}
