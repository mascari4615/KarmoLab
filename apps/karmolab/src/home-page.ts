/**
 * 첫 화면 본문. **첫 화면에서만** 싣는다 (TASK-KL-128 ①-c 3차)
 *
 * 왜 따로 나왔나: 이 203줄은 도구 화면 129장에서 **한 번도 안 불린다**(`init()` 이
 * `staticBody` 면 건너뛴다). 그런데 셸에 박혀 있어서 코드는 매번 같이 왔다.
 * 게다가 여기 적힌 `landing-...` 이름들 때문에 **도구 화면 전용 스타일도 못 깎았다** . 
 * 이 화면에 나올 수 있는 이름을 셀 때 이 코드가 같이 세였기 때문이다.
 *
 * 바깥에서 부르는 것: `window.KarmoHomePage.build()` → 첫 화면 한 장(DOM)을 돌려준다.
 * `index.html` 만 이 파일을 부른다. 정적 페이지 생성기(`shell-page.mjs`)가 그 줄을 뺀다.
 *
 * 셸에서 쓰는 것은 `Toolbox.switchPage` / `Toolbox.mountHomeDecor` 둘뿐이다(전역).
 * 여기 새 코드를 넣을 때 셸 내부를 더 부르지 마라. 부르는 순간 도로 셸에 묶인다.
 */
