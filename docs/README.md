# 花卉電商網站（backend-project）

花卉電商全端應用，提供前台商品瀏覽、購物車、訂單管理，以及後台商品與訂單管理功能。支援訪客購物車（X-Session-Id）與會員登入（JWT）雙模式。

## 技術棧

| 分類 | 技術 | 版本 |
|------|------|------|
| 執行環境 | Node.js | — |
| Web 框架 | Express | ~4.16.1 |
| 資料庫 | SQLite（better-sqlite3） | ^12.8.0 |
| 模板引擎 | EJS | ^5.0.1 |
| CSS 框架 | Tailwind CSS | ^4.2.2 |
| 認證 | JSON Web Token（jsonwebtoken） | ^9.0.2 |
| 密碼雜湊 | bcrypt | ^6.0.0 |
| ID 生成 | uuid（v4） | ^11.1.0 |
| CORS | cors | ^2.8.5 |
| 環境變數 | dotenv | ^16.4.7 |
| API 文件 | swagger-jsdoc | ^6.2.8 |
| 測試框架 | Vitest | ^2.1.9 |
| HTTP 測試 | supertest | ^7.2.2 |

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 設定環境變數
cp .env.example .env
# 編輯 .env，至少設定 JWT_SECRET

# 3. 啟動伺服器（含 CSS 編譯）
npm run start
# 伺服器預設在 http://localhost:3001

# 4. 開發模式（分別啟動）
npm run dev:server   # 啟動 Express 伺服器
npm run dev:css      # Tailwind CSS watch 模式

# 5. 執行測試
npm run test           # unit + integration
npm run test:e2e       # 需先手動啟動伺服器（步驟 3）

# 6. 生成 OpenAPI 文件 / Postman Collection
npm run openapi
npm run postman
```

### 預設帳號

| 角色 | Email | 密碼 |
|------|-------|------|
| 管理員 | admin@hexschool.com | 12345678 |

管理員帳號在伺服器首次啟動時自動建立（可透過 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 環境變數自訂）。

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm run start` | 編譯 CSS + 啟動伺服器 |
| `npm run dev:server` | 僅啟動伺服器 |
| `npm run dev:css` | Tailwind CSS watch 模式 |
| `npm run css:build` | 編譯並壓縮 CSS |
| `npm run test` | 執行 unit + integration 測試 |
| `npm run test:unit` | 純函式單元測試 |
| `npm run test:integration` | API + DB 整合測試（記憶體 SQLite，不動 database.sqlite） |
| `npm run test:e2e` | Playwright E2E（需先手動啟動伺服器） |
| `npm run openapi` | 生成 openapi.json |
| `npm run postman` | 生成 Postman Collection |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架構、目錄結構、資料流 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、計畫歸檔流程 |
| [FEATURES.md](./FEATURES.md) | 功能列表與完成狀態（含行為描述） |
| [TESTING.md](./TESTING.md) | 測試規範與指南（Unit / Integration / E2E 三層架構 + Postman Collection） |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌（目前版本：v1.4.0） |
| [DESIGN_GAP.md](./DESIGN_GAP.md) | 設計稿 vs 實作完整比對報告 |
| [PROJECT_JOURNEY.md](./PROJECT_JOURNEY.md) | 專案開發歷程知識庫（階段記錄 + 錯誤修正） |
| [design/](./design/) | 頁面截圖（11 張桌面 + 4 張手機） |
| [plans/](./plans/) | 開發計畫目錄 |
| [plans/archive/](./plans/archive/) | 已完成計畫歸檔 |
