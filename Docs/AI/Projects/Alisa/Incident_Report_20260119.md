# Incident Report: Documentation Encoding Corruption

Summary: 2026-01-19 발생한 자동화 스크립트에 의한 문서 인코딩 깨짐 현상 분석 및 예방 대책.

## 1. 개요 (Overview)

- **발생 일시**: 2026-01-19 (KST)
- **현상**: `relocate_summary.ps1` 실행 후 Markdown 파일 내 한글 깨짐 및 데이터 손상 발생.
- **영향 범위**: `Docs/AI/Projects/` 및 `Docs/Standards/` 내 다수 파일.

## 2. 원인 분석 (Root Cause Analysis)

### 2.1. PowerShell 인코딩 처리 비일관성

- PowerShell (Windows PowerShell 5.1 기준)의 `Get-Content`는 `-Encoding` 매개변수가 없을 때 시스템 기본값(ANSI/CP949)으로 파일을 읽으려 시도함.
- UTF-8(BOM 없음)로 작성된 한글 문서를 ANSI로 읽는 과정에서 비트 패턴이 깨짐.

### 2.2. 파괴적 복구 시도

- 이미 깨진 채로 메모리에 로드된 문자열을 `Set-Content`로 다시 저장하면서 손상이 영구화됨.
- 후속 조치인 `fix_encoding.ps1`에서도 이미 '?'나 깨진 문자로 바뀐 데이터를 복구하지 못함.

## 3. 재발 방지 대책 (Prevention Plan)

### 3.1. 명시적 인코딩 선언 필수화

- 모든 파일 읽기/쓰기 작업에서 `-Encoding UTF8`을 명시적으로 사용함.
- .NET API 사용 시 `[System.Text.Encoding]::UTF8` (BOM 없음 권장)을 명시함.

### 3.2. 검증 단계 도입 (Validation)

- 자동화 스크립트 실행 전 특정 한글 키워드(예: '비서', '규칙')가 정상적으로 읽히는지 사전 체크 로직 추가.
- 수정 후 파일 크기가 0이 되거나 비정상적으로 줄어드는지 확인.

### 3.3. 백업 필수화

- 파괴적인 파일 수정(Global Replace 등) 작업 전 `git commit` 또는 임시 폴더(`.tmp_backup/`)에 백업 생성.

## 4. 복구 전략 (Recovery Strategy)

- AI 에이전트의 세션 히스토리에 보존된 원본 텍스트를 기반으로 모든 손상된 문서를 재생성함.
- 초기 초안인 점을 감안하여 최신 컨벤션(Summary 위치 등)을 적용하여 복구.

> **기록 주체**: Alisa (PM)
