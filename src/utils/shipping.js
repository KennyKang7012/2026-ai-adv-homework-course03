const SHIPPING_METHODS = {
  HOME_DELIVERY: 'home_delivery',
  CVS: 'cvs',
};

const HOME_DELIVERY_BASE_FEE = 120;
const CVS_FEE = 60;
const FREE_SHIPPING_THRESHOLD = 1500;
const REMOTE_AREA_SURCHARGE = 200;
const EXPRESS_SURCHARGE = 250;

function calculateShippingFee({ shippingMethod, subtotal, isRemoteArea = false, isExpress = false }) {
  if (shippingMethod !== SHIPPING_METHODS.HOME_DELIVERY && shippingMethod !== SHIPPING_METHODS.CVS) {
    throw new Error('shippingMethod 必須為 home_delivery 或 cvs 其中之一');
  }

  let baseFee;
  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    baseFee = 0;
  } else if (shippingMethod === SHIPPING_METHODS.CVS) {
    baseFee = CVS_FEE;
  } else {
    baseFee = HOME_DELIVERY_BASE_FEE;
  }

  let surcharge = 0;
  if (isRemoteArea) surcharge += REMOTE_AREA_SURCHARGE;
  if (isExpress) surcharge += EXPRESS_SURCHARGE;

  return {
    baseFee,
    surcharge,
    shippingFee: baseFee + surcharge,
  };
}

module.exports = {
  SHIPPING_METHODS,
  HOME_DELIVERY_BASE_FEE,
  CVS_FEE,
  FREE_SHIPPING_THRESHOLD,
  REMOTE_AREA_SURCHARGE,
  EXPRESS_SURCHARGE,
  calculateShippingFee,
};
