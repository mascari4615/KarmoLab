// 분신 한 마리. 같은 화면 안에서 혼자 걷고 앉고 뛰고 떨어지는 몸
//
// 말과 기억 없음. 본체(face.html 의 몸)만 말함. 분신은 움직임과 닿음 반응만 보유
// 중력, 창 윗면 서기, 걷기, 앉기, 춤, 뛰기, 던지기 규칙은 본체와 같은 값 사용
// (본체 쪽 구현은 face.html 에 있음. 둘을 한 곳으로 합치는 것이 다음 정리 대상)

import { jumpTargets, jumpVelocity, landingSurface, supportAt } from '/surfaces.js';

export const GRAVITY_PX = 2600; // px/s². 본체와 같은 값
export const FEET_BIAS = 0.039; // 경계 상자 바닥이 보이는 발 끝보다 키의 이만큼 아래

const rand = (min, max) => min + Math.random() * (max - min);

/**
 * @param options.el 분신의 뿌리 요소 (position: fixed, 가운데 x 와 위쪽 y 를 style 로 받음)
 * @param options.body 3D 몸 API (setMood, setFacing, screenBox)
 * @param options.env 화면 환경: surfaces(), floorY(), width(), report()
 * @param options.x 처음 가운데 x
 * @param options.y 처음 위쪽 y
 */
export class Pet {
  constructor({ el, body, env, x, y, mode = '' }) {
    // 시험용 행동 고정. 값 still 은 정지, 값 walk 는 계속 걷기, 빈 값은 평소 동작
    this.mode = mode;
    this.el = el;
    this.body = body;
    this.env = env;
    this.x = x;
    this.y = y;
    this.stand = { id: 'floor', y: null };
    this.fall = { active: false, thrown: false, vx: 0, vy: 0, feet: 0, sliding: false, last: 0, reportedAt: 0, blockedUntil: 0 };
    this.roam = { active: false, dir: 0, target: 0, speed: 0, last: 0, nextAt: Date.now() + rand(1500, 5000), reportedAt: 0 };
    this.act = { kind: null, until: 0 };
    this.settleUntil = 0;
    this.grabbed = null;
    this.timers = [];
    this.place();
    this.listen();
  }

  start() {
    this.timers.push(setInterval(() => this.checkGravity(), 150));
    this.timers.push(setInterval(() => this.checkActivity(), 1000));
    this.timers.push(setInterval(() => { if (this.act.kind !== null && Date.now() >= this.act.until) this.endActivity(); }, 500));
  }

