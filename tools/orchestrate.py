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

    The Maestoso is the choir's: "Land of Hope and Glory" sung over the
    orchestra, not under it. The inner strings and horns make room for the
    voices; the organ Elgar scored joins with the chords and a 16-foot pedal
    under the bass; horns take up the tune an octave down for its last two
    phrases, where the trumpets also open out; timpani rolls swell into the
    entry, into the top of the tune and into the last chord, each landing on
    a cymbal crash.
    """
    GRAND=(320.108,386.775);LAST=358.4;CODA=(386.775,400.36)
    # the tune's peaks (the top G of the last phrases) and the final chord
    PEAKS=(366.8,383.4)
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
            # (sopranos and altos carry the tune: a little more of them)
            for on,dur,midi,vel in notes:put('choir','choir',on,dur,midi,vel,1.95 if ti==0 else 1.65,list(range(0,6) if ti==0 else range(6,12)),'Choral finale')
            continue
        chords=defaultdict(list)
        for n in notes:chords[n[0]].append(n)
        for on,chord in chords.items():
            quiet=123.86<=on<245.5;grand=GRAND[0]<=on<GRAND[1];trio=quiet or grand
            coda=CODA[0]<=on<=CODA[1];last=grand and on>=LAST
            top=max(n[2] for n in chord);low=min(n[2] for n in chord)
            for _,dur,midi,vel in chord:
                if ti==2:
                    lead=midi==top
                    # (the inner voices step back while the choir sings)
                    put('vn1' if lead else 'vn2','violin',on,dur,midi,vel,.8 if lead else .4 if grand else .55)
                    if lead and (dur>.18 or trio):
                        put('fl' if quiet else 'tp','flute' if quiet else 'trumpet',on,dur,midi,vel,.35 if quiet else .46 if last else .3)
                        if last:put('hn','horn',on,dur,midi-12,vel,.4,name='Horns on the tune')
                    elif not lead and dur>.4:put('hn','horn',on,dur,midi,vel,.28 if quiet else .3 if grand else .42)
                    if (grand or coda) and dur>.18:put('organ','organ',on,dur,midi,vel,.3,name='Organ')
                else:
                    if midi==low:
                        bass.append((on,midi))
                        put('cb','contrabass',on,dur,midi,vel,.75)
                        put('vc','cello',on,dur,midi+12 if midi<43 else midi,vel,.52)
                        if not quiet:put('tu','tuba',on,dur,midi,vel,.3)
                        if grand or coda:
                            pedal=midi-12
                            while pedal<24:pedal+=12
                            put('organ','organ',on,dur,pedal,vel,.42,name='Organ pedal')
                    else:
                        put('va','viola',on,dur,midi,vel,.36 if grand else .5)
                        if not quiet and dur>.18:put('hn','horn',on,dur,midi,vel,.3 if grand else .36)
                        if grand and midi<65:put('tb','trombone',on,dur,midi,vel,.34)
                        if (grand or coda) and dur>.18:put('organ','organ',on,dur,midi,vel,.3,name='Organ')
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
    # rolls swelling into the Maestoso, into each peak of the tune and into
    # the last chord, on the bass of the chord they land on; a crash there
    def at_bass(t):
        pitch=min(bass,key=lambda b:abs(b[0]-t))[1]
        while pitch<40:pitch+=12
        while pitch>57:pitch-=12
        return pitch
    for land,length in ((GRAND[0],2.2),(PEAKS[0],1.7),(PEAKS[1],1.7),(CODA[1],2.4)):
        pitch=at_bass(land+.05);n=int(length/.075)
        for k in range(n):
            u=k/n
            put('timp','timpani',land-length+k*.075,.12,pitch,int(34+66*u*u),.5,name='Timpani rolls')
        put('timp','timpani',land,1.4,pitch,108,.6,name='Timpani rolls')
        if land not in (GRAND[0],CODA[1]):put('cy','cymbals',land,.6,49,96,.5,name='Crashes at the peaks')
        put('bd','bassDrum',land,.5,36,96,.5,name='Crashes at the peaks')
    for tr in buckets.values():
        notes=[tr['notes'][i:i+4] for i in range(0,len(tr['notes']),4)]
        tr['notes']=[v for n in sorted(notes) for v in n]
    return list(buckets.values())
