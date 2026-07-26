function m(h,min){return h*60+(min||0);}
/* Worship set songs — keep in sync with data/setlists-default.json */
var SETLISTS_DEFAULT={
  "Worship Set 1":[
    {title:"The Joy",key:"G",lead:"Karielle"},
    {title:"Song Of Freedom",key:"Bb",lead:"Zach"},
    {title:"I Thank God",key:"A",lead:"Mike"}
  ],
  "Worship Set 2":[
    {title:"Revival's In The Air",key:"A",lead:"Annie"},
    {title:"Throne Room Song",key:"A",lead:"Karielle + Mike"},
    {title:"Revelation Song",key:"C",lead:"Hollee"}
  ],
  "Worship Set 3":[
    {title:"Come Boldly To The Throne",key:"C",lead:"Karielle"},
    {title:"Nothing Else",key:"D",lead:"Hollee"}
  ],
  "Worship Set 4":[
    {title:"Jesus Be The Name",key:"D",lead:"Karielle"},
    {title:"What A Beautiful Name",key:"D",lead:"Annie"},
    {title:"Holy Ground",key:"D",lead:"Karielle"}
  ],
  "Outro + Blessing":[
    {title:"I Speak Jesus",key:"E",lead:"Karielle"}
  ]
};
function setlistFor(name){return SETLISTS_DEFAULT[name]||null;}
function setlistRowsHtml(songs){
  if(!songs||!songs.length)return "";
  return '<ul class="setlist">'+songs.map(function(s){
    return '<li><span class="sn">'+esc(s.title)+'</span><div class="sm"><span class="sk">'+esc(s.key)+'</span><span class="sl">'+esc(s.lead)+'</span></div></li>';
  }).join("")+'</ul>';
}
const SEGMENTS=[
  {s:m(8,0),e:m(8,30),name:"Leadership Early Call",group:"setup",music:"setup",meta:"Leadership only · radios, Command Post, prayer"},
  {s:m(9,0),e:m(9,30),name:"Volunteers & Ambassadors Call",group:"setup",music:"setup",meta:"Arrival, orientation, staff tags, fellowship"},
  {s:m(9,30),e:m(10,0),name:"All-Team Huddle",group:"setup",music:"setup",meta:"Exhortation, confession, prayer · Safety brief"},
  {s:m(10,0),e:m(12,0),name:"General Setup",group:"setup",music:"setup",meta:"Tents, signage, sound · Crane 11:00 — Jesus Rig up by noon"},
  {s:m(12,0),e:m(12,15),name:"Program Run-Through",group:"setup",music:"setup",meta:"All · primary microphone"},
  {s:m(12,15),e:m(13,0),name:"Lunch & Rest",group:"setup",music:"setup",meta:"Pizza, water, soda · stay on-site"},
  {s:m(13,0),e:m(14,0),name:"Doors Open to Public",group:"setup",music:"setup",meta:"Setup complete · parking team in position"},
  {s:m(14,0),e:m(14,10),name:"Intro / Welcome + Prayer",group:"program",music:"soft"},
  {s:m(14,10),e:m(14,25),name:"Worship Set 1",group:"program",music:"fullband"},
  {s:m(14,25),e:m(14,35),name:"TTT Moment 1",group:"program",music:"soft",meta:"Tell · Testimony · Teaser"},
  {s:m(14,35),e:m(14,50),name:"Worship Set 2",group:"program",music:"fullband"},
  {s:m(14,50),e:m(15,10),name:"Gospel Presentation 1",group:"program",music:"soft"},
  {s:m(15,10),e:m(15,30),name:"Altar Call 1 + Response",group:"program",music:"acoustic",altar:true},
  {s:m(15,30),e:m(15,45),name:"Worship Set 3",group:"program",music:"fullband"},
  {s:m(15,45),e:m(15,55),name:"TTT Moment 2",group:"program",music:"soft",meta:"Tell · Testimony · Teaser"},
  {s:m(15,55),e:m(16,10),name:"Worship Set 4",group:"program",music:"fullband"},
  {s:m(16,10),e:m(16,30),name:"Gospel Presentation 2",group:"program",music:"soft"},
  {s:m(16,30),e:m(16,50),name:"Altar Call 2 + Response",group:"program",music:"acoustic",altar:true},
  {s:m(16,50),e:m(17,0),name:"Outro + Blessing",group:"program",music:"fullband",meta:"Next event · dinner · Sunday church"}
];
const MUSIC_LABEL={fullband:"Full Band",soft:"Keys / Acoustic (soft)",acoustic:"Acoustic",setup:"Setup"};
function fmt(mins){mins=Math.round(mins);var h=Math.floor(mins/60),mn=mins%60,ap=h>=12?"PM":"AM",hh=h%12;if(hh===0)hh=12;return hh+":"+String(mn).padStart(2,"0")+" "+ap;}
function range(seg){return fmt(seg.s)+" – "+fmt(seg.e);}
var simActive=false,simAnchor=0,simEpoch=0;
function nowMinutes(){if(simActive)return simAnchor+(Date.now()-simEpoch)/60000;var d=new Date();return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;}
function findCurrent(t){for(var i=0;i<SEGMENTS.length;i++){if(t>=SEGMENTS[i].s&&t<SEGMENTS[i].e)return i;}return -1;}
function findNext(t){for(var i=0;i<SEGMENTS.length;i++){if(SEGMENTS[i].s>t)return i;}return -1;}
function countdownStr(toMin){var diff=toMin-nowMinutes();if(diff<0)diff=0;var h=Math.floor(diff/60),mn=Math.floor(diff%60),s=Math.floor((diff*60)%60);if(h>0)return h+"h "+mn+"m";if(mn>0)return mn+"m "+String(s).padStart(2,"0")+"s";return s+"s";}
function renderNow(){
  var t=nowMinutes(),ci=findCurrent(t),ni=findNext(t);
  var liveTag=document.getElementById("liveTag"),liveTxt=document.getElementById("liveTagText");
  var badge=document.getElementById("nowBadge"),progWrap=document.getElementById("nowProgWrap"),prog=document.getElementById("nowProg"),cd=document.getElementById("nowCountdown");
  if(ci>=0){var seg=SEGMENTS[ci];liveTag.classList.remove("off");liveTxt.textContent=seg.group==="program"?"Live Now":"Happening Now";
    document.getElementById("nowName").textContent=(seg.altar?"🙏 ":"")+seg.name;document.getElementById("nowWhen").textContent=range(seg)+(seg.meta?(" · "+seg.meta):"");
    badge.style.display="inline-block";badge.className="badge "+seg.music;badge.textContent=MUSIC_LABEL[seg.music];progWrap.style.display="block";
    var pct=Math.max(0,Math.min(100,((t-seg.s)/(seg.e-seg.s))*100));prog.style.width=pct.toFixed(1)+"%";cd.innerHTML="Wraps in <b>"+countdownStr(seg.e)+"</b>";
  }else{liveTag.classList.add("off");liveTxt.textContent="Standing By";badge.style.display="none";progWrap.style.display="none";
    if(t<SEGMENTS[0].s){document.getElementById("nowName").textContent="Not started yet";document.getElementById("nowWhen").textContent="First call at "+fmt(SEGMENTS[0].s);cd.innerHTML="Day starts in <b>"+countdownStr(SEGMENTS[0].s)+"</b>";}
    else if(ni>=0){document.getElementById("nowName").textContent="Between segments";document.getElementById("nowWhen").textContent="Catch your breath — next up soon";cd.innerHTML="Next in <b>"+countdownStr(SEGMENTS[ni].s)+"</b>";}
    else{document.getElementById("nowName").textContent="Program complete 🎉";document.getElementById("nowWhen").textContent="Ended 5:00 PM SHARP — great work, team.";cd.textContent="Time for teardown. God is good!";}}
  var nc=document.getElementById("nextCard");
  if(ni>=0){nc.style.display="block";document.getElementById("nextName").textContent=SEGMENTS[ni].name;document.getElementById("nextWhen").textContent=range(SEGMENTS[ni])+" · "+MUSIC_LABEL[SEGMENTS[ni].music];}else{nc.style.display="none";}
}
function renderSpine(){
  var t=nowMinutes(),ci=findCurrent(t),mount=document.getElementById("spineMount"),html="",lastGroup="";
  var openSets={};
  mount.querySelectorAll(".setdrop[open]").forEach(function(d){
    var k=d.getAttribute("data-set");
    if(k) openSets[k]=true;
  });
  SEGMENTS.forEach(function(seg,i){
    if(seg.group!==lastGroup){html+='<div class="group-label">'+(seg.group==="setup"?"Setup · 8 AM – 1 PM":"Program · 2 – 5 PM Sharp")+'</div>';lastGroup=seg.group;}
    var cls="seg";if(i===ci)cls+=" now";else if(t>=seg.e)cls+=" past";
    var songs=setlistFor(seg.name);
    var meta=MUSIC_LABEL[seg.music]+(seg.meta?(" · "+seg.meta):"");
    if(songs&&songs.length)meta+=" · "+songs.length+" song"+(songs.length===1?"":"s");
    var openNow=i===ci&&songs&&songs.length;
    html+='<div class="'+cls+'"><div class="rail"><div class="knob"></div></div><div class="content">';
    if(songs&&songs.length){
      html+='<details class="setdrop" data-set="'+esc(seg.name)+'"'+(openSets[seg.name]||openNow?' open':'')+'><summary><div class="row"><span class="nm">'+(seg.altar?"🙏 ":"")+esc(seg.name)+'</span><span class="tm">'+fmt(seg.s)+'</span></div>';
      html+='<div class="meta">'+esc(meta)+' <span class="setchev">▶</span></div></summary>';
      html+=setlistRowsHtml(songs)+'</details>';
    }else{
      html+='<div class="row"><span class="nm">'+(seg.altar?"🙏 ":"")+esc(seg.name)+'</span><span class="tm">'+fmt(seg.s)+'</span></div>';
      html+='<div class="meta">'+esc(meta)+'</div>';
    }
    html+='</div></div>';
  });
  mount.innerHTML=html;
}
function renderStrip(){
  var t=nowMinutes(),ci=findCurrent(t),ni=findNext(t),nowEl=document.getElementById("stripNow"),nextEl=document.getElementById("stripNext"),blip=document.getElementById("stripBlip");
  if(ci>=0){nowEl.textContent=(SEGMENTS[ci].altar?"🙏 ":"")+SEGMENTS[ci].name;blip.style.background="var(--rust)";}
  else if(t<SEGMENTS[0].s){nowEl.textContent="Pre-event setup";blip.style.background="var(--slate)";}
  else if(ni<0){nowEl.textContent="Program complete 🎉";blip.style.background="var(--slate)";}
  else{nowEl.textContent="Between segments";blip.style.background="var(--slate)";}
  nextEl.textContent=ni>=0?(SEGMENTS[ni].name+" · in "+countdownStr(SEGMENTS[ni].s)):"—";
}
function renderClock(){
  var d=new Date(),tEl=document.getElementById("clockTime"),dEl=document.getElementById("clockDate");
  if(simActive){tEl.textContent=fmt(Math.floor(nowMinutes()));dEl.textContent="PREVIEW";}
  else{var h=d.getHours(),mn=d.getMinutes(),ap=h>=12?"PM":"AM",hh=h%12||12;tEl.textContent=hh+":"+String(mn).padStart(2,"0")+" "+ap;dEl.textContent=d.toLocaleDateString(undefined,{weekday:"long"}).toUpperCase();}
}
/* ===== Tech I/O List (Input / Mic / IEM Pack assignments) ===== */
var IO_DEFAULT=[
  {id:"Pack1 (Orange)",name:"Karielle",inst:"",pack:"Pack 1",color:"#ED8B0B",qmix:"1 / 2",tx:"Tx 1",rows:[
    {id:"karielle-lead-vox-mic-b",role:"Lead Vox",gear:"Wireless Mic B (Tuned)",loc:"Ch 2 · AVB 2 · Ark 7 · Mic B"}
  ]},
  {id:"Pack2 (Red)",name:"Zach",inst:"Acoustic Guitar 1",pack:"Pack 2",color:"#E23B2E",qmix:"3 / 4",tx:"Tx 2",rows:[
    {id:"zach-lead-vox-mic-a",role:"Lead Vox",gear:"Wireless Mic A (Tuned)",loc:"Ch 1 · AVB 1 · Ark 6 · Mic A"},
    {id:"zach-stage-talkback-wired-tb-1",role:"Stage Talkback",gear:"Wired TB 1",loc:"Ch 9 · AVB 14 · Ark 14 · Wired TB 1"},
    {id:"zach-acoustic-guitar-1-di",role:"Acoustic Guitar 1",gear:"1x Active DI",loc:"Ch 18 · AVB 21 · Ark 21"}
  ]},
  {id:"Pack3 (Green)",name:"Annie",inst:"",pack:"Pack 3",color:"#79C24A",qmix:"5",tx:"Tx 3 L",rows:[
    {id:"annie-add-l-vox-mic-c",role:"Add'l Vox",gear:"Wireless Mic C (Tuned)",loc:"Ch 3 · AVB 3 · Ark 8 · Mic C"}
  ]},
  {id:"Spare Pack1",name:"Sean",inst:"Bass Guitar",pack:"Spare Pack 1",color:"#c7c2b8",qmix:"6",tx:"Tx 3 R",rows:[
    {id:"sean-bass-guitar-di",role:"Bass Guitar",gear:"1x Active DI / Modeler",loc:"Ch 17 · AVB 18 · Ark 18"}
  ]},
  {id:"Pack4 (Brown)",name:"Mike",inst:"",pack:"Pack 4",color:"#9E6B33",qmix:"7",tx:"Tx 4 L",rows:[
    {id:"mike-add-l-vox-mic-d",role:"Add'l Vox",gear:"Wireless Mic D (Tuned)",loc:"Ch 4 · AVB 4 · Ark 9 · Mic D"},
    {id:"mike-stage-talkback-wired-tb-3",role:"Stage Talkback",gear:"Wired TB 3",loc:"Ch 11 · AVB 16 · Ark 16 · Wired TB 3"}
  ]},
  {id:"Spare Pack2",name:"Jeanne",inst:"Acoustic Guitar 2",pack:"Spare Pack 2",color:"#c7c2b8",qmix:"8",tx:"Tx 4 R",rows:[
    {id:"jeanne-acoustic-guitar-2-di",role:"Acoustic Guitar 2",gear:"1x Active DI",loc:"Ch 19 · AVB 22 · Ark 22"}
  ]},
  {id:"Pack5 (Yellow)",name:"Hollee",inst:"",pack:"Pack 5",color:"#F2CB05",qmix:"9",tx:"Tx 5 L",rows:[
    {id:"hollee-add-l-vox-mic-f",role:"Add'l Vox",gear:"Wireless Mic F (untuned)",loc:"Ch 11 · AVB 11 · Ark 11 · Mic F"}
  ]},
  {id:"Spare Pack3",name:"Cassie",inst:"",pack:"Spare Pack 3",color:"#c7c2b8",qmix:"10",tx:"Tx 5 R",rows:[
    {id:"cassie-add-l-vox-mic-e",role:"Add'l Vox",gear:"Wireless Mic E (Tuned)",loc:"Ch 5 · AVB 5 · Ark 10 · Mic E"}
  ]},
  {id:"Pack6 (Grey)",name:"Brett",inst:"Electric Guitar",pack:"Pack 6",color:"#9AA0A6",qmix:"11 / 12",tx:"Tx 6",rows:[
    {id:"brett-electric-guitar-l",role:"Electric Guitar (L)",gear:"Stereo DI / Modeler (Left)",loc:"Ch 13 · AVB 19 · Ark 19"},
    {id:"brett-electric-guitar-r",role:"Electric Guitar (R)",gear:"Stereo DI / Modeler (Right)",loc:"Ch 14 · AVB 20 · Ark 20"}
  ]},
  {id:"Pack7 (Purple)",name:"John",inst:"Keys",pack:"Pack 7",color:"#7B3FF2",qmix:"13 / 14",tx:"Tx 7",rows:[
    {id:"john-stage-talkback-wired-tb-2",role:"Stage Talkback",gear:"Wired TB 2",loc:"Ch 10 · AVB 15 · Ark 15 · Wired TB 2"},
    {id:"john-keys-l",role:"Keys (L)",gear:"2x Stereo DI (Left)",loc:"Ch 15 · AVB 23 · Ark 23"},
    {id:"john-keys-r",role:"Keys (R)",gear:"2x Stereo DI (Right)",loc:"Ch 16 · AVB 24 · Ark 24"}
  ]},
  {id:"Pack8 (Blue)",name:"Tyler",inst:"Drums",pack:"Pack 8",color:"#2E7CD6",qmix:"15 / 16",tx:"Tx 8",rows:[
    {id:"tyler-kick-drum",role:"Kick Drum",gear:"1. Kick Mic",loc:"Ch 20 · AVB 25 · Ark 25"},
    {id:"tyler-snare-top",role:"Snare Top",gear:"2. Snare Top Mic",loc:"Ch 21 · AVB 26 · Ark 26"},
    {id:"tyler-snare-bottom",role:"Snare Bottom",gear:"3. Snare Bottom Mic",loc:"Ch 22 · AVB 27 · Ark 27"},
    {id:"tyler-toms-mixdown",role:"Toms - Mixdown",gear:"4-6. Tom Mics",loc:"Ch 23 · AVB 57 · NSB 1-3"},
    {id:"tyler-overheads-mixdown",role:"Overheads - Mixdown",gear:"7-8. Overhead (LR) Condensers",loc:"Ch 24 · AVB 58 · NSB 4-5"}
  ]},
  {id:"House",name:"House / Host",inst:"",pack:"",color:"#5c574f",qmix:"",rows:[
    {id:"host-1-speaking-mic",role:"Host 1",gear:"Wireless Mic G",loc:"Ch 7 · AVB 12 · Ark 12 · Mic G"},
    {id:"host-2-speaking-mic",role:"Host 2",gear:"Wireless Mic H",loc:"Ch 8 · AVB 13 · Ark 13 · Mic H"},
    {id:"foh-tech-talkback",role:"FOH Tech Talkback",gear:"Wired TB 4",loc:"Ch 12 · AVB 17 · Ark 17 · Wired TB 4"}
  ]},
  {id:"Playback",name:"Playback",inst:"",pack:"",color:"#5c574f",qmix:"",rows:[
    {id:"playback-tracks-l",role:"Tracks (L)",gear:"Playback Mac · AVB Return",loc:"AVB 33"},
    {id:"playback-tracks-r",role:"Tracks (R)",gear:"Playback Mac · AVB Return",loc:"AVB 34"},
    {id:"playback-click",role:"Click",gear:"Aux In 2 (L)",loc:"AVB 35"},
    {id:"playback-guide",role:"Guide",gear:"Aux In 2 (R)",loc:"AVB 36"}
  ]},
];
var ioEditing=false, ioBuf=null;
function ioClone(o){return JSON.parse(JSON.stringify(o));}
function ioCurrent(){return (STATE.ioList&&STATE.ioList.length)?STATE.ioList:IO_DEFAULT;}
function ioCounts(list){var d=0,t=0;list.forEach(function(p){if(p.off)return;p.rows.forEach(function(r){t++;if(r.done)d++;});});return{done:d,total:t};}
function ioListClearProgress(list){
  if(!list||!list.length)return list;
  return list.map(function(p){
    return{id:p.id,name:p.name,inst:p.inst,pack:p.pack,color:p.color,qmix:p.qmix,tx:p.tx,off:p.off,rows:(p.rows||[]).map(function(r){
      return{id:r.id,role:r.role,gear:r.gear,loc:r.loc};
    })};
  });
}
function renderIOList(){
  var mount=document.getElementById("ioMount");
  if(!mount)return;
  if(ioEditing){renderIOEdit(mount);return;}
  var list=ioCurrent();
  var c=ioCounts(list);
  var bar='<div class="iobar"><span class="prog"><b>'+c.done+'</b> / '+c.total+' inputs patched &amp; checked</span>'+
    (LEADER?'<span class="ioacts"><button class="iobtn reload" onclick="ioReloadDefaults()">↺ Reload defaults</button><button class="iobtn" onclick="ioStartEdit()">✏️ Edit list</button></span>'
           :'<span class="iolock">🔒 Leaders can edit<button onclick="askPin(function(){renderIOList();})">Unlock</button></span>')+'</div>';
  var body=list.map(function(p){
    var rows=p.rows.map(function(r){
      var prim=r.role||r.gear, sec=r.role?r.gear:"";
      var stamp=(r.done&&r.by)?'<span class="iostamp">✓ '+esc(r.by)+(r.t?(' · '+esc(r.t)):'')+'</span>':'';
      return '<div class="iorow'+(r.done?' done':'')+(p.off?'':' tap')+'"'+(p.off?'':' onclick="ioToggle(\''+esc(p.id)+'\',\''+esc(r.id)+'\')"')+'>'+
        '<span class="box"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 6"/></svg></span>'+
        '<span class="w"><b>'+esc(prim)+'</b>'+(sec?'<span>'+esc(sec)+'</span>':'')+stamp+'</span>'+
        (r.loc?'<span class="loc">'+esc(r.loc)+'</span>':'')+'</div>';
    }).join("");
    var chip='<span class="chip" style="background:'+esc(p.color||'#c7c2b8')+'">'+esc(p.id || "—")+'</span>';
    var txLine=p.tx?'<span class="iotx">'+esc(p.tx)+'</span>':'';
    var qx=p.qmix?'<span class="qx">Aux '+esc(p.qmix)+'</span>':'';
    var tag=p.off?'<span class="iotag">Not used</span>':'';
    return '<div class="ioperf'+(p.off?' off':'')+'"><div class="ph">'+chip+
      '<span class="pn">'+esc(p.name)+tag+(p.inst?'<small>'+esc(p.inst)+'</small>':'')+txLine+'</span>'+qx+'</div>'+rows+'</div>';
  }).join("");
  mount.innerHTML=bar+body;
}
function ioNudgeInit(){askName();}
function ioToggle(pid,rid){
  var init=myTag();
  if(!init){askName(function(){ioToggle(pid,rid);});return;}
  /* Per-row write (v1.10.0). The old path uploaded the ENTIRE roster on every
     checkbox tap and the server replaced it wholesale — two techs patching at
     the same time clobbered each other's checkmarks (each phone's copy was up
     to a poll interval stale). Now only this row's final state goes up and the
     server merges it in. The full list rides along as a seed ONLY when the
     server has no roster yet (first ever write). */
  var hadList=!!(STATE.ioList&&STATE.ioList.length);
  var list=ioClone(ioCurrent());
  var row=null;
  list.forEach(function(p){if(p.id===pid)(p.rows||[]).forEach(function(r){if(r.id===rid)row=r;});});
  if(!row)return;
  var done=!row.done,t=nowLabel();
  if(done){row.done=true;row.by=init;row.t=t;}else{row.done=false;row.by="";row.t="";}
  var payload={pid:pid,rid:rid,done:done,by:init,t:t};
  if(!hadList)payload.seed=list;
  queueWrite("ioSetRow",payload,function(){STATE.ioList=list;},function(){renderIOList();renderDashboard();});
}
function ioStartEdit(){
  if(!LEADER){askPin(function(){ioStartEdit();});return;}
  ioBuf=ioClone(ioCurrent());ioEditing=true;renderIOList();
}
function ioReloadDefaults(){
  if(!LEADER){askPin(function(){ioReloadDefaults();});return;}
  if(ioEditing)ioCancelEdit();
  if(!confirm("Reload the Tech I/O roster from the deployed defaults? This replaces the current list for everyone and clears all patch checkmarks."))return;
  var list=ioClone(IO_DEFAULT);
  STATE.ioList=list;
  queueWrite("setIOList",{list:list},function(){STATE.ioList=list;},function(){renderIOList();});
  renderIOList();
}
function ioCancelEdit(){ioEditing=false;ioBuf=null;renderIOList();}
function ioSaveEdit(){
  var list=ioBuf;ioEditing=false;ioBuf=null;
  STATE.ioList=list;
  queueWrite("setIOList",{list:list},function(){STATE.ioList=list;},function(){renderIOList();});
  renderIOList();
}
function ioUid(){return "x"+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
function ioSet(pi,ri,field,val){if(ri<0)ioBuf[pi][field]=val;else ioBuf[pi].rows[ri][field]=val;}
function ioAddRow(pi){ioBuf[pi].rows.push({id:ioUid(),role:"",gear:"",loc:""});renderIOList();}
function ioDelRow(pi,ri){ioBuf[pi].rows.splice(ri,1);renderIOList();}
function ioAddPerf(){ioBuf.push({id:ioUid(),name:"New Performer",inst:"",pack:"",color:"#2E7CD6",qmix:"",tx:"",rows:[{id:ioUid(),role:"",gear:"",loc:""}]});renderIOList();}
function ioDelPerf(pi){if(confirm("Remove this performer and all their inputs?")){ioBuf.splice(pi,1);renderIOList();}}
function renderIOEdit(mount){
  var bar='<div class="ioedbar"><button class="cancel" onclick="ioCancelEdit()">Cancel</button><button class="save" onclick="ioSaveEdit()">✓ Save list</button></div>';
  var body=ioBuf.map(function(p,pi){
    var col=/^#[0-9a-fA-F]{6}$/.test(p.color)?p.color:"#2E7CD6";
    var head='<div class="ph ioph">'+
      '<input value="'+esc(p.name)+'" placeholder="Name" oninput="ioSet('+pi+',-1,\'name\',this.value)" style="max-width:118px">'+
      '<input value="'+esc(p.pack)+'" placeholder="Pack" oninput="ioSet('+pi+',-1,\'pack\',this.value)" style="max-width:78px">'+
      '<input type="color" value="'+col+'" oninput="ioSet('+pi+',-1,\'color\',this.value)" style="width:34px;flex:none;padding:2px">'+
      '<input value="'+esc(p.qmix)+'" placeholder="Aux" oninput="ioSet('+pi+',-1,\'qmix\',this.value)" style="max-width:66px">'+
      '<input value="'+esc(p.tx||"")+'" placeholder="Tx" oninput="ioSet('+pi+',-1,\'tx\',this.value)" style="max-width:72px">'+
      '<button class="iodel" onclick="ioDelPerf('+pi+')" title="Remove performer">✕</button></div>';
    var inst='<div class="iorow"><span class="ioe"><input value="'+esc(p.inst||"")+'" placeholder="Instrument label (optional)" oninput="ioSet('+pi+',-1,\'inst\',this.value)"></span></div>';
    var rows=p.rows.map(function(r,ri){
      return '<div class="iorow"><span class="ioe">'+
        '<input value="'+esc(r.role)+'" placeholder="Role / part" oninput="ioSet('+pi+','+ri+',\'role\',this.value)">'+
        '<input value="'+esc(r.gear)+'" placeholder="Mic / hardware" oninput="ioSet('+pi+','+ri+',\'gear\',this.value)">'+
        '<input value="'+esc(r.loc)+'" placeholder="Input location" oninput="ioSet('+pi+','+ri+',\'loc\',this.value)">'+
        '</span><button class="iodel" onclick="ioDelRow('+pi+','+ri+')" title="Remove input">✕</button></div>';
    }).join("");
    return '<div class="ioperf ed">'+head+inst+rows+'<button class="ioadd" onclick="ioAddRow('+pi+')">＋ Add input</button></div>';
  }).join("");
  mount.innerHTML=bar+body+'<button class="ioaddperf" onclick="ioAddPerf()">＋ Add performer</button>'+bar;
}
/* Real numbers & emails — keep in sync with the Playbook's Leadership Contacts */
var LEADERS=[
  {name:"Zach Silk",role:"Founder / President · The Fourth Ministries",tel:"6174669051",email:"zach.silk@thefourthministries.com"},
  {name:"Kyle DeTrude",role:"COO / Event Coordinator · Safety / Crane",tel:"6034913498",email:"kyle.detrude@thefourthministries.com"},
  {name:"Karielle Silk",role:"Co-Founder / Worship Director",tel:"6037931086",email:"karielle.silk@thefourthministries.com"},
  {name:"Pastor Jeff Caley",role:"Director of Ambassadors",tel:"6032314512",email:"jeff.caley@thefourthministries.com"},
  {name:"Pastor Rich McConnell",role:"Senior Ambassador / Board Member",tel:"6036864535",email:"rich.mcconnell@thefourthministries.com"},
  {name:"Kat Roedell",role:"Director of Logistics / Intercession",tel:"6036570259",email:"kat.roedell@thefourthministries.com"},
  {name:"Laura McCollum",role:"Director of Marketing / First-Aid Lead (R.N.)",tel:"6034938226",email:"laura.mccollum@thefourthministries.com"},
  {name:"Michael Nelson",role:"Director of Technology / FOH",tel:"9738647534",email:"michael.nelson@thefourthministries.com"},
  {name:"Liz DeTrude",role:"Guest Services & Merchandise Lead",tel:"4014400498",email:"elizabeth.detrude@thefourthministries.com"},
  {name:"John Huff",role:"Music Director",tel:"6036178654",email:"john.huff@thefourthministries.com"}
];
var PHONE='<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 7a2 2 0 0 1 2-3z"/></svg>';
var CHAT='<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 3z"/></svg>';
var MAIL='<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
function fmtTel(t){return "("+t.slice(0,3)+") "+t.slice(3,6)+"-"+t.slice(6);}
function renderLeaders(){
  document.getElementById("leadersMount").innerHTML=LEADERS.map(function(l){
    var p=l.name.split(" ");var init=p.map(function(w){return w[0];}).slice(-2).join("");
    var emailLine=l.email?'<a class="tel mail-l" href="mailto:'+esc(l.email)+'">'+esc(l.email)+'</a>':'';
    var emailBtn=l.email?'<a class="mail" href="mailto:'+esc(l.email)+'" rel="noopener" aria-label="Email '+esc(l.name)+'">'+MAIL+'</a>':'';
    return '<div class="leader"><span class="av">'+init+'</span><span class="who"><b>'+esc(l.name)+'</b><span>'+esc(l.role)+'</span><a class="tel" href="tel:+1'+l.tel+'">'+fmtTel(l.tel)+'</a>'+emailLine+'</span><span class="acts"><a class="call" href="tel:+1'+l.tel+'" rel="noopener" aria-label="Call '+esc(l.name)+'">'+PHONE+'</a><a class="text" href="sms:+1'+l.tel+'" rel="noopener" aria-label="Text '+esc(l.name)+'">'+CHAT+'</a>'+emailBtn+'</span></div>';
  }).join("");
}
/* Checklist item IDs are POSITIONAL (su-<day>-<sectionIndex>-<itemIndex>), so
   saved checkmarks are keyed to array positions. Two rules keep old state safe:
   1. NEVER reorder or delete array entries to change display order — set `ord`
      instead (sections sort by ord, falling back to their array position).
   2. NEVER remove an item from the middle of a section without pinning the
      indexes of the items after it — an item may carry an explicit index as a
      third element ([label, due, index]) so its ID survives the removal. */
var SETUP=[
  {day:"fri",cat:"tech",team:"2 Wks Prior · Pre-Event Prep",lead:"M. Nelson",items:[["Confirm dBL maximums (if required)",m(12,0)],["Reach out to event POC — confirm details & changes",m(12,0)],["Musicians confirmed",m(12,0)],["Materials PRINTED — 12 copies of each",m(12,0)],["Stage Plot confirmed, posted to Teams, sent via PCO",m(12,0)],["Input List confirmed, posted, sent via PCO",m(12,0)],["Site Layout Confirmed, posted to Teams, sent via PCO",m(12,0)],["Companion App order of events double checked. Leadership PIN given to Leadership. App Link and Volunteer day PIN sent to leadership to forward to their volunteers.",m(12,0)],["Print copies of IP list & Set List.",m(12,0)],["Computer set up (tracks, routing)",m(12,0)],["ARK console set up & fully prepped",m(12,0)],["Multitracks setlist built in PCO + tracks downloaded offline",m(12,0)],["iPad backup prepped (tracks + ARK adapter)",m(12,0)]]},
  {day:"fri",ord:2,cat:"tech",team:"Phase 2 · Power Up — Fri 12:30–2:30",lead:"M. Nelson",items:[["Generator power on",m(14,30)],["Plug T4 trailer into power (120v ext into side)",m(14,30)],["Power drops from Papa V trailer",m(14,30)],["Stage power drops (2 front / 2 back)",m(14,30)],["Set up Starlink",m(14,30)],["FOH tables set",m(14,30)],["Assemble Drum Kit Riser, Drum Kit Shells & All Hardware.",m(14,30)],["Set up ARK (power, table, wifi, antennas, computer)",m(14,30)],["Extend antenna combiner cables",m(14,30)],["Confirm computer routing (tracks, video, click, guide)",m(14,30)],["FOH wiring — cable covers + 2x ethernet band→FOH (1 AVB / 1 internet)",m(14,30)],["FOH console + Papa V stage box — connect all AVB cables",m(14,30)],["FOH speakers — mount mains, set subs, run power + XLRs, power on",m(14,30)],["Power cycle ARK & FOH (AVB sync)",m(14,30)],["Configure wireless freqs (500/900 MHz scan, 15 min max — packs + handhelds)",m(14,30),15],["XLR drops to musician stations per stage plot",m(14,30),16],["Connect all drum mics per stage plot",m(14,30),17],["Call local PD — request overnight patrol",m(14,30),18]]},
  {day:"fri",ord:1,cat:"log",team:"Phase 1 · Unloading — Fri 12:30–2:30",lead:"M. Nelson",items:[["Check radios",m(14,30)],["Plot all tent locations with cones according to Site Layout",m(14,30)],["Confirm & plot crane location",m(14,30)],["Unload trusses from Papa V trailer (bring 'Little Giant' ladder)",m(14,30)],["Set up trusses (THE Tower) — do NOT set up mains or subs",m(14,30)],["Unload all tents, kits, and weight bags at each cone",m(14,30)],["Split into teams of 6 and build tents. Order of priority: 1. Band Tents 2. FOH 3. Guest Services 4. Ambassadors. Note: Do not set up logistics tents or green room tent. Leave items staged on the ground.",m(14,30)],["Tech team begins Tech setup after Band & FOH tents are constructed. Everyone else finish Guest Services & Ambassador tents.",m(14,30)]]},
  {day:"fri",ord:4,cat:"log",team:"Phase 4 · Build Jesus Rig — Fri 12:30–2:30",lead:"Kyle DeTrude",items:[["Assemble square truss rig. Leave on the ground.",m(14,30)],["Assemble threaded pipe square. Leave on the ground next to truss rig.",m(14,30)]]},
  {day:"fri",ord:3,cat:"tech",team:"Phase 3 · System Tuning — Fri 2:30–4:15",lead:"M. Nelson",items:[["Connect Papa V computer for system tuning",m(16,15)],["Line check all I/Os — test with wired mic",m(16,15)],["Blast & balance (refer to NLC FOH guide)",m(16,15)],["Board + iPad roaming; move speakers as needed",m(16,15)],["dBL readings at property boundary per municipal req; adjust",m(16,15)],["Ring out all mics (check feedback)",m(16,15)],["Gate MD mics appropriately",m(16,15)],["Gate Host mics appropriately",m(16,15)],["Balance drum kit",m(16,15)],["Confirm recording SD destinations (onboard SD + Logic)",m(16,15)]]},
  {day:"fri",ord:3.1,cat:"log",team:"Phase 3 · Tuning Support — Fri 2:30–4:15 (shifted to help)",lead:"Kat Roedell",items:[["Run cable covers",m(16,15)],["Move / hold speakers during blast & balance",m(16,15)],["Stage remaining gear as directed",m(16,15)]]},
  {day:"fri",ord:6,cat:"both",team:"Phase 6 · Shut Down — Fri 4:15–5:00 (all hands)",lead:"M. Nelson",items:[["Save scenes on all PreSonus consoles",m(17,0)],["Label, disconnect & store speakers",m(17,0)],["Disconnect & store ARK (if needed)",m(17,0)],["Fasten tent walls",m(17,0)],["Cover rig",m(17,0)],["Rainproof everything",m(17,0)],["Lock trailers (doors, padlocks, tongue lock)",m(17,0)],["Turn off generators",m(17,0)],["Return radios",m(17,0)],["Plug T4 trailer into mains for overnight charging",m(17,0)],["Implement security protocol",m(17,0)]]},
  {day:"sat",cat:"tech",team:"Phase 7 · Open Up — Sat 8:00–8:30",lead:"M. Nelson",items:[["Check out radios",m(8,30)],["Turn on generators",m(8,30)],["Reconnect speakers (and ARK)",m(8,30)],["Turn on FOH and host mic — host mic ON and UNMUTED (ready for all-team huddle)",m(8,30)],["Mic stands & mics per stage plot (moved from Fri)",m(8,30)]]},
  {day:"sat",cat:"tech",team:"Phase 8a · Worship Set Up — Sat 10:00–12:00",lead:"Karielle Silk",items:[["Set up personal gear (power, XLR)",m(12,0)],["Worship Team - Retrieve wireless pack from red Packout drawer.",m(12,0)],["Playback sync enabled",m(12,0)],["Worship app — connect to 'T4 Sound' wifi",m(12,0)],["Chart builder open, setlist downloaded & synced",m(12,0)],["Q-Mix downloaded, connected to ARC (grant permissions)",m(12,0)],["GAIN STAGE — line check all (peaks ≤ -6.0 dB); DO NOT TOUCH GAIN AFTER",m(12,0)],["All FX, EQ, compression OFF",m(12,0)],["Mix IEMs — pink noise; musicians set pack master; loop one chorus",m(12,0)],["Mix FOH — do NOT touch gains/preamp; EQ; compress; FX",m(12,0)],["Run through transitions",m(12,0)]]},
  {day:"sat",cat:"log",team:"Phase 8b · Crane Rigging — Sat 11:00–12:00",lead:"Kyle DeTrude",items:[["Guide crane to spot",m(12,0)],["Attach prebuilt square truss rig, then hoist the rig to a workable height with the crane.",m(12,0)],["Attach (4) JESUS banners to the trussing with zip ties. Attach the threaded pipe square to the bottom of the (4) banners with zip ties.",m(12,0)],["Attach guy lines to rig",m(12,0)],["Notify Zach and Marketing team when rig is 100% ready to be raised. Do NOT raise the rig yet.",m(12,0)],["When given the order by Zach/Marketing Team, raise the rig to its final height.",m(12,0)],["Secure guy lines to ground",m(12,0)],["Rig wind-tied & flown by 12:00 PM latest",m(12,0)]]},
  {day:"sat",cat:"tech",team:"Phase 9 · Fit & Finish — Sat 12:00–12:10",lead:"M. Nelson",items:[["Clean up stage (bags/cases/totes → green room)",m(12,10)],["Cable management (perpendicular & parallel)",m(12,10)],["Change all mic and pack batteries. Only use Black Fujitsu batteries for mics and packs. Do NOT use green batteries for mics and packs.",m(12,10)],["Prayer over venue",m(12,10)],["Arm multitrack recording to SD / standalone on ARK",m(12,10)],["Rest",m(12,10)]]},
  {day:"sat",ord:0.5,cat:"log",team:"Phase 7b · Day-Of Logistics — Sat morning",lead:"Kat Roedell",items:[["Tents put up",m(10,0)],["Tents set up inside — tables, chairs & signage",m(10,0)],["Parking — cones, signs & flow set",m(10,0)],["Crowd control vests handed out",m(10,0)],["Security brief done",m(10,0)],["Ice picked up & in coolers",m(10,0)]]},
  {day:"sat",ord:3.5,cat:"log",team:"Guest Services · Day-Of — Sat",lead:"Guest Services",items:[["Welcome tables stocked — booklets, pens, signage",m(13,0)],["Water & ice at Guest Services tent",m(13,0)],["Kids & family area walked and safe",m(13,0)]]},
  {day:"sat",ord:3.6,cat:"log",team:"Ambassadors · Day-Of — Sat",lead:"Ambassador Leads",items:[["Ambassadors checked in & briefed",m(13,0)],["Counselor booklets in hand · counters have the app open",m(13,0)]]},
  /* Appended at the END of the array on purpose — checkmark IDs are keyed to
     array position, so inserting here would re-key every section after it.
     ord:0 makes it DISPLAY first, ahead of the 2-Wks-Prior list. */
  {day:"fri",ord:0,cat:"both",team:"Phase 0 · Travel & Hospitality — Ahead of the event",lead:"Leadership",items:[
    ["Identify who is travelling in — out-of-town crew, band, speakers, guests",m(12,0)],
    ["Hotel booked & confirmed for everyone who needs a room (names on the reservation)",m(12,0)],
    ["Hotel details sent to each person staying — address, check-in time, confirmation number",m(12,0)],
    ["Friday dinner reservation made for the setup crew — headcount confirmed",m(12,0)],
    ["Saturday breakfast sorted for the overnight crew — hotel breakfast confirmed, or a spot/order arranged before the 8 AM call",m(12,0)],
    ["Saturday setup-crew lunch confirmed (pizza order placed / delivery time set)",m(12,0)],
    ["Any dietary needs & allergies collected and passed to whoever is ordering",m(12,0)],
    ["Travel plan confirmed with each traveller — arrival times, who is driving, parking",m(12,0)],
    ["Whoever it applies to has been told directly: hotel, dinner and reservation details in writing",m(12,0)]
  ]}
];
var TEARDOWN=[];
var STATE={checklist:{},announcements:[],checkins:[],feedback:[],praises:[],miracles:[],count:0,event:{name:"",date:""},ioList:[],dayPinSet:false,funding:{pct:64,needed:"$60,000"},prompter:{scripts:[]},tallyBy:{},radios:[]};
var LIVE=false,LEADER=false,seenAnn=0,seenIssue=0,inflight=0,countFlushT=null,countSending=false;
/* Which announcement the volunteer closed (id, or "checkin"), and the last
   urgent one we alerted for — see renderAnnouncements. */
var annBarDismissedId="",annBarLastUrgent="";
var lastSyncAt=0,everSynced=false; /* v1.2.0 — sync freshness */
var remoteDirty=false;
/* "Nothing of ours is in flight, so a server payload is safe to adopt whole."
   A DIRTY tally is deliberately not part of this: dirty just means taps are
   waiting to be pushed, which can persist across a whole outage — gating the
   poll loop on it stopped phones from ever reconnecting. The count/tallyBy
   fields are protected separately in adoptCounts(). */
function settled(){return inflight===0&&!countSending&&!decSending;}
/* Keep our own un-pushed tally from being overwritten by a server payload that
   doesn't include it yet. */
function adoptCounts(s,prevCount,prevBy,prevDec,prevDecBy){
  if(typeof TALLY!=="undefined"&&TALLY.dirty){s.count=prevCount;s.tallyBy=prevBy;}
  if(typeof DEC!=="undefined"&&DEC.dirty){s.decisions=prevDec;s.decBy=prevDecBy;}
  return s;
}
var API="/.netlify/functions/data";
var MY={name:""};
try{MY.name=(localStorage.getItem("k2c_name")||"").slice(0,40);}catch(_){}
function nowLabel(){return fmt(nowMinutes());}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
/* Escapes BOTH quote styles. Single quotes matter: ids are interpolated into
   onclick="fn('...')" handlers all over this file, so a lone ' would break out
   of the JS string literal inside the attribute. */
function esc(s){return(s||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
function normalize(s){return{checklist:s.checklist||{},locked:!!s.locked,notes:s.notes||{},announcements:s.announcements||[],checkins:s.checkins||[],feedback:s.feedback||[],praises:s.praises||[],miracles:Array.isArray(s.miracles)?s.miracles:[],witnessMin:s.witnessMin||2,county:s.county||"",countyAuto:s.countyAuto!==false,dayPin:s.dayPin||"",dayPinManual:!!s.dayPinManual,dayPinAuto:s.dayPinAuto||"",pinRollsOver:s.pinRollsOver||"",nextCounty:s.nextCounty||"",nextPin:s.nextPin||"",eventDate:s.eventDate||"",count:s.count||0,decisions:s.decisions||0,decBy:s.decBy||{},extras:Array.isArray(s.extras)?s.extras:[],event:s.event||{name:"",date:""},ioList:s.ioList||[],dayPinSet:!!s.dayPinSet,funding:s.funding||{pct:64,needed:"$60,000"},tallyBy:s.tallyBy||{},radios:Array.isArray(s.radios)?s.radios:[],prompter:(s.prompter&&Array.isArray(s.prompter.scripts))?s.prompter:{scripts:[]},captureCount:s.captureCount||0,captureBytes:s.captureBytes||0,captureBudget:s.captureBudget||0,churchesRev:(s.churchesRev!=null?s.churchesRev:null),churchCount:s.churchCount||0};}
function toast(msg){var el=document.getElementById("toastEl");if(!el){el=document.createElement("div");el.id="toastEl";el.className="toast";document.body.appendChild(el);}el.textContent=msg;el.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove("show");},2600);}
function vibr(ms){try{if(navigator.vibrate)navigator.vibrate(ms);}catch(_){}}
function hasFullState(s){return !!(s&&("checklist" in s||"announcements" in s||"count" in s));}
function reconcileResponse(s){if(hasFullState(s)){var pc=STATE.count,pb=STATE.tallyBy,pd=STATE.decisions,pdb=STATE.decBy;STATE=adoptCounts(applyPending(normalize(s)),pc,pb,pd,pdb);}}
function userEditing(){
  var e=document.activeElement;
  return !!(e&&(e.matches("input,textarea,[contenteditable=true]")||e.closest(".cmtform")));
}
document.addEventListener("focusout",function(){
  setTimeout(function(){if(remoteDirty&&!userEditing()){remoteDirty=false;renderDynamic();}},120);
});
/* A write that never reached the server used to fail in silence — the user saw
   their (local, optimistic) change and had no idea nobody else did. Say so. */
var lastUnsavedWarn=0;
function warnUnsaved(){
  var n=Date.now();if(n-lastUnsavedWarn<8000)return;lastUnsavedWarn=n;
  toast("⚠️ Couldn't reach the server — that change is only on this phone. Retry when you're back online.");
}
var lastEtag="";
/* Same-origin custom headers — no preflight. The API verifies these; sending
   them on GET is what keeps the roster and the boards out of public reach. */
function authHeaders(h){
  h=h||{};
  var dp=dayPinStored();if(dp)h["X-Day-Pin"]=dp;
  if(LEADERPIN)h["X-Leader-Pin"]=LEADERPIN;
  return h;
}
function apiGet(){
  var h=authHeaders();if(lastEtag)h["If-None-Match"]=lastEtag;
  return fetch(API,{method:"GET",headers:h}).then(function(r){
    if(r.status===304)return {__nomod:true};   // nothing changed since our last poll
    if(!r.ok)throw(r.status||0);
    var et=r.headers.get("ETag");if(et)lastEtag=et;
    return r.json();
  });
}
/* One-shot pull outside the poll cadence (used right after unlocking). */
function refreshFromServer(){
  return apiGet().then(function(s){
    if(s&&s.__nomod)return;
    lastSyncAt=Date.now();everSynced=true;if(!LIVE){LIVE=true;}
    var pc=STATE.count,pb=STATE.tallyBy,pd=STATE.decisions,pdb=STATE.decBy;
    STATE=adoptCounts(applyPending(normalize(s)),pc,pb,pd,pdb);adoptTallyEpoch(s);adoptDecEpoch(s);maybeDayGate();renderDynamic();updateSync();
  }).catch(function(){});
}
var LEADERPIN=sessionStorage.getItem("k2c_lpin")||"";
function apiPost(a,p){return fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:a,payload:p,pin:LEADERPIN,dayPin:dayPinStored()})}).then(function(r){
  if(r.status===403){
    /* Two different 403s now: the Day PIN gate (whole session is locked out —
       show the gate, keep the queued write) and a leader-PIN rejection. */
    return r.json().catch(function(){return {};}).then(function(d){
      if(d&&d.locked){
        try{sessionStorage.removeItem("k2c_daypin");sessionStorage.removeItem("k2c_dayok");}catch(_){}
        maybeDayGate();
        throw 403;
      }
      LEADER=false;LEADERPIN="";sessionStorage.removeItem("k2c_lpin");applyLeaderUI();renderDynamic();
      alert("Leader PIN check failed — tap a 🔒 to unlock again.");
      throw 403;
    });
  }
  if(!r.ok)throw(r.status||0);
  return r.json();
});}
function verifyPin(action,pin){return fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:action,pin:pin,dayPin:dayPinStored()})}).then(function(r){if(r.status===403)return null;if(r.status===429)return {rateLimited:true};if(!r.ok)throw 0;return r.json();});}
function doAction(action,payload,localApply){
  // Apply optimistically right away so the UI feels instant, then reconcile
  // with the server. While any write is in flight we ignore polls & server
  // echoes so a slow round-trip can't clobber a fresh local change.
  localApply();renderDynamic();
  if(LIVE||everSynced){
    inflight++;
    apiPost(action,payload).then(function(s){
      inflight=Math.max(0,inflight-1);if(!LIVE){LIVE=true;updateSync();}if(settled()){reconcileResponse(s);renderDynamic();}
    }).catch(function(err){
      inflight=Math.max(0,inflight-1);LIVE=false;updateSync();renderDynamic();if(err!==403)warnUnsaved();
    });
  }
}
/* ===== v1.10.0 — hardened checklist sync (the "my checkmarks got undone" fix) =====
   Before this, checklist writes were fire-and-forget: one failed POST flipped
   LIVE off, every later tap was applied locally but NEVER sent, and the next
   successful background poll replaced STATE with the server copy — silently
   undoing everything tapped while LIVE was off, even on a working connection.
   Now every tap-frequency write — checkmarks, notes, acknowledge/hide, I/O
   patch rows, radios, check-ins, praise, issues, announcements, comments —
   goes through a persistent OUTBOX (localStorage):
   1. every write is queued and retried with backoff until the server confirms
      it — a network blip delays a write, it never discards it;
   2. queued writes are re-applied on top of every server payload, so a poll
      can never visually revert work that hasn't flushed yet;
   3. every queued action is idempotent server-side: set-style actions
      (setCheck/setAck/setRadio/ioSetRow) carry the explicit FINAL state, and
      add-style actions (posts, check-ins, comments) carry a client id the
      server dedupes on — so a retry of a request that already landed, or two
      people doing the same thing at once, is a no-op instead of a re-toggle
      or a duplicate;
   4. the outbox survives reload/tab-close and flushes on next open. */
