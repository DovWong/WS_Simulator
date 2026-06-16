const m=require('./harness.js');
function assert(n,c,e){console.log((c?'✅':'❌')+' '+n+(e!==undefined?'  '+JSON.stringify(e):''));if(!c)process.exitCode=1;}
const card=(key,st)=>m.mkCard(key,st||'stand');

// helper: build sandbox, place cards on P0 stage, set turn, return calcPower of slot
function setup(stageKeys, turnPlayer){
  let s=m.makeSandboxState();
  s.turnPlayer = turnPlayer!=null?turnPlayer:0;
  stageKeys.forEach((k,i)=>{ s.players[0].stage[i] = k?card(k):null; });
  return s;
}

// 文(P04): 其他我方角色全部 +1000
{
  const s=setup(['thp_p04_aya','thp_t05_youmu','thp_045_yamame']);
  // youmu(slot1) base 3000, gets +1000 from 文 = 4000
  assert('文: 其他角色 +1000 (youmu 3000->4000)', m.calcPower(s,0,1)===4000, {p:m.calcPower(s,0,1)});
  // 文 itself (slot0) base 2000, NOT buffed by itself = 2000
  assert('文: 自己不加 (2000)', m.calcPower(s,0,0)===2000, {p:m.calcPower(s,0,0)});
}
// てゐ(012): 我方回合 +1000；對手回合不加
{
  const s=setup(['thp_012_tewi'],0);
  assert('てゐ: 我方回合 2000->3000', m.calcPower(s,0,0)===3000, {p:m.calcPower(s,0,0)});
  const s2=setup(['thp_012_tewi'],1);
  assert('てゐ: 對手回合 不加 =2000', m.calcPower(s2,0,0)===2000, {p:m.calcPower(s2,0,0)});
}
// にとり(017): 我方回合 + 其他幻想郷>=2 → +2000
{
  // にとり + 2 其他幻想郷(youmu, yamame) → 其他幻想郷=2 → +2000
  const s=setup(['thp_017_nitori','thp_t05_youmu','thp_045_yamame'],0);
  assert('にとり: 其他幻想郷2隻 6000->8000', m.calcPower(s,0,0)===8000, {p:m.calcPower(s,0,0)});
  // 只有1隻其他幻想郷 → 不加
  const s2=setup(['thp_017_nitori','thp_t05_youmu'],0);
  assert('にとり: 其他幻想郷僅1隻 不加 =6000', m.calcPower(s2,0,0)===6000, {p:m.calcPower(s2,0,0)});
  // 對手回合 不加
  const s3=setup(['thp_017_nitori','thp_t05_youmu','thp_045_yamame'],1);
  assert('にとり: 對手回合 不加 =6000', m.calcPower(s3,0,0)===6000, {p:m.calcPower(s3,0,0)});
}
// メディスン(051): 同條件 +6000
{
  const s=setup(['thp_051_medicine','thp_t05_youmu','thp_045_yamame'],0);
  assert('メディスン: 其他幻想郷2隻 3000->9000', m.calcPower(s,0,0)===9000, {p:m.calcPower(s,0,0)});
}
// こいし(050): 我方回合 全員幻想郷 → +5000
{
  // 全員幻想郷(こいし+youmu) → +5000
  const s=setup(['thp_050_koishi','thp_t05_youmu'],0);
  assert('こいし: 全員幻想郷 4000->9000', m.calcPower(s,0,0)===9000, {p:m.calcPower(s,0,0)});
  // 場上有非幻想郷(初始卡 v0_3000) → 不加
  const s2=setup(['thp_050_koishi','v0_3000'],0);
  assert('こいし: 有非幻想郷 不加 =4000', m.calcPower(s2,0,0)===4000, {p:m.calcPower(s2,0,0)});
}
// 妹紅(T10): 全員幻想郷 → +4000（無回合限制）
{
  const s=setup(['thp_t10_mokou','thp_t05_youmu'],1); // 對手回合也生效
  assert('妹紅: 全員幻想郷 對手回合也+4000 6000->10000', m.calcPower(s,0,0)===10000, {p:m.calcPower(s,0,0)});
  const s2=setup(['thp_t10_mokou','v0_3000'],0);
  assert('妹紅: 有非幻想郷 不加 =6000', m.calcPower(s2,0,0)===6000, {p:m.calcPower(s2,0,0)});
}
// 互動：文 + にとり 疊加（文給にとり+1000，にとり自身條件+2000）
{
  // 文(slot0) + にとり(slot1) + youmu(slot2) + yamame(slot3)
  // にとり: base6000 +1000(文) + 2000(其他幻想郷youmu,yamame=2) = 9000
  const s=setup(['thp_p04_aya','thp_017_nitori','thp_t05_youmu','thp_045_yamame'],0);
  // 注意 文 不是幻想郷？文 traits=['幻想郷','妖怪の山'] 是幻想郷. 所以對 にとり 其他幻想郷 = 文,youmu,yamame =3 (>=2)
  assert('疊加: にとり 6000+1000(文)+2000 =9000', m.calcPower(s,0,1)===9000, {p:m.calcPower(s,0,1)});
}
