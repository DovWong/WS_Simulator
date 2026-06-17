const React={useState:()=>[null,()=>{}],useEffect:()=>{},useReducer:()=>[null,()=>{}],useRef:()=>({current:null}),useMemo:(f)=>f(),useCallback:(f)=>f,createElement:()=>null,Fragment:'Fragment'};
const localStorage={_d:{},getItem(k){return this._d[k]||null;},setItem(k,v){this._d[k]=v;},removeItem(k){delete this._d[k];}};
const btoa=s=>Buffer.from(s,'binary').toString('base64'); const atob=s=>Buffer.from(s,'base64').toString('binary');


/* ============================================================
   WS 對戰模擬器 — 規則引擎原型
   區域對照：
     Stock  = 錢區（付費）
     Clock  = 傷害區（決定 Level，7點升1級，Lv4 負）
     WR     = 控室（= 墳，棄牌堆）
     Stage  = 舞台 5 格：前列[0,1,2] 後列[3,4]
   前後對應：後3(左後)->前方[0,1]; 後4(右後)->前方[1,2]
   ============================================================ */

// ---- 觸發圖示 ----
const TRIG = {
  NONE: 'none',
  SOUL: 'soul',
  STANDBY: 'standby',
  // 紅門
  GATE: 'gate', // 藍閘
  CHOICE: 'choice' // 選擇（choice/チョイス）：觸發時從控室選1張符合條件的卡加入手牌
};

// ---- CX 名稱 ----
const CX_DOOR = '緋扉・StandbyGate'; // 紅色門
const CX_GATE = '蒼閘・BookGate'; // 藍色閘

// 一個簡單的 uid
let _uid = 1;
const uid = () => _uid++;

/* ============================================================
   卡片定義 (card definitions)
   type: 'CHAR' | 'EVENT' | 'CX'
   color: 'red'|'blue'|'yellow'|'green'
   每個角色預設都有「初始」特性 (traits: ['初始'])
   fx: 效果 hook 的識別字串，引擎按字串分派
   ============================================================ */
const DEFS = {
  // ---------- 無效果填充角色 ----------
  v0_3000: {
    name: '初始兵・歩',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'blue',
    level: 0,
    cost: 0,
    power: 3000,
    soul: 1,
    trig: TRIG.SOUL,
    traits: ['初始']
  },
  v1_5500: {
    name: '初始兵・盾',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'red',
    level: 1,
    cost: 0,
    power: 5500,
    soul: 1,
    trig: TRIG.SOUL,
    traits: ['初始']
  },
  // ---------- 特殊角色 1: 4000 出場翻頂落墳，非角色則橫置 ----------
  s_4000_topdrop: {
    name: '偵察兵・燕',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'blue',
    level: 0,
    cost: 0,
    power: 4000,
    soul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'CIP_TOPDECK_DROP_RESTSELF',
    text: '【出場時】碌2張落控室，若其中有高潮卡則此卡橫置。'
  },
  // ---------- 特殊角色 2: 500 給其他初始 +500 ----------
  s_500_buff: {
    name: '旗手・燈',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'red',
    level: 0,
    cost: 0,
    power: 500,
    soul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'CONT_OTHER_INITIAL_P500',
    text: '【持續】自己場上此卡以外的「初始」角色 +500 力量。'
  },
  // ---------- 特殊角色 3: 1000 集中 ----------
  s_1000_concentrate: {
    name: '探者・絆',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'blue',
    level: 0,
    cost: 0,
    power: 1000,
    soul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'ACT_CONCENTRATE',
    text: '【起動】[費1, 此卡橫置] 集中：碌4張，每翻到1張CX，可從卡組找最多1張「初始」角色上手。'
  },
  // ---------- 特殊角色 4: 2500 對手攻擊階段開始碌1上場 ----------
  s_2500_oppatk: {
    name: '伏兵・霞',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'red',
    level: 0,
    cost: 0,
    power: 2500,
    soul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'AUTO_OPP_ATKPHASE_TOPCHAR',
    text: '【自動】對手攻擊階段開始時，可碌牌庫頂1張，若為角色可放到自己空位。'
  },
  // ---------- 特殊角色 5: 紅1lv4500 CX連動(紅門) reverse時找初始回手 ----------
  s_4500_cxreverse: {
    name: '紅蓮の剣士・茜',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'red',
    level: 1,
    cost: 0,
    power: 4500,
    soul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'CXC_DOOR_REVERSE_RECOVER',
    text: `【CX連動・${CX_DOOR}】此卡使對方角色倒置時，可從控室找1張含「初始」角色加入手牌。`
  },
  // ---------- 特殊角色 6: 藍1lv2500 counter +1500 ----------
  s_2500_counter: {
    name: '護衛・凪',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'blue',
    level: 1,
    cost: 0,
    power: 2500,
    soul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'COUNTER_INITIAL_P1500',
    text: '【反擊】[此卡反擊] 選自己1隻「初始」角色 +1500 力量。'
  },
  // ---------- 特殊角色 7: 藍2lv4000 後列輔助 前方初始 +Lv*500 ----------
  s_4000_backsupport: {
    name: '軍師・玲',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'blue',
    level: 2,
    cost: 1,
    power: 4000,
    soul: 1,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'CONT_FRONT_INITIAL_PLVL500',
    text: '【持續】此卡前方的「初始」角色 +（該角色等級×500）力量。'
  },
  // ---------- 特殊角色 8: 紅3lv9000 早出 / 場上3初始+1500 / 上場時clock頂落墳 ----------
  s_9000_red3: {
    name: '覇者・烈',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'red',
    level: 3,
    cost: 2,
    power: 9000,
    soul: 2,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'RED3_PACKAGE',
    text: '【手牌】控室CX≤2時等級-1（早出）。【持續】場上另有3隻初始角色時+1500。【上場時】可將傷害區頂1張落控室。'
  },
  // ---------- 特殊角色 9: 藍3lv10000 draw2丟1 / CX連動(藍閘)再攻 ----------
  s_10000_blue3: {
    name: '深淵の歌姫・澪',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'blue',
    level: 3,
    cost: 2,
    power: 10000,
    soul: 2,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'BLUE3_PACKAGE',
    text: `【上場時】可抽最多2張，若抽至少1張則棄1手牌。【CX連動・${CX_GATE}】此卡使對方倒置時，可[費2,棄1手] 直置此卡（可再攻擊）。`
  },
  // ---------- 特殊角色 10: 藍3lv9000 看3選1 / 攻擊時燒一下 ----------
  s_9000_blue3: {
    name: 'predictor・空',
    type: 'CHAR',
    rarity: 'TD',
    作品: '初始',
    color: 'blue',
    level: 3,
    cost: 2,
    power: 9000,
    soul: 2,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['初始'],
    fx: 'BLUE3_LOOK3_BURN',
    text: '【上場時】可看牌庫頂3張，選最多1張上手其餘落控室。【攻擊時】可[費2,棄1手] 給對手1點傷害（trigger前，可cancel）。'
  },
  // ---------- Climax ----------
  // cont:'ALL_P1000_S1' = 永續型，全體 +1000力量 +1Soul（新召喚角色也即時吃到）
  cx_door: {
    name: CX_DOOR,
    type: 'CX',
    rarity: 'TD',
    作品: '初始',
    color: 'red',
    level: 0,
    cost: 0,
    power: 0,
    soul: 1,
    trig: TRIG.STANDBY,
    cont: 'ALL_P1000_S1',
    text: '【永續】全體角色 +1000 力量、+1 Soul（持續，新登場角色也吃得到）。（紅門：觸發時可從控室選1張角色加入手牌）'
  },
  cx_gate: {
    name: CX_GATE,
    type: 'CX',
    rarity: 'TD',
    作品: '初始',
    color: 'blue',
    level: 0,
    cost: 0,
    power: 0,
    soul: 1,
    trig: TRIG.GATE,
    cont: 'ALL_P1000_S1',
    text: '【永續】全體角色 +1000 力量、+1 Soul（持續，新登場角色也吃得到）。（藍閘：trigger時+1 Soul，並可從控室選最多1張CX加入手牌）'
  },
  // ========== 東方Project（先導入：純香草角色，無效果） ==========
  thp_p03_flandre: {
    name: '願望成就の吸血鬼 フランドール',
    type: 'CHAR',
    rarity: 'PR',
    作品: '東方Project',
    color: 'red',
    level: 0,
    cost: 0,
    power: 3000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '紅魔館']
  },
  thp_p17_reitaisai: {
    name: '第二十三回博麗神社例大祭',
    type: 'CHAR',
    rarity: 'PR',
    作品: '東方Project',
    color: 'red',
    level: 0,
    cost: 0,
    power: 3000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '博麗神社']
  },
  thp_t05_youmu: {
    name: '魂魄妖夢',
    type: 'CHAR',
    rarity: 'TD',
    作品: '東方Project',
    color: 'yellow',
    level: 0,
    cost: 0,
    power: 3000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '白玉楼']
  },
  thp_045_yamame: {
    name: '暗い洞窟の明るい網 ヤマメ',
    type: 'CHAR',
    rarity: 'C',
    作品: '東方Project',
    color: 'green',
    level: 0,
    cost: 0,
    power: 3000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '暗闇の風穴']
  },
  // ----- 純被動 / 條件式自我加成（只改 power，無移卡、無選擇）-----
  thp_p04_aya: {
    name: '事業繁盛の新聞記者 文',
    type: 'CHAR',
    rarity: 'PR',
    作品: '東方Project',
    color: 'red',
    level: 2,
    cost: 1,
    power: 2000,
    soul: 1,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['幻想郷', '妖怪の山'],
    fx: 'CONT_OTHER_ALL_P1000',
    text: '【永】 其他我方角色全部 +1000 力量。'
  },
  thp_012_tewi: {
    name: '地上の兎 てゐ',
    type: 'CHAR',
    rarity: 'C',
    作品: '東方Project',
    color: 'yellow',
    level: 0,
    cost: 0,
    power: 2000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '永遠亭'],
    fx: 'CONT_SELF_MYTURN_P1000',
    fxList: ['CONT_SELF_MYTURN_P1000', 'BATTLE_OPP_REVERSE_MOVE'],
    text: '【永】 我方回合中，這張卡 +1000 力量。\n【自】 這張卡的戰鬥對手被【倒置】時，選擇 1 隻其他我方的《幻想郷》角色，將其【橫置】，移動到後列沒有角色的空格。'
  },
  thp_017_nitori: {
    name: '超妖怪弾頭 にとり',
    type: 'CHAR',
    rarity: 'R',
    作品: '東方Project',
    color: 'yellow',
    level: 2,
    cost: 0,
    power: 6000,
    soul: 1,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['幻想郷', '妖怪の山'],
    fx: 'CONT_SELF_GENSO2_P2000',
    fxList: ['CONT_SELF_GENSO2_P2000', 'ATK_TOPCHECK_GENSO_TOHAND'],
    text: '【永】 我方回合中，若其他我方《幻想郷》角色 ≥2，這張卡 +2000 力量。\n【自】 這張卡攻擊時，若 CX 置場有 trigger 圖示為「choice（⛉）」的 CX，且有其他我方《幻想郷》角色，公開牌庫頂 1 張；該卡為《幻想郷》角色則加入手牌（不是則放回原處）。'
  },
  thp_051_medicine: {
    name: '小さなスイートポイズン メディスン',
    type: 'CHAR',
    rarity: 'U',
    作品: '東方Project',
    color: 'green',
    level: 2,
    cost: 1,
    power: 3000,
    soul: 1,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['幻想郷', '無名の丘'],
    fx: 'CONT_SELF_GENSO2_P6000',
    fxList: ['CONT_SELF_GENSO2_P6000', 'ATK_TOPCHECK_OPPFRONT_M2500'],
    text: '【永】 我方回合中，若其他我方《幻想郷》角色 ≥2，這張卡 +6000 力量。\n【自】 這張卡攻擊時，公開牌庫頂 1 張；該卡為《幻想郷》角色，則對手前列全部角色當回合 -2500 力量（公開的卡放回原處）。'
  },
  thp_050_koishi: {
    name: '閉じた恋の瞳 こいし',
    type: 'CHAR',
    rarity: 'R',
    作品: '東方Project',
    color: 'green',
    level: 1,
    cost: 1,
    power: 4000,
    soul: 1,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['幻想郷', '地霊殿'],
    fx: 'CONT_SELF_ALLGENSO_P5000',
    fxList: ['CONT_SELF_ALLGENSO_P5000', 'CONT_ALLGENSO_LOCK_OPP'],
    selfEncore: {
      type: 'discardColor',
      color: 'green'
    },
    text: '【永】 我方回合中，若我方角色全員《幻想郷》，這張卡 +5000 力量，且戰鬥中對手不能從手牌打出 Event／助太刀。\n【自】 自身 Encore［棄1張綠色手牌］。'
  },
  thp_t10_mokou: {
    name: '藤原妹紅',
    type: 'CHAR',
    rarity: 'TD',
    作品: '東方Project',
    color: 'yellow',
    level: 2,
    cost: 1,
    power: 6000,
    soul: 1,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['幻想郷', '迷いの竹林'],
    fx: 'CONT_SELF_ALLGENSO_P4000',
    selfEncore: {
      type: 'discardTrait',
      trait: '幻想郷'
    },
    text: '【永】 若我方角色全員《幻想郷》，這張卡 +4000 力量。\n【自】 自身 Encore［棄1張《幻想郷》角色手牌］。'
  },
  // ===== L2 第一批 =====
  thp_p02_mamizou: {
    name: '人世を忍ぶ仮の化け姿 マミゾウ',
    type: 'CHAR',
    rarity: 'PR',
    作品: '東方Project',
    color: 'red',
    level: 0,
    cost: 0,
    power: 2000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '人間の里'],
    fx: 'ATK_BUFF_ANY_1000',
    text: '【自】 這張卡攻擊時，選擇 1 隻我方角色，當回合 +1000 力量。'
  },
  thp_p07_remilia: {
    name: '一家健康の吸血鬼 レミリア',
    type: 'CHAR',
    rarity: 'PR',
    作品: '東方Project',
    color: 'blue',
    level: 0,
    cost: 0,
    power: 1000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '紅魔館'],
    fx: 'SUPPORT_FRONT_FLAT_500',
    text: '【永】 応援對前方角色全部 +500 力量。'
  },
  thp_p10_youmu: {
    name: '披露会の来賓 妖夢',
    type: 'CHAR',
    rarity: 'PR',
    作品: '東方Project',
    color: 'blue',
    level: 1,
    cost: 0,
    power: 4000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '白玉楼'],
    fx: 'CIP_BUFF_ANY_1500',
    text: '【自】 這張卡從手牌放上舞台時，選擇 1 隻我方角色，當回合 +1500 力量。'
  },
  thp_t15_sakuya: {
    name: '十六夜咲夜',
    type: 'CHAR',
    rarity: 'TD',
    作品: '東方Project',
    color: 'red',
    level: 0,
    cost: 0,
    power: 2000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '紅魔館'],
    fxList: ['CIP_BUFF_SELF_1500', 'LEAVE_LOOK3_GENSO_TAKE_DISCARD1'],
    text: '【自】 這張卡從手牌放上舞台時，當回合 +1500 力量。\n【自】 這張卡從舞台放到控室時，翻開牌庫頂最多 3 張；若至少翻到 1 張，可選 1 張《幻想郷》角色加入手牌，其餘進控室；然後棄 1 張手牌。'
  },
  thp_t09_alice: {
    name: 'アリス・マーガトロイド',
    type: 'CHAR',
    rarity: 'TD',
    作品: '東方Project',
    color: 'yellow',
    level: 2,
    cost: 1,
    power: 4000,
    soul: 1,
    tsoul: 1,
    trig: TRIG.SOUL,
    traits: ['幻想郷', '魔法の森'],
    fxList: ['SUPPORT_FRONT_LEVEL500', 'TRIGGER_GATE_BUFF_GENSO_2000'],
    text: '【永】 応援對前方角色全部 +（該角色等級×500）力量。\n【自】 自方觸發為「choice」的卡觸發時，選擇 1 隻我方《幻想郷》角色，當回合 +2000 力量。'
  },
  thp_021_mystia: {
    name: 'ミスティア・ローレライ＆幽谷響子',
    type: 'CHAR',
    rarity: 'C',
    作品: '東方Project',
    color: 'yellow',
    level: 1,
    cost: 0,
    power: 4000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '音楽'],
    fxList: ['NO_COLOR_RESTRICTION', 'CONT_SELF_GENSO2_P2000', 'ATK_COND_GENSO2_OPP_LV2_SELF6000'],
    text: '【永】 這張卡可無視顏色條件從手牌出場。\n【永】 我方回合中，若其他我方《幻想郷》角色 ≥2，這張卡 +2000 力量，且獲得：【自】 這張卡攻擊時，若正面對手角色等級為 2，這張卡當回合再 +6000 力量。'
  },
  thp_036_sanae: {
    name: '祀られる風の人間 早苗',
    type: 'CHAR',
    rarity: 'R',
    作品: '東方Project',
    color: 'green',
    level: 2,
    cost: 1,
    power: 1000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '守矢神社'],
    fxList: ['SUPPORT_FRONT_FLAT_1000', 'OPP_ATKPHASE_CX_COST_OPP_SOUL4'],
    text: '【永】 応援對前方角色全部 +1000 力量。\n【自】 ［棄 1 張手牌中的高潮卡］ 對方攻擊階段開始時，可選擇支付：選 1 隻對手角色，當回合魂 +4。'
  },
  thp_044_momiji: {
    name: '下っ端哨戒天狗 椛',
    type: 'CHAR',
    rarity: 'C',
    作品: '東方Project',
    color: 'green',
    level: 0,
    cost: 0,
    power: 1500,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '妖怪の山'],
    fxList: ['ATK_PEEK_BOTH_BOTTOM', 'ATK_SELF_PX_GENSO1000'],
    text: '【自】 這張卡攻擊時，看自方牌庫底 1 張與對手牌庫底 1 張（看完放回原處）。\n【自】 這張卡攻擊時，當回合 +X 力量，X = 其他我方《幻想郷》角色數 × 1000。'
  },
  thp_065_septet: {
    name: '亡き王女の為のセプテット レミリア',
    type: 'CHAR',
    rarity: 'R',
    作品: '東方Project',
    color: 'red',
    level: 0,
    cost: 0,
    power: 2000,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '紅魔館'],
    fxList: ['CIP_MILL2_SELF_GENSO_BUFF', 'ON_CX_PLACED_COST_CHAR_LOOK4_GENSO'],
    text: '【自】 這張卡從手牌放上舞台時，翻牌庫頂 2 張放入控室，當回合 +X 力量，X = 那些牌中《幻想郷》角色數 × 1000。\n【自】 ［將舞台上另 1 隻角色放控室］ 我方高潮卡放到高潮置場時，可選擇支付：看牌庫頂最多 4 張，可選 1 張《幻想郷》角色展示後加入手牌，其餘進控室。'
  },
  thp_080_patchouli: {
    name: '知識と日陰の少女 パチュリー',
    type: 'CHAR',
    rarity: 'C',
    作品: '東方Project',
    color: 'red',
    level: 1,
    cost: 0,
    power: 4500,
    soul: 1,
    trig: TRIG.NONE,
    traits: ['幻想郷', '紅魔館'],
    fx: 'CIP_OPT_LOOK7_GENSO_SELF1500',
    text: '【自】 ［(1) 棄 1 張手牌］ 這張卡從手牌放上舞台時，可選擇支付：看牌庫頂最多 7 張，可選 1 張《幻想郷》角色展示後加入手牌，其餘進控室；當回合 +1500 力量。'
  },
  // ===== 東方Project CX =====
  thp_cx_standby_hakurei: {
    name: '博麗の巫女',
    type: 'CX',
    rarity: 'CR',
    作品: '東方Project',
    color: 'red',
    level: 0,
    cost: 0,
    power: 0,
    soul: 1,
    trig: TRIG.STANDBY,
    cont: 'ALL_P1000_S1',
    text: '【永】全體角色 +1000 力量、+1 魂。（門觸發：可從控室選 1 張角色加入手牌）'
  }
};

/* ============================================================
   牌組構成
   16張0lv / 12張1lv / 2張2lv / 12張3lv  + Climax 8張
   特殊卡各4張
   ============================================================ */
