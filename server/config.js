require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  siteUrl: process.env.SITE_URL || 'http://localhost:3000',

  yandexMapsApiKey: process.env.YANDEX_MAPS_API_KEY || '',

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@medklinika.ru',
  },

  sms: {
    provider: process.env.SMS_PROVIDER || 'smsru',
    apiId: process.env.SMSRU_API_ID || '',
    from: process.env.SMS_FROM || 'MedKlinika',
  },

  yookassa: {
    shopId: process.env.YOOKASSA_SHOP_ID || '',
    secretKey: process.env.YOOKASSA_SECRET_KEY || '',
  },

  medflex: {
    enabled: process.env.MEDFLEX_ENABLED === 'true',
    webhookUrl: process.env.MEDFLEX_WEBHOOK_URL || '',
    apiKey: process.env.MEDFLEX_API_KEY || '',
    partnerId: process.env.MEDFLEX_PARTNER_ID || '',
    widgetHtml: process.env.MEDFLEX_WIDGET_HTML || '',
  },

  oneC: {
    enabled: process.env.ONEC_EXPORT_ENABLED !== 'false',
    orgName: process.env.ONEC_ORG_NAME || 'МедКлиника на Гагарина',
  },

  personalData: {
    operatorName: process.env.PD_OPERATOR_NAME || 'ООО «МедКлиника на Гагарина»',
    operatorInn: process.env.PD_OPERATOR_INN || '',
    operatorAddress: process.env.PD_OPERATOR_ADDRESS || '',
    dpoEmail: process.env.PD_DPO_EMAIL || 'privacy@medklinika.ru',
    retentionDays: parseInt(process.env.PD_RETENTION_DAYS || '1095', 10),
  },
};
