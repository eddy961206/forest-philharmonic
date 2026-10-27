import * as THREE from 'three';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrchestra, musicStandOffset } from '../public/js/scene/orchestra.js';
import { WIND_RIGS } from '../public/js/scene/wind-rigs.js';

// I.standParts uses a 52 x 36 cm desk tilted -0.42 rad and a 4.5 cm lip.
// Inflate both by 1.5 cm to require clearance, not merely non-intersection.
function deskVolumes(player) {
  const offset = musicStandOffset('trombone');
  const world = new THREE.Matrix4().compose(
    player.home,
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw),
    new THREE.Vector3(1, 1, 1),
  );
  return [
    { center: [offset.x, .96, offset.z + .02], rotation: -.42, size: [.52, .36, .01] },
    { center: [offset.x, .795, offset.z + .075], rotation: 0, size: [.52, .012, .045] },
  ].map(({ center, rotation, size }) => ({
    inverse: world.clone().multiply(new THREE.Matrix4().makeTranslation(...center))
      .multiply(new THREE.Matrix4().makeRotationX(rotation)).invert(),
    box: new THREE.Box3(
      new THREE.Vector3(...size.map(v => -v / 2 - .015)),
      new THREE.Vector3(...size.map(v => v / 2 + .015)),
    ),
  }));
}

function intersectsDesk(slide, volumes) {
  const triangle = new THREE.Triangle();
  let hit = false;
  slide.traverse(mesh => {
    if (!mesh.isMesh || hit) return;
    const { position } = mesh.geometry.attributes;
    const index = mesh.geometry.index;
    for (const { inverse, box } of volumes) {
      const matrix = inverse.clone().multiply(mesh.matrixWorld);
      for (let i = 0; i < (index?.count || position.count); i += 3) {
        for (const [corner, vertex] of [triangle.a, triangle.b, triangle.c].entries()) {
          vertex.fromBufferAttribute(position, index ? index.getX(i + corner) : i + corner).applyMatrix4(matrix);
        }
        if (box.intersectsTriangle(triangle)) { hit = true; return; }
      }
    }
  });
  return hit;
}

test('both trombonists clear the music desk and lip throughout the complete slide and readiness range', t => {
  const previousDocument = globalThis.document;
  t.after(() => { globalThis.document = previousDocument; });
  const context = new Proxy({}, {
    get: (_, key) => key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {},
  });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  const orchestra = buildOrchestra(new THREE.Scene());
  for (const player of orchestra.players.filter(p => p.sid === 'tb')) {
    player.sway = 0;
    player.energy = 1;
    const volumes = deskVolumes(player);
    for (let ready = 0; ready <= 20; ready++) {
      player.ready = ready / 20;
      for (const lean of [-.08, 0, .08]) for (const sway of [-.08, 0, .08]) {
        player.char.body.rotation.x = lean;
        player.char.body.rotation.z = sway;
        WIND_RIGS.trombone.update(player, { t: 0, dt: 1, playing: true, st: { lastMidi: 60 } });
        // Sweep the geometric slide independently of pitch so both endpoints
        // and every 6 mm in between are covered, including the .03 rest value.
        for (let extension = 0; extension <= 12; extension++) {
          player.inst.slide.position.z = -extension * .006;
          player.char.root.updateWorldMatrix(true, true);
          assert.equal(intersectsDesk(player.inst.slide, volumes), false,
            `chair=${player.ci}, ready=${player.ready}, lean=${lean}, sway=${sway}, extension=${extension * .006}`);
        }
      }
    }
  }
});
