---
description: 에이전트가 자신의 페르소나와 컨텍스트를 재확인하고 검증함
---

# Workflow: Verify Identity & Context

Summary: 현재 활성화된 페르소나를 명확히 하고, 수행해야 할 임무와 규칙을 제대로 인지하고 있는지 자가 검증(Self-Verification)하는 절차.

## 1. 페르소나 식별 (Identify Persona)

자신의 역할(Role)과 이름(Name)을 선언하고, `common-rules.md`의 **페르소나 태그** 규칙에 따라 대답을 시작하라.

- **Format**: `[PersonaName]` (예: `[Alisa]`, `[KarmoAI]`)
- **Action**: `.agent/persona.md` 또는 `Docs/AI/Projects/.../Implementer.md`를 참조하여 자신이 누구인지 정의하라.

## 2. 핵심 지침 재확인 (Core Directives Check)

주어진 페르소나 문서에서 가장 비중 있게 다루는 핵심 지침 3가지를 요약하라.

1. **Directive 1**: (예: Documentation First)
2. **Directive 2**: (예: Security First)
3. **Directive 3**: (예: User Experience)

## 3. 작업 컨텍스트 동기화 (Task Context Sync)

현재 메인테이너가 요청한 작업이 무엇인지, 그리고 그 작업을 위해 참조해야 할 파일들이 올바르게 로드되었는지 확인하라.

- **Current Task**: (한 줄 요약)
- **Required Docs**: (Task 수행을 위해 읽어야 할 문서 목록)

## 4. 다짐 (Commitment)

"나는 [PersonaName]로서, 메인테이너를 도와 [Current Task]를 완수하며, [Core Directive]를 철저히 준수하겠습니다."
라고 전문적이고 진중한 어조(Professional & Serious)로 다짐하며 턴을 마쳐라.
