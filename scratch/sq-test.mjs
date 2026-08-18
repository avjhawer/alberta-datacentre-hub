/* The swimlane: structure, drawers, keyboard, and that the DP tool still works. */
import { chromium } from 'playwright';
const B='http://127.0.0.1:8765';
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok   '+m)):(fail++,console.log('  FAIL '+m));};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`${B}/permits.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(400);

console.log('\n— structure —');
ok((await page.$$('.sq-track')).length===2,'two tracks render');
ok((await page.$$('.sq-phase')).length===4,'four phases render');
ok((await page.$$('.sq-step')).length===8,'eight steps render (2 tracks x 4 phases)');
ok((await page.$$('.sq-gate')).length===3,'three dependency gates render');
const t=await page.textContent('.sq-track-provincial .sq-track-label');
ok(/Provincial/.test(t),'provincial track is the top lane');
const t2=await page.textContent('.sq-track-municipal .sq-track-label');
ok(/Municipal/.test(t2),'municipal track is the bottom lane');

console.log('\n— placement relative to the review tool —');
const order=await page.evaluate(()=>{
  const sq=document.querySelector('#sequencing-slot');
  const proj=document.querySelector('#projects-slot');
  return sq.compareDocumentPosition(proj) & Node.DOCUMENT_POSITION_FOLLOWING ? 'before':'after';
});
ok(order==='before','chart sits above the review tool');
ok(await page.$('#sequencing-slot') !== null && (await page.$$('#main #sequencing-slot')).length===1,'chart is inside <main>');

console.log('\n— gate drawer —');
await page.click('[data-open-gate="gate-a"]');
await page.waitForTimeout(350);
ok(await page.isVisible('#sq-drawer'),'clicking a gate opens the drawer');
const body=await page.textContent('#sq-drawer');
ok(/619|Municipal Government Act/i.test(body),'Gate A drawer covers the s.619 interaction');
ok(/Ask the applicant/i.test(body),'drawer lists questions to ask');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ok(!(await page.isVisible('#sq-drawer')),'Escape closes the drawer');

console.log('\n— noise + grading gates —');
await page.click('[data-open-gate="gate-b"]');
await page.waitForTimeout(300);
ok(/Rule 012|noise/i.test(await page.textContent('#sq-drawer')),'Gate B covers dual noise standards');
await page.click('#sq-close'); await page.waitForTimeout(300);
await page.click('[data-open-gate="gate-c"]');
await page.waitForTimeout(300);
ok(/grading|earthwork/i.test(await page.textContent('#sq-drawer')),'Gate C covers early grading');
await page.click('#sq-scrim'); await page.waitForTimeout(300);
ok(!(await page.isVisible('#sq-drawer')),'clicking the scrim closes the drawer');

console.log('\n— step drawer —');
await page.click('[data-open-step="prov-p1"]');
await page.waitForTimeout(300);
ok(/AESO/i.test(await page.textContent('#sq-drawer')),'a step opens its own guidance');
await page.click('#sq-close'); await page.waitForTimeout(300);

console.log('\n— the DP tool below is untouched —');
await page.fill('[data-param="capacityMW"]','150');
await page.waitForTimeout(350);
const f=await page.$$eval('.finding-title',e=>e.map(x=>x.textContent));
ok(f.some(x=>/large data centre threshold/i.test(x)),'rule evaluation still fires');
ok((await page.$$('.proj-card')).length>=1,'review cards still render');
await page.click('#btn-new'); await page.waitForTimeout(250);
ok((await page.$$('.proj-card')).length>=2,'new review still works');

console.log('\n— collapse toggle —');
await page.click('#sq-toggle'); await page.waitForTimeout(200);
ok(!(await page.isVisible('.sq-inner')),'chart can be hidden');
await page.click('#sq-toggle'); await page.waitForTimeout(200);
ok(await page.isVisible('.sq-inner'),'chart can be shown again');

ok(errors.length===0,`no console/page errors (${errors.length})`+(errors[0]?' — '+errors[0]:''));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
