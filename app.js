/* Project Board — 로컬 저장(localStorage) + GitHub 저장소 동기화 */

const LS_STATE = 'pb_state_v1';
const LS_USER = 'pb_user';
const LS_GH = 'pb_github';
const LS_DIRTY = 'pb_dirty';

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
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
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
let gh = Object.assign(
  { owner: '', repo: '', branch: 'main', path: 'data.json', token: '', auto: false, sha: '', syncedAt: '' },
  JSON.parse(store.get(LS_GH) || '{}')
);
let dirty = store.get(LS_DIRTY) === '1';
let syncing = false;
let autoTimer = null;
const ui = { reqPerson: '' };

function newRow(task, cat, owner, start, end, status = '대기', progress = 0) {
  return { id: uid(), task, cat, owner, start, end, status, progress, note: '', updatedBy: '', updatedAt: now() };
}

function newProject(name) {
  return {
    id: uid(),
    name,
    categories: ['교육', '영상', '디자인', '마케팅'].map((n) => ({ id: uid(), name: n, status: '', todos: [] })),
    schedules: [{ id: uid(), name: '메인 스케줄', rows: [] }],
    requests: [],
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
  return { version: 1, members: ['김하나', '이두리', '박세나', '최네모'], activeId: p.id, projects: [p], updatedAt: now(), updatedBy: '' };
}

function normalize(s) {
  if (!s || !Array.isArray(s.projects) || !s.projects.length) return null;
  s.members = Array.isArray(s.members) ? s.members : [];
  s.projects.forEach((p) => {
    p.categories = p.categories || [];
    p.schedules = p.schedules?.length ? p.schedules : [{ id: uid(), name: '메인 스케줄', rows: [] }];
    p.schedules.forEach((sc) => (sc.rows = sc.rows || []));
    p.categories.forEach((c) => (c.todos = c.todos || []));
    p.requests = p.requests || [];
  });
  if (!s.projects.some((p) => p.id === s.activeId)) s.activeId = s.projects[0].id;
  return s;
}

const project = () => state.projects.find((p) => p.id === state.activeId) || state.projects[0];
const allRows = (p) => p.schedules.flatMap((s) => s.rows);
const catColor = (p, catId) => {
  const i = p.categories.findIndex((c) => c.id === catId);
  return i < 0 ? '#c4c9cf' : CAT_COLORS[i % CAT_COLORS.length];
};
const people = (p) => [...new Set([
  ...state.members,
  ...allRows(p).map((r) => r.owner),
  ...p.requests.flatMap((q) => [q.from, q.to]),
].map((n) => (n || '').trim()).filter(Boolean))];

function stamp(o) {
  o.updatedBy = user || '익명';
  o.updatedAt = now();
}

function save() {
  state.updatedAt = now();
  state.updatedBy = user || '익명';
  store.set(LS_STATE, JSON.stringify(state));
  setDirty(true);
  renderFoot();
  if (gh.auto && gh.token && ghReady()) {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => ghPush(true), 4000);
  }
}

function setDirty(v) {
  dirty = v;
  store.set(LS_DIRTY, v ? '1' : '0');
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
  renderSchedules();
  renderCategories();
  renderRequests();
  renderMemberList();
  renderFoot();
  setSync();
}

function refreshExcept(section) {
  if (section !== 'summary') renderSummary();
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
    const removable = state.members.includes(n);
    return `<li class="${ui.reqPerson === n ? 'on' : ''}" data-act="filter-person" data-name="${esc(n)}" title="클릭하면 이 사람의 업무 요청만 봅니다">
      <span class="ava" style="background:${hashColor(n, AVA_COLORS)}">${esc(n[0])}</span>
      <span class="nm">${esc(n)}</span>
      <span class="st">업무 ${tasks} · 요청 ${reqs}</span>
      ${removable ? `<button class="icon-del" data-act="delete-member" data-name="${esc(n)}" title="팀원 목록에서 제거">${ICON_DEL}</button>` : ''}
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
      <div class="sec-head"><h3>팀원</h3><span class="pill-dark">${people(p).length}명</span></div>
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
    <td><button class="icon-del" data-act="delete-row" data-s="${s.id}" data-r="${r.id}" title="행 삭제">${ICON_DEL}</button></td>
  </tr>`;
}

function rangeLabel(rg) {
  return rg ? `${shortDate(new Date(rg.a).toISOString().slice(0, 10))} ~ ${shortDate(new Date(rg.b - DAY).toISOString().slice(0, 10))}` : '';
}

