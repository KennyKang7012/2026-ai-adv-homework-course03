# 測試規範與指南

## 測試架構總覽

專案測試分為三層，各自有獨立的執行指令與 DB 隔離策略：

| 層級 | 指令 | 工具 | DB | 說明 |
|------|------|------|----|----|
| Unit | `npm run test:unit` | Vitest | 無（零依賴） | 純函式測試，如 `src/utils/shipping.js` |
| Integration | `npm run test:integration` | Vitest + Supertest | 記憶體 SQLite（`:memory:`），不觸碰 `database.sqlite` | API + DB 整合測試 |
| E2E | `npm run test:e2e` | Playwright Test | 真正的 `database.sqlite`（需先手動 `npm run start`） | 瀏覽器端對端流程 |

`npm run test` = `npm run test:unit && npm run test:integration`（**不含** e2e，因為 e2e 需要一台已啟動的伺服器，不適合當作預設組合指令的一部分）。

## 測試框架

| 工具 | 用途 |
|------|------|
| [Vitest](https://vitest.dev/) | 單元 / 整合測試執行器（相容 Jest API） |
| [supertest](https://github.com/ladjs/supertest) | HTTP 請求測試（直接對 Express app 發請求，不啟動伺服器） |
| [@playwright/test](https://playwright.dev/) | 端對端測試框架（`npm run test:e2e`，只裝 Chromium） |
| Playwright MCP + E2E Skill | 互動式端對端金流探索測試（`.claude/skills/e2e-payment-test/SKILL.md`，供 Claude Code 對話中即時操作瀏覽器使用，與 `npm run test:e2e` 的正式 Playwright Test 套件並存） |

## Integration Test — DB 隔離機制

`src/database.js` 的 `dbPath` 改讀環境變數：
```js
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
```
`npm run test:integration` 透過 `cross-env DB_PATH=:memory:` 在 process 層級設定，確保時機早於任何 `require`。Vitest 預設的 `isolate: true` 讓每個測試檔案各自有獨立的 module registry，因此每個檔案 `require('../app')` 時都會產生一個全新、獨立的記憶體 DB（`initializeDatabase()` 重新建表 + 種子資料），檔案跑完記憶體 DB 自動消失，**完全不會寫入或修改真正的 `database.sqlite`**。

驗證方式：
```bash
stat -f "%m %z" database.sqlite && md5 database.sqlite
npm run test:integration
stat -f "%m %z" database.sqlite && md5 database.sqlite   # 應與跑測試前完全相同
```

## E2E 自動化測試

### `npm run test:e2e`（正式 Playwright Test 套件）

- 設定檔：`playwright.config.js`（`testDir: tests/e2e`、`baseURL: http://localhost:3001`、只裝 chromium、**無 `webServer` 區塊**）
- **執行前必須手動啟動伺服器**：`npm run start`（走真正的 `database.sqlite`，會建立真實訂單、扣真實庫存）
- 各 spec 的 `beforeAll` 會先確認 `localhost:3001` 可連線，未啟動時快速失敗並提示「請先執行 `npm run start`」，而非卡到 timeout
- `tests/e2e/checkout-payment.spec.js`：完整金流 Happy Path（登入 → 加入購物車 → 結帳 → 綠界模擬付款 → 返回商店確認已付款），成功後截圖存至 `test-results/checkout-payment-success.png`
- `tests/e2e/checkout-edge-cases.spec.js`：E1（空車跳轉 `/cart`）、E2（未登入跳轉 `/login`）、E3（結帳表單空白錯誤提示）、E4（404 頁面）
- 失敗時可用 `npx playwright show-report` 檢視 trace/screenshot/video

### Playwright MCP + E2E Skill（互動式探索測試）

在 Claude Code 對話中輸入：`跑 E2E 測試` / `測試金流` / `run e2e`，Skill 位置：`.claude/skills/e2e-payment-test/SKILL.md`，涵蓋正常流程 8 項 + 異常情境 4 項（E1~E4），測試帳號同上。這是給 Claude Code 對話中即時操作瀏覽器探索用的，`tests/e2e/*.spec.js` 是可重複執行、CI 友善的正式版本，兩者流程互相對應。

## 執行指令

```bash
npm run test              # test:unit + test:integration
npm run test:unit         # 僅 tests/unit/**（純函式，零依賴）
npm run test:integration  # 僅 tests/integration/**（記憶體 DB）
npm run test:e2e          # tests/e2e/**（需先手動啟動伺服器）
npm run postman           # 重新產生 openapi.json 後轉出 postman_collection.json
```

## CI（GitHub Actions）

**設定檔**：`.github/workflows/test.yml`

- **觸發時機**：`push`（`main`）與 `pull_request`（目標 `main`）
- **執行內容**：兩個明確步驟——`Run unit tests`（`npm run test:unit`）、`Run integration tests`（`npm run test:integration`）
- **不含**：Playwright E2E 測試、任何伺服器啟動步驟（supertest 直接呼叫 Express app 物件，不需要真實 HTTP server）
- **環境變數**：job 層級明確設定 `NODE_ENV=test`、`JWT_SECRET`（固定測試用字串）、`ADMIN_EMAIL`、`ADMIN_PASSWORD`。**關鍵原因**：`src/middleware/authMiddleware.js`、`src/routes/authRoutes.js` 對 `process.env.JWT_SECRET` 沒有任何 fallback 預設值；本機測試能過是因為開發者本機有不進版控的 `.env` 檔，CI runner 上沒有這個檔案，若不在 workflow 裡明確給值，`npm run test:integration` 會因為 JWT 簽章/驗證失敗而全面失敗
- **驗證**：`gh pr checks <PR 編號>` 或 `gh run list` / `gh run watch` 查看實際執行結果

## Postman Collection

`npm run postman` = `npm run openapi && node generate-postman.js`：先重新產生 `openapi.json`，再由 `generate-postman.js`（repo 根目錄，純腳本、無框架依賴）讀取並轉出 `postman_collection.json`（Postman Collection v2.1）。

- Collection 變數：`baseUrl`（預設 `http://localhost:3001`）、`token`（預設空字串）、`sessionId`（預設空字串）
- 依 OpenAPI `tags[0]` 分資料夾（Auth / Products / Cart / Orders / Admin Products / Admin Orders）
- 有 `security:[{bearerAuth:[]}]` 的端點自動設定 Bearer auth（值 `{{token}}`）；無 `security` 的端點顯式設為 `noauth`
- 購物車這種 dualAuth（Bearer 或 `X-Session-Id` 皆可）端點，額外附加一段 prerequest script：`token` 為空時移除 Authorization header，讓訪客模式（`X-Session-Id`）預設可用
- `POST /api/auth/login`、`POST /api/auth/register` 附加 test script，自動從回應的 `data.token` 存入 `token` collection 變數，之後的請求即可直接使用

驗證：
```bash
npm run postman
node -e "JSON.parse(require('fs').readFileSync('postman_collection.json')); console.log('valid JSON')"
```

## 測試設定

**Unit — `vitest.config.js`**：
```javascript
export default defineConfig({
  test: { globals: true, include: ['tests/unit/**/*.test.js'] },
});
```

**Integration — `vitest.integration.config.js`**：
```javascript
export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false, // 保留作為安全邊界，非正確性之必要條件（見下方說明）
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

> **兩份設定皆需明確設定 `include`**，否則 Vitest 預設 glob 會連 `tests/e2e/*.spec.js`（Playwright 檔案）都一併撈進來執行並炸掉（`@playwright/test` 的 `test`/`expect` 不是 Vitest 全域變數）。

## 測試檔案表

| 檔案 | 測試範圍 | 依賴 |
|------|----------|------|
| `tests/setup.js` | 輔助函式（非測試檔案） | — |
| `tests/unit/shipping.test.js` | 運費計算（`calculateShippingFee`）純函式單元測試 | 無 |
| `tests/integration/auth.test.js` | 註冊、登入、重複 email、個人資料 | 無（首先執行，建立種子資料） |
| `tests/integration/products.test.js` | 商品列表、分頁、詳情、404 | 依賴種子商品存在 |
| `tests/integration/cart.test.js` | 加入購物車、查看、更新數量、刪除、訪客 vs 登入 | 依賴商品存在 + 使用者認證 |
| `tests/integration/orders.test.js` | 建立訂單、DB 直查驗證（訂單/品項寫入、運費計算、庫存扣除、購物車清空）、空購物車、庫存不足、認證要求、訂單列表、詳情 | 依賴購物車有品項 |
| `tests/integration/adminProducts.test.js` | 後台商品列表、新增、更新、刪除、權限檢查 | 依賴 admin 帳號 |
| `tests/integration/adminOrders.test.js` | 後台訂單列表、詳情、狀態篩選 | 依賴訂單存在 + admin 帳號 |
| `tests/e2e/checkout-payment.spec.js` | 完整金流 Happy Path（含綠界模擬付款） | 需已啟動的伺服器 |
| `tests/e2e/checkout-edge-cases.spec.js` | E1~E4 異常情境 | 需已啟動的伺服器 |

## 執行順序與依賴關係（Integration）

```
auth.test.js          ← 第 1 順位：建立使用者，驗證認證機制
    ↓
products.test.js      ← 第 2 順位：驗證種子商品（依賴 DB 初始化）
    ↓
cart.test.js          ← 第 3 順位：需要商品 + 認證 token
    ↓
orders.test.js        ← 第 4 順位：需要購物車有品項
    ↓
adminProducts.test.js ← 第 5 順位：需要 admin token
    ↓
adminOrders.test.js   ← 第 6 順位：需要訂單存在 + admin token
```

**為何要循序執行**：每個測試檔案內部的 `it()` 之間仍有共用狀態（例如同一檔案內先建立使用者、再用該使用者建立訂單）。`fileParallelism: false` 是保守起見保留的安全邊界；由於 `:memory:` DB 本來就是每個檔案各自獨立（見上方「DB 隔離機制」），跨檔案的資料競爭在技術上並不存在，但保留循序執行可避免多個檔案同時進行大量同步 native 呼叫造成的 CPU 競爭。

## 輔助函式說明

**檔案**：`tests/setup.js`

### `getAdminToken()`

```javascript
async function getAdminToken()
```

- **用途**：以種子管理員帳號（`admin@hexschool.com` / `12345678`）登入，回傳 JWT token
- **回傳**：`string`（JWT token）
- **使用場景**：所有需要 admin 權限的測試

### `registerUser(overrides?)`

```javascript
async function registerUser(overrides = {})
```

- **用途**：註冊新測試使用者並回傳認證資訊
- **參數**：
  - `overrides.email`：自訂 email（預設：`test-{timestamp}-{random}@example.com`）
  - `overrides.password`：自訂密碼（預設：`password123`）
  - `overrides.name`：自訂名稱（預設：`測試使用者`）
- **回傳**：`{ token: string, user: { id, email, name, role } }`
- **使用場景**：需要一般使用者 token 的測試

### 共用匯出

```javascript
module.exports = { app, request, getAdminToken, registerUser };
```

- `app`：Express 應用實例（從 `../app` 引入）
- `request`：supertest 函式（已綁定 app）

## 撰寫新測試的步驟

### 1. 建立測試檔案

依測試性質放入對應資料夾：
- 純函式、零 DB/app 依賴 → `tests/unit/yourFeature.test.js`
- 需要 DB/app（HTTP + DB） → `tests/integration/yourFeature.test.js`

```javascript
const { app, request, getAdminToken, registerUser } = require('../setup');

describe('Your Feature', () => {
  let token;
  let adminToken;

  beforeAll(async () => {
    const { token: userToken } = await registerUser();
    token = userToken;
    adminToken = await getAdminToken();
  });

  describe('GET /api/your-endpoint', () => {
    it('should return data successfully', async () => {
      const res = await request(app)
        .get('/api/your-endpoint')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.error).toBeNull();
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/your-endpoint');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });
  });
});
```

### 2. 註冊測試執行順序（僅 Integration 需要）

在 `vitest.integration.config.js` 的 `sequence.files` 陣列中加入新檔案路徑，確保放在其依賴的測試之後：

```javascript
sequence: {
  files: [
    'tests/integration/auth.test.js',
    'tests/integration/products.test.js',
    'tests/integration/cart.test.js',
    'tests/integration/orders.test.js',
    'tests/integration/adminProducts.test.js',
    'tests/integration/adminOrders.test.js',
    'tests/integration/yourFeature.test.js',  // ← 新增
  ],
},
```

`tests/unit/**` 無跨檔案依賴，不需要維護順序。

### 3. 測試模式

```javascript
// 測試成功案例
it('should create resource', async () => {
  const res = await request(app)
    .post('/api/resource')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'test', value: 123 });

  expect(res.status).toBe(201);
  expect(res.body.data.name).toBe('test');
});

// 測試驗證錯誤
it('should return 400 for missing fields', async () => {
  const res = await request(app)
    .post('/api/resource')
    .set('Authorization', `Bearer ${token}`)
    .send({});

  expect(res.status).toBe(400);
  expect(res.body.error).toBe('VALIDATION_ERROR');
});

// 測試權限
it('should return 403 for non-admin', async () => {
  const res = await request(app)
    .get('/api/admin/resource')
    .set('Authorization', `Bearer ${token}`);  // 一般使用者

  expect(res.status).toBe(403);
  expect(res.body.error).toBe('FORBIDDEN');
});

// 測試訪客模式（X-Session-Id）
it('should work with session ID', async () => {
  const sessionId = 'test-session-' + Date.now();
  const res = await request(app)
    .get('/api/cart')
    .set('X-Session-Id', sessionId);

  expect(res.status).toBe(200);
});

// 白箱測試：直接查 DB 驗證（integration 測試可直接 require db 單例）
it('should persist to database', () => {
  const db = require('../../src/database');
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  expect(row).toBeTruthy();
});
```

## 常見陷阱

### 1. 測試順序依賴（僅 Integration）

同一測試檔案內部的 `it()` 之間有隱式資料依賴（例如先建立使用者、再用該使用者下單）。若調整 `vitest.integration.config.js` 的 `sequence.files` 順序，需確認每個檔案自身仍是自給自足的（現有 6 個整合測試檔案皆已確認為自給自足：各自 `registerUser()`/`getAdminToken()` + 建立自己的購物車，無跨檔案依賴）。

### 2. Integration 測試與真正的 database.sqlite 完全隔離

`npm run test:integration` 透過 `DB_PATH=:memory:` 確保每次執行都是全新的記憶體 DB，**絕不會**寫入或修改 `database.sqlite`。E2E 測試（`npm run test:e2e`）則相反——會走真正的 `database.sqlite`，建立真實訂單、扣真實庫存，執行前請留意。

### 3. bcrypt 速度

測試環境下 `NODE_ENV=test` 會將 bcrypt salt rounds 降至 1，加速密碼雜湊。若未設定 `NODE_ENV=test`，每次註冊/登入會使用 10 rounds，顯著拖慢測試速度。

> **注意**：seed admin 的 bcrypt rounds 取決於 `database.js` 首次執行時的 `NODE_ENV`。但 `authRoutes.js` 中的 `register` 端點固定使用 `bcrypt.hashSync(password, 10)`（寫死 10 rounds），不受 NODE_ENV 影響。

### 4. hookTimeout 設定

`hookTimeout: 10000`（10 秒，僅 Integration 設定檔）。若 `beforeAll` 中需要多次 HTTP 請求（如註冊 + 登入 + 加入購物車），應注意是否超時。

### 5. 無 afterAll 清理（Integration 不需要，E2E 需留意）

Integration 測試每個檔案都是全新記憶體 DB，跑完自動消失，無需清理。E2E 測試走真正的 `database.sqlite`，測試資料（訂單、購物車、扣掉的庫存）會持續累積，若商品庫存被測試耗盡（例如反覆執行 `checkout-payment.spec.js`），可透過 `PUT /api/admin/products/:id` 手動補庫存。

### 6. supertest 直接使用 app（Integration）

測試透過 `request(app)` 直接對 Express 實例發送請求，不會啟動實際 HTTP 伺服器。這意味著：
- 不需要管理埠號衝突
- 不會觸發 `server.js` 中的 `app.listen()`
- `database.js` 在 `require('../app')` 時即初始化（建表 + 種子資料），且 `dbPath` 讀取當下的 `process.env.DB_PATH`
