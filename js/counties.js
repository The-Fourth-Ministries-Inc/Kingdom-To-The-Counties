/* ================= Shared county roster (v1.7.0) =================
   One source of truth for every county dropdown (Quick Capture + the
   Recording Studio script editor) and for the 10 script templates.
   `event` strings match data/scripts.json exactly so board grouping holds. */
var COUNTIES=[
  {key:"sullivan",  county:"Sullivan County",  event:"Sullivan County — Jun 13 · Monadnock Park",         dateLong:"Saturday, June 13th",    dateShort:"June 13th",     venue:"Monadnock Park",              town:"Claremont", the:false, vshort:"Monadnock Park"},
  {key:"grafton",   county:"Grafton County",   event:"Grafton County — Jun 27 · Loon Mountain Resort",    dateLong:"Saturday, June 27th",    dateShort:"June 27th",     venue:"Loon Mountain Resort",        town:"Lincoln",   the:false, vshort:"Loon Mountain"},
  {key:"strafford", county:"Strafford County", event:"Strafford County — Jul 11 · Rochester Fairgrounds", dateLong:"Saturday, July 11th",    dateShort:"July 11th",     venue:"Rochester Fairgrounds",       town:"",          the:true,  vshort:"Rochester Fairgrounds"},
  {key:"carroll",   county:"Carroll County",   event:"Carroll County — Jul 25 · King Pine Ski Area",      dateLong:"Saturday, July 25th",    dateShort:"July 25th",     venue:"King Pine Ski Area",          town:"Madison",   the:false, vshort:"King Pine"},
  {key:"cheshire",  county:"Cheshire County",  event:"Cheshire County — Aug 15 · Cheshire Fair",          dateLong:"Saturday, August 15th",  dateShort:"August 15th",   venue:"Cheshire Fair",               town:"Swanzey",   the:true,  vshort:"Cheshire Fair"},
  {key:"belknap",   county:"Belknap County",   event:"Belknap County — Aug 22 · Belknap 4-H Fairgrounds", dateLong:"Saturday, August 22nd",  dateShort:"August 22nd",   venue:"Belknap County 4-H Fairgrounds",town:"Belmont", the:true,  vshort:"Belknap 4-H Fairgrounds"},
  {key:"coos",      county:"Coös County",      event:"Coös County — Sep 5 · Gorham Town Common",          dateLong:"Saturday, September 5th",dateShort:"September 5th", venue:"Gorham Town Common",          town:"",          the:true,  vshort:"Gorham Town Common"},
  {key:"rockingham",county:"Rockingham County",event:"Rockingham County — Oct 10 · Star Speedway",        dateLong:"Saturday, October 10th", dateShort:"October 10th",  venue:"Star Speedway",               town:"Epping",    the:false, vshort:"Star Speedway"}
];
function countyPlace(c){return (c.the?"the ":"")+c.venue+(c.town?(" in "+c.town):"");}

/* ================= Ambassador Quick Capture (v1.7.0) =================
   Three frictionless lanes for street encounters — 📷 photo of a filled-out
   contact card, 🎙️ voice note, ⌨️ typed — with pop-up reminders that the
   follow-up team needs, at minimum: NAME + CONTACT INFO + ENCOUNTER NOTES.
   Captures sync to leadership (headed for Planning Center Online later);
   when the field signal drops they queue on the phone and auto-send. */
/* Audio is the default lane: on the street, speaking is faster and more
   complete than typing, and typed fields were the main thing slowing
   ambassadors down. */
var capLaneCur="audio",capPhotoData=null,capAudioData=null,capFieldsOpen=false;
var CAP_HINTS={
  photo:"Snap the filled-out card, add anything the card doesn't show (especially notes on the conversation), then submit.",
  audio:"Talk like you're leaving a voicemail for the follow-up team. Typed details are optional.",
  text:"Type it in — their name, a phone or email, and notes on the encounter are the minimum."
};
function capSetLane(l){
  capLaneCur=l;
  var btns=document.querySelectorAll("#capLanes button");
  for(var i=0;i<btns.length;i++)btns[i].classList.toggle("on",btns[i].getAttribute("data-lane")===l);
  document.getElementById("capPhotoWrap").style.display=l==="photo"?"block":"none";
  document.getElementById("capAudioWrap").style.display=l==="audio"?"block":"none";
  document.getElementById("capLaneHint").textContent=CAP_HINTS[l]||"";
  document.getElementById("capFieldsTtl").textContent=l==="text"?"Their info":("Their info — add what the "+(l==="photo"?"card":"recording")+" doesn't cover");
  /* Typed lane: fields are the capture, so they stay open. Voice/photo: the
     recording is the capture, so the fields collapse to one optional tap. */
  capFieldsOpen=(l==="text");
  capApplyFields();
}
function capApplyFields(){
  var box=document.getElementById("capFields"),btn=document.getElementById("capMoreBtn");
  if(!box||!btn)return;
  var optional=(capLaneCur!=="text");
  btn.style.display=optional?"block":"none";
  box.style.display=(!optional||capFieldsOpen)?"block":"none";
  btn.textContent=capFieldsOpen?"▲ Hide typed details":"＋ Add typed details (optional)";
}
function capToggleFields(){capFieldsOpen=!capFieldsOpen;capApplyFields();}
/* ---- photo lane: downscale to a phone-friendly JPEG data URL ---- */
function capShrink(file,cb){
  var url=URL.createObjectURL(file),img=new Image();
  img.onload=function(){
    try{
      var MAX=1400,w=img.naturalWidth,h=img.naturalHeight,sc=Math.min(1,MAX/Math.max(w,h));
      var c=document.createElement("canvas");c.width=Math.max(1,Math.round(w*sc));c.height=Math.max(1,Math.round(h*sc));
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url);cb(c.toDataURL("image/jpeg",0.72));
    }catch(e){URL.revokeObjectURL(url);cb(null);}
  };
  img.onerror=function(){URL.revokeObjectURL(url);cb(null);};
  img.src=url;
}
document.getElementById("capPhotoInput").addEventListener("change",function(){
  var f=this.files&&this.files[0];this.value="";
  if(!f)return;
  toast("📷 Processing photo…");
  capShrink(f,function(dataUrl){
    if(!dataUrl){toast("Couldn't read that photo — try again");return;}
    capPhotoData=dataUrl;
    document.getElementById("capPhotoImg").src=dataUrl;
    document.getElementById("capPhotoPrev").style.display="block";
    document.getElementById("capShotBtn").style.display="none";
    toast("📷 Got it — check the writing is readable, then add notes & submit");
  });
});
function capPhotoRetake(){
  capPhotoData=null;
  document.getElementById("capPhotoPrev").style.display="none";
  document.getElementById("capShotBtn").style.display="block";
  document.getElementById("capPhotoInput").click();
}
/* ---- audio lane: MediaRecorder voice note ---- */
var capRecOn=false,capRecorder=null,capChunks=[],capSecs=0,capTimer=null,capStream=null,capRecCoached=false;
function capAudioMime(){var o=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];for(var i=0;i<o.length;i++){if(window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(o[i]))return o[i];}return "";}
function capRecTap(){
  if(capRecOn){capRecStop();return;}
  if(!window.MediaRecorder||!navigator.mediaDevices){toast("🎙️ Recording isn't supported in this browser — use Type It instead");return;}
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(st){
    capStream=st;capChunks=[];capAudioData=null;
    document.getElementById("capAudioPrev").style.display="none";
    var mt=capAudioMime();
    try{capRecorder=mt?new MediaRecorder(st,{mimeType:mt}):new MediaRecorder(st);}catch(e){capRecorder=new MediaRecorder(st);}
    capRecorder.ondataavailable=function(e){if(e.data&&e.data.size>0)capChunks.push(e.data);};
    capRecorder.onstop=function(){
      var blob=new Blob(capChunks,{type:capRecorder.mimeType||"audio/webm"});
      var rd=new FileReader();
      rd.onload=function(){
        capAudioData=rd.result;
        var au=document.getElementById("capAudioPrev");au.src=capAudioData;au.style.display="block";
        document.getElementById("capRecLbl").textContent="Recorded — listen back, or tap to redo";
      };
      rd.readAsDataURL(blob);
      if(capStream){capStream.getTracks().forEach(function(t){t.stop();});capStream=null;}
    };
    capRecorder.start(1000);
    capRecOn=true;capSecs=0;
    document.getElementById("capRecBtn").classList.add("rec");
    document.getElementById("capRecLbl").textContent="Recording — tap to stop";
    document.getElementById("capRecTime").textContent="00:00";
    if(!capRecCoached){capRecCoached=true;toast("🎙️ Say their NAME, their PHONE or EMAIL, and what happened");}
    capTimer=setInterval(function(){
      capSecs++;document.getElementById("capRecTime").textContent=tpFmtTime(capSecs);
      if(capSecs===60)toast("⏱ 1 minute — remember name + contact info, then wrap it up");
      if(capSecs>=180){toast("⏱ 3 minutes — stopping here so it can send from the field");capRecStop();}
    },1000);
    vibr(15);
  }).catch(function(){toast("🎙️ Mic is blocked — allow the microphone in your browser, or use Type It");});
}
function capRecStop(){
  if(capRecorder&&capRecorder.state!=="inactive")capRecorder.stop();
  capRecOn=false;clearInterval(capTimer);
  document.getElementById("capRecBtn").classList.remove("rec");
  vibr(15);
}
/* ---- county dropdown ----
   The app already knows which county it's on: leaders set it once in the
   dashboard (STATE.county), so ambassadors shouldn't have to pick it on every
   capture — one more thing to get wrong on the street. The field is filled in
   and shown as confirmation, with an override for the edge case of capturing
   someone from a different county. */
