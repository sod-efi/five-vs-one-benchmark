import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,mkdir,rm,readdir,cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DispatchPolicy,retryAfterMs,installAdaptiveTransport } from './adaptive-transport.mjs';
const entry=fileURLToPath(new URL('./run.mjs',import.meta.url));
function window(policy,{duration=100,spacing=100,demand=true,status=200,verified=true,start=0}={}){
 const epoch=policy.epoch;for(let i=0;i<policy.windowSize;i++)policy.observe({status,verified,start:start+i*spacing,end:start+i*spacing+duration,demand,epoch});
}
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'future-benchmark-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
function child(args,{env={},cwd,entryPath=entry}={}){return new Promise((resolve,reject)=>{
 const proc=spawn('bun',[entryPath,...args],{cwd,env:{...process.env,OPENROUTER_API_KEY:'synthetic-key-not-real',...env},windowsHide:true});let stdout='',stderr='';
 const timeout=setTimeout(()=>{proc.kill();reject(new Error('Owned fixture process timed out'));},20000);
 proc.stdout.on('data',b=>stdout+=b);proc.stderr.on('data',b=>stderr+=b);proc.on('error',error=>{clearTimeout(timeout);reject(error);});proc.on('exit',code=>{clearTimeout(timeout);resolve({code,stdout,stderr});});
 });}

