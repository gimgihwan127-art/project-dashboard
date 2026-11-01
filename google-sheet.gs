/**
 * Project Board — 구글 시트 저장 스크립트 (대시보드 전체 데이터)
 *
 * 설치: 구글 시트 → 확장 프로그램 → Apps Script → 이 코드 전체를 붙여넣고 저장
 *       → 배포 → 새 배포 → 유형: 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자 → 배포
 *       → 나온 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 대시보드 설정에 입력
 *
 * 데이터 하나(프로젝트·팀원·카테고리·할 일·스케줄표·업무)가 종류별 탭의 한 줄이고,
 * 업무 요청·질문은 프로젝트마다 탭이 따로 생깁니다(탭 이름 = 프로젝트 이름).
 * 수정할 때는 바뀐 칸만 고치므로 여러 사람이 동시에 고쳐도 서로 덮어쓰지 않습니다.
 */

const SPREADSHEET_ID = ''; // 시트 밖에서 만든 스크립트라면 시트 주소의 /d/와 /edit 사이 값을 넣음
const META_KEY = 'projectId'; // 업무 요청 탭이 어느 프로젝트인지
const KIND_KEY = 'kind'; // 나머지 탭이 어떤 데이터인지
const BASE = [['id', 'ID'], ['project', '프로젝트ID'], ['projectName', '프로젝트']];
const TABLES = {
  project: { tab: '프로젝트', cols: [['id', 'ID'], ['name', '프로젝트']] },
  member: { tab: '팀원', cols: [...BASE, ['name', '이름']] },
  category: { tab: '카테고리', cols: [...BASE, ['name', '카테고리'], ['status', '현황 메모']] },
  todo: {
    tab: '할 일',
    cols: [...BASE, ['category', '카테고리ID'], ['categoryName', '카테고리'], ['text', '할 일'], ['owner', '담당'], ['done', '완료']],
  },
  schedule: { tab: '스케줄표', cols: [...BASE, ['name', '스케줄표']] },
  row: {
    tab: '스케줄',
    cols: [...BASE, ['schedule', '스케줄표ID'], ['scheduleName', '스케줄표'], ['task', '업무명'], ['cat', '카테고리ID'],
      ['catName', '카테고리'], ['owner', '담당자'], ['start', '시작일'], ['end', '종료일'], ['status', '상태'],
      ['progress', '진행률'], ['note', '메모'], ['updatedBy', '수정자'], ['updatedAt', '수정일시']],
  },
};
const REQ_COLS = [
  ['id', 'ID'], ['project', '프로젝트ID'], ['projectName', '프로젝트'], ['type', '유형'],
  ['from', '요청자'], ['to', '받는사람'], ['title', '제목'], ['body', '내용'], ['due', '마감일'],
  ['status', '상태'], ['answer', '답변'], ['createdAt', '등록일시'], ['updatedBy', '수정자'], ['updatedAt', '수정일시'],
];
const colsOf_ = (kind) => (kind === 'request' ? REQ_COLS : TABLES[kind].cols);
const keysOf_ = (kind) => colsOf_(kind).map((c) => c[0]);

// 시트의 탭 구성을 한 번 읽어 둠
function ctx_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const c = { ss, kinds: {}, reqs: [], ids: {} };
  ss.getSheets().forEach((sh) => sh.getDeveloperMetadata().forEach((d) => {
    if (d.getKey() === KIND_KEY) c.kinds[d.getValue()] = sh;
    if (d.getKey() === META_KEY) c.reqs.push({ sh, id: d.getValue() });
  }));
  return c;
}

// 탭 이름에 쓸 수 없는 문자를 빼고, 다른 탭과 겹치면 번호를 붙임
function tabName_(ss, name, self) {
  const base = (String(name || '').replace(/[\[\]*?:\/\\]/g, ' ').trim() || '미분류').slice(0, 90);
  let n = base;
  for (let i = 2; ss.getSheets().some((s) => s.getName() === n && s !== self); i++) n = `${base} (${i})`;
  return n;
}

function rename_(ss, sh, projectName) {
  if (!projectName) return;
  const n = tabName_(ss, projectName, sh);
  if (sh.getName() !== n) sh.setName(n);
}

