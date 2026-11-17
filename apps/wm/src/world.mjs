export const WORLD = { title: 'Witch Mendokusai', aspect: 192 / 108 };
// 정규화 좌표. 위치는 손그림을 옮긴 근삿값, 실제 위경도와 거리 미정
export const places = [
  { id: 'yon', name: '욘의 집', type: 'home', x: .103, y: .087, area: '북서쪽 숲', subtitle: '이야기가 시작되는 곳', text: '깊은 숲, 거대한 나무 아래의 반지하 집. 욘과 인형들이 함께 지내는 곳.', source: '사용자 확인: 지도의 좌상단 숲. 세부 위치는 임시 배치.', featured: true },
  { id: 'forest', name: '북서쪽 숲', type: 'forest', x: .19, y: .08, area: '북서부', text: '욘의 집이 자리한 숲. 정식 지명과 숲의 경계는 아직 정해지지 않았다.', source: '손그림의 숲 표기. 방향을 사용한 임시 이름.' },
  { id: 'desert', name: '사막', type: 'desert', x: .205, y: .225, area: '서부', text: '북서쪽 숲 아래로 이어지는 사막 지역. 원본에는 피라미드와 오아시스가 함께 그려져 있다.', source: '손그림의 사막, 피라미드와 오아시스 표기.' },
  { id: 'red-zone', name: '레드존', type: 'anomaly', x: .17, y: .414, area: '서쪽 바다', text: '서쪽 바다에 붉은 원으로 표시된 구역. 경계와 현상의 성격은 미정.', source: '손그림의 레드존 표기.' },
  { id: 'archipelago', name: '열도', type: 'island', x: .055, y: .47, area: '서쪽 바다', text: '서쪽 해안을 따라 길게 흩어진 섬들.', source: '손그림의 열도 표기.' },
  { id: 'east-island', name: '동쪽풍 섬', type: 'island', x: .32, y: .515, area: '내해', text: '내해 서쪽의 큰 섬. 손그림에는 동양이라는 메모와 주변의 작은 섬들이 표시되어 있다.', source: '원본의 괄호 속 동양 표기. 정식 지명 판독 대기.' },
  { id: 'city', name: '도시', type: 'city', x: .455, y: .255, area: '중앙 반도', text: '중앙 반도의 도시. 여러 방향의 해안과 내륙이 만나는 위치.', source: '손그림의 도시 표기. 도시 이름 미정.' },
  { id: 'canyon', name: '협곡', type: 'mountain', x: .45, y: .09, area: '북부', text: '북쪽 산맥과 중앙 반도 사이의 협곡.', source: '손그림의 협곡 표기.' },
  { id: 'deep-sea', name: '해저', type: 'sea', x: .455, y: .548, area: '내해', text: '중앙 반도 남쪽 바닷속 지역. 원본의 해저 표기를 옮겼다.', source: '손그림의 해저 표기.' },
  { id: 'blue-zone', name: '블루존', type: 'anomaly', x: .585, y: .49, area: '동쪽 바다', text: '원본 지도에서 푸른 선으로 나뉜 바다의 구역.', source: '손그림의 블루존 표기. 영역은 미확정.' },
  { id: 'ice-land', name: '북동쪽 설원', type: 'ice', x: .66, y: .32, area: '북동부', text: '빙하 위쪽의 차가운 육지. 원본에는 크리스탈과 얼음 표기가 보인다.', source: '원본 지형을 설명하는 임시 이름. 정식 지명 판독 대기.' },
  { id: 'glacier', name: '빙하', type: 'ice', x: .71, y: .66, area: '동쪽 바다', text: '북동쪽 육지 아래의 길쭉한 얼음 지대와 작은 섬들.', source: '손그림의 빙하 표기.' },
  { id: 'grassland', name: '초원', type: 'grass', x: .305, y: .79, area: '남서부', text: '남쪽 산맥 북쪽 해안에 펼쳐진 초원. 원본에 도시와 건축물도 함께 표시되어 있다.', source: '손그림의 초원 표기.' },
  { id: 'jungle', name: '밀림', type: 'forest', x: .42, y: .845, area: '남부', text: '내해 남쪽 해안의 밀림 지역.', source: '손그림의 밀림 표기.' },
  { id: 'mist', name: '안개', type: 'mist', x: .55, y: .85, area: '남부', text: '산맥 북쪽, 원형으로 둘러싸인 안개 지대.', source: '손그림의 안개 표기.' },
  { id: 'taiga', name: '타이가', type: 'forest', x: .74, y: .84, area: '남동부', text: '남쪽 산맥과 동쪽 육지가 이어지는 타이가 지역.', source: '손그림의 타이가 표기.' },
  { id: 'volcano', name: '화산', type: 'volcano', x: .085, y: .86, area: '남서부', text: '남서쪽의 붉게 표시된 화산 지대. 원본에 용암과 화산이 함께 그려져 있다.', source: '손그림의 화산과 용암 표기.' },
  { id: 'eastern-sea', name: '동쪽 큰바다', type: 'sea', x: .855, y: .45, area: '동부', text: '북동쪽 육지 바깥으로 펼쳐진 넓은 바다.', source: '사용자 확인: 오른쪽 넓은 구역은 바다. 정식 지명 판독 대기.' },
];

export const typeNames = { home: '거처', forest: '숲', desert: '사막', anomaly: '특수 구역', island: '섬', city: '도시', mountain: '산악', sea: '바다', ice: '빙설', grass: '육지', mist: '안개', volcano: '화산' };

export function spherePoint(x, y, radius = 1) {
  const phi = x * Math.PI * 2;
  const theta = y * Math.PI;
  return [-radius * Math.cos(phi) * Math.sin(theta), radius * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta)];
}
export function sphereUV([x, y, z]) {
  const radius = Math.hypot(x, y, z);
  return [((Math.atan2(z, -x) / (Math.PI * 2)) + 1) % 1, Math.acos(Math.max(-1, Math.min(1, y / radius))) / Math.PI];
}
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
