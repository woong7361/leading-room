import 'dotenv/config';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();
const savedSession = process.env.TELEGRAM_SESSION?.trim();

if (!Number.isSafeInteger(apiId) || apiId <= 0) {
  throw new Error('.env의 TELEGRAM_API_ID에 숫자 값을 입력해 주세요.');
}

if (!apiHash) {
  throw new Error('.env의 TELEGRAM_API_HASH를 입력해 주세요.');
}

if (!savedSession) {
  throw new Error(
    'TELEGRAM_SESSION이 없습니다. 먼저 npm run telegram:setup을 실행해 주세요.',
  );
}

const client = new TelegramClient(
  new StringSession(savedSession),
  apiId,
  apiHash,
  {
    connectionRetries: 5,
    testServers: false,
  },
);

try {
  await client.connect();

  if (!(await client.isUserAuthorized())) {
    throw new Error(
      '저장된 Telegram 세션이 유효하지 않습니다. npm run telegram:setup으로 다시 로그인해 주세요.',
    );
  }

  console.log('CHAT_ID\tTITLE');

  for await (const dialog of client.iterDialogs({})) {
    console.log(`${dialog.id.toString()}\t${dialog.title || '(제목 없음)'}`);
  }
} finally {
  await client.disconnect();
}
