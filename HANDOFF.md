# WS 模擬器 — 專案交接文件

## 這是什麼
一個 Weiß Schwarz（WS）卡牌對戰模擬器，單一 HTML 檔（`ws-sim-offline.html`，約 11,000 行）。
用編譯後的 `React.createElement` 風格寫（**不是 JSX**）。使用者「J」在香港，用繁體中文溝通，
是產品負責人／測試者（非工程師）。J 會逐步指示加功能、自己測試後才往下一步。

## 怎麼跟 J 合作（很重要）
- J 喜歡**先把需求講清楚**再動手，不要擅自假設、不要一次做太多。
- J 用**繁體中文**回覆，簡潔。回覆 J 時也用繁體中文。
- J 問問題時若夾帶答案選項，那些選項就是 J 的決定，照做。
- J 測試完才會叫你做下一步。**不要搶先**。
- 連線（WebRTC）和瀏覽器 UI **無法在這裡實機測試**，只能用 headless harness 測 reducer 邏輯 + 語法。
  要對 J 誠實說明這個限制。視覺類改動（banner、縮寫顯示、戰場互動）只能驗語法＋邏輯，要 J 實機測。

## 檔案位置
- 主檔（要編輯的）：`ws-sim-offline.html`（正式部署複製到 `/mnt/user-data/outputs/`）
- 東方卡資料：`yuyutei_cards.csv`（212 張，最後一欄「效果說明」是**日文原文**，翻譯一律對這份校）
- 測試檔：`test_*.js` + `fuzz.js` + `harness.js`（headless 測試框架）
- WS 規則原文：J 會上傳（精細規則如戰鬥步驟、counter 對象、角色變動，照原文實作，勿猜）

## 測試框架（每次改完都要跑）
語法檢查：抽出主 script（從 `<script>try{const {` 到對應 `</script>`）用 `node --check`。
重建 harness：用「找邊界」方式自動抽（start=找 `<script>try{const {`；de=其後 30 行內找 `} = React;`；
cf=找 `function CardFace`；引擎=html[de:cf-1]；前面接 React/localStorage/btoa/atob stub，後面接 module.exports）。
**不要寫死行號（檔案會長）。** exports 需含測試引用的所有函式，含 checkZeroPowerDestroy/gameReducerInner/attackAfterConfirm/declareAttack。
跑全部 test_*.js + fuzz.js。

### 目前全綠基準
batch1 26、batch2 20、buff1step 18、deckbuilder 9、net_handshake 10、sandbox 14、
thp_buffs 13、l1_secondary 16、cxrecycle 2、look 7、zerodestroy 14、fuzz 5000/0。
**test_refresh 26勾/1叉 —— 這 1 個叉（deckout 判定）在更早版本就存在，非近期改動造成，屬待查遺留。**

### harness 常見坑
- module.exports 必須包含測試引用的每個函式，否則該測試的 assert 會靜默不計數。
- harness 是 html 主 script 的拷貝；**改完 html 一定要重建 harness 再跑測試**，否則測的是舊碼。

## 編輯這個檔的注意事項（血淚教訓）
- str_replace 的 old_str 若**跨越某個函式宣告行**，容易不小心吃掉它（曾吃掉 nm()/trigName() 導致全掛）。
- 編譯風格括號易數錯。出錯用 node --check 配合逐函式抽出定位。
- `<script>try{...}</script>` 是一個大 try block；括號不平衡常顯示成「Missing catch or finally after try」，真正問題在更前面。
- **編碼坑**：用 str_replace 對付含 `\n`（字面反斜線n）或中文的行常匹配失敗，改用 python s.replace(...) 直接處理更穩。

## 卡片資料結構
- DEFS 是卡定義字典。每張卡：{name,type('CHAR'|'CX'),rarity,作品,color,level,cost,power,soul,trig,tsoul?,traits[],fx?,fxList?,text?,selfEncore?}
- 卡**實例**：{id,key,def,state('stand'|'rest'|'reverse'),traitsAdd[],autoBuff?,justEncored?,zeroDestroying?}。
  注意：在 **CardFace 內 `c = card.def`，所以要用 `c.fx`/`c.fxList`，不是 `c.def.fx`**（這個踩過坑）。
