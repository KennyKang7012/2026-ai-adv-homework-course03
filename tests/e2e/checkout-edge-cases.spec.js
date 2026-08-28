import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3001';

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

async function createFreshUser(request) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = 'password123';
  const res = await request.post(BASE_URL + '/api/auth/register', {
    data: { email, password, name: 'E2E 測試使用者' },
  });
  const body = await res.json();
  return { email, password, token: body.data.token };
}

async function loginViaUI(page, email, password) {
  await page.goto('/login');
  await page.getByPlaceholder('請輸入 Email').fill(email);
  await page.getByPlaceholder('請輸入密碼').fill(password);
  // 頁面上有兩個文字為「登入」的按鈕（分頁切換鈕 + 表單送出鈕），需鎖定表單內的送出按鈕。
  await page.locator('form').getByRole('button', { name: '登入' }).click();
  await page.waitForURL(BASE_URL + '/');
}

test('E1：空購物車直接前往 /checkout 應自動跳轉至 /cart', async ({ page, request }) => {
  const user = await createFreshUser(request); // 全新帳號，保證購物車是空的
  await loginViaUI(page, user.email, user.password);
  await page.goto('/checkout');
  await page.waitForURL(BASE_URL + '/cart');
});

test('E2：未登入直接存取 /orders 應跳轉至 /login?redirect=%2Forders', async ({ page }) => {
  await page.goto('/orders'); // 全新瀏覽器 context，未登入
  await page.waitForURL(BASE_URL + '/login?redirect=%2Forders');
});

test('E3：結帳表單全空白送出應顯示三欄錯誤提示，且不跳轉至 ECPay', async ({ page, request }) => {
  const user = await createFreshUser(request);
  const productsRes = await request.get(BASE_URL + '/api/products?limit=20');
  const products = (await productsRes.json()).data.products;
  const inStockProduct = products.find((p) => p.stock > 0);
  if (!inStockProduct) {
    throw new Error('目前所有商品庫存皆為 0，請先透過後台補貨後再執行此測試。');
  }
  const productId = inStockProduct.id;
  await request.post(BASE_URL + '/api/cart', {
    data: { productId, quantity: 1 },
    headers: { Authorization: `Bearer ${user.token}` },
  });

  await loginViaUI(page, user.email, user.password);
  await page.goto('/checkout');
  await page.getByRole('button', { name: '確認送出訂單' }).click();

  await expect(page.getByText('請輸入收件人姓名')).toBeVisible();
  await expect(page.getByText('請輸入 Email')).toBeVisible();
  await expect(page.getByText('請輸入收件地址')).toBeVisible();
  await expect(page).toHaveURL(BASE_URL + '/checkout');
});

test('E4：404 頁面應顯示專用內容且可回到首頁', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page).toHaveTitle(/找不到頁面/);
  await expect(page.getByText('PAGE NOT FOUND')).toBeVisible();
  await expect(page.getByText('花漾生活').first()).toBeVisible();
  await expect(page.getByText('找不到頁面').first()).toBeVisible();
  await expect(page.getByText('花漾生活 — 每一束花，都值得被找到')).toBeVisible();

  await page.getByRole('link', { name: '回到首頁', exact: true }).click();
  await page.waitForURL(BASE_URL + '/');
  await expect(page).toHaveTitle(/首頁/);
});