function countyByKey(k){for(var i=0;i<COUNTIES.length;i++)if(COUNTIES[i].key===k)return COUNTIES[i];return null;}
function activeCountyName(){
  var c=countyByKey(STATE.county||"");
  if(c)return c.county;
  /* Fall back to matching the free-text event name, as before. */
  var evn=((STATE.event&&STATE.event.name)||"").toLowerCase();
  if(evn)for(var i=0;i<COUNTIES.length;i++){
    var first=COUNTIES[i].county.split(" ")[0].toLowerCase();
    if(evn.indexOf(first)>=0||(COUNTIES[i].key==="coos"&&evn.indexOf("coos")>=0))return COUNTIES[i].county;
  }
  return "";
}
function capFillCounty(){
  var sel=document.getElementById("capCounty");if(!sel)return;
  if(!sel.options.length){
    sel.innerHTML='<option value="">Which county are you in?…</option>'+COUNTIES.map(function(c){return '<option>'+esc(c.county)+'</option>';}).join("")+'<option>Other / not sure</option>';
  }
  var auto=activeCountyName();
  /* Only auto-set while the ambassador hasn't chosen something else. */
  if(auto&&(!sel.value||sel.value===capCountyAuto))sel.value=auto;
  capCountyAuto=auto;
  var note=document.getElementById("capCountyNote");
  if(note){
    note.style.display=auto?"block":"none";
    note.innerHTML=auto?('📍 Set automatically to <b>'+esc(auto)+'</b> — change it only if this person is from somewhere else.'):'';
  }
}
var capCountyAuto="";
/* ---- minimum-info pop-up reminder ---- */
function capMissing(){
  var name=document.getElementById("capName").value.trim(),
      phone=document.getElementById("capPhone").value.trim(),
      email=document.getElementById("capEmail").value.trim(),
      notes=document.getElementById("capNotes").value.trim();
  var miss=[];
  if(!name)miss.push("👤 Their name");
  if(!phone&&!email)miss.push("📞 A phone number or an email");
  if(!notes)miss.push("📝 Notes on the encounter");
  return miss;
}
var capRemindGoFn=null;
function capRemind(miss,onAnyway){
  document.getElementById("capRemindIntro").textContent=
    capLaneCur==="photo"?"Before this goes out — the follow-up team needs these. If the card photo clearly shows them, you're covered:":
    capLaneCur==="audio"?"Before this goes out — the follow-up team needs these. If you said them out loud in the recording, you're covered:":
    "The follow-up team can't reach this person yet — please add:";
  document.getElementById("capRemindList").innerHTML=miss.map(function(m){return "<li>"+esc(m)+"</li>";}).join("");
  document.getElementById("capRemindNote").textContent="At the very least every capture needs their name, contact info, and notes on the encounter — the more detail, the better the follow-up.";
  var go=document.getElementById("capRemindGo");
  capRemindGoFn=onAnyway||null;
  go.style.display=onAnyway?"block":"none";
  document.getElementById("capRemindModal").classList.add("show");
}
document.getElementById("capRemindGo").addEventListener("click",function(){
  document.getElementById("capRemindModal").classList.remove("show");
  if(capRemindGoFn){var f=capRemindGoFn;capRemindGoFn=null;f();}
});
/* ---- submit / offline queue ---- */
function capSubmit(){
  if(capLaneCur==="photo"&&!capPhotoData){toast("📷 Snap the card first");return;}
  if(capLaneCur==="audio"&&capRecOn){toast("⏹ Tap the button to stop recording first");return;}
  if(capLaneCur==="audio"&&!capAudioData){toast("🎙️ Record the voice note first");return;}
  /* Voice note: the recording IS the record. The ambassador was told up front
     to say the name and contact out loud, so we do not stop them with a modal
     about empty text boxes they were never asked to fill. */
  if(capLaneCur==="audio"){capDoSend();return;}
  var miss=capMissing();
  if(miss.length){
    if(capLaneCur==="text"){
      capRemind(miss,null);
      flash(!document.getElementById("capName").value.trim()?"capName":(!document.getElementById("capPhone").value.trim()&&!document.getElementById("capEmail").value.trim())?"capPhone":"capNotes");
    }else{
      capRemind(miss,capDoSend); // card/recording may already cover it — their call
    }
    return;
  }
  capDoSend();
}
function capDoSend(){
  var rec={
    id:uid(),lane:capLaneCur,
    name:document.getElementById("capName").value.trim(),
    phone:document.getElementById("capPhone").value.trim(),
    email:document.getElementById("capEmail").value.trim(),
    county:document.getElementById("capCounty").value,
    resp:capRespCur,
    notes:document.getElementById("capNotes").value.trim(),
    by:myTag()||"Ambassador",t:nowLabel(),d:dateKey(new Date())
  };
  var media=capLaneCur==="photo"&&capPhotoData?{kind:"photo",dataUrl:capPhotoData}
           :capLaneCur==="audio"&&capAudioData?{kind:"audio",dataUrl:capAudioData}:null;
  var payload=Object.assign({},rec,{media:media});
  capLogAdd(rec,"wait");
  capFormReset();vibr(20);
  if(LIVE){
    apiPost("captureAdd",payload).then(function(){
      capLogMark(rec.id,"sent");STATE.captureCount=(STATE.captureCount||0)+1;updateBadges();renderCapMine();
      toast("✅ Captured & sent — go find the next one!");
    }).catch(function(){capEnqueue(payload);toast("📡 Signal dropped — saved on this phone, it'll send automatically");renderCapMine();});
  }else{
    capEnqueue(payload);toast("📡 Offline — saved on this phone, it'll send when you're back online");renderCapMine();
  }
}
var capRespCur="";
function capSetResp(r){
  capRespCur=(capRespCur===r)?"":r;
  var btns=document.querySelectorAll("#capResp button");
  for(var i=0;i<btns.length;i++)btns[i].classList.toggle("on",btns[i].getAttribute("data-r")===capRespCur);
}
document.addEventListener("click",function(e){
  var b=e.target&&e.target.closest&&e.target.closest("#capResp button");
  if(b)capSetResp(b.getAttribute("data-r"));
});
function capFormReset(){
  ["capName","capPhone","capEmail","capNotes"].forEach(function(id){document.getElementById(id).value="";});
  capSetResp(capRespCur); // clear selection
  capRespCur="";var rb=document.querySelectorAll("#capResp button");for(var i=0;i<rb.length;i++)rb[i].classList.remove("on");
  capPhotoData=null;capAudioData=null;
  document.getElementById("capPhotoPrev").style.display="none";
  document.getElementById("capShotBtn").style.display="block";
  var au=document.getElementById("capAudioPrev");au.style.display="none";au.removeAttribute("src");
  document.getElementById("capRecLbl").textContent="Tap to record";
  document.getElementById("capRecTime").textContent="00:00";
}
function capQueue(){try{return JSON.parse(localStorage.getItem("k2c_capq")||"[]")||[];}catch(_){return [];}}
function capQueueSet(q){try{localStorage.setItem("k2c_capq",JSON.stringify(q));return true;}catch(_){return false;}}
function capEnqueue(p){
  var q=capQueue();q.push(p);
  if(capQueueSet(q))return;
  // localStorage quota — media is the heavy part. Queue the text (never lose
  // the contact) and be honest that the media couldn't be kept offline.
  if(p.media){
    var kind=p.media.kind==="photo"?"card photo":"voice note";
    var p2=Object.assign({},p,{media:null,notes:(p.notes?p.notes+"\n":"")+"[⚠️ A "+kind+" was attached but couldn't be stored offline on the phone — ask "+(p.by||"the ambassador")+" for details]"});
    q=capQueue();q.push(p2);
    if(capQueueSet(q)){toast("⚠️ No room to keep the "+kind+" offline — the typed info is saved and will send");return;}
  }
  toast("⚠️ This phone's offline storage is full — keep the app open until you have signal");
}
var capFlushing=false;
function capFlush(){
  if(capFlushing||!LIVE)return;
  var q=capQueue();if(!q.length)return;
  capFlushing=true;
  var p=q[0];
  apiPost("captureAdd",p).then(function(){
    var q2=capQueue();q2.shift();capQueueSet(q2);
    capLogMark(p.id,"sent");STATE.captureCount=(STATE.captureCount||0)+1;updateBadges();renderCapMine();
    capFlushing=false;
    if(capQueue().length)capFlush();else toast("✅ Offline captures sent to leadership");
  }).catch(function(err){
    capFlushing=false;
    /* 507 = the server's capture list is full and REFUSED this record (it no
       longer evicts older ones). Keep it queued on this phone and tell the
       ambassador plainly — the contact isn't lost, but it isn't filed either. */
    if(err===507){
      capLogMark(p.id,"blocked");renderCapMine();
      toast("⚠️ Capture storage is full — leadership must export & purge. Your capture is saved on this phone.");
    }
  });
}
setInterval(capFlush,15000);
/* ---- "captured from this phone" log (device-local, no PII beyond a label) ---- */
function capLog(){try{return JSON.parse(localStorage.getItem("k2c_caplog")||"[]")||[];}catch(_){return [];}}
function capLogSet(l){try{localStorage.setItem("k2c_caplog",JSON.stringify(l.slice(0,60)));}catch(_){}}
function capLogAdd(rec,st){
  var l=capLog();
  l.unshift({id:rec.id,label:rec.name||(rec.lane==="photo"?"Card photo":rec.lane==="audio"?"Voice note":"Unnamed"),lane:rec.lane,t:rec.t,d:rec.d,st:st});
  capLogSet(l);renderCapMine();
}
function capLogMark(id,st){var l=capLog(),hit=false;l.forEach(function(e){if(e.id===id){e.st=st;hit=true;}});if(hit)capLogSet(l);}
var CAP_LANE_ICON={photo:"📷",audio:"🎙️",text:"⌨️"};
function renderCapMine(){
  var wrap=document.getElementById("capMineWrap"),mt=document.getElementById("capMineMount");
  if(!wrap||!mt)return;
  var l=capLog();
  wrap.style.display=l.length?"block":"none";
  mt.innerHTML=l.map(function(e){
    var sent=e.st==="sent",blocked=e.st==="blocked";
    return '<div class="listrow"><span class="av">'+(CAP_LANE_ICON[e.lane]||"📇")+'</span><span class="nm">'+esc(e.label)+'<small>'+esc((e.d||"")+(e.t?(" · "+e.t):""))+'</small></span><span class="st '+(sent?"sent":"wait")+'">'+(sent?"SENT ✓":(blocked?"STORAGE FULL":"WAITING…"))+'</span></div>';
  }).join("");
}
/* ---- leader view: full list, media viewer, CSV export ---- */
var capAll=null;
function renderCapLeader(){
  var w=document.getElementById("capLeaderWrap");if(!w)return;
  if(!LEADER){w.innerHTML='<div class="lockbar">🔒 Submitted captures (names & contact info) are visible to leaders only.<button onclick="askPin(function(){renderCapture();})">Unlock</button></div>';return;}
  w.innerHTML='<div class="ttl" style="font-family:var(--serif);font-weight:600;font-size:16px;margin:0 0 8px">🔓 All captures — leaders <span style="color:var(--rust)">('+(STATE.captureCount||0)+')</span></div>'
    +'<button class="btn ghost" style="margin-bottom:9px" onclick="capLoadAll()">'+(capAll?"↻ Refresh captures":"📇 Load all captures")+'</button>'
    +'<div id="capAllMount"></div>';
  if(capAll)renderCapAll();
}
function capLoadAll(){
  if(!LIVE){toast("Demo mode — captures load on the deployed site");return;}
  apiPost("capturesList",{}).then(function(r){capAll=(r&&r.captures)||[];renderCapLeader();}).catch(function(e){if(e!==403)toast("Couldn't load captures — check your signal");});
}
var CAP_RESP_LABEL={salvation:"✝️ Salvation",rededication:"🔥 Rededication",dedication:"🕊️ Dedication",prayer:"🙏 Prayer"};
var CAP_STATE_LABEL={new:"🆕 Not yet entered",entered:"📥 In Planning Center",done:"✅ Follow-up done"};
/* Per-record follow-up state, so "purge — it's all in Planning Center" can be
   verified instead of trusted (the server refuses to purge while any record
   is still unfiled). */
