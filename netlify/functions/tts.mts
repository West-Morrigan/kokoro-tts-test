import {performance} from 'node:perf_hooks';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {Communicate} from 'edge-tts-universal';

const voices=new Set(['en-GB-SoniaNeural','en-GB-RyanNeural','en-GB-LibbyNeural','en-GB-MaisieNeural','en-GB-ThomasNeural','en-US-AriaNeural','en-US-JennyNeural','en-US-GuyNeural','en-US-EmmaMultilingualNeural']);
const rates=new Set(['+0%','-10%','-20%','+10%']);
const instance=randomUUID().slice(0,8);
let busy=false,requests=0;
const ms=(n:number)=>Math.round(n);
const error=(error:string,status:number,stats?:object)=>Response.json({error,stats},{status,headers:{'Cache-Control':'no-store'}});
export default async function handler(req:Request){
 const start=performance.now();
 if(req.method!=='POST')return error('Use POST',405);
 const secret=Netlify.env.get('TTS_TEST_KEY');
 if(!secret||secret.length<24)return error('Set TTS_TEST_KEY in Netlify preview context',503);
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(req.headers.get('Authorization')||'');
 if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return error('Invalid test key',401);
 if(!req.headers.get('Content-Type')?.includes('application/json'))return error('Expected JSON',415);
 const raw=await req.text();if(raw.length>2048)return error('Request too large',413);
 let input:any;try{input=JSON.parse(raw)}catch{return error('Invalid JSON',400)}
 const {text,voice='en-GB-SoniaNeural',rate='+0%'}=input??{};
 if(typeof text!=='string'||!text.trim()||text.length>180||!voices.has(voice)||!rates.has(rate))return error('Invalid text, voice or rate',400);
 if(busy)return error('Instance busy; retry later',429);
 busy=true;
 const cold=requests===0;
 requests++;
 const synthStart=performance.now();
 let firstAudio:number|null=null,timeout:ReturnType<typeof setTimeout>|undefined,expired=false;
 try{
  const comm=new Communicate(text.trim(),{voice,rate,connectionTimeout:10000});
  const task=(async()=>{
   const chunks:Buffer[]=[];let size=0;
   for await(const chunk of comm.stream()){
    if(expired)break;
    if(chunk.type==='audio'&&chunk.data?.byteLength){
     firstAudio??=ms(performance.now()-synthStart);
     const bytes=Buffer.from(chunk.data);size+=bytes.length;
     if(size>2000000)throw Error('Audio exceeds test limit');
     chunks.push(bytes);
    }
   }
   if(!size)throw Error('No audio received');
   return Buffer.concat(chunks);
  })();
  const audio=await Promise.race([task,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{expired=true;reject(Error('Upstream timed out after 20 seconds'));},20000)})]);
  const stats={version:'edge-node-v1',instance,cold,requests,firstAudio,synthesis:ms(performance.now()-synthStart),total:ms(performance.now()-start),bytes:audio.length,rssMB:Math.round(process.memoryUsage().rss/1048576)};
  console.log('edge benchmark',JSON.stringify(stats));
  return new Response(new Uint8Array(audio),{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-TTS-Stats':JSON.stringify(stats)}});
 }catch(e){
  const detail=e instanceof Error?e.message:String(e);
  // Do not expose upstream URLs, headers, or credentials in client errors.
  const reason=/\b403\b/.test(detail)?'Upstream HTTP 403':/\b429\b/.test(detail)?'Upstream HTTP 429':/\b401\b/.test(detail)?'Upstream HTTP 401':/timed?\s*out|timeout/i.test(detail)?'Upstream timeout':/no audio/i.test(detail)?'Upstream returned no audio':'Upstream connection or synthesis failed';
  const stats={version:'edge-node-v1',instance,cold,requests,firstAudio,synthesis:ms(performance.now()-synthStart),total:ms(performance.now()-start)};
  console.error('edge benchmark failed',reason,JSON.stringify(stats));
  return error(reason,502,stats);
 }finally{if(timeout)clearTimeout(timeout);if(!expired)busy=false;}
}
export const config={path:'/api/tts',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:20}};
