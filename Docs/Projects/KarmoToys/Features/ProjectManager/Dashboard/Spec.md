# Dashboard Spec (기능 명세)

Summary: 앱 실행 시 가장 먼저 표시되는 홈 화면으로, 주요 상태를 요약 제공함.

## 1. 개요 (Overview)

- **목적**: 사용자가 앱에 진입했을 때 가장 중요한 정보(D-Day, 투데이 등)를 한눈에 파악.
- **위치**: 앱 실행 시 기본 뷰(Default View).

## 2. 주요 기능 (Core Features)

### 2.1. D-Day Tracker

- **Target Date**: 특정 목표 날짜를 설정하고 남은 일수를 카운트다운.
- **Header Sync**: 설정된 D-Day는 앱 상단 헤더(`MainView` TopBar)에도 실시간 연동됨.
- **Persistence**: `DashboardData` 형식을 통해 날짜 정보 저장.

### 2.2. 바로가기 (Shortcuts)

- (예정) 주요 프로젝트나 최근 작업 항목으로 바로 이동하는 링크 제공.

## 3. 데이터 (Data)

- **DashboardData**: `TargetDateString` (D-Day 목표일), `Memo` (간단 메모) 등을 포함.
