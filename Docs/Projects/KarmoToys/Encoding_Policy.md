# Encoding Policy: Prevent Corruption

AI 도구로 소스 코드를 수정할 때 한글이나 이모지 같은 유니코드 문자가 깨지는 현상을 방지하기 위한 가이드라인임.

## 원인 (Cause)

1. **인코딩 불일치**: 많은 AI 도구와 리눅스 기반 환경은 **Plain UTF-8 (BOM 없음)**을 기본으로 함.
2. **Windows/Unity 호환성**: C# 컴파일러와 윈도우용 VS Code/Visual Studio는 **UTF-8 with BOM (Byte Order Mark)**을 표준으로 사용함.
3. **손상 과정**: BOM이 없는 파일을 AI가 수정하면서 강제로 다른 인코딩(ANSI 등)으로 해석하거나 저장할 경우, 멀티바이트 문자의 바이트 순서가 꼬여 `?`나 이상한 기호로 변함.

## 해결 및 방지 대책 (Prevention)

### 1. UTF-8 with BOM 고수

- 모든 `.cs`, `.uxml`, `.uss`, `.json`, `.md` 파일은 반드시 **UTF-8 with BOM** 인코딩으로 저장해야 함.
- VS Code 하단 상태 표시줄에서 인코딩이 `UTF-8 with BOM`인지 항상 확인.

### 2. AI 수정 시 주의사항

- 한글 주석이나 이모지가 포함된 블록을 수정할 때는 해당 문자가 포함된 행 전체를 정확히 매칭시켜야 함.
- 수정 후에는 반드시 `view_file`이나 에디터를 통해 비영어권 문자가 살아있는지 검증.

### 3. 깨진 문자 발견 시 조치

- `?` 등으로 변한 문자는 즉시 원본 문자(⚙️, 👤, ◑ 등)로 직접 수정.
- 파일 전체 인코딩을 `Reopen with Encoding -> UTF-8 with BOM` 후 다시 저장(`Save with Encoding`).

> [!IMPORTANT]
> 특히 **이모지**는 4바이트 이상의 유니코드를 사용하므로 인코딩에 매우 민감함. 항상 세심한 주의가 필요함! 🐾🌱
