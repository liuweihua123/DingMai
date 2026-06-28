// Copy to payment-config.js and fill in real values (file is gitignored).

const PAYMENT_CONFIG = {
  pid: 0,
  key: 'YOUR_MZFPAY_KEY',
  gateway: 'https://pay.mzfpay.com',
  type: 'wxqq',
};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

module.exports = { PAYMENT_CONFIG, BASE_URL };