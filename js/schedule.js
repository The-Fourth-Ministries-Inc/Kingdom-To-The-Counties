/* Leader-edited event times. Loaded before app-core; globals are read only
   when called. The last good schedule rides the existing offline board cache. */
var scDefaults=null,scDraft=null,scCounty="",scRev=0,scSaveId="",scBusy=false,scSnapshot="",scApplied="";
function scCopy(rows){return JSON.parse(JSON.stringify(rows));}
function scValidate(rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>60)return "The schedule must have 1–60 events.";
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    if(!r||!Number.isInteger(r.s)||!Number.isInteger(r.e)||r.s<0||r.e>1439||r.s>=r.e)
      return "Check the start and end time for "+((r&&r.name)||"event "+(i+1))+". The end must be later on the same day.";
    if(i&&r.s<rows[i-1].e)return r.name+" overlaps "+rows[i-1].name+". Adjust the times or shift the remaining events.";
  }
  return "";
}
function scApply(){
  if(!scDefaults)scDefaults=scCopy(SEGMENTS);
  var schedule=STATE.schedule,rows=(!STATE.locked&&schedule&&schedule.segments&&!scValidate(schedule.segments))?schedule.segments:scDefaults;
  var signature=JSON.stringify(rows);
  if(signature===scApplied)return;
  scApplied=signature;
  SEGMENTS.splice.apply(SEGMENTS,[0,SEGMENTS.length].concat(scCopy(rows)));
}
function scTime(mins){
  if(!Number.isInteger(mins))return "";
  return String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0");
}
function scMinutes(value){
  if(!/^\d{2}:\d{2}$/.test(value))return null;
  var parts=value.split(":"),h=Number(parts[0]),m=Number(parts[1]);
  return h<24&&m<60?h*60+m:null;
}
function scSource(){
  var s=STATE.schedule;
  if(!s||!s.segments)return "Original event schedule";
  return "Schedule updated"+(s.savedBy?" by "+s.savedBy:"")+(s.savedAt?" · "+new Date(s.savedAt).toLocaleString():"");
}
function scRenderBar(){
  var el=document.getElementById("scheduleBar");
  if(!el)return;
  if(scDraft){
    /* Polls/timers must not recreate focused time inputs. */
    if(STATE.county!==scCounty)scError("The event changed. Cancel and reopen the schedule for the selected event.");
    return;
  }
  el.innerHTML='<div class="scbar"><span class="wssrc">'+esc(scSource())+'</span>'+
    '<button class="iobtn" onclick="scEdit()">✏️ Edit schedule'+(LEADER?"":" 🔒")+'</button>'+
    (LEADER&&STATE.schedule&&STATE.schedule.segments?'<button class="iobtn" onclick="scRestore()"'+(scBusy?' disabled':'')+'>Restore original</button>':'')+
    '</div><p id="scheduleError" class="scerror" role="alert"></p>';
}
function scError(message){var el=document.getElementById("scheduleError");if(el)el.textContent=message||"";}
function scEdit(){
  if(scBusy)return;
  if(!LEADER){askPin(scEdit);return;}
  scApply();
  scDraft=scCopy(SEGMENTS);scCounty=STATE.county;scRev=Number(STATE.schedule&&STATE.schedule.rev)||0;
  scSaveId=uid();scSnapshot=JSON.stringify(scDraft);scBusy=false;
  scDrawEditor();
}
function scDrawEditor(){
  var el=document.getElementById("scheduleBar");
  el.innerHTML='<div class="sceditor"><div class="ioedbar"><button class="cancel" onclick="scCancel()">Cancel</button><button class="save" id="scheduleSave" onclick="scSave()">Save to everyone</button></div>'+
    '<p class="iohint">Editing '+esc((STATE.event&&STATE.event.name)||scCounty||"this event")+'. Changes sync to everyone with this update. Saving needs a connection. “From here” moves this event and everything after it.</p>'+
    '<p id="scheduleError" class="scerror" role="alert"></p>'+
    scDraft.map(function(r,i){return '<div class="scrow"><h4>'+esc(r.name)+'</h4><div class="sctimes">'+
      '<label>Start<input type="time" value="'+scTime(r.s)+'" oninput="scSetTime('+i+',\'s\',this.value)"></label>'+
      '<label>End<input type="time" value="'+scTime(r.e)+'" oninput="scSetTime('+i+',\'e\',this.value)"></label></div>'+
      '<label>Notes<input maxlength="200" value="'+esc(r.meta||"")+'" oninput="scSetNote('+i+',this.value)"></label>'+
      '<div class="scshift"><button onclick="scShift('+i+',-5)">From here −5 min</button><button onclick="scShift('+i+',5)">From here +5 min</button></div></div>';}).join("")+'</div>';
}
function scSetTime(i,field,value){scDraft[i][field]=scMinutes(value);scSaveId=uid();scError("");}
function scSetNote(i,value){scDraft[i].meta=value;scSaveId=uid();}
function scShift(index,delta){
  if(scBusy)return;
  var rows=scCopy(scDraft);
  for(var i=index;i<rows.length;i++){
    if(!Number.isInteger(rows[i].s)||!Number.isInteger(rows[i].e)){scError("Fill in the start and end times before shifting.");return;}
    rows[i].s+=delta;rows[i].e+=delta;
  }
  var error=scValidate(rows);if(error){scError(error);return;}
  scDraft=rows;scSaveId=uid();scDrawEditor();
}
function scCancel(){
  if(scBusy)return;
  if(JSON.stringify(scDraft)!==scSnapshot&&!confirm("Discard your schedule changes?"))return;
  scDraft=null;scRenderBar();
}
function scSave(){
  if(scBusy||!scDraft)return;
  if(!LEADER){askPin(scSave);return;}
  if(STATE.county!==scCounty){scError("The event changed. Cancel and reopen the schedule.");return;}
  var error=scValidate(scDraft);if(error){scError(error);return;}
  scSend(scCopy(scDraft),scCounty,scRev,scSaveId);
}
function scRestore(){
  if(!LEADER){askPin(scRestore);return;}
  if(scBusy||!confirm("Restore the original times for this event on everyone's phone?"))return;
  scSend(null,STATE.county,Number(STATE.schedule&&STATE.schedule.rev)||0,uid());
}
function scSend(rows,county,rev,saveId){
  if(!LIVE){scError("You're offline. Your edits are still here; reconnect before saving to everyone.");return;}
  scBusy=true;inflight++;
  scControls(true);
  var button=document.getElementById("scheduleSave");if(button){button.disabled=true;button.textContent="Saving…";}
  scError("");
  apiPost("setSchedule",{county:county,baseRev:rev,saveId:saveId,segments:rows,by:myTag()||"Leader"}).then(function(response){
    scBusy=false;inflight=Math.max(0,inflight-1);
    scControls(false);
    if(STATE.county===response.county){STATE.schedule=response.schedule;if(!STATE.locked)saveCache(STATE);}
    scDraft=null;lastEtag="";
    renderSpine();renderNow();renderStrip();
    toast(rows?"Schedule saved to everyone":"Original schedule restored");
  },function(error){
    scBusy=false;inflight=Math.max(0,inflight-1);
    scControls(false);
    if(button){button.disabled=false;button.textContent="Save to everyone";}
    if(!scDraft)scRenderBar();
    scError(error===409?"The event or schedule changed while you were editing. Your edits are kept. Cancel and reopen to get the latest schedule.":
      error===403?"Unlock with the leader PIN before saving. Your edits are kept.":
      error===400?"The server couldn't accept this schedule. Check the times and that the website is up to date.":
      "Couldn't reach the server. Your edits are kept; retry when connected.");
  });
}
function scControls(disabled){
  var el=document.getElementById("scheduleBar");
  if(el)el.querySelectorAll("input,button").forEach(function(control){control.disabled=disabled;});
}
