const m=require('./harness.js');
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}
const card=(key,st)=>m.mkCard(key,st||'stand');

// ---- 第三點：力量歸零/負數立即破壞 ----

// A: NPC 一方角色力量被打到 0 → 落控室（NPC 不 encore）
{
  let s=m.makeSandboxState();
  s.sandbox=false;            // 非沙盒，讓 isHuman 依 mode 判斷
  s.mode='npc';              // P1 為 NPC
  s.phase='attack';
  s.turnPlayer=0;
  // P1(NPC) 前列放一隻 0 費香草(妖夢 3000)，用 autoBuff 打到 -100
  s.players[1].stage[0]=card('thp_t05_youmu');
  s.players[1].stage[0].autoBuff={power:-3100,soul:0};
  const wrBefore=s.players[1].wr.length;
  s=m.checkZeroPowerDestroy(s);
  assert('A: NPC 力量<=0 角色被破壞落控室', s.players[1].stage[0]===null && s.players[1].wr.length===wrBefore+1,
    {stage0:!!s.players[1].stage[0], wr:s.players[1].wr.length});
  assert('A: 無 pending(NPC不選)', !s.pending, {pending:s.pending&&s.pending.type});
}

// B: 人類一方角色力量<=0 → 設 reverse + 開 ZERO_ENCORE_SELECT（有錢可 encore）
{
  let s=m.makeSandboxState();   // 沙盒中雙方都是 human
  s.phase='attack';
  s.turnPlayer=0;
  s.players[0].stage[0]=card('thp_t05_youmu');
  s.players[0].stage[0].autoBuff={power:-3000,soul:0}; // 3000-3000=0 <=0
  // 給足 stock 以便可 encore
  for(let i=0;i<5;i++) s.players[0].stock.push(card('thp_t05_youmu'));
  s=m.checkZeroPowerDestroy(s);
  assert('B: 力量=0 角色被設 reverse', s.players[0].stage[0] && s.players[0].stage[0].state==='reverse',
    {st:s.players[0].stage[0]&&s.players[0].stage[0].state});
  assert('B: 開 ZERO_ENCORE_SELECT pending', s.pending && s.pending.type==='ZERO_ENCORE_SELECT',
    {pending:s.pending&&s.pending.type});
  assert('B: pending.slots 含 slot0', s.pending && s.pending.slots.includes(0), {slots:s.pending&&s.pending.slots});
}

// C: 人類但無錢、無自身encore → 直接落控室、不開 pending
{
  let s=m.makeSandboxState();
  s.phase='attack';
  s.turnPlayer=0;
  s.players[0].stage[0]=card('thp_t05_youmu'); // 無 selfEncore
  s.players[0].stage[0].autoBuff={power:-3000,soul:0};
  s.players[0].stock=[]; // 無錢
  const wrBefore=s.players[0].wr.length;
  s=m.checkZeroPowerDestroy(s);
  assert('C: 無錢無自身encore → 落控室', s.players[0].stage[0]===null && s.players[0].wr.length===wrBefore+1,
    {stage0:!!s.players[0].stage[0]});
  assert('C: 不開 pending', !s.pending);
}

// D: ZERO_ENCORE_SELECT 解析 — 選擇付錢 encore 復活到原格(橫置)
{
  let s=m.makeSandboxState();
  s.phase='attack'; s.turnPlayer=0;
  s.players[0].stage[0]=card('thp_t05_youmu');
  s.players[0].stage[0].autoBuff={power:-3000,soul:0};
  for(let i=0;i<5;i++) s.players[0].stock.push(card('thp_t05_youmu'));
  s=m.checkZeroPowerDestroy(s);
  // 一般角色 → 先 confirm
  s=m.gameReducer(s,{type:'RESOLVE_PENDING',choice:{slot:0}});
  assert('D: 點選後進 ENCORE_CONFIRM(zeroSrc)', s.pending && s.pending.type==='ENCORE_CONFIRM' && s.pending.zeroSrc===true,
    {pending:s.pending&&s.pending.type, zeroSrc:s.pending&&s.pending.zeroSrc});
  const stockBefore=s.players[0].stock.length;
  s=m.gameReducer(s,{type:'RESOLVE_PENDING',choice:{yes:true}});
  assert('D: 付錢 encore → 復活橫置', s.players[0].stage[0] && s.players[0].stage[0].state==='rest',
    {st:s.players[0].stage[0]&&s.players[0].stage[0].state});
  assert('D: stock 有扣', s.players[0].stock.length < stockBefore, {before:stockBefore, after:s.players[0].stock.length});
}

