/**
 * Project Board — 업무 요청·질문 구글 시트 연동 스크립트
 *
 * 설치: 구글 시트 → 확장 프로그램 → Apps Script → 이 코드 전체를 붙여넣고 저장
 *       → 배포 → 새 배포 → 유형: 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자 → 배포
 *       → 나온 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 대시보드 설정에 입력
 *
 * 요청 하나가 시트의 한 줄이고, 수정할 때는 바뀐 칸만 고치므로
 * 여러 사람이 동시에 다른 요청(또는 같은 요청의 다른 칸)을 고쳐도 서로 덮어쓰지 않습니다.
 */

const SPREADSHEET_ID = ''; // 시트 밖에서 만든 스크립트라면 시트 주소의 /d/와 /edit 사이 값을 넣음
const SHEET_NAME = '업무요청';
const COLS = [
  ['id', 'ID'], ['project', '프로젝트ID'], ['projectName', '프로젝트'], ['type', '유형'],
  ['from', '요청자'], ['to', '받는사람'], ['title', '제목'], ['body', '내용'], ['due', '마감일'],
  ['status', '상태'], ['answer', '답변'], ['createdAt', '등록일시'], ['updatedBy', '수정자'], ['updatedAt', '수정일시'],
];
const KEYS = COLS.map((c) => c[0]);

function sheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), COLS.length).setNumberFormat('@'); // 날짜가 자동 변환되지 않도록 텍스트 서식
    sh.getRange(1, 1, 1, COLS.length).setValues([COLS.map((c) => c[1])]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function cell_(k, v) {
  if (v instanceof Date) {
    return k === 'due' ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : v.toISOString();
  }
  return v == null ? '' : String(v);
}

function readAll_(sh) {
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

function rowOf_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return -1;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, items: readAll_(sheet_()) });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const ops = JSON.parse(e.postData.contents).ops || [];
    ops.forEach((op) => {
      const row = rowOf_(sh, op.id || (op.item && op.item.id));
      if (op.op === 'create' && row < 0) {
        sh.appendRow(KEYS.map((k) => cell_(k, op.item[k])));
      } else if (op.op === 'patch' && row > 0) {
        Object.keys(op.fields || {}).forEach((k) => {
          const c = KEYS.indexOf(k);
          if (c > 0) sh.getRange(row, c + 1).setValue(cell_(k, op.fields[k]));
        });
      } else if (op.op === 'delete' && row > 0) {
        sh.deleteRow(row);
      }
    });
    return json_({ ok: true, items: readAll_(sh) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// 처음 한 번 실행해서 권한을 허용하고 시트 머리글을 만듭니다
function setup() {
  sheet_();
}
