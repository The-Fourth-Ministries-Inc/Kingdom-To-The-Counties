/* ===== Worship sets on the Now tab — edit & Planning Center sync (v1.23.0) =====
   Loaded before app-core.js. The songs under each worship set used to be
   hardcoded (SETLISTS_DEFAULT in app-core.js) with no way to change them.
   Each event now carries its own sets on the server (STATE.sets):

   • ⟳ Sync from Planning Center (leaders) reads the event's "K2C Day" plan:
     the songs in plan order, grouped into a set by the non-song items between
     them (TTT, Gospel Presentation…), with the key from the item and the lead
     from its Description. The server also does this every hour.
   • ✏️ Edit sets (leaders) changes any song, key or lead by hand. A hand edit
     pauses the hourly sync for that event so a day-of fix isn't overwritten;
     tapping Sync again is the way back to Planning Center.

   With nothing saved for the event yet, the built-in list still shows.
   Uses app-core globals (STATE, SETLISTS_DEFAULT, esc, LEADER, askPin, LIVE,
   queueWrite, apiPost, refreshFromServer, toast, myTag, renderSpine) at call
   time only. */

var wsEditing=false,wsDraft=null,wsSnap="",wsBusy=false;

function wsNames(){return Object.keys(SETLISTS_DEFAULT);}
function wsLive(){return (typeof STATE!=="undefined"&&STATE&&STATE.sets&&STATE.sets.sets)?STATE.sets.sets:null;}
/* The songs shown for one Now-tab segment. */
function wsSongsFor(name){
  var live=wsLive();
  return live?(live[name]||null):(SETLISTS_DEFAULT[name]||null);
}
function wsWhen(iso){
  try{var d=new Date(iso);if(isNaN(d.getTime()))return "";return d.toLocaleString(undefined,{weekday:"short",hour:"numeric",minute:"2-digit"});}catch(_){return "";}
}
function wsSourceLine(){
  var st=(typeof STATE!=="undefined"&&STATE)?STATE.sets:null;
  if(!st||!st.source)return "Songs: built-in list — not synced from Planning Center yet.";
  if(st.source==="pco")return "Songs from Planning Center"+(st.pco&&st.pco.title?(" · "+st.pco.title):"")+(st.savedAt?(" · synced "+wsWhen(st.savedAt)):"");
  return "Songs edited"+(st.savedBy?(" by "+st.savedBy):"")+(st.savedAt?(" · "+wsWhen(st.savedAt)):"")+" · hourly Planning Center sync paused for this event";
}

/* Called at the end of every renderSpine(). Never redraws an open editor —
   the 15-second schedule refresh would wipe what someone is typing. */
function wsRenderBar(){if(!wsEditing)wsDraw();}
function wsDraw(){
  var el=document.getElementById("setsBar");
  if(!el)return;
  el.innerHTML=wsEditing?wsEditorHtml():wsViewHtml();
}
function wsViewHtml(){
  var st=STATE.sets,warn="";
  if(LEADER&&st&&st.warnings&&st.warnings.length)warn='<div class="wswarn">⚠ '+st.warnings.map(esc).join("<br>⚠ ")+'</div>';
  var lock=LEADER?"":'<span class="lk">🔒</span>';
  return '<div class="wsbar"><span class="wssrc">'+esc(wsSourceLine())+'</span>'+warn+
    '<span class="wsacts"><button class="iobtn" onclick="wsSync()"'+(wsBusy?" disabled":"")+'>'+(wsBusy?"Syncing…":"⟳ Sync from Planning Center")+lock+'</button>'+
    '<button class="iobtn" onclick="wsEdit()">✏️ Edit sets'+lock+'</button></span></div>';
}
function wsEditorHtml(){
  var names=wsNames();
  return '<div class="wsedit"><div class="ioedbar"><button class="cancel" onclick="wsCancel()">Cancel</button><button class="save" onclick="wsSave()">✓ Save</button></div>'+
    '<p class="iohint">Lead can be more than one line, e.g. “Karielle - V1” then “Angel - melody”. Saving pauses the hourly Planning Center sync for this event.</p>'+
    names.map(function(n,si){
      var rows=(wsDraft[n]||[]).map(function(s,ri){
        return '<div class="wsrow">'+
          '<span class="iomv"><button onclick="wsMove('+si+','+ri+',-1)" aria-label="Move up">▲</button><button onclick="wsMove('+si+','+ri+',1)" aria-label="Move down">▼</button></span>'+
          '<label class="iofield grow"><span>Song</span><input value="'+esc(s.title)+'" oninput="wsSet('+si+','+ri+',\'title\',this.value)"></label>'+
          '<label class="iofield w"><span>Key</span><input value="'+esc(s.key)+'" oninput="wsSet('+si+','+ri+',\'key\',this.value)"></label>'+
          '<label class="iofield grow"><span>Lead</span><textarea rows="2" oninput="wsSet('+si+','+ri+',\'lead\',this.value)">'+esc(s.lead)+'</textarea></label>'+
          '<button class="iodel" onclick="wsDel('+si+','+ri+')" aria-label="Remove song">✕</button></div>';
      }).join("");
      return '<div class="wsset"><h4>'+esc(n)+'</h4>'+(rows||'<p class="iohint">No songs.</p>')+
        '<button class="ioaddperf" onclick="wsAdd('+si+')">＋ Add a song</button></div>';
    }).join("")+
    '<div class="ioedbar"><button class="cancel" onclick="wsCancel()">Cancel</button><button class="save" onclick="wsSave()">✓ Save</button></div></div>';
}

