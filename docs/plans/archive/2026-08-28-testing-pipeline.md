# 完整測試流程建置（Integration Test / E2E Test / Postman Collection）

## Context

專案目前只有一套測試（`tests/*.test.js`，透過 `npm run test` 執行），且這套測試會直接讀寫**真正的** `database.sqlite`（`docs/TESTING.md` 本身已記載此為已知缺陷）。本次要建立一套完整、正式的測試流程：

1. **Integration Test**（Vitest + Supertest）：獨立測試 DB（不得碰觸 `database.sqlite`），涵蓋登入/建立會員→取得商品→加入購物車→建立含配送方式的訂單，並驗證回應格式、DB 寫入、運費/總額正確性、庫存扣除、購物車清空、失敗情境不留下不完整訂單/不誤扣庫存。
2. **E2E Test**（Playwright，對已啟動的 `localhost:3001`）：完整金流流程（登入→加入購物車→結帳→綠界模擬付款→返回商店確認已付款），需要付款成功截圖。
3. **Postman Collection**：從 `npm run openapi` 產生的 `openapi.json` 轉換，含 `baseUrl`/`token`/`sessionId` 變數、登入自動存 token、需登入 API 自動帶 Bearer。
4. **統一指令**：`test:unit`、`test:integration`、`test:e2e`、`postman` 皆須可正常執行。

已透過兩輪 Explore + 一輪 Plan agent 深入研究現有程式碼（`src/database.js`、`tests/*`、`.claude/skills/e2e-payment-test/SKILL.md`、`openapi.json`/`generate-openapi.js`），並直接讀取 `login.ejs`/`index.ejs`/`product-detail.ejs`/`order-detail.ejs`/`orders.ejs`/`header.ejs` 逐一核對 E2E 腳本會用到的文字/選擇器，確認以下計畫內容與實際程式碼一致。本次工作於獨立分支進行。

## 關鍵設計決策

1. **DB 隔離機制**：`src/database.js` 的 `dbPath` 改讀環境變數（`process.env.DB_PATH || 原本的硬編路徑`），其餘（`initializeDatabase()`、migrations、seed）不變——這些邏輯本來就對全新/空的 DB 是安全冪等的。Integration Test 執行時，透過 npm script 在 process 層級設定 `DB_PATH=:memory:`（用 `cross-env` 確保跨平台），確保時機一定早於任何 `require`。
2. **Vitest 預設的 `isolate: true`** 讓每個測試檔案各自有獨立的 module registry，`require('../app')` 會重新執行、對 `:memory:` 會產生各自獨立全新的記憶體 DB（`initializeDatabase()` 重新建表+種子）。現有 6 個「整合風格」測試檔案逐一確認過，**彼此並無跨檔案資料依賴**（每個檔案都自己 `registerUser()`/`getAdminToken()`+建立自己的購物車），因此「每個檔案各自隔離」的粒度已足夠滿足「每次測試皆可建立並清除自己的測試資料」的要求，不需額外的 reset/cleanup 程式碼。
3. **測試資料夾重整**：`tests/setup.js` 位置不變；`tests/shipping.test.js`（唯一零 DB 依賴的純函式測試）移至 `tests/unit/`；其餘 6 個檔案（`auth`/`products`/`cart`/`orders`/`adminProducts`/`adminOrders`）移至 `tests/integration/`（僅需調整 `require('./setup')` → `require('../setup')`）；新增 `tests/e2e/`。
4. **兩份 Vitest 設定**：`vitest.config.js`（既有檔案）改為只跑 `tests/unit/**`；新增 `vitest.integration.config.js` 只跑 `tests/integration/**`（保留 `fileParallelism:false` + `sequence.files`，因為現有測試不需要但保留作為安全邊界，不影響正確性）。**兩者皆需明確設定 `include`**，否則 Vitest 預設 glob 會連 `tests/e2e/*.spec.js`（Playwright 檔案）都一併撈進來執行並炸掉。
5. **`npm run test` 語意變更**：改為 `test:unit && test:integration` 的組合指令（不含 e2e，因為 e2e 需要一台已啟動的伺服器，不適合當作預設 CI 指令的一部分）。這是刻意的行為改動，需同步更新 `docs/TESTING.md` 與 `CLAUDE.md` 的「常用指令」說明。
6. **Postman 產生器手刻，不用第三方套件**：`openapi.json` 結構單純（無 `$ref`），且需要「登入自動存 token」這種客製商業邏輯，官方 `openapi-to-postmanv2` 套件仍需大量後製，不如直接手刻 `generate-postman.js`（讀 `openapi.json` → 走訪 `paths` → 組出 Postman v2.1 collection），可完全掌控 auth 綁定與 test script 注入，且不增加額外依賴。
7. **Playwright E2E 不自動啟動伺服器**（`playwright.config.js` 無 `webServer` 區塊），比照使用者指示「請直接使用已啟動的專案」；每個 spec 檔案的 `beforeAll` 會先 ping `localhost:3001`，未啟動時給出清楚的中文錯誤訊息（比照現有 `.claude/skills/e2e-payment-test/SKILL.md` 本身的前置檢查慣例），而不是讓它卡到 timeout 才失敗。
8. **文件同步（必要但精簡）**：`docs/TESTING.md`、`CLAUDE.md` 的「常用指令」需要更新以反映新架構，避免文件與實際指令產生落差。

