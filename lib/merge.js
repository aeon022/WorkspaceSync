'use strict';

function computeSyncActions(localTabs, remoteWorkspace, lastAppliedTs) {
  const localUrls = new Set(localTabs.map((t) => t.url));
  const newEvents = remoteWorkspace.recentEvents
    .filter((e) => e.ts > lastAppliedTs)
    .sort((a, b) => a.ts - b.ts);

  const toOpen = new Set();
  const toClose = new Set();

  for (const event of newEvents) {
    if (event.op === 'open') {
      toOpen.add(event.url);
      toClose.delete(event.url);
    } else if (event.op === 'close') {
      toClose.add(event.url);
      toOpen.delete(event.url);
    }
  }

  const finalToOpen = [...toOpen].filter((url) => !localUrls.has(url));
  const finalToClose = [...toClose].filter((url) => localUrls.has(url));

  const newLastAppliedTs = newEvents.length
    ? newEvents[newEvents.length - 1].ts
    : lastAppliedTs;

  return { toOpen: finalToOpen, toClose: finalToClose, newLastAppliedTs };
}

module.exports = { computeSyncActions };
