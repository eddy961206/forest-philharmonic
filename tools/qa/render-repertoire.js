// Run through cdp-direct eval on a same-origin blank document (not the app tab).
// This measures the actual engine offline. It is not a real-time load benchmark.
(async () => {
  const {AudioEngine} = await import('/js/audio/engine.js');
  const {Performance} = await import('/js/audio/performance.js');
  const {OUTDOOR_ACOUSTICS} = await import('/js/scene/outdoorplan.js');
  const {SPHERE_ACOUSTICS} = await import('/js/scene/sphereplan.js');
  const NativeAudioContext = window.AudioContext;
  const bank = new AudioEngine();
  bank.ctx = new NativeAudioContext({sampleRate: 48000});
  await bank.loadSamples('/samples');
  window.repertoireQA = {sampleFailures: bank.failed, samples: Object.values(bank.samples).reduce((n,s)=>n+s.buf.size,0), results: [], buffers: {}};
  await bank.ctx.close();
  window.renderRepertoireExcerpt = async (id, start=0, length=18, venue='hall') => {
    const score = await (await fetch('/music/'+id+'.json')).json();
    const rate=48000, ctx = new OfflineAudioContext(2,Math.ceil((length+3)*rate),rate);
    const engine = new AudioEngine();
    window.AudioContext = function(){return ctx;};
    try { await engine.init({acoustics: venue==='outdoor'?OUTDOOR_ACOUSTICS:venue==='sphere'?SPHERE_ACOUSTICS:null}); }
    finally { window.AudioContext=NativeAudioContext; }
    engine._stopTimer(); engine.samples=bank.samples;
    engine.setListener({x:0,y:1.5,z:8},{x:0,y:0,z:-1},{x:0,y:1,z:0});
    const perf = Object.create(Performance.prototype); perf.engine=engine;
    const prepared=perf.prepare(score);
    engine.setEnsemble(prepared.ensemble);
    engine.setTrim(prepared.level.trim, 0.001);
    let notes=0, error=null;
    try {
      const ev=prepared.ev;
      for(let i=0;i<ev.length;i+=5) {
        const tr=score.tracks[ev[i]],on=ev[i+1],dur=ev[i+2];
        if(on>=start+length || on+dur<=start)continue;
        const skip=Math.max(0,start-on);
        // Keep the original envelope through the excerpt boundary. The offline
        // context limits the file; shortening the note would compress its phrase.
        engine.playNote({section:tr.section,inst:tr.inst,midi:ev[i+3],vel:ev[i+4],when:Math.max(0,on-start)+.02,dur:dur-skip,gain:tr.gain??1,layer:tr.layer,skip,bends:tr.bends,bendStart:Math.max(start,on),expression:prepared.expression.subarray(i/5*2,i/5*2+2)});notes++;
      }
    } catch(e) { error=String(e.stack||e); }
    const audio=await ctx.startRendering();
    let peak=0,sum=0,clipped=0,nonfinite=0;
    for(let ch=0;ch<audio.numberOfChannels;ch++)for(const v of audio.getChannelData(ch)) {
      if(!Number.isFinite(v)){nonfinite++;continue;}
      peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>=1)clipped++;
    }
    const result={id,start,length,venue,notes,trimDb:prepared.level.trim,peak,peakDb:20*Math.log10(peak),rms:Math.sqrt(sum/(audio.length*audio.numberOfChannels)),clipped,nonfinite,error};
    window.repertoireQA.results.push(result);window.repertoireQA.buffers[id]=audio;
    return result;
  };
  window.repertoireWav = id => {
    const b=window.repertoireQA.buffers[id], n=b.length, raw=new ArrayBuffer(44+n*4),v=new DataView(raw);
    const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
    str(0,'RIFF');v.setUint32(4,36+n*4,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,b.sampleRate,true);v.setUint32(28,b.sampleRate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*4,true);
    for(let i=0;i<n;i++)for(let ch=0;ch<2;ch++)v.setInt16(44+(i*2+ch)*2,Math.round(Math.max(-1,Math.min(1,b.getChannelData(ch)[i]))*32767),true);
    let bin='';const a=new Uint8Array(raw);for(let i=0;i<a.length;i+=32768)bin+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(bin);
  };
  return {samples:window.repertoireQA.samples,failures:window.repertoireQA.sampleFailures};
})()
