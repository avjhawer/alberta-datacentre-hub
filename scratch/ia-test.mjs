/* The reorganised information architecture: four pages, redirects, digest. */
import { chromium } from 'playwright';
const B='http://127.0.0.1:8765';
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok   '+m)):(fail++,console.log('  FAIL '+m));};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errors=[];
const newPage=async(o={})=>{const p=await browser.newPage({viewport:{width:1440,height:1000},...o});
  p.on('pageerror',e=>errors.push(String(e)));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return p;};

console.log('\n— navigation is four destinations —');
let p=await newPage();
await p.goto(`${B}/index.html`,{waitUntil:'networkidle'});
await p.waitForTimeout(400);
ok((await p.$$('.nav-link')).length===4,`sidebar has 4 links (was 9)`);
const labels=await p.$$eval('.nav-label',e=>e.map(x=>x.textContent.trim()));
ok(labels.join('|')==='What changed|Review an application|Rules & requirements|Context & research',
   'the four destinations are named by their job: '+labels.join(' / '));
ok((await p.$$('.nav-blurb')).length===4,'each nav item states its purpose');

console.log('\n— the front door answers one question —');
ok(await p.isVisible('.digest'),'a digest leads the page');
ok(/What changed/.test(await p.textContent('h1')),'h1 is the question, not a label');
ok(await p.isVisible('.page-purpose'),'page states its purpose in one line');
const dig=await p.textContent('.digest');
ok(/first visit|since/i.test(dig),'digest frames items relative to the last visit');

console.log('\n— mark-as-read is explicit, not automatic —');
await p.evaluate(()=>localStorage.setItem('adch.lastSeen',String(Date.now()-1000*60*60*24*3)));
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
const before=await p.evaluate(()=>localStorage.getItem('adch.lastSeen'));
await p.waitForTimeout(300);
const after=await p.evaluate(()=>localStorage.getItem('adch.lastSeen'));
ok(before===after,'merely opening the page does not wipe the digest');
if(await p.$('#mark-read')){
  await p.click('#mark-read'); await p.waitForTimeout(300);
  ok(await p.evaluate(()=>localStorage.getItem('adch.lastSeen'))!==before,'mark-as-read advances it');
} else ok(true,'mark-as-read absent (nothing new) — acceptable');

console.log('\n— merged reference pages —');
await p.goto(`${B}/rules.html`,{waitUntil:'networkidle'}); await p.waitForTimeout(500);
ok((await p.$$('.page-toc a')).length===2,'rules has an in-page contents bar');
for(const id of ['framework','municipal'])
  ok(await p.$(`#${id}`)!==null,`rules has #${id}`);
ok(await p.$('#useclass')===null,'the use class section is gone');
ok(await p.$('#lub-slot')===null,'and its slot is gone with it');
ok((await p.$$('#matrix-body tr')).length>=6,'municipal matrix renders inside the merged page');
ok((await p.$$('.stack-layer')).length===4,'policy framework renders inside the merged page');

await p.goto(`${B}/context.html`,{waitUntil:'networkidle'}); await p.waitForTimeout(500);
ok((await p.$$('.page-toc a')).length===4,'context has an in-page contents bar');
ok((await p.$$('.sd-card')).length===4,'site design cards render inside the merged page');
ok(await p.$('#juris-slot > *')!==null,'precedent jurisdictions render');
ok(await p.$('#groups-slot > *')!==null,'reference library renders');

console.log('\n— old URLs still work —');
for(const [from,to] of [['news.html','index.html'],['policy.html','rules.html'],
                        ['municipal.html','rules.html'],['precedents.html','context.html'],
                        ['tech.html','context.html'],['library.html','context.html'],
                        ['projects.html','index.html']]){
  const q=await newPage();
  await q.goto(`${B}/${from}`,{waitUntil:'networkidle'});
  await q.waitForTimeout(250);
  ok(q.url().includes(to),`${from} redirects to ${to}`);
  await q.close();
}

console.log('\n— review page carries the approvals map and the tool —');
await p.goto(`${B}/permits.html`,{waitUntil:'networkidle'}); await p.waitForTimeout(1000);
ok((await p.$$('.ap-node')).length===17,'the approvals map renders');
ok(await p.$('#sequencing-slot')===null,'the superseded swimlane is gone');
ok(await p.isVisible('#projects-slot'),'the review tool is still there');

ok(errors.length===0,`no console/page errors (${errors.length})`+(errors[0]?' — '+errors[0]:''));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