/* Set-style actions: a newer write for the same target supersedes an older
   unsent one, so the queue compacts on this key. Add-style actions have no
   entry here — every one of those is its own record. */
var OB_KEY={
  setCheck:function(p){return p.id;},
  setChecklistNote:function(p){return p.id;},
  setAck:function(p){return p.kind+":"+p.id;},
  setRadio:function(p){return "n"+p.n;},
  ioSetRow:function(p){return p.pid+"/"+p.rid;},
  /* Whole-record leader saves: only the latest matters, so they compact to a
     single queued op each. */
  setIOList:function(){return "io";},
  setEvent:function(){return "event";},
  setFunding:function(){return "funding";}
};
/* Actions the server gates behind the leader PIN — held in the queue (not
   sent, not dropped) whenever this session has no PIN, e.g. after a reload. */
var OB_LEADER={setCheck:1,setChecklistNote:1,setAck:1,addAnnouncement:1,setIOList:1,setEvent:1,setFunding:1,miracleDelete:1};
var OUTBOX=[];
try{OUTBOX=JSON.parse(localStorage.getItem("k2c_outbox")||"[]");}catch(_){OUTBOX=[];}
if(!Array.isArray(OUTBOX))OUTBOX=[];
function outboxSave(){try{localStorage.setItem("k2c_outbox",JSON.stringify(OUTBOX.slice(-500)));}catch(_){}}
var obTimer=null,obFails=0,obSending=false,obSendingId="";
function queueWrite(action,payload,localApply,rerender){
  localApply();rerender();
  /* Set-style writes state the FINAL value for their target, so an older
     unsent write for the same target is obsolete — drop it (never the one at
     index 0 while it's mid-flight). A dropped op's seed (first-write I/O
     roster payload) is carried forward so it can't be lost. */
  var keyFn=OB_KEY[action];
  if(keyFn){
    var k=keyFn(payload);
    for(var i=OUTBOX.length-1;i>=0;i--){
      if(OUTBOX[i].id===obSendingId)continue; // never drop the op currently in flight
      if(OUTBOX[i].a===action&&OUTBOX[i].p&&keyFn(OUTBOX[i].p)===k){
        if(OUTBOX[i].p.seed&&!payload.seed)payload.seed=OUTBOX[i].p.seed;
        OUTBOX.splice(i,1);
      }
    }
  }
  OUTBOX.push({a:action,p:payload,id:uid()});
  outboxSave();updateSync();
  obFlush();
}
/* Index of the first op we can actually send right now. A leader-only op with
   no PIN in this session is HELD, but it must not block unrelated writes queued
   behind it (a volunteer's check-in or praise post has no causal dependency on
   a leader's checkmark) — so we skip past held ops instead of stopping. */
