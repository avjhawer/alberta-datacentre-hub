import { chromium } from 'playwright';
const B='http://127.0.0.1:8765';
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok   '+m)):(fail++,console.log('  FAIL '+m));};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`${B}/precedents.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(400);

console.log('\n— four cards —');
ok((await page.$$('.sd-card')).length===4,'four cards render');
const titles=await page.$$eval('.sd-title',e=>e.map(x=>x.textContent));
ok(titles.some(t=>/Mechanical & chiller screening/i.test(t)),'Card 1 mechanical & chiller screening');
ok(titles.some(t=>/monolithic facades/i.test(t)),'Card 2 breaking up monolithic facades');
ok(titles.some(t=>/Acoustic attenuation/i.test(t)),'Card 3 acoustic attenuation & buffer zones');
ok(titles.some(t=>/Stormwater/i.test(t)),'Card 4 stormwater & environmental integration');

console.log('\n— diagrams —');
ok((await page.$$('.sd-figure svg')).length===4,'every card has a schematic');
const labelled=await page.$$eval('.sd-figure svg',e=>e.filter(s=>s.getAttribute('aria-label')).length);
ok(labelled===4,'every diagram carries an aria-label');

console.log('\n— required content —');
const all=await page.textContent('#sitedesign-slot');
ok(/parapet/i.test(all),'rooftop parapets covered');
ok(/louvred|louvered/i.test(all),'louvred acoustic enclosures covered');
ok(/screening wall|perimeter screening/i.test(all),'perimeter screening walls covered');
await page.click('#sd-all'); await page.waitForTimeout(300);
const open=await page.textContent('#sitedesign-slot');
ok(/fins/i.test(open),'architectural fins covered');
ok(/berm/i.test(open),'landscape berms covered');
ok(/generator/i.test(open),'backup generators covered');
ok(/bioretention/i.test(open),'bioretention cells covered');
ok(/SWMF|regional stormwater/i.test(open),'regional SWMF covered');
ok(/agricultural/i.test(open),'agricultural boundary siting covered');

console.log('\n— expand / collapse —');
ok(await page.isVisible('#sd-screening'),'expand all opens every card');
await page.click('#sd-all'); await page.waitForTimeout(250);
ok(await page.isHidden('#sd-screening'),'collapse all closes them');
await page.click('[data-sd="acoustic"]'); await page.waitForTimeout(250);
ok(await page.isVisible('#sd-acoustic'),'a single card expands on its own');
ok(await page.isHidden('#sd-screening'),'expanding one does not open the others');
const focused=await page.evaluate(()=>document.activeElement?.getAttribute('data-sd'));
ok(focused==='acoustic','focus is kept on the toggle after re-render');

console.log('\n— panel asks —');
ok(/What the panel will ask for/i.test(await page.textContent('#sd-acoustic')),'each card lists what the panel will ask');

console.log('\n— existing page intact —');
ok((await page.$$('#juris-slot > *')).length>0,'precedent jurisdictions still render');
ok((await page.$$('#research-slot > *')).length>0,'impact research still renders');
const order=await page.evaluate(()=>{
  const t=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim());
  return {j:t.findIndex(x=>/Precedent jurisdictions/i.test(x)),
          s:t.findIndex(x=>/Site layout/i.test(x)),
          r:t.findIndex(x=>/Impact research/i.test(x))};
});
ok(order.j<order.s && order.s<order.r,'section sits between jurisdictions and research');

ok(errors.length===0,`no console/page errors (${errors.length})`+(errors[0]?' — '+errors[0]:''));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
