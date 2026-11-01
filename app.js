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
let sheetUrl = store.get(LS_SHEET) || DEFAULT_SHEET_URL;
const ui = { reqPerson: '' };

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
            <th>타임라인 <span class="gantt-range">${rangeLabel(rg)}</span></th><th style="width:16%">메모</th><th>최종 수정</th><th class="del-col">삭제</th>
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
};
// 부모 종류 (필드 이름도 같음)
const PARENT = { member: 'project', category: 'project', schedule: 'project', request: 'project', todo: 'category', row: 'schedule' };
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
  });
  return m;
}

function build(flat) {
  const of = (kind) => [...flat.values()].filter((x) => x.kind === kind);
  const projects = of('project').map(({ id, f }) => ({ id, name: f.name, members: [], categories: [], schedules: [], requests: [] }));
  const P = new Map(projects.map((p) => [p.id, p]));
  of('member').forEach(({ f }) => P.get(f.project)?.members.push(f.name));
  of('category').forEach(({ id, f }) => P.get(f.project)?.categories.push({ id, name: f.name, status: f.status, todos: [] }));
  const C = new Map(projects.flatMap((p) => p.categories.map((c) => [c.id, c])));
  of('todo').forEach(({ id, f }) => C.get(f.category)?.todos.push({ id, text: f.text, owner: f.owner, done: f.done === 'TRUE' }));
  of('schedule').forEach(({ id, f }) => P.get(f.project)?.schedules.push({ id, name: f.name, rows: [] }));
  const S = new Map(projects.flatMap((p) => p.schedules.map((s) => [s.id, s])));
  of('row').forEach(({ id, f }) => S.get(f.schedule)?.rows.push({ id, ...pick(f, ROW_FIELDS), progress: Number(f.progress) || 0 }));
  of('request').forEach(({ id, f }) => P.get(f.project)?.requests.push({ id, ...pick(f, REQ_FIELDS) }));
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

