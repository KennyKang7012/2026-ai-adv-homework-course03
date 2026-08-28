# 更新日誌

所有重大變更皆記錄於此文件。格式參考 [Keep a Changelog](https://keepachangelog.com/)。

## [1.4.0] - 2026-08-28

### 新增
- **完整測試流程**：新增 `npm run test:unit`（純函式單元測試）、`npm run test:integration`（API + DB 整合測試，記憶體 SQLite 隔離，不觸碰 `database.sqlite`）、`npm run test:e2e`（Playwright Test，對已啟動的伺服器測試）、`npm run postman`（從 `openapi.json` 產生 Postman Collection）
- **測試資料夾重整**：`tests/` 拆分為 `tests/unit/`、`tests/integration/`、`tests/e2e/`，並新增 `vitest.integration.config.js`、`playwright.config.js`
- **`src/database.js`**：`dbPath` 改讀 `DB_PATH` 環境變數，支援指向記憶體 SQLite 供整合測試使用
- **`tests/integration/orders.test.js`**：新增訂單/訂單品項 DB 直查驗證、運費與庫存正確性驗證、購物車清空驗證、STOCK_INSUFFICIENT 邊界情境（驗證失敗時不留下不完整訂單、不誤扣庫存）
- **E2E 測試**：`tests/e2e/checkout-payment.spec.js`（完整金流 Happy Path，含綠界模擬付款與成功截圖）、`tests/e2e/checkout-edge-cases.spec.js`（E1~E4 異常情境）
- **`generate-postman.js`**：讀取 `openapi.json` 轉出 Postman Collection v2.1，含 `baseUrl`/`token`/`sessionId` 變數、登入自動存 token、購物車 dualAuth 支援

### Changed
- **`npm run test` 語意變更**：現為 `test:unit && test:integration` 組合指令（不含 e2e），行為與過去單純 `vitest run` 不同

## [1.3.0] - 2026-08-28

### 新增
- **運費計算模組**：新增 `src/utils/shipping.js`，提供 `calculateShippingFee()` 與相關常數，計算宅配/超商取貨運費、滿額免運、偏遠地區與當日急件附加費
- **訂單新增運費欄位**：`orders` 表新增 `shipping_fee`、`shipping_method`、`is_remote_area`、`is_express` 四個欄位
- **`POST /api/orders` 新增必填欄位** `shippingMethod`（`home_delivery` / `cvs`）與選填欄位 `isRemoteArea`/`isExpress`；回應新增 `subtotal`、`shipping_fee`、`shipping_method`、`is_remote_area`、`is_express`
- **結帳頁面**：新增「配送方式」區塊（宅配到府／超商取貨單選、偏遠地區／當日急件勾選），運費與總計即時反映所選組合
- **新測試**：`tests/shipping.test.js`（10 案例），涵蓋宅配基本運費、超商取貨費、滿額免運門檻、偏遠地區/急件附加費及其組合情境

### Changed
- **`total_amount` 語意變更**：現為「商品小計 + 運費」，不再只是純商品小計，連帶影響綠界 ECPay 實際收款金額（自動生效，無需額外改動付款流程）
- **`GET /api/orders`**：回應加入 `shipping_fee`
- **購物車頁面**：免運提示文案與運費估算數字，由舊規則（滿 500 免運／運費 150）修正為新規則（滿 1,500 免運／運費 120）

---

## [1.2.1] - 2026-06-06

### Fixed
- **404 頁面**：補實作遺漏的設計稿專用 Nav（品牌「花漾生活」+ 「← 回到首頁」），原 v1.2.0 CHANGELOG 已記載完成但實際未加入 header 元素；現補齊 `views/pages/404.ejs` 頂部 header，與 `checkout.ejs` / `login.ejs` 同一模式
- **DESIGN_GAP.md**：修正 07 404 頁面 Footer 列錯誤標記（`noFooter: true` 使 404 頁實際無 Footer，符合設計稿，應為 ✅ 而非 ⚠️）
- **E2E 測試**：E4「404 頁面」全 4 項驗證現通過，整體 12/12 ✅

---

## [1.2.0] - 2026-06-06

### 新增
- **設計稿全面重製**：使用 `/frontend-design` Skill 搭配 Pencil MCP 建立 10 個前台頁面設計稿（`design.pen`）
- **前台頁面全面對齊設計稿**：首頁、商品詳情、購物車、結帳、登入、我的訂單、訂單詳情、404 完全對齊 Pencil 設計稿視覺
- **新增頁面**：帳戶設定（`/account`）、收件地址管理（`/address`）
- **商品詳情**：4 張縮圖列（可切換主圖）、「您可能也會喜歡」相關商品區塊（3 張）
- **新 API**：`GET /api/products/:id/related` — 隨機取 3 筆相關商品
- **訂單功能補齊**：商品小計行（分離顯示）、付款方式欄位（`payment_method`）、訂單列商品摘要文字（`items_summary`）
- **響應式設計**：手機版漢堡 Nav（☰）、各頁面雙欄 → 手機單欄堆疊（`page-two-col` / `page-main-col` / `page-side-col` CSS class）
- **我的訂單側欄**：用戶頭像（首字母）、姓名、Email、帳戶設定、收件地址連結
- **購物車 / 結帳**：折扣行（-NT$ 0）
- **E2E 自動化測試 Skill**：`.claude/skills/e2e-payment-test/SKILL.md`，12 項測試（正常流程 8 + 異常情境 4，含 E4 404 頁面）
- **設計文件**：`docs/design/`（11 張桌面截圖 + 4 張手機截圖 + README.md）
- **知識庫**：`docs/PROJECT_JOURNEY.md`（9 個開發階段 + 錯誤修正記錄）
- **缺口報告**：`docs/DESIGN_GAP.md`（設計稿 vs 實作完整比對，全部項目已完成）

### Changed
- **Nav（登入後）**：顯示用戶真實姓名加粉色 ▾
- **登入 / 404 頁面**：改用設計稿專用 Nav（品牌 + 回到首頁），移除標準 Header
- **結帳頁面**：改用設計稿專用 Nav（品牌 + 步驟列），移除標準 Header
- **結帳表單**：移除 `max-width:600px` 限制，填滿左欄
- `GET /api/orders`：回應加入 `items_summary`（商品摘要文字）
- `POST /api/orders/:id/check-payment`：付款成功時自動識別並儲存 `payment_method`
- `.env.example`：補齊 `PORT` 與 `NODE_ENV` 說明

### Fixed
- `product-detail.js`：分離商品載入與相關商品的錯誤處理，避免相關商品 API 失敗誤觸發 notFound 狀態
- DESIGN_GAP.md blockquote 換行格式

---

## [1.1.0] - 2026-05-24（綠界金流整合）

### Added
- 綠界 ECPay AIO 金流串接：結帳後導向綠界付款頁面完成真實付款流程
- 新增 `src/utils/ecpay.js` 工具模組：CheckMacValue 簽章產生/驗證、ECPay 專用 URL 編碼、QueryTradeInfo API 查詢
- 新增 `GET /ecpay/payment/:orderId` 頁面路由：產生自動送出的 ECPay 付款表單
- 新增 `POST /api/orders/:id/check-payment` API：透過 QueryTradeInfo API 主動查詢付款狀態（取代本地端無法接收的 Server Notify）
- 訂單新增 `merchant_trade_no` 欄位：對應綠界 MerchantTradeNo，由 order_no 去除連字號產生

### Changed
- 結帳頁面（checkout.js）：送出訂單後導向綠界付款頁面，不再直接跳轉訂單詳情
- 訂單詳情頁面（order-detail.ejs / order-detail.js）：原「付款成功/失敗」模擬按鈕改為「查詢付款狀態」與「前往付款」按鈕；從綠界導回時自動觸發付款狀態查詢

---

## [1.0.0] - 2026-04-12

### 新增
- 使用者註冊、登入、個人資料 API
- 商品列表與詳情 API（公開）
- 購物車 CRUD API（雙模式認證：JWT / X-Session-Id）
- 訂單建立、查詢、模擬付款 API
- 後台商品管理 API（CRUD）
- 後台訂單查詢 API（含狀態篩選）
- EJS 前台頁面（首頁、商品詳情、購物車、結帳、訂單）
- EJS 後台頁面（商品管理、訂單管理）
- SQLite 資料庫自動初始化與種子資料
- Vitest 測試套件（6 個測試檔案，循序執行）
- Swagger/OpenAPI 文件生成
- Tailwind CSS 樣式系統
- 專案文件結構建立
