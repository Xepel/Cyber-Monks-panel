'use strict';

var DEFAULT_CONFIG = {
  channelId: '', myNumber: '', firebases: [],
  forwardEnabled: true, forwardMode: 'all', botEnabled: true,
  autoBackup: true, autoBackupHour: 3, channelNotify: true, broadcastDelay: 60,
  numStart: '', numEnd: '', msgStart: '', msgEnd: '',
  numLabels: ['To', 'Receipt', 'Number', 'Mobile', 'Target', 'Phone'],
  msgLabels: ['Message', 'Msg', 'Body', 'Token', 'Text']
};

var state = {
  userConfig: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
  devices: [],
  activeDeviceUid: '',
  deviceSimMap: {},
  fbUrl: '',
  fbKey: '',
  recentCaptures: [],
  lastSyncAt: 0
};

function mergePanelSync(body){
  if(!body || typeof body !== 'object') return;
  if(body.userConfig && typeof body.userConfig === 'object'){
    state.userConfig = Object.assign({}, DEFAULT_CONFIG, body.userConfig);
  }
  if(Array.isArray(body.devices)) state.devices = body.devices;
  if(body.activeDeviceUid != null) state.activeDeviceUid = String(body.activeDeviceUid || '');
  if(body.deviceSimMap && typeof body.deviceSimMap === 'object') state.deviceSimMap = body.deviceSimMap;
  if(body.fbUrl != null) state.fbUrl = String(body.fbUrl || '').replace(/\/+$/, '');
  if(body.fbKey != null) state.fbKey = String(body.fbKey || '');
  state.lastSyncAt = Date.now();
}

function getState(){ return state; }

function pushCapture(number, message){
  state.recentCaptures.unshift({
    number: number,
    message: message,
    at: Date.now()
  });
  if(state.recentCaptures.length > 20) state.recentCaptures.length = 20;
}

module.exports = { mergePanelSync, getState, pushCapture, DEFAULT_CONFIG };
