const {
  SHIPPING_METHODS,
  calculateShippingFee,
} = require('../../src/utils/shipping');

describe('Shipping fee calculation', () => {
  it('宅配基本運費 120 元', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.HOME_DELIVERY, subtotal: 1000 });
    expect(result).toEqual({ baseFee: 120, surcharge: 0, shippingFee: 120 });
  });

  it('超商取貨費用 60 元', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.CVS, subtotal: 1000 });
    expect(result).toEqual({ baseFee: 60, surcharge: 0, shippingFee: 60 });
  });

  it('商品小計 1,499 元情境：宅配基本運費仍需收取', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.HOME_DELIVERY, subtotal: 1499 });
    expect(result.shippingFee).toBe(120);
  });

  it('商品小計 1,500 元免運情境：宅配基本運費應為 0', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.HOME_DELIVERY, subtotal: 1500 });
    expect(result.shippingFee).toBe(0);
  });

  it('超商取貨在商品小計 1,500 元時同樣免收基本運費', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.CVS, subtotal: 1500 });
    expect(result.shippingFee).toBe(0);
  });

  it('偏遠地區附加費：120 + 200 = 320', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.HOME_DELIVERY, subtotal: 1000, isRemoteArea: true });
    expect(result.shippingFee).toBe(320);
  });

  it('當日急件附加費：120 + 250 = 370', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.HOME_DELIVERY, subtotal: 1000, isExpress: true });
    expect(result.shippingFee).toBe(370);
  });

  it('多項附加費同時成立：120 + 200 + 250 = 570', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.HOME_DELIVERY, subtotal: 1000, isRemoteArea: true, isExpress: true });
    expect(result.shippingFee).toBe(570);
  });

  it('滿額免運與附加費同時成立：0 + 200 + 250 = 450', () => {
    const result = calculateShippingFee({ shippingMethod: SHIPPING_METHODS.HOME_DELIVERY, subtotal: 1500, isRemoteArea: true, isExpress: true });
    expect(result.baseFee).toBe(0);
    expect(result.shippingFee).toBe(450);
  });

  it('shippingMethod 缺失或不合法時應拋出錯誤', () => {
    expect(() => calculateShippingFee({ subtotal: 1000 })).toThrow('shippingMethod 必須為 home_delivery 或 cvs 其中之一');
    expect(() => calculateShippingFee({ shippingMethod: 'invalid', subtotal: 1000 })).toThrow();
  });
});
