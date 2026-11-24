import assert from 'node:assert/strict';
const key='local-smoke-test-key-not-a-real-secret';
globalThis.Netlify={env:{get:name=>name==='TTS_TEST_KEY'?key:undefined}};
const {default:handler}=await import('../netlify/functions/tts.mts');
const request=(auth,body)=>new Request('http://localhost/api/tts',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
assert.equal((await handler(request('wrong',{text:'book'}))).status,401);
assert.equal((await handler(request(key,{text:'',voice:'invalid'}))).status,400);
console.log('Authentication and input validation passed.');
// The actual network benchmark runs only when explicitly requested.
if(process.env.LIVE_TTS_TEST==='1'){
 const r=await handler(request(key,{text:'I read every day.',voice:'en-GB-SoniaNeural'}));
 if(!r.ok)throw Error(await r.text());
 const audio=await r.arrayBuffer();
 assert.ok(audio.byteLength>0);
 assert.equal(r.headers.get('Content-Type'),'audio/mpeg');
 console.log(r.headers.get('X-TTS-Stats'));
}