- `作品`：'初始'（14 張舊卡）或 '東方Project'（已導入 20 張）。WS 不能混作品。

## 多能力機制（重要基建）
- **fxList 陣列**：一張卡多能力時用它（取代單一 fx）。continuousFromStage、runAttackFx、CardFace 縮寫都檢查 `fxList || [fx]`。
- **autoBuff={power,soul}**：當回合臨時加減力（可負）。回合結束清除（stage cleanup loop，現也清 justEncored/zeroDestroying）。
- **runAttackFx(s,ctx)**：攻擊時效果分派器（同步、不 pending）。新增「攻擊時XXX」加在這。
- **continuousFromStage(P,card,slot,state,pIdx)**：持續加成動態掃描（calcPower 內呼叫）。
- **自身 Encore**：卡上 selfEncore。helpers：selfEncoreCandidates/canSelfEncore/selfEncoreLabel。

## 已實作功能（全部已測）
- 構建卡組、選卡流程（NPC/雙人/連線）、沙盒測試模式（雙方 human）。
- 東方卡 20 張：純香草4 + 文/てゐ/にとり/メディスン/こいし/妹紅（附帶效果已實作）＋ L2 第一批10張（マミゾウ/レミリア/妖夢/咲夜/アリス/ミスティア/早苗/椛/セプテット/パチュリー）。
- 東方卡譯文已全部對 CSV 原文校過。

## 近期完成（這幾輪）
1. **てゐ 改戰場高亮選人**（不再彈 modal）：高亮其他幻想郷夥伴→點選→底部「確認」鍵。沙盒 P0/P1 雙方都支援。
2. **特殊 encore 加「取消（重選）」鍵**：SELF_ENCORE_ASK 多 cancel 分支，取消不落控室、回高亮重選。
3. **力量歸零破壞**（ZERO_ENCORE_SELECT）：任何 state（含本來就 reverse/rest）力量<=0 立即破壞；多隻同時歸零像 encore 高亮逐隻選；人類問 encore，NPC 一律落控室。復活角色設 justEncored 當回合不再被重複破壞。用 zeroDestroying 標記破壞流程中的卡。
4. **翻頂判定兩段式 banner**：メディスン/にとり 發動時，中心先顯示「公開牌庫頂+第1張卡」停1秒，再顯示「發動成功（含效果）/失敗」（pushReveal helper，kind:'reveal'）。
5. **效果縮寫修正**：CardFace 的 _fxArr 之前誤用 c.def.fxList（c 已是 def），改 c.fxList/c.fx，縮寫恢復顯示。
6. **攻擊時序重構**（✅ 已完成並測試）：見下方已完成段落。
7. **L2 第一批 10 張**（✅ 已完成並測試，commit e3a1f39）：マミゾウ ATK_BUFF_ANY_1000、レミリア SUPPORT_FRONT_FLAT_500、妖夢 CIP_BUFF_ANY_1500、咲夜 CIP_BUFF_SELF_1500＋LEAVE_LOOK3_GENSO_TAKE_DISCARD1、アリス SUPPORT_FRONT_LEVEL500＋TRIGGER_GATE_BUFF_GENSO_2000、ミスティア NO_COLOR_RESTRICTION＋CONT_SELF_GENSO2_P2000＋ATK_COND_GENSO2_OPP_LV2_SELF6000、早苗 SUPPORT_FRONT_FLAT_1000＋OPP_ATKPHASE_CX_COST_OPP_SOUL4、椛 ATK_PEEK_BOTH_BOTTOM＋ATK_SELF_PX_GENSO1000、セプテット CIP_MILL2_SELF_GENSO_BUFF＋ON_CX_PLACED_COST_CHAR_LOOK4_GENSO、パチュリー CIP_OPT_LOOK7_GENSO_SELF1500。新增 pending 類型：CHARSEL_BUFF、OPT_COST_ASK、DISCARD_HAND_FOR_LOOK、DISCARD_1、SEPTET_CX_COST、SANAE_SOUL4_ASK/PICK。leaveStage hook 補接所有退場路徑。
8. **UI 演出改版**（本輪）：
   - 出場碌N 兩段式動畫：CIP_MILL 類效果出場時，先推 `kind:'reveal'` banner 顯示出場卡1秒，再進碌牌翻牌動畫。所有日後的「出場後碌N」效果均應遵循此模式。
   - CHARSEL_BUFF 改戰場直點：選我方角色加力不再彈 modal，改為高亮候選角色（`highlightSlots`）直接點選，底部浮動條顯示來源+加力量+跳過鈕。日後所有「出場/攻擊時選我方角色加/減力」類效果一律沿用此模式，不得另開 modal。
   - 東方 門 CX 測試卡已加入（key: `thp_cx_standby_hakurei`，trig: STANDBY，紅色），走現有 `doStandby` 邏輯（控室選角色回手）。
   - DISCARD_1 / DISCARD_HAND_FOR_LOOK 棄牌選卡視窗改用 `hand: true`（與「選牌加手」同大小），不得再用 `fill: true`。