// 內建牌組「初始」：以 [key, 張數] 表示。將來導入新作品（如東方）時，
// 新增另一個內建牌組或讓玩家自組即可，引擎只認「卡 key 清單」。
const BUILTIN_DECK_INITIAL = [
// 0lv 特殊（各4）= 16 張
['s_4000_topdrop', 4], ['s_500_buff', 4], ['s_1000_concentrate', 4], ['s_2500_oppatk', 4],
// 1lv：特殊各4 + 填充4 = 12 張
['s_4500_cxreverse', 4], ['s_2500_counter', 4], ['v1_5500', 4],
// 2lv：2 張
['s_4000_backsupport', 2],
// 3lv：各4 = 12 張
['s_9000_red3', 4], ['s_10000_blue3', 4], ['s_9000_blue3', 4],
// Climax 8 張
['cx_door', 4], ['cx_gate', 4]];
// 把 [key,n] 清單攤平成 key 陣列
function deckPairsToKeys(pairs) {
  const keys = [];
  pairs.forEach(([k, n]) => {
    for (let i = 0; i < n; i++) keys.push(k);
  });
  return keys;
}
const BUILTIN_DECKS = {
  '初始': deckPairsToKeys(BUILTIN_DECK_INITIAL)
};
// buildDeck(deckKeys?)：傳入卡 key 清單就照它建；不傳則用內建「初始」牌組。
// 會略過 DEFS 不存在的 key（防止匯入損壞資料）。
function buildDeck(deckKeys) {
  const keys = Array.isArray(deckKeys) && deckKeys.length ? deckKeys : BUILTIN_DECKS['初始'];
  const cards = [];
  keys.forEach(key => {
    if (!DEFS[key]) return;
    cards.push({
      id: uid(),
      key,
      def: DEFS[key],
      state: 'stand',
      traitsAdd: []
    });
  });
  return cards;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ============================================================
   初始遊戲狀態
   ============================================================ */
function freshPlayer(name, isNPC, deckKeys) {
  const deck = shuffle(buildDeck(deckKeys));
  return {
    name,
    isNPC,
    deck,
    hand: [],
    stage: [null, null, null, null, null],
    // 0,1,2 前列 / 3,4 後列
    stock: [],
    clock: [],
    level: [],
    // 已升級放這
    wr: [],
    // 控室
    cx: [],
    // climax 區
    resolution: [] // 處理區
  };
}
function initialState(mode, names, nightmare, playerBuffs, decks) {
  names = names || {};
  const isNpc = mode === 'npc' || mode === 'nightmare';
  // decks（可選）：{ p0:[key...], p1:[key...] }。不傳則用內建「初始」牌組。
  decks = decks || {};
  const p0 = freshPlayer(names.p0 || '你', false, decks.p0);
  const p1 = freshPlayer(names.p1 || (isNpc ? 'NPC' : '玩家2'), isNpc, decks.p1);
  // 起手抽5
  for (let k = 0; k < 5; k++) {
    p0.hand.push(p0.deck.pop());
    p1.hand.push(p1.deck.pop());
  }
  // 惡夢·9傷升級：NPC(P1) 由 Level 1 開始 —— 從牌庫隨機抽 1 張 0lv 角色放進等級區
  const nm9 = mode === 'nightmare' && nightmare && nightmare.dmg9level;
  if (nm9) {
    const zeroIdxs = p1.deck.map((c, i) => c.def.type === 'CHAR' && c.def.level === 0 ? i : -1).filter(i => i >= 0);
    if (zeroIdxs.length > 0) {
      const pickIdx = zeroIdxs[Math.floor(Math.random() * zeroIdxs.length)];
      const lvCard = p1.deck.splice(pickIdx, 1)[0];
      p1.level.push(lvCard);
    }
  }
  return {
    mode,
    // 惡夢特權（只對 NPC=P1 生效）。各為 boolean
    nightmare: mode === 'nightmare' ? Object.assign({
      power: false,
      noCxTrig: false,
      concentrate: false,
      dmg25: false,
      dmg4immune: false,
      lvImmune: false,
      cxRecycle: false,
      lvReduce: false,
      stockRefill: false,
      lv5win: false,
      // NPC 要到 Level 5 才判負（門檻 4→5）
      dmg9level: false
      // NPC 由 Level 1 開始、且每一級都要 9 點 clock 才升級
    }, nightmare || {}) : null,
    nmLvImmuneTurn: false,
    nmTurnCounter: 0,
    nmLvReduceAmt: 0,
    // 惡夢·越級累積減免量 = floor(NPC回合數/3)
    // 玩家輔助 buff（只對 P0=玩家生效，幫助對戰惡夢）。各為 boolean
    playerBuffs: mode === 'nightmare' ? Object.assign({
      noClockDraw: false,
      // buff1：clock 階段不能 clock，改成每回合可發動1次「抽2丟1」
      cheapEncore: false,
      // buff2：普通 Encore 費用 3→1
      lastStand: false
      // buff3：玩家在對手回合升到 4lv 暫時不死，給最後一個自己的回合
    }, playerBuffs || {}) : null,
    pbDrawUsedThisTurn: false,
    // buff1：本回合是否已用過「抽2丟1」
    pbLastStandActive: false,
    // buff3：是否已進入「最後一局」暫時不死狀態
    players: [p0, p1],
    turnPlayer: 0,
    firstPlayer: 0,
    phase: 'mulligan',
    // mulligan -> stand -> draw -> clock -> main -> attack -> encore -> end
    turnCount: 1,
    log: ['遊戲開始。雙方抽起手5張。'],
    pending: null,
    // 待玩家回應的互動 {type, ...}
    winner: null,
    selectedHand: [],
    // mulligan 用
    encoreQueue: []
  };
}

// ===== 沙盒（測試模式）=====
// 建一張卡實例（與 buildDeck 同形狀）
function mkCard(key, state) {
  if (!DEFS[key]) return null;
  return {
    id: uid(),
    key,
    def: DEFS[key],
    state: state || 'stand',
    traitsAdd: []
  };
}
// 沙盒初始 state：正常 initialState，但清空雙方手牌/場/控室等，牌庫保留可自由替換。
// sandbox:true 標記讓 UI 顯示編輯面板。turnPlayer/phase 由使用者自由設定。
function makeSandboxState(names, work) {
  work = work || '初始';
  const s = initialState('npc', names || {
    p0: '你',
    p1: 'NPC'
  });
  s.sandbox = true;
  s.sandboxWork = work; // 沙盒目前測試的作品（卡片挑選只顯示此作品）
  // 該作品的牌庫（湊滿 50；池子不足就盡量多）
  const deckList = makeRandomDeckList(work);
  s.players.forEach(P => {
    P.hand = [];
    P.stage = [null, null, null, null, null];
    P.stock = [];
    P.clock = [];
    P.level = [];
    P.wr = [];
    P.cx = [];
    P.resolution = [];
    P.deck = shuffle(buildDeck(deckList.length ? deckList : null));
  });
  s.phase = 'main';
  s.turnPlayer = 0;
  s.winner = null;
  s.pending = null;
  s.log = ['🧪 沙盒模式（' + work + '）：自由擺放場面後測試效果。'];
  return s;
}
// 沙盒「對手 default 場面」：用指定作品的卡擺一套標準對手場
//  等級1、錢10、傷害3隨機、場上5隻隨機L1角色、控室10(2CX+8角色)
function _pick4ColorCards(chars) {
  // 從 chars 各色取1張，再隨機補2張，共6張打亂 → 前3給等級區，後3給傷害區
  const colors = ['yellow', 'red', 'blue', 'green'];
  const pick = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  const byColor = c => colors.map(col => pick(chars.filter(k => DEFS[k].color === col))).filter(Boolean);
  const base = byColor(chars); // 最多4張（各色1）
  // 不足4色時補隨機
  while (base.length < 4) base.push(pick(chars));
  // 補2張隨機
  base.push(pick(chars), pick(chars));
  // Fisher-Yates shuffle
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.filter(Boolean).slice(0, 6);
}
function sandboxDefaultOpponent(s, work) {
  work = work || s.sandboxWork || '初始';
  const P = s.players[1];
  const pool = Object.keys(DEFS).filter(k => (DEFS[k]['作品'] || '初始') === work);
  const chars = pool.filter(k => DEFS[k].type === 'CHAR');
  const charsL1 = chars.filter(k => DEFS[k].level === 1);
  const cxs = pool.filter(k => DEFS[k].type === 'CX');
  const pick = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  const mk = (k, st) => k ? mkCard(k, st || 'stand') : null;
  // 清空對手
  P.hand = [];
  P.stage = [null, null, null, null, null];
  P.stock = [];
  P.clock = [];
  P.level = [];
  P.wr = [];
  P.cx = [];
  P.resolution = [];
  // 等級區3張、傷害區3張（共6張，集齊4色）、錢10張
  const sixKeys = _pick4ColorCards(chars);
  sixKeys.slice(0, 3).forEach(k => P.level.push(mk(k)));
  sixKeys.slice(3, 6).forEach(k => P.clock.push(mk(k)));
  for (let i = 0; i < 10; i++) {
    const c = mk(pick(chars));
    if (c) P.stock.push(c);
  }
  // 場上5隻隨機 L1 角色（沒有 L1 就用任意角色）
  for (let i = 0; i < 5; i++) {
    const k = pick(charsL1.length ? charsL1 : chars);
    P.stage[i] = mk(k);
  }
  // 控室10：2 CX + 8 隨機角色
  for (let i = 0; i < 2; i++) {
    c = mk(pick(cxs));
    if (c) P.wr.push(c);
  }
  for (let i = 0; i < 8; i++) {
    c = mk(pick(chars));
    if (c) P.wr.push(c);
  }
  return s;
}
// 沙盒「我方 default」：只設等級區3張、錢10張、時計3張（共6張集齊4色），其餘不動
function sandboxDefaultMe(s, work) {
  work = work || s.sandboxWork || '初始';
  const P = s.players[0];
  const pool = Object.keys(DEFS).filter(k => (DEFS[k]['作品'] || '初始') === work);
  const chars = pool.filter(k => DEFS[k].type === 'CHAR');
  const pick = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  const mk = k => k ? mkCard(k, 'stand') : null;
  P.level = [];
  P.stock = [];
  P.clock = [];
  const sixKeys = _pick4ColorCards(chars);
  sixKeys.slice(0, 3).forEach(k => P.level.push(mk(k)));
  sixKeys.slice(3, 6).forEach(k => P.clock.push(mk(k)));
  for (let i = 0; i < 10; i++) {
    const c = mk(pick(chars));
    if (c) P.stock.push(c);
  }
  return s;
}

// 惡夢特權判斷：僅對 NPC(pIdx===1) 生效
function nm(s, key) {
  return !!(s.nightmare && s.nightmare[key]);
}
// 某玩家的升級門檻（每級要多少 clock）— 給 UI 顯示 x/N 用，與 checkLevelUp 一致
function clockThresholdFor(s, pIdx) {
  return pIdx === 1 && nm(s, 'dmg9level') ? 9 : 7;
}
// 某玩家的判負職級 — 給 UI 顯示 LV x/N 用
function loseLevelFor(s, pIdx) {
  return pIdx === 1 && nm(s, 'lv5win') ? 5 : 4;
}
// 玩家輔助 buff 判斷：僅對 P0(玩家) 生效
function pb(s, key) {
  return !!(s.playerBuffs && s.playerBuffs[key]);
}
// Encore 復活費用：玩家(P0) 開了「廉價返工」buff 時為 1，否則 3。NPC 永遠 3。
function encoreCost(s, pIdx) {
  return pIdx === 0 && pb(s, 'cheapEncore') ? 1 : 3;
}
// 自身 Encore：卡是否定義了 selfEncore，且手牌付得起其 cost
function selfEncoreCandidates(P, se) {
  if (!se) return [];
  if (se.type === 'discardColor') return P.hand.filter(c => c.def.color === se.color);
  if (se.type === 'discardTrait') return P.hand.filter(c => hasTrait(c, se.trait));
  if (se.type === 'discardChar') return P.hand.filter(c => c.def.type === 'CHAR');
  if (se.type === 'discardAny') return P.hand.slice();
  return [];
}
function canSelfEncore(P, card) {
  const se = card.def.selfEncore;
  return !!se && selfEncoreCandidates(P, se).length > 0;
}
function selfEncoreLabel(se) {
  if (!se) return '';
  if (se.type === 'discardColor') return '棄1張' + ({
    red: '紅',
    blue: '藍',
    yellow: '黃',
    green: '綠'
  }[se.color] || se.color) + '色手牌';
  if (se.type === 'discardTrait') return '棄1張《' + se.trait + '》手牌';
  if (se.type === 'discardChar') return '棄1張角色手牌';
  return '棄1張手牌';
}
// 輔助 buff1：抽2丟1 結束後，直接過 clock phase 進 main。
function pbFinishClock(s) {
  if (s.phase === 'clock') {
    s.phase = 'main';
    s.log.push('【Main】可出角色。');
  }
  return s;
}

/* ============================================================
   工具函式
   ============================================================ */
const FRONT = [0, 1, 2];
const BACK = [3, 4];
// 後列格 -> 前方格
const frontOf = slot => slot === 3 ? [0, 1] : slot === 4 ? [1, 2] : [];
// 前列格 -> 正面對位（對手同欄）：0<->0,1<->1,2<->2
const facingSlot = slot => slot; // 鏡像同欄

function hasTrait(card, trait) {
  return (card.def.traits || []).includes(trait) || (card.traitsAdd || []).includes(trait);
}

// 該玩家是否由真人操作（需要彈 pending 讓他選）。
// 單機(npc/local)：只有 pIdx 0 是真人；連線(net)：雙方都是真人。
function isHuman(s, pIdx) {
  if (s.sandbox) return true;
  if (s.mode === 'net') return true;
  return pIdx === 0;
}

// 費用+同色條件：1費以上的卡，需 Level區 或 Clock區 至少1張同色。0費免檢查。
function meetsColorRequirement(P, card) {
  if ((card.def.cost || 0) < 1) return true; // 0費免顏色
  const color = card.def.color;
  const inLevel = P.level.some(c => c.def.color === color);
  const inClock = P.clock.some(c => c.def.color === color);
  return inLevel || inClock;
}

/* ============================================================
   力量/Soul 計算：明確分兩層
   ─ 永續效 (Continuous)：不存在角色身上，每次計算時即時掃描來源
     (CX區的持續CX、場上持續效角色)。新召喚角色下次計算即被掃到，自動吃到。
   ─ 自動效 (Auto/觸發型)：觸發那刻執行一次，把結果寫死在角色的
     card.autoBuff = {power, soul}。計算時加上去但不再重新觸發；
     之後新召喚的角色不會被追溯。
   ============================================================ */

// 永續效來源：回傳該 CX 對單一角色的 {power, soul} 加成
function continuousFromCX(P, card, slot) {
  let power = 0,
    soul = 0;
  // 每張在 CX 區的「持續型」CX 加成
  P.cx.forEach(cx => {
    if (cx.def.cont === 'ALL_P1000_S1') {
      power += 1000;
      soul += 1;
    }
  });
  return {
    power,
    soul
  };
}

// 永續效來源：場上持續效角色對單一角色的力量加成
function continuousFromStage(P, card, slot, state, pIdx) {
  let power = 0;
  // 旗手·燈：場上其他初始 +500
  P.stage.forEach((c, i) => {
    if (c && c.def.fx === 'CONT_OTHER_INITIAL_P500' && i !== slot && hasTrait(card, '初始')) power += 500;
    // 文：其他我方角色全部 +1000（不限特徵）
    if (c && c.def.fx === 'CONT_OTHER_ALL_P1000' && i !== slot) power += 1000;
  });
  // 軍師·玲（後列）：前方初始 +Lv*500
  // 応援（後列）：SUPPORT_FRONT_FLAT_500/1000 和 SUPPORT_FRONT_LEVEL500
  BACK.forEach(bslot => {
    const sup = P.stage[bslot];
    if (!sup) return;
    const supFxs = sup.def.fxList || (sup.def.fx ? [sup.def.fx] : []);
    const inFront = frontOf(bslot).includes(slot);
    if (!inFront) return;
    if (supFxs.includes('CONT_FRONT_INITIAL_PLVL500') && hasTrait(card, '初始')) power += card.def.level * 500;
    if (supFxs.includes('SUPPORT_FRONT_FLAT_500')) power += 500;
    if (supFxs.includes('SUPPORT_FRONT_FLAT_1000')) power += 1000;
    if (supFxs.includes('SUPPORT_FRONT_LEVEL500')) power += card.def.level * 500;
  });
  // 覇者·烈：場上另有3隻初始 +1500
  if (card.def.fx === 'RED3_PACKAGE') {
    const others = P.stage.filter((c, i) => c && i !== slot && hasTrait(c, '初始')).length;
    if (others >= 3) power += 1500;
  }
  // ===== 東方：條件式自我加成（支援 fxList）=====
  const isMyTurn = state && pIdx != null && state.turnPlayer === pIdx;
  const stageChars = P.stage.filter(c => c);
  const otherGenso = P.stage.filter((c, i) => c && i !== slot && hasTrait(c, '幻想郷')).length;
  const allGenso = stageChars.length > 0 && stageChars.every(c => hasTrait(c, '幻想郷'));
  const selfFxs = card.def.fxList || (card.def.fx ? [card.def.fx] : []);
  const hasSelf = x => selfFxs.includes(x);
  if (hasSelf('CONT_SELF_MYTURN_P1000') && isMyTurn) power += 1000;
  if (hasSelf('CONT_SELF_GENSO2_P2000') && isMyTurn && otherGenso >= 2) power += 2000;
  if (hasSelf('CONT_SELF_GENSO2_P6000') && isMyTurn && otherGenso >= 2) power += 6000;
  if (hasSelf('CONT_SELF_ALLGENSO_P5000') && isMyTurn && allGenso) power += 5000;
  if (hasSelf('CONT_SELF_ALLGENSO_P4000') && allGenso) power += 4000;
  return power;
}
function calcPower(state, pIdx, slot) {
  const P = state.players[pIdx];
  const card = P.stage[slot];
  if (!card) return 0;
  let pow = card.def.power;
  // 永續效（動態掃描）
  pow += continuousFromCX(P, card, slot).power;
  pow += continuousFromStage(P, card, slot, state, pIdx);
  // 自動效（觸發時已寫死在角色身上）
  pow += card.autoBuff && card.autoBuff.power || 0;
  // 惡夢特權(6)：NPC 所有角色 +1000 力量
  if (pIdx === 1 && nm(state, 'power')) pow += 1000;
  return pow;
}
function calcSoul(state, pIdx, slot) {
  const P = state.players[pIdx];
  const card = P.stage[slot];
  if (!card) return 0;
  let soul = card.def.soul || 0;
  // 永續效
  soul += continuousFromCX(P, card, slot).soul;
  // 自動效（寫死）
  soul += card.autoBuff && card.autoBuff.soul || 0;
  // 舊欄位相容
  soul += card.soulBuff || 0;
  return soul;
}

/* ============================================================
   Reducer：所有遊戲動作集中在這
   ============================================================ */
function gameReducer(state, action) {
  let s = gameReducerInner(state, action);
  // 統一收口：任何動作後若有角色力量降至 0 以下，立即破壞（規則處理）。
  // 僅在沒有 pending（不打斷互動流程）且處於對戰階段時檢查。
  const battlePhase = s && (s.phase === 'main' || s.phase === 'climax' || s.phase === 'attack' || s.phase === 'encore');
  if (s && !s.pending && battlePhase && s.players) {
    s = checkZeroPowerDestroy(s);
  }
  return s;
}
function gameReducerInner(state, action) {
  const s = structuredCloneState(state);
  s.fxEvents = []; // 每次動作重置特效事件
  s.banners = state.banners ? [] : []; // 每次動作重置 banner 佇列（不繼承）
  switch (action.type) {
    case 'SANDBOX_OP':
      {
        // 沙盒專用：自由擺放場面。op 種類見下。
        const op = action.op;
        const P = s.players[action.pIdx != null ? action.pIdx : 0];
        if (op === 'placeStage') {
          // 放一張卡到場上某格（指定 state）
          const c = mkCard(action.key, action.state || 'stand');
          if (c && action.slot >= 0 && action.slot <= 4) P.stage[action.slot] = c;
        } else if (op === 'clearStage') {
          P.stage[action.slot] = null;
        } else if (op === 'setStageState') {
          if (P.stage[action.slot]) P.stage[action.slot].state = action.state;
        } else if (op === 'addToZone') {
          // 加一張卡到 hand/stock/clock/level/wr/cx/resolution
          const c = mkCard(action.key, action.state || 'stand');
          if (c && Array.isArray(P[action.zone])) P[action.zone].push(c);
        } else if (op === 'deckTop') {
          // 把一張卡放到牌庫頂（pop 會先取到它）
          const c = mkCard(action.key, 'stand');
          if (c) P.deck.push(c);
        } else if (op === 'setCount') {
          // 把某 zone 設成 n 張；填充用「該系列・0費・無效果」的角色（香草），找不到才退回任意角色
          const zone = action.zone,
            n = Math.max(0, action.n | 0);
          const work = s.sandboxWork || '初始';
          const seriesKeys = Object.keys(DEFS).filter(k => (DEFS[k]['作品'] || '初始') === work);
          const vanilla = seriesKeys.find(k => DEFS[k].type === 'CHAR' && (DEFS[k].cost || 0) === 0 && !DEFS[k].fx && !DEFS[k].fxList);
          const anyChar = seriesKeys.find(k => DEFS[k].type === 'CHAR');
          const fillKey = action.key || vanilla || anyChar || 'v0_3000';
          while (P[zone].length > n) P[zone].pop();
          while (P[zone].length < n) {
            const c = mkCard(fillKey, 'stand');
            if (c) P[zone].push(c);else break;
          }
        } else if (op === 'clearZone') {
          P[action.zone] = [];
        } else if (op === 'shuffleDeck') {
          P.deck = shuffle(P.deck);
        } else if (op === 'setTurn') {
          s.turnPlayer = action.value;
        } else if (op === 'setPhase') {
          s.phase = action.value;
        } else if (op === 'setWinner') {
          s.winner = action.value;
        } else if (op === 'reset') {
          return makeSandboxState({
            p0: s.players[0].name,
            p1: s.players[1].name
          }, s.sandboxWork);
        } else if (op === 'fillDeck') {
          // 用目前作品的隨機合法牌組重新填滿牌庫
          const dl = makeRandomDeckList(s.sandboxWork || '初始');
          P.deck = shuffle(buildDeck(dl.length ? dl : null));
        } else if (op === 'defaultOpponent') {
          sandboxDefaultOpponent(s, s.sandboxWork);
        } else if (op === 'defaultMe') {
          sandboxDefaultMe(s, s.sandboxWork);
        } else if (op === 'addMany') {
          // 一次加入多張卡到某 zone（多選確定）。action.keys = [key,...]
          (action.keys || []).forEach(k => {
            const c = mkCard(k, 'stand');
            if (!c) return;
            if (action.zone === 'deck') P.deck.push(c);else if (Array.isArray(P[action.zone])) P[action.zone].push(c);
          });
        }
        return s;
      }
    case 'NET_MULL_TOGGLE':
      {
        const pi = action.pIdx;
        const P = s.players[pi];
        P.selectedHand = P.selectedHand || [];
        if (P.selectedHand.includes(action.id)) P.selectedHand = P.selectedHand.filter(x => x !== action.id);else P.selectedHand.push(action.id);
        return s;
      }
    case 'NET_MULL_DONE':
      {
        const pi = action.pIdx;
        const P = s.players[pi];
        const sel = P.selectedHand || [];
        const toss = P.hand.filter(c => sel.includes(c.id));
        const cnt = toss.length;
        P.hand = P.hand.filter(c => !sel.includes(c.id));
        for (let i = 0; i < cnt; i++) {
          if (P.deck.length > 0) P.hand.push(P.deck.pop());
        }
        toss.forEach(c => P.wr.push(c));
        P.selectedHand = [];
        if (!s.netMull) s.netMull = {
          done0: false,
          done1: false
        };
        s.netMull['done' + pi] = true;
        s.log.push(`${P.name} 換了 ${cnt} 張牌。`);
        // 雙方都完成 -> 開始遊戲
        if (s.netMull.done0 && s.netMull.done1) {
          s.turnPlayer = s.firstPlayer;
          return startPhaseChain(s);
        }
        return s;
      }
    case 'RPS_THROW':
      {
        // action.pIdx 出 action.hand (rock/paper/scissors)
        if (!s.rps) s.rps = {
          p0: null,
          p1: null,
          winner: null
        };
        s.rps['p' + action.pIdx] = action.hand;
        // 雙方都出了 -> 判定
        if (s.rps.p0 && s.rps.p1) {
          const beats = {
            rock: 'scissors',
            paper: 'rock',
            scissors: 'paper'
          };
          if (s.rps.p0 === s.rps.p1) {
            s.rps = {
              p0: null,
              p1: null,
              winner: null,
              tie: true
            };
            s.log.push('猜拳平手，重新出拳。');
          } else {
            const p0win = beats[s.rps.p0] === s.rps.p1;
            const w = p0win ? 0 : 1;
            s.rps.winner = w;
            s.rps.tie = false;
            s.firstPlayer = w;
            s.turnPlayer = w;
            s.log.push(`猜拳：${s.players[w].name} 勝，先攻。`);
            // 進入雙方各自 mulligan
            s.phase = 'net_mull';
            s.netMull = {
              done0: false,
              done1: false
            };
            s.players[0].selectedHand = [];
            s.players[1].selectedHand = [];
          }
        }
        return s;
      }
    case 'MULLIGAN_TOGGLE':
      {
        const id = action.id;
        if (s.selectedHand.includes(id)) s.selectedHand = s.selectedHand.filter(x => x !== id);else s.selectedHand.push(id);
        return s;
      }
    case 'MULLIGAN_DONE':
      {
        const P = s.players[0];
        const toss = P.hand.filter(c => s.selectedHand.includes(c.id));
        const n = toss.length;
        P.hand = P.hand.filter(c => !s.selectedHand.includes(c.id));
        for (let i = 0; i < n; i++) {
          if (P.deck.length > 0) P.hand.push(P.deck.pop());
        }
        toss.forEach(c => P.wr.push(c)); // 換掉的進控室
        // NPC mulligan：最多留1張CX、其餘CX換走；換走所有非0lv角色(確保有牌出)
        const np = s.players[1];
        let cxSeen = 0;
        const ntoss = [];
        np.hand.forEach(c => {
          if (c.def.type === 'CX') {
            cxSeen++;
            if (cxSeen > 1) ntoss.push(c.id);
          } else if (c.def.type === 'CHAR' && c.def.level > 0) ntoss.push(c.id);
        });
        const m = ntoss.length;
        const tt = np.hand.filter(c => ntoss.includes(c.id));
        np.hand = np.hand.filter(c => !ntoss.includes(c.id));
        for (let i = 0; i < m; i++) {
          if (np.deck.length > 0) np.hand.push(np.deck.pop());
        }
        tt.forEach(c => np.wr.push(c));
        s.selectedHand = [];
        s.log.push(`你換了 ${n} 張牌（共${n}張進控室）。對手換了 ${m} 張。先攻：${s.players[s.firstPlayer].name}。`);
        s.turnPlayer = s.firstPlayer;
        return startPhaseChain(s);
      }
    case 'NEXT_PHASE':
      return advancePhase(s);
    case 'CLOCK_DISCARD':
      {
        // 玩家輔助 buff1：clock 階段不能 clock（換牌），此動作無效。
        if (s.turnPlayer === 0 && pb(s, 'noClockDraw')) return s;
        const P = s.players[s.turnPlayer];
        const idx = P.hand.findIndex(c => c.id === action.id);
        if (idx >= 0) {
          P.clock.push(P.hand.splice(idx, 1)[0]);
          // 時序：先升級（clock 到門檻就升），再抽2，最後進 main。
          checkLevelUp(s, s.turnPlayer);
          if (s.winner !== null) return s;
          if (s.pending && s.pending.type === 'LEVELUP_PICK') {
            // 需要玩家選升級卡：抽2 與進 main 延後到選完卡（見 resolvePending 的 resume）
            s.clockDrawResume = {
              pIdx: s.turnPlayer
            };
            return s;
          }
          // 不需選卡：直接抽2 → 進 main（drawCards 內部處理 refresh+罰1）
          drawCards(s, s.turnPlayer, 2);
          s.log.push('Clock：升級結算後抽2。');
          s.phase = 'main';
          s.log.push('【Main】可出角色。');
        }
        return s;
      }
    case 'PB_DRAW_DISCARD':
      {
        // 玩家輔助 buff1：每回合 1 次「抽2丟1」，逐張抽（跟 3lv 那隻一樣），丟完直接過 clock phase。
        if (!(s.turnPlayer === 0 && pb(s, 'noClockDraw'))) return s;
        if (s.pbDrawUsedThisTurn) return s;
        if (s.pending) return s;
        s.pbDrawUsedThisTurn = true;
        s.log.push('輔助·抽2丟1：逐張抽。');
        // 逐步抽：最多2張，抽≥1後丟1；pbClock 標記讓丟完後自動進 main
        s.pending = {
          type: 'STEP_DRAW',
          pIdx: 0,
          drawn: 0,
          max: 2,
          pbClock: true
        };
        return s;
      }
    case 'PLAY_CX':
      {
        const P = s.players[s.turnPlayer];
        const idx = P.hand.findIndex(c => c.id === action.handId);
        if (idx < 0) return s;
        const card = P.hand[idx];
        if (card.def.type !== 'CX') {
          s.log.push('這不是高潮卡。');
          return s;
        }
        if (s.phase !== 'climax') {
          s.log.push('只能在 Climax 階段打高潮卡。');
          return s;
        }
        if (P.cx.length > 0) {
          s.log.push('本回合已打過高潮卡。');
          return s;
        }
        // CX 顏色規則：即使0費也要 Level區或Clock區有同色
        {
          const color = card.def.color;
          const hasColor = P.level.some(c => c.def.color === color) || P.clock.some(c => c.def.color === color);
          if (!hasColor) {
            s.log.push(`顏色條件不足：打 ${card.def.name} 需等級區或傷害區有${color === 'red' ? '紅' : color === 'blue' ? '藍' : color}色卡。`);
            return s;
          }
        }
        P.hand.splice(idx, 1);
        P.cx.push(card);
        s.log.push(`${P.name} 打出高潮卡：${card.def.name}（全體 +1000力量 +1Soul）。`);
        if (!s.banners) s.banners = [];
        s.banners.push({
          kind: 'cx',
          title: '使用高潮卡！',
          cardKeys: [card.key],
          big: true,
          confirmBy: 'opp',
          byPIdx: s.turnPlayer
        });
        // セプテット②：場上有 ON_CX_PLACED_COST_CHAR_LOOK4_GENSO 時觸發
        {
          const tp = s.turnPlayer;
          const septetSlots = [0,1,2,3,4].filter(i => {
            const c = P.stage[i];
            return c && (c.def.fxList || (c.def.fx ? [c.def.fx] : [])).includes('ON_CX_PLACED_COST_CHAR_LOOK4_GENSO');
          });
          const otherChars = [0,1,2,3,4].filter(i => {
            const c = P.stage[i];
            return c && !septetSlots.includes(i);
          });
          if (septetSlots.length > 0 && otherChars.length > 0) {
            if (isHuman(s, tp)) {
              s.pending = { type: 'SEPTET_CX_COST', pIdx: tp, septetSlots, otherChars };
            }
            // NPC：不發動（需消耗其他角色，太複雜）
          }
        }
        // 打完自動進 attack
        s.phase = 'attack';
        s.log.push('【Attack】可宣告攻擊。');
        if (!s.pending) triggerOppAtkPhase(s);
        return s;
      }
    case 'PLAY_CHAR':
      return playChar(s, action.handId, action.slot);
    case 'MOVE_CHAR':
      {
        const P = s.players[s.turnPlayer];
        const a = P.stage[action.from],
          b = P.stage[action.to];
        P.stage[action.to] = a;
        P.stage[action.from] = b || null;
        s.log.push(`移動：${a.def.name} → 位置${action.to}${b ? `（與 ${b.def.name} 交換）` : ''}。`);
        return s;
      }
    case 'DECLARE_ATTACK':
      return declareAttack(s, action.slot, action.kind);
    case 'RESOLVE_PENDING':
      return resolvePending(s, action.choice);
    case 'ACTIVATE_CONCENTRATE':
      return activateConcentrate(s, action.slot);
    case 'END_TURN':
      return endTurn(s);
    case 'NPC_STEP':
      return npcStep(s);
    case 'LOG':
      s.log.push(action.msg);
      return s;
    default:
      return state;
  }
}

// 深拷貝（structuredClone 對含 function 的 def 會失敗，故只拷狀態、def 用參照）
function structuredCloneState(state) {
  const clone = JSON.parse(JSON.stringify(state, (k, v) => k === 'def' ? undefined : v));
  // 還原 def 參照
  const restore = card => {
    if (card && card.key) card.def = DEFS[card.key];
    return card;
  };
  clone.players.forEach(P => {
    P.deck.forEach(restore);
    P.hand.forEach(restore);
    P.stock.forEach(restore);
    P.clock.forEach(restore);
    P.level.forEach(restore);
    P.wr.forEach(restore);
    P.cx.forEach(restore);
    P.resolution.forEach(restore);
    P.stage = P.stage.map(c => c ? restore(c) : null);
  });
  // 還原 pending 裡暫存的卡（STEP_LOOK 的 looked、其他 cards）
  if (clone.pending) {
    if (Array.isArray(clone.pending.looked)) clone.pending.looked.forEach(restore);
    if (Array.isArray(clone.pending.cards)) clone.pending.cards.forEach(restore);
    if (Array.isArray(clone.pending.drawnCards)) clone.pending.drawnCards.forEach(restore);
  }
  return clone;
}

// 網路傳送：移除 def 函式參照（序列化），收到端用 reviveState 還原
function stripState(state) {
  return JSON.parse(JSON.stringify(state, (k, v) => k === 'def' ? undefined : v));
}
function reviveState(plain) {
  const restore = card => {
    if (card && card.key) card.def = DEFS[card.key];
    return card;
  };
  plain.players.forEach(P => {
    P.deck.forEach(restore);
    P.hand.forEach(restore);
    P.stock.forEach(restore);
    P.clock.forEach(restore);
    P.level.forEach(restore);
    P.wr.forEach(restore);
    P.cx.forEach(restore);
    P.resolution.forEach(restore);
    P.stage = P.stage.map(c => c ? restore(c) : null);
  });
  if (plain.pending) {
    if (Array.isArray(plain.pending.looked)) plain.pending.looked.forEach(restore);
    if (Array.isArray(plain.pending.cards)) plain.pending.cards.forEach(restore);
    if (Array.isArray(plain.pending.drawnCards)) plain.pending.drawnCards.forEach(restore);
  }
  return plain;
}

/* ---------- 階段推進 ---------- */
function startPhaseChain(s) {
  const P = s.players[s.turnPlayer];
  // 玩家輔助 buff1：每回合重置「抽2丟1」使用次數（玩家回合開始時）
  if (s.turnPlayer === 0) s.pbDrawUsedThisTurn = false;
  // ===== 惡夢特權：回合開始時觸發 =====
  if (s.nightmare) {
    const npc = s.players[1];
    if (s.turnPlayer === 0) {
      // 玩家(對手)回合開始：(5-1) NPC 控室CX洗回牌庫，並隨機把最多3張非CX從牌庫放進控室
      if (nm(s, 'cxRecycle')) {
        const wrCx = npc.wr.filter(c => c.def.type === 'CX');
        if (wrCx.length > 0) {
          // 只隨機洗回 1 張 CX 回牌庫（隨機位置）
          const cx = wrCx[Math.floor(Math.random() * wrCx.length)];
          const ri = npc.wr.indexOf(cx);
          if (ri >= 0) npc.wr.splice(ri, 1);
          const pos = Math.floor(Math.random() * (npc.deck.length + 1));
          npc.deck.splice(pos, 0, Object.assign({}, cx, {
            state: 'stand'
          }));
          // 隨機把最多3張非CX從牌庫放進控室(視乎牌庫)
          const deckNonCx = npc.deck.filter(c => c.def.type !== 'CX');
          const moveN = Math.min(3, deckNonCx.length);
          for (let i = 0; i < moveN; i++) {
            const pick = deckNonCx[Math.floor(Math.random() * deckNonCx.length)];
            const di = npc.deck.indexOf(pick);
            if (di >= 0) {
              npc.wr.push(npc.deck.splice(di, 1)[0]);
              deckNonCx.splice(deckNonCx.indexOf(pick), 1);
            }
          }
          s.log.push(`😈 ${npc.name}（惡夢·被動壓縮）：1張CX洗回牌庫，${moveN}張非CX進控室。`);
        }
      }
    } else if (s.turnPlayer === 1) {
      // NPC 自己回合開始：
      // (5-2) 越級：累積永續。每3個NPC回合 -1lv，第3回合起-1、第6起-2…（floor(回合數/3)）
      if (nm(s, 'lvReduce')) {
        s.nmTurnCounter = (s.nmTurnCounter || 0) + 1;
        const prev = s.nmLvReduceAmt || 0;
        s.nmLvReduceAmt = Math.floor(s.nmTurnCounter / 3);
        if (s.nmLvReduceAmt > 0) {
          if (s.nmLvReduceAmt > prev) s.log.push(`😈 ${npc.name}（惡夢·越級）：等級減免提升至 -${s.nmLvReduceAmt}（累積永續）。`);else s.log.push(`😈 ${npc.name}（惡夢·越級）：所有卡出場等級限制 -${s.nmLvReduceAmt}（累積中）。`);
        }
      }
      // (5-3) 錢區 ≤3 時，從控室選1張非CX放進錢
      if (nm(s, 'stockRefill') && npc.stock.length <= 3) {
        const wrNonCx = npc.wr.filter(c => c.def.type !== 'CX');
        if (wrNonCx.length > 0) {
          // 選 power 較高的非CX(較有價值)
          const pick = wrNonCx.sort((a, b) => (b.def.power || 0) - (a.def.power || 0))[0];
          const wi = npc.wr.indexOf(pick);
          npc.stock.push(npc.wr.splice(wi, 1)[0]);
          s.log.push(`😈 ${npc.name}（惡夢·預算補充）：從控室取1張進錢區。`);
        }
      }
    }
  }
  P.stage.forEach(c => {
    if (c) c.state = 'stand';
  });
  s.attacksThisTurn = 0;
  s.npcConcUsed = false;
  s.movedThisTurn = [];
  s.log.push(`── ${P.name} 的回合 (T${s.turnCount}) ──`);
  s.log.push('【Stand】所有角色直立。');
  // Stand 與 Draw 是強制步驟，自動連跑，停在 Clock 讓玩家操作
  s.phase = 'draw';
  drawCards(s, s.turnPlayer, 1);
  if (s.winner !== null) return s;
  s.phase = 'clock';
  s.log.push('【Clock】可棄1張換抽2（點手牌上的⏳），或按下一步略過。');
  return s;
}
function advancePhase(s) {
  if (s.phase === 'clock') {
    s.phase = 'main';
    s.log.push('【Main】可出角色、移動角色。');
    return s;
  }
  if (s.phase === 'main') {
    s.phase = 'climax';
    s.log.push('【Climax】可打出1張高潮卡（點手牌的CX），或按下一步略過。');
    return s;
  }
  if (s.phase === 'climax') {
    s.phase = 'attack';
    s.log.push('【Attack】可宣告攻擊（點前列直立角色）。');
    triggerOppAtkPhase(s);
    return s;
  }
  if (s.phase === 'attack') {
    s.phase = 'encore';
    s.log.push('【Encore】處理倒置角色（付3錢復活或落控室）。');
    return processEncore(s);
  }
  if (s.phase === 'encore') {
    return endTurn(s);
  }
  return s;
}

/* ---------- 牌庫核心：pull 一張，取完立即檢查歸零 ----------
   WS 規則：牌庫一變 0 就立即 refresh（洗控室+罰1傷），不等到下次取牌。
   pull 回傳取到的卡（或 null=deck out）。取完若 deck 歸零，立即 refresh。
*/
function refreshNow(s, pIdx) {
  // 牌庫歸零的立即處理：控室洗成新牌庫 + 罰1傷
  const P = s.players[pIdx];
  if (P.deck.length > 0) return; // 還有牌不用 refresh
  if (P.wr.length === 0) {
    // 控室也空 -> deck out
    if (s.winner === null) {
      s.winner = pIdx === 0 ? 1 : 0;
      s.log.push(`${P.name} 牌庫與控室皆空，Deck Out！`);
      s.log.push(`🏆 ${s.players[s.winner].name} 獲勝！(對手 Deck Out)`);
    }
    return;
  }
  P.deck = shuffle(P.wr.map(c => ({
    ...c,
    state: 'stand'
  })));
  P.wr = [];
  s.log.push(`🔄 ${P.name} Refresh！控室洗回牌庫。`);
  const pen = pullNoRefresh(P);
  if (pen) {
    P.clock.push(pen);
    s.log.push(`⚠️ ${P.name} Refresh 罰傷 1 點（傷害區 ${P.clock.length}/${clockThresholdFor(s, pIdx)}）。`);
  }
  refreshNow(s, pIdx);
  checkLevelUp(s, pIdx);
}
// 純粹取一張，不觸發 refresh（內部用）
function pullNoRefresh(P) {
  if (P.deck.length === 0) return null;
  return P.deck.pop();
}
// 對外：取一張，取完立即檢查歸零 -> refresh
// 記錄一個卡移動特效事件
function pushFx(s, kind, pIdx, card, from, to) {
  if (!s.fxEvents) s.fxEvents = [];
  s.fxEvents.push({
    kind,
    pIdx,
    cardId: card ? card.id : null,
    key: card ? card.key : null,
    from,
    to
  });
}
// deferRefresh=true：取牌後「不」立即 refresh（給集中/看N用，因為碌出的牌去向未定，
// 不能讓 refresh 把控室洗回；由呼叫端在「該張牌去向確定後」自行呼叫 maybeRefresh）。
// 取「前」若 deck 已空仍要 refresh（否則無牌可取），這個不受 defer 影響。
function pull(s, pIdx, deferRefresh) {
  const P = s.players[pIdx];
  if (P.deck.length === 0) refreshNow(s, pIdx);
  if (P.deck.length === 0) return null; // deck out
  const c = P.deck.pop();
  if (!deferRefresh && P.deck.length === 0) refreshNow(s, pIdx); // 取完立即檢查
  return c;
}
// 延後 refresh 的機制，在「牌去向確定後」呼叫，補做 deck 歸零檢查。
function maybeRefresh(s, pIdx) {
  const P = s.players[pIdx];
  if (P.deck.length === 0) refreshNow(s, pIdx);
}

/* ---------- 抽牌 ---------- */
function drawCards(s, pIdx, n) {
  const P = s.players[pIdx];
  for (let i = 0; i < n; i++) {
    const c = pull(s, pIdx);
    if (!c) {
      // deck out
      if (s.winner === null) {
        s.winner = pIdx === 0 ? 1 : 0;
        s.log.push(`${P.name} 牌庫耗盡，無法抽牌！`);
        s.log.push(`🏆 ${s.players[s.winner].name} 獲勝！(對手 Deck Out)`);
      }
      return;
    }
    P.hand.push(c);
    if (!s.fxEvents) s.fxEvents = [];
    s.fxEvents.push({
      kind: 'draw',
      pIdx,
      cardId: c.id,
      key: c.key,
      from: 'deck' + pIdx,
      to: 'hand' + pIdx
    });
    if (s.mode === 'net') s.log.push(`${P.name} 抽了1張。`); // 連線：不洩漏卡名(自己靠banner看)
    else if (pIdx === 0) s.log.push(`你抽到：${c.def.name}`);else s.log.push(`${P.name} 抽了1張。`);
  }
}

/* ---------- 傷害 / cancel ---------- */
function takeDamage(s, pIdx, dmg) {
  const P = s.players[pIdx];
  for (let i = 0; i < dmg; i++) {
    const c = pull(s, pIdx);
    if (!c) break;
    P.clock.push(c);
  }
  s.log.push(`${P.name} 受到 ${dmg} 點傷害。`);
  checkLevelUp(s, pIdx);
}

// 攻擊造成的傷害（可 cancel）：翻 soul 張，翻到CX立即cancel
function dealBattleDamage(s, attackerPIdx, defenderPIdx, soul) {
  const D = s.players[defenderPIdx];
  // 惡夢特權：NPC(P1) 為防守方時的傷害免疫判斷（在翻牌前先判，免疫則完全不吃傷）
  if (defenderPIdx === 1 && s.nightmare) {
    const immuneBanner = (subtitle) => {
      if (!s.banners) s.banners = [];
      s.banners.push({
        kind: 'immune',
        title: '🛡️ 傷害免疫！',
        subtitle,
        confirmBy: 'attacker',
        byPIdx: attackerPIdx,
        dur: 1400,
        big: true
      });
    };
    // (5) 升級後整個對手回合免疫
    if (nm(s, 'lvImmune') && s.nmLvImmuneTurn) {
      s.log.push(`🛡️ ${D.name}（惡夢·升級回合免疫）本次傷害免疫。`);
      immuneBanner('惡夢·升級護盾');
      return false;
    }
    // (4) 傷害(soul) ≥4 直接免疫
    if (nm(s, 'dmg4immune') && soul >= 4) {
      s.log.push(`🛡️ ${D.name}（惡夢·大傷免疫）傷害 ${soul}≥4，免疫。`);
      immuneBanner(`惡夢·大傷免疫（${soul}≥4）`);
      return false;
    }
    // 注意：(3) 33%免疫 已移到「翻牌後、確認沒 cancel 時」才擲（見下方），
    // 因為規則改成只有 NPC 沒 cancel 該次傷害時才有 33% 機會免疫。
  }
  const revealed = [];
  let canceled = false;
  let cancelAt = 0;
  for (let i = 0; i < soul; i++) {
    const c = pull(s, defenderPIdx);
    if (!c) break;
    revealed.push(c);
    if (c.def.type === 'CX') {
      canceled = true;
      cancelAt = revealed.length;
      break;
    }
  }
  if (canceled) {
    revealed.forEach(c => D.wr.push(c));
    s.log.push(`💥 ${D.name} 第 ${cancelAt}/${soul} 張翻到 CX，CANCEL！傷害取消。`);
  } else {
    // (3) 惡夢·33%免疫：規則改為「NPC 沒 cancel 時才有 33% 機會免疫」。
    // 只對 NPC(P1) 防守、且沒翻到 CX(沒 cancel) 時擲。命中則翻出的牌進控室(不進clock、不升級)。
    if (defenderPIdx === 1 && nm(s, 'dmg25') && revealed.length > 0 && Math.random() < 0.33) {
      revealed.forEach(c => D.wr.push(c));
      s.log.push(`🛡️ ${D.name}（惡夢·33%免疫）沒駁回但幸運閃避本次傷害。`);
      if (!s.banners) s.banners = [];
      s.banners.push({
        kind: 'immune',
        title: '🛡️ 傷害免疫！',
        subtitle: '惡夢·幸運閃避（33%）',
        confirmBy: 'attacker',
        byPIdx: attackerPIdx,
        dur: 1400,
        big: true
      });
      return false;
    }
    revealed.forEach(c => D.clock.push(c));
    s.log.push(`${D.name} 受到 ${revealed.length} 點傷害（${revealed.length}張無CX）。`);
    checkLevelUp(s, defenderPIdx);
  }
  // 吃傷特效：逐張顯示翻出的卡，結果 Cancel 或 造成傷害；確認方=攻擊方
  if (revealed.length > 0) {
    if (!s.banners) s.banners = [];
    s.banners.push({
      kind: canceled ? 'cancel' : 'damage',
      title: canceled ? `Cancel！${cancelAt}/${soul}` : `造成 ${revealed.length} 傷害！`,
      cardKeys: revealed.map(c => c.key),
      stagger: true,
      // 逐張顯示
      confirmBy: 'attacker',
      byPIdx: attackerPIdx,
      big: true
    });
  }
  return canceled;
}
function checkLevelUp(s, pIdx) {
  const P = s.players[pIdx];
  // 升級門檻（每級要多少 clock 才升）：NPC 開 9傷升級時為 9，否則 7。玩家永遠 7。
  const threshold = pIdx === 1 && nm(s, 'dmg9level') ? 9 : 7;
  // 判負職級：NPC 開 Lv5才輸 時為 5（即升到 5 才判負），否則 4。玩家永遠 4。
  const loseLevel = pIdx === 1 && nm(s, 'lv5win') ? 5 : 4;
  while (P.clock.length >= threshold) {
    // 玩家輔助 buff3：最後一搏進行中，玩家不再因傷害死亡（撐到自己回合結束才結算）。
    if (pIdx === 0 && s.pbLastStandActive) {
      // 把超出的傷害移到控室，避免無限循環；不升級、不判負。
      const overflow = P.clock.splice(0, threshold);
      overflow.forEach(c => P.wr.push(c));
      s.log.push('✨ 最後一搏：傷害被暫時擋下（撐到你回合結束）。');
      continue;
    }
    // 若這次升級會達到判負職級
    if (P.level.length >= loseLevel - 1) {
      const taken = P.clock.splice(0, threshold);
      P.level.push(taken.shift());
      taken.forEach(c => P.wr.push(c));
      // 玩家輔助 buff3：玩家在「對手回合」升到判負職級時暫時不死，獲得最後一個自己的回合。
      if (pIdx === 0 && pb(s, 'lastStand') && s.turnPlayer === 1 && !s.pbLastStandActive) {
        s.pbLastStandActive = true;
        s.log.push(`✨ 最後一搏！你升到 Level ${P.level.length} 但暫時不死，將獲得最後一個回合 —— 該回合結束前若未擊敗對手，你落敗。`);
        if (!s.banners) s.banners = [];
        s.banners.push({
          kind: 'immune',
          title: '✨ 最後一搏！',
          subtitle: '撐到你回合結束，擊敗對手才能逆轉',
          confirmBy: 'opp',
          byPIdx: 0,
          dur: 2200,
          big: true
        });
        return;
      }
      s.winner = pIdx === 0 ? 1 : 0;
      s.log.push(`🏆 ${s.players[s.winner].name} 獲勝！(對手到達 Level ${loseLevel})`);
      return;
    }
    if (isHuman(s, pIdx)) {
      s.pending = {
        type: 'LEVELUP_PICK',
        pIdx,
        threshold,
        cards: P.clock.slice(0, threshold).map(c => ({
          id: c.id
        }))
      };
      return;
    }
    // NPC：自動選第1張進 level
    const taken = P.clock.splice(0, threshold);
    const toLevel = taken.shift();
    P.level.push(toLevel);
    taken.forEach(c => P.wr.push(c));
    s.log.push(`⬆️ ${P.name} 升級！現在 Level ${P.level.length}。`);
    // 惡夢特權(5)：NPC 升級後，整個對手回合免疫傷害（標記，於玩家回合結束時清除）
    if (pIdx === 1 && nm(s, 'lvImmune')) {
      s.nmLvImmuneTurn = true;
      s.log.push(`🛡️ ${P.name} 升級觸發惡夢護盾：本對手回合免疫傷害。`);
    }
    if (P.level.length >= loseLevel) {
      s.winner = pIdx === 0 ? 1 : 0;
      s.log.push(`🏆 ${s.players[s.winner].name} 獲勝！(對手到達 Level ${loseLevel})`);
      return;
    }
  }
}

/* ---------- 出角色 ---------- */
function playChar(s, handId, slot) {
  const P = s.players[s.turnPlayer];
  const idx = P.hand.findIndex(c => c.id === handId);
  if (idx < 0) return s;
  const card = P.hand[idx];
  if (card.def.type !== 'CHAR') {
    s.log.push('只能在此放角色卡。');
    return s;
  }

  // 早出判定（覇者·烈）
  let effLevel = card.def.level;
  if (card.def.fx === 'RED3_PACKAGE') {
    const cxInWr = P.wr.filter(c => c.def.type === 'CX').length;
    if (cxInWr <= 2) effLevel = Math.max(0, card.def.level - 1);
  }
  // 惡夢越級(5-2)：NPC 出場lv門檻 -nmLvReduceAmt（累積永續）。出場後 def 不變，
  // 故場上角色的 def.level 仍是原值（側打soul、依lv加攻都讀def.level，不受影響）。
  if (s.turnPlayer === 1 && s.nightmare && (s.nmLvReduceAmt || 0) > 0) {
    effLevel = Math.max(0, effLevel - s.nmLvReduceAmt);
  }
  if (effLevel > P.level.length) {
    s.log.push(`等級不足，無法出 ${card.def.name}（需Lv${effLevel}）。`);
    return s;
  }
  if (P.stock.length < card.def.cost) {
    s.log.push(`錢不足，無法出 ${card.def.name}（需${card.def.cost}費）。`);
    return s;
  }
  const _cipFxs = card.def.fxList || (card.def.fx ? [card.def.fx] : []);
  if (!_cipFxs.includes('NO_COLOR_RESTRICTION') && !meetsColorRequirement(P, card)) {
    s.log.push(`顏色條件不足：出 ${card.def.name}（${card.def.cost}費）需等級區或傷害區有同色卡。`);
    return s;
  }

  // 付費
  if (card.def.cost > 0) {
    for (let i = 0; i < card.def.cost; i++) {
      const paid = P.stock.pop();
      P.wr.push(paid);
      pushFx(s, 'pay', s.turnPlayer, paid, 'stock' + s.turnPlayer, 'wr' + s.turnPlayer);
    }
    s.log.push(`${P.name} 支付 ${card.def.cost} 費（錢區→控室）。`);
  }

  // 踩死：若該位置已有角色，舊角色落墳，立即可 encore（含連鎖）
  const old = P.stage[slot];
  P.hand.splice(idx, 1);
  card.state = 'stand';
  P.stage[slot] = card;
  s.log.push(`${P.name} 出場：${card.def.name} → 位置${slot}（落場按Lv${card.def.level}）。`);
  // 先做 CIP（出場效果），再處理踩死 encore（這樣 CIP pending 與 crush encore 不衝突）
  s = applyCIP(s, s.turnPlayer, slot, card);
  if (old) {
    P.wr.push(old);
    s.log.push(`${old.def.name} 被踩死，落控室。`);
    s = applyLeaveStage(s, s.turnPlayer, old);
    // 若沒有 CIP/leave pending 卡住，立即處理踩死 encore
    if (!s.pending) {
      s = askCrushEncore(s, s.turnPlayer, old, slot);
    } else {
      // CIP 有 pending，把踩死 encore 暫存，CIP 結算後處理
      s.pendingCrush = {
        pIdx: s.turnPlayer,
        cardId: old.id,
        slot
      };
    }
  }
  return s;
}

// 踩死 encore：詢問是否付費復活到原位（可能擠走現在那格的角色 -> 連鎖）
function askCrushEncore(s, pIdx, deadCard, slot) {
  const P = s.players[pIdx];
  const cost = encoreCost(s, pIdx);
  if (P.stock.length < cost) {
    // 錢不夠，不問（已落控室）
    return s;
  }
  if (isHuman(s, pIdx)) {
    s.pending = {
      type: 'CRUSH_ENCORE',
      pIdx,
      cardId: deadCard.id,
      slot
    };
    return s;
  }
  // NPC：lv>=2 且划算才 encore
  if (deadCard.def.level >= 2) {
    return doCrushEncore(s, pIdx, deadCard.id, slot);
  }
  return s;
}
function doCrushEncore(s, pIdx, cardId, slot) {
  const P = s.players[pIdx];
  const cost = encoreCost(s, pIdx);
  const idx = P.wr.findIndex(c => c.id === cardId);
  if (idx < 0 || P.stock.length < cost) return s;
  const dead = P.wr.splice(idx, 1)[0];
  for (let i = 0; i < cost; i++) P.wr.push(P.stock.pop());
  dead.state = 'rest'; // encore 復活為橫置
  const occupant = P.stage[slot];
  P.stage[slot] = dead;
  s.log.push(`${P.name} Encore：${dead.def.name} 復活到位置${slot}（橫置）。`);
  if (!s.banners) s.banners = [];
  s.banners.push({
    kind: 'encore',
    title: 'Encore！',
    cardKeys: [dead.key],
    confirmBy: 'opp',
    byPIdx: pIdx,
    big: true
  });
  if (occupant) {
    // 擠走現在那格的角色 -> 落控室 -> 連鎖 encore
    P.wr.push(occupant);
    s.log.push(`${occupant.def.name} 被擠走，落控室。`);
    return askCrushEncore(s, pIdx, occupant, slot);
  }
  return s;
}

/* ---------- CIP（出場時）效果 ---------- */
function applyCIP(s, pIdx, slot, card) {
  const P = s.players[pIdx];
  const fxs = card.def.fxList || (card.def.fx ? [card.def.fx] : []);
  const cipHas = x => fxs.includes(x);

  if (cipHas('CIP_TOPDECK_DROP_RESTSELF')) {
    // 偵察兵·燕：碌2，一律落控室；2張中任一張是CX則此卡橫置
    let anyCX = false;
    const sflip = [];
    for (let k = 0; k < 2; k++) {
      const top = pull(s, pIdx);
      if (!top) break;
      sflip.push(top);
      P.wr.push(top);
      s.log.push(`${card.def.name}：碌出 ${top.def.name} 落控室。`);
      if (top.def.type === 'CX') anyCX = true;
    }
    if (anyCX) {
      card.state = 'rest';
      s.log.push(`碌中CX，${card.def.name} 橫置。`);
    }
    if (sflip.length > 0) {
      if (!s.banners) s.banners = [];
      s.banners.push({
        kind: 'reveal',
        title: `${card.def.name} 出場`,
        cardKeys: [card.key],
        dur: 1000,
        byPIdx: pIdx
      });
      s.banners.push({
        kind: 'flip',
        stagingTitle: '偵察兵·碌2',
        title: anyCX ? '碌中CX，橫置' : '碌2完成',
        cardKeys: sflip.map(c => c.key),
        stagger: true,
        confirmBy: 'opp',
        byPIdx: pIdx,
        big: true
      });
    }
  }

  if (cipHas('RED3_PACKAGE')) {
    if (P.clock.length > 0) {
      if (isHuman(s, pIdx)) {
        s.pending = { type: 'RED3_CLOCKDROP', pIdx, slot };
      } else {
        const c = P.clock.pop();
        P.wr.push(c);
        s.log.push(`${P.name} 將傷害區頂落控室。`);
      }
    }
  }

  if (cipHas('BLUE3_PACKAGE')) {
    // 逐步抽：最多2張，抽≥1後丟1
    if (isHuman(s, pIdx)) {
      s.pending = { type: 'STEP_DRAW', pIdx, drawn: 0, max: 2 };
    } else {
      drawCards(s, pIdx, 2);
      if (P.hand.length > 0) {
        const d = P.hand.shift();
        P.wr.push(d);
        s.log.push(`${P.name} draw2丟1。`);
      }
    }
  }

  if (cipHas('BLUE3_LOOK3_BURN')) {
    // 逐步看：最多3張，最後選1上手其餘落控室
    if (isHuman(s, pIdx)) {
      s.pending = { type: 'STEP_LOOK', pIdx, looked: [], max: 3 };
    } else {
      const lookN = Math.min(3, P.deck.length);
      const top = takeTop(s, pIdx, lookN, true);
      let kept = false;
      top.forEach(c => {
        if (!kept && c.def.type === 'CHAR') { P.hand.push(c); kept = true; }
        else P.wr.push(c);
      });
      s.log.push(`${P.name} 看牌庫頂3張取1。`);
      maybeRefresh(s, pIdx);
    }
  }

  // 咲夜①：登場當回合自身 +1500
  if (cipHas('CIP_BUFF_SELF_1500')) {
    card.autoBuff = card.autoBuff || { power: 0, soul: 0 };
    card.autoBuff.power += 1500;
    s.log.push(`✨ ${card.def.name}：登場當回合 +1500。`);
  }

  // 妖夢：登場選任意1隻我方角色當回合 +1500
  if (cipHas('CIP_BUFF_ANY_1500') && !s.pending) {
    const cands = [0,1,2,3,4].filter(i => s.players[pIdx].stage[i]);
    if (cands.length > 0) {
      if (isHuman(s, pIdx)) {
        s.pending = { type: 'CHARSEL_BUFF', pIdx, amount: 1500, cand: cands, source: card.def.name };
      } else {
        // NPC：優先選力量最高的（含自身）
        const best = cands.reduce((a, b) =>
          calcPower(s, pIdx, a) >= calcPower(s, pIdx, b) ? a : b);
        const bc = s.players[pIdx].stage[best];
        bc.autoBuff = bc.autoBuff || { power: 0, soul: 0 };
        bc.autoBuff.power += 1500;
        s.log.push(`✨ ${card.def.name}：${bc.def.name} 當回合 +1500。`);
      }
    }
  }

  // セプテット①：登場碌頂2張落控室，自身當回合 +（幻想郷角色數×1000）
  if (cipHas('CIP_MILL2_SELF_GENSO_BUFF') && !s.pending) {
    const milled = [];
    for (let k = 0; k < 2; k++) {
      const top = pull(s, pIdx, true); // deferRefresh
      if (!top) break;
      milled.push(top);
      P.wr.push(top);
    }
    maybeRefresh(s, pIdx);
    const gensoN = milled.filter(c => c.def.type === 'CHAR' && hasTrait(c, '幻想郷')).length;
    if (gensoN > 0) {
      card.autoBuff = card.autoBuff || { power: 0, soul: 0 };
      card.autoBuff.power += gensoN * 1000;
    }
    s.log.push(`🔴 ${card.def.name}：碌${milled.length}張，其中${gensoN}隻幻想郷，當回合 +${gensoN*1000}。`);
    if (milled.length > 0) {
      if (!s.banners) s.banners = [];
      s.banners.push({
        kind: 'reveal',
        title: `${card.def.name} 出場`,
        cardKeys: [card.key],
        dur: 1000,
        byPIdx: pIdx
      });
      s.banners.push({
        kind: 'flip',
        stagingTitle: `${card.def.name}·碌2`,
        title: `幻想郷×${gensoN}，+${gensoN*1000}`,
        cardKeys: milled.map(c => c.key),
        stagger: true,
        confirmBy: 'opp',
        byPIdx: pIdx,
        big: true
      });
    }
  }

  // パチュリー：登場時可選擇支付[(1)棄1張手牌]，看牌庫頂最多7張取1幻想郷，自身 +1500
  if (cipHas('CIP_OPT_LOOK7_GENSO_SELF1500') && !s.pending) {
    const canPay = P.stock.length >= 1 && P.hand.length > 0;
    if (canPay) {
      if (isHuman(s, pIdx)) {
        s.pending = {
          type: 'OPT_COST_ASK',
          pIdx,
          slot,
          costDesc: '(1) 棄 1 張手牌',
          onPayFx: 'LOOK7_GENSO_SELF1500',
          cardName: card.def.name
        };
      } else {
        // NPC：不發動（效果搜索對NPC幫助有限，且需要消耗）
        s.log.push(`${card.def.name}：NPC 略過看牌效果。`);
      }
    }
  }

  return s;
}

/* ---------- 角色離場效果 ---------- */
// 當有離場效果的角色從舞台放到控室時呼叫（crush/encore/zero destroy 均需呼叫）
function applyLeaveStage(s, pIdx, card) {
  const fxs = card.def.fxList || (card.def.fx ? [card.def.fx] : []);
  if (!fxs.includes('LEAVE_LOOK3_GENSO_TAKE_DISCARD1')) return s;
  const P = s.players[pIdx];
  s.log.push(`✨ ${card.def.name}：從舞台離場，觸發看牌效果。`);
  if (isHuman(s, pIdx)) {
    s.pending = {
      type: 'STEP_LOOK',
      pIdx,
      looked: [],
      max: 3,
      filterGensokyo: true,
      afterDiscard1: true
    };
  } else {
    const lookN = Math.min(3, P.deck.length);
    const top = takeTop(s, pIdx, lookN, true);
    if (top.length > 0) {
      let kept = false;
      top.forEach(c => {
        if (!kept && c.def.type === 'CHAR' && hasTrait(c, '幻想郷')) { P.hand.push(c); kept = true; }
        else P.wr.push(c);
      });
      maybeRefresh(s, pIdx);
      // NPC 丟最左一張手牌
      if (P.hand.length > 0) {
        const d = P.hand.shift();
        P.wr.push(d);
        s.log.push(`${P.name} 咲夜效果：棄 ${d.def.name}。`);
      }
    }
  }
  return s;
}
function peekTop(P, n) {
  return P.deck.slice(-n).reverse().map(c => ({
    id: c.id,
    name: c.def.name,
    key: c.key
  }));
}
function takeTop(s, pIdx, n, deferRefresh) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = pull(s, pIdx, deferRefresh);
    if (c) out.push(c);else break;
  }
  return out;
}

