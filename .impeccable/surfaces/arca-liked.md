# 좋아요 글 모아보기

Primary target: apps/karmo-dev-extension/arca-liked.html
Related targets: apps/karmo-dev-extension/arca-liked.css, apps/karmo-dev-extension/arca-liked.js
Mode: Operate / Read

## Direction contract

THESIS: 좋아요 작성자의 채널 구분 없는 최근 글 목록. 채널 설정 없이 기존 좋아요 바로 활용.

OWN-WORLD: 확장 설정의 system-ui와 단순한 버튼 계승. 아카라이브의 목록 읽기 방식. 중성 표면, 좋아요 분홍 강조, 시스템 테마 대응.

STORY: 좋아요 유저 확인, 최신 글 불러오기, 제목 검색이나 작성자 선택, 원문 새 탭 열기. 로딩과 유저별 실패 분리.

FIRST VIEWPORT: 제목과 새로고침 상단, 검색과 작성자 필터 그 아래, 유저/글 수와 갱신 시각, 제목 중심의 긴 목록. 모바일에서는 작성자와 채널이 제목 아래 배치.

FORM: 사용자 지정 작성자 통합 목록. 좁은 기능 확장, seed 대상 아님. 별도 이미지 시안 없이 기존 확장 인터페이스 계승.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
