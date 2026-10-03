/**
 * 유저 차단 설정 기본값. 콘텐츠 스크립트 (block-core.js) 와 옵션 페이지가 함께 읽음
 * 저장 위치: chrome.storage.local 의 karmoSettings[사이트]. 저장된 값이 이 기본값을 덮음
 */
globalThis.KARMO_BLOCK_DEFAULTS = {
  linkStyle: "tint", // 다작 유저 구분: tint 줄 바탕까지, pill 알약과 띠만, off 끔
  panel: true, // 화면 왼쪽 여러 글 쓴 유저 목록
  hoverHl: true, // 줄에 올리면 같은 유저 줄 강조
  blockSort: "name", // 하단 차단 표 기본 정렬: name, id
  exBest: true, // 차단 유저라도 개념글은 표시
  minRec: 10, // 차단 유저라도 추천이 이 값 이상이면 표시, 0 이면 끔
  resolveAccounts: true, // 목록 줄의 계정 유저는 글을 열어 번호를 확인 (끄면 계정 유저는 목록에서 처리 안 함)
  keywords: [], // 제목에 들어 있으면 숨기는 단어. 대소문자 무시, re: 로 시작하면 정규식
  reasonTags: ["광고", "싸움", "취향 아님", "도배", "기타"], // 차단 직후 토스트의 사유 칩
  likeColor: "#ff5c8c", // 좋아요 유저 줄 색
  palette: ["#d9480f", "#1c7ed6", "#2f9e44", "#7048e8", "#0c8599", "#e67700", "#a61e4d", "#364fc7"], // 유저 자동 색
  colors: {}, // 유저별 지정 색 { 키: "#rrggbb" }
};
