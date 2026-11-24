import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { resolve, sep } from 'node:path';

const modelId = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const threads = 1;
const benchmarkVersion = 'q8-1thread-v2';
const voices = new Set(['bf_emma','bf_isabella','bm_george','bm_lewis','bf_alice','bf_lily','bm_daniel','bm_fable','af_heart','am_michael']);
const instance = randomUUID().slice(0,8);
let modelPromise: Promise<any> | undefined;
let busy = false;
let requests = 0;
const ms = (n:number) => Math.round(n);
const rss = () => Math.round(process.memoryUsage().rss / 1048576);
function wav(samples: Float32Array, rate: number) {
  const out = Buffer.alloc(44+samples.length*2);
  out.write('RIFF',0); out.writeUInt32LE(out.length-8,4); out.write('WAVEfmt ',8);
  out.writeUInt32LE(16,16); out.writeUInt16LE(1,20); out.writeUInt16LE(1,22);
  out.writeUInt32LE(rate,24); out.writeUInt32LE(rate*2,28); out.writeUInt16LE(2,32);
  out.writeUInt16LE(16,34); out.write('data',36); out.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++) out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),44+i*2);
  return out;
}
async function load() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { env, StyleTextToSpeech2Model, AutoTokenizer } = await import('@huggingface/transformers');
      env.localModelPath = resolve(process.cwd(),'models')+sep;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.useFSCache = false;
      const { KokoroTTS } = await import('kokoro-js');
      // KokoroTTS.from_pretrained does not forward session_options in v1.2.1.
      // Build its two components explicitly, retaining the same model and tokenizer.
      const [model, tokenizer] = await Promise.all([
        StyleTextToSpeech2Model.from_pretrained(modelId, {
          dtype:'q8', device:'cpu',
          session_options:{
            intraOpNumThreads:threads, interOpNumThreads:1,
            executionMode:'sequential',
            extra:{session:{intra_op:{allow_spinning:'0'},inter_op:{allow_spinning:'0'}}}
          }
        }),
        AutoTokenizer.from_pretrained(modelId)
      ]);
      return new KokoroTTS(model, tokenizer);
    })().catch(e=>{modelPromise=undefined;throw e;});
  }
  return modelPromise;
}
function error(message:string,status:number) {
  return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}
export default async function handler(req: Request) {
  const start = performance.now();
  if(req.method !== 'POST') return error('Use POST',405);
  const secret = Netlify.env.get('TTS_TEST_KEY');
  if (!secret || secret.length < 24) return error('Set TTS_TEST_KEY in Netlify before testing',503);
  if (req.headers.get('Authorization') !== 'Bearer '+secret) return error('Invalid test key',401);
  if (!req.headers.get('content-type')?.includes('application/json')) return error('Expected JSON',415);
  const raw = await req.text();
  if(raw.length>2048) return error('Request too large',413);
  let input:any;
  try { input=JSON.parse(raw); } catch { return error('Invalid JSON',400); }
  const {text,voice='bf_emma',speed=1} = input ?? {};
  if(typeof text!=='string'||!text.trim()||text.length>180||!voices.has(voice)||typeof speed!=='number'||!Number.isFinite(speed)||speed<0.7||speed>1.3) return error('Invalid text, voice or speed',400);
  if(busy) return error('Instance busy; try again',429);
  busy=true;
  const cold = !modelPromise;
  const before = rss();
  let peak = before;
  const sampler = setInterval(()=>{peak=Math.max(peak,rss());},50);
  try {
    const initStart=performance.now();
    const model=await load();
    const init=ms(performance.now()-initStart);
    peak=Math.max(peak,rss());
    const synthStart=performance.now();
    const cpuStart=process.cpuUsage();
    // The pinned Kokoro implementation calls generate_from_ids after
    // phonemization/tokenization. That method includes voice lookup + inference.
    let preprocess=0, modelStage=0;
    const original=model.generate_from_ids;
    if(typeof original!=='function') throw Error('Kokoro profiling hook unavailable');
    model.generate_from_ids=async function(...args:any[]){
      const stageStart=performance.now();
      preprocess=ms(stageStart-synthStart);
      try { return await original.apply(this,args); }
      finally { modelStage=ms(performance.now()-stageStart); }
    };
    let audio;
    try { audio=await model.generate(text.trim(),{voice,speed}); }
    finally { model.generate_from_ids=original; }
    const synthesis=ms(performance.now()-synthStart);
    const cpu=process.cpuUsage(cpuStart);
    const cpuMs=ms((cpu.user+cpu.system)/1000);
    const cpuRatio=Number((cpuMs/Math.max(1,synthesis)).toFixed(2));
    const bytes=wav(audio.audio,audio.sampling_rate);
    peak=Math.max(peak,rss());
    requests++;
    const total=ms(performance.now()-start);
    const maxRss=Math.round(process.resourceUsage().maxRSS/1024);
    const stats={version:benchmarkVersion,threads,instance,cold,requests,init,synthesis,preprocess,modelStage,cpuMs,cpuRatio,total,before,peak:Math.max(peak,maxRss),after:rss(),audioMs:ms(audio.audio.length/audio.sampling_rate*1000),bytes:bytes.length};
    console.log('tts benchmark',JSON.stringify(stats));
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'audio/wav','Cache-Control':'no-store','X-TTS-Stats':JSON.stringify(stats),'Server-Timing':`init;dur=${init}, synth;dur=${synthesis}, preprocess;dur=${preprocess}, model;dur=${modelStage}, total;dur=${total}`}});
  }catch(e){console.error('TTS failed',e);return error('Synthesis failed; check Netlify function logs',500);}
  finally{clearInterval(sampler);busy=false;}
}
export const config={path:'/api/tts',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:20}};