9. **UI 規範落地**（本輪 v0.2）：
   - CX 打出加兩步確認（`cxConfirm` state，點選高亮→彈含卡圖 modal→確定才執行）
   - Deck Builder、遊戲內 infoCard 詳情彈窗均加入 CX 斜紋美術條（見「UI 互動規範·規範3」）
   - SEPTET_CX_COST 改戰場直點（底部浮動條含卡名+效果摘要）
   - 沙盒 Default 等級區改3張，等級區+傷害區共6張集齊4色
   - 版本號更新機制：首頁 vX.Y，每次 push 遞增（目前 v0.2）

## ★★ 攻擊時序重構（✅ 已完成）

### 實作摘要
- **gameReducer** 移除全域 checkZeroPowerDestroy wrapper，改為綁在破壞源。
- **runAttackFx**（メディスン等減力）尾端明確呼叫 checkZeroPowerDestroy；三個呼叫點加 `resumeAfterPending='burn'` 中斷機制。
- **checkZeroPowerDestroy** 尾端加 resumeAfterPending 恢復邏輯（burn/counter/battle），修正 encore handler 用 return 繞過 resolvePending resume 區的問題。
- **battleVoided 旗標**：checkZeroPowerDestroy 標記 zeroDestroying 時，若命中 attackCtx 攻/守位置就設 `ctx.battleVoided = true`；attackBattleStep 看到旗標跳過戰鬥（規則 7.6.1.3）。
- **假倒置不觸發「倒置時」效果**：battleVoided 跳過整個 battle block，defenderReversed/recordTewi 等觸發路徑自然不被假倒置命中。
- **encore 復活清 autoBuff**：8 處 encore 復活點加 `card.autoBuff = null`，復活角色視為新角色，前效果不殘留。
- **開發守則（重要）**：日後新增減力/破壞效果，寫完記得 call 一次 `checkZeroPowerDestroy(s)`。

### 正確的攻擊標準時序（正面攻擊，已實作）
1. 宣言攻擊
2. 攻擊宣言時效果（runAttackFx：翻頂/減力等）→ 若有角色歸零立即破壞+encore → 才進 Trigger
3. Trigger（翻頂 trigger check）
4. Counter step（正面攻擊必到，防守方一次只能打一張）
5. 傷害結算
6. 戰鬥（比力量；攻/守角色有「變動」→ 不發生）
7. 戰鬥後 encore phase

### 規則要點（已實作，供未來新卡參考）
- checkZeroPowerDestroy 開頭有 `if(s.pending) return`；減力通常同步，直接 call 無問題。
- counter 卡能否生效 = 看卡自身效果文字有無合法對象；counter step 不做分流。
- 破壞/encore 後 battleVoided=true → counter step 仍進行，但 battle 跳過。

### B. 戰鬥是否發生 + counter 對象判定（照官方規則 7.3–7.6，已實作）
- 正面攻擊 → counter step **必到**（規則 7.3.1.3），不因角色變動取消。
- 防守方一次 play timing，只能打**一張** event 或 counter 能力（7.4.1.2.2）。
- counter 卡能否生效 = 看**該卡自身效果文字**有無合法對象；counter step 不做「指定/不指定對象」分流。
  - 例：COUNTER_INITIAL_P1500 效果文字指定「初始角色」，若交戰防守者不存在或非初始 → 無合法對象 → 無法發動。
