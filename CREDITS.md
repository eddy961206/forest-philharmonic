# Credits & licenses

Compositions, score editions, MIDI sequences and instrument samples have
separate rights. Licenses below apply to the identified assets; this project
does not claim that every composition is public domain in every territory.
The code MIT license does not relicense third-party music data.

## Instrument samples (`public/samples/`)

- **FluidR3_GM** soundfont by Frank Wen, rendered to per-note MP3 by
  [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) —
  [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
  Used for violin, viola, cello, contrabass, string ensemble, flute, oboe,
  clarinet, bassoon, horn, trumpet, timpani and harp, plus piccolo, English horn,
  trombone, tuba, saxophones, celesta, mallets, organ, harpsichord,
  pizzicato and tremolo strings.
- **Salamander Grand Piano V3** by Alexander Holm, via
  [Tonejs/audio](https://github.com/Tonejs/audio) —
  [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).

## Score data (`public/music/`)

- **music21 core corpus** ([cuthbertLab/music21](https://github.com/cuthbertLab/music21)),
  BSD-3-Clause — Bach (BWV 846, BWV 248 chorales), Mozart (K. 80, K. 458),
  Haydn (Op. 74 No. 1), Beethoven (Op. 59 No. 2), Corelli (Op. 3 No. 1),
  Handel (*Lascia ch'io pianga*), Schubert (*Der Lindenbaum*),
  Liliʻuokalani (*Aloha ʻOe*).
- **DCML annotated corpora** by the Digital and Cognitive Musicology Lab, EPFL —
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/):
  [debussy_suite_bergamasque](https://github.com/DCMLab/debussy_suite_bergamasque),
  [schumann_kinderszenen](https://github.com/DCMLab/schumann_kinderszenen),
  [tchaikovsky_seasons](https://github.com/DCMLab/tchaikovsky_seasons),
  [beethoven_piano_sonatas](https://github.com/DCMLab/beethoven_piano_sonatas),
  [grieg_lyric_pieces](https://github.com/DCMLab/grieg_lyric_pieces).
  The performance files derived from them are shared under the same
  CC BY-NC-SA 4.0 terms — non-commercial use only.

- **Humdrum \*\*kern editions** by Craig Stuart Sapp —
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/):
  [chopin-preludes](https://github.com/craigsapp/chopin-preludes),
  [chopin-mazurkas](https://github.com/craigsapp/chopin-mazurkas),
  [mozart-piano-sonatas](https://github.com/craigsapp/mozart-piano-sonatas),
  [beethoven-piano-sonatas](https://github.com/craigsapp/beethoven-piano-sonatas),
  [joplin](https://github.com/craigsapp/joplin),
  [scarlatti-keyboard-sonatas](https://github.com/craigsapp/scarlatti-keyboard-sonatas).
  Performance files derived from them carry the same non-commercial terms.
- *Ode to Joy*, *Für Elise* (A section) and *Greensleeves* were written out
  by hand for this project from the public-domain originals.
- *Amazing Grace* (the tune New Britain, *Southern Harmony*, 1835) and the
  trio of Elgar's *Pomp and Circumstance* March No. 1 (1901) are public-domain
  melodies. Amazing Grace remains written out and orchestrated for this project.
  The earlier short Elgar trio has now been replaced by a full-march arrangement
  derived from the CC0 piano/choral edition credited below.
  The Elgar melody was checked against the melody line published by
  [flutetunes.com](https://www.flutetunes.com/tunes.php?id=63); the
  harmony, voicing and orchestration are our own.
- Choir, voice and tubular-bell samples are also from FluidR3_GM (CC BY 3.0).


### Added repertoire and full Elgar march

The complete per-piece attribution, original URLs, license declarations,
SHA-256 hashes and arrangement notes are in [`tools/repertoire.json`](tools/repertoire.json)
and the readable [source ledger](docs/repertoire-sources.md).

- Mutopia 941, 900, 459, 483: Public Domain declarations.
- Mutopia 301, *Spring*: maintainer smailliw, CC BY-SA 3.0.
- Mutopia 1590, *Nocturne Op. 9 No. 2*: Renato Biolcati Rinaldi, CC BY-SA 3.0.
- Mutopia 2047, *Canon per 3 Violini e Basso*: Michael Fischer v. Mollard, CC BY 4.0.
  The source MIDI and derived performance files retain these licenses. Changes:
  native instrument routing, orchestration where labeled, score timing conversion,
  and sample-based performance. License links appear in the catalog.
- [PDMX](https://github.com/pnlong/PDMX), [dataset release](https://zenodo.org/records/15571083):
  each selected score's contributor and CC0/PD declaration are recorded individually.
  Source declarations do not grant rights the contributor did not possess.
- **Sabre Dance** sequence from [Classical MIDI](https://www.classicalmidi.co.uk/khachaturian.htm),
  sequencer unknown: **NOASSERTION — redistribution permission is not established**.
  This is an open source-clearance item, not a CC0 or MIT asset.

### Direct FluidR3 percussion extraction

`bassDrum`, `snare`, `tom`, `cymbals`, `triangle`, and `tambourine` are mono
MP3 conversions of the acoustic percussion samples in FluidR3_GM, obtained
from Debian's `fluid-soundfont-gm_3.1-6_all.deb`. The SoundFont's MIT notice
is reproduced in [`tools/licenses/FluidR3-MIT.txt`](tools/licenses/FluidR3-MIT.txt).
The conversion script records and verifies its checksum. Debian packaging
is not included in the delivered audio assets.

## Libraries

- [three.js](https://threejs.org) r186 — MIT (`public/vendor/three/LICENSE`)

## Fonts

- Gowun Batang and IBM Plex Sans KR, loaded from Google Fonts — SIL Open Font License 1.1.

## The Sphere venue

The Las Vegas Sphere interior is modelled from public descriptions of the
building (Sphere Entertainment Co. press material and coverage): the
~15,000 m² 16K interior screen about 73 m tall wrapping the audience, the
17,600-seat bowl in four steep levels (100–400) with the 200 level
overhanging the 100 level, the end stage, the HOLOPLOT beam-forming sound
system behind the acoustically transparent screen, and the moving lights on
the balcony rails. Nothing is copied from the building's own media: the
geometry is built from those proportions and everything on the dome is
generated procedurally in a shader. "Sphere" is a trademark of its owner;
this is an unofficial, non-commercial fan rendition.

### Outdoor repertoire — eight new complete works

See the [outdoor source ledger](docs/outdoor-repertoire-sources.md) and
`tools/repertoire.json` for individual hashes, contributors and arrangement notes.

- Mutopia 242, Bach *Air*: jeff covey, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
  `tools/scores/bach-air.mid` and the derived `public/music/bach-air.json` retain
  this license. Changes: native string-section routing and timing conversion.
- Mutopia 37, Satie *Gymnopédie No. 1*: Evin Robertson, Public Domain.
- Mutopia 2167, Gounod *Ave Maria*: Yann Leprince, Public Domain.
- Mutopia 1037, Brahms *Wiegenlied*: 森 章吾, Public Domain; melody routed to clarinet.
- PDMX / MuseScore 5936751, Dvořák *Humoresque*: AllmusicLab, CC0-1.0.
- PDMX / MuseScore 5605158, Elgar *Salut d'amour*: hyakusen, CC0-1.0.
- PDMX / MuseScore 106251, Mozart *Symphony No. 40 — I*: Nicolas, CC0-1.0.
- PDMX / MuseScore 5192413, Schubert *Ständchen*: Matthew Lane, CC0-1.0.
  These four PDMX editions belong to the no-license-conflict subset; their
  embedded MusicXML was inspected for conflicting rights declarations.
  See the earlier PDMX acknowledgment for the dataset and publication credits.
