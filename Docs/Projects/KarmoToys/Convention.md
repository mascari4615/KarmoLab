# KarmoLab Naming Convention Guide

KarmoLab 프로젝트 일관성 유지를 위한 공식 네이밍 지침

---

## 1. 브랜드 & 창작자 정보
고정 명칭 사용.
- **Brand Name**: `KarmoDDrine` (카모뜨린)
- **Primary ID**: `Mascari4615`
- **소문자가 필요한 경우**: `karmoddrine`, `mascari4615`

## 2. 패키지 & 리포지토리 (Technical IDs)
컴퓨터 인식 식별자는 **소문자 + kebab-case** 사용.
- **Package ID**: `com.mascari4615.karmo-editor`
- **Git Branch**: `upm/karmo-editor` (패키지 배포용)
- **Folder (LocalPackages)**: `com.mascari4615.karmo-editor`

## 3. 코드 & 아키텍처 (C#)
C# 표준 관례에 따라 **PascalCase**를 사용합니다.
- **Namespace**: `KarmoLab.KarmoEditor`
  - 하위 모듈이 있을 경우: `KarmoLab.KarmoEditor.Build`, `KarmoLab.KarmoEditor.Toolbar`
- **Menu Path**: `KarmoLab/` (유니티 상단 메뉴 바)
- **Class/Method/Property**: `PascalCase`
- **Private Fields**: `_camelCase` (언더바 접두사)

## 4. 파일 & 폴더 (Assets)
- **Documentation**: `Doc/KarmoEditor` (주제/카테고리명은 PascalCase 권장)
- **Unity Assets**: `PascalCase` (예: `Settings/ToolbarSceneConfig.asset`)
- **JSON/Configs**: `camelCase` 또는 `kebab-case` (용도에 따라 선택)

---

## 💡 요약: "인간은 Pascal, 기계는 kebab"
- **사람이 읽는 곳**(메뉴, 가이드 폴더, 클래스 이름): `KarmoEditor`
- **시스템이 읽는 곳**(패키지 ID, 브랜치 주소, 폴더 ID): `karmo-editor`
