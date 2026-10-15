/**
 * 카툰 셰이더. 그림처럼 보이게.
 *
 * 사실적인 음영은 조명 하나만 어긋나도 인형처럼 보인다. 만화식은 빛을 몇 단계로만
 * 끊어 칠하므로 값이 조금 틀려도 그림처럼 버틴다. 원래 그림(색, 무늬)은 그대로 쓰고
 * 빛을 어떻게 칠할지만 바꾼다.
 *
 * 두 겹이다: 몸에 칠하는 단계 음영 + 뒤집어 씌우는 바깥선.
 */
import * as THREE from 'three';

/** 빛을 몇 단계로 끊을지 정하는 띠. 가늘고 길수록 부드럽다. */
function stepRamp(steps, floor = 0.42) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i += 1) {
    // 어두운 쪽을 완전히 죽이지 않는다. 그림자에서도 얼굴이 보여야 한다.
    const v = Math.round(255 * (floor + ((1 - floor) * i) / (steps - 1)));
    data.set([v, v, v, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/**
 * 윤곽 껍데기용 매끈한 법선. 같은 위치 꼭짓점의 법선 평균
 *
 * 원인: 로우폴리 모델은 면마다 법선이 갈라져 있음. 그대로 부풀리면 껍데기 조각이 모서리에서
 * 벌어지거나 몸을 뚫어 윤곽이 끊기고 점선으로 비침(실측 2026-10-15, 얼굴 모서리)
 * 해결: 위치별 평균 법선으로 부풀려 껍데기를 이음
 */
function smoothNormals(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (position === undefined || normal === undefined) return geometry;
  const sums = new Map();
  const key = (i) => `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
  for (let i = 0; i < position.count; i += 1) {
    const k = key(i);
    const sum = sums.get(k) ?? [0, 0, 0];
    sum[0] += normal.getX(i);
    sum[1] += normal.getY(i);
    sum[2] += normal.getZ(i);
    sums.set(k, sum);
  }
  const smooth = geometry.clone();
  const out = smooth.attributes.normal;
  for (let i = 0; i < position.count; i += 1) {
    const [x, y, z] = sums.get(key(i));
    const length = Math.hypot(x, y, z) || 1;
    out.setXYZ(i, x / length, y / length, z / length);
  }
  out.needsUpdate = true;
  return smooth;
}

/**
 * 모델 전체를 만화식으로 다시 칠한다.
 *
 * @param root 모델
 * @param options.steps 음영 단계 수 (적을수록 만화 같다)
 * @param options.outline 바깥선 두께. **화면 높이 대비 비율**. 0 이면 선 없음
 * @param options.outlineColor 바깥선 색
 * @param options.keyline 바깥선 밖 밝은 테두리 두께(화면 높이 대비 비율). 0 이면 없음. 어두운 바탕에서 윤곽 보강
 * @param options.keylineColor 밝은 테두리 색
 * @param options.shadowFloor 가장 어두운 음영 단계의 밝기(0~1). 높일수록 그림자가 옅어져 전체가 밝아짐
 */
export function applyToon(root, options = {}) {
  const steps = options.steps ?? 3;
  const outline = options.outline ?? 0.006;
  // 새까만 선은 그림에서 튄다. 몸 색을 아주 어둡게 깐 먹색이 그림처럼 앉는다.
  const outlineColor = new THREE.Color(options.outlineColor ?? 0x2b1f33);
  const keyline = options.keyline ?? 0;
  const keylineColor = new THREE.Color(options.keylineColor ?? 0xffffff);
  const gradient = stepRamp(steps, options.shadowFloor ?? 0.42);

  const outlines = [];

  root.traverse((node) => {
    if (node.isMesh !== true && node.isSkinnedMesh !== true) return;

    const originals = Array.isArray(node.material) ? node.material : [node.material];
    const toons = originals.map((material) => {
      const toon = new THREE.MeshToonMaterial({
        // 원래 그림을 그대로 물려받는다. 다시 칠하는 건 빛뿐이다.
        map: material?.map ?? null,
        color: material?.color?.clone?.() ?? new THREE.Color(0xffffff),
        gradientMap: gradient,
        transparent: material?.transparent ?? false,
        alphaTest: material?.alphaTest ?? 0,
        // 원래 재질의 앞뒤 다 그리기를 그대로 물려받는다. 앞면만 그리게 바꾸면
        // 손으로 만든 낮은 폴리곤 모델에서 뒤집힌 면이 통째로 사라져 구멍이 뚫리고,
        // 그 구멍으로 뒤에 깔린 바깥선이 비쳐 치마에 시커먼 삼각형이 생긴다(실측).
        side: material?.side ?? THREE.FrontSide,
      });
      if (toon.map) toon.map.colorSpace = THREE.SRGBColorSpace;
      return toon;
    });
    node.material = Array.isArray(node.material) ? toons : toons[0];

    if (outline <= 0) return;

    // 바깥선 = 같은 모양을 조금 부풀려 뒤집어 씌운 껍데기. 안쪽 면만 그리면
    // 몸 뒤로 삐져나온 가장자리만 보여서 선처럼 남는다.
    //
    // 부풀리는 양은 **화면 기준**이다. 모델 기준으로 밀면 그 모델이 몇 단위짜리로
    // 만들어졌는지에 따라 선이 실오라기가 되거나 몸을 통째로 삼킨다. 이 모델에서는
    // 후자였고, 자세가 바뀌자 시커먼 조각이 치마 밖으로 삐져나왔다(실측). 화면 기준으로
    // 밀면 모델 크기, 카메라 거리와 무관하게 늘 같은 굵기로 보인다.
    // 두 겹(검정, 흰색)이 같은 매끈한 법선 기하를 나눠 씀
    const smoothed = smoothNormals(node.geometry);
    const makeShell = (thicknessValue, colorValue, behind) => {
    const shell = node.clone();
    shell.geometry = smoothed;
    shell.material = new THREE.ShaderMaterial({
      uniforms: { thickness: { value: thicknessValue }, lineColor: { value: colorValue } },
      vertexShader: `
        uniform float thickness;
        #include <common>
        #include <skinning_pars_vertex>
        void main() {
          #include <beginnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 seen = modelViewMatrix * vec4(transformed, 1.0);
          vec3 seenNormal = normalize(normalMatrix * objectNormal);
          gl_Position = projectionMatrix * seen;
          // 가로가 세로보다 넓으면 x 쪽이 더 늘어난다. 그만큼 줄여야 굵기가 고르다.
          float wide = projectionMatrix[1][1] / projectionMatrix[0][0];
          gl_Position.xy += vec2(seenNormal.x / wide, seenNormal.y) * thickness * gl_Position.w;
        }
      `,
      fragmentShader: `
        uniform vec3 lineColor;
        void main() { gl_FragColor = vec4(lineColor, 1.0); }
      `,
      side: THREE.BackSide,
      // 깊이를 뒤로 밀어 껍데기가 몸 면을 이기지 못하게 한다. 모서리에서 점선처럼 비치던 것 방지
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    });
    // 밝은 테두리는 더 바깥이라 먼저 그리고 깊이를 안 씀. 어두운 선이 그 위에 덮임
    if (behind) {
      shell.material.depthWrite = false;
      shell.renderOrder = -1;
    }
    // 껍데기는 원래 몸과 같은 뼈를 따라야 한다. 안 그러면 몸만 움직이고 선은 제자리다.
    if (node.isSkinnedMesh === true && shell.isSkinnedMesh === true) {
      shell.bind(node.skeleton, node.bindMatrix);
    }
    outlines.push({ shell, parent: node.parent });
    };
    makeShell(outline, outlineColor, false);
    if (keyline > 0) makeShell(outline + keyline, keylineColor, true);
  });

  for (const { shell, parent } of outlines) parent?.add(shell);

  return { outlineCount: outlines.length };
}
