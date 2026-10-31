import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RelayLedger } from './relay-ledger.mjs';

describe('RelayLedger', () => {
  let dir;
  let filePath;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'relay-ledger-'));
    filePath = join(dir, 'nested', 'ledger.ndjson');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function openLedger() {
    const ledger = new RelayLedger(filePath);
    await ledger.load();
    return ledger;
  }

  it('전송한 메시지는 release로 대상 메시지 id를 돌려받는다', async () => {
    const ledger = await openLedger();
    await ledger.record(2727, 2378);

    assert.equal(await ledger.release(2727), 2378);
  });

  it('보낸 적 없는 메시지는 release해도 undefined다', async () => {
    const ledger = await openLedger();

    assert.equal(await ledger.release(1), undefined);
  });

  it('같은 메시지를 두 번 release해도 두 번째는 undefined다', async () => {
    const ledger = await openLedger();
    await ledger.record(10, 20);

    assert.equal(await ledger.release(10), 20);
    assert.equal(await ledger.release(10), undefined);
  });

  it('재시작해도 기록이 유지된다', async () => {
    const first = await openLedger();
    await first.record(5, 50);

    const restarted = await openLedger();

    assert.equal(await restarted.release(5), 50);
  });

  it('release한 기록은 재시작 후에도 되살아나지 않는다', async () => {
    const first = await openLedger();
    await first.record(5, 50);
    await first.release(5);

    const restarted = await openLedger();

    assert.equal(await restarted.release(5), undefined);
  });
});