test('bounded saturated trials promote measured throughput and persist only last proven configuration',()=>{
 const p=new DispatchPolicy({}, {windowSize:4});window(p);assert.equal(p.phase,'trial');assert.equal(p.current.concurrency,2);
 assert.equal(p.snapshot().concurrency,1);
 window(p,{spacing:40,start:1000});assert.equal(p.snapshot().concurrency,2);assert.equal(p.counts.promoted,1);
 for(let i=0;i<20;i++){window(p);window(p,{spacing:30,start:1000});}
 assert(p.current.concurrency<=4);
});
test('slower or insufficient-demand trials roll back',()=>{
 for(const options of [{duration:200,spacing:200},{duration:10,spacing:10,demand:false}]){
  const p=new DispatchPolicy({}, {windowSize:4});window(p);window(p,options);assert.equal(p.snapshot().concurrency,1);assert.equal(p.current.concurrency,1);assert.equal(p.counts.rolledBack,1);
 }
});
test('throttles respect provider cooldown, lower concurrency and discard stale inflight successes',()=>{
 const p=new DispatchPolicy({concurrency:3,delayMs:100},{windowSize:4});const old=p.epoch;
 p.observe({status:429,verified:false,start:0,end:100,demand:true,epoch:old,retryAfterMs:2000});
 assert.equal(p.current.concurrency,2);assert.equal(p.cooldownUntil,2100);assert.equal(p.snapshot().delayMs,250);
 window(p);const epoch=p.epoch;
 p.observe({status:200,verified:true,start:1,end:2,demand:true,epoch:old});assert.equal(p.epoch,epoch);
 p.rollback();assert.deepEqual(p.current,p.snapshot());
 assert.equal(retryAfterMs('2',1000),2000);assert.equal(retryAfterMs(new Date(5000).toUTCString(),1000),4000);assert.equal(retryAfterMs('invalid'),0);
});
test('malformed state is preserved; no body/key is retained; real queue honors Retry-After and abort',()=>fixture(async dir=>{
 const statePath=join(dir,'state.json');await writeFile(statePath,'not JSON');assert.throws(()=>installAdaptiveTransport({endpoint:'https://fixture.invalid/',statePath}),/NOT_OWNED_OR_CORRUPT/);assert.equal(await readFile(statePath,'utf8'),'not JSON');await rm(statePath);let calls=0;const starts=[];
 const adapter=installAdaptiveTransport({endpoint:'http://127.0.0.1:99/api/v1/chat/completions',statePath,fetchImpl:async()=>{
  starts.push(Date.now());calls++;return calls===1?new Response(JSON.stringify({error:{code:429}}),{status:429,headers:{'retry-after':'0.3'}}):new Response(JSON.stringify({choices:[{message:{content:'private response marker'}}]}),{status:200});
 }});
 const request=signal=>adapter.fetch('http://127.0.0.1:99/api/v1/chat/completions',{body:JSON.stringify({model:'fixture/model',messages:[{content:'private prompt marker'}]}),headers:{Authorization:'secret-key-marker'},signal});
 try{
  await Promise.all([request(),request()]);assert(starts[1]-starts[0]>=290);
  const aborted=new AbortController();aborted.abort();await assert.rejects(request(aborted.signal));assert.equal(calls,2);
  const text=await readFile(statePath,'utf8');for(const marker of ['private prompt','private response','secret-key','fixture/model'])assert(!text.includes(marker));
  const parsed=JSON.parse(text);assert.equal(parsed.version,2);assert.equal(Object.keys(parsed.profiles).length,1);
 }finally{adapter.close();}
}));
test('model/origin scopes stay isolated and unexpected destinations make no request',()=>fixture(async dir=>{
 let calls=0;const adapter=installAdaptiveTransport({endpoint:'https://provider.invalid/chat/completions',statePath:join(dir,'state.json'),fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:'Answer: A'}}]}));}});
 try{
  for(const model of ['fixture/one','fixture/two'])await adapter.fetch('https://provider.invalid/chat/completions',{body:JSON.stringify({model})});
  assert.equal(adapter.stats().profiles,2);await assert.rejects(adapter.fetch('https://unrelated.invalid/',{}),/UNEXPECTED/);assert.equal(calls,2);
 }finally{adapter.close();}
}));
test('actual Bun process refuses missing/existing/frozen/duplicate output before any fake-provider request',()=>fixture(async dir=>{
 let calls=0;const server=createServer((req,res)=>{calls++;res.end('{}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={OPENROUTER_BASE_URL:`http://127.0.0.1:${server.address().port}/api/v1`};
 const frozen=fileURLToPath(new URL('../../dev/benchmark/results/attempted-new-run',import.meta.url));
 try{
  for(const args of [[],['--out',dir],['--out',frozen],['--out',join(dir,'new'),'--out',join(dir,'other')],['--out='+join(dir,'equals')],['--out',join(dir,'new'),'--learning-state',fileURLToPath(new URL('../../README.md',import.meta.url))]]){
   const result=await child(args,{env});assert.notEqual(result.code,0);
  }assert.equal(calls,0);assert.deepEqual(await readdir(dir),[]);
 }finally{await new Promise(r=>server.close(r));}
}));
test('actual unchanged runner completes a future fake-provider experiment entirely in its fresh output',()=>fixture(async dir=>{
 const requestModels=[];let first=true;
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;const parsed=JSON.parse(body);requestModels.push(parsed.model);
  if(first){first=false;res.writeHead(429,{'content-type':'application/json','retry-after':'0.001'});res.end(JSON.stringify({error:{code:429,message:'synthetic throttle'}}));return;}
  await new Promise(r=>setTimeout(r,15));res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'Answer: A'}}],usage:{cost:0,prompt_tokens:1,completion_tokens:1}}));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const out=join(dir,'fresh-results'),statePath=join(dir,'learned.json');
 try{
  const result=await child(['--out',out,'--set','mmlupro','--n','4','--concurrency','4','--learning-state',statePath],{env:{OPENROUTER_BASE_URL:`http://127.0.0.1:${server.address().port}/api/v1`}});
  assert.equal(result.code,0,result.stderr);const rows=(await readFile(join(out,'mmlupro.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.length,4);assert(rows.every(r=>r.complete));assert.equal(requestModels.length,45); // 4*11 + original fixed retry once; wrapper adds none.
  const manifest=JSON.parse(await readFile(join(out,'experiment-protocol.json'),'utf8'));assert.equal(manifest.identity.archivedSource,'8974089727fc1714179f88cdd8f6cdec85ddfe1b');
  const summary=JSON.parse(await readFile(join(out,'dispatch-summary.json'),'utf8'));assert.equal(summary.profiles,5);
  assert(summary.policies.some(p=>p.counts.throttled===1));assert.equal(Object.keys(JSON.parse(await readFile(statePath,'utf8')).profiles).length,5);
  const again=await child(['--out',out,'--set','mmlupro','--n','1'],{env:{OPENROUTER_BASE_URL:`http://127.0.0.1:${server.address().port}/api/v1`}});assert.notEqual(again.code,0);assert.equal(requestModels.length,45);
 }finally{await new Promise(r=>server.close(r));}
}));


test('accepted settings reload only for the same hashed origin/model scope',()=>fixture(async dir=>{
 const statePath=join(dir,'state.json');
 const origin='https://one.invalid/chat/completions';
 const fake=async()=>new Response(JSON.stringify({choices:[{message:{content:'A'}}]}),{status:429});
 const first=installAdaptiveTransport({endpoint:origin,statePath,fetchImpl:fake});
 await first.fetch(origin,{body:JSON.stringify({model:'fixture/one'})});first.close();
 const resumed=installAdaptiveTransport({endpoint:origin,statePath,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'A'}}]}))});
 await resumed.fetch(origin,{body:JSON.stringify({model:'fixture/one'})});
 assert.equal(resumed.stats().policies[0].proven.delayMs,250);resumed.close();
 const other='https://two.invalid/chat/completions';
 const separate=installAdaptiveTransport({endpoint:other,statePath,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'A'}}]}))});
 await separate.fetch(other,{body:JSON.stringify({model:'fixture/one'})});assert.equal(separate.stats().policies[0].proven.delayMs,0);separate.close();
}));


