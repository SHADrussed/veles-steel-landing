import { readFile, writeFile, mkdir, mkdtemp, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { inspectPng } from './png.mjs';

export function projectPlaywright(root) {
  const require = createRequire(path.join(root, 'package.json'));
  for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
    let resolved;
    try { resolved = require.resolve(name); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') continue; throw e; }
    const module = require(resolved);
    if (module.chromium) return { chromium: module.chromium, package: name, resolved };
  }
  throw Error('Playwright not found in frontend project. Run npm install -D playwright, then npx playwright install chromium. No dependencies were installed automatically.');
}

const hash = b => createHash('sha256').update(b).digest('hex');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positive = n => Number.isInteger(n) && n > 0 && n <= 16384;
function localURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(u.hostname) || u.username || u.password) throw Error('baseURL must be local HTTP');
  return u;
}
export async function validateReference(m, root) {
  if (m.schemaVersion !== 1) throw Error('Unsupported manifest schemaVersion');
  const r = m.reference;
  if (!r || typeof r.path !== 'string' || !/^[a-f0-9]{64}$/i.test(r.sha256) || !/^\d+:\d+$/.test(r.nodeId)) throw Error('Invalid reference path, SHA-256 or nodeId');
  if (![r.width,r.height,m.viewport?.width,m.viewport?.height].every(positive)) throw Error('Invalid dimensions/viewport');
  if (r.width !== m.viewport.width || r.height !== m.viewport.height) throw Error('Reference dimensions must equal viewport at scale 1');
  if (typeof m.route !== 'string' || !m.route.startsWith('/') || m.route.startsWith('//')) throw Error('Missing or invalid route');
  const base = localURL(m.baseURL), target = new URL(m.route, base);
  if (target.origin !== base.origin) throw Error('Route must stay on local origin');
  const file = await realpath(path.resolve(root, r.path));
  const bytes = await readFile(file);
  const image = inspectPng(bytes);
  if (hash(bytes) !== r.sha256.toLowerCase()) throw Error('Reference SHA-256 mismatch');
  if (image.width !== r.width || image.height !== r.height) throw Error('Reference PNG dimensions mismatch');
  if (r.metadata) {
    const md = JSON.parse(await readFile(path.resolve(root,r.metadata),'utf8'));
    const entry = md.files?.find(f => f.kind === 'frame' && f.path === path.basename(file));
    if (md.schemaVersion !== 2 || md.errors?.length || md.exportScale !== 1 || md.node?.id !== r.nodeId || md.node.width !== r.width || md.node.height !== r.height || !entry || entry.sha256 !== hash(bytes) || entry.bytes !== bytes.length || entry.nodeId !== r.nodeId || entry.image.width !== image.width || entry.image.height !== image.height) throw Error('Downloader metadata mismatch');
  }
  return { file, bytes, image, target: target.href };
}
async function available(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(700), redirect:'error' }); await r.body?.cancel(); return r.ok; } catch { return false; }
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') await new Promise(resolve => {
    const p = spawn(path.join(process.env.SystemRoot || 'C:\\Windows','System32','taskkill.exe'), ['/pid',String(child.pid),'/t','/f'], { windowsHide:true, stdio:'ignore' }); p.on('exit',resolve); p.on('error',resolve);
  });
  else { try { process.kill(-child.pid,'SIGTERM'); } catch {child.kill('SIGTERM');} await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2000))]); try {process.kill(-child.pid,'SIGKILL');} catch {} }
  if(child.exitCode === null) child.kill();
  child.stdout?.destroy(); child.stderr?.destroy();
}
export async function run(manifestPath = 'qa.manifest.json') {
  const absolute = path.resolve(manifestPath), root = path.dirname(absolute);
  // A fixed output parent also permits reports for malformed manifests.
  const report = { startedAt:new Date().toISOString(), status:'FAIL', errors:[], jsErrors:[], consoleErrors:[], failedRequests:[], httpErrors:[], visualVerdict:'Manual review required; no pixel diff' };
  let m, ref, dir, browser, child, serverError, serverLog = '';
  try {
    m = JSON.parse(await readFile(absolute,'utf8'));
    // Validate before spawning any app or browser, and before copying reference bytes.
    ref = await validateReference(m,root);
    const output = path.resolve(root,m.outputDir || 'qa-results');
    await mkdir(output,{recursive:true});
    dir = await mkdtemp(path.join(output,'run-'));
    await writeFile(path.join(dir,'reference.png'),ref.bytes,{flag:'wx'});
    report.reference = { ...m.reference, sha256:hash(ref.bytes) };
    report.route = ref.target; report.viewport = m.viewport; report.deviceScaleFactor = 1;
    const timeout = m.timeoutMs ?? 15000;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) throw Error('Invalid timeoutMs');
    const ready = new URL(m.server?.readyPath || '/',m.baseURL);
    if (ready.origin !== new URL(m.baseURL).origin) throw Error('Invalid readyPath');
    if (await available(ready)) report.serverMode = 'existing';
    else {
      const command = m.server?.command;
      if (!Array.isArray(command) || !command.length || !command.every(x=>typeof x==='string')) throw Error('Local server unavailable; provide server.command array or start it manually');
      child = spawn(command[0] === 'node' ? process.execPath : command[0],command.slice(1),{cwd:root,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],shell:false});
      child.on('error',e=>{serverError=e;});
      for (const stream of [child.stdout,child.stderr]) stream.on('data',b=>{serverLog=(serverLog+b).slice(-20000);});
      const deadline=Date.now()+timeout;
      while (!(await available(ready))) {
        if(serverError || child.exitCode !== null) throw Error(`Server failed: ${serverError?.message || child.exitCode}`);
        if(Date.now()>deadline) throw Error('Server readiness timeout');
        await new Promise(r=>setTimeout(r,150));
      }
      report.serverMode='started';
    }
    // Reuse the host project's Playwright; no second runner or UI framework.
    const { chromium, package: playwrightPackage } = projectPlaywright(root);
    report.playwrightPackage = playwrightPackage;
    browser = await chromium.launch({headless:true,...(process.env.QA_BROWSER_CHANNEL ? {channel:process.env.QA_BROWSER_CHANNEL} : {})});
    report.browser = browser.version();
    const context = await browser.newContext({viewport:m.viewport,deviceScaleFactor:1,locale:m.locale||'en-US',timezoneId:m.timezoneId||'UTC',colorScheme:'light',reducedMotion:'reduce'});
    const page = await context.newPage();
    page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
    page.on('pageerror',e=>report.jsErrors.push(e.message));
    page.on('console',msg=>{if(msg.type()==='error') report.consoleErrors.push({text:msg.text(),location:msg.location()});});
    page.on('requestfailed',req=>report.failedRequests.push({url:req.url(),error:req.failure()?.errorText}));
    page.on('response',res=>{if(res.status()>=400) report.httpErrors.push({url:res.url(),status:res.status()});});
    const response = await page.goto(ref.target,{waitUntil:'load'});
    if (!response?.ok()) report.errors.push(`Route HTTP ${response?.status() ?? 'no response'}`);
    if (new URL(page.url()).origin !== new URL(m.baseURL).origin) throw Error('Page redirected outside local origin');
    if (response?.ok()) {
      if(m.readySelector) await page.locator(m.readySelector).first().waitFor({state:'visible'});
      await page.waitForFunction(async()=>{await document.fonts.ready; return document.fonts.status === 'loaded';},null,{timeout});
      await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete),null,{timeout});
      report.failedImages = await page.evaluate(()=>Array.from(document.images).filter(i=>!i.naturalWidth).map(i=>i.currentSrc));
      report.failedFonts = await page.evaluate(()=>Array.from(document.fonts).filter(f=>f.status==='error').map(f=>f.family));
      if(report.failedImages.length || report.failedFonts.length) report.errors.push('Image/font loading failed');
    }
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    report.overflow = await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth || 0),viewport:innerWidth}));
    if(report.overflow.scrollWidth > report.overflow.clientWidth) report.errors.push('Horizontal overflow');
    await page.screenshot({path:path.join(dir,'actual.png'),fullPage:false,animations:'disabled',caret:'hide',scale:'css'});
    report.actual = inspectPng(await readFile(path.join(dir,'actual.png')));
    if(report.actual.width !== m.viewport.width || report.actual.height !== m.viewport.height) report.errors.push('Screenshot dimensions mismatch');
    report.screenshot=true;
    await context.close();
  } catch(e) {report.errors.push(e.message);}
  finally {
    try {await browser?.close();} catch(e) {report.errors.push(`Browser cleanup: ${e.message}`);}
    await stop(child);
    if(ref) {
      try { report.referenceUnchanged = hash(await readFile(ref.file)) === hash(ref.bytes); if(!report.referenceUnchanged) report.errors.push('Reference changed during run'); } catch(e) {report.errors.push(e.message);}
    }
    if(!dir) {const parent=path.join(root,'qa-results');await mkdir(parent,{recursive:true});dir=await mkdtemp(path.join(parent,'run-'));}
    if(serverLog) await writeFile(path.join(dir,'server.log'),serverLog);
    if(!report.errors.length && !report.jsErrors.length && !report.consoleErrors.length && !report.failedRequests.length && !report.httpErrors.length) report.status='PASS';
    report.finishedAt=new Date().toISOString();
    const details=JSON.stringify(report,null,2);
    await writeFile(path.join(dir,'report.json'),details);
    const problems = [...report.errors,...report.jsErrors,...report.consoleErrors.map(e=>JSON.stringify(e)),...report.failedRequests.map(e=>JSON.stringify(e)),...report.httpErrors.map(e=>JSON.stringify(e))];
    await writeFile(path.join(dir,'summary.md'),`# Visual QA: ${report.status}\n\n${report.visualVerdict}\n\n- Route: ${report.route || 'not opened'}\n- Node: ${m?.reference?.nodeId || 'unknown'}\n- Viewport: ${report.viewport ? `${report.viewport.width}×${report.viewport.height}, deviceScaleFactor=1` : 'not opened'}\n- Original reference unchanged: ${report.referenceUnchanged ?? 'preflight failed'}\n- Overflow: ${report.overflow ? `${report.overflow.scrollWidth} / ${report.overflow.clientWidth}px` : 'not checked'}\n- JS / console / network / HTTP errors: ${report.jsErrors.length} / ${report.consoleErrors.length} / ${report.failedRequests.length} / ${report.httpErrors.length}\n\n[HTML comparison](./report.html) · [Full diagnostics](./report.json)\n\n## Errors\n\n${problems.length ? problems.map(e=>`- ${String(e).replace(/\n/g,' ')}`).join('\n') : 'None detected during capture.'}\n`);
    await writeFile(path.join(dir,'report.html'),`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Visual QA ${report.status}</title><style>body{font:16px system-ui;margin:24px;background:#f4f5f7}h1{color:${report.status==='PASS'?'#176139':'#b00020'}}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:20px}img{width:100%;border:1px solid #888}figure{margin:0;min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:16px}</style><h1>Visual QA: ${report.status}</h1><p>${esc(report.visualVerdict)}</p><p>${esc(report.route || 'Reference preflight failed')}</p><div class="comparison"><figure><h2>Figma reference</h2>${ref?'<a href="reference.png"><img src="reference.png" alt="Figma reference"></a>':'<p>Invalid reference; not displayed</p>'}</figure><figure><h2>Site viewport</h2>${report.screenshot?'<a href="actual.png"><img src="actual.png" alt="Site viewport"></a>':'<p>Screenshot unavailable</p>'}</figure></div><h2>Diagnostics</h2><pre>${esc(details)}</pre></html>`);
  }
  console.log(`${report.status}: ${dir}`);
  return {report,dir};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv[2]).then(({report})=>{process.exitCode=report.status==='PASS'?0:1;}).catch(e=>{console.error(e);process.exitCode=1;});
}
