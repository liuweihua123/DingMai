// Copy to alipay.js and fill in appId / keys (file is gitignored).

const { AlipaySdk, AlipayFormData } = require('alipay-sdk');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const alipaySdk = new AlipaySdk({
  appId: 'YOUR_APP_ID',
  privateKey: process.env.ALIPAY_PRIVATE_KEY || `-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----`,
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----`,
  signType: 'RSA2',
  gateway: 'https://openapi.alipay.com/gateway.do',
});

module.exports = { alipaySdk, AlipayFormData, BASE_URL };