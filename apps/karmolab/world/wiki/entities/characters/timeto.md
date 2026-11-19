## 한 줄

WM 세계에서 연구소를 꾸리는 성인 연구소장. 조수님에게 자기가 만든 물건을 자랑하는 KarmoLab 마스코트.

## 개요

- 별명/이미지 프리셋: **연구소장 티메토**
- 분위기: 밝고 적극적, 어질러진 개인 연구실. 중구난방으로 보여도 본인은 모든 물건의 위치를 안다.
- 호칭/말투: 호칭 조수님, 1인칭 저, 존댓말. 실험, 측정 용어 자연스럽게 사용.

## 외형 키워드 (이미지용)

- woman in her twenties, youthful university-student air, adult face, natural 7.5-head proportions, long legs, slender waist, large bust
- slightly small relative scale only; no short, petite, compact-build, compressed-head or compressed-torso wording
- messy dark plum-brown hair, loose side bun, stray curls, purple eyes
- one visible snaggletooth, small gear-shaped hairpin, proud grin
- huge slightly stained white lab coat, cream ribbed turtleneck, brown high-waisted pants, crescent necklace
- compact handmade glass and white-ceramic tools, purple and cyan light, cluttered village atelier laboratory
- 스팀펑크는 주제가 아님. 황동은 작은 포인트만 쓰고 노출 톱니, 구리 배관, 보일러, 압력계, 빅토리아 기계실은 피함
- 정본 그림: Karmo Launcher `apps/karmo-launcher/ui/img/mascot-karmolab.webp`

## 무대 (stages)

- 세계: **WM**. 배경과 마법 표현은 장면에 필요할 때만 사용.
- 현재 화면 출연: **KarmoLab**. WM 게임의 실제 등장과 자산 연결은 별도 작업.

## WM 본편 설정

- 도시에서 넘어와 연구할 곳을 찾아 정착. 연구소와 욘의 집은 같은 지역에 있으나 서로 이웃이라 할 만큼 가깝지는 않음. 출신 도시의 이름과 지도 위치, 정착의 구체적 계기는 미정.
- 기계 장치로 마법을 강화하는 데 관심이 많음. 기하학적 형태의 생명체나 드론을 데리고 다니며 건설하고 연구함. 실험과 작업 중 실수가 잦음.
- 티메토의 실수로 폭주한 마도구와 생활 마법이 걸린 도구들이 연구소 주변 숲에 나타남. 이 사건이 욘과 티메토의 첫 접점. 티메토도 이 일을 해결하는 데 힘을 보탬.
- 게임 안에서 건설과 연구를 담당하는 인물. 초반 사건과 장소는 [WM 공간 설정](../../wm/design/world/spaces.md#티메토-연구소와-주변-숲).

## 감정 / 포즈 / 대사 프리셋

`apps/karmolab/src/mdd.ts` 의 `LINE_PRESETS` 가 정본:

| 상황 | 포즈 | 대사 (요지) |
|------|------|-------------|
| 첫 방문 (`first_visit`) | pointing | "어서 오세요, 조수님! KarmoLab에 오신 걸 환영해요." |
| 데일리/허브 (`daily_start` / `home_hub`) | happy | "오늘의 실험 준비됐어요" / "연구소 허브예요. 즐겨찾기 모아 두었어요." |
| 도구 실행 (`tool_run`) | think | "측정 개시... 잠깐만요!" |
| 성공 (`success`) | cheer | "샘플 확보! 연구 노트에 기록했어요." |
| 측정 완료 (`measure_done`) | cheer | "측정 완료! 수치는 연구 노트에 반영했어요." |
| 실패 (`error`) | sad | "장비가 잠깐 삐끗했어요... 다시 한 번만요!" |
| 데이터 경고 (`warn_data`) | angry | "잠깐! 이건 중요한 데이터예요." |
| 방치 (`idle_sleep`) | sleep | "zzZ... 조수님...?" |
| 반응 (`idle_wake`) | shock | "앗! 돌아오셨군요!" |
| 업적 (`achievement`) | love | "조수님 덕분에 연구소가 안정되고 있어요...!" |
| 짤, 드립 (`meme_done`) | smug | "후후, 이건 명작이 될지도요?" |

## 관계

- WM 세계의 인물. yon / alisa / ling 과 같은 생활권의 마을 주민.
- mascari4615 (작가) ↔ 티메토: KarmoLab 마스코트: 작가의 도구 사용 톤을 의인화.

## 본문 cite

- `appearance.md`. 외형 한 줄 (image-cache 와 같이 두는 캐릭터 시트)
- `card.md`. chatbot 시스템 프롬프트 stub (karmolab-bot 등 별 시스템 용. KarmoLab chatbot 시스템 프롬프트는 본 yaml 의 `chatbot_*` 필드)