function newTab_(c, name, key, value, cols) {
  const sh = c.ss.insertSheet(tabName_(c.ss, name));
  sh.addDeveloperMetadata(key, value);
  sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@'); // 날짜가 자동 변환되지 않도록 텍스트 서식
  sh.getRange(1, 1, 1, cols.length).setValues([cols.map((x) => x[1])]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function sheetFor_(c, kind, item) {
  if (kind !== 'request') {
    if (!c.kinds[kind]) c.kinds[kind] = newTab_(c, TABLES[kind].tab, KIND_KEY, kind, TABLES[kind].cols);
    return c.kinds[kind];
  }
  const id = item.project || '';
  const found = c.reqs.find((x) => x.id === id);
  if (found) {
    rename_(c.ss, found.sh, item.projectName);
    return found.sh;
  }
  const sh = newTab_(c, item.projectName || id || '미분류', META_KEY, id, REQ_COLS);
  c.reqs.push({ sh, id });
  return sh;
}

const sheetsOf_ = (c, kind) => (kind === 'request' ? c.reqs.map((x) => x.sh) : c.kinds[kind] ? [c.kinds[kind]] : []);

// 탭별 ID → 행 번호
function ids_(c, sh) {
  const k = sh.getSheetId();
  if (!c.ids[k]) {
    const m = new Map();
    const n = sh.getLastRow();
    if (n >= 2) sh.getRange(2, 1, n - 1, 1).getValues().forEach((r, i) => r[0] !== '' && m.set(String(r[0]), i + 2));
    c.ids[k] = m;
  }
  return c.ids[k];
}

function find_(c, kind, id) {
  for (const sh of sheetsOf_(c, kind)) {
    const row = ids_(c, sh).get(String(id));
    if (row) return { sh, row };
  }
  return null;
}

function cell_(k, v) {
  if (v instanceof Date) {
    return ['due', 'start', 'end'].includes(k) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : v.toISOString();
  }
  return v == null ? '' : String(v);
}

function rows_(sh, kind) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  const keys = keysOf_(kind);
  return sh.getRange(2, 1, n - 1, keys.length).getValues()
    .filter((r) => r[0] !== '')
    .map((r) => {
      const o = {};
      keys.forEach((k, i) => (o[k] = cell_(k, r[i])));
      return o;
    });
}

function readAll_(c) {
  const data = {};
  Object.keys(TABLES).forEach((k) => (data[k] = c.kinds[k] ? rows_(c.kinds[k], k) : []));
  // 탭 기준으로 프로젝트를 정하므로, 시트에서 직접 다른 탭으로 옮긴 줄도 그 프로젝트로 보임
  data.request = c.reqs.flatMap(({ sh, id }) => rows_(sh, 'request').map((o) => Object.assign(o, { project: id })));
  return data;
}

function apply_(c, ops) {
  const adds = new Map(); // 탭별로 모아서 한 번에 추가
  const dels = [];
  const dropTabs = [];
  ops.forEach((op) => {
    const kind = op.kind || 'request';
    if (kind !== 'request' && !TABLES[kind]) return;
    const id = String(op.id || (op.item && op.item.id) || '');
    if (!id) return;
    const at = find_(c, kind, id);
    if (op.op === 'create') {
      const sh = sheetFor_(c, kind, op.item);
      const k = sh.getSheetId();
      if (at || (adds.has(k) && adds.get(k).ids.has(id))) return;
      if (!adds.has(k)) adds.set(k, { sh, rows: [], ids: new Set() });
      adds.get(k).rows.push(keysOf_(kind).map((key) => cell_(key, op.item[key])));
      adds.get(k).ids.add(id);
    } else if (op.op === 'patch' && at) {
      const f = op.fields || {};
      const keys = keysOf_(kind);
      Object.keys(f).forEach((key) => {
        const i = keys.indexOf(key);
        if (i > 0) at.sh.getRange(at.row, i + 1).setValue(cell_(key, f[key]));
      });
      if (kind === 'request') rename_(c.ss, at.sh, f.projectName); // 프로젝트 이름이 바뀌면 탭 이름도 맞춤
    } else if (op.op === 'delete') {
      if (at) dels.push(at);
      if (kind === 'project') dropTabs.push(id);
    }
  });
  adds.forEach(({ sh, rows }) => {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    delete c.ids[sh.getSheetId()];
  });
  // 아래 줄부터 지워야 행 번호가 밀리지 않음
  dels.sort((a, b) => b.row - a.row).forEach((d) => d.sh.deleteRow(d.row));
  dropTabs.forEach((pid) => {
    const x = c.reqs.find((r) => r.id === pid);
    if (x && c.ss.getSheets().length > 1) {
      c.ss.deleteSheet(x.sh);
      c.reqs = c.reqs.filter((r) => r !== x);
    }
  });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function reply_(c) {
  const data = readAll_(c);
  return json_({ ok: true, data, items: data.request });
}

function doGet() {
  return reply_(ctx_());
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const c = ctx_();
    apply_(c, JSON.parse(e.postData.contents).ops || []);
    return reply_(ctx_());
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 처음 한 번 실행해서 권한을 허용합니다
function setup() {
  readAll_(ctx_());
}
