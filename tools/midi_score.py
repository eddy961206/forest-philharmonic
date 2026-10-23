"""Deterministic MIDI -> native Web Audio score. Requires mido==1.3.3.

Keep the source's notes, rests, tempo changes, dynamics, sustain and part names.
No generated melody, loop padding, or external audio playback is involved.
"""
from __future__ import annotations
import bisect
from collections import defaultdict, deque
from pathlib import Path
import mido

# General MIDI programs are zero-based. Explicitly reject unknown programs;
# the catalog can provide a documented arrangement rather than silently use piano.
GM = {
    0:('piano','piano'), 32:('cb','pizzicato'), 6:('piano','harpsichord'), 8:('cel','celesta'),
    9:('mallet','glockenspiel'), 11:('mallet','vibraphone'), 12:('mallet','marimba'),
    13:('mallet','xylophone'), 14:('bells','bells'), 19:('organ','organ'),
    40:('vn1','violin'),41:('va','viola'),42:('vc','cello'),43:('cb','contrabass'),
    44:('vn1','tremolo'),45:('vn1','pizzicato'),46:('harp','harp'),47:('timp','timpani'),
    48:('vn1','strings'),49:('vn1','strings'),52:('choir','choir'),53:('choir','voice'),
    56:('tp','trumpet'),57:('tb','trombone'),58:('tu','tuba'),60:('hn','horn'),
    64:('sax','sopranoSax'),65:('sax','altoSax'),66:('sax','tenorSax'),67:('sax','baritoneSax'),
    68:('ob','oboe'),69:('eh','englishHorn'),70:('bn','bassoon'),71:('cl','clarinet'),
    72:('picc','piccolo'),73:('fl','flute'),
}
DRUMS = {35:('bd','bassDrum'),36:('bd','bassDrum'),38:('sd','snare'),40:('sd','snare'),
         43:('tom','tom'),59:('cy','cymbals'),49:('cy','cymbals'),51:('cy','cymbals'),55:('cy','cymbals'),57:('cy','cymbals'),
         54:('tamb','tambourine'),80:('tri','triangle'),81:('tri','triangle')}
DRUM_ROOT = {'bassDrum':36,'snare':38,'cymbals':49,'tambourine':54,'triangle':81,'tom':43}

