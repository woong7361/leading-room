import 'dotenv/config';
import { TelegramClient } from 'teleproto';
import { NewMessage } from 'teleproto/events/index.js';
import { StringSession } from 'teleproto/sessions/index.js';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();
const savedSession = process.env.TELEGRAM_SESSION?.trim();
const sourceChatId = process.env.SOURCE_CHAT_ID?.trim();
const targetChatId = process.env.TARGET_CHAT_ID?.trim();
const checkOnly = process.argv.includes('--check');

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

if (!sourceChatId || !targetChatId) {
  throw new Error('SOURCE_CHAT_ID와 TARGET_CHAT_ID를 입력해 주세요.');
}

if (sourceChatId === targetChatId) {
  throw new Error('SOURCE_CHAT_ID와 TARGET_CHAT_ID는 달라야 합니다.');
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

let deliveryQueue = Promise.resolve();

try {
  await client.connect();

  if (!(await client.isUserAuthorized())) {
    throw new Error(
      '저장된 Telegram 세션이 유효하지 않습니다. npm run telegram:setup으로 다시 로그인해 주세요.',
    );
  }

  const dialogs = await client.getDialogs({});
  const sourceDialog = dialogs.find(
    (dialog) => dialog.id?.toString() === sourceChatId,
  );
  const targetDialog = dialogs.find(
    (dialog) => dialog.id?.toString() === targetChatId,
  );

  if (!sourceDialog) {
    throw new Error(`원본 대화방을 찾을 수 없습니다: ${sourceChatId}`);
  }

  if (!targetDialog) {
    throw new Error(`대상 대화방을 찾을 수 없습니다: ${targetChatId}`);
  }

  const handleNewMessage = (event) => {
    console.log(
      `[수신] message=${event.message.id} out=${Boolean(event.message.out)}`,
    );

    deliveryQueue = deliveryQueue
      .then(async () => {
        await event.forward(targetDialog.inputEntity);
        console.log(
          `[전달 완료] message=${event.message.id} ${sourceDialog.title} -> ${targetDialog.title}`,
        );
      })
      .catch((error) => {
        console.error(
          `[전달 실패] message=${event.message.id}`,
          error.message ?? error,
        );
      });

    return deliveryQueue;
  };

  client.addEventHandler(
    handleNewMessage,
    new NewMessage({
      chats: [sourceChatId],
    }),
  );

  console.log(
    `메시지 전달 대기 중: ${sourceDialog.title}(${sourceChatId}) -> ${targetDialog.title}(${targetChatId})`,
  );

  if (checkOnly) {
    console.log('연결 및 대화방 확인 완료');
  } else {
    console.log('종료하려면 Ctrl+C를 누르세요.');

    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  }

  await deliveryQueue;
} finally {
  await client.disconnect();
}
