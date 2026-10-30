const {chromium}=require('playwright');const fs=require('fs');
// Usage: NODE_PATH=$(npm root -g) node test-hub.js /abs/path/patched-hub.html /abs/path/screenshot-dir
// Runs the Hub against mock-claude.js (in-memory db). The Sandbox skips the code; for the live Hub, seed the mock roster with a real PBKDF2 hash and fill #g-code.
const FILE='file://'+process.argv[2],OUT=process.argv[3];const mod=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','module-01-juans-method.json'),'utf8'));
const ok=(c,m)=>{if(!c){console.log('FAIL:',m);process.exitCode=1;}else console.log('ok:',m);};
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1100,height:900}});await ctx.addInitScript({path:require('path').join(__dirname,'mock-claude.js')});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  async function signIn(name){await p.waitForSelector('.gnm');await p.click(`.gnm:has-text("${name}")`);await p.click('#g-go');await p.waitForSelector('#tabs .tab');}
  await p.goto(FILE);await signIn('Test Rep');
  const tabs=await p.$$eval('#tabs .tab',t=>t.map(x=>x.textContent));ok(tabs.some(t=>t.startsWith('Training')),'team sees Training tab: '+tabs.join(' | '));
  ok(tabs.includes('Training1'),'Training tab shows 1 open module');
  await p.click('.tab[data-v="train"]');await p.waitForSelector('#mq');
  ok((await p.$$('#view .card h2')).length>=11,'module cards + quiz render');
  await p.screenshot({path:OUT+'/1-team-training.png',fullPage:true});
  await p.click('#mq-go');let d=await p.evaluate(()=>__dump());
  ok(Object.keys(d).filter(k=>k.startsWith('training_attempts/')).length===0,'blank submit is blocked and not logged');
  ok((await p.textContent('#mq-b')).includes('Still blank: 1, 2, 3'),'blank warning lists questions');
  for(let i=0;i<mod.quiz.length;i++)await p.check(`input[name="mq${i}"][value="0"]`);
  await p.click('#mq-go');await p.waitForSelector('#mq-flash');d=await p.evaluate(()=>__dump());
  let at=Object.entries(d).filter(([k])=>k.startsWith('training_attempts/')).map(([,v])=>v);
  const wrong=mod.quiz.map((q,i)=>q.a===0?null:i+1).filter(Boolean);
  ok(at.length===1&&at[0].passed===false&&at[0].attempt===1&&at[0].name==='Test Rep'&&JSON.stringify(at[0].missed)===JSON.stringify(wrong),'attempt 1 logged by name, not passed, missed '+JSON.stringify(at[0]&&at[0].missed));
  ok((await p.textContent('#mq-flash')).includes(`${mod.quiz.length-wrong.length} of ${mod.quiz.length} right. Not passed`),'fail banner: '+(await p.textContent('#mq-flash')).slice(0,60));
  ok((await p.$$('#mq label.wrong')).length===wrong.length,'wrong answers marked red');
  await p.screenshot({path:OUT+'/2-team-failed.png',fullPage:true});
  for(let i=0;i<mod.quiz.length;i++)await p.check(`input[name="mq${i}"][value="${mod.quiz[i].a}"]`);
  await p.click('#mq-go');await p.waitForFunction(()=>document.querySelector('#mq-flash')&&document.querySelector('#mq-flash').textContent.includes('Passed'));
  d=await p.evaluate(()=>__dump());at=Object.entries(d).filter(([k])=>k.startsWith('training_attempts/')).map(([,v])=>v).sort((a,b)=>a.attempt-b.attempt);
  ok(at.length===2&&at[1].passed===true&&at[1].attempt===2&&at[1].score===mod.quiz.length,'attempt 2 logged, passed '+at.length);
  ok(d['people/test-rep'].training.m1.passed===true&&d['people/test-rep'].training.m1.passTry===2&&d['people/test-rep'].trained===true,'person summary saved, hub training kept');
  const logs=Object.entries(d).filter(([k])=>k.startsWith('log/')).map(([,v])=>v.a);ok(logs.filter(a=>a.includes('quiz, attempt')).length===2,'both attempts in Activity log: '+logs.filter(a=>a.includes('quiz')).join(' / '));
  ok(!(await p.$('#mq')),'quiz hidden after pass');const tabs2=await p.$$eval('#tabs .tab',t=>t.map(x=>x.textContent));ok(tabs2.includes('Training'),'badge cleared after pass');
  await p.screenshot({path:OUT+'/3-team-passed.png',fullPage:true});
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:OUT+'/4-team-passed-phone.png',fullPage:false});
  const sw=await p.evaluate(()=>document.documentElement.scrollWidth);ok(sw<=390,'no sideways scroll at phone width ('+sw+')');
  await p.setViewportSize({width:1100,height:900});
  // hand the mock db to the reloaded page directly; sessionStorage on file:// pages can lose writes made just before a reload
  const snap=await p.evaluate(()=>__snap());await ctx.addInitScript(s=>{window.__MOCKSNAP=s;},snap);await p.reload();await signIn('Juan Diaz');const jt=await p.$$eval('#tabs .tab',t=>t.map(x=>x.textContent));ok(jt.includes('Training'),'Juan sees Training tab: '+jt.join(' | '));
  await p.click('.tab[data-v="team"]');const tt=await p.textContent('#view');ok(tt.includes('Module 1 passed · cleared to go live')&&tt.includes('Module 1 not passed'),'Team today shows module status per person');
  await p.click('.tab[data-v="train"]');await p.waitForSelector('#tw-sel');const jv=await p.textContent('#view');
  ok(jv.includes('1 of 2')&&jv.includes('cleared to go live'),'Juan board counts cleared');ok((await p.$$('#view .item')).length>=2,'Juan sees every attempt');
  ok(jv.includes('NOT PASSED')&&jv.includes('PASSED')&&jv.includes('missed: Q1'),'attempt log shows pass/fail and missed questions');
  await p.click('details summary');await p.screenshot({path:OUT+'/5-juan-board.png',fullPage:true});
  await p.selectOption('#tw-sel','other-rep');ok((await p.textContent('#view')).includes('No attempts yet'),'filter by person works');
  ok(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3)));await b.close();})();
