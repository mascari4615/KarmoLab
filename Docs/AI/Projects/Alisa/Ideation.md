# KarmoAI x YawnBot Brainstorming (2026-01-19)

Summary: KarmoAI(Gemini)와 YawnBot(Discord)의 시너지를 활용한 혁신적인 기능 아이디어 모음.

## 1. 🛠️ 개발자 생산성 (Dev Productivity)

- **AI Code Review Helper**: 디스코드에 업로드된 `.cs` 파일이나 코드 스니펫을 Gemini가 분석하여 리팩토링 제안 및 버그 탐지 리포트를 임베드 형태로 제공함.
- **Unity Error Doctor**: 유니티 로그 파일(.txt)을 디스코드에 던지면, 오류 원인을 분석하고 해결 방법(StackOverflow 또는 Unity Docs 기반)을 즉시 제안함.
- **Tech News Hunter (확장)**: 넥슨 뿐만 아니라 Steam API, GitHub Trending, Epic Games Store의 무료 게임 소식 등을 주기적으로 '파밍'하여 뉴스레터 발송.

## 2. 📝 지능형 프로젝트 관리 (Smart PM)

- **Auto Meeting Minutes**: 디스코드 채널에서 마스터와 에이전트 간의 대화 흐름을 Gemini가 요약하여 `Docs/AI/Global/MeetingNotes.md`에 자동으로 박제함.
- **Backlog Grooming Assistant**: `/groom` 명령 시, 현재 `Backlog.md`를 분석하여 중복되거나 모호한 태스크를 정리하고 우선순위 순서를 제안함.
- **Smart History Tracker**: 구현 완료 소식을 디스코드에 알리면, Gemini가 관련 커밋과 대화를 분석하여 `History.md`용 요약 문구를 생성해줌.

## 3. 🎭 페르소나 및 유틸리티 (Persona & Utility)

- **Multi-Persona Chat**: `!persona Alisa`, `!persona Yawn` 등으로 봇의 성격을 실시간 전환하여 대화함. (KarmoAI의 시스템 프롬프트 관리 기능 활용)
- **Image-to-Specification**: 기획서 와이어프레임이나 손그림 이미지를 디스코드에 올리면, Gemini 1.5 Pro/Flash의 멀티모달 기능을 이용해 `Spec.md` 초안(Markdown)으로 변환해줌.
- **Commit Message AI**: 작업한 내용을 짧게 말하면 (`!commit 기능 다 만들었어`), Gemini가 이쁘게 정돈된 Git 커밋 메시지 스타일을 추천해줌.

---
> **작성자**: Alisa (PM)