function capStateRow(c){
  var st=c.st||"new";
  return '<div class="capstate">'+["new","entered","done"].map(function(k){
    return '<button class="'+(st===k?"on":"")+'" onclick="capSetState(\''+esc(c.id)+'\',\''+k+'\')">'+CAP_STATE_LABEL[k]+'</button>';
  }).join("")+'</div>';
}
function capSetState(id,st){
  var c=capAll.filter(function(x){return x.id===id;})[0];
  if(!c||c.st===st)return;
  queueWrite("captureSetState",{id:id,st:st},function(){c.st=st;},function(){renderCapAll();});
}
var capCountyFilter="";
function capSetCountyFilter(v){capCountyFilter=v;renderCapAll();}
function renderCapAll(){
  var mt=document.getElementById("capAllMount");if(!mt)return;
  if(!capAll.length){mt.innerHTML='<div class="empty">No captures submitted yet. 📇</div>';return;}
  /* Captures are season-long and now carry the county they were taken in, so
     leaders can work one county's follow-up list at a time instead of a single
     undifferentiated pile. */
  var counties=[];
  capAll.forEach(function(c){if(c.county&&counties.indexOf(c.county)<0)counties.push(c.county);});
  counties.sort();
  var filterBar=counties.length>1?('<select class="capfilter" onchange="capSetCountyFilter(this.value)"><option value="">All counties ('+capAll.length+')</option>'
    +counties.map(function(n){
      var n2=capAll.filter(function(c){return c.county===n;}).length;
      return '<option value="'+esc(n)+'"'+(capCountyFilter===n?' selected':'')+'>'+esc(n)+' ('+n2+')</option>';
    }).join("")+'</select>'):"";
  var list=capCountyFilter?capAll.filter(function(c){return c.county===capCountyFilter;}):capAll;
  if(!list.length){mt.innerHTML=filterBar+'<div class="empty">No captures for that county yet. 📇</div>';return;}
  var rows=list.slice().reverse().map(function(c){
    var contact=[c.phone,c.email].filter(Boolean).join(" · ");
    return '<div class="caprow"><div class="hd"><b>'+esc(c.name||"(no name typed)")+'</b><span class="ln">'+(CAP_LANE_ICON[c.lane]||"")+' '+esc((c.d||"")+(c.t?(" · "+c.t):""))+'</span></div>'
      +(contact?'<div class="ct">'+esc(contact)+'</div>':'<div class="ct" style="color:var(--warn)">no typed contact — check the '+(c.mediaKind||"notes")+'</div>')
      +(c.county?'<div class="by2">📍 '+esc(c.county)+'</div>':'')
      +(c.resp?'<div class="by2">'+CAP_RESP_LABEL[c.resp]+'</div>':'')
      +(c.notes?'<div class="nt">'+esc(c.notes)+'</div>':'')
      +'<div class="by2">by '+esc(c.by||"Ambassador")+'</div>'
      +capStateRow(c)
      +'<div class="acts2">'+(c.hasMedia?'<button onclick="capViewMedia(\''+esc(c.id)+'\',\''+esc(c.mediaKind)+'\')">'+(c.mediaKind==="photo"?"🖼️ View card photo":"🔊 Play voice note")+'</button>':'')
      +'<button class="del" onclick="capDelOne(\''+esc(c.id)+'\')">🗑 Delete</button></div></div>';
  }).join("");
  mt.innerHTML='<button class="btn ghost" style="margin-bottom:9px" onclick="capExportCsv()">📊 Export captures (CSV)</button>'+filterBar+rows;
}
function capViewMedia(id,kind){
  var body=document.getElementById("capMediaBody");
  document.getElementById("capMediaTitle").textContent=kind==="photo"?"🖼️ Contact card photo":"🔊 Voice note";
  body.innerHTML='<p class="hint">Loading…</p>';
  document.getElementById("capMediaModal").classList.add("show");
  apiPost("captureMedia",{id:id}).then(function(r){
    if(!(r&&r.dataUrl)){body.innerHTML='<p class="hint">Media not found for this capture.</p>';return;}
    body.innerHTML=kind==="photo"?'<img alt="Contact card" />':'<audio controls></audio>';
    var el=body.firstElementChild;el.src=r.dataUrl;
  }).catch(function(){body.innerHTML='<p class="hint">Couldn’t load the media — check your signal and try again.</p>';});
}
function capDelOne(id){
  if(!confirm("Delete this capture for everyone? Only do this once it's been entered into Planning Center."))return;
  apiPost("captureDelete",{id:id}).then(function(){
    capAll=(capAll||[]).filter(function(c){return c.id!==id;});
    STATE.captureCount=Math.max(0,(STATE.captureCount||0)-1);
    updateBadges();renderCapLeader();toast("🗑 Capture deleted");
  }).catch(function(e){if(e!==403)toast("Couldn't delete — try again");});
}
function capExportCsv(){
  if(!capAll||!capAll.length){toast("Load the captures first");return;}
  var rows=[["Date","Time","Captured by","Lane","Name","Phone","Email","County","Notes","Media"]];
  capAll.forEach(function(c){rows.push([c.d||"",c.t||"",c.by||"",c.lane||"",c.name||"",c.phone||"",c.email||"",c.county||"",c.notes||"",c.hasMedia?c.mediaKind:""]);});
  var csv=rows.map(function(r){return r.map(csvCell).join(",");}).join("\r\n");
  var blob=new Blob(["\ufeff"+csv],{type:"text/csv"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="k2c-quick-captures-"+new Date().toISOString().slice(0,10)+".csv";
  document.body.appendChild(a);a.click();a.remove();
}
function renderCapture(){
  capFillCounty();   // re-runs on every render so a leader's county switch propagates
  capSetLane(capLaneCur);
  renderCapMine();
  renderCapLeader();
}
renderCapture();
/* Keep the auto-filled county in step if a leader switches counties while an
   ambassador is sitting on the capture screen. */
var capPrevRD=renderDynamic;
renderDynamic=function(){capPrevRD();capFillCounty();};

/* ================= Recording Studio (Teleprompter) =================
   Lives under Guides → everyone behind the Day PIN can view & record.
   Adding/editing scripts (title, event, due date, assignee, body) is
   leader-PIN only, so Laura (Marketing) owns the board. */
var TP_SEED = [{"id":"strafford-A","event":"Strafford County — Jul 11 · Rochester Fairgrounds","title":"Script A — Come As You Are","due":"2026-06-27","assignee":"","body":"Hey — I want to tell you about something happening right here in Strafford County. On Saturday, July 11th, from 2 to 5 in the afternoon, we're setting up at the Rochester Fairgrounds. No dress code, no expectations, no church background needed. Just come as you are. There's live music, real conversation, and a few hours to breathe. It's completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. July 11th, Rochester Fairgrounds, 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com for more.","done":null},{"id":"strafford-B","event":"Strafford County — Jul 11 · Rochester Fairgrounds","title":"Script B — Logistics / Urgency","due":"2026-06-27","assignee":"","body":"Mark your calendar — Saturday, July 11th, 2 to 5 PM, Rochester Fairgrounds. This is a one-day gathering for Strafford County. Bring your kids, your neighbors, whoever needs a reason to hope. It's outdoors, it's free, and it's built for anyone — whether you've never set foot in a church or you grew up in one and walked away. Live worship, real conversation, a chance to reset. We only get one shot at this in Strafford County this year — there isn't a second date. July 11th. Rochester Fairgrounds. 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.","done":null},{"id":"strafford-C","event":"Strafford County — Jul 11 · Rochester Fairgrounds","title":"Script C — Pain Point / Hope","due":"2026-06-27","assignee":"","body":"If you're tired — really tired, the kind sleep doesn't fix — I want you to hear this. On Saturday, July 11th, from 2 to 5 PM at the Rochester Fairgrounds, a group of us are gathering for one afternoon to remind Strafford County you are not forgotten and not too far gone. No judgment, no pressure — just an open field, real worship, and people who care whether you show up. You don't have to have it figured out. You don't have to carry it alone. Come as you are. July 11th, Rochester Fairgrounds, 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.","done":null},{"id":"carroll-A","event":"Carroll County — Jul 25 · King Pine Ski Area","title":"Script A — Come As You Are","due":"2026-07-11","assignee":"","body":"Hey — something's happening right here in Carroll County. Saturday, July 25th, 2 to 5 in the afternoon, at King Pine Ski Area in Madison. No dress code, no expectations, no church background needed — just come as you are. Live music, real conversation, a few hours to breathe. Completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. July 25th, King Pine, 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com.","done":null},{"id":"carroll-B","event":"Carroll County — Jul 25 · King Pine Ski Area","title":"Script B — Logistics / Urgency","due":"2026-07-11","assignee":"","body":"Mark your calendar — Saturday, July 25th, 2 to 5 PM, King Pine Ski Area in Madison. One-day gathering for Carroll County. Bring your kids, your neighbors, whoever needs a reason to hope. Outdoors, free, built for anyone — church background or none at all. Live worship, real conversation, a chance to reset. One shot at this in Carroll County this year — no second date. July 25th. King Pine. 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.","done":null},{"id":"carroll-C","event":"Carroll County — Jul 25 · King Pine Ski Area","title":"Script C — Pain Point / Hope","due":"2026-07-11","assignee":"","body":"If you're tired — really tired, the kind sleep doesn't fix — hear this. Saturday, July 25th, 2 to 5 PM at King Pine Ski Area, we're gathering for one afternoon to remind Carroll County you are not forgotten and not too far gone. No judgment, no pressure — an open field, real worship, people who care whether you show up. You don't have to have it figured out or carry it alone. Come as you are. July 25th, King Pine, 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.","done":null},{"id":"cheshire-A","event":"Cheshire County — Aug 15 · Cheshire Fair","title":"Script A — Come As You Are","due":"2026-08-01","assignee":"","body":"Hey — something's happening right here in Cheshire County. Saturday, August 15th, 2 to 5 in the afternoon, at the Cheshire Fair in Swanzey. No dress code, no expectations, no church background needed — just come as you are. Live music, real conversation, a few hours to breathe. Completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. August 15th, Cheshire Fair, 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com.","done":null},{"id":"cheshire-B","event":"Cheshire County — Aug 15 · Cheshire Fair","title":"Script B — Logistics / Urgency","due":"2026-08-01","assignee":"","body":"Mark your calendar — Saturday, August 15th, 2 to 5 PM, Cheshire Fair in Swanzey. One-day gathering for Cheshire County. Bring your kids, your neighbors, whoever needs a reason to hope. Outdoors, free, built for anyone — church background or none at all. Live worship, real conversation, a chance to reset. One shot at this in Cheshire County this year — no second date. August 15th. Cheshire Fair. 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.","done":null},{"id":"cheshire-C","event":"Cheshire County — Aug 15 · Cheshire Fair","title":"Script C — Pain Point / Hope","due":"2026-08-01","assignee":"","body":"If you're tired — really tired, the kind sleep doesn't fix — hear this. Saturday, August 15th, 2 to 5 PM at the Cheshire Fair, we're gathering for one afternoon to remind Cheshire County you are not forgotten and not too far gone. No judgment, no pressure — an open field, real worship, people who care whether you show up. You don't have to have it figured out or carry it alone. Come as you are. August 15th, Cheshire Fair, 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.","done":null},{"id":"belknap-A","event":"Belknap County — Aug 22 · Belknap 4-H Fairgrounds","title":"Script A — Come As You Are","due":"2026-08-08","assignee":"","body":"Hey — something's happening right here in Belknap County. Saturday, August 22nd, 2 to 5 in the afternoon, at the Belknap County 4-H Fairgrounds in Belmont. No dress code, no expectations, no church background needed — just come as you are. Live music, real conversation, a few hours to breathe. Completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. August 22nd, Belknap 4-H Fairgrounds, 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com.","done":null},{"id":"belknap-B","event":"Belknap County — Aug 22 · Belknap 4-H Fairgrounds","title":"Script B — Logistics / Urgency","due":"2026-08-08","assignee":"","body":"Mark your calendar — Saturday, August 22nd, 2 to 5 PM, Belknap County 4-H Fairgrounds in Belmont. One-day gathering for Belknap County. Bring your kids, your neighbors, whoever needs a reason to hope. Outdoors, free, built for anyone — church background or none at all. Live worship, real conversation, a chance to reset. One shot at this in Belknap County this year — no second date. August 22nd. Belmont. 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.","done":null},{"id":"belknap-C","event":"Belknap County — Aug 22 · Belknap 4-H Fairgrounds","title":"Script C — Pain Point / Hope","due":"2026-08-08","assignee":"","body":"If you're tired — really tired, the kind sleep doesn't fix — hear this. Saturday, August 22nd, 2 to 5 PM at the Belknap County 4-H Fairgrounds, we're gathering for one afternoon to remind Belknap County you are not forgotten and not too far gone. No judgment, no pressure — an open field, real worship, people who care whether you show up. You don't have to have it figured out or carry it alone. Come as you are. August 22nd, Belmont, 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.","done":null},{"id":"coos-A","event":"Coös County — Sep 5 · Gorham Town Common","title":"Script A — Come As You Are","due":"2026-08-22","assignee":"","body":"Hey — something's happening right here in Coös County. Saturday, September 5th, 2 to 5 in the afternoon, at the Gorham Town Common. No dress code, no expectations, no church background needed — just come as you are. Live music, real conversation, a few hours to breathe. Completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. September 5th, Gorham Town Common, 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com.","done":null},{"id":"coos-B","event":"Coös County — Sep 5 · Gorham Town Common","title":"Script B — Logistics / Urgency","due":"2026-08-22","assignee":"","body":"Mark your calendar — Saturday, September 5th, 2 to 5 PM, Gorham Town Common. One-day gathering for Coös County. Bring your kids, your neighbors, whoever needs a reason to hope. Outdoors, free, built for anyone — church background or none at all. Live worship, real conversation, a chance to reset. One shot at this in Coös County this year — no second date. September 5th. Gorham. 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.","done":null},{"id":"coos-C","event":"Coös County — Sep 5 · Gorham Town Common","title":"Script C — Pain Point / Hope","due":"2026-08-22","assignee":"","body":"If you're tired — really tired, the kind sleep doesn't fix — hear this. Saturday, September 5th, 2 to 5 PM at the Gorham Town Common, we're gathering for one afternoon to remind Coös County you are not forgotten and not too far gone. No judgment, no pressure — an open field, real worship, people who care whether you show up. You don't have to have it figured out or carry it alone. Come as you are. September 5th, Gorham, 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.","done":null},{"id":"rockingham-A","event":"Rockingham County — Oct 10 · Star Speedway","title":"Script A — Come As You Are","due":"2026-09-26","assignee":"","body":"Hey — something's happening right here in Rockingham County. Saturday, October 10th, 2 to 5 in the afternoon, at Star Speedway in Epping. No dress code, no expectations, no church background needed — just come as you are. Live music, real conversation, a few hours to breathe. Completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. October 10th, Star Speedway, 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com.","done":null},{"id":"rockingham-B","event":"Rockingham County — Oct 10 · Star Speedway","title":"Script B — Logistics / Urgency","due":"2026-09-26","assignee":"","body":"Mark your calendar — Saturday, October 10th, 2 to 5 PM, Star Speedway in Epping. This is the final stop of the tour this year. Bring your kids, your neighbors, whoever needs a reason to hope. Outdoors, free, built for anyone — church background or none at all. Live worship, real conversation, a chance to reset. One shot at this in Rockingham County — no second date. October 10th. Star Speedway. 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.","done":null},{"id":"rockingham-C","event":"Rockingham County — Oct 10 · Star Speedway","title":"Script C — Pain Point / Hope","due":"2026-09-26","assignee":"","body":"If you're tired — really tired, the kind sleep doesn't fix — hear this. Saturday, October 10th, 2 to 5 PM at Star Speedway, we're gathering for one afternoon to remind Rockingham County you are not forgotten and not too far gone. No judgment, no pressure — an open field, real worship, people who care whether you show up. You don't have to have it figured out or carry it alone. Come as you are. October 10th, Star Speedway, 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.","done":null},{"id":"sullivan-A","event":"Sullivan County — Jun 13 · Monadnock Park","title":"Script A — Come As You Are","due":"2026-05-30","assignee":"","body":"Hey — I want to tell you about something happening right here in Sullivan County. On Saturday, June 13th, from 2 to 5 in the afternoon, we're setting up at Monadnock Park in Claremont. No dress code, no expectations, no church background needed. Just come as you are. There's live music, real conversation, and a few hours to breathe. It's completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. June 13th, Monadnock Park, 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com for more.","done":null},{"id":"sullivan-B","event":"Sullivan County — Jun 13 · Monadnock Park","title":"Script B — Logistics / Urgency","due":"2026-05-30","assignee":"","body":"Mark your calendar — Saturday, June 13th, 2 to 5 PM, Monadnock Park in Claremont. This is a one-day gathering for Sullivan County. Bring your kids, your neighbors, whoever needs a reason to hope. It's outdoors, it's free, and it's built for anyone — whether you've never set foot in a church or you grew up in one and walked away. Live worship, real conversation, a chance to reset. We only get one shot at this in Sullivan County this year — there isn't a second date. June 13th. Monadnock Park. 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.","done":null},{"id":"sullivan-C","event":"Sullivan County — Jun 13 · Monadnock Park","title":"Script C — Pain Point / Hope","due":"2026-05-30","assignee":"","body":"If you're tired — really tired, the kind sleep doesn't fix — I want you to hear this. On Saturday, June 13th, from 2 to 5 PM at Monadnock Park in Claremont, a group of us are gathering for one afternoon to remind Sullivan County you are not forgotten and not too far gone. No judgment, no pressure — just an open field, real worship, and people who care whether you show up. You don't have to have it figured out. You don't have to carry it alone. Come as you are. June 13th, Monadnock Park, 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.","done":null},{"id":"grafton-A","event":"Grafton County — Jun 27 · Loon Mountain Resort","title":"Script A — Come As You Are","due":"2026-06-13","assignee":"","body":"Hey — something's happening right here in Grafton County. Saturday, June 27th, 2 to 5 in the afternoon, at Loon Mountain Resort in Lincoln. No dress code, no expectations, no church background needed — just come as you are. Live music, real conversation, a few hours to breathe. Completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. June 27th, Loon Mountain, 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com.","done":null},{"id":"grafton-B","event":"Grafton County — Jun 27 · Loon Mountain Resort","title":"Script B — Logistics / Urgency","due":"2026-06-13","assignee":"","body":"Mark your calendar — Saturday, June 27th, 2 to 5 PM, Loon Mountain Resort in Lincoln. One-day gathering for Grafton County. Bring your kids, your neighbors, whoever needs a reason to hope. Outdoors, free, built for anyone — church background or none at all. Live worship, real conversation, a chance to reset. One shot at this in Grafton County this year — no second date. June 27th. Loon Mountain. 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.","done":null},{"id":"grafton-C","event":"Grafton County — Jun 27 · Loon Mountain Resort","title":"Script C — Pain Point / Hope","due":"2026-06-13","assignee":"","body":"If you're tired — really tired, the kind sleep doesn't fix — hear this. Saturday, June 27th, 2 to 5 PM at Loon Mountain Resort in Lincoln, we're gathering for one afternoon to remind Grafton County you are not forgotten and not too far gone. No judgment, no pressure — an open field, real worship, people who care whether you show up. You don't have to have it figured out or carry it alone. Come as you are. June 27th, Loon Mountain, 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.","done":null}];
/* v1.2.0 — starter scripts also live in data/scripts.json (single source of truth on the deployed site). If present, it wins over the inline copy above. */
fetch("data/scripts.json").then(function(r){return r.ok?r.json():null;}).then(function(j){if(j&&j.length){TP_SEED=j;if(typeof renderPrompt==="function"&&!tpScripts().length)renderPrompt();}}).catch(function(){});

function tpScripts(){return (STATE.prompter&&STATE.prompter.scripts)||[];}
function tpById(id){return tpScripts().filter(function(x){return x.id===id;})[0]||TP_SEED.filter(function(x){return x.id===id;})[0];}
function tpTodayISO(){var d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function tpDueChip(s){
  if(s.done)return '<span class="duechip good">✅ done</span>';
  if(!s.due)return '<span class="duechip" style="background:#ece9df;color:var(--muted)">no due date</span>';
  var t=tpTodayISO();
  var days=Math.round((new Date(s.due+"T12:00")-new Date(t+"T12:00"))/86400000);
  if(days<0)return '<span class="duechip bad">⏱ overdue '+(-days)+'d</span>';
  if(days===0)return '<span class="duechip warn">⏳ due today</span>';
  if(days<=3)return '<span class="duechip warn">⏳ due in '+days+'d</span>';
  return '<span class="duechip good">due '+esc(s.due.slice(5).replace("-","/"))+'</span>';
}
function renderPrompt(){
  var board=document.getElementById("tpBoard");if(!board)return;
  var lock=document.getElementById("tpLock"),bar=document.getElementById("tpAddBar"),seedBtn=document.getElementById("tpSeedBtn");
  if(LEADER){lock.innerHTML="";bar.style.display="flex";seedBtn.style.display=tpScripts().length?"none":"block";}
  else{lock.innerHTML='<div class="lockbar">🔒 Scripts, due dates &amp; assignees are managed by leaders (Laura/Marketing).<button onclick="askPin(function(){})">Unlock</button></div>';bar.style.display="none";}
  var list=tpScripts(),localOnly=false;
  if(!list.length&&TP_SEED.length){list=TP_SEED.slice();localOnly=true;}
  if(!list.length){board.innerHTML='<div class="empty">No scripts yet. '+(LEADER?'Tap <b>Load starter scripts</b> above to seed all 8 counties.':'Leaders will load them shortly. 🎬')+'</div>';tpBadge();return;}
  var groups=[],map={};
  list.forEach(function(s){if(!(s.event in map)){map[s.event]=[];groups.push(s.event);}map[s.event].push(s);});
  board.innerHTML=(localOnly?'<div class="empty">👀 Previewing the built-in starter scripts (read-only board). Leaders: tap <b>Load starter scripts</b> to publish them for everyone.</div>':"")+groups.map(function(g){
    var rows=map[g].slice().sort(function(a,b){return (a.due||"9999")<(b.due||"9999")?-1:(a.due===b.due?(a.title<b.title?-1:1):1);}).map(function(s){
      return '<div class="tpcard'+(s.done?' done':'')+'">'
        +'<div class="info"><div class="t">'+esc(s.title)+'</div>'
        +'<div class="m">'+tpDueChip(s)
        +'<span class="who'+(s.assignee?'':' unset')+'">'+(s.assignee?'🎥 '+esc(s.assignee):'unassigned')+'</span>'
        +(s.done?'<span class="doneby">✅ '+esc(s.done.initials)+' · '+esc(s.done.date)+'</span>':'')
        +'</div></div>'
        +(LEADER&&!localOnly?'<button class="editb" onclick="tpOpenEditor(\''+esc(s.id)+'\')">✏️</button>':'')
        +'<button class="open" onclick="tpOpen(\''+esc(s.id)+'\')">Open ▶</button></div>';
    }).join("");
    return '<div class="tpgroup"><h3>'+esc(g)+'</h3>'+rows+'</div>';
  }).join("");
  tpBadge();
}
function tpBadge(){var e=document.getElementById("tpPill");if(!e)return;var n=tpScripts().filter(function(s){return !s.done;}).length;e.textContent=n;e.style.display=n?"flex":"none";}
function tpSeed(){
  if(!LEADER){askPin(tpSeed);return;}
  doAction("promptSeed",{scripts:TP_SEED},function(){if(!tpScripts().length)STATE.prompter={scripts:JSON.parse(JSON.stringify(TP_SEED))};});
}

/* ---- 10 script templates (v1.7.0) ----
   Every script has 10 versions/angles to start from. Picking one fills the
   title + body with the selected county's date & venue — then it's a normal,
   fully editable script like any other. */
var TP_TEMPLATES=[
  {letter:"A",name:"Come As You Are",body:function(c){return "Hey — I want to tell you about something happening right here in "+c.county+". On "+c.dateLong+", from 2 to 5 in the afternoon, we're setting up at "+countyPlace(c)+". No dress code, no expectations, no church background needed — just come as you are. There's live music, real conversation, and a few hours to breathe. It's completely free. We're not asking you to come to us — we're coming to you. If you've got questions, doubts, or you're just curious, this is for you. "+c.dateShort+", "+c.vshort+", 2 to 5 PM. Hope. Healing. Salvation. Look up kingdomtothecounties.com for more.";}},
  {letter:"B",name:"Logistics / Urgency",body:function(c){return "Mark your calendar — "+c.dateLong+", 2 to 5 PM, at "+countyPlace(c)+". This is a one-day gathering for "+c.county+". Bring your kids, your neighbors, whoever needs a reason to hope. It's outdoors, it's free, and it's built for anyone — whether you've never set foot in a church or you grew up in one and walked away. Live worship, real conversation, a chance to reset. We only get one shot at this in "+c.county+" this year — there isn't a second date. "+c.dateShort+". "+c.vshort+". 2 to 5 PM. Hope. Healing. Salvation. Everything you need is at kingdomtothecounties.com.";}},
  {letter:"C",name:"Pain Point / Hope",body:function(c){return "If you're tired — really tired, the kind sleep doesn't fix — I want you to hear this. On "+c.dateLong+", from 2 to 5 PM at "+countyPlace(c)+", a group of us are gathering for one afternoon to remind "+c.county+" you are not forgotten and not too far gone. No judgment, no pressure — just an open field, real worship, and people who care whether you show up. You don't have to have it figured out. You don't have to carry it alone. Come as you are. "+c.dateShort+", "+c.vshort+", 2 to 5 PM. Hope. Healing. Salvation. Find out more at kingdomtothecounties.com.";}},
  {letter:"D",name:"Personal Testimony",body:function(c){return "Can I get real with you for a second? There was a season of my life when I didn't think anything could change — and then Jesus met me right where I was. That's why I'm inviting you to this. On "+c.dateLong+", from 2 to 5 PM, we'll be at "+countyPlace(c)+" — live worship, real stories, real hope, and it's completely free. I'm not asking you to be religious. I'm asking you to come see what changed my life. "+c.dateShort+", "+c.vshort+", 2 to 5 PM. Hope. Healing. Salvation. Details at kingdomtothecounties.com.";}},
  {letter:"E",name:"Family & Kids",body:function(c){return "Parents — this one's for the whole crew. On "+c.dateLong+", from 2 to 5 PM, "+c.county+" is getting a free outdoor afternoon at "+countyPlace(c)+". Bring the kids, bring the grandparents, bring the neighbors. Live music, open space to run around, real community, and a message of hope your family can actually use. No cost, no dress code, no pressure — just show up. "+c.dateShort+", "+c.vshort+", 2 to 5 PM. Hope. Healing. Salvation. It's all at kingdomtothecounties.com.";}},
  {letter:"F",name:"For the Skeptic",body:function(c){return "Maybe church was never your thing. Maybe you've got more questions than answers — honestly, that's exactly who this is for. On "+c.dateLong+", from 2 to 5 PM at "+countyPlace(c)+", we're holding one open-air afternoon for "+c.county+". Nobody's going to corner you, and nobody's passing a plate. Come stand in the back with your arms crossed if you want — just come. Live music, real people, zero pressure, totally free. "+c.dateShort+", "+c.vshort+", 2 to 5 PM. Hope. Healing. Salvation. Look us up at kingdomtothecounties.com.";}},
  {letter:"G",name:"Come Back Home",body:function(c){return "This one's for everybody who grew up in church and walked away — or got hurt by it. I'm sorry. And I want you to know: this isn't that. On "+c.dateLong+", from 2 to 5 PM at "+countyPlace(c)+", we're gathering in an open field — no building, no membership, no strings. Just worship, honesty, and a God who never stopped waiting for you. If a part of you has been thinking about coming back, let this be the day. "+c.dateShort+", "+c.vshort+", 2 to 5 PM. Hope. Healing. Salvation. More at kingdomtothecounties.com.";}},
  {letter:"H",name:"Young Adults",body:function(c){return "Hey — if you're in your teens or twenties in "+c.county+" and it feels like nobody's talking about the stuff that actually matters — anxiety, purpose, where your life is going — this is for you. "+c.dateLong+", 2 to 5 PM, at "+countyPlace(c)+". Live music, real conversations, a free afternoon outside with people who actually care. Grab your friends and pull up. No church clothes, no weirdness — come as you are. "+c.dateShort+", "+c.vshort+", 2 to 5 PM. Hope. Healing. Salvation. kingdomtothecounties.com.";}},
  {letter:"I",name:"Bring Someone",body:function(c){return "Quick challenge for you: think of ONE person — a neighbor, a coworker, that family member you've been praying for. Got them? Now bring them to this. On "+c.dateLong+", from 2 to 5 PM, we're at "+countyPlace(c)+" for one afternoon of worship, hope, and real community for "+c.county+". It's free, it's outdoors, and it might be the exact invitation they've been waiting for. Don't just share the flyer — pick them up on the way. "+c.dateShort+", "+c.vshort+", 2 to 5 PM. Hope. Healing. Salvation. kingdomtothecounties.com.";}},
  {letter:"J",name:"Final Call / This Week",body:function(c){return "This is it, "+c.county+" — it's THIS Saturday. "+c.dateLong+", 2 to 5 PM, at "+countyPlace(c)+". One afternoon. Live worship, real hope, completely free, everybody welcome. Whatever your week has looked like, come breathe for a few hours. Rain or shine, we'll be looking for you — and bring somebody with you. There's no second date this year, so don't put it off. "+c.dateShort+". "+c.vshort+". 2 to 5 PM. Hope. Healing. Salvation. Last details at kingdomtothecounties.com.";}}
];

/* ---- Leader editor (add / edit / delete) ---- */
var tpEdId=null;
/* County & assignee are dropdowns (no typing venue strings or hunting for
   names) with an "Other…" escape hatch that reveals a free-text input. */
function tpFillEditorSelects(){
  var ev=document.getElementById("tpEdEvent");
  if(!ev.options.length)ev.innerHTML='<option value="">County / event…</option>'+COUNTIES.map(function(c){return '<option value="'+esc(c.event)+'">'+esc(c.event)+'</option>';}).join("")+'<option value="__other">Other / custom event…</option>';
  var who=document.getElementById("tpEdWho");
  if(!who.options.length)who.innerHTML='<option value="">Assignee — unassigned</option>'+LEADERS.map(function(l){return '<option value="'+esc(l.name)+'">'+esc(l.name)+'</option>';}).join("")+'<option value="__other">Other…</option>';
  var tpl=document.getElementById("tpEdTpl");
  if(!tpl.options.length)tpl.innerHTML='<option value="">📋 Fill from a template — '+TP_TEMPLATES.length+' versions, all editable…</option>'+TP_TEMPLATES.map(function(t,i){return '<option value="'+i+'">Script '+t.letter+' — '+esc(t.name)+'</option>';}).join("");
}
function tpEdEventChange(){document.getElementById("tpEdEventOther").style.display=document.getElementById("tpEdEvent").value==="__other"?"block":"none";}
function tpEdWhoChange(){document.getElementById("tpEdWhoOther").style.display=document.getElementById("tpEdWho").value==="__other"?"block":"none";}
function tpEdSetEvent(evStr){
  var sel=document.getElementById("tpEdEvent"),oth=document.getElementById("tpEdEventOther");
  oth.value="";
  if(evStr&&COUNTIES.some(function(c){return c.event===evStr;}))sel.value=evStr;
  else if(evStr){sel.value="__other";oth.value=evStr;}
  else sel.value="";
  tpEdEventChange();
}
function tpEdSetWho(who){
  var sel=document.getElementById("tpEdWho"),oth=document.getElementById("tpEdWhoOther");
  oth.value="";
  if(!who)sel.value="";
  else if(LEADERS.some(function(l){return l.name===who;}))sel.value=who;
  else{sel.value="__other";oth.value=who;}
  tpEdWhoChange();
}
function tpEdEventVal(){var v=document.getElementById("tpEdEvent").value;return v==="__other"?document.getElementById("tpEdEventOther").value.trim():v;}
function tpEdWhoVal(){var v=document.getElementById("tpEdWho").value;return v==="__other"?document.getElementById("tpEdWhoOther").value.trim():v;}
function tpEdCounty(){var v=document.getElementById("tpEdEvent").value;return COUNTIES.filter(function(c){return c.event===v;})[0]||null;}
function tpApplyTpl(){
  var sel=document.getElementById("tpEdTpl");
  if(sel.value==="")return;
  var t=TP_TEMPLATES[+sel.value];sel.value="";
  if(!t)return;
  var c=tpEdCounty();
  if(!c){toast("📍 Pick the county first — the template fills in its date & venue");flash("tpEdEvent");return;}
  var body=document.getElementById("tpEdBody");
  if((body.textContent||"").trim()&&!confirm("Replace the current script text with the “"+t.name+"” template?"))return;
  document.getElementById("tpEdName").value="Script "+t.letter+" — "+t.name;
  body.innerHTML=esc(t.body(c));
  toast("📋 Template loaded — tweak anything you like");
}
function tpOpenEditor(id){
  if(!LEADER){askPin(function(){tpOpenEditor(id);});return;}
  tpEdId=id;
  var s=id?tpById(id):null;
  tpFillEditorSelects();
  document.getElementById("tpEdTitle").textContent=id?"Edit script ✏️":"New script ＋";
  tpEdSetEvent(s?s.event:(tpScripts().length?tpScripts()[tpScripts().length-1].event:""));
  document.getElementById("tpEdName").value=s?s.title:"";
  document.getElementById("tpEdDue").value=s?s.due:"";
  tpEdSetWho(s?s.assignee:"");
  document.getElementById("tpEdTpl").value="";
  document.getElementById("tpEdBody").innerHTML=s?s.body:"";
  document.getElementById("tpEdDel").style.display=id?"block":"none";
  document.getElementById("tpEditor").classList.add("show");
}
function tpFmt(cmd){document.getElementById("tpEdBody").focus();document.execCommand(cmd,false,null);}
function tpSaveEditor(){
  if(!LEADER){askPin(function(){});return;}
  var ev=tpEdEventVal(),ti=document.getElementById("tpEdName").value.trim();
  if(!ev||!ti){flash(ev?"tpEdName":(document.getElementById("tpEdEvent").value==="__other"?"tpEdEventOther":"tpEdEvent"));return;}
  var patch={event:ev,title:ti,due:document.getElementById("tpEdDue").value,assignee:tpEdWhoVal(),body:document.getElementById("tpEdBody").innerHTML.trim()};
  if(tpEdId){
    doAction("promptEdit",{id:tpEdId,patch:patch},function(){var s=tpById(tpEdId);if(s)Object.assign(s,patch);});
  }else{
    var rec=Object.assign({id:uid(),done:null},patch);
    doAction("promptAdd",{script:rec},function(){tpScripts().push(rec);});
  }
  // Editing from inside the teleprompter: refresh the rolling text in place.
  if(tpEdId&&tpEdId===tpCurId&&document.getElementById("tpApp").classList.contains("show")){
    tpTextEl.innerHTML=patch.body;
    document.getElementById("tpLabel").textContent=patch.event.split("—")[0].trim()+" · "+patch.title;
    tpUpdateEta();
  }
  document.getElementById("tpEditor").classList.remove("show");
}
function tpDelete(){
  if(!tpEdId||!LEADER)return;
  if(!confirm("Delete this script for everyone? This can't be undone."))return;
  var id=tpEdId;
  doAction("promptDelete",{id:id},function(){STATE.prompter.scripts=tpScripts().filter(function(x){return x.id!==id;});});
  document.getElementById("tpEditor").classList.remove("show");
}

/* ---- Teleprompter overlay ---- */
/* v1.14.2 — tpBase halved (0.6 → 0.3 px/frame). Measured on a 390px phone at
   the stock 28px font, 0.6 scrolled ~220 wpm, so filmers had to thumb the
   speed down before every take; 0.3 lands at ~110 wpm, a natural on-camera
   pace. The badge still reads 1.0× and the ⟨⟨ / ⟩⟩ range is unchanged, so
   anyone who wants the old pace taps up to 2.0×. */
var tpCurId=null,tpFontSize=28,tpSpeed=1.0,tpBase=0.3,tpPlaying=false,tpPos=0,tpFacing="user",tpStream=null,tpRAF=null;
var tpRecorder=null,tpChunks=[],tpRecording=false,tpSecs=0,tpTimer=null,tpBlob=null,tpTipsSeen=false;
var tpTrack=document.getElementById("tpTrack"),tpTextEl=document.getElementById("tpText");
function tpOpen(id){
  tpCurId=id;var s=tpById(id);if(!s)return;
  tpTextEl.innerHTML=s.body;
  document.getElementById("tpLabel").textContent=s.event.split("—")[0].trim()+" · "+s.title;
  tpResetPos();tpSetPlaying(false);tpUpdateEta();
  document.getElementById("tpPost").classList.remove("show");
  document.getElementById("tpApp").classList.add("show");
  document.body.style.overflow="hidden";
  if(!tpTipsSeen){document.getElementById("tpTips").classList.add("show");tpTipsSeen=true;}
  tpWakeOn();tpStartCam(tpFacing);tpLoop();
}
function tpClose(){
  if(tpRecording)return;
  tpPracticeMode=false;
  document.getElementById("tpApp").classList.remove("show");
  document.body.style.overflow="";
  tpWakeOff();tpStopCam();if(tpRAF){cancelAnimationFrame(tpRAF);tpRAF=null;}
  renderPrompt();
}
document.getElementById("tpBack").addEventListener("click",tpClose);
document.getElementById("tpTipsBtn").addEventListener("click",function(){document.getElementById("tpTips").classList.add("show");});
function tpStartCam(mode){
  tpStopCam();
  navigator.mediaDevices.getUserMedia({video:{facingMode:mode},audio:true}).then(function(st){
    tpStream=st;var v=document.getElementById("tpCam");v.srcObject=st;v.classList.toggle("rear",mode==="environment");
    document.getElementById("tpPerm").style.display="none";
  }).catch(function(err){tpShowPerm(err);});
}
var tpWake=null,tpPracticeMode=false;
function tpWakeOn(){try{if(navigator.wakeLock&&navigator.wakeLock.request){navigator.wakeLock.request("screen").then(function(w){tpWake=w;}).catch(function(){});}}catch(_){}}
function tpWakeOff(){try{if(tpWake){tpWake.release().catch(function(){});tpWake=null;}}catch(_){}}
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&document.getElementById("tpApp").classList.contains("show"))tpWakeOn();});
function tpPermSteps(){
  var ua=navigator.userAgent||"";
  var isIOS=/iPhone|iPad|iPod/i.test(ua);
  var isCriOS=/CriOS/i.test(ua);
  var isAndroid=/Android/i.test(ua);
  if(isIOS&&isCriOS)return "<b>iPhone · Chrome</b><ol><li>Open the iPhone <b>Settings</b> app</li><li>Scroll down and tap <b>Chrome</b></li><li>Turn ON <b>Camera</b> and <b>Microphone</b></li><li>Come back and tap Try again</li></ol>";
  if(isIOS)return "<b>iPhone · Safari</b><ol><li>Tap the <b>aA</b> button in the address bar</li><li>Tap <b>Website Settings</b></li><li>Set Camera and Microphone to <b>Allow</b></li><li>Tap Try again below</li></ol>No aA button? iPhone <b>Settings → Apps → Safari → Camera / Microphone → Allow</b>.";
  if(isAndroid)return "<b>Android</b><ol><li>Tap the <b>🔒</b> (or ⓘ) icon by the address bar</li><li>Tap <b>Permissions</b></li><li>Allow <b>Camera</b> and <b>Microphone</b></li><li>Tap Try again below</li></ol>";
  return "<b>Computer</b><ol><li>Click the <b>🔒 / camera</b> icon in the address bar</li><li>Set Camera and Microphone to <b>Allow</b></li><li>Click Try again below</li></ol>";
}
function tpShowPerm(err){
  var p=document.getElementById("tpPerm");p.style.display="flex";
  p.innerHTML='<div style="font-size:34px">🎥🚫</div><div style="font-weight:800;font-size:17px">Camera &amp; mic are blocked</div><div class="pbox">'+tpPermSteps()+'</div><div class="pbtns"><button class="try" onclick="tpStartCam(tpFacing)">↻ Try again</button><button class="prac" onclick="tpPractice()">📖 Practice without camera</button><button class="bk" onclick="tpForceClose()">‹ Back to scripts</button></div><div style="font-size:11px;color:#8b867e">'+esc((err&&err.message)||"")+'</div>';
}
function tpPractice(){tpPracticeMode=true;document.getElementById("tpPerm").style.display="none";toast("📖 Practice mode — the prompter works, recording needs the camera");}
function tpForceClose(){
  tpPracticeMode=false;
  document.getElementById("tpPerm").style.display="none";
  document.getElementById("tpApp").classList.remove("show");
  document.body.style.overflow="";
  tpWakeOff();tpStopCam();if(tpRAF){cancelAnimationFrame(tpRAF);tpRAF=null;}
  renderPrompt();
}
function tpStopCam(){if(tpStream){tpStream.getTracks().forEach(function(t){t.stop();});tpStream=null;}}
document.getElementById("tpFlip").addEventListener("click",function(){if(tpRecording)return;tpFacing=tpFacing==="user"?"environment":"user";tpStartCam(tpFacing);});
document.getElementById("tpFontUp").addEventListener("click",function(){tpFontSize=Math.min(tpFontSize+4,96);tpTextEl.style.fontSize=tpFontSize+"px";});
document.getElementById("tpFontDown").addEventListener("click",function(){tpFontSize=Math.max(tpFontSize-4,14);tpTextEl.style.fontSize=tpFontSize+"px";});
document.getElementById("tpSpeedUp").addEventListener("click",function(){tpSpeed=Math.min(tpSpeed+0.1,4);document.getElementById("tpSpeedVal").textContent=tpSpeed.toFixed(1)+"×";tpUpdateEta();});
document.getElementById("tpSpeedDown").addEventListener("click",function(){tpSpeed=Math.max(tpSpeed-0.1,0.1);document.getElementById("tpSpeedVal").textContent=tpSpeed.toFixed(1)+"×";tpUpdateEta();});
function tpLoop(){
  if(!document.getElementById("tpApp").classList.contains("show")){tpRAF=null;return;}
  if(tpPlaying){tpPos+=tpBase*tpSpeed;tpTrack.style.transform="translateY(-"+tpPos+"px)";}
  tpProgTick();
  tpRAF=requestAnimationFrame(tpLoop);
}
/* v1.2.0 — progress bar across the top of the studio */
function tpProgTick(){
  var bar=document.getElementById("tpProg");if(!bar)return;
  var total=Math.max(1,tpTrack.scrollHeight-innerHeight*0.8);
  var pct=Math.max(0,Math.min(100,tpPos/total*100));
  bar.firstElementChild.style.width=pct+"%";
}
function tpSetPlaying(v){tpPlaying=v;document.getElementById("tpPlay").textContent=v?"⏸ Pause":"▶ Play";}
document.getElementById("tpPlay").addEventListener("click",function(){tpSetPlaying(!tpPlaying);});
function tpResetPos(){tpPos=0;tpTrack.style.transform="translateY(0)";}
document.getElementById("tpReset").addEventListener("click",tpResetPos);
function tpMime(){var o=["video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];for(var i=0;i<o.length;i++){if(window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(o[i]))return o[i];}return "";}
function tpFmtTime(s){return String(Math.floor(s/60)).padStart(2,"0")+":"+String(Math.floor(s%60)).padStart(2,"0");}
/* v1.2.0 — estimated runtime at current speed (~140 wpm at 1.0×) */
function tpUpdateEta(){var el=document.getElementById("tpEta");if(!el)return;var w=(tpTextEl.textContent||"").trim().split(/\s+/).filter(Boolean).length;var secs=Math.round(w/(140*tpSpeed)*60);el.textContent="~"+tpFmtTime(secs);}
function tpStartRec(){
  if(!tpStream){if(tpPracticeMode)toast("📖 Practice mode — recording needs the camera");return;}
  tpChunks=[];var mt=tpMime();
  try{tpRecorder=mt?new MediaRecorder(tpStream,{mimeType:mt}):new MediaRecorder(tpStream);}catch(e){tpRecorder=new MediaRecorder(tpStream);}
  tpRecorder.ondataavailable=function(e){if(e.data&&e.data.size>0)tpChunks.push(e.data);};
  tpRecorder.onstop=function(){
    tpBlob=new Blob(tpChunks,{type:tpRecorder.mimeType||"video/webm"});
    var url=URL.createObjectURL(tpBlob),ext=(tpRecorder.mimeType||"").indexOf("mp4")>=0?"mp4":"webm";
    var a=document.getElementById("tpDl");a.href=url;a.download="k2c-"+tpCurId+"-"+Date.now()+"."+ext;
    document.getElementById("tpPost").classList.add("show");
  };
  tpRecorder.start(1000);
  tpRecording=true;tpSecs=0;var tEl=document.getElementById("tpRecTime");tEl.textContent="00:00";tEl.style.color="";
  document.getElementById("tpRecInd").classList.add("show");
  document.getElementById("tpRecBtn").classList.add("recording");
  /* Gentle pacing nudges: 30–60s is the sweet spot. Never stops the take —
     just toasts + a color shift on the timer if the presenter runs long. */
  tpTimer=setInterval(function(){
    tpSecs++;var tEl=document.getElementById("tpRecTime");tEl.textContent=tpFmtTime(tpSecs);
    if(tpSecs===30){vibr(30);toast("⏱ 30 seconds — you're in the sweet spot. Start heading for the close.");}
    else if(tpSecs===45){vibr(30);tEl.style.color="#f6c344";toast("⏱ 15 seconds to the 60s mark — time to wrap up.");}
    else if(tpSecs===60){vibr([40,60,40]);tEl.style.color="#ff6b5e";toast("⏱ 60 seconds — finish your thought and land it. Still recording 🎥");}
    else if(tpSecs===180){toast("⏱ 3 minutes — long takes make huge files on phones. Consider a fresh, shorter take.");}
  },1000);
  if(!tpPlaying)tpSetPlaying(true);
}
function tpStopRec(){
  if(tpRecorder&&tpRecorder.state!=="inactive")tpRecorder.stop();
  tpRecording=false;
  document.getElementById("tpRecInd").classList.remove("show");
  document.getElementById("tpRecBtn").classList.remove("recording");
  clearInterval(tpTimer);tpSetPlaying(false);
}
function tpCountdownRun(cb){
  var n=3,el=document.getElementById("tpCountdown");
  el.classList.add("show");el.textContent=n;
  var iv=setInterval(function(){n--;if(n===0){el.textContent="●";}else if(n<0){clearInterval(iv);el.classList.remove("show");cb();}else{el.textContent=n;}},700);
}
document.getElementById("tpRecBtn").addEventListener("click",function(){
  if(tpRecording){tpStopRec();}
  else{document.getElementById("tpPost").classList.remove("show");tpCountdownRun(tpStartRec);}
});
document.getElementById("tpAgain").addEventListener("click",function(){document.getElementById("tpPost").classList.remove("show");tpResetPos();tpSetPlaying(false);});
document.getElementById("tpShare").addEventListener("click",function(){
  if(!tpBlob){alert("Record something first!");return;}
  var ext=(tpBlob.type||"").indexOf("mp4")>=0?"mp4":"webm";
  var file=new File([tpBlob],"k2c-"+tpCurId+"."+ext,{type:tpBlob.type});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    navigator.share({files:[file],title:"K2C video for Laura"}).catch(function(){});
  }else{
    alert("Sharing isn't supported in this browser — tap ⬇ Save instead, then send the file to Laura from your Photos/Files app.");
  }
});
/* ---- Mark done ---- */
document.getElementById("tpMarkDone").addEventListener("click",function(){
  document.getElementById("tpInitials").value=MY.name||"";
  document.getElementById("tpDoneModal").classList.add("show");
  setTimeout(function(){document.getElementById("tpInitials").focus();},60);
});
function tpConfirmDone(){
  var nm=document.getElementById("tpInitials").value.trim();
  if(!nm){flash("tpInitials");return;}
  rememberName(nm);
  var init=nm;
  var d=new Date(),date=(d.getMonth()+1)+"/"+d.getDate();
  var id=tpCurId;
  doAction("promptDone",{id:id,initials:init,date:date},function(){var s=tpById(id);if(s)s.done={initials:init,date:date};});
  document.getElementById("tpDoneModal").classList.remove("show");
  tpClose();
}
/* keep the board fresh with the rest of the app */
/* v1.2.0 — tap the script to pause/resume; drag to scrub */
(function(){
  var wrap=document.getElementById("tpWrap");if(!wrap)return;
  var startY=0,startPos=0,moved=false,down=false;
  wrap.addEventListener("pointerdown",function(e){down=true;moved=false;startY=e.clientY;startPos=tpPos;if(wrap.setPointerCapture)try{wrap.setPointerCapture(e.pointerId);}catch(err){}});
  wrap.addEventListener("pointermove",function(e){
    if(!down)return;
    var dy=e.clientY-startY;
    if(Math.abs(dy)>8)moved=true;
    if(moved){tpPos=Math.max(0,startPos-dy);tpTrack.style.transform="translateY(-"+tpPos+"px)";tpProgTick();}
  });
  wrap.addEventListener("pointerup",function(){if(down&&!moved)tpSetPlaying(!tpPlaying);down=false;});
  wrap.addEventListener("pointercancel",function(){down=false;});
})();
/* v1.2.0 — mirror text for reflector-style teleprompter rigs */
document.getElementById("tpMirror").addEventListener("click",function(){var w=document.getElementById("tpWrap");w.classList.toggle("mirror");this.classList.toggle("on",w.classList.contains("mirror"));});
/* v1.5.0 — voice follow removed (unreliable in the field). Pacing options:
   auto-scroll (▶ Play), or drag the script with a finger while talking. */
document.getElementById("tpEdit").addEventListener("click",function(){
  if(tpRecording){toast("⏹ Stop recording first");return;}
  tpOpenEditor(tpCurId);
});
var tpPrevRD=renderDynamic;renderDynamic=function(){tpPrevRD();renderPrompt();};
PARENT.prompter="guides";
renderPrompt();
