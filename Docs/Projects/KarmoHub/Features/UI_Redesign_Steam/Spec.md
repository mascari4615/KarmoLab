# UI 리디자인 및 브랜드 아이덴티티 수립 (Steam Style)

Summary: KarmoHub의 UI를 Steam Modern 스타일로 리디자인하고 전사적 브랜드 가이드를 수립함.

## 1. 요구사항 (Requirements)

- **디자인 컨셉**: Obsidian Ember (다크), Monochrome (블랙/화이트), Clean Light (라이트) 세 가지 테마 지원.
- **핵심 요소**: 유리질 효과(Glassmorphism), 부드러운 그라데이션, 일관된 아이콘 시스템.
- **브랜드 컬러**: Obsidian 기반의 화산재 블랙(`Hex: #1A1A1B`)과 엠버 오렌지(`Hex: #FF8C00`) 조합.

## 2. 디자인 명세 (Design Spec)

### Palette - Obsidian Ember

- Background: `#1A1A1B`
- Accent: `#FF8C00`
- Surface: `#2D2D2E`

### Geometry

- Corner Radius: 8px (Standard Components), 12px (Main Windows)
- Border Thickness: 1px

## 3. 구현 방식 (Implementation)

- `Resources/Themes/` 디렉터리에 테마별 ResourceDictionary 작성.
- `ThemeService.cs`에서 런타임 테마 전환 로직 구현.
- ComboBox를 통한 사용자 테마 선택 UI 제공.