// @ts-nocheck 셸에서 그대로 옮겨 온 코드 (TASK-KL-128 ①-c)
import { t } from './lib/i18n.js';
import { toolIndexPath } from './lib/site-base';
(function () {
    const switchPage = (id, opts) => Toolbox.switchPage(id, opts);
    const mountHomeDecor = () => Toolbox.mountHomeDecor();
    /* 셸 안의 도구 목록은 여기서 안 보인다. 창구로 받는다.
       분리할 때 이 한 줄을 놓쳐 첫 화면이 tools is not defined로 죽었다(관문 검사가 잡음). */
    const tools = () => Toolbox.getTools();
    const toolCountsOnce = () => Toolbox.toolCountsOnce();
    const whenApiBase = (ms) => Toolbox.whenApiBase(ms);

    function buildLanding() {
        const landing = document.createElement('div');
        landing.className = 'landing-page';
        landing.id = 'page-home';
        /* 장식은 **첫 화면 것이 아니라 이 앱의 것**이다 (TASK-KL-101).
           첫 화면 안에 넣어 두면 도구로 가는 순간 통째로 사라진다. 도구를 여닫을 때마다
           세계가 바뀌는 셈이다. 껍데기(body) 에 한 장 붙여 두면 어느 화면에서나 그대로
           떠 있고, 화면 사이를 오가도 도형이 이어진다. 위치는 어차피 화면 기준이다. */
        mountHomeDecor();

        /* 이름을 두 번 쓰지 않는다 (사용자 요청. 두 줄 넘어간 것들을 한 줄로).
         * 예전엔 작은 KarmoLab 위에 큰 KarmoLab이 또 있었다. 같은 말이 두 줄이었다. */
        landing.classList.add('landing-q2');

        /* Q2 로비 (karmo-design 판정 2026-09-21 "2는 OK"). 요소는 넷뿐: 구석 버튼, 날짜, 큰 타일 여섯, 욘.
           찾는 칸은 검사 (smoke-palette, smoke-ask) 가 첫 화면에서 기대하므로 위 줄에 작게 둔다.
           머리 줄과 옆줄은 첫 화면에서 숨긴다 (CSS `html[data-view="home"]`). 구석 버튼이 되살린다 */
        const top = document.createElement('div');
        top.className = 'lq-top';
        const d = new Date();
        const dow = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
        // 한국어 원본 셸: 번역 묶음 전 동기 초기화, 초기 문구 유지
        // 언어별 페이지: 미리 로드한 site 번역 사용
        top.innerHTML = `
            <button type="button" class="lq-corner" data-home-chrome="1" title="${escapeHtml(t('site.nav.menu', undefined, '메뉴'))}" aria-label="${escapeHtml(t('site.nav.menu', undefined, '메뉴'))}"><i></i></button>
            <span class="lq-en">KarmoLab</span>
            <div class="landing-palette lq-palette"></div>
            <div class="lq-date"><span class="lq-en">${dow} ${d.getFullYear()}</span><b>${d.getMonth() + 1} / ${d.getDate()}</b></div>
        `;
        landing.appendChild(top);
        greet(top);
        const palette = top.querySelector('.landing-palette');
        if (typeof window !== 'undefined' && window.KarmoPalette) {
            window.KarmoPalette.mountInline(palette);
        }

        /* 욘. 첫 화면 왼쪽에 크게, 아래로 잘린다. 그림은 대시보드 홈과 같은 파일 (img/widgets/mydash) */
        const yawn = document.createElement('img');
        yawn.className = 'lq-yawn';
        yawn.src = '/apps/karmolab/img/widgets/mydash/yawn-stand.webp';
        yawn.alt = '';
        yawn.setAttribute('aria-hidden', 'true');
        landing.appendChild(yawn);

        /* 큰 타일 여섯, 3x2. 이름은 `landing-cta-card` 그대로 (검사와 위임 `data-goto` 가 이 이름을 본다).
           수는 **실측만** 적는다. 도구 수는 목록 길이. 나머지는 여기서 모르므로 빈칸 (0 이 아니다) */
        const cta = document.createElement('div');
        cta.className = 'landing-cta lq-grid';
        const toolCount = (() => { try { return tools().length; } catch (e) { return 0; } })();
        const tiles = [
            ['mydash', 'site.cta.judgePending', '판정 대기', 'JUDGE', '<path d="M6 12l4 4 8-9"/>', '', 'lq-acc'],
            ['mydash', 'site.cta.dashboard', '대시보드', 'DASHBOARD', '<rect x="3" y="4" width="8" height="7"/><rect x="13" y="4" width="8" height="4"/><rect x="13" y="10" width="8" height="10"/><rect x="3" y="13" width="8" height="7"/>', '', ''],
            ['tools', 'site.cta.tools', '도구 목록', 'TOOLS', '<path d="M14 6l4 4-9 9H5v-4z"/><path d="M12 8l4 4"/>', toolCount ? String(toolCount) : '', ''],
            ['arcade', 'widgets.arcade.title', '오락실', 'ARCADE', '<rect x="3" y="7" width="18" height="11" rx="3"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="12" r="1"/><circle cx="18" cy="14" r="1"/>', '', ''],
            ['community', 'site.cta.community', '커뮤니티', 'COMMUNITY', '<path d="M4 5h16v11H9l-5 4z"/>', '', ''],
            ['favorites', 'site.cta.favorites', '즐겨찾기', 'FAVORITES', '<path d="M12 4l2.4 5 5.6.8-4 3.9.9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-3.9 5.6-.8z"/>', '', '']
        ];
        cta.innerHTML = tiles.map(([id, key, fallback, en, icon, n, cls]) => {
            const tag = id === 'tools' ? 'a' : 'button';
            const attr = id === 'tools' ? `href="${toolIndexPath()}"` : `type="button" data-goto="${id}"`;
            return `<${tag} class="landing-cta-card lq-tile ${cls}" ${attr}>
                <svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>
                <span class="landing-cta-card-title">${escapeHtml(t(key, undefined, fallback))}</span>
                <span class="lq-en">${en}</span>
                ${n ? `<span class="lq-n">${escapeHtml(n)}</span>` : ''}
            </${tag}>`;
        }).join('');
        landing.appendChild(cta);

        /* 사람 수 (TASK-KL-098). 실측만, 비면 안 그려진다. 자리는 아래 왼쪽 한 줄 */
        const pulse = document.createElement('div');
        pulse.className = 'landing-pulse lq-pulse';
        pulse.id = 'homePulse';
        landing.appendChild(pulse);
        fillHomePulse(pulse);

        const madeWith = document.createElement('p');
        madeWith.className = 'landing-madewith lq-foot';
        madeWith.innerHTML =
            `<kbd>ESC</kbd>${escapeHtml(t('site.nav.menu', undefined, '메뉴'))} <kbd>CTRL K</kbd>${escapeHtml(t('site.nav.search', undefined, '찾기'))} ` +
            `${escapeHtml(t('site.madewith', undefined, 'AI 와 함께 만듭니다.'))} ` +
            `<a href="https://github.com/Mascari4615/Mascari4615.github.io" rel="noopener">${escapeHtml(t('site.madewith.src', undefined, '소스 보기'))}</a>`;
        landing.appendChild(madeWith);

        /* 구석 버튼: 첫 화면에서 숨긴 머리 줄과 옆줄을 되살린다. 한 번 더 누르면 다시 숨김 */
        top.querySelector('.lq-corner').addEventListener('click', () => {
            const h = document.documentElement;
            if (h.getAttribute('data-home-chrome') === '1') h.removeAttribute('data-home-chrome');
            else h.setAttribute('data-home-chrome', '1');
        });

        return landing;
    }

    /**
     * 도구별 열린 횟수. 한 화면에서 **한 번만** 받아 온다.
     * 도구를 옮길 때마다 새로 물으면, 그 요청 자체가 도구를 열었다를 세는 서버를 계속 두드린다.
     */
    /**
     * 도구 이름 밑에 지금까지 N번 열렸어요 (사용자 요청. "그냥 재밌잖아 그런거").
     *
     * 한 번도 안 열린 도구에는 아무것도 안 쓴다. 0번 열렸어요는 재미가 아니라 낙인이다.
     */
    /** 계정 스크립트를 기다린다. 도구 화면은 그것보다 먼저 그려진다. 안 오면 그냥 포기한다. */
    /**
     * 어서 와요, ○○. 이름은 **계정 닉네임**이다 (사용자 요청 2026-08-19).
     *
     * 전에는 첫 화면 꾸미기에서 따로 적어 넣는 값이었다. 이름을 두 곳에 두면 반드시 갈라진다 . 
     * 머리 위 계정 메뉴는 욘인데 첫 화면은 ㅋㅋ인 식이다. 이름의 정본은 계정 하나다.
     *
     * 로그인 안 했으면 이 줄은 **아예 없다**. 어서 와요,  같은 반쪽 문장보다 없는 편이 낫다.
     * 로그인, 로그아웃을 그 자리에서 하면 계정 조각이 다시 불러 주므로 그때 붙고 떨어진다.
     */
    async function greet(hero) {
        /* 계정 조각은 첫 화면을 지은 **뒤에** 온다. 그냥 읽으면 늘 없다(방문 수와 같은 함정). */
        if (!(await whenApiBase())) return;
        const account = typeof window !== 'undefined' && window.KarmoAccount;
        if (!account || !account.subscribe) return;
        account.subscribe((state) => {
            const name = (state && state.account && state.account.displayName) || '';
            let hi = hero.querySelector('.landing-hi');
            if (!name) {
                if (hi) hi.remove();
                return;
            }
            if (!hi) {
                hi = document.createElement('p');
                hi.className = 'landing-hi';
                hero.appendChild(hi);
            }
            hi.textContent = t('site.greeting', { name }, `어서 와요, ${name}`);
        });
    }

    /** 화면에 그대로 쓰는 글자 다듬기. 도구 이름은 우리 것이지만 규칙은 한 곳에 둔다. */
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** 도구 id 로 사람이 읽는 이름 찾기. 등록된 것 우선, 없으면 지연 메타. 둘 다 없으면 null. */
    function toolTitleFor(id) {
        const registered = tools().find((t) => t.id === id);
        if (registered && registered.title) return registered.title;
        const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
        return (meta[id] && meta[id].title) || null;
    }

    /**
     * 첫 화면의 방문 수. 블로그와 같은 **Today / Total** 두 칸 (TASK-KL-136, 사용자 요청).
     *
     * 문장으로 쓰던 것을 칸으로 바꿨다: 지금까지 N번 다녀갔어요, 오늘 M번, 도구는 K번
     * 열렸고요(L개가 실제로 쓰였어요)는 폭이 좁아지는 순간 두 줄이 되고, 무엇이 무엇인지도
     * 읽어야 안다. 도구 열림 수는 광장(`전부 보기 →`)에 그대로 있다. 첫 화면에 세 종류의
     * 수를 늘어놓지 않는다.
     *
     * 이번 주에 많이 쓴 도구는 **찾는 칸 안쪽**으로 옮겼다 (사용자 요청). 통계를 받아 오는
     * 곳은 여기 하나뿐이므로, 여기서 받아 팔레트에 건네준다.
     *
     * 왜 실측만 쓰나: 이 자리에 한 번이라도 지어낸 수를 넣으면 옆의 진짜 수까지 못 믿을 것이
     * 된다. 그래서 서버에 못 닿거나 아직 한 번도 안 열렸으면 **아무것도 안 그린다** . 
     * 0번 열림이 떠 있는 화면은 북적이는 게 아니라 죽은 화면으로 읽힌다.
     */
    async function fillHomePulse(slot) {
        /* **계정 조각을 기다린다** (2026-08-19. 켜도 방문 수가 안 보임).
         *
         * 여기서 `window.KarmoAccount` 를 그냥 읽고 없으면 돌아섰다. 그런데 이 함수는 첫 화면을
         * **짓는 도중**에 불리고, `account.js` 는 그 뒤에 온다. 그래서 서버가 멀쩡해도 이 칸은
         * 늘 비었다. 도구 화면의 열림 수(`fillToolCount`)는 이미 `whenApiBase()` 를 기다리고
         * 있었는데, 이 자리만 그 줄을 안 썼다(창구는 진작 뚫려 있었다). */
        /* **물어보는 동안 자리를 잡아 둔다**. 대답이 오면 이 칸이 한 줄(23px) 생기면서 아래가
           통째로 내려간다(실사이트 밀림 0.042). 못 받으면 도로 놓아 `:empty` 가 이겨 자리가 없어진다.
           ★ 잡는 자리를 **맨 앞으로** 옮겼다 (2026-09-04). 계정 조각을 기다린 뒤에 잡았더니
           그 기다림 동안은 0px 이라, 첫 화면이 가운데 정렬이라 위아래가 21px 씩 밀렸다
           (실측: 700ms 에 0 에서 20 으로, `.landing-hero` 266 에서 245). 이제 첫 그림부터 자리가 있다. */
        slot.dataset.reserving = '1';
        const unreserve = () => { delete slot.dataset.reserving; };
        if (!(await whenApiBase())) { unreserve(); return; }
        const base = (typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase) || '';
        if (!base) { unreserve(); return; }
        let data;
        try {
            const response = await fetch(base + '/kl/tools/stats');
            if (!response.ok) { unreserve(); return; }
            data = await response.json();
        } catch (_) {
            unreserve();
            return;
        }
        const pulse = (data && data.pulse) || {};
        const visits = (data && data.visits) || {};

        /* 이번 주에 많이 쓴 도구는 찾는 칸 안으로 (TASK-KL-136). 첫 화면이 안 붙어 있어도
         * (도구 상세에서 이 함수가 돌 때) 팔레트는 있을 수 있으므로 화면 확인보다 먼저 넘긴다.
         * 이름을 못 찾는 도구는 뺀다. 화면에 id 가 그대로 뜨면 내부 사정이 새어 나온 것처럼 보인다. */
        const top = (data.tools || [])
            .filter((t) => t.recent > 0 && toolTitleFor(t.toolId))
            .slice(0, 6)
            .map((t) => t.toolId);
        if (top.length && typeof window !== 'undefined' && window.KarmoPalette) {
            window.KarmoPalette.setPopular(top);
        }

        if (!slot.isConnected) { unreserve(); return; }
        if (!pulse.opensTotal && !visits.total) { unreserve(); return; }
        const n = (value) => Number(value || 0).toLocaleString('ko-KR');

        /* 블로그의 Today / Total 두 칸 (사용자 요청). 방문 수만 낸다 . 
         * 명이라고 쓰면 안 된다: 이 수는 방문 횟수지 사람 수가 아니다. 사람 수는 하루
         * 단위로만 셀 수 있고(오늘 열쇠만 들고 있으므로), 그 값은 광장에 있다. */
        if (!visits.total) { unreserve(); return; }
        slot.innerHTML = '<p class="landing-pulse-line">'
            + '<span class="landing-pulse-stat"><span class="landing-pulse-k">Today</span>'
            + '<b>' + n(visits.today) + '</b></span>'
            + '<span class="landing-pulse-stat"><span class="landing-pulse-k">Total</span>'
            + '<b>' + n(visits.total) + '</b></span>'
            + '<button type="button" class="landing-pulse-all" data-open-plaza>전부 보기 →</button></p>';

        const all = slot.querySelector('[data-open-plaza]');
        if (all) all.onclick = () => switchPage('plaza');
    }

    /* ===== Navigation ===== */

    window.KarmoHomePage = { build: buildLanding };
})();
