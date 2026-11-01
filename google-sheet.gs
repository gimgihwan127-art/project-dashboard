/**
 * Project Board — 업무 요청·질문 구글 시트 연동 스크립트
 *
 * 설치: 구글 시트 → 확장 프로그램 → Apps Script → 이 코드 전체를 붙여넣고 저장
 *       → 배포 → 새 배포 → 유형: 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자 → 배포
 *       → 나온 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 대시보드 설정에 입력
 *
 * 프로젝트마다 시트 탭이 따로 생기고(탭 이름 = 프로젝트 이름), 요청 하나가 한 줄입니다.
 * 수정할 때는 바뀐 칸만 고치므로 여러 사람이 동시에 고쳐도 서로 덮어쓰지 않습니다.
 */

const SPREADSHEET_ID = ''; // 시트 밖에서 만든 스크립트라면 시트 주소의 /d/와 /edit 사이 값을 넣음
const LEGACY_SHEET = '업무요청'; // 예전 버전(탭 하나에 모두 저장)의 탭 이름
const META_KEY = 'projectId';
const COLS = [
  ['id', 'ID'], ['project', '프로젝트ID'], ['projectName', '프로젝트'], ['type', '유형'],
  ['from', '요청자'], ['to', '받는사람'], ['title', '제목'], ['body', '내용'], ['due', '마감일'],
  ['status', '상태'], ['answer', '답변'], ['createdAt', '등록일시'], ['updatedBy', '수정자'], ['updatedAt', '수정일시'],
];
const KEYS = COLS.map((c) => c[0]);

function ss_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function projectIdOf_(sh) {
  const m = sh.getDeveloperMetadata().find((d) => d.getKey() === META_KEY);
  return m ? m.getValue() : null;
}

function projectSheets_(ss) {
  return ss.getSheets().map((sh) => ({ sh, id: projectIdOf_(sh) })).filter((x) => x.id !== null);
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

function sheetFor_(ss, projectId, projectName) {
  const id = projectId || '';
  const found = projectSheets_(ss).find((x) => x.id === id);
  if (found) {
    rename_(ss, found.sh, projectName);
    return found.sh;
  }
  const sh = ss.insertSheet(tabName_(ss, projectName || (id ? id : '미분류')));
  sh.addDeveloperMetadata(META_KEY, id);
  sh.getRange(1, 1, sh.getMaxRows(), COLS.length).setNumberFormat('@'); // 날짜가 자동 변환되지 않도록 텍스트 서식
  sh.getRange(1, 1, 1, COLS.length).setValues([COLS.map((c) => c[1])]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function cell_(k, v) {
  if (v instanceof Date) {
    return k === 'due' ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : v.toISOString();
  }
  return v == null ? '' : String(v);
}

function rows_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLS.length).getValues()
    .filter((r) => r[0] !== '')
    .map((r) => {
      const o = {};
      KEYS.forEach((k, i) => (o[k] = cell_(k, r[i])));
      return o;
    });
}

function readAll_(ss) {
  // 탭 기준으로 프로젝트를 정하므로, 시트에서 직접 다른 탭으로 옮긴 줄도 그 프로젝트로 보임
  return projectSheets_(ss).flatMap(({ sh, id }) => rows_(sh).map((o) => Object.assign(o, { project: id })));
}

function find_(ss, id) {
  for (const { sh } of projectSheets_(ss)) {
    const n = sh.getLastRow();
    if (n < 2) continue;
    const ids = sh.getRange(2, 1, n - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return { sh, row: i + 2 };
  }
  return null;
}

// 예전 버전의 '업무요청' 탭 내용을 프로젝트별 탭으로 옮김
function migrate_(ss) {
  const old = ss.getSheetByName(LEGACY_SHEET);
  if (!old || projectIdOf_(old) !== null) return;
  rows_(old).forEach((o) => {
    if (!find_(ss, o.id)) sheetFor_(ss, o.project, o.projectName).appendRow(KEYS.map((k) => cell_(k, o[k])));
  });
  if (ss.getSheets().length > 1) ss.deleteSheet(old);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const ss = ss_();
  migrate_(ss);
  return json_({ ok: true, items: readAll_(ss) });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = ss_();
    migrate_(ss);
    const ops = JSON.parse(e.postData.contents).ops || [];
    ops.forEach((op) => {
      const at = find_(ss, op.id || (op.item && op.item.id));
      if (op.op === 'create' && !at) {
        sheetFor_(ss, op.item.project, op.item.projectName).appendRow(KEYS.map((k) => cell_(k, op.item[k])));
      } else if (op.op === 'patch' && at) {
        const f = op.fields || {};
        Object.keys(f).forEach((k) => {
          const c = KEYS.indexOf(k);
          if (c > 0) at.sh.getRange(at.row, c + 1).setValue(cell_(k, f[k]));
        });
        // 프로젝트 이름이 바뀌었으면 탭 이름도 맞춤
        rename_(ss, at.sh, f.projectName);
      } else if (op.op === 'delete' && at) {
        at.sh.deleteRow(at.row);
      }
    });
    return json_({ ok: true, items: readAll_(ss) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 처음 한 번 실행해서 권한을 허용하고, 예전 탭이 있으면 프로젝트별로 옮깁니다
function setup() {
  migrate_(ss_());
}