## 整體流程

```
npm run test:unit
  └─ vitest run --config vitest.config.js（僅 tests/unit/**，零 DB 依賴）

npm run test:integration
  └─ cross-env DB_PATH=:memory: vitest run --config vitest.integration.config.js
       └─ 每個測試檔案各自獨立的 module registry
            └─ require('../app') → require('../../src/database')
                 └─ new Database(':memory:')（全新、僅存在於該檔案的記憶體 DB）
                      └─ initializeDatabase()：建表 + migrations + seed（admin + 8 商品）
                 └─ 該檔案內所有 it() 共用這個記憶體 DB（describe/beforeAll 建立自己的 user/cart/order）
            └─ 檔案執行完畢 → 記憶體 DB 隨模組卸載自動消失，不留痕跡、不碰 database.sqlite

npm run test:e2e
  └─ playwright test（需先手動 npm run start，對真正的 database.sqlite 操作）
       └─ tests/e2e/checkout-payment.spec.js：登入 → 加入購物車 → 結帳 → 綠界模擬付款 → 返回商店確認已付款 → 截圖
       └─ tests/e2e/checkout-edge-cases.spec.js：E1~E4 異常情境

npm run postman
  └─ npm run openapi（重新產生 openapi.json）
  └─ node generate-postman.js（讀 openapi.json → 輸出 postman_collection.json）
```

## 實作步驟

### Step 1：DB 隔離
`src/database.js` 的 `const dbPath = path.join(__dirname, '..', 'database.sqlite');` 改為：
```js
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
```

### Step 2：測試資料夾重整
```bash
git mv tests/shipping.test.js       tests/unit/shipping.test.js
git mv tests/auth.test.js           tests/integration/auth.test.js
git mv tests/products.test.js       tests/integration/products.test.js
git mv tests/cart.test.js           tests/integration/cart.test.js
git mv tests/orders.test.js         tests/integration/orders.test.js
git mv tests/adminProducts.test.js  tests/integration/adminProducts.test.js
git mv tests/adminOrders.test.js    tests/integration/adminOrders.test.js
```
調整 require 路徑：`tests/unit/shipping.test.js` 的 `require('../src/utils/shipping')` → `require('../../src/utils/shipping')`；其餘 6 個檔案的 `require('./setup')` → `require('../setup')`。

### Step 3：新增/擴充 Integration Test 內容
`tests/integration/orders.test.js` 額外 `require('../../src/database')`（拿到 db 單例）與 `require('../../src/utils/shipping').calculateShippingFee`；`beforeAll` 記錄下單前商品的 `price`/`stock`；新增以下驗證（緊接在既有「should create an order from cart」測試之後）：
- 直查 `orders`/`order_items` 資料表，驗證欄位正確寫入
- 用 `calculateShippingFee()` 計算預期運費，與資料庫中的 `shipping_fee`/`total_amount` 比對
- 驗證商品 `stock` 剛好減少下單數量
- 呼叫 `GET /api/cart` 驗證下單後購物車為空陣列

