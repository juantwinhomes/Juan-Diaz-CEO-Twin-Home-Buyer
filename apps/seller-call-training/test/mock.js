(function(){
  var store=new Map(),listeners=[],idc=0,ready=false,saved=null;
  function boot(){if(ready)return;ready=true;var snap=window.__MOCKSNAP;if(snap){store=new Map(snap.entries);idc=snap.idc;}else seed();}
  function seed(){[["juan-diaz","Juan Diaz","owner","Founder & CEO"],["vanessa-miller","Vanessa Miller","team","Lead Reactivation"],["cherry-burce","Cherry Burce","team","COO"],["thea-margate","Thea Margate","team","Lead Manager"],["other-rep","Other Rep","team","Acquisitions"]].forEach(function(r){store.set("roster/"+r[0],{name:r[1],role:r[2],title:r[3],salt:"s",hash:"ebec7b09aa75d343fe3e2df50edd6e5a74e892ffb69c873b3a38757a27a9fae5"});});store.set("roster/vanessa-miller",Object.assign({},store.get("roster/vanessa-miller"),{salt2:"t",hash2:"4b1f932b7f128e6d7ceaeb72ff0266de9d1c0f31531581ca89b72c841bc21cdd"}));}
  function cp(v){return v==null?v:JSON.parse(JSON.stringify(v));}
  function colOf(p){var a=p.split("/");a.pop();return a.join("/");}
  function docsIn(col){var out=[];store.forEach(function(v,k){if(colOf(k)===col)out.push({id:k.split("/").pop(),data:function(){return cp(v);}});});return out;}
  function notify(){listeners.slice().forEach(function(l){try{l();}catch(e){console.error(e);}});}
  function query(col){var q={run:function(){var d=docsIn(col);return{docs:d,size:d.length,empty:!d.length};},
    get:async function(){return q.run();},onSnapshot:function(cb){var l=function(){cb(q.run());};listeners.push(l);setTimeout(l,0);return function(){};},
    add:async function(d){var id="a"+(++idc);store.set(col+"/"+id,cp(d));notify();return{id:id};},doc:function(id){return ref(col+"/"+id);}};return q;}
  function ref(p){return{id:p.split("/").pop(),get:async function(){var v=store.get(p);return{exists:!!v,id:p.split("/").pop(),data:function(){return cp(v);}};},
    set:async function(d){store.set(p,cp(d));notify();},update:async function(d){store.set(p,Object.assign(store.get(p)||{},cp(d)));notify();},delete:async function(){store.delete(p);notify();}};}
  var db={collection:function(p){boot();return query(p);},doc:function(p){boot();return ref(p);}};
  function rep(prompt){var m=prompt.split("TRANSCRIPT:")[1]||prompt.split("THE CALL SO FAR:")[1]||"";return m.split("\n").filter(function(l){return l.indexOf("REP (")===0;}).join("\n");}
  var sample={json:async function(p){window.__samples=(window.__samples||0)+1;
    if(p.indexOf("You grade a practice")===0){var r=rep(p);var ok=/according to/i.test(r)&&/15-minute/i.test(r)&&/Juan/.test(r)&&!/\$\s?\d/.test(r);
      return{checks:["price","source","visit","honest","pressure","story"].map(function(k){return{rule:k,ok:k==="price"?!/\$\s?\d/.test(r):ok,note:"stub"};}),feedback:ok?"Good call.":"Book the visit with Juan and don't give a number."};}
    var last=rep(p).split("\n").pop()||"";return{reply:/15-minute/.test(last)?"Okay, Tuesday at 10 works. Bye.":"Hmm, why should I?",ended:/15-minute/.test(last)};}};
  window.__snap=function(){boot();return{entries:Array.from(store.entries()),idc:idc};};
  window.__dump=function(){boot();var o={};store.forEach(function(v,k){o[k]=v;});return o;};
  window.claude={use:async function(n){boot();return n==="db"?db:n==="user"?{me:async function(){return{id:"u1",canEdit:true};}}:n==="sample"?sample:null;}};
})();
