import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3001';
const ADMIN_EMAIL = 'admin@hexschool.com';
const ADMIN_PASSWORD = '12345678';
const RECIPIENT = { name: 'kenn123', email: 'kenny123@123.com', address: 'taiwan' };

test.describe.configure({ retries: 1 }); // 真實綠界 staging 網路可能偶爾不穩定

test.beforeAll(async () => {
  const res = await fetch(BASE_URL).catch((err) => {
    throw err;
  });
  if (!res.ok) {
    throw new Error(
      `無法連線到 ${BASE_URL}（status ${res.status}）。請先執行 \`npm run start\` 啟動伺服器後再跑 npm run test:e2e。`
    );
  }
});

test('完整金流流程：登入 → 加入購物車 → 結帳 → ECPay 模擬付款 → 返回商店確認', async ({ page, request }) => {
  test.setTimeout(120_000);

  // Step 1：登入
  await page.goto('/login');
  await page.getByPlaceholder('請輸入 Email').fill(ADMIN_EMAIL);
  await page.getByPlaceholder('請輸入密碼').fill(ADMIN_PASSWORD);
  // 頁面上有兩個文字為「登入」的按鈕（分頁切換鈕 + 表單送出鈕），需鎖定表單內的送出按鈕。
  await page.locator('form').getByRole('button', { name: '登入' }).click();
  await page.waitForURL(BASE_URL + '/');
  await expect(page).toHaveTitle(/首頁/);

  // Step 2：加入購物車（直接以 API 找一件目前有庫存的商品，避免因反覆執行
  // 測試導致固定的「第一張商品卡片」庫存被消耗殆盡而顯示「已售完」）
  const productsRes = await request.get(BASE_URL + '/api/products?limit=20');
  const products = (await productsRes.json()).data.products;
  const inStockProduct = products.find((p) => p.stock > 0);
  if (!inStockProduct) {
    throw new Error('目前所有商品庫存皆為 0，請先透過後台補貨後再執行此測試。');
  }

  await page.goto('/products/' + inStockProduct.id);
  await page.getByRole('button', { name: '加入購物車' }).click();
  await expect(page.locator('#cart-badge')).toBeVisible();

  // Step 3：進入結帳
  await page.goto('/cart');
  await page.getByRole('button', { name: '前往結帳' }).click();
  await page.waitForURL(BASE_URL + '/checkout');

  // Step 4：填寫收件資訊並送出（配送方式沿用預設值 home_delivery）
  await page.getByPlaceholder('請輸入收件人姓名').fill(RECIPIENT.name);
  await page.getByPlaceholder('請輸入 Email').fill(RECIPIENT.email);
  await page.getByPlaceholder('請輸入收件地址').fill(RECIPIENT.address);

  // 下單成功後前端會立刻用 window.location.href 導向 /ecpay/payment/:id，
  // 用 page.waitForResponse() 事後讀取 .json() 常因頁面已導航而失效
  // （CDP 抓不到 response body）。改用 page.route() 攔截並自行 fetch，
  // 直接在我們自己的 script context 拿到 Response，不受後續導航影響。
  let capturedOrderData = null;
  await page.route('**/api/orders', async (route) => {
    const response = await route.fetch();
    capturedOrderData = await response.json();
    await route.fulfill({ response });
  });

  await page.getByRole('button', { name: '確認送出訂單' }).click();
  await page.waitForURL('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5**', { timeout: 30_000 });
  await page.unroute('**/api/orders');

  const orderNo = capturedOrderData.data.order_no;

  // Step 5：綠界模擬付款（網路 ATM / 台灣土地銀行）
  // 註：以下選擇器依照 .claude/skills/e2e-payment-test/SKILL.md 既有流程移植，
  // 綠界 staging 頁面屬第三方外部網站，規劃階段無法實際瀏覽驗證，
  // 建議首次執行後視實際結果微調。
  await page.getByRole('listitem', { name: 'WebATM' }).click();
  await page.getByRole('combobox').selectOption({ label: '台灣土地銀行' });
  await page.getByRole('link', { name: '前往付款' }).click();
  await page.getByRole('button', { name: '關閉' }).click(); // 頁內提示 modal，非原生 dialog
  await page.waitForURL('https://pay-stage.ecpay.com.tw/MockMPPost/LandWebAtm**', { timeout: 30_000 });

  // Step 6：土地銀行模擬頁完成交易
  await page.getByRole('button', { name: 'Save' }).click();
  await page.waitForURL(
    'https://payment-stage.ecpay.com.tw/bank/PaymentCenter/cntnotlogin/webatm/result**',
    { timeout: 30_000 }
  );
  await expect(page).toHaveTitle(/付款成功|綠界科技/);

  // Step 7：返回商店確認訂單
  await page.getByRole('link', { name: '返回商店' }).click();
  await page.waitForURL(/\/orders\/.+\?payment=pending/, { timeout: 30_000 });
  // 訂單詳情頁 mount 時會自動呼叫 check-payment（真實呼叫綠界 QueryTradeInfo API），需留時間等待。
  await expect(page.getByText('付款成功！感謝您的購買。')).toBeVisible({ timeout: 20_000 });
  // 「已付款」在頁面上會出現兩次（狀態徽章 + 訂單資訊卡的「訂單狀態」欄位），鎖定狀態徽章。
  await expect(page.locator('.status-badge')).toHaveText('已付款');

  await page.screenshot({ path: 'test-results/checkout-payment-success.png', fullPage: true });

  // Step 8：訂單列表確認
  await page.goto('/orders');
  const orderRow = page.locator('a', { hasText: orderNo });
  await expect(orderRow).toBeVisible();
  await expect(orderRow.getByText('已付款')).toBeVisible();
});
