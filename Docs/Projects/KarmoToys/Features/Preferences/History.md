# 환경 설정 히스토리 (Preferences Feature History)

Summary: KarmoToys 환경 설정 기능의 UI 리팩토링 및 데이터 관리 개선 업데이트 기록.

## 2026-01-18 (KST)

- **UI Refactor & Style Standardization**:
  - `PreferencesView.uxml`의 인라인 스타일을 모두 클래스로 전환.
  - `PreferencesStyle.uss`를 신규 생성하여 설정 탭만의 고유 스타일 정의.
  - 전역 아이콘 버튼 표준(`btn-icon-item`)을 적용하여 디자인 일관성 확보.

- **Data Management Improvements**:
  - **Individual Backup Deletion**: 백업 리스트의 각 항목에 삭제(🗑️) 버튼 추가.
  - **Confirmation System**: 실수로 인한 데이터 유실을 방지하기 위해 삭제 전 확인 팝업 오버레이를 띄우도록 로직 구현.
  - **Visual Diff Layout**: 비교 결과(Diff Result)를 리스트 상단으로 배치하여 사용자 편의성 증대.
  - **List Backgrounds**: 백업 아이콘과 텍스트가 배경과 잘 구분되도록 아이템별 배경색 및 호버 효과 적용.
