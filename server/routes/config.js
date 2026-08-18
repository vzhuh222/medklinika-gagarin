const express = require('express');
const config = require('../config');
const { getPrivacyInfo } = require('../services/personal-data');

const router = express.Router();

router.get('/public', (_req, res) => {
  res.json({
    yandexMapsApiKey: config.yandexMapsApiKey,
    paymentsEnabled: Boolean(config.yookassa.shopId && config.yookassa.secretKey),
    medflexWidgetEnabled: Boolean(config.medflex.widgetHtml),
    siteUrl: config.siteUrl,
  });
});

router.get('/privacy', (_req, res) => {
  res.json(getPrivacyInfo());
});

module.exports = router;
