---
description: 새로운 피처의 표준 문서 구조(Spec, History, Todo)를 자동으로 생성함
---

1. 마스터로부터 `[프로젝트명]`과 `[피처명]`을 확인받음.
2. `Docs/Projects/[프로젝트명]/Features/[피처명]` 디렉터리를 생성함.
3. 다음 3개 파일을 생성함 (내용은 `Project_Doc_Convention.md`의 표준 템플릿 준수):
    - `Spec.md`: 기능 명세 초안 작성.
    - `History.md`: 초기 생성 기록 작성.
    - `Todo.md`: 기본적인 체크리스트 구성.
4. 프로젝트 루트의 `README.md` 또는 `History.md`에 해당 피처 폴더를 링크함.
5. 작업 완료를 보고하고 마스터에게 `Spec.md` 검토를 요청함.
