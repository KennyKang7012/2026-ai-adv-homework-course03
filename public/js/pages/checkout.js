const { createApp, ref, computed, onMounted } = Vue;

const HOME_DELIVERY_BASE_FEE = 120;
const CVS_FEE = 60;
const FREE_SHIPPING_THRESHOLD = 1500;
const REMOTE_AREA_SURCHARGE = 200;
const EXPRESS_SURCHARGE = 250;

createApp({
  setup() {
    if (!Auth.requireAuth()) return {};

    const loading = ref(true);
    const submitting = ref(false);
    const cartItems = ref([]);
    const form = ref({
      recipientName: '', recipientEmail: '', recipientAddress: '',
      shippingMethod: 'home_delivery', isRemoteArea: false, isExpress: false
    });
    const errors = ref({});

    const cartTotal = computed(function () {
      return cartItems.value.reduce(function (sum, item) {
        return sum + item.product.price * item.quantity;
      }, 0);
    });

    const shippingFee = computed(function () {
      let baseFee;
      if (cartTotal.value >= FREE_SHIPPING_THRESHOLD) {
        baseFee = 0;
      } else if (form.value.shippingMethod === 'cvs') {
        baseFee = CVS_FEE;
      } else {
        baseFee = HOME_DELIVERY_BASE_FEE;
      }
      let surcharge = 0;
      if (form.value.isRemoteArea) surcharge += REMOTE_AREA_SURCHARGE;
      if (form.value.isExpress) surcharge += EXPRESS_SURCHARGE;
      return { baseFee: baseFee, surcharge: surcharge, shippingFee: baseFee + surcharge };
    });

    const orderTotal = computed(function () {
      return cartTotal.value + shippingFee.value.shippingFee;
    });

    function validate() {
      errors.value = {};
      if (!form.value.recipientName.trim()) errors.value.recipientName = '請輸入收件人姓名';
      if (!form.value.recipientEmail.trim()) {
        errors.value.recipientEmail = '請輸入 Email';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.recipientEmail)) {
        errors.value.recipientEmail = 'Email 格式不正確';
      }
      if (!form.value.recipientAddress.trim()) errors.value.recipientAddress = '請輸入收件地址';
      return Object.keys(errors.value).length === 0;
    }

    async function submitOrder() {
      if (!validate() || submitting.value) return;
      submitting.value = true;
      try {
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify(form.value)
        });
        Notification.show('訂單已建立，正在前往付款...', 'success');
        window.location.href = '/ecpay/payment/' + res.data.id;
      } catch (err) {
        Notification.show(err?.data?.message || '訂單建立失敗', 'error');
      } finally {
        submitting.value = false;
      }
    }

    onMounted(async function () {
      try {
        const res = await apiFetch('/api/cart');
        cartItems.value = res.data.items;
        if (cartItems.value.length === 0) {
          window.location.href = '/cart';
          return;
        }
      } catch (e) {
        window.location.href = '/cart';
        return;
      }
      loading.value = false;
    });

    return { loading, submitting, cartItems, form, errors, cartTotal, shippingFee, orderTotal, submitOrder };
  }
}).mount('#app');