/* ---------- 攻擊 ---------- */
// 攻擊時效果：在攻擊模式決定後、燒之前觸發（同步、不需 pending）
function runAttackFx(s, ctx) {
  const aP = s.players[ctx.aPIdx];
  const dP = s.players[ctx.dPIdx];
  const attacker = aP.stage[ctx.slot];
  if (!attacker) return s;
  const fxs = attacker.def.fxList || (attacker.def.fx ? [attacker.def.fx] : []);
  const has = x => fxs.indexOf(x) >= 0;
  const revealTop = () => {
    if (aP.deck.length === 0) maybeRefresh(s, ctx.aPIdx);
    if (aP.deck.length === 0) return null;
    return aP.deck[aP.deck.length - 1];
  };
  const buffSelf = amt => {
    attacker.autoBuff = attacker.autoBuff || {
      power: 0,
      soul: 0
    };
    attacker.autoBuff.power += amt;
  };
  // 翻頂判定的視覺：先公開牌庫頂(停留1秒)，再顯示發動成功(含效果)或失敗
  const pushReveal = (topCard, success, fxLabel) => {
    if (!s.banners) s.banners = [];
    s.banners.push({
      kind: 'reveal',
      title: '公開牌庫頂',
      cardKeys: topCard ? [topCard.key] : [],
      dur: 1000,
      byPIdx: ctx.aPIdx
    });
    s.banners.push({
      kind: 'reveal',
      title: success ? '發動成功' : '發動失敗',
      subtitle: success ? fxLabel : null,
      dur: success ? 1500 : 1100,
      byPIdx: ctx.aPIdx,
      big: true
    });
  };
  // メディスン：攻擊時公開頂1張，是幻想郷角色 → 對手前列全部當回合 -2500
  if (has('ATK_TOPCHECK_OPPFRONT_M2500')) {
    const top = revealTop();
    if (top) {
      s.log.push(`👁 公開牌庫頂：${top.def.name}`);
      const success = top.def.type === 'CHAR' && hasTrait(top, '幻想郷');
      if (success) {
        FRONT.forEach(fs => {
          const c = dP.stage[fs];
          if (c) {
            c.autoBuff = c.autoBuff || {
              power: 0,
              soul: 0
            };
            c.autoBuff.power -= 2500;
          }
        });
        s.log.push(`🟣 ${attacker.def.name}：對手前列全部當回合 -2500。`);
      }
      pushReveal(top, success, '對手前列全部 −2500');
    }
  }
  // 椛：攻擊時自己 +（其他我方幻想郷角色數 × 1000）
  if (has('ATK_SELF_PX_GENSO1000')) {
    const otherGenso = aP.stage.filter((c, i) => c && i !== ctx.slot && hasTrait(c, '幻想郷')).length;
    if (otherGenso > 0) {
      buffSelf(otherGenso * 1000);
      s.log.push(`🟢 ${attacker.def.name}：當回合 +${otherGenso * 1000}（其他幻想郷×1000）。`);
    }
  }
  // マミゾウ：攻擊時，選 1 隻我方角色當回合 +1000
  if (has('ATK_BUFF_ANY_1000')) {
    const cands = [0,1,2,3,4].filter(i => aP.stage[i]);
    if (cands.length > 0) {
      if (isHuman(s, ctx.aPIdx)) {
        s.pending = { type: 'CHARSEL_BUFF', pIdx: ctx.aPIdx, amount: 1000, cand: cands, source: attacker.def.name };
        ctx.resumeAfterPending = 'counter';
      } else {
        const best = cands.reduce((a, b) => calcPower(s, ctx.aPIdx, a) >= calcPower(s, ctx.aPIdx, b) ? a : b);
        const bc = aP.stage[best];
        bc.autoBuff = bc.autoBuff || { power: 0, soul: 0 };
        bc.autoBuff.power += 1000;
        s.log.push(`✨ ${attacker.def.name}：${bc.def.name} 當回合 +1000。`);
      }
    }
  }
  // 椛①：攻擊時看自方牌庫底1張與對手牌庫底1張（只顯示，放回）
  if (has('ATK_PEEK_BOTH_BOTTOM')) {
    const myBot = aP.deck.length > 0 ? aP.deck[0] : null;
    const oppBot = dP.deck.length > 0 ? dP.deck[0] : null;
    s.log.push(`🔭 ${attacker.def.name}：自方牌庫底＝${myBot ? myBot.def.name : '無'}；對方牌庫底＝${oppBot ? oppBot.def.name : '無'}。`);
    if (!s.banners) s.banners = [];
    s.banners.push({
      kind: 'reveal',
      title: `椛·看雙方牌庫底`,
      subtitle: `自方：${myBot ? myBot.def.name : '無'} ／ 對方：${oppBot ? oppBot.def.name : '無'}`,
      cardKeys: [myBot, oppBot].filter(Boolean).map(c => c.key),
      dur: 5000,
      confirmBy: 'attacker',
      byPIdx: ctx.aPIdx
    });
  }
  // ミスティア：攻擊時，若其他幻想郷≥2 且正面對手角色等級=2，自身再 +6000
  if (has('ATK_COND_GENSO2_OPP_LV2_SELF6000')) {
    const otherGenso = aP.stage.filter((c, i) => c && i !== ctx.slot && hasTrait(c, '幻想郷')).length;
    const oppFront = dP.stage[ctx.slot]; // 正面角色同 slot
    if (otherGenso >= 2 && oppFront && oppFront.def.level === 2) {
      buffSelf(6000);
      s.log.push(`🟡 ${attacker.def.name}：正面lv2且幻想郷≥2，當回合 +6000。`);
    }
  }
  // にとり：攻擊時，CX區有「choice圖示CX」且有其他幻想郷 → 公開頂1張，幻想郷角色進手
  if (has('ATK_TOPCHECK_GENSO_TOHAND')) {
    const hasChoiceCx = aP.cx.some(c => c.def.trigKind === 'choice');
    const otherGenso = aP.stage.filter((c, i) => c && i !== ctx.slot && hasTrait(c, '幻想郷')).length;
    if (hasChoiceCx && otherGenso >= 1) {
      const top = revealTop();
      if (top) {
        s.log.push(`👁 公開牌庫頂：${top.def.name}`);
        const success = top.def.type === 'CHAR' && hasTrait(top, '幻想郷');
        if (success) {
          aP.deck.pop();
          aP.hand.push(top);
          s.log.push(`🟡 ${attacker.def.name}：${top.def.name} 加入手牌。`);
        }
        pushReveal(top, success, `${top.def.name} 加入手牌`);
      }
    }
  }
  return s;
}
// 力量歸零破壞：任何角色 calcPower<=0 立即被破壞（規則處理）。
// 被破壞的角色其控制者可選擇 Encore（付3錢或自身Encore復活到原格橫置）。
// 回傳 s；若需玩家選擇會設 s.pending = ZERO_ENCORE_SELECT。
function checkZeroPowerDestroy(s) {
  if (s.pending) return s; // 已有 pending，等解完再檢查
  // 順序：回合方先，再對手（與 encore 一致）
  const order = [s.turnPlayer, s.turnPlayer === 0 ? 1 : 0];
  for (const pIdx of order) {
    const P = s.players[pIdx];
    // 找出力量<=0 的角色（任何 state：stand/rest/reverse 都算，力量歸零即破壞）。
    // 排除 justEncored（本次規則處理中剛 encore 復活的，避免同鏈重複殺）。
    const zeroSlots = [0, 1, 2, 3, 4].filter(i => {
      const c = P.stage[i];
      return c && !c.justEncored && !c.zeroDestroying && calcPower(s, pIdx, i) <= 0;
    });
    if (zeroSlots.length === 0) continue;
    // 標記為破壞中（zeroDestroying）並倒置，代表已被破壞、進入控室前的 encore 判定狀態
    zeroSlots.forEach(i => {
      s.players[pIdx].stage[i].state = 'reverse';
      s.players[pIdx].stage[i].zeroDestroying = true;
      s.log.push(`💥 ${P.stage[i].def.name} 力量降至 0 以下，被破壞。`);
    });
    if (isHuman(s, pIdx)) {
      const cost = encoreCost(s, pIdx);
      // 付不起又無法自身Encore的，直接落控室
      let moved = true;
      while (moved) {
        moved = false;
        const z = zeroSlots.find(i => {
          const c = P.stage[i];
          return c && c.zeroDestroying && P.stock.length < cost && !canSelfEncore(P, c);
        });
        if (z != null) {
          const card = P.stage[z];
          P.stage[z] = null;
          card.state = 'stand';
          card.zeroDestroying = false;
          P.wr.push(card);
          s.log.push(`${card.def.name} 落控室（無法Encore）。`);
          moved = true;
        }
      }
      const encoreSlots = zeroSlots.filter(i => {
        const c = P.stage[i];
        return c && c.zeroDestroying && (P.stock.length >= cost || canSelfEncore(P, c));
      });
      if (encoreSlots.length > 0) {
        s.pending = {
          type: 'ZERO_ENCORE_SELECT',
          pIdx,
          slots: encoreSlots
        };
        return s; // 等玩家選
      }
      // 全部已落控室，繼續檢查另一方
    } else {
      // NPC：力量歸零破壞一律落控室（不 encore，簡化）
      zeroSlots.forEach(i => {
        const card = P.stage[i];
        if (card && card.zeroDestroying) {
          P.stage[i] = null;
          card.state = 'stand';
          card.zeroDestroying = false;
          P.wr.push(card);
          s.log.push(`${card.def.name} 落控室。`);
        }
      });
    }
  }
  return s;
}
function declareAttack(s, slot, kind) {
  const aP = s.players[s.turnPlayer];
  const attacker = aP.stage[slot];
  if (!attacker || attacker.state !== 'stand' || !FRONT.includes(slot)) {
    return s;
  }
  // 先攻方第一回合只能攻擊一次
  if (!s.sandbox && s.turnCount === 1 && s.turnPlayer === s.firstPlayer && s.attacksThisTurn >= 1) {
    s.log.push('先攻第一回合只能攻擊一次。');
    return s;
  }
  // 建立攻擊上下文
  const dPIdx = s.turnPlayer === 0 ? 1 : 0;
  const defender = s.players[dPIdx].stage[facingSlot(slot)];
  s.attackCtx = {
    aPIdx: s.turnPlayer,
    dPIdx,
    slot,
    dslot: facingSlot(slot),
    hasDefender: !!defender,
    mode: null
  };
  // 真人攻擊方先確認；NPC 直接確認
  if (isHuman(s, s.turnPlayer)) {
    s.pending = {
      type: 'ATK_CONFIRM',
      pIdx: s.turnPlayer
    };
    return s;
  }
  return attackAfterConfirm(s);
}