function obNextIdx(){
  for(var i=0;i<OUTBOX.length;i++)if(!(OB_LEADER[OUTBOX[i].a]&&!LEADERPIN))return i;
  return -1;
}
function obDrop(id){
  for(var i=0;i<OUTBOX.length;i++)if(OUTBOX[i].id===id){OUTBOX.splice(i,1);return;}
}
function obFlush(){
  if(obSending||!OUTBOX.length)return;
  var idx=obNextIdx();
  if(idx<0){updateSync();return;} // everything queued is waiting on a leader unlock
  var op=OUTBOX[idx];
  obSending=true;obSendingId=op.id;inflight++;
  apiPost(op.a,op.p).then(function(){
    obSending=false;obSendingId="";inflight=Math.max(0,inflight-1);obFails=0;
    obDrop(op.id);outboxSave();
    lastSyncAt=Date.now();everSynced=true;
    if(!LIVE)LIVE=true;
    updateSync();
    if(OUTBOX.length)obFlush();
  }).catch(function(err){
    obSending=false;obSendingId="";inflight=Math.max(0,inflight-1);
    if(err===403){updateSync();return;}               // PIN rejected — queue held until the leader unlocks again
    if(err===400){obDrop(op.id);outboxSave();updateSync();if(OUTBOX.length)obFlush();return;} // server refused it outright — a retry can't succeed
    obFails++;
    if(LIVE){LIVE=false;}
    updateSync();
    clearTimeout(obTimer);
    obTimer=setTimeout(obFlush,Math.min(30000,1000*Math.pow(2,Math.min(5,obFails))));
  });
}
/* Re-apply not-yet-confirmed writes on top of a server payload so polls can't
   visually revert them while they wait to flush. */
function applyPending(st){
  for(var i=0;i<OUTBOX.length;i++){
    var op=OUTBOX[i],p=op.p||{};
    if(op.a==="setCheck"){
      if(p.on)st.checklist[p.id]={by:p.by,t:p.t,dm:(p.dm!=null?p.dm:null)};
      else delete st.checklist[p.id];
    }else if(op.a==="setChecklistNote"){
      st.notes=st.notes||{};
      if(p.text)st.notes[p.id]=p.text;else delete st.notes[p.id];
    }else if(op.a==="setAck"){
      var arr=(p.kind==="praise"?st.praises:st.feedback)||[];
      for(var j=0;j<arr.length;j++){
        if(arr[j].id===p.id){arr[j].hidden=!!p.hidden;arr[j].ackBy=p.hidden?p.by:"";arr[j].ackT=p.hidden?p.t:"";break;}
      }
    }else if(op.a==="setRadio"){
      if(!(st.radios&&st.radios.length===10))st.radios=defaultRadiosLocal();
      st.radios[p.n-1]={n:p.n,out:p.out||null,in:p.in||null};
    }else if(op.a==="ioSetRow"){
      if((!st.ioList||!st.ioList.length)&&p.seed)st.ioList=JSON.parse(JSON.stringify(p.seed));
      (st.ioList||[]).forEach(function(perf){
        if(perf.id===p.pid)(perf.rows||[]).forEach(function(r){
          if(r.id===p.rid){r.done=!!p.done;r.by=p.done?p.by:"";r.t=p.done?p.t:"";}
        });
      });
    }else if(op.a==="addCheckin"){
      if(!st.checkins.some(function(c){return c.id===p.id;}))st.checkins.push(p);
    }else if(op.a==="addAnnouncement"){
      if(!st.announcements.some(function(a){return a.id===p.id;}))st.announcements.unshift(p);
    }else if(op.a==="addPraise"){
      if(!st.praises.some(function(x){return x.id===p.id;}))st.praises.unshift(p);
    }else if(op.a==="addFeedback"){
      if(!st.feedback.some(function(x){return x.id===p.id;}))st.feedback.unshift(p);
    }else if(op.a==="miracleAdd"){
      st.miracles=st.miracles||[];
      if(!st.miracles.some(function(x){return x.id===p.id;}))st.miracles.unshift(p);
    }else if(op.a==="miracleWitness"){
      var mm=(st.miracles||[]).filter(function(x){return x.id===p.id;})[0];
      if(mm){
        mm.witnesses=Array.isArray(mm.witnesses)?mm.witnesses:[];
        if(!mm.witnesses.some(function(w){return w.wid===p.wid;}))mm.witnesses.push({wid:p.wid,name:p.name,note:p.note||"",dev:p.dev,t:p.t,d:p.d});
      }
    }else if(op.a==="miracleDelete"){
      st.miracles=(st.miracles||[]).filter(function(x){return x.id!==p.id;});
    }else if(op.a==="setIOList"){
      if(Array.isArray(p.list))st.ioList=p.list;
    }else if(op.a==="setEvent"){
      st.event={name:p.name||"",date:p.date||""};
    }else if(op.a==="setFunding"){
      st.funding={pct:p.pct,needed:p.needed||(st.funding&&st.funding.needed)||""};
    }else if(op.a==="addChecklistItem"){
      st.extras=(st.extras||[]);
      if(!st.extras.some(function(x){return x.id===p.id;}))st.extras.push(p);
    }else if(op.a==="removeChecklistItem"){
      st.extras=(st.extras||[]).filter(function(x){return x.id!==p.id;});
      delete st.checklist["x-"+p.id];
    }else if(op.a==="captureSetState"){
      /* capAll is a separate leader-only fetch; nothing to overlay here. */
    }else if(op.a==="churchLog"){
      /* CH is its own cache; nothing to overlay on the main payload. */
    }else if(op.a==="addComment"){
      var list=p.kind==="praise"?st.praises:(p.kind==="ann"?st.announcements:st.feedback);
      var card=(list||[]).filter(function(x){return x.id===p.id;})[0];
      if(card){
        card.comments=Array.isArray(card.comments)?card.comments:[];
        if(!card.comments.some(function(c){return c.cid&&c.cid===p.cid;}))card.comments.push({cid:p.cid,name:p.name,text:p.text,t:p.t});
      }
    }
  }
  return st;
}
window.addEventListener("online",function(){
  obFails=0;obFlush();
  if(typeof TALLY!=="undefined"&&TALLY.dirty)scheduleFlush(300);
  if(typeof capFlush==="function")capFlush();
});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")obFlush();});
/* Last-gasp flush if the tab closes with writes still queued: fire them as
   beacons. They stay queued (a beacon can't confirm delivery), but every
   queued action is idempotent, so the re-send on next open is harmless. */
window.addEventListener("pagehide",function(){
  if(!OUTBOX.length||!navigator.sendBeacon)return;
  for(var i=0;i<OUTBOX.length;i++){
    var op=OUTBOX[i];
    try{navigator.sendBeacon(API,new Blob([JSON.stringify({action:op.a,payload:op.p,pin:LEADERPIN})],{type:"application/json"}));}catch(_){}
  }
});
/* Demo content is for local development only — see boot(). */
function isLocalDev(){
  try{var h=location.hostname;return h==="localhost"||h==="127.0.0.1"||h==="::1"||h===""||location.protocol==="file:";}catch(_){return false;}
}
/* Last good server payload, so an offline boot shows the real board (clearly
   marked stale by the sync pill) instead of nothing. Capped and best-effort. */
function saveCache(s){
  try{localStorage.setItem("k2c_cache",JSON.stringify({t:Date.now(),s:s}));}catch(_){}
}
function loadCache(){
  try{
    var r=JSON.parse(localStorage.getItem("k2c_cache")||"null");
    if(r&&r.s){cacheAge=r.t||0;return normalize(r.s);}
  }catch(_){}
  return null;
}
var cacheAge=0;
function agoLabel(ts){
  var m=Math.max(0,Math.round((Date.now()-ts)/60000));
  if(m<1)return "moments ago";
  if(m<60)return m+" min ago";
  var h=Math.round(m/60);return h+(h===1?" hour ago":" hours ago");
}
function seedDemo(){return normalize({
  announcements:[{id:uid(),pri:"heads",title:"Doors open at 1:00 PM",body:"Final setup check now — parking team to your posts.",by:"Kat Roedell · Logistics",t:"12:40 PM"},{id:uid(),pri:"urgent",title:"Stay clear of the crane zone",body:"Jesus Rig going up. Non-Tech volunteers keep outside the marked area until the all-clear.",by:"Kyle DeTrude · COO",t:"11:00 AM"}],
  praises:[{id:uid(),name:"Liz DeTrude",body:"First salvation of the day at the front table — heaven is rejoicing! 🎉",t:"3:18 PM"}],
  feedback:[{id:uid(),priority:"med",title:"Parking sign blew over",body:"North entrance arrow is down — folks taking the wrong lane.",by:"Troy",t:"1:22 PM"}],
  checkins:[{id:uid(),name:"Rachel",team:"Ambassadors",t:"9:05 AM"},{id:uid(),name:"Bethanie",team:"Guest Services",t:"9:02 AM"}],
  count:0
});}
function stripDate(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function dateKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function parseEventSaturday(){
  var raw=((STATE.event&&STATE.event.date)||"").trim();
  if(!raw)return null;
  var iso=raw.match(/(\d{4}-\d{2}-\d{2})/);
  if(iso){var d=new Date(iso[1]+"T12:00:00");if(!isNaN(d.getTime()))return stripDate(d);}
  var md=raw.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/i);
  if(md){var d=new Date(md[1]+" "+md[2]+", "+new Date().getFullYear());if(!isNaN(d.getTime()))return stripDate(d);}
  var d=new Date(raw);if(!isNaN(d.getTime()))return stripDate(d);
  return null;
}
function setupDayLabel(day){return day==="fri"?"Fri":"Sat";}
/* Rain date. The playbook promises "leadership decides Friday evening to move
   the main event to Sunday" — but every clock here was pinned to Saturday, so
   on a rain Sunday the whole checklist read "Overdue" and every radio flagged
   late. A leader sets event.shift (days) and all timing moves with it. */
