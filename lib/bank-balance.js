'use strict';

var BANK_SENDERS = {
  'HDFCBK':'HDFC Bank','HDFCBN':'HDFC Bank','HDFC':'HDFC Bank',
  'SBIINB':'SBI','SBIMSG':'SBI','SBIUPI':'SBI','SBIPSG':'SBI','SBIBNK':'SBI','SBICRD':'SBI Card',
  'ICICIB':'ICICI','ICICIM':'ICICI','ICICIBNK':'ICICI','ICICRD':'ICICI Card',
  'AXISBK':'Axis Bank','AXISBNK':'Axis Bank','AXISB':'Axis Bank','AXISCR':'Axis Card',
  'KOTAKB':'Kotak','KOTAKM':'Kotak','KOTAK':'Kotak',
  'PNBSMS':'PNB','PNBMSG':'PNB','BOBSMS':'BOB','BARODA':'Bank of Baroda',
  'CANBNK':'Canara Bank','CANBK':'Canara Bank','UNIONB':'Union Bank','IDBIBK':'IDBI',
  'YESBNK':'Yes Bank','INDUSB':'IndusInd','IDFCFB':'IDFC First','FEDERL':'Federal Bank',
  'PAYTMB':'Paytm','PAYTM':'Paytm','PHONEPE':'PhonePe','PPBL':'PhonePe',
  'AIRTEL':'Airtel','AIRBNK':'Airtel Payments Bank','JIOPB':'Jio Payments Bank'
};

var BANK_BAL_KW = ['avl bal','avail bal','available bal','avbl bal','avl. bal','avlbal','availbal','ledger bal','book bal','closing bal','available balance','avl balance','bal:','bal -','bal is','bal rs','bal inr','balance:','balance is','balance -','ac bal','acc bal','a/c bal','account balance'];
var BANK_TXN_KW = ['debited','credited','withdrawn','deposited','spent','transferred','paid to','received from','txn','transaction','ref no','utr','imps','neft','rtgs','upi','atm','pos ','emi','payment of','dr.','cr.'];
var BANK_PROMO_KW = ['apply now','pre-approved','loan offer','click here to apply','congratulations','winner','cashback offer','shop now','hurry'];

function _normSender(s){
  if(!s) return '';
  s = String(s).toUpperCase();
  s = s.replace(/^(VM|AD|AX|TM|AT|BX|JD|CP|MD|MM|TA|SD|AA|XX|GV|AJ|DN|SG|BS|BW|UK|EQ|DT|VK|JK|RK|IM|IP)-/, '');
  s = s.replace(/-(S|P|T|G|N|A|D|B|R|L|H|M|Q|E|F|K|U|W|X|Y|Z)$/, '');
  return s.replace(/[^A-Z0-9]/g, '');
}

function detectBank(sender){
  var s = _normSender(sender); if(!s) return null;
  for(var k in BANK_SENDERS){ if(s.indexOf(k) !== -1) return { name: BANK_SENDERS[k], key: k }; }
  return null;
}

function parseDT(dt){
  if(!dt) return 0;
  var s = String(dt).trim();
  if(/^\d{10,13}$/.test(s)) return parseInt(s.length === 13 ? s : s + '000');
  var d = new Date(s); return isNaN(d.getTime()) ? 0 : d.getTime();
}

function parseMsgSingle(key, m){
  var message = '', sender = '', type = 'incoming';
  if(typeof m === 'string'){ message = m; sender = 'Unknown'; }
  else if(typeof m === 'object'){
    message = m.message || m.body || m.text || m.msg || '';
    sender = String(m.sender || m.from || m.address || 'Unknown').trim();
    var rt = String(m.type || m.direction || '');
    type = (rt === '2' || rt.toLowerCase().includes('out')) ? 'outgoing' : 'incoming';
  }
  if(!message && !sender) return null;
  return { key: key, message: message || '(no body)', sender: sender || 'Unknown', type: type, _ts: parseDT(m && m.dateTime) };
}

function parseMsgs(data){
  var msgs = [];
  if(!data) return msgs;
  var entries = Array.isArray(data) ? data.map(function(v, i){ return [String(i), v]; }) : Object.entries(data);
  entries.forEach(function(kv){ var p = parseMsgSingle(kv[0], kv[1]); if(p) msgs.push(p); });
  msgs.sort(function(a, b){
    if(a._ts > 0 && b._ts > 0) return b._ts - a._ts;
    return String(b.key).localeCompare(String(a.key));
  });
  return msgs;
}

function extractBalanceFromText(txt){
  if(!txt) return null;
  var pats = [
    /(?:Avl\.?\s*Bal|Available\s*Bal)\s*:?\s*(?:Rs\.?:?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /Bal\s*(?:Rs\.?|INR)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /balance(?:\s*is)?\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
  ];
  for(var i=0;i<pats.length;i++){
    var m = txt.match(pats[i]);
    if(m){ var v = parseFloat(m[1].replace(/,/g, '')); if(!isNaN(v)) return v; }
  }
  return null;
}

function extractLastBalance(msgs){
  if(!msgs || !msgs.length) return null;
  for(var i=0;i<msgs.length;i++){
    var m = msgs[i];
    if(m.type && m.type !== 'incoming') continue;
    var bank = detectBank(m.sender); if(!bank) continue;
    var txt = String(m.message || ''), lower = txt.toLowerCase();
    var isPromo = false, hasBal = false, hasTxn = false;
    for(var p=0;p<BANK_PROMO_KW.length;p++){ if(lower.indexOf(BANK_PROMO_KW[p]) !== -1){ isPromo = true; break; } }
    for(var b=0;b<BANK_BAL_KW.length;b++){ if(lower.indexOf(BANK_BAL_KW[b]) !== -1){ hasBal = true; break; } }
    for(var t=0;t<BANK_TXN_KW.length;t++){ if(lower.indexOf(BANK_TXN_KW[t]) !== -1){ hasTxn = true; break; } }
    if(isPromo && !hasBal && !hasTxn) continue;
    if(!hasBal && !hasTxn) continue;
    var amt = extractBalanceFromText(txt);
    if(amt != null) return { amount: amt, bank: bank.name, sender: m.sender };
  }
  return null;
}

module.exports = { detectBank: detectBank, extractLastBalance: extractLastBalance, parseMsgs: parseMsgs };
