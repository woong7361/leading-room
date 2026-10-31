import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { buildSendOptions } from './relay-message.mjs';

const require = createRequire(import.meta.url);
const { _parseMessageText } = require('teleproto/client/messageParse.js');

// 기본 파서가 markdown이라 서식 문자가 사라지던 클라이언트 설정을 흉내 낸다.
const markdownClient = { parseMode: { parse: (text) => [text.replace(/__|~~/g, ''), []] } };

const SAMPLES = [
  'https://drive.google.com/drive/folders/1QM2VEAoahkoyJiEt__OYcTh2kBfAge',
  '조금만 더 버팁시다~~~',
  '**굵게** `코드` [링크](https://example.com)',
];

describe('buildSendOptions', () => {
  it('서식 파싱을 끄기 위해 parseMode는 false다', () => {
    assert.equal(buildSendOptions('a').parseMode, false);
  });

  it('사진이 없으면 file은 undefined다', () => {
    assert.equal(buildSendOptions('a', null).file, undefined);
  });

  it('사진 경로를 file로 전달한다', () => {
    assert.equal(buildSendOptions('a', 'x.jpg').file, 'x.jpg');
  });

  for (const sample of SAMPLES) {
    it(`텍스트가 변형되지 않는다: ${sample}`, async () => {
      const options = buildSendOptions(sample, null);
      const [text, entities] = await _parseMessageText(
        markdownClient,
        options.message,
        options.parseMode,
      );

      assert.equal(text, sample);
      assert.deepEqual(entities, []);
    });
  }

  it('parseMode가 null이면 기본 파서가 적용되어 텍스트가 변한다 (회귀 근거)', async () => {
    const [text] = await _parseMessageText(markdownClient, SAMPLES[0], null);

    assert.notEqual(text, SAMPLES[0]);
  });
});