// 確認後：判斷正面/側面/直接
function attackAfterConfirm(s) {
  const ctx = s.attackCtx;
  const aP = s.players[ctx.aPIdx];
  const attacker = aP.stage[ctx.slot];
  attacker.state = 'rest';
  s.attacksThisTurn = (s.attacksThisTurn || 0) + 1;
  if (!ctx.hasDefender) {
    ctx.mode = 'direct';
    s.log.push(`⚔️ ${aP.name} 用 ${attacker.def.name} 直接攻擊。`);
    s = runAttackFx(s, ctx);
    return attackBurnStep(s);
  }
  // 有防守者：真人選正/側打；NPC 智能選
  if (isHuman(s, ctx.aPIdx)) {
    s.pending = {
      type: 'ATK_SIDE_CHOICE',
      pIdx: ctx.aPIdx
    };
    return s;
  }
  // NPC：正打能打死(power>對方)就正打；否則若側打soul>=1則側打
  const aPow = calcPower(s, ctx.aPIdx, ctx.slot);
  const dPow = calcPower(s, ctx.dPIdx, ctx.dslot);
  const mySoul = calcSoul(s, ctx.aPIdx, ctx.slot);
  const dLv = s.players[ctx.dPIdx].stage[ctx.dslot] ? s.players[ctx.dPIdx].stage[ctx.dslot].def.level : 0;
  const sideSoul = Math.max(0, mySoul - dLv);
  if (aPow > dPow) {
    ctx.mode = 'front';
  } // 能打死，正打
  else if (sideSoul >= 1) {
    ctx.mode = 'side';
  } // 打不死但側打有傷害
  else {
    ctx.mode = 'front';
  } // 都不理想，預設正打
  s.log.push(`⚔️ ${aP.name} 用 ${attacker.def.name} ${ctx.mode === 'side' ? '側面攻擊' : '正面攻擊'}。`);
  s = runAttackFx(s, ctx);
  return attackBurnStep(s);
}

// 燒（predictor·空）：trigger 前可付2錢棄1手燒一下
function attackBurnStep(s) {
  const ctx = s.attackCtx;
  const aP = s.players[ctx.aPIdx];
  const attacker = aP.stage[ctx.slot];
  if (attacker.def.fx === 'BLUE3_LOOK3_BURN' && !ctx.burnDone) {
    if (aP.stock.length >= 2 && aP.hand.length >= 1) {
      if (isHuman(s, ctx.aPIdx)) {
        s.pending = {
          type: 'ATK_BURN_ASK',
          pIdx: ctx.aPIdx
        };
        return s;
      }
      // NPC：錢夠(留點緩衝)就燒
      if (aP.stock.length >= 3) {
        return doBurn(s);
      }
    }
  }
  return attackTriggerStep(s);
}

// 燒的執行
function doBurn(s) {
  const ctx = s.attackCtx;
  const aP = s.players[ctx.aPIdx];
  const D = s.players[ctx.dPIdx];
  // 付2錢
  for (let i = 0; i < 2; i++) aP.wr.push(aP.stock.pop());
  s.log.push(`${aP.name} 支付2費（燒）。`);
  // 棄1手：彈 pending 選
  if (isHuman(s, ctx.aPIdx)) {
    s.pending = {
      type: 'ATK_BURN_DISCARD',
      pIdx: ctx.aPIdx
    };
    return s;
  }
  if (aP.hand.length > 0) npcDiscardOne(s, aP);
  return doBurnDamage(s);
}
function doBurnDamage(s) {
  const ctx = s.attackCtx;
  const D = s.players[ctx.dPIdx];
  // 燒：翻對方牌庫頂1張，非CX進clock、CX落控室(cancel)
  const c = pull(s, ctx.dPIdx);
  if (c) {
    if (!s.banners) s.banners = [];
    if (c.def.type === 'CX') {
      D.wr.push(c);
      s.log.push(`🔥 燒：對方翻到CX，傷害取消。`);
      s.banners.push({
        kind: 'cancel',
        title: '燒·Cancel！',
        cardKeys: [c.key],
        stagger: true,
        confirmBy: 'attacker',
        byPIdx: ctx.aPIdx,
        big: true
      });
    } else {
      D.clock.push(c);
      s.log.push(`🔥 燒：對方受到1點傷害。`);
      checkLevelUp(s, ctx.dPIdx);
      s.banners.push({
        kind: 'damage',
        title: '燒·造成1傷害！',
        cardKeys: [c.key],
        stagger: true,
        confirmBy: 'attacker',
        byPIdx: ctx.aPIdx,
        big: true
      });
    }
  }
  ctx.burnDone = true;
  if (s.winner !== null) {
    s.attackCtx = null;
    return s;
  }
  return attackTriggerStep(s);
}
function attackTriggerStep(s) {
  const ctx = s.attackCtx;
  const aP = s.players[ctx.aPIdx];
  let trigCard = pull(s, ctx.aPIdx);
  // 惡夢特權(1)：NPC(P1) trigger 必定不翻到 CX —— 翻到 CX 就先擱置，改抽非 CX，最後把 CX 放回牌庫底
  if (ctx.aPIdx === 1 && nm(s, 'noCxTrig') && trigCard && s.winner === null) {
    const setAside = [];
    let guard = 0;
    while (trigCard && trigCard.def.type === 'CX' && guard < 60) {
      guard++;
      setAside.push(trigCard);
      trigCard = pull(s, ctx.aPIdx);
      if (s.winner !== null) break;
    }
    // 把擱置的 CX 放回牌庫底（unshift = 底部，pull 從尾端 pop）
    if (setAside.length > 0) {
      aP.deck.unshift(...setAside);
      s.log.push(`（惡夢·trigger避CX：略過 ${setAside.length} 張CX）`);
    }
  }
  // trigger 翻牌可能觸發爆deck→refresh罰1→Lv4輸，立即結束，不再counter/戰鬥/觸發效果
  if (s.winner !== null) {
    s.attackCtx = null;
    return s;
  }
  let bonusSoul = 0;
  if (trigCard) {
    aP.stock.push(trigCard);
    pushFx(s, 'trigger', ctx.aPIdx, trigCard, 'deck' + ctx.aPIdx, 'stock' + ctx.aPIdx);
    if (!s.banners) s.banners = [];
    const modeText = ctx.mode === 'side' ? '側面攻擊' : ctx.mode === 'direct' ? '直接攻擊' : '正面攻擊';
    s.banners.push({
      kind: 'trigger',
      title: modeText + '｜Trigger',
      cardKeys: [trigCard.key],
      dur: 1500,
      big: true
    });
    let trigMsg = `Trigger：${trigCard.def.name}`;
    if (trigCard.def.tsoul) {
      bonusSoul += trigCard.def.tsoul;
      trigMsg += `（+${trigCard.def.tsoul} Soul）`;
    }
    if (trigCard.def.trig === TRIG.GATE) {
      bonusSoul += 1;
      trigMsg += `（藍閘，+1 Soul）`;
    }
    s.log.push(trigMsg);
    if (trigCard.def.trig === TRIG.STANDBY) s = doStandby(s, ctx.aPIdx, trigCard);
    if (trigCard.def.trig === TRIG.GATE) s = doGate(s, ctx.aPIdx, trigCard);
    if (trigCard.def.trig === TRIG.CHOICE) s = doChoice(s, ctx.aPIdx, trigCard);
  }
  ctx.bonusSoul = bonusSoul;
  // 有 pending(門/閘需玩家選)就等，否則進 counter
  if (s.pending) {
    ctx.resumeAfterPending = 'counter';
    return s;
  }
  return attackCounterStep(s);
}

// counter step：正面攻擊時，防守方可發動 counter
function attackCounterStep(s) {
  const ctx = s.attackCtx;
  // こいし：攻擊方全員幻想郷時，防守方不能打 event/助太刀 → 跳過 counter step
  const aP = s.players[ctx.aPIdx];
  const attacker = aP.stage[ctx.slot];
  if (attacker && ctx.mode === 'front') {
    const fxs = attacker.def.fxList || (attacker.def.fx ? [attacker.def.fx] : []);
    if (fxs.indexOf('CONT_ALLGENSO_LOCK_OPP') >= 0) {
      const chars = aP.stage.filter(c => c);
      const allGenso = chars.length > 0 && chars.every(c => hasTrait(c, '幻想郷'));
      if (allGenso) {
        s.log.push(`🔒 ${attacker.def.name}：對手本次戰鬥不能打出 Event／助太刀。`);
        return attackDamageStep(s);
      }
    }
  }
  if (ctx.mode === 'front') {
    // 真人防守一律問(不論有沒有counter，避免洩漏資訊)；NPC不counter
    if (isHuman(s, ctx.dPIdx)) {
      s.pending = {
        type: 'ATK_COUNTER_ASK',
        pIdx: ctx.dPIdx
      };
      return s;
    }
  }
  return attackDamageStep(s);
}
function attackDamageStep(s) {
  const ctx = s.attackCtx;
  const aP = s.players[ctx.aPIdx];
  let soul = calcSoul(s, ctx.aPIdx, ctx.slot) + (ctx.bonusSoul || 0);
  if (ctx.mode === 'direct') {
    soul += 1;
    s.log.push(`直接攻擊：+1 Soul`);
  }
  if (ctx.mode === 'side') {
    const dLv = s.players[ctx.dPIdx].stage[ctx.dslot] ? s.players[ctx.dPIdx].stage[ctx.dslot].def.level : 0;
    soul = Math.max(0, soul - dLv);
    s.log.push(`側面攻擊：Soul -${dLv}（對方Lv），實際 ${soul}`);
  }
  const canceled = dealBattleDamage(s, ctx.aPIdx, ctx.dPIdx, soul);
  if (s.winner !== null) {
    s.attackCtx = null;
    return s;
  }
  // 若傷害觸發防守方升級(LEVELUP_PICK pending)，先暫停，等升級選完再戰鬥
  if (s.pending && s.pending.type === 'LEVELUP_PICK') {
    ctx.resumeAfterPending = 'battle';
    return s;
  }
  return attackBattleStep(s);
}
function attackBattleStep(s) {
  const ctx = s.attackCtx;
  const aP = s.players[ctx.aPIdx];
  const dP = s.players[ctx.dPIdx];
  const attacker = aP.stage[ctx.slot];
  // 側面/直接不戰鬥
  if (ctx.mode === 'front') {
    const defender = dP.stage[ctx.dslot];
    // 戰鬥前：攻擊對象因力量≤0已被規則破壞 → 不發生戰鬥（counter step 已在前面跑過）。
    // 由 checkZeroPowerDestroy（reducer 收口）負責落控室/encore；這裡只記錄並跳過戰鬥。
    if (attacker && defender && calcPower(s, ctx.dPIdx, ctx.dslot) <= 0) {
      s.log.push(`${defender.def.name} 戰鬥前力量已降至 0 以下，直接被破壞，戰鬥不發生。`);
      // 不進行 aPow vs dPow，攻擊者不倒置對象、也不被反殺
      if (!s.pending) s.attackCtx = null;
      return s;
    }
    if (attacker && defender) {
      const aPow = calcPower(s, ctx.aPIdx, ctx.slot);
      const dPow = calcPower(s, ctx.dPIdx, ctx.dslot);
      s.log.push(`Battle：${aPow} vs ${dPow}`);
      // 戰鬥前防守者是否「已經」倒置：已倒置的角色不算被「這次」使其倒置（避免再攻無限觸發CX連動）
      const defenderWasReversed = defender.state === 'reverse';
      let defenderReversed = false;
      if (aPow > dPow) {
        defender.state = 'reverse';
        if (!defenderWasReversed) {
          defenderReversed = true;
          s.log.push(`${defender.def.name} 被倒置(reverse)。`);
        } else {
          s.log.push(`${defender.def.name} 已倒置，戰鬥無額外效果。`);
        }
      } else if (aPow < dPow) {
        attacker.state = 'reverse';
        s.log.push(`${attacker.def.name} 被反殺倒置。`);
      } else {
        defender.state = 'reverse';
        attacker.state = 'reverse';
        if (!defenderWasReversed) defenderReversed = true;
        s.log.push('兩敗俱傷，雙方倒置。');
      }
      // てゐ：「このカードのバトル相手が【リバース】した時」→ 記錄觸發，戰鬥步驟末再處理（玩家選擇）
      const recordTewi = (owner, ownerPIdx, ownerSlot) => {
        if (!owner) return;
        if ((owner.def.fxList || [owner.def.fx]).indexOf('BATTLE_OPP_REVERSE_MOVE') < 0) return;
        ctx.tewiTriggers = ctx.tewiTriggers || [];
        ctx.tewiTriggers.push({
          pIdx: ownerPIdx,
          slot: ownerSlot
        });
      };
      if (s.winner === null) {
        if (attacker.state === 'reverse') recordTewi(defender, ctx.dPIdx, ctx.dslot); // 攻擊方被反殺 → 防守方的てゐ
        if (defender.state === 'reverse' && defenderReversed) recordTewi(attacker, ctx.aPIdx, ctx.slot); // 防守方倒置 → 攻擊方的てゐ
      }
      // 「使對方倒置」的 CX 連動：僅在「這次」確實使對方從直立變倒置時觸發
      if (defenderReversed && s.winner === null) {
        // 紅蓮：紅門在場 → 找初始回手
        if (attacker.def.fx === 'CXC_DOOR_REVERSE_RECOVER' && aP.cx.some(c => c.def.name === CX_DOOR)) {
          s = recoverInitialFromWR(s, ctx.aPIdx, attacker);
        }
        // 深淵の歌姫：藍閘在場 → 可付2錢棄1手再攻
        if (attacker.def.fx === 'BLUE3_PACKAGE' && aP.cx.some(c => c.def.name === CX_GATE) && !ctx.reattackDone && !attacker.reattackedThisTurn) {
          if (aP.stock.length >= 2 && aP.hand.length >= 1) {
            if (isHuman(s, ctx.aPIdx)) {
              if (!s.pending) {
                s.pending = {
                  type: 'ATK_REATTACK_ASK',
                  pIdx: ctx.aPIdx,
                  slot: ctx.slot
                };
              }
            }
          }
        }
      }
    } else {
      // [診斷] 正面攻擊卻找不到交戰雙方 → 這正是「該倒置卻沒倒」的情況，記下來方便抓現場
      s.log.push(`⚠️[診斷] 正面攻擊未戰鬥：攻=${attacker ? attacker.def.name : '無'}, dslot=${ctx.dslot}, 守=${defender ? defender.def.name : '無(對位空格)'}。`);
    }
  }
  // てゐ觸發：戰鬥步驟末處理（玩家選擇橫置哪隻夥伴，再移後列）
  if (!s.pending && ctx.tewiTriggers && ctx.tewiTriggers.length > 0) {
    s = processTewiTriggers(s);
    if (s.pending) return s; // 等玩家選
  }
  // 攻擊結束：清除 attackCtx（玩家自行按結束攻擊進 encore）
  if (!s.pending) s.attackCtx = null;
  return s;
}
// 處理 てゐ 觸發佇列：逐一處理（人類彈 pending，NPC 自動）
function processTewiTriggers(s) {
  const ctx = s.attackCtx;
  if (!ctx || !ctx.tewiTriggers) return s;
  while (ctx.tewiTriggers.length > 0) {
    const trig = ctx.tewiTriggers[0];
    const PP = s.players[trig.pIdx];
    const owner = PP.stage[trig.slot];
    // owner 已不在場就跳過
    if (!owner || (owner.def.fxList || [owner.def.fx]).indexOf('BATTLE_OPP_REVERSE_MOVE') < 0) {
      ctx.tewiTriggers.shift();
      continue;
    }
    // 候選：其他《幻想郷》角色（不含 owner）
    const cand = [0, 1, 2, 3, 4].filter(i => PP.stage[i] && i !== trig.slot && hasTrait(PP.stage[i], '幻想郷'));
    if (cand.length === 0) {
      ctx.tewiTriggers.shift();
      continue;
    }
    if (isHuman(s, trig.pIdx)) {
      // 彈 pending 讓玩家選要橫置/移動的夥伴
      s.pending = {
        type: 'TEWI_SELECT',
        pIdx: trig.pIdx,
        ownerSlot: trig.slot,
        cand
      };
      return s;
    } else {
      // NPC 自動：選第一隻，橫置，後列有空格才移
      tewiApply(s, trig.pIdx, cand[0]);
      ctx.tewiTriggers.shift();
    }
  }
  return s;
}
// 執行てゐ移動：先橫置選中角色（必發生），後列有空格才移過去
function tewiApply(s, pIdx, fromSlot) {
  const PP = s.players[pIdx];
  const moved = PP.stage[fromSlot];
  if (!moved) return s;
  moved.state = 'rest'; // 步驟①②：選中並橫置（必發生）
  const emptyBack = BACK.find(b => !PP.stage[b]);
  if (emptyBack != null) {
    PP.stage[fromSlot] = null;
    PP.stage[emptyBack] = moved; // 步驟③：移到後列空格
    s.log.push(`🐰 てゐ：${moved.def.name} 橫置並移到後列。`);
  } else {
    s.log.push(`🐰 てゐ：${moved.def.name} 橫置（後列無空格，留原位）。`);
  }
  return s;
}
function trigName(t) {
  return {
    none: '無',
    soul: '魂',
    standby: '紅門',
    gate: '藍閘'
  }[t] || t;
}

// counter 發動：檢查條件，扣費，選加力量目標
function doCounter(s, counterId) {
  const ctx = s.attackCtx;
  const dP = s.players[ctx.dPIdx];
  const idx = dP.hand.findIndex(c => c.id === counterId);
  if (idx < 0) return attackDamageStep(s);
  const card = dP.hand[idx];
  // 條件：Lv≤自己Level
  if (card.def.level > dP.level.length) {
    s.log.push(`Counter 失敗：等級不足。`);
    return attackDamageStep(s);
  }
  // 費用+顏色：0費免；1費以上需 Level/Clock 有同色
  if ((card.def.cost || 0) >= 1 && !meetsColorRequirement(dP, card)) {
    s.log.push(`Counter 失敗：顏色條件不足。`);
    return attackDamageStep(s);
  }
  if (dP.stock.length < (card.def.cost || 0)) {
    s.log.push(`Counter 失敗：錢不足。`);
    return attackDamageStep(s);
  }
  // 扣費
  if (card.def.cost > 0) {
    for (let i = 0; i < card.def.cost; i++) dP.wr.push(dP.stock.pop());
  }
  // counter 卡使用後落控室
  dP.hand.splice(idx, 1);
  dP.wr.push(card);
  s.log.push(`${dP.name} 發動 Counter：${card.def.name}。`);
  ctx.counterCard = card;
  // counter 特效：顯示卡 + 效果
  if (!s.banners) s.banners = [];
  const cbAmt = card.def.fx === 'COUNTER_INITIAL_P1500' ? 1500 : 0;
  s.banners.push({
    kind: 'counter',
    title: `使用Counter卡！${cbAmt ? '+' + cbAmt + '攻擊力' : ''}`,
    cardKeys: [card.key],
    confirmBy: 'opp',
    byPIdx: ctx.dPIdx,
    big: true
  });
  // 加力量型 counter：只能加在「正在被正面攻擊的角色」(交戰中的防守者)
  if (card.def.fx === 'COUNTER_INITIAL_P1500') {
    ctx.counterBuffAmt = 1500;
    const defender = ctx.mode === 'front' ? dP.stage[ctx.dslot] : null;
    // 必須是正面攻擊、交戰角色存在、且該角色是「初始」
    if (!defender || !hasTrait(defender, '初始')) {
      s.log.push('沒有「正在被正面攻擊的初始角色」可加成。');
      return attackDamageStep(s);
    }
    // 只有唯一目標(交戰中的防守者)，直接加成，不需玩家再選
    ctx.counterTargetSlot = ctx.dslot;
    return applyCounterBuff(s);
  }
  return attackDamageStep(s);
}
function applyCounterBuff(s) {
  const ctx = s.attackCtx;
  const dP = s.players[ctx.dPIdx];
  const tslot = ctx.counterTargetSlot;
  if (tslot != null && dP.stage[tslot]) {
    // counter 加力量持續到回合結束 -> 用 autoBuff
    const card = dP.stage[tslot];
    card.autoBuff = card.autoBuff || {
      power: 0,
      soul: 0
    };
    card.autoBuff.power += ctx.counterBuffAmt || 0;
    s.log.push(`${card.def.name} +${ctx.counterBuffAmt} 力量（Counter）。`);
    // 若加在交戰角色，記到 ctx.counterBuff 讓 battle step 也算(autoBuff 已含,battle讀calcPower會吃到)
  }
  return attackDamageStep(s);
}
function doStandby(s, pIdx, cxCard) {
  const P = s.players[pIdx];
  // 紅門：從控室選1張角色「上手」（不是上場）
  const hasChar = P.wr.some(c => c.def.type === 'CHAR');
  if (!hasChar) {
    s.log.push(`${P.name} 紅門：控室無角色可回收。`);
    return s;
  }
  if (isHuman(s, pIdx)) {
    s.pending = {
      type: "DOOR_RECOVER",
      pIdx
    };
    return s;
  }
  // NPC：優先回收現在出得起的角色，否則最高power
  const cands = P.wr.filter(c => c.def.type === 'CHAR');
  cands.sort((a, b) => {
    const ap = a.def.level <= P.level.length && P.stock.length >= a.def.cost ? 1 : 0;
    const bp = b.def.level <= P.level.length && P.stock.length >= b.def.cost ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.def.power - a.def.power;
  });
  const cand = cands[0];
  if (cand) {
    P.wr = P.wr.filter(c => c.id !== cand.id);
    P.hand.push(cand);
    s.log.push(`${P.name} 紅門：${cand.def.name} 回到手牌。`);
    if (!s.banners) s.banners = [];
    s.banners.push({
      kind: 'recover',
      title: '紅門·回收角色',
      cardKeys: [cand.key],
      confirmBy: 'opp',
      byPIdx: pIdx,
      big: true
    });
  }
  return s;
}
// アリス choice觸發加成：觸發方場上有 TRIGGER_GATE_BUFF_GENSO_2000 時，選1隻幻想郷角色 +2000
function applyAliceChoiceBuff(s, pIdx) {
  const P = s.players[pIdx];
  const aliceOnStage = P.stage.some(c => c && (c.def.fxList || (c.def.fx ? [c.def.fx] : [])).includes('TRIGGER_GATE_BUFF_GENSO_2000'));
  if (!aliceOnStage) return s;
  const cands = [0,1,2,3,4].filter(i => P.stage[i] && hasTrait(P.stage[i], '幻想郷'));
  if (cands.length === 0) return s;
  if (isHuman(s, pIdx)) {
    s.pending = { type: 'CHARSEL_BUFF', pIdx, amount: 2000, cand: cands, source: 'アリス·choice觸發', filterGensokyo: true };
  } else {
    const best = cands.reduce((a, b) => calcPower(s, pIdx, a) >= calcPower(s, pIdx, b) ? a : b);
    const bc = P.stage[best];
    bc.autoBuff = bc.autoBuff || { power: 0, soul: 0 };
    bc.autoBuff.power += 2000;
    s.log.push(`🟡 アリス choice觸發：${bc.def.name} 當回合 +2000。`);
  }
  return s;
}
// choice CX 觸發：從控室選1張符合條件的角色加入手牌（類似門，但可由CX條件自訂）
function doChoice(s, pIdx, cxCard) {
  const P = s.players[pIdx];
  const cands = P.wr.filter(c => c.def.type === 'CHAR');
  if (cands.length === 0) {
    s.log.push(`${P.name} choice：控室無角色可回收。`);
    s = applyAliceChoiceBuff(s, pIdx);
    return s;
  }
  if (isHuman(s, pIdx)) {
    s.pending = { type: 'CHOICE_RECOVER', pIdx };
    return s;
  }
  // NPC：優先出得起的角色，否則最高power
  cands.sort((a, b) => {
    const ap = a.def.level <= P.level.length && P.stock.length >= a.def.cost ? 1 : 0;
    const bp = b.def.level <= P.level.length && P.stock.length >= b.def.cost ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.def.power - a.def.power;
  });
  const cand = cands[0];
  if (cand) {
    P.wr = P.wr.filter(c => c.id !== cand.id);
    P.hand.push(cand);
    s.log.push(`${P.name} choice：${cand.def.name} 回到手牌。`);
    if (!s.banners) s.banners = [];
    s.banners.push({ kind: 'recover', title: 'Choice·回收角色', cardKeys: [cand.key], confirmBy: 'opp', byPIdx: pIdx, big: true });
  }
  s = applyAliceChoiceBuff(s, pIdx);
  return s;
}
function doGate(s, pIdx, cxCard) {
  const P = s.players[pIdx];
  if (isHuman(s, pIdx)) {
    s.pending = { type: "GATE", pIdx };
    return s;
  }
  const cx = P.wr.find(c => c.def.type === 'CX');
  if (cx) {
    P.wr = P.wr.filter(c => c.id !== cx.id);
    P.hand.push(cx);
    s.log.push(`${P.name} 藍閘：回收1張CX。`);
    if (!s.banners) s.banners = [];
    s.banners.push({
      kind: 'recover',
      title: '藍閘·回收CX',
      cardKeys: [cx.key],
      confirmBy: 'opp',
      byPIdx: pIdx,
      big: true
    });
  }
  return s;
}
function recoverInitialFromWR(s, pIdx, attacker) {
  const P = s.players[pIdx];
  if (isHuman(s, pIdx)) {
    s.pending = {
      type: "RECOVER_INITIAL",
      pIdx
    };
    return s;
  }
  const cands = P.wr.filter(c => c.def.type === 'CHAR' && hasTrait(c, '初始'));
  cands.sort((a, b) => {
    const ap = a.def.level <= P.level.length && P.stock.length >= a.def.cost ? 1 : 0;
    const bp = b.def.level <= P.level.length && P.stock.length >= b.def.cost ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.def.power - a.def.power;
  });
  const cand = cands[0];
  if (cand) {
    P.wr = P.wr.filter(c => c.id !== cand.id);
    P.hand.push(cand);
    s.log.push(`${P.name} CX連動：回收 ${cand.def.name}。`);
    if (!s.banners) s.banners = [];
    s.banners.push({
      kind: 'recover',
      title: 'CX連動·回收角色',
      cardKeys: [cand.key],
      confirmBy: 'opp',
      byPIdx: pIdx,
      big: true
    });
  }
  return s;
}

