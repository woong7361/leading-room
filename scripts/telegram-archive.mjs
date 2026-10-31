import 'dotenv/config';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { TelegramClient } from 'teleproto';
import { DeletedMessage, NewMessage } from 'teleproto/events/index.js';
import { StringSession } from 'teleproto/sessions/index.js';
import { RelayLedger } from './relay-ledger.mjs';
import { buildSendOptions } from './relay-message.mjs';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH?.trim();
const savedSession = process.env.TELEGRAM_SESSION?.trim();
const sourceChatId = process.env.SOURCE_CHAT_ID?.trim();
const targetChatId = process.env.TARGET_CHAT_ID?.trim();
const archivePathSetting =
  process.env.TELEGRAM_ARCHIVE_PATH?.trim() ||
  'data/telegram-messages.ndjson';
const checkOnly = process.argv.includes('--check');
const sendAfterArchive = process.argv.includes('--send');

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

if (!sourceChatId) {
  throw new Error('.env의 SOURCE_CHAT_ID를 입력해 주세요.');
}

if (sendAfterArchive && !targetChatId) {
  throw new Error('.env의 TARGET_CHAT_ID를 입력해 주세요.');
}

if (sendAfterArchive && sourceChatId === targetChatId) {
  throw new Error('SOURCE_CHAT_ID와 TARGET_CHAT_ID는 달라야 합니다.');
}

const workspacePath = resolve(process.cwd());
const archivePath = resolve(workspacePath, archivePathSetting);
const archiveRelativePath = relative(workspacePath, archivePath);

if (
  archiveRelativePath === '..' ||
  archiveRelativePath.startsWith(`..${sep}`)
) {
  throw new Error('TELEGRAM_ARCHIVE_PATH는 프로젝트 내부 경로여야 합니다.');
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

let storageQueue = Promise.resolve();

function toIsoDate(unixSeconds) {
  if (!Number.isFinite(unixSeconds)) {
    return null;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

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
  const targetDialog = sendAfterArchive
    ? dialogs.find((dialog) => dialog.id?.toString() === targetChatId)
    : undefined;

  if (!sourceDialog) {
    throw new Error(`원본 대화방을 찾을 수 없습니다: ${sourceChatId}`);
  }

  if (sendAfterArchive && !targetDialog) {
    throw new Error(`대상 대화방을 찾을 수 없습니다: ${targetChatId}`);
  }

  await mkdir(dirname(archivePath), { recursive: true });

  const ledger = new RelayLedger(
    resolve(dirname(archivePath), 'telegram-relay-ledger.ndjson'),
  );
  await ledger.load();

  const handleNewMessage = (event) => {
    const message = event.message;
    const photoArchivePath = message.photo
      ? resolve(
          dirname(archivePath),
          'telegram-media',
          `${sourceChatId}-${message.id}.jpg`,
        )
      : null;
    const record = {
      schemaVersion: 1,
      archivedAt: new Date().toISOString(),
      chatId: sourceChatId,
      chatTitle: sourceDialog.title ?? null,
      messageId: message.id,
      messageDate: toIsoDate(message.date),
      senderId: message.senderId?.toString() ?? null,
      text: message.message ?? '',
      mediaType: message.media?.className ?? null,
      mediaPath: photoArchivePath
        ? relative(workspacePath, photoArchivePath).split(sep).join('/')
        : null,
      groupedId: message.groupedId?.toString() ?? null,
      outgoing: Boolean(message.out),
    };

    storageQueue = storageQueue
      .then(async () => {
        if (photoArchivePath) {
          await mkdir(dirname(photoArchivePath), { recursive: true });
          await client.downloadMedia(message, {
            outputFile: photoArchivePath,
          });
        }

        await appendFile(archivePath, `${JSON.stringify(record)}\n`, 'utf8');
        console.log(
          `[저장 완료] message=${message.id} media=${record.mediaType ?? 'none'}`,
        );

        if (!sendAfterArchive) {
          return;
        }

        if (!record.text && !photoArchivePath) {
          console.log(
            `[전송 생략] message=${message.id} 저장된 문자열이 없습니다.`,
          );
          return;
        }

        try {
          const sentMessage = await client.sendMessage(
            targetDialog.inputEntity,
            buildSendOptions(record.text, photoArchivePath),
          );
          await ledger.record(message.id, sentMessage.id);

          console.log(
            `[전송 완료] sourceMessage=${message.id} targetMessage=${sentMessage.id}`,
          );
        } catch (error) {
          console.error(
            `[전송 실패] message=${message.id}`,
            error.message ?? error,
          );
        }
      })
      .catch((error) => {
        console.error(
          `[저장 실패] message=${message.id}`,
          error.message ?? error,
        );
      });

    return storageQueue;
  };

  client.addEventHandler(
    handleNewMessage,
    new NewMessage({ chats: [sourceChatId] }),
  );

  const handleDeletedMessage = (event) => {
    storageQueue = storageQueue
      .then(async () => {
        for (const sourceMessageId of event.deletedIds) {
          const targetMessageId = await ledger.release(sourceMessageId);

          if (targetMessageId === undefined) {
            continue;
          }

          await client.deleteMessages(
            targetDialog.inputEntity,
            [targetMessageId],
            { revoke: true },
          );
          console.log(
            `[삭제 동기화] sourceMessage=${sourceMessageId} targetMessage=${targetMessageId}`,
          );
        }
      })
      .catch((error) => {
        console.error(
          `[삭제 동기화 실패] messages=${event.deletedIds}`,
          error.message ?? error,
        );
      });

    return storageQueue;
  };

  if (sendAfterArchive) {
    client.addEventHandler(
      handleDeletedMessage,
      new DeletedMessage({ chats: [sourceChatId] }),
    );
  }

  console.log(
    `메시지 저장 대기 중: ${sourceDialog.title}(${sourceChatId})`,
  );
  console.log(`저장 경로: ${archiveRelativePath}`);

  if (sendAfterArchive) {
    console.log(
      `문자열 전송 대상: ${targetDialog.title}(${targetChatId})`,
    );
  }

  if (checkOnly) {
    console.log('연결, 대화방 및 저장 경로 확인 완료');
  } else {
    console.log('종료하려면 Ctrl+C를 누르세요.');

    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
  }

  await storageQueue;
} finally {
  await client.disconnect();
}