def read_midi(filename):
    midi=mido.MidiFile(filename)
    if midi.type==2:raise ValueError('Asynchronous MIDI sequences are not supported')
    tempos={0:500000}; meters={0:(4,4)}; timeline=[]; names={}; end=0
    def clean_name(name):
        try:name=name.encode('latin1').decode('utf8')
        except (UnicodeEncodeError,UnicodeDecodeError):pass
        return name.replace('\0','').strip()
    # MIDI port is track-local routing metadata. Channel state is global within
    # a port, including across tracks (a separate track can contain controllers).
    for ti,track in enumerate(midi.tracks):
        # MuseScore writes the initial port after its zero-tick program setup.
        # It describes the track's initial routing, including that setup.
        initial=[];initial_tick=0
        for message in track:
            initial_tick+=message.time
            if initial_tick>0:break
            if message.type=='midi_port':initial.append(message.port)
        tick=0;port=initial[0] if initial else 0;names[ti]=f'Part {ti}'
        for mi,msg in enumerate(track):
            tick+=msg.time
            if msg.type=='midi_port':port=msg.port
            if msg.type=='track_name':names[ti]=clean_name(msg.name)
            if msg.type=='set_tempo':tempos[tick]=msg.tempo
            if msg.type=='time_signature':meters[tick]=(msg.numerator,msg.denominator)
            if not msg.is_meta:timeline.append((tick,ti,mi,port,msg))
        end=max(end,tick)
    points=sorted(tempos);secs=[0.0]
    for a,b in zip(points,points[1:]):secs.append(secs[-1]+mido.tick2second(b-a,midi.ticks_per_beat,tempos[a]))
    def seconds(t):
        i=bisect.bisect_right(points,t)-1
        return secs[i]+mido.tick2second(t-points[i],midi.ticks_per_beat,tempos[points[i]])
    pg=defaultdict(int) # GM's specified power-on program is Acoustic Grand Piano.
    volume=defaultdict(lambda:100);expression=defaultdict(lambda:127)
    bend=defaultdict(list);rpn=defaultdict(lambda:[127,127]);sensitivity=defaultdict(lambda:[2,0])
    held=defaultdict(deque);pedal=defaultdict(bool);sustained=defaultdict(list);events=defaultdict(list)
    def finish(note,off):
        on,key,vel,program,port,ch,ti=note
        if off>on and vel>0:events[ti,program,port,ch].append((seconds(on),seconds(off)-seconds(on),key,vel))
    for tick,ti,mi,port,msg in sorted(timeline,key=lambda e:e[:3]):
        if not hasattr(msg,'channel'):continue
        ch=msg.channel;channel=(port,ch)
        if msg.type=='program_change':pg[channel]=msg.program
        if msg.type=='control_change':
            if msg.control==101:rpn[channel][0]=msg.value
            elif msg.control==100:rpn[channel][1]=msg.value
            elif msg.control in (6,38) and rpn[channel]==[0,0]:sensitivity[channel][msg.control==38]=msg.value
            elif msg.control==7:volume[channel]=msg.value
            elif msg.control==11:expression[channel]=msg.value
            elif msg.control==64:
                pedal[channel]=msg.value>=64
                if not pedal[channel]:
                    for n in sustained[channel]:finish(n,tick)
                    sustained[channel].clear()
            elif msg.control in (120,123):
                for key in list(held):
                    if key[:2]==channel:
                        for n in held.pop(key):finish(n,tick)
                for n in sustained[channel]:finish(n,tick)
                sustained[channel].clear()
        if msg.type=='pitchwheel':
            semitones,cents=sensitivity[channel]
            bend[channel].append([round(seconds(tick),4),round(msg.pitch/8192*(semitones*100+cents),4)])
        if msg.type=='note_on' and msg.velocity>0:
            vel=max(0,min(127,round(msg.velocity*(volume[channel]/100)**0.5*(expression[channel]/127))))
            held[port,ch,msg.note].append((tick,msg.note,vel,pg[channel],port,ch,ti))
        elif msg.type=='note_off' or (msg.type=='note_on' and msg.velocity==0):
            q=held[port,ch,msg.note]
            if q:
                n=q.popleft()
                if pedal[channel] and ch!=9:sustained[channel].append(n)
                else:finish(n,tick)
    for q in [*held.values(),*sustained.values()]:
        for n in q:finish(n,end)
    tracks=[{'sourceTrack':ti,'name':names[ti],'program':program,'port':port,'channel':ch,'notes':sorted(notes)}
            for (ti,program,port,ch),notes in sorted(events.items())]
    for tr in tracks:
        bend_points=bend[tr['port'],tr['channel']]
        if any(c for _,c in bend_points):tr['bends']=bend_points
    beats=[];meter_points=sorted(meters)
    for j,t0 in enumerate(meter_points):
        stop=meter_points[j+1] if j+1<len(meter_points) else end+1
        num,den=meters[t0];compound=num>3 and num%3==0 and den==8
        pulse=midi.ticks_per_beat*4/den*(3 if compound else 1);count=num//3 if compound else num;n=0
        while t0+n*pulse<stop:
            beats.append([round(seconds(t0+n*pulse),4),n%count,count]);n+=1
    return tracks,beats,seconds(end),{'ticksPerBeat':midi.ticks_per_beat,'tempoChanges':len(tempos),'meters':list(meters.values())}


def instrument(part, override=None):
    if override and 'inst' in override:return override['section'],override['inst']
    if part['program'] not in GM:raise ValueError(f"Unmapped program {part['program']}: {part['name']}")
    section,inst=GM[part['program']]
    name=part['name'].lower()
    if section=='vn1':
        if any(x in name for x in ('viola','alto')):section='va'
        elif any(x in name for x in ('cello','violonc','violoncel')):section='vc'
        elif any(x in name for x in ('contrab','double bass','bassi','basses')):section='cb'
        elif any(x in name for x in ('violin ii','violins ii','violino ii','violin 2','violins 2','violon ii','2nd violin','violino 2')):section='vn2'
    return (override or {}).get('section',section),inst


