import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export function reserve(ledger,id){
 const issue=ledger.issues.find(x=>x.id===id);if(!issue)throw Error('Unknown issue; record evidence first');
 if(issue.state!=='confirmed')throw Error('STOP: issue needs clarification or is already resolved');
 if(issue.attempts>=3)throw Error('STOP: three correction cycles exhausted; ask the user');
 issue.attempts++;return issue;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const file='qa-issues.json';const ledger=JSON.parse(await readFile(file,'utf8'));const issue=reserve(ledger,process.argv[2]);await writeFile(file,JSON.stringify(ledger,null,2)+'\n');console.log(`Reserved cycle ${issue.attempts}/3 for ${issue.id}. Apply one correction, run npm run qa:cycle, record outcome. Do not run concurrently.`);
}