function eventShift(){var n=Number(STATE.event&&STATE.event.shift);return Number.isFinite(n)?Math.max(0,Math.min(2,Math.round(n))):0;}
function setupTimingContext(day){
  var sat=parseEventSaturday(),today=stripDate(new Date());
  if(sat){
    var target=new Date(sat.getTime());
    target.setDate(target.getDate()+eventShift());
    if(day==="fri")target.setDate(target.getDate()-1);
    var diff=Math.round((today-target)/86400000);
    if(diff<0)return{phase:"before",day:day};
    if(diff>0)return{phase:"after",now:99999};
    return{phase:"live",now:nowMinutes()};
  }
  /* No usable event date. The old fallback treated EVERY Friday/Saturday as
     live, so ordinary off-weekends showed false "Overdue" alarms all day.
     Stay neutral instead and nudge a leader to set the date. */
  return{phase:"before",day:day};
}
function itemStatus(due,rec,day){
  var ctx=setupTimingContext(day);
  if(rec){
    if(rec.dm==null||ctx.phase!=="live")return{cls:"good",txt:"Done"};
    var diff=due-rec.dm;
    if(diff>=0)return{cls:"good",txt:"On time ("+Math.round(diff)+"m early)"};
    return{cls:"warn",txt:Math.round(-diff)+"m late"};
  }
  if(ctx.phase==="before")return{cls:"good",txt:setupDayLabel(day)+" · Due "+fmt(due)};
  if(ctx.phase==="after")return{cls:"bad",txt:"Overdue · was "+fmt(due)};
  var left=due-ctx.now;
  if(left>60)return{cls:"good",txt:"Due "+fmt(due)};
  if(left>=0)return{cls:"warn",txt:Math.round(left)+"m left ("+fmt(due)+")"};
  return{cls:"bad",txt:"Overdue "+Math.round(-left)+"m"};
}
var curDay="fri",hideCompleted=true,curCat="all";
function curSetup(){
  var out=[],k=0;
  SETUP.forEach(function(sec){if(sec.day===curDay){sec._si=k++;out.push(sec);}});
  /* Leader-added extras for this day become one extra section at the end.
     They carry their own stable ids (prefix "x-"), so they are independent of
     the positional ids the built-in sections use. */
  var ex=(STATE.extras||[]).filter(function(x){return x.day===curDay;});
  if(ex.length){
    out.push({day:curDay,ord:99,cat:"both",team:"➕ Added by leadership",lead:"",_si:k++,_extra:true,
      items:ex.map(function(x){return [x.text,x.due,"x-"+x.id,x.cat];})});
  }
  out=out.filter(function(sec){return curCat==="all"||sec.cat===curCat||sec.cat==="both";});
  out.sort(function(a,b){return (a.ord!=null?a.ord:a._si)-(b.ord!=null?b.ord:b._si);});
  return out;
}
/* Leaders can add venue-specific items without a redeploy — eight very
   different sites across the season (fairgrounds, ski areas, a speedway). */
function addChecklistItem(){
  if(!LEADER){askPin(function(){addChecklistItem();});return;}
  var text=(prompt("New checklist item for "+(curDay==="fri"?"FRIDAY":"SATURDAY")+":")||"").trim();
  if(!text)return;
  var tm=(prompt("Due time (24h, e.g. 14:30). Leave blank for end of day:","")||"").trim();
  var due=1439,mm=tm.match(/^(\d{1,2}):?(\d{2})?$/);
  if(mm)due=Math.max(0,Math.min(1439,(+mm[1])*60+(+(mm[2]||0))));
  var rec={id:uid(),day:curDay,cat:"both",text:text.slice(0,180),due:due,by:myTag()||"Leadership"};
  queueWrite("addChecklistItem",rec,function(){STATE.extras=(STATE.extras||[]).concat([rec]);},function(){refreshChecklists();});
  toast("➕ Item added for the whole team");
}
function removeChecklistItem(id){
  if(!LEADER){askPin(function(){removeChecklistItem(id);});return;}
  if(!confirm("Remove this added item for everyone?"))return;
  queueWrite("removeChecklistItem",{id:id},function(){
    STATE.extras=(STATE.extras||[]).filter(function(x){return x.id!==id;});
    delete STATE.checklist["x-"+id];
  },function(){refreshChecklists();});
}
function setCat(c){curCat=c;var btns=document.querySelectorAll("#catTabs button");for(var i=0;i<btns.length;i++)btns[i].classList.toggle("on",btns[i].getAttribute("data-cat")===c);refreshChecklists();}
function setDay(d){curDay=d;document.getElementById("dtFri").classList.toggle("on",d==="fri");document.getElementById("dtSat").classList.toggle("on",d==="sat");var fp=document.getElementById("friPlan");if(fp)fp.style.display=d==="fri"?"block":"none";renderDayBanner();refreshChecklists();}
function renderDayBanner(){
  var db=document.getElementById("dayBanner");if(!db)return;
  db.className="daybanner "+curDay;
  var rain=eventShift()>0?' <small>· ☔ running on the rain date</small>':'';
  db.innerHTML=(curDay==="fri"
    ?'🔨 Viewing <b>FRIDAY — Build Day</b> <small>· optional crew · 12:00 PM arrival</small>'
    :'🎤 Viewing <b>SATURDAY — Event Day</b> <small>· all hands · setup 8 AM · doors 1 PM</small>')+rain;
}
renderDayBanner();
function toggleHideCompleted(){hideCompleted=!hideCompleted;document.getElementById("toggleHide").textContent=hideCompleted?"Show completed":"Hide completed";refreshChecklists();}
function hms(mins){var s=Math.max(0,Math.round(mins*60));var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;if(h>0)return h+"h "+String(m).padStart(2,"0")+"m";if(m>0)return m+"m "+String(ss).padStart(2,"0")+"s";return ss+"s";}
function updateDueChips(){
  var chips=document.querySelectorAll("#setupMount .duechip[data-live]");
  for(var i=0;i<chips.length;i++){
    var day=chips[i].getAttribute("data-setup-day")||curDay;
    var ctx=setupTimingContext(day);
    var due=parseFloat(chips[i].getAttribute("data-due"));
    var cls,txt;
    if(ctx.phase==="before"){cls="good";txt=setupDayLabel(day)+" · Due "+fmt(due);}
    else if(ctx.phase==="after"){cls="bad";txt="⏱ overdue · was "+fmt(due);}
    else{
      var left=due-ctx.now;
      if(left<0){cls="bad";txt="⏱ overdue "+hms(-left);}
      else if(left<=60){cls="warn";txt="⏳ due in "+hms(left);}
      else{cls="good";txt="due in "+hms(left);}
    }
    chips[i].className="duechip "+cls;
    chips[i].textContent=txt;
  }
}
var DEPT_LABEL={tech:"🔧 Tech/Worship",log:"📦 Log·GS·Amb",both:"🤝 All hands"};
var DEPT_CLS={tech:"dtech",log:"dlog",both:"dboth"};
function renderChecklist(mountId,data,key,overallId,overallBarId,overdueId){
  var html="",done=0,total=0,overdue=0,hidden=0;
  var ctx=setupTimingContext(curDay);
  data.forEach(function(sec,si){
    var dept='<span class="deptchip '+(DEPT_CLS[sec.cat]||"dlog")+'">'+(DEPT_LABEL[sec.cat]||sec.cat)+'</span>';
    var secDone=0,secTotal=sec.items.length;
    var rows=sec.items.map(function(it,ii){
      var label=it[0],due=it[1];
      /* Built-in items key off their array position; leader-added ones carry a
         stable "x-<id>" of their own so they don't depend on position at all. */
      var raw=(it.length>2&&it[2]!=null)?it[2]:ii;
      var isExtra=(typeof raw==="string"&&raw.slice(0,2)==="x-");
      var id=isExtra?raw:(key+"-"+curDay+"-"+(sec._si!=null?sec._si:si)+"-"+raw);
      total++;
      var rec=STATE.checklist[id];if(rec){done++;secDone++;}
      if(!rec&&ctx.phase==="live"&&(due-ctx.now)<0)overdue++;
      var stamp=rec?("✓ "+esc(rec.by)+(rec.t?(" · "+esc(rec.t)):"")):"";
      var hide=rec&&hideCompleted;if(hide)hidden++;
      var chip;
      if(rec){var st=itemStatus(due,rec,curDay);chip='<span class="duechip '+st.cls+'">'+st.txt+'</span>';}
      else{chip='<span class="duechip good" data-live="1" data-due="'+due+'" data-setup-day="'+curDay+'">due in —</span>';}
      var note=(STATE.notes&&STATE.notes[id])||"";
      var noteBtn=LEADER?'<button class="chknotebtn" onclick="event.stopPropagation();chkNote(\''+esc(id)+'\')" title="'+(note?"Edit note":"Add note")+'">📝</button>':'';
      if(LEADER&&isExtra)noteBtn+='<button class="chknotebtn" onclick="event.stopPropagation();removeChecklistItem(\''+esc(raw.slice(2))+'\')" title="Remove this added item">🗑</button>';
      var noteHtml=note?'<div class="chknote" onclick="event.stopPropagation()">📝 '+esc(note)+'</div>':'';
      /* Non-leaders get a read-only row (and a plain explanation on tap)
         instead of a checkbox that silently throws up a PIN modal. */
      return '<div class="chk dept-'+(sec.cat||"log")+(rec?" done":"")+(hide?" hidden":"")+(LEADER?"":" ro")+'" data-id="'+id+'" role="button" tabindex="0" aria-pressed="'+(rec?"true":"false")+'" aria-label="'+esc(label)+'"><span class="box"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 6"/></svg></span><span class="lab"><span class="txt">'+esc(label)+'</span><span class="sub2">'+dept+chip+'<span class="stamp">'+stamp+'</span>'+noteBtn+'</span>'+noteHtml+'</span></div>';
    }).join("");
    var secHidden=hideCompleted&&secDone===secTotal;
    var secPct=secTotal?Math.round(secDone/secTotal*100):0;
    html+='<div class="clsec sec-'+(sec.cat||"log")+'"'+(secHidden?' style="display:none"':'')+'><div class="head'+(secDone===secTotal&&secTotal?' complete':'')+'"><div class="hrow"><span class="daytag '+curDay+'">'+(curDay==="fri"?"FRI":"SAT")+'</span><h3>'+sec.team+'</h3><span class="cnt">'+(secDone===secTotal&&secTotal?'✓ ':'')+secDone+'/'+secTotal+'</span></div><div class="minibar"><i style="width:'+secPct+'%"></i></div></div>'+rows+'</div>';
  });
  document.getElementById(mountId).innerHTML=html;
  document.getElementById(overallId).textContent=done+" / "+total;
  document.getElementById(overallBarId).style.width=(total?(done/total*100):0)+"%";
  var od=document.getElementById(overdueId);
  if(overdue>0){od.classList.add("show");od.textContent="⏰ "+overdue+" item"+(overdue>1?"s":"")+" overdue — needs attention";}else{od.classList.remove("show");}
  document.getElementById("doneCount").textContent=done+" completed"+(hidden?" ("+hidden+" hidden)":"");
  updateDueChips();
  return{done:done,total:total,overdue:overdue};
}
var setupStats={done:0,total:0,overdue:0};
function refreshChecklists(){
  setupStats=renderChecklist("setupMount",curSetup(),"su","setupOverall","setupOverallBar","overdue-su");
  renderLockbars();
}
function renderLockbars(){
  var ab=document.getElementById("addChkBtn");if(ab)ab.style.display=LEADER?"inline-block":"none";
  ["su"].forEach(function(k){
    var el=document.getElementById("lock-"+k),nb=document.getElementById("namebar-"+k);
    if(LEADER){el.innerHTML="";if(nb)nb.style.display="flex";}
    else{el.innerHTML='<div class="lockbar">🔒 Checklist is locked — leaders only.<button onclick="askPin(function(){})">Unlock</button></div>';if(nb)nb.style.display="none";}
  });
}
function toggleCheck(id){
  if(!LEADER){toast("🔒 Only leaders check items off — ask your team lead. (Leaders: use Unlock at the top.)");return;}
  var init=myTag();
  var already=!!STATE.checklist[id];
  if(!already&&!init){askName(function(){toggleCheck(id);});return;}
  var tctx=setupTimingContext(curDay);
  var dm=tctx.phase==="live"?Math.round(tctx.now):null;
  var on=!already,t=nowLabel();
  vibr(10);queueWrite("setCheck",{id:id,on:on,by:init,t:t,dm:dm},function(){if(on)STATE.checklist[id]={by:init,t:t,dm:dm};else delete STATE.checklist[id];},function(){refreshChecklists();renderDashboard();});
}
/* Leader note on a checklist item. prompt() sidesteps the constant re-render
   (an inline field would get wiped like comments used to); the note lives in
   STATE.notes so it survives every rebuild. */
function chkNote(id){
  if(!LEADER){askPin(function(){chkNote(id);});return;}
  var cur=(STATE.notes&&STATE.notes[id])||"";
  var t=prompt("Note for this item (leave blank to remove):",cur);
  if(t===null)return;
  t=t.trim().slice(0,500);
  queueWrite("setChecklistNote",{id:id,text:t},function(){STATE.notes=STATE.notes||{};if(t)STATE.notes[id]=t;else delete STATE.notes[id];},function(){refreshChecklists();});
  toast(t?"📝 Note saved":"📝 Note removed");
}
function renderAnnouncements(){
  var f=document.getElementById("annFeed");
  var checkedIn=hasCheckedIn(MY.name); // day-gate unlock already checked them in
  var pin=checkedIn?"":'<div class="item heads" onclick="show(\'checkin\')" style="cursor:pointer"><div class="top"><span class="pri">Check-in</span><span class="meta">Pinned</span></div><h4>👋 Did you check in?</h4><p>Tap here to check yourself in for today\'s event — please do this before you serve.</p><div class="by">— Kingdom to the Counties</div></div>';
  f.innerHTML=pin+STATE.announcements.map(function(a){var acls=({urgent:"urgent",heads:"heads",info:"info"}[a.pri]||"info");return '<div class="item '+acls+'"><div class="top"><span class="pri">'+({urgent:"Urgent",heads:"Heads-up",info:"Info"}[a.pri]||"Info")+'</span><span class="meta">'+esc(a.t)+'</span></div><h4>'+esc(a.title)+'</h4><p>'+esc(a.body)+'</p><div class="by">— '+esc(a.by)+'</div>'+cmtBlock("ann",a)+'</div>';}).join("");
  var bar=document.getElementById("annBar");
  /* Dismissal is per-announcement. It used to be a single flag for the whole
     session, so a volunteer who closed "Lunch is ready" at noon would never
     see the bar again — including an URGENT safety message at 3 PM. This is
     the app's only push channel; it must not have a permanent off switch.
     Urgent announcements re-open the bar even if that exact one was
     dismissed once. */
  if(checkedIn){
    var a=STATE.announcements[0];
    if(a){
      annBarMode="ann";
      var urgent=a.pri==="urgent";
      document.getElementById("annBarText").innerHTML=(urgent?"🚨 <b>URGENT — ":"📣 <b>")+esc(a.title)+"</b>";
      bar.classList.toggle("urgentbar",urgent);
      if(urgent&&annBarLastUrgent!==a.id){annBarLastUrgent=a.id;annBarDismissedId="";vibr([60,40,60]);}
      if(annBarDismissedId===a.id){bar.classList.remove("show");return;}
      bar.classList.add("show");return;
    }
    bar.classList.remove("show");return;
  }
  annBarMode="checkin";
  document.getElementById("annBarText").innerHTML="👋 Did you check in? <b>Tap here to check in!</b>";
  bar.classList.toggle("urgentbar",false);
  if(annBarDismissedId==="checkin")bar.classList.remove("show");else bar.classList.add("show");
}
function renderAnnGate(){
  var lock=document.getElementById("annLock"),form=document.getElementById("annForm");
  if(!lock||!form)return;
  if(LEADER){lock.innerHTML="";form.style.display="";}
  else{lock.innerHTML='<div class="lockbar">🔒 Posting announcements is leaders only.<button onclick="askPin(function(){})">Unlock</button></div>';form.style.display="none";}
}
function renderSimGate(){
  var lock=document.getElementById("simLock"),body=document.getElementById("simBody");
  if(!lock||!body)return;
  if(LEADER){lock.innerHTML="";body.style.display="";}
  else{lock.innerHTML='<div class="lockbar">🔒 Leaders only — scrub the day timeline to test it.<button onclick="askPin(function(){})">Unlock</button></div>';body.style.display="none";}
}
function visCount(arr){var n=0;for(var i=0;i<arr.length;i++)if(!arr[i].hidden)n++;return n;}
function ackBtn(kind,x){return LEADER?'<button class="ackbtn'+(x.hidden?' un':'')+'" onclick="ackCard(\''+esc(kind)+'\',\''+esc(x.id)+'\')">'+(x.hidden?'↩ Unhide':'✓ Acknowledge &amp; hide')+'</button>':'';}
function ackMeta(x){return (x.hidden&&x.ackBy)?'<div class="ackmeta">✓ Acknowledged by '+esc(x.ackBy)+(x.ackT?(' · '+esc(x.ackT)):'')+'</div>':'';}
function praiseCard(p){return '<div class="item praise'+(p.hidden?' acked':'')+'"><div class="top"><span class="pri">Praise 🎉</span><span class="meta">'+esc(p.t)+'</span></div><p>'+esc(p.body)+'</p><div class="by">— '+esc(p.name)+'</div>'+ackMeta(p)+cmtBlock("praise",p)+ackBtn("praise",p)+'</div>';}
function renderPraise(){
  var f=document.getElementById("praiseFeed");
  var open=STATE.praises.filter(function(p){return !p.hidden;}),acked=STATE.praises.filter(function(p){return p.hidden;});
  var html=open.length?open.map(praiseCard).join(""):'<div class="empty">Be the first to celebrate something! 🎉</div>';
  if(acked.length)html+='<details class="ackedwrap"><summary>✓ Acknowledged ('+acked.length+')</summary>'+acked.map(praiseCard).join("")+'</details>';
  f.innerHTML=html;
}
function issueCard(x){var pcls=({low:"low",med:"med",urgent:"urgent"}[x.priority]||"med");return '<div class="item '+pcls+(x.hidden?' acked':'')+'"><div class="top"><span class="pri">'+({low:"Low",med:"Attention",urgent:"Urgent"}[x.priority]||"Note")+'</span><span class="meta">'+esc(x.t)+'</span></div><h4>'+esc(x.title)+'</h4><p>'+esc(x.body)+'</p><div class="by">— '+esc(x.by)+'</div>'+ackMeta(x)+cmtBlock("feedback",x)+ackBtn("feedback",x)+'</div>';}
function renderIssues(){
  var lb=document.getElementById("issueLeaderBar");
  if(lb)lb.innerHTML=LEADER
    ?'<div class="lockbar" style="background:#eef3ea">🔓 Leader mode — you can acknowledge &amp; resolve issues below.</div>'
    :'<div class="lockbar">🔒 Leader? Unlock with your PIN to acknowledge &amp; resolve issues.<button onclick="askPin(function(){renderDynamic();})">Unlock</button></div>';
  var f=document.getElementById("issueFeed");
  var open=STATE.feedback.filter(function(x){return !x.hidden;}),acked=STATE.feedback.filter(function(x){return x.hidden;});
  var html=open.length?open.map(issueCard).join(""):'<div class="empty">No open issues. Smooth sailing. ⛵</div>';
  if(acked.length)html+='<details class="ackedwrap"><summary>✓ Acknowledged ('+acked.length+')</summary>'+acked.map(issueCard).join("")+'</details>';
  f.innerHTML=html;
}
/* ---- Miracle Tracker (v1.12.0) ----
   Season-long shared record of salvations, rededications & healings. Anybody
   can report one (with an OPTIONAL name); it only joins the tracker once two
   distinct witnesses confirm it — the biblical standard (Deut 19:15,
   2 Cor 13:1). The client mirrors the server's counting rule for instant
   feedback, but the server is authoritative: the reporter, a duplicate name,
   or the reporting phone never counts as a witness. */
