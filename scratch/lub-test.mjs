import { chromium } from 'playwright';
const B='http://127.0.0.1:8765';
let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log('  ok   '+m)):(fail++,console.log('  FAIL '+m));};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(`${B}/municipal.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(400);

console.log('\n— placement —');
const pos=await page.evaluate(()=>{
  const tbl=document.querySelector('#matrix');
  const lub=document.querySelector('#lub-slot');
  return tbl.compareDocumentPosition(lub) & Node.DOCUMENT_POSITION_FOLLOWING ? 'below':'above';
});
ok(pos==='below','section sits below the main comparison table');

console.log('\n— three approaches —');
ok((await page.$$('.lub-tab')).length===3,'three zoning approaches as tabs');
const tabs=await page.$$eval('.lub-tab-name',e=>e.map(x=>x.textContent));
ok(tabs.some(t=>/Heavy Industrial/i.test(t)),'Approach A: General/Heavy Industrial');
ok(tabs.some(t=>/Light Industrial/i.test(t)),'Approach B: Business/Light Industrial');
ok(tabs.some(t=>/Direct Control/i.test(t)),'Approach C: Direct Control');

console.log('\n— tab switching —');
const first=await page.textContent('.lub-panel-title');
await page.click('[data-approach="approach-c"]');
await page.waitForTimeout(200);
const third=await page.textContent('.lub-panel-title');
ok(first!==third && /Direct Control/i.test(third),'clicking a tab switches the panel');
ok(/public hearing/i.test(await page.textContent('.lub-panel')),'DC panel covers public hearing timelines');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
ok(await page.textContent('.lub-panel-title')!==third,'arrow keys move between tabs');

console.log('\n— friction points —');
await page.click('[data-approach="approach-a"]');
await page.waitForTimeout(150);
const fr=await page.$$eval('.lub-frict-name',e=>e.map(x=>x.textContent));
ok(fr.some(t=>/FAR|coverage/i.test(t)),'FAR & site coverage present');
ok(fr.some(t=>/parking/i.test(t)),'minimum parking ratios present');
ok(fr.some(t=>/substation/i.test(t)),'substation classification present');

console.log('\n— expand a friction point —');
ok(await page.isHidden('#fr-parking'),'friction bodies start collapsed');
await page.click('[data-frict="parking"]');
await page.waitForTimeout(250);
ok(await page.isVisible('#fr-parking'),'clicking expands it');
const body=await page.textContent('#fr-parking');
ok(/asphalt/i.test(body),'parking friction explains the unused asphalt problem');
ok((await page.$$('#fr-parking .lub-mini th')).length===3,'per-approach comparison table has all three columns');

console.log('\n— tag filtering —');
ok((await page.$$('.lub-chip')).length===4,'All + three tag chips');
await page.click('[data-tag="custom-bylaw"]');
await page.waitForTimeout(250);
const shownTabs=(await page.$$('.lub-tab')).length;
const shownFr=(await page.$$('.lub-frict')).length;
ok(shownTabs<3,`custom-bylaw filter narrows approaches (${shownTabs} shown)`);
ok(shownFr<5,`custom-bylaw filter narrows friction points (${shownFr} shown)`);
ok(/Direct Control/i.test(await page.textContent('.lub-panel-title')),'a visible approach stays selected after filtering');
await page.click('[data-tag="all"]');
await page.waitForTimeout(200);
ok((await page.$$('.lub-tab')).length===3,'All restores every approach');

console.log('\n— existing page still works —');
ok((await page.$$('#matrix-body tr')).length>=6,'municipal matrix table still renders');
ok(await page.$('#detail-slot') !== null,'detail-by-municipality section intact');

ok(errors.length===0,`no console/page errors (${errors.length})`+(errors[0]?' — '+errors[0]:''));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
