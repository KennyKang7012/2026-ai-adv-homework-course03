# 運費計算（Shipping）功能

## Context

花卉電商專案目前的訂單建立流程（`POST /api/orders`）只計算商品小計（`Σ price × quantity`）作為 `total_amount`，完全沒有運費概念——結帳頁（`checkout.ejs`）與購物車頁（`cart.ejs`）上顯示的「運費 NT$150 / 滿 500 免運」都只是寫死在 EJS 樣板裡的裝飾文字，從未真正送到後端或算進實際收費金額，這是一個現有的資料落差（前端顯示與後端收費不一致）。

本次新增真實可用的運費計算邏輯：宅配基本運費／超商取貨費（皆有滿額免運）、偏遠地區與當日急件附加費，並讓這筆運費真正整合進訂單建立流程、影響最終 `total_amount`（進而影響綠界 ECPay 實際收款金額），同時補齊對應文件與單元測試。前端結帳頁同步新增「配送方式／偏遠地區／當日急件」的真實可操作 UI，`shippingMethod` 因此成為 `POST /api/orders` 的必填欄位。

## 業務規則

| 條件 | 金額 | 備註 |
|---|---|---|
| 宅配到府基本運費 | 120 元 | 商品小計 ≥ 1,500 元時免收 |
| 超商取貨 | 60 元 | 商品小計 ≥ 1,500 元時同樣免收（與宅配共用同一滿額免運門檻；「這不是基本運費」僅代表這 60 元本身是超商取貨自己的費率、與宅配 120 元是不同金額，並非說它不適用滿額免運規則） |
| 偏遠地區 | +200 元 | 疊加，不受滿額免運規則影響 |
| 當日急件 | +250 元 | 疊加，不受滿額免運規則影響 |

## 整體流程

```
使用者於 /checkout 選擇配送方式（宅配到府 / 超商取貨）
  └─ 選宅配到府時，可額外勾選「偏遠地區」「當日急件」
       │
       ▼
前端即時試算運費（複製 src/utils/shipping.js 同一套常數與規則）並顯示於訂單摘要
       │
       ▼
送出 POST /api/orders
  { recipientName, recipientEmail, recipientAddress,
    shippingMethod, isRemoteArea, isExpress }
       │
       ▼
後端：驗證收件人資訊 → 讀取購物車 → 檢查空車/庫存
       │
       ▼
計算 subtotal = Σ(price × quantity)
       │
       ▼
calculateShippingFee({ shippingMethod, subtotal, isRemoteArea, isExpress })
  └─ subtotal ≥ 1500 → baseFee = 0
  └─ 否則 → baseFee = 120（宅配）或 60（超商取貨）
  └─ surcharge = (+200 若偏遠) + (+250 若急件)
  └─ shippingFee = baseFee + surcharge
       │
       ▼
totalAmount = subtotal + shippingFee
       │
       ▼
🔒 db.transaction()：INSERT orders（含 shipping_fee / shipping_method /
   is_remote_area / is_express）→ INSERT order_items → 扣庫存 → 清空購物車
       │
       ▼
回傳 201，含 subtotal / shipping_fee / shipping_method / is_remote_area /
  is_express / total_amount
       │
       ▼
前端導向 /ecpay/payment/:orderId，綠界以 order.total_amount
  （已含運費）作為 TotalAmount 收款 —— 此段無需改動，自動正確
```

## 實作步驟

### Step 1：新增 `src/utils/shipping.js`
純函式運費計算模組，風格比照 `src/utils/ecpay.js`（無 class、無 JSDoc，檔尾單一 `module.exports`）。Export `SHIPPING_METHODS`、`HOME_DELIVERY_BASE_FEE`、`CVS_FEE`、`FREE_SHIPPING_THRESHOLD`、`REMOTE_AREA_SURCHARGE`、`EXPRESS_SURCHARGE`、`calculateShippingFee({ shippingMethod, subtotal, isRemoteArea, isExpress })`。`shippingMethod` 缺失或不合法時 throw `Error`，由呼叫端 try/catch 轉為 400 `VALIDATION_ERROR`（比照 `ecpay.js` 的 `queryTradeInfo` 拋錯慣例）。

### Step 2：`src/database.js` 新增 4 個 migration
沿用既有 `merchant_trade_no` / `payment_method` 的 `try { db.exec('ALTER TABLE orders ADD COLUMN ...') } catch (e) {}` 模式，新增：`shipping_fee INTEGER NOT NULL DEFAULT 0`、`shipping_method TEXT`、`is_remote_area INTEGER NOT NULL DEFAULT 0`、`is_express INTEGER NOT NULL DEFAULT 0`。

