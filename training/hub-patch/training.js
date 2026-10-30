/* ---------- training modules (Training tab) ---------- */
/* Module 1 is built only from Gemini's notes of Juan's Oct 19, 2026 session. Each section shows the lines from the notes it came from.
   Every quiz attempt is its own record in training_attempts (name, time, score, missed questions). All answers right = cleared to go live. */
var MODULES=[__MODULE_JSON__];
var modAns={},modTried={},modFlash=null,modBusy=false,tAttempts=[],tLoaded=false,tWho="all";
function mergeAttempts(docs){docs.forEach(function(d){var v=Object.assign({},d.data()||{});v.id=d.id;var i=-1;tAttempts.forEach(function(x,j){if(x.id===v.id)i=j;});if(i<0)tAttempts.push(v);else tAttempts[i]=v;});tLoaded=true;}
function loadAttempts(){if(!db)return Promise.resolve();return withTimeout(db.collection("training_attempts").get(),10000).then(function(s){mergeAttempts((s&&s.docs)||[]);}).catch(function(){});}
function attemptsOf(sl,mid){return tAttempts.filter(function(x){return x.slug===sl&&x.module===mid;}).sort(function(a,b){return a.ts-b.ts;});}
function modState(sl,mid){var at=attemptsOf(sl,mid),p=((people[sl]||{}).training||{})[mid]||{},pass=at.filter(function(x){return x.passed;})[0];
  return{tries:Math.max(at.length,p.attempts||0),passed:!!(pass||p.passed),passedAt:pass?pass.ts:(p.passedAt||null),passTry:pass?pass.attempt:(p.passTry||null),last:at.length?at[at.length-1]:null,best:at.reduce(function(n,x){return Math.max(n,x.score||0);},0)};}
function modsOpen(){return MODULES.filter(function(m){return!modState(me.slug,m.id).passed;}).length;}
function modLine(sl){var s=modState(sl,"m1");return s.passed?'<div class="small green">Module 1 passed · cleared to go live</div>':'<div class="small red">Module 1 not passed'+(s.tries?" · "+plural(s.tries,"attempt"):"")+'</div>';}
function modSections(m){return m.sections.map(function(s,i){var tag=s.ol?"ol":"ul";
  return'<div class="card"><h2>'+(i+1)+'. '+esc(s.h)+'</h2>'+(s.intro?'<p class="lead" style="margin:4px 0 0">'+esc(s.intro)+'</p>':"")+'<'+tag+' style="margin:8px 0 0;padding-left:22px;font-size:17px;line-height:1.6">'+s.pts.map(function(p){return"<li>"+esc(p)+"</li>";}).join("")+'</'+tag+'><div class="carry" style="margin-top:12px"><b>From the Oct 19 notes:</b>'+s.from.map(function(q){return'<div style="margin-top:4px">“'+esc(q)+'”</div>';}).join("")+'</div></div>';}).join("");}
