import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
await mkdir('qa-results',{recursive:true});const out=await mkdtemp('qa-results/cycle-');
let server;const available=async()=>{try{return (await fetch('http://127.0.0.1:4183/',{signal:AbortSignal.timeout(500)})).ok;}catch{return false;}};
const stages=[];
try{
 if(!await available()){server=spawn(process.execPath,['qa-server.mjs','site/dist','4183'],{stdio:'ignore',windowsHide:true});for(let i=0;i<40&&!await available();i++)await delay(100);if(!await available())throw Error('Local server unavailable');}
 for(const [name,args] of [['functional',['tools/qa-suite.mjs','functional',out]],['responsive',['tools/qa-suite.mjs','responsive',out]],['visual',['tools/figma-qa/cli.mjs','run']]]){
  const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{stdio:'inherit',windowsHide:true});p.once('error',reject);p.once('exit',resolve);});stages.push({name,code});
 }
 await writeFile(out+'/cycle.json',JSON.stringify({createdAt:new Date().toISOString(),stages,visualReview:'Human approval required; technical PASS is not design approval'},null,2));console.log('Cycle report: '+out);process.exitCode=stages.some(s=>s.code!==0)?1:0;
}finally{server?.kill();}
