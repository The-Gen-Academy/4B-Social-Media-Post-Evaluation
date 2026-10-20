import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
test('intent CLI dry run executes from a path with spaces and never sends labels',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'clinic intent eval '));
  try{
    const source={sheets:{'Golden Dataset Full':[['TEST_ID','USER_INPUT','TARGET_INTENT'],['T1','View my day','LIST_APPOINTMENTS']],
      'LLM as a Judge Dataset':[['header'],['T1','View my day','LIST_APPOINTMENTS','LIST_APPOINTMENTS','why','pass']],
      'Failed Traces':[['header']]}};
    const path=join(dir,'source.json');await writeFile(path,JSON.stringify(source));
    const out=join(dir,'run');
    const args=[fileURLToPath(new URL('../src/intent-eval-cli.js',import.meta.url)),'--source',path,'--output',out,'--dry-run'];
    const r=spawnSync(process.execPath,args,{encoding:'utf8',env:{PATH:process.env.PATH}});
    assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/no API calls/);
    const q=JSON.parse(await readFile(join(out,'requests.json'),'utf8'));
    assert.equal(q.intents.length,1);assert.deepEqual(q.intents[0].request.state,{user_input:'View my day'});
    assert.notEqual(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
