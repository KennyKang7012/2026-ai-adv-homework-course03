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
