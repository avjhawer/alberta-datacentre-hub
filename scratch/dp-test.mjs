/* Drive the DP review tool like a planner would, and assert the behaviour. */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8765';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/permits.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

console.log('\n— entering project parameters —');
await page.fill('[data-param="capacityMW"]', '150');
await page.selectOption('[data-param="gridStatus"]', 'queued');
await page.selectOption('[data-param="coolingType"]', 'evaporative');
await page.selectOption('[data-param="waterSource"]', 'groundwater');
await page.fill('[data-param="municipality"]', 'Rocky View County');
await page.fill('[data-param="nearestReceptorM"]', '400');
await page.waitForTimeout(300);

const findingTitles = await page.$$eval('.finding-title', els => els.map(e => e.textContent.trim()));
ok(findingTitles.some(t => /large data centre threshold/i.test(t)), '150 MW triggers the 75 MW large-DC threshold');
ok(findingTitles.some(t => /fully allocated/i.test(t)), 'queued connection triggers the AESO cap finding');
ok(findingTitles.some(t => /Evaporative cooling/i.test(t)), 'evaporative cooling triggers a water finding');
ok(findingTitles.some(t => /own authorisation/i.test(t)), 'groundwater triggers the licence question');
ok(findingTitles.some(t => /receptor within 1 km/i.test(t)), '400 m receptor triggers the noise finding');
ok(findingTitles.some(t => /Rocky View/i.test(t)), 'municipality pulls a finding from the matrix');

console.log('\n— requirement vs question separation —');
const badges = await page.$$eval('.finding .badge', els => els.map(e => e.textContent.trim()));
ok(badges.some(b => /Requirement/i.test(b)), 'primary-sourced rules render as Requirement');
ok(badges.some(b => /To establish/i.test(b)), 'unsourced rules render as To establish');
const unverifiedAsReq = await page.$$eval('.finding', els => els.filter(el =>
  /Requirement/i.test(el.querySelector('.badge')?.textContent || '') &&
  !/Primary/i.test(el.querySelector('.finding-foot')?.textContent || '')).length);
ok(unverifiedAsReq === 0, 'no non-primary finding is presented as a Requirement');

console.log('\n— below-threshold behaviour —');
await page.fill('[data-param="capacityMW"]', '40');
await page.waitForTimeout(250);
const t2 = await page.$$eval('.finding-title', els => els.map(e => e.textContent.trim()));
ok(t2.some(t => /Below the 75 MW/i.test(t)), '40 MW shows the below-threshold note');
ok(!t2.some(t => /Meets the large data centre/i.test(t)), '40 MW no longer shows the large-DC requirement');

console.log('\n— assessing a criterion —');
await page.click('.area.is-collapsed .area-head');
await page.waitForTimeout(150);
const firstStatus = await page.$('.status-seg .seg-btn');
await firstStatus.click();
await page.waitForTimeout(200);
ok((await page.$$('.crit[data-status="met"]')).length >= 1, 'clicking a status marks the criterion');

console.log('\n— persistence across reload —');
await page.fill('[data-param="capacityMW"]', '99');
await page.waitForTimeout(250);
await page.reload({ waitUntil: 'networkidle' });
ok(await page.inputValue('[data-param="capacityMW"]') === '99', 'parameters survive a reload');
ok((await page.$$('.crit[data-status="met"]')).length >= 1, 'assessment survives a reload');

console.log('\n— multiple projects —');
await page.click('#btn-new');
await page.waitForTimeout(200);
ok((await page.$$('.proj-card')).length === 2, 'a second review can be created');

console.log('\n— delete and undo —');
page.on('dialog', d => d.accept());
const before = (await page.$$('.proj-card')).length;
await page.hover('.proj-card');
await page.click('.proj-card [data-del]');
await page.waitForTimeout(300);
const after = (await page.$$('.proj-card')).length;
ok(after === before - 1, 'delete removes the review');
ok(await page.isVisible('#undo-bar'), 'an undo bar appears after deleting');
await page.click('#undo-btn');
await page.waitForTimeout(250);
ok((await page.$$('.proj-card')).length === before, 'undo restores the deleted review');

console.log('\n— delete persists after reload —');
await page.hover('.proj-card');
await page.click('.proj-card [data-del]');
await page.waitForTimeout(250);
const afterDel = (await page.$$('.proj-card')).length;
await page.reload({ waitUntil: 'networkidle' });
ok((await page.$$('.proj-card')).length === afterDel, 'deletion is persisted, not just visual');

console.log('\n— v1 migration —');
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('adch.reviews.v1', JSON.stringify({
    activeId: 'old1',
    reviews: [{ id: 'old1', name: 'Legacy review', municipality: 'Sturgeon County',
                capacityMW: '88', created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
                items: { 'lu-1': { status: 'met', note: 'carried over' } } }],
  }));
});
await page.reload({ waitUntil: 'networkidle' });
ok((await page.textContent('.proj-name')).includes('Legacy review'), 'a v1 review is migrated, not lost');
ok(await page.inputValue('[data-param="capacityMW"]') === '88', 'v1 capacity carries into params');
const noteVal = await page.$$eval('.crit-note', els => els.map(e => e.value).filter(Boolean));
ok(noteVal.some(v => /carried over/.test(v)), 'v1 note survives migration');

ok(errors.length === 0, `no console/page errors (${errors.length})` + (errors[0] ? ' — ' + errors[0] : ''));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
