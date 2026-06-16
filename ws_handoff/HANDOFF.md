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
- `作品`：'初始'（14 張舊卡）或 '東方Project'（已導入 10 張）。WS 不能混作品。

## 多能力機制（重要基建）
- **fxList 陣列**：一張卡多能力時用它（取代單一 fx）。continuousFromStage、runAttackFx、CardFace 縮寫都檢查 `fxList || [fx]`。
- **autoBuff={power,soul}**：當回合臨時加減力（可負）。回合結束清除（stage cleanup loop，現也清 justEncored/zeroDestroying）。
- **runAttackFx(s,ctx)**：攻擊時效果分派器（同步、不 pending）。新增「攻擊時XXX」加在這。
- **continuousFromStage(P,card,slot,state,pIdx)**：持續加成動態掃描（calcPower 內呼叫）。
- **自身 Encore**：卡上 selfEncore。helpers：selfEncoreCandidates/canSelfEncore/selfEncoreLabel。

## 已實作功能（全部已測）
- 構建卡組、選卡流程（NPC/雙人/連線）、沙盒測試模式（雙方 human）。
- 東方卡 10 張：純香草4 + 文/てゐ/にとり/メディスン/こいし/妹紅（附帶效果已實作）。
- 東方卡譯文已全部對 CSV 原文校過。

## 近期完成（這幾輪）
1. **てゐ 改戰場高亮選人**（不再彈 modal）：高亮其他幻想郷夥伴→點選→底部「確認」鍵。沙盒 P0/P1 雙方都支援。
2. **特殊 encore 加「取消（重選）」鍵**：SELF_ENCORE_ASK 多 cancel 分支，取消不落控室、回高亮重選。
3. **力量歸零破壞**（ZERO_ENCORE_SELECT）：任何 state（含本來就 reverse/rest）力量<=0 立即破壞；多隻同時歸零像 encore 高亮逐隻選；人類問 encore，NPC 一律落控室。復活角色設 justEncored 當回合不再被重複破壞。用 zeroDestroying 標記破壞流程中的卡。
4. **翻頂判定兩段式 banner**：メディスン/にとり 發動時，中心先顯示「公開牌庫頂+第1張卡」停1秒，再顯示「發動成功（含效果）/失敗」（pushReveal helper，kind:'reveal'）。
5. **效果縮寫修正**：CardFace 的 _fxArr 之前誤用 c.def.fxList（c 已是 def），改 c.fxList/c.fx，縮寫恢復顯示。
6. **戰鬥前破壞**：attackBattleStep 開頭若攻擊對象 calcPower<=0 則直接破壞、跳過戰鬥（雛形，待整合進下面的時序重構）。

## ★★ 待辦：攻擊時序重構（J 已確認設計，Project 第一件事）

### 正確的標準時序（正面攻擊）
1. 宣言攻擊
2. 攻擊宣言時效果（公開卡組面、減攻擊力等「攻擊時」效果）
3. **Trigger（翻頂 trigger check）**
4. **Counter step（反擊階段）**（標準：Trigger→Counter，要確認現碼順序）
5. 傷害結算
6. 戰鬥（battle：比力量、倒置）
7. 戰鬥後的正式 encore phase

### 「力量歸零破壞 + encore」是隨時觸發的『規則處理』，不固定步驟
- **準則：任何「會導致角色進控室」的效果**（減力到<=0、直接破壞、反擊 event 的破壞/減力），
  在它發動、效果結算完的**當下**，自己接一次 checkZeroPowerDestroy(s)。處理完（落控室→問encore→encore完）才繼續原本步驟。
- 例：攻擊時減力（メディスン）→ 力量<=0 → 立刻破壞+encore → 才進 Trigger。
- 例：counter step 防守方用反擊 event 把我方角色打進控室 → **傷害結算前**立刻破壞+encore。