/* ---------- 集中 ---------- */
function activateConcentrate(s, slot) {
  const P = s.players[s.turnPlayer];
  const card = P.stage[slot];
  if (!card || card.def.fx !== 'ACT_CONCENTRATE') return s;
  if (card.state !== 'stand') {
    s.log.push('集中需要此卡直立。');
    return s;
  }
  if (P.stock.length < 1) {
    s.log.push('錢不足（需1費）。');
    return s;
  }
  // 付費（先進控室）+ 橫置
  P.wr.push(P.stock.pop());
  card.state = 'rest';
  // 碌4張：逐張處理。集中有處理區，碌出的牌先進 resolution，refresh 只洗控室不會把它們洗回。
  let cxCount = 0;
  const flipped = [];
  for (let i = 0; i < 4; i++) {
    if (s.winner !== null) break;
    if (P.deck.length === 0) {
      // 牌庫已空，但集中還沒碌滿4張。
      //  - 控室「有牌」可洗回 → 中途 refresh 罰1 再續碌（例 deck3 碌4：碌3→refresh→碌第4張）。
      //  - 控室「也空」→ 不能 refresh、也不可在此宣告 Deck Out（碌出的牌仍在處理區、尚未進控室）。
      //    停止碌牌、改由稍後「進控室 + maybeRefresh」收尾（例 deck2 碌2、控室空：碌2→處理→refresh連1&2）。
      if (P.wr.length > 0) refreshNow(s, s.turnPlayer);
      else break;
      if (s.winner !== null) break;
    }
    // deferRefresh：碌出的牌去向未定（在處理區），取後 deck 歸零先不 refresh，
    // 由上面回圈頭的判斷或結尾的 maybeRefresh 在「去向確定後」處理。
    const c = pull(s, s.turnPlayer, true);
    if (!c) break;
    flipped.push(c);
    P.resolution.push(c); // 進處理區暫存（不進控室，避免下一張 refresh 把它洗回牌庫）
    if (c.def.type === 'CX') cxCount++;
  }
  // 惡夢特權(2)：NPC(P1) 集中必定中 1 張以上 —— 若碌出 0 張 CX，先找牌庫，牌庫沒有再找控室
  if (s.turnPlayer === 1 && nm(s, 'concentrate') && cxCount === 0 && flipped.length > 0) {
    let cxCard = null;
    const deckCxIdx = P.deck.findIndex(c => c.def.type === 'CX');
    if (deckCxIdx >= 0) {
      cxCard = P.deck.splice(deckCxIdx, 1)[0];
    } else {
      // 牌庫沒有 CX → 從控室找（讓「必中」名副其實）
      const wrCxIdx = P.wr.findIndex(c => c.def.type === 'CX');
      if (wrCxIdx >= 0) cxCard = P.wr.splice(wrCxIdx, 1)[0];
    }
    if (cxCard) {
      // 把碌堆裡最後一張非 CX 放回牌庫，CX 進碌堆
      const swapOut = flipped.pop();
      const ri = P.resolution.indexOf(swapOut);
      if (ri >= 0) P.resolution.splice(ri, 1);
      P.deck.push(swapOut); // 放回牌庫頂
      flipped.push(cxCard);
      P.resolution.push(cxCard);
      cxCard.state = 'stand';
      cxCount = 1;
      s.log.push(`（惡夢·集中必中：補入1張CX）`);
    }
  }
  // 集中結束：處理區的牌全部進控室
  flipped.forEach(c => {
    const ri = P.resolution.indexOf(c);
    if (ri >= 0) P.resolution.splice(ri, 1);
    P.wr.push(c);
  });
  // 牌去向已確定（碌出的牌已進控室）→ 此時才補做 deck 歸零檢查。
  // 必須在「進控室之後」才 refresh：否則 deck 剛好碌空、控室原本為空時，
  // 會誤判 Deck Out（其實碌出的牌正要進控室、可洗回）。
  //  例 deck2 碌2 → 碌2張(deck0,延後) → 進控室 → maybeRefresh 罰1。
  if (s.winner === null) maybeRefresh(s, s.turnPlayer);
  s.log.push(`${P.name} 集中：碌4張，中 ${cxCount} 張CX。`);
  if (flipped.length > 0) {
    if (!s.banners) s.banners = [];
    s.banners.push({
      kind: 'flip',
      stagingTitle: '集中',
      title: `集中：中 ${cxCount} 張CX`,
      cardKeys: flipped.map(c => c.key),
      stagger: true,
      confirmBy: 'opp',
      byPIdx: s.turnPlayer,
      big: true
    });
  }
  if (cxCount > 0) {
    if (isHuman(s, s.turnPlayer)) {
      s.pending = {
        type: 'CONCENTRATE_SEARCH',
        pIdx: s.turnPlayer,
        count: cxCount
      };
    } else {
      const gotCards = [];
      // 需求3：手上能出的角色(考慮lv)不足以讓場上湊滿5隻時，優先撿「現在lv出得起」的角色
      const stageCount0 = P.stage.filter(x => x).length;
      const handPlayable0 = P.hand.filter(c => c.def.type === 'CHAR' && c.def.level <= P.level.length).length;
      const needPlayable = stageCount0 + handPlayable0 < 5; // 湊不滿5隻 → 優先能出的
      const stageFull = P.stage.every(x => x); // 場上滿員
      for (let i = 0; i < cxCount; i++) {
        const cands = P.deck.filter(c => c.def.type === 'CHAR' && hasTrait(c, '初始'));
        if (cands.length === 0) break;
        // 優先：(場上沒滿 或 湊不滿5隻) 時，找「現在出得起」的角色；否則找最高power
        cands.sort((a, b) => {
          if (!stageFull || needPlayable) {
            const ap = a.def.level <= P.level.length && P.stock.length >= a.def.cost ? 1 : 0;
            const bp = b.def.level <= P.level.length && P.stock.length >= b.def.cost ? 1 : 0;
            if (ap !== bp) return bp - ap;
          }
          return b.def.power - a.def.power;
        });
        const cand = cands[0];
        P.deck = P.deck.filter(c => c.id !== cand.id);
        P.hand.push(cand);
        gotCards.push(cand);
      }
      if (gotCards.length > 0) {
        P.deck = shuffle(P.deck);
        s.log.push(`${P.name} 集中找了 ${gotCards.length} 張初始角色。`);
        if (!s.banners) s.banners = [];
        s.banners.push({
          kind: 'recover',
          title: '集中·檢索上手',
          cardKeys: gotCards.map(c => c.key),
          confirmBy: 'opp',
          byPIdx: s.turnPlayer,
          big: true
        });
      }
    }
  }
  return s;
}

/* ---------- 對手攻擊階段：伏兵·霞 ----------
   碌牌庫頂1張，一律落控室。若碌中角色牌，可移動「伏兵·霞自己」到場上空位。
*/
function triggerAmbushAfterSanae(s, dPIdx) {
  const D = s.players[dPIdx];
  const ambushSlots = [];
  D.stage.forEach((c, i) => {
    if (c && c.def.fx === 'AUTO_OPP_ATKPHASE_TOPCHAR') ambushSlots.push(i);
  });
  if (ambushSlots.length === 0) return s;
  s.ambushQueue = { pIdx: dPIdx, slots: ambushSlots };
  return processAmbush(s);
}
function triggerOppAtkPhase(s) {
  const dPIdx = s.turnPlayer === 0 ? 1 : 0;
  const D = s.players[dPIdx];
  // 早苗②：棄CX，選對手1隻角色當回合 +4 soul
  const sanaeFxSlots = [0,1,2,3,4].filter(i => {
    const c = D.stage[i];
    return c && (c.def.fxList || (c.def.fx ? [c.def.fx] : [])).includes('OPP_ATKPHASE_CX_COST_OPP_SOUL4');
  });
  if (sanaeFxSlots.length > 0) {
    const cxInHand = D.hand.filter(c => c.def.type === 'CX');
    if (cxInHand.length > 0) {
      if (isHuman(s, dPIdx)) {
        s.pending = {
          type: 'SANAE_SOUL4_ASK',
          pIdx: dPIdx,
          cxCands: cxInHand.map(c => ({ id: c.id, key: c.key, name: c.def.name }))
        };
        return s; // 等玩家決定後再繼續（handler 結束後呼叫 processAmbush）
      }
      // NPC：不發動（戰略複雜，略過）
    }
  }
  // 收集所有伏兵·霞的位置
  const ambushSlots = [];
  D.stage.forEach((c, i) => {
    if (c && c.def.fx === 'AUTO_OPP_ATKPHASE_TOPCHAR') ambushSlots.push(i);
  });
  if (ambushSlots.length === 0) return s;
  s.ambushQueue = { pIdx: dPIdx, slots: ambushSlots };
  return processAmbush(s);
}
function processAmbush(s) {
  const q = s.ambushQueue;
  if (!q || q.slots.length === 0) {
    s.ambushQueue = null;
    return s;
  }
  const dPIdx = q.pIdx;
  // 真人：設 pending 等玩家點戰場上高亮的伏兵(可選哪隻先碌)，或按完成
  if (isHuman(s, dPIdx)) {
    s.pending = {
      type: 'AMBUSH_SELECT',
      pIdx: dPIdx,
      slots: q.slots.slice()
    };
    return s;
  }
  // NPC：自動逐一碌
  const ambushSlot = q.slots[0];
  return doAmbushFlip(s, dPIdx, ambushSlot, true);
}
function doAmbushFlip(s, dPIdx, ambushSlot, doFlip) {
  const D = s.players[dPIdx];
  const q = s.ambushQueue;
  // 移除已處理的這隻
  if (q) q.slots = q.slots.filter(x => x !== ambushSlot);
  if (!doFlip) {
    s.log.push(`【伏兵·霞】${D.name} 選擇不碌。`);
    return processAmbush(s);
  }
  const top = pull(s, dPIdx);
  if (!top) return processAmbush(s);
  D.wr.push(top);
  const isChar = top.def.type === 'CHAR';
  s.log.push(`【伏兵·霞】${D.name} 碌出 ${top.def.name}（落控室）${isChar ? '，碌中角色！' : ''}`);
  if (!s.banners) s.banners = [];
  s.banners.push({
    kind: 'flip',
    stagingTitle: '伏兵·霞·碌1',
    title: isChar ? '碌中角色！' : '碌出（非角色）',
    cardKeys: [top.key],
    stagger: true,
    confirmBy: 'opp',
    byPIdx: dPIdx,
    big: true
  });
  if (isChar) {
    const hasEmpty = FRONT.some(i => D.stage[i] === null);
    if (hasEmpty) {
      if (isHuman(s, dPIdx)) {
        s.pending = {
          type: 'AMBUSH_MOVE',
          pIdx: dPIdx,
          fromSlot: ambushSlot
        };
        return s; // 移動完再 processAmbush（在結算裡接續）
      } else {
        const front = FRONT.find(i => D.stage[i] === null);
        if (front !== undefined && BACK.includes(ambushSlot)) {
          D.stage[front] = D.stage[ambushSlot];
          D.stage[ambushSlot] = null;
          s.log.push(`【伏兵·霞】${D.name} 移動伏兵·霞到前列。`);
        }
      }
    }
  }
  return processAmbush(s); // 處理下一隻伏兵
}

/* ---------- Encore ----------
   穩健版：直接掃描場上 reverse 角色，逐一處理。
   玩家(P0)的 reverse 逐一彈 ENCORE_ASK；NPC(P1)自動；最後清掉所有仍 reverse 的。
*/
function findReverse(s, pIdx) {
  const P = s.players[pIdx];
  for (let slot = 0; slot < 5; slot++) {
    if (P.stage[slot] && P.stage[slot].state === 'reverse') return slot;
  }
  return -1;
}
function processEncore(s) {
  // 順序：回合方先決定，再對手
  const order = [s.turnPlayer, s.turnPlayer === 0 ? 1 : 0];
  for (const pIdx of order) {
    if (!isHuman(s, pIdx)) continue;
    const P = s.players[pIdx];
    const cost = encoreCost(s, pIdx);
    // 先把「既付不起錢、也無法自身Encore」的reverse角色直接落控室（玩家無從選擇）
    let movedAny = true;
    while (movedAny) {
      movedAny = false;
      const slot0 = [0, 1, 2, 3, 4].find(i => {
        const c = P.stage[i];
        return c && c.state === 'reverse' && P.stock.length < cost && !canSelfEncore(P, c);
      });
      if (slot0 != null) {
        const card = P.stage[slot0];
        P.stage[slot0] = null;
        card.state = 'stand';
        P.wr.push(card);
        s.log.push(`${card.def.name} 落控室（無法Encore）。`);
        s = applyLeaveStage(s, pIdx, card);
        movedAny = true;
      }
    }
    // 還有「可Encore（付得起錢 或 可自身Encore）」的reverse角色 → 戰場高亮選擇
    const encoreSlots = [0, 1, 2, 3, 4].filter(i => {
      const c = P.stage[i];
      return c && c.state === 'reverse' && (P.stock.length >= cost || canSelfEncore(P, c));
    });
    if (encoreSlots.length > 0) {
      s.pending = {
        type: 'ENCORE_SELECT',
        pIdx,
        slots: encoreSlots
      };
      return s;
    }
    // 付不起但仍有reverse（理論上已被上面清掉，保險）
    const leftover = findReverse(s, pIdx);
    if (leftover >= 0) {
      const card = P.stage[leftover];
      P.stage[leftover] = null;
      card.state = 'stand';
      P.wr.push(card);
      s.log.push(`${card.def.name} 落控室。`);
      s = applyLeaveStage(s, pIdx, card);
      if (s.pending) return s;
      return processEncore(s);
    }
  }
  return finalizeEncore(s);
}
function finalizeEncore(s) {
  // 非真人(NPC)的 reverse 自動 encore / 落墳
  [0, 1].forEach(pIdx => {
    if (isHuman(s, pIdx)) return;
    let slot;
    while ((slot = findReverse(s, pIdx)) >= 0) {
      const P = s.players[pIdx];
      const card = P.stage[slot];
      // Encore 時機判斷：
      // - 自己回合的 encore step：通常浪費(到對方回合會被打死)，除非高power(>=9000不易死)
      // - 對方回合的 encore step：合理(對方已攻完，復活能留到自己回合)
      // - 2lv後期存錢：盡量不encore，除非錢很多(>=6)且高power
      const isOwnTurn = s.turnPlayer === pIdx;
      const lateGame = P.level.length >= 2 && P.clock.length >= 4;
      const highPower = card.def.power >= 9000;
      // NPC 自身 Encore：有 selfEncore 且付得起 → 對方回合直接用（比花3錢划算）
      if (canSelfEncore(P, card) && (!isOwnTurn || highPower)) {
        const se = card.def.selfEncore;
        const cand = selfEncoreCandidates(P, se)[0];
        const di = P.hand.findIndex(c => c.id === cand.id);
        P.wr.push(P.hand.splice(di, 1)[0]);
        card.state = 'rest';
        s.log.push(`${P.name} 自身 Encore：${card.def.name} 復活。`);
        if (!s.banners) s.banners = [];
        s.banners.push({
          kind: 'encore',
          title: '自身 Encore！',
          cardKeys: [card.key],
          confirmBy: 'opp',
          byPIdx: pIdx,
          big: true
        });
        continue;
      }
      let doEncore = false;
      if (P.stock.length >= 3 && card.def.level >= 2) {
        if (lateGame) doEncore = P.stock.length >= 6 && highPower;else if (isOwnTurn) doEncore = highPower; // 自己回合只復活高power
        else doEncore = true; // 對方回合，合理復活
      }
      if (doEncore) {
        for (let i = 0; i < 3; i++) P.wr.push(P.stock.pop());
        card.state = 'rest';
        s.log.push(`${P.name} Encore：${card.def.name} 復活。`);
        if (!s.banners) s.banners = [];
        s.banners.push({
          kind: 'encore',
          title: 'Encore！',
          cardKeys: [card.key],
          confirmBy: 'opp',
          byPIdx: pIdx,
          big: true
        });
      } else {
        P.stage[slot] = null;
        card.state = 'stand';
        P.wr.push(card);
        s.log.push(`${card.def.name} 落控室。`);
      }
    }
  });
  // encore 處理完(雙方都沒有待決定的 reverse)，直接過 turn
  if (s.phase === 'encore' && !s.pending && s.winner === null) {
    return endTurn(s);
  }
  return s;
}