檔案結尾新增 `describe('Order creation — insufficient stock edge case', ...)`：先讓使用者在庫存充足時把商品加入購物車，再用 admin API 把該商品庫存改為 0（因為 `POST /api/cart` 本身就會擋下「加入時數量超過庫存」，無法直接製造超量購物車項目），驗證：
- 建立訂單回傳 400 `STOCK_INSUFFICIENT`
- `orders` 資料表筆數不變（沒有留下不完整訂單）
- 商品庫存不變（沒有誤扣庫存）

### Step 4：Vitest 設定
`vitest.config.js`：
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, include: ['tests/unit/**/*.test.js'] },
});
```
新增 `vitest.integration.config.js`：
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    include: ['tests/integration/**/*.test.js'],
    sequence: {
      files: [
        'tests/integration/auth.test.js',
        'tests/integration/products.test.js',
        'tests/integration/cart.test.js',
        'tests/integration/orders.test.js',
        'tests/integration/adminProducts.test.js',
        'tests/integration/adminOrders.test.js',
      ],
    },
    hookTimeout: 10000,
  },
});
```

### Step 5：Playwright E2E
新增 `playwright.config.js`（`testDir:'./tests/e2e'`、`baseURL:'http://localhost:3001'`、無 `webServer`、`projects:[chromium]`）。

新增 `tests/e2e/checkout-payment.spec.js`：登入 admin → 首頁點商品卡片進商品詳情頁 →「加入購物車」→ `/cart` →「前往結帳」→ 填寫 `kenn123`/`kenny123@123.com`/`taiwan` →「確認送出訂單」→ 攔截 `POST /api/orders` 回應取得 `order_no` → 等待導向 ECPay staging → 選「WebATM（網路ATM）」→ 選「台灣土地銀行」→「前往付款」→ 關閉頁內提示 modal → 等待導向 `pay-stage.ecpay.com.tw/MockMPPost/LandWebAtm` → 點 `Save` → 等待導向 ECPay 付款成功頁 →「返回商店」→ 確認顯示「付款成功！感謝您的購買。」與「已付款」→ 截圖存至 `test-results/checkout-payment-success.png` → `/orders` 列表確認顯示已付款。

新增 `tests/e2e/checkout-edge-cases.spec.js`：E1（空車進 `/checkout` 跳轉 `/cart`）、E2（未登入存取 `/orders` 跳轉 `/login?redirect=%2Forders`）、E3（結帳表單空白送出顯示三欄錯誤）、E4（404 頁面內容與返回首頁）——皆使用全新註冊帳號，避免與 happy-path spec 共用 admin 購物車互相干擾。

### Step 6：Postman Collection 產生器
新增 `generate-postman.js`：讀 `openapi.json`，依 `tags[0]` 分資料夾組出 item；path 參數轉換、requestBody 產生範例值；`security` 有 `bearerAuth` 設 Bearer auth（值 `{{token}}`），無 `security` 顯式設 `noauth`；dualAuth（Cart）端點加 prerequest script（`token` 為空時移除 Authorization header，讓 `X-Session-Id` 訪客模式預設可用）；`POST /api/auth/login`/`register` 加 test script 自動存 token；collection 變數 `baseUrl`/`token`/`sessionId`；輸出 `postman_collection.json`。

### Step 7：npm scripts / 依賴
```json
"scripts": {
  "openapi": "node generate-openapi.js",
  "postman": "npm run openapi && node generate-postman.js",
  "test": "npm run test:unit && npm run test:integration",
  "test:unit": "vitest run --config vitest.config.js",
  "test:integration": "cross-env DB_PATH=:memory: vitest run --config vitest.integration.config.js",
  "test:e2e": "playwright test"
}
```
新增 devDependencies：`@playwright/test`、`cross-env`。
```bash
npm install --save-dev @playwright/test cross-env
npx playwright install chromium
```
`.gitignore` 新增 `test-results/`、`playwright-report/`、`playwright/.cache/`。