### J 拍板的實作方向（取代「每步都檢查」）
- **不要**在攻擊鏈每步都插檢查（浪費，多數時候無減力效果）。
- **改為綁在「破壞源」上**：每個減力/破壞效果尾端**明確呼叫一次** checkZeroPowerDestroy(s)。
- 因此要：
  1. **移除** gameReducer wrapper 那個「每個 action 後都跑 checkZeroPowerDestroy」的全域檢查（現在 gameReducer→gameReducerInner 的包裝）。
  2. メディスン 等減力效果尾端改為**明確呼叫** checkZeroPowerDestroy。
  3. 未來新增減力/破壞卡的開發守則：**寫完減力/破壞，記得 call 一次 checkZeroPowerDestroy**。
- 留意：checkZeroPowerDestroy 開頭有 `if(s.pending) return`，若減力效果本身設了 pending 會被擋；減力通常同步，個案處理。

### A. 假倒置不可觸發任何「倒置時」效果（重要）
- 力量歸零的「破壞」**實際規則是直接落控室，不是倒置**。為複用 encore UI 保留 reverse 外觀 OK，
  但這個假倒置**絕不能觸發任何倒置相關效果**：
  - 我方「使對方倒置」的 CX 連動（CXC_DOOR_REVERSE_RECOVER 紅蓮回收、BLUE3_PACKAGE 藍閘再攻）
  - てゐ「戰鬥對手被倒置時」（BATTLE_OPP_REVERSE_MOVE）
  - 其他「被倒置時發動」的卡
- 實作提示：這些觸發目前綁在 attackBattleStep 的 defenderReversed/recordTewi。力量歸零設的 reverse
  要與「戰鬥造成的 reverse」區分（已有 zeroDestroying 標記可用），確保不進這些觸發路徑。

### B. 戰鬥是否發生 + counter 對象判定
- **攻擊方或防守方角色有「變動」（位置/存在改變，含 encore 復活後算「不同角色」）→ 戰鬥不發生。**
- 宣言正面攻擊 → 防守方**一定有反擊階段**（counter step 必到）。
- 戰鬥沒發生時（風CX BLUE3_LOOK3_BURN／防守方角色變動等）：
  - counter 若**指定「被正面攻擊的角色」或「正在戰鬥的角色」**為對象 → 找不到對象、**無法發動**。
  - counter **沒指定對象**（有其他可生效對象）→ **可以發動**。
- 實作提示：破壞/encore 發生時設一個「角色變動」旗標（如 ctx.battleVoided 或 attacker/defender 上的旗標），
  attackBattleStep 看到就跳過戰鬥傷害判定。counter step 的對象解析要依「是否指定戰鬥/正面攻擊對象」分流。
  **這段精細規則照 J 上傳的 WS 規則原文實作，勿猜。**

## 互動 pending 模式速查
- TEWI_SELECT（戰場高亮選夥伴→確認）、ENCORE_SELECT（戰場高亮reverse→點選）、
  ZERO_ENCORE_SELECT（力量歸零破壞→高亮→點選，含 zeroSrc 分流回 SELF_ENCORE_ASK/ENCORE_CONFIRM）、
  SELF_ENCORE_ASK（方式一棄牌/方式二付3錢/不發動/取消重選）、ENCORE_CONFIRM（一般角色先確認）。
- modal gate 在 state.sandbox 時用 pending.pIdx（非 myIdx）讓 P1 也能彈窗。
- TEWI_SELECT / ZERO_ENCORE_SELECT 走戰場高亮（已從 modal gate 排除）。

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

---

## 卡片難度分級（J 用來決定做哪批）
L0純香草4、L1純被動2、L2簡單加力29、L3已有框架22、L4單一新動作45、L4?17、L5最難35、Event6、CX52。
- **L2 第一批建議**：マミゾウ P02、妖夢 P10、咲夜 T15、レミリア P07、アリス T09、
  早苗 036、ミスティア 021、椛 044、セプテット 065、パチュリー 080。動手前先把 fx 設計用文字給 J 過目。

## 其他已知待辦
- T16 伊吹萃香「同名可放任意張數」=改組牌規則，需改 deck-builder 驗證，單獨處理。
- CX 整批（52張）尚未導入；にとり 要 choice-CX 才能完整測。
- 連線網路層沒實機測過，只驗了握手邏輯與組局。
- test_refresh 的 1叉（deckout）待查。