function renderSchedules() {
  const p = project();
  $('#schedules').innerHTML = `
    <div class="section-title">
      <div><h2>스케줄표</h2><p>업무명·담당자·기간·상태를 직접 입력하세요. 모든 변경은 자동 저장됩니다.</p></div>
      <button class="btn-dark" data-act="add-schedule">+ 스케줄표 추가</button>
    </div>
    ${p.schedules.map((s) => {
      const rg = rangeOf(s);
      return `<div class="card sched" data-s="${s.id}">
        <div class="sec-head">
          <div><p class="eyebrow">Schedule · ${s.rows.length}개 업무</p>
            <input class="sched-name" data-t="sched" data-s="${s.id}" data-k="name" value="${esc(s.name)}" placeholder="스케줄표 이름"></div>
          <div class="sched-actions">
            <button class="btn-dark" data-act="add-row" data-s="${s.id}">+ 업무 추가</button>
            <button class="round-btn danger" data-act="delete-schedule" data-s="${s.id}" title="스케줄표 삭제">${ICON_TRASH}</button>
          </div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th style="width:20%">업무명</th><th>카테고리</th><th>담당자</th><th>시작일</th><th>종료일</th><th>상태</th><th>진행률</th>
            <th>타임라인 <span class="gantt-range">${rangeLabel(rg)}</span></th><th style="width:16%">메모</th><th>최종 수정</th><th></th>
          </tr></thead>
          <tbody>${s.rows.map((r) => rowHTML(p, s, r, rg)).join('')}</tbody>
        </table></div>
        ${s.rows.length ? '' : '<p class="empty">아직 업무가 없습니다. “+ 업무 추가”를 눌러 시작하세요.</p>'}
      </div>`;
    }).join('')}`;
}