- **攻擊或防守角色被破壞（規則 7.6.1.3）→ 戰鬥不發生**：用 `ctx.battleVoided` 旗標，attackBattleStep 看到跳過。
  - 旗標在 checkZeroPowerDestroy 內，標記 zeroDestroying 時若命中 attackCtx 的攻/守位置就設 true。
- ~~舊版「指定被正面攻擊角色 vs 不指定對象」分流~~ → 此為猜測，規則裡沒有，**已捨棄**。

## 互動 pending 模式速查
- TEWI_SELECT（戰場高亮選夥伴→確認）、ENCORE_SELECT（戰場高亮reverse→點選）、
  ZERO_ENCORE_SELECT（力量歸零破壞→高亮→點選，含 zeroSrc 分流回 SELF_ENCORE_ASK/ENCORE_CONFIRM）、
  SELF_ENCORE_ASK（方式一棄牌/方式二付3錢/不發動/取消重選）、ENCORE_CONFIRM（一般角色先確認）。
  CHARSEL_BUFF（戰場高亮候選角色→直接點選；底部浮動提示含跳過鈕）。
- modal gate 在 state.sandbox 時用 pending.pIdx（非 myIdx）讓 P1 也能彈窗。
- **戰場高亮直點類型**（已從 modal gate 排除，在 `onSlotClick` 內獨立處理）：
  TEWI_SELECT、ZERO_ENCORE_SELECT、CHARSEL_BUFF。
  新增此類 pending 時，須同步更新：① onSlotClick 分支 ② myIdx highlightSlots ③ oppIdx highlightSlots (sandbox) ④ oppIdx onSlotClick 條件 ⑤ PendingModal 排除條件×2 ⑥ 底部浮動提示（若需跳過鈕）。

## 通用機制實作規則（新 session 必讀；遇到新機制請補充此節）

> **要求**：日後每次實作新的通用機制，必須先把規則補充到這一節，再動手寫碼。J 不會每次重複說明。

### 応援（Support）欄位覆蓋規則
舞台共**5格**：前列 slot 0-1-2，後列 slot 3-4（無後中）。
応援效果覆蓋「正前方」的格子，`frontOf` 函式定義：
- slot 3（後左）→ [0, 1]（前左＋前中）
- slot 4（後右）→ [1, 2]（前中＋前右）
實作位置：`continuousFromStage`，用 `frontOf(bslot).includes(slot)` 判斷。
卡面文字統一寫：**「応援對前方角色」**（不寫「前列全部」）。

### 碌N（Mill N）處理
「翻牌庫頂N張放控室」：卡牌直接從牌庫進入控室，**不在中途計算 refresh**。
全部N張處理完後，才統一判斷是否觸發 refresh。
等同現有 にとり 的碌2邏輯，參考其實作。

### 逐張公開（Look up to N，選1張加手牌，其餘控室）
適用 065②、080、咲夜②等「看最多N張，選1張《幻想郷》角色加手牌，其餘控室」效果：
- 逐張從牌庫頂公開，**看牌期間不觸發 refresh**。
- 即使牌庫剩少於N張也只看到底，不因數量不足中止。
- 全部處理完（選取＋其餘入控室）後，才統一判斷 refresh。
- 若有「if at least 1」條件（如咲夜②），看到0張時跳過後續步驟。
現有「3上1」為此機制的參考實作。

### 進化（Evolution / Swap）同狀態規則
「把此卡放控室，從控室取某卡放回同格子」類效果：
新角色放入時，**狀態與被替換的卡相同**（stand→stand、rest→rest、reverse→reverse）。

### 出場後碌N banner 兩段式模式
CIP 類翻牌效果（碌2等）統一用兩段式 banner：
1. 先推 `{ kind: 'reveal', title: '${card.def.name} 出場', cardKeys: [card.key], dur: 1000, byPIdx: pIdx }` 停1秒
2. 再推碌牌 `{ kind: 'flip', stagingTitle: '…碌N', ... }` 動畫
日後所有「出場時碌N」類效果（含未來新卡）均應遵循此順序。

