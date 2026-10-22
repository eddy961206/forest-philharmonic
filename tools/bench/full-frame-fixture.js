// 전체 앱 시각 부하 fixture야. 앱 main.js 응답 뒤에 붙여 같은 모듈의 상태를 제어해.
// 실제 오디오 스케줄러/입장 UI를 검증하는 파일은 아니고, 앱 파일 자체도 수정하지 않아.
// 원본 qa-v2/full-frame.mjs의 effects-peak/effects-show 시나리오까지 반영했어.
const benchTimes={};
function benchWrap(obj,key,label=key){
  if(!obj || typeof obj[key]!=='function')return;
  const orig=obj[key];
  obj[key]=function(...args){const t=performance.now();try{return orig.apply(this,args);}finally{benchTimes[label]=(benchTimes[label]||0)+performance.now()-t;}};
}
let benchT=25,benchPose=null,benchRotate=false,benchIndex=0;
const benchDirectorUpdate=director.update.bind(director);
director.update=function(...args){
  benchDirectorUpdate(...args);
  if(benchPose){
    camera.position.set(...benchPose[0]);
    if(benchRotate){const a=benchIndex*.24;camera.position.x+=Math.sin(a)*2;camera.lookAt(camera.position.x+Math.sin(a)*24,camera.position.y+Math.sin(a*.7)*8,camera.position.z-Math.cos(a)*24);}
    else camera.lookAt(...benchPose[1]);
    camera.fov=64;camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
};
for(const [obj,key,label] of [[perf,'updateVisual','visual'],[orchestra,'update','orchestra'],[stage,'update','stage'],[hall,'update','hall'],[director,'update','director'],[engine,'setListener','listener'],[engine,'setRoom','audioRoom'],[effects,'update','effects'],[screen,'update','broadcast'],[hall,'updateLOD','seatLOD'],[orchestra,'syncLite','syncLite'],[renderer,'render','renderSubmit']])benchWrap(obj,key,label);
if(hall.dome)benchWrap(hall.dome,'drawWorlds','worlds');

// Dome readiness evidence is collected only during the existing warmup.
// Restore every original hook before measuring; never make a hidden dome visible.
let benchDomeProbe=null;
function benchAssertDomeVisible(){
  if(hall.dome&&hall.dome.mesh.visible!==true)throw new Error('Sphere dome is hidden; exclude this frame and wait for shader readiness.');
}
function benchBeginDomeWarmup(){
  if(benchDomeProbe)throw new Error('Dome warmup probe is already active.');
  if(!hall.dome)return;
  benchAssertDomeVisible();
  const dome=hall.dome,base=dome.mesh;
  const overlay=base.children.find(o=>o.isMesh&&o.material?.uniforms?.uOverlay?.value===1);
  const twoPass=!!dome.uniforms.uOverlay;
  const roles=[{name:'base',mesh:base}];
  if(overlay)roles.push({name:'overlay',mesh:overlay});
  benchDomeProbe={roles,twoPass,overlayExpected:twoPass&&dome.uniforms.uMix.value>0.001};
  for(const role of roles){
    role.draws=0;role.mainCameraDraws=0;role.original=role.mesh.onAfterRender;
    role.hook=function(...args){
      role.draws++;
      if(args[2]===camera)role.mainCameraDraws++;
      return role.original?.apply(this,args);
    };
    role.mesh.onAfterRender=role.hook;
  }
}
function benchDomeProgram(mesh,used){
  if(!used)return {status:'NOT_USED_IN_WARMUP',ready:null,linked:null};
  try{
    const p=renderer.properties?.get(mesh.material)?.currentProgram;
    if(!p)return {status:'UNAVAILABLE',reason:'No currentProgram for a drawn dome material.',ready:null,linked:null};
    const gl=renderer.getContext();
    const ready=typeof p.isReady==='function'?p.isReady():null;
    // Do not turn an unfinished compilation into a verified warmup by forcing
    // a blocking LINK_STATUS query. Missing evidence fails the readiness gate.
    const linked=ready!==false&&p.program?gl.getProgramParameter(p.program,gl.LINK_STATUS):null;
    const runnable=p.diagnostics?.runnable??null;
    const status=ready===false?'PENDING':linked===false||runnable===false?'LINK_FAILED':ready===true&&linked===true?'VERIFIED':'UNAVAILABLE';
    return {status,id:p.id??null,ready,linked,diagnosticsRunnable:runnable,
      ...(linked===false?{programLog:String(gl.getProgramInfoLog(p.program)||'').slice(0,4000)}:{})};
  }catch(error){return {status:'INSPECTION_ERROR',ready:null,linked:null,error:error.message};}
}
function benchEndDomeWarmup(){
  if(!hall.dome)return {status:'NOT_APPLICABLE',reason:'This venue has no dome.'};
  const probe=benchDomeProbe;
  if(!probe)return {status:'UNVERIFIED',failures:['No warmup probe was started.']};
  benchDomeProbe=null;
  const failures=[];
  // Remove hooks before GL/program queries and before the measured samples.
  for(const role of probe.roles){
    if(role.mesh.onAfterRender===role.hook)role.mesh.onAfterRender=role.original;
    else failures.push(`${role.name}: onAfterRender changed while probing.`);
  }
  const dome=hall.dome,mix=dome.uniforms.uMix.value;
  const overlayExpected=probe.overlayExpected||(probe.twoPass&&mix>0.001);
  const roles=probe.roles.map(role=>({
    role:role.name,draws:role.draws,mainCameraDraws:role.mainCameraDraws,visible:role.mesh.visible,
    required:role.name==='base'||overlayExpected,program:benchDomeProgram(role.mesh,role.mainCameraDraws>0),
  }));
  if(dome.mesh.visible!==true)failures.push('Dome is hidden after warmup.');
  if(probe.twoPass&&!roles.some(role=>role.role==='overlay'))failures.push('Two-pass dome has no overlay mesh.');
  for(const role of roles){
    if(role.required&&role.mainCameraDraws===0)failures.push(`${role.role}: no main-camera draw during warmup.`);
    if(role.mainCameraDraws>0&&role.program.status!=='VERIFIED')failures.push(`${role.role}: program ${role.program.status}.`);
    if(role.role==='overlay'&&mix>0.001&&!role.visible)failures.push('Active transition overlay is hidden.');
  }
  let contextLost=null,parallelShaderCompile=null;
  try{
    const gl=renderer.getContext();
    contextLost=gl.isContextLost();
    parallelShaderCompile=!!gl.getExtension('KHR_parallel_shader_compile');
  }catch(error){failures.push(`Context inspection failed: ${error.message}`);}
  if(contextLost)failures.push('WebGL context is lost.');
  return {status:failures.length?'UNVERIFIED':'VERIFIED',failures,roles,
    path:probe.twoPass?'two-pass':'single-pass',overlay:probe.twoPass?(roles.some(role=>role.role==='overlay')?'present':'MISSING'):'NOT_APPLICABLE_SINGLE_PASS',
    mix,reveal:dome.uniforms.uReveal.value,world:dome.current,contextLost,
    parallelShaderCompile,
    interpretation:'Warmup onAfterRender counts prove draw submission, not visible pixels. Program checks run after hooks are restored, outside all measured samples.'};
}
window.__bench={
  beginDomeWarmup:benchBeginDomeWarmup,
  endDomeWarmup:benchEndDomeWarmup,
  async setup(){
    await perf.load('beethoven-ode-to-joy');
    engine.stopAll();perf._schedule=()=>{};
    Object.defineProperty(perf,'time',{configurable:true,get:()=>benchT});
    perf.playing=true;
    concertStarted=true;showStarted=true;phase='playing';
    stage.snapOnstage();stage.snapConductor(!!perf.piece.conducted);
    director.active=false;
    audience?.dispose();
    const big=IS_SPHERE?{detail:LITE?80:220,mid:LITE?0:900,cap:LITE?2500:Infinity}:{};
    const audienceSeats=hall.seats.filter(s=>!s.stage);
    audience=typeof planHouse==='function'
      ?buildAudience(planHouse(audienceSeats,seeded(417)),{lite:LITE,share:.8,...big})
      :buildAudience(audienceSeats,{lite:LITE,rand:seeded(417),fill:.8,...big});
    scene.add(audience.group);refreshOccupied();
    benchWrap(audience,'updateLOD','audienceLOD');
    hall.setHouseLights(.12);
    for(let i=0;i<120;i++)hall.update(1/60,i/60);
    renderer.info.autoReset=false;
    if(fx)benchWrap(fx,'update','fx');
    document.getElementById('splash')?.remove();
    return {crowd:audience.count,seats:hall.seats.length,eligibleAudienceSeats:audienceSeats.length,recitalSeats:hall.seats.filter(s=>s.stage).length,lite:LITE,piece:perf.piece.id,sceneState:{phase,asleep:!!window.__fp.asleep,interval:!!window.__fp.interval,recital:!!window.__fp.recital?.on,practice:!!window.__fp.practice?.on,hush:typeof hush==='undefined'?null:hush,sleepy:typeof sleepy==='undefined'?null:sleepy,seatGroupVisible:hall.seatGroup?.visible??null,audienceVisible:audience.group.visible}};
  },
  scenario(name){
    window.__resetRandom();benchIndex=0;benchRotate=name==='rotate';wallT=20;benchT=name.startsWith('broadcast')?5:25;
    perf._resetVisual(benchT);levelSmoothed=0;
    benchPose=IS_SPHERE?[[0,19,34],[0,3,-6]]:[[0,4,16],[0,3,-6]];
    if(name==='front')benchPose=[[0,1.75,5],[0,2,-7]];
    if(name==='wide')benchPose=IS_SPHERE?[[0,44,62],[0,3,-6]]:[[0,22,30],[0,4,-4]];
    if(name==='foyer')benchPose=[[0,6,40.4],[0,6,30]];
    if(name==='broadcast-hidden')benchPose=[[0,6,40.4],[0,6,48]];
    if(name==='dome')benchPose=[[0,19,34],[0,65,-15]];
    settings.screen=name.startsWith('broadcast');screen.setEnabled(settings.screen);
    if(hall.dome){
      hall.dome.showLive(name==='broadcast');
      const world=name==='forest'||name==='crossfade'?'FOREST3D':name==='peaks'?'PEAKS3D':name==='ocean'?'OCEAN3D':name==='clouds'?'CLOUDS3D':name==='dome'?'AURORA':'ARCH';
      hall.dome.go(world,{dur:.001});hall.dome.update(2);
      if(name==='crossfade') {hall.dome.go('PEAKS3D',{dur:60,reveal:false});hall.dome.update(30);}
      if(name==='reveal'){hall.dome.go('FOREST3D',{dur:60,reveal:true});hall.dome.update(30);}
      hall.dome.uniforms.uTime.value=20;
    }
    if(name==='effects-peak'&&fx){
      fx.lasers.set(true);fx.wash.set(true);
      fx.confetti.burst(new THREE.Vector3(-11,1.6,.5),new THREE.Vector3(.55,1,.5),260,11);
      fx.confetti.burst(new THREE.Vector3(11,1.6,.5),new THREE.Vector3(-.55,1,.5),260,11);
      fx.fireworks.show(0,0);
      for(const [x,y,z,c] of [[-8,12,-5,'#ffd166'],[0,15,-6,'#4ecdc4'],[8,11,-4,'#c084fc']])fx.fireworks.burst(new THREE.Vector3(x,y,z),c);
      for(let i=0;i<10;i++)fx.update(1/60,20+i/60,.5);
    }
    if(name==='effects-show'&&fx){
      fx.lasers.set(true);fx.wash.set(true);
      for(let i=0;i<480;i++){
        fx.lasers.update(1/60,12+i/60,.5);
        fx.wash.update(1/60,12+i/60);
      }
      fx.confetti.burst(new THREE.Vector3(-11,1.6,.5),new THREE.Vector3(.55,1,.5),260,11);
      fx.confetti.burst(new THREE.Vector3(11,1.6,.5),new THREE.Vector3(-.55,1,.5),260,11);
      fx.fireworks.show(0,0);
      for(const [x,y,z,c] of [[-8,12,-5,'#ffd166'],[0,15,-6,'#4ecdc4'],[8,11,-4,'#c084fc']])fx.fireworks.burst(new THREE.Vector3(x,y,z),c);
      for(let i=0;i<10;i++)fx.update(1/60,20+i/60,.5);
    }
    camera.position.set(...benchPose[0]);camera.lookAt(...benchPose[1]);camera.updateMatrixWorld();
    audience.updateLOD?.(camera.position,true);hall.updateLOD?.(camera.position);
    return {camera:{position:benchPose[0],target:benchPose[1],fov:64},musicTime:benchT,world:hall.dome?.current??null,broadcast:settings.screen,effectsPeak:name==='effects-peak',effectsShow:name==='effects-show'};
  },
  step(complete=true){
    if(document.hidden)throw new Error('Benchmark page is hidden; keep the tab visible and rerun.');
    if(window.__fp.asleep)throw new Error('Benchmark app is asleep; wake it before measuring.');
    benchAssertDomeVisible();
    for(const key in benchTimes)benchTimes[key]=0;
    if(settings.quality!=='auto')lastNow=performance.now()-1000/60;
    renderer.info.reset();
    const start=performance.now();
    frame();
    const submit=performance.now();
    const gl=renderer.getContext();
    if(complete)gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    const end=performance.now();
    benchAssertDomeVisible();
    benchIndex++;benchT+=1/60;
    return {completeMs:complete?end-start:null,submitMs:submit-start,completionWaitMs:complete?end-submit:null,completed:complete,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,times:{...benchTimes},geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,heap:performance.memory?.usedJSHeapSize??null,quality,renderScale,visibility:document.visibilityState,asleep:!!window.__fp.asleep,glError:gl.getError(),contextLost:gl.isContextLost()};
  },
  meta(){const gl=renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):null,gpuTimer:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),pixelRatio:renderer.getPixelRatio(),viewport:[innerWidth,innerHeight],quality,renderScale,hardwareConcurrency:navigator.hardwareConcurrency,userAgent:navigator.userAgent};}
};
