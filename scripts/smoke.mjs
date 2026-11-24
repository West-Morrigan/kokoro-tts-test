import {env} from '@huggingface/transformers';
import {KokoroTTS} from 'kokoro-js';
import {performance} from 'node:perf_hooks';
import {resolve,sep} from 'node:path';
env.localModelPath=resolve('models')+sep;
env.allowLocalModels=true;env.allowRemoteModels=false;env.useFSCache=false;
const start=performance.now();
const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'cpu'});
console.log('Model initialized in',Math.round(performance.now()-start),'ms');
for (const text of ['Thursday','comfortable','I read a book yesterday.']) {
 const t=performance.now();
 const audio=await tts.generate(text,{voice:'bf_emma',speed:1});
 if (!audio.audio?.length || audio.sampling_rate!==24000 || !audio.audio.every(Number.isFinite)) throw Error('Invalid audio');
 console.log(JSON.stringify({text,ms:Math.round(performance.now()-t),samples:audio.audio.length,rssMB:Math.round(process.memoryUsage().rss/1048576),peakMB:Math.round(process.resourceUsage().maxRSS/1024)}));
}
