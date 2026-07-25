/* ================= Pre-Crusade Mobilization (v1.8.0) =================
   Season-long church CRM. The roster lives in its own blob and is fetched
   separately (GET ?part=churches, own ETag) so the 5-second poll stays light;
   the main payload only carries churchesRev, and phones re-download the list
   ONLY when that rev changes. The last good copy is cached in localStorage so
   the tab opens instantly, even offline. Every outreach action an ambassador
   takes (call / text / email / script / note) is logged to that church's
   history AND the global change log — that's the collaboration layer. */
var NHC=["Belknap","Carroll","Cheshire","Coös","Grafton","Hillsborough","Merrimack","Rockingham","Strafford","Sullivan"];
var CH={rev:-1,list:[],log:[]};
function chFix(o){if(o){if(!Array.isArray(o.list))o.list=[];if(!Array.isArray(o.log))o.log=[];if(!o.tpl||typeof o.tpl!=="object")o.tpl={};o.list.forEach(function(c){if(!Array.isArray(c.connections))c.connections=[];});}return o;}
try{var _chc=JSON.parse(localStorage.getItem("k2c_churches")||"null");if(_chc&&Array.isArray(_chc.list))CH=chFix(_chc);}catch(_){}
var chEtag="",chFetching=false,chView="all",chQ="",chCounty="",chCurId=null,chEditOpen=false,chFlagOpen=false;
var CH_ICON={call:"📞",text:"💬",email:"✉️",convo:"🗣️",visit:"🤝",script:"📣",share:"📲",note:"📝",connect:"🙋",flag:"🚩",unflag:"✅",edit:"✏️",add:"➕",interest:"⭐","delete":"🗑"};
/* "Engaged" (we've actually talked with them) is MANUAL ONLY — a 🗣️
   conversation record an ambassador types in. Tapping Call/Text/Email logs
   history but never flips a church to engaged on its own. */
var CH_ENGAGE={convo:1};
function chSave(){try{localStorage.setItem("k2c_churches",JSON.stringify(CH));}catch(_){}}
function chId(id){return (id||"").toString().replace(/[^a-zA-Z0-9_-]/g,"").slice(0,40);}
function chStamp(){return{t:nowLabel(),d:dateKey(new Date())};}
function chWhen(e){return (e.d?chFmtD(e.d)+" · ":"")+(e.t||"");}
function chFmtD(d){var p=(d||"").split("-");if(p.length<3)return d||"";var mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(p[1])-1]||"";return mo+" "+Number(p[2]);}
function chById(id){for(var i=0;i<CH.list.length;i++)if(CH.list[i].id===id)return CH.list[i];return null;}
function chLogFor(id){return CH.log.filter(function(e){return e.ch===id;});}
function chLastEngage(id){var l=CH.log;for(var i=l.length-1;i>=0;i--)if(l[i].ch===id&&CH_ENGAGE[l[i].type])return l[i];return null;}
function chDigits(p){var d=(p||"").replace(/\D/g,"");if(d.length===11&&d.charAt(0)==="1")d=d.slice(1);return d;}
function chOnMob(){var p=document.querySelector(".page.active");p=p?p.id:"";return p==="page-mobilize"||p==="page-church";}
function chMaybeSync(){if(chOnMob()&&STATE.churchesRev!=null&&STATE.churchesRev!==CH.rev)chFetch(true);}
function chFetch(force){
  if(chFetching)return;
  if(!force&&CH.list.length&&STATE.churchesRev!=null&&STATE.churchesRev===CH.rev)return;
  chFetching=true;
  var h=authHeaders();if(chEtag)h["If-None-Match"]=chEtag;
  fetch(API+"?part=churches",{headers:h}).then(function(r){
    if(r.status===304)return null;
    if(!r.ok)throw 0;
    var et=r.headers.get("ETag");if(et)chEtag=et;
    return r.json();
  }).then(function(d){
    chFetching=false;
    if(d&&Array.isArray(d.list)){CH=chFix(d);chSave();chRenderAll();}
  }).catch(function(){chFetching=false;});
}
function chRenderAll(){
  if(userEditing())return; // don't clobber a half-typed form; next sync re-renders
  renderMobilize();
  var pg=document.getElementById("page-church");
  if(pg&&pg.classList.contains("active"))renderChurchPage();
}
/* Optimistic write: apply to the cached copy instantly, push to the server,
   then re-download the server-normalized truth (which also bumps rev). */
