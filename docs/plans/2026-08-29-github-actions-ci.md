# 新增 GitHub Actions CI（Unit + Integration Test）

## Context

專案已有 `npm run test:unit`（純函式單元測試，零依賴）與 `npm run test:integration`（API + DB 整合測試，記憶體 SQLite `:memory:` 隔離，不動真正的 `database.sqlite`）兩條指令，本地跑皆已驗證通過。本次要讓這兩項測試在程式碼推送/PR 時於 GitHub Actions 自動執行，作為合併前的把關機制。明確不需要 E2E（Playwright）測試，也不需要啟動任何前端/後端服務——因為 integration 測試本身透過 supertest 直接呼叫 Express app 物件（不啟動實際 HTTP server），完全不需要額外服務。

## 關鍵發現

- `.github/workflows/` 目錄原本不存在，從零建立。
- **`process.env.JWT_SECRET` 在 CI 中必須明確設定**：`src/middleware/authMiddleware.js`、`src/routes/authRoutes.js` 皆直接使用 `process.env.JWT_SECRET` 簽發/驗證 JWT，程式碼中沒有任何 fallback 預設值。本機測試能過是因為開發者本機有 `.env` 檔（已被 `.gitignore` 排除，不進版控）；GitHub Actions runner 上沒有這個檔案，`dotenv.config()` 找不到 `.env` 時會靜默略過（不報錯、也不設值），若不在 workflow 裡明確給值，`npm run test:integration` 會因為 JWT 簽章/驗證失敗而全面炸開。這只是測試用簽章金鑰，沒有正式環境安全疑慮，直接寫在 workflow YAML 裡即可，不需要 GitHub repo secret。
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` 在 `src/database.js` 的 `seedAdminUser()` 已有 fallback，CI 不設也沒問題，但為求清楚一併列出。
- `npm run test:unit` 完全零依賴，不需要任何環境變數。
- 本機 Node v22.20.0，`package.json` 無 `engines` 限制；`package-lock.json` 已是最新，CI 用 `npm ci` 可靠還原相依套件。

## 整體流程

```
push / pull_request（目標 main）
  └─ GitHub Actions 觸發 job: test（ubuntu-latest）
       ├─ checkout 原始碼
       ├─ setup-node（Node 22，npm cache）
       ├─ npm ci（依 package-lock.json 安裝）
       ├─ Run unit tests   → npm run test:unit
       └─ Run integration tests → npm run test:integration
            （env: NODE_ENV=test, JWT_SECRET=<CI 用固定字串>, ADMIN_EMAIL, ADMIN_PASSWORD）
```

## 實作步驟

### Step 1：建立 `.github/workflows/test.yml`

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    env:
      NODE_ENV: test
      JWT_SECRET: test-jwt-secret-for-ci
      ADMIN_EMAIL: admin@hexschool.com
      ADMIN_PASSWORD: "12345678"

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration
```

## 檔案變更總覽

| 檔案 | 動作 | 說明 |
|------|------|------|
| `.github/workflows/test.yml` | 新增 | CI workflow：push/PR 觸發，兩個明確步驟跑 unit + integration 測試 |
| `docs/plans/2026-08-29-github-actions-ci.md` | 新增→歸檔 | 本計畫文件，完成後移至 `docs/plans/archive/` |

## 驗證方式

1. 本地驗證 YAML 語法正確（`node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/test.yml','utf-8'))"`）。
2. 本地模擬乾淨環境（暫時移開 `.env`，只用 workflow 指定的環境變數）跑 `npm run test:unit && npm run test:integration`，確認全數通過——證實 JWT_SECRET 這個關鍵發現確實被正確處理，而不是本機 `.env` 掩蓋掉問題。
3. `npm ci` 驗證 `package-lock.json` 可乾淨還原相依套件。
4. **實際推送驗證**：commit 後推送分支、開 PR，用 `gh run list`/`gh run watch` 確認 GitHub Actions 真的觸發、兩個步驟都執行、最終狀態顯示通過。
