# Motion verification

Status: **PASS**

Sampled score windows and full stage lifecycle at synthetic 60 Hz; no GPU, audio, visual aesthetics or physical iPhone certification.

Inputs SHA-256: `f7678218b983c53b8dd4aab95203d08afdd733808386f91896c3da69588a0f94`

## Coverage

```json
{
  "songs": 82,
  "cast": 51,
  "rigs": 30,
  "frames": 142110,
  "armSamples": 5182248,
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
- PASS: node --experimental-loader ./tests/helpers/three-loader.mjs tools/qa/audit-playing-motion.mjs /Users/seung/Documents/Codex/2026-10-23/new-chat/work/outdoor-qa/verification/motion-audit.json — [log](motion-audit.log)

## Failures

None in the automated scope.

## Next action

For mesh, rig or venue visual changes, record the affected generated cases. Ordinary score-only changes do not require individual screenshots.

Record an automatically discovered chair: `npm run record:motion -- --plan "../outdoor-qa/verification/recording-plan.json" --case vn1-0 --label review`.

Full method and extension contracts: [motion-harness.md](../../../motion-harness.md).
