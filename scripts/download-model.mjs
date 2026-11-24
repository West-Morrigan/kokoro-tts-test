import { mkdir, stat, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname, resolve } from 'node:path';
const id = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const files = ['config.json','tokenizer.json','tokenizer_config.json','onnx/model_quantized.onnx'];
const revision = process.env.KOKORO_REVISION || 'main';
for (const name of files) {
  const out = resolve('models', id, name);
  const min = name.endsWith('.onnx') ? 30_000_000 : 2;
  if ((await stat(out).catch(()=>null))?.size >= min) continue;
  await mkdir(dirname(out), { recursive: true });
  const tmp = out + '.part';
  console.log('Downloading', name);
  try {
    const response = await fetch('https://huggingface.co/'+id+'/resolve/'+encodeURIComponent(revision)+'/'+name, {signal: AbortSignal.timeout(240_000)});
    if (!response.ok || !response.body) throw Error(name + ': HTTP '+response.status);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tmp));
    if ((await stat(tmp)).size < min) throw Error('Incomplete model file: '+name);
    await rename(tmp,out);
  } finally { await rm(tmp,{force:true}); }
}
