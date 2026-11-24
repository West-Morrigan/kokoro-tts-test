# Edge TTS server experiment

Independent Netlify preview of the unofficial Microsoft Edge Read Aloud service using edge-tts-universal 1.4.0 (AGPL-3.0-or-later). No browser process, local model or generated-audio storage. The user supplies the existing TTS_TEST_KEY; submitted text goes to Microsoft's speech service. Do not submit sensitive data.

npm install; npm run build; npm run smoke verifies request validation. LIVE_TTS_TEST=1 npm run smoke additionally exercises the upstream service. Deployment preview must have TTS_TEST_KEY configured in Functions scope. No secrets in code.

The browser makes a same-origin POST to /api/tts. The function returns a complete MP3 with first upstream MP3-byte timing, full synthesis duration, and instance metadata. Browser round-trip includes platform and network overhead. No audio cache. The upstream service is undocumented, may reject requests, and is not an established commercial-use entitlement. Do not merge into main. Main and all Pocket TTS branches are independent.

Upstream source/license: https://github.com/travisvn/edge-tts-universal
