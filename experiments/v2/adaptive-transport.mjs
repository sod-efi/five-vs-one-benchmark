import { createHash,randomUUID } from 'node:crypto';
import { readFileSync,writeFileSync,mkdirSync,renameSync,unlinkSync,existsSync,lstatSync } from 'node:fs';
import { dirname } from 'node:path';
export const PROTOCOL='adaptive-dispatch-v2';
const CAP=4,MAX_DELAY=30000,MAX_COUNT=100000;
const validInt=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;

export class DispatchPolicy {
  constructor(saved={}, {windowSize=8}={}) {
    if(!validInt(windowSize,2,100))throw new Error('Invalid measurement window');
    this.windowSize=windowSize;
    this.proven={concurrency:validInt(saved.concurrency,1,CAP)?saved.concurrency:1,delayMs:validInt(saved.delayMs,0,MAX_DELAY)?saved.delayMs:0};
    this.current={...this.proven};this.phase='baseline';this.epoch=0;this.baseline=null;this.samples=[];this.cooldownUntil=0;
    this.counts={success:0,failure:0,throttled:0,promoted:0,rolledBack:0};
  }
  observe({status,verified,start,end,demand,epoch,retryAfterMs=0}) {
    const failure=!verified;
    const counter=status===429?'throttled':failure?'failure':'success';this.counts[counter]=Math.min(MAX_COUNT,this.counts[counter]+1);
    if(failure){
      if(this.phase==='trial')this.counts.rolledBack=Math.min(MAX_COUNT,this.counts.rolledBack+1);
      // Actual overload/errors are protective evidence. No extra request is made.
      if([0,429,502,503].includes(status)){
        this.proven={concurrency:Math.max(1,this.proven.concurrency-1),delayMs:Math.min(MAX_DELAY,Math.max(250,this.proven.delayMs*2))};
        this.cooldownUntil=Math.max(this.cooldownUntil,end+Math.max(this.proven.delayMs,retryAfterMs));
      }
      this.current={...this.proven};this.phase='baseline';this.baseline=null;this.samples=[];this.epoch++;return;
    }
    if(epoch!==this.epoch||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
    this.samples.push({start,end,demand:!!demand});
    if(this.samples.length<this.windowSize)return;
    const samples=this.samples;this.samples=[];
    const elapsed=Math.max(1,Math.max(...samples.map(x=>x.end))-Math.min(...samples.map(x=>x.start)));
    const metrics={throughput:samples.length*1000/elapsed,saturated:samples.filter(x=>x.demand).length>=Math.ceil(samples.length/2)};
    if(this.phase==='trial'){
      if(metrics.saturated&&metrics.throughput>this.baseline.throughput*1.05){
        this.proven={...this.current};this.counts.promoted=Math.min(MAX_COUNT,this.counts.promoted+1);
      }else{this.current={...this.proven};this.counts.rolledBack=Math.min(MAX_COUNT,this.counts.rolledBack+1);}
      this.phase='baseline';this.baseline=null;this.epoch++;return;
    }
    if(!metrics.saturated)return;
    const candidate={concurrency:Math.min(CAP,this.proven.concurrency+1),delayMs:Math.floor(this.proven.delayMs*0.75)};
    if(candidate.concurrency===this.proven.concurrency&&candidate.delayMs===this.proven.delayMs)return;
    this.baseline=metrics;this.current=candidate;this.phase='trial';this.epoch++;
  }
  snapshot(){return {...this.proven};}
  rollback(){this.current={...this.proven};this.phase='baseline';this.baseline=null;this.samples=[];this.epoch++;}
}

export function retryAfterMs(value,now=Date.now()) {
  if(!value)return 0;
  const seconds=Number(value);
  if(Number.isFinite(seconds)&&seconds>=0)return Math.min(Number.MAX_SAFE_INTEGER,seconds*1000);
  const date=Date.parse(value);return Number.isFinite(date)?Math.max(0,date-now):0;
}

export function readOwnedState(statePath){
  if(!existsSync(statePath))return {};
  try{
    const bytes=readFileSync(statePath);if(bytes.length>128000)throw new Error();
    const parsed=JSON.parse(bytes);
    if(parsed.protocol!==PROTOCOL||parsed.version!==2||!parsed.profiles||Array.isArray(parsed.profiles)||typeof parsed.profiles!=='object'||Object.keys(parsed).sort().join(',')!=='profiles,protocol,version'||Object.keys(parsed.profiles).length>32)throw new Error();
    for(const [key,value]of Object.entries(parsed.profiles))if(!/^[a-f0-9]{64}$/.test(key)||!value||Object.keys(value).sort().join(',')!=='concurrency,delayMs'||!validInt(value.concurrency,1,CAP)||!validInt(value.delayMs,0,MAX_DELAY))throw new Error();
    return parsed.profiles;
  }catch{throw new Error('LEARNING_STATE_NOT_OWNED_OR_CORRUPT: preserve this file and choose a new --learning-state path');}
}

export function installAdaptiveTransport({endpoint,statePath,fetchImpl=globalThis.fetch,windowSize=8,now=Date.now}={}) {
  const target=new URL(endpoint);if(target.username||target.password||target.search||target.hash)throw new Error('Invalid provider endpoint');
  const saved=readOwnedState(statePath);
  const gates=new Map();let closed=false,stateWrites=0;
  function persist(){
    // Whitelisted aggregate configuration only: no key, prompt, model text or response body.
    const profiles={...saved};for(const [key,g]of gates)profiles[key]=g.policy.snapshot();
    const bounded=Object.fromEntries(Object.entries(profiles).slice(-32));
    const temp=statePath+'.'+randomUUID()+'.tmp';
    try{readOwnedState(statePath);for(let p=statePath;;p=dirname(p)){if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw new Error('STATE_SYMLINK_REJECTED');if(dirname(p)===p)break;}mkdirSync(dirname(statePath),{recursive:true});writeFileSync(temp,JSON.stringify({protocol:PROTOCOL,version:2,profiles:bounded})+'\n',{flag:'wx'});renameSync(temp,statePath);stateWrites++;}
    catch{try{unlinkSync(temp);}catch{}/* Optional learning storage must not retry a provider request. */}
  }
  function pump(gate){
    clearTimeout(gate.timer);gate.timer=null;
    if(closed)return;
    while(gate.queue.length&&gate.active<gate.policy.current.concurrency){
      const waitUntil=Math.max(gate.nextStart,gate.policy.cooldownUntil);
      if(waitUntil>now()){gate.timer=setTimeout(()=>pump(gate),Math.min(60000,waitUntil-now()));return;}
      const item=gate.queue.shift();item.signal?.removeEventListener('abort',item.abort);
      if(item.signal?.aborted){item.reject(item.signal.reason);continue;}
      const demand=gate.queue.length>0;
      gate.active++;gate.nextStart=now()+gate.policy.current.delayMs;
      item.resolve({demand,epoch:gate.policy.epoch,start:now(),release:()=>{gate.active--;pump(gate);}});
    }
  }
  async function wrapped(input,init={}){
    if(closed)throw new Error('TRANSPORT_CLOSED');
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(new URL(url).href!==target.href)throw new Error('UNEXPECTED_BENCHMARK_DESTINATION');
    let model;try{model=JSON.parse(init.body).model;}catch{throw new Error('INVALID_BENCHMARK_REQUEST');}
    if(typeof model!=='string'||model.length>180)throw new Error('INVALID_MODEL');
    const key=createHash('sha256').update(target.origin+'\n'+model).digest('hex');
    if(!gates.has(key)){
      if(gates.size>=32)throw new Error('MODEL_SCOPE_LIMIT');
      gates.set(key,{policy:new DispatchPolicy(saved[key],{windowSize}),active:0,queue:[],nextStart:0,timer:null});
    }
    const gate=gates.get(key),signal=init.signal;
    const ticket=await new Promise((resolve,reject)=>{
      const item={resolve,reject,signal};item.abort=()=>{const i=gate.queue.indexOf(item);if(i>=0)gate.queue.splice(i,1);reject(signal.reason);pump(gate);};
      if(signal?.aborted){reject(signal.reason);return;}
      signal?.addEventListener('abort',item.abort,{once:true});gate.queue.push(item);pump(gate);
    });
    try{
      const response=await fetchImpl(input,init);let payload;
      try{payload=await response.clone().json();}catch{}
      const status=response.ok&&payload?.error?Number(payload.error.code)||500:response.status;
      const verified=response.ok&&!payload?.error&&typeof payload?.choices?.[0]?.message?.content==='string'&&payload.choices[0].message.content.trim().length>0;
      gate.policy.observe({...ticket,status,verified,end:now(),retryAfterMs:retryAfterMs(response.headers.get('retry-after'),now())});
      persist();return response;
    }catch(error){gate.policy.observe({...ticket,status:0,verified:false,end:now()});persist();throw error;}
    finally{ticket.release();}
  }
  return {fetch:wrapped,flush:persist,stats:()=>({profiles:gates.size,stateWrites,policies:[...gates.values()].map(g=>({proven:g.policy.snapshot(),phase:g.policy.phase,counts:{...g.policy.counts}}))}),
    close(){closed=true;for(const g of gates.values()){clearTimeout(g.timer);for(const item of g.queue){item.signal?.removeEventListener('abort',item.abort);item.reject(new Error('TRANSPORT_CLOSED'));}g.queue=[];}persist();}};
}
