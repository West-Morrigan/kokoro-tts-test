# Pocket TTS experiment

This branch tests Kyutai Pocket TTS English 18.2M, using the upstream standalone Linux Rust server (release v4.0.0) and its predefined Alba voice. No Python, PyTorch, ONNX or generated-audio storage. Main remains the Kokoro benchmark; experiment/pocket-tts remains the 7M benchmark.

## Build and run

Node 22. Run npm run build to download the binary, pinned public no-voice-cloning weights, tokenizer, voice embedding and matching config. All files are included in the Netlify function bundle. A local config directs the engine to the bundled files.

Run npm run smoke to exercise the actual handler locally on Linux x86_64 (AVX2 required). It checks valid WAV output and cold/warm state. CI runs this automatically.

Set TTS_TEST_KEY (at least 24 chars) for Functions in the Netlify branch deploy or deploy preview context. Enable branch deploys for experiment/pocket-tts, or use a deploy preview, without changing the production branch. The frontend and API use the same origin. No secrets in source.

## Benchmark

The Node function spawns the Rust server bound to loopback only, retains it across warm invocations if the platform permits, and buffers a WAV response. The first-PCM measurement describes internal generation latency, not client playback. The round trip measures the whole audio response. The Rust peak RSS and Node current RSS are separately reported. Compare repeated 'book' and the three-word phrase against Kokoro. No performance target is assumed to be met until verified.

The release binary's libc compatibility, process spawning, bundled asset permissions and server reuse must be validated on Netlify. No change to the production app.

Upstream: https://github.com/kyutai-labs/pocket-tts/tree/v4.0.0 (MIT).