function chAction(action,payload,localApply){
  if(!LIVE){toast("📶 No connection — try again when you're back online");return false;}
  if(localApply){localApply();chSave();chRenderAll();}
  apiPost(action,payload).then(function(){chFetch(true);}).catch(function(){});
  return true;
}
function chMe(cb){if(myTag())cb();else askName(function(){cb();});}
/* ---- list page ---- */
function chSetQ(v){chQ=(v||"").toLowerCase();chRenderList();}
function chSetCounty(v){chCounty=v;chRenderList();}
function chSetView(v){chView=v;var b=document.querySelectorAll("#chViews button");for(var i=0;i<b.length;i++)b[i].classList.toggle("on",b[i].getAttribute("data-v")===v);chRenderList();}
function chMatches(c){
  if(chCounty&&c.county!==chCounty)return false;
  if(chQ){var hay=(c.name+" "+c.town+" "+c.county+" "+c.leader+" "+c.contact+" "+c.notes).toLowerCase();if(hay.indexOf(chQ)<0)return false;}
  var eng=!!chLastEngage(c.id),conn=c.connections.length>0,flag=!!c.flag;
  if(chView==="need")return !flag&&!conn&&!eng;
  if(chView==="conn")return conn;
  if(chView==="eng")return eng;
  if(chView==="flag")return flag;
  return true;
}
function chStarsTxt(n){return n>0?("★".repeat(n)+"☆".repeat(5-n)):"";}
function chRowHtml(c){
  var eng=chLastEngage(c.id),chips="";
  if(c.flag)chips+='<span class="chip2 flagged">🚩 Flagged</span>';
  else if(c.align==="strong")chips+='<span class="chip2 strong">✅ Strong fit</span>';
  else if(c.align==="partial")chips+='<span class="chip2 partial">🟡 Verify fit</span>';
  if(c.interest>0)chips+='<span class="chip2 stars">'+chStarsTxt(c.interest)+'</span>';
  if(eng)chips+='<span class="chip2 eng">🗣️ We’ve talked · '+esc(chFmtD(eng.d)||eng.t||"")+'</span>';
  else if(c.connections.length)chips+='<span class="chip2 conn">🙋 We know someone</span>';
  else if(!c.flag)chips+='<span class="chip2">🙅 Don’t know anyone yet</span>';
  var sub=[c.town,(c.county&&c.county!=="Out of state")?c.county+" Co.":(c.state!=="NH"?c.state:""),c.leader||c.contact].filter(Boolean).join(" · ");
  return '<button class="chrow'+(c.kind==="ministry"?" min":"")+'" onclick="chOpen(\''+chId(c.id)+'\')"><span class="ic">'+(c.kind==="ministry"?"🕊️":"⛪")+'</span><span class="tx"><b>'+esc(c.name)+'</b><span class="sub2">'+esc(sub)+'</span><span class="chips2">'+chips+'</span></span><span class="arr">›</span></button>';
}
function renderMobilize(){
  var stats=document.getElementById("mobStats");if(!stats)return;
  var total=CH.list.length,conn=0,eng=0,flag=0,need=0,hot=null;
  CH.list.forEach(function(c){
    var e=!!chLastEngage(c.id);
    if(c.flag){flag++;return;}
    if(e)eng++;
    else if(c.connections.length)conn++;
    else need++;
    if(c.interest>0&&(!hot||c.interest>hot.interest))hot=c;
  });
  stats.innerHTML='<div class="stat">'
    +'<div class="box"><div class="n">'+total+'</div><div class="l">On the list</div></div>'
    +'<div class="box alt"><div class="n" style="color:var(--good)">'+eng+'</div><div class="l">We’ve talked</div></div>'
    +'<div class="box alt"><div class="n" style="color:#2b4a68">'+conn+'</div><div class="l">Know someone</div></div>'
    +'<div class="box alt"><div class="n" style="color:var(--bad)">'+need+'</div><div class="l">Don’t know anyone</div></div></div>';
  /* Plain-English executive summary instead of a queue widget. */
  var sm=document.getElementById("mobSummary");
  if(sm){
    var bits='<b>'+total+' churches &amp; ministries</b> are on the master list. ';
    if(eng)bits+='We’ve had a real conversation with <b>'+eng+'</b>'+(conn?', we know someone at <b>'+conn+'</b> more':'')+', and <b>'+need+'</b> we don’t know anyone yet.';
    else if(conn)bits+='We know someone at <b>'+conn+'</b> of them, but <b>no conversations have been logged yet</b> — and <b>'+need+'</b> we don’t know anyone at all.';
    else bits+='<b>No connections or conversations logged yet</b> — the net is wide open.';
    if(hot)bits+=' Warmest door right now: <b>'+esc(hot.name)+'</b> ('+hot.interest+'/5 ⭐).';
    if(flag)bits+=' <b style="color:var(--bad)">'+flag+' flagged</b> for leadership review.';
    bits+='<br><span style="color:var(--muted)">The job: find your town below, tell us who you know, and log the conversation after you’ve had it.</span>';
    sm.innerHTML='<div class="card" style="border-left:4px solid var(--rust)"><h3>🪢 Where the net stands</h3><p style="font-size:13.5px;line-height:1.55;margin:0">'+bits+'</p></div>';
  }
  // county filter select (master list + add form)
  var sel=document.getElementById("chCountySel");
  if(sel&&!sel.options.length)sel.innerHTML='<option value="">All counties</option>'+NHC.map(function(x){return '<option>'+x+'</option>';}).join("")+'<option>Out of state</option>';
  var asel=document.getElementById("chaCounty");
  if(asel&&!asel.options.length)asel.innerHTML='<option value="">County…</option>'+NHC.map(function(x){return '<option>'+x+'</option>';}).join("")+'<option>Out of state</option>';
  chRenderList();
  renderChTpl();
  // global change log
  var gl=document.getElementById("chGlobalLog");
  if(gl){
    var entries=CH.log.slice(-45).reverse();
    gl.innerHTML=entries.length?entries.map(function(e){
      var c=chById(e.ch);
      var nm=c?c.name:(e.ch?"(removed)":"✉️ Master templates");
      return '<div class="chlogrow"><span class="ic2">'+(CH_ICON[e.type]||"📝")+'</span><div><b>'+esc(nm)+'</b> — '+esc(e.by)+(e.note?': '+esc(e.note):' · '+e.type)+'<div class="m">'+esc(chWhen(e))+'</div></div></div>';
    }).join(""):'<p class="hint">Nothing logged yet — every add, edit, call, text, email &amp; share will show up here.</p>';
  }
}
function chRenderList(){
  var m=document.getElementById("chList");if(!m)return;
  var rows=CH.list.filter(chMatches).sort(function(a,b){return (!!a.flag-!!b.flag)||a.name.localeCompare(b.name);});
  m.innerHTML=rows.length?rows.map(chRowHtml).join("")
    :'<div class="card" style="text-align:center"><p style="margin:0 0 8px;font-size:13.5px">'+(CH.list.length
      ?(chQ?'Nothing matches “<b>'+esc(chQ)+'</b>”.':'Nothing matches these filters.')+' Not on the list yet?'
      :'Loading the church list…')+'</p>'
    +(CH.list.length?'<button class="btn wine" style="width:auto;padding:10px 18px" onclick="chAddOpen()">➕ Add it to the master list</button>':'')+'</div>';
}
function chAddOpen(){
  var d=document.getElementById("chAddWrap");if(!d)return;
  d.open=true;
  var n=document.getElementById("chaName");
  if(n){if(chQ&&!n.value)n.value=chQ.replace(/\b\w/g,function(ch){return ch.toUpperCase();});n.focus();}
  d.scrollIntoView({block:"center",behavior:"smooth"});
}
/* CSV export — open to every ambassador (the list is shared team data). */
function chExportCSV(){
  var cols=["Name","Type","Alignment","Status","Interest (0-5)","Town","County","State","Address","Phone","Email","Website","Primary contact","Contact role","Pastor / leader","Team connections","Last conversation","Flagged","Notes"];
  var q=function(v){v=(v==null?"":""+v);return '"'+v.replace(/"/g,'""')+'"';};
  var rows=CH.list.slice().sort(function(a,b){return a.name.localeCompare(b.name);}).map(function(c){
    var eng=chLastEngage(c.id);
    var status=c.flag?"Flagged":(eng?"We've talked":(c.connections.length?"We know someone":"Don't know anyone yet"));
    return [c.name,c.kind,c.align,status,c.interest,c.town,c.county,c.state,c.address,c.phone,c.email,c.website,c.contact,c.contactRole,c.leader,
      c.connections.map(function(x){return x.amb+(x.note?" ("+x.note+")":"");}).join("; "),
      eng?((chFmtD(eng.d)||eng.t)+" — "+eng.by+(eng.note?": "+eng.note:"")):"",
      c.flag?(c.flag.reason+(c.flag.note?" — "+c.flag.note:"")):"",c.notes].map(q).join(",");
  });
  var csv="﻿"+cols.map(q).join(",")+"\r\n"+rows.join("\r\n");
  var a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  a.download="K2C-church-master-list-"+dateKey(new Date())+".csv";
  document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},400);
  toast("📊 CSV downloaded — "+CH.list.length+" entries");
}
function chOpen(id){chCurId=id;chEditOpen=false;chFlagOpen=false;show("church");}
/* ---- outreach logging (call / text / email buttons, script & shares) ----
   Deduped: tapping Call opens the dialer, backing out and tapping again used
   to log a fresh entry every time (same for Email while the mail app opened).
   One entry per church+type per 10 minutes; repeats just re-toast. The server
   applies the same collapse, so two phones can't double-log either. */