### 選我方角色加/減力（無 modal，戰場直點）
凡「出場時/攻擊時 選1隻我方角色加減力」類效果，一律用 CHARSEL_BUFF pending：
```js
s.pending = { type: 'CHARSEL_BUFF', pIdx, amount, cand: [合法slot陣列], source: card.def.name };
// 攻擊時需加: ctx.resumeAfterPending = 'counter';
```
UI 會自動高亮候選格、底部顯示浮動提示、允許點擊直選或按跳過。
**不要**另開 modal 或新增 pending 類型；直接複用 CHARSEL_BUFF。

### 棄手牌選牌視窗（DISCARD_1 / DISCARD_HAND_FOR_LOOK）
棄手牌的選牌一律用 `hand: true` 渲染 CardFace（高度 min(240px,24vh)），與「選牌加手」保持一致大小。
不得用 `fill: true`（會令卡圖依容器拉伸，出現太扁問題）。

---

## ★★ UI 互動規範（所有新功能必須遵守）

> 這些是 J 確認的設計規範，日後新增任何互動功能時必須遵守，無需 J 重複說明。

### 規範 1：所有用卡操作需兩步確認（點擊 → 高亮 → 確認鍵）
任何「玩家主動使用一張牌」的操作，**不得點一下就立刻執行**，必須：
1. 點擊 → 該卡高亮（badge 顯示「確認？」）
2. 彈出含卡圖的確認 modal，按「確定」才執行；點擊其他地方或按「取消」可反悔

已實作範例：
- **CX 打出**：`cxConfirm` state（手牌點 CX → 高亮 + badge「確認？」→ modal 顯示卡圖 + 確定/取消）
- **時計換牌**：`clockConfirm` state（點手牌 → modal 確認）

新增任何「用手牌」操作時，照此模式新增對應 confirm state。

### 規範 2：效果選擇戰場角色 → 高亮場上卡 + 底部浮動條
凡效果需要「選擇我方或對方舞台上的角色」，一律：
- 高亮候選格（`highlightSlots`）
- 底部浮動條說明：**卡名（粗體）+ 效果摘要 + 跳過鈕**（若可略過）
- **不得另開 modal 彈窗**

已實作範例：CHARSEL_BUFF、SEPTET_CX_COST、TEWI_SELECT。

底部浮動條格式（見 CHARSEL_BUFF / SEPTET_CX_COST 參考）：
```
[卡名（顏色粗體）] [效果說明（灰字）] ── 點[高亮]的角色  [跳過]
```

### 規範 3：CX 卡美術斜紋條（所有顯示 CX 的地方）
CX 卡**不論在哪個 UI 元件出現**，都必須顯示顏色斜紋條 + 觸發類型標示：
- **CardFace**（手牌、選牌 modal、banner）：已有，底部 30% 斜紋 + 觸發文字
- **Deck Builder 卡列表**：細斜紋色帶（height 10px）+ 觸發類型縮寫
- **遊戲內卡片詳情彈窗（infoCard）**：中寬斜紋條（height 14px）+ 「全體+1000/+1魂·門/閘/CHOICE」
- 新增任何顯示卡牌的 UI 時，若可能顯示 CX，必須加入此美術條。

斜紋 CSS 模板（`col` = COLOR_HEX 或 WS_COLOR_VAR，`dark` = 對應深色 hex）：
```js
const dark = c.color==='red'?'#a82838':c.color==='blue'?'#1f5aa8':c.color==='yellow'?'#a8841a':c.color==='green'?'#1f7a48':'#555';
background: `repeating-linear-gradient(45deg,${col},${col} 6px,${dark} 6px,${dark} 12px)`
```

### 規範 4：版本號隨每次 push 遞增
首頁標題列「對戰模擬器 — 規則引擎原型 vX.Y」，**每次 commit push 前必須遞增版本號**。
- 目前版本：**v0.2**
- 遞增規則：小改動 +0.1（v0.2→v0.3）；重大功能 +1.0（v0.X→v1.0）
- 位置：`ws-sim-offline.html` 全文搜 `對戰模擬器 — 規則引擎原型 v`

---

## 卡片難度分級（J 用來決定做哪批）
L0純香草4、L1純被動2、L2簡單加力29、L3已有框架22、L4單一新動作45、L4?17、L5最難35、Event6、CX52。
- **L2 第一批（✅ 已完成）**：マミゾウ P02、妖夢 P10、咲夜 T15、レミリア P07、アリス T09、
  早苗 036、ミスティア 021、椛 044、セプテット 065、パチュリー 080。

