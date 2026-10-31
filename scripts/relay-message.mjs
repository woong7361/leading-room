/**
 * 저장된 문자열을 서식 해석 없이 그대로 전송하기 위한 옵션.
 * teleproto는 parseMode가 `false`일 때만 파싱을 끈다. `null`/`undefined`는
 * 클라이언트 기본 파서(markdown)로 처리되어 `__`, `~~` 같은 문자가 사라진다.
 */
export function buildSendOptions(text, photoPath) {
  return {
    message: text,
    file: photoPath ?? undefined,
    parseMode: false,
    linkPreview: false,
  };
}