### Step 8：文件同步
`docs/TESTING.md`：更新測試架構說明為 unit / integration / e2e 三層，說明 `npm run test` 新語意（不含 e2e）、DB 隔離機制、新增 Postman 章節。
`CLAUDE.md`：「常用指令」區塊補上 `test:unit`/`test:integration`/`test:e2e`/`postman`，修正 `npm run test` 註解。

## 檔案變更總覽

| 檔案 | 動作 | 說明 |
|------|------|------|
| `src/database.js` | 修改 | `dbPath` 改讀 `DB_PATH` 環境變數 |
| `tests/unit/shipping.test.js` | 移動 | 由 `tests/shipping.test.js` 移入 |
| `tests/integration/*.test.js`（6 個） | 移動＋部分擴充 | require 路徑調整；`orders.test.js` 新增 DB 直查與 STOCK_INSUFFICIENT 情境測試 |
| `vitest.config.js` | 修改 | 改為只跑 `tests/unit/**` |
| `vitest.integration.config.js` | 新增 | 只跑 `tests/integration/**`，隔離 DB |
| `playwright.config.js` | 新增 | E2E 設定，無自動啟動伺服器 |
| `tests/e2e/checkout-payment.spec.js` | 新增 | 金流 Happy Path |
| `tests/e2e/checkout-edge-cases.spec.js` | 新增 | E1~E4 異常情境 |
| `generate-postman.js` | 新增 | openapi.json → Postman Collection |
| `package.json` | 修改 | scripts 改寫 + 新增 devDependencies |
| `.gitignore` | 修改 | 新增 Playwright 輸出目錄 |
| `docs/TESTING.md` | 修改 | 更新測試架構說明 |
| `CLAUDE.md` | 修改 | 更新常用指令說明 |
| `docs/plans/2026-08-28-testing-pipeline.md` | 新增→歸檔 | 本計畫文件，完成後移至 `docs/plans/archive/` |

## 驗證方式

```bash
# 0. 安裝依賴
npm install --save-dev @playwright/test cross-env
npx playwright install chromium

# 1. 單元測試
npm run test:unit

# 2. 確認 database.sqlite 完全未被整合測試碰過
stat -f "%m %Sm" database.sqlite && md5 database.sqlite
npm run test:integration
stat -f "%m %Sm" database.sqlite && md5 database.sqlite   # 應與跑測試前完全相同

# 3. 全套（unit → integration）
npm run test

# 4. OpenAPI / Postman
npm run postman
node -e "JSON.parse(require('fs').readFileSync('postman_collection.json')); console.log('valid JSON')"

# 5. E2E（需先手動啟動伺服器）
npm run start &            # terminal A
npm run test:e2e           # terminal B
npx playwright show-report # 若失敗可看 trace/screenshot/video

# 6. 前置檢查是否生效（伺服器未啟動時應快速給出清楚錯誤，而非卡到 timeout）
```

## 風險與已知限制

1. **ECPay 頁面選擇器無法在規劃階段實際驗證**：Step 5-6（WebATM/台灣土地銀行/前往付款/關閉 modal/Save 按鈕）皆位於綠界官方 staging 網域，選擇器是照 `.claude/skills/e2e-payment-test/SKILL.md` 既有文件逐字移植，建議實作完成後先手動跑一次確認這幾個選擇器仍然有效。
2. **better-sqlite3 + `:memory:` + Vitest isolate 機制**：理論上每個測試檔案的模組重載會各自產生獨立的 `:memory:` DB，`fileParallelism:false` 其實不是正確性的必要條件（只是保守起見保留），若未來測試檔案一多、開始出現 flaky，已知的第一個排查方向是把 `pool` 改成 `'forks'`。
3. **STOCK_INSUFFICIENT 測試情境**：改用「加入後由 admin 端把庫存改 0」的等價路徑觸發驗證邏輯；且這段驗證發生在 `db.transaction()` 之前，因此測試證明的是「驗證失敗不留殘存資料」而非「transaction 中途 rollback」。
4. `npm run test` 語意改變（不再是單一 `vitest run`，而是 unit+integration 組合），且不含 e2e——已在文件中明確標註。