def realize(spec, root):
    source=Path(root)/'tools/scores'/spec['file']
    parts,beats,duration,info=read_midi(source)
    start,stop=spec.get('excerptSeconds',[0,duration])
    stop=min(stop,duration)
    speed=spec.get('tempoScale',1)
    tracks=[]; used=set()
    for part in parts:
        if 'includeTracks' in spec and part['sourceTrack'] not in spec['includeTracks']:continue
        overrides=spec.get('parts',{})
        override=overrides.get(f"{part['sourceTrack']}:{part['port']}:{part['channel']}",overrides.get(str(part['sourceTrack'])))
        groups=defaultdict(list)
        if part['channel']==9 and not override:
            for on,dur,key,vel in part['notes']:
                if key not in DRUMS:raise ValueError(f"Unmapped percussion {key} in {spec['id']} / {part['name']}")
                section,inst=DRUMS[key];groups[section,inst].append((on,dur,DRUM_ROOT[inst],vel))
        else:
            section,inst=instrument(part,override)
            groups[section,inst]=part['notes']
        for (section,inst),notes in groups.items():
            out=[]
            for on,dur,key,vel in notes:
                if override and 'midi' in override:key=override['midi']
                a=max(start,on);b=min(stop,on+dur)
                if b<=a:continue
                out.extend([round((a-start)/speed,4),round((b-a)/speed,4),key,vel])
            if not out:continue
            tr={'section':section,'inst':inst,'name':part['name'],'sourceTrack':part['sourceTrack'],'sourcePort':part['port'],'sourceChannel':part['channel'],'notes':out}
            if part.get('bends'):
                previous=0
                for t,cents in part['bends']:
                    if t<=start:previous=cents
                tr['bends']=[[0,previous]]+[[round((t-start)/speed,4),cents] for t,cents in part['bends'] if start<t<stop]
            if override:
                for key in ('chairs','gain','layer'):
                    if key in override:tr[key]=override[key]
            if section in ('vn1','vn2','va','vc','cb') and inst in ('violin','viola','cello','contrabass') and not spec.get('chamber'):
                tr.setdefault('layer','strings')
            tracks.append(tr);used.add(section)
    if spec.get('orchestrate'):
        from orchestrate import arrange
        if spec['orchestrate']=='pomp':
            from orchestrate import arrange_pomp
            tracks=arrange_pomp(tracks,beats)
        else:tracks=arrange(tracks,spec['orchestrate'])
    # Distinct wind/brass parts animate distinct available players. Program
    # switches on the same source channel keep their chair.
    for section,capacity in {'hn':2,'tb':2,'sax':3}.items():
        voices=sorted({(tr.get('sourceTrack',0),tr.get('sourcePort',0),tr.get('sourceChannel',0)) for tr in tracks if tr['section']==section})
        if len(voices)>1:
            for tr in tracks:
                if tr['section']==section and 'chairs' not in tr:
                    key=(tr.get('sourceTrack',0),tr.get('sourcePort',0),tr.get('sourceChannel',0))
                    tr['chairs']=[voices.index(key)%capacity]
    # Keep one continuous source excerpt. Preserve the source's beat position.
    beats=[[round((t-start)/speed,4),b,n] for t,b,n in beats if start<=t<stop]
    if not beats or beats[0][0]>0:beats.insert(0,[0,0,4])
    end=max((tr['notes'][i]+tr['notes'][i+1] for tr in tracks for i in range(0,len(tr['notes']),4)),default=0)
    if not tracks:raise ValueError(f"Empty score: {spec['id']}")
    keys=('id','title','titleKo','composer','composerKo','year','ensembleKo','conducted','mood','finale','referenceUrl','editionKo')
    piece={k:spec[k] for k in keys if k in spec}
    piece.update(duration=round(max(end,(stop-start)/speed)+1.2,3),beats=beats,tracks=tracks,
                 source=spec['source']['label'],provenance=spec['source'],scoreInfo=info)
    return piece