/* ---------- 待回應結算 ---------- */
function resolvePending(s, choice) {
  const p = s.pending;
  if (!p) return s;
  const P = s.players[p.pIdx];
  s.pending = null;
  switch (p.type) {
    case 'LEVELUP_PICK':
      {
        // choice.id = 要放進等級區的卡；其餘進控室
        const thr = p.threshold || 7;
        const loseLv = p.pIdx === 1 && nm(s, 'lv5win') ? 5 : 4;
        const pickId = choice.id || p.cards[0] && p.cards[0].id;
        const taken = P.clock.splice(0, thr);
        const pickIdx = taken.findIndex(c => c.id === pickId);
        const toLevel = pickIdx >= 0 ? taken.splice(pickIdx, 1)[0] : taken.shift();
        P.level.push(toLevel);
        taken.forEach(c => P.wr.push(c));
        s.log.push(`⬆️ ${P.name} 升級！現在 Level ${P.level.length}（${toLevel.def.name} 進等級區）。`);
        if (P.level.length >= loseLv) {
          s.winner = p.pIdx === 0 ? 1 : 0;
          s.log.push(`🏆 ${s.players[s.winner].name} 獲勝！(對手到達 Level ${loseLv})`);
          return s;
        }
        // 可能還要再升級（一次受傷累積很多）
        checkLevelUp(s, p.pIdx);
        break; // 落到 switch 後的 resume 邏輯
      }
    case 'PB_DISCARD_PICK':
      {
        // 玩家輔助 buff1「抽2丟1」：choice.id = 要丟的手牌（落控室，不進clock）
        const PP = s.players[0];
        const di = PP.hand.findIndex(c => c.id === choice.id);
        if (di >= 0) {
          const dropped = PP.hand.splice(di, 1)[0];
          PP.wr.push(dropped);
          s.log.push(`輔助·抽2丟1：丟 ${dropped.def.name} 落控室。`);
        }
        return s;
      }
    case 'AMBUSH_SELECT':
      {
        // choice.slot=點的伏兵(碌它)；choice.done=全部不碌完成
        if (choice.done) {
          s.ambushQueue = null;
          return s;
        }
        if (choice.slot != null) {
          return doAmbushFlip(s, p.pIdx, choice.slot, true);
        }
        return s;
      }
    case 'AMBUSH_ASK':
      {
        return doAmbushFlip(s, p.pIdx, p.ambushSlot, !!choice.flip);
      }
    case 'AMBUSH_MOVE':
      {
        if (choice.toSlot != null && P.stage[choice.toSlot] === null) {
          const card = P.stage[p.fromSlot];
          P.stage[choice.toSlot] = card;
          P.stage[p.fromSlot] = null;
          s.log.push(`【伏兵·霞】移動到位置${choice.toSlot}。`);
        }
        return processAmbush(s); // 接續處理下一隻伏兵
      }
    case 'CLOCK_PHASE':
      {
        if (choice.id) {
          const idx = P.hand.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            P.clock.push(P.hand.splice(idx, 1)[0]);
            drawCards(s, p.pIdx, 2);
            s.log.push('Clock：棄1抽2。');
            checkLevelUp(s, p.pIdx);
          }
        }
        break;
      }
    case 'DOOR_RECOVER':
      {
        if (choice.id) {
          const idx = P.wr.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            const c = P.wr.splice(idx, 1)[0];
            P.hand.push(c);
            s.log.push(`紅門：${c.def.name} 回到手牌。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'recover',
              title: '紅門·回收角色',
              cardKeys: [c.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
        }
        break;
      }
    case 'CHOICE_RECOVER':
      {
        if (choice.id) {
          const idx = P.wr.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            const c = P.wr.splice(idx, 1)[0];
            P.hand.push(c);
            s.log.push(`Choice：${c.def.name} 回到手牌。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'recover',
              title: 'Choice·回收角色',
              cardKeys: [c.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
        }
        s = applyAliceChoiceBuff(s, p.pIdx);
        break;
      }
    case 'GATE':
      {
        if (choice.id) {
          const idx = P.wr.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            const c = P.wr.splice(idx, 1)[0];
            P.hand.push(c);
            s.log.push('藍閘：回收1張CX。');
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'recover',
              title: '藍閘·回收CX',
              cardKeys: [c.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
        }
        break;
      }
    case 'RECOVER_INITIAL':
      {
        if (choice.id) {
          const idx = P.wr.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            const c = P.wr.splice(idx, 1)[0];
            P.hand.push(c);
            s.log.push('CX連動：回收初始角色。');
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'recover',
              title: 'CX連動·回收角色',
              cardKeys: [c.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
        }
        break;
      }
    case 'CONCENTRATE_SEARCH':
      {
        const got = [];
        (choice.ids || []).forEach(id => {
          const idx = P.deck.findIndex(c => c.id === id);
          if (idx >= 0) {
            const c = P.deck.splice(idx, 1)[0];
            P.hand.push(c);
            got.push(c);
          }
        });
        P.deck = shuffle(P.deck);
        s.log.push(`集中：找了 ${got.length} 張角色。`);
        if (got.length > 0) {
          if (!s.banners) s.banners = [];
          s.banners.push({
            kind: 'recover',
            title: '集中·檢索上手',
            cardKeys: got.map(c => c.key),
            confirmBy: 'opp',
            byPIdx: p.pIdx,
            big: true
          });
        }
        break;
      }
    case 'RED3_CLOCKDROP':
      {
        if (choice.yes && P.clock.length > 0) {
          P.wr.push(P.clock.pop());
          s.log.push('覇者·烈：傷害區頂落控室。');
        }
        break;
      }
    case 'BLUE3_DRAW2':
      {
        const n = choice.n || 0;
        drawCards(s, p.pIdx, n);
        if (n > 0) {
          s.log.push(`${P.name} 抽了 ${n} 張，需從手牌丟1張。`);
          // 抽完後彈丟牌 pending（從現有手牌選）
          if (isHuman(s, p.pIdx)) {
            s.pending = {
              type: 'DISCARD_HAND',
              pIdx: p.pIdx
            };
          } else {
            if (P.hand.length > 0) {
              npcDiscardOne(s, P);
              s.log.push(`${P.name} 丟1張。`);
            }
          }
        }
        break;
      }
    case 'DISCARD_HAND':
      {
        if (choice.id) {
          const idx = P.hand.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            P.wr.push(P.hand.splice(idx, 1)[0]);
            s.log.push(`${P.name} 丟棄1張手牌。`);
          }
        }
        break;
      }
    case 'DISCARD_TO_7':
      {
        if (choice.id) {
          const idx = P.hand.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            P.wr.push(P.hand.splice(idx, 1)[0]);
            s.log.push(`${P.name} 棄1張（手牌上限7）。`);
          }
        }
        // 還超過7就繼續，否則續 endTurn
        if (P.hand.length > 7) {
          s.pending = {
            type: 'DISCARD_TO_7',
            pIdx: p.pIdx
          };
          return s;
        }
        return endTurn(s);
      }
    case 'BLUE3_LOOK3':
      {
        // 看的牌還在牌組，選定的卡上手才爆deck → deferRefresh + 上限壓到 deck 張數
        const lookN = Math.min(3, P.deck.length);
        const top = takeTop(s, p.pIdx, lookN, true);
        if (choice.keepId) {
          const k = top.find(c => c.id === choice.keepId);
          if (k) P.hand.push(k);
          top.filter(c => c.id !== choice.keepId).forEach(c => P.wr.push(c));
        } else top.forEach(c => P.wr.push(c));
        s.log.push('看3取1。');
        maybeRefresh(s, p.pIdx); // 去向已定 → 補檢查
        break;
      }
    case 'STEP_DRAW':
      {
        const drawnCards = p.drawnCards || [];
        if (choice.draw) {
          const before = P.hand.length;
          drawCards(s, p.pIdx, 1);
          if (P.hand.length > before) {
            const justDrawn = P.hand[P.hand.length - 1];
            drawnCards.push(justDrawn);
            // 每抽1張立即中心顯示該張(私密，只自己看)
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'recover',
              title: '抽到',
              cardKeys: [justDrawn.key],
              privateTo: p.pIdx,
              big: true,
              dur: 1800
            });
          }
          const drawn = (p.drawn || 0) + (P.hand.length > before ? 1 : 0);
          if (drawn >= p.max || P.deck.length === 0 && P.wr.length === 0) {
            if (P.hand.length > 0) {
              s.pending = {
                type: 'STEP_DRAW_DISCARD',
                pIdx: p.pIdx,
                pbClock: p.pbClock
              };
              return s;
            }
            if (p.pbClock) return pbFinishClock(s);
            return s;
          }
          s.pending = {
            type: 'STEP_DRAW',
            pIdx: p.pIdx,
            drawn,
            max: p.max,
            drawnCards,
            pbClock: p.pbClock
          };
          return s;
        } else {
          if (P.hand.length > 0) {
            s.pending = {
              type: 'STEP_DRAW_DISCARD',
              pIdx: p.pIdx,
              pbClock: p.pbClock
            };
            return s;
          }
          if (p.pbClock) return pbFinishClock(s);
          return s;
        }
      }
    case 'STEP_DRAW_DISCARD':
      {
        if (choice.id) {
          const idx = P.hand.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            P.wr.push(P.hand.splice(idx, 1)[0]);
            s.log.push(`${P.name} 抽牌後丟1張。`);
          }
        }
        // 輔助 buff1：抽棄結束後直接過 clock phase → 進 main
        if (p.pbClock) return pbFinishClock(s);
        return s;
      }
    case 'STEP_LOOK':
      {
        const looked = p.looked || [];
        const fg = p.filterGensokyo || false;
        const ad1 = p.afterDiscard1 || false;
        if (choice.look) {
          // 看的牌還在牌組，未上手不爆deck → deferRefresh，避免看牌途中誤洗控室
          const c = pull(s, p.pIdx, true);
          if (c) {
            looked.push(c);
          }
          // 看滿 max，或牌組已被看光（不能看不存在的牌）→ 進選牌
          if (looked.length >= p.max || P.deck.length === 0) {
            s.pending = { type: 'STEP_LOOK_PICK', pIdx: p.pIdx, looked, filterGensokyo: fg, afterDiscard1: ad1 };
            return s;
          }
          s.pending = { type: 'STEP_LOOK', pIdx: p.pIdx, looked, max: p.max, filterGensokyo: fg, afterDiscard1: ad1 };
          return s;
        } else {
          if (looked.length >= 1) {
            s.pending = { type: 'STEP_LOOK_PICK', pIdx: p.pIdx, looked, filterGensokyo: fg, afterDiscard1: ad1 };
            return s;
          }
          // 0張：若有 afterDiscard1 也跳過（至少1張才棄）
          return s;
        }
      }
    case 'STEP_LOOK_PICK':
      {
        const looked = p.looked || [];
        if (choice.id) {
          const k = looked.find(c => c.id === choice.id);
          if (k) {
            P.hand.push(k);
            s.log.push(`${P.name} 將 ${k.def.name} 加入手牌。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'recover',
              title: '看牌·選1上手',
              cardKeys: [k.key],
              privateTo: p.pIdx,
              big: true,
              dur: 2500
            });
          }
          looked.filter(c => c.id !== choice.id).forEach(c => P.wr.push(c));
        } else {
          looked.forEach(c => P.wr.push(c));
        }
        maybeRefresh(s, p.pIdx); // 所有看的牌去向已定（上手或落控室）→ 補做 deck 歸零檢查
        // 咲夜②：look結束後棄1張手牌
        if (p.afterDiscard1 && P.hand.length > 0) {
          s.pending = { type: 'DISCARD_1', pIdx: p.pIdx };
          return s;
        }
        return s;
      }
    case 'DISCARD_1':
      {
        // 棄1張手牌（通用）
        if (choice.id) {
          const idx2 = P.hand.findIndex(c => c.id === choice.id);
          if (idx2 >= 0) {
            const dc = P.hand.splice(idx2, 1)[0];
            P.wr.push(dc);
            s.log.push(`${P.name} 棄牌：${dc.def.name}。`);
          }
        }
        return s;
      }
    // CHARSEL_BUFF：選1隻我方角色 +amount 力量
    case 'CHARSEL_BUFF':
      {
        if (choice.slot != null) {
          const bc = s.players[p.pIdx].stage[choice.slot];
          if (bc) {
            bc.autoBuff = bc.autoBuff || { power: 0, soul: 0 };
            bc.autoBuff.power += p.amount;
            s.log.push(`✨ ${p.source}：${bc.def.name} 當回合 +${p.amount}。`);
          }
        }
        // 無論選或跳過，清除 pending，resumeAfterPending 機制自動接 counter（如有）
        return s;
      }
    // OPT_COST_ASK：詢問是否支付可選費用（パチュリー等）
    case 'OPT_COST_ASK':
      {
        if (choice.pay) {
          // 支付 (1) stock
          if (P.stock.length >= 1) {
            P.wr.push(P.stock.pop());
            s.log.push(`${P.name} 支付 1 費。`);
          }
          // 接棄手牌選擇
          s.pending = { type: 'DISCARD_HAND_FOR_LOOK', pIdx: p.pIdx, slot: p.slot, onPayFx: p.onPayFx, cardName: p.cardName };
        }
        // 不支付：直接結束
        return s;
      }
    case 'DISCARD_HAND_FOR_LOOK':
      {
        if (choice.id) {
          const idx2 = P.hand.findIndex(c => c.id === choice.id);
          if (idx2 >= 0) {
            const dc = P.hand.splice(idx2, 1)[0];
            P.wr.push(dc);
            s.log.push(`${P.name} 棄牌：${dc.def.name}。`);
          }
        }
        // 開始 STEP_LOOK
        if (p.onPayFx === 'LOOK7_GENSO_SELF1500') {
          // パチュリー自身 +1500
          const stageCard = s.players[p.pIdx].stage[p.slot];
          if (stageCard) {
            stageCard.autoBuff = stageCard.autoBuff || { power: 0, soul: 0 };
            stageCard.autoBuff.power += 1500;
            s.log.push(`✨ ${p.cardName}：當回合 +1500。`);
          }
          s.pending = { type: 'STEP_LOOK', pIdx: p.pIdx, looked: [], max: 7, filterGensokyo: true };
        }
        return s;
      }
    // セプテット②：CX入場後問是否棄舞台角色換看4張
    case 'SEPTET_CX_COST':
      {
        if (choice.pay && choice.costSlot != null) {
          const costCard = s.players[p.pIdx].stage[choice.costSlot];
          if (costCard) {
            s.players[p.pIdx].stage[choice.costSlot] = null;
            costCard.state = 'stand';
            s.players[p.pIdx].wr.push(costCard);
            s.log.push(`セプテット②：${costCard.def.name} 放入控室作為費用。`);
            s = applyLeaveStage(s, p.pIdx, costCard);
            if (!s.pending) {
              s.pending = { type: 'STEP_LOOK', pIdx: p.pIdx, looked: [], max: 4, filterGensokyo: true };
            }
          }
        }
        // 不論付費與否，繼續進 attack phase
        if (!s.pending) {
          triggerOppAtkPhase(s);
        }
        return s;
      }
    // 早苗②：問是否棄CX選對手角色 +4 soul
    case 'SANAE_SOUL4_ASK':
      {
        if (choice.cxId) {
          const idx2 = P.hand.findIndex(c => c.id === choice.cxId);
          if (idx2 >= 0) {
            P.wr.push(P.hand.splice(idx2, 1)[0]);
            s.log.push(`早苗②：棄高潮卡，進入選擇對手角色。`);
            const aPIdx = s.turnPlayer;
            const oppStage = s.players[aPIdx].stage;
            const oppCands = [0,1,2,3,4].filter(i => oppStage[i]);
            if (oppCands.length > 0) {
              s.pending = { type: 'SANAE_SOUL4_PICK', pIdx: p.pIdx, oppPIdx: aPIdx, cands: oppCands };
              return s;
            }
          }
        }
        // 略過或無對手角色：直接進 ambush 流程
        return triggerAmbushAfterSanae(s, p.pIdx);
      }
    case 'SANAE_SOUL4_PICK':
      {
        if (choice.slot != null) {
          const tc = s.players[p.oppPIdx].stage[choice.slot];
          if (tc) {
            tc.autoBuff = tc.autoBuff || { power: 0, soul: 0 };
            tc.autoBuff.soul += 4;
            s.log.push(`早苗②：${tc.def.name} 當回合魂 +4。`);
          }
        }
        return triggerAmbushAfterSanae(s, p.pIdx);
      }
    case 'ENCORE_ASK':
      {
        const PP = s.players[p.pIdx];
        const card = PP.stage[p.slot];
        if (card && card.state === 'reverse') {
          const eCost = encoreCost(s, p.pIdx);
          if (choice.yes && PP.stock.length >= eCost) {
            for (let i = 0; i < eCost; i++) PP.wr.push(PP.stock.pop());
            card.state = 'rest';
            s.log.push(`Encore：${card.def.name} 復活(橫置)。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'encore',
              title: 'Encore！',
              cardKeys: [card.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          } else {
            PP.stage[p.slot] = null;
            card.state = 'stand';
            PP.wr.push(card);
            s.log.push(`${card.def.name} 落控室。`);
            s = applyLeaveStage(s, p.pIdx, card);
          }
        }
        if (s.pending) return s;
        return processEncore(s);
      }
    case 'TEWI_SELECT':
      {
        const ctx = s.attackCtx;
        if (choice.slot != null) {
          tewiApply(s, p.pIdx, choice.slot);
        }
        if (ctx && ctx.tewiTriggers) ctx.tewiTriggers.shift(); // 完成這個觸發
        s.pending = null;
        // 繼續處理剩餘 てゐ 觸發
        if (ctx && ctx.tewiTriggers && ctx.tewiTriggers.length > 0) {
          s = processTewiTriggers(s);
          if (s.pending) return s;
        }
        if (!s.pending) s.attackCtx = null;
        return s;
      }
    case 'SELF_ENCORE_ASK':
      {
        const PP = s.players[p.pIdx];
        const card = PP.stage[p.slot];
        const backToZero = () => {
          // 力量歸零流程：回到剩餘待處理的 reverse 角色高亮（若無則繼續掃全場）
          const remain = (p.zeroSlots || []).filter(i => PP.stage[i] && PP.stage[i].zeroDestroying);
          if (remain.length > 0) {
            s.pending = {
              type: 'ZERO_ENCORE_SELECT',
              pIdx: p.pIdx,
              slots: remain
            };
            return s;
          }
          s.pending = null;
          return checkZeroPowerDestroy(s);
        };
        if (!card || card.state !== 'reverse') return p.zeroSrc ? backToZero() : processEncore(s);
        const se = card.def.selfEncore;
        // 取消：不對這隻做任何處理（保持 reverse），回到高亮重新選擇
        if (choice.cancel) {
          if (p.zeroSrc) {
            s.pending = {
              type: 'ZERO_ENCORE_SELECT',
              pIdx: p.pIdx,
              slots: (p.zeroSlots || []).filter(i => PP.stage[i] && PP.stage[i].zeroDestroying)
            };
            return s;
          }
          s.pending = null;
          return processEncore(s);
        }
        if (choice.useStock) {
          // 玩家選擇用標準 3 錢 Encore
          const eCost = encoreCost(s, p.pIdx);
          if (PP.stock.length >= eCost) {
            for (let i = 0; i < eCost; i++) PP.wr.push(PP.stock.pop());
            card.state = 'rest';
            if (p.zeroSrc) { card.justEncored = true; card.zeroDestroying = false; }
            s.log.push(`Encore：${card.def.name} 復活(橫置，付${eCost}錢)。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'encore',
              title: 'Encore！',
              cardKeys: [card.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
          return p.zeroSrc ? backToZero() : processEncore(s);
        }
        if (choice.discardId && se) {
          const di = PP.hand.findIndex(c => c.id === choice.discardId);
          const cand = selfEncoreCandidates(PP, se).some(c => c.id === choice.discardId);
          if (di >= 0 && cand) {
            PP.wr.push(PP.hand.splice(di, 1)[0]);
            card.state = 'rest';
            if (p.zeroSrc) { card.justEncored = true; card.zeroDestroying = false; }
            s.log.push(`自身 Encore：${card.def.name} 復活(橫置)。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'encore',
              title: '自身 Encore！',
              cardKeys: [card.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
        }
        // choice.no 或沒選 → 不對這隻發動Encore → 落控室（避免再被選回圈）
        if (card.state === 'reverse') {
          const sl = PP.stage.indexOf(card);
          if (sl >= 0) PP.stage[sl] = null;
          card.state = 'stand';
          s = applyLeaveStage(s, p.pIdx, card);
          card.zeroDestroying = false;
          PP.wr.push(card);
          s.log.push(`${card.def.name} 落控室（不發動Encore）。`);
        }
        return p.zeroSrc ? backToZero() : processEncore(s);
      }
    case 'ENCORE_CONFIRM':
      {
        const PP = s.players[p.pIdx];
        s.pending = null;
        const card = PP.stage[p.slot];
        if (choice.yes && card && card.state === 'reverse') {
          const eCost = encoreCost(s, p.pIdx);
          if (PP.stock.length >= eCost) {
            for (let i = 0; i < eCost; i++) PP.wr.push(PP.stock.pop());
            card.state = 'rest';
            if (p.zeroSrc) { card.justEncored = true; card.zeroDestroying = false; }
            s.log.push(`Encore：${card.def.name} 復活(橫置)。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'encore',
              title: 'Encore！',
              cardKeys: [card.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
        }
        if (p.zeroSrc) {
          const remain = (p.zeroSlots || []).filter(i => PP.stage[i] && PP.stage[i].zeroDestroying);
          if (remain.length > 0) {
            s.pending = {
              type: 'ZERO_ENCORE_SELECT',
              pIdx: p.pIdx,
              slots: remain
            };
            return s;
          }
          return checkZeroPowerDestroy(s);
        }
        return processEncore(s);
      }
    case 'ENCORE_SELECT':
      {
        const PP = s.players[p.pIdx];
        if (choice.done) {
          // 按完成：剩下所有 reverse 角色落控室
          [0, 1, 2, 3, 4].forEach(i => {
            const c = PP.stage[i];
            if (c && c.state === 'reverse') {
              PP.stage[i] = null;
              c.state = 'stand';
              PP.wr.push(c);
              s.log.push(`${c.def.name} 落控室。`);
              s = applyLeaveStage(s, p.pIdx, c);
            }
          });
          if (s.pending) return s;
          return processEncore(s);
        }
        if (choice.slot != null) {
          const card = PP.stage[choice.slot];
          if (!card || card.state !== 'reverse') return s;
          // 有自身Encore的角色：問 方式一/方式二/不發動
          if (canSelfEncore(PP, card)) {
            s.pending = {
              type: 'SELF_ENCORE_ASK',
              pIdx: p.pIdx,
              slot: choice.slot
            };
            return s;
          }
          // 一般角色：先確認再付3錢Encore
          if (!choice.confirmed) {
            s.pending = {
              type: 'ENCORE_CONFIRM',
              pIdx: p.pIdx,
              slot: choice.slot
            };
            return s;
          }
          const eCost = encoreCost(s, p.pIdx);
          if (PP.stock.length >= eCost) {
            for (let i = 0; i < eCost; i++) PP.wr.push(PP.stock.pop());
            card.state = 'rest';
            s.log.push(`Encore：${card.def.name} 復活(橫置)。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'encore',
              title: 'Encore！',
              cardKeys: [card.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
          return processEncore(s);
        }
        return s;
      }
      {
        if (choice.yes) {
          return doCrushEncore(s, p.pIdx, p.cardId, p.slot);
        }
        return s; // 不復活，已落控室
      }
    case 'ZERO_ENCORE_SELECT':
      {
        const PP = s.players[p.pIdx];
        if (choice.done) {
          // 剩下被破壞的角色落控室
          (p.slots || [0, 1, 2, 3, 4]).forEach(i => {
            const c = PP.stage[i];
            if (c && c.zeroDestroying) {
              PP.stage[i] = null;
              c.state = 'stand';
              c.zeroDestroying = false;
              PP.wr.push(c);
              s.log.push(`${c.def.name} 落控室。`);
            }
          });
          s.pending = null;
          return checkZeroPowerDestroy(s);
        }
        if (choice.slot != null) {
          const card = PP.stage[choice.slot];
          if (!card || !card.zeroDestroying) return s;
          if (canSelfEncore(PP, card)) {
            s.pending = {
              type: 'SELF_ENCORE_ASK',
              pIdx: p.pIdx,
              slot: choice.slot,
              zeroSrc: true,
              zeroSlots: p.slots
            };
            return s;
          }
          if (!choice.confirmed) {
            s.pending = {
              type: 'ENCORE_CONFIRM',
              pIdx: p.pIdx,
              slot: choice.slot,
              zeroSrc: true,
              zeroSlots: p.slots
            };
            return s;
          }
          const eCost = encoreCost(s, p.pIdx);
          if (PP.stock.length >= eCost) {
            for (let i = 0; i < eCost; i++) PP.wr.push(PP.stock.pop());
            card.state = 'rest';
            card.justEncored = true;
            card.zeroDestroying = false;
            s.log.push(`Encore：${card.def.name} 復活(橫置)。`);
            if (!s.banners) s.banners = [];
            s.banners.push({
              kind: 'encore',
              title: 'Encore！',
              cardKeys: [card.key],
              confirmBy: 'opp',
              byPIdx: p.pIdx,
              big: true
            });
          }
          s.pending = null;
          return checkZeroPowerDestroy(s);
        }
        return s;
      }
    case 'ATK_CONFIRM':
      {
        if (!choice.yes) {
          s.attackCtx = null;
          s.log.push('取消攻擊。');
          return s;
        }
        return attackAfterConfirm(s);
      }
    case 'ATK_SIDE_CHOICE':
      {
        const ctx = s.attackCtx;
        if (!ctx) return s;
        const aP = s.players[ctx.aPIdx];
        const attacker = aP.stage[ctx.slot];
        ctx.mode = choice.side ? 'side' : 'front';
        s.log.push(`⚔️ ${aP.name} 用 ${attacker.def.name} ${ctx.mode === 'side' ? '側面攻擊' : '正面攻擊'}。`);
        s = runAttackFx(s, ctx);
        return attackBurnStep(s);
      }
    case 'ATK_BURN_ASK':
      {
        if (choice.yes) {
          return doBurn(s);
        }
        return attackTriggerStep(s);
      }
    case 'ATK_BURN_DISCARD':
      {
        const ctx = s.attackCtx;
        const aP = s.players[p.pIdx];
        if (choice.id) {
          const idx = aP.hand.findIndex(c => c.id === choice.id);
          if (idx >= 0) {
            aP.wr.push(aP.hand.splice(idx, 1)[0]);
            s.log.push(`${aP.name} 棄1手牌（燒）。`);
          }
        }
        return doBurnDamage(s);
      }
    case 'ATK_COUNTER_ASK':
      {
        const ctx = s.attackCtx;
        if (choice.counterId) {
          return doCounter(s, choice.counterId);
        }
        return attackDamageStep(s);
      }
    case 'ATK_COUNTER_TARGET':
      {
        const ctx = s.attackCtx;
        // choice.targetSlot：counter 加力量的目標角色
        if (choice.targetSlot != null) {
          ctx.counterTargetSlot = choice.targetSlot;
        }
        return applyCounterBuff(s);
      }
    case 'ATK_REATTACK_ASK':
      {
        const ctx = s.attackCtx;
        if (choice.yes && ctx) {
          const aP = s.players[ctx.aPIdx];
          const attacker = aP.stage[ctx.slot];
          if (aP.stock.length >= 2 && aP.hand.length >= 1) {
            for (let i = 0; i < 2; i++) aP.wr.push(aP.stock.pop());
            // 棄1手
            s.pending = {
              type: 'ATK_REATTACK_DISCARD',
              pIdx: ctx.aPIdx,
              slot: ctx.slot
            };
            return s;
          }
        }
        s.attackCtx = null;
        return s;
      }
    case 'ATK_REATTACK_DISCARD':
      {
        const ctx = s.attackCtx;
        const aP = s.players[p.pIdx];
        if (choice.id) {
          const idx = aP.hand.findIndex(c => c.id === choice.id);
          if (idx >= 0) aP.wr.push(aP.hand.splice(idx, 1)[0]);
        }
        const attacker = aP.stage[p.slot];
        if (attacker) {
          attacker.state = 'stand';
          ctx.reattackDone = true;
          attacker.reattackedThisTurn = true; // 綁在卡上：本回合此卡已用過再攻(ctx 會在下次宣告攻擊時重置，故不能只靠 ctx)
          s.log.push(`${attacker.def.name} 直立，可再攻擊。`);
        }
        s.attackCtx = null;
        return s;
      }
    default:
      break;
  }
  // 攻擊流程：trigger 的門/閘 pending 結算後，接續 counter step
  if (s.attackCtx && s.attackCtx.resumeAfterPending === 'counter' && !s.pending) {
    s.attackCtx.resumeAfterPending = null;
    return attackCounterStep(s);
  }
  // 傷害觸發的升級選完後，接續 battle step
  if (s.attackCtx && s.attackCtx.resumeAfterPending === 'battle' && !s.pending) {
    s.attackCtx.resumeAfterPending = null;
    return attackBattleStep(s);
  }
  // Clock 階段升級：玩家選完升級卡後，補做延後的「抽2 → 進 main」
  if (s.clockDrawResume && !s.pending && s.winner === null) {
    const cd = s.clockDrawResume;
    s.clockDrawResume = null;
    drawCards(s, cd.pIdx, 2);
    s.log.push('Clock：升級結算後抽2。');
    s.phase = 'main';
    s.log.push('【Main】可出角色。');
    return s;
  }
  // CIP 結算後若有暫存的踩死 encore，且沒有新 pending，處理它
  if (s.pendingCrush && !s.pending) {
    const pc = s.pendingCrush;
    s.pendingCrush = null;
    const P = s.players[pc.pIdx];
    const dead = P.wr.find(c => c.id === pc.cardId);
    if (dead) {
      s = askCrushEncore(s, pc.pIdx, dead, pc.slot);
    }
  }
  return s;
}

/* ---------- 結束回合 ---------- */
function endTurn(s) {
  const P = s.players[s.turnPlayer];
  // 回合結束：手牌超過7張要棄到7張
  if (P.hand.length > 7) {
    if (isHuman(s, s.turnPlayer)) {
      s.pending = {
        type: 'DISCARD_TO_7',
        pIdx: s.turnPlayer
      };
      return s; // 等玩家棄完，結算後再續 endTurn
    } else {
      // NPC：自動棄至7張（helper：手上>2CX優先棄CX，否則棄最沒用的）
      while (P.hand.length > 7) {
        if (!npcDiscardOne(s, P)) break;
      }
      s.log.push(`${P.name} 棄牌至7張。`);
    }
  }
  s.encoreQueue = [];
  s.attackCtx = null;
  P.cx.forEach(c => P.wr.push(c));
  P.cx = [];
  [0, 1].forEach(pi => {
    s.players[pi].stage.forEach(c => {
      if (c) {
        c.autoBuff = null;
        c.reattackedThisTurn = false;
        c.seAsked = false;
        c.justEncored = false;
      }
    });
  });
  const endingPIdx = s.turnPlayer;
  // 惡夢特權(5)：升級護盾涵蓋到「玩家回合結束」。當結束的是玩家(P0)回合，清除護盾。
  if (endingPIdx === 0 && s.nmLvImmuneTurn) {
    s.nmLvImmuneTurn = false;
  }
  // 玩家輔助 buff3：若「最後一搏」進行中、且結束的是玩家(P0)的回合 —— 此刻結算。
  // 玩家已獲得最後一個回合；若對手仍未落敗，玩家落敗。
  if (endingPIdx === 0 && s.pbLastStandActive && s.winner === null) {
    s.winner = 1;
    s.log.push('🏆 對手獲勝！（最後一搏的回合結束，仍未擊敗對手）');
    return s;
  }
  s.turnPlayer = s.turnPlayer === 0 ? 1 : 0;
  s.turnCount += 1;
  s.log.push(`──────────`);
  // 回合切換 banner：合併成一個（依視角顯示）顯示1秒
  if (!s.banners) s.banners = [];
  s.banners.push({
    kind: 'turnswitch',
    endPIdx: endingPIdx,
    startPIdx: s.turnPlayer,
    dur: 1200,
    big: true
  });
  return startPhaseChain(s);
}

/* ============================================================
   NPC AI（基礎）：優先出等級內角色，能攻就攻
   每次 NPC_STEP 做「一個」動作，回傳是否還要繼續
   ============================================================ */
// NPC main 結束時整理位置：前場 tapped 角色與後場 untapped/空位 互換
// NPC 棄1張手牌：需求4 — 手上多於2張CX時優先棄CX，否則棄最沒用的(非角色 > 最低power角色，保留3lv等關鍵)
function npcDiscardOne(s, P) {
  if (P.hand.length === 0) return null;
  const cxs = P.hand.filter(c => c.def.type === 'CX');
  let pick = null;
  if (cxs.length > 2) {
    pick = cxs[0]; // 優先棄多餘CX
  } else {
    const lv = P.level.length;
    const keepKey = c => c.def.type === 'CHAR' && c.def.level === 3 && lv >= 2 || c.def.fx === 'CXC_DOOR_REVERSE_RECOVER' && lv === 0;
    const cand = P.hand.filter(c => !keepKey(c)).sort((a, b) => {
      const ac = a.def.type === 'CHAR' ? 1 : 0,
        bc = b.def.type === 'CHAR' ? 1 : 0;
      if (ac !== bc) return ac - bc; // 非角色先棄
      return a.def.power - b.def.power; // 角色棄低power
    });
    pick = cand[0] || P.hand[0];
  }
  const idx = P.hand.findIndex(c => c.id === pick.id);
  const card = P.hand.splice(idx, 1)[0];
  P.wr.push(card);
  return card;
}
function npcTidyStage(s, P) {
  for (const f of FRONT) {
    const fc = P.stage[f];
    if (!fc || fc.state === 'stand') continue; // 前場該位有直立角色，不動
    // 前場是 tapped(rest)：找後場 untapped 角色來換，或後場空位移過去
    const backStand = BACK.find(b => P.stage[b] && P.stage[b].state === 'stand');
    if (backStand !== undefined) {
      const t = P.stage[f];
      P.stage[f] = P.stage[backStand];
      P.stage[backStand] = t;
      s.log.push('NPC 整理：前後場互換。');
      continue;
    }
    const backEmpty = BACK.find(b => P.stage[b] === null);
    if (backEmpty !== undefined) {
      P.stage[backEmpty] = P.stage[f];
      P.stage[f] = null;
      s.log.push('NPC 整理：橫置角色移後場。');
    }
  }
  // 需求1：前排對位優化。對方前排有角色時，讓自己「最強的直立前場角色」對上對方「最強的前場角色」，
  // 以利正面攻擊時壓制 / 避免被反殺。對方空場(該欄無角色)則不強求(空場直接攻擊不戰鬥)。
  const opp = s.players[0];
  const myFrontStand = FRONT.filter(i => P.stage[i] && P.stage[i].state === 'stand');
  if (myFrontStand.length >= 2) {
    // 對方各前欄 power（空欄為 -1，代表不需爭奪）
    const oppPow = {};
    FRONT.forEach(i => {
      oppPow[i] = opp.stage[i] ? calcPower(s, 0, i) : -1;
    });
    // 我方各前欄目前 power
    const myPow = i => P.stage[i] && P.stage[i].state === 'stand' ? calcPower(s, 1, i) : -1;
    // 目標：對方 power 最高的欄，放我方 power 最高的角色
    const oppFrontSorted = FRONT.filter(i => oppPow[i] >= 0).sort((a, b) => oppPow[b] - oppPow[a]);
    let swapped = false;
    for (const targetSlot of oppFrontSorted) {
      // 我方在此欄的角色
      const cur = myPow(targetSlot);
      // 找我方其他前欄中 power 更高的直立角色
      const better = FRONT.filter(i => i !== targetSlot && P.stage[i] && P.stage[i].state === 'stand').sort((a, b) => myPow(b) - myPow(a))[0];
      if (better !== undefined && myPow(better) > cur && myPow(better) > oppPow[targetSlot] && cur <= oppPow[targetSlot]) {
        // 交換：把強角色換到 targetSlot（能壓制對方），原本的換過去
        const t = P.stage[targetSlot];
        P.stage[targetSlot] = P.stage[better];
        P.stage[better] = t;
        swapped = true;
      }
    }
    if (swapped) s.log.push('NPC 整理：調整前排對位。');
  }
  return s;
}
function npcStep(s) {
  if (s.winner !== null) return s;
  const me = s.turnPlayer;
  if (me !== 1) return s; // 只在 NPC 回合
  const P = s.players[1];
  if (s.pending) return s; // 等待結算（NPC 的 pending 理論上不會出現）

  switch (s.phase) {
    case 'stand':
      return advancePhase(s);
    case 'draw':
      return advancePhase(s);
    case 'clock':
      {
        const frontCount = FRONT.filter(i => P.stage[i]).length;
        const stageCount = P.stage.filter(c => c).length; // 場上角色數
        const emptySlots = 5 - stageCount; // 場上沒角色的格子數
        const playableNow = P.hand.filter(c => c.def.type === 'CHAR' && c.def.level <= P.level.length && P.stock.length >= c.def.cost).length;
        const cxs = P.hand.filter(c => c.def.type === 'CX');
        // 需求2：0-2lv 且在「第3傷害前」(clock<2，即還沒吃滿2點本回合升級緩衝)時的 clock draw 條件
        // 條件A：手牌數 - 場上空格數 ≤ 5（手牌相對於要填的場面偏少）
        // 條件B：手上能出的角色(考慮lv)不足以讓場上湊滿5隻
        const playableChars = P.hand.filter(c => c.def.type === 'CHAR' && c.def.level <= P.level.length).length;
        const condA = P.hand.length - emptySlots <= 5;
        const condB = stageCount + playableChars < 5;
        const earlyGame = P.level.length <= 2;
        const beforeThirdDmg = P.clock.length < 2; // 「第3傷害前」：傷害區還沒到2
        const drawBySpec = earlyGame && beforeThirdDmg && (condA || condB);
        const needRefresh = drawBySpec || P.hand.length <= 4 || frontCount < 3 && playableNow < 3 - frontCount || cxs.length > 1;
        if (needRefresh && P.hand.length > 0) {
          const lv = P.level.length;
          // 各等級要保留的關鍵牌(不clock掉)
          const keep = c => {
            if (lv === 0) {
              // 留 紅蓮(1lv CX連動) + 紅門
              if (c.def.fx === 'CXC_DOOR_REVERSE_RECOVER') return true;
              if (c.def.name === CX_DOOR && cxs.length <= 1) return true;
            } else if (lv === 1) {
              // 留可早出的覇者
              if (c.def.fx === 'RED3_PACKAGE') return true;
            } else if (lv >= 2) {
              // 留3lv角色、深淵、藍閘
              if (c.def.type === 'CHAR' && c.def.level === 3) return true;
              if (c.def.name === CX_GATE && cxs.length <= 1) return true;
            }
            return false;
          };
          // 換牌時優先 clock 掉「多餘的CX」(手上多於1張時)，其次才是出不起的高等級角色
          const tooHigh = P.hand.filter(c => c.def.type === 'CHAR' && c.def.level > P.level.length && !keep(c)).sort((a, b) => b.def.level - a.def.level)[0];
          const extraCx = cxs.length > 1 ? cxs.find(c => !keep(c)) : null;
          // 若是因 drawBySpec 觸發但沒有「該丟的牌」，丟手上最沒用的：多餘CX > 高等級 > 最低power角色
          let drop = extraCx || tooHigh;
          if (!drop && drawBySpec) {
            // 挑一張最不影響戰力的：優先非角色，否則最低 power 角色（但保留關鍵牌）
            const nonKeep = P.hand.filter(c => !keep(c));
            const sortedDrop = nonKeep.sort((a, b) => {
              const ac = a.def.type === 'CHAR' ? 1 : 0,
                bc = b.def.type === 'CHAR' ? 1 : 0;
              if (ac !== bc) return ac - bc; // 非角色優先丟
              return a.def.power - b.def.power; // 角色丟低power
            });
            drop = sortedDrop[0];
          }
          if (drop) {
            P.clock.push(P.hand.splice(P.hand.indexOf(drop), 1)[0]);
            drawCards(s, 1, 2);
            checkLevelUp(s, 1);
            s.log.push('NPC Clock 換牌。');
          }
        }
        return advancePhase(s);
      }
    case 'main':
      {
        const lvReduce = s.nightmare ? s.nmLvReduceAmt || 0 : 0; // 惡夢越級：累積lv減免
        const playable = P.hand.filter(c => {
          if (c.def.type !== 'CHAR') return false;
          let lv = c.def.level;
          if (c.def.fx === 'RED3_PACKAGE') {
            const cxwr = P.wr.filter(x => x.def.type === 'CX').length;
            if (cxwr <= 2) lv = Math.max(0, lv - 1);
          }
          lv = Math.max(0, lv - lvReduce); // 越級特權
          return lv <= P.level.length && P.stock.length >= c.def.cost && meetsColorRequirement(P, c);
        });
        if (playable.length > 0) {
          playable.sort((a, b) => {
            const ap = a.def.level === P.level.length ? 1 : 0,
              bp = b.def.level === P.level.length ? 1 : 0;
            if (ap !== bp) return bp - ap;
            return b.def.power - a.def.power;
          });
          const pick = playable[0];
          const oppP = s.players[0];
          const emptyFront = FRONT.filter(i => P.stage[i] === null);
          const emptyBack = BACK.filter(i => P.stage[i] === null);
          const isBackType = pick.def.fx === 'CONT_FRONT_INITIAL_PLVL500' || pick.def.fx === 'ACT_CONCENTRATE';
          let slot;
          if (isBackType && emptyBack.length > 0) {
            slot = emptyBack[0];
          } else if (emptyFront.length > 0) {
            emptyFront.sort((a, b) => {
              const pa = oppP.stage[a] ? calcPower(s, 0, a) : 0;
              const pb = oppP.stage[b] ? calcPower(s, 0, b) : 0;
              return pb - pa;
            });
            slot = emptyFront[0];
          } else if (emptyBack.length > 0) {
            slot = emptyBack[0];
          } else {
            const frontWeak = FRONT.filter(i => P.stage[i]).sort((a, b) => P.stage[a].def.power - P.stage[b].def.power)[0];
            if (frontWeak !== undefined && pick.def.power > P.stage[frontWeak].def.power) {
              slot = frontWeak;
            }
          }
          if (slot !== undefined) {
            return playChar(s, pick.id, slot);
          }
        }
        // 出完可出角色後，判斷是否集中（4條件任一）
        const concSlot = [0, 1, 2, 3, 4].find(i => P.stage[i] && P.stage[i].def.fx === 'ACT_CONCENTRATE' && P.stage[i].state === 'stand');
        if (concSlot !== undefined && P.stock.length >= 1 && !s.npcConcUsed) {
          const deckCx = P.deck.filter(c => c.def.type === 'CX').length;
          const stockCx = P.stock.filter(c => c.def.type === 'CX').length; // 錢區卡住的CX
          const stageChars = P.stage.filter(c => c).length;
          const handChars = P.hand.filter(c => c.def.type === 'CHAR' && c.def.level <= P.level.length).length;
          const lateGame = P.level.length >= 2 && P.clock.length >= 4; // 2lv後期存錢
          const cond1 = P.hand.length <= 6;
          const cond2 = stockCx >= 1 && !lateGame; // 洗出錢區CX(後期不執著)
          const cond3 = deckCx > 0 && P.deck.length / deckCx > 4; // CX密度不足
          const cond4 = handChars + stageChars <= 2;
          if (cond1 || cond2 || cond3 || cond4) {
            s.npcConcUsed = true; // 一回合最多集中一次
            return activateConcentrate(s, concSlot);
          }
        }
        npcTidyStage(s, P);
        return advancePhase(s);
      }
    case 'climax':
      {
        // 自己沒有可攻擊角色就不打CX（浪費）
        const hasAttacker = FRONT.some(i => P.stage[i] && P.stage[i].state === 'stand');
        if (!hasAttacker) {
          return advancePhase(s);
        }
        const cxCands = P.hand.filter(c => {
          if (c.def.type !== 'CX') return false;
          const hasColor = P.level.some(x => x.def.color === c.def.color) || P.clock.some(x => x.def.color === c.def.color);
          return hasColor;
        });
        // 優先打場上有對應連動角色的CX(紅門配紅蓮、藍閘配深淵)
        cxCands.sort((a, b) => {
          const aCombo = a.def.name === CX_DOOR && P.stage.some(x => x && x.def.fx === 'CXC_DOOR_REVERSE_RECOVER') || a.def.name === CX_GATE && P.stage.some(x => x && x.def.fx === 'BLUE3_PACKAGE') ? 1 : 0;
          const bCombo = b.def.name === CX_DOOR && P.stage.some(x => x && x.def.fx === 'CXC_DOOR_REVERSE_RECOVER') || b.def.name === CX_GATE && P.stage.some(x => x && x.def.fx === 'BLUE3_PACKAGE') ? 1 : 0;
          return bCombo - aCombo;
        });
        const cx = cxCands[0];
        if (cx && P.cx.length === 0) {
          P.hand = P.hand.filter(c => c.id !== cx.id);
          P.cx.push(cx);
          s.log.push(`${P.name} 打出高潮卡：${cx.def.name}（全體+1000/+1Soul）。`);
          if (!s.banners) s.banners = [];
          s.banners.push({
            kind: 'cx',
            title: '使用高潮卡！',
            cardKeys: [cx.key],
            big: true,
            confirmBy: 'opp',
            byPIdx: 1
          });
          s.phase = 'attack';
          s.log.push('【Attack】');
          triggerOppAtkPhase(s);
          return s;
        }
        return advancePhase(s);
      }
    case 'attack':
      {
        // 先攻第一回合只能攻一次
        if (!s.sandbox && s.turnCount === 1 && s.turnPlayer === s.firstPlayer && s.attacksThisTurn >= 1) {
          return advancePhase(s);
        }
        const slot = FRONT.find(i => P.stage[i] && P.stage[i].state === 'stand');
        if (slot !== undefined) {
          return declareAttack(s, slot, 'auto');
        }
        return advancePhase(s);
      }
    case 'encore':
      return advancePhase(s);
    default:
      return advancePhase(s);
  }
}

/* ============================================================
   React UI
   ============================================================ */
const COLOR_HEX = {
  red: 'var(--red)',
  blue: 'var(--blue)',
  yellow: 'var(--yellow)',
  green: 'var(--green)'
};

// fx -> 卡面關鍵字（簡短）
const FX_KEYWORD = {
  CIP_TOPDECK_DROP_RESTSELF: '出場·碌2(中CX橫置)',
  CONT_OTHER_INITIAL_P500: '持續·初始+500',
  ACT_CONCENTRATE: '起動·集中',
  AUTO_OPP_ATKPHASE_TOPCHAR: '自動·碌1(中角色可移動自己)',
  CXC_DOOR_REVERSE_RECOVER: 'CX連動·回收',
  COUNTER_INITIAL_P1500: '反擊·+1500',
  CONT_FRONT_INITIAL_PLVL500: '持續·前方加成',
  RED3_PACKAGE: '早出·場上+1500',
  BLUE3_PACKAGE: '出場draw2丟1·CX連動再攻',
  BLUE3_LOOK3_BURN: '看3取1·攻擊燒',
  CONT_OTHER_ALL_P1000: '持續·友軍全+1000',
  CONT_SELF_MYTURN_P1000: '持續·我方回合自+1000',
  CONT_SELF_GENSO2_P2000: '持續·幻想郷≥2自+2000',
  CONT_SELF_GENSO2_P6000: '持續·幻想郷≥2自+6000',
  CONT_SELF_ALLGENSO_P5000: '持續·全員幻想郷自+5000',
  CONT_SELF_ALLGENSO_P4000: '持續·全員幻想郷自+4000',
  ATK_TOPCHECK_OPPFRONT_M2500: '攻擊·翻頂幻想郷則敵前列-2500',
  ATK_TOPCHECK_GENSO_TOHAND: '攻擊·翻頂幻想郷進手',
  ATK_SELF_PX_GENSO1000: '攻擊·自+幻想郷數×1000',
  BATTLE_OPP_REVERSE_MOVE: '戰鬥·倒置對手後移夥伴',
  CONT_ALLGENSO_LOCK_OPP: '持續·全員幻想郷封對手助太刀',
  // L2 第一批
  ATK_BUFF_ANY_1000: '攻擊·選友軍+1000',
  ATK_PEEK_BOTH_BOTTOM: '攻擊·看雙方牌庫底',
  ATK_COND_GENSO2_OPP_LV2_SELF6000: '攻擊·正面lv2且幻想郷≥2則+6000',
  CIP_BUFF_SELF_1500: '登場·自身+1500',
  CIP_BUFF_ANY_1500: '登場·選友軍+1500',
  CIP_MILL2_SELF_GENSO_BUFF: '登場·碌2自+幻想郷×1000',
  CIP_OPT_LOOK7_GENSO_SELF1500: '登場·可選費看7取幻想郷+1500',
  LEAVE_LOOK3_GENSO_TAKE_DISCARD1: '離場·看3取幻想郷棄1',
  SUPPORT_FRONT_FLAT_500: '応援·前方+500',
  SUPPORT_FRONT_FLAT_1000: '応援·前方+1000',
  SUPPORT_FRONT_LEVEL500: '応援·前方+lv×500',
  TRIGGER_GATE_BUFF_GENSO_2000: '觸發·choice觸發幻想郷+2000',
  ON_CX_PLACED_COST_CHAR_LOOK4_GENSO: '自·CX入場棄角色看4取幻想郷',
  OPP_ATKPHASE_CX_COST_OPP_SOUL4: '自·對方攻擊開始棄CX選對手+4魂',
  NO_COLOR_RESTRICTION: '永·無色限制'
};
/* ============================================================
   構建卡組（Deck Builder）— WS 版
   - 牌組 50 張、同名上限 4 張、CX 玩家自選（含在 50 內）
   - filter：顏色 / cost / level / 類型(角色/Event/CX) / 稀有度 / 效果(點開選)
   - 排序：顏色 / cost / level / 類型，可遞增遞減
   - stat：顏色、cost、level、類型分布
   - 匯入/匯出碼（WSDECK:）、儲存/載入/編輯/改名/刪除（localStorage）
   ============================================================ */
const e = React.createElement;
const DECK_STORE_KEY = 'ws_decks_v1';
const DECK_SIZE = 50;
const DECK_MAX_COPIES = 4;

function loadDecks() {
  try {
    return JSON.parse(localStorage.getItem(DECK_STORE_KEY) || '{}');
  } catch (err) {
    return {};
  }
}
function saveDecks(obj) {
  try {
    localStorage.setItem(DECK_STORE_KEY, JSON.stringify(obj));
    return true;
  } catch (err) {
    return false;
  }
}
// map {key:count} -> [key,key,...]
function deckMapToList(map) {
  const l = [];
  Object.keys(map).forEach(k => {
    for (let i = 0; i < (map[k] | 0); i++) l.push(k);
  });
  return l;
}
// 隨機合法牌組（從指定作品的 DEFS 湊滿 50，每種 ≤4）：給「隨機卡組」與 NPC 用
function makeRandomDeckList(work) {
  work = work || '初始';
  const keys = Object.keys(DEFS).filter(k => (DEFS[k]['作品'] || '初始') === work);
  const d = {};
  let t = 0,
    guard = 0;
  while (t < DECK_SIZE && guard++ < 9000) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    if (!k) break;
    if ((d[k] || 0) < DECK_MAX_COPIES) {
      d[k] = (d[k] || 0) + 1;
      t++;
    }
    if (keys.length * DECK_MAX_COPIES <= t) break; // 池子湊不滿就停
  }
  return deckMapToList(d);
}

// WS 卡色 -> CSS 變數
const WS_COLOR_VAR = {
  red: 'var(--red)',
  blue: 'var(--blue)',
  yellow: 'var(--yellow)',
  green: 'var(--green)'
};
const WS_COLOR_NAME = {
  red: '紅',
  blue: '藍',
  yellow: '黃',
  green: '綠'
};
// 類型：角色 / Event / CX（Event 目前無卡，欄位先做，顯示 0）
const WS_TYPE_NAME = {
  CHAR: '角色',
  EVENT: 'Event',
  CX: 'CX'
};
// 稀有度清單（順序＝強到弱的常見排序）
const WS_RARITIES = ['CC', 'CR', 'RR', 'R', 'U', 'C', 'TD', 'PR'];
// 效果 filter：fx 字串 -> 顯示名。日後導入新作品再加。
const WS_FX_FILTER = [['ACT_CONCENTRATE', '集中'], ['CXC_DOOR_REVERSE_RECOVER', 'CX連動'], ['COUNTER_INITIAL_P1500', 'Counter'], ['CIP_TOPDECK_DROP_RESTSELF', '出場效果'], ['CONT_OTHER_INITIAL_P500', '持續加成'], ['CONT_FRONT_INITIAL_PLVL500', '持續加成（前列）'], ['RED3_PACKAGE', '早出'], ['BLUE3_PACKAGE', '出場抽棄/再攻'], ['BLUE3_LOOK3_BURN', '看牌/攻擊燒'], ['AUTO_OPP_ATKPHASE_TOPCHAR', '伏兵'], ['HEAL', '回血']];
// 哪些 fx 算「回血」（把 clock 的卡移走，減少傷害）。日後有新回血卡在此補上。
const WS_HEAL_FX = [];
function cardHasFx(c, fx) {
  if (fx === 'HEAL') return WS_HEAL_FX.indexOf(c.fx) >= 0;
  return c.fx === fx;
}

// ---- 牌組統計面板 ----
function DeckStats(props) {
  const stats = props.stats,
    total = props.total || 0;
  const pct = n => total ? Math.round(n / total * 100) : 0;
  const colorOrder = ['red', 'blue', 'yellow', 'green'];
  const costOrder = ['0', '1', '2', '3+'];
  const levelOrder = ['0', '1', '2', '3'];
  function numCell(n) {
    return e('div', {
      style: {
        width: 38,
        textAlign: 'right',
        lineHeight: 1.1,
        flexShrink: 0
      }
    }, e('div', {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--ink)'
      }
    }, n), e('div', {
      style: {
        fontSize: 10,
        color: 'var(--ink-dim)'
      }
    }, pct(n) + '%'));
  }
  function bar(label, color, n) {
    return e('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, e('span', {
      style: {
        width: 30,
        fontSize: 11,
        color: color,
        fontWeight: 700,
        flexShrink: 0
      }
    }, label), e('div', {
      style: {
        flex: 1,
        height: 9,
        background: 'var(--panel)',
        borderRadius: 999,
        overflow: 'hidden'
      }
    }, e('div', {
      style: {
        width: pct(n) + '%',
        height: '100%',
        background: color
      }
    })), numCell(n));
  }
  function header(t) {
    return e('div', {
      style: {
        color: 'var(--ink-dim)',
        fontSize: 11,
        fontWeight: 700,
        margin: '2px 0 4px'
      }
    }, t);
  }
  const maxLv = levelOrder.reduce((m, k) => Math.max(m, stats.byLevel[k]), 0) || 1;
  return e('div', {
    style: {
      background: 'rgba(255,255,255,.03)',
      border: '1px solid var(--line)',
      borderRadius: 10,
      padding: '8px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      height: '100%'
    }
  }, e('div', {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline'
    }
  }, e('span', {
    style: {
      color: 'var(--accent)',
      fontSize: 12,
      fontWeight: 800
    }
  }, '牌組統計'), e('span', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 11
    }
  }, '共 ' + total + ' / ' + DECK_SIZE + ' 張')), e('div', {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'stretch'
    }
  },
  // 顏色分布
  e('div', {
    style: {
      flex: '1 1 33%',
      minWidth: 0
    }
  }, header('顏色'), colorOrder.map(cv => e('div', {
    key: cv
  }, bar(WS_COLOR_NAME[cv], WS_COLOR_VAR[cv], stats.byColor[cv])))),
  // 類型
  e('div', {
    style: {
      flex: '1 1 33%',
      minWidth: 0
    }
  }, header('類型'), bar('角色', 'var(--green)', stats.byType.CHAR), bar('Evt', 'var(--blue)', stats.byType.EVENT), bar('CX', 'var(--yellow)', stats.byType.CX)),
  // 等級分布（長條）
  e('div', {
    style: {
      flex: '1 1 33%',
      minWidth: 0
    }
  }, header('等級分布'), e('div', {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 4,
      height: 52
    }
  }, levelOrder.map(lk => {
    const n = stats.byLevel[lk];
    return e('div', {
      key: lk,
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        height: '100%',
        justifyContent: 'flex-end'
      }
    }, e('span', {
      style: {
        fontSize: 10,
        color: 'var(--ink)',
        height: 12
      }
    }, n || ''), e('div', {
      style: {
        width: '100%',
        height: Math.round(n / maxLv * 34) + 'px',
        background: n ? 'var(--accent)' : 'var(--panel)',
        borderRadius: '3px 3px 0 0',
        minHeight: n ? 3 : 0
      }
    }), e('span', {
      style: {
        fontSize: 10,
        color: 'var(--ink-dim)'
      }
    }, 'L' + lk));
  })))),
  // cost 分布（小長條，獨立一行）
  e('div', null, header('費用分布'), e('div', {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: 4,
      height: 30
    }
  }, costOrder.map(ck => {
    const n = stats.byCost[ck];
    const maxCost = costOrder.reduce((m, k) => Math.max(m, stats.byCost[k]), 0) || 1;
    return e('div', {
      key: ck,
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        height: '100%',
        justifyContent: 'flex-end'
      }
    }, e('span', {
      style: {
        fontSize: 9,
        color: 'var(--ink)',
        height: 10
      }
    }, n || ''), e('div', {
      style: {
        width: '100%',
        height: Math.round(n / maxCost * 18) + 'px',
        background: n ? 'var(--blue)' : 'var(--panel)',
        borderRadius: '2px 2px 0 0',
        minHeight: n ? 2 : 0
      }
    }), e('span', {
      style: {
        fontSize: 9,
        color: 'var(--ink-dim)'
      }
    }, ck));
  }))));
}