### Step 3：`src/routes/orderRoutes.js` 整合
- `require('../utils/shipping')`。
- `POST /`：destructure `shippingMethod, isRemoteArea, isExpress`；既有收件人/Email/購物車/庫存檢查不動；原本算 `totalAmount` 的區塊改名 `subtotal`；呼叫 `calculateShippingFee(...)`（try/catch → 400 `VALIDATION_ERROR`）；新 `totalAmount = subtotal + shippingFee`；`INSERT INTO orders` 加 4 欄；回應加 `subtotal`、`shipping_fee`、`shipping_method`、`is_remote_area`、`is_express`。
- `GET /`：SQL 加 `shipping_fee`。
- 所有相關 `@openapi` JSDoc 同步更新 request/response schema。

### Step 4：測試
- `tests/orders.test.js`：建單與空車測試酬載加 `shippingMethod: 'home_delivery'`；空車測試斷言收斂為 `expect(res.body.error).toBe('CART_EMPTY')`；建單測試新增對新欄位的斷言。
- `tests/adminOrders.test.js`：`beforeAll` 建單酬載加 `shippingMethod: 'home_delivery'`。
- 新增 `tests/shipping.test.js`：純函式單元測試，涵蓋宅配基本運費、超商取貨費、小計 1,499/1,500 情境、偏遠地區附加費、急件附加費、多附加費疊加、滿額免運與附加費同時成立（共 8 案例）+ 超商取貨滿額免運 + invalid method 拋錯（共 10 案例）。
- `vitest.config.js`：`sequence.files` 加入 `'tests/shipping.test.js'`。

### Step 5：前端
- `views/pages/checkout.ejs`：新增「配送方式」區塊（宅配到府／超商取貨單選；偏遠地區／當日急件勾選框，僅宅配時顯示）；訂單摘要運費/總計改綁即時計算值。
- `public/js/pages/checkout.js`：`form` 加 3 個欄位；新增 computed `shippingFee`/`orderTotal`（前端複製一份運費常數，比照 `cartTotal` 既有前端獨立計算慣例）。
- `views/pages/cart.ejs`：免運門檻文案與運費/總計的寫死數字，從舊規則（500/150）改為新規則（1500/120，以宅配為估算基準）。

### Step 6：文件
- `npm run openapi` 重新產生 `openapi.json`（JSDoc 改完後執行）。
- `docs/FEATURES.md`：新增「運費計算 Shipping」章節；更新訂單管理章節與功能總覽表。
- `docs/CHANGELOG.md`：新增 `[1.3.0] - 2026-08-28`。
- `docs/README.md`：CHANGELOG 版本號更新。
- `docs/TESTING.md`：測試檔案清單與數量同步更新。

## 檔案變更總覽

| 檔案 | 動作 | 說明 |
|------|------|------|
| `src/utils/shipping.js` | 新增 | 運費計算核心模組 |
| `src/database.js` | 修改 | 新增 4 個 orders 欄位 migration |
| `src/routes/orderRoutes.js` | 修改 | 整合運費計算、JSDoc 更新 |
| `tests/orders.test.js` | 修改 | 補 `shippingMethod`、強化斷言 |
| `tests/adminOrders.test.js` | 修改 | 補 `shippingMethod` |
| `tests/shipping.test.js` | 新增 | 10 項運費計算單元測試 |
| `vitest.config.js` | 修改 | 加入新測試檔 |
| `views/pages/checkout.ejs` | 修改 | 新增配送方式 UI |
| `public/js/pages/checkout.js` | 修改 | 新增運費即時計算 |
| `views/pages/cart.ejs` | 修改 | 修正寫死的運費數字 |
| `openapi.json` | 重新生成 | `npm run openapi` |
| `docs/FEATURES.md` | 修改 | 新增運費章節 |
| `docs/CHANGELOG.md` | 修改 | 新增 1.3.0 版本記錄 |
| `docs/README.md` | 修改 | 版本號更新 |
| `docs/TESTING.md` | 修改 | 測試檔案清單更新 |

## 驗證方式

1. `npm run test`：全部測試（含新 `shipping.test.js` 10 案例）需全數通過。
2. `npm run openapi`：確認 `openapi.json` 內新增欄位正確反映。
3. `npm run start` 手動走一次瀏覽器流程：`/cart` → `/checkout`（切換宅配/超商、勾選偏遠地區/急件，運費與總計即時正確）→ 送出訂單導向 `/ecpay/payment/:orderId`，確認 `TotalAmount` 等於商品小計+運費。
4. 抽查 `database.sqlite` 新建訂單的運費相關欄位是否正確寫入。
5. 建議重跑 `e2e-payment-test` Skill 做一次金流迴歸。