  destroy() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    this.fall.active = false;
    this.roam.active = false;
    this.el.remove();
  }

  /** 위치를 화면 안으로 붙잡아 요소에 쓴다 */
  place() {
    const width = this.env.width();
    this.x = Math.min(width - 40, Math.max(40, this.x));
    this.y = Math.min(this.env.height() - 120, Math.max(0, this.y));
    this.el.style.left = `${this.x}px`;
    this.el.style.top = `${this.y}px`;
    // 화면 오른쪽 끝에서 상태 칩이 잘리지 않게 좌우를 바꾸는 본체 규칙과는 무관 (분신은 칩이 없음)
  }

  feet() {
    const box = this.body?.screenBox?.();
    return box ? box.y + box.height * (1 - FEET_BIAS) : null;
  }

  /** 누를 자리. 몸이 실제 차지하는 네모 */
  hitBox() {
    const box = this.body?.screenBox?.();
    return box ? [box.x, box.y, box.width, box.height] : null;
  }

  // ── 받침과 중력 ─────────────────────────────────────────────

  supportNow(feet) {
    return supportAt(this.env.surfaces(), this.env.floorY(), this.x, feet);
  }

  surfaceById(id) {
    return this.env.surfaces().find((c) => c.id === id && this.x >= c.l - 30 && this.x <= c.r + 30);
  }

  checkGravity() {
    const fall = this.fall;
    if (fall.active || this.act.kind === 'sit' || this.grabbed?.moved === true || Date.now() < fall.blockedUntil) return;
    const feet = this.feet();
    if (feet === null) return;

    // 서 있던 창이 움직이면 같이 이동
    if (this.stand.id !== 'floor') {
      const still = this.surfaceById(this.stand.id);
      if (still !== undefined) {
        const dy = still.y - this.stand.y;
        if (Math.abs(dy) > 2) {
          this.y += dy;
          this.stand.y = still.y;
          this.place();
          this.env.report();
        }
        return;
      }
      this.stand.id = 'floor';
      this.stand.y = null;
    }

    const support = this.supportNow(feet);
    const gap = support.y - feet;
    if (gap > 16) {
      this.startFall(0, 0);
    } else if (gap > -40) {
      if (this.stand.id !== support.id) this.settleUntil = Date.now() + 2500;
      this.stand.id = support.id;
      this.stand.y = support.y;
      // 안착 직후 한가한 자세에서만 남은 간격 보정
      if (Date.now() < this.settleUntil && this.act.kind === null && !this.roam.active && Math.abs(gap) > 2) {
        this.y += gap * 0.5;
        this.place();
        this.env.report();
      }
    }
  }

  startFall(vx = 0, vy = 0, thrown = false) {
    this.stopRoam();
    this.stand.id = 'floor';
    this.stand.y = null;
    const fall = this.fall;
    fall.active = true;
    fall.thrown = thrown;
    fall.sliding = false;
    fall.vx = vx;
    fall.vy = vy;
    fall.feet = this.feet() ?? this.env.floorY();
    fall.last = performance.now();
    this.body?.setFacing(Math.abs(vx) > 150 ? Math.sign(vx) : 0);
    this.body?.setMood('falling');
    requestAnimationFrame((now) => this.fallStep(now));
  }

  land(surface, speedX, speedY) {
    const fall = this.fall;
    fall.active = false;
    this.stand.id = surface.id;
    this.stand.y = surface.y;
    this.settleUntil = Date.now() + 2500;
    if (fall.thrown && Math.abs(speedX) > 250 && speedY > 500) {
      fall.active = true;
      fall.sliding = true;
      this.body?.setFacing(Math.sign(speedX));
      this.body?.setMood('rolling');
      return;
    }
    this.body?.setFacing(0);
    this.body?.setMood('landing');
    this.env.report();
  }

  fallStep(now) {
    const fall = this.fall;
    if (!fall.active) return;
    const dt = Math.min(0.05, (now - fall.last) / 1000);
    fall.last = now;

    if (fall.sliding) {
      fall.vx *= Math.exp(-4 * dt);
      this.x += fall.vx * dt;
      this.place();
      if (this.stand.id !== 'floor' && this.surfaceById(this.stand.id) === undefined) {
        fall.sliding = false;
        fall.vy = 0;
        fall.feet = this.feet() ?? fall.feet;
        this.stand.id = 'floor';
        this.stand.y = null;
        this.body?.setMood('falling');
      } else if (Math.abs(fall.vx) < 25) {
        fall.active = false;
        fall.sliding = false;
        this.body?.setFacing(0);
        this.env.report();
        return;
      }
    } else {
      const beforeY = this.y;
      const beforeFeet = fall.feet;
      fall.vy += GRAVITY_PX * dt;
      this.y += fall.vy * dt;
      this.x += fall.vx * dt;
      if (this.y <= 0 && fall.vy < 0) fall.vy = 0;
      this.place();
      const width = this.env.width();
      if ((this.x <= 41 && fall.vx < 0) || (this.x >= width - 41 && fall.vx > 0)) fall.vx *= -0.5;
      const moved = this.y - beforeY;
      fall.feet += moved;
      let hit = null;
      if (fall.vy > 0) hit = landingSurface(this.env.surfaces(), this.env.floorY(), this.x, beforeFeet, fall.feet);
      const stuck = fall.vy > 0 && Math.abs(moved) < 0.01;
      if (hit !== null) {
        this.y += hit.y - fall.feet;
        this.place();
        this.land(hit, fall.vx, fall.vy);
        if (!fall.active) return;
      } else if (stuck) {
        fall.active = false;
        fall.blockedUntil = Date.now() + 3000;
        this.body?.setMood('landing');
        this.env.report();
        return;
      }
    }
    if (now - fall.reportedAt > 100) {
      fall.reportedAt = now;
      this.env.report();
    }
    requestAnimationFrame((t) => this.fallStep(t));
  }

  // ── 걷기와 한가할 때 행동 ───────────────────────────────────

  startRoam() {
    const box = this.body?.screenBox?.();
    if (!box) return;
    const width = this.env.width();
    let minX = 100;
    let maxX = width - 100;
    let on;
    if (this.stand.id !== 'floor') {
      on = this.surfaceById(this.stand.id);
      if (on === undefined) return;
      minX = on.l + 40;
      maxX = on.r - 40;
      if (maxX - minX < 80) return;
    }
    let target = minX + Math.random() * Math.max(1, maxX - minX);
    const minDistance = Math.min(250, (maxX - minX) / 2);
    if (Math.abs(target - this.x) < minDistance) target = this.x < (minX + maxX) / 2 ? maxX : minX;
    if (on !== undefined && Math.random() < 0.15) target = target > this.x ? on.r + 90 : on.l - 90;
    const jog = Math.random() < 0.3;
    const roam = this.roam;
    roam.dir = Math.sign(target - this.x) || 1;
    roam.target = target;
    roam.speed = jog ? (1.1 * box.height) / 0.93 : (0.8 * box.height) / 1.33;
    roam.active = true;
    roam.last = performance.now();
    this.body.setFacing(roam.dir);
    this.body.setMood(jog ? 'jogging' : 'walking');
    requestAnimationFrame((now) => this.roamStep(now));
  }

  roamStep(now) {
    const roam = this.roam;
    if (!roam.active) return;
    const dt = Math.min(0.05, (now - roam.last) / 1000);
    roam.last = now;
    this.x += roam.dir * roam.speed * dt;
    const arrived = roam.dir > 0 ? this.x >= roam.target : this.x <= roam.target;
    if (arrived) this.x = roam.target;
    this.place();
    if (now - roam.reportedAt > 100) {
      roam.reportedAt = now;
      this.env.report();
    }
    if (arrived) this.stopRoam();
    else requestAnimationFrame((t) => this.roamStep(t));
  }

  stopRoam() {
    const roam = this.roam;
    if (!roam.active) return;
    roam.active = false;
    this.body?.setFacing(0);
    this.body?.setMood('idle');
    roam.nextAt = Date.now() + rand(6000, 18000);
    this.env.report();
  }

  startSit() {
    this.act.kind = 'sit';
    this.act.until = Date.now() + rand(15000, 40000);
    this.body.setFacing(0);
    this.body.setMood('sitEnter');
  }

  startDance() {
    this.act.kind = 'dance';
    this.act.until = Date.now() + rand(4000, 7000);
    this.body.setFacing(0);
    this.body.setMood('dancing');
  }

  endActivity() {
    if (this.act.kind === null) return;
    const wasSit = this.act.kind === 'sit';
    this.act.kind = null;
    this.body?.setMood(wasSit ? 'sitExit' : 'idle');
    if (wasSit) this.fall.blockedUntil = Date.now() + 1500;
    this.roam.nextAt = Date.now() + rand(6000, 18000);
  }

  startJump() {
    const feet = this.feet();
    if (feet === null) return false;
    const options = jumpTargets(this.env.surfaces(), this.x, feet, this.stand.id);
    if (options.length === 0) return false;
    const pick = options[Math.floor(Math.random() * options.length)];
    const jump = jumpVelocity(pick.rise, pick.landX - this.x, GRAVITY_PX);
    this.startFall(jump.vx, jump.vy, false);
    return true;
  }

  checkActivity() {
    if (this.roam.active || this.act.kind !== null || this.fall.active || this.grabbed !== null) return;
    if (this.mode === 'still') return;
    if (this.mode === 'walk') {
      this.startRoam();
      return;
    }
    if (Date.now() < this.roam.nextAt || document.hidden) return;
    if (Math.random() < 0.4 && this.startJump()) return;
    const r = Math.random();
    if (r < 0.5) this.startRoam();
    else if (r < 0.8) this.startSit();
    else this.startDance();
  }

  /** 사람이 건드렸다. 하던 일을 멈춘다 */
  interrupt() {
    this.stopRoam();
    this.endActivity();
  }

  // ── 닿음: 눌러 움찔, 잡아 끌기, 던지기 ──────────────────────

  listen() {
    const stage = this.el.querySelector('.stage') ?? this.el;
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.interrupt();
      this.grabbed = { x: e.clientX, y: e.clientY, moved: false, from: { x: this.x, y: this.y }, samples: [] };
      try { stage.setPointerCapture(e.pointerId); } catch { /* 캡처 못 해도 끌기는 됨 */ }
    });
    stage.addEventListener('pointermove', (e) => {
      const grab = this.grabbed;
      if (grab === null) return;
      if (!grab.moved) {
        if (Math.abs(e.clientX - grab.x) + Math.abs(e.clientY - grab.y) < 4) return;
        grab.moved = true;
        this.stand.id = 'floor';
        this.stand.y = null;
      }
      this.x = grab.from.x + (e.clientX - grab.x);
      this.y = grab.from.y + (e.clientY - grab.y);
      this.place();
      const stamp = performance.now();
      grab.samples.push([stamp, e.clientX, e.clientY]);
      while (grab.samples.length > 2 && stamp - grab.samples[0][0] > 120) grab.samples.shift();
      this.env.report();
    });
    const release = () => {
      const grab = this.grabbed;
      if (grab === null) return;
      this.grabbed = null;
      if (!grab.moved) {
        if (this.act.kind === null && !this.roam.active && !this.fall.active) this.body?.setMood('poked');
        return;
      }
      const samples = grab.samples;
      if (samples.length >= 2) {
        const first = samples[0];
        const last = samples[samples.length - 1];
        const span = Math.max(0.03, (last[0] - first[0]) / 1000);
        const clamp = (v) => Math.max(-2500, Math.min(2500, v));
        const vx = clamp((last[1] - first[1]) / span);
        const vy = clamp((last[2] - first[2]) / span);
        if (Math.hypot(vx, vy) > 350 && performance.now() - last[0] < 80) this.startFall(vx, vy, true);
      }
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
  }
}
