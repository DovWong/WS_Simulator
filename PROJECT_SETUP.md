# WS 模擬器 — Project 設定指引（給 J）

## 為什麼用 Project + Code
- 主檔 1.1 萬行、長期迭代、有測試框架，正是 Project 的理想場景。
- 檔案常駐 Project，不必每次重新上傳、重建 harness。
- 對話共享 context（HANDOFF 放進 Project knowledge 常駐參考）。

## 開 Project 的步驟

### 1. 建立 Project
在 Claude 左側選單「Projects」→ 新增 Project，命名如「WS 模擬器」。

### 2. 上傳到 Project knowledge（常駐參考，每次對話自動帶上）
- `HANDOFF.md` ← 必放，這是交接大腦
- `yuyutei_cards.csv` ← 必放，卡片原文資料
- **WS 規則原文** ← 你提到要上傳的，強烈建議放。特別是這幾段官方原文：
  - 攻擊步驟順序（宣言→攻擊時效果→trigger→counter→傷害→戰鬥→encore）
  - 「角色變動導致戰鬥不發生」的規則
  - counter（反擊）的對象判定（指定「被正面攻擊/正在戰鬥的角色」vs 不指定對象）
  - 力量 0 以下作為規則處理被破壞的時點
  有原文我才能照著實作，不用猜，精細互動才不會出錯。

### 3. 每次對話開始時上傳（工作檔，會被改動的）
- `ws-sim-offline.html`（主檔）
- 全部 `test_*.js` + `fuzz.js` + `harness.js`
- 或直接上傳下面那個 `ws_handoff.zip`，我解壓就有全部

> 註：Project knowledge 適合放「不常變的參考」（HANDOFF/CSV/規則）；
> 會被我改動的程式碼和測試檔，每次對話當附件上傳最乾淨（避免 knowledge 裡有舊版）。

### 4. Project Custom Instructions 建議填入
把以下貼進 Project 的 custom instructions：

---
這是 Weiß Schwarz 卡牌對戰模擬器專案。主檔 ws-sim-offline.html 用編譯後的 React.createElement 風格（不是 JSX）。
先讀 HANDOFF.md 了解全部 context。

合作方式：
- 用繁體中文回覆，簡潔。
- 我（J）非工程師，是產品負責人/測試者。先把需求講清楚再動手，不要擅自假設、不要一次做太多。
- 我測試完才做下一步，不要搶先。
- 改任何卡片效果/翻譯前，先對 yuyutei_cards.csv 的日文原文校。
- 精細規則照我上傳的 WS 規則原文實作，不要猜。

每次改完主檔，必須：重建 harness → 跑全部 test_*.js + fuzz.js → 對全綠基準 → 才交付。
無法實機測連線和瀏覽器 UI，視覺類改動要老實說明只驗了邏輯，要我實機測。
---

## 進 Project 後的第一件事
HANDOFF 的「★★ 待辦：攻擊時序重構」就是下一步。設計你已經拍板：
1. 移除 gameReducer wrapper 的全域 checkZeroPowerDestroy
2. 減力/破壞效果（メディスン 等）尾端改為明確呼叫 checkZeroPowerDestroy
3. 破壞時設「角色變動」旗標 → battle step 跳過戰鬥
4. 假倒置不觸發倒置效果（A 規則）
5. counter 對象判定（B 規則）— 照規則原文

進 Project 後我會先把這個設計用文字覆述給你確認，再動手。
