# Motion verification

Status: **PASS**

Sampled score windows and full stage lifecycle at synthetic 60 Hz; no GPU, audio, visual aesthetics or physical iPhone certification.

Inputs SHA-256: `1526ff768f31d1a23e54e2429a861e7ae523b8428865c9a753f1400ad461faea`

## Coverage

```json
{
  "songs": 90,
  "cast": 51,
  "rigs": 30,
  "frames": 152610,
  "armSamples": 5348994,
  "venues": [
    {
      "id": "hall",
      "stage": "shared-hall-stage"
    },
    {
      "id": "outdoor",
      "stage": "shared-hall-stage"
    },
    {
      "id": "sphere",
      "stage": "shared-hall-stage"
    }
  ],
  "generatedRecordingCases": 51
}
```

## Steps

- PASS: node tools/test.mjs --test-reporter=tap — [log](unit-tests.log)
- PASS: node --experimental-loader ./tests/helpers/three-loader.mjs tools/qa/audit-playing-motion.mjs /Users/seung/Documents/Codex/2026-10-23/new-chat/work/outdoor-expansion-qa/verification/motion-audit.json — [log](motion-audit.log)

## Failures

None in the automated scope.

## Next action

For mesh, rig or venue visual changes, record the affected generated cases. Ordinary score-only changes do not require individual screenshots.

Record an automatically discovered chair: `npm run record:motion -- --plan "../outdoor-expansion-qa/verification/recording-plan.json" --case vn1-0 --label review`.

Full method and extension contracts: [motion-harness.md](../../forest-philharmonic/docs/motion-harness.md).
