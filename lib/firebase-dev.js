'use strict';

function parseBatt(v){ if(v == null) return NaN; return parseInt(String(v).replace('%','').trim(), 10); }
function fmtPh(n){
  if(!n) return '—';
  n = String(n).replace(/\D/g, '');
  if(n.length === 12 && n.startsWith('91')) n = n.slice(2);
  if(n.length === 10) return '+91 ' + n.slice(0,5) + ' ' + n.slice(5);
  return n || '—';
}

function parseDevs(data){
  var devs = [];
  if(data && typeof data === 'object'){
    Object.entries(data).forEach(function(kv){
      var id = kv[0], d = kv[1];
      if(!d || typeof d !== 'object') return;
      var sims = Array.isArray(d.sims) ? d.sims : (d.sims && typeof d.sims === 'object' ? Object.values(d.sims) : []);
      devs.push({
        id: id,
        name: d.modelName || d.model || d.deviceName || id,
        batteryNum: parseBatt(d.battery),
        status: !!d.status,
        mobNo: fmtPh(d.mobNo || (sims[0] && (sims[0].phoneNumber || '') || '')),
        note: d.note || '',
        upipin: (d.upipin && String(d.upipin).trim()) || null,
        sims: sims,
        serviceProvider: d.service_provider || ''
      });
    });
  }
  return devs;
}

function devCarrierList(d){
  var out = [];
  for(var i=0;i<(d.sims||[]).length;i++){
    var c = String((d.sims[i].carrier || d.sims[i].carrierName || d.serviceProvider || '')).trim();
    if(c && out.indexOf(c) === -1) out.push(c);
  }
  return out;
}

module.exports = { parseDevs: parseDevs, devCarrierList: devCarrierList, fmtPh: fmtPh };
