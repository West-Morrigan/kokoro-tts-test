import {spawn, type ChildProcess} from 'node:child_process';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
const instance=randomUUID().slice(0,8), version='pocket-7m-rust-v1';
const modelDir=resolve(process.cwd(),'models/pocket');
let server:ChildProcess|undefined, ready:Promise<number>|undefined, port:number;
let busy=false, requests=0;
const ms=(x:number)=>Math.round(x);
async function freePort():Promise<number>{
 return await new Promise((ok,fail)=>{
   const listener=createServer(); listener.once('error',fail);
   listener.listen(0,'127.0.0.1',()=>{const address=listener.address();if(!address||typeof address==='string'){listener.close();fail(Error('No port'));return;}listener.close(e=>e?fail(e):ok(address.port));});
 });
}
async function load(){
 if(!ready){
  ready=(async()=>{
    port=await freePort();
    const child=spawn(resolve(modelDir,'pocket-tts'),['serve','--host','127.0.0.1','--port',String(port),'--config','model.yaml','--default-voice','alba.safetensors'],{cwd:modelDir,env:{...process.env,RAYON_NUM_THREADS:'1',TOKIO_WORKER_THREADS:'1'},stdio:['ignore','ignore','pipe']});
    server=child;
    let failure:Error|undefined;
    child.stderr?.on('data',d=>console.log('pocket:',String(d).trim().slice(0,1000)));
    child.once('error',e=>{failure=e;});
    child.once('exit',(code,signal)=>{failure=Error('Pocket process exited '+code+' '+signal);if(server===child){server=undefined;ready=undefined;}});
    const deadline=performance.now()+20000;
    while(performance.now()<deadline){
      if(failure)throw failure;
      const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(500)}).catch(()=>null);
      if(r?.ok)return port;
      await new Promise(r=>setTimeout(r,50));
    }
    throw Error('Pocket server initialization timed out');
  })().catch(e=>{server?.kill('SIGKILL');server=undefined;ready=undefined;throw e;});
 }
 return ready;
}
async function childRss(){
 if(!server?.pid)return null;
 try{
  const status=await readFile('/proc/'+server.pid+'/status','utf8');
  const rss=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]);
  const peak=Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1]);
  return {rss:Math.round(rss/1024),peak:Math.round(peak/1024)};
 }catch{return null;}
}
const err=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function handler(req:Request){
 const start=performance.now();
 if(req.method!=='POST')return err('Use POST',405);
 const key=Netlify.env.get('TTS_TEST_KEY');
 if(!key||key.length<24)return err('Set TTS_TEST_KEY in Netlify before testing',503);
 if(req.headers.get('Authorization')!=='Bearer '+key)return err('Invalid test key',401);
 const raw=await req.text();if(raw.length>2048)return err('Request too large',413);
 let input:any;try{input=JSON.parse(raw)}catch{return err('Invalid JSON',400)}
 const {text,voice='alba'}=input??{};
 if(typeof text!=='string'||!text.trim()||text.length>180||voice!=='alba')return err('Invalid text or voice',400);
 if(busy)return err('Instance busy',429);
 busy=true;
 const cold=!ready;
 try{
  const initStart=performance.now();const p=await load();const init=ms(performance.now()-initStart);
  const synthStart=performance.now();
  const r=await fetch('http://127.0.0.1:'+p+'/tts',{method:'POST',body:new URLSearchParams({text:text.trim()}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Pocket returned '+r.status);
  const reader=r.body?.getReader();if(!reader)throw Error('No audio');
  const chunks:Buffer[]=[];let length=0,firstAudio:number|undefined;
  while(true){
   const {done,value}=await reader.read();if(done)break;
   chunks.push(Buffer.from(value));length+=value.length;
   if(length>44&&firstAudio===undefined)firstAudio=ms(performance.now()-synthStart);
   if(length>4_000_000){await reader.cancel();throw Error('Audio too large');}
  }
  const wav=Buffer.concat(chunks);if(wav.length<=44||wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error('Invalid WAV');
  // Rust's streaming WAV has an unknown-length header. Repair for browser playback.
  wav.writeUInt32LE(wav.length-8,4);
  let dataOffset=-1;
  for(let i=12;i+8<=wav.length;){
    if(wav.toString('ascii',i,i+4)==='data'){dataOffset=i+8;wav.writeUInt32LE(wav.length-dataOffset,i+4);break;}
    const n=wav.readUInt32LE(i+4);i+=8+n+(n%2);
  }
  if(dataOffset<0)throw Error('Missing PCM data');
  const synthesis=ms(performance.now()-synthStart);const memory=await childRss();
  requests++;
  const stats={version,instance,cold,requests,threads:1,init,synthesis,firstAudio,total:ms(performance.now()-start),childRSS:memory?.rss??null,childPeak:memory?.peak??null,nodeRSS:Math.round(process.memoryUsage().rss/1048576),audioMs:ms((wav.length-dataOffset)/48000*1000)};
  console.log('pocket benchmark',JSON.stringify(stats));
  return new Response(new Uint8Array(wav),{headers:{'Content-Type':'audio/wav','Cache-Control':'no-store','X-TTS-Stats':JSON.stringify(stats)}});
 }catch(e){console.error('Pocket TTS failed',e);server?.kill('SIGKILL');server=undefined;ready=undefined;return err('Synthesis failed; check function logs',500);}
 finally{busy=false;}
}
export const config={path:'/api/tts',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:20}};
