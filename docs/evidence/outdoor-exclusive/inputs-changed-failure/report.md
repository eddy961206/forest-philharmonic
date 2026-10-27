# Motion verification

Status: **FAIL**

Sampled score windows and full stage lifecycle at synthetic 60 Hz; no GPU, audio, visual aesthetics or physical iPhone certification.

Inputs SHA-256: `61ebaf09538f4d8838d2fb47ad6480a7c8baafce0c239ccc4e786ec1c12628ed`

## Coverage

```json
{
  "songs": 106,
  "cast": 51,
  "rigs": 30,
  "frames": 177660,
  "armSamples": 6109474,
  "venues": [
    {
      "id": "hall",
      "stage": "shared-hall-stage"
    },
    {
      "id": "sphere",
      "stage": "shared-hall-stage"
    },
    {
      "id": "outdoor",
      "stage": "shared-hall-stage"
    }
  ],
  "generatedRecordingCases": 51
}
```

## Steps

- PASS: node tools/test.mjs --test-reporter=tap — [log](unit-tests.log)
- PASS: node --experimental-loader ./tests/helpers/three-loader.mjs tools/qa/audit-playing-motion.mjs /Users/seung/Documents/Codex/2026-10-23/new-chat/work/outdoor-exclusive-qa/verification-latest/motion-audit.json — [log](motion-audit.log)

## Failures

See [verification-summary.json](verification-summary.json) for metrics, limits, suggested fixes and reproduction commands.

## Next action

Fix the reported cause and rerun `npm run verify:motion`. Do not increase tolerances to hide a failure.

Record an automatically discovered chair: `npm run record:motion -- --plan "../outdoor-exclusive-qa/verification-latest/recording-plan.json" --case vn1-0 --label review`.

Full method and extension contracts: [motion-harness.md](../../forest-philharmonic/docs/motion-harness.md).
