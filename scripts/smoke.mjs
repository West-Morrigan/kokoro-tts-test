import assert from 'node:assert/strict';
const key='local-smoke-test-key-not-a-real-secret';
globalThis.Netlify={env:{get:name=>name==='TTS_TEST_KEY'?key:undefined}};
const {default:handler}=await import('../netlify/functions/tts.mts');
for (const [index,text] of ['Thursday','comfortable','I read a book yesterday.'].entries()) {
  const response=await handler(new Request('http://localhost/api/tts',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({text,voice:'bf_emma',speed:1})
  }));
  if(!response.ok) throw Error('Smoke request failed: '+await response.text());
  const stats=JSON.parse(response.headers.get('X-TTS-Stats'));
  const wav=Buffer.from(await response.arrayBuffer());
  assert.equal(wav.toString('ascii',0,4),'RIFF');
  assert.equal(wav.toString('ascii',8,12),'WAVE');
  assert.equal(wav.readUInt32LE(24),24000);
  assert.ok(wav.length>44);
  assert.equal(stats.threads,1);
  assert.equal(stats.cold,index===0);
  for(const k of ['preprocess','modelStage','cpuMs','cpuRatio','synthesis']) assert.ok(Number.isFinite(stats[k])&&stats[k]>=0,k);
  console.log(JSON.stringify({text,...stats}));
}