function wsEdit(){
  if(!LEADER){askPin(wsEdit);return;}
  var live=wsLive(),d={};
  wsNames().forEach(function(n){d[n]=JSON.parse(JSON.stringify((live?live[n]:SETLISTS_DEFAULT[n])||[])).map(function(s){return {title:s.title||"",key:s.key||"",lead:s.lead||""};});});
  wsDraft=d;wsSnap=JSON.stringify(d);wsEditing=true;wsDraw();
}
function wsCancel(){
  if(JSON.stringify(wsDraft)!==wsSnap&&!confirm("Discard your changes to the worship sets?"))return;
  wsEditing=false;wsDraft=null;wsDraw();
}
function wsSet(si,ri,field,val){var a=wsDraft[wsNames()[si]];if(a&&a[ri])a[ri][field]=val;}
function wsAdd(si){wsDraft[wsNames()[si]].push({title:"",key:"",lead:""});wsDraw();}
function wsDel(si,ri){wsDraft[wsNames()[si]].splice(ri,1);wsDraw();}
function wsMove(si,ri,d){
  var a=wsDraft[wsNames()[si]],j=ri+d;
  if(j<0||j>=a.length)return;
  var t=a[ri];a[ri]=a[j];a[j]=t;wsDraw();
}
function wsSave(){
  var sets={},by=myTag()||"Leader";
  wsNames().forEach(function(n){
    sets[n]=(wsDraft[n]||[]).map(function(s){return {title:String(s.title||"").trim(),key:String(s.key||"").trim(),lead:String(s.lead||"").trim()};})
      .filter(function(s){return s.title;});
  });
  wsEditing=false;wsDraft=null;
  queueWrite("setSets",{sets:sets,by:by},function(){
    var cur=STATE.sets||{};
    STATE.sets={rev:(Number(cur.rev)||0)+1,source:"manual",savedAt:new Date().toISOString(),savedBy:by,pco:cur.pco||null,warnings:[],sets:sets};
  },function(){renderSpine();});
  toast("Worship sets saved");
}
function wsSync(){
  if(!LEADER){askPin(wsSync);return;}
  if(wsBusy)return;
  if(!LIVE){toast("You're offline — syncing needs a connection.");return;}
  if(STATE.sets&&STATE.sets.source==="manual"&&!confirm("Replace the hand-edited sets with what's in Planning Center now?"))return;
  wsBusy=true;wsDraw();
  apiPost("pcoSync",{by:myTag()||"Leader"}).then(function(r){
    wsBusy=false;
    var msg="Synced "+((r&&r.songs)||0)+" songs"+(r&&r.plan?(" from "+r.plan):"");
    if(r&&r.warnings&&r.warnings.length)msg+=" — check the warning under the schedule";
    toast(msg);
    return refreshFromServer();
  }).catch(function(e){
    wsBusy=false;wsDraw();
    if(e===501)toast("Planning Center isn't connected yet — see the README (PCO_APP_ID / PCO_SECRET).");
    else if(e===404)toast("No K2C Day plan in Planning Center matches this event's date or location.");
    else if(e===502)toast("Planning Center didn't answer — try again in a minute.");
    else if(e!==403)toast("Couldn't sync — try again.");
  });
}
