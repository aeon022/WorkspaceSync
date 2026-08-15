'use strict';

const assert = require('node:assert');
const { computeSyncActions } = require('../lib/merge.js');

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run('opens a tab that was opened remotely and is missing locally', () => {
  const result = computeSyncActions(
    [{ url: 'https://a.com' }],
    {
      tabs: [{ url: 'https://a.com' }, { url: 'https://b.com' }],
      recentEvents: [{ op: 'open', url: 'https://b.com', ts: 100 }]
    },
    0
  );
  assert.deepStrictEqual(result.toOpen, ['https://b.com']);
  assert.deepStrictEqual(result.toClose, []);
  assert.strictEqual(result.newLastAppliedTs, 100);
});

run('closes a tab that was closed remotely and is still open locally', () => {
  const result = computeSyncActions(
    [{ url: 'https://a.com' }, { url: 'https://b.com' }],
    {
      tabs: [{ url: 'https://a.com' }],
      recentEvents: [{ op: 'close', url: 'https://b.com', ts: 100 }]
    },
    0
  );
  assert.deepStrictEqual(result.toOpen, []);
  assert.deepStrictEqual(result.toClose, ['https://b.com']);
});

run('does not duplicate a tab already open on both sides (dedup by URL)', () => {
  const result = computeSyncActions(
    [{ url: 'https://a.com' }],
    {
      tabs: [{ url: 'https://a.com' }],
      recentEvents: [{ op: 'open', url: 'https://a.com', ts: 100 }]
    },
    0
  );
  assert.deepStrictEqual(result.toOpen, []);
  assert.deepStrictEqual(result.toClose, []);
});

run('does not try to close a URL that is not actually open locally', () => {
  const result = computeSyncActions(
    [{ url: 'https://a.com' }],
    {
      tabs: [],
      recentEvents: [{ op: 'close', url: 'https://never-was-open.com', ts: 100 }]
    },
    0
  );
  assert.deepStrictEqual(result.toClose, []);
});

run('ignores events at or before lastAppliedTs and advances the cursor to the newest new event', () => {
  const result = computeSyncActions(
    [],
    {
      tabs: [{ url: 'https://a.com' }, { url: 'https://b.com' }],
      recentEvents: [
        { op: 'open', url: 'https://a.com', ts: 50 },
        { op: 'open', url: 'https://b.com', ts: 150 }
      ]
    },
    100
  );
  assert.deepStrictEqual(result.toOpen, ['https://b.com']);
  assert.strictEqual(result.newLastAppliedTs, 150);
});

run('a later close event cancels an earlier open event for the same URL in one tick', () => {
  const result = computeSyncActions(
    [],
    {
      tabs: [],
      recentEvents: [
        { op: 'open', url: 'https://a.com', ts: 100 },
        { op: 'close', url: 'https://a.com', ts: 200 }
      ]
    },
    0
  );
  assert.deepStrictEqual(result.toOpen, []);
  assert.deepStrictEqual(result.toClose, []);
});

run('lastAppliedTs does not regress when there are no new events', () => {
  const result = computeSyncActions([{ url: 'https://a.com' }], { tabs: [{ url: 'https://a.com' }], recentEvents: [] }, 500);
  assert.strictEqual(result.newLastAppliedTs, 500);
});