function trainingView(){var w=document.createElement("div"),m=MODULES[0],n=m.quiz.length;
  if(isJuan())return trainingBoard(w,m);
  var st=modState(me.slug,m.id),ans=modAns[m.id]||(modAns[m.id]={}),tried=modTried[m.id];
  if(modFlash&&Date.now()-modFlash.ts<600000)w.appendChild(h('<div class="bnr on '+(modFlash.ok?"ok":"err")+'" id="mq-flash">'+esc(modFlash.t)+(modFlash.sub?'<div class="small">'+esc(modFlash.sub)+'</div>':"")+'</div>'));
  if(st.passed)w.appendChild(h('<div class="card next" style="border-left-color:var(--teal);background:var(--teal-soft)"><h2>Passed: you’re cleared to go live</h2><p class="lead" style="margin:0">'+esc(m.title)+' · passed on attempt '+esc(st.passTry||st.tries)+(st.passedAt?', '+esc(dt(st.passedAt)):"")+'. Keep practicing one skill at a time. The training stays here for you to reread.</p></div>'));
  else w.appendChild(h('<div class="card next"><h2>'+esc(m.title)+'</h2><p class="lead" style="margin:0">'+esc(m.sub)+'. Read all '+m.sections.length+' parts, then answer the '+n+' questions at the bottom. Get all '+n+' right to be cleared to go live. Every attempt is saved under your name, and Juan sees each one.'+(st.tries?' <b>Attempts so far: '+st.tries+'.</b>':"")+'</p></div>'));
  w.appendChild(h(modSections(m)));
  if(!st.passed){var q='<div class="card" id="mq"><h2>Quiz: '+n+' questions</h2><p class="lead">Get all '+n+' right to pass. Wrong answers show in red with the reason. Fix them and try again.</p>'+m.quiz.map(function(x,i){
      return'<div class="q"><b>'+(i+1)+'. '+esc(x.q)+'</b>'+x.o.map(function(o,j){var wrong=tried&&ans[i]===j&&j!==x.a;return'<label class="'+(wrong?"wrong":"")+'"><input type="radio" name="mq'+i+'" value="'+j+'"'+(ans[i]===j?" checked":"")+'> <span>'+esc(o)+'</span></label>';}).join("")+(tried&&ans[i]!==x.a?'<div class="small red">'+esc(x.why)+'</div>':"")+'</div>';}).join("")+
      '<div class="bnr" id="mq-b" role="alert" style="margin-top:14px"></div><div class="row" style="margin-top:14px"><button class="btn hat" id="mq-go">Check my answers</button></div></div>';
    w.appendChild(h(q));}
  var mine=attemptsOf(me.slug,m.id).slice().reverse();
  if(mine.length)w.appendChild(h('<div class="card"><h2>Your attempts</h2>'+mine.map(function(x){return'<div class="meta">'+(x.passed?'<span class="green">Passed</span>':'<span class="red">Not passed</span>')+' · attempt '+esc(x.attempt)+' · '+esc(x.score)+'/'+esc(x.total)+' · '+esc(dt(x.ts))+'</div>';}).join("")+'</div>'));
  setTimeout(function(){wireQuiz(m);var f=$("mq-flash");if(f&&modFlash&&Date.now()-modFlash.ts<3000)try{f.scrollIntoView({behavior:"smooth",block:"center"});}catch(_){}},0);
  return w;}
function wireQuiz(m){var go=$("mq-go");if(!go)return;var ans=modAns[m.id];
  document.querySelectorAll('#mq input[type=radio]').forEach(function(r){r.onchange=function(){ans[+r.name.slice(2)]=+r.value;};});
  go.onclick=async function(){if(modBusy)return;var b=$("mq-b"),n=m.quiz.length,blank=[],wrong=[];
    m.quiz.forEach(function(x,i){if(ans[i]==null)blank.push(i+1);else if(ans[i]!==x.a)wrong.push(i+1);});
    if(blank.length){b.textContent="Answer every question first. Still blank: "+blank.join(", ")+".";b.className="bnr on err";return;}
    if(!db||!me){b.textContent="Not connected to the live board. Nothing was saved. Reload and try again.";b.className="bnr on err";return;}
    modBusy=true;go.disabled=true;go.textContent="Saving…";
    if(!tLoaded)await loadAttempts();
    var score=n-wrong.length,passed=!wrong.length,att=modState(me.slug,m.id).tries+1,now=Date.now();
    var rec={module:m.id,title:m.title,slug:me.slug,name:me.name,ts:now,attempt:att,score:score,total:n,passed:passed,missed:wrong,answers:m.quiz.map(function(x,i){return ans[i];})};
    try{var ref=await db.collection("training_attempts").add(rec);rec.id=ref&&ref.id?ref.id:("tmp"+now);if(!tAttempts.some(function(x){return x.id===rec.id;}))tAttempts.push(rec);}
    catch(e){modBusy=false;go.disabled=false;go.textContent="Check my answers";b.innerHTML='This attempt did NOT save, so it doesn’t count. Error: '+esc(errTxt(e))+'<div class="small">Try again. Still stuck? Screenshot this and send to Juan.</div>';b.className="bnr on err";logIt(m.title+" quiz attempt FAILED to save: "+errTxt(e));return;}
    var tr=Object.assign({},(people[me.slug]||{}).training||{});tr[m.id]={attempts:att,passed:passed,lastAt:now,lastScore:score};if(passed){tr[m.id].passedAt=now;tr[m.id].passTry=att;}
    savePerson({training:tr});
    logIt(m.title+" quiz, attempt "+att+": "+score+"/"+n+(passed?". PASSED, cleared to go live":". Not passed (missed "+wrong.join(", ")+")"));
    modTried[m.id]=!passed;modBusy=false;
    modFlash=passed?{ok:true,t:"Passed ✓ "+score+" of "+n+" on attempt "+att+". You’re cleared to go live.",sub:"Saved under your name. Juan sees it.",ts:Date.now()}
      :{ok:false,t:score+" of "+n+" right. Not passed yet. Attempt "+att+" is saved.",sub:"Find the red answers in the quiz below, read why, fix them, and tap Check my answers again.",ts:Date.now()};
    render();};}
