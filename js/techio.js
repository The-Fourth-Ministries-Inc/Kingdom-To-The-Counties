/* ===== Tech I/O — Lineup model (v1.21.0) =====
   Loaded BEFORE app-core.js: it only defines functions and data at load time,
   and app-core's boot calls renderIOList(). Everything it uses from app-core
   (STATE, esc, queueWrite, LEADER, askPin, toast, myTag, askName, nowLabel,
   apiPost, refreshFromServer, printDoc, csvCell, LIVE, everSynced, dayOK) is
   looked up at call time.

   The roster used to be a list of musician cards with the IEM mix stored as
   fields on each card, so "Split to mono" had to invent a new card for the
   right leg and never knew a spare pack was already listening. It is now four
   things that link to each other:

     Position ──person──▶ Person ◀──person── Pack ──▶ Transmitter (L/R/stereo) ──▶ Ark out / Aux
        └── inputs (AVB, Ark split, snake, NSB, console channels…)

   • Positions persist week to week (Lead Vox · Mic A, Acoustic 1, Drums…).
     Each event a leader picks who is on it, or switches it off.
   • People are just names. One person can hold several positions (Zach: Lead
     Vox, Acoustic 1, Talkback 1) and still has ONE pack and ONE mix, because
     the mix belongs to the pack, not the position.
   • Packs are the physical belt packs. Several can listen to one transmitter.
   • Transmitters are the eight Phenyx Pro units in the Ark. TX n always owns
     Ark outputs / Q-Mix aux 2n-1 & 2n — stereo uses both, dual-mono gives one
     to each leg — and its colour is the colour on its packs.

   Snake channels and NSB 32.16 inputs are NOT typed in: they are numbered
   contiguously, in snake order, over the inputs that are in use this event,
   so dropping the snare-bottom mic closes the gap instead of leaving a hole,
   and the tom / overhead mixdowns always quote the channels the mics are on. */

var IO_TX_COLORS=["#ED8B0B","#E23B2E","#79C24A","#9E6B33","#F2CB05","#9AA0A6","#7B3FF2","#2E7CD6"];
var IO_TX_NAMES=["Orange","Red","Green","Brown","Yellow","Grey","Purple","Blue"];
var IO_VIAS=[["split","Ark split"],["nsb","Stage box (NSB 32.16)"],["direct","Direct / network"],["mix","Mixdown from FOH"]];

