/* Project Board — 구글 시트에 저장 (브라우저에는 빠른 표시용 사본만 보관) */

// 팀이 함께 쓰는 구글 시트 웹 앱 주소 (설정에서 바꿀 수 있음)
const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyOJIHJqleBo7xqfG7bNRIqR51W_PCz6pHzAPP5gETUClMraZlgiRIp5mt9QSZn7aSO/exec';
const LS_STATE = 'pb_state_v2';
const LS_BASE = 'pb_base_v2';
const LS_LEGACY = 'pb_state_v1';
const LS_USER = 'pb_user';
const LS_SHEET = 'pb_sheet';
const LS_ACTIVE = 'pb_active';

const STATUS = ['대기', '진행중', '완료', '보류'];
const REQ_STATUS = ['요청됨', '확인중', '완료'];
const REQ_TYPES = ['요청', '질문'];
const CAT_COLORS = ['#4ade80', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#2dd4bf', '#fb923c', '#94a3b8'];
const AVA_COLORS = ['#111214', '#22c55e', '#3b82f6', '#ec4899', '#f59e0b', '#8b5cf6', '#14b8a6'];
const DAY = 86400000;

const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const now = () => new Date().toISOString();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 내 컴퓨터 시간대 기준 날짜 (toISOString은 UTC라 한국에서는 오전 9시 전에 하루 밀림)
const localDate = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const today = () => localDate(Date.now());
const addDays = (n) => localDate(Date.now() + n * DAY);
const fmt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const shortDate = (s) => (s ? s.slice(5).replace('-', '.') : '');
const hashColor = (name, list) => {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } },
};

/* ---------------- 상태 ---------------- */

let state;
let user = store.get(LS_USER) || '';
let sheetUrl = store.get(LS_SHEET) || DEFAULT_SHEET_URL;
const ui = { reqPerson: '', cal: {}, calOpen: new Set() };

function newRow(task, cat, owner, start, end, status = '대기', progress = 0) {
  return { id: uid(), task, cat, owner, start, end, status, progress, note: '', updatedBy: '', updatedAt: now() };
}

function newProject(name) {
  return {
    id: uid(),
    name,
    members: user ? [user] : [],
    categories: ['교육', '영상', '디자인', '마케팅'].map((n) => ({ id: uid(), name: n, status: '', todos: [] })),
    schedules: [{ id: uid(), name: '메인 스케줄', rows: [] }],
    requests: [],
    files: [],
  };
}

function sampleState() {
  const p = newProject('샘플 프로젝트');
  const [edu, vid, des, mkt] = p.categories;
  p.schedules[0].rows = [
    newRow('신입 교육 커리큘럼 기획', edu.id, '김하나', addDays(-6), addDays(3), '진행중', 60),
    newRow('교육 자료 제작', edu.id, '김하나', addDays(2), addDays(9)),
    newRow('브랜드 소개 영상 촬영', vid.id, '이두리', addDays(-3), addDays(4), '진행중', 30),
    newRow('영상 편집 및 자막', vid.id, '이두리', addDays(5), addDays(12)),
    newRow('키비주얼 디자인', des.id, '박세나', addDays(-8), addDays(-1), '완료', 100),
    newRow('상세페이지 디자인', des.id, '박세나', addDays(0), addDays(7), '진행중', 20),
    newRow('SNS 런칭 캠페인', mkt.id, '최네모', addDays(4), addDays(14)),
  ];
  p.categories[0].status = '커리큘럼 초안 완료, 내부 검토 중';
  p.categories[0].todos = [{ id: uid(), text: '강사 섭외', owner: '김하나', done: false }];
  p.categories[3].todos = [{ id: uid(), text: '채널별 예산 확정', owner: '최네모', done: false }];
  p.requests = [
    { id: uid(), type: '요청', from: '최네모', to: '박세나', title: 'SNS용 배너 3종 요청', body: '1080x1080, 1080x1920 사이즈로 부탁드립니다.', due: addDays(3), status: '요청됨', answer: '', createdAt: now(), updatedBy: '최네모', updatedAt: now() },
    { id: uid(), type: '질문', from: '이두리', to: '김하나', title: '교육 영상 분량 문의', body: '편당 몇 분 정도로 생각하시나요?', due: '', status: '확인중', answer: '10분 내외로 부탁드려요.', createdAt: now(), updatedBy: '김하나', updatedAt: now() },
  ];
  p.members = ['김하나', '이두리', '박세나', '최네모'];
  return { version: 2, activeId: p.id, projects: [p], updatedAt: now(), updatedBy: '' };
}

function normalize(s) {
  if (!s || !Array.isArray(s.projects) || !s.projects.length) return null;
  // 예전 버전의 전체 공통 팀원 목록은 각 프로젝트로 복사
  const legacy = Array.isArray(s.members) ? s.members : [];
  delete s.members;
  s.projects.forEach((p) => {
    p.members = Array.isArray(p.members) ? p.members : [...legacy];
    p.categories = p.categories || [];
    p.schedules = p.schedules?.length ? p.schedules : [{ id: uid(), name: '메인 스케줄', rows: [] }];
    p.schedules.forEach((sc) => (sc.rows = sc.rows || []));
    p.categories.forEach((c) => (c.todos = c.todos || []));
    p.requests = p.requests || [];
    p.files = p.files || [];
  });
  if (!s.projects.some((p) => p.id === s.activeId)) s.activeId = s.projects[0].id;
  delete s.sheetUrl;
  return s;
}

const project = () => state.projects.find((p) => p.id === state.activeId) || state.projects[0];
const allRows = (p) => p.schedules.flatMap((s) => s.rows);
const catColor = (p, catId) => {
  const i = p.categories.findIndex((c) => c.id === catId);
  return i < 0 ? '#c4c9cf' : CAT_COLORS[i % CAT_COLORS.length];
};
const people = (p) => [...new Set([
  ...p.members,
  ...allRows(p).map((r) => r.owner),
  ...p.requests.flatMap((q) => [q.from, q.to]),
].map((n) => (n || '').trim()).filter(Boolean))];

function stamp(o) {
  o.updatedBy = user || '익명';
  o.updatedAt = now();
}

// 바뀐 내용은 0.8초 뒤 구글 시트로 (바뀐 칸만) 전송
function save() {
  state.updatedAt = now();
  state.updatedBy = user || '익명';
  keepLocal();
  clearTimeout(sync.timer);
  sync.timer = setTimeout(flush, 800);
  setSync();
}

/* ---------------- 렌더링 ---------------- */

const ICON_DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';

function renderAll() {
  renderTabs();
  $('#projTitle').value = project().name;
  $('#meInput').value = user;
  $('#meAvatar').textContent = user ? user.trim()[0] : '?';
  renderSummary();
  renderCalendar();
  renderSchedules();
  renderCategories();
  renderFiles();
  renderRequests();
  renderMemberList();
  renderFoot();
  setSync();
}

function refreshExcept(section) {
  if (section !== 'summary') renderSummary();
  renderCalendar();
  if (section !== 'schedules') renderSchedules();
  if (section !== 'categories') renderCategories();
  if (section !== 'requests') renderRequests();
  renderMemberList();
}

function renderTabs() {
  const cur = project();
  $('#tabs').innerHTML =
    state.projects.map((p) => `<button class="tab ${p.id === cur.id ? 'active' : ''}" data-act="select-project" data-id="${p.id}" title="더블클릭하여 이름 변경">${esc(p.name) || '이름 없음'}</button>`).join('') +
    '<button class="tab add" data-act="add-project" title="프로젝트 추가">+</button>';
}

function renderMemberList() {
  $('#memberList').innerHTML = people(project()).map((n) => `<option value="${esc(n)}">`).join('');
}

function renderSummary() {
  const p = project();
  const rows = allRows(p);
  const total = rows.length;
  const done = rows.filter((r) => r.status === '완료').length;
  const doing = rows.filter((r) => r.status === '진행중').length;
  const avg = total ? Math.round(rows.reduce((a, r) => a + (Number(r.progress) || 0), 0) / total) : 0;
  const openReq = p.requests.filter((q) => q.status !== '완료').length;

  const bars = p.categories.map((c, i) => {
    const cr = rows.filter((r) => r.cat === c.id);
    const v = cr.length ? Math.round(cr.reduce((a, r) => a + (Number(r.progress) || 0), 0) / cr.length) : 0;
    return `<div class="col"><div class="b" style="--c:${CAT_COLORS[i % CAT_COLORS.length]};height:${Math.max(10, v)}%"><span>${v}%</span></div><div class="lbl">${esc(c.name)}</div></div>`;
  }).join('');

  const members = people(p).map((n) => {
    const tasks = rows.filter((r) => r.owner === n && r.status !== '완료').length;
    const reqs = p.requests.filter((q) => q.to === n && q.status !== '완료').length;
    return `<li class="${ui.reqPerson === n ? 'on' : ''}" data-act="filter-person" data-name="${esc(n)}" title="클릭하면 이 사람의 업무 요청만 봅니다">
      <span class="ava" style="background:${hashColor(n, AVA_COLORS)}">${esc(n[0])}</span>
      <span class="nm">${esc(n)}</span>
      <span class="st">업무 ${tasks} · 요청 ${reqs}</span>
      <button class="icon-del" data-act="delete-member" data-name="${esc(n)}" title="팀원 목록에서 제거">${ICON_DEL}</button>
    </li>`;
  }).join('');

  $('#summary').innerHTML = `
    <div class="hero">
      <p>전체 진행률</p>
      <div class="big">${avg}%</div>
      <div class="meta">완료 ${done} / 전체 ${total}개 업무 · 진행중 ${doing} · 미처리 요청 ${openReq}</div>
      <div class="bar"><span style="width:${avg}%"></span></div>
      <div class="hero-actions">
        <button class="btn-outline" data-act="scroll" data-target="requests">업무 요청</button>
        <button class="btn-dark" data-act="quick-add-row">업무 추가</button>
        <button class="btn-plus" data-act="quick-add-row" title="업무 추가">+</button>
      </div>
    </div>
    <div class="dark-card">
      <div class="sec-head"><h3>카테고리 진행률</h3><span class="pill-ghost">평균 진척도</span></div>
      <div class="bars">${bars || '<p class="empty">카테고리가 없습니다</p>'}</div>
    </div>
    <div class="card members">
      <div class="sec-head"><h3>프로젝트 팀원</h3><span class="pill-dark">${people(p).length}명</span></div>
      <ul>${members || '<p class="empty">팀원을 추가하세요</p>'}</ul>
      <form class="add-inline" data-form="member">
        <input name="name" placeholder="팀원 이름 추가" autocomplete="off">
        <button class="btn-plus" title="추가">+</button>
      </form>
    </div>`;
}

function rangeOf(s) {
  const ds = s.rows.flatMap((r) => [r.start, r.end]).filter(Boolean).map((d) => +new Date(d));
  if (!ds.length) return null;
  const a = Math.min(...ds);
  const b = Math.max(...ds) + DAY;
  return { a, b };
}