var chQuickLast={};
function chQuick(id,type,note){
  var k=id+"|"+type,nowMs=Date.now();
  if(chQuickLast[k]&&nowMs-chQuickLast[k]<600000){toast((CH_ICON[type]||"📝")+" Already logged a few minutes ago");return;}
  var by=myTag()||"Ambassador",st=chStamp();
  var rec={id:uid(),ch:id,type:type,by:by,note:note||"",t:st.t,d:st.d};
  /* Offline this used to do NOTHING — no log, no message — while still
     stamping chQuickLast, so tapping again later said "Already logged" for an
     entry that never existed. churchLog is id-idempotent server-side, so it
     belongs in the outbox like every other write. */
  chQuickLast[k]=nowMs;
  queueWrite("churchLog",rec,function(){CH.log.push(rec);chSave();},function(){setTimeout(chRenderAll,400);});
  toast((CH_ICON[type]||"📝")+" Logged to the church's history");
}
/* ---- the 20-second "what is K2C" script ---- */
function chScriptText(c){
  return "Hi, I'm "+(myTag()||"[your name]")+" with Kingdom to the Counties. We're not a church or a denomination — we're everyday believers obeying the Great Commission: Jesus said GO and make disciples. In 2026 we're bringing free, open-air days of worship, Gospel preaching, prayer, and altar calls to all 10 New Hampshire counties — and God is moving: salvations, rededications, and physical healings at every stop. But new believers need a church home, and that's where "+(c?c.name:"your church")+" comes in. We'd love your help discipling the new and returning believers from your own neighborhood — and we'd love your leaders to join pastors from across the state in praying for New Hampshire. Can I share how to get involved?";
}
/* ---- master outreach templates (v1.10.0) ----
   ONE email and ONE text for EVERY church — no per-church wording, so any
   go-getter can tap and send in seconds and the whole team sounds the same.
   Leaders can rewrite both on the Mobilization tab (PIN-gated); the edited
   copy lives in the churches blob (CH.tpl) and syncs to every phone. Empty
   server fields mean "use the built-in default below". Placeholders fill
   per church + per ambassador at send time. */
var CH_TPL_DEFAULT={
  subject:"Kingdom to the Counties — partnering with [CHURCH]",
  email:"Dear [CONTACT],\n\nWe would love to partner with [CHURCH] as Kingdom to the Counties comes to [TOWN]. [EVENT] It's a free, open-air afternoon of full-band worship, Gospel preaching, prayer, and altar calls (kingdomtothecounties.com). We are not a church nor a denomination. We are simply professionals daring to believe that God also wants to use us to administer His Kingdom here on earth as it is in heaven.\n\nGod has been moving on open fields in NH: across our first 3 stops we've documented and witnessed 9 salvations, 10 rededications, and 8 physical healings; we've prayed with almost 100 people and welcomed over 500 in attendance. 7 stops remain.\n\nOur deepest desire is to make disciples — which means we NEED the local church to help us disciple new and returning converts. Will you help us? We'd also love to invite leaders from [CHURCH] to stand with leaders from across the state to pray for our state, our counties, and our cities.\n\nOne more ask: do you know other pastors or ministry leaders near [TOWN] who should hear about this? We would LOVE to speak with them. Please share this message with them, or simply reply with their name, email, and phone number.\n\nOur promo video: https://youtu.be/QejmMM2O_8w\nReply to this message, book a call with us (https://oncehub.com/zachsilk), or call/text our ministry number: 617-466-9051.\n\nFor His Kingdom —\n[MY NAME]\nKingdom to the Counties · brought to you by The Fourth Ministries, a NH 501(c)(3)",
  sms:"Hi [CONTACT] — this is [MY NAME] with Kingdom to the Counties (kingdomtothecounties.com). Free open-air worship, Gospel preaching & altar calls are coming to [COUNTY] [DATE]. We'd love [CHURCH]'s help discipling new believers from your own neighborhood. Can I share more?"
};
function chTpl(){
  var t=CH.tpl||{};
  return{subject:t.subject||CH_TPL_DEFAULT.subject,email:t.email||CH_TPL_DEFAULT.email,sms:t.sms||CH_TPL_DEFAULT.sms};
}
function chTplFill(t,c){
  var ev=STATE.event||{};
  var map={
    "[CHURCH]":(c&&c.name)||"your church",
    "[CONTACT]":(c&&(c.contact||c.leader))||("friends at "+((c&&c.name)||"your church")),
    "[TOWN]":(c&&c.town)||"your town",
    "[COUNTY]":(c&&c.county&&c.county!=="Out of state")?(c.county+" County"):"your county",
    "[EVENT]":(ev.name&&ev.date)?("On "+ev.date+", we're coming to "+ev.name+".")
      :"In 2026 we're bringing it to all 10 New Hampshire counties.",
    "[DATE]":ev.date?("on "+ev.date):"this season",
    "[MY NAME]":myTag()||"The K2C Team"
  };
  return (t||"").replace(/\[(CHURCH|CONTACT|TOWN|COUNTY|EVENT|DATE|MY NAME)\]/g,function(m){return map[m];});
}
function chEmailSubject(c){return chTplFill(chTpl().subject,c);}
function chEmailBody(c){return chTplFill(chTpl().email,c);}
function chSmsBody(c){return chTplFill(chTpl().sms,c);}
function chCopy(txt,ok){
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){toast(ok);}).catch(function(){prompt("Copy this:",txt);});
  else prompt("Copy this:",txt);
}
/* Script & email always carry the ambassador's real name — if it isn't set
   yet we ask for it first, THEN build the text. */
