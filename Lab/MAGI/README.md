# 🧙‍♀️ Project M.A.G.I. (Mendokusai AI Generation Interface)

**Witch: Mendokusai~** 프로젝트를 위한 통합 AI 개발 도구, **M.A.G.I.** 입니다.  
이 스튜디오는 게임 개발에 필요한 **캐릭터 대화 시뮬레이션**과 **컨셉 아트 생성**을 지원합니다.

---

## 📂 프로젝트 구조 (Directory Structure)

```
Stuff/MAGI/
├── art.html          # 🎨 Art Studio (이미지 생성 도구)
├── chat.html         # 💬 Chat Studio (캐릭터 대화 도구)
├── README.md         # 📄 프로젝트 문서
├── css/
│   └── style.css     # 💅 공통 스타일 (Tailwind + Custom)
└── js/
    ├── art.js        # 🧠 이미지 생성 로직 (Gemini/Imagen API)
    ├── chat.js       # 🧠 채팅 로직 (Memory Protocol, Token Usage)
    └── prompts.js    # 📚 데이터 (캐릭터 프로필, 프리셋, 프롬프트)
```

---

## 📜 변경 이력 (Refactoring Log)

기존의 단일 파일(`art.html`) 구조에서 유지보수성을 높이기 위해 모듈화 작업을 진행했습니다.

*   **Code Separation:** HTML, CSS, JS 로직을 분리하여 가독성을 개선했습니다.
*   **Data Centralization:** 캐릭터 설정과 프롬프트 데이터를 `js/prompts.js`로 통합 관리합니다.
*   **UI Restoration:** 리팩토링 과정에서 누락되었던 프리셋(Character, BG, Story, Lab) 및 탭 기능을 복구했습니다.
*   **Model Expansion:** Gemini 3.0, 2.5, 2.0 및 Imagen 3/4 등 최신 모델 지원을 추가했습니다.

---

## 🎨 Art Studio (`art.html`)

게임의 컨셉 아트, 캐릭터 시트, 배경 이미지를 생성하는 도구입니다.

### ✨ 주요 기능
*   **다중 모델 지원:**
    *   **Gemini 계열:** Gemini 2.0 Flash, Gemini 2.5 Pro/Flash 등 (NanoBanana)
    *   **Imagen 계열:** Imagen 3.0, Imagen 4.0 (High Quality)
*   **분위기(Vibe) 선택:** Cute, Pure, Spicy, Quirky 등 분위기 추가
*   **편의 기능:** 라이트박스 보기, 다운로드, 토큰 사용량 분석

### 📚 프리셋 및 데이터 (`js/prompts.js`)

모든 프롬프트 데이터는 `js/prompts.js`에서 관리됩니다.

#### 1. 캐릭터 (Characters)
| ID | 이름 | 특징 |
| :--- | :--- | :--- |
| **Witch** | 💤 마녀 욘 | 나른함, 귀차니즘, 주황색 헝클어진 머리, 반쯤 감은 눈, 안경, 나이트캡, 소용돌이 귀마개 |
| **Alisa** | 🧹 메이드 알리사 | 쿨뷰티, 완벽주의, 안경, 포니테일, 메이드복, 존댓말 |
| **Ling** | 🧟‍♀️ 강시 링 | 애교, 활발, 강시, 만두머리, 치파오, 부적 |

#### 2. 배경 (Backgrounds)
*   **Ingame:** HD-2D 스타일 인게임 쿼터뷰 (저택 내부)
*   **Key Visual:** 키 비주얼 일러스트 (도서관, 나선 계단)
*   **Lobby:** 아늑한 거실, 난로, 소파
*   **Lab:** 마법 실험실, 물약, 책

#### 3. 스토리 컷신 (Story Episodes)
*   **Ep1. 아침:** 침대에서 일어나기 귀찮아하는 욘과 깨우는 알리사
*   **Ep2. 충전:** 소파에서 알리사에게 기대어 마력 충전
*   **Ep3. 안경:** 안경을 닦는 알리사를 바라보는 욘
*   **Ep4. 요리:** 주방 폭발 사고와 혼나는 욘
*   **Ep5. 악몽:** 악몽을 꾼 욘을 위로하는 알리사
*   **Ep6. 쿨팩:** 더운 여름, 시원한 강시(링)를 껴안고 있는 욘
*   **Ep7. 부적:** 링의 이마 부적에 감정이 드러나는 에피소드

#### 4. 실험실 (Lab - Experimental)
*   **양 수인:** 뿔이 달린 양 수인 버전 욘
*   **귀마개:** 모자 없이 귀마개만 착용한 버전
*   **방한모:** 겨울 방한모(Ushanka) 착용 버전

---

## 💬 Chat Studio (`chat.html`)

캐릭터 시뮬레이션 및 대화 데이터 수집 도구입니다.

### ✨ 주요 기능
*   **Memory Protocol:** 대화 요약(`{{{summary}}}`)을 통해 장기 기억 유지
*   **Token Tracking:** 실시간 토큰 사용량 및 비용 추적
*   **System Prompt:** `prompts.js`의 캐릭터 성격/말투 데이터를 기반으로 페르소나 주입

---

## 🚀 사용 방법 (How to Use)

1.  **API 키 발급:** [Google AI Studio](https://aistudio.google.com/apikey)에서 API 키를 발급받습니다.
2.  **실행:** `art.html` 또는 `chat.html` 파일을 브라우저(Live Server)에서 엽니다.
3.  **설정:** 우측 상단(또는 좌측 패널)에 API 키를 입력하고 저장합니다.
4.  **Chat:** 캐릭터를 선택하고 대화를 시작하세요.
5.  **Art:** 프리셋을 선택하거나 프롬프트를 입력하여 이미지를 생성하세요.

---

**Developed for Witch: Mendokusai Project**