function ioClone(o){return JSON.parse(JSON.stringify(o));}
function ioUid(){return "x"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

/* ---- built-in roster ----
   The starting point when there is no previous event and no saved Template.
   Reflects the 2026 rig: drums on the snake from channel 1, toms/overheads to
   NSB 32.16 inputs 1-5, mixdowns back from the StudioLive 32 on AVB 57/58. */
function ioIn(id,role,gear,o){
  var r={id:id,role:role,gear:gear||"",note:"",altNote:"",altGear:"",avb:"",foh:"",sc:"",split:"",port:"",via:"split",snake:false,mixOf:[],p48:false,stereo:false,on:true,done:false,by:"",t:""};
  for(var k in o)if(o.hasOwnProperty(k))r[k]=o[k];
  return r;
}
function ioPos(id,name,person,o,inputs){
  var p={id:id,name:name,person:person||"",active:true,iem:true,kind:"musician",inputs:inputs||[]};
  for(var k in o)if(o.hasOwnProperty(k))p[k]=o[k];
  return p;
}
function ioVox(id,mic,person,lead,avb,raw,sc){
  var role=lead?"Lead Vox":"Add'l Vox";
  return ioPos("vox-"+id,(lead?"Lead Vox":"Vox")+" · Mic "+mic,person,{},[
    ioIn("vox-"+id+"-tuned",role,"Wireless Mic "+mic+" (Tuned)",{avb:String(avb),split:String(avb),foh:String(avb),sc:String(avb),note:lead?"Primary Lead Vocalist":"Additional Tuned Vocals"}),
    ioIn("vox-"+id+"-raw",role+" (Raw split)","Wireless Mic "+mic+" (Raw)",{avb:String(raw),split:String(raw),sc:String(sc),note:"Uncorrected raw vocal split path"})
  ]);
}
var IO_RIG={
  v:1,rev:0,snakeSize:16,nsbStart:1,nsbAvb:40,
  positions:[
    ioVox("a","A","Zach",true,1,6,28),
    ioVox("b","B","Karielle",true,2,7,29),
    ioVox("c","C","Annie",false,3,8,30),
    ioVox("d","D","Mike",false,4,9,31),
    ioVox("e","E","Alissa",false,5,10,32),
    ioPos("vox-f","Vox · Mic F","",{active:false},[
      ioIn("vox-f-in","Add'l Vox","Wireless Mic F",{avb:"11",split:"11",foh:"6",sc:"6",note:"Additional vocals (untuned)"})]),
    ioPos("ag-1","Acoustic 1","Zach",{},[
      ioIn("ag1-di","Acoustic Guitar 1","1x Active DI",{avb:"21",split:"21",snake:true,foh:"18",sc:"18",note:"Acoustic path"})]),
    ioPos("ag-2","Acoustic 2","Steve",{},[
      ioIn("ag2-di","Acoustic Guitar 2","1x Active DI",{avb:"22",split:"22",snake:true,foh:"19",sc:"19",note:"Secondary acoustic line"})]),
    ioPos("bass","Bass","Sean",{},[
      ioIn("bass-di","Bass Guitar","1x Active DI / Modeler",{avb:"18",split:"18",snake:true,foh:"17",sc:"17",note:"Bass platform routing"})]),
    ioPos("eg","Electric Guitar","Brett",{},[
      ioIn("eg-l","Electric Guitar (L)","Stereo DI / Modeler (Left)",{avb:"19",split:"19",snake:true,foh:"13/14",sc:"13/14",stereo:true,note:"Guitar platform routing"}),
      ioIn("eg-r","Electric Guitar (R)","Stereo DI / Modeler (Right)",{avb:"20",split:"20",snake:true,foh:"13/14",sc:"13/14",stereo:true,note:"Guitar platform routing"})]),
    ioPos("keys","Keys","John",{},[
      ioIn("keys-l","Keys (L)","2x Stereo DI (Left)",{avb:"23",split:"23",snake:true,foh:"15/16",sc:"15/16",stereo:true,note:"Keyboard line"}),
      ioIn("keys-r","Keys (R)","2x Stereo DI (Right)",{avb:"24",split:"24",snake:true,foh:"15/16",sc:"15/16",stereo:true,note:"Keyboard line"})]),
    ioPos("drums","Drums","Kyle",{},[
      ioIn("kick","Kick Drum","Kick Mic",{avb:"25",split:"25",snake:true,foh:"20",sc:"20",note:"Hybrid drum mic setup"}),
      ioIn("snare-top","Snare Top","Snare Top Mic",{avb:"26",split:"26",snake:true,foh:"21",sc:"21",note:"Hybrid drum mic setup"}),
      ioIn("snare-bot","Snare Bottom","Snare Bottom Mic",{avb:"27",split:"27",snake:true,foh:"22",sc:"22",note:"Only when the kit has a bottom mic"}),
      ioIn("tom-1","Tom 1","Tom 1 Mic",{via:"nsb",snake:true,foh:"23",note:"Hybrid drum mic setup"}),
      ioIn("tom-2","Tom 2","Tom 2 Mic",{via:"nsb",snake:true,foh:"24",note:"Hybrid drum mic setup"}),
      ioIn("tom-3","Tom 3","Tom 3 Mic",{via:"nsb",snake:true,foh:"25",note:"Hybrid drum mic setup"}),
      ioIn("oh-l","Overhead (L)","Overhead (L) Condenser",{via:"nsb",snake:true,foh:"26",p48:true,note:"Hybrid drum mic setup"}),
      ioIn("oh-r","Overhead (R)","Overhead (R) Condenser",{via:"nsb",snake:true,foh:"27",p48:true,note:"Hybrid drum mic setup"}),
      ioIn("toms-mix","Toms – Mixdown","StudioLive 32 Aux 9",{via:"mix",avb:"57",sc:"23",mixOf:["tom-1","tom-2","tom-3"],note:"Mixed at FOH, sent to the 32SC over AVB"}),
      ioIn("oh-mix","Overheads – Mixdown","StudioLive 32 Aux 10",{via:"mix",avb:"58",sc:"24",mixOf:["oh-l","oh-r"],note:"Mixed at FOH, sent to the 32SC over AVB"})]),
    ioPos("tb-1","Talkback 1","Zach",{iem:false},[
      ioIn("tb-1-in","Stage Talkback","Wired TB 1",{avb:"14",split:"14",foh:"9",sc:"9",note:"Switched talkback mic"})]),
    ioPos("tb-2","Talkback 2","John",{iem:false},[
      ioIn("tb-2-in","Stage Talkback","Wired TB 2",{avb:"15",split:"15",foh:"10",sc:"10",note:"Switched talkback mic"})]),
    ioPos("tb-3","Talkback 3","Mike",{iem:false},[
      ioIn("tb-3-in","Stage Talkback","Wired TB 3",{avb:"16",split:"16",foh:"11",sc:"11",note:"Switched talkback mic"})]),
    ioPos("host-1","Host 1","Speaker Left",{iem:false,kind:"house"},[
      ioIn("host-1-in","Speaking Mic","Wireless Mic G",{avb:"12",split:"12",foh:"7",sc:"7",note:"Stage host mic 1"})]),
    ioPos("host-2","Host 2","Speaker Right",{iem:false,kind:"house"},[
      ioIn("host-2-in","Speaking Mic","Wireless Mic H",{avb:"13",split:"13",foh:"8",sc:"8",note:"Stage host mic 2"})]),
    ioPos("tb-tech","Tech Talkback","FOH",{iem:false,kind:"house"},[
      ioIn("tb-tech-in","Tech Talkback","Wired TB 4",{avb:"17",split:"17",foh:"12",sc:"12",note:"Switched talkback mic"})]),
    ioPos("playback","Playback","",{iem:false,kind:"playback"},[
      ioIn("tracks-l","Tracks (L)","Mac AVB CoreAudio Send",{via:"direct",port:"Personal MBP Network",avb:"33",foh:"Aux In 1",sc:"Aux In 1",stereo:true,altGear:"Mac AVB Digital Return",note:"MultiTracks playback stem (Left)",altNote:"Streamed to Aux In 1 to preserve main faders"}),
      ioIn("tracks-r","Tracks (R)","Mac AVB CoreAudio Send",{via:"direct",port:"Personal MBP Network",avb:"34",foh:"Aux In 1",sc:"Aux In 1",stereo:true,altGear:"Mac AVB Digital Return",note:"MultiTracks playback stem (Right)",altNote:"Streamed to Aux In 1 to preserve main faders"}),
      ioIn("click","Click","Mac AVB Digital Return",{via:"direct",port:"Personal MBP Network",avb:"35",sc:"Aux In 2 (L)",note:"Streamed to Aux In 2 to preserve main faders"}),
      ioIn("guide","Guide","Mac AVB Digital Return",{via:"direct",port:"Personal MBP Network",avb:"36",sc:"Aux In 2 (R)",note:"Streamed to Aux In 2 to preserve main faders"})]),
    ioPos("spotify","Spotify","",{iem:false,kind:"playback"},[
      ioIn("spotify-l","Spotify (L)","Laptop Audio",{via:"direct",port:"FOH Aux In",foh:"Aux In 2",stereo:true,note:"Walk-in music from Papa V's laptop"}),
      ioIn("spotify-r","Spotify (R)","Laptop Audio",{via:"direct",port:"FOH Aux In",foh:"Aux In 2",stereo:true,note:"Walk-in music from Papa V's laptop"})])
  ],
  snakeOrder:["kick","snare-top","snare-bot","tom-1","tom-2","tom-3","oh-l","oh-r","bass-di","ag1-di","ag2-di","eg-l","eg-r","keys-l","keys-r"],
  packs:[
    {id:"pack-1",label:"Pack 1 (Orange)",person:"Karielle",tx:1,leg:""},
    {id:"pack-extra",label:"\"Extra\" Pack",person:"",tx:1,leg:""},
    {id:"pack-2",label:"Pack 2 (Red)",person:"Zach",tx:2,leg:""},
    {id:"pack-3",label:"Pack 3 (Green)",person:"Annie",tx:3,leg:"L"},
    {id:"spare-1",label:"Spare Pack 1",person:"Alissa",tx:3,leg:"R"},
    {id:"pack-4",label:"Pack 4 (Brown)",person:"Mike",tx:4,leg:""},
    {id:"spare-2",label:"Spare Pack 2",person:"",tx:4,leg:""},
    {id:"pack-5",label:"Pack 5 (Yellow)",person:"Steve",tx:5,leg:"L"},
    {id:"spare-3",label:"Spare Pack 3",person:"Sean",tx:5,leg:"R"},
    {id:"pack-6",label:"Pack 6 (Grey)",person:"Brett",tx:6,leg:""},
    {id:"pack-7",label:"Pack 7 (Purple)",person:"John",tx:7,leg:""},
    {id:"pack-8",label:"Pack 8 (Blue)",person:"Kyle",tx:8,leg:""}
  ],
  txs:[
    {n:1,mode:"stereo",color:IO_TX_COLORS[0]},{n:2,mode:"stereo",color:IO_TX_COLORS[1]},
    {n:3,mode:"mono",color:IO_TX_COLORS[2]},{n:4,mode:"stereo",color:IO_TX_COLORS[3]},
    {n:5,mode:"mono",color:IO_TX_COLORS[4]},{n:6,mode:"stereo",color:IO_TX_COLORS[5]},
    {n:7,mode:"stereo",color:IO_TX_COLORS[6]},{n:8,mode:"stereo",color:IO_TX_COLORS[7]}
  ],
  /* The FOH board's own output buses — PA, stage fill, the drum mixdowns and
     the hardwired IEM sends. `src` links a bus to the input it arrives as, so
     the AVB number is written once. */
  buses:[
    {id:"bus-aux-1-2",bus:"Aux 1 & 2",sig:"Stereo Subgroup",dest:"NSB 32.16 - Output 1 & 2",hw:"Main Venue Subwoofers L/R",purpose:"Low-frequency system punch",src:""},
    {id:"bus-aux-3-4",bus:"Aux 3 & 4",sig:"Stereo Matrix Mix",dest:"NSB 32.16 - Output 3 & 4",hw:"Main Powered Speakers L/R",purpose:"Primary crowd PA coverage",src:""},
    {id:"bus-aux-5-6",bus:"Aux 5 & 6",sig:"Stereo Matrix Mix",dest:"NSB 32.16 - Output 5 & 6",hw:"Outfill Arena Amplifier L/R",purpose:"Extended side venue coverage",src:""},
    {id:"bus-aux-7-unused",bus:"Aux 7 - Unused",sig:"Stage Fill (L)",dest:"NSB 32.16 - Output 7",hw:"Stage Fill Speaker L",purpose:"",src:"",off:true},
    {id:"bus-aux-8-unused",bus:"Aux 8 - Unused",sig:"Stage Fill (R)",dest:"NSB 32.16 - Output 8",hw:"Stage Fill Speaker R",purpose:"",src:"",off:true},
    {id:"bus-aux-9",bus:"Aux 9",sig:"Toms - Mixdown",dest:"",hw:"None",purpose:"Save monitor mixer channels",src:"toms-mix"},
    {id:"bus-aux-10",bus:"Aux 10",sig:"Overheads - Mixdown",dest:"",hw:"None",purpose:"Save monitor mixer channels",src:"oh-mix"},
    {id:"bus-aux-11",bus:"Aux 11",sig:"Mono Auxiliary",dest:"NSB 32.16 - Output 11",hw:"Hardwired Mono IEM",purpose:"",src:""},
    {id:"bus-aux-12",bus:"Aux 12",sig:"Mono Auxiliary",dest:"NSB 32.16 - Output 12",hw:"Hardwired Mono IEM",purpose:"",src:""},
    {id:"bus-aux-13",bus:"Aux 13",sig:"Mono Auxiliary",dest:"NSB 32.16 - Output 13",hw:"Hardwired Mono IEM",purpose:"",src:""},
    {id:"bus-aux-14",bus:"Aux 14",sig:"Mono Auxiliary",dest:"NSB 32.16 - Output 14",hw:"Hardwired Mono IEM",purpose:"",src:""},
    {id:"bus-aux-15",bus:"Aux 15",sig:"Spares",dest:"NSB 32.16 - Output 15 & 16",hw:"Open Physical XLR Ports",purpose:"(Maybe) FOH IEM Packs",src:""},
    {id:"bus-aux-16",bus:"Aux 16",sig:"Spares",dest:"NSB 32.16 - Output 15 & 16",hw:"Open Physical XLR Ports",purpose:"(Maybe) FOH IEM Packs",src:""}
  ],
  people:["Zach","Karielle","Annie","Mike","Alissa","Steve","Sean","Brett","John","Kyle","Julian","Speaker Left","Speaker Right","FOH"]
};

/* ================= model: lookups & derived numbers ================= */

/* Make a rig safe to walk even if a field is missing. The server normalizes
   on write; this only guards against a half-built draft. */
function ioRigFix(rig){
  rig=rig||{};
  rig.positions=Array.isArray(rig.positions)?rig.positions:[];
  rig.positions.forEach(function(p){p.inputs=Array.isArray(p.inputs)?p.inputs:[];});
  rig.packs=Array.isArray(rig.packs)?rig.packs:[];
  rig.txs=Array.isArray(rig.txs)&&rig.txs.length?rig.txs:ioClone(IO_RIG.txs);
  rig.buses=Array.isArray(rig.buses)?rig.buses:[];
  rig.snakeOrder=Array.isArray(rig.snakeOrder)?rig.snakeOrder:[];
  rig.people=Array.isArray(rig.people)?rig.people:[];
  if(!(rig.snakeSize>0))rig.snakeSize=16;
  if(!(rig.nsbStart>0))rig.nsbStart=1;
  if(rig.nsbAvb==null||isNaN(Number(rig.nsbAvb)))rig.nsbAvb=40;
  return rig;
}
function ioInOn(p,r){return !!(p&&p.active&&r&&r.on!==false);}
function ioTx(rig,n){for(var i=0;i<rig.txs.length;i++)if(Number(rig.txs[i].n)===Number(n))return rig.txs[i];return null;}
function ioTxColor(rig,n){var t=ioTx(rig,n);return (t&&/^#[0-9a-fA-F]{6}$/.test(t.color||""))?t.color:(IO_TX_COLORS[n-1]||"#c7c2b8");}
function ioPosById(rig,id){for(var i=0;i<rig.positions.length;i++)if(rig.positions[i].id===id)return rig.positions[i];return null;}

/* One pass that answers every "what number is this on?" question. */
function ioDerive(rig){
  rig=ioRigFix(rig);
  var D={pos:{},inp:{},snake:{},nsb:{},snakeSeq:[],snakeUsed:0,nsbLast:0};
  rig.positions.forEach(function(p){p.inputs.forEach(function(r){D.pos[r.id]=p;D.inp[r.id]=r;});});
  /* Snake order: the saved order first, then any snake input that is not in
     it yet (a newly added one) in roster order. */
  var seen={},seq=[];
  rig.snakeOrder.forEach(function(id){if(D.inp[id]&&D.inp[id].snake&&D.inp[id].via!=="mix"&&!seen[id]){seen[id]=1;seq.push(id);}});
  rig.positions.forEach(function(p){p.inputs.forEach(function(r){if(r.snake&&r.via!=="mix"&&!seen[r.id]){seen[r.id]=1;seq.push(r.id);}});});
  D.snakeSeq=seq;
  var ch=0,nsb=Number(rig.nsbStart)||1,nsbN=0;
  seq.forEach(function(id){
    var r=D.inp[id];
    if(!ioInOn(D.pos[id],r))return;
    D.snake[id]=++ch;
    if(r.via==="nsb"){D.nsb[id]=nsb+nsbN;nsbN++;}
  });
  /* NSB inputs that skip the snake still get the next stage-box inputs. */
  rig.positions.forEach(function(p){p.inputs.forEach(function(r){
    if(r.via==="nsb"&&!r.snake&&ioInOn(p,r)){D.nsb[r.id]=nsb+nsbN;nsbN++;}
  });});
  D.snakeUsed=ch;D.nsbLast=nsbN?(nsb+nsbN-1):0;
  D.rig=rig;
  return D;
}
function ioAvbOf(D,r){
  if(r.via==="nsb"){var n=D.nsb[r.id];return n?String((Number(D.rig.nsbAvb)||0)+n):"";}
  return String(r.avb||"");
}
function ioAvbNum(D,r){var m=ioAvbOf(D,r).match(/(\d+)/);return m?parseInt(m[1],10):0;}
/* "4-6" for a contiguous run, "4, 6" otherwise. */
function ioRange(nums){
  nums=nums.filter(function(n){return n>0;}).sort(function(a,b){return a-b;});
  if(!nums.length)return "";
  var contiguous=true;
  for(var i=1;i<nums.length;i++)if(nums[i]!==nums[i-1]+1)contiguous=false;
  if(nums.length===1)return String(nums[0]);
  return contiguous?(nums[0]+"-"+nums[nums.length-1]):nums.join(", ");
}
function ioSnakeOf(D,r){
  if(r.via==="mix")return ioRange((r.mixOf||[]).map(function(id){return D.snake[id]||0;}));
  return D.snake[r.id]?String(D.snake[r.id]):"";
}
function ioNsbOf(D,r){
  if(r.via==="mix")return ioRange((r.mixOf||[]).map(function(id){return D.nsb[id]||0;}));
  return D.nsb[r.id]?String(D.nsb[r.id]):"";
}
/* Where the signal physically lands. */
function ioPatchOf(D,r){
  if(r.via==="split")return r.split?("Ark "+r.split):"";
  if(r.via==="nsb"){var n=D.nsb[r.id];return n?("NSB "+n):"";}
  if(r.via==="mix"){
    var names=(r.mixOf||[]).map(function(id){return D.inp[id]?D.inp[id].role:"";}).filter(Boolean);
    return names.length?("Mix of "+names.join(", ")):"Mixdown";
  }
  return r.port||"";
}
/* The one-line patch reference on a musician card: where to plug in on stage.
   AVB is network routing that lives in the Inputs table, so it stays off
   the card (v1.21.1). */
function ioLocStr(D,r){
  var bits=[],s=ioSnakeOf(D,r);
  if(s)bits.push("Snake "+s);
  if(r.via==="split"&&r.split)bits.push("Ark "+r.split);
  if(r.via==="nsb"&&D.nsb[r.id])bits.push("NSB "+D.nsb[r.id]);
  if(r.via==="direct"&&r.port)bits.push(r.port);
  return bits.join(" · ");
}

/* ---- IEM mixes ----
   TX n owns aux / Ark outputs 2n-1 and 2n. Stereo hands both to every pack
   on it; dual-mono gives the left one to its L packs and the right to R. */
function ioTxAux(n,leg){
  n=Number(n)||0;
  if(leg==="L")return [2*n-1];
  if(leg==="R")return [2*n];
  return [2*n-1,2*n];
}
function ioAuxLabel(nums){return nums.length>1?(nums[0]+" & "+nums[1]):String(nums[0]||"");}
function ioPacksOn(rig,n,leg){
  return rig.packs.filter(function(k){
    if(Number(k.tx)!==Number(n))return false;
    return leg==null?true:(k.leg||"")===leg;
  });
}
/* Every mix slot the transmitters currently provide. */
function ioMixes(rig){
  var out=[];
  rig.txs.slice().sort(function(a,b){return a.n-b.n;}).forEach(function(t){
    if(t.mode==="mono"){
      out.push({tx:t.n,leg:"L",aux:ioTxAux(t.n,"L"),packs:ioPacksOn(rig,t.n,"L")});
      out.push({tx:t.n,leg:"R",aux:ioTxAux(t.n,"R"),packs:ioPacksOn(rig,t.n,"R")});
    }else out.push({tx:t.n,leg:"",aux:ioTxAux(t.n,""),packs:ioPacksOn(rig,t.n,null)});
  });
  return out;
}
function ioPackMix(rig,k){
  var t=ioTx(rig,k.tx);
  if(!t)return null;
  var leg=t.mode==="mono"?(k.leg||""):"";
  return {tx:t.n,leg:leg,mode:t.mode,aux:t.mode==="mono"&&!leg?[]:ioTxAux(t.n,leg)};
}
function ioPackLabel(rig,k){
  var m=ioPackMix(rig,k);
  if(!m)return "No transmitter";
  var aux=m.aux.length?(" · Aux "+ioAuxLabel(m.aux)):" · pick L or R";
  return "TX "+m.tx+(m.leg?(" "+m.leg):"")+aux+(m.mode==="mono"?" · Mono":" · Stereo");
}
function ioSameName(a,b){return String(a||"").trim().toLowerCase()===String(b||"").trim().toLowerCase();}
function ioPacksOf(rig,name){return rig.packs.filter(function(k){return name&&ioSameName(k.person,name);});}

/* People on the roster this event, in roster order. */
function ioPeopleNow(rig){
  var out=[],seen={};
  rig.positions.forEach(function(p){
    var n=String(p.person||"").trim();
    if(!p.active||!n||seen[n.toLowerCase()])return;
    seen[n.toLowerCase()]=1;out.push(n);
  });
  return out;
}
/* Names to offer in the person pickers: this event plus everyone used before. */
function ioPeopleKnown(rig){
  var out=[],seen={};
  function add(n){n=String(n||"").trim();if(n&&!seen[n.toLowerCase()]){seen[n.toLowerCase()]=1;out.push(n);}}
  rig.positions.forEach(function(p){add(p.person);});
  rig.packs.forEach(function(k){add(k.person);});
  rig.people.forEach(add);
  return out;
}

/* ================= checks ================= */
/* Everything that would be wrong on stage, worded for the person fixing it.
   lvl "err" is a real conflict; "warn" is worth a look. */
function ioIssues(rig,D){
  rig=ioRigFix(rig);D=D||ioDerive(rig);
  var out=[];
  function err(m){out.push({lvl:"err",msg:m});}
  function warn(m){out.push({lvl:"warn",msg:m});}
  var live=[];
  rig.positions.forEach(function(p){p.inputs.forEach(function(r){if(ioInOn(p,r))live.push({p:p,r:r});});});
  function label(e){return (e.p.person?(e.p.person+" – "):"")+(e.r.role||e.p.name);}
  /* Same number used twice. Stereo L/R inputs in one position legitimately
     share a console channel ("13/14"), and so do sources on one aux input. */
  function dupes(name,get,allowPair){
    var by={};
    live.forEach(function(e){var v=String(get(e)||"").trim();if(v)(by[v]=by[v]||[]).push(e);});
    Object.keys(by).forEach(function(v){
      var g=by[v];if(g.length<2)return;
      if(allowPair&&g.every(function(e){return e.r.stereo&&e.p===g[0].p;}))return;
      err(name+" "+v+" is used by "+g.map(label).join(" and "));
    });
  }
  dupes("AVB",function(e){return ioAvbOf(D,e.r);},false);
  dupes("Ark split",function(e){return e.r.via==="split"?e.r.split:"";},false);
  dupes("FOH ch",function(e){return e.r.foh;},true);
  dupes("32SC ch",function(e){return e.r.sc;},true);
  if(D.snakeUsed>(Number(rig.snakeSize)||16))err("The snake needs "+D.snakeUsed+" channels but has "+rig.snakeSize);
  if(D.nsbLast>32)err("Stage-box inputs run past NSB 32 (to "+D.nsbLast+") — start them lower");
  live.forEach(function(e){
    if(e.r.via==="mix"){
      var on=(e.r.mixOf||[]).filter(function(id){return D.inp[id]&&ioInOn(D.pos[id],D.inp[id]);});
      if(!on.length)warn(label(e)+" mixes nothing that is in use this event");
    }
  });
  /* IEM: every musician needs exactly one mix, and a mix is one person's. */
  ioPeopleNow(rig).forEach(function(name){
    var needs=rig.positions.some(function(p){return p.active&&p.iem&&ioSameName(p.person,name);});
    var ks=ioPacksOf(rig,name);
    if(needs&&!ks.length)err(name+" has no IEM pack");
    var mixes={};
    ks.forEach(function(k){var m=ioPackMix(rig,k);if(m)mixes[m.tx+(m.leg||"")]=1;});
    if(Object.keys(mixes).length>1)warn(name+" has packs on "+Object.keys(mixes).length+" different mixes");
  });
  rig.positions.forEach(function(p){
    if(p.active&&p.kind==="musician"&&!String(p.person||"").trim())warn(p.name+" has nobody on it — switch it off or pick someone");
  });
  var nowNames=ioPeopleNow(rig);
  rig.packs.forEach(function(k){
    var m=ioPackMix(rig,k);
    if(!m){if(k.person)err(k.label+" ("+k.person+") is not on a transmitter");return;}
    if(m.mode==="mono"&&!m.leg)err(k.label+" is on TX "+m.tx+", which is dual-mono — pick L or R");
    if(k.person&&!nowNames.some(function(n){return ioSameName(n,k.person);}))warn(k.label+" is assigned to "+k.person+", who isn't on any position this event");
  });
  ioMixes(rig).forEach(function(mx){
    var names={};
    mx.packs.forEach(function(k){if(k.person)names[String(k.person).trim().toLowerCase()]=k.person;});
    var list=Object.keys(names).map(function(x){return names[x];});
    if(list.length>1)err(list.join(" and ")+" would hear the same mix (TX "+mx.tx+(mx.leg?(" "+mx.leg):"")+", Aux "+ioAuxLabel(mx.aux)+")");
  });
  return out;
}

/* ================= operations on a draft ================= */
/* Stereo -> dual-mono. Packs already on the transmitter keep their place:
   the first one takes L and the rest take R, so splitting Mike's TX 4 puts
   Mike on Aux 7 and Spare Pack 2 on Aux 8 instead of inventing a new line. */
function ioTxSplit(rig,n){
  var t=ioTx(rig,n);if(!t||t.mode==="mono")return;
  t.mode="mono";
  ioPacksOn(rig,n).forEach(function(k,i){k.leg=i===0?"L":"R";});
}
/* Dual-mono -> stereo. Returns the names that will now share one mix so the
   caller can say so before it happens. */
function ioTxMergeClash(rig,n){
  var names={};
  ioPacksOn(rig,n).forEach(function(k){if(k.person)names[String(k.person).trim().toLowerCase()]=k.person;});
  var list=Object.keys(names).map(function(x){return names[x];});
  return list.length>1?list:[];
}
function ioTxMerge(rig,n){
  var t=ioTx(rig,n);if(!t||t.mode!=="mono")return;
  t.mode="stereo";
  ioPacksOn(rig,n).forEach(function(k){k.leg="";});
}
/* A saved roster never carries the editor's idea of the checkmarks: the
   server's current tick state wins for every input that still exists. */
function ioMergeChecks(next,cur){
  var done={};
  if(cur&&cur.positions)cur.positions.forEach(function(p){(p.inputs||[]).forEach(function(r){done[r.id]=r;});});
  next.positions.forEach(function(p){(p.inputs||[]).forEach(function(r){
    var c=done[r.id];
    r.done=!!(c&&c.done);r.by=c&&c.done?(c.by||""):"";r.t=c&&c.done?(c.t||""):"";
  });});
  return next;
}
function ioClearChecks(rig){
  if(rig&&rig.positions)rig.positions.forEach(function(p){(p.inputs||[]).forEach(function(r){r.done=false;r.by="";r.t="";});});
  return rig;
}
function ioSetCheck(rig,iid,done,by,t){
  var hit=false;
  if(rig&&rig.positions)rig.positions.forEach(function(p){(p.inputs||[]).forEach(function(r){
    if(r.id===iid){hit=true;r.done=!!done;r.by=done?by:"";r.t=done?t:"";}
  });});
  return hit;
}
function ioCounts(rig){
  var d=0,t=0;
  if(rig&&rig.positions)rig.positions.forEach(function(p){(p.inputs||[]).forEach(function(r){
    if(!ioInOn(p,r))return;t++;if(r.done)d++;
  });});
  return {done:d,total:t};
}
/* What the app shows: the event's saved roster, else the built-in one. */
function ioCurrent(){
  return ioRigFix((typeof STATE!=="undefined"&&STATE.rig&&STATE.rig.positions)?STATE.rig:ioClone(IO_RIG));
}

/* ================= export ================= */
function ioInputRows(rig,D,all){
  var rows=[];
  rig.positions.forEach(function(p){p.inputs.forEach(function(r){if(all||ioInOn(p,r))rows.push({p:p,r:r});});});
  rows.sort(function(a,b){return (ioAvbNum(D,a.r)||9999)-(ioAvbNum(D,b.r)||9999);});
  return rows;
}
function ioCsvRows(rig){
  rig=ioRigFix(ioClone(rig));var D=ioDerive(rig);
  var rows=[["AVB","Snake","Patch","Position","Person","Role / instrument","Mic / hardware","48V","FOH ch (SL32)","32SC ch","Notes"]];
  ioInputRows(rig,D,false).forEach(function(e){
    rows.push([ioAvbOf(D,e.r),ioSnakeOf(D,e.r),ioPatchOf(D,e.r),e.p.name,e.p.person||"",e.r.role||"",e.r.gear||"",e.r.p48?"48V":"",e.r.foh||"",e.r.sc||"",e.r.note||""]);
  });
  rows.push([]);
  rows.push(["Transmitter","Leg","Aux / Ark out","Pack","Person"]);
  ioMixes(rig).forEach(function(m){
    var ks=m.packs.length?m.packs:[{label:"",person:""}];
    ks.forEach(function(k){rows.push(["TX "+m.tx,m.leg||"Stereo",ioAuxLabel(m.aux),k.label||"",k.person||""]);});
  });
  return rows;
}

/* ================= view state ================= */
var ioView="cards";        /* cards | inputs | outputs | lineup (edit only) */
var ioConsole="all";       /* all | foh | sc */
var ioEditing=false,ioDraft=null,ioDraftBase=0,ioDraftSnap="",ioOpenIn="",ioRestoreOpen=false,ioSeedSentFor=null;

function ioSetView(v){ioView=v;ioOpenIn="";renderIOList();}
function ioSetConsole(v){ioConsole=v;renderIOList();}

/* A new event has no roster of its own yet. Ask the server to start one —
   it copies the previous event's (or the Template, or this built-in) and
   clears the checkmarks. Once per county per session; harmless if another
   phone got there first. */
function ioMaybeSeed(){
  if(typeof STATE==="undefined"||STATE.rig||!LIVE||!everSynced||!dayOK())return;
  var key=STATE.county||"-";
  if(ioSeedSentFor===key)return;
  ioSeedSentFor=key;
  queueWrite("rigSeed",{seed:ioClone(IO_RIG)},function(){},function(){});
}

/* ================= rendering ================= */
function ioChip(label,color,cls){
  var c=/^#[0-9a-fA-F]{6}$/.test(color||"")?color:"#c7c2b8";
  if(!label)return '<span class="chip '+(cls||"")+' none">no pack</span>';
  return '<span class="chip '+(cls||"")+'" style="background:'+esc(c)+';color:'+ioInk(c)+'">'+esc(label)+'</span>';
}
/* Pack colours run from yellow to purple, so pick the label ink by
   brightness — white on the yellow pack is unreadable. */
function ioInk(hex){
  var m=/^#([0-9a-f]{6})$/i.exec(String(hex||""));
  if(!m)return "#3a352d";
  var n=parseInt(m[1],16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return (r*299+g*587+b*114)/1000>150?"#2b2721":"#fff";
}
/* Labelled <td> so a stacked edit card can show the column name. */
function ioCell(cls,label,html){
  return '<td'+(cls?(' class="'+cls+'"'):"")+(label?(' data-label="'+esc(label)+'"'):"")+'>'+html+'</td>';
}
function ioBox(){return '<span class="box"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 6"/></svg></span>';}
function ioStamp(r){return (r.done&&r.by)?'<span class="iostamp">✓ '+esc(r.by)+(r.t?(" · "+esc(r.t)):"")+'</span>':"";}

function ioViewBar(){
  var tabs=[["cards","👤 Musicians"],["inputs","🎚 Inputs"],["outputs","🎧 Outputs"]];
  if(ioEditing)tabs.unshift(["lineup","✏️ Lineup"]);
  return '<div class="ioviews" role="tablist">'+tabs.map(function(t){
    return '<button role="tab" aria-selected="'+(ioView===t[0])+'" class="'+(ioView===t[0]?"on":"")+'" onclick="ioSetView(\''+t[0]+'\')">'+t[1]+'</button>';
  }).join("")+'</div>';
}
function ioIssuesNote(rig,D){
  var is=ioIssues(rig,D);
  if(!is.length)return "";
  var errs=is.filter(function(x){return x.lvl==="err";}),warns=is.filter(function(x){return x.lvl!=="err";});
  var head=errs.length?("⚠ "+errs.length+" thing"+(errs.length===1?"":"s")+" to fix"):("ℹ "+warns.length+" thing"+(warns.length===1?"":"s")+" to check");
  return '<div class="ioclash'+(errs.length?"":" stale")+'"><b>'+head+'</b><ul>'+
    errs.concat(warns).map(function(x){return '<li'+(x.lvl==="err"?"":' class="w"')+'>'+esc(x.msg)+'</li>';}).join("")+'</ul>'+
    (ioEditing?'<span>Fix these in the Lineup and Inputs tabs, then Save.</span>':(LEADER?'<span>Tap ✏️ Edit to fix.</span>':'<span>A leader can fix these in Edit.</span>'))+'</div>';
}
function ioFromNote(rig){
  var f=rig.from;
  if(!f||!f.kind)return "";
  var what=f.kind==="last"?("Started from "+(f.name||"the previous event")+"'s roster"):(f.kind==="template"?"Started from the saved Template":"Started from the built-in roster");
  return '<p class="iohint">'+esc(what)+(rig.savedBy?(" · last saved by "+esc(rig.savedBy)):"")+'</p>';
}
function ioToolsBar(rig){
  var c=ioCounts(rig);
  var prog='<span class="prog"><b>'+c.done+'</b> / '+c.total+' inputs patched &amp; checked</span>';
  if(ioEditing){
    return '<div class="ioedbar"><button class="cancel" onclick="ioCancelEdit()">Cancel</button>'+
      '<button class="save" onclick="ioSaveEdit()">✓ Save</button></div>';
  }
  var lead=LEADER?'':'<span class="lk">🔒</span>';
  var tools='<span class="ioacts">'+
    '<button class="iobtn" onclick="ioStartEdit()">✏️ Edit'+lead+'</button>'+
    '<button class="iobtn" onclick="ioPrint()">🖨 Print</button>'+
    '<button class="iobtn" onclick="ioCsv()">⬇ CSV</button>'+
    (LEADER?'<button class="iobtn" onclick="ioClearAll()">🧹 Clear checkmarks</button>'+
      '<button class="iobtn" onclick="ioTemplateSave()">💾 Save as Template</button>'+
      '<button class="iobtn reload" onclick="ioRestoreToggle()">↺ Restore…</button>':'')+
    '</span>';
  var restore=(LEADER&&ioRestoreOpen)?'<div class="iorestore"><b>Replace this event\'s roster with…</b>'+
    '<button class="iobtn" onclick="ioRestore(\'last\')">Last event\'s roster</button>'+
    '<button class="iobtn" onclick="ioRestore(\'template\')">The saved Template</button>'+
    '<button class="iobtn" onclick="ioRestore(\'builtin\')">The built-in roster</button>'+
    '<span>Clears this event\'s checkmarks. A backup of the current roster is saved first.</span></div>':"";
  return '<div class="iobar">'+prog+tools+'</div>'+restore;
}

/* ---- Musicians: one card per person, holding every position they're on ---- */
function ioRenderCards(rig,D){
  var cards=[],used={};
  function rowsFor(ps){
    return ps.map(function(p){
      var ins=p.inputs.filter(function(r){return ioInOn(p,r);});
      if(!ins.length)return "";
      return (ps.length>1?'<div class="iosub">'+esc(p.name)+'</div>':"")+ins.map(function(r){
        var prim=r.role||r.gear,sec=r.role?r.gear:"",loc=ioLocStr(D,r);
        return '<div class="iorow'+(r.done?' done':'')+' tap" onclick="ioToggle(\''+esc(r.id)+'\')">'+ioBox()+
          '<span class="w"><b>'+esc(prim)+'</b>'+(sec?'<span>'+esc(sec)+'</span>':'')+ioStamp(r)+'</span>'+
          (loc?'<span class="loc">'+esc(loc)+'</span>':'')+'</div>';
      }).join("");
    }).join("");
  }
  /* The header is the collapse toggle. A collapsed card keeps who / pack /
     mix in view and adds the patch count, so a tech can fold away the
     people who are done and see what is left. */
  ioCardKeys=[];
  function card(key,head,ps){
    var done=0,total=0;
    ps.forEach(function(p){p.inputs.forEach(function(r){if(ioInOn(p,r)){total++;if(r.done)done++;}});});
    var shut=!!ioShut[key],i=ioCardKeys.push(key)-1;
    var cnt=total?'<span class="iocnt'+(done===total?' ok':'')+'">'+(done===total?"✓ ":"")+done+' / '+total+'</span>':'';
    return '<div class="ioperf'+(shut?' shut':'')+'"><button type="button" class="ph" aria-expanded="'+(!shut)+'" onclick="ioCardToggle('+i+')">'+
      head+cnt+'<span class="iochev" aria-hidden="true">▾</span></button>'+(shut?'':rowsFor(ps))+'</div>';
  }
  ioPeopleNow(rig).forEach(function(name){
    var ps=rig.positions.filter(function(p){return p.active&&ioSameName(p.person,name);});
    ps.forEach(function(p){used[p.id]=1;});
    var ks=ioPacksOf(rig,name),needs=ps.some(function(p){return p.iem;});
    var chips=ks.length?ks.map(function(k){return ioChip(k.label,ioTxColor(rig,k.tx),"");}).join(""):(needs?'<span class="chip none">no pack</span>':"");
    var mix=ks.length?ioPackMix(rig,ks[0]):null;
    var txLine=ks.length?'<span class="iotx">'+esc(ioPackLabel(rig,ks[0]))+'</span>':(needs?'<span class="iotx bad">Needs an IEM pack</span>':'');
    var qx=(mix&&mix.aux.length)?'<span class="qx">Aux '+esc(ioAuxLabel(mix.aux))+'</span>':'';
    cards.push(card("p:"+name.trim().toLowerCase(),chips+'<span class="pn">'+esc(name)+
      '<small>'+esc(ps.map(function(p){return p.name;}).join(" · "))+'</small>'+txLine+'</span>'+qx,ps));
  });
  /* Positions with nobody named (playback, an unstaffed station). */
  rig.positions.forEach(function(p){
    if(!p.active||used[p.id]||String(p.person||"").trim())return;
    cards.push(card("x:"+p.id,'<span class="pn">'+esc(p.name)+'</span>',[p]));
  });
  var off=rig.positions.filter(function(p){return !p.active;});
  var spare=rig.packs.filter(function(k){return !String(k.person||"").trim();});
  var foot="";
  if(spare.length)foot+='<div class="ioperf off"><div class="ph"><span class="pn">Spare packs<small>Not handed out</small></span></div><div class="iospare">'+
    spare.map(function(k){return ioChip(k.label,ioTxColor(rig,k.tx),"sm")+'<span class="iotx">'+esc(ioPackLabel(rig,k))+'</span>';}).join("")+'</div></div>';
  if(off.length)foot+='<div class="ioperf off"><div class="ph"><span class="pn">Not used this event<small>'+esc(off.map(function(p){return p.name;}).join(" · "))+'</small></span></div></div>';
  var bar='<div class="iofilter"><span>Cards</span><button onclick="ioCardsAll(true)">Collapse all</button><button onclick="ioCardsAll(false)">Expand all</button></div>';
  return bar+'<div class="iocards">'+cards.join("")+foot+'</div>';
}
/* Which cards this phone has folded away. A per-viewer convenience, so it
   lives in this browser only and the page works without it. */
var ioShut={},ioCardKeys=[];
try{ioShut=JSON.parse(localStorage.getItem("k2c_io_shut")||"{}")||{};}catch(_){ioShut={};}
function ioShutSave(){try{localStorage.setItem("k2c_io_shut",JSON.stringify(ioShut));}catch(_){}}
function ioCardToggle(i){
  var k=ioCardKeys[i];if(!k)return;
  if(ioShut[k])delete ioShut[k];else ioShut[k]=1;
  ioShutSave();renderIOList();
}
function ioCardsAll(shut){
  ioCardKeys.forEach(function(k){if(shut)ioShut[k]=1;else delete ioShut[k];});
  ioShutSave();renderIOList();
}

/* ---- Inputs: the routing sheet, sorted by AVB ---- */
function ioRenderInputs(rig,D,ed){
  var rows=ioInputRows(rig,D,ed);
  if(!ed){
    if(ioConsole==="foh")rows=rows.filter(function(e){return !!e.r.foh;});
    if(ioConsole==="sc")rows=rows.filter(function(e){return !!e.r.sc;});
  }
  var showFoh=ed||ioConsole!=="sc",showSc=ed||ioConsole!=="foh";
  var head='<tr><th class="c stick">'+(ed?"":"✓")+'</th><th class="stick2">AVB</th><th>Snake</th><th>Patch</th>'+
    '<th>Position · person</th><th>Role / instrument</th><th>Mic / hardware</th><th class="c">48V</th><th>Notes</th>'+
    (showFoh?"<th>FOH ch</th>":"")+(showSc?"<th>32SC ch</th>":"")+"</tr>";
  var ncol=9+(showFoh?1:0)+(showSc?1:0);
  var body=rows.map(function(e){
    var p=e.p,r=e.r,on=ioInOn(p,r);
    var lead=ed?'<button class="ioedit" onclick="ioOpenRow(\''+esc(r.id)+'\')" aria-label="Edit input">✎</button>':ioBox();
    var tap=(!ed)?' onclick="ioToggle(\''+esc(r.id)+'\')"':"";
    var tr='<tr class="'+(r.done&&!ed?"done":"")+(ed?(on?"":" off"):" tap")+(ioOpenIn===r.id?" open":"")+'"'+tap+'>'+
      ioCell("c stick","",lead)+
      ioCell("num k stick2","AVB",ioAvbOf(D,r)?("AVB "+esc(ioAvbOf(D,r))):"—")+
      ioCell("num","Snake",esc(ioSnakeOf(D,r)||"—"))+
      ioCell("sm","Patch",esc(ioPatchOf(D,r)||"—"))+
      ioCell("","Position","<b>"+esc(p.person||p.name)+"</b>"+(p.person?'<span class="alt">'+esc(p.name)+'</span>':"")+(ed?"":ioStamp(r)))+
      ioCell("","Role / instrument",esc(r.role||"—")+(ed&&!on?'<span class="alt">not used this event</span>':""))+
      ioCell("sm","Mic / hardware",esc(r.gear||"—")+(r.altGear?'<span class="alt">32SC: '+esc(r.altGear)+'</span>':""))+
      ioCell("c","48V",r.p48?'<span class="p48">48V</span>':"")+
      ioCell("sm note","Notes",esc(r.note||"")+(r.altNote?'<span class="alt">32SC: '+esc(r.altNote)+'</span>':""))+
      (showFoh?ioCell("num","FOH ch",esc(r.foh||"—")+(r.stereo?'<span class="alt">stereo pair</span>':"")):"")+
      (showSc?ioCell("num","32SC ch",esc(r.sc||"—")):"")+'</tr>';
    if(ed&&ioOpenIn===r.id)tr+='<tr class="ioformrow"><td colspan="'+ncol+'">'+ioInputForm(rig,D,p,r)+'</td></tr>';
    return tr;
  }).join("");
  var hidden=0;
  if(!ed)rig.positions.forEach(function(p){p.inputs.forEach(function(r){if(!ioInOn(p,r))hidden++;});});
  var bar=ed?'<div class="ioaddbar"><select id="ioAddPos" class="iopick">'+rig.positions.map(function(p){
      return '<option value="'+esc(p.id)+'">'+esc(p.name+(p.person?(" · "+p.person):""))+'</option>';}).join("")+
      '</select><button class="iobtn" onclick="ioAddInput()">＋ Add input</button></div>'
    :'<div class="iofilter"><span>Console</span>'+[["all","All"],["foh","FOH (SL32)"],["sc","Monitors (32SC)"]].map(function(o){
      return '<button class="'+(ioConsole===o[0]?"on":"")+'" onclick="ioSetConsole(\''+o[0]+'\')">'+o[1]+'</button>';}).join("")+'</div>';
  var foot=ed?'<p class="iofoot">Tap ✎ to edit an input. Snake and NSB numbers are worked out from the snake order in the Lineup tab, so they never need typing.</p>'
    :'<p class="iofoot">'+rows.length+' inputs'+(ioConsole==="all"?"":" on this console")+(hidden?(" · "+hidden+" not used this event"):"")+' · sorted by AVB. Tap a row to check it off as patched.</p>';
  return bar+'<div class="iotable"><table class="iotbl wide"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+foot;
}

/* The editor for one input, opened under its row. Text fields write straight
   into the draft without re-rendering (so the keyboard stays put); choices
   that change what else is shown re-render. */
function ioInputForm(rig,D,p,r){
  var id=esc(r.id);
  function txt(field,label,cls,dis){
    return '<label class="iofield '+(cls||"")+'"><span>'+label+'</span><input value="'+esc(String(r[field]==null?"":r[field]))+'"'+(dis?' disabled':'')+' oninput="ioInSet(\''+id+'\',\''+field+'\',this.value)"></label>';
  }
  function chk(field,label,val){
    return '<label class="io48"><input type="checkbox"'+(val?" checked":"")+' onchange="ioInFlag(\''+id+'\',\''+field+'\',this.checked)">'+label+'</label>';
  }
  var posSel='<label class="iofield grow"><span>Position</span><select class="iopick" onchange="ioInMove(\''+id+'\',this.value)">'+
    rig.positions.map(function(q){return '<option value="'+esc(q.id)+'"'+(q===p?" selected":"")+'>'+esc(q.name+(q.person?(" · "+q.person):""))+'</option>';}).join("")+'</select></label>';
  var viaSel='<label class="iofield"><span>Patched via</span><select class="iopick" onchange="ioInVia(\''+id+'\',this.value)">'+
    IO_VIAS.map(function(v){return '<option value="'+v[0]+'"'+(r.via===v[0]?" selected":"")+'>'+v[1]+'</option>';}).join("")+'</select></label>';
  var route="";
  if(r.via==="split")route=txt("split","Ark split","w")+txt("avb","AVB","w");
  else if(r.via==="nsb")route='<label class="iofield w"><span>NSB in</span><input value="'+esc(ioNsbOf(D,r)||"—")+'" disabled></label>'+
    '<label class="iofield w"><span>AVB</span><input value="'+esc(ioAvbOf(D,r)||"—")+'" disabled></label>';
  else if(r.via==="direct")route=txt("port","Source / port","grow")+txt("avb","AVB","w");
  else{
    var sibs=p.inputs.filter(function(q){return q.id!==r.id&&q.via!=="mix";});
    route=txt("avb","AVB","w")+'<div class="iofield grow"><span>Mix of</span><div class="iomixof">'+(sibs.length?sibs.map(function(q){
      var on=(r.mixOf||[]).indexOf(q.id)>=0;
      return '<label class="io48"><input type="checkbox"'+(on?" checked":"")+' onchange="ioInMixOf(\''+id+'\',\''+esc(q.id)+'\',this.checked)">'+esc(q.role||q.gear||"input")+'</label>';
    }).join(""):'<em>Add the mics to this position first</em>')+'</div></div>';
  }
  var snake=(r.via==="split"||r.via==="nsb")?chk("snake","Rides the snake",r.snake):"";
  return '<div class="ioform">'+posSel+txt("role","Role / instrument","grow")+txt("gear","Mic / hardware","grow")+txt("note","Notes","grow")+
    viaSel+route+txt("foh","FOH ch","w")+txt("sc","32SC ch","w")+
    '<div class="ioflags">'+snake+chk("p48","48V",r.p48)+chk("stereo","Stereo pair",r.stereo)+chk("on","Used this event",r.on!==false)+'</div>'+
    '<div class="ioformacts"><button class="iobtn reload" onclick="ioDelInput(\''+id+'\')">Delete input</button><button class="iobtn" onclick="ioOpenRow(\'\')">Done</button></div></div>';
}

/* ---- Outputs: the Ark's IEM transmitters and the FOH buses ---- */
function ioRenderOutputs(rig,D,ed){
  var mixes=ioMixes(rig),used=0;
  mixes.forEach(function(m){if(m.packs.length)used+=m.aux.length;});
  var rows=rig.txs.slice().sort(function(a,b){return a.n-b.n;}).map(function(t){
    var legs=t.mode==="mono"?["L","R"]:[""];
    var act=ed?(t.mode==="mono"
      ?'<button class="iomode up" onclick="ioTxMergeUI('+t.n+')">← Back to stereo</button>'
      :'<button class="iomode" onclick="ioTxSplitUI('+t.n+')">Split to mono →</button>'):"";
    return legs.map(function(leg,li){
      var ks=ioPacksOn(rig,t.n,t.mode==="mono"?leg:null);
      var aux=ioTxAux(t.n,leg);
      var who=ks.length?ks.map(function(k){return ioChip(k.label,ioTxColor(rig,k.tx),"sm")+' <b'+(k.person?"":' class="open"')+'>'+esc(k.person||"not handed out")+'</b>';}).join("<br>"):'<b class="open">nobody</b>';
      return '<tr class="'+(t.mode==="mono"?"mo":"st")+'">'+
        ioCell("num k stick","Mix","Aux "+esc(ioAuxLabel(aux)))+
        ioCell("num","Ark out",esc(ioAuxLabel(aux)))+
        ioCell("sm","Transmitter",'<span class="ioswatch" style="background:'+esc(ioTxColor(rig,t.n))+'"></span>IEM Transmitter '+t.n+(leg?(" ("+leg+")"):""))+
        ioCell("","Packs",who)+
        ioCell("c","Mode",'<span class="iomodetag '+(t.mode==="mono"?"mo":"st")+'">'+(t.mode==="mono"?("Mono "+leg):"Stereo")+'</span>'+(li===0?act:""))+'</tr>';
    }).join("");
  }).join("");
  var mixIns=[];
  rig.positions.forEach(function(p){p.inputs.forEach(function(r){if(r.via==="mix")mixIns.push(r);});});
  var buses=rig.buses.map(function(b,bi){
    var linked=b.src&&D.inp[b.src]?D.inp[b.src]:null;
    var dest=linked?("AVB "+(ioAvbOf(D,linked)||"?")+" → "+linked.role):(b.dest||"—");
    if(ed){
      function f(field,ph){return '<input value="'+esc(b[field]||"")+'" placeholder="'+esc(ph)+'" oninput="ioBusSet('+bi+',\''+field+'\',this.value)">';}
      var srcSel='<select class="iopick" onchange="ioBusSet('+bi+',\'src\',this.value);renderIOList()"><option value="">— a physical output —</option>'+
        mixIns.map(function(r){return '<option value="'+esc(r.id)+'"'+(b.src===r.id?" selected":"")+'>Feeds '+esc(r.role)+'</option>';}).join("")+'</select>';
      return '<tr class="ed">'+ioCell("num k stick","Bus",f("bus","Bus"))+ioCell("","Signal",f("sig","Signal"))+
        ioCell("","Patch destination",srcSel+(linked?'<span class="alt">'+esc(dest)+'</span>':f("dest","Patch destination")))+
        ioCell("","Hardware",f("hw","Hardware"))+ioCell("","Purpose",f("purpose","Purpose"))+'</tr>';
    }
    return '<tr class="'+(b.off?"off":"")+'">'+ioCell("num k stick","Bus",esc(b.bus))+ioCell("","Signal",esc(b.sig||"—"))+
      ioCell("sm","Patch destination",esc(dest))+ioCell("sm","Hardware",esc(b.hw||"—"))+ioCell("sm","Purpose",esc(b.purpose||""))+'</tr>';
  }).join("");
  var editCls=ed?" editing":"";
  return '<div class="iosec"><h3>🎧 Ark IEM transmitters (32R outputs)</h3>'+
    '<p class="iohint">'+used+' of 16 outputs feeding packs · TX n always uses outputs '+'2n-1 &amp; 2n.'+
    (ed?" Split a transmitter to give its two outputs to two packs; the packs already on it are kept."
       :" Packs and people are set in ✏️ Edit → Lineup.")+'</p>'+
    '<div class="iotable"><table class="iotbl out"><thead><tr><th class="stick">Mix</th><th>Ark out</th><th>Transmitter</th><th>Packs</th><th class="c">Mode</th></tr></thead>'+
    '<tbody>'+rows+'</tbody></table></div></div>'+
    '<div class="iosec"><h3>🔊 FOH buses (StudioLive 32 → NSB 32.16)</h3>'+
    '<p class="iohint">The house system and drum mixdowns — not personal mixes.</p>'+
    '<div class="iotable'+editCls+'"><table class="iotbl out'+editCls+'"><thead><tr><th class="stick">Bus</th><th>Signal</th><th>Patch destination</th><th>Hardware</th><th>Purpose</th></tr></thead>'+
    '<tbody>'+buses+'</tbody></table></div></div>';
}

/* ---- Lineup (edit only): who is on what, packs, transmitters, snake ---- */
function ioRenderLineup(rig,D){
  var dl='<datalist id="ioPeopleDL">'+ioPeopleKnown(rig).map(function(n){return '<option value="'+esc(n)+'">';}).join("")+'</datalist>';
  var pos=rig.positions.map(function(p,i){
    return '<div class="iolurow'+(p.active?"":" off")+'">'+
      '<span class="iomv"><button onclick="ioPosMove('+i+',-1)" aria-label="Move up">▲</button><button onclick="ioPosMove('+i+',1)" aria-label="Move down">▼</button></span>'+
      '<label class="iofield grow"><span>Position</span><input value="'+esc(p.name)+'" oninput="ioPosSet('+i+',\'name\',this.value)" onchange="ioSoft()"></label>'+
      '<label class="iofield grow"><span>Person</span><input list="ioPeopleDL" value="'+esc(p.person||"")+'" placeholder="Nobody" oninput="ioPosSet('+i+',\'person\',this.value)" onchange="ioSoft()"></label>'+
      '<span class="ioflags"><label class="io48"><input type="checkbox"'+(p.active?" checked":"")+' onchange="ioPosSet('+i+',\'active\',this.checked);renderIOList()">Used this event</label>'+
      '<label class="io48"><input type="checkbox"'+(p.iem?" checked":"")+' onchange="ioPosSet('+i+',\'iem\',this.checked);renderIOList()">Needs IEM</label></span>'+
      '<span class="iocount">'+p.inputs.length+' input'+(p.inputs.length===1?"":"s")+'</span>'+
      '<button class="iodel" onclick="ioPosDel('+i+')" aria-label="Delete position">✕</button></div>';
  }).join("");
  var txOpts=function(sel){
    return '<option value="0"'+(!sel?" selected":"")+'>— none —</option>'+rig.txs.slice().sort(function(a,b){return a.n-b.n;}).map(function(t){
      return '<option value="'+t.n+'"'+(Number(sel)===t.n?" selected":"")+'>TX '+t.n+' ('+(IO_TX_NAMES[t.n-1]||"")+(t.mode==="mono"?", mono":"")+')</option>';}).join("");
  };
  var packs=rig.packs.map(function(k,i){
    var t=ioTx(rig,k.tx),mono=t&&t.mode==="mono";
    return '<div class="iolurow">'+ioChip(k.label||"Pack",ioTxColor(rig,k.tx),"sm")+
      '<label class="iofield"><span>Pack</span><input value="'+esc(k.label)+'" oninput="ioPackSet('+i+',\'label\',this.value)" onchange="ioSoft()"></label>'+
      '<label class="iofield grow"><span>Person</span><input list="ioPeopleDL" value="'+esc(k.person||"")+'" placeholder="Not handed out" oninput="ioPackSet('+i+',\'person\',this.value)" onchange="ioSoft()"></label>'+
      '<label class="iofield"><span>Transmitter</span><select class="iopick" onchange="ioPackSet('+i+',\'tx\',Number(this.value));renderIOList()">'+txOpts(k.tx)+'</select></label>'+
      (mono?'<label class="iofield w"><span>Leg</span><select class="iopick" onchange="ioPackSet('+i+',\'leg\',this.value);renderIOList()"><option value="">—</option><option value="L"'+(k.leg==="L"?" selected":"")+'>L</option><option value="R"'+(k.leg==="R"?" selected":"")+'>R</option></select></label>':"")+
      '<span class="iocount">'+esc(ioPackLabel(rig,k))+'</span>'+
      '<button class="iodel" onclick="ioPackDel('+i+')" aria-label="Delete pack">✕</button></div>';
  }).join("");
  var txs=rig.txs.slice().sort(function(a,b){return a.n-b.n;}).map(function(t){
    var mono=t.mode==="mono";
    function who(leg){var ks=ioPacksOn(rig,t.n,leg);return ks.length?ks.map(function(k){return esc(k.label)+(k.person?(" – "+esc(k.person)):"");}).join(", "):"nobody";}
    return '<div class="iolurow">'+
      '<label class="iofield w"><span>Colour</span><input type="color" value="'+esc(ioTxColor(rig,t.n))+'" onchange="ioTxSet('+t.n+',\'color\',this.value);renderIOList()"></label>'+
      '<span class="iotxname"><b>TX '+t.n+'</b><span>'+(mono?("L: Aux "+(2*t.n-1)+" — "+who("L")+"<br>R: Aux "+(2*t.n)+" — "+who("R")):("Aux "+(2*t.n-1)+" &amp; "+(2*t.n)+" — "+who(null)))+'</span></span>'+
      (mono?'<button class="iomode up" onclick="ioTxMergeUI('+t.n+')">← Back to stereo</button>':'<button class="iomode" onclick="ioTxSplitUI('+t.n+')">Split to mono →</button>')+'</div>';
  }).join("");
  var snake=D.snakeSeq.map(function(iid,i){
    var r=D.inp[iid],p=D.pos[iid],on=ioInOn(p,r);
    return '<div class="iolurow snk'+(on?"":" off")+'">'+
      '<span class="iomv"><button onclick="ioSnakeMove(\''+esc(iid)+'\',-1)" aria-label="Move up">▲</button><button onclick="ioSnakeMove(\''+esc(iid)+'\',1)" aria-label="Move down">▼</button></span>'+
      '<span class="iosnk">'+(on?D.snake[iid]:"—")+'</span>'+
      '<span class="iotxname"><b>'+esc(r.role||r.gear)+'</b><span>'+esc(p.name)+(r.via==="nsb"&&on?(" · NSB "+D.nsb[iid]+" · AVB "+ioAvbOf(D,r)):"")+(on?"":" · not used — skipped")+'</span></span>'+
      '<label class="io48"><input type="checkbox"'+(r.on!==false?" checked":"")+' onchange="ioInFlag(\''+esc(iid)+'\',\'on\',this.checked);renderIOList()">Used</label></div>';
  }).join("");
  return dl+
    '<div class="iosec"><h3>🎤 Positions</h3><p class="iohint">The stage roles. Pick who is on each one this event, or untick <b>Used this event</b>. One person can hold several positions — they still get one pack.</p>'+
      '<div class="iolu">'+pos+'</div><button class="ioaddperf" onclick="ioPosAdd()">＋ Add a position</button></div>'+
    '<div class="iosec"><h3>🎧 Packs</h3><p class="iohint">The belt packs. The colour comes from the transmitter. Leave Person empty for a spare that isn\'t handed out.</p>'+
      '<div class="iolu">'+packs+'</div><button class="ioaddperf" onclick="ioPackAdd()">＋ Add a pack</button></div>'+
    '<div class="iosec"><h3>📡 Transmitters</h3><p class="iohint">Split to mono when there are more musicians than stereo mixes. The first pack on the unit keeps L; the others move to R.</p>'+
      '<div class="iolu">'+txs+'</div></div>'+
    '<div class="iosec"><h3>🐍 Snake &amp; stage box</h3><p class="iohint">Channels are numbered in this order, skipping anything not used, so unused ports end up at the end.</p>'+
      '<div class="iolurow"><label class="iofield w"><span>Snake channels</span><input type="number" min="1" max="64" value="'+esc(String(rig.snakeSize))+'" onchange="ioRigSet(\'snakeSize\',Number(this.value)||16);renderIOList()"></label>'+
      '<label class="iofield w"><span>First NSB input</span><input type="number" min="1" max="32" value="'+esc(String(rig.nsbStart))+'" onchange="ioRigSet(\'nsbStart\',Number(this.value)||1);renderIOList()"></label>'+
      '<span class="ioquick"><button class="iobtn" onclick="ioRigSet(\'nsbStart\',1);renderIOList()">Start at NSB 1</button><button class="iobtn" onclick="ioRigSet(\'nsbStart\',12);renderIOList()">Start at NSB 12</button></span>'+
      '<label class="iofield w"><span>AVB = NSB in +</span><input type="number" min="0" max="200" value="'+esc(String(rig.nsbAvb))+'" onchange="ioRigSet(\'nsbAvb\',Number(this.value)||0);renderIOList()"></label>'+
      '<span class="iocount">'+D.snakeUsed+' of '+esc(String(rig.snakeSize))+' snake channels used'+(D.nsbLast?(" · NSB "+rig.nsbStart+"-"+D.nsbLast):"")+'</span></div>'+
      '<div class="iolu">'+(snake||'<p class="iohint">No inputs are on the snake. Tick <b>Rides the snake</b> on an input to add it.</p>')+'</div></div>';
}

function renderIOList(){
  var mount=document.getElementById("ioMount");
  if(!mount)return;
  if(!ioEditing)ioMaybeSeed();
  var rig=ioEditing?ioRigFix(ioDraft):ioCurrent(),D=ioDerive(rig);
  if(!ioEditing&&ioView==="lineup")ioView="cards";
  var top=ioViewBar()+ioToolsBar(rig)+(ioEditing?"":ioFromNote(rig))+'<div id="ioIssues">'+ioIssuesNote(rig,D)+'</div>';
  var body;
  if(ioView==="lineup")body=ioRenderLineup(rig,D);
  else if(ioView==="inputs")body=ioRenderInputs(rig,D,ioEditing);
  else if(ioView==="outputs")body=ioRenderOutputs(rig,D,ioEditing);
  else body=ioRenderCards(rig,D);
  mount.innerHTML=top+body+'<div id="ioPrint" class="ioprint" aria-hidden="true"></div>';
}

/* Typing a name changes no layout — refresh only the issue list and the
   people picker, so focus and Tab order survive. */
function ioSoft(){
  var rig=ioRigFix(ioDraft),el=document.getElementById("ioIssues"),dl=document.getElementById("ioPeopleDL");
  if(el)el.innerHTML=ioIssuesNote(rig,ioDerive(rig));
  if(dl)dl.innerHTML=ioPeopleKnown(rig).map(function(n){return '<option value="'+esc(n)+'">';}).join("");
}

/* ================= actions ================= */
/* Patch checkmarks: open to every tech behind the Day PIN. */
function ioToggle(iid){
  var init=myTag();
  if(!init){askName(function(){ioToggle(iid);});return;}
  var had=!!(STATE.rig&&STATE.rig.positions);
  var rig=ioCurrent(),cur=null;
  rig.positions.forEach(function(p){p.inputs.forEach(function(r){if(r.id===iid&&ioInOn(p,r))cur=r;});});
  if(!cur)return;
  var done=!cur.done,t=nowLabel();
  var payload={iid:iid,done:done,by:init,t:t};
  if(!had)payload.seed=ioClone(IO_RIG);
  queueWrite("rigCheck",payload,function(){ioSetCheck(rig,iid,done,init,t);STATE.rig=rig;},function(){renderIOList();renderDashboard();});
}
function ioStartEdit(){
  if(!LEADER){askPin(function(){ioStartEdit();});return;}
  var cur=ioCurrent();
  ioDraft=ioClone(cur);ioDraftSnap=JSON.stringify(ioDraft);ioDraftBase=Number(cur.rev)||0;ioEditing=true;ioOpenIn="";ioRestoreOpen=false;
  ioView="lineup";
  renderIOList();
}
function ioCancelEdit(){
  if(ioDraft&&JSON.stringify(ioDraft)!==ioDraftSnap&&!confirm("Discard your unsaved changes to the lineup and routing?"))return;
  ioEditing=false;ioDraft=null;ioOpenIn="";if(ioView==="lineup")ioView="cards";renderIOList();
}
function ioSaveEdit(){
  var rig=ioRigFix(ioDraft),D=ioDerive(rig);
  var errs=ioIssues(rig,D).filter(function(x){return x.lvl==="err";});
  if(errs.length&&!confirm(errs.length+" thing"+(errs.length===1?"":"s")+" still need fixing (listed at the top). Save anyway?"))return;
  /* Remember everyone who has been on the roster so they stay pickable. */
  rig.people=ioPeopleKnown(rig).slice(0,80);
  function commit(){
    var by=myTag()||"Leader";
    ioEditing=false;ioDraft=null;ioOpenIn="";if(ioView==="lineup")ioView="cards";
    queueWrite("rigSave",{rig:rig,by:by},function(){
      var next=ioMergeChecks(ioClone(rig),STATE.rig);
      next.rev=(Number(ioDraftBase)||0)+1;next.savedBy=by;next.from=(STATE.rig&&STATE.rig.from)||rig.from||null;
      STATE.rig=next;
    },function(){renderIOList();renderDashboard();});
    toast("Lineup saved");
  }
  /* Two leaders editing at once: check for a newer save before ours lands. */
  if(LIVE){
    refreshFromServer().then(function(){
      var rev=Number(STATE.rig&&STATE.rig.rev)||0;
      if(rev!==ioDraftBase&&!confirm("Someone else saved the lineup"+(STATE.rig&&STATE.rig.savedBy?(" ("+STATE.rig.savedBy+")"):"")+" while you were editing. Save yours over theirs?"))return;
      commit();
    });
  }else commit();
}
function ioClearAll(){
  if(!LEADER){askPin(ioClearAll);return;}
  if(!confirm("Clear every patch checkmark for this event? The lineup and routing stay as they are."))return;
  queueWrite("rigClearChecks",{},function(){if(STATE.rig)ioClearChecks(STATE.rig);},function(){renderIOList();renderDashboard();});
}
function ioTemplateSave(){
  if(!LEADER){askPin(ioTemplateSave);return;}
  if(!LIVE){toast("You're offline — saving the Template needs a connection.");return;}
  if(!STATE.rig){toast("Save this event's lineup first, then make it the Template.");return;}
  if(!confirm("Make this event's saved lineup the Template? New events start from the previous event, and Restore can bring the Template back any time."))return;
  apiPost("rigTemplateSave",{by:myTag()||"Leader"}).then(function(){toast("Template saved");}).catch(function(e){if(e!==403)toast("Couldn't save the Template — try again.");});
}
function ioRestoreToggle(){ioRestoreOpen=!ioRestoreOpen;renderIOList();}
function ioRestore(from){
  if(!LEADER){askPin(function(){ioRestore(from);});return;}
  if(!LIVE){toast("You're offline — restoring needs a connection.");return;}
  var what=from==="last"?"the previous event's roster":(from==="template"?"the saved Template":"the built-in roster");
  if(!confirm("Replace this event's lineup and routing with "+what+"? This clears this event's checkmarks. A backup is saved first."))return;
  var p={from:from,by:myTag()||"Leader"};
  if(from==="builtin")p.seed=ioClone(IO_RIG);
  apiPost("rigRestore",p).then(function(){
    ioRestoreOpen=false;toast("Restored "+what);
    return refreshFromServer();
  }).catch(function(e){
    if(e===404)toast(from==="last"?"No earlier event has a saved roster yet.":"No Template has been saved yet.");
    else if(e!==403)toast("Couldn't restore — try again.");
  });
}

/* ---- draft editing ---- */
function ioDraftInput(iid){
  var hit=null;
  ioDraft.positions.forEach(function(p){p.inputs.forEach(function(r){if(r.id===iid)hit={p:p,r:r};});});
  return hit;
}
function ioOpenRow(iid){ioOpenIn=iid;renderIOList();}
function ioInSet(iid,field,val){var e=ioDraftInput(iid);if(e)e.r[field]=val;}
function ioInFlag(iid,field,on){var e=ioDraftInput(iid);if(e)e.r[field]=!!on;if(field!=="p48")renderIOList();}
function ioInVia(iid,via){
  var e=ioDraftInput(iid);if(!e)return;
  e.r.via=via;
  if(via==="mix"){e.r.snake=false;e.r.mixOf=e.r.mixOf||[];}
  if(via==="direct")e.r.snake=false;
  renderIOList();
}
function ioInMixOf(iid,src,on){
  var e=ioDraftInput(iid);if(!e)return;
  var m=(e.r.mixOf||[]).filter(function(x){return x!==src;});
  if(on)m.push(src);
  e.r.mixOf=m;renderIOList();
}
function ioInMove(iid,toPid){
  var e=ioDraftInput(iid),to=ioPosById(ioDraft,toPid);
  if(!e||!to||to===e.p)return;
  e.p.inputs.splice(e.p.inputs.indexOf(e.r),1);
  to.inputs.push(e.r);
  renderIOList();
}
function ioDelInput(iid){
  var e=ioDraftInput(iid);if(!e)return;
  if(!confirm("Delete "+(e.r.role||"this input")+" from "+e.p.name+"?"))return;
  e.p.inputs.splice(e.p.inputs.indexOf(e.r),1);
  ioDraft.snakeOrder=ioDraft.snakeOrder.filter(function(x){return x!==iid;});
  ioDraft.positions.forEach(function(p){p.inputs.forEach(function(r){if(r.mixOf)r.mixOf=r.mixOf.filter(function(x){return x!==iid;});});});
  ioDraft.buses.forEach(function(b){if(b.src===iid)b.src="";});
  ioOpenIn="";renderIOList();
}
function ioAddInput(){
  var sel=document.getElementById("ioAddPos"),p=ioPosById(ioDraft,sel?sel.value:"");
  if(!p)return;
  var r=ioIn(ioUid(),"","",{});
  p.inputs.push(r);ioOpenIn=r.id;renderIOList();
}
function ioPosSet(i,field,val){var p=ioDraft.positions[i];if(p)p[field]=val;}
function ioPosMove(i,d){
  var a=ioDraft.positions,j=i+d;if(j<0||j>=a.length)return;
  var t=a[i];a[i]=a[j];a[j]=t;renderIOList();
}
function ioPosAdd(){
  var name=prompt("Name of the new position (e.g. Saxophone, Vox · Mic G)");
  if(!name)return;
  ioDraft.positions.push(ioPos(ioUid(),name.slice(0,60),"",{},[]));
  renderIOList();
}
function ioPosDel(i){
  var p=ioDraft.positions[i];if(!p)return;
  var msg=p.inputs.length?("Delete "+p.name+" and its "+p.inputs.length+" input"+(p.inputs.length===1?"":"s")+"? To keep it for later, untick Used this event instead."):("Delete "+p.name+"?");
  if(!confirm(msg))return;
  var gone={};p.inputs.forEach(function(r){gone[r.id]=1;});
  ioDraft.positions.splice(i,1);
  ioDraft.snakeOrder=ioDraft.snakeOrder.filter(function(x){return !gone[x];});
  ioDraft.positions.forEach(function(q){q.inputs.forEach(function(r){if(r.mixOf)r.mixOf=r.mixOf.filter(function(x){return !gone[x];});});});
  ioDraft.buses.forEach(function(b){if(gone[b.src])b.src="";});
  renderIOList();
}
function ioPackSet(i,field,val){
  var k=ioDraft.packs[i];if(!k)return;
  k[field]=val;
  if(field==="tx"){var t=ioTx(ioDraft,val);k.leg=(t&&t.mode==="mono")?(ioPacksOn(ioDraft,val,"L").length?"R":"L"):"";}
}
function ioPackAdd(){ioDraft.packs.push({id:ioUid(),label:"Spare Pack",person:"",tx:0,leg:""});renderIOList();}
function ioPackDel(i){
  var k=ioDraft.packs[i];if(!k)return;
  if(!confirm("Remove "+(k.label||"this pack")+(k.person?(" ("+k.person+")"):"")+" from the roster?"))return;
  ioDraft.packs.splice(i,1);renderIOList();
}
function ioTxSet(n,field,val){var t=ioTx(ioDraft,n);if(t)t[field]=val;}
function ioTxSplitUI(n){ioTxSplit(ioDraft,n);renderIOList();}
function ioTxMergeUI(n){
  var clash=ioTxMergeClash(ioDraft,n);
  if(clash.length&&!confirm(clash.join(" and ")+" would all hear one stereo mix on TX "+n+". Move one of them to another pack first, or continue?"))return;
  ioTxMerge(ioDraft,n);renderIOList();
}
function ioSnakeMove(iid,d){
  var D=ioDerive(ioDraft),seq=D.snakeSeq.slice(),i=seq.indexOf(iid),j=i+d;
  if(i<0||j<0||j>=seq.length)return;
  var t=seq[i];seq[i]=seq[j];seq[j]=t;
  ioDraft.snakeOrder=seq;renderIOList();
}
function ioRigSet(field,val){ioDraft[field]=val;}
function ioBusSet(bi,field,val){var b=ioDraft.buses[bi];if(b)b[field]=val;}

/* ---- print & CSV (everyone can view, so everyone can export) ---- */
function ioPrint(){
  var rig=ioCurrent(),D=ioDerive(rig),el=document.getElementById("ioPrint");
  if(!el)return;
  var ev=(STATE.event&&STATE.event.name)||"";
  var ins=ioInputRows(rig,D,false).map(function(e){
    return '<tr><td class="ck"></td><td>'+esc(ioAvbOf(D,e.r))+'</td><td>'+esc(ioSnakeOf(D,e.r))+'</td><td>'+esc(ioPatchOf(D,e.r))+'</td><td>'+esc(e.p.person||e.p.name)+'</td><td>'+esc(e.r.role)+
      '</td><td>'+esc(e.r.gear)+'</td><td>'+(e.r.p48?"48V":"")+'</td><td>'+esc(e.r.foh)+'</td><td>'+esc(e.r.sc)+'</td></tr>';
  }).join("");
  var outs=ioMixes(rig).map(function(m){
    return '<tr><td>TX '+m.tx+(m.leg?(" "+m.leg):"")+'</td><td>'+esc(ioAuxLabel(m.aux))+'</td><td>'+(m.leg?"Mono":"Stereo")+'</td><td>'+
      (m.packs.map(function(k){return esc(k.label)+(k.person?(" — "+esc(k.person)):" — spare");}).join("<br>")||"—")+'</td></tr>';
  }).join("");
  el.innerHTML='<h2>Input List'+(ev?(" · "+esc(ev)):"")+'</h2>'+
    '<table><thead><tr><th>✓</th><th>AVB</th><th>Snake</th><th>Patch</th><th>Who</th><th>Role</th><th>Mic / hardware</th><th>48V</th><th>FOH</th><th>32SC</th></tr></thead><tbody>'+ins+'</tbody></table>'+
    '<h2>IEM packs</h2><table><thead><tr><th>Transmitter</th><th>Aux / out</th><th>Mode</th><th>Packs</th></tr></thead><tbody>'+outs+'</tbody></table>';
  printDoc("techio");
}
function ioCsv(){
  var csv=ioCsvRows(ioCurrent()).map(function(r){return r.map(csvCell).join(",");}).join("\r\n");
  var blob=new Blob(["﻿"+csv],{type:"text/csv"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="k2c-input-list-"+((STATE.county||"event")+"-"+new Date().toISOString().slice(0,10))+".csv";
  document.body.appendChild(a);a.click();a.remove();
}
