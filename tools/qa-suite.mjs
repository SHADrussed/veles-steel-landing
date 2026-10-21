import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const mode=process.argv[2]||'responsive', out=process.argv[3]||'qa-results/manual';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
const base='http://127.0.0.1:4183';
const routes=['/','/about.html','/calculator.html','/material.html','/catalog.html?category=nonferrous','/catalog.html?category=black','/catalog.html?category=pipes','/catalog.html?category=chemical','/catalog.html?category=nonferrous&product=sheet'];
async function check(name,fn,width=320){
 const context=await browser.newContext({viewport:{width,height:width===320?568:900},deviceScaleFactor:1,reducedMotion:'reduce'});
 const errors=[],external=[];await context.route('**/*',r=>{if(new URL(r.request().url()).origin===base)return r.continue();external.push(r.request().url());return r.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});page.on('requestfailed',r=>errors.push(r.failure()?.errorText+' '+r.url()));
 let detail;try{detail=await fn(page);assert.deepEqual(errors,[],'Browser errors');assert.deepEqual(external,[],'External request attempted');results.push({name,width,status:'PASS',detail,errors});}catch(e){results.push({name,width,status:'FAIL',error:e.message,detail,errors});}finally{await context.close();}
}
async function goto(page,route){const r=await page.goto(base+route);assert.equal(r.status(),200);await page.evaluate(()=>document.fonts.ready);}
if(mode==='responsive'){
 for(const width of [320,390,960,1440,1920])for(const [i,route] of routes.entries())await check(route,async page=>{
  await goto(page,route);
  const metrics=await page.evaluate(()=>{
   const clippedText=[];const walker=document.createTreeWalker(document.querySelector('main'),NodeFilter.SHOW_TEXT);
   while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(!n.textContent.trim()||p.closest('.catalog-table-scroll,.visually-hidden'))continue;
    if(!p.checkVisibility({checkVisibilityCSS:true}))continue;const range=document.createRange();range.selectNodeContents(n);
    for(const r of range.getClientRects())if(r.width&&(r.right>innerWidth+1||r.left< -1))clippedText.push({text:n.textContent.trim().slice(0,80),left:r.left,right:r.right});
   }
   const clippedProductText=[];
   for(const element of document.querySelectorAll('.product h3,.product .tags')){
    if(!element.checkVisibility({checkVisibilityCSS:true}))continue;
    const card=element.closest('.product').getBoundingClientRect(),w=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    while(w.nextNode()){if(!w.currentNode.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(w.currentNode);for(const box of r.getClientRects())if(box.width&&(box.left<card.left-1||box.right>card.right+1))clippedProductText.push(w.currentNode.textContent.trim());}
   }
   const tags=document.querySelector('.product--black .tags'),visual=document.querySelector('.product--black .product__visual');
   const productOverlap=Boolean(tags?.checkVisibility({checkVisibilityCSS:true})&&visual&&tags.getBoundingClientRect().bottom>visual.getBoundingClientRect().top+1);
   return {viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,clippedText,clippedProductText,productOverlap};
  });
  const screenshot=`${width}-${i}.png`;await page.screenshot({path:out+'/'+screenshot,fullPage:true});
  // Preserve measurements even on a failing assertion.
  await writeFile(out+`/${width}-${i}.json`,JSON.stringify({route,...metrics},null,2));
  assert.ok(metrics.document<=width+1&&metrics.body<=width+1,JSON.stringify(metrics));assert.deepEqual(metrics.clippedText,[],'Text outside viewport');assert.deepEqual(metrics.clippedProductText,[],'Text clipped by product card');assert.equal(metrics.productOverlap,false,'Product illustration overlaps category text');
  return {route,...metrics,screenshot};
 },width);
}else if(mode==='functional'){
 for(const route of ['/','/about.html','/calculator.html','/catalog.html','/material.html'])await check('menu '+route,async page=>{
  await goto(page,route);const toggle=page.locator('.menu-toggle');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#navigation').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await toggle.evaluate(e=>e===document.activeElement),true);
  await toggle.click();await page.locator('#navigation a').first().click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 });
 await check('calculator → material URL → order',async page=>{
  await goto(page,'/calculator.html');await page.locator('#calc-tonnes').fill('2');const product=await page.locator('#calc-product').inputValue();assert.ok((await page.locator('#order').inputValue()).includes('Тонны: 2'));
  await page.locator('[data-material-link]').click();assert.ok(page.url().includes('material='));assert.ok((await page.locator('#order').inputValue()).includes(product));
 });
 await check('catalog keyboard → table → scroll → request',async page=>{
  await goto(page,'/catalog.html');await page.locator('.catalog-card__action').first().focus();await page.keyboard.press('Enter');assert.ok(page.url().includes('product=sheet'));
  const scroll=page.locator('.catalog-table-scroll');assert.ok(await scroll.evaluate(e=>e.scrollWidth>e.clientWidth));await scroll.evaluate(e=>e.scrollLeft=e.scrollWidth);await page.locator('.catalog-table__contact').first().click();assert.ok((await page.locator('#order').inputValue()).length>0);
  await page.locator('.catalog-back').click();assert.equal(await page.locator('.catalog-card').count()>0,true);
 });
 await check('catalog category and history',async page=>{
  await goto(page,'/catalog.html');await page.locator('.catalog-tab[href*="black"]').click();assert.ok(page.url().includes('category=black'));assert.ok((await page.locator('[data-catalog-title]').textContent()).replaceAll('ё','е').includes('Черный'));await page.goBack();assert.ok((await page.locator('[data-catalog-title]').textContent()).includes('Цветной'));
 });
 await check('demo form validation and no network submission',async page=>{
  await goto(page,'/');const sent=[];page.on('request',r=>{if(r.method()!=='GET')sent.push(r.method());});
  await page.locator('#request-form button[type=submit]').click();assert.equal(await page.locator('#form-status').isVisible(),false);
  await page.locator('#name').fill('QA Test');await page.locator('#phone').fill('+7 999 123 45 67');await page.locator('#email').fill('qa@example.invalid');await page.locator('#order').fill('QA local test');await page.locator('#request-form button[type=submit]').click();assert.equal(await page.locator('#form-status').isVisible(),true);assert.ok((await page.locator('#form-status').textContent()).includes('не отправлена'));assert.deepEqual(sent,[]);
 });
 await check('catalog: steel classification and category destinations',async page=>{
  await goto(page,'/catalog.html?category=nonferrous');assert.doesNotMatch(await page.locator('[data-catalog-cards]').textContent(),/Нержавеющие|Коррозионные|Инструментальные/);
  await page.locator('.catalog-tab[href*="black"]').click();assert.equal(await page.locator('[data-catalog-title]').textContent(),'Чёрный и нержавеющий металлопрокат');
  for(const name of ['Нержавеющие стали','Коррозионные стали','Инструментальные стали'])assert.ok((await page.locator('[data-catalog-cards]').textContent()).includes(name));
  await page.locator('.catalog-tab[href*="chemical"]').click();assert.equal(await page.locator('[data-catalog-title]').textContent(),'Химическая продукция');assert.doesNotMatch(await page.locator('[data-catalog-cards]').textContent(),/Нержавеющие|Коррозионные|Инструментальные/);
  // The catalog footer column is intentionally hidden on mobile; exercise its link at desktop width.
  await page.setViewportSize({width:1920,height:1000});await page.locator('.footer a[href="catalog.html?category=black"]').filter({hasText:'специальные стали'}).click();assert.equal(new URL(page.url()).searchParams.get('category'),'black');
 });
 await check('homepage: Catalog heading and History destination',async page=>{
  await goto(page,'/');assert.equal((await page.locator('#products-title').textContent()).trim(),'Каталог');assert.doesNotMatch(await page.locator('.product--color').textContent(),/Нержавеющие/);assert.match(await page.locator('.product--black').textContent(),/нержавеющий/);
  await page.getByRole('link',{name:'Наша история',exact:true}).click();assert.equal(new URL(page.url()).pathname,'/about.html');assert.equal(await page.locator('.about-hero').isVisible(),true);
 });
 await check('explicit mobile Home link on every page',async page=>{
  for(const route of ['/','/about.html','/calculator.html','/catalog.html','/material.html']){
   await goto(page,route);await page.locator('.menu-toggle').click();const home=page.locator('#navigation').getByRole('link',{name:'Главная страница',exact:true});assert.equal(await home.count(),1);assert.equal(await home.isVisible(),true);const rect=await home.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=321);await home.click();assert.equal(new URL(page.url()).pathname,'/index.html');
  }
 });
}else throw Error('Unknown suite');
await browser.close();const report={mode,createdAt:new Date().toISOString(),passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results};await writeFile(out+'/'+mode+'.json',JSON.stringify(report,null,2));console.log(`${mode}: ${report.passed} PASS, ${report.failed} FAIL → ${out}`);for(const r of results.filter(r=>r.status==='FAIL'))console.log(r.name,r.width,r.error);process.exitCode=report.failed?1:0;
