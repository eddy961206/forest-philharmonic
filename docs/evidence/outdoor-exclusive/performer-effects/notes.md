# Performer effects verification

All three venues passed active, off and efficient checks in desktop Chrome. Normal note capacity stays 220; efficient runtime limit is 24. Off removed all notes and floor indicators immediately. No visible floor indicator belonged to an inactive performer. Focused unit tests additionally cover entrance walking, pause, independent toggles and budget restoration.

Outdoor bright wooden floor screenshots were visually reviewed: lavender section circles remain discernible; efficient screenshot and video retain floating notes. Hall and Sphere images preserve their existing additive floor appearance. Each venue has active/off/efficient PNGs and a four-second efficient WebM captured from the running canvas.

Sphere initially used Swan Lake and sampled an interval without a note particle. Repeated with Can-can, waiting for active effects before capturing. This was a QA sampling change; product code stayed frozen.

No real iPadOS/device verification or performance claims. Root handles final performance testing.

Reproduce from repo: `APP_PORT=8096 CDP_PORT=9224 QA_OUT=../outdoor-exclusive-qa/performer-effects node tools/qa/verify-performer-effects.mjs`. Set PUPPETEER_PATH when needed. The reusable tool syntax check passed.

Source SHA256: f6cd0a4f7b153f5a5e492e8ff9f96221fdbf7c521a7ddab150970e4e9eaa7d5f
Source unchanged during captures: True