function trainingBoard(w,m){var n=m.quiz.length;
  var rows=team().map(function(r){return{r:r,s:modState(r.slug,m.id)};}).sort(function(a,b){return(a.s.passed-b.s.passed)||(b.s.tries-a.s.tries)||a.r.name.localeCompare(b.r.name);});
  var nPass=rows.filter(function(x){return x.s.passed;}).length;
  var s='<div class="card next"><h2>'+esc(m.title)+'</h2><p class="lead" style="margin:0">'+esc(m.sub)+'. <b>'+nPass+' of '+rows.length+'</b> cleared to go live. Everyone must get all '+n+' questions right. Every attempt is logged by name.</p></div>';
  s+='<div class="card"><h2>Who’s cleared</h2><div class="scroll"><table><thead><tr><th>Person</th><th>Status</th><th>Attempts</th><th>Best score</th><th>Last attempt</th></tr></thead><tbody>'+rows.map(function(x){var st=x.s;
    return'<tr><td><b>'+esc(x.r.name)+'</b><div class="small">'+esc(x.r.title||"")+'</div></td><td>'+(st.passed?'<span class="green">Cleared to go live</span><div class="small">attempt '+esc(st.passTry||st.tries)+(st.passedAt?" · "+esc(dt(st.passedAt)):"")+'</div>':st.tries?'<span class="red">Not passed</span>':'<span class="small">Not started</span>')+'</td><td>'+st.tries+'</td><td>'+(st.tries?st.best+"/"+n:"—")+'</td><td>'+(st.last?esc(ago(st.last.ts)):"—")+'</td></tr>';}).join("")+'</tbody></table></div></div>';
  var all=tAttempts.filter(function(x){return x.module===m.id&&(tWho==="all"||x.slug===tWho);}).sort(function(a,b){return b.ts-a.ts;}).slice(0,200);
  s+='<div class="card"><div class="row" style="justify-content:space-between"><h2>Every attempt</h2><select class="in" id="tw-sel" style="width:auto"><option value="all">Everyone</option>'+team().map(function(r){return'<option value="'+esc(r.slug)+'"'+(tWho===r.slug?" selected":"")+'>'+esc(r.name)+'</option>';}).join("")+'</select></div><p class="lead">Newest first, by name. Missed = the question numbers they got wrong.</p>'+
    (all.length?all.map(function(x){var ms=(x.missed||[]).map(function(k){var q=m.quiz[k-1];return"Q"+k+(q?" ("+clip(q.q,48)+")":"");});
      return'<div class="item"><div class="row" style="justify-content:space-between"><b>'+esc(x.name)+'</b><span><span class="pill '+(x.passed?"p-done":"p-late")+'">'+(x.passed?"PASSED":"NOT PASSED")+'</span> <span class="small">'+esc(dt(x.ts))+'</span></span></div><div class="meta">Attempt '+esc(x.attempt)+' · '+esc(x.score)+'/'+esc(x.total)+(ms.length?' · missed: '+esc(ms.join("; ")):"")+'</div></div>';}).join(""):'<p class="small">'+(tLoaded?"No attempts yet.":"Loading…")+'</p>')+'</div>';
  s+='<details class="card"><summary style="cursor:pointer"><b>See the module and the answer key</b> <span class="small">(what the team sees, with right answers marked)</span></summary><p class="small" style="margin-top:10px">Source: '+esc(m.src)+'</p>'+modSections(m)+'<div class="card"><h2>Quiz: '+n+' questions</h2>'+m.quiz.map(function(x,i){return'<div class="q"><b>'+(i+1)+'. '+esc(x.q)+'</b>'+x.o.map(function(o,j){return'<div class="small" style="margin-top:4px;font-size:15px'+(j===x.a?';color:var(--teal);font-weight:700':"")+'">'+(j===x.a?"✓ ":"• ")+esc(o)+'</div>';}).join("")+'<div class="small" style="margin-top:4px">Why: '+esc(x.why)+'</div></div>';}).join("")+'</div></details>';
  w.appendChild(h(s));
  setTimeout(function(){var sel=$("tw-sel");if(sel)sel.onchange=function(){tWho=this.value;render();};},0);
  return w;}