test('explicit same-protocol resume preserves completed paid work and existing bytes',()=>fixture(async dir=>{
 let calls=0,interrupt=true;const server=createServer(async(req,res)=>{
  for await(const chunk of req){}calls++;
  if(interrupt&&calls===12){res.writeHead(402,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:402,message:'synthetic empty balance'}}));return;}
  res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:'Answer: A'}}],usage:{cost:0}}));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const out=join(dir,'results'),statePath=join(dir,'state.json');
 const args=['--out',out,'--set','mmlupro','--n','2','--concurrency','1','--learning-state',statePath];
 const env={OPENROUTER_BASE_URL:`http://127.0.0.1:${server.address().port}/api/v1`};
 try{
  const first=await child(args,{env});assert.equal(first.code,2,first.stderr);
  const before=await readFile(join(out,'mmlupro.jsonl'),'utf8'),marker=await readFile(join(out,'experiment-protocol.json'),'utf8');
  assert.equal(JSON.parse(before.split('\n')[0]).complete,true);const afterFailure=calls;
  const wrong=await child([...args,'--resume','--timeout','9'],{env});assert.notEqual(wrong.code,0);assert.equal(calls,afterFailure);
  const changedState=[...args];changedState[changedState.length-1]=join(dir,'other-state.json');
  const scopeMismatch=await child([...changedState,'--resume'],{env});assert.notEqual(scopeMismatch.code,0);assert.equal(calls,afterFailure);
  await writeFile(join(out,'experiment-protocol.json'),marker.replace('8974089727fc1714179f88cdd8f6cdec85ddfe1b','untrusted-archive'));
  const badMarker=await child([...args,'--resume'],{env});assert.notEqual(badMarker.code,0);assert.equal(calls,afterFailure);
  await writeFile(join(out,'experiment-protocol.json'),marker);
  interrupt=false;const resumed=await child([...args,'--resume'],{env});assert.equal(resumed.code,0,resumed.stderr);
  assert.equal(calls-afterFailure,11); // Only unfinished question2; question1 costs no duplicate calls.
  const after=await readFile(join(out,'mmlupro.jsonl'),'utf8');assert(after.startsWith(before));
  assert.equal(await readFile(join(out,'experiment-protocol.json'),'utf8'),marker);
  const rows=after.trim().split('\n').map(JSON.parse);assert.equal(new Set(rows.filter(r=>r.complete).map(r=>r.id)).size,2);
 }finally{await new Promise(r=>server.close(r));}
}));


test('actual process rejects unrelated state and tampered archived source before network',()=>fixture(async dir=>{
 let calls=0;const server=createServer((req,res)=>{calls++;res.end('{}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={OPENROUTER_BASE_URL:`http://127.0.0.1:${server.address().port}/api/v1`};
 try{
  const state=join(dir,'unrelated.json');await writeFile(state,'{"important":"preserve"}');
  const rejected=await child(['--out',join(dir,'never-created'),'--learning-state',state],{env});assert.notEqual(rejected.code,0);assert.equal(await readFile(state,'utf8'),'{"important":"preserve"}');assert(! (await readdir(dir)).includes('never-created'));
  const copy=join(dir,'isolated-copy');await mkdir(copy);
  await cp(fileURLToPath(new URL('../../dev',import.meta.url)),join(copy,'dev'),{recursive:true});
  await cp(fileURLToPath(new URL('../',import.meta.url)),join(copy,'experiments'),{recursive:true});
  const source=join(copy,'dev/benchmark/lib.ts');await writeFile(source,(await readFile(source,'utf8'))+'\n// synthetic tamper\n');
  const tampered=await child(['--out',join(dir,'tampered-output'),'--learning-state',join(dir,'new-state.json')],{env,entryPath:join(copy,'experiments/v2/run.mjs')});
  assert.notEqual(tampered.code,0);assert.match(tampered.stderr,/FROZEN_SOURCE_HASH_MISMATCH/);assert.equal(calls,0);
 }finally{await new Promise(r=>server.close(r));}
}));
