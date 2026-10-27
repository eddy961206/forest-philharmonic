import * as THREE from 'three';

// A small tailored surface, not a cloth simulation. Matching rings allow the
// GPU to blend the lap drape into a hanging skirt when the performer stands.
export function skirtGeometry(hipY, celloSeat = false) {
  const n = 24;
  const seated = [
    [.205, .18, 0, .10],
    [celloSeat ? .43 : .255, .27, -.075, .09],
    [celloSeat ? .435 : .275, .29, -.10, -.08],
    [celloSeat ? .435 : .28, .285, -.10, -.34],
  ];
  const upright = [[.205,.18,0,.10],[.235,.21,0,-.04],[.275,.25,0,-.20],[.30,.29,0,-.40]];
  const vertices = rings => {
    const a=[];
    for(const [rx,rz,cz,y] of rings) for(let i=0;i<=n;i++) {
      const angle=i/n*Math.PI*2;
      a.push(Math.sin(angle)*rx,hipY+y,cz-Math.cos(angle)*rz);
    }
    return new THREE.Float32BufferAttribute(a,3);
  };
  const geometry=new THREE.BufferGeometry(), index=[];
  geometry.setAttribute('position',vertices(seated));
  for(let r=0;r<seated.length-1;r++) for(let i=0;i<n;i++) {
    const a=r*(n+1)+i,b=a+n+1; index.push(a,b,a+1,a+1,b,b+1);
  }
  geometry.setIndex(index);geometry.computeVertexNormals();
  const target=new THREE.BufferGeometry();target.setIndex(index);target.setAttribute('position',vertices(upright));target.computeVertexNormals();
  geometry.morphAttributes.position=[target.getAttribute('position')];
  geometry.morphAttributes.normal=[target.getAttribute('normal')];
  geometry.computeBoundingSphere();
  return geometry;
}