var MIR_TYPES=[["salvation","✝️","Salvation","Salvations"],["rededication","🔁","Rededication","Rededications"],["healing","🙌","Healing","Healings"],["other","✨","Other miracle","Other miracles"]];
function mirTypeInfo(t){for(var i=0;i<MIR_TYPES.length;i++)if(MIR_TYPES[i][0]===t)return MIR_TYPES[i];return MIR_TYPES[3];}
function mirWitnessCount(m){
  var reporter=((m&&m.by)||"").trim().toLowerCase(),seen={},n=0;
  ((m&&m.witnesses)||[]).forEach(function(w){
    var nm=((w&&w.name)||"").trim().toLowerCase();
    if(!nm||nm===reporter)return;
    if(w.dev&&m.dev&&w.dev===m.dev)return;
    if(!seen[nm]){seen[nm]=1;n++;}
  });
  return n;
}
function mirConfirmed(m){return mirWitnessCount(m)>=(STATE.witnessMin||2);}
function mirCountyLabel(m){
  if(!m.county)return "";
  var c=(typeof countyByKey==="function")?countyByKey(m.county):null;
  return (c&&c.county)||m.county;
}
function miracleCard(m){
  var ti=mirTypeInfo(m.type),n=mirWitnessCount(m),min=STATE.witnessMin||2,conf=n>=min;
  var me=(myTag()||"").toLowerCase();
  var ws=Array.isArray(m.witnesses)?m.witnesses:[];
  var wl=ws.length?'<div class="witwrap">'+ws.map(function(w){return '<div class="witrow">🤝 <b>'+esc(w.name)+'</b>'+(w.note?' · '+esc(w.note):'')+'<span class="wt">'+esc(w.t||"")+'</span></div>';}).join("")+'</div>':'';
  var isReporter=me&&me===((m.by||"").trim().toLowerCase());
  var already=me&&ws.some(function(w){return ((w.name||"").trim().toLowerCase())===me;});
  var btn=(isReporter||already)?'':'<button class="witbtn" onclick="miracleWitness(\''+esc(m.id)+'\')">🤝 I witnessed this too</button>';
  var status=conf
    ?'<div class="mirconfmeta">✅ Confirmed · '+n+' witnesses</div>'
    :'<div class="mirneed">⏳ '+n+' of '+min+' witnesses — needs '+(min-n)+' more to count in the tracker</div>';
  var meta=[m.t,mirCountyLabel(m)].filter(Boolean).join(" · ");
  return '<div class="item '+(conf?'miracle':'mirpend')+'"><div class="top"><span class="pri">'+ti[1]+' '+ti[2]+'</span><span class="meta">'+esc(meta)+'</span></div>'
    +(m.name?'<h4>'+esc(m.name)+'</h4>':'')
    +'<p>'+esc(m.note)+'</p><div class="by">— reported by '+esc(m.by)+'</div>'
    +status+wl+btn
    +(LEADER?'<button class="ackbtn" onclick="miracleDelete(\''+esc(m.id)+'\')">🗑 Remove (leader)</button>':'')
    +'</div>';
}
function renderMiracles(){
  var f=document.getElementById("mirFeed");if(!f)return;
  var list=STATE.miracles||[],min=STATE.witnessMin||2;
  var conf=[],pend=[],byType={};
  list.forEach(function(m){
    if(mirWitnessCount(m)>=min){conf.push(m);byType[m.type]=(byType[m.type]||0)+1;}
    else pend.push(m);
  });
  var e=document.getElementById("mirConf");if(e)e.textContent=conf.length;
  e=document.getElementById("mirPend");if(e)e.textContent=pend.length;
  e=document.getElementById("mirTypes");
  if(e)e.innerHTML=MIR_TYPES.map(function(ti){return '<div class="mirtype">'+ti[1]+' '+esc(ti[3])+'<small>confirmed</small><b>'+(byType[ti[0]]||0)+'</b></div>';}).join("");
  var html="";
  if(pend.length)html+='<div class="mirsect">⏳ Awaiting witnesses ('+pend.length+')</div>'+pend.map(miracleCard).join("");
  if(conf.length)html+='<div class="mirsect">✅ On the record ('+conf.length+')</div>'+conf.map(miracleCard).join("");
  f.innerHTML=html||'<div class="empty">Nothing reported yet this season. Seen God move? Report it above — then grab two witnesses. 🙌</div>';
  /* Leader dashboard row rides along (it may not be mounted — guard). */
  var dm=document.getElementById("dMir");
  if(dm)dm.textContent=conf.length+" confirmed"+(pend.length?(" · "+pend.length+" pending"):"");
  var db=document.getElementById("dMirBreak");
  if(db){
    var rows=MIR_TYPES.map(function(ti){var nn=byType[ti[0]]||0;return nn?'<div class="tallyrow"><span>'+ti[1]+' '+esc(ti[3])+'</span><b>'+nn+'</b></div>':'';}).join("");
    db.innerHTML=rows||'<p class="hint">Reports appear on the Miracle Tracker and count here once two witnesses confirm them.</p>';
  }
}
function miracleWitness(id){
  var m=(STATE.miracles||[]).filter(function(x){return x.id===id;})[0];if(!m)return;
  var me=myTag();
  if(!me){askName(function(){miracleWitness(id);});return;}
  if(me.toLowerCase()===((m.by||"").trim().toLowerCase())){toast("You reported this one — it needs two OTHER witnesses to be confirmed.");return;}
  if(m.dev&&m.dev===DEV){toast("This phone sent the report — each witness confirms from their own phone.");return;}
  if((m.witnesses||[]).some(function(w){return ((w.name||"").trim().toLowerCase())===me.toLowerCase();})){toast("You've already confirmed this one 🤝");return;}
  var w={id:id,wid:uid(),name:me,dev:DEV,t:nowLabel(),d:dateKey(new Date())};
  queueWrite("miracleWitness",w,function(){
    m.witnesses=Array.isArray(m.witnesses)?m.witnesses:[];
    m.witnesses.push({wid:w.wid,name:w.name,note:"",dev:w.dev,t:w.t,d:w.d});
  },function(){renderDynamic();});
  toast(mirConfirmed(m)?"✅ Confirmed — it's on the record!":"🤝 Witness added — "+Math.max(0,(STATE.witnessMin||2)-mirWitnessCount(m))+" more needed");
}
function miracleDelete(id){
  if(!LEADER){askPin(function(){miracleDelete(id);});return;}
  if(!confirm("Remove this miracle report for everyone?\n\nThis deletes the report and its witnesses and can't be undone."))return;
  queueWrite("miracleDelete",{id:id},function(){STATE.miracles=(STATE.miracles||[]).filter(function(x){return x.id!==id;});},function(){renderDynamic();});
}
function cmtBlock(kind,x){
  var cs=Array.isArray(x.comments)?x.comments:[];
  var html='<div class="cmts">'+cs.map(function(c){return '<div class="cmt"><b>'+esc(c.name)+'</b><span class="ct2">'+esc(c.t)+'</span><p>'+esc(c.text)+'</p></div>';}).join("");
  html+='<button class="cmtbtn" onclick="cmtOpen(this)">💬 Comment'+(cs.length?' ('+cs.length+')':'')+'</button>';
  html+='<div class="cmtform" data-kind="'+kind+'" data-id="'+esc(x.id)+'"><input class="cn" maxlength="40" placeholder="Your name" value="'+esc(MY.name||"")+'"/><textarea class="ct" rows="2" maxlength="500" placeholder="Write a comment…"></textarea><button onclick="cmtPost(this,\''+kind+'\',\''+x.id+'\')">Post</button></div></div>';
  return html;
}
function cmtOpen(btn){var f=btn.parentNode.querySelector(".cmtform");if(f)f.classList.toggle("show");}
function cmtPost(btn,kind,id){
  var f=btn.parentNode,name=f.querySelector(".cn").value.trim()||"Volunteer",text=f.querySelector(".ct").value.trim();
  if(!text){f.querySelector(".ct").focus();return;}
  rememberName(name);
  var c={cid:uid(),name:name,text:text,t:nowLabel()};
  // Clear + collapse BEFORE the optimistic re-render so the just-sent draft
  // isn't restored back into the box (see snapshot/restoreComments).
  var ct=f.querySelector(".ct");if(ct)ct.value="";f.classList.remove("show");
  queueWrite("addComment",{kind:kind,id:id,cid:c.cid,name:name,text:text,t:c.t},function(){
    var arr=kind==="praise"?STATE.praises:(kind==="ann"?STATE.announcements:STATE.feedback);
    var it=arr.filter(function(x){return x.id===id;})[0];
    if(it){it.comments=Array.isArray(it.comments)?it.comments:[];it.comments.push(c);}
  },function(){renderDynamic();});
  toast("💬 Comment added");
}
function ackCard(kind,id){
  if(!LEADER){askPin(function(){ackCard(kind,id);});return;}
  var by=myTag();
  if(!by){askName(function(){ackCard(kind,id);});return;}
  /* Explicit final state through the outbox (like checkmarks) — the old
     ackCard toggle was fire-and-forget, so a dropped request lost the ack
     (the card hid, then reappeared on the next poll) and two leaders acking
     the same card at once toggled it right back to visible. */
  var arr=kind==="praise"?STATE.praises:STATE.feedback,it=arr.filter(function(x){return x.id===id;})[0];
  if(!it)return;
  var hide=!it.hidden,t=nowLabel();
  queueWrite("setAck",{kind:kind,id:id,hidden:hide,by:by,t:t},function(){
    it.hidden=hide;it.ackBy=hide?by:"";it.ackT=hide?t:"";
  },function(){renderDynamic();});
}
function renderRoster(){
  var list=STATE.checkins;document.getElementById("ciTotal").textContent=list.length;
  var teams={};list.forEach(function(c){if(c.team)teams[c.team]=1;});document.getElementById("ciTeams").textContent=Object.keys(teams).length;
  var r=document.getElementById("ciRoster");
  r.innerHTML=list.length?list.slice().reverse().map(function(c){return '<div class="listrow"><span class="av">'+esc((c.name||"?").trim().charAt(0).toUpperCase())+'</span><span class="nm">'+esc(c.name)+'<small>'+esc(c.team||"Volunteer")+'</small></span><span class="tm">'+esc(c.t)+'</span></div>';}).join(""):'<div class="empty">No one checked in yet. Tap "Check me in" above. 🙋</div>';
}
function renderCount(){renderCountFast();renderDecFast();}
function defaultRadiosLocal(){var a=[];for(var i=1;i<=10;i++)a.push({n:i,out:null,in:null});return a;}
function renderRadios(){
  var mt=document.getElementById("radioMount");if(!mt)return;
  var list=(STATE.radios&&STATE.radios.length===10)?STATE.radios:defaultRadiosLocal();
  mt.innerHTML=list.map(function(r){
    var isOut=r.out&&!r.in;
    var st=isOut?('Out: <b>'+esc(r.out.by)+'</b> · '+esc(r.out.t)):(r.in?('Returned by <b>'+esc(r.in.by)+'</b> · '+esc(r.in.t)):'In the case');
    var btn=isOut?'<button class="ci" onclick="radioTap('+r.n+')">↩ Return</button>':'<button class="co" onclick="radioTap('+r.n+')">Check out</button>';
    return '<div class="radio-row'+(isOut?' out':'')+'"><span class="rn">📻 #'+r.n+'</span><span class="rs">'+st+'</span>'+btn+'</div>';
  }).join("");
  var out=list.filter(function(r){return r.out&&!r.in;}).length;
  var pill=document.getElementById("crewRadioPill");if(pill){pill.textContent=out;pill.style.display=out?"flex":"none";}
}
function radioTap(n){
  var init=myTag();
  if(!init){askName(function(){radioTap(n);});return;}
  vibr(12);
  /* Explicit final state (v1.10.0) — the old radioToggle flipped whatever was
     on the server, so a retried request or two people tapping at once flipped
     a radio back to the wrong state. */
  if(!(STATE.radios&&STATE.radios.length===10))STATE.radios=defaultRadiosLocal();
  var r=STATE.radios[n-1],stamp={by:init,t:nowLabel()};
  var next=(r.out&&!r.in)?{n:n,out:r.out,in:stamp}:{n:n,out:stamp,in:null};
  queueWrite("setRadio",next,function(){STATE.radios[n-1]={n:next.n,out:next.out,in:next.in};},function(){renderRadios();renderDashRadios();});
}
function radioLate(){var ctx=setupTimingContext("sat");return ctx.phase==="after"||(ctx.phase==="live"&&ctx.now>1050);}
function renderDashRadios(){
  var el=document.getElementById("dRadioList"),nv=document.getElementById("dRadios");if(!el)return;
  var out=(STATE.radios||[]).filter(function(r){return r.out&&!r.in;});
  if(nv)nv.textContent=out.length;
  var late=radioLate();
  el.innerHTML=out.length?out.map(function(r){return '<div class="tallyrow"><span>📻 Radio '+r.n+' — <b>'+esc(r.out.by)+'</b> since '+esc(r.out.t)+'</span>'+(late?'<b style="color:#B3261E">⚠️ still out</b>':'')+'</div>';}).join(""):'<p class="hint">All radios are in. 📻</p>';
}
function renderFunding(){var f=STATE.funding||{};var p=document.getElementById("fundPctLbl"),b=document.getElementById("fundBar"),n=document.getElementById("fundNeedLbl");if(p)p.textContent="~"+(f.pct!=null?f.pct:64)+"%";if(b)b.style.width=(f.pct!=null?f.pct:64)+"%";if(n&&f.needed)n.textContent=f.needed;
  var fp=document.getElementById("fundPctEdit"),fn=document.getElementById("fundNeedEdit");
  if(fp&&document.activeElement!==fp)fp.value=(f.pct!=null?f.pct:64);
  if(fn&&document.activeElement!==fn)fn.value=f.needed||"";}
/* ---- active county (v1.11.0) ----
   The leader picks the county once; the whole board (and Quick Capture) keys
   off it, and each county keeps its own data instead of the team resetting
   between events. */
function renderCountySelect(){
  var sel=document.getElementById("evCounty");if(!sel)return;
  if(!sel.options.length&&typeof COUNTIES!=="undefined"){
    sel.innerHTML='<option value="auto">🗓 Automatic — follow the schedule</option>'+COUNTIES.map(function(c){
      return '<option value="'+esc(c.key)+'">'+esc(c.county)+'</option>';}).join("");
  }
  if(document.activeElement!==sel)sel.value=STATE.countyAuto?"auto":(STATE.county||"auto");
}
/* The Day PIN is the event's Saturday as MMDD and rolls to the next event on
   the Monday after. Leaders see the live value (so they can read it out) and
   exactly when it changes; volunteers never receive it. */
function fmtDay(iso){
  if(!iso)return "";
  var d=new Date(iso+"T12:00:00");
  if(isNaN(d.getTime()))return iso;
  return d.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
}
function renderPinPanel(){
  var now=document.getElementById("pinNow"),roll=document.getElementById("pinRoll"),autoBtn=document.getElementById("dayPinAuto");
  if(!now)return;
  if(!LEADER||!STATE.dayPin){
    now.textContent=STATE.dayPinSet?"•  •  •  •":"No PIN — app is unlocked";
    if(roll)roll.textContent=LEADER?"":"";
    if(autoBtn)autoBtn.style.display="none";
    return;
  }
  now.innerHTML='Today\'s Day PIN <b>'+esc(STATE.dayPin)+'</b>';
  if(roll){
    if(STATE.dayPinManual){
      roll.innerHTML="⚠️ Set by hand — it will <b>not</b> change automatically."
        +(STATE.dayPinAuto?(" The scheduled PIN for right now would be <b>"+esc(STATE.dayPinAuto)+"</b>."):"");
    }else if(STATE.pinRollsOver&&STATE.nextPin){
      roll.innerHTML="Automatic — it\'s this event\'s Saturday ("+esc(fmtDay(STATE.eventDate))+"). Stays the same through Sunday\'s rain date, then becomes <b>"+esc(STATE.nextPin)+"</b> on "+esc(fmtDay(STATE.pinRollsOver))+".";
    }else{
      roll.textContent="Automatic — it\'s this event\'s Saturday. Last event of the season, so it won\'t change again.";
    }
  }
  if(autoBtn)autoBtn.style.display=STATE.dayPinManual?"block":"none";
}
function setCounty(key){
  if(!LEADER){askPin(function(){setCounty(key);});return;}
  if(key==="auto"){
    apiPost("setCounty",{auto:true}).then(function(){lastEtag="";return refreshFromServer();})
      .then(function(){renderCountySelect();renderDynamic();toast("🗓 Following the schedule again");})
      .catch(function(e){if(e!==403)toast("Couldn't switch — check your signal");renderCountySelect();});
    return;
  }
  var cur=STATE.county||"";
  if(key===cur&&!STATE.countyAuto)return;
  var c=(typeof countyByKey==="function")?countyByKey(key):null;
  if(key&&!confirm("Switch the board to "+((c&&c.county)||key)+"?\n\nEveryone's app will show that county's checklists, check-ins, counts, radios, issues and announcements. Nothing is deleted — this county's work stays saved and you can switch back any time."))
    {renderCountySelect();return;}
  /* Not queued through the outbox: this changes which dataset every later
     write lands in, so it must be confirmed by the server before anything
     else is sent. */
  apiPost("setCounty",{county:key}).then(function(){
    STATE.county=key;
    if(c){
      /* Keep the event label in step with the county the leader picked. */
      var name=c.county,date=c.dateLong||"";
      queueWrite("setEvent",{name:name,date:date,shift:0},function(){STATE.event={name:name,date:date,shift:0};},function(){});
    }
    lastEtag="";
    return refreshFromServer();
  }).then(function(){
    renderCountySelect();renderDynamic();
    toast(key?("📍 Board switched to "+((c&&c.county)||key)):"📍 County cleared");
  }).catch(function(e){
    if(e!==403)toast("Couldn't switch counties — check your signal and try again");
    renderCountySelect();
  });
}
function renderEvent(){
  var ev=STATE.event||{},tag=document.getElementById("eventTag");
  renderCountySelect();renderPinPanel();
  var shifted=eventShift()>0;
  if(ev.name||ev.date){tag.style.display="block";tag.textContent="📍 "+[ev.name,ev.date].filter(Boolean).join(" · ")+(shifted?" · ☔ RAIN DATE (+"+eventShift()+"d)":"");}
  else{tag.style.display="none";}
  var cb=document.getElementById("evShift");if(cb&&document.activeElement!==cb)cb.checked=shifted;
  var warn=document.getElementById("evDateWarn");if(warn)warn.style.display=parseEventSaturday()?"none":"block";
  var rb=document.getElementById("rainBanner");
  if(rb)rb.style.display=shifted?"block":"none";
}
/* ---- season roll-up (v1.10.0) ----
   Reset used to be the end of the story: each event's numbers were wiped and
   nothing accumulated, so by October nobody could say what the season did.
   The server now writes a small summary per event at reset; this reads them. */
function seasonLoad(){
  var el=document.getElementById("dSeason");if(!el)return;
  el.innerHTML='<p class="hint">Loading…</p>';
  apiPost("seasonList",{}).then(function(d){
    var evs=(d&&Array.isArray(d.events))?d.events:[];
    if(!evs.length){el.innerHTML='<p class="hint">No completed events yet. Each event is summarised here automatically when a leader resets at the end of the day.</p>';return;}
    var tA=0,tD=0,tV=0,tC=0;
    var rows=evs.slice().reverse().map(function(e){
      tA+=e.attendance||0;tD+=e.decisions||0;tV+=e.volunteers||0;tC+=e.captures||0;
      var nm=(e.event&&(e.event.name||e.event.date))||"Event";
      return '<div class="tallyrow"><span>'+esc(nm)+'<small style="display:block;color:var(--muted)">'+(e.attendance||0)+' attendees · '+(e.volunteers||0)+' volunteers · '+(e.captures||0)+' captures</small></span><b>'+(e.decisions||0)+' ✝️</b></div>';
    }).join("");
    el.innerHTML=rows+'<div class="tallyrow" style="border-top:2px solid var(--line);margin-top:6px;padding-top:6px"><span><b>Season total</b><small style="display:block;color:var(--muted)">'+tA+' attendees · '+tV+' volunteer check-ins · '+tC+' captures</small></span><b>'+tD+' ✝️</b></div>';
  }).catch(function(){el.innerHTML='<p class="hint">Couldn\'t load the season summary — check your connection.</p>';});
}
function renderDashboard(){
  document.getElementById("dVols").textContent=STATE.checkins.length;
  document.getElementById("dHeads").textContent=STATE.count;
  document.getElementById("dIssues").textContent=visCount(STATE.feedback);
  document.getElementById("dPraise").textContent=visCount(STATE.praises);
  var sp=setupStats.total?Math.round(setupStats.done/setupStats.total*100):0;
  document.getElementById("dSetup").textContent=setupStats.done+" / "+setupStats.total+" · "+sp+"%";
  document.getElementById("dSetupBar").style.width=sp+"%";
  var ioc=ioCounts(ioCurrent()),ip=ioc.total?Math.round(ioc.done/ioc.total*100):0;
  document.getElementById("dIo").textContent=ioc.done+" / "+ioc.total+" · "+ip+"%";
  document.getElementById("dIoBar").style.width=ip+"%";
  document.getElementById("dOver").textContent=setupStats.overdue;
  var ev=STATE.event||{},en=document.getElementById("evName"),ed=document.getElementById("evDate");
  if(document.activeElement!==en)en.value=ev.name||"";
  if(document.activeElement!==ed)ed.value=ev.date||"";
  renderCapStorage();
  renderTallyBreak();renderDashRadios();
}
/* v1.7.1 — Quick Capture storage meter. The backend reports exactly how many
   bytes capture media is using (captureBytes) against the configured budget
   (captureBudget, default 1 GB — CAPTURE_BUDGET_MB env var on Netlify).
   Warn at 80%, go mission-critical at 95%. */