## CX 觸發類型完整速查（J 確認版）

> 這是 J 最終確認的觸發類型對照，實作時以此為準。與此前任何舊版本有出入時，以下表為準。

| 代號 | 中文名 | TRIG 常數 | 效果說明 | 實作狀態 |
|------|--------|-----------|----------|----------|
| 無   | 無觸發 | NONE      | 無效果   | ✅ 已有  |
| 魂   | 魂     | SOUL      | +1魂     | ✅ 已有  |
| 2    | 双魂   | DSOUL     | +2魂（無加力）| ✅ 已有（continuousFromCX ALL_S2）|
| G    | 閘     | GATE      | 觸發時：從控室回收1張CX到手牌 | ✅ 已有（doGate）|
| C    | 門     | STANDBY   | 觸發時：從控室選1隻角色加手牌 | ✅ 已有（doStandby）|
| F    | 磚     | BRICK     | 觸發時：該CX強制送手牌（不入控室）；可選：牌庫頂→股票 | ❌ 待實作 |
| D    | 書     | BOOK      | 觸發時：抽1張牌 | ❌ 待實作 |
| H/1H | 掣    | SWITCH    | 觸發時：從控室選1隻等級≤（自身等級+1）的角色，放到任意自方舞台格（REST狀態），觸發力量歸零破壞判定 | ❌ 待實作 |
| I    | 選     | SELECT    | 觸發時：從控室選1隻有「魂」圖標的角色，加手牌**或**送股票（玩家二選一） | ❌ 待實作 |
| A/1A | 風    | WIND      | 觸發時：把對方1隻舞台角色送回對方手牌；**不**因空場加+1傷；counter 階段照常進行 | ❌ 待實作 |

### ⚠️ 當前錯誤代碼待修正
目前 html 中 `TRIG.SHOT` 和 `TRIG.STOCK` 是**錯誤實作**，需要全部清除：
- `TRIG.SHOT`：曾誤實作為「造成1傷害」→ 實際 H/1H = 掣（場出角色），**不是傷害**
- `TRIG.STOCK`：曾誤實作為「牌庫頂→股票」→ 實際此效果是磚(F)的選項，而非獨立觸發類型
- 修正步驟：① 從 TRIG 常數刪除 SHOT/STOCK ② 從 trigger step 刪除對應 handler ③ 新增 BRICK/BOOK/SWITCH/SELECT/WIND 常數及 handler

### CX cont（場上持續效果）對照
| cont 值 | 效果 | 備注 |
|---------|------|------|
| `'ALL_P1000_S1'` | 全體+1000/+1魂 | 最常見，門/閘/書/掣/選/風均可能有 |
| `'ALL_S2'`       | 全體+2魂（不加力） | 双魂 CX 專用 |
| `null`           | 無場上持續效果 | 磚有時無 cont |

### CX 卡牌清單（待導入 DEFS，52張）
> 詳細資料見 `yuyutei_cards.csv`，效果說明欄為日文原文。
> 導入優先級由 J 決定；下批開工前先確認本表哪些已完成。

| 已導入 | 作品 key | 名稱 | 觸發 | cont | 備注 |
|--------|----------|------|------|------|------|
| ✅     | thp_cx_standby_hakurei | 博麗靈夢（測試用） | STANDBY/C | ALL_P1000_S1 | 測試 doStandby 用，非正式卡 |
| ❌     | （待 J 指定） | 全部東方 CX 52張 | 各異 | 各異 | 見 CSV |

---

## 其他已知待辦
- **早苗③ ACT 進化**：目標卡「信仰は儚き人間の為に 早苗」尚未加入 DEFS；需先加卡，再實作 ACT_LV3_SWAP_SANAE_FAITH handler（同狀態規則）。
- T16 伊吹萃香「同名可放任意張數」=改組牌規則，需改 deck-builder 驗證，單獨處理。
- CX 整批（52張）尚未導入；にとり 要 choice-CX 才能完整測。已先加入1張東方門CX測試卡（`thp_cx_standby_hakurei`）供 doStandby 測試。
- 連線網路層沒實機測過，只驗了握手邏輯與組局。
- test_refresh 的 1叉（deckout）待查。