// E: 多隻同時歸零 → 全部高亮在同一 pending.slots
{
  let s=m.makeSandboxState();
  s.phase='attack'; s.turnPlayer=0;
  s.players[0].stage[0]=card('thp_t05_youmu'); s.players[0].stage[0].autoBuff={power:-3000,soul:0};
  s.players[0].stage[1]=card('thp_045_yamame'); s.players[0].stage[1].autoBuff={power:-3000,soul:0};
  for(let i=0;i<5;i++) s.players[0].stock.push(card('thp_t05_youmu'));
  s=m.checkZeroPowerDestroy(s);
  assert('E: 兩隻同時歸零都進 pending.slots', s.pending && s.pending.slots.length===2,
    {slots:s.pending&&s.pending.slots});
}

// ---- 第二點 cancel 流程（SELF_ENCORE_ASK 取消回到選擇，不落控室） ----
// 用 こいし(有 selfEncore 棄綠) 測：在一般 encore step 觸發 SELF_ENCORE_ASK，按 cancel 應回 ENCORE_SELECT 且卡仍 reverse
{
  let s=m.makeSandboxState();
  s.phase='encore'; s.turnPlayer=0;
  // こいし 放場上設 reverse，手上有綠卡可棄
  s.players[0].stage[0]=card('thp_050_koishi','reverse');
  s.players[0].hand.push(card('thp_045_yamame')); // 綠
  // 直接構造 SELF_ENCORE_ASK pending 測 cancel
  s.pending={type:'SELF_ENCORE_ASK',pIdx:0,slot:0};
  const s2=m.gameReducer(s,{type:'RESOLVE_PENDING',choice:{cancel:true}});
  assert('F: cancel 後卡仍在場(未落控室)', s2.players[0].stage[0] && s2.players[0].stage[0].state==='reverse',
    {stage0:!!s2.players[0].stage[0], st:s2.players[0].stage[0]&&s2.players[0].stage[0].state});
}

console.log('--- zerodestroy/cancel tests done ---');

// ---- 第三點修正：本來就 reverse / rest 的卡力量歸零也要破壞 ----

// G: 一張 reverse + 一張 rest + 一張 stand 同時被打到 <=0 → 三張都進破壞流程
{
  let s=m.makeSandboxState();
  s.phase='attack'; s.turnPlayer=0;
  // P1 三張前列，分別 reverse/rest/stand，全打到 0
  s.players[1].stage[0]=m.mkCard('thp_t05_youmu','reverse');
  s.players[1].stage[1]=m.mkCard('thp_045_yamame','rest');
  s.players[1].stage[2]=m.mkCard('thp_t05_youmu','stand');
  [0,1,2].forEach(i=>{ s.players[1].stage[i].autoBuff={power:-3100,soul:0}; });
  s.sandbox=false; s.mode='npc'; // P1 NPC → 全落控室
  const wrBefore=s.players[1].wr.length;
  s=m.checkZeroPowerDestroy(s);
  const allGone = !s.players[1].stage[0] && !s.players[1].stage[1] && !s.players[1].stage[2];
  assert('G: reverse/rest/stand 三張都被破壞落控室', allGone && s.players[1].wr.length===wrBefore+3,
    {s0:!!s.players[1].stage[0], s1:!!s.players[1].stage[1], s2:!!s.players[1].stage[2], wr:s.players[1].wr.length});
}

// H: 力量>0 的 reverse 卡（正常戰鬥倒置）不應被歸零破壞
{
  let s=m.makeSandboxState();
  s.phase='attack'; s.turnPlayer=0;
  s.players[1].stage[0]=m.mkCard('thp_t05_youmu','reverse'); // 3000, 無減力
  s=m.checkZeroPowerDestroy(s);
  assert('H: 力量>0 的 reverse 卡不被破壞', s.players[1].stage[0] && s.players[1].stage[0].state==='reverse',
    {stage0:!!s.players[1].stage[0], st:s.players[1].stage[0]&&s.players[1].stage[0].state});
}

console.log('--- zero reverse/state tests done ---');
