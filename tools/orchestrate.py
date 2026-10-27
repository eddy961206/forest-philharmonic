"""Documented, score-derived orchestration of keyboard/chamber editions.

Each output note comes from an input part. No melody is invented or looped.
The catalog labels these performances as arrangements, not original full scores.
"""
from collections import defaultdict

def arrange(tracks, style):
    buckets={}
    def put(source,on,dur,midi,vel,section,inst,gain=1):
        key=(source['sourceTrack'],section,inst,gain)
        if key not in buckets:
            buckets[key]={**{k:v for k,v in source.items() if k!='notes'},'section':section,'inst':inst,'gain':gain,'notes':[]}
            buckets[key].pop('layer',None)
            if inst in ('violin','viola','cello','contrabass'):buckets[key]['layer']='strings'
        buckets[key]['notes'].extend([on,dur,midi,vel])
    for tr in tracks:
        ti=tr['sourceTrack']
        for i in range(0,len(tr['notes']),4):
            on,dur,midi,vel=tr['notes'][i:i+4]
            if style=='valkyries':
                if ti==0:
                    sec,inst=('vn1','violin') if dur<.24 or midi>=81 else ('hn','horn')
                    put(tr,on,dur,midi,vel,sec,inst,.85)
                    if sec=='hn' and on>35:put(tr,on,dur,midi,vel,'tp','trumpet',.38)
                else:
                    sec,inst=('cb','contrabass') if midi<48 else ('vc','cello') if midi<61 else ('vn2','violin')
                    put(tr,on,dur,midi,vel,sec,inst,.8)
                    if dur>.35 and midi<58:put(tr,on,dur,midi,vel,'tb','trombone',.4)
            elif style=='flowers':
                # The four-hand reduction retains the harp's opening cadenza.
                if 8<on<42:
                    put(tr,on,dur,midi,vel,'harp','harp',.8)
                elif ti==0:
                    put(tr,on,dur,midi,vel,'fl' if midi>=81 else 'vn1','flute' if midi>=81 else 'violin',.85)
                elif ti==1:
                    put(tr,on,dur,midi,vel,'hn' if dur>.5 and midi<76 else 'va','horn' if dur>.5 and midi<76 else 'viola',.72)
                elif ti==2:
                    put(tr,on,dur,midi,vel,'vn2','violin',.68)
                else:
                    put(tr,on,dur,midi,vel,'cb' if midi<48 else 'vc','contrabass' if midi<48 else 'cello',.8)
            elif style=='toreador':
                if ti==0:
                    put(tr,on,dur,midi,vel,'tp','trumpet',.8)
                    put(tr,on,dur,midi,vel,'fl','flute',.45)
                else:
                    sec,inst=('cb','contrabass') if midi<48 else ('vc','cello') if midi<60 else ('va','viola')
                    put(tr,on,dur,midi,vel,sec,inst,.8)
            else:raise ValueError('Unknown orchestration '+style)
    return list(buckets.values())


def arrange_pomp(tracks, beats):
    """Full March No. 1 from the CC0 piano/choral reduction, not loop padding.

    Preserve every source note and tempo; identify the upper voice at each
    piano onset and distribute accompaniment by register. Brass grows between
    the first march, quiet trio and the Maestoso choral return. Percussion is
    an original accompaniment tied to the source's beats and bass pitches.
    """
    buckets={}
    def put(section,inst,on,dur,midi,vel,gain=1,chairs=None,name=''):
        key=(section,inst,gain,tuple(chairs or []),name)
        if key not in buckets:
            tr={'section':section,'inst':inst,'name':name or section,'notes':[],'gain':gain}
            if chairs is not None:tr['chairs']=chairs
            if inst in ('violin','viola','cello','contrabass'):tr['layer']='strings'
            buckets[key]=tr
        buckets[key]['notes'].extend([on,dur,midi,vel])
    bass=[]
    for tr in tracks:
        ti=tr['sourceTrack'];notes=[tr['notes'][i:i+4] for i in range(0,len(tr['notes']),4)]
        if ti in (0,1):
            for on,dur,midi,vel in notes:put('choir','choir',on,dur,midi,vel,.66,list(range(0,6) if ti==0 else range(6,12)),'Choral finale')
            continue
        chords=defaultdict(list)
        for n in notes:chords[n[0]].append(n)
        for on,chord in chords.items():
            quiet=123.86<=on<245.5;grand=320.108<=on<386.775;trio=quiet or grand
            top=max(n[2] for n in chord);low=min(n[2] for n in chord)
            for _,dur,midi,vel in chord:
                if ti==2:
                    lead=midi==top
                    put('vn1' if lead else 'vn2','violin',on,dur,midi,vel,.8 if lead else .55)
                    if lead and (dur>.18 or trio):
                        put('fl' if quiet else 'tp','flute' if quiet else 'trumpet',on,dur,midi,vel,.35 if quiet else .42 if grand else .3)
                    elif not lead and dur>.4:put('hn','horn',on,dur,midi,vel,.28 if quiet else .42)
                else:
                    if midi==low:
                        bass.append((on,midi))
                        put('cb','contrabass',on,dur,midi,vel,.75)
                        put('vc','cello',on,dur,midi+12 if midi<43 else midi,vel,.52)
                        if not quiet:put('tu','tuba',on,dur,midi,vel,.3)
                    else:
                        put('va','viola',on,dur,midi,vel,.5)
                        if not quiet and dur>.18:put('hn','horn',on,dur,midi,vel,.36)
                        if grand and midi<65:put('tb','trombone',on,dur,midi,vel,.34)
    bass.sort();bi=0
    for i,(t,beat,count) in enumerate(beats):
        if t<.849 or t>400.36:continue
        while bi+1<len(bass) and bass[bi+1][0]<=t+.04:bi+=1
        quiet=123.86<=t<245.5;grand=320.108<=t<386.775
        step=beats[i+1][0]-t if i+1<len(beats) else .5
        if quiet:continue
        put('sd','snare',t,.08,38,61 if beat==0 else 45,.32,name='March snare')
        if not grand:put('sd','snare',t+step*.5,.06,38,32,.26,name='March snare offbeat')
        if beat==0:
            put('bd','bassDrum',t,.2,36,69 if grand else 52,.45,name='March bass drum')
            if grand:
                pitch=bass[bi][1]
                while pitch<40:pitch+=12
                while pitch>57:pitch-=12
                put('timp','timpani',t,min(step*1.7,1.1),pitch,73,.52,name='Maestoso timpani')
    for t in (.849,54.69,245.5,320.108,386.775,400.36):put('cy','cymbals',t,.4,49,78,.46,name='Structural cymbal accents')
    for tr in buckets.values():
        notes=[tr['notes'][i:i+4] for i in range(0,len(tr['notes']),4)]
        tr['notes']=[v for n in sorted(notes) for v in n]
    return list(buckets.values())