function chCopyScript(id){chMe(function(){var c=chById(id);chCopy(chScriptText(c),"📣 Script copied — logged to "+(c?c.name:"the church"));chQuick(id,"script","Used the K2C intro script");});}
function chCopyEmail(id){chMe(function(){var c=chById(id);if(!c)return;chCopy("Subject: "+chEmailSubject(c)+"\n\n"+chEmailBody(c),"✉️ Email copied — logged");chQuick(id,"email","Copied the outreach email");});}
function chCopyText(id){chMe(function(){var c=chById(id);if(!c)return;chCopy(chSmsBody(c),"💬 Text copied — logged");chQuick(id,"text","Copied the invite text");});}
function chShareVideo(id){chCopy("https://youtu.be/QejmMM2O_8w","📹 Promo video link copied — logged");chQuick(id,"share","Shared the promo video link");}
/* Email button: make sure the name is set, log once, then open the mail app
   with the freshly personalized draft (so the sign-off is never "[your name]"). */
function chEmailGo(ev,id){
  if(ev)ev.preventDefault();
  var c=chById(id);if(!c||!c.email)return false;
  chMe(function(){
    chQuick(id,"email","Opened the outreach email");
    location.href="mailto:"+encodeURIComponent(c.email)+"?subject="+encodeURIComponent(chEmailSubject(c))+"&body="+encodeURIComponent(chEmailBody(c));
  });
  return false;
}
/* Text button: same flow — log once, then open Messages with the short invite
   pre-typed. The "?&body=" form works on both iOS and Android. */
function chTextGo(ev,id){
  if(ev)ev.preventDefault();
  var c=chById(id);if(!c)return false;
  var tel=chDigits(c.phone);if(!tel)return false;
  chMe(function(){
    chQuick(id,"text","Opened the invite text");
    location.href="sms:+1"+tel+"?&body="+encodeURIComponent(chSmsBody(c));
  });
  return false;
}
/* ---- leader-editable master templates (PIN-gated like every leader zone) ---- */
var chTplOpen=false;
function renderChTpl(){
  var w=document.getElementById("chTplWrap");if(!w)return;
  if(!LEADER){
    w.innerHTML='<div class="lockbar">🔒 Every church gets the same master email &amp; text — leaders can edit them.<button onclick="askPin(function(){renderMobilize();})">Unlock</button></div>';
    return;
  }
  if(!chTplOpen){
    w.innerHTML='<div class="lockbar">✉️ Master email &amp; text templates — one message for every church.<button onclick="chTplOpen=true;renderMobilize()">✏️ Edit</button></div>';
    return;
  }
  var t=chTpl();
  var lbl=function(x){return '<p class="lbl" style="font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--wine);font-weight:800;margin:10px 2px 5px">'+x+'</p>';};
  w.innerHTML='<div class="card"><h3>✉️ Master outreach templates (leaders)</h3>'
    +'<p class="hint" style="margin:0 0 4px">One template for <b>every</b> church — ambassadors just tap and send. These placeholders fill in automatically per church &amp; sender:</p>'
    +'<p class="hint" style="margin:0"><b>[CHURCH]</b> name · <b>[CONTACT]</b> pastor/contact · <b>[TOWN]</b> · <b>[COUNTY]</b> · <b>[EVENT]</b> "On &lt;date&gt;, we\'re coming to &lt;event&gt;." · <b>[DATE]</b> "on &lt;date&gt;" · <b>[MY NAME]</b> the sender</p>'
    +'<div class="form" style="margin:0;box-shadow:none;border:none;padding:0">'
    +lbl("Email subject")
    +'<input id="chTplSubject" maxlength="200" value="'+esc(t.subject)+'" />'
    +lbl("Email body")
    +'<textarea id="chTplEmail" rows="14" maxlength="4000" style="font-size:13px;line-height:1.5">'+esc(t.email)+'</textarea>'
    +lbl("Text message (short — for the 💬 Text button)")
    +'<textarea id="chTplSms" rows="5" maxlength="600" style="font-size:13px;line-height:1.5">'+esc(t.sms)+'</textarea>'
    +'<button class="btn wine" onclick="chTplSave()">💾 Save for the whole team</button>'
    +'<button class="btn ghost" style="margin-top:8px" onclick="chTplResetFields()">↩️ Fill with the built-in default</button>'
    +'<button class="btn ghost" style="margin-top:8px" onclick="chTplOpen=false;renderMobilize()">Cancel</button>'
    +'<p class="hint" style="margin-top:8px">Saving goes live for every ambassador immediately. Clearing a box and saving returns that piece to the built-in default.</p>'
    +'</div></div>';
}
function chTplResetFields(){
  var s=document.getElementById("chTplSubject"),e=document.getElementById("chTplEmail"),m=document.getElementById("chTplSms");
  if(s)s.value=CH_TPL_DEFAULT.subject;if(e)e.value=CH_TPL_DEFAULT.email;if(m)m.value=CH_TPL_DEFAULT.sms;
  toast("↩️ Defaults loaded — tap Save to make them live");
}
function chTplSave(){
  var g=function(i){var e=document.getElementById(i);return e?e.value:"";};
  var subject=g("chTplSubject").trim(),email=g("chTplEmail").trim(),sms=g("chTplSms").trim();
  // Saving text identical to the default stores "" so future default upgrades flow through.
  if(subject===CH_TPL_DEFAULT.subject)subject="";
  if(email===CH_TPL_DEFAULT.email)email="";
  if(sms===CH_TPL_DEFAULT.sms)sms="";
  var st=chStamp(),by=myTag()||"Leadership";
  chTplOpen=false;
  chAction("churchTemplate",{id:uid(),subject:subject,email:email,sms:sms,by:by,t:st.t,d:st.d},function(){
    CH.tpl={subject:subject,email:email,sms:sms};
    CH.log.push({id:uid(),ch:"",type:"edit",by:by,note:"Updated the master email & text templates",t:st.t,d:st.d});
  });
  toast("✉️ Master templates saved — live for the whole team");
}
/* ---- interest, connections, notes ---- */
function chSetInterest(id,n){
  chMe(function(){
    var st=chStamp(),by=myTag();
    chAction("churchInterest",{ch:id,interest:n,by:by,t:st.t,d:st.d},function(){
      var c=chById(id);if(c)c.interest=n;
      CH.log.push({id:uid(),ch:id,type:"interest",by:by,note:"Interest set to "+n+"/5",t:st.t,d:st.d});
    });
  });
}
function chConnectAsk(id){
  chMe(function(){
    var note=(prompt("How are you connected to them? (e.g. “my aunt is a member”, “I know Pastor Dan from work”)")||"").trim();
    if(note===""&&note!==null)return;
    var st=chStamp(),by=myTag();
    chAction("churchConnect",{ch:id,amb:by,note:note,t:st.t,d:st.d},function(){
      var c=chById(id);if(c)c.connections.push({amb:by,note:note,t:st.t,d:st.d});
      CH.log.push({id:uid(),ch:id,type:"connect",by:by,note:note,t:st.t,d:st.d});
    });
    toast("🙋 Claimed — the team can now see you're the connection");
  });
}
function chNoteSubmit(id){
  var inp=document.getElementById("chNoteInput");if(!inp)return;
  var txt=inp.value.trim();if(!txt){flash("chNoteInput");return;}
  chMe(function(){
    var st=chStamp(),by=myTag();
    var rec={id:uid(),ch:id,type:"note",by:by,note:txt,t:st.t,d:st.d};
    if(chAction("churchLog",rec,function(){CH.log.push(rec);}))inp.value="";
  });
}
/* ---- "We talked with them" — the ONLY thing that marks a church engaged.
   A quick-capture mini form: who you spoke with + how it went. ---- */
