# Development Basics (개발 기초 지식)

Summary: KarmoLab 개발 환경에서 필수적으로 알아야 할 OS 및 Git 기본 개념.

## 1. 심볼릭 링크 (Symbolic Link / Symlink)

- **정의**: 파일이나 폴더를 가리키는 시스템 수준의 "지름길".
- **용도**: `Single Source of Truth`를 유지하기 위해 원본 문서를 여러 경로에 참조시킬 때 사용함.
- **PowerShell 활용 예시**:

  ```powershell
  New-Item -ItemType SymbolicLink -Path ".agent\global-instructions.md" -Target "Docs\Standards\global-instructions.md"
  ```

## 2. .gitkeep

- **정의**: 비어 있는 폴더를 Git에서 추적하기 위해 관습적으로 사용하는 빈 파일.
- **용도**: 프로젝트의 폴더 구조를 미리 정의해두고 싶을 때 사용함.

## 3. 체크썸 (Checksum) / 해시 (Hash)

- **정의**: 데이터의 무결성을 검사하기 위한 고유한 "지문".
- **용도**: KarmoHub 등에서 파일 다운로드 시 데이터 손상 여부를 확인하기 위해 활용함.

## 4. PowerShell 스크립트 (.ps1)

- **정의**: Windows 환경에서 자동화 작업을 수행하기 위한 스크립트 파일.
- **실행 권한 설정**:

  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

## 5. 설정 관리 (Configuration Management)

- **핵심**: 보안을 위해 민감 정보는 코드와 분리함.
- **상세 분석**: [.env vs 환경변수 기술 분석](config-management-deepdive.md) 문서를 참조.
