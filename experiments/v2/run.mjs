// Future-only protocol. The published harness and data remain immutable.
import { existsSync,mkdirSync,lstatSync,writeFileSync,readFileSync,readdirSync } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';
import { resolve,relative,dirname,sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installAdaptiveTransport,PROTOCOL,readOwnedState } from './adaptive-transport.mjs';
const ARCHIVED='8974089727fc1714179f88cdd8f6cdec85ddfe1b';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceHashes={
 'dev/benchmark/run.ts':'73fab2b5a6a5781292a94670b5b24922e6d5aceba9c05d7acfa575a142a6b90f',
 'dev/benchmark/lib.ts':'0b256203a8045c388c800d8395b40b1dc7af59036767e03e29230d02319500c3',
 'dev/benchmark/data/mmlupro-100.json':'8cebae4a2d69514bdbdc321a5b2bcfb5bcb6dff17427435095abedb3935f0203',
 'dev/benchmark/data/simpleqa-100.json':'a08edf218d8245b875b37cc6a0046cf7fa8a14a2b865140e8aa5c3b88cfecf1d'
};
for(const [path,expected]of Object.entries(sourceHashes)){
 noLinks(resolve(root,path));
 const actual=createHash('sha256').update(readFileSync(resolve(root,path),'utf8').replace(/\r\n/g,'\n')).digest('hex');
 if(actual!==expected)throw new Error('FROZEN_SOURCE_HASH_MISMATCH: '+path);
}
const args=process.argv.slice(2);
const values=flag=>args.flatMap((arg,i)=>arg===flag?[args[i+1]]:arg.startsWith(flag+'=')?[arg.slice(flag.length+1)]:[]);
function noLinks(path){for(let p=resolve(path);;p=dirname(p)){if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw new Error('SYMLINK_PATH_REJECTED');if(dirname(p)===p)return;}}
function inside(base,path){const local=relative(base,path);return local===''||(!local.startsWith('..'+sep)&&local!=='..'&&!local.includes(':')&&!local.startsWith(sep));}
const outputs=values('--out');
if(outputs.length!==1||!outputs[0]||outputs[0].startsWith('--')||args.some(a=>a.startsWith('--out=')))throw new Error('Pass exactly one explicit --out <fresh-directory>');
const out=resolve(outputs[0]);noLinks(out);
if(inside(root,out)&&!inside(resolve(root,'future-results'),out))throw new Error('OUTPUT_MUST_BE_OUTSIDE_FROZEN_SOURCE');
const resume=args.includes('--resume');
if(args.filter(a=>a==='--resume').length>1||args.some(a=>a.startsWith('--resume=')))throw new Error('INVALID_RESUME');
if(existsSync(out)&&!resume)throw new Error('FRESH_OUTPUT_REQUIRED');
if(resume&&!existsSync(out))throw new Error('RESUME_OUTPUT_MISSING');
const stateArgs=values('--learning-state');
if(stateArgs.length>1||args.some(a=>a.startsWith('--learning-state=')))throw new Error('Pass at most one --learning-state <file>');
const statePath=resolve(stateArgs[0]||fileURLToPath(new URL('./.runtime/learning.json',import.meta.url)));noLinks(statePath);
if(inside(root,statePath)&&!inside(resolve(root,'experiments/v2/.runtime'),statePath))throw new Error('STATE_MUST_NOT_TOUCH_FROZEN_SOURCE');
if(inside(out,statePath))throw new Error('LEARNING_STATE_MUST_BE_SEPARATE_FROM_RESULTS');
readOwnedState(statePath); // Refuse unrelated/corrupt state before creating output or making requests.
const base=process.env.OPENROUTER_BASE_URL||'https://openrouter.ai/api/v1';
process.env.OPENROUTER_BASE_URL=base.replace(/\/$/,'');
const endpoint=new URL(base.replace(/\/$/,'')+'/chat/completions');
if(!['https:','http:'].includes(endpoint.protocol)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error('INVALID_PROVIDER_URL');
if(endpoint.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw new Error('PLAINTEXT_PROVIDER_MUST_BE_LOOPBACK');
if(!process.env.OPENROUTER_API_KEY)throw new Error('OPENROUTER_API_KEY is not set');
// Bind resume to the exact original arguments and operational scope, without retaining keys.
const hash=value=>createHash('sha256').update(value).digest('hex');
const identity={protocol:PROTOCOL,archivedSource:ARCHIVED,sourceHashes,args:hash(JSON.stringify(args.filter(a=>a!=='--resume'))),provider:hash(endpoint.href),state:hash(statePath)};
const markerPath=resolve(out,'experiment-protocol.json');
if(resume){
  if(!lstatSync(out).isDirectory())throw new Error('RESUME_NOT_DIRECTORY');
  for(const name of readdirSync(out)){const child=resolve(out,name);noLinks(child);if(!lstatSync(child).isFile())throw new Error('UNSAFE_RESUME_CHILD');}
  const marker=JSON.parse(readFileSync(markerPath,'utf8'));
  if(JSON.stringify(marker.identity)!==JSON.stringify(identity))throw new Error('RESUME_PROTOCOL_ARGUMENT_OR_SCOPE_MISMATCH');
}else{
  mkdirSync(dirname(out),{recursive:true});noLinks(dirname(out));mkdirSync(out);
  writeFileSync(markerPath,JSON.stringify({identity,comparison:'New dispatch protocol; timings are not comparable to published study',frozenHarness:'dev/benchmark/run.ts',adaptiveDispatch:true},null,2)+'\n',{flag:'wx'});
}
const summaryName=resume?'dispatch-summary-resume-'+randomUUID()+'.json':'dispatch-summary.json';
// The archived runner sees the exact same explicit --out argument. Do not let
// equals/duplicate forms select a different checkpoint path inside that runner.
const originalFetch=globalThis.fetch;
const transport=installAdaptiveTransport({endpoint:endpoint.href,statePath,fetchImpl:originalFetch.bind(globalThis)});
globalThis.fetch=transport.fetch;
let finalized=false;
function finalize(){
  if(finalized)return;finalized=true;globalThis.fetch=originalFetch;transport.close();
  writeFileSync(resolve(out,summaryName),JSON.stringify({protocol:PROTOCOL,...transport.stats()},null,2)+'\n',{flag:'wx'});
}
process.once('exit',finalize);
try{
  await import('../../dev/benchmark/run.ts');
}finally{
  finalize();process.removeListener('exit',finalize);
}
