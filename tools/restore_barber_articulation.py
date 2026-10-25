"""Restore only lost bowed/pizzicato routing from PDMX MusicXML directions.
Original MIDI note events, ticks, velocities, controllers, tempos remain identical.
"""
import json,mido,xml.etree.ElementTree as E,hashlib,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'tools/scores'
z=zipfile.ZipFile(OUT/'rossini-barber-overture.mxl')
r=E.fromstring(z.read(next(n for n in z.namelist() if n.endswith('.xml') and not n.startswith('META-INF/'))));m=mido.MidiFile(ROOT/'tools/scores/rossini-barber-overture.mid');audit={}
for ti in range(11,15):
 p=r.findall('part')[ti];total=0;div=24;trans=[(0,48,'initial','0')]
 for measure in p.findall('measure'):
  pos=0;end=0
  for c in measure:
   if c.tag=='attributes' and c.find('divisions') is not None:div=int(c.findtext('divisions'))
   if c.tag=='note' and c.find('chord') is None:pos+=int(c.findtext('duration') or 0);end=max(end,pos)
   if c.tag=='backup':pos-=int(c.findtext('duration'))
   if c.tag=='forward':pos+=int(c.findtext('duration'));end=max(end,pos)
   if c.tag=='direction':
    text=' '.join(c.itertext()).lower().strip();offset=int(c.findtext('offset') or 0)
    if 'pizz' in text or 'arco' in text:
     trans.append((total+(pos+offset)*m.ticks_per_beat//div,45 if 'pizz' in text else 48,text,measure.attrib['number']))
  total+=end*m.ticks_per_beat//div
 assert total==507000
 audit[str(ti)]=trans
 events=[];tick=0
 for order,msg in enumerate(m.tracks[ti]):
  tick+=msg.time;events.append((tick,order,0,msg.copy(time=0)))
 for order,(tick,program,_,_) in enumerate(trans):
  same=[e for e in events if e[0]==tick];notes=[e[1] for e in same if e[3].type in ('note_on','note_off')]
  rank=min(notes)-0.5 if notes else max([e[1] for e in same],default=0)+0.5
  events.append((tick,rank,order,mido.Message('program_change',channel=0,program=program)))
 tr=mido.MidiTrack();previous=0
 for tick,_,_,msg in sorted(events,key=lambda x:x[:3]):tr.append(msg.copy(time=tick-previous));previous=tick
 m.tracks[ti]=tr
original=mido.MidiFile(ROOT/'tools/scores/rossini-barber-overture.mid')
def nonprogram(mid):
 out=[]
 for i,t in enumerate(mid.tracks):
  tick=0
  for msg in t:
   tick+=msg.time
   if msg.type!='program_change':out.append((i,tick,str(msg.copy(time=0))))
 return out
assert nonprogram(original)==nonprogram(m)
file='rossini-barber-overture-articulated.mid';m.save(ROOT/'tools/scores'/file)
json.dump(audit,open(OUT/'rossini-barber-articulation-transitions.json','w'),indent=2)
print('Restored MusicXML articulation; all non-program events and absolute ticks unchanged.')