// ---- 卡片放大預覽 ----
function DeckCardPreview(props) {
  const c = props.card,
    onClose = props.onClose;
  const col = WS_COLOR_VAR[c.color] || 'var(--line)';
  return e('div', {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 90,
      background: 'rgba(6,8,14,.82)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, e('div', {
    onClick: ev => ev.stopPropagation(),
    style: {
      width: 320,
      maxWidth: '90%',
      background: 'var(--panel-2)',
      border: '3px solid ' + col,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,.6)'
    }
  }, e('div', {
    style: {
      background: col,
      color: '#fff',
      fontWeight: 800,
      padding: '10px 14px',
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 16
    }
  }, e('span', null, c.type === 'CX' ? 'CX' : '等級 ' + c.level + ' · 費 ' + c.cost), e('span', null, WS_COLOR_NAME[c.color] + ' · ' + c.rarity)), e('div', {
    style: {
      padding: 16
    }
  }, e('div', {
    style: {
      fontWeight: 800,
      fontSize: 20,
      marginBottom: 4
    }
  }, c.name), c.traits && c.traits.length ? e('div', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 13,
      marginBottom: 10
    }
  }, c.traits.join('・')) : null, e('div', {
    style: {
      fontSize: 15,
      lineHeight: 1.6,
      color: 'var(--ink)',
      minHeight: 50
    }
  }, c.text || '（無特殊效果）'), c.type === 'CHAR' ? e('div', {
    style: {
      textAlign: 'right',
      marginTop: 12,
      fontSize: 24,
      fontWeight: 800,
      color: col
    }
  }, c.power + ' / ' + c.soul + ' soul') : null), e('button', {
    onClick: onClose,
    style: {
      width: '100%',
      background: 'var(--panel)',
      color: '#fff',
      padding: 12,
      fontWeight: 700,
      fontSize: 14,
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit'
    }
  }, '關閉')));
}

function dbBtn(bg) {
  return {
    background: bg,
    color: '#fff',
    fontWeight: 700,
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 13,
    border: '1px solid var(--line)',
    cursor: 'pointer',
    fontFamily: 'inherit'
  };
}
function dbMiniBtn() {
  return {
    background: 'var(--panel)',
    color: '#fff',
    width: 26,
    height: 26,
    borderRadius: 6,
    fontWeight: 800,
    fontSize: 15,
    border: '1px solid var(--line)',
    cursor: 'pointer',
    fontFamily: 'inherit'
  };
}

