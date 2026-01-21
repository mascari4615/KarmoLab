---
description: 프로젝트 문서들이 마크다운 컨벤션 및 규칙을 준수하는지 점검함

// turbo

1. `powershell -ExecutionPolicy Bypass -File .agent/tools/check-markdown-compliance.ps1` 커맨드를 실행함.
2. 스크립트 출력 결과에서 위반 사항들을 수집함.
3. 발견된 위반 사항을 리스트업하여 마스터에게 보고하고, 즉각적인 수정을 제안 또는 수행함.