// 표 전체를 다시 그리지 않고 타임라인/수정자만 갱신 (입력 포커스 유지)
function updateScheduleInPlace(sid, rid) {
  const p = project();
  const s = p.schedules.find((x) => x.id === sid);
  const card = document.querySelector(`.sched[data-s="${sid}"]`);
  if (!s || !card) return;
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
  const list = p.requests.filter((q) => !ui.reqPerson || q.to === ui.reqPerson || q.from === ui.reqPerson);
  const names = people(p);
  $('#requests').innerHTML = `
    <div class="section-title">
      <div><h2>업무 요청 · 질문</h2><p>팀원 개개인에게 요청하거나 질문하고, 답변과 처리 상태를 기록합니다.</p></div>
    </div>
    <div class="card">
      <div class="sec-head">
        <div class="person-chips">
          <button class="chip ${!ui.reqPerson ? 'active' : ''}" data-act="filter-person" data-name="">전체 ${p.requests.length}</button>
          ${names.map((n) => {
            const cnt = p.requests.filter((q) => q.to === n && q.status !== '완료').length;
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
  $('#foot').textContent = `마지막 수정: ${state.updatedBy || '-'} · ${fmt(state.updatedAt)}${gh.syncedAt ? ` · GitHub 동기화: ${fmt(gh.syncedAt)}` : ''}`;
}

function setSync(mode) {
  const btn = $('#syncBtn');
  const label = $('#syncLabel');
  let cls = 'off';
  let text = '로컬 저장';
  if (mode === 'loading') { cls = 'loading'; text = '동기화 중…'; }
  else if (ghReady()) {
    cls = dirty ? 'dirty' : 'ok';
    text = dirty ? '업로드 필요' : '동기화됨';
  }
  btn.className = `sync-btn ${cls}`;
  label.textContent = text;
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
    if (user && !state.members.includes(user)) { state.members.push(user); save(); }
    renderSummary(); renderRequests(); renderMemberList();
    return;
  }
  if (el.id === 'importFile') return importFile(el);
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
  }
  if (t === 'todo' && k === 'done') el.closest('li').classList.toggle('done', o.done);

  stamp(o);
  save();
  if (t === 'row') updateScheduleInPlace(el.dataset.s, el.dataset.r);
  refreshExcept(el.closest('[data-section]')?.dataset.section);
  if (t === 'req' && ['status', 'type', 'to', 'from', 'due'].includes(k)) renderRequests();
  if (t === 'cat' && k === 'name') renderSchedules();
});

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
    if (!state.members.includes(n)) state.members.push(n);
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
      store.set(LS_STATE, JSON.stringify(state));
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
      save(); renderSchedules(); renderSummary(); renderCategories();
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
      save(); renderSchedules(); renderSummary(); renderCategories();
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
      save(); renderRequests(); renderSummary();
      break;
    }
    case 'delete-member':
      e.stopPropagation();
      if (!confirm(`'${d.name}'님을 팀원 목록에서 제거할까요? (기존 업무 기록은 유지됩니다)`)) return;
      state.members = state.members.filter((n) => n !== d.name);
      if (ui.reqPerson === d.name) ui.reqPerson = '';
      save(); renderSummary(); renderRequests(); renderMemberList();
      break;
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
    case 'gh-open': openGh(); break;
    case 'gh-close': $('#ghDialog').close(); break;
    case 'gh-save': saveGhForm(); break;
    case 'gh-pull':
      if ($('#ghDialog').open) readGhForm();
      ghPull(false);
      break;
    case 'gh-push': ghPush(false); break;
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (ghReady() && gh.token) ghPush(false);
    else toast('이 브라우저에 저장되었습니다 (GitHub 미연결)');
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
      if (!confirm('현재 데이터를 가져온 파일로 교체할까요?')) return;
      state = s;
      save(); renderAll();
      toast('가져오기 완료');
    } catch (err) {
      toast(`가져오기 실패: ${err.message}`, true);
    }
  };
  reader.readAsText(file);
}

/* ---------------- GitHub 동기화 ---------------- */

function ghReady() { return !!(gh.owner && gh.repo && gh.path); }
function saveGh() { store.set(LS_GH, JSON.stringify(gh)); }

function openGh() {
  $('#gh-owner').value = gh.owner;
  $('#gh-repo').value = gh.repo;
  $('#gh-branch').value = gh.branch;
  $('#gh-path').value = gh.path;
  $('#gh-token').value = gh.token;
  $('#gh-auto').checked = gh.auto;
  $('#gh-status').textContent = gh.syncedAt ? `마지막 동기화: ${fmt(gh.syncedAt)}` : '아직 동기화한 적 없음';
  $('#ghDialog').showModal();
}

function readGhForm() {
  const prev = `${gh.owner}/${gh.repo}/${gh.branch}/${gh.path}`;
  gh.owner = $('#gh-owner').value.trim();
  gh.repo = $('#gh-repo').value.trim();
  gh.branch = $('#gh-branch').value.trim() || 'main';
  gh.path = $('#gh-path').value.trim() || 'data.json';
  gh.token = $('#gh-token').value.trim();
  gh.auto = $('#gh-auto').checked;
  if (prev !== `${gh.owner}/${gh.repo}/${gh.branch}/${gh.path}`) gh.sha = '';
  saveGh();
  setSync();
}

function saveGhForm() {
  readGhForm();
  $('#ghDialog').close();
  toast(ghReady() ? 'GitHub 설정이 저장되었습니다' : '설정이 저장되었습니다');
}

const ghUrl = () => `https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/contents/${gh.path.split('/').map(encodeURIComponent).join('/')}`;
const ghHeaders = () => {
  const h = { Accept: 'application/vnd.github+json' };
  if (gh.token) h.Authorization = `Bearer ${gh.token}`;
  return h;
};
const b64enc = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

async function ghError(res) {
  let msg = `${res.status}`;
  try { msg += ` ${(await res.json()).message}`; } catch { /* 본문 없음 */ }
  if (res.status === 401) msg = '토큰이 올바르지 않습니다 (401)';
  if (res.status === 403) msg = '권한이 없거나 요청 한도 초과 (403)';
  if (res.status === 404) msg = '저장소를 찾을 수 없습니다. 비공개 저장소라면 토큰이 필요합니다 (404)';
  return new Error(msg);
}

async function ghGet() {
  const res = await fetch(`${ghUrl()}?ref=${encodeURIComponent(gh.branch)}&_=${Date.now()}`, { headers: ghHeaders(), cache: 'no-store' });
  if (res.status === 404) {
    // 파일이 없는지, 저장소 자체가 없는지 구분
    const repo = await fetch(`https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}`, { headers: ghHeaders() });
    if (repo.ok) return null;
    throw await ghError(repo);
  }
  if (!res.ok) throw await ghError(res);
  const j = await res.json();
  return { sha: j.sha, data: JSON.parse(b64dec(j.content)) };
}

async function ghPull(silent) {
  if (!ghReady()) {
    if (!silent) { toast('먼저 GitHub 저장소를 설정하세요'); openGh(); }
    return;
  }
  if (syncing) return;
  if (dirty && !silent && !confirm('아직 GitHub에 올리지 않은 변경사항이 있습니다.\n불러오면 이 변경사항은 사라집니다. 계속할까요?')) return;
  syncing = true;
  setSync('loading');
  try {
    const r = await ghGet();
    if (!r) {
      if (!silent) toast('저장소에 데이터 파일이 아직 없습니다. “GitHub에 저장”으로 처음 업로드하세요.');
      return;
    }
    const s = normalize(r.data);
    if (!s) throw new Error('데이터 형식이 올바르지 않습니다');
    const keep = state?.activeId;
    state = s;
    if (keep && state.projects.some((p) => p.id === keep)) state.activeId = keep;
    gh.sha = r.sha;
    gh.syncedAt = now();
    saveGh();
    store.set(LS_STATE, JSON.stringify(state));
    dirty = false;
    store.set(LS_DIRTY, '0');
    renderAll();
    if (!silent) toast('GitHub에서 최신 데이터를 불러왔습니다');
    if ($('#ghDialog').open) $('#ghDialog').close();
  } catch (err) {
    toast(`불러오기 실패: ${err.message}`, true);
  } finally {
    syncing = false;
    setSync();
  }
}

async function ghPush(fromAuto) {
  if (!ghReady() || !gh.token) {
    if (!fromAuto) { toast('GitHub에 저장하려면 저장소와 토큰을 설정하세요'); openGh(); }
    return;
  }
  if (syncing) {
    if (fromAuto) { clearTimeout(autoTimer); autoTimer = setTimeout(() => ghPush(true), 3000); }
    return;
  }
  syncing = true;
  setSync('loading');
  try {
    const remote = await ghGet();
    if (remote && remote.sha !== gh.sha) {
      // 내가 마지막으로 받은 이후 다른 사람이 저장함
      const who = remote.data?.updatedBy ? `${remote.data.updatedBy}님이 ${fmt(remote.data.updatedAt)}에 ` : '';
      if (fromAuto) {
        toast(`${who}먼저 저장했습니다. 불러오기 후 다시 저장하세요.`, true);
        return;
      }
      if (!confirm(`${who}GitHub에 먼저 저장한 변경사항이 있습니다.\n\n[확인] 내 데이터로 덮어쓰기\n[취소] 중단 (불러오기로 최신 데이터를 먼저 받으세요)`)) return;
    }
    const body = {
      message: `대시보드 업데이트 - ${user || '익명'} (${fmt(now())})`,
      content: b64enc(JSON.stringify(state, null, 2)),
      branch: gh.branch,
    };
    if (remote) body.sha = remote.sha;
    const res = await fetch(ghUrl(), { method: 'PUT', headers: { ...ghHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw await ghError(res);
    const j = await res.json();
    gh.sha = j.content.sha;
    gh.syncedAt = now();
    saveGh();
    dirty = false;
    store.set(LS_DIRTY, '0');
    renderFoot();
    if (!fromAuto) toast('GitHub에 저장되었습니다');
  } catch (err) {
    toast(`저장 실패: ${err.message}`, true);
  } finally {
    syncing = false;
    setSync();
  }
}

// 다른 탭/앱에서 돌아왔을 때 변경사항이 없으면 최신 데이터 자동 반영
window.addEventListener('focus', () => {
  if (ghReady() && !dirty && !syncing) ghPull(true);
});

/* ---------------- 시작 ---------------- */

async function init() {
  try { state = normalize(JSON.parse(store.get(LS_STATE) || 'null')); } catch { state = null; }

  if (!ghReady()) {
    // GitHub Pages로 배포된 경우 저장소의 data.json을 기본 데이터로 사용
    try {
      const res = await fetch(`data.json?_=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const remote = normalize(await res.json());
        if (remote && (!state || (!dirty && remote.updatedAt > state.updatedAt))) state = remote;
      }
    } catch { /* 로컬 파일로 열었을 때 */ }
  }
  if (!state) state = sampleState();
  renderAll();
  if (ghReady()) {
    if (dirty) toast('GitHub에 아직 올리지 않은 변경사항이 있습니다');
    else ghPull(true);
  }
}

init();
