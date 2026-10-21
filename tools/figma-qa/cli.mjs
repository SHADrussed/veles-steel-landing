#!/usr/bin/env node
import { readFile, writeFile, mkdir, mkdtemp, rename, unlink, rmdir, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { validateReference, projectPlaywright, run } from './runner.mjs';
import { inspectPng } from './png.mjs';

const SOURCE = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['cli.mjs','runner.mjs','png.mjs','package.json','README.md'];
const TOOL = 'tools/figma-qa';
const STATE = '.figma-qa/install.json';
const sha = b => createHash('sha256').update(b).digest('hex');
const json = b => JSON.parse(b.toString('utf8'));
const slash = p => p.split(path.sep).join('/');
const plain = o => o && typeof o === 'object' && !Array.isArray(o);
async function stat(p) { try { return await lstat(p); } catch(e) { if(e.code==='ENOENT') return null; throw e; } }
async function regular(p, type) {
  const s=await stat(p);
  if(s && (s.isSymbolicLink() || (type==='dir'?!s.isDirectory():!s.isFile()))) throw Error(`Refusing symlink or non-${type}: ${p}`);
  return s;
}
async function paths(root) {
  for(const name of ['package.json','tools','.figma-qa',TOOL,STATE]) await regular(path.join(root,name),name.endsWith('.json')?'file':'dir');
}
function formatPackage(value, original) {
  const indent=original.match(/\n([\t ]+)"/)?.[1] || '  ';
  return JSON.stringify(value,null,indent)+(original.endsWith('\n')?'\n':'');
}
async function replaceChecked(file, bytes, expected) {
  await regular(file,'file');
  if(sha(await readFile(file))!==sha(expected)) throw Error(`File changed concurrently: ${file}`);
  const temp=file+`.figma-qa-${process.pid}.tmp`;
  await writeFile(temp,bytes,{flag:'wx'});
  try {
    if(sha(await readFile(file))!==sha(expected)) throw Error(`File changed concurrently: ${file}`);
    await rename(temp,file);
  } finally {if(await stat(temp))await unlink(temp);}
}
async function sourceFiles() {
  const result={};for(const name of FILES)result[name]=await readFile(path.join(SOURCE,name));
  const pkg=json(result['package.json']);
  if(pkg.name!=='local-figma-qa-bridge')throw Error('Invalid distribution');
  return {result,version:pkg.version};
}
async function readProject(project) {
  const root=await realpath(path.resolve(project || '.'));await paths(root);
  const packageFile=path.join(root,'package.json'),original=await readFile(packageFile),pkg=json(original);
  if(!plain(pkg) || (pkg.scripts!==undefined&&!plain(pkg.scripts)))throw Error('Invalid package.json/scripts');
  return {root,packageFile,original,pkg};
}
async function installation(root) {
  await paths(root);
  const state=json(await readFile(path.join(root,STATE)));
  if(state.schemaVersion!==1 || state.tool!==TOOL || !plain(state.hashes) || !plain(state.scripts) || Object.keys(state.hashes).sort().join()!==[...FILES].sort().join()) throw Error('Invalid ownership state');
  const names=await readdir(path.join(root,TOOL));
  if(names.sort().join()!==[...FILES].sort().join())throw Error('Installed tool contains unexpected files; nothing overwritten/deleted');
  for(const name of FILES){
    const f=path.join(root,TOOL,name);await regular(f,'file');
    if(sha(await readFile(f))!==state.hashes[name])throw Error(`Locally modified tool: ${name}; nothing overwritten/deleted`);
  }
  return state;
}
async function removeTool(dir) {
  // Only explicit known files in a previously verified owned directory; no recursive removal.
  for(const name of FILES)await unlink(path.join(dir,name));
  await rmdir(dir);
}
function ensureScripts(pkg,state) {
  for(const [key,value] of Object.entries(state.scripts))if(pkg.scripts?.[key]!==value)throw Error(`Managed npm script changed: ${key}; refusing to overwrite/delete`);
}
export async function install(options={}) {
  const {root,packageFile,original,pkg}=await readProject(options.project);
  if(await stat(path.join(root,STATE))){const state=await installation(root);ensureScripts(pkg,state);return {status:'already-installed',version:state.version,root};}
  if(await stat(path.join(root,TOOL)))throw Error(`${TOOL} already exists without ownership; choose another project or resolve it manually`);
  const script=options.script||'qa:visual',configureScript=options['configure-script']||'qa:configure';
  if(script===configureScript || ![script,configureScript].every(s=>/^[\w:.-]+$/.test(s)))throw Error('Invalid script names');
  const scripts=Object.fromEntries([[script,`node ${TOOL}/cli.mjs run`],[configureScript,`node ${TOOL}/cli.mjs configure`]]);
  for(const key of Object.keys(scripts))if(Object.hasOwn(pkg.scripts||{},key))throw Error(`npm script ${key} already exists; nothing changed. Use --script / --configure-script with free names. Existing scripts are never replaced.`);
  const {result,version}=await sourceFiles();
  await mkdir(path.join(root,'tools'),{recursive:true});await mkdir(path.join(root,'.figma-qa'),{recursive:true});
  const stage=await mkdtemp(path.join(root,'tools','.figma-qa-stage-'));
  const state={schemaVersion:1,tool:TOOL,version,scripts,hashes:Object.fromEntries(FILES.map(n=>[n,sha(result[n])]))};
  let moved=false,packageChanged=false,stateWritten=false;
  const updated=formatPackage({...pkg,scripts:{...pkg.scripts,...scripts}},original.toString());
  try {
    for(const n of FILES)await writeFile(path.join(stage,n),result[n],{flag:'wx'});
    if(await stat(path.join(root,TOOL)))throw Error('Tool appeared concurrently');
    await rename(stage,path.join(root,TOOL));moved=true;
    await writeFile(path.join(root,STATE),JSON.stringify(state,null,2)+'\n',{flag:'wx'});stateWritten=true;
    await replaceChecked(packageFile,updated,original);packageChanged=true;
  }catch(e){
    if(packageChanged)await replaceChecked(packageFile,original,Buffer.from(updated));
    if(stateWritten)await unlink(path.join(root,STATE));
    await removeTool(moved?path.join(root,TOOL):stage).catch(()=>{});throw e;
  }
  let playwright;try{playwright=projectPlaywright(root).package;}catch{playwright='missing: npm install -D playwright; npx playwright install chromium';}
  return {status:'installed',root,version,scripts,playwright,configuration:'npm run '+configureScript+' -- --help'};
}
export async function update(options={}) {
  const {root,pkg}=await readProject(options.project),state=await installation(root);ensureScripts(pkg,state);
  const {result,version}=await sourceFiles();
  if(FILES.every(n=>sha(result[n])===state.hashes[n]))return {status:'up-to-date',root,version};
  const stage=await mkdtemp(path.join(root,'tools','.figma-qa-stage-'));
  const backup=stage+'-backup';let moved=false,replaced=false;
  const statePath=path.join(root,STATE),oldState=await readFile(statePath);
  try{
    for(const n of FILES)await writeFile(path.join(stage,n),result[n],{flag:'wx'});
    await installation(root);
    await rename(path.join(root,TOOL),backup);moved=true;
    await rename(stage,path.join(root,TOOL));replaced=true;
    await replaceChecked(statePath,JSON.stringify({...state,version,hashes:Object.fromEntries(FILES.map(n=>[n,sha(result[n])]))},null,2)+'\n',oldState);
  }catch(e){
    if(replaced)await removeTool(path.join(root,TOOL));
    if(moved)await rename(backup,path.join(root,TOOL));
    if(await stat(stage))await removeTool(stage).catch(()=>{});throw e;
  }
  await removeTool(backup);
  return {status:'updated',root,version,retained:'manifests, references, reports, npm scripts and project dependencies'};
}
export async function uninstall(options={}) {
  const {root,packageFile,original,pkg}=await readProject(options.project),state=await installation(root);ensureScripts(pkg,state);
  // Keep a reversible private backup until package.json and ownership are committed.
  const backup=path.join(root,'tools',`.figma-qa-remove-${process.pid}`);
  if(await stat(backup))throw Error('Removal backup already exists');
  const scripts={...pkg.scripts};for(const key of Object.keys(state.scripts))delete scripts[key];
  const updated=formatPackage({...pkg,scripts},original.toString());
  await rename(path.join(root,TOOL),backup);
  let changed=false;
  try{await replaceChecked(packageFile,updated,original);changed=true;await unlink(path.join(root,STATE));}
  catch(e){if(changed)await replaceChecked(packageFile,original,Buffer.from(updated));await rename(backup,path.join(root,TOOL));throw e;}
  await removeTool(backup);
  return {status:'uninstalled',root,retained:'all manifests, PNG/metadata, reports, dependencies and unrelated scripts'};
}
export function detectServer(root, pkg, baseURL, framework='auto') {
  const declared={...pkg.dependencies,...pkg.devDependencies};
  const selected=framework==='auto'?(declared.next?'next':declared.vite?'vite':'existing'):framework;
  if(selected==='existing')return {framework:selected};
  if(!['vite','next'].includes(selected))throw Error('framework must be auto, vite, next or existing');
  const require=createRequire(path.join(root,'package.json'));
  const packageFile=require.resolve(selected+'/package.json');
  const bin=selected==='vite'?'bin/vite.js':'dist/bin/next';
  const entry=slash(path.relative(root,path.join(path.dirname(packageFile),bin)));
  const port=new URL(baseURL).port || '80';
  const command=selected==='vite'?['node',entry,'--host','127.0.0.1','--port',port,'--strictPort']:['node',entry,'dev','--hostname','127.0.0.1','--port',port];
  return {framework:selected,server:{command,readyPath:'/'}};
}
export async function configure(options={}) {
  const {root,pkg}=await readProject(options.project);
  const name=options.name||'default';if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(name))throw Error('name must be lowercase letters/digits/hyphens');
  const manifestName=name==='default'?'qa.manifest.json':`qa.${name}.manifest.json`;
  const manifestPath=path.join(root,manifestName),referenceDir=path.join(root,'.figma-qa','references',name);
  await regular(path.join(root,'.figma-qa/references'),'dir');
  if(await stat(manifestPath) || await stat(referenceDir))throw Error(`Manifest/reference already exists for ${name}; nothing changed. Choose a new --name to configure another route/reference.`);
  if(!options.route)throw Error('--route is required');
  let metadata,metadataFile,referenceFile;
  if(options.metadata){
    metadataFile=path.resolve(options.metadata);metadata=json(await readFile(metadataFile));
    const candidates=metadata.files?.filter(f=>f.kind==='frame'&&f.format==='png'&&(!options['node-id']||f.nodeId===options['node-id']))||[];
    if(candidates.length!==1)throw Error('Metadata must select exactly one PNG frame; provide --node-id');
    referenceFile=path.resolve(path.dirname(metadataFile),candidates[0].path);
  }
  if(options.reference)referenceFile=path.resolve(options.reference);
  if(!referenceFile)throw Error('Provide --metadata Downloader metadata.json, or --reference PNG plus --node-id');
  const bytes=await readFile(referenceFile),image=inspectPng(bytes);
  const nodeId=options['node-id']||metadata?.node?.id;
  const viewport=options.viewport?.match(/^(\d+)x(\d+)$/);
  if(options.viewport&&!viewport)throw Error('--viewport expects WIDTHxHEIGHT');
  const baseURL=options['base-url']||'http://127.0.0.1:4173';
  const m={schemaVersion:1,reference:{path:referenceFile,sha256:sha(bytes),width:image.width,height:image.height,nodeId,...(metadataFile?{metadata:metadataFile}:{})},route:options.route,viewport:viewport?{width:Number(viewport[1]),height:Number(viewport[2])}:{width:image.width,height:image.height},baseURL,readySelector:options['ready-selector']||'main',timeoutMs:Number(options.timeout||30000),outputDir:'.figma-qa/results'};
  // The very same preflight as runtime; no writing on invalid PNG/SHA/metadata/route.
  await validateReference(m,root);
  if(!Number.isInteger(m.timeoutMs)||m.timeoutMs<100||m.timeoutMs>120000)throw Error('Invalid --timeout');
  const detected=options['server-command']?{framework:'custom'}:detectServer(root,pkg,baseURL,options.framework||'auto');
  if(options['server-command']){
    const command=JSON.parse(options['server-command']);
    if(!Array.isArray(command)||!command.length||!command.every(s=>typeof s==='string'))throw Error('--server-command must be a JSON argv array');
    m.server={command,readyPath:'/'};
  }else if(detected.server)m.server=detected.server;
  await mkdir(path.dirname(referenceDir),{recursive:true});
  await mkdir(referenceDir);let manifestWritten=false;
  try{
    await writeFile(path.join(referenceDir,path.basename(referenceFile)),bytes,{flag:'wx'});
    m.reference.path=slash(path.relative(root,path.join(referenceDir,path.basename(referenceFile))));
    if(metadataFile){
      const metadataName='downloader.metadata.json';
      await writeFile(path.join(referenceDir,metadataName),await readFile(metadataFile),{flag:'wx'});
      m.reference.metadata=slash(path.relative(root,path.join(referenceDir,metadataName)));
    }
    await validateReference(m,root);
    await writeFile(manifestPath,JSON.stringify(m,null,2)+'\n',{flag:'wx'});manifestWritten=true;
  }catch(e){
    if(manifestWritten)await unlink(manifestPath);
    // Delete only the explicit copies created by this operation.
    for(const n of [path.basename(referenceFile),'downloader.metadata.json'])if(await stat(path.join(referenceDir,n)))await unlink(path.join(referenceDir,n));
    await rmdir(referenceDir);throw e;
  }
  return {status:'configured',manifest:manifestName,framework:detected.framework,sha256:sha(bytes),viewport:m.viewport,run:`npm run qa:visual${name==='default'?'':` -- ${manifestName}`}`};
}
const help=`Figma QA Bridge 0.1.0 — local tool, Node >=22.12

  node /path/to/figma-qa-bridge/cli.mjs install --project /frontend
    [--script qa:visual] [--configure-script qa:configure]
  npm run qa:configure -- --metadata /export/metadata.json --route /page
    [--name second] [--node-id 1:2] [--viewport 1920x1000]
    [--reference /export/frame.png] [--base-url http://127.0.0.1:4173]
    [--framework auto|vite|next|existing] [--server-command '["node","server.mjs"]']
    [--ready-selector main] [--timeout 30000]
  npm run qa:visual [-- qa.second.manifest.json]
  node /new-release/cli.mjs update --project /frontend
  node tools/figma-qa/cli.mjs uninstall [--project /frontend]
  node tools/figma-qa/cli.mjs doctor [--project /frontend]

Existing scripts/configs are never replaced. Configure creates a NEW immutable
reference copy; changing the baseline requires a new --name. No MCP setup,
dependency installation, app/CSS changes, pixel diff or automatic baseline updates.
`;
export async function main(args=process.argv.slice(2)) {
  const {values:o,positionals}=parseArgs({args,allowPositionals:true,options:Object.fromEntries(['project','script','configure-script','name','metadata','reference','route','node-id','viewport','base-url','framework','server-command','ready-selector','timeout'].map(k=>[k,{type:'string'}]).concat([['help',{type:'boolean',short:'h'}]]))});
  if(o.help || !positionals.length){console.log(help);return;}
  const [command,arg,...extra]=positionals;
  if(extra.length || (arg && command!=='run'))throw Error('Unexpected positional arguments');
  if(['install','update','uninstall','configure'].includes(command)){console.log(JSON.stringify(await ({install,update,uninstall,configure}[command](o)),null,2));return;}
  if(command==='doctor'){
    const {root,pkg}=await readProject(o.project);let playwright;
    try{const p=projectPlaywright(root);playwright={package:p.package,browserExecutable:p.chromium.executablePath(),browserInstalled:Boolean(await stat(p.chromium.executablePath()))};}catch(e){playwright={error:e.message};}
    console.log(JSON.stringify({root,playwright,framework:pkg.dependencies?.next||pkg.devDependencies?.next?'next':pkg.dependencies?.vite||pkg.devDependencies?.vite?'vite':'generic'},null,2));return;
  }
  if(command==='run'){
    if(o.project)throw Error('Run from frontend project root; --project is for management commands');
    const {report}=await run(arg);process.exitCode=report.status==='PASS'?0:1;return;
  }
  throw Error('Unknown command; use --help');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(`Figma QA: ${e.message}`);process.exitCode=1;});
