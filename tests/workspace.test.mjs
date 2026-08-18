import assert from 'node:assert';

// Minimal fake of the one chrome API surface debounceWorkspaceIds touches.
globalThis.chrome = {
  storage: {
    local: {
      _data: {},
      async get(key) {
        return { [key]: globalThis.chrome.storage.local._data[key] };
      },
      async set(obj) {
        Object.assign(globalThis.chrome.storage.local._data, obj);
      }
    }
  }
};

const { debounceWorkspaceIds } = await import('../lib/workspace.js');

async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

await run('trusts a tab id seen for the first time immediately', async () => {
  globalThis.chrome.storage.local._data = {};
  const resolved = await debounceWorkspaceIds(new Map([[1, 'workspaceA']]));
  assert.strictEqual(resolved.get(1), 'workspaceA');
});

await run('holds a single-poll workspace change and keeps serving the confirmed value', async () => {
  globalThis.chrome.storage.local._data = {};
  await debounceWorkspaceIds(new Map([[1, 'workspaceA']]));
  const resolved = await debounceWorkspaceIds(new Map([[1, 'workspaceB']]));
  assert.strictEqual(resolved.get(1), 'workspaceA');
});

await run('accepts a workspace change once seen on two consecutive polls', async () => {
  globalThis.chrome.storage.local._data = {};
  await debounceWorkspaceIds(new Map([[1, 'workspaceA']]));
  await debounceWorkspaceIds(new Map([[1, 'workspaceB']]));
  const resolved = await debounceWorkspaceIds(new Map([[1, 'workspaceB']]));
  assert.strictEqual(resolved.get(1), 'workspaceB');
});

await run('a flicker back to the confirmed value resets the pending change', async () => {
  globalThis.chrome.storage.local._data = {};
  await debounceWorkspaceIds(new Map([[1, 'workspaceA']]));
  await debounceWorkspaceIds(new Map([[1, 'workspaceB']])); // pending: B
  await debounceWorkspaceIds(new Map([[1, 'workspaceA']])); // back to A, clears pending
  const resolved = await debounceWorkspaceIds(new Map([[1, 'workspaceB']])); // B seen only once again
  assert.strictEqual(resolved.get(1), 'workspaceA');
});

await run('drops debounce state for tab ids no longer present (closed/reused tabs)', async () => {
  globalThis.chrome.storage.local._data = {};
  await debounceWorkspaceIds(new Map([[1, 'workspaceA']]));
  await debounceWorkspaceIds(new Map()); // tab 1 closed
  // id 2 reused by a new tab that happens to land on the old numeric id space is unaffected by tab 1's history
  const resolved = await debounceWorkspaceIds(new Map([[2, 'workspaceZ']]));
  assert.strictEqual(resolved.get(2), 'workspaceZ');
});
