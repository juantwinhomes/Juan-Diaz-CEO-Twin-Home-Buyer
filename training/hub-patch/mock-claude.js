(function(){
  /* A test can hand over a snapshot (window.__MOCKSNAP, set by a later init script) so a reload never depends on sessionStorage timing. */
  var saved=null,store=new Map(),listeners=[],idc=0,ready=false;
  function boot(){if(ready)return;ready=true;var snap=window.__MOCKSNAP;try{saved=snap?snap.entries:JSON.parse(sessionStorage.getItem("mockdb")||"null");}catch(e){}
    store=new Map(saved||[]);idc=snap?snap.idc:+(sessionStorage.getItem("mockid")||0);seed();}
  function persist(){sessionStorage.setItem("mockdb",JSON.stringify(Array.from(store.entries())));sessionStorage.setItem("mockid",String(idc));}
  function cp(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function colOf(p){var a=p.split("/");a.pop();return a.join("/");}
  function docsIn(col){var out=[];store.forEach(function(v,k){if(colOf(k)===col)out.push({id:k.split("/").pop(),data:function(){return cp(v);}});});return out;}
  function notify(){listeners.slice().forEach(function(l){try{l();}catch(e){console.error(e);}});}
  function query(col,f,o,lim){f=f||[];var q={
    where:function(a,op,v){return query(col,f.concat([[a,op,v]]),o,lim);},
    orderBy:function(a,d){return query(col,f,[a,d||"asc"],lim);},
    limit:function(n){return query(col,f,o,n);},
    run:function(){var d=docsIn(col).filter(function(x){return f.every(function(c){var a=x.data()[c[0]];return c[1]===">="?a>=c[2]:c[1]==="=="?a===c[2]:true;});});
      if(o)d.sort(function(a,b){var x=a.data()[o[0]],y=b.data()[o[0]];return(x>y?1:x<y?-1:0)*(o[1]==="desc"?-1:1);});if(lim)d=d.slice(0,lim);return{docs:d,size:d.length,empty:!d.length};},
    get:async function(){return q.run();},
    onSnapshot:function(cb){var l=function(){cb(q.run());};listeners.push(l);setTimeout(l,0);return function(){};},
    add:async function(d){var id="a"+(++idc);store.set(col+"/"+id,cp(d));persist();notify();return{id:id};},
    doc:function(id){return ref(col+"/"+id);}};return q;}
  function ref(p){return{id:p.split("/").pop(),
    get:async function(){var v=store.get(p);return{exists:!!v,id:p.split("/").pop(),data:function(){return cp(v);}};},
    set:async function(d){store.set(p,cp(d));persist();notify();},
    update:async function(d){if(!store.has(p))throw new Error("not-found");store.set(p,Object.assign(store.get(p),cp(d)));persist();notify();},
    delete:async function(){store.delete(p);persist();notify();},
    onSnapshot:function(cb){var l=function(){var v=store.get(p);cb({exists:!!v,id:p.split("/").pop(),data:function(){return cp(v);}});};listeners.push(l);setTimeout(l,0);return function(){};}};}
  function seed(){if(!saved){store.set("roster/juan-diaz",{name:"Juan Diaz",role:"owner",title:"CEO",hash:"h",salt:"s"});
    store.set("roster/test-rep",{name:"Test Rep",role:"team",title:"Acquisitions",reportsTo:"Juan Diaz",hash:"h",salt:"s"});
    store.set("roster/other-rep",{name:"Other Rep",role:"team",title:"Acquisitions",hash:"h",salt:"s"});
    store.set("people/test-rep",{name:"Test Rep",trained:true});persist();}}
  var db={collection:function(p){return query(p);},doc:function(p){return ref(p);}};
  window.__snap=function(){boot();return{entries:Array.from(store.entries()),idc:idc};};
  window.__dump=function(){boot();var o={};store.forEach(function(v,k){o[k]=v;});return o;};
  window.claude={use:async function(n){boot();return n==="db"?db:n==="user"?{me:async function(){return{id:"u1",canEdit:true};},isOwner:function(){return true;},canEdit:function(){return true;}}:null;}};
})();