// ---- 構建卡組主元件 ----
// props: mode ('manage' 純管理 | undefined 開戰前構建 | 'net' 連線構建)
//        onStart(myList[, npcList])、onExit()
function DeckBuilder(props) {
  // 所有作品（依 DEFS 出現順序），預設選第一個
  const allWorks = (() => {
    const ws = [];
    Object.keys(DEFS).forEach(k => {
      const w = DEFS[k]['作品'] || '初始';
      if (ws.indexOf(w) < 0) ws.push(w);
    });
    return ws;
  })();
  const workS = useState(props.initialWork || allWorks[0]);
  const work = workS[0],
    setWork = workS[1];
  // 只顯示目前作品的卡（WS 不能混作品）
  const allCards = Object.keys(DEFS).filter(k => (DEFS[k]['作品'] || '初始') === work).map(k => Object.assign({
    id: k
  }, DEFS[k]));
  const deckState = useState({});
  const deck = deckState[0],
    setDeck = deckState[1];
  const colorF = useState({});
  const colorSel = colorF[0],
    setColorSel = colorF[1];
  const costF = useState({});
  const costSel = costF[0],
    setCostSel = costF[1];
  const lvF = useState({});
  const lvSel = lvF[0],
    setLvSel = lvF[1];
  const typeF = useState({});
  const typeSel = typeF[0],
    setTypeSel = typeF[1];
  const rareF = useState({});
  const rareSel = rareF[0],
    setRareSel = rareF[1];
  const fxF = useState({});
  const fxSel = fxF[0],
    setFxSel = fxF[1];
  const sortS = useState('level');
  const sortBy = sortS[0],
    setSortBy = sortS[1];
  const ascS = useState(true);
  const asc = ascS[0],
    setAsc = ascS[1];
  const selOnlyS = useState(false);
  const selOnly = selOnlyS[0],
    setSelOnly = selOnlyS[1];
  const fxPopS = useState(false);
  const fxPopOpen = fxPopS[0],
    setFxPopOpen = fxPopS[1];
  const previewS = useState(null);
  const previewCard = previewS[0],
    setPreview = previewS[1];
  const mgrS = useState(false);
  const showMgr = mgrS[0],
    setShowMgr = mgrS[1];
  const savedS = useState(loadDecks());
  const savedDecks = savedS[0],
    setSavedDecks = savedS[1];
  const editS = useState(null);
  const editingName = editS[0],
    setEditingName = editS[1];
  const snapS = useState('');
  const savedSnap = snapS[0],
    setSavedSnap = snapS[1];

  const total = Object.keys(deck).reduce((a, k) => a + deck[k], 0);
  const cxCount = Object.keys(deck).reduce((a, k) => a + (DEFS[k] && DEFS[k].type === 'CX' ? deck[k] : 0), 0);

  function toggle(setter) {
    return key => setter(m => {
      const n = Object.assign({}, m);
      if (n[key]) delete n[key];else n[key] = true;
      return n;
    });
  }
  const toggleColor = toggle(setColorSel),
    toggleCost = toggle(setCostSel),
    toggleLv = toggle(setLvSel),
    toggleType = toggle(setTypeSel),
    toggleRare = toggle(setRareSel),
    toggleFx = toggle(setFxSel);

  function add(k) {
    setDeck(d => {
      const n = Object.assign({}, d);
      if ((n[k] || 0) >= DECK_MAX_COPIES) return n;
      if (Object.keys(d).reduce((a, x) => a + d[x], 0) >= DECK_SIZE) return n; // 已滿50
      n[k] = (n[k] || 0) + 1;
      return n;
    });
  }
  function remove(k) {
    setDeck(d => {
      const n = Object.assign({}, d);
      n[k] = (n[k] || 0) - 1;
      if (n[k] <= 0) delete n[k];
      return n;
    });
  }

  function passFilter(c) {
    if (Object.keys(colorSel).length && !colorSel[c.color]) return false;
    if (Object.keys(costSel).length) {
      const ck = c.cost >= 3 ? '3+' : String(c.cost);
      if (!costSel[ck]) return false;
    }
    if (Object.keys(lvSel).length && !lvSel[String(c.level)]) return false;
    if (Object.keys(typeSel).length && !typeSel[c.type]) return false;
    if (Object.keys(rareSel).length && !rareSel[c.rarity]) return false;
    if (Object.keys(fxSel).length) {
      const ok = Object.keys(fxSel).some(fx => cardHasFx(c, fx));
      if (!ok) return false;
    }
    return true;
  }

  function autoFill() {
    const pool = allCards.filter(passFilter);
    if (!pool.length) return;
    const d = {};
    let t = 0,
      guard = 0;
    while (t < DECK_SIZE && guard++ < 9000) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      if ((d[c.id] || 0) < DECK_MAX_COPIES) {
        d[c.id] = (d[c.id] || 0) + 1;
        t++;
      }
      if (pool.length * DECK_MAX_COPIES <= t) break;
    }
    setDeck(d);
  }

  function isDirty() {
    if (total === 0) return false;
    return JSON.stringify(deck) !== savedSnap;
  }
  function doSaveDeck() {
    if (total === 0) return;
    let name,
      wasOverwrite = false;
    if (editingName != null && savedDecks[editingName]) {
      name = editingName;
      wasOverwrite = true;
    } else {
      name = prompt('牌組名稱：', '我的牌組 ' + (Object.keys(savedDecks).length + 1));
      if (!name) return;
      name = name.trim();
      if (!name) return;
      if (savedDecks[name]) {
        if (!confirm('已有牌組「' + name + '」，覆寫嗎？')) return;
        wasOverwrite = true;
      }
    }
    const next = Object.assign({}, savedDecks);
    next[name] = {
      deck: Object.assign({}, deck),
      total: total,
      作品: work,
      savedAt: Date.now()
    };
    if (saveDecks(next)) {
      setSavedDecks(next);
      setEditingName(name);
      setSavedSnap(JSON.stringify(deck));
      alert(wasOverwrite ? '已覆寫牌組「' + name + '」' : '已儲存牌組「' + name + '」');
    } else alert('儲存失敗（瀏覽器可能封鎖了本機儲存）');
  }
  function doLoadDeck(name) {
    const rec = savedDecks[name];
    if (rec && rec.deck) {
      if (rec['作品']) setWork(rec['作品']);
      setDeck(Object.assign({}, rec.deck));
      setShowMgr(false);
      setEditingName(null);
      setSavedSnap(JSON.stringify(rec.deck));
    }
  }
  function doEditDeck(name) {
    const rec = savedDecks[name];
    if (rec && rec.deck) {
      if (rec['作品']) setWork(rec['作品']);
      setDeck(Object.assign({}, rec.deck));
      setShowMgr(false);
      setEditingName(name);
      setSavedSnap(JSON.stringify(rec.deck));
    }
  }
  function doDeleteDeck(name) {
    if (!confirm('刪除牌組「' + name + '」？')) return;
    const next = Object.assign({}, savedDecks);
    delete next[name];
    if (saveDecks(next)) {
      setSavedDecks(next);
      if (editingName === name) {
        setEditingName(null);
        setSavedSnap('');
      }
    }
  }
  function doRenameDeck(name) {
    let nn = prompt('新的牌組名稱：', name);
    if (nn == null) return;
    nn = nn.trim();
    if (!nn || nn === name) return;
    if (savedDecks[nn]) {
      alert('已有同名牌組「' + nn + '」，請換一個名稱');
      return;
    }
    const next = {};
    Object.keys(savedDecks).forEach(k => {
      if (k === name) next[nn] = savedDecks[k];else next[k] = savedDecks[k];
    });
    if (saveDecks(next)) {
      setSavedDecks(next);
      if (editingName === name) setEditingName(nn);
    } else alert('改名失敗（瀏覽器可能封鎖了本機儲存）');
  }
  function doExportCurrent() {
    if (total === 0) {
      alert('請先組牌');
      return;
    }
    const code = 'WSDECK:' + btoa(unescape(encodeURIComponent(JSON.stringify(deck))));
    try {
      navigator.clipboard.writeText(code);
    } catch (err) {}
    prompt('牌組碼（已嘗試複製到剪貼簿，可手動全選複製傳給朋友）：', code);
  }
  function doExportSaved(name) {
    const rec = savedDecks[name];
    if (!rec) return;
    const code = 'WSDECK:' + btoa(unescape(encodeURIComponent(JSON.stringify(rec.deck))));
    try {
      navigator.clipboard.writeText(code);
    } catch (err) {}
    prompt('牌組「' + name + '」的碼（已嘗試複製）：', code);
  }
  function doImport() {
    const code = prompt('貼上牌組碼（WSDECK: 開頭）：', '');
    if (!code) return;
    try {
      const raw = code.trim().replace(/^WSDECK:/, '');
      const obj = JSON.parse(decodeURIComponent(escape(atob(raw))));
      const clean = {};
      let cnt = 0;
      Object.keys(obj).forEach(k => {
        if (DEFS[k]) {
          clean[k] = Math.min(DECK_MAX_COPIES, obj[k] | 0);
          cnt += clean[k];
        }
      });
      if (cnt === 0) {
        alert('碼無效或卡片無法辨識');
        return;
      }
      setDeck(clean);
      alert('已匯入 ' + cnt + ' 張。可再按「儲存牌組」存起來。');
    } catch (err) {
      alert('匯入失敗：碼格式錯誤');
    }
  }

  function start() {
    if (total < DECK_SIZE) return;
    const myList = deckMapToList(deck);
    if (props.mode === 'net') {
      props.onStart(myList);
      return;
    }
    props.onStart(myList);
  }

  let shown = allCards.filter(passFilter);
  if (selOnly) shown = shown.filter(c => (deck[c.id] || 0) > 0);
  const dir = asc ? 1 : -1;
  const typeRank = {
    CHAR: 0,
    EVENT: 1,
    CX: 2
  };
  shown.sort((a, b) => {
    let r = 0;
    if (sortBy === 'color') r = (a.color || '').localeCompare(b.color || '');else if (sortBy === 'cost') r = a.cost - b.cost;else if (sortBy === 'level') r = a.level - b.level;else if (sortBy === 'type') r = (typeRank[a.type] || 0) - (typeRank[b.type] || 0);
    if (r === 0) r = a.cost - b.cost || (b.power || 0) - (a.power || 0);
    return r * dir;
  });

  // 統計
  function computeStats() {
    const byColor = {
      red: 0,
      blue: 0,
      yellow: 0,
      green: 0
    };
    const byType = {
      CHAR: 0,
      EVENT: 0,
      CX: 0
    };
    const byCost = {
      '0': 0,
      '1': 0,
      '2': 0,
      '3+': 0
    };
    const byLevel = {
      '0': 0,
      '1': 0,
      '2': 0,
      '3': 0
    };
    Object.keys(deck).forEach(k => {
      const n = deck[k],
        d = DEFS[k];
      if (!d || !n) return;
      if (byColor[d.color] != null) byColor[d.color] += n;
      if (byType[d.type] != null) byType[d.type] += n;
      const ck = d.cost >= 3 ? '3+' : String(d.cost);
      if (byCost[ck] != null) byCost[ck] += n;
      const lk = String(d.level);
      if (byLevel[lk] != null) byLevel[lk] += n;
    });
    return {
      byColor,
      byType,
      byCost,
      byLevel
    };
  }
  const stats = computeStats();

  const colors = ['red', 'blue', 'yellow', 'green'];
  const costs = ['0', '1', '2', '3+'];
  const levels = ['0', '1', '2', '3'];
  const types = [['CHAR', '角色'], ['EVENT', 'Event'], ['CX', 'CX']];

  function pillRow(label, items, sel, onToggle, colorFn) {
    return e('div', {
      style: {
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        alignItems: 'center'
      }
    }, e('span', {
      style: {
        color: 'var(--ink-dim)',
        fontSize: 11,
        width: 40,
        flexShrink: 0
      }
    }, label), items.map(it => {
      const key = Array.isArray(it) ? it[0] : it;
      const text = Array.isArray(it) ? it[1] : it;
      const on = !!sel[key];
      const bg = on ? colorFn ? colorFn(key) : 'var(--accent)' : 'var(--panel)';
      return e('button', {
        key: key,
        onClick: () => onToggle(key),
        style: {
          background: bg,
          color: '#fff',
          borderRadius: 999,
          padding: '4px 11px',
          fontSize: 12,
          fontWeight: 700,
          border: '1px solid var(--line)',
          cursor: 'pointer',
          fontFamily: 'inherit'
        }
      }, text);
    }));
  }

  const anyFilter = Object.keys(colorSel).length || Object.keys(costSel).length || Object.keys(lvSel).length || Object.keys(typeSel).length || Object.keys(rareSel).length || Object.keys(fxSel).length;

  return e('div', {
    style: {
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      padding: 12,
      gap: 7,
      background: 'var(--bg)',
      boxSizing: 'border-box'
    }
  },
  // 頂列
  e('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, props.onExit ? e('button', {
    onClick: () => {
      if (isDirty() && !confirm('有未儲存的牌組變更，確定要離開嗎？')) return;
      props.onExit();
    },
    style: dbBtn('var(--panel)')
  }, '← 上一頁') : null, e('h2', {
    style: {
      margin: 0,
      color: 'var(--accent)',
      fontSize: 18
    }
  }, (props.mode === 'net' ? '組牌（連線對戰）' : props.mode === 'manage' ? '構建卡組' : '自組牌組') + (editingName ? '　· 編輯中：' + editingName : '')), e('span', {
    style: {
      display: 'inline-flex',
      gap: 4,
      alignItems: 'center'
    }
  }, e('span', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 12
    }
  }, '作品：'), allWorks.map(w => e('button', {
    key: w,
    onClick: () => {
      if (w === work) return;
      if (total > 0 && !confirm('切換作品會清空目前牌組（不能混作品），確定？')) return;
      setWork(w);
      setDeck({});
      setEditingName(null);
      setSavedSnap('');
    },
    style: dbBtn(w === work ? 'var(--accent)' : 'var(--panel)')
  }, w))), e('span', {
    style: {
      color: total >= DECK_SIZE ? 'var(--green)' : 'var(--red)',
      fontWeight: 800
    }
  }, total + ' / ' + DECK_SIZE + '（CX ' + cxCount + '）'), e('button', {
    onClick: autoFill,
    style: dbBtn('var(--panel)')
  }, '隨機配牌' + (anyFilter ? '（依篩選）' : '')), e('button', {
    onClick: () => setDeck({}),
    style: dbBtn('var(--panel)')
  }, '清空'), e('button', {
    onClick: doSaveDeck,
    disabled: total === 0,
    style: dbBtn(total > 0 ? 'var(--blue)' : 'var(--line)')
  }, editingName ? '覆寫「' + editingName + '」' : '儲存牌組'), e('button', {
    onClick: doExportCurrent,
    disabled: total === 0,
    style: dbBtn(total > 0 ? 'var(--panel)' : 'var(--line)')
  }, '匯出碼'), e('button', {
    onClick: doImport,
    style: dbBtn('var(--panel)')
  }, '匯入碼'), e('button', {
    onClick: () => {
      setSavedDecks(loadDecks());
      setShowMgr(true);
    },
    style: dbBtn('var(--panel)')
  }, '我的牌組 (' + Object.keys(savedDecks).length + ')'), anyFilter ? e('button', {
    onClick: () => {
      setColorSel({});
      setCostSel({});
      setLvSel({});
      setTypeSel({});
      setRareSel({});
      setFxSel({});
    },
    style: dbBtn('var(--panel)')
  }, '清除篩選') : null, props.mode === 'manage' ? null : e('button', {
    onClick: start,
    disabled: total < DECK_SIZE,
    style: dbBtn(total >= DECK_SIZE ? 'var(--green)' : 'var(--line)')
  }, props.mode === 'net' ? '完成組牌 → 連線' : '開始對戰')),
  // 篩選 + 統計 兩欄
  e('div', {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'stretch'
    }
  },
  // 左：篩選/排序
  e('div', {
    style: {
      flex: '1 1 52%',
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      background: 'rgba(255,255,255,.02)',
      padding: '6px 8px',
      borderRadius: 8
    }
  }, pillRow('顏色', colors.map(c => [c, WS_COLOR_NAME[c]]), colorSel, toggleColor, k => WS_COLOR_VAR[k]), pillRow('費用', costs, costSel, toggleCost), pillRow('等級', levels.map(l => ['' + l, 'L' + l]), lvSel, toggleLv), pillRow('類型', types, typeSel, toggleType), pillRow('稀有', WS_RARITIES, rareSel, toggleRare),
  // 效果（點開）
  e('div', {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      position: 'relative'
    }
  }, e('span', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 11,
      width: 40,
      flexShrink: 0
    }
  }, '效果'), e('button', {
    onClick: () => setFxPopOpen(!fxPopOpen),
    style: {
      background: Object.keys(fxSel).length ? 'var(--accent)' : 'var(--panel)',
      color: '#fff',
      borderRadius: 8,
      padding: '4px 12px',
      fontSize: 12,
      fontWeight: 700,
      border: '1px solid var(--line)',
      cursor: 'pointer',
      fontFamily: 'inherit'
    }
  }, '選擇效果' + (Object.keys(fxSel).length ? '（' + Object.keys(fxSel).length + '）' : '') + ' ' + (fxPopOpen ? '▲' : '▼')), Object.keys(fxSel).length ? e('button', {
    onClick: () => setFxSel({}),
    style: {
      background: 'transparent',
      color: 'var(--ink-dim)',
      fontSize: 11,
      textDecoration: 'underline',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'inherit'
    }
  }, '清除') : null, fxPopOpen ? e('div', {
    style: {
      position: 'absolute',
      top: '100%',
      left: 40,
      zIndex: 70,
      marginTop: 4,
      background: 'var(--panel-2)',
      border: '1px solid var(--accent)',
      borderRadius: 10,
      padding: 8,
      width: 320,
      maxHeight: 260,
      overflowY: 'auto',
      boxShadow: '0 8px 24px rgba(0,0,0,.5)',
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 4
    }
  }, WS_FX_FILTER.map(it => {
    const key = it[0],
      text = it[1],
      on = !!fxSel[key];
    return e('button', {
      key: key,
      onClick: () => toggleFx(key),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: on ? 'rgba(90,107,134,.25)' : 'transparent',
        color: 'var(--ink)',
        borderRadius: 6,
        padding: '5px 7px',
        fontSize: 12,
        textAlign: 'left',
        border: '1px solid ' + (on ? 'var(--accent)' : 'transparent'),
        cursor: 'pointer',
        fontFamily: 'inherit'
      }
    }, e('span', {
      style: {
        width: 14,
        height: 14,
        borderRadius: 3,
        flexShrink: 0,
        border: '1px solid var(--line)',
        background: on ? 'var(--accent)' : 'transparent',
        color: '#fff',
        fontSize: 11,
        lineHeight: '13px',
        textAlign: 'center',
        fontWeight: 800
      }
    }, on ? '✓' : ''), e('span', null, text));
  })) : null),
  // 排序 + 升降 + 只看已選
  e('div', {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 2
    }
  }, e('span', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 11
    }
  }, '排序'), [['color', '顏色'], ['cost', '費用'], ['level', '等級'], ['type', '類型']].map(it => e('button', {
    key: it[0],
    onClick: () => setSortBy(it[0]),
    style: dbBtn(sortBy === it[0] ? 'var(--accent)' : 'var(--panel)')
  }, it[1])), e('button', {
    onClick: () => setAsc(!asc),
    style: dbBtn('var(--panel)'),
    title: '切換遞增/遞減'
  }, asc ? '↑ 遞增' : '↓ 遞減'), e('button', {
    onClick: () => setSelOnly(!selOnly),
    style: dbBtn(selOnly ? 'var(--blue)' : 'var(--panel)')
  }, selOnly ? '✓ 只看已選' : '只看已選'), e('span', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 11,
      marginLeft: 'auto'
    }
  }, '符合 ' + shown.length + ' 張'))),
  // 右：統計
  e('div', {
    style: {
      flex: '1 1 48%',
      minWidth: 0
    }
  }, e(DeckStats, {
    stats: stats,
    total: total
  }))),
  // 卡片清單
  e('div', {
    style: {
      flex: 1,
      overflowY: 'auto',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: 8,
      alignContent: 'start'
    }
  }, selOnly && shown.length === 0 ? e('div', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 13,
      padding: 20,
      gridColumn: '1/-1'
    }
  }, '牌組目前是空的。先取消「只看已選」加入卡片。') : null, shown.map(c => {
    const n = deck[c.id] || 0;
    const col = WS_COLOR_VAR[c.color] || 'var(--line)';
    return e('div', {
      key: c.id,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        background: 'var(--panel)',
        borderRadius: 10,
        padding: 10,
        borderLeft: '5px solid ' + col,
        outline: n ? '1px solid var(--accent)' : 'none'
      }
    }, e('div', {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 8
      }
    }, e('span', {
      style: {
        background: col,
        color: '#fff',
        fontWeight: 800,
        borderRadius: 5,
        padding: '1px 7px',
        fontSize: 13
      }
    }, c.type === 'CX' ? 'CX' : 'L' + c.level), e('span', {
      style: {
        fontWeight: 800,
        fontSize: 14,
        flex: 1,
        cursor: 'pointer'
      },
      onClick: () => setPreview(c)
    }, c.name), c.type === 'CHAR' ? e('span', {
      style: {
        fontWeight: 800,
        fontSize: 14,
        color: col
      }
    }, c.power) : null), c.type === 'CX' && (() => {
      const dark = c.color === 'red' ? '#a82838' : c.color === 'blue' ? '#1f5aa8' : c.color === 'yellow' ? '#a8841a' : c.color === 'green' ? '#1f7a48' : '#555';
      return e('div', {
        style: { height: 10, borderRadius: 4, margin: '3px 0', background: `repeating-linear-gradient(45deg,${col},${col} 5px,${dark} 5px,${dark} 10px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }
      }, e('span', { style: { color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: 2, textShadow: '0 1px 2px rgba(0,0,0,.7)' } },
        'CX ' + (c.trig === TRIG.STANDBY ? '門' : c.trig === TRIG.GATE ? '閘' : c.trig === TRIG.CHOICE ? 'CHOICE' : '')));
    })(), e('div', {
      style: {
        fontSize: 11,
        color: 'var(--ink-dim)'
      }
    }, WS_TYPE_NAME[c.type] + ' · ' + WS_COLOR_NAME[c.color] + ' · ' + c.rarity + (c.type !== 'CX' ? ' · 費' + c.cost : '')), e('div', {
      style: {
        fontSize: 12,
        color: 'var(--ink)',
        lineHeight: 1.4,
        minHeight: 32
      }
    }, c.text || e('span', {
      style: {
        color: 'var(--ink-dim)'
      }
    }, '（無特殊效果）')), e('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'flex-end'
      }
    }, e('button', {
      onClick: () => setPreview(c),
      style: {
        background: 'transparent',
        color: 'var(--ink-dim)',
        fontSize: 11,
        textDecoration: 'underline',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit'
      }
    }, '放大'), e('button', {
      onClick: () => remove(c.id),
      style: dbMiniBtn()
    }, '−'), e('span', {
      style: {
        width: 20,
        textAlign: 'center',
        fontWeight: 800,
        color: n ? 'var(--accent)' : 'var(--ink-dim)'
      }
    }, n), e('button', {
      onClick: () => add(c.id),
      style: dbMiniBtn()
    }, '+')));
  })),
  // 放大預覽
  previewCard ? e(DeckCardPreview, {
    card: previewCard,
    onClose: () => setPreview(null)
  }) : null,
  // 牌組管理彈窗
  showMgr ? e('div', {
    onClick: () => setShowMgr(false),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 85,
      background: 'rgba(6,8,14,.82)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, e('div', {
    onClick: ev => ev.stopPropagation(),
    style: {
      width: 440,
      maxWidth: '90%',
      maxHeight: '80%',
      overflowY: 'auto',
      background: 'var(--panel-2)',
      borderRadius: 14,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, e('h3', {
    style: {
      margin: 0,
      color: 'var(--accent)',
      fontSize: 16
    }
  }, '我的牌組'), Object.keys(savedDecks).length === 0 ? e('div', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 13,
      padding: '10px 0'
    }
  }, '（尚無儲存的牌組。組好牌後按「儲存牌組」）') : Object.keys(savedDecks).map(name => {
    const rec = savedDecks[name];
    return e('div', {
      key: name,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--panel)',
        borderRadius: 8,
        padding: '8px 10px',
        flexWrap: 'wrap'
      }
    }, e('div', {
      style: {
        flex: 1,
        minWidth: 120
      }
    }, e('div', {
      style: {
        fontWeight: 700,
        color: 'var(--ink)',
        fontSize: 14
      }
    }, name), e('div', {
      style: {
        color: 'var(--ink-dim)',
        fontSize: 11
      }
    }, (rec.total || 0) + ' 張')), e('button', {
      onClick: () => doLoadDeck(name),
      style: dbBtn('var(--green)')
    }, '載入'), e('button', {
      onClick: () => doEditDeck(name),
      style: dbBtn('var(--accent)'),
      title: '編輯後儲存會直接覆寫此牌組'
    }, '編輯'), e('button', {
      onClick: () => doRenameDeck(name),
      style: dbBtn('var(--panel)')
    }, '改名'), e('button', {
      onClick: () => doExportSaved(name),
      style: dbBtn('var(--panel)')
    }, '匯出'), e('button', {
      onClick: () => doDeleteDeck(name),
      style: dbBtn('var(--red)')
    }, '刪除'));
  }), e('button', {
    onClick: () => setShowMgr(false),
    style: dbBtn('var(--panel)')
  }, '關閉'))) : null);
}

// ---- 選卡組畫面（NPC / 連線 / 再來一局共用）----
// props: title、onPick(list)、onBuildNew()、onCancel()
function DeckSelect(props) {
  const savedS = useState(loadDecks());
  const savedDecks = savedS[0];
  const names = Object.keys(savedDecks);
  const colorDot = {
    red: 'var(--red)',
    blue: 'var(--blue)',
    yellow: 'var(--yellow)',
    green: 'var(--green)'
  };
  const colorChar = {
    red: '紅',
    blue: '藍',
    yellow: '黃',
    green: '綠'
  };
  return e('div', {
    style: {
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 24,
      gap: 14,
      overflowY: 'auto',
      background: 'var(--bg)',
      boxSizing: 'border-box'
    }
  }, e('h2', {
    style: {
      color: 'var(--accent)',
      fontSize: 24,
      margin: '8px 0'
    }
  }, props.title || '選擇牌組'), e('div', {
    style: {
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap',
      justifyContent: 'center'
    }
  }, e('button', {
    onClick: () => props.onPick(BUILTIN_DECKS['初始'].slice()),
    style: dbBtn('var(--blue)')
  }, '⭐ 內建「初始」牌組'), e('button', {
    onClick: () => props.onPick(makeRandomDeckList()),
    style: dbBtn('var(--panel)')
  }, '🎲 隨機卡組'), e('button', {
    onClick: props.onBuildNew,
    style: dbBtn('var(--panel)')
  }, '＋ 構建新牌組')), e('div', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 13,
      marginTop: 6
    }
  }, names.length ? '已存牌組：' : '（尚無已存牌組，可用內建／隨機卡組或構建新牌組）'), e('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      width: '100%',
      maxWidth: 440
    }
  }, names.map(nm => {
    const rec = savedDecks[nm];
    const cnt = rec && rec.deck ? deckMapToList(rec.deck).length : 0;
    const colorCount = {};
    if (rec && rec.deck) {
      Object.keys(rec.deck).forEach(k => {
        const d = DEFS[k];
        if (!d) return;
        colorCount[d.color] = (colorCount[d.color] || 0) + rec.deck[k];
      });
    }
    return e('div', {
      key: nm,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--panel)',
        borderRadius: 10,
        padding: '10px 14px',
        border: '1px solid var(--line)'
      }
    }, e('div', {
      style: {
        flex: 1
      }
    }, e('div', {
      style: {
        color: 'var(--ink)',
        fontWeight: 700,
        fontSize: 15
      }
    }, nm), e('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 3,
        flexWrap: 'wrap'
      }
    }, e('span', {
      style: {
        color: 'var(--ink-dim)',
        fontSize: 12
      }
    }, cnt + ' 張'), Object.keys(colorCount).sort((a, b) => colorCount[b] - colorCount[a]).map(cv => e('span', {
      key: cv,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        borderRadius: '50%',
        fontSize: 11,
        fontWeight: 800,
        background: colorDot[cv] || '#888',
        color: '#fff'
      }
    }, colorChar[cv] || '?')))), e('button', {
      onClick: () => {
        if (cnt >= DECK_SIZE) props.onPick(deckMapToList(rec.deck));else alert('此牌組不足 ' + DECK_SIZE + ' 張');
      },
      style: dbBtn(cnt >= DECK_SIZE ? 'var(--green)' : 'var(--line)')
    }, '使用'));
  })), props.onCancel ? e('button', {
    onClick: props.onCancel,
    style: Object.assign(dbBtn('var(--panel)'), {
      marginTop: 10
    })
  }, '← 返回') : null);
}

// ===== 沙盒編輯面板 =====
// props: state, act（dispatch SANDBOX_OP / 一般 action）, onExit
function SandboxPanel(props) {
  const state = props.state,
    act = props.act;
  const openS = useState(true);
  const open = openS[0],
    setOpen = openS[1];
  const pIdxS = useState(0);
  const pIdx = pIdxS[0],
    setPIdx = pIdxS[1];
  const pickS = useState(null); // {target} 目前要放卡到哪：{zone}/{slot}
  const pick = pickS[0],
    setPick = pickS[1];
  const qS = useState('');
  const q = qS[0],
    setQ = qS[1];
  // 卡片挑選視窗的 filter（與構築頁同款）
  const fColorS = useState({});
  const fColor = fColorS[0],
    setFColor = fColorS[1];
  const fCostS = useState({});
  const fCost = fCostS[0],
    setFCost = fCostS[1];
  const fLvS = useState({});
  const fLv = fLvS[0],
    setFLv = fLvS[1];
  const fTypeS = useState({});
  const fType = fTypeS[0],
    setFType = fTypeS[1];
  const fRareS = useState({});
  const fRare = fRareS[0],
    setFRare = fRareS[1];
  const fFxS = useState({});
  const fFx = fFxS[0],
    setFFx = fFxS[1];
  const multiS = useState({}); // 多選模式累積：{key: 張數}
  const multi = multiS[0],
    setMulti = multiS[1];

  const P = state.players[pIdx];
  const op = o => act(Object.assign({
    type: 'SANDBOX_OP',
    pIdx
  }, o));
  const tog = (setter, key) => setter(mm => {
    const n = Object.assign({}, mm);
    if (n[key]) delete n[key];else n[key] = true;
    return n;
  });

  const allKeys = Object.keys(DEFS).filter(k => (DEFS[k]['作品'] || '初始') === (state.sandboxWork || '初始'));
  const filtered = allKeys.filter(k => {
    const d = DEFS[k];
    if (q && (d.name || '').indexOf(q) < 0 && k.indexOf(q) < 0) return false;
    if (Object.keys(fColor).length && !fColor[d.color]) return false;
    if (Object.keys(fCost).length) {
      const ck = d.cost >= 3 ? '3+' : String(d.cost);
      if (!fCost[ck]) return false;
    }
    if (Object.keys(fLv).length && !fLv[String(d.level)]) return false;
    if (Object.keys(fType).length && !fType[d.type]) return false;
    if (Object.keys(fRare).length && !fRare[d.rarity]) return false;
    if (Object.keys(fFx).length) {
      const ok = Object.keys(fFx).some(fx => cardHasFx(d, fx));
      if (!ok) return false;
    }
    return true;
  });
  const anyPickFilter = Object.keys(fColor).length || Object.keys(fCost).length || Object.keys(fLv).length || Object.keys(fType).length || Object.keys(fRare).length || Object.keys(fFx).length;

  const lbl = {
    fontSize: 11,
    color: 'var(--ink-dim)',
    marginRight: 4
  };
  const miniBtn = bg => ({
    background: bg || 'var(--panel)',
    color: '#fff',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit'
  });

  if (!open) {
    return e('button', {
      onClick: () => setOpen(true),
      style: {
        position: 'fixed',
        bottom: 12,
        left: 12,
        zIndex: 60,
        ...miniBtn('var(--accent)'),
        padding: '8px 14px',
        fontSize: 13
      }
    }, '🧪 開啟沙盒面板');
  }

  // 卡片挑選清單（點一張 → 放到目前 pick 目標）
  const pillRowS = (label, items, sel, setter, colorFn) => e('div', {
    style: {
      display: 'flex',
      gap: 5,
      flexWrap: 'wrap',
      alignItems: 'center'
    }
  }, e('span', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 11,
      width: 36,
      flexShrink: 0
    }
  }, label), items.map(it => {
    const key = Array.isArray(it) ? it[0] : it;
    const text = Array.isArray(it) ? it[1] : it;
    const on = !!sel[key];
    return e('button', {
      key: key,
      onClick: () => tog(setter, key),
      style: {
        background: on ? colorFn ? colorFn(key) : 'var(--accent)' : 'var(--panel)',
        color: '#fff',
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 700,
        border: '1px solid var(--line)',
        cursor: 'pointer',
        fontFamily: 'inherit'
      }
    }, text);
  }));
  const COLVAR = {
    red: 'var(--red)',
    blue: 'var(--blue)',
    yellow: 'var(--yellow)',
    green: 'var(--green)'
  };
  const isMulti = pick && pick.slot == null && pick.zone !== 'cx';
  const multiTotal = Object.keys(multi).reduce((a, k) => a + multi[k], 0);
  const cardPicker = pick ? e('div', {
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 95,
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      padding: 12,
      gap: 8,
      boxSizing: 'border-box'
    }
  },
  // 頂列：標題 + 搜尋 + 關閉
  e('div', {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, e('span', {
    style: {
      color: 'var(--accent)',
      fontWeight: 800,
      fontSize: 16
    }
  }, (isMulti ? '加入多張卡到：' : '選一張卡放到：') + (pick.slot != null ? '場上格 ' + pick.slot : pick.zone)), e('input', {
    value: q,
    onChange: ev => setQ(ev.target.value),
    placeholder: '搜尋名稱/key',
    style: {
      padding: '5px 10px',
      borderRadius: 6,
      border: '1px solid var(--line)',
      background: 'var(--panel)',
      color: 'var(--ink)',
      fontFamily: 'inherit',
      width: 180
    }
  }), anyPickFilter ? e('button', {
    onClick: () => {
      setFColor({});
      setFCost({});
      setFLv({});
      setFType({});
      setFRare({});
      setFFx({});
    },
    style: miniBtn('var(--panel)')
  }, '清除篩選') : null, e('span', {
    style: {
      color: 'var(--ink-dim)',
      fontSize: 12,
      marginLeft: 'auto'
    }
  }, '符合 ' + filtered.length + ' 張'), isMulti ? e('button', {
    onClick: () => {
      const keys = [];
      Object.keys(multi).forEach(k => {
        for (let i = 0; i < multi[k]; i++) keys.push(k);
      });
      if (keys.length) op({
        op: 'addMany',
        zone: pick.zone,
        keys
      });
      setMulti({});
      setPick(null);
    },
    style: {
      ...miniBtn(multiTotal > 0 ? 'var(--green)' : 'var(--line)'),
      padding: '6px 14px',
      fontSize: 14
    }
  }, '確定加入 (' + multiTotal + ')') : null, e('button', {
    onClick: () => {
      setMulti({});
      setPick(null);
    },
    style: {
      ...miniBtn('var(--red)'),
      padding: '6px 14px',
      fontSize: 14
    }
  }, '關閉')),
  // 篩選列
  e('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      background: 'rgba(255,255,255,.02)',
      padding: '6px 8px',
      borderRadius: 8
    }
  }, pillRowS('顏色', [['red', '紅'], ['blue', '藍'], ['yellow', '黃'], ['green', '綠']], fColor, setFColor, k => COLVAR[k]), pillRowS('費用', ['0', '1', '2', '3+'], fCost, setFCost), pillRowS('等級', [['0', 'L0'], ['1', 'L1'], ['2', 'L2'], ['3', 'L3']], fLv, setFLv), pillRowS('類型', [['CHAR', '角色'], ['EVENT', 'Event'], ['CX', 'CX']], fType, setFType), pillRowS('稀有', WS_RARITIES, fRare, setFRare), pillRowS('效果', WS_FX_FILTER, fFx, setFFx)),
  // 卡片清單（含完整效果文字）
  e('div', {
    style: {
      flex: 1,
      overflowY: 'auto',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))',
      gap: 8,
      alignContent: 'start'
    }
  }, filtered.map(k => {
    const d = DEFS[k];
    const col = COLVAR[d.color] || 'var(--line)';
    return e('div', {
      key: k,
      onClick: () => {
        if (isMulti) {
          setMulti(mm => {
            const n = Object.assign({}, mm);
            n[k] = (n[k] || 0) + 1;
            return n;
          });
          return;
        }
        if (pick.slot != null) op({
          op: 'placeStage',
          slot: pick.slot,
          key: k,
          state: pick.state || 'stand'
        });else op({
          op: pick.zone === 'deck' ? 'deckTop' : 'addToZone',
          zone: pick.zone,
          key: k
        });
        setPick(null);
      },
      style: {
        textAlign: 'left',
        background: multi[k] ? 'rgba(90,160,90,.18)' : 'var(--panel)',
        border: '1px solid var(--line)',
        borderLeft: '5px solid ' + col,
        borderRadius: 8,
        padding: 10,
        cursor: 'pointer',
        color: 'var(--ink)',
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'relative'
      }
    }, isMulti && multi[k] ? e('span', {
      style: {
        position: 'absolute',
        top: 6,
        right: 6,
        background: 'var(--green)',
        color: '#fff',
        borderRadius: 999,
        minWidth: 20,
        height: 20,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 800,
        padding: '0 5px'
      }
    }, '×' + multi[k]) : null, isMulti && multi[k] ? e('span', {
      onClick: ev => {
        ev.stopPropagation();
        setMulti(mm => {
          const n = Object.assign({}, mm);
          n[k] = (n[k] || 0) - 1;
          if (n[k] <= 0) delete n[k];
          return n;
        });
      },
      style: {
        position: 'absolute',
        top: 6,
        right: 32,
        background: 'var(--panel-2)',
        color: '#fff',
        borderRadius: 999,
        width: 20,
        height: 20,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 800,
        border: '1px solid var(--line)'
      }
    }, '−') : null, e('div', {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 8
      }
    }, e('span', {
      style: {
        background: col,
        color: '#fff',
        fontWeight: 800,
        borderRadius: 5,
        padding: '1px 7px',
        fontSize: 13
      }
    }, d.type === 'CX' ? 'CX' : 'L' + d.level), e('span', {
      style: {
        fontWeight: 800,
        fontSize: 14,
        flex: 1
      }
    }, d.name || k), d.type === 'CHAR' ? e('span', {
      style: {
        fontWeight: 800,
        fontSize: 14,
        color: col
      }
    }, d.power) : null), e('div', {
      style: {
        fontSize: 11,
        color: 'var(--ink-dim)'
      }
    }, (d.type === 'CX' ? 'CX' : d.type === 'EVENT' ? 'Event' : '角色') + ' · ' + d.rarity + (d.type !== 'CX' ? ' · 費' + d.cost + ' · soul' + d.soul : '')), e('div', {
      style: {
        fontSize: 12,
        color: 'var(--ink)',
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap'
      }
    }, d.text || '（無特殊效果）'));
  }))) : null;

  return e('div', {
    style: {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      background: 'var(--panel-2)',
      borderTop: '2px solid var(--accent)',
      padding: '8px 12px',
      maxHeight: '42vh',
      overflowY: 'auto',
      boxShadow: '0 -4px 20px rgba(0,0,0,.5)'
    }
  },
  // 頂列：玩家切換、回合/階段、退出
  e('div', {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: 6
    }
  }, e('b', {
    style: {
      color: 'var(--accent)'
    }
  }, '🧪 沙盒'), e('span', lbl, '編輯對象'), e('button', {
    onClick: () => setPIdx(0),
    style: miniBtn(pIdx === 0 ? 'var(--blue)' : 'var(--panel)')
  }, '你(P0)'), e('button', {
    onClick: () => setPIdx(1),
    style: miniBtn(pIdx === 1 ? 'var(--red)' : 'var(--panel)')
  }, '對手(P1)'), e('button', {
    onClick: () => act({
      type: 'SANDBOX_OP',
      pIdx: 1,
      op: 'defaultOpponent'
    }),
    style: miniBtn('var(--accent)'),
    title: '對手用初始/該系列卡擺一套標準場（等級1+錢1+傷害3+場上5隻L1+控室2CX8角色）'
  }, '對手default'), e('button', {
    onClick: () => act({
      type: 'SANDBOX_OP',
      pIdx: 0,
      op: 'defaultMe'
    }),
    style: miniBtn('var(--blue)'),
    title: '我方設定等級區1張、錢10張、時計3張（手牌/場/控室/牌庫不變）'
  }, '我方default'), e('span', {
    style: {
      ...lbl,
      marginLeft: 10
    }
  }, '回合'), e('button', {
    onClick: () => op({
      op: 'setTurn',
      value: 0
    }),
    style: miniBtn(state.turnPlayer === 0 ? 'var(--blue)' : 'var(--panel)')
  }, 'P0'), e('button', {
    onClick: () => op({
      op: 'setTurn',
      value: 1
    }),
    style: miniBtn(state.turnPlayer === 1 ? 'var(--red)' : 'var(--panel)')
  }, 'P1'), e('span', {
    style: {
      ...lbl,
      marginLeft: 10
    }
  }, '階段'), ['stand', 'draw', 'clock', 'main', 'climax', 'attack', 'encore'].map(ph => e('button', {
    key: ph,
    onClick: () => op({
      op: 'setPhase',
      value: ph
    }),
    style: miniBtn(state.phase === ph ? 'var(--accent)' : 'var(--panel)')
  }, ph)), props.onUndo ? e('button', {
    onClick: () => props.onUndo(),
    style: {
      ...miniBtn('var(--panel)'),
      marginLeft: 'auto'
    }
  }, '↶ 上一步') : null, e('button', {
    onClick: () => {
      if (confirm('重設沙盒？')) op({
        op: 'reset'
      });
    },
    style: miniBtn('var(--panel)')
  }, '重設'), e('button', {
    onClick: () => setOpen(false),
    style: miniBtn('var(--panel)')
  }, '收起'), props.onExit ? e('button', {
    onClick: props.onExit,
    style: miniBtn('var(--red)')
  }, '離開沙盒') : null),
  // 場上格
  e('div', {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      marginBottom: 6,
      flexWrap: 'wrap'
    }
  }, e('span', lbl, 'P' + pIdx + ' 場上'), [0, 1, 2, 3, 4].map(slot => {
    const c = P.stage[slot];
    return e('div', {
      key: slot,
      style: {
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: '3px 6px',
        display: 'flex',
        gap: 4,
        alignItems: 'center'
      }
    }, e('span', {
      style: {
        fontSize: 10,
        color: 'var(--ink-dim)'
      }
    }, (slot < 3 ? '前' : '後') + slot), c ? e('span', {
      style: {
        fontSize: 11
      }
    }, (c.def.name || c.key).slice(0, 6)) : e('span', {
      style: {
        fontSize: 11,
        color: 'var(--ink-dim)'
      }
    }, '空'), c ? e('select', {
      value: c.state,
      onChange: ev => op({
        op: 'setStageState',
        slot,
        state: ev.target.value
      }),
      style: {
        fontSize: 10,
        background: 'var(--panel)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: 4
      }
    }, ['stand', 'rest', 'reverse'].map(st => e('option', {
      key: st,
      value: st
    }, st))) : null, e('button', {
      onClick: () => setPick({
        slot,
        state: 'stand'
      }),
      style: miniBtn('var(--panel)')
    }, '放卡'), c ? e('button', {
      onClick: () => op({
        op: 'clearStage',
        slot
      }),
      style: miniBtn('var(--panel)')
    }, '×') : null);
  })),
  // 各區數量設定 + 放卡
  e('div', {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, [['hand', '手牌'], ['stock', '錢'], ['clock', '傷害'], ['level', '等級'], ['wr', '控室'], ['cx', 'CX區'], ['deck', '牌庫']].map(z => {
    const zone = z[0],
      label = z[1];
    const cur = P[zone] ? P[zone].length : 0;
    return e('div', {
      key: zone,
      style: {
        display: 'flex',
        gap: 3,
        alignItems: 'center',
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: '2px 6px'
      }
    }, e('span', {
      style: {
        fontSize: 11,
        color: 'var(--ink)'
      }
    }, label + '(' + cur + ')'), zone !== 'cx' ? e('button', {
      onClick: () => op({
        op: 'setCount',
        zone,
        n: cur + 1
      }),
      style: miniBtn('var(--panel)')
    }, '+1') : null, zone !== 'cx' ? e('button', {
      onClick: () => op({
        op: 'setCount',
        zone,
        n: Math.max(0, cur - 1)
      }),
      style: miniBtn('var(--panel)')
    }, '−1') : null, e('button', {
      onClick: () => {
        setMulti({});
        setPick({
          zone
        });
      },
      style: miniBtn('var(--panel)'),
      title: '加卡（可多選，最後按確定）'
    }, '放'), e('button', {
      onClick: () => op({
        op: zone === 'deck' ? 'fillDeck' : 'clearZone',
        zone
      }),
      style: miniBtn('var(--panel)')
    }, zone === 'deck' ? '填滿' : '清'));
  })), cardPicker);
}

module.exports = { DEFS, BUILTIN_DECKS, initialState, gameReducer, gameReducerInner, resolvePending, checkLevelUp, dealBattleDamage, checkZeroPowerDestroy, attackAfterConfirm, attackBattleStep, declareAttack, endTurn, encoreCost, pb, activateConcentrate, startPhaseChain, makeRandomDeckList, deckPairsToKeys, makeSandboxState, clockThresholdFor, deckMapToList, mkCard, loseLevelFor, calcPower, runAttackFx, canSelfEncore, saveDecks, loadDecks, processEncore };