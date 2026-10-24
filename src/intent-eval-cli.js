import {readFile,writeFile,mkdir,open,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {callJev} from './client.js';
import {INTENTS,FAILURE_CATEGORIES,INTENT_POLICY_VERSION,FAILURE_POLICY_VERSION,
  canonicalCategory,buildIntentRequest,buildFailureRequest,normalizeChoice,needsEscalation,
  buildJudgeRequest,normalizeJudge,finalDecision,exactMetrics,routingMetrics} from './intent-eval.js';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function prepareDataset(snapshot) {
  const sheets=snapshot.sheets;
  const golden=sheets['Golden Dataset Full'].slice(1).filter(r=>r[0]);
  const audits=sheets['LLM as a Judge Dataset'].slice(1).filter(r=>r[0]);
  const old=sheets['Failed Traces'].slice(1).filter(r=>r[0]);
  const predictions=new Map((sheets['Golden Dataset with predictions']||[]).slice(1).map(r=>[r[0],[r[0],r[1],r[2],r[3],r[5],r[6],r[7],r[8]]]));
  for(const [name,rows] of [['golden',golden],['audit',audits],['old failed traces',old]]) {
    if(new Set(rows.map(r=>r[0])).size!==rows.length)throw new Error(`Duplicate IDs in ${name}`);
  }
  const byId=new Map(audits.map(r=>[r[0],r])),oldById=new Map(old.map(r=>[r[0],r]));
  const data=golden.map(g=>{
    const a=byId.get(g[0])||predictions.get(g[0]);
    if(!a)throw new Error(`Missing prediction: ${g[0]}`);
    if(!Object.hasOwn(INTENTS,g[2])||!Object.hasOwn(INTENTS,a[2])||!Object.hasOwn(INTENTS,a[3]))throw new Error(`Unknown intent: ${g[0]}`);
    const cat=canonicalCategory(a[7]||'');
    if(cat&&!Object.hasOwn(FAILURE_CATEGORIES,cat))throw new Error(`Undefined failure category: ${cat}`);
    return {id:g[0],user_input:g[1],trace_input:a[1],input_match:g[1].trim()===a[1].trim(),audit_reference_present:byId.has(g[0]),target_intent:g[2],alternate_target:a[2],label_conflict:g[2]!==a[2]||g[1].trim()!==a[1].trim()||!byId.has(g[0]),
      original_prediction:a[3],original_reasoning:a[4]||'',original_status:a[5],human_comment:a[6]||'',
      reference_category:cat,reference_vague:a[8],old_category:canonicalCategory(oldById.get(g[0])?.[8]||''),
      // Same exact normalized input always remains in one partition. Paraphrase leakage remains possible.
      split:parseInt(hash(g[1].trim().toLowerCase()).slice(0,8),16)%3===0?'calibration':'validation'};
  });
  if(audits.some(a=>!data.some(r=>r.id===a[0])))throw new Error('Unexpected audit IDs absent from Golden Dataset Full');
  return {rows:data,issues:{intent_label_conflicts:data.filter(r=>r.target_intent!==r.alternate_target).map(({id,target_intent,alternate_target})=>({id,target_intent,alternate_target})),
    input_changes:data.filter(r=>!r.input_match).map(({id,user_input,trace_input})=>({id,user_input,trace_input})),
    missing_audit_reference:data.filter(r=>!r.audit_reference_present).map(r=>r.id),
    category_revisions:data.filter(r=>r.old_category&&r.old_category!==r.reference_category).map(({id,old_category,reference_category})=>({id,old_category,reference_category})),
    spelling_alias:'Appointment_Management_vs_Solt_Availability -> Appointment_Management_vs_Slot_Availability',
    added_definition:'Model_Wrong_Simple has a source label but no supplied definition; interpreted as a fallback for a clear error not covered by specific categories.'}};
}
export async function callLlm(request,{fetchImpl=fetch,apiKey=process.env.OPENROUTER_API_KEY,maxAttempts=3}={}) {
  if(!apiKey?.trim())throw new Error('Set OPENROUTER_API_KEY');
  for(let attempt=0;attempt<maxAttempts;attempt++){
    let r;
    try{r=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(45000)});}
    catch{if(attempt+1===maxAttempts)throw new Error('LLM judge network request failed');await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}
    if(r.ok){const body=await r.json();if(body.error)throw new Error('LLM judge returned an API error');return body;}
    if((r.status!==429&&r.status<500)||attempt+1===maxAttempts)throw new Error(`LLM judge HTTP ${r.status}`);
    const raw=r.headers.get('retry-after');const wait=raw?(Number.isFinite(Number(raw))?Number(raw)*1000:Date.parse(raw)-Date.now()):0;
    if(wait>30000)throw new Error('LLM judge rate limited; retry later');
    await new Promise(r=>setTimeout(r,Math.max(1000*2**attempt,Number.isFinite(wait)?wait:0)));
  }
}
async function mapLimit(rows,fn,concurrency=4){const result=new Array(rows.length);let cursor=0;await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<rows.length){const i=cursor++;result[i]=await fn(rows[i],i);}}));return result;}
export async function evaluateRow(row,{jevCall=callJev,judgeCall=callLlm,threshold=0.7,mode='cascade',jevModel='typesafe/jev-1.13',judgeModel='openai/gpt-4.1-mini'}={}) {
  let jev=null,judge=null,jev_error=null,judge_error=null,judge_attempts=0;const judge_validation_errors=[]; const started=performance.now();
  try{jev=normalizeChoice(await jevCall(buildIntentRequest(row,jevModel),{provider:'openrouter'}),'intent',INTENTS);}catch(e){jev_error=e.message;}
  const classify_ms=performance.now()-started;
  if(mode==='audit'||needsEscalation(jev,threshold)){
    const request=buildJudgeRequest(row,jev,judgeModel);
    for(let attempt=0;attempt<2;attempt++){
      judge_attempts++;
      let raw;
      try{raw=await judgeCall(request);}catch(e){judge_error=e.message;break;}
      try{judge=normalizeJudge(raw,jev);judge_error=null;break;}catch(e){
        judge_error=e.message;judge_validation_errors.push(e.message);
        // One format-only retry, never a retry informed by reference labels.
        request.messages[0].content+='\nOUTPUT CONTRACT: If verdict is CLARIFY, intent MUST be NEEDS_CLARIFICATION. If ACCEPT, intent MUST equal candidate_intent. If CORRECT, intent MUST differ from candidate_intent. If you agree with the candidate, use ACCEPT, not CORRECT. Use exactly the three required keys. Recheck your response against this contract.';
      }
    }
  }
  return {...row,jev,judge,jev_error,judge_error,judge_attempts,judge_validation_errors,classify_ms,total_ms:performance.now()-started,decision:finalDecision(jev,judge,threshold)};
}
export function summarizeRun(rows,failures,{threshold,mode,issues}) {
  const clean=rows.filter(r=>!r.label_conflict);
  const subsets={all_vs_golden:rows,consistent_labels:clean,calibration:clean.filter(r=>r.split==='calibration'),validation:clean.filter(r=>r.split==='validation')};
  const metrics=Object.fromEntries(Object.entries(subsets).map(([key,rs])=>[key,{
    baseline:exactMetrics(rs.filter(r=>r.input_match),r=>r.original_prediction),jev:exactMetrics(rs,r=>r.jev?.choice??null),
    llm_review:mode==='audit'?exactMetrics(rs,r=>r.judge?.verdict==='CLARIFY'?null:r.judge?.intent??null):null,
    cascade:routingMetrics(rs,threshold),
  }]));
  const labels=failures.filter(r=>r.reference_category&&r.reference_category!=='NO_FAILURE');
  const controls=failures.filter(r=>r.reference_category==='NO_FAILURE');
  return {mode,threshold,issues,metrics,alternate_reference:exactMetrics(rows.filter(r=>r.input_match),r=>r.jev?.choice??null,'alternate_target'),
    failure_categories:exactMetrics(labels,r=>r.failure?.choice??null,'reference_category'),
    passing_trace_controls:exactMetrics(controls,r=>r.failure?.choice??null,'reference_category'),
    jev_errors:rows.filter(r=>r.jev_error).length,judge_errors:rows.filter(r=>r.judge_error).length,failure_errors:failures.filter(r=>r.failure_error).length,
    confidence_bands:[[0,0.5],[0.5,0.7],[0.7,0.9],[0.9,1.000001]].map(([lo,hi])=>({min:lo,max:Math.min(1,hi),...exactMetrics(clean.filter(r=>r.jev&&r.jev.confidence>=lo&&r.jev.confidence<hi),r=>r.jev.choice)})),
    // Sweeps use calibration only; the predeclared 0.7 threshold remains the validation comparison.
    threshold_sweep:mode==='audit'?[0,0.3,0.5,0.7,0.8,0.9,0.95,1].map(t=>routingMetrics(subsets.calibration,t)):[],
    judge_vs_exact_match:mode==='audit'?{
      correct_jev_rejected:clean.filter(r=>r.jev?.choice===r.target_intent&&r.judge?.verdict==='CORRECT').map(r=>r.id),
      incorrect_jev_accepted:clean.filter(r=>r.jev&&r.jev.choice!==r.target_intent&&r.judge?.verdict==='ACCEPT').map(r=>r.id),
    }:null};
}
async function main(){
  const {values:v}=parseArgs({options:{source:{type:'string'},output:{type:'string'},mode:{type:'string',default:'audit'},threshold:{type:'string',default:'0.7'},limit:{type:'string'},
    'jev-model':{type:'string',default:'typesafe/jev-1.13'},'judge-model':{type:'string',default:'openai/gpt-4.1-mini'},'dry-run':{type:'boolean'},resume:{type:'boolean'},help:{type:'boolean'}}});
  if(v.help){console.log('npm run eval:intents -- --source results/intent-source-2026-10-20.json --output results/intent-run --mode audit|cascade [--threshold 0.7] [--dry-run] [--resume] [--limit 10]');return;}
  if(!v.source||!v.output||!['audit','cascade'].includes(v.mode))throw new Error('Specify --source, --output and --mode audit|cascade');
  const threshold=Number(v.threshold);needsEscalation(null,threshold);
  if(v.limit&&(!/^\d+$/.test(v.limit)||Number(v.limit)<1))throw new Error('Invalid limit');
  const snapshot=JSON.parse(await readFile(v.source,'utf8')),prepared=prepareDataset(snapshot);
  const rows=v.limit?prepared.rows.slice(0,Number(v.limit)):prepared.rows;
  const output=resolve(v.output);await mkdir(output,{recursive:true});
  const config={source_hash:hash(snapshot),threshold,mode:v.mode,limit:v.limit??null,jev_model:v['jev-model'],judge_model:v['judge-model'],intent_policy:INTENT_POLICY_VERSION,failure_policy:FAILURE_POLICY_VERSION,
    intent_policy_hash:hash(buildIntentRequest({user_input:'policy hash'})),failure_policy_hash:hash(buildFailureRequest({user_input:'policy hash',original_prediction:'LIST_APPOINTMENTS'})),
    judge_policy_hash:hash(buildJudgeRequest({user_input:'policy hash'},null))};
  const manifest=join(output,'manifest.json');
  if(v.resume){const existing=JSON.parse(await readFile(manifest,'utf8'));if(hash(existing.config)!==hash(config))throw new Error('Resume configuration differs; use a new output directory');}
  else await writeFile(manifest,JSON.stringify({config,source_url:snapshot.source_url,created_at:new Date().toISOString()},null,2),{flag:'wx'});
  const cache=join(output,'cache');await mkdir(cache,{recursive:true});
  const counts={jev:0,llm:0,cached:0},costs={reported_usd:0,unreported_calls:0};
  const pending=new Map();
  const cached=async(request,kind,call)=>{
    const key=`${kind}-${hash(request)}`;
    if(pending.has(key)){counts.cached++;return pending.get(key);}
    const work=(async()=>{
    const file=join(cache,`${kind}-${hash(request)}.json`);
    if(v.resume){try{const data=JSON.parse(await readFile(file,'utf8'));counts.cached++;return data;}catch(e){if(e.code!=='ENOENT')throw e;}}
    counts[kind]++;const response=await call(request);await writeFile(file,JSON.stringify(response,null,2),{flag:'wx'});
    if(typeof response.usage?.cost==='number')costs.reported_usd+=response.usage.cost;else costs.unreported_calls++;
    return response;})();
    pending.set(key,work);
    return work;
  };
  if(v['dry-run']){await writeFile(join(output,'requests.json'),JSON.stringify({intents:rows.map(r=>({id:r.id,request:buildIntentRequest(r,v['jev-model'])})),
    failures:rows.filter(r=>r.original_status==='fail').map(r=>({id:r.id,request:buildFailureRequest(r,v['jev-model'])}))},null,2),{flag:'wx'});console.log(`Dry run: ${rows.length} intent requests prepared; no API calls.`);return;}
  if(!process.env.OPENROUTER_API_KEY)throw new Error('Set OPENROUTER_API_KEY');
  const events=await open(join(output,'progress.jsonl'),'a');let done=0;
  const results=await mapLimit(rows,async row=>{
    const r=await evaluateRow(row,{threshold,mode:v.mode,jevModel:v['jev-model'],judgeModel:v['judge-model'],jevCall:q=>cached(q,'jev',req=>callJev(req,{provider:'openrouter'})),judgeCall:q=>cached(q,'llm',callLlm)});
    await events.appendFile(JSON.stringify({id:r.id,jev:r.jev?.choice,error:r.jev_error||r.judge_error,route:r.decision.route})+'\n');
    if(++done%25===0||done===rows.length)console.log(`Intents ${done}/${rows.length}; errors ${r.jev_error||r.judge_error||'none in latest row'}`);
    return r;
  });await events.close();
  await writeFile(join(output,'intent-results.json'),JSON.stringify(results,null,2));
  // Include one previously passing example per intent to test false failure assignments.
  const controls=Object.keys(INTENTS).flatMap(intent=>{const r=rows.find(r=>r.target_intent===intent&&r.original_status==='pass'&&!r.label_conflict);return r?[{...r,reference_category:'NO_FAILURE'}]:[];});
  const traces=[...rows.filter(r=>r.original_status==='fail'),...controls].map(r=>({...r,user_input:r.trace_input}));
  const failures=await mapLimit(traces,async r=>{try{return {...r,failure:normalizeChoice(await cached(buildFailureRequest(r,v['jev-model']),'jev',req=>callJev(req,{provider:'openrouter'})),'failure_category',FAILURE_CATEGORIES)};}catch(e){return {...r,failure:null,failure_error:e.message};}});
  await writeFile(join(output,'failure-results.json'),JSON.stringify(failures,null,2));
  const summary=summarizeRun(results,failures,{threshold,mode:v.mode,issues:prepared.issues});
  const allCache=await Promise.all((await readdir(cache)).filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await readFile(join(cache,n),'utf8'))));
  summary.api_calls=counts;summary.costs={...costs,scope:'new API responses in this invocation',total_cached_response_usd:allCache.reduce((s,r)=>s+(r.usage?.cost||0),0),cached_responses:allCache.length};
  summary.format_retry_rows=results.filter(r=>r.judge_validation_errors.length).length;
  await writeFile(join(output,'summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify({n:results.length,jev_accuracy:summary.metrics.consistent_labels.jev.accuracy,cascade:summary.metrics.consistent_labels.cascade.accuracy,errors:[summary.jev_errors,summary.judge_errors,summary.failure_errors],api_calls:counts,costs},null,2));
  if(summary.jev_errors||summary.judge_errors||summary.failure_errors)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
