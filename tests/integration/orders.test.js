const { app, request, registerUser, getAdminToken } = require('../setup');
const db = require('../../src/database');
const { calculateShippingFee } = require('../../src/utils/shipping');

describe('Orders API', () => {
  let userToken;
  let productId;
  let orderId;
  let productPrice;
  let productStockBeforeOrder;

  beforeAll(async () => {
    // Register a user for order tests
    const { token } = await registerUser();
    userToken = token;

    // Get a product id
    const prodRes = await request(app).get('/api/products');
    productId = prodRes.body.data.products[0].id;

    const productRow = db.prepare('SELECT price, stock FROM products WHERE id = ?').get(productId);
    productPrice = productRow.price;
    productStockBeforeOrder = productRow.stock;

    // Add product to cart
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });
  });

  it('should create an order from cart', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('subtotal');
    expect(res.body.data).toHaveProperty('shipping_fee');
    expect(res.body.data).toHaveProperty('shipping_method', 'home_delivery');
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data).toHaveProperty('status', 'pending');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.total_amount).toBe(res.body.data.subtotal + res.body.data.shipping_fee);

    orderId = res.body.data.id;
  });

  it('should persist the order and order_items rows in the database', () => {
    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    expect(orderRow).toBeTruthy();
    expect(orderRow.status).toBe('pending');
    expect(orderRow.shipping_method).toBe('home_delivery');
    expect(orderRow.recipient_name).toBe('測試收件人');

    const itemRows = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    expect(itemRows.length).toBe(1);
    expect(itemRows[0].product_id).toBe(productId);
    expect(itemRows[0].quantity).toBe(1);
    expect(itemRows[0].product_price).toBe(productPrice);
  });

  it('should calculate shipping_fee using calculateShippingFee() and total_amount consistently', () => {
    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    const expected = calculateShippingFee({
      shippingMethod: 'home_delivery',
      subtotal: productPrice,
      isRemoteArea: false,
      isExpress: false,
    });

    expect(orderRow.shipping_fee).toBe(expected.shippingFee);
    expect(orderRow.total_amount).toBe(productPrice + expected.shippingFee);
  });

  it('should decrement product stock by exactly the ordered quantity', () => {
    const productRow = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId);
    expect(productRow.stock).toBe(productStockBeforeOrder - 1);
  });

  it('should clear the cart after order creation', async () => {
    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('should fail to create order with empty cart', async () => {
    // The cart was already cleared by the previous order
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body.error).toBe('CART_EMPTY');
  });

  it('should fail to create order without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get order list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should return 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/non-existent-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });
});

describe('Order creation — insufficient stock edge case', () => {
  let edgeUserToken;
  let adminToken;
  let targetProductId;
  let ordersCountBefore;

  beforeAll(async () => {
    const { token } = await registerUser();
    edgeUserToken = token;
    adminToken = await getAdminToken();

    // Use a different seed product than the outer describe's `productId`
    // so this block never touches state the earlier tests already asserted on.
    const prodRes = await request(app).get('/api/products');
    targetProductId = prodRes.body.data.products[1].id;

    // Add 1 unit while stock is still sufficient (cart-add itself enforces
    // qty <= stock, so we can't add an over-quantity item directly).
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${edgeUserToken}`)
      .send({ productId: targetProductId, quantity: 1 });

    // Simulate the product selling out elsewhere in the meantime.
    await request(app)
      .put(`/api/admin/products/${targetProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 0 });

    ordersCountBefore = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  });

  it('should fail with STOCK_INSUFFICIENT when cart quantity exceeds current stock', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${edgeUserToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body.error).toBe('STOCK_INSUFFICIENT');
  });

  it('should not create any new order row when order creation fails', () => {
    const ordersCountAfter = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
    expect(ordersCountAfter).toBe(ordersCountBefore);
  });

  it('should not change product stock when order creation fails', () => {
    const productRow = db.prepare('SELECT stock FROM products WHERE id = ?').get(targetProductId);
    expect(productRow.stock).toBe(0);
  });
});