function ganttInner(r, rg, color) {
  if (!rg || (!r.start && !r.end)) return '';
  const st = +new Date(r.start || r.end);
  const en = +new Date(r.end || r.start) + DAY;
  const span = rg.b - rg.a;
  const left = ((Math.min(st, en - DAY) - rg.a) / span) * 100;
  const width = Math.max(3, (Math.abs(en - st) / span) * 100);
  const t = +new Date(today());
  const todayMark = t >= rg.a && t <= rg.b ? `<div class="today" style="left:${((t - rg.a) / span) * 100}%"></div>` : '';
  return `<div class="bar" style="--c:${color};left:${left}%;width:${width}%"><i style="width:${r.progress || 0}%"></i></div>${todayMark}`;
}

function rowHTML(p, s, r, rg) {
  const A = (k) => `data-t="row" data-s="${s.id}" data-r="${r.id}" data-k="${k}"`;
  const color = catColor(p, r.cat);
  return `<tr data-r="${r.id}">
    <td><input class="cell" ${A('task')} value="${esc(r.task)}" placeholder="업무명 입력"></td>
    <td><select class="cell cat-select" ${A('cat')} style="color:${color === '#c4c9cf' ? 'inherit' : 'color-mix(in srgb,' + color + ' 70%, #000)'}">
      ${p.categories.map((c) => `<option value="${c.id}" ${c.id === r.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      <option value="" ${!p.categories.some((c) => c.id === r.cat) ? 'selected' : ''}>미분류</option>
    </select></td>
    <td><input class="cell" list="memberList" ${A('owner')} value="${esc(r.owner)}" placeholder="담당자"></td>
    <td><input class="cell" type="date" ${A('start')} value="${esc(r.start)}"></td>
    <td><input class="cell" type="date" ${A('end')} value="${esc(r.end)}"></td>
    <td><select class="status s-${r.status}" ${A('status')}>${STATUS.map((x) => `<option ${x === r.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td><div class="prog"><input type="range" min="0" max="100" step="5" ${A('progress')} value="${Number(r.progress) || 0}"><span>${Number(r.progress) || 0}%</span></div></td>
    <td class="gantt-cell"><div class="track">${ganttInner(r, rg, color)}</div></td>
    <td><input class="cell" ${A('note')} value="${esc(r.note)}" placeholder="진행사항 / 메모"></td>
    <td class="meta-cell">${esc(r.updatedBy) || '-'}<small>${fmt(r.updatedAt)}</small></td>
    <td class="del-col"><button class="row-del" data-act="delete-row" data-s="${s.id}" data-r="${r.id}" title="이 업무 삭제">${ICON_TRASH}</button></td>
  </tr>`;
}

function rangeLabel(rg) {
  return rg ? `${shortDate(new Date(rg.a).toISOString().slice(0, 10))} ~ ${shortDate(new Date(rg.b - DAY).toISOString().slice(0, 10))}` : '';
}

/* 일정 달력: 모든 스케줄표의 업무를 시작일~종료일 막대로 표시 (월별 보기는 내 화면에만 적용) */
const CAL_LANES = 4; // 한 주에 기본으로 보이는 줄 수
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoShift = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

// 날짜가 하나만 있으면 하루짜리로, 앞뒤가 바뀌었으면 바로잡아 표시
function rowSpan(r) {
  const a = ISO_DAY.test(r.start) ? r.start : '';
  const b = ISO_DAY.test(r.end) ? r.end : '';
  if (!a && !b) return null;
  const s = a || b;
  const e = b || a;
  return s <= e ? { s, e } : { s: e, e: s };
}

// 직접 넘겨 보기 전에는 이번 달, 이번 달에 업무가 없으면 가장 가까운 업무가 있는 달
function calMonth(p, spans) {
  if (ui.cal[p.id]) return ui.cal[p.id];
  const now = today();
  const month = now.slice(0, 7);
  if (!spans.length || spans.some(({ s, e }) => s.slice(0, 7) <= month && e.slice(0, 7) >= month)) return month;
  const next = spans.map(({ s }) => s).filter((s) => s >= now).sort()[0];
  return (next || spans.map(({ e }) => e).sort().pop()).slice(0, 7);
}

function shiftMonth(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

function calWeekHTML(p, ws, month, items) {
  const days = Array.from({ length: 7 }, (_, i) => isoShift(ws, i));
  const we = days[6];
  const now = today();
  // 겹치지 않게 줄 배정: 먼저 시작하고 긴 업무부터
  const lanes = [];
  const bars = items.filter(({ span }) => span.s <= we && span.e >= ws)
    .sort((a, b) => a.span.s.localeCompare(b.span.s) || b.span.e.localeCompare(a.span.e))
    .map((it) => {
      const from = days.indexOf(it.span.s < ws ? ws : it.span.s);
      const to = days.indexOf(it.span.e > we ? we : it.span.e);
      let lane = lanes.findIndex((end) => end < from);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = to;
      return { ...it, from, to, lane };
    });
  const open = ui.calOpen.has(ws);
  const shown = open ? bars : bars.filter((b) => b.lane < CAL_LANES);
  const hidden = days.map((_, i) => bars.filter((b) => !shown.includes(b) && b.from <= i && b.to >= i).length);
  const laneCount = shown.reduce((n, b) => Math.max(n, b.lane + 1), 0);
  const moreRow = laneCount + 2;
  const hasMore = hidden.some(Boolean) || open;

  const cells = days.map((d, i) => `<div class="cal-day ${d.slice(0, 7) === month ? '' : 'out'} ${d === now ? 'today' : ''} ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}" style="grid-row:1/-1;grid-column:${i + 1}"><span class="cal-num">${+d.slice(8)}</span></div>`).join('');
  const barHTML = shown.map(({ r, sc, span, from, to, lane }) => {
    const label = `${r.task || '(이름 없음)'}\n${r.owner || '담당 미정'} · ${span.s}${span.e !== span.s ? ` ~ ${span.e}` : ''} · ${r.status}\n${sc.name}`;
    return `<button class="cal-bar ${r.status === '완료' ? 'done' : ''} ${span.s < ws ? 'cont-l' : ''} ${span.e > we ? 'cont-r' : ''}" style="--c:${catColor(p, r.cat)};grid-column:${from + 1}/${to + 2};grid-row:${lane + 2}" data-act="cal-row" data-s="${sc.id}" data-r="${r.id}" title="${esc(label)}"><b>${esc(r.task) || '(이름 없음)'}</b>${r.owner ? `<small>${esc(r.owner)}</small>` : ''}</button>`;
  }).join('');
  const more = open
    ? `<button class="cal-more" style="grid-column:1/8;grid-row:${moreRow}" data-act="cal-week" data-w="${ws}">접기</button>`
    : hidden.map((n, i) => (n ? `<button class="cal-more" style="grid-column:${i + 1};grid-row:${moreRow}" data-act="cal-week" data-w="${ws}">+${n}개</button>` : '')).join('');
  return `<div class="cal-week" style="grid-template-rows:26px repeat(${laneCount},24px) ${hasMore ? '22px' : ''} minmax(10px,1fr)">${cells}${barHTML}${more}</div>`;
}

function renderCalendar() {
  const p = project();
  const hide = !!view.calHidden;
  const items = p.schedules.flatMap((sc) => sc.rows.map((r) => ({ r, sc, span: rowSpan(r) })));
  const dated = items.filter((x) => x.span);
  const month = calMonth(p, dated.map((x) => x.span));
  const first = `${month}-01`;
  const last = isoShift(`${shiftMonth(month, 1)}-01`, -1);
  const weeks = [];
  for (let ws = isoShift(first, -new Date(first).getUTCDay()); ws <= last; ws = isoShift(ws, 7)) weeks.push(ws);
  const inMonth = dated.filter(({ span }) => span.s <= last && span.e >= first);
  const usedCats = p.categories.filter((c) => inMonth.some(({ r }) => r.cat === c.id));
  const uncat = inMonth.some(({ r }) => !p.categories.some((c) => c.id === r.cat));
  const undated = items.length - dated.length;
  $('#calendar').innerHTML = `
    <div class="section-title">
      <div><h2>일정 달력</h2><p>스케줄표의 시작일·종료일이 자동으로 표시됩니다. 막대를 누르면 스케줄표의 그 업무로 이동합니다.</p></div>
      <div class="sched-actions"><button class="btn-outline" data-act="cal-toggle">${hide ? '펼치기 ▾' : '숨기기 ▴'}</button></div>
    </div>
    ${hide ? '' : `<div class="card cal">
      <div class="cal-head">
        <div class="cal-nav">
          <button class="round-btn" data-act="cal-move" data-n="-1" title="이전 달" aria-label="이전 달">‹</button>
          <h3>${+month.slice(0, 4)}년 ${+month.slice(5)}월</h3>
          <button class="round-btn" data-act="cal-move" data-n="1" title="다음 달" aria-label="다음 달">›</button>
          <button class="btn-outline" data-act="cal-today">오늘</button>
        </div>
        <div class="cal-legend">
          ${usedCats.map((c) => `<span style="--c:${catColor(p, c.id)}">${esc(c.name)}</span>`).join('')}
          ${uncat ? '<span style="--c:#c4c9cf">미분류</span>' : ''}
          <em>이번 달 업무 ${inMonth.length}개${undated ? ` · 날짜 없는 업무 ${undated}개` : ''}</em>
        </div>
      </div>
      <div class="table-wrap"><div class="cal-grid">
        <div class="cal-dow">${['일', '월', '화', '수', '목', '금', '토'].map((d) => `<span>${d}</span>`).join('')}</div>
        ${weeks.map((ws) => calWeekHTML(p, ws, month, dated)).join('')}
      </div></div>
    </div>`}`;
}

// 달력 막대 → 스케줄표의 그 줄로 이동 (숨긴 표·필터에 가려져 있어도 보이게)
function goToRow(sid, rid) {
  view.hidden = view.hidden.filter((x) => x !== sid);
  pinned.add(rid);
  keepView();
  renderSchedules();
  const tr = document.querySelector(`.sched[data-s="${sid}"] tr[data-r="${rid}"]`);
  if (!tr) return;
  tr.scrollIntoView({ block: 'center' });
  tr.classList.add('flash');
  setTimeout(() => tr.classList.remove('flash'), 1800);
}

/* 스케줄표 보기 설정 (정렬·필터·접기) — 내 화면에만 적용되고 저장 순서는 바꾸지 않음 */
const LS_VIEW = 'pb_view';
const view = (() => {
  try { return Object.assign({ hidden: [], tables: {} }, JSON.parse(store.get(LS_VIEW) || '{}')); } catch { return { hidden: [], tables: {} }; }
})();
const keepView = () => store.set(LS_VIEW, JSON.stringify(view));
const tableView = (sid) => (view.tables[sid] ||= { sort: null, ex: {} });
const pinned = new Set(); // 이번에 새로 추가한 업무는 필터와 상관없이 보여 줌

const COLS = [
  { k: 'task', label: '업무명', w: '20%' },
  { k: 'cat', label: '카테고리', filter: true },
  { k: 'owner', label: '담당자', filter: true },
  { k: 'start', label: '시작일' },
  { k: 'end', label: '종료일' },
  { k: 'status', label: '상태', filter: true },
  { k: 'progress', label: '진행률' },
];
const EMPTY = '(비어 있음)';

// 필터 목록에 보이는 값
function colText(p, r, k) {
  if (k === 'cat') return p.categories.find((c) => c.id === r.cat)?.name || '미분류';
  return String(r[k] ?? '').trim() || EMPTY;
}

// 정렬에 쓰는 값 (빈 값은 항상 맨 뒤)
function colSortKey(p, r, k) {
  if (k === 'progress') return Number(r.progress) || 0;
  if (k === 'status') return STATUS.indexOf(r.status);
  if (k === 'cat') { const i = p.categories.findIndex((c) => c.id === r.cat); return i < 0 ? null : i; }
  return String(r[k] ?? '').trim() || null;
}

function viewRows(p, s) {
  const v = tableView(s.id);
  let rows = s.rows.filter((r) => pinned.has(r.id) || Object.entries(v.ex).every(([k, vals]) => !vals.includes(colText(p, r, k))));
  if (v.sort) {
    const { k, dir } = v.sort;
    rows = rows.map((r, i) => ({ r, i, key: colSortKey(p, r, k) })).sort((a, b) => {
      if (a.key === null || b.key === null) return a.key === b.key ? a.i - b.i : a.key === null ? 1 : -1;
      const c = typeof a.key === 'number' ? a.key - b.key : a.key.localeCompare(b.key, 'ko');
      return (c * dir) || a.i - b.i;
    }).map((x) => x.r);
  }
  return rows;
}

function colHead(s, c) {
  const v = tableView(s.id);
  const on = v.sort?.k === c.k || v.ex[c.k]?.length;
  const arrow = v.sort?.k === c.k ? (v.sort.dir > 0 ? '↑' : '↓') : '';
  return `<th${c.w ? ` style="width:${c.w}"` : ''}><button class="th-btn ${on ? 'on' : ''}" data-act="col-menu" data-s="${s.id}" data-k="${c.k}" title="정렬${c.filter ? '·필터' : ''}">${c.label}${arrow ? ` <b>${arrow}</b>` : ''}${v.ex[c.k]?.length ? ' <i class="fdot"></i>' : ''}<span class="caret">▾</span></button></th>`;
}

function openColMenu(btn) {
  const { s: sid, k } = btn.dataset;
  const p = project();
  const s = p.schedules.find((x) => x.id === sid);
  const c = COLS.find((x) => x.k === k);
  const v = tableView(sid);
  const menu = $('#colMenu');
  let list = '';
  if (c.filter) {
    const counts = new Map();
    // 카테고리는 카테고리 순서대로, 나머지는 가나다순
    if (k === 'cat') [...p.categories.map((x) => x.name), '미분류'].forEach((n) => counts.set(n, 0));
    s.rows.forEach((r) => { const t = colText(p, r, k); counts.set(t, (counts.get(t) || 0) + 1); });
    let vals = [...counts.entries()].filter(([n, cnt]) => cnt || (v.ex[k] || []).includes(n));
    if (k !== 'cat') vals.sort((a, b) => (a[0] === EMPTY) - (b[0] === EMPTY) || a[0].localeCompare(b[0], 'ko'));
    const ex = v.ex[k] || [];
    list = `<div class="cm-sep"></div>
      <label class="cm-all"><input type="checkbox" data-cm="all" ${ex.length ? '' : 'checked'}> (모두 선택)</label>
      <div class="cm-list">${vals.map(([n, cnt]) => `<label><input type="checkbox" data-cm="val" value="${esc(n)}" ${ex.includes(n) ? '' : 'checked'}> <span>${esc(n)}</span><small>${cnt}</small></label>`).join('')}</div>
      ${ex.length ? '<button class="cm-item" data-act="col-clear">필터 지우기</button>' : ''}`;
  }
  menu.innerHTML = `
    <button class="cm-item ${v.sort?.k === k && v.sort.dir > 0 ? 'on' : ''}" data-act="col-sort" data-dir="1">↑ 오름차순 정렬</button>
    <button class="cm-item ${v.sort?.k === k && v.sort.dir < 0 ? 'on' : ''}" data-act="col-sort" data-dir="-1">↓ 내림차순 정렬</button>
    ${v.sort?.k === k ? '<button class="cm-item" data-act="col-sort" data-dir="0">정렬 해제 (원래 순서)</button>' : ''}
    ${list}`;
  menu.dataset.s = sid;
  menu.dataset.k = k;
  menu.hidden = false;
  const b = btn.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(b.left, innerWidth - menu.offsetWidth - 8)) + scrollX}px`;
  menu.style.top = `${b.bottom + 4 + scrollY}px`;
}

function closeColMenu() { $('#colMenu').hidden = true; }

// 메뉴를 연 채로 표만 다시 그림
function applyView(sid, k) {
  keepView();
  renderSchedules();
  const btn = document.querySelector(`.th-btn[data-s="${sid}"][data-k="${k}"]`);
  if (btn && !$('#colMenu').hidden) openColMenu(btn);
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (!el.dataset.cm) return;
  const { s: sid, k } = $('#colMenu').dataset;
  const v = tableView(sid);
  if (el.dataset.cm === 'all') {
    v.ex[k] = el.checked ? [] : [...$('#colMenu').querySelectorAll('[data-cm="val"]')].map((x) => x.value);
  } else {
    v.ex[k] = [...$('#colMenu').querySelectorAll('[data-cm="val"]')].filter((x) => !x.checked).map((x) => x.value);
  }
  if (!v.ex[k].length) delete v.ex[k];
  applyView(sid, k);
});

document.addEventListener('pointerdown', (e) => {
  if (!$('#colMenu').hidden && !e.target.closest('#colMenu, .th-btn')) closeColMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeColMenu(); });

function renderSchedules() {
  const p = project();
  $('#schedules').innerHTML = `
    <div class="section-title">
      <div><h2>스케줄표</h2><p>업무명·담당자·기간·상태를 직접 입력하세요. 모든 변경은 자동 저장됩니다.</p></div>
      <div class="sched-actions">
        <button class="btn-outline" data-act="xl-import" title="엑셀 파일을 새 스케줄표로 가져오기">엑셀 가져오기</button>
        <button class="btn-dark" data-act="add-schedule">+ 스케줄표 추가</button>
      </div>
    </div>
    ${p.schedules.map((s) => {
      const rg = rangeOf(s);
      const hidden = view.hidden.includes(s.id);
      const rows = viewRows(p, s);
      const v = tableView(s.id);
      const filtered = rows.length !== s.rows.length;
      return `<div class="card sched ${hidden ? 'folded' : ''}" data-s="${s.id}">
        <div class="sec-head">
          <div><p class="eyebrow">Schedule · ${s.rows.length}개 업무${filtered ? ` · <b class="flt">필터 적용: ${rows.length}개 표시</b>` : ''}${
            filtered || v.sort ? ` <button class="link-btn" data-act="view-reset" data-s="${s.id}">정렬·필터 해제</button>` : ''}</p>
            <input class="sched-name" data-t="sched" data-s="${s.id}" data-k="name" value="${esc(s.name)}" placeholder="스케줄표 이름"></div>
          <div class="sched-actions">
            ${hidden ? '' : `<button class="btn-outline" data-act="xl-import" data-s="${s.id}" title="엑셀 파일의 업무를 이 스케줄표에 추가">엑셀 가져오기</button>
            <button class="btn-dark" data-act="add-row" data-s="${s.id}">+ 업무 추가</button>`}
            <button class="btn-outline fold-btn" data-act="toggle-sched" data-s="${s.id}" title="${hidden ? '표 펼치기' : '표 숨기기 (내 화면에서만)'}">${hidden ? '펼치기 ▾' : '숨기기 ▴'}</button>
            <button class="round-btn danger" data-act="delete-schedule" data-s="${s.id}" title="스케줄표 삭제">${ICON_TRASH}</button>
          </div>
        </div>
        ${hidden ? '' : `<div class="table-wrap"><table>
          <thead><tr>
            ${COLS.map((c) => colHead(s, c)).join('')}
            <th>타임라인 <span class="gantt-range">${rangeLabel(rg)}</span></th><th style="width:16%">메모</th><th>최종 수정</th><th class="del-col">삭제</th>
          </tr></thead>
          <tbody>${rows.map((r) => rowHTML(p, s, r, rg)).join('')}</tbody>
        </table></div>
        ${s.rows.length ? (rows.length ? '' : '<p class="empty">필터 조건에 맞는 업무가 없습니다.</p>') : '<p class="empty">아직 업무가 없습니다. “+ 업무 추가”를 눌러 시작하세요.</p>'}`}
      </div>`;
    }).join('')}`;
}

// 표 전체를 다시 그리지 않고 타임라인/수정자만 갱신 (입력 포커스 유지)
function updateScheduleInPlace(sid, rid) {
  const p = project();
  const s = p.schedules.find((x) => x.id === sid);
  const card = document.querySelector(`.sched[data-s="${sid}"]`);
  if (!s || !card?.querySelector('.gantt-range')) return;
  const rg = rangeOf(s);
  card.querySelector('.gantt-range').textContent = rangeLabel(rg);
  s.rows.forEach((r) => {
    const tr = card.querySelector(`tr[data-r="${r.id}"]`);
    if (!tr) return;
    tr.querySelector('.track').innerHTML = ganttInner(r, rg, catColor(p, r.cat));
    if (r.id === rid) tr.querySelector('.meta-cell').innerHTML = `${esc(r.updatedBy) || '-'}<small>${fmt(r.updatedAt)}</small>`;
  });
}

function renderCategories() {
  const p = project();
  const rows = allRows(p);
  $('#categories').innerHTML = `
    <div class="section-title">
      <div><h2>카테고리 현황</h2><p>스케줄표 내용이 자동으로 요약되고, 현황 메모와 앞으로 할 일을 따로 정리할 수 있습니다.</p></div>
    </div>
    <div class="cat-grid">
      ${p.categories.map((c, i) => {
        const color = CAT_COLORS[i % CAT_COLORS.length];
        const cr = rows.filter((r) => r.cat === c.id);
        const avg = cr.length ? Math.round(cr.reduce((a, r) => a + (Number(r.progress) || 0), 0) / cr.length) : 0;
        const doing = cr.filter((r) => r.status === '진행중');
        const next = cr.filter((r) => r.status === '대기').sort((a, b) => (a.start || '9').localeCompare(b.start || '9'));
        const item = (r, d) => `<li class="auto-item"><span class="t">${esc(r.task) || '(이름 없음)'}</span><span class="o">${esc(r.owner) || '미정'}${d ? ' · ' + d : ''}</span></li>`;
        const C = (k) => `data-t="cat" data-c="${c.id}" data-k="${k}"`;
        return `<article class="card cat-card" style="--c:${color}">
          <div class="cat-head">
            <span class="cat-dot"></span>
            <input class="cat-name" ${C('name')} value="${esc(c.name)}" placeholder="카테고리 이름">
            <button class="icon-del" data-act="delete-cat" data-c="${c.id}" title="카테고리 삭제">${ICON_DEL}</button>
          </div>
          <div class="cat-stats">
            <div class="ring" style="--p:${avg}"><b>${avg}%</b></div>
            <div class="nums">
              <div><b>${cr.length}</b>전체</div>
              <div><b>${doing.length}</b>진행중</div>
              <div><b>${cr.filter((r) => r.status === '완료').length}</b>완료</div>
            </div>
          </div>
          <div class="cat-block"><h4>진행 중</h4>
            <ul>${doing.map((r) => item(r, r.end ? '~' + shortDate(r.end) : '')).join('') || '<li class="auto-none">진행 중인 업무 없음</li>'}</ul></div>
          <div class="cat-block"><h4>예정</h4>
            <ul>${next.slice(0, 4).map((r) => item(r, r.start ? shortDate(r.start) + '~' : '')).join('') || '<li class="auto-none">예정된 업무 없음</li>'}</ul></div>
          <div class="cat-block"><h4>현황 메모</h4>
            <textarea class="note" ${C('status')} placeholder="현재 상황을 간단히 적어주세요">${esc(c.status)}</textarea></div>
          <div class="cat-block"><h4>앞으로 할 일 <button class="btn-mini" data-act="add-todo" data-c="${c.id}">+ 추가</button></h4>
            <ul>${c.todos.map((o) => {
              const O = (k) => `data-t="todo" data-c="${c.id}" data-o="${o.id}" data-k="${k}"`;
              return `<li class="todo ${o.done ? 'done' : ''}">
                <input type="checkbox" ${O('done')} ${o.done ? 'checked' : ''}>
                <input class="cell txt" ${O('text')} value="${esc(o.text)}" placeholder="할 일">
                <input class="cell who" list="memberList" ${O('owner')} value="${esc(o.owner)}" placeholder="담당">
                <button class="icon-del" data-act="delete-todo" data-c="${c.id}" data-o="${o.id}">${ICON_DEL}</button>
              </li>`;
            }).join('') || '<li class="auto-none">할 일을 추가하세요</li>'}</ul></div>
        </article>`;
      }).join('')}
      <button class="add-cat" data-act="add-cat">+ 카테고리 추가</button>
    </div>`;
}

function reqCard(q) {
  const Q = (k) => `data-t="req" data-q="${q.id}" data-k="${k}"`;
  const overdue = q.due && q.status !== '완료' && q.due < today();
  return `<article class="req ${q.type === '질문' ? 'q' : ''} ${overdue ? 'overdue' : ''}">
    <div class="req-top">
      <select class="cell badge" ${Q('type')} style="width:auto">${REQ_TYPES.map((t) => `<option ${t === q.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
      ${overdue ? '<span class="overdue-tag">기한 지남</span>' : ''}
      <input class="cell" type="date" ${Q('due')} value="${esc(q.due)}" title="마감일">
      <button class="icon-del" data-act="delete-req" data-q="${q.id}" title="삭제">${ICON_DEL}</button>
    </div>
    <input class="cell req-title" ${Q('title')} value="${esc(q.title)}" placeholder="제목">
    <div class="req-people">
      <input class="cell" list="memberList" ${Q('from')} value="${esc(q.from)}" placeholder="요청자">
      <span>→</span>
      <input class="cell" list="memberList" ${Q('to')} value="${esc(q.to)}" placeholder="담당자">
    </div>
    <textarea class="cell" ${Q('body')} placeholder="요청 / 질문 내용">${esc(q.body)}</textarea>
    <textarea class="cell answer" ${Q('answer')} placeholder="답변 / 코멘트">${esc(q.answer)}</textarea>
    <div class="req-foot">
      <select class="status s-${q.status === '완료' ? '완료' : q.status === '확인중' ? '진행중' : '대기'}" ${Q('status')}>${REQ_STATUS.map((x) => `<option ${x === q.status ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <small>수정 ${esc(q.updatedBy) || '-'} · ${fmt(q.updatedAt)}</small>
    </div>
  </article>`;
}

function renderRequests() {
  const p = project();
  const all = p.requests;
  const list = all.filter((q) => !ui.reqPerson || q.to === ui.reqPerson || q.from === ui.reqPerson);
  const names = people(p);
  $('#requests').innerHTML = `
    <div class="section-title">
      <div><h2>업무 요청 · 질문</h2><p>팀원 개개인에게 요청하거나 질문하고, 답변과 처리 상태를 기록합니다.</p></div>
    </div>
    <div class="card">
      <div class="sec-head">
        <div class="person-chips">
          <button class="chip ${!ui.reqPerson ? 'active' : ''}" data-act="filter-person" data-name="">전체 ${all.length}</button>
          ${names.map((n) => {
            const cnt = all.filter((q) => q.to === n && q.status !== '완료').length;
            return `<button class="chip ${ui.reqPerson === n ? 'active' : ''}" data-act="filter-person" data-name="${esc(n)}">${esc(n)}${cnt ? ' · ' + cnt : ''}</button>`;
          }).join('')}
        </div>
      </div>
      <form class="req-form" data-form="req">
        <select name="type">${REQ_TYPES.map((t) => `<option>${t}</option>`).join('')}</select>
        <input name="from" list="memberList" placeholder="요청자" value="${esc(user)}" autocomplete="off">
        <input name="to" list="memberList" placeholder="받는 사람 *" value="${esc(ui.reqPerson)}" autocomplete="off" required>
        <input name="title" placeholder="제목 *" autocomplete="off" required>
        <input name="due" type="date" title="마감일">
        <button class="btn-dark" type="submit">요청 등록</button>
        <textarea name="body" class="full" placeholder="상세 내용 (선택)"></textarea>
      </form>
      <div class="kanban">
        ${REQ_STATUS.map((st) => {
          const items = list.filter((q) => q.status === st).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          return `<div class="kcol"><div class="kcol-head"><span>${st}</span><b>${items.length}</b></div>
            ${items.map(reqCard).join('') || '<p class="empty">없음</p>'}</div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderFoot() {
  $('#foot').textContent = sync.at ? `구글 시트와 동기화: ${fmt(sync.at)} · 20초마다 자동 갱신` : '구글 시트에 연결하는 중…';
}

function setSync() {
  if (!state) return;
  let cls = 'ok';
  let text = '동기화됨';
  if (sync.error) { cls = 'dirty'; text = '연결 오류'; }
  else if (sync.busy || !sync.loaded) { cls = 'loading'; text = sync.loaded ? '저장 중…' : '불러오는 중…'; }
  else if (sync.timer || pendingOps().length) { cls = 'dirty'; text = '저장 대기'; }
  $('#syncBtn').className = `sync-btn ${cls}`;
  $('#syncBtn').title = sync.error ? `구글 시트 오류: ${sync.error}` : '구글 시트 연결 설정';
  $('#syncLabel').textContent = text;
  renderFoot();
}

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${err ? 'err' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
}

/* ---------------- 편집 이벤트 ---------------- */

function targetOf(el) {
  const d = el.dataset;
  const p = project();
  switch (d.t) {
    case 'proj': return p;
    case 'sched': return p.schedules.find((s) => s.id === d.s);
    case 'row': return p.schedules.find((s) => s.id === d.s)?.rows.find((r) => r.id === d.r);
    case 'cat': return p.categories.find((c) => c.id === d.c);
    case 'todo': return p.categories.find((c) => c.id === d.c)?.todos.find((o) => o.id === d.o);
    case 'req': return p.requests.find((q) => q.id === d.q);
    case 'file': return p.files.find((f) => f.id === d.f);
    default: return null;
  }
}

const valueOf = (el) => (el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value);

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'meInput') {
    user = el.value.trim();
    store.set(LS_USER, user);
    $('#meAvatar').textContent = user ? user[0] : '?';
    return;
  }
  if (!el.dataset.t) return;
  const o = targetOf(el);
  if (!o) return;
  o[el.dataset.k] = valueOf(el);
  if (el.type === 'range') el.nextElementSibling.textContent = `${el.value}%`;
  if (el.dataset.t === 'proj') renderTabs();
  stamp(o);
  save();
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'meInput') {
    const p = project();
    if (user && !p.members.includes(user)) { p.members.push(user); save(); }
    renderSummary(); renderRequests(); renderMemberList();
    return;
  }
  if (el.id === 'importFile') return importFile(el);
  if (el.id === 'xlFile') return xlFile(el);
  if (el.id === 'attachFile') { const list = [...el.files]; el.value = ''; return uploadFiles(list); }
  if (el.closest('#xlDialog')) return xlChange(el);
  if (!el.dataset.t) return;
  const o = targetOf(el);
  if (!o) return;
  const { t, k } = el.dataset;
  o[k] = valueOf(el);

  if (t === 'row') {
    const tr = el.closest('tr');
    if (k === 'progress' && o.progress === 100 && o.status !== '완료') {
      o.status = '완료';
      const sel = tr.querySelector('[data-k="status"]');
      sel.value = '완료'; sel.className = 'status s-완료';
    }
    if (k === 'progress' && o.progress < 100 && o.status === '완료') {
      o.status = '진행중';
      const sel = tr.querySelector('[data-k="status"]');
      sel.value = '진행중'; sel.className = 'status s-진행중';
    }
    if (k === 'status') {
      el.className = `status s-${o.status}`;
      if (o.status === '완료') o.progress = 100;
      if (o.status === '진행중' && !o.progress) o.progress = 10;
      const rg = tr.querySelector('[data-k="progress"]');
      rg.value = o.progress; rg.nextElementSibling.textContent = `${o.progress}%`;
    }
    if (k === 'cat') {
      const c = catColor(project(), o.cat);
      el.style.color = c === '#c4c9cf' ? 'inherit' : `color-mix(in srgb, ${c} 70%, #000)`;
    }
    if (k === 'start' && o.start >= '2000') {
      // 종료일이 없거나 시작일보다 빠르면 시작일로 맞춰 달력이 그 달에서 열리게 함
      const endEl = tr.querySelector('[data-k="end"]');
      if (!o.end || o.end < o.start) { o.end = o.start; endEl.value = o.start; }
      // 달력에서 고른 경우에만 이동 (키보드로 입력 중이면 글자마다 change가 발생하므로 Tab으로 이동)
      if (Date.now() - lastDateKey > 1000) setTimeout(() => focusEndDate(endEl), 60);
    }
  }
  if (t === 'todo' && k === 'done') el.closest('li').classList.toggle('done', o.done);

  stamp(o);
  save();
  if (t === 'row') updateScheduleInPlace(el.dataset.s, el.dataset.r);
  refreshExcept(el.closest('[data-section]')?.dataset.section);
  if (t === 'req' && ['status', 'type', 'to', 'from', 'due'].includes(k)) renderRequests();
  if (t === 'cat' && k === 'name') renderSchedules();
});

let lastDateKey = 0;
document.addEventListener('keydown', (e) => { if (e.target.type === 'date') lastDateKey = Date.now(); }, true);

function focusEndDate(el) {
  if (!el.isConnected) return;
  el.focus();
  el.classList.add('date-next');
  el.addEventListener('blur', () => el.classList.remove('date-next'), { once: true });
  try {
    el.showPicker();
  } catch {
    // 시작일을 고른 뒤 시간이 지나면 브라우저가 자동 열기를 막음 → 칸을 한 번 누르면 열리게 함
    el.addEventListener('click', () => { try { el.showPicker(); } catch { /* 미지원 브라우저 */ } }, { once: true });
  }
}

document.addEventListener('dblclick', (e) => {
  const tab = e.target.closest('.tab[data-id]');
  if (!tab) return;
  const p = state.projects.find((x) => x.id === tab.dataset.id);
  const name = prompt('프로젝트 이름 변경', p.name);
  if (name && name.trim()) {
    p.name = name.trim();
    save();
    renderAll();
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const p = project();
  if (form.dataset.form === 'member') {
    const n = (f.name || '').trim();
    if (!n) return;
    if (!p.members.includes(n)) p.members.push(n);
    save();
    renderSummary(); renderRequests(); renderMemberList();
    $('#summary .add-inline input').focus();
  }
  if (form.dataset.form === 'req') {
    if (!f.to.trim() || !f.title.trim()) return;
    const q = {
      id: uid(), type: f.type, from: f.from.trim() || user, to: f.to.trim(), title: f.title.trim(), body: f.body.trim(),
      due: f.due, status: '요청됨', answer: '', createdAt: now(),
    };
    stamp(q);
    p.requests.push(q);
    save();
    renderRequests(); renderSummary(); renderMemberList();
    toast(`${q.to}님에게 ${q.type}이 등록되었습니다`);
  }
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const d = b.dataset;
  const p = project();
  switch (d.act) {
    case 'select-project':
      state.activeId = d.id;
      ui.reqPerson = '';
      store.set(LS_ACTIVE, d.id);
      renderAll();
      break;
    case 'add-project': {
      const name = prompt('새 프로젝트 이름', `프로젝트 ${state.projects.length + 1}`);
      if (!name || !name.trim()) return;
      const np = newProject(name.trim());
      state.projects.push(np);
      state.activeId = np.id;
      save(); renderAll();
      break;
    }
    case 'delete-project':
      if (state.projects.length === 1) return toast('마지막 프로젝트는 삭제할 수 없습니다', true);
      if (!confirm(`'${p.name}' 프로젝트와 모든 데이터를 삭제할까요?`)) return;
      state.projects = state.projects.filter((x) => x.id !== p.id);
      state.activeId = state.projects[0].id;
      save(); renderAll();
      break;
    case 'add-schedule':
      p.schedules.push({ id: uid(), name: `스케줄표 ${p.schedules.length + 1}`, rows: [] });
      save(); renderSchedules();
      document.querySelector('.sched:last-of-type .sched-name')?.select();
      break;
    case 'delete-schedule': {
      const s = p.schedules.find((x) => x.id === d.s);
      if (p.schedules.length === 1) return toast('스케줄표는 최소 1개가 필요합니다', true);
      if (!confirm(`'${s.name}' 스케줄표를 삭제할까요? (업무 ${s.rows.length}개 포함)`)) return;
      p.schedules = p.schedules.filter((x) => x.id !== d.s);
      save(); renderAll();
      break;
    }
    case 'quick-add-row':
    case 'add-row': {
      const s = d.s ? p.schedules.find((x) => x.id === d.s) : p.schedules[0];
      const r = newRow('', p.categories[0]?.id || '', user, today(), addDays(7));
      stamp(r);
      s.rows.push(r);
      pinned.add(r.id);
      view.hidden = view.hidden.filter((x) => x !== s.id);
      keepView();
      save(); renderCalendar(); renderSchedules(); renderSummary(); renderCategories();
      const input = document.querySelector(`tr[data-r="${r.id}"] [data-k="task"]`);
      input?.scrollIntoView({ block: 'center' });
      input?.focus();
      break;
    }
    case 'delete-row': {
      const s = p.schedules.find((x) => x.id === d.s);
      const r = s.rows.find((x) => x.id === d.r);
      if ((r.task || r.note) && !confirm(`'${r.task || '이 업무'}'를 삭제할까요?`)) return;
      s.rows = s.rows.filter((x) => x.id !== d.r);
      save(); renderCalendar(); renderSchedules(); renderSummary(); renderCategories();
      break;
    }
    case 'add-cat':
      p.categories.push({ id: uid(), name: '새 카테고리', status: '', todos: [] });
      save(); renderAll();
      document.querySelector('.cat-card:last-of-type .cat-name')?.select();
      break;
    case 'delete-cat': {
      const c = p.categories.find((x) => x.id === d.c);
      if (!confirm(`'${c.name}' 카테고리를 삭제할까요? 해당 업무는 '미분류'가 됩니다.`)) return;
      p.categories = p.categories.filter((x) => x.id !== d.c);
      save(); renderAll();
      break;
    }
    case 'add-todo': {
      const c = p.categories.find((x) => x.id === d.c);
      const o = { id: uid(), text: '', owner: user, done: false };
      c.todos.push(o);
      save(); renderCategories();
      document.querySelector(`[data-o="${o.id}"][data-k="text"]`)?.focus();
      break;
    }
    case 'delete-todo': {
      const c = p.categories.find((x) => x.id === d.c);
      c.todos = c.todos.filter((x) => x.id !== d.o);
      save(); renderCategories();
      break;
    }
    case 'delete-req': {
      const q = p.requests.find((x) => x.id === d.q);
      if (!confirm(`'${q.title}' 요청을 삭제할까요?`)) return;
      p.requests = p.requests.filter((x) => x.id !== d.q);
      save();
      renderRequests(); renderSummary();
      break;
    }
    case 'delete-member': {
      e.stopPropagation();
      // 업무·요청에 담당자로 남아 있으면 목록에 계속 보이므로 이 프로젝트 안의 그 이름도 함께 비움
      const used = allRows(p).filter((r) => r.owner === d.name).length
        + p.categories.reduce((b, c) => b + c.todos.filter((o) => o.owner === d.name).length, 0)
        + p.requests.filter((q) => q.from === d.name || q.to === d.name).length;
      const msg = used
        ? `'${d.name}'님을 이 프로젝트 팀원에서 제거할까요?\n담당자·요청자로 지정된 ${used}곳의 이름도 비워집니다. (업무 내용은 유지)`
        : `'${d.name}'님을 이 프로젝트 팀원에서 제거할까요?`;
      if (!confirm(msg)) return;
      p.members = p.members.filter((n) => n !== d.name);
      allRows(p).forEach((r) => { if (r.owner === d.name) r.owner = ''; });
      p.categories.forEach((c) => c.todos.forEach((o) => { if (o.owner === d.name) o.owner = ''; }));
      p.requests.forEach((q) => ['from', 'to'].forEach((k) => { if (q[k] === d.name) { q[k] = ''; stamp(q); } }));
      if (ui.reqPerson === d.name) ui.reqPerson = '';
      save(); renderAll();
      break;
    }
    case 'filter-person':
      ui.reqPerson = ui.reqPerson === d.name ? '' : d.name;
      renderRequests(); renderSummary();
      if (b.closest('#summary')) document.getElementById('requests').scrollIntoView();
      break;
    case 'scroll': {
      document.querySelectorAll('.chips .chip').forEach((c) => c.classList.toggle('active', c.dataset.target === d.target));
      if (d.target === 'top') window.scrollTo({ top: 0 });
      else document.getElementById(d.target).scrollIntoView();
      break;
    }
    case 'export': exportJSON(); break;
    case 'import': $('#importFile').click(); break;
    case 'xl-import': xl.target = d.s || ''; $('#xlFile').click(); break;
    case 'xl-close': $('#xlDialog').close(); break;
    case 'cal-move': {
      const months = p.schedules.flatMap((sc) => sc.rows).map(rowSpan).filter(Boolean);
      ui.cal[p.id] = shiftMonth(calMonth(p, months), +d.n);
      ui.calOpen.clear();
      renderCalendar();
      break;
    }
    case 'cal-today':
      ui.cal[p.id] = today().slice(0, 7);
      ui.calOpen.clear();
      renderCalendar();
      break;
    case 'cal-week':
      if (ui.calOpen.has(d.w)) ui.calOpen.delete(d.w);
      else ui.calOpen.add(d.w);
      renderCalendar();
      break;
    case 'cal-toggle':
      view.calHidden = !view.calHidden;
      keepView();
      renderCalendar();
      break;
    case 'cal-row': goToRow(d.s, d.r); break;
    case 'file-add': $('#attachFile').click(); break;
    case 'file-view': { const f = p.files.find((x) => x.id === d.f); if (f) viewFile(f); break; }
    case 'file-down': { const f = p.files.find((x) => x.id === d.f); if (f) downloadFile(f); break; }
    case 'file-open': { const f = p.files.find((x) => x.id === $('#fileDialog').dataset.f); if (f) downloadFile(f, true); break; }
    case 'file-dl-cur': { const f = p.files.find((x) => x.id === $('#fileDialog').dataset.f); if (f) downloadFile(f); break; }
    case 'file-close': $('#fileDialog').close(); break;
    case 'file-del': {
      const f = p.files.find((x) => x.id === d.f);
      if (!f || !confirm(`'${f.title || f.name}' 파일을 삭제할까요?\n구글 드라이브에서는 휴지통으로 이동합니다.`)) return;
      p.files = p.files.filter((x) => x.id !== d.f);
      save(); renderFiles();
      break;
    }
    case 'col-menu':
      if (!$('#colMenu').hidden && $('#colMenu').dataset.s === d.s && $('#colMenu').dataset.k === d.k) closeColMenu();
      else openColMenu(b);
      break;
    case 'col-sort': {
      const { s: sid, k } = $('#colMenu').dataset;
      tableView(sid).sort = +d.dir ? { k, dir: +d.dir } : null;
      pinned.clear();
      closeColMenu();
      applyView(sid, k);
      break;
    }
    case 'col-clear': {
      const { s: sid, k } = $('#colMenu').dataset;
      delete tableView(sid).ex[k];
      applyView(sid, k);
      break;
    }
    case 'view-reset':
      delete view.tables[d.s];
      pinned.clear();
      closeColMenu();
      keepView(); renderSchedules();
      break;
    case 'toggle-sched':
      view.hidden = view.hidden.includes(d.s) ? view.hidden.filter((x) => x !== d.s) : [...view.hidden, d.s];
      closeColMenu();
      keepView(); renderSchedules();
      break;
    case 'xl-apply': xlApply(); break;
    case 'sheet-open': openSheet(); break;
    case 'sheet-close': $('#sheetDialog').close(); break;
    case 'sheet-save': saveSheetForm(); break;
    case 'sheet-reload': load(false); break;
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    flush().then(() => !sync.error && toast('구글 시트에 저장되었습니다'));
  }
});

/* ---------------- 내보내기 / 가져오기 ---------------- */

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `project-board-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importFile(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const s = normalize(JSON.parse(reader.result));
      if (!s) throw new Error('형식이 올바르지 않습니다');
      if (!confirm('현재 데이터를 가져온 파일로 교체할까요?\n구글 시트의 내용도 이 파일 내용으로 바뀝니다.')) return;
      state = s;
      save(); renderAll();
      toast('가져오기 완료');
    } catch (err) {
      toast(`가져오기 실패: ${err.message}`, true);
    }
  };
  reader.readAsText(file);
}

/* ---------------- 자료 · 첨부 (이미지 / PDF) ----------------
 * 파일은 구글 드라이브 폴더에 올리고, 시트에는 제목·파일명·작은 미리보기만 저장.
 * 볼 때는 Apps Script를 거쳐 받아 오므로 드라이브 공유 설정이 필요 없음 */

const MAX_FILE = 20 * 1024 * 1024;
const uploads = []; // 올리는 중인 파일
const blobs = new Map(); // 드라이브ID → 받아 둔 파일 주소
const isPdf = (f) => f.mime === 'application/pdf';
const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

function renderFiles() {
  const p = project();
  const card = (f) => {
    const thumb = /^data:image\/(jpeg|png);base64,[\w+/=]+$/.test(f.thumb || '') ? `<img src="${f.thumb}" alt="">` : `<span class="file-ico">${isPdf(f) ? 'PDF' : 'IMG'}</span>`;
    return `<article class="file-card">
      <button class="file-thumb" data-act="file-view" data-f="${f.id}" title="크게 보기">${thumb}</button>
      <input class="cell file-title" data-t="file" data-f="${f.id}" data-k="title" value="${esc(f.title)}" placeholder="제목">
      <div class="file-meta">${esc(f.name)} · ${sizeText(Number(f.size) || 0)}<br>${esc(f.updatedBy) || '-'} · ${fmt(f.updatedAt)}</div>
      <div class="file-acts">
        <button class="btn-mini" data-act="file-view" data-f="${f.id}">보기</button>
        <button class="btn-mini" data-act="file-down" data-f="${f.id}">다운로드</button>
        <button class="icon-del" data-act="file-del" data-f="${f.id}" title="삭제">${ICON_DEL}</button>
      </div>
    </article>`;
  };
  const busy = uploads.map((u) => `<article class="file-card uploading"><div class="file-thumb"><span class="file-ico">…</span></div><div class="file-meta">${esc(u.name)}<br>올리는 중…</div></article>`).join('');
  $('#files').innerHTML = `
    <div class="section-title">
      <div><h2>자료 · 첨부</h2><p>이미지와 PDF를 올려 팀원과 함께 봅니다. 파일은 구글 드라이브에 저장되고 여기서 바로 볼 수 있습니다.</p></div>
      <div class="sched-actions"><button class="btn-dark" data-act="file-add">+ 파일 올리기</button></div>
    </div>
    <div class="card file-drop" data-drop="files">
      ${p.files.length || uploads.length ? `<div class="file-grid">${p.files.map(card).join('')}${busy}</div>` : ''}
      <p class="drop-hint">이미지나 PDF를 여기로 끌어다 놓거나 <b>+ 파일 올리기</b>를 누르세요 · 최대 20MB</p>
    </div>`;
}

const readBase64 = (file) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = () => fail(new Error('파일을 읽지 못했습니다'));
  r.readAsDataURL(file);
});

// 시트 칸(5만 자)에 들어가도록 작은 JPEG 미리보기 생성
async function makeThumb(file) {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = url; });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.75, 0.6, 0.45, 0.3]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length < 40000) return d;
    }
  } catch { /* 브라우저가 못 여는 형식(HEIC 등) */ }
  return '';
}

async function uploadFiles(list) {
  const p = project();
  for (const file of list) {
    if (!/^image\/|^application\/pdf$/.test(file.type)) { toast(`${file.name}: 이미지나 PDF만 올릴 수 있습니다`, true); continue; }
    if (file.size > MAX_FILE) { toast(`${file.name}: 20MB 이하만 올릴 수 있습니다`, true); continue; }
    const tmp = { id: uid(), name: file.name };
    uploads.push(tmp);
    renderFiles();
    try {
      const [data, thumb] = await Promise.all([readBase64(file), file.type.startsWith('image/') ? makeThumb(file) : '']);
      const res = await fetch(sheetUrl, { method: 'POST', body: JSON.stringify({ upload: { name: file.name, mime: file.type, data } }) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || '알 수 없는 오류');
      if (!j.fileId) throw new Error('구글 시트 스크립트를 새 버전으로 배포해야 합니다');
      const f = { id: tmp.id, title: file.name.replace(/\.[^.]+$/, ''), name: file.name, mime: file.type, fileId: j.fileId, size: String(file.size), thumb };
      stamp(f);
      p.files.push(f);
      save();
      toast(`${file.name} 을(를) 올렸습니다`);
    } catch (err) {
      toast(`${file.name} 올리기 실패: ${err.message}`, true);
    } finally {
      uploads.splice(uploads.indexOf(tmp), 1);
      renderFiles();
    }
  }
}

async function fileUrl(f) {
  if (blobs.has(f.fileId)) return blobs.get(f.fileId);
  const res = await fetch(`${sheetUrl}?file=${encodeURIComponent(f.fileId)}`);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || '알 수 없는 오류');
  const bytes = Uint8Array.from(atob(j.data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mime || j.mime }));
  blobs.set(f.fileId, url);
  return url;
}

async function viewFile(f) {
  const dlg = $('#fileDialog');
  dlg.dataset.f = f.id;
  $('#fileTitle').textContent = f.title || f.name;
  $('#fileBody').innerHTML = '<p class="hint">불러오는 중…</p>';
  dlg.showModal();
  try {
    const url = await fileUrl(f);
    if (dlg.dataset.f !== f.id) return;
    $('#fileBody').innerHTML = isPdf(f) ? `<iframe src="${url}" title="${esc(f.name)}"></iframe>` : `<img src="${url}" alt="${esc(f.title)}">`;
  } catch (err) {
    $('#fileBody').innerHTML = `<p class="hint">파일을 불러오지 못했습니다: ${esc(err.message)}</p>`;
  }
}

async function downloadFile(f, open) {
  try {
    const url = await fileUrl(f);
    if (open) return window.open(url, '_blank');
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
  } catch (err) {
    toast(`파일을 받지 못했습니다: ${err.message}`, true);
  }
}

document.addEventListener('dragover', (e) => {
  const zone = e.target.closest?.('[data-drop]');
  if (!zone) return;
  e.preventDefault();
  zone.classList.add('over');
});
document.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('over'));
document.addEventListener('drop', (e) => {
  const zone = e.target.closest?.('[data-drop]');
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove('over');
  uploadFiles([...e.dataTransfer.files]);
});

/* ---------------- 엑셀 스케줄표 가져오기 ----------------
 * 제목 줄과 열을 자동으로 찾아 대시보드 스케줄표 칸(업무명·카테고리·담당자·기간·상태·진행률·메모)에 맞춤.
 * 등록하면 일반 업무 추가와 같이 구글 시트 '스케줄' 탭에 저장됨 */

const XL_FIELDS = [
  ['task', '업무명', ['업무명', '업무', '작업명', '작업', '할일', '항목', '세부업무', '세부내용', '내용', '과제', 'task']],
  ['cat', '카테고리', ['카테고리', '구분', '분류', '대분류', '파트', '부문', 'category']],
  ['owner', '담당자', ['담당자', '담당', '책임자', '진행자', '작업자', 'owner', 'pic']],
  ['start', '시작일', ['시작일', '시작', '착수일', '착수', 'start']],
  ['end', '종료일', ['종료일', '종료', '마감일', '마감', '완료일', '완료예정일', '기한', '납기', 'end', 'due']],
  ['period', '기간 (예: 11/1~11/5)', ['기간', '일정', '날짜', '일자', 'period', 'date']],
  ['status', '상태', ['상태', '진행상태', '진행상황', 'status']],
  ['progress', '진행률', ['진행률', '진척률', '진척도', '진척', '%', 'progress']],
  ['note', '메모', ['메모', '비고', '진행사항', '참고', '코멘트', '특이사항', 'note', 'memo']],
];
const XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const xl = { wb: null, name: '', sheet: '', rows: [], head: 0, map: {}, target: '' };
const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const ymd = (y, m, d) => (y && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '');

function loadXLSX() {
  if (window.XLSX) return Promise.resolve();
  loadXLSX.p ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = XLSX_SRC;
    s.onload = ok;
    s.onerror = () => { loadXLSX.p = null; fail(); };
    document.head.appendChild(s);
  });
  return loadXLSX.p;
}

async function xlFile(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    await loadXLSX();
  } catch {
    return toast('엑셀 읽기 도구를 불러오지 못했습니다 (인터넷 연결 확인)', true);
  }
  try {
    if (/\.csv$/i.test(file.name)) {
      // 한글 CSV는 UTF-8 또는 EUC-KR(엑셀 기본 저장)
      const buf = await file.arrayBuffer();
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('euc-kr').decode(buf); }
      xl.wb = XLSX.read(text, { type: 'string', cellDates: true });
    } else {
      xl.wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    }
  } catch (err) {
    return toast(`엑셀 파일을 읽지 못했습니다: ${err.message}`, true);
  }
  xl.name = file.name.replace(/\.[^.]+$/, '');
  xlSheet(xl.wb.SheetNames[0]);
  $('#xlDialog').showModal();
}

function xlSheet(name) {
  xl.sheet = name;
  const ws = xl.wb.Sheets[name];
  // 병합된 셀은 모든 칸에 같은 값이 있는 것으로 봄 (구분·담당자를 병합해 둔 표 대응)
  (ws['!merges'] || []).forEach((m) => {
    const top = ws[XLSX.utils.encode_cell(m.s)];
    if (!top) return;
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) ws[XLSX.utils.encode_cell({ r, c })] = { ...top };
    }
  });
  ws['!merges'] = [];
  xl.rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  // 키워드가 가장 많이 들어 있는 줄을 제목 줄로 (병합된 큰 제목은 같은 값이라 한 번만 셈)
  let best = -1;
  xl.head = 0;
  xl.rows.slice(0, 20).forEach((r, i) => {
    const score = new Set(r.map(norm).filter((v) => v.length <= 12 && XL_FIELDS.some(([, , ks]) => ks.some((k) => v.includes(k))))).size;
    if (score > best) { best = score; xl.head = i; }
  });
  xlGuess();
  xlRender();
}

// 제목 이름으로 열 짝짓기: 정확히 같은 이름 먼저, 그다음 포함하는 이름
function xlGuess() {
  const heads = (xl.rows[xl.head] || []).map(norm);
  const used = new Set();
  xl.map = {};
  [(h, k) => h === k, (h, k) => h.includes(k)].forEach((match) => {
    XL_FIELDS.forEach(([f, , ks]) => {
      if (xl.map[f] !== undefined) return;
      for (const k of ks) {
        const i = heads.findIndex((h, j) => h && !used.has(j) && match(h, k));
        if (i >= 0) { xl.map[f] = i; used.add(i); return; }
      }
    });
  });
  if (xl.map.start !== undefined && xl.map.end !== undefined) delete xl.map.period;
}

function xlText(v) {
  if (v instanceof Date) return xlDate(v);
  return String(v ?? '').trim();
}

function xlDate(v, year = new Date().getFullYear()) {
  if (v instanceof Date && !isNaN(v)) {
    const d = new Date(v.getTime() + 3600000); // 시간대 보정으로 자정 직전이 되는 경우 대비
    return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (typeof v === 'number') return v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * DAY)).toISOString().slice(0, 10) : '';
  const s = String(v ?? '').trim();
  let m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/);
  if (m) return ymd(2000 + +m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return ymd(year, +m[1], +m[2]);
  return '';
}

// '11/1~11/5', '11.1 ~ 5', '2026-11-01 - 2026-11-05' 같은 기간
function xlPeriod(v, year) {
  if (v instanceof Date || typeof v === 'number') { const d = xlDate(v, year); return [d, d]; }
  const [a, b] = String(v ?? '').split(/\s*(?:~|∼|〜|–|—|→|부터| - )\s*/);
  const start = xlDate(a, year);
  if (!start) return ['', ''];
  let end = '';
  const dayOnly = (b || '').match(/^(\d{1,2})\s*일?$/);
  if (dayOnly) end = `${start.slice(0, 8)}${String(+dayOnly[1]).padStart(2, '0')}`;
  else end = xlDate(b, +start.slice(0, 4));
  if (end && end < start && !/\d{4}/.test(b)) end = `${+end.slice(0, 4) + 1}${end.slice(4)}`; // 12/28~1/5
  return [start, end || start];
}

function xlProgress(v) {
  if (v === '' || v == null) return null;
  let n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[%\s]/g, ''));
  if (isNaN(n)) return null;
  if (typeof v === 'number' && n > 0 && n <= 1) n *= 100; // 100% 서식은 1로 읽힘
  return Math.max(0, Math.min(100, Math.round(n / 5) * 5));
}

function xlStatus(v, prog) {
  const s = norm(v);
  if (/완료|끝|done|complete/.test(s)) return '완료';
  if (/보류|중단|홀드|hold/.test(s)) return '보류';
  if (/진행|작업중|ing|progress/.test(s)) return '진행중';
  if (/대기|예정|미착수|미진행|todo/.test(s)) return '대기';
  if (prog === 100) return '완료';
  return prog > 0 ? '진행중' : '대기';
}

function xlConvert() {
  const year = new Date().getFullYear();
  const col = (r, f) => (xl.map[f] !== undefined ? r[xl.map[f]] : '');
  return xl.rows.slice(xl.head + 1).map((r) => {
    const task = xlText(col(r, 'task'));
    if (!task) return null;
    let start = xlDate(col(r, 'start'), year);
    let end = xlDate(col(r, 'end'), year);
    if (xl.map.period !== undefined && (!start || !end)) {
      const [a, b] = xlPeriod(col(r, 'period'), year);
      start ||= a;
      end ||= b;
    }
    const prog = xlProgress(col(r, 'progress'));
    const status = xlStatus(col(r, 'status'), prog);
    return {
      task, catName: xlText(col(r, 'cat')), owner: xlText(col(r, 'owner')), start, end: end || start, status,
      progress: status === '완료' ? 100 : prog ?? (status === '진행중' ? 10 : 0), note: xlText(col(r, 'note')),
    };
  }).filter(Boolean);
}

function xlRender() {
  const p = project();
  const width = Math.max(0, ...xl.rows.slice(0, 50).map((r) => r.length));
  const heads = xl.rows[xl.head] || [];
  const colOpts = (f) => `<option value="">— 없음 —</option>` + Array.from({ length: width }, (_, i) =>
    `<option value="${i}" ${xl.map[f] === i ? 'selected' : ''}>${XLSX.utils.encode_col(i)}열 · ${esc(xlText(heads[i])) || '(제목 없음)'}</option>`).join('');
  const items = xlConvert();
  const cats = new Set(p.categories.map((c) => norm(c.name)));
  const newCats = [...new Set(items.map((it) => it.catName).filter((n) => n && !cats.has(norm(n))))];
  const target = p.schedules.some((s) => s.id === xl.target) ? xl.target : '';
  $('#xlBody').innerHTML = `
    <div class="xl-grid">
      ${xl.wb.SheetNames.length > 1 ? `<label>엑셀 시트<select data-xl="sheet">${xl.wb.SheetNames.map((n) => `<option ${n === xl.sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
      <label>제목 줄<select data-xl="head">${xl.rows.slice(0, 20).map((r, i) => `<option value="${i}" ${i === xl.head ? 'selected' : ''}>${i + 1}번째 줄 · ${esc(r.map(xlText).filter(Boolean).slice(0, 4).join(', ')).slice(0, 50)}</option>`).join('')}</select></label>
      <label>등록할 스케줄표<select data-xl="target">
        <option value="">새 스케줄표 만들기 (${esc(xl.name)})</option>
        ${p.schedules.map((s) => `<option value="${s.id}" ${s.id === target ? 'selected' : ''}>${esc(s.name)}에 추가 (현재 ${s.rows.length}개)</option>`).join('')}
      </select></label>
    </div>
    <h4 class="xl-h">열 맞추기 <small>자동으로 맞춘 결과입니다. 다르면 바꿔 주세요.</small></h4>
    <div class="xl-grid">${XL_FIELDS.map(([f, label]) => `<label>${label}${f === 'task' ? ' *' : ''}<select data-xl="map" data-f="${f}">${colOpts(f)}</select></label>`).join('')}</div>
    <h4 class="xl-h">미리보기 <small>업무 ${items.length}개${newCats.length ? ` · 새 카테고리: ${esc(newCats.join(', '))}` : ''}</small></h4>
    <div class="table-wrap xl-preview"><table>
      <thead><tr><th>업무명</th><th>카테고리</th><th>담당자</th><th>시작일</th><th>종료일</th><th>상태</th><th>진행률</th><th>메모</th></tr></thead>
      <tbody>${items.slice(0, 8).map((it) => `<tr><td>${esc(it.task)}</td><td>${esc(it.catName) || '<span class="muted">미분류</span>'}</td><td>${esc(it.owner)}</td><td>${it.start || '-'}</td><td>${it.end || '-'}</td><td>${it.status}</td><td>${it.progress}%</td><td>${esc(it.note)}</td></tr>`).join('')
        || `<tr><td colspan="8" class="muted">등록할 업무가 없습니다. 제목 줄과 업무명 열을 확인하세요.</td></tr>`}</tbody>
    </table></div>
    ${items.length > 8 ? `<p class="hint">외 ${items.length - 8}개</p>` : ''}`;
  $('#xlApplyBtn').textContent = `${items.length}개 업무 등록`;
  $('#xlApplyBtn').disabled = !items.length;
}

function xlChange(el) {
  const k = el.dataset.xl;
  if (k === 'sheet') return xlSheet(el.value);
  if (k === 'head') { xl.head = +el.value; xlGuess(); }
  if (k === 'target') xl.target = el.value;
  if (k === 'map') {
    const f = el.dataset.f;
    if (el.value === '') delete xl.map[f];
    else {
      // 한 열은 한 칸에만
      Object.keys(xl.map).forEach((g) => { if (xl.map[g] === +el.value) delete xl.map[g]; });
      xl.map[f] = +el.value;
    }
  }
  xlRender();
}

function xlApply() {
  const items = xlConvert();
  if (!items.length) return;
  const p = project();
  let s = p.schedules.find((x) => x.id === xl.target);
  if (!s) {
    s = { id: uid(), name: xl.name || `스케줄표 ${p.schedules.length + 1}`, rows: [] };
    p.schedules.push(s);
  }
  items.forEach((it) => {
    let cat = '';
    if (it.catName) {
      let c = p.categories.find((x) => norm(x.name) === norm(it.catName));
      if (!c) {
        c = { id: uid(), name: it.catName, status: '', todos: [] };
        p.categories.push(c);
      }
      cat = c.id;
    }
    const r = newRow(it.task, cat, it.owner, it.start, it.end, it.status, it.progress);
    r.note = it.note;
    stamp(r);
    s.rows.push(r);
  });
  save();
  renderAll();
  $('#xlDialog').close();
  document.querySelector(`.sched[data-s="${s.id}"]`)?.scrollIntoView({ block: 'start' });
  toast(`${items.length}개 업무를 '${s.name}'에 등록했습니다`);
}

/* ---------------- 구글 시트 동기화 ----------------
 * 데이터 하나(업무 한 줄, 할 일 하나, 요청 하나 …)가 시트 한 줄.
 * 마지막으로 시트에서 받은 상태(base)와 지금 상태를 비교해 바뀐 칸만 보내므로
 * 여러 명이 동시에 고쳐도 서로 덮어쓰지 않고, 시트에서 직접 고친 내용도 반영됨 */

const KINDS = {
  project: ['name'],
  member: ['project', 'projectName', 'name'],
  category: ['project', 'projectName', 'name', 'status'],
  todo: ['project', 'projectName', 'category', 'categoryName', 'text', 'owner', 'done'],
  schedule: ['project', 'projectName', 'name'],
  row: ['project', 'projectName', 'schedule', 'scheduleName', 'task', 'cat', 'catName', 'owner', 'start', 'end', 'status', 'progress', 'note', 'updatedBy', 'updatedAt'],
  request: ['project', 'projectName', 'type', 'from', 'to', 'title', 'body', 'due', 'status', 'answer', 'createdAt', 'updatedBy', 'updatedAt'],
  file: ['project', 'projectName', 'title', 'name', 'mime', 'fileId', 'size', 'updatedBy', 'updatedAt', 'thumb'],
};
// 부모 종류 (필드 이름도 같음)
const PARENT = { member: 'project', category: 'project', schedule: 'project', request: 'project', file: 'project', todo: 'category', row: 'schedule' };
const FILE_FIELDS = ['title', 'name', 'mime', 'fileId', 'size', 'updatedBy', 'updatedAt', 'thumb'];
const REQ_FIELDS = ['type', 'from', 'to', 'title', 'body', 'due', 'status', 'answer', 'createdAt', 'updatedBy', 'updatedAt'];
const ROW_FIELDS = ['task', 'cat', 'owner', 'start', 'end', 'status', 'note', 'updatedBy', 'updatedAt'];

const sync = { base: new Map(), trust: false, loaded: false, busy: false, error: '', at: '', timer: null, queue: Promise.resolve(), stale: false };
const keyOf = (kind, id) => `${kind}:${id}`;
const pick = (f, keys) => Object.fromEntries(keys.map((k) => [k, f[k]]));

// 비교할 수 있도록 모든 값을 문자열로 맞춤
function canon(kind, o) {
  const f = {};
  KINDS[kind].forEach((k) => {
    const v = o[k];
    if (k === 'done') f[k] = v === true || String(v).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
    else if (k === 'progress') f[k] = String(Number(v) || 0);
    else f[k] = v == null ? '' : String(v);
  });
  return f;
}

function flatten(s) {
  const m = new Map();
  const put = (kind, id, o) => m.set(keyOf(kind, id), { kind, id, f: canon(kind, o) });
  (s?.projects || []).forEach((p) => {
    const P = { project: p.id, projectName: p.name };
    put('project', p.id, { name: p.name });
    p.members.forEach((n) => put('member', `${p.id}|${n}`, { ...P, name: n }));
    p.categories.forEach((c) => {
      put('category', c.id, { ...P, name: c.name, status: c.status });
      c.todos.forEach((o) => put('todo', o.id, { ...o, ...P, category: c.id, categoryName: c.name }));
    });
    p.schedules.forEach((sc) => {
      put('schedule', sc.id, { ...P, name: sc.name });
      sc.rows.forEach((r) => put('row', r.id, { ...r, ...P, schedule: sc.id, scheduleName: sc.name, catName: p.categories.find((c) => c.id === r.cat)?.name || '' }));
    });
    p.requests.forEach((q) => put('request', q.id, { ...q, ...P }));
    p.files.forEach((f) => put('file', f.id, { ...f, ...P }));
  });
  return m;
}

function build(flat) {
  const of = (kind) => [...flat.values()].filter((x) => x.kind === kind);
  const projects = of('project').map(({ id, f }) => ({ id, name: f.name, members: [], categories: [], schedules: [], requests: [], files: [] }));
  const P = new Map(projects.map((p) => [p.id, p]));
  of('member').forEach(({ f }) => P.get(f.project)?.members.push(f.name));
  of('category').forEach(({ id, f }) => P.get(f.project)?.categories.push({ id, name: f.name, status: f.status, todos: [] }));
  const C = new Map(projects.flatMap((p) => p.categories.map((c) => [c.id, c])));
  of('todo').forEach(({ id, f }) => C.get(f.category)?.todos.push({ id, text: f.text, owner: f.owner, done: f.done === 'TRUE' }));
  of('schedule').forEach(({ id, f }) => P.get(f.project)?.schedules.push({ id, name: f.name, rows: [] }));
  const S = new Map(projects.flatMap((p) => p.schedules.map((s) => [s.id, s])));
  of('row').forEach(({ id, f }) => S.get(f.schedule)?.rows.push({ id, ...pick(f, ROW_FIELDS), progress: Number(f.progress) || 0 }));
  of('request').forEach(({ id, f }) => P.get(f.project)?.requests.push({ id, ...pick(f, REQ_FIELDS) }));
  of('file').forEach(({ id, f }) => P.get(f.project)?.files.push({ id, ...pick(f, FILE_FIELDS) }));
  projects.forEach((p) => { if (!p.schedules.length) p.schedules.push({ id: uid(), name: '메인 스케줄', rows: [] }); });
  return { version: 3, projects, activeId: '' };
}

// 부모가 없는 줄(시트에서 직접 잘못 넣은 줄 등)은 지우지 않고 그대로 둠
function orphan(r, flat) {
  const pk = PARENT[r.kind];
  if (!pk) return false;
  const parent = flat.get(keyOf(pk, r.f[pk]));
  return !parent || orphan(parent, flat);
}

function diff(base, cur) {
  const ops = [];
  cur.forEach((r, key) => {
    const b = base.get(key);
    if (!b) return ops.push({ op: 'create', kind: r.kind, item: { id: r.id, ...r.f } });
    const fields = {};
    Object.keys(r.f).forEach((k) => { if (r.f[k] !== b.f[k]) fields[k] = r.f[k]; });
    if (Object.keys(fields).length) ops.push({ op: 'patch', kind: r.kind, id: r.id, fields });
  });
  base.forEach((b, key) => { if (!cur.has(key) && !orphan(b, base)) ops.push({ op: 'delete', kind: b.kind, id: b.id }); });
  return ops;
}

const pendingOps = () => (state && sync.loaded && sync.trust ? diff(sync.base, flatten(state)) : []);

function remoteFlat(data) {
  const m = new Map();
  Object.keys(KINDS).forEach((kind) => (data[kind] || []).forEach((o) => {
    m.set(keyOf(kind, o.id), { kind, id: String(o.id), f: canon(kind, o) });
  }));
  return m;
}

function keepLocal() {
  if (!sync.trust) return;
  store.set(LS_STATE, JSON.stringify(state));
  store.set(LS_BASE, JSON.stringify([...sync.base.values()]));
}

// 시트 내용 위에 아직 보내지 않은 내 변경을 얹어서 화면 상태를 만듦
function applyRemote(data, ref) {
  const remote = remoteFlat(data);
  const empty = !(data.project || []).length;
  const local = sync.trust && state ? flatten(state) : null;
  const ops = local ? diff(empty ? remote : ref || sync.base, local) : [];
  const merged = new Map(remote);
  ops.forEach((op) => {
    const key = keyOf(op.kind, op.id || op.item.id);
    if (op.op === 'create') merged.set(key, { kind: op.kind, id: op.item.id, f: canon(op.kind, op.item) });
    else if (op.op === 'delete') merged.delete(key);
    else if (merged.has(key)) merged.set(key, { ...merged.get(key), f: { ...merged.get(key).f, ...op.fields } });
  });
  const active = state?.activeId || store.get(LS_ACTIVE);
  sync.base = remote;
  sync.trust = true;
  sync.loaded = true;
  sync.at = now();
  state = build(merged);
  state.activeId = state.projects.some((p) => p.id === active) ? active : state.projects[0]?.id;
  keepLocal();
  if (editing() || pointerDown) sync.stale = true; // 입력 중에는 화면을 다시 그리지 않음
  else renderAll();
}

async function call(ops) {
  // Content-Type을 지정하지 않아야(text/plain) 브라우저 사전 요청 없이 Apps Script로 전송됨
  const res = await fetch(ops ? sheetUrl : `${sheetUrl}?_=${Date.now()}`, ops ? { method: 'POST', body: JSON.stringify({ ops }) } : { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status}`);
  let j;
  try { j = await res.json(); } catch { throw new Error('응답 형식 오류 (웹 앱 액세스 권한을 "모든 사용자"로 배포했는지 확인)'); }
  if (!j.ok) throw new Error(j.error || '알 수 없는 오류');
  if (!j.data) throw new Error('구글 시트 스크립트가 예전 버전입니다. google-sheet.gs로 다시 배포하세요');
  return j;
}

function enqueue(task, silent = true) {
  sync.queue = sync.queue.then(async () => {
    sync.busy = true;
    setSync();
    try {
      await task();
      sync.error = '';
    } catch (err) {
      if (!silent || !sync.error) toast(`구글 시트 연결 실패: ${err.message}`, true);
      sync.error = err.message;
    } finally {
      sync.busy = false;
      setSync();
    }
  });
  return sync.queue;
}

function flush() {
  clearTimeout(sync.timer);
  sync.timer = null;
  return enqueue(async () => {
    if (!sync.loaded || !sync.trust) return; // 처음 불러오기 전에는 보내지 않음
    const cur = flatten(state);
    const ops = diff(sync.base, cur);
    if (!ops.length) return;
    try {
      applyRemote((await call(ops)).data, cur);
    } catch (err) {
      sync.timer = setTimeout(flush, 15000); // 잠시 후 다시 시도
      throw err;
    }
  });
}

function load(silent) {
  return enqueue(async () => {
    const { data } = await call();
    if (!(data.project || []).length && (!state || !sync.trust)) {
      // 시트가 비어 있으면 지금(또는 예전) 데이터로 채움
      state = state || (await seed());
      sync.trust = true;
    }
    applyRemote(data);
    if (!silent) toast('구글 시트에서 최신 데이터를 불러왔습니다');
  }, silent).then(() => { if (pendingOps().length && !sync.timer) flush(); });
}

// 예전 버전 데이터(이 브라우저 또는 저장소의 data.json) 중 최신 것
async function seed() {
  let s = null;
  try { s = normalize(JSON.parse(store.get(LS_LEGACY) || 'null')); } catch { /* 없음 */ }
  try {
    const res = await fetch(`data.json?_=${Date.now()}`, { cache: 'no-store' });
    const remote = res.ok ? normalize(await res.json()) : null;
    if (remote && (!s || (remote.updatedAt || '') > (s.updatedAt || ''))) s = remote;
  } catch { /* 로컬 파일로 열었을 때 */ }
  return s || sampleState();
}

function openSheet() {
  $('#sheet-url').value = sheetUrl;
  $('#sheet-status').textContent = sync.error ? `오류: ${sync.error}` : sync.at ? `마지막 동기화: ${fmt(sync.at)}` : '아직 연결되지 않음';
  $('#sheetDialog').showModal();
}

function saveSheetForm() {
  const url = $('#sheet-url').value.trim() || DEFAULT_SHEET_URL;
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return toast('주소는 https://script.google.com/…/exec 형식이어야 합니다', true);
  $('#sheetDialog').close();
  if (url === sheetUrl) return;
  sheetUrl = url;
  store.set(LS_SHEET, url === DEFAULT_SHEET_URL ? '' : url);
  // 새 시트에 데이터가 있으면 그걸 쓰고, 비어 있으면 지금 데이터로 채움
  Object.assign(sync, { base: new Map(), trust: false, loaded: false, error: '' });
  load(false);
}

function editing() {
  const a = document.activeElement;
  return !!a?.closest?.('.app') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !['checkbox', 'range'].includes(a.type);
}

let pointerDown = false;
function catchUp() {
  if (sync.stale && !editing() && !pointerDown) {
    sync.stale = false;
    renderAll();
  }
}
document.addEventListener('pointerdown', () => (pointerDown = true), true);
document.addEventListener('pointerup', () => setTimeout(() => { pointerDown = false; catchUp(); }, 0), true);
document.addEventListener('focusout', () => setTimeout(catchUp, 0));

setInterval(() => { if (!document.hidden && !sync.busy) load(true); }, 20000);
setInterval(catchUp, 2000); // 포커스 이벤트를 놓친 경우 대비
window.addEventListener('focus', () => { if (!sync.busy) load(true); });
// 창을 닫을 때 아직 못 보낸 변경이 있으면 마지막으로 전송 (실패해도 다음에 열 때 다시 보냄)
window.addEventListener('pagehide', () => {
  const ops = pendingOps();
  if (ops.length) navigator.sendBeacon?.(sheetUrl, new Blob([JSON.stringify({ ops })], { type: 'text/plain' }));
});

/* ---------------- 시작 ---------------- */

async function init() {
  try {
    const s = normalize(JSON.parse(store.get(LS_STATE) || 'null'));
    const b = JSON.parse(store.get(LS_BASE) || 'null');
    if (s && Array.isArray(b)) {
      state = s;
      sync.base = new Map(b.map((r) => [keyOf(r.kind, r.id), r]));
      sync.trust = true;
    }
  } catch { state = null; }
  if (state) {
    const active = store.get(LS_ACTIVE);
    if (state.projects.some((p) => p.id === active)) state.activeId = active;
    renderAll(); // 시트를 불러오는 동안 지난번 내용을 먼저 보여줌
  }
  await load(true);
  if (!state) {
    // 시트에 연결하지 못함: 예전 데이터를 보여주되 시트로 보내지는 않음
    state = await seed();
    renderAll();
  }
}

init();

