import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

test('all forms: validation, pending lock, server acknowledgement, failures and retry',async()=>{
 const server=spawn(process.execPath,['qa-server.mjs','site/dist','0'],{stdio:['ignore','pipe','inherit']});
 let browser;
 try{
  const base=await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.once('exit',code=>reject(new Error(`QA server exited: ${code}`)));
   server.stdout.on('data',data=>{const match=data.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});
  });
  browser=await chromium.launch();
  for(const route of ['index','about','catalog','calculator','material']){
   const page=await browser.newPage();let submissions=0,respond;
   await page.route('**/api/leads',async r=>{submissions++;respond=r;});
   await page.goto(`${base}/${route}.html`);
   const submit=page.locator('#request-form button[type=submit]'),status=page.locator('#form-status');
   await submit.click();assert.equal(submissions,0);
   await page.locator('#name').fill('  ');await page.locator('#phone').fill('aaaaaaaaaa');await page.locator('#email').fill('qa@example.invalid');await page.locator('#order').fill('Local fixture');await submit.click();assert.equal(submissions,0);
   await page.locator('#name').fill('QA Test');await page.locator('#phone').fill('+7 999 123 45 67');
   await submit.click();await page.waitForFunction(()=>document.querySelector('#request-form').getAttribute('aria-busy')==='true');
   for(let i=0;i<40&&!respond;i++)await delay(25);
   assert.equal(await submit.isDisabled(),true);assert.match(await status.textContent(),/Отправляем/);
   await page.locator('#request-form').evaluate(f=>f.dispatchEvent(new Event('submit',{cancelable:true})));
   assert.equal(submissions,1);
   const payload=respond.request().postDataJSON();assert.equal(payload.source,route);assert.equal(payload.order,'Local fixture');
   await respond.fulfill({status:502,json:{detail:'Sheets unavailable'}});
   await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('Не удалось'));
   assert.equal(await page.locator('#order').inputValue(),'Local fixture');assert.equal(await submit.isEnabled(),true);
   // A 200 without explicit acknowledgement must also fail.
   respond=null;await submit.click();for(let i=0;i<40&&!respond;i++)await delay(25);
   await respond.fulfill({json:{ok:false}});await page.waitForFunction(()=>!document.querySelector('#request-form').hasAttribute('aria-busy'));
   assert.match(await status.textContent(),/Не удалось/);
   respond=null;await submit.click();for(let i=0;i<40&&!respond;i++)await delay(25);
   await respond.fulfill({status:200,body:'not JSON'});await page.waitForFunction(()=>!document.querySelector('#request-form').hasAttribute('aria-busy'));
   assert.match(await status.textContent(),/Не удалось/);
   respond=null;await submit.click();for(let i=0;i<40&&!respond;i++)await delay(25);
   await respond.abort();await page.waitForFunction(()=>!document.querySelector('#request-form').hasAttribute('aria-busy'));assert.match(await status.textContent(),/Не удалось/);
   respond=null;await submit.click();for(let i=0;i<40&&!respond;i++)await delay(25);
   await respond.fulfill({json:{ok:true}});await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('Заявка принята'));
   assert.equal(await submit.isDisabled(),true);await page.close();
  }
 }finally{await browser?.close();server.kill();}
});
