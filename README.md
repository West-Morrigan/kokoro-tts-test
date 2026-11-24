# Kokoro TTS test

Independent experiment for server-side pronunciation. No KittyLingo credentials, data, or production infrastructure.

- Kokoro.js 1.2.1, ONNX CPU, Q8.
- Downloads model weights at build time; runtime loads only local files.
- Generates WAV on demand and does not persist audio.
- Browser playground at /, API at POST /api/tts.
- Reports model cold/warm state, initialization, inference, RSS high-water mark and browser round trip.

## Deploy

Netlify project: kokoro-tts-test (83dcbca9-ec50-4ea4-9ba5-882a82843751).

Link this repository in the Netlify project using Git deployment. Build settings are in netlify.toml. Set TTS_TEST_KEY to a random secret of at least 24 characters with Functions scope before deployment. Enter that key in the playground; it is not persisted. The endpoint also has an IP rate limit. Never commit the key.

The build may fail on native module packaging or function-size limits. The GitHub smoke workflow checks model load and synthesis on a Linux runner, not on Netlify. A successful smoke test is not proof of Netlify compatibility.

## Local

Node 22. Run npm install, npm run prepare:model, npm run smoke. For the playground run netlify dev with TTS_TEST_KEY configured.

Example API JSON: {"text":"Thursday","voice":"bf_emma","speed":1}

Authentication: Authorization: Bearer YOUR_TEST_KEY. Output: audio/wav and X-TTS-Stats header. Text capped at 180 characters. No request text is logged by the function.

## Benchmark

Repeat the same word and compare instance IDs. A cold model has cold=true; a warm one has cold=false. Browser round trip includes platform and network latency. RSS peak is process-wide, not Netlify's billed memory. Try a handful of British voices and individual words. Cold starts cannot be forced reliably on the platform. Targets: under 5 s cold, 500 ms warm, 850 MB peak; these are goals, not measured results.

Model and runtime downloads are not committed. The upstream model revision defaults to main; set KOKORO_REVISION during build to pin a tested revision. Direct dependencies are pinned; a lockfile should be committed after a successful installation.
