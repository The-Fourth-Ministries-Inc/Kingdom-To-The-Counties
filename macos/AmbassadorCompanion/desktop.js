/* Loaded only from the signed application bundle, after the shared scripts. */
(function(){
  "use strict";
  function post(message){
    if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.workspace){
      window.webkit.messageHandlers.workspace.postMessage(message);
    }
  }
  function report(){
    var page=document.querySelector(".page.active");
    var id=page?(page.id||"").replace(/^page-/,""):"now";
    post({type:"navigation",page:id,parent:typeof PARENT!=="undefined"?(PARENT[id]||id):id});
  }
  document.documentElement.classList.add("k2c-macos");
  var pages=document.querySelectorAll(".page");
  var observer=new MutationObserver(report);
  for(var i=0;i<pages.length;i++){observer.observe(pages[i],{attributes:true,attributeFilter:["class"]});}
  window.print=function(){post({type:"print"});};
  window.K2CMac={
    navigate:function(id){
      if(!document.getElementById("page-"+id)||typeof show!=="function")return false;
      if(typeof pageId==="function"&&pageId()===id)return true;
      show(id);report();return true;
    },
    back:function(){history.back();},
    forward:function(){history.forward();},
    report:report
  };
  report();
})();