function fmtMB(bytes){var mb=bytes/1048576;return mb>=100?Math.round(mb)+" MB":mb>=10?mb.toFixed(1)+" MB":mb>=1?mb.toFixed(2)+" MB":(bytes/1024).toFixed(0)+" KB";}
function renderCapStorage(){
  var el=document.getElementById("dCapStore");if(!el)return;
  var used=STATE.captureBytes||0,bud=STATE.captureBudget||0;
  var bar=document.getElementById("dCapStoreBar"),warn=document.getElementById("dCapStoreWarn");
  if(!bud){el.textContent=LIVE?"—":"Demo mode";bar.style.width="0%";warn.className="overdue";return;}
  var pct=Math.min(100,Math.round(used/bud*100));
  el.textContent=fmtMB(used)+" / "+fmtMB(bud)+" · "+pct+"%";
  bar.style.width=Math.max(pct,used>0?2:0)+"%";
  warn.removeAttribute("style");warn.style.margin="10px 0 0";
  if(pct>=95){warn.className="overdue show";warn.innerHTML="🚨 <b>Quick Capture storage is at "+pct+"% — mission critical.</b> New card photos &amp; voice notes are about to stop saving (typed info still will). Enter everything into Planning Center Online NOW, then purge below.";}
  else if(pct>=80){warn.className="overdue show";warn.style.background="#f4e6dc";warn.style.color="var(--warn)";warn.innerHTML="⚠️ <b>Quick Capture storage is at "+pct+"%.</b> Getting close to capacity — plan to enter captures into Planning Center Online and purge soon.";}
  else warn.className="overdue";
}
/* A comment form's open/draft state lives only in the DOM, so any wholesale
   innerHTML rebuild (a background sync, a head-count tick, someone else's edit)
   used to wipe a half-typed comment out from under the user. snapshotComments()
   captures every open-or-in-progress comment form keyed by its card, and
   restoreComments() puts the open state, name, draft text, focus and caret back
   after the rebuild — so live updates flow underneath without disturbing what
   the user is typing. */
function snapshotComments(){
  var out=[],ae=document.activeElement,forms=document.querySelectorAll(".cmtform");
  for(var i=0;i<forms.length;i++){
    var f=forms[i],cn=f.querySelector(".cn"),ct=f.querySelector(".ct");
    var open=f.classList.contains("show"),text=ct?ct.value:"",name=cn?cn.value:"";
    var hasFocus=!!(ae&&f.contains(ae));
    if(!open&&!text&&!hasFocus)continue;
    var focused=ae===cn?"cn":(ae===ct?"ct":null),selS=0,selE=0;
    try{if(focused==="cn"){selS=cn.selectionStart;selE=cn.selectionEnd;}else if(focused==="ct"){selS=ct.selectionStart;selE=ct.selectionEnd;}}catch(_){}
    out.push({key:(f.getAttribute("data-kind")||"")+"|"+(f.getAttribute("data-id")||""),open:open,name:name,text:text,focused:focused,selS:selS,selE:selE});
  }
  return out;
}
function restoreComments(snaps){
  if(!snaps||!snaps.length)return;
  var map={};for(var i=0;i<snaps.length;i++)map[snaps[i].key]=snaps[i];
  var forms=document.querySelectorAll(".cmtform");
  for(var j=0;j<forms.length;j++){
    var f=forms[j],s=map[(f.getAttribute("data-kind")||"")+"|"+(f.getAttribute("data-id")||"")];
    if(!s)continue;
    if(s.open)f.classList.add("show");
    var cn=f.querySelector(".cn"),ct=f.querySelector(".ct");
    if(cn&&s.name)cn.value=s.name;
    if(ct)ct.value=s.text;
    if(s.focused==="cn"&&cn){cn.focus();try{cn.setSelectionRange(s.selS,s.selE);}catch(_){}}
    else if(s.focused==="ct"&&ct){ct.focus();try{ct.setSelectionRange(s.selS,s.selE);}catch(_){}}
  }
}
function renderDynamic(){var _cs=snapshotComments();refreshChecklists();renderAnnouncements();renderAnnGate();renderSimGate();renderPraise();renderMiracles();renderIssues();renderRoster();renderCount();renderRadios();renderEvent();renderFunding();renderDashboard();updateBadges();if(!ioEditing)renderIOList();restoreComments(_cs);if(typeof chMaybeSync==="function")chMaybeSync();}
function updateBadges(){
  function set(id,n){var e=document.getElementById(id);if(!e)return;e.textContent=n;e.style.display=n?"flex":"none";}
  set("crewCheckinPill",STATE.checkins.length);set("crewCountPill",STATE.count);
  set("capPill",(STATE.captureCount||0)+(typeof capQueue==="function"?capQueue().length:0));
  set("boardAnnPill",STATE.announcements.length);set("boardPraisePill",visCount(STATE.praises));set("boardIssuePill",visCount(STATE.feedback));
  set("boardMirPill",(STATE.miracles||[]).filter(mirConfirmed).length);
  var u=Math.max(0,(STATE.announcements.length-seenAnn)+(visCount(STATE.feedback)-seenIssue));
  var b=document.getElementById("boardBadge");b.textContent=u;b.style.display=u?"flex":"none";
}
function updateSync(){var els=document.querySelectorAll(".syncpill");var label;
  var pend=OUTBOX.length,pendLbl=pend+" change"+(pend>1?"s":"");
  /* Don't claim we're "sending" when every queued write is actually waiting on
     a leader unlock — say so, since the fix is one tap. */
  if(pend&&obNextIdx()<0){
    for(var j=0;j<els.length;j++){els[j].classList.toggle("live",LIVE);els[j].innerHTML='<span class="d"></span>🔒 '+pendLbl+' waiting — unlock with your leader PIN to send';}
    return;
  }
  if(LIVE){var ago=lastSyncAt?Math.max(0,Math.round((Date.now()-lastSyncAt)/1000)):null;label=pend?("Live — sending "+pendLbl+"…"):("Live — synced"+(ago==null?" to everyone":(ago<3?" just now":" "+ago+"s ago")));}
  else if(everSynced){label=pend?("Offline — "+pendLbl+" saved on this phone, will send when back"):"Offline — reconnecting…";}
  else if(isLocalDev()){label="Demo mode — deploy to sync";}
  else if(cacheAge){label="📶 No signal — showing what we last saw"+(cacheAge?" ("+agoLabel(cacheAge)+")":"");}
  else{label="📶 No signal — can't load the board yet, retrying…";}
  for(var i=0;i<els.length;i++){els[i].classList.toggle("live",LIVE);els[i].innerHTML='<span class="d"></span>'+label;}}
setInterval(updateSync,1000);
var pinThen=null;
function askPin(then){pinThen=then;document.getElementById("pinErr").textContent="";document.getElementById("pinInput").value="";document.getElementById("pinModal").classList.add("show");setTimeout(function(){document.getElementById("pinInput").focus();},50);}
function closePin(){document.getElementById("pinModal").classList.remove("show");}
function tryPin(){
  var v=document.getElementById("pinInput").value.trim();if(!v)return;
  document.getElementById("pinErr").textContent="Checking…";
  verifyPin("verifyLeaderPin",v).then(function(res){
    if(res&&res.rateLimited){document.getElementById("pinErr").textContent="Too many wrong tries — wait 10 minutes, then try again.";return;}
    if(res&&res.ok){
      /* Store the server-issued session token, never the PIN itself — an XSS
         then steals something revocable and short-lived. */
      LEADER=true;LEADERPIN=res.token||v;
      try{sessionStorage.setItem("k2c_lpin",LEADERPIN);}catch(_){}
      document.getElementById("pinErr").textContent="";closePin();renderDynamic();applyLeaderUI();lastEtag="";refreshFromServer();obFlush();if(pinThen)pinThen();
    }
    else{document.getElementById("pinErr").textContent="Wrong PIN — try again.";}
  }).catch(function(){document.getElementById("pinErr").textContent="No connection — try again.";});
}
function applyLeaderUI(){var locked=document.getElementById("dashLocked"),body=document.getElementById("dashBody");if(LEADER){locked.style.display="none";body.style.display="block";}else{locked.style.display="block";body.style.display="none";}}
document.getElementById("pinCancel").addEventListener("click",closePin);
document.getElementById("pinOk").addEventListener("click",tryPin);
document.getElementById("pinInput").addEventListener("keydown",function(e){if(e.key==="Enter")tryPin();});
/* ===== Day PIN — locks the whole app for all volunteers ===== */
/* The Day PIN itself is kept (not just a boolean) because the API now verifies
   it server-side on every request — the old k2c_dayok flag only ever unlocked
   the UI. Sessions that predate this re-enter the PIN once. */
function dayPinStored(){try{return sessionStorage.getItem("k2c_daypin")||"";}catch(_){return "";}}
function dayOK(){return !!dayPinStored()||!!LEADERPIN;}
function setDayOK(pin){try{if(pin)sessionStorage.setItem("k2c_daypin",pin);sessionStorage.setItem("k2c_dayok","1");}catch(_){}}
function dayUnlocked(){return !STATE.dayPinSet || LEADER || dayOK();}
function maybeDayGate(){
  var g=document.getElementById("dayGate");if(!g)return;
  if(LIVE&&STATE.dayPinSet&&!dayUnlocked()){
    g.classList.add("show");
    var nm=document.getElementById("dayNameInput");if(nm&&!nm.value)nm.value=MY.name||"";
    setTimeout(function(){var focusId=(nm&&!nm.value)?"dayNameInput":"dayPinInput";var i=document.getElementById(focusId);if(i)i.focus();},60);
  }else{g.classList.remove("show");}
}
function tryDayPin(){
  var v=document.getElementById("dayPinInput").value.trim();if(!v)return;
  document.getElementById("dayPinErr").textContent="Checking…";
  verifyPin("verifyDayPin",v).then(function(res){
    if(res&&res.rateLimited){document.getElementById("dayPinErr").textContent="Too many wrong tries from this connection — wait 10 minutes and try again.";return;}
    if(!res){document.getElementById("dayPinErr").textContent="Wrong Day PIN — ask your team leader.";return;}
    document.getElementById("dayPinErr").textContent="";
    var nmEl=document.getElementById("dayNameInput"),teamEl=document.getElementById("dayTeamSel");
    var nm=(nmEl&&nmEl.value.trim())||"";
    if(nm){rememberName(nm);prefillNames();dayGateCheckin(nm,teamEl?teamEl.value:"");}
    setDayOK(v);
    if(res.leader){LEADER=true;LEADERPIN=res.token||v;try{sessionStorage.setItem("k2c_lpin",LEADERPIN);}catch(_){}applyLeaderUI();renderDynamic();}
    maybeDayGate();
    lastEtag="";refreshFromServer();   // we were locked a moment ago — pull the real payload now
    obFlush();
  }).catch(function(){document.getElementById("dayPinErr").textContent="No connection — check your signal and try again.";});
}
/* v1.6.1 — unlocking the Day PIN gate IS the check-in: the name (+ team) from
   the gate goes straight onto the day's roster, once per name per day. */
function hasCheckedIn(name){
  name=(name||"").trim().toLowerCase();if(!name)return false;
  return (STATE.checkins||[]).some(function(c){return (c.name||"").trim().toLowerCase()===name;});
}
function dayGateCheckin(name,team){
  if(hasCheckedIn(name))return;
  var rec={id:uid(),name:name,team:team||"",attested:false,t:nowLabel()};
  queueWrite("addCheckin",rec,function(){STATE.checkins.push(rec);},function(){renderDynamic();});
  toast("✅ "+name+" checked in — welcome to the field!");
}
document.getElementById("dayPinOk").addEventListener("click",tryDayPin);
document.getElementById("dayPinInput").addEventListener("keydown",function(e){if(e.key==="Enter")tryDayPin();});
document.getElementById("dayPinAuto").addEventListener("click",function(){
  if(!LEADER){askPin(function(){});return;}
  apiPost("setDayPin",{auto:true}).then(function(){lastEtag="";return refreshFromServer();})
    .then(function(){toast("🗓 Day PIN follows the schedule again");})
    .catch(function(e){if(e!==403)toast("Couldn't switch — check your signal");});
});
document.getElementById("dayPinSave").addEventListener("click",function(){
  var v=document.getElementById("dayPinEdit").value.trim();
  if(!v&&!confirm("Remove the Day PIN lock entirely? Anyone with the link could open the app."))return;
  if(v&&!confirm("Pin the Day PIN to "+v+"?\n\nIt will stop following the event schedule until you switch it back to automatic."))return;
  setDayOK(v);
  doAction("setDayPin",{pin:v},function(){STATE.dayPinSet=!!v;STATE.dayPin=v;STATE.dayPinManual=true;});
  document.getElementById("dayPinEdit").value="";
  alert(v?("Day PIN set to "+v+" ✔ (no longer automatic)"):"Day PIN lock removed.");
});
function pre(id,val){var e=document.getElementById(id);if(e&&!e.value&&val)e.value=val;}
function prefillNames(){pre("ciName",MY.name);pre("aName",MY.name);pre("pName",MY.name);pre("fName",MY.name);pre("mirMyName",MY.name);}
/* Remember the volunteer's name across reloads so they don't have to retype it
   everywhere (requested by the team). Ignores the placeholder defaults so an
   anonymous post doesn't overwrite a real saved name. v1.5.2 — the full NAME
   is the identity everywhere: stamps, tallies, radios and checkmarks show
   "Zach", never a derived "ZA". */
function rememberName(n){
  n=(n||"").trim();if(!n||n==="Anonymous"||n==="Volunteer"||n==="Leadership")return;
  MY.name=n;
  try{localStorage.setItem("k2c_name",n.slice(0,40));}catch(_){}
  renderNameBars();prefillNames();
}
function myTag(){return (MY.name||"").trim();}
/* One question, asked once: "what's your name?" — then every tool works. */
function askName(cb){
  var n=(prompt("What's your name? (so the team sees who did what)",MY.name||"")||"").trim();
  if(!n)return;
  rememberName(n);
  if(MY.name&&cb)cb();
}
/* The old per-tool initials boxes are now a friendly "working as" bar. */
function renderNameBars(){
  ["su","io","ct","rad","ch"].forEach(function(k){
    var el=document.getElementById("namebar-"+k);if(!el)return;
    el.innerHTML=MY.name
      ?'🙋 Working as <b>'+esc(MY.name)+'</b><button onclick="askName()">Change</button>'
      :'✍️ <b>Set your name</b> so your work is credited to you <button onclick="askName()">Set name</button>';
  });
}
/* v1.5.0 — the per-tool initials inputs are gone; identity is the saved name
   ("working as" bars, rendered by renderNameBars). */
document.getElementById("ciBtn").addEventListener("click",function(){var name=document.getElementById("ciName").value.trim(),team=document.getElementById("ciTeam").value;if(!name){flash("ciName");return;}if(!document.getElementById("ciAttest").checked){document.getElementById("ciAttestMsg").classList.add("show");document.getElementById("ciAttestRow").classList.add("nudge");setTimeout(function(){document.getElementById("ciAttestRow").classList.remove("nudge");},600);return;}rememberName(name);var rec={id:uid(),name:name,team:team,attested:true,t:nowLabel()};queueWrite("addCheckin",rec,function(){STATE.checkins.push(rec);},function(){renderDynamic();});document.getElementById("ciName").value="";document.getElementById("ciAttest").checked=false;document.getElementById("ciAttestMsg").classList.remove("show");prefillNames();toast(tourDone()?"✅ Checked in!":"✅ Checked in! New to the app? Take the 2-min App Tour under Resources 🧭");});
document.getElementById("aBtn").addEventListener("click",function(){if(!LEADER){askPin(function(){});return;}var by=document.getElementById("aName").value.trim()||"Leadership",title=document.getElementById("aTitle").value.trim(),body=document.getElementById("aBody").value.trim(),pri=document.getElementById("aPri").value;if(!title||!body){flash(title?"aBody":"aTitle");return;}rememberName(by);var rec={id:uid(),pri:pri,title:title,body:body,by:by,t:nowLabel()};annBarDismissedId="";queueWrite("addAnnouncement",rec,function(){STATE.announcements.unshift(rec);},function(){renderDynamic();});document.getElementById("aTitle").value="";document.getElementById("aBody").value="";prefillNames();});
document.getElementById("pBtn").addEventListener("click",function(){var name=document.getElementById("pName").value.trim()||"Anonymous",body=document.getElementById("pBody").value.trim();if(!body){flash("pBody");return;}rememberName(name);var rec={id:uid(),name:name,body:body,t:nowLabel()};queueWrite("addPraise",rec,function(){STATE.praises.unshift(rec);},function(){renderDynamic();});document.getElementById("pBody").value="";prefillNames();toast("🎉 Praise posted!");});
document.getElementById("mirBtn").addEventListener("click",function(){var name=document.getElementById("mirMyName").value.trim()||MY.name,type=document.getElementById("mirType").value,who=document.getElementById("mirWho").value.trim(),body=document.getElementById("mirBody").value.trim();if(!body){flash("mirBody");return;}if(!name){flash("mirMyName");return;}rememberName(name);var rec={id:uid(),type:type,name:who,note:body,county:STATE.county||"",by:name,dev:DEV,t:nowLabel(),d:dateKey(new Date()),witnesses:[]};queueWrite("miracleAdd",rec,function(){STATE.miracles=STATE.miracles||[];STATE.miracles.unshift(rec);},function(){renderDynamic();});document.getElementById("mirWho").value="";document.getElementById("mirBody").value="";prefillNames();toast("🙌 Reported — now it needs two witnesses to confirm it");});
document.getElementById("fBtn").addEventListener("click",function(){var by=document.getElementById("fName").value.trim()||"Volunteer",title=document.getElementById("fTitle").value.trim(),body=document.getElementById("fBody").value.trim(),priority=document.getElementById("fPri").value;if(!title){flash("fTitle");return;}rememberName(by);var rec={id:uid(),priority:priority,title:title,body:body,by:by,t:nowLabel()};queueWrite("addFeedback",rec,function(){STATE.feedback.unshift(rec);},function(){renderDynamic();});document.getElementById("fTitle").value="";document.getElementById("fBody").value="";prefillNames();toast("✅ Sent to leadership");});
function flash(id){var e=document.getElementById(id);if(e){e.style.borderColor="#B86239";e.focus();setTimeout(function(){e.style.borderColor="";},1200);}}
/* Attendance counter (v1.6.1): every tap lands in a per-phone ABSOLUTE tally
   that survives reloads (localStorage) and is pushed to the server whole —
   "this phone's total is N, split by name" — instead of as fragile +1 deltas.
   A retried request can't double-count and a dropped one can't lose taps: the
   next push simply carries them. This replaces the old delta batching, which
   could silently drop taps when a flush failed mid-burst (the "+3 became +1"
   bug) and then deadlock the sync loop until reload. */
var TALLY=(function(){
  try{var v=JSON.parse(localStorage.getItem("k2c_tally")||"null");
    if(v&&typeof v.total==="number"&&v.by&&typeof v.by==="object")return{total:Math.max(0,v.total),by:v.by,epoch:(v.epoch||"")+"",dirty:!!v.dirty};
  }catch(_){}
  return{total:0,by:{},epoch:"",dirty:false};
})();
var tallySerial=0; // bumps on every tap so a flush knows if taps landed while it was in flight
function saveTally(){try{localStorage.setItem("k2c_tally",JSON.stringify(TALLY));}catch(_){}}
/* A leader reset rotates the server's tally epoch; when we see a new epoch our
   local tally belongs to the previous event and must be cleared, not re-sent. */
function adoptTallyEpoch(s){
  if(!s||s.tallyEpoch==null)return;
  var e=s.tallyEpoch+"";
  if(e===TALLY.epoch)return;
  TALLY={total:0,by:{},epoch:e,dirty:false};tallySerial++;saveTally();
}
function renderTallyBreak(){
  var by=STATE.tallyBy||{};var ks=Object.keys(by).filter(function(k){return by[k]>0;}).sort(function(a,b){return by[b]-by[a];});
  var html=ks.map(function(k){return '<div class="tallyrow"><span>'+esc(k)+'</span><b>'+by[k]+'</b></div>';}).join("");
  var cw=document.getElementById("ctBreakWrap"),cb=document.getElementById("ctBreak");
  if(cw)cw.style.display=ks.length?"block":"none";
  if(cb)cb.innerHTML=html;
  var dt=document.getElementById("dTally");if(dt)dt.innerHTML=html||'<p class="hint">No counts logged yet.</p>';
}
function renderCountFast(){
  document.getElementById("countBig").textContent=STATE.count;
  var p=document.getElementById("crewCountPill");if(p){p.textContent=STATE.count;p.style.display=STATE.count?"flex":"none";}
  var h=document.getElementById("dHeads");if(h)h.textContent=STATE.count;
  var init=myTag();
  var mn=document.getElementById("ctMine");
  if(mn){mn.style.display=init?"block":"none";if(init)mn.innerHTML="Your tally (<b>"+esc(init)+"</b>): <b>"+((STATE.tallyBy||{})[init]||0)+"</b>";}
  renderTallyBreak();
}
function bumpCount(delta){
  var init=myTag();
  if(!init){askName(function(){bumpCount(delta);});return;}
  vibr(12);
  STATE.count=Math.max(0,(STATE.count||0)+delta);
  STATE.tallyBy=STATE.tallyBy||{};STATE.tallyBy[init]=Math.max(0,(STATE.tallyBy[init]||0)+delta);
  TALLY.total=Math.max(0,TALLY.total+delta);
  TALLY.by[init]=Math.max(0,(TALLY.by[init]||0)+delta);
  TALLY.dirty=true;tallySerial++;saveTally();
  renderCountFast();
  scheduleFlush(300);
}
/* ---- decisions counter (v1.10.0) ----
   Same absolute-per-phone design as the head count, in its own namespace, so
   retries and dropped requests can't double-count or lose responses. */
