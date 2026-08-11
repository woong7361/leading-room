import 'dotenv/config';
import input from 'input';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();
const savedSession = process.env.TELEGRAM_SESSION?.trim() ?? '';

if (!Number.isSafeInteger(apiId) || apiId <= 0) {
  throw new Error('.env의 TELEGRAM_API_ID에 숫자 값을 입력해 주세요.');
}

if (!apiHash) {
  throw new Error('.env의 TELEGRAM_API_HASH를 입력해 주세요.');
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
  await client.start({
    phoneNumber: () => input.text('전화번호(+82...):'),
    phoneCode: () => input.text('Telegram 로그인 코드:'),
    password: () => input.password('2단계 인증 비밀번호:'),
    onError: (error) => {
      console.error('Telegram 로그인 오류:', error.message ?? error);
      return false;
    },
  });

  const me = await client.getMe();
  const displayName =
    me.username ?? [me.firstName, me.lastName].filter(Boolean).join(' ');

  console.log(`\n로그인 성공: ${displayName || me.id.toString()}`);
  console.log('\n아래 문자열을 .env의 TELEGRAM_SESSION 값으로 저장하세요.');
  console.log(client.session.save());

  console.log('\n참여 중인 Telegram 대화방 목록:');
  console.log('CHAT_ID\tTITLE');

  for await (const dialog of client.iterDialogs({})) {
    console.log(`${dialog.id.toString()}\t${dialog.title || '(제목 없음)'}`);
  }

  console.log(
    '\n원본과 대상 방의 CHAT_ID를 각각 SOURCE_CHAT_ID와 TARGET_CHAT_ID에 저장하세요.',
  );
} finally {
  await client.disconnect();
}
