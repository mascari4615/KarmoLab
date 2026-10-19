export interface NotificationField {
  key: string; label: string; type: 'number' | 'choices';
  default: number | string[]; env?: string; min?: number; max?: number;
  options?: { value: string; label: string }[];
}
export interface NotificationDefinition {
  id: string; title: string; description: string; group: string;
  fields?: NotificationField[]; settingsLink?: { label: string; href: string };
}

/** 실제 송신자의 등록 명부. 화면과 API의 공통 정의. */
export const notificationDefinitions: NotificationDefinition[] = [
  { id: 'personal', title: '일정과 애니', description: '오늘 안내, 일정 전 알림과 구독 작품의 새 공개 소식', group: '일상', settingsLink: { label: '플래너에서 일정 설정', href: '#planner' } },
  { id: 'unity-free', title: '무료 에셋', description: 'Unity 무료 에셋과 쿠폰 소식', group: '관심사', fields: [{ key: 'interval', label: '확인 간격 (분)', type: 'number', default: 60, env: 'KARMOLAB_BOT_UNITY_FREE_INTERVAL_MIN', min: 5, max: 1440 }] },
  { id: 'news', title: '관심사 뉴스', description: '선택한 뉴스 출처의 새로운 글', group: '관심사', fields: [
    { key: 'sources', label: '뉴스 출처', type: 'choices', default: ['google', 'hn', 'gn'], env: 'KARMOLAB_BOT_NEWS_SOURCES', options: [{ value: 'google', label: '관심 키워드' }, { value: 'hn', label: 'Hacker News' }, { value: 'gn', label: 'GeekNews' }] },
    { key: 'interval', label: '확인 간격 (분)', type: 'number', default: 180, env: 'KARMOLAB_BOT_NEWS_INTERVAL_MIN', min: 30, max: 1440 },
  ] },
  { id: 'codex-reset', title: 'Codex 초기화 소식', description: '공식 소식 수집과 수집 실패 안내', group: '관심사', fields: [{ key: 'interval', label: '확인 간격 (분)', type: 'number', default: 60, env: 'KARMOLAB_BOT_CODEX_RESET_INTERVAL_MIN', min: 5, max: 60 }] },
  { id: 'github', title: 'GitHub 변경', description: '커밋, PR, 이슈와 릴리스 소식', group: '개발' },
  { id: 'digest', title: '변경 요약', description: '저장소의 변경 내용을 요약한 소식', group: '개발' },
  { id: 'local', title: '기기와 앱', description: '연결된 로컬 앱이 보내는 운영 소식', group: '운영' },
  { id: 'wm-device-log', title: '폰 실행 오류', description: 'WM 폰 실행 중 발생한 오류 안내', group: '운영' },
  { id: 'ops', title: '봇 운영', description: '시작, 종료와 오류 등 운영 소식', group: '운영' },
  { id: 'brain-resurface', title: '기억 다시보기', description: '저장한 기록과 아이디어 다시 꺼내보기', group: '일상' },
  { id: 'weekly-wrapped', title: '주간 결산', description: '결산을 켠 서버의 한 주 활동 요약', group: '일상' },
];