var DEC=(function(){
  try{var v=JSON.parse(localStorage.getItem("k2c_dec")||"null");
    if(v&&typeof v.total==="number"&&v.by&&typeof v.by==="object")return{total:Math.max(0,v.total),by:v.by,epoch:(v.epoch||"")+"",dirty:!!v.dirty};
  }catch(_){}
  return{total:0,by:{},epoch:"",dirty:false};
})();
var decSerial=0,decSending=false,decFlushT=null;
function saveDec(){try{localStorage.setItem("k2c_dec",JSON.stringify(DEC));}catch(_){}}
function adoptDecEpoch(s){
  if(!s||s.tallyEpoch==null)return;
  var e=s.tallyEpoch+"";
  if(e===DEC.epoch)return;
  DEC={total:0,by:{},epoch:e,dirty:false};decSerial++;saveDec();
}
function scheduleDecFlush(ms){clearTimeout(decFlushT);decFlushT=setTimeout(flushDec,ms);}
function flushDec(){
  decFlushT=null;
  if(!DEC.dirty||decSending)return;
  var sent=decSerial;
  var snap={dev:DEV,total:DEC.total,by:{},epoch:DEC.epoch};
  for(var k in DEC.by)if(DEC.by[k]>0)snap.by[k]=DEC.by[k];
  decSending=true;inflight++;
  apiPost("decSet",snap).then(function(s){
    decSending=false;inflight=Math.max(0,inflight-1);
    if(!LIVE){LIVE=true;updateSync();}
    if(s&&s.epochMismatch){
      DEC={total:0,by:{},epoch:(s.epoch||"")+"",dirty:false};decSerial++;saveDec();
      if(typeof s.decisions==="number"){STATE.decisions=s.decisions;STATE.decBy=s.decBy||{};}
      renderDecFast();return;
    }
    if(decSerial===sent){
      DEC.dirty=false;saveDec();
      if(typeof s.decisions==="number"){STATE.decisions=s.decisions;STATE.decBy=s.decBy||{};renderDecFast();}
    }else{scheduleDecFlush(120);}
  }).catch(function(){
    decSending=false;inflight=Math.max(0,inflight-1);
    if(LIVE){LIVE=false;updateSync();}
    scheduleDecFlush(2500);
  });
}
function renderDecFast(){
  var b=document.getElementById("decBig");if(b)b.textContent=STATE.decisions||0;
  var d=document.getElementById("dDecisions");if(d)d.textContent=STATE.decisions||0;
  var init=myTag(),mn=document.getElementById("decMine");
  if(mn){mn.style.display=init?"block":"none";if(init)mn.innerHTML="Your count (<b>"+esc(init)+"</b>): <b>"+((STATE.decBy||{})[init]||0)+"</b>";}
  var by=STATE.decBy||{},ks=Object.keys(by).filter(function(k){return by[k]>0;}).sort(function(a,b2){return by[b2]-by[a];});
  var w=document.getElementById("decBreakWrap"),el=document.getElementById("decBreak");
  if(w)w.style.display=ks.length?"block":"none";
  if(el)el.innerHTML=ks.map(function(k){return '<div class="tallyrow"><span>'+esc(k)+'</span><b>'+by[k]+'</b></div>';}).join("");
  var dd=document.getElementById("dDecBreak");
  if(dd)dd.innerHTML=ks.length?ks.map(function(k){return '<div class="tallyrow"><span>'+esc(k)+'</span><b>'+by[k]+'</b></div>';}).join(""):'<p class="hint">No decisions logged yet.</p>';
}
function bumpDec(delta){
  var init=myTag();
  if(!init){askName(function(){bumpDec(delta);});return;}
  vibr(delta>0?[18,30,18]:12);
  STATE.decisions=Math.max(0,(STATE.decisions||0)+delta);
  STATE.decBy=STATE.decBy||{};STATE.decBy[init]=Math.max(0,(STATE.decBy[init]||0)+delta);
  DEC.total=Math.max(0,DEC.total+delta);
  DEC.by[init]=Math.max(0,(DEC.by[init]||0)+delta);
  DEC.dirty=true;decSerial++;saveDec();
  renderDecFast();
  scheduleDecFlush(300);
}
function scheduleFlush(ms){if(countFlushT)clearTimeout(countFlushT);countFlushT=setTimeout(flushCount,ms);}
var DEV=(function(){try{var v=localStorage.getItem("k2c_dev");if(!v){v=uid();localStorage.setItem("k2c_dev",v);}return v;}catch(_){return uid();}})();
function flushCount(){
  countFlushT=null;
  if(!TALLY.dirty||countSending)return;
  var sentSerial=tallySerial;
  var snap={dev:DEV,total:TALLY.total,by:{},epoch:TALLY.epoch};
  for(var k in TALLY.by)if(TALLY.by[k]>0)snap.by[k]=TALLY.by[k];
  countSending=true;inflight++;
  apiPost("tallySet",snap).then(function(s){
    countSending=false;inflight=Math.max(0,inflight-1);
    if(!LIVE){LIVE=true;updateSync();}
    if(s&&s.epochMismatch){ // a leader reset the event while we were counting — start fresh
      TALLY={total:0,by:{},epoch:(s.epoch||"")+"",dirty:false};tallySerial++;saveTally();
      if(typeof s.count==="number"){STATE.count=s.count;STATE.tallyBy=s.tallyBy||{};}
      renderCountFast();return;
    }
    if(tallySerial===sentSerial){
      TALLY.dirty=false;saveTally();
      if(typeof s.count==="number"){STATE.count=s.count;STATE.tallyBy=s.tallyBy||{};renderCountFast();}
    }else{scheduleFlush(120);} // taps landed while this push was in flight — push again
  }).catch(function(){
    countSending=false;inflight=Math.max(0,inflight-1);
    if(LIVE){LIVE=false;updateSync();}
    // Taps are safe in TALLY (and localStorage). Always keep retrying — the
    // old `if(everSynced)` guard stranded a phone that booted offline: its
    // tally stayed dirty forever, and because settled() gates the poll loop on
    // TALLY.dirty, the phone then stopped polling entirely and never
    // discovered the network had come back.
    scheduleFlush(2500);
  });
}
// pointerdown (not click) = fires instantly on touch, immune to the
// double-tap-zoom delay that was eating rapid taps on iOS.
function bindCounterBtn(id,delta,fn){
  var el=document.getElementById(id);if(!el)return;
  fn=fn||bumpCount;
  el.addEventListener("pointerdown",function(e){e.preventDefault();fn(delta);});
  el.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" ")fn(delta);});
  el.addEventListener("click",function(e){e.preventDefault();}); // swallow the ghost click
}
bindCounterBtn("countPlus",1);bindCounterBtn("countMinus",-1);
bindCounterBtn("decPlus",1,bumpDec);bindCounterBtn("decMinus",-1,bumpDec);
document.addEventListener("visibilitychange",function(){if(document.visibilityState!=="visible"){flushCount();flushDec();}});
document.getElementById("fundSave").addEventListener("click",function(){
  var pct=parseInt(document.getElementById("fundPctEdit").value,10),need=document.getElementById("fundNeedEdit").value.trim();
  if(isNaN(pct)||pct<0||pct>100){flash("fundPctEdit");return;}
  queueWrite("setFunding",{pct:pct,needed:need},function(){STATE.funding={pct:pct,needed:need||STATE.funding.needed};},function(){renderFunding();});
});
document.getElementById("evCounty").addEventListener("change",function(){setCounty(this.value);});
document.getElementById("evSave").addEventListener("click",function(){var name=document.getElementById("evName").value.trim(),date=document.getElementById("evDate").value.trim();var sh=document.getElementById("evShift").checked?1:0;queueWrite("setEvent",{name:name,date:date,shift:sh},function(){STATE.event={name:name,date:date,shift:sh};},function(){renderEvent();refreshChecklists();renderDayBanner();});});
/* v1.2.0 — one-tap CSV export of the day's data (leaders) */
function csvCell(v){v=String(v==null?"":v);return '"'+v.replace(/"/g,'""')+'"';}
document.getElementById("csvBtn").addEventListener("click",function(){
  var rows=[["Section","Name / item","Detail","Time / status"]];
  (STATE.checkins||[]).forEach(function(c){rows.push(["Check-in",c.name||"",c.team||"",c.t||""]);});
  rows.push(["Head count","Attendees",String(STATE.count||0),""]);
  Object.keys(STATE.tallyBy||{}).forEach(function(k){rows.push(["Head count by",k,String(STATE.tallyBy[k]||0),""]);});
  (STATE.radios||[]).forEach(function(r){if(r.out)rows.push(["Radio","#"+r.n,"out: "+(r.out.by||"")+" "+(r.out.t||"")+(r.in?(" · returned: "+r.in.by+" "+r.in.t):" — STILL OUT"),""]);});
  (STATE.feedback||[]).forEach(function(f){rows.push(["Issue",f.by||"",(f.title||"")+(f.body?(" — "+f.body):"")+(f.hidden?(" (acked by "+(f.ackBy||"?")+")"):""),f.t||""]);(f.comments||[]).forEach(function(c){rows.push(["Issue comment",c.name||"",c.text||"",c.t||""]);});});
  (STATE.praises||[]).forEach(function(p){rows.push(["Praise",p.name||"",(p.body||"")+(p.hidden?" (acked)":""),p.t||""]);(p.comments||[]).forEach(function(c){rows.push(["Praise comment",c.name||"",c.text||"",c.t||""]);});});
  (STATE.announcements||[]).forEach(function(a){rows.push(["Announcement",a.by||"",(a.title||"")+(a.body?(" — "+a.body):""),a.t||""]);(a.comments||[]).forEach(function(c){rows.push(["Announcement comment",c.name||"",c.text||"",c.t||""]);});});
  Object.keys(STATE.checklist||{}).forEach(function(k){var r=STATE.checklist[k]||{};rows.push(["Checklist",k,"done by "+(r.by||"?"),r.t||""]);});
  var csv=rows.map(function(r){return r.map(csvCell).join(",");}).join("\r\n");
  var blob=new Blob(["\ufeff"+csv],{type:"text/csv"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="k2c-day-report-v1.7.1-"+new Date().toISOString().slice(0,10)+".csv";
  document.body.appendChild(a);a.click();a.remove();
});
/* v1.7.1 — purge ALL Quick Captures (records + photo/voice blobs) once they've
   been entered into Planning Center Online. Same reset-password speed bump as
   the day reset, plus the leader PIN verified server-side on the action. */
document.getElementById("capPurgeBtn").addEventListener("click",function(){
  if(!LEADER){askPin(function(){});return;}
  if(!LIVE){toast("Demo mode — captures live on the deployed site");return;}
  /* This is a deliberate speed bump, NOT a security control — it is checked
     here in the browser only. The real gate is the leader PIN, verified
     server-side on capturePurge. */
  var pw=prompt("Type PURGE to confirm you have exported every capture to Planning Center:");
  if(pw==null)return;
  if((pw||"").trim().toUpperCase()!=="PURGE"){alert("Not purged — you must type PURGE exactly.");return;}
  if(!confirm("⚠️ BEFORE YOU PURGE — has EVERY capture been properly entered into Planning Center Online?\n\nThis permanently deletes ALL Quick Captures for everyone — names, contact info, notes, card photos AND voice notes. It cannot be undone.\n\nOnly continue if all of this data is safely in Planning Center."))return;
  capPurgeSend(false);
});
/* The server refuses (409) while any capture is still marked "not yet entered",
   so the claim behind the button — everything is in Planning Center — has to
   be true before the data is destroyed. A leader can still override. */
function capPurgeSend(force){
  apiPost("capturePurge",force?{force:true}:{}).then(function(){
    STATE.captureCount=0;STATE.captureBytes=0;
    if(typeof capAll!=="undefined"&&capAll)capAll=[];
    updateBadges();renderCapStorage();
    if(typeof renderCapLeader==="function")renderCapLeader();
    toast("🧹 All captures purged — storage cleared");
  }).catch(function(e){
    if(e===409){
      if(confirm("Some captures are still marked \"Not yet entered\" in the list below.\n\nMark them as entered first, or purge anyway?\n\nOK = purge anyway (contact info will be lost)\nCancel = go back and check"))capPurgeSend(true);
      return;
    }
    if(e!==403)toast("Purge failed — check your signal and try again");
  });
}
document.getElementById("resetBtn").addEventListener("click",function(){
  /* Speed bump only — browser-side. The leader PIN (server-verified) is the
     actual gate on `reset`. */
  var pw=prompt("Type RESET to confirm you want to clear this event's data:");
  if(pw==null)return;
  if((pw||"").trim().toUpperCase()!=="RESET"){alert("Not reset — you must type RESET exactly.");return;}
  if(!confirm("Reset event data (checklists, check-ins, head count, radios, praise, announcements & issues)? Keeps event name, Day PIN & Tech I/O roster; clears patch checkmarks. A backup snapshot is saved server-side first."))return;
  doAction("reset",{},function(){var ev=STATE.event,fu=STATE.funding,pr=STATE.prompter,dps=STATE.dayPinSet,io=ioListClearProgress(STATE.ioList);STATE=normalize({checklist:{},announcements:[],checkins:[],feedback:[],praises:[],count:0,event:ev,ioList:io,dayPinSet:dps,funding:fu,prompter:pr});});
});
document.addEventListener("click",function(e){var row=e.target.closest(".chk");if(row)toggleCheck(row.getAttribute("data-id"));});
/* Keyboard/switch access for the same rows (they are role=button). */
document.addEventListener("keydown",function(e){
  if(e.key!=="Enter"&&e.key!==" ")return;
  var row=e.target&&e.target.closest&&e.target.closest(".chk");
  if(row){e.preventDefault();toggleCheck(row.getAttribute("data-id"));}
});
document.getElementById("annBarX").addEventListener("click",function(e){
  e.stopPropagation();
  var a=STATE.announcements[0];
  annBarDismissedId=(annBarMode==="ann"&&a)?a.id:"checkin";
  document.getElementById("annBar").classList.remove("show");
});
var annBarMode="checkin";
document.getElementById("annBar").addEventListener("click",function(){show(annBarMode==="checkin"?"checkin":"announcements");});
var PARENT={dashboard:"crew",checkin:"guides",count:"crew",setup:"crew",techio:"crew",inventory:"crew",announcements:"board",praise:"board",issue:"board",leaders:"guides",graphics:"guides",donate:"guides",playbook:"guides",handbook:"guides",tour:"guides",radios:"crew",shareapp:"guides",capture:"guides",church:"mobilize",faith:"guides"};
function show(id){
  if(id==="dashboard"&&!LEADER){askPin(function(){show("dashboard");});}
  var pages=document.querySelectorAll(".page");for(var i=0;i<pages.length;i++)pages[i].classList.remove("active");
  var el=document.getElementById("page-"+id);if(el)el.classList.add("active");
  var tab=PARENT[id]||id;var tabs=document.querySelectorAll(".tab");for(var j=0;j<tabs.length;j++)tabs[j].classList.toggle("active",tabs[j].getAttribute("data-tab")===tab);
  window.scrollTo({top:0,behavior:"smooth"});
  if(id==="now")renderSpine();
  if(id==="dashboard"){applyLeaderUI();renderDashboard();}
  if(id==="announcements"||id==="issue"){seenAnn=STATE.announcements.length;seenIssue=visCount(STATE.feedback);updateBadges();}
  if(id==="tour")tourSeen();
  if(id==="radios")renderRadios();
  if(id==="inventory")renderInventory();
  if(id==="shareapp")renderShareQR();
  if(id==="capture"&&typeof renderCapture==="function")renderCapture();
  if(id==="mobilize"&&typeof renderMobilize==="function"){renderMobilize();chFetch();}
  if(id==="church"&&typeof renderChurchPage==="function")renderChurchPage();
}
/* v1.6.1 — Share-this-app QR (drawn locally from the current URL, works offline) */
function appShareUrl(){return location.origin+location.pathname.replace(/index\.html$/,"");}
function renderShareQR(){
  var box=document.getElementById("qrBox");if(!box)return;
  var url=appShareUrl();
  var u=document.getElementById("qrUrl");if(u)u.textContent=url.replace(/^https?:\/\//,"");
  if(box.getAttribute("data-done"))return;
  try{
    var qr=qrcode(0,"M");qr.addData(url);qr.make();
    box.innerHTML=qr.createSvgTag({cellSize:8,margin:2,scalable:true});
    box.setAttribute("data-done","1");
  }catch(e){box.innerHTML='<p class="hint">Couldn’t draw the QR code on this phone — use the share button below instead.</p>';}
}
document.getElementById("qrShareBtn").addEventListener("click",function(){
  var url=appShareUrl();
  if(navigator.share){navigator.share({title:"K2C '26 Ambassador App",text:"Kingdom to the Counties '26 — ambassador companion app:",url:url}).catch(function(){});}
  else{copyShareUrl();}
});
function copyShareUrl(){
  var url=appShareUrl();
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(function(){toast("📋 Link copied — paste it anywhere");}).catch(function(){prompt("Copy the app link:",url);});}
  else{prompt("Copy the app link:",url);}
}
document.getElementById("qrCopyBtn").addEventListener("click",copyShareUrl);
/* v1.6.1 — print / save-as-PDF straight from the live app content, so a
   printed Playbook or Counselor Booklet is always the current version (the
   old bundled PDF went stale the moment the text was edited in the app).
   Opens every collapsed section, swaps tap-to-call buttons for the real
   number/address on paper, prints, then puts everything back. */
function printDoc(kind){
  var page=document.getElementById("page-"+kind);
  if(!page||document.body.getAttribute("data-print"))return;
  document.body.setAttribute("data-print",kind);
  var opened=[],dets=page.querySelectorAll("details");
  for(var i=0;i<dets.length;i++){if(!dets[i].open){dets[i].open=true;opened.push(dets[i]);}}
  var stash=[],links=page.querySelectorAll('a[href^="tel:"],a[href^="mailto:"]');
  for(var j=0;j<links.length;j++){
    var a=links[j],href=a.getAttribute("href")||"";
    stash.push([a,a.innerHTML]);
    if(href.indexOf("tel:")===0){
      var d=href.slice(4).replace(/\D/g,"");
      if(d.length===11&&d.charAt(0)==="1")d=d.slice(1);
      a.textContent=d.length===10?fmtTel(d):href.slice(4);
    }else a.textContent=href.slice(7);
  }
  var done=false;
  function cleanup(){
    if(done)return;done=true;
    window.removeEventListener("afterprint",cleanup);
    window.removeEventListener("focus",cleanup);
    document.body.removeAttribute("data-print");
    for(var k=0;k<opened.length;k++)opened[k].open=false;
    for(var n=0;n<stash.length;n++)stash[n][0].innerHTML=stash[n][1];
  }
  window.addEventListener("afterprint",cleanup);
  window.addEventListener("focus",cleanup); // Safari fallback when afterprint doesn't fire
  setTimeout(function(){
    try{window.print();}catch(e){cleanup();toast("Printing isn't available here — open the app in your browser and try again.");}
  },60);
}
function goSchedule(){show("now");setTimeout(function(){var a=document.getElementById("scheduleAnchor");if(a)a.scrollIntoView({behavior:"smooth"});},80);}
/* ---- Trailer Load List (demo) ----
   Sample color-coded bin system + loading order. Static demo data for now; a
   later PR can make it leader-editable & synced like the checklist. */
/* ---- Trailer Load List (demo contents) ----
   Two trailers, ~40 numbered bins (prefix-serial, e.g. 002-001), 11 tents +
   weights as oversize items. Colors are LOAD PRIORITY (repeat across bins):
   P1 is needed first on site so it loads LAST (rear, by the door); P5 is
   rarely needed so it loads FIRST (nose). Contents are placeholders for the
   logistics team; tap a bin for contents + where it rides in the trailer. */
var LOAD_PRI={
  1:{c:"#dc2626",n:"P1 · Red",d:"Needed FIRST on site — loads LAST (rear, by the door)"},
  2:{c:"#ea580c",n:"P2 · Orange",d:"Early setup — loads in the rear half"},
  3:{c:"#ca8a04",n:"P3 · Yellow",d:"Mid setup — loads mid-trailer"},
  4:{c:"#16a34a",n:"P4 · Green",d:"Later in the day — loads in the front half"},
  5:{c:"#2563eb",n:"P5 · Blue",d:"Rarely needed — loads FIRST (nose)"}
};
/* bins: [serial, priority, title, [contents], "placement in trailer"] */
var TRAILERS=[
 {prefix:"001",icon:"🔧",name:"Trailer 001 · Tech / Worship (+ band & FOH tents)",bins:[
  [1,1,"FOH console + iPad",["StudioLive console","iPad + mount","Console power kit","Dust cover"],"Rear, curb side, floor — strap to the rail. Last on, first off."],
  [2,1,"Stage box & AVB cables",["Papa V stage box","AVB cables ×4","Ethernet drum ×2"],"Rear, driver side, floor — beside 001-001."],
  [3,1,"Show computers & routing",["Playback laptop","Backup iPad","Routing interfaces","Starlink kit"],"Rear, curb side, shelf 1 — padded shelf, never stack on top."],
  [4,2,"Power stringers & drops",["Stage drops ×4","120v stringers","Spider boxes ×2"],"Rear third, driver side, floor."],
  [5,2,"Extension cords & strips",["25ft cords ×8","50ft cords ×6","Power strips ×10"],"Rear third, driver side, stacked on 001-004."],
  [6,2,"Cable covers & mats",["5-channel covers ×6","Walk-over mats","Cover connectors"],"Rear third, center aisle floor — heavy, keep low."],
  [7,2,"Generator accessories",["Fuel cans (empty)","Grounding rods","Gen power tails"],"Rear third, curb side, floor — vent caps up."],
  [8,3,"Mics & clips",["Vocal mics ×8","Instrument mics ×6","Clips & windscreens"],"Middle, curb side, shelf 2 — padded bin."],
  [9,3,"Mic stands",["Tall booms ×8","Short booms ×4","Round bases ×4"],"Middle, floor, laid flat under shelf 2."],
  [10,3,"DI boxes & sub snakes",["Passive DI ×6","Active DI ×4","8-ch sub snakes ×3"],"Middle, driver side, shelf 1."],
  [11,3,"IEM packs & antennas",["IEM packs ×10 (red Packout)","Antenna combiner","Paddles + coax"],"Middle, curb side, shelf 1 — keep with 001-012."],
  [12,3,"Batteries & chargers",["Black Fujitsu AA ×60","Chargers ×4","9v backups"],"Middle, curb side, shelf 1 — next to IEM packs."],
  [13,3,"Drum hardware",["Kick pedal & clamps","Cymbal felts & wingnuts","Drum keys & spares"],"Middle, driver side, floor — under the riser panels."],
  [14,3,"XLR cables — long",["50ft XLR ×12","75ft XLR ×4"],"Middle, center floor — coiled in bin, heavy."],
  [15,3,"XLR cables — short",["15ft XLR ×16","25ft XLR ×12"],"Middle, stacked on 001-014."],
  [16,4,"Stage banners & skirting",["Stage skirt panels","Podium banner","Bungee ties"],"Front half, driver side, shelf 2."],
  [17,4,"Rain kits & covers",["Console rain covers","Speaker ponchos","Clear tarps ×4"],"Front half, curb side, shelf 2 — grab fast if skies turn."],
  [18,4,"Tech tool kit",["Drill + bits","Multimeter","Soldering kit","Spare connectors"],"Front half, driver side, shelf 1."],
  [19,5,"Spare cables & adapters",["Adapters (all types)","Spare NL4","Couplers & turnarounds"],"Nose, shelf 1 — only opened when something breaks."],
  [20,5,"Manuals & spares",["Console manual","Spare fuses","Backup SD cards","Zip bags"],"Nose, shelf 2 — lightest bin, top of the nose stack."]
 ],oversize:[
  ["Band tent A (heavy — 4-person lift)",1,"Rear floor, curb side — FIRST off, goes up first."],
  ["Band tent B (heavy — 4-person lift)",1,"Rear floor, driver side — with tent A."],
  ["FOH tent (heavy)",1,"Rear floor, center — right behind the band tents."],
  ["Prayer tent",3,"Middle floor, on top of truss bags."],
  ["Trusses — THE Tower",2,"Full-length floor run, driver side wall — load before all rear bins."],
  ["Drum riser panels",3,"Middle, flat against curb-side wall."],
  ["FOH speakers & subs (cases)",2,"Rear-middle floor, center — wheel brakes ON."],
  ["Weight bags ×8 (~50 lb each)",2,"Floor, distributed over the axles — NEVER above shelf height."]
 ]},
 {prefix:"002",icon:"📦",name:"Trailer 002 · Logistics / Guest Services / Ambassadors",bins:[
  [1,1,"Check-in & registration kit",["Clipboards & pens","Volunteer rosters","Day-PIN cards","Table signs"],"Rear, curb side, shelf 1 — first bin off the truck."],
  [2,1,"Site signage & arrows",["Directional arrows","Parking signs","Entrance banner","Sign stakes"],"Rear, driver side, floor."],
  [3,1,"Cones & flagging",["Traffic cones ×24","Flagging tape","Cone toppers"],"Rear, center floor — heavy, keep low."],
  [4,1,"Safety vests & crowd control",["Hi-vis vests ×20","Crowd rope","Carabiners"],"Rear, curb side, shelf 2."],
  [5,1,"Radios & chargers",["Radios ×10","Gang charger","Spare batteries","Checkout sheet"],"Rear, curb side, shelf 1 — beside 002-001."],
  [6,2,"First-aid kits",["Main first-aid kit","AED (if assigned)","Ice packs","Incident forms"],"Rear, driver side, shelf 1 — RED CROSS label facing out."],
  [7,2,"Water & cups",["Water jugs ×6","Cup sleeves","Ladles & lids"],"Rear third, floor — heavy, over the axles."],
  [8,2,"Coolers & ice gear",["Coolers ×4 (nested)","Ice scoops","Drain plugs"],"Rear third, floor beside 002-007."],
  [9,3,"Tablecloths & clips",["Branded cloths ×12","Clips ×40","Weights for corners"],"Middle, curb side, shelf 2."],
  [10,3,"Lanyards & badges",["Volunteer lanyards ×60","Leader badges","Blank badges + marker"],"Middle, curb side, shelf 1."],
  [11,3,"Playbooks & booklets",["Ambassador Playbooks ×30","Counselor Booklets ×30"],"Middle, driver side, shelf 1 — keep dry."],
  [12,3,"Prayer & response cards",["Prayer cards ×500","Response cards ×500","Card stands"],"Middle, driver side, shelf 1 — with 002-011."],
  [13,3,"Gift bags — Bibles",["Bibles ×100","Bag inserts"],"Middle, floor — heavy, split across two bins if over 40 lb."],
  [14,3,"Gift bags — CDs & crosses",["Worship CDs ×100","Hand crosses ×100","Gift bags (flat)"],"Middle, floor beside 002-013."],
  [15,4,"Kids' activity supplies",["Coloring sheets & crayons","Stickers","Bubbles"],"Front half, curb side, shelf 2."],
  [16,4,"Trash & cleanup",["Trash bags (contractor)","Gloves","Grabbers ×4","Zip ties"],"Front half, driver side, floor."],
  [17,4,"Logistics tool kit",["Hammer & stakes puller","Duct/gaff tape","Utility knives","Zip ties"],"Front half, driver side, shelf 1."],
  [18,4,"Office box",["Markers & sharpies","Printer paper & printouts","Stapler, scissors, tape"],"Front half, curb side, shelf 1."],
  [19,5,"Spare tarps & bungees",["Tarps ×6","Bungee assortment","Paracord"],"Nose, floor."],
  [20,5,"Lost & found + misc",["Lost & found tub (empty)","Spare hats/ponchos","Misc overflow"],"Nose, shelf 1 — lightest, top of the nose stack."]
 ],oversize:[
  ["Guest Services tent ×2 (heavy)",1,"Rear floor — FIRST off with the signage bins."],
  ["Ambassador tent ×2 (heavy)",1,"Rear floor, behind Guest Services tents."],
  ["Logistics tent",4,"Front-middle floor — set up later, stays staged."],
  ["Green room tent",4,"Front-middle floor, with the logistics tent."],
  ["Kids' tent",3,"Middle floor."],
  ["Folding tables ×10",2,"On edge along the driver-side wall, strapped."],
  ["Folding chairs (racks)",2,"Curb-side wall, wheel brakes ON."],
  ["Weight bags ×12 (~50 lb each)",2,"Floor, distributed over the axles — NEVER above shelf height."]
 ]}
];
function binId(prefix,n){return prefix+"-"+String(n).padStart(3,"0");}
function renderInventory(){
  var lg=document.getElementById("priLegend");
  if(lg)lg.innerHTML=[1,2,3,4,5].map(function(p){var pr=LOAD_PRI[p];return '<span class="prikey"><i style="background:'+pr.c+'"></i>'+pr.n.split(" · ")[0]+'</span>';}).join("");
  var m=document.getElementById("invMount");if(!m)return;
  m.innerHTML=TRAILERS.map(function(tr,ti){
    var chips=tr.bins.map(function(b,bi){
      var pr=LOAD_PRI[b[1]];
      return '<button class="binchip" style="border-color:'+pr.c+'" onclick="binOpen('+ti+','+bi+')"><i style="background:'+pr.c+'"></i><b>'+binId(tr.prefix,b[0])+'</b><span>'+esc(b[2])+'</span></button>';
    }).join("");
    var over=tr.oversize.map(function(o){
      var pr=LOAD_PRI[o[1]];
      return '<div class="overrow"><i style="background:'+pr.c+'"></i><div><b>'+esc(o[0])+'</b><span>'+esc(o[2])+'</span></div></div>';
    }).join("");
    return '<div class="trailerblk"><div class="thead">'+tr.icon+' <b>'+esc(tr.name)+'</b><span class="tcount">'+tr.bins.length+' bins</span></div>'
      +'<div class="bingrid">'+chips+'</div>'
      +'<div class="seclabel" style="margin-top:10px">⛺ Oversize — tents, tables &amp; weights</div>'+over+'</div>';
  }).join("");
}
function binOpen(ti,bi){
  var tr=TRAILERS[ti],b=tr.bins[bi],pr=LOAD_PRI[b[1]];
  document.getElementById("binTitle").innerHTML='<span class="binno" style="background:'+pr.c+'">'+binId(tr.prefix,b[0])+'</span> '+esc(b[2]);
  document.getElementById("binBody").innerHTML=
    '<div class="binpri" style="border-left-color:'+pr.c+'"><b>'+pr.n+'</b> — '+esc(pr.d)+'</div>'
    +'<div class="seclabel">📋 Contents (sample)</div><ul class="binlist">'+b[3].map(function(it){return '<li>'+esc(it)+'</li>';}).join("")+'</ul>'
    +'<div class="seclabel">🚚 Where it goes in the trailer</div><div class="binplace">📍 '+esc(b[4])+'</div>';
  document.getElementById("binModal").classList.add("show");
}
var tabsEls=document.querySelectorAll(".tab");for(var ti=0;ti<tabsEls.length;ti++){(function(btn){btn.addEventListener("click",function(){show(btn.getAttribute("data-tab"));});})(tabsEls[ti]);}
var simRange=document.getElementById("simRange");
simRange.addEventListener("input",function(){if(!LEADER){askPin(function(){});return;}simActive=true;simAnchor=parseInt(simRange.value,10);simEpoch=Date.now();document.getElementById("simNow").textContent="Previewing "+fmt(simAnchor)+" (running)";refreshAll();refreshChecklists();renderDashboard();});
document.getElementById("simReset").addEventListener("click",function(){simActive=false;document.getElementById("simNow").textContent="Off — using real time";refreshAll();refreshChecklists();renderDashboard();});
function refreshAll(){renderClock();renderNow();renderSpine();renderStrip();}
function tourDone(){try{return localStorage.getItem("k2c_tour")==="1";}catch(_){return false;}}
function tourSeen(){try{localStorage.setItem("k2c_tour","1");}catch(_){}updateTourPrompts();}
function updateTourPrompts(){var d=tourDone()?"none":"flex";var a=document.getElementById("tourPrompt");if(a)a.style.display=d;var b=document.getElementById("ciTour");if(b)b.style.display=d;}
/* ===== v1.5.0 — guided spotlight tour: pop-ups around the whole app, one
   step at a time. Each step opens the right page, highlights the element,
   and explains it. Runs once for new folks (Skip anytime); can be replayed
   from Resources → App Tour. ===== */
var GUIDE_STEPS=[
 {page:"now",sel:".brand",title:"🏠 Event Day",text:"This is home. It follows the clock all day — what's happening Now, what's Next, and the full order of events. No refreshing needed."},
 {page:"now",sel:".tabbar",title:"🧭 Getting around",text:"Five tabs: Pre-Crusade Mobilization (the church list — “Repair the Net”), Now (home), Specialists (work tools), Post (praise, issues & announcements), and Ambassador Resources (guides & contacts)."},
 {page:"checkin",sel:"#ciBtn",title:"🙋 Check in first",text:"When you arrive, check yourself in here. It tells leadership you're on the field and puts you on the day's roster."},
 {page:"board",sel:"#page-board .hub",title:"📣 Post",text:"Three boards: the Praise Wall (celebrate God moments), Report an Issue (flag problems to leadership fast), and Announcements from leaders. You can comment on any post."},
 {page:"crew",sel:"#page-crew .hub",title:"🧰 Specialists",text:"Work tools live here: the Attendance Counter, Setup Checklist, Radio Checkout, Trailer Load List and the Tech I/O list."},
 {page:"count",sel:"#countPlus",title:"👥 Counting attendance",text:"Tap +1 for every non-volunteer attendee. Every tap is logged to your name, so several people can count at once and nothing is lost."},
 {page:"prompter",sel:"#tpBoard",title:"🎬 Recording Studio",text:"Pick your county's script and record an invite video with the built-in teleprompter — then send it to Laura (Marketing) and mark it done."},
 {page:"mobilize",sel:"#chViews",title:"⛪ Pre-Crusade Mobilization",text:"The master church list. Tap a church to call, text or email them (it's logged automatically) — the text and email open pre-written from the master template. Say who you know there and score their interest."},
 {page:"guides",sel:"#page-guides .hub",title:"📘 Resources",text:"The Ambassador Playbook, Counselor Booklet, leader contacts, shareable graphics and ways to give all live here."},
 {page:"now",sel:".tabbar",title:"🎉 You're ready!",text:"That's the whole app. Set your name once and everything you do is credited to you. Have an amazing event day!"}
];
var guideIdx=-1;
function guideStart(){guideIdx=-1;tourSeen();guideNext();}
function guideEnd(){
  guideIdx=-1;
  var d=document.getElementById("guideDim"),t=document.getElementById("guideTip"),c=document.getElementById("guideCatch");
  if(d)d.style.display="none";if(t)t.style.display="none";if(c)c.style.display="none";
}
function guideNext(){guideIdx++;if(guideIdx>=GUIDE_STEPS.length){guideEnd();show("now");toast("🧭 Tour complete — welcome aboard!");return;}guideShow();}
function guideBack(){if(guideIdx>0){guideIdx--;guideShow();}}
function guideShow(){
  var st=GUIDE_STEPS[guideIdx];
  show(st.page);
  setTimeout(function(){
    var el=document.querySelector(st.sel);
    if(el)try{el.scrollIntoView({block:"center",behavior:"instant"});}catch(_){el.scrollIntoView();}
    setTimeout(function(){guidePlace(el,st);},120);
  },180);
}
function guidePlace(el,st){
  var dim=document.getElementById("guideDim"),tip=document.getElementById("guideTip"),cat=document.getElementById("guideCatch");
  cat.style.display="block";dim.style.display="block";tip.style.display="block";
  var r=el?el.getBoundingClientRect():{top:innerHeight/2-40,left:16,width:innerWidth-32,height:80,bottom:innerHeight/2+40};
  var pad=6;
  dim.style.top=(r.top-pad)+"px";dim.style.left=(Math.max(4,r.left-pad))+"px";
  dim.style.width=(Math.min(innerWidth-8,r.width+pad*2))+"px";dim.style.height=(r.height+pad*2)+"px";
  tip.innerHTML='<div class="gt">'+st.title+'</div><p>'+st.text+'</p>'
    +'<div class="gnav"><span class="gstep">'+(guideIdx+1)+' / '+GUIDE_STEPS.length+'</span>'
    +(guideIdx>0?'<button class="gback" onclick="guideBack()">‹ Back</button>':'')
    +'<button class="gskip" onclick="guideEnd()">Skip</button>'
    +'<button class="gnext" onclick="guideNext()">'+(guideIdx===GUIDE_STEPS.length-1?"Finish 🎉":"Next ›")+'</button></div>';
  var below=r.bottom+12,tipH=tip.offsetHeight||150;
  if(below+tipH>innerHeight-16)tip.style.top=Math.max(12,r.top-tipH-12)+"px";
  else tip.style.top=below+"px";
}
window.addEventListener("resize",function(){if(guideIdx>=0)guideShow();});
function boot(){
  renderIOList();renderLeaders();
  if(LEADERPIN){verifyPin("verifyLeaderPin",LEADERPIN).then(function(res){if(res&&res.ok){LEADER=true;if(res.token)LEADERPIN=res.token;setDayOK();applyLeaderUI();renderDynamic();obFlush();}else{LEADERPIN="";sessionStorage.removeItem("k2c_lpin");}}).catch(function(){});}
  apiGet().then(function(s){STATE=applyPending(normalize(s));LIVE=true;adoptTallyEpoch(s);adoptDecEpoch(s);finishBoot();if(TALLY.dirty)scheduleFlush(500);})
  .catch(function(){
    /* NEVER show fabricated data on a real deployment. A phone that booted in
       a dead zone used to get seedDemo() — complete with an "Urgent" crane
       announcement and a 1:00 PM doors time — with only a "Demo mode" pill to
       hint it wasn't real. Demo content is now confined to local development;
       in the field an offline boot shows the last good payload if we have one,
       otherwise empty state and a plain "no signal" message. */
    LIVE=false;
    STATE=isLocalDev()?seedDemo():(loadCache()||normalize({}));
    finishBoot();
  });
}
function setStickyTop(){var tw=document.querySelector(".topwrap");document.documentElement.style.setProperty("--toph",((tw?tw.offsetHeight:0)+6)+"px");}
window.addEventListener("resize",setStickyTop);
function finishBoot(){
  updateSync();applyLeaderUI();maybeDayGate();renderDynamic();refreshAll();updateTourPrompts();renderNameBars();setStickyTop();
  setInterval(function(){renderClock();renderNow();renderStrip();updateDueChips();setStickyTop();if(simActive)document.getElementById("simNow").textContent="Previewing "+fmt(Math.floor(nowMinutes()))+" (running)";},1000);
  setInterval(function(){refreshChecklists();renderDashboard();renderSpine();},15000);
  var lastSnap="";
  function activePage(){var p=document.querySelector(".page.active");return p?p.id.replace("page-",""):"";}
  function syncDelay(){
    var p=activePage();
    if(p==="count"||p==="issue"||p==="praise"||p==="announcements"||p==="board")return 1200;
    if(p==="mobilize"||p==="church")return 2500; // collaborative CRM — keep it snappy
    return 5000;
  }
  function syncLoop(){
    var delay=syncDelay();
    /* Poll even when we've never synced: a phone that booted offline used to
       be stuck in demo mode until a full reload — now it recovers by itself. */
    if(settled()&&document.visibilityState==="visible"){
      apiGet().then(function(s){
        if(settled()){
          lastSyncAt=Date.now();everSynced=true;if(!LIVE){LIVE=true;updateSync();}
          if(OUTBOX.length)obFlush();
          if(s&&s.__nomod)return;   // 304 — skip re-serialize and re-render entirely
          var snap=JSON.stringify(s),changed=snap!==lastSnap;lastSnap=snap;
          var pc=STATE.count,pb=STATE.tallyBy,pd=STATE.decisions,pdb=STATE.decBy;
          STATE=adoptCounts(applyPending(normalize(s)),pc,pb,pd,pdb);adoptTallyEpoch(s);adoptDecEpoch(s);maybeDayGate();
          if(!s.locked)saveCache(s);cacheAge=0;
          if(changed){if(userEditing())remoteDirty=true;else renderDynamic();}
        }
      }).catch(function(){if(LIVE){LIVE=false;updateSync();}})
      .finally(function(){setTimeout(syncLoop,delay);});
    }else setTimeout(syncLoop,delay);
  }
  syncLoop();
}
boot();
/* Offline shell: network-first SW. When online, behavior is identical to
   today; when the field signal drops, the app shell + assets still load. */
if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){});});}
