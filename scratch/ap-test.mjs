/* The approvals flow: structure, concurrency, dependencies, drawer, links. */
import { chromium } from 'playwright';
const B='http://127.0.0.1:8765';
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok   '+m)):(fail++,console.log('  FAIL '+m));};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errors=[];
const page=await browser.newPage({viewport:{width:1500,height:1100}});
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});

async function newPagePrint(){
  const q=await browser.newPage({viewport:{width:1556,height:980}});
  q.on('pageerror',e=>errors.push(String(e)));
  q.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await q.goto(`${B}/approvals-print.html?route=offgrid`,{waitUntil:'networkidle'});
  await q.waitForTimeout(1200);
  return q;
}

await page.goto(`${B}/permits.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(1200);

console.log('\n— provincial through municipal, all five authorities —');
ok((await page.$$('.ap-lane-head')).length===5,'five decision-making lanes');
const lanes=await page.$$eval('.ap-lane-label',e=>e.map(x=>x.textContent.trim()));
for (const want of ['Grid connection','Utilities regulator','Environment & water','Municipal','Building & safety'])
  ok(lanes.includes(want),`lane present: ${want}`);

console.log('\n— runs to occupancy —');
const phases=await page.$$eval('.ap-phase-name',e=>e.map(x=>x.textContent.trim()));
ok(phases.join(' > ')==='Scoping > Filings > Decisions > Construction > Occupancy',
   'phases run scoping to occupancy: '+phases.join(' > '));
ok(await page.$('#apn-occupancy')!==null,'occupancy permit is on the diagram');
ok((await page.$('.ap-node.is-end'))!==null,'the end state is visually marked');

console.log('\n— concurrency is shown, not implied —');
const p1=await page.$$eval('.ap-node',els=>els.filter(e=>e.closest('.ap-cell')).length);
ok(p1===21,`all ${p1} approval steps render`);
const startNow=await page.$$eval('.ap-tag-start',e=>e.length);
ok(startNow===4,`four steps flagged to start in week one (${startNow})`);
ok((await page.$$('.ap-legend span')).length===5,'a legend explains the notation');

console.log('\n— the grid lane runs unbroken to energization —');
ok(await page.$('#apn-aeso-agreement')!==null,'the connection agreement follows the system study');
const gridIds=await page.$$eval('.ap-cell .ap-node',els=>els.map(e=>e.id));
for (const want of ['apn-aeso-sas','apn-aeso-study','apn-aeso-agreement','apn-tfo-build','apn-energize'])
  ok(gridIds.includes(want),`grid step present: ${want.replace('apn-','')}`);
await page.click('#apn-tfo-build'); await page.waitForTimeout(400);
const tfo=await page.textContent('#ap-drawer');
ok(/Connection agreement/i.test(tfo)&&/Permit & licence|Permit &amp; licence/i.test(tfo),
   'substation construction waits on both the agreement and the AUC permit');
await page.click('#ap-close'); await page.waitForTimeout(300);

console.log('\n— which order of government decides —');
ok((await page.$$('.ap-level')).length===3,'a level rail groups the lanes by order of government');
const levelText=await page.$$eval('.ap-level-text',e=>e.map(x=>x.textContent.trim()));
ok(levelText.some(t=>/^Provincial$/i.test(t)),'provincial block labelled');
ok(levelText.some(t=>/^Municipal$/i.test(t)),'municipal block labelled');
// The rotated rail carries a short label (its text length is a row height);
// the full wording lives on the lane tag, which is where it is checked.
const laneLevels=await page.$$eval('.ap-lane-level',e=>e.map(x=>x.textContent.trim()));
ok(laneLevels.some(t=>/municipal administration/i.test(t)),
   'the Safety Codes nuance is stated: provincial statute, municipal administration');
ok((await page.$$('.ap-lane-level')).length===5,'every lane head carries its level too');

console.log('\n— the power plant chain and its municipal side —');
ok(await page.$('#apn-auc-gen-file')!==null,'AUC power plant application is on the diagram');
ok(await page.$('#apn-auc-gen-approval')!==null,'and its approval');
ok(await page.$('#apn-muni-dp-generation')!==null,'the municipal permit for the generation facility is shown');
const pairTags=await page.$$eval('.ap-tag-pair',e=>e.map(x=>x.textContent.trim()));
ok(pairTags.length===4,`paired approvals are marked on both cards (${pairTags.length} chips)`);
ok(new Set(pairTags).size===2,`two pairs, each sharing a letter: ${[...new Set(pairTags)].join(' / ')}`);
ok((await page.$$('.ap-pair')).length===0,'and no line is drawn for them — a pair has no sequence');
await page.click('#apn-muni-dp-generation'); await page.waitForTimeout(400);
const gen=await page.textContent('#ap-drawer');
ok(/Both of these are required/i.test(gen),'the drawer states both approvals are required');
ok(/Power plant approval/i.test(gen),'and names the AUC approval it pairs with');
ok(/neither authorises the other/i.test(gen),'and says neither authorises the other');
ok(/Marked Pair [AB]/.test(gen),'and names the pair letter it carries on the diagram');
ok(/no order between them/i.test(gen),'and that there is no order between the two');
ok(/solicitor/i.test(gen),'and flags the jurisdictional question for legal advice');
await page.click('#ap-close'); await page.waitForTimeout(300);

console.log('\n— dependencies are drawn from real positions —');
const wires=await page.$$eval('.ap-wire',e=>e.map(x=>x.getAttribute('d')));
ok(wires.length>=14,`${wires.length} dependency connectors drawn`);
ok(wires.every(d=>d&&d.startsWith('M')&&d.includes('C')),'every connector has real path geometry');
ok((await page.$$('.ap-wire.is-critical')).length>0,'critical path connectors are distinguished');

console.log('\n— critical path highlight —');
await page.click('#ap-critical'); await page.waitForTimeout(500);
ok((await page.$$('.ap-node.is-dim')).length>0,'non-critical steps dim when highlighting');
await page.click('#ap-critical'); await page.waitForTimeout(400);
ok((await page.$$('.ap-node.is-dim')).length===0,'and restore');

console.log('\n— the drawer answers "where do I start this" —');
await page.click('#apn-aeso-sas'); await page.waitForTimeout(400);
ok(await page.isVisible('#ap-drawer'),'clicking a step opens its detail');
const body=await page.textContent('#ap-drawer');
ok(/Where this starts/i.test(body),'drawer says where the process is started');
ok(/aeso/i.test(body),'and names the authority');
const href=await page.getAttribute('#ap-drawer .ap-start a','href');
ok(/^https:\/\/www\.aeso\.ca/.test(href),`start link points at the authority (${href})`);
ok(/Blocks/i.test(body)||/Cannot start until/i.test(body)||/same time as/i.test(body),
   'drawer states relationships to other steps');

console.log('\n— relationships are navigable —');
await page.click('#ap-close'); await page.waitForTimeout(300);
await page.click('#apn-occupancy'); await page.waitForTimeout(400);
const occ=await page.textContent('#ap-drawer');
ok(/Cannot start until/i.test(occ),'occupancy lists what must finish first');
ok(/Energization/i.test(occ),'including energization');
const jumps=await page.$$('.ap-jump');
ok(jumps.length>0,'related steps are clickable');
await jumps[0].click(); await page.waitForTimeout(400);
ok(await page.isVisible('#ap-drawer'),'jumping to a related step works');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
ok(!(await page.isVisible('#ap-drawer')),'Escape closes');

console.log('\n— the off-grid route —');
ok((await page.$$('#ap-routes .seg-btn')).length===2,'two supply routes are offered');
await page.click('#ap-routes .seg-btn:nth-child(2)'); await page.waitForTimeout(700);
const off=await page.$$eval('.ap-cell .ap-node',e=>e.map(x=>x.id));
for (const gone of ['apn-aeso-sas','apn-aeso-study','apn-aeso-agreement','apn-tfo-build','apn-energize'])
  ok(!off.includes(gone),`AESO step drops out off-grid: ${gone.replace('apn-','')}`);
for (const want of ['apn-supply-concept','apn-fuel-supply','apn-plant-build','apn-plant-commission',
                    'apn-auc-isd','apn-auc-isd-order'])
  ok(off.includes(want),`off-grid step present: ${want.replace('apn-','')}`);
ok(off.includes('apn-muni-preapp')&&off.includes('apn-muni-dp')&&off.includes('apn-muni-decision')
   &&off.includes('apn-occupancy'),'every municipal and occupancy step is unchanged off-grid');
const laneNow=await page.$$eval('.ap-lane-label',e=>e.map(x=>x.textContent.trim()));
ok(laneNow.includes('On-site power')&&!laneNow.includes('Grid connection'),
   'the grid lane is relabelled for the route');
const reqTags=await page.$$eval('.ap-tag-req',e=>e.map(x=>x.textContent.trim()));
ok(reqTags.length>=2,`on-site generation stops being optional off-grid (${reqTags.length} marked required)`);
const offIns=await page.textContent('.ap-insights');
ok(/off the hook/i.test(offIns),'the off-grid notes say what does not change');
ok(/no queue/i.test(offIns),'and that the pacing constraint is gone');
await page.click('#apn-plant-commission'); await page.waitForTimeout(400);
const pc=await page.textContent('#ap-drawer');
ok(/Occupancy permit/i.test(pc),'commissioning still gates occupancy');
ok(!/Energization/i.test(pc),'and the drawer does not offer grid-route steps');
await page.click('#ap-close'); await page.waitForTimeout(300);
await page.click('#ap-routes .seg-btn:nth-child(1)'); await page.waitForTimeout(700);
ok((await page.$$eval('.ap-cell .ap-node',e=>e.length))===21,'switching back restores the grid route');

console.log('\n— the print sheet —');
const pr=await newPagePrint();
ok((await pr.$$('.ap-cell .ap-node')).length===22,'the print sheet renders a route on its own');
ok((await pr.$$('.ap-wire')).length>0,'with its connectors');
await pr.emulateMedia({media:'print'});
await pr.waitForTimeout(600);
const fit=await pr.evaluate(()=>{
  const g=document.querySelector('.ap-grid').getBoundingClientRect();
  return {bottom:Math.round(g.bottom+scrollY), width:Math.round(g.width)};
});
// 17x11in at 10mm margins, 96dpi: 1556 x 980 usable.
ok(fit.bottom<=980,`the matrix fits one tabloid page (${fit.bottom}px of 980)`);
ok(fit.width<=1556,`and its width (${fit.width}px of 1556)`);
const wiresPrint=await pr.$$eval('.ap-wire',e=>e.map(x=>x.getAttribute('d')));
ok(wiresPrint.every(d=>d&&/^M [\d.]+ [\d.]+ C/.test(d)),'every connector has real path geometry');

// The bug this catches: the sheet used to shrink its type inside `@media
// print`. The grid re-laid out, the SVG did not, and the PDF came out with
// arrowheads in empty cells. The sheet is now a fixed artboard, so screen and
// paper must measure identically.
const geom=p=>p.evaluate(()=>{
  const g=document.querySelector('.ap-grid').getBoundingClientRect();
  const rel=el=>{const r=el.getBoundingClientRect();
    return [Math.round(r.left-g.left),Math.round(r.top-g.top),
            Math.round(r.right-g.left),Math.round(r.bottom-g.top)];};
  return JSON.stringify({w:Math.round(g.width),h:Math.round(g.height),
    n:[...document.querySelectorAll('.ap-node')].map(e=>[e.id,rel(e)])});
});
const onScreen=await geom(pr);
await pr.emulateMedia({media:'print'});
await pr.waitForTimeout(600);
ok(await geom(pr)===onScreen,'the sheet lays out identically on screen and on paper');

// Endpoints must touch the cards they claim to join, and nothing may run
// across a card it does not join — that is what makes a flow chart traceable.
const routing=await pr.evaluate(()=>{
  const g=document.querySelector('.ap-grid').getBoundingClientRect();
  const nodes=[...document.querySelectorAll('.ap-node')].map(el=>{
    const r=el.getBoundingClientRect();
    return {id:el.id.replace('apn-',''),l:r.left-g.left,t:r.top-g.top,
            r:r.right-g.left,b:r.bottom-g.top};});
  const bez=(P,t)=>{const u=1-t,a=u*u*u,b=3*u*u*t,c=3*u*t*t,d=t*t*t;
    return [a*P[0][0]+b*P[1][0]+c*P[2][0]+d*P[3][0],
            a*P[0][1]+b*P[1][1]+c*P[2][1]+d*P[3][1]];};
  let orphan=0, crossing=0;
  for (const el of document.querySelectorAll('.ap-wire')) {
    const n=el.getAttribute('d').match(/-?[\d.]+/g).map(Number);
    const P=[[n[0],n[1]],[n[2],n[3]],[n[4],n[5]],[n[6],n[7]]];
    const ends=[el.dataset.from,el.dataset.to];
    const on=(p,nd,tol=3)=>p[0]>=nd.l-tol&&p[0]<=nd.r+tol&&p[1]>=nd.t-tol&&p[1]<=nd.b+tol;
    if (!nodes.some(nd=>on(P[0],nd))||!nodes.some(nd=>on(P[3],nd))) orphan++;
    for (let i=1;i<40;i++){
      const [x,y]=bez(P,i/40);
      if (nodes.some(nd=>!ends.includes(nd.id)&&x>nd.l+2&&x<nd.r-2&&y>nd.t+2&&y<nd.b-2))
        { crossing++; break; }
    }
  }
  return {orphan,crossing,count:document.querySelectorAll('.ap-wire').length};
});
ok(routing.orphan===0,`every connector touches both cards it joins (${routing.count} connectors)`);
ok(routing.crossing===0,'and none runs across a card it does not join');
await pr.close();

console.log('\n— supporting information —');
ok((await page.$$('.ap-insight')).length===7,'seven insight cards accompany the diagram');
const ins=await page.textContent('.ap-insights');
ok(/how to read a pair letter/i.test(ins),'the notes explain how a pair letter works');
ok(/win one and lose the other/i.test(ins),'and why it matters');
ok(/critical path/i.test(ins),'explains the critical path');
ok(/week one/i.test(ins),'tells you what to start immediately');

console.log('\n— on the front page too —');
const home=await browser.newPage({viewport:{width:1500,height:1100}});
home.on('pageerror',e=>errors.push(String(e)));
await home.goto(`${B}/index.html`,{waitUntil:'networkidle'});
await home.waitForTimeout(1200);
ok((await home.$$('.ap-node')).length===21,'the full diagram renders on the front page');
ok((await home.$$('.ap-wire')).length>=14,'with its connectors');
await home.click('#apn-muni-preapp'); await home.waitForTimeout(400);
ok(await home.isVisible('#ap-drawer'),'and its drawer works there');
await home.close();

console.log('\n— the review tool underneath still works —');
await page.evaluate(()=>localStorage.clear());
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(800);
await page.fill('[data-param="capacityMW"]','150');
await page.waitForTimeout(400);
const f=await page.$$eval('.finding-title',e=>e.map(x=>x.textContent));
ok(f.some(x=>/large data centre threshold/i.test(x)),'rule evaluation still fires');

ok(errors.length===0,`no console/page errors (${errors.length})`+(errors[0]?' — '+errors[0]:''));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
