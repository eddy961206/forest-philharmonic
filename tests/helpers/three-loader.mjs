// Browser import-map equivalent for dependency-free Node tests. The runtime
// uses these same vendored Three files; this loader also works on Node 18.
const vendor = new URL('../../public/vendor/three/', import.meta.url);

export function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    return { url: new URL('three.module.js', vendor).href, shortCircuit: true };
  }
  if (specifier.startsWith('three/addons/')) {
    return { url: new URL(specifier.slice('three/'.length), vendor).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
