/* The reorganised information architecture: five pages, redirects, digest. */
import { chromium } from 'playwright';
const B='http://127.0.0.1:8765';
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok   '+m)):(fail++,console.log('  FAIL '+m));};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errors=[];
const newPage=async(o={})=>{const p=await browser.newPage({viewport:{width:1440,height:1000},...o});
  p.on('pageerror',e=>errors.push(String(e)));
  p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});return p;};

console.log('\n— navigation is five destinations —');
let p=await newPage();
await p.goto(`${B}/index.html`,{waitUntil:'networkidle'});
await p.waitForTimeout(400);
ok((await p.$$('.nav-link')).length===5,`sidebar has 5 links (was 9)`);
const labels=await p.$$eval('.nav-label',e=>e.map(x=>x.textContent.trim()));
ok(labels.join('|')==='What changed|Review an application|Approvals map|Rules & requirements|Context & research',
   'the five destinations are named by their job: '+labels.join(' / '));
ok((await p.$$('.nav-blurb')).length===5,'each nav item states its purpose');

console.log('\n— the front door answers one question —');
ok(await p.isVisible('.digest'),'a digest leads the page');
ok(/data centre proposal in Alberta/i.test(await p.textContent('h1')),'h1 says what the site is for');
ok(/What changed/.test(await p.textContent('#whats-new h2')),'"What changed" heads the news below it');

console.log('\n— a newcomer is told what this is and how to use it —');
ok(await p.isVisible('#welcome-body'),'the guide is open on a first visit');
ok((await p.$$('.welcome-task')).length===5,'five things you can do, each a link');
const taskLinks=await p.$$eval('.welcome-task',e=>e.map(x=>x.getAttribute('href')));
for(const h of taskLinks.filter(h=>!h.startsWith('#'))){
  const r=await p.evaluate(u=>fetch(u).then(r=>r.status),h);
  ok(r===200,`task link resolves: ${h}`);
}
const stats=await p.$$eval('.welcome-stat-n',e=>e.map(x=>Number(x.textContent.replace(/,/g,''))));
ok(stats.length===6 && stats.every(n=>n>0),'"what is inside" is counted from the data: '+stats.join(', '));
const steps=await p.evaluate(()=>fetch('data/approvals.json').then(r=>r.json()).then(j=>j.nodes.filter(n=>!n.variants||n.variants.includes('grid')).length));
ok(stats[0]===steps,`the step count matches the map (${steps})`);
ok((await p.$$('.welcome-trust .chip')).length===3,'the three source tiers are explained');
await p.click('#welcome-toggle'); await p.waitForTimeout(150);
ok(!(await p.isVisible('#welcome-body')) && await p.isVisible('.welcome-title'),'it folds to one line that still says what the site is');
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
ok(!(await p.isVisible('#welcome-body')),'and stays folded on the next visit');
await p.click('#welcome-toggle'); await p.waitForTimeout(150);
ok(await p.isVisible('#welcome-body'),'one tap brings it back');
await p.evaluate(()=>localStorage.removeItem('adch.welcome'));
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
await p.click('.digest-start #mark-read'); await p.waitForTimeout(300);
ok(!(await p.isVisible('#welcome-body')),'starting to track folds it');
await p.evaluate(()=>localStorage.clear());
await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(400);
ok(await p.isVisible('.page-purpose'),'page states its purpose in one line');
const dig=await p.textContent('.digest');
ok(/first visit|since/i.test(dig),'digest frames items relative to the last visit');
ok(/last 7 days/i.test(dig),'a first visit counts a week, not everything on file');
ok(await p.isVisible('.digest-start #mark-read'),'and offers to start tracking');
const figs=await p.$$eval('a.digest-fig',e=>e.map(x=>x.getAttribute('href')));
ok(figs.length>=3 && figs.every(h=>h.startsWith('#')),'every headline figure links to the list it counts');
const pagesFig=await p.$('a.digest-fig[data-digest="pages"] .digest-n');
if(pagesFig){
  const n=Number(await pagesFig.textContent());
  const total=await p.evaluate(()=>fetch('data/alerts.json').then(r=>r.json()).then(j=>j.alerts.length));
  const uniq=await p.evaluate(()=>fetch('data/alerts.json').then(r=>r.json()).then(j=>new Set(j.alerts.map(a=>a.url)).size));
  ok(n<=uniq && n<=total,`watched pages are counted once each (${n} pages from ${total} log entries)`);
  ok((await p.$$('.attention-what')).length>0,'each says how much changed, not only that it did');
} else ok(true,'no watched page changed this week — acceptable');
await p.click('a.digest-fig[data-digest="decision"]'); await p.waitForTimeout(300);
ok(await p.$eval('[data-feed-filter="decision"]',e=>e.classList.contains('is-on')),'"bear on a decision" narrows the feed to those');
const marked=await p.$$eval('#feed-slot .feed-item',els=>els.length && els.every(li=>li.querySelector('.badge')||li.querySelector('.also')));
ok(marked,'and every story left carries the marker (or groups one that does)');
await p.click('[data-feed-filter="all"]'); await p.waitForTimeout(200);

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

console.log('\n— review page leads with the tool —');
await p.goto(`${B}/permits.html`,{waitUntil:'networkidle'}); await p.waitForTimeout(1000);
ok((await p.$$('.steps-strip-item')).length===3,'three steps say what the page asks of you');
ok(await p.$('#sequencing-slot')===null,'the superseded swimlane is gone');
ok(await p.isVisible('#projects-slot'),'the review tool is still there');
ok(await p.evaluate(()=>document.querySelector('#params').getBoundingClientRect().top < innerHeight*1.2),
   'the parameter form is within about a screen of the top');
ok(await p.isVisible('.ap-compact') && (await p.$$('.ap-node')).length===0,'the approvals map is a card here, not the whole matrix');
for(const id of ['params','findings','areas']) ok(await p.$(`#${id}`)!==null,`step target #${id} exists`);

console.log('\n— the approvals map has a page of its own —');
await p.goto(`${B}/approvals.html`,{waitUntil:'networkidle'}); await p.waitForTimeout(1000);
ok((await p.$$('.ap-node')).length>=21,'the approvals map renders');
ok(await p.$eval('.nav-link.is-active, .nav-link[aria-current]',e=>/Approvals map/.test(e.textContent)).catch(()=>false),'and is the current page in the sidebar');

ok(errors.length===0,`no console/page errors (${errors.length})`+(errors[0]?' — '+errors[0]:''));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
