import assert from 'node:assert/strict';
const key='local-smoke-test-key-not-a-real-secret';
globalThis.Netlify={env:{get:name=>name==='TTS_TEST_KEY'?key:undefined}};
const {default:handler}=await import('../netlify/functions/tts.mts');
try{
 for(const [i,text] of ['book','book','Thursday, comfortable, beautiful.'].entries()){
  const r=await handler(new Request('http://localhost/api/tts',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({text,voice:'alba'})}));
  assert.equal(r.status,200, r.ok?'':await r.text());
  const stats=JSON.parse(r.headers.get('X-TTS-Stats'));
  const audio=Buffer.from(await r.arrayBuffer());
  assert.equal(audio.toString('ascii',0,4),'RIFF');assert.ok(audio.length>44);
  assert.equal(audio.readUInt32LE(4),audio.length-8);
  assert.equal(stats.cold,i===0);
  console.log(JSON.stringify({text,...stats}));
 }
 process.exit(0);
}catch(e){console.error(e);process.exit(1);}
