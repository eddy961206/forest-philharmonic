// Geometric regression evidence only: no rendering or subjective immersion score.
import {writeFileSync} from 'node:fs';
import {SP} from '../../public/js/scene/sphereplan.js';
import {domeDirection} from '../../public/js/scene/dome-projection.js';
const norm=p=>{const n=Math.hypot(p.x,p.y,p.z);return {x:p.x/n,y:p.y/n,z:p.z/n};};
const moon=norm({x:.18,y:.52,z:-.83});
function hit(o,d){const q={x:o.x-SP.C.x,y:o.y-SP.C.y,z:o.z-SP.C.z};const b=q.x*d.x+q.y*d.y+q.z*d.z;const t=-b+Math.sqrt(b*b-(q.x*q.x+q.y*q.y+q.z*q.z-SP.R*SP.R));return {x:o.x+t*d.x,y:o.y+t*d.y,z:o.z+t*d.z};}
const oldMoon=hit(SP.VIEW,moon);
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.x*b.x+a.y*b.y+a.z*b.z)))*180/Math.PI;
const poses={sweetSpot:SP.VIEW,floor:{x:0,y:1.7,z:20},sideRight:{x:32,y:28,z:42},sideLeft:{x:-32,y:28,z:42},upper:{x:0,y:46,z:62}};
const rows=Object.entries(poses).map(([name,viewer])=>({name,viewer,legacyMoonBearingErrorDeg:angle(domeDirection(3,oldMoon,viewer,SP.VIEW,'immersive'),moon),immersiveRayErrorDeg:angle(domeDirection(3,hit(viewer,moon),viewer,SP.VIEW,'immersive'),moon)}));
const report={baseline:'30c223e98add1eda19c9cd410e9bfddc339cd81d',kind:'analytic sphere ray intersection; positions are mathematical probes, not seat-occupancy claims',moonDirection:moon,rows};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2));
