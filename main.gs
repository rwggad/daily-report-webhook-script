/*
 * By. rwggad
 * 2021/06/17
 *
 * 참고:http://blog.jandi.com/blog/2020/02/jandi-google-translation/
 *     https://api.slack.com/legacy/custom-integrations/outgoing-webhooks
 */
var SUCCESS = 1;
var GET_ROW_FAIL = -1;
var PARSING_FAIL = -2;

var INCOMING_URL = "";
var COMMON_HEADERS = {
  "Content-type": "application/json"
}


function getFirstEmptyRow(sheet) {
  /* A:A 범위의 시트를 1행 부터 탐색하며, 빈 값이 있는 행 번호를 반환 합니다.
   * 참고) 1 ~ max_col 에 정의된 값 까지만 탐색 합니다.
   */
  var col;
  var values;

  var min_col = 1;
  var max_col = 1000000;
  var ret_col = 0;

  if (sheet == null) {
    Logger.log("failed get row");
    return;
  }

  col = sheet.getRange("A:A");
  values = col.getValues();

  for (var index = min_col; index < max_col; index++) {
    if (values[index][0] == "") {
      ret_col = index + 1;
      break;
    }
  }

  return ret_col;
}


function sendMsg(code, thread_ts=0) {
  /* imcoming hook 을 통하여, 메세지를 전달 합니다.
   */
  var msg = '';
  var data = {};
  var sheet_url = ''

  if (code >= SUCCESS) {
    msg = "오늘 하루도 고생하셨습니다 :)\n- 일일보고 현황 (<" + sheet_url + "|보기>)\n- 기록 ID (" + code + ")"
  } else {
    msg = "일일보고 기록에 실패하였습니다. [에러 코드 : " + code + "]"
  }

  data["text"] = msg;
  if (thread_ts != 0) {
    data["thread_ts"] = thread_ts;
  }

  var options = {
    "method": "POST",
    "payload": JSON.stringify(data),
    "headers": COMMON_HEADERS,
  };

  response = UrlFetchApp.fetch(INCOMING_URL, options);
  Logger.log("send result: " + response);

}


function writeSheet(user_name, user_text, redmine_issue_number, thread_ts=0) {
  /* '보고 현황' 시트에 argument로 넘어온 'text' 정보를 기록 합니다.
   */
  var sheet;
  var empty_row_idx = 0;
  var id = 0;
  var day = "";
  var redmine_address = "";

  sheet = SpreadsheetApp.getActive();
  sheet.setActiveSheet(sheet.getSheetByName('보고현황'), true);

  // 빈칸인 행 번호를 가져옴
  empty_row_idx = getFirstEmptyRow(sheet);
  if (empty_row_idx < 1) {
    return GET_ROW_FAIL;
  }

  // 행번호를 사용하여 ID를 생성
  id = (empty_row_idx - 1);

  // 현재 날짜 생성
  day = Utilities.formatDate(new Date(thread_ts * 1000), "GMT", "dd/MM/yyyy");

  // 보고된 관련 일감 번호를 사용하여, 링크 생성
  if (redmine_issue_number){
    for (var i = 0; i < redmine_issue_number.length; i++) {
      if (i > 0) {
        redmine_address += "\n";
      }
      redmine_address += "https://redmine.piolink.com/issues/" + redmine_issue_number[i].split('#')[1];
    }
  }

  // 시트로 추가
  sheet.getRange('\'보고현황\'!A' + empty_row_idx).setValue(id);
  sheet.getRange('\'보고현황\'!B' + empty_row_idx).setValue(day);
  sheet.getRange('\'보고현황\'!C' + empty_row_idx).setValue(user_name);
  sheet.getRange('\'보고현황\'!D' + empty_row_idx).setValue(user_text);
  sheet.getRange('\'보고현황\'!E' + empty_row_idx).setValue(redmine_address);

  return id;
}


function parseUserText(text) {
  /* @text 로 넘어온 값의 prefix를 제거하고, regex를 통해 redmine issue number를 파싱 합니다.
   */
  // "^(\[보고\]).*"
  var prefix = "[보고]";
  var remove_prefix_text;
  var redmine_issue_number = [];

  var parsing_result = [];

  remove_prefix_text = text.split(prefix);
  if (remove_prefix_text.length < 2) {
    return text;
  }

  // get report text (no prefix)
  remove_prefix_text = remove_prefix_text[1].trim();

  // get redmine number
  redmine_issue_number = remove_prefix_text.match(/#[0-9]{0,5}/gi);

  // make parsing result
  parsing_result.push(remove_prefix_text);
  if (redmine_issue_number) {
    parsing_result.push(redmine_issue_number);
  }

  //Logger.log("parsig done\nret:\n" + parsing_result);

  return parsing_result;
}


function doPost(data) {
  /* outgoing web hook에 의해 전달된 기록을 파싱 하며, 구글 시트에 기록 합니다.
   *
   * 트리거: slack outgoing web hook에 의해 호출
   * @data format:
   * {
   *    text=[일일보고] ...,
   *    user_id=...,
   *    team_id=...,
   *    channel_name=test,
   *    service_id=...,
   *    token=...,
   *    channel_id=...,
   *    trigger_word=[보고],
   *    thread_ts=...
   *    user_name=...,
   *    team_domain=...,
   *    timestamp=...
   * }
   */
  var thread_ts = data.parameter.thread_ts;
  var user_name = data.parameter.user_name;
  var user_text = data.parameter.text;

  var parsing_result;
  var report_text;
  var redmine_issue_number;

  parsing_result = parseUserText(user_text)
  if (parsing_result.length < 0) {
    sendFail(PARSING_FAIL, thread_ts);
  }

  report_text = parsing_result[0].trim();
  if (parsing_result.length > 1) {
    redmine_issue_number = parsing_result[1];
  }

  rc = writeSheet(user_name, report_text, redmine_issue_number, thread_ts);
  sendMsg(rc, thread_ts);
}