var chConvoOpen=false;
function chConvoToggle(){chConvoOpen=!chConvoOpen;renderChurchPage();if(chConvoOpen)setTimeout(function(){var e=document.getElementById("chConvoWho");if(e){e.scrollIntoView({block:"center",behavior:"smooth"});e.focus();}},80);}
function chConvoSubmit(id){
  var who=(document.getElementById("chConvoWho")||{value:""}).value.trim();
  var how=(document.getElementById("chConvoHow")||{value:""}).value.trim();
  if(!who&&!how){flash("chConvoWho");return;}
  chMe(function(){
    var st=chStamp(),by=myTag();
    var note=(who?"Spoke with "+who:"Had a conversation")+(how?" — "+how:"");
    var rec={id:uid(),ch:id,type:"convo",by:by,note:note,t:st.t,d:st.d};
    if(!chAction("churchLog",rec,function(){CH.log.push(rec);}))return;
    chConvoOpen=false;renderChurchPage();
    toast("🗣️ Logged — this church now shows as “We’ve talked”");
  });
}
/* ---- vision flag ---- */
function chFlagSubmit(id){
  var sel=document.getElementById("chFlagReason"),note=document.getElementById("chFlagNote");
  if(!sel||!sel.value){toast("Pick a reason first");return;}
  chMe(function(){
    var st=chStamp(),by=myTag(),reason=sel.value,n=(note?note.value:"").trim(),lid=uid();
    chAction("churchFlag",{id:lid,ch:id,reason:reason,note:n,by:by,t:st.t,d:st.d},function(){
      var c=chById(id);if(c){c.flag={reason:reason,note:n,by:by,t:st.t,d:st.d};c.align="flagged";}
      CH.log.push({id:lid,ch:id,type:"flag",by:by,note:reason+(n?" — "+n:""),t:st.t,d:st.d});
    });
    chFlagOpen=false;renderChurchPage();
    toast("🚩 Flagged — leadership will review");
  });
}
function chFlagClear(id){
  if(!LEADER){askPin(function(){chFlagClear(id);});return;}
  var st=chStamp(),by=myTag()||"Leadership",lid=uid();
  chAction("churchFlagClear",{id:lid,ch:id,align:"unverified",by:by,t:st.t,d:st.d},function(){
    var c=chById(id);if(c){c.flag=null;c.align="unverified";}
    CH.log.push({id:lid,ch:id,type:"unflag",by:by,note:"Flag cleared",t:st.t,d:st.d});
  });
}
/* ---- add (any ambassador) ---- */
function chAddSubmit(){
  var g=function(i){var e=document.getElementById(i);return e?e.value.trim():"";};
  var name=g("chaName");if(!name){flash("chaName");return;}
  chMe(function(){
    var st=chStamp(),by=myTag();
    var rec={id:uid(),name:name,kind:g("chaKind")||"church",town:g("chaTown"),county:g("chaCounty"),state:g("chaState")||"NH",
      address:g("chaAddress"),phone:g("chaPhone"),email:g("chaEmail"),website:g("chaWebsite"),
      contact:g("chaContact"),contactRole:"",leader:g("chaLeader"),notes:g("chaNotes"),intro:"",ask:"",
      align:"unverified",interest:0,flag:null,connections:[],addedBy:by,t:st.t,d:st.d};
    if(!chAction("churchAdd",{church:rec},function(){
      CH.list.push(rec);CH.log.push({id:uid(),ch:rec.id,type:"add",by:by,note:name,t:st.t,d:st.d});
    }))return;
    ["chaName","chaTown","chaAddress","chaPhone","chaEmail","chaWebsite","chaContact","chaLeader","chaNotes"].forEach(function(i){var e=document.getElementById(i);if(e)e.value="";});
    toast("➕ "+name+" added to the master list");
  });
}
/* ---- leader edit / delete ---- */
function chEditToggle(id){
  if(!LEADER){askPin(function(){chEditToggle(id);});return;}
  chEditOpen=!chEditOpen;renderChurchPage();
  if(chEditOpen)setTimeout(function(){var e=document.getElementById("cheName");if(e)e.scrollIntoView({block:"center",behavior:"smooth"});},60);
}
function chEditSubmit(id){
  var g=function(i){var e=document.getElementById(i);return e?e.value.trim():"";};
  var st=chStamp(),by=myTag()||"Leadership",lid=uid();
  var patch={name:g("cheName"),town:g("cheTown"),county:g("cheCounty"),state:g("cheState"),address:g("cheAddress"),
    phone:g("chePhone"),email:g("cheEmail"),website:g("cheWebsite"),contact:g("cheContact"),contactRole:g("cheContactRole"),
    leader:g("cheLeader"),notes:g("cheNotes"),align:g("cheAlign"),kind:g("cheKind")};
  if(!patch.name){flash("cheName");return;}
  chAction("churchEdit",{id:lid,ch:id,patch:patch,by:by,t:st.t,d:st.d},function(){
    var c=chById(id);if(c)for(var k in patch)if(patch[k]!==undefined)c[k]=patch[k];
    CH.log.push({id:lid,ch:id,type:"edit",by:by,note:"Details updated",t:st.t,d:st.d});
  });
  chEditOpen=false;renderChurchPage();
  toast("✏️ Saved");
}
function chDeleteAsk(id){
  if(!LEADER){askPin(function(){chDeleteAsk(id);});return;}
  var c=chById(id);if(!c)return;
  if(!confirm("Remove “"+c.name+"” from the master list?\n\nIts history stays in the change log, but the church disappears for everyone. This can't be undone from the app."))return;
  var st=chStamp(),by=myTag()||"Leadership";
  chAction("churchDelete",{ch:id,by:by,t:st.t,d:st.d},function(){
    CH.list=CH.list.filter(function(x){return x.id!==id;});
    CH.log.push({id:uid(),ch:id,type:"delete",by:by,note:c.name,t:st.t,d:st.d});
  });
  show("mobilize");
  toast("🗑 Removed");
}
/* ---- detail page ---- */
function renderChurchPage(){
  var m=document.getElementById("churchMount");if(!m)return;
  var c=chById(chCurId);
  if(!c){m.innerHTML='<p class="hint" style="padding:20px 0">That church isn’t on the list anymore. <a onclick="show(\'mobilize\')" style="color:var(--rust);font-weight:700;cursor:pointer">Back to the list ›</a></p>';return;}
  var id=chId(c.id),tel=chDigits(c.phone),eng=chLastEngage(c.id),h="";
  h+='<p class="eyebrow">'+(c.kind==="ministry"?"Ministry":"Church")+(c.county?' · '+esc(c.county)+(c.county!=="Out of state"?" County":""):"")+'</p>';
  h+='<h1 class="title" style="font-size:25px">'+esc(c.name)+'</h1>';
  var subBits=[esc(c.town),(c.state&&c.state!=="NH")?esc(c.state):"",c.website?'<a href="'+esc(c.website)+'" target="_blank" rel="noopener" style="color:var(--rust)">website ↗</a>':""].filter(Boolean);
  h+='<p class="sub" style="margin-bottom:10px">'+subBits.join(" · ")+'</p>';
  if(c.flag){
    h+='<div class="chflagbar">🚩 <b>Flagged — not aligned with our vision.</b><br>'+esc(c.flag.reason)+(c.flag.note?' — '+esc(c.flag.note):"")+'<br><span style="font-weight:600;opacity:.8">by '+esc(c.flag.by)+' · '+esc(chWhen(c.flag))+'</span>'
      +(LEADER?'<button onclick="chFlagClear(\''+id+'\')">✅ Clear flag (leader)</button>':'<span style="display:block;margin-top:5px;font-weight:600;opacity:.8">Hold outreach until leadership reviews.</span>')+'</div>';
  }else{
    var chips="";
    if(c.align==="strong")chips+='<span class="chip2 strong" style="font-size:11px">✅ Strong alignment</span> ';
    else if(c.align==="partial")chips+='<span class="chip2 partial" style="font-size:11px">🟡 Verify beliefs</span> ';
    chips+=eng?'<span class="chip2 eng" style="font-size:11px">🗣️ We’ve talked · '+esc(chFmtD(eng.d)||eng.t||"")+'</span>'
      :(c.connections.length?'<span class="chip2 conn" style="font-size:11px">🙋 We know someone here</span>'
      :'<span class="chip2" style="font-size:11px">🙅 We don’t know anyone yet</span>');
    h+='<p style="margin:0 0 10px">'+chips+'</p>';
  }
  // tap-to-reach — logged once per tap-burst; Email personalizes with YOUR name
  h+='<div class="chacts">'
    +'<a class="call'+(tel?"":" dis")+'" href="tel:+1'+tel+'" onclick="chQuick(\''+id+'\',\'call\',\'Tapped Call\')"><span>📞</span>Call</a>'
    +'<a class="sms'+(tel?"":" dis")+'" href="#" onclick="return chTextGo(event,\''+id+'\')"><span>💬</span>Text</a>'
    +'<a class="mailb'+(c.email?"":" dis")+'" href="#" onclick="return chEmailGo(event,\''+id+'\')"><span>✉️</span>Email</a>'
    +'<a class="web'+(c.website?"":" dis")+'" href="'+esc(c.website||"#")+'" target="_blank" rel="noopener"><span>🌐</span>Site</a>'
    +'</div>';
  h+='<p class="hint" style="margin:-6px 2px 12px">Taps are noted in the history so the team sees who reached out. 💬 Text and ✉️ Email both open <b>pre-written</b> from the master template — filled in for '+esc(c.name)+' and signed with your name. Actually talked with someone? Log it under 🗣️ below — that’s what marks them “We’ve talked.”</p>';
  // contact info — up top, and EXPLICIT about what we don't have yet
  var miss='<b style="font-family:var(--sans);font-size:12px;color:var(--bad);opacity:.75">✗ none on file</b>';
  var infoRows=[
    ["👤 Primary contact",c.contact?esc(c.contact)+(c.contactRole?' · '+esc(c.contactRole):""):null],
    ["⛪ Pastor / leader",c.leader?esc(c.leader):null],
    ["📞 Phone",c.phone?'<a href="tel:+1'+tel+'" style="color:var(--wine);font-weight:700;text-decoration:none">'+esc(c.phone)+'</a>':null],
    ["✉️ Email",c.email?'<a href="#" onclick="return chEmailGo(event,\''+id+'\')" style="color:var(--wine);font-weight:700;text-decoration:none;word-break:break-all">'+esc(c.email)+'</a>':null],
    ["🌐 Website",c.website?'<a href="'+esc(c.website)+'" target="_blank" rel="noopener" style="color:var(--wine);font-weight:700;text-decoration:none;word-break:break-all">'+esc(c.website.replace(/^https?:\/\/(www\.)?/,"").replace(/\/$/,""))+'</a>':null],
    ["📍 Address",c.address?esc(c.address):null],
    ["🗺️ Town",c.town?esc(c.town)+(c.county?' · '+esc(c.county)+(c.county!=="Out of state"?" County":""):"")+(c.state!=="NH"?' · '+esc(c.state):""):null]
  ];
  var missing=infoRows.filter(function(r){return !r[1];}).length;
  h+='<div class="card"><h3>📇 Contact info'+(missing?' <span class="chip2" style="background:#f6e2e0;color:var(--bad);font-size:10px">'+missing+' missing</span>':' <span class="chip2 strong" style="font-size:10px">complete</span>')+'</h3>'
    +infoRows.map(function(r){return '<div class="give"><span'+(r[1]?"":' style="opacity:.55"')+'>'+r[0]+'</span><b style="font-family:var(--sans);font-size:13px;text-align:right;max-width:60%">'+(r[1]||miss)+'</b></div>';}).join("")
    +(c.notes?'<div class="chknote" style="margin-top:10px">📝 '+esc(c.notes)+'</div>':"")
    +(missing?'<p class="hint" style="margin-top:8px">Know any of the missing info? Post it as a note below and a leader will fill it in.</p>':"")+'</div>';
  // 🗣️ conversation record — the manual "engaged" switch
  var convos=chLogFor(c.id).filter(function(e){return e.type==="convo";}).slice(-5).reverse();
  h+='<div class="card" style="border-left:4px solid var(--good)"><h3>🗣️ Have we talked with them?</h3>';
  h+=convos.length
    ?convos.map(function(e){return '<div class="chlogrow"><span class="ic2">🗣️</span><div><b>'+esc(e.by)+'</b> — '+esc(e.note)+'<div class="m">'+esc(chWhen(e))+'</div></div></div>';}).join("")
    :'<p class="hint" style="margin:0 0 4px">No conversations logged yet. A tap on Call doesn’t count — only a real conversation does. Had one? Log it:</p>';
  h+=chConvoOpen
    ?'<div style="margin-top:9px"><input id="chConvoWho" maxlength="80" placeholder="Who did you speak with? (e.g. Pastor Dan)" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px;font-family:var(--sans);margin-bottom:8px" />'
      +'<textarea id="chConvoHow" rows="2" maxlength="200" placeholder="How did it go? Are they interested? Next step?" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px;font-family:var(--sans);margin-bottom:8px"></textarea>'
      +'<button class="btn wine" onclick="chConvoSubmit(\''+id+'\')">🗣️ Log the conversation</button>'
      +'<button class="btn ghost" style="margin-top:7px" onclick="chConvoToggle()">Cancel</button></div>'
    :'<button class="btn wine" style="margin-top:9px" onclick="chConvoToggle()">🗣️ I talked with them — log it</button>';
  h+='</div>';
  // connections — "we know someone here"
  h+='<div class="card"><h3>🙋 We know someone here</h3>';
  h+=c.connections.length
    ?c.connections.map(function(x){return '<div class="chlogrow"><span class="ic2">🤝</span><div><b>'+esc(x.amb)+'</b>'+(x.note?' — '+esc(x.note):"")+'<div class="m">'+esc(chWhen(x))+'</div></div></div>';}).join("")
    :'<p class="hint" style="margin:0 0 4px">Nobody on the team knows anyone here yet. Even a loose tie counts — a cousin, a coworker, an old smallgroup friend.</p>';
  h+='<button class="btn ghost" style="margin-top:10px" onclick="chConnectAsk(\''+id+'\')">🙋 I know someone here</button></div>';
  // interest
  var stars="";for(var i=1;i<=5;i++)stars+='<button class="'+(i<=c.interest?"on":"")+'" onclick="chSetInterest(\''+id+'\','+i+')" aria-label="'+i+' of 5">⭐</button>';
  h+='<div class="card"><h3>🌡️ Interest in partnering</h3><div class="chstars">'+stars+'</div><p class="hint" style="margin:2px 0 0">'+(c.interest?c.interest+"/5":"Not scored yet")+' — score it after a real conversation. 1 = cold, 5 = all in. Changes are logged with your name.</p></div>';
  // share toolkit
  h+='<div class="card"><h3>🧰 Share K2C with them</h3>'
    +'<details class="setdrop"><summary style="font-weight:700;font-size:13.5px;color:var(--wine);padding:4px 0">📣 The 20-second “What is K2C?” script <span class="setchev">▶</span></summary>'
    +'<div class="verse" style="font-size:13.5px;font-style:normal;font-family:var(--sans)">'+esc(chScriptText(c))+'</div>'
    +'<button class="btn ghost" style="margin-top:8px" onclick="chCopyScript(\''+id+'\')">📋 Copy script (with your name) — logs it</button></details>'
    +'<div class="seclabel" style="margin-top:14px">✉️ Ready-to-send email</div>'
    +'<p class="hint" style="margin:0 0 8px">The master email, filled in for '+esc(c.name)+' and signed with your name. The ✉️ Email button up top opens it in your mail app; or copy it for Facebook / a website form:</p>'
    +'<button class="btn ghost" onclick="chCopyEmail(\''+id+'\')">📋 Copy the full email text</button>'
    +'<div class="seclabel" style="margin-top:14px">💬 Ready-to-send text</div>'
    +'<div class="verse" style="font-size:13.5px;font-style:normal;font-family:var(--sans)">'+esc(chSmsBody(c))+'</div>'
    +'<p class="hint" style="margin:6px 0 8px">'+(tel?'The 💬 Text button up top opens it in Messages, pre-typed.':'No phone on file — copy it and send through Facebook or their website form.')+'</p>'
    +'<button class="btn ghost" onclick="chCopyText(\''+id+'\')">📋 Copy the text message</button>'
    +'<div class="seclabel" style="margin-top:14px">📲 Tools from Ambassador Resources</div>'
    +'<div class="dashjump" style="margin:0">'
    +'<button onclick="chShareVideo(\''+id+'\')">📹 Promo video</button>'
    +'<button onclick="show(\'graphics\')">🖼️ Graphics</button>'
    +'<button onclick="show(\'playbook\')">📘 Playbook</button>'
    +'<button onclick="show(\'donate\')">❤️ Give page</button>'
    +'<button onclick="show(\'handbook\')">📗 Counselor</button>'
    +'<button onclick="show(\'faith\')">📖 Our beliefs</button>'
    +'</div></div>';
  // history + notes — collapsed by default
  var hist=chLogFor(c.id).slice(-30).reverse();
  h+='<div class="card"><details class="setdrop"><summary style="font-weight:700;font-size:14.5px;font-family:var(--serif);padding:2px 0">🕐 History — every touch, by everyone ('+hist.length+') <span class="setchev">▶</span></summary>'
    +'<div style="margin-top:8px">'
    +(hist.length?hist.map(function(e){return '<div class="chlogrow"><span class="ic2">'+(CH_ICON[e.type]||"📝")+'</span><div><b>'+esc(e.by)+'</b>'+(e.note?' — '+esc(e.note):' · '+e.type)+'<div class="m">'+esc(chWhen(e))+'</div></div></div>';}).join(""):'<p class="hint">No touches yet — be the first.</p>')
    +'</div></details>'
    +'<div class="twocol" style="display:flex;gap:8px;margin-top:10px"><input id="chNoteInput" maxlength="300" placeholder="Add a note for the team…" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14px;font-family:var(--sans)" /><button class="btn ink" style="width:auto;padding:10px 16px;flex:none" onclick="chNoteSubmit(\''+id+'\')">Post</button></div></div>';
  // print / save as PDF
  h+='<button class="printbtn" onclick="printDoc(\'church\')">🖨️ Print / Save this church as PDF</button>';
  // vision flag
  if(!c.flag){
    h+='<div class="card">'+(chFlagOpen
      ?'<h3>🚩 Flag — not aligned with our vision</h3><p class="hint" style="margin:0 0 8px">This warns the whole team to hold outreach until leadership reviews. Say why:</p>'
       +'<select id="chFlagReason" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;font-size:14px;font-family:var(--sans);margin-bottom:8px"><option value="">Pick a reason…</option><option>Promotes non-traditional marriage</option><option>Too political (either direction)</option><option>Heresy / unbiblical teaching</option><option>Not a Bible-believing congregation</option><option>Asked us not to contact them</option><option>Other (explain below)</option></select>'
       +'<textarea id="chFlagNote" rows="2" maxlength="300" placeholder="Details (what you saw or heard)…" style="width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;font-size:14px;font-family:var(--sans);margin-bottom:8px"></textarea>'
       +'<button class="btn ink" onclick="chFlagSubmit(\''+id+'\')">🚩 Flag for leadership review</button><button class="btn ghost" style="margin-top:8px" onclick="chFlagOpen=false;renderChurchPage()">Cancel</button>'
      :'<button class="btn ghost" style="color:var(--bad);border-color:#e0b7b3" onclick="chFlagOpen=true;renderChurchPage()">🚩 Not in line with our vision? Flag it</button><p class="hint" style="margin:8px 2px 0">Non-traditional-marriage promotion, heavy politics either way, unbiblical teaching — flag it and leadership reviews. Flagging is visible to everyone and logged.</p>')+'</div>';
  }
  // leader zone
  if(chEditOpen&&LEADER){
    var opt=function(v,cur,lbl){return '<option value="'+v+'"'+(cur===v?" selected":"")+'>'+lbl+'</option>';};
    var flbl=function(t){return '<p class="lbl" style="font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--wine);font-weight:800;margin:2px 2px 5px">'+t+'</p>';};
    h+='<div class="card"><h3>✏️ Edit (leaders)</h3>'
      +'<div class="form" style="margin:0;box-shadow:none;border:none;padding:0">'
      +'<input id="cheName" maxlength="120" value="'+esc(c.name)+'" placeholder="Name *" />'
      +flbl("Type · Alignment (fit with our <a onclick=\'event.preventDefault();show(&quot;faith&quot;)\' style=\'color:var(--rust);cursor:pointer\'>Statement of Faith</a>)")
      +'<div class="twocol"><select id="cheKind">'+opt("church",c.kind,"⛪ Church")+opt("ministry",c.kind,"🕊️ Ministry")+'</select>'
      +'<select id="cheAlign">'+opt("strong",c.align,"✅ Strong fit")+opt("partial",c.align,"🟡 Verify fit")+opt("unverified",c.align,"❔ Unverified")+'</select></div>'
      +flbl("Location")
      +'<div class="twocol"><input id="cheTown" maxlength="60" value="'+esc(c.town)+'" placeholder="Town" /><select id="cheCounty">'+'<option value="">County…</option>'+NHC.map(function(x){return '<option'+(c.county===x?" selected":"")+'>'+x+'</option>';}).join("")+'<option'+(c.county==="Out of state"?" selected":"")+'>Out of state</option></select></div>'
      +'<input id="cheState" maxlength="20" value="'+esc(c.state)+'" placeholder="State" />'
      +'<input id="cheAddress" maxlength="160" value="'+esc(c.address)+'" placeholder="Street address" />'
      +flbl("Reach them")
      +'<div class="twocol"><input id="chePhone" maxlength="40" value="'+esc(c.phone)+'" placeholder="Phone" /><input id="cheEmail" maxlength="120" value="'+esc(c.email)+'" placeholder="Email" /></div>'
      +'<input id="cheWebsite" maxlength="200" value="'+esc(c.website)+'" placeholder="Website" />'
      +flbl("People")
      +'<div class="twocol"><input id="cheContact" maxlength="80" value="'+esc(c.contact)+'" placeholder="Primary contact" /><input id="cheContactRole" maxlength="60" value="'+esc(c.contactRole)+'" placeholder="Their role" /></div>'
      +'<input id="cheLeader" maxlength="80" value="'+esc(c.leader)+'" placeholder="Pastor / leader" />'
      +'<textarea id="cheNotes" rows="3" maxlength="2000" placeholder="Notes…">'+esc(c.notes)+'</textarea>'
      +'<button class="btn wine" onclick="chEditSubmit(\''+id+'\')">💾 Save changes</button>'
      +'<button class="btn ghost" style="margin-top:8px" onclick="chEditOpen=false;renderChurchPage()">Cancel</button>'
      +'<button class="btn ghost" style="margin-top:8px;color:var(--bad);border-color:#e0b7b3" onclick="chDeleteAsk(\''+id+'\')">🗑 Remove from master list</button>'
      +'</div></div>';
  }else{
    h+='<div class="lockbar">🔒 Master-list details are leader-editable.<button onclick="chEditToggle(\''+id+'\')">✏️ Edit</button></div>';
  }
  m.innerHTML=h;
}
/* ---- boot ---- */
renderNameBars();
if(CH.list.length)renderMobilize();
chFetch(); // prefetch so the tab opens instantly
