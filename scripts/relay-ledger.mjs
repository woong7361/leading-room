import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 원본 메시지와 대상 메시지의 대응 관계를 파일에 기록한다.
 * 원본이 삭제됐을 때 릴레이가 보낸 사본만 찾아 지우기 위해 사용한다.
 */
export class RelayLedger {
  #filePath;
  #targetBySource = new Map();

  constructor(filePath) {
    this.#filePath = filePath;
  }

  async load() {
    await mkdir(dirname(this.#filePath), { recursive: true });

    let content = '';
    try {
      content = await readFile(this.#filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    for (const line of content.split('\n')) {
      if (!line.trim()) {
        continue;
      }

      const entry = JSON.parse(line);
      if (entry.removed) {
        this.#targetBySource.delete(entry.sourceMessageId);
      } else {
        this.#targetBySource.set(entry.sourceMessageId, entry.targetMessageId);
      }
    }
  }

  async record(sourceMessageId, targetMessageId) {
    await this.#append({ sourceMessageId, targetMessageId });
    this.#targetBySource.set(sourceMessageId, targetMessageId);
  }

  /** 대상 메시지 id를 돌려주고 기록에서 제거한다. 보낸 적 없으면 undefined. */
  async release(sourceMessageId) {
    const targetMessageId = this.#targetBySource.get(sourceMessageId);

    if (targetMessageId === undefined) {
      return undefined;
    }

    await this.#append({ sourceMessageId, removed: true });
    this.#targetBySource.delete(sourceMessageId);

    return targetMessageId;
  }

  async #append(entry) {
    await appendFile(
      this.#filePath,
      `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`,
      'utf8',
    );
  }
}
