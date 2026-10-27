#!/usr/bin/env python3
"""Extract acoustic orchestral percussion from the MIT-licensed FluidR3_GM.

No synthesizer dependency: the SoundFont contains the original PCM strikes.
Python 3 + ffmpeg. Download is cached; only six short mono MP3s ship to users.
"""
import array
import hashlib
import io
import struct
import subprocess
import tarfile
import urllib.request
import wave
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'tools/.cache'
URL='https://deb.debian.org/debian/pool/main/f/fluid-soundfont/fluid-soundfont-gm_3.1-6_all.deb'
SAMPLES={'bassDrum':(36,'Orch Bass Drum(L)','Orch Bass Drum(R)'),
         'tom':(43,'Tom Floor(L)','Tom Floor(R)'),
         'snare':(38,'Orch Snare(L)','Orch Snare(R)'),
         'cymbals':(49,'Orchcrash(L)','Orchcrash(R)'),
         'triangle':(81,'Triangle',None),
         'tambourine':(54,'Tambourine(L)','Tambourine(R)')}

def soundfont():
    CACHE.mkdir(exist_ok=True)
    archive=CACHE/'fluid-soundfont.deb'
    if not archive.exists():urllib.request.urlretrieve(URL,archive)
    data=archive.read_bytes();pos=8
    while pos+60<len(data):
        name=data[pos:pos+16].decode().strip().rstrip('/');size=int(data[pos+48:pos+58]);start=pos+60
        if name=='data.tar.xz':
            with tarfile.open(fileobj=io.BytesIO(data[start:start+size]),mode='r:xz') as t:
                return t.extractfile('./usr/share/sounds/sf2/FluidR3_GM.sf2').read()
        pos=start+size+(size%2)
    raise ValueError('FluidR3_GM not found')

def main():
    data=soundfont();chunks={}
    expected='74594e8f4250680adf590507a306655a299935343583256f3b722c48a1bc1cb0'
    if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('FluidR3 checksum mismatch')
    def scan(a,b):
        while a+8<=b:
            name=data[a:a+4].decode('ascii');size=struct.unpack_from('<I',data,a+4)[0]
            if name=='LIST':scan(a+12,a+8+size)
            else:chunks[name]=memoryview(data)[a+8:a+8+size]
            a+=8+size+(size%2)
    scan(12,len(data))
    headers={x[0].decode('ascii').strip('\0'):x for x in struct.iter_unpack('<20sIIIIIBbHH',chunks['shdr'])}
    pcm=chunks['smpl']
    for inst,(midi,left,right) in SAMPLES.items():
        h=headers[left];a=array.array('h');a.frombytes(pcm[h[1]*2:h[2]*2])
        if right:
            r=headers[right];b=array.array('h');b.frombytes(pcm[r[1]*2:r[2]*2]);a=array.array('h',(round((x+y)/2) for x,y in zip(a,b)))
        wav=CACHE/f'{inst}.wav'
        with wave.open(str(wav),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(h[5]);w.writeframes(a.tobytes())
        out=ROOT/'public/samples'/inst;out.mkdir(exist_ok=True)
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-codec:a','libmp3lame','-q:a','2',str(out/f'{midi}.mp3')],check=True)
        print(inst,round(len(a)/h[5],2),'seconds')
    print('FluidR3_GM.sf2 sha256:',hashlib.sha256(data).hexdigest())
if __name__=='__main__':main()
