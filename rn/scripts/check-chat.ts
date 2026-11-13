// npx tsx scripts/check-chat.ts
import assert from 'node:assert';
import { ALL, MAX, PAGE, dayLabel, followArrival, initialWin, pageDown, pageUp, pushNow, type MsgRow } from '../src/chat';

const msgs = ALL.filter((r) => r.kind === 'msg');
assert.equal(msgs.length, 10000);
const days = ALL.filter((r) => r.kind === 'day');
assert.equal(dayLabel(days.at(-1)!.day), "Aujourd'hui");
assert.equal(dayLabel(days.at(-2)!.day), 'Hier');
assert.equal(new Set(ALL.map((r) => r.key)).size, ALL.length);

// arrival at the live end: window follows, size stays bounded
let w = initialWin();
for (let i = 0; i < 1000; i++) {
  const prev = ALL.length;
  pushNow('them', 'x' + i);
  w = followArrival(w, prev, true);
  assert.equal(w.hi, ALL.length);
  assert.ok(w.hi - w.lo <= MAX + PAGE);
}
const lastTwo = ALL.slice(-2) as MsgRow[];
assert.equal(lastTwo[0].tail, false); // grouping fixed up on the previous bubble
assert.equal(lastTwo[1].first, false);

// scroll up to message 1 page by page: window stays bounded, reaches index 0
let pages = 0;
while (w.lo > 0) {
  w = pageUp(w);
  pages++;
  assert.ok(w.hi - w.lo <= MAX);
}
assert.equal((ALL[1] as MsgRow).m.id, 1);
console.log('reached message 1 after', pages, 'pages');

// reading history: arrivals don't touch the window (same object -> no render)
const prev = ALL.length;
pushNow('them', 'y');
assert.strictEqual(followArrival(w, prev, false), w);

// back down to the live end
while (w.hi < ALL.length) w = pageDown(w);
assert.ok(w.hi - w.lo <= MAX);
console.log('ok');
