# Companion Time System & Modular Architecture Design

## 1. Why (배경 및 목적)

Companion 기능이 단순한 '말하는 인형'을 넘어, 사용자의 생산성과 생활 패턴을 관리해주는 **핵심 유틸리티**로 발전해야 함. 코드가 비대해지는 것을 방지하기 위해 **모듈형 아키텍처**를 도입하여 유지보수성과 확장성을 확보하는 것이 필수적.

## 2. What (기능 기획)

### 2.1. Alarms & Timer (Smart Time Manager)

> **상세 구현 내용 및 사용법은 [TimeModule.md](Modules/TimeModule.md) 문서를 참조하세요.**

- **기획 의도**: 단순 알람을 넘어 요일별 반복, 커스텀 메시지, 사운드 피드백을 통해 사용자의 생활 리듬 관리.
- **주요 기능**:
  - 알람 (Smart Alarm)
  - 타이머 & 뽀모도로 (구현 예정)
  - 정각 알림 (Chime)

### 2.3. Idle & Sleep Tracker (절전 모드 감지)

- **기능**:
  - **시스템 유휴 감지**: 사용자가 마우스/키보드를 X분 이상 건드리지 않으면 감지 (Win32 `GetLastInputInfo`).
  - **수면 모드 진입**:
    - 일정 시간(예: 5분) 경과 시 'Zzz' 취침 모드 전환.
    - 말풍선 대신 'Zzz' 파티클/텍스트 주기적 노출.
  - **상태 리포트**:
    - 복귀 시 "X시간 동안 자리를 비우셨네요. 푹 쉬셨나요?" 대사 출력.
    - 부재중 알림 요약 ("자리를 비운 사이 알람이 2번 울렸어요").

### 2.4. Additional Ideas (Brainstorming)

- **Hourly Chime (정각 알림)**: 매시 정각마다 "3시입니다" 알려줌.
- **Stretch Reminder**: 유휴 시간 없이 50분 연속 입력 감지 시 "허리 좀 펴세요" 알림.
- **World Clock**: 마우스 오버 시 다른 국가 시간 보여주기.
- **D-Day Counter**: 중요한 날짜(프로젝트 마감일 등) 머리 위에 띄워두기.

---

## 3. How (기술 설계 & 모듈화)

현재 `CompanionFeature.cs`는 기능이 추가될수록 비대해지는 **God Class**가 될 위험이 있음. 이를 **컴포넌트 기반 모듈 시스템**으로 리팩토링.

### 3.1. Architecture Diagram

```mermaid
classDiagram
    class CompanionFeature {
        -List~ICompanionModule~ _modules
        +Initialize()
        +Update()
    }
    
    class ICompanionModule {
        <<interface>>
        +Initialize(CompanionContext context)
        +Update()
        +OnDestroy()
    }

    class CompanionContext {
        +VisualElement RootUI
        +GameObject Avatar
        +CompanionSettings Settings
        +SpeechBubble Bubble
    }

    CompanionFeature --> ICompanionModule
    ICompanionModule <|-- InteractionModule
    ICompanionModule <|-- ChatModule
    ICompanionModule <|-- TimeModule (New)
    ICompanionModule <|-- IdleMonitorModule (New)
```

### 3.2. Module Breakdown

1. **`Core/CompanionFeature`**:
    - 투명 윈도우 초기화, 메인 루프 관리, 모듈 로드/업데이트 담당.
2. **`Modules/InteractionModule`** (기존 로직 이관):
    - 마우스 입력 감지, 드래그 로직, 클릭 이벤트 처리.
3. **`Modules/ChatModule`** (기존 로직 이관):
    - 말풍선 표시, 랜덤 대사 스케줄링.
4. **`Modules/TimeModule`** (신규):
    - 알람/타이머 데이터 관리, 시간 체크, Time-based 이벤트 발생. (ChatModule에 대사 요청)
5. **`Modules/IdleMonitorModule`** (신규):
    - `GetLastInputInfo` P/Invoke 구현.
    - 유휴 상태 관리 및 이벤트(OnIdleStart, OnIdleEnd) 발행.

### 3.3. File Structure

```text
Assets/KarmoToys/Features/Companion/
├── CompanionFeature.cs (Main Entry)
├── CompanionContext.cs (Shared Data)
├── Modules/
│   ├── ICompanionModule.cs
│   ├── InteractionModule.cs
│   ├── ChatModule.cs
│   ├── TimeModule.cs
│   └── IdleMonitorModule.cs
└── UI/ ...
```

## 4. So (기대 효과)

- **확장성**: 새로운 기능(예: 날씨, 주식 등) 추가 시 `NewModule.cs`만 만들고 등록하면 됨.
- **유지보수**: 특정 기능 버그 발생 시(예: 드래그 안됨) `InteractionModule`만 보면 됨.
- **협업**: 여러 개발자가 서로 다른 모듈을 동시에 개발 가능.
