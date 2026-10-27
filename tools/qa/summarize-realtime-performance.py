#!/usr/bin/env python3
"""Descriptive summaries. rAF is browser callback cadence, not physical GPU time."""
import json,glob,statistics,pathlib
ROOT=pathlib.Path('docs/evidence/repertoire/performance')
def q(a,p):
 a=sorted(a)
 return a[min(len(a)-1,int((len(a)-1)*p))] if a else None
def dist(a):
 return dict(n=len(a),mean=statistics.mean(a),p50=q(a,.5),p95=q(a,.95),p99=q(a,.99),max=max(a)) if a else {}
result={}
for path in ROOT.glob('*.json'):
 try:d=json.loads(path.read_text())
 except:continue
 if not isinstance(d,dict) or 'frames' not in d or 'environment' not in d:continue
 frames=[x[1] for x in d['frames'][1:] if x[1]>0];samples=d['samples'];notes=[x[1] for x in d['notes']]
 r={'environment':d['environment'],'framesMs':dist(frames),'rafRate':1000/statistics.mean(frames) if frames else None,'framesOver50':sum(x>50 for x in frames),'framesOver100':sum(x>100 for x in frames),'leadMs':dist(notes),'notesLate0':sum(x<0 for x in notes),'notesLate100':sum(x< -100 for x in notes),'longtasks':dist([x[1] for x in d['longtasks']]),'audioStates':sorted(set(s['audioState'] for s in samples)),'visibility':sorted(set(s['visibility'] for s in samples)),'heapBytes':dist([s['heap'] for s in samples]),'voices':dist([s['voices'] for s in samples]),'resourceFirst':samples[0]['resources'] if samples else {},'resourceLast':samples[-1]['resources'] if samples else {},'qualities':sorted(set(s['quality'] for s in samples)),'renderScales':sorted(set(s['stats']['renderScale'] for s in samples)),'firstSample':samples[0] if samples else None,'lastSample':samples[-1] if samples else None,'errors':d['errors']}
 # Cumulative renderer task duration divided by elapsed metric timestamp.
 if len(d.get('cdp',[]))>1:
  a={x['name']:x['value'] for x in d['cdp'][0]['metrics']};b={x['name']:x['value'] for x in d['cdp'][-1]['metrics']};dt=b['Timestamp']-a['Timestamp'];r['rendererTaskBusyPct']=100*(b['TaskDuration']-a['TaskDuration'])/dt
  metrics=[{x['name']:x['value'] for x in row['metrics']} for row in d['cdp']]
  r['cdpJSHeapUsedSizeBytes']=dist([m['JSHeapUsedSize'] for m in metrics])
  r['cdpV8PerContextDatas']=sorted(set(m.get('V8PerContextDatas') for m in metrics))
 if 'elgar-concert-full' in path.stem:
  # time() subtracts transport startup lead and output latency. Frames here
  # end at score duration + those measured startup terms, before applause.
  playing=[x for x in samples if x['playing']]
  offset=statistics.median(x['wall']/1000-x['pos'] for x in playing) if playing else .168
  duration=max(x['pos'] for x in samples)
  af=[v for t,v in d['frames'][1:] if v>0 and t <= (duration+offset)*1000]
  r['musicOnly']={'cutoffWallMs':(duration+offset)*1000,'framesMs':dist(af),'rafRate':1000/statistics.mean(af),'over50':sum(x>50 for x in af),'over100':sum(x>100 for x in af),'cameraPositions':sorted(set(tuple(x['camera']['position']) for x in playing))}
 if d.get('audio'):
  ar=[x['realtimeData'] for x in d['audio'] if 'realtimeData'in x]
  r['audioRealtime']={'n':len(ar),'renderCapacity':dist([x['renderCapacity'] for x in ar]),'callbackMeanMs':dist([x['callbackIntervalMean']*1000 for x in ar]),'callbackVarianceMs2':dist([x['callbackIntervalVariance']*1e6 for x in ar])}
 if d.get('finalPlaybackStats'):
  first=d['environment']['audio'].get('playbackStats',{});last=d['finalPlaybackStats'];r['playbackDelta']={k:last[k]-first.get(k,0) for k in ('underrunDuration','underrunEvents','totalDuration')};r['playbackFinal']=last
 if d.get('system'):
  sys=d['system'];rss=[]
  for row in sys:
   rss.append(sum(float(l.split()[3]) for l in row.get('ps','').splitlines() if len(l.split())==4)/1024)
  r['dedicatedChromeRSSMiB']=dist(rss)
  if len(sys)>1:
   first={x['id']:x for x in sys[0]['processes']};last={x['id']:x for x in sys[-1]['processes']};dt=(sys[-1]['wallMs']-sys[0]['wallMs'])/1000
   r['cpuPctByProcess']=[{'type':last[k]['type'],'pid':k,'cpuPct':100*(last[k]['cpuTime']-first[k]['cpuTime'])/dt} for k in first.keys()&last.keys()]
 r['playingSamples']=sum(x['playing'] for x in samples);r['sampleCount']=len(samples)
 result[path.stem]=r
for path in ROOT.glob('*audio.json'):
 d=json.loads(path.read_text());rows=[x['realtimeData'] for x in d if 'realtimeData'in x]
 result[path.stem]={'n':len(rows),'renderCapacity':dist([x['renderCapacity'] for x in rows]),'callbackIntervalMeanMs':dist([x['callbackIntervalMean']*1000 for x in rows]),'callbackIntervalVarianceMs2':dist([x['callbackIntervalVariance']*1000000 for x in rows]),'errors':[x for x in d if 'error'in x]}
(ROOT/'summary.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:{x:v for x,v in a.items() if x not in ['environment','firstSample','lastSample']} for k,a in result.items()},indent=2))
