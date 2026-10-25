# 야외 공연장 신규 8곡 출처

기존 82곡과 다른 작품 8곡을 야외 프로그램 앞에 추가했다. 기존 야외 16곡은 이어서 연주한다. MIDI는 음표·쉼표·템포·다이내믹을 가진 악보 데이터이며, 녹음이나 YouTube 오디오를 재생하지 않는다. 모든 곡은 선택한 판본의 처음부터 마지막 마디까지 변환했고, 짧은 주제의 임의 반복이나 시간 채우기를 하지 않았다.

| 곡 / ID | 길이 | 실제 편성·판본 | 출처 / 기여자 | 이용 조건 |
|---|---:|---|---|---|
| 사랑의 인사 / `elgar-salut-damour` | 2:31 | 전곡 · 바이올린과 피아노 판본 | [PDMX / MuseScore 5605158](https://musescore.com/user/6959546/scores/5605158) / hyakusen | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 유모레스크 7번 / `dvorak-humoresque-7` | 2:35 | 전곡 · 바이올린·첼로 2중주 편곡 | [PDMX / MuseScore 5936751](https://musescore.com/user/33963911/scores/5936751) / AllmusicLab | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| G선상의 아리아 / `bach-air` | 2:33 | 전 악장 · 현악 4성부 · 원조 D장조 | [Mutopia 242](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=242) / jeff covey | [CC-BY-SA-3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| 교향곡 40번 1악장 / `mozart-symphony-40` | 7:17 | 전 악장 · 제시부 반복 포함 · ♩220 · 11파트 관현악 판본 | [PDMX / MuseScore 106251](https://musescore.com/user/5/scores/106251) / Nicolas | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 짐노페디 1번 / `satie-gymnopedie-1` | 2:57 | 전곡 · 피아노 독주 · 느리고 온화하게 | [Mutopia 37](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37) / Evin Robertson | [Public Domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| 세레나데 / `schubert-serenade` | 3:38 | 전곡 · 호른과 피아노 편곡 | [PDMX / MuseScore 5192413](https://musescore.com/user/1546286/scores/5192413) / Matthew Lane | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 아베 마리아 · 바흐–구노 / `gounod-ave-maria` | 4:28 | 전곡 · 1856년 Heugel 바이올린·피아노 판본 | [Mutopia 2167](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2167) / Yann Leprince | [Public Domain](https://creativecommons.org/publicdomain/mark/1.0/) |
| 브람스 자장가 / `brahms-lullaby` | 0:55 | 전곡 1절 · 성악 선율을 클라리넷으로 연주 | [Mutopia 1037](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1037) / 森 章吾 | [Public Domain](https://creativecommons.org/publicdomain/mark/1.0/) |

## 판본에 관한 확인

- 사랑의 인사·유모레스크·세레나데·아베 마리아·자장가는 지휘자 없는 2중주로 연주한다. 각 독주 선율은 지정한 단원 1명이 맡는다. 짐노페디도 지휘자 없는 피아노 독주이며, Air와 교향곡 40번은 지휘자가 있는 합주다.

- 모차르트 40번 1악장: MusicXML 총보 299마디, 제시부 반복을 펼친 MIDI는 399마디다. 플루트·오보에·클라리넷·바순·호른 2부·제1/2바이올린·비올라 2부·첼로의 11개 실제 트랙을 보존했다. 비올라의 분할 성부와 두 호른을 서로 다른 악기로 잘못 읽지 않도록 명시 배정했다. 선택한 판본의 마지막 성부는 `VC`로 기재되어 있고 별도의 콘트라베이스/옥타브 중복 지시는 없다. 이 판본 그대로 첼로로 연주하며 원전 총보와 동일한 모든 악기 배치를 보장하지 않는다.
- 해당 모차르트 원본에는 숫자 템포가 없고 MIDI에는 기본값 ♩120이 들어 있다. Molto allegro에 맞춰 이번 연주는 ♩220으로 설정했다. 음표·마디·반복은 제거하지 않았다.
- 유모레스크: 64마디 바이올린·첼로 2중주 판본 전체다. 두 악기의 arco/pizzicato 프로그램 전환과 실제 원본 음표를 보존했다. 원래 피아노 독주나 원전 관현악 총보라고 표시하지 않는다.
- 사랑의 인사: 바이올린·피아노 100마디 전체. 세레나데: 호른·피아노 82마디 전체. PDMX 네 곡 모두 `license_conflict=False`이며 압축 MusicXML 안에도 상충 권리 선언이 없음을 확인했다.
- 바흐 Air: Mutopia 242 총보 MIDI 전체. D장조 현악 4성부이며 후대의 C장조 독주 바이올린 편곡과 구분했다. 소스와 파생 JSON은 CC BY-SA 3.0을 유지한다.
- 짐노페디: Mutopia 37 피아노 악보 전체를 0.8배 속도로 연주한다. 브람스 자장가는 한 절의 악보 전체이며 성악 선율만 첫 번째 클라리넷 단원 1명으로 바꾸었다. 자장가 55초는 곡의 한 절이 짧기 때문이며 도입 모티프를 잘라낸 것이 아니다.
- 구노 아베 마리아: 바흐 전주곡에 구노의 선율이 더해진 1856년 Heugel 바이올린·피아노 판본 전체다. 기존 `bach-prelude-c`와는 다른 작품으로 등록했다.

## 재현

원본 MIDI는 `tools/scores/`, 출처·판본·기여자·SHA-256은 `tools/repertoire.json`, 파생 연주 데이터는 `public/music/`에 있다. 기존 변환기와 `mido==1.3.3`만 사용한다.

```sh
python3 -m pip install -r tools/requirements-music.txt
python3 tools/build_repertoire.py elgar-salut-damour dvorak-humoresque-7 bach-air mozart-symphony-40 satie-gymnopedie-1 schubert-serenade gounod-ave-maria brahms-lullaby
python3 tools/build_repertoire.py --check elgar-salut-damour dvorak-humoresque-7 bach-air mozart-symphony-40 satie-gymnopedie-1 schubert-serenade gounod-ave-maria brahms-lullaby
```

신규 8곡에 대한 결정적 재생성 비교는 통과했다. 이 출처 문서는 실제 오디오 청취·브라우저 프레임 성능·캐릭터 동작의 검증 결과를 대신하지 않는다. 해당 범위는 통합 검증 보고서를 따른다.
