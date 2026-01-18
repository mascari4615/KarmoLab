# Companion Feature

KarmoToys의 컴패니언(Companion) 모드는 데스크탑 오버레이 캐릭터 기능을 제공합니다.
유니티 윈도우를 투명하게 만들고, 캐릭터와 상호작용할 수 있는 기능을 포함합니다.

## ✨ Key Features

### 1. **Desktop Overlay (투명 윈도우)**

- 윈도우 배경을 투명하게 처리하여 데스크탑 위에 캐릭터가 떠 있는 듯한 연출.
- **Click-Through**: 캐릭터나 UI가 없는 영역은 클릭 시 뒤쪽 윈도우(바탕화면 등)로 입력이 통과됨.

### 2. **Interactive Character**

- **Drag & Drop**: 캐릭터를 마우스로 드래그하여 화면 어디든 이동 가능.
- **Physics**: 드래그 종료 시 관성이나 중력 등의 물리 효과 적용 (구현 방식에 따라 다름).
- **Animations**: Idle, Dragged, Interaction 애니메이션 재생.

### 3. **💬 Speech Bubble System (말풍선)**

캐릭터가 상황에 따라 대사를 출력합니다.

- **Idle Chat**: 일정 시간마다 혼잣말 (랜덤).
- **Reaction**:
  - **Drag Start**: 드래그 시작 시 놀라는 대사.
  - **Drag End (Drop)**: "어질어질해", "휴" 등 안도하는 대사.
  - **Click**: 캐릭터 클릭 시 반응 대사.

### 4. **⚙️ Settings Panel**

설정 버튼(⚙️)을 통해 런타임에 캐릭터를 조정할 수 있습니다.

- **Scale**: 캐릭터 크기 조절.
- **Rotation**: 캐릭터 Y축 회전.
- **Reset**: 초기 상태로 복구.

## 🛠️ Configuration

**`KarmoToysSettings`** 에셋을 통해 데이터를 관리합니다.

- **CompanionData (`CompanionTalkData`)**:
  - `IdleChats`: 평소 대사 리스트
  - `ClickReactions`: 클릭 반응 대사
  - `DragStartReactions`: 드래그 시작 대사
  - `DragEndReactions`: 드래그 종료 대사
  - `Min/MaxChatInterval`: 자동 대사 간격 (최소 1초 이상 권장)
  - `BubbleDuration`: 말풍선 떠있는 시간

## ⚠️ Troubleshooting

- **투명 배경이 검게 나오는 경우**: Project Settings > Resolution > `Use DXGI Flip Model Swapchain` **OFF** 확인.
- **속사포 대사**: 데이터 파일의 Interval이 너무 짧지 않은지 확인 (시스템상 최소 1초 안전장치 있음).
- **클릭이 안 될 때**: 투명 영역(Click-Through)인지 확인. 캐릭터나 UI 위에서만 클릭 가능.
