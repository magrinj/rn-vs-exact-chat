import type { Answer, Result, Sources } from './app.contract.d.ts';
import messages from './data/messages.json';
import ratios from './data/ratios.json';

export const grants = '';

type Row = Result<'feed'>['rows'][number];
type Msg = { id: number; author: string; timestamp: string; type: string; text?: string; photo?: string; duration?: number };
type Entry = { m: Msg; at: number };

const DAY = 86400000;
// The newest window (what an arrival refreshes) is 200 messages. An older window is 400 and a
// page moves it by 200, so after a page lands the reader has ~200 messages on each side: more
// than the list's edge band (reach-margin plus a fling's lead), so the other edge never fires.
const TAIL = 200, WINDOW = 400, STEP = 200;
const NBSP = ' ';
// Room on the last line for the time (and ticks) drawn over the bubble's bottom-right corner.
const pad = (s: string, mine: boolean) => s + NBSP.repeat(mine ? 14 : 10);
const two = (n: number) => (n < 10 ? '0' : '') + n;
// Times are wall-clock ms: the data's timestamps are local times written with a Z (nobody writes
// between midnight and 7am), so they are read with UTC getters. Day labels are the view's (they
// depend on today's date); every row here is the same whatever the date, so the first window
// is baked into the plan.
const hhmm = (at: number) => { const d = new Date(at); return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`; };

// A voice note's waveform: 30 bars, heights seeded by the message id, as one SVG path.
function wave(seed: number): string {
  let s = seed * 9301 + 49297, d = '';
  for (let i = 0; i < 30; i++) {
    s = (s * 9301 + 49297) % 233280;
    const h = 3 + Math.round((s / 233280) * 17), x = i * 5;
    d += `M${x} ${12 - h / 2}h3v${h}h-3z`;
  }
  return d;
}

const blank: Row = { id: '', kind: 'text', mine: false, text: '', time: '', photo: '', w: 0, h: 0, wave: '', dur: '', tail: false, gap: 0, day: 0 };

function toRow(m: Msg, at: number): Row {
  const mine = m.author === 'me', time = hhmm(at), id = String(m.id);
  if (m.type === 'photo') {
    const w = 252, h = Math.round(Math.min(w * ((ratios as Record<string, number>)[m.photo!] ?? 1), 336));
    return { ...blank, id, kind: 'photo', mine, time, photo: `assets/photos/${m.photo}`, w, h, text: m.text ? pad(m.text, mine) : '' };
  }
  if (m.type === 'voice') {
    const s = m.duration!;
    return { ...blank, id, kind: 'voice', mine, time, wave: wave(m.id), dur: `${Math.floor(s / 60)}:${two(s % 60)}` };
  }
  return { ...blank, id, kind: 'text', mine, time, text: pad(m.text!, mine) };
}

// One sequence: the 10,000 stored messages, then the live ones. A live message is stored on the
// data's calendar (the day after the last stored one), since the view moves every day alike.
const all = messages as Msg[];
const live: Entry[] = [];
const ats: number[] = [];
const total = () => all.length + live.length;
const msg = (k: number): Msg => (k < all.length ? all[k] : live[k - all.length].m);
const at = (k: number): number => {
  if (k >= all.length) return live[k - all.length].at;
  return ats[k] ?? (ats[k] = Date.parse(all[k].timestamp));
};
const dayOf = (k: number) => Math.floor(at(k) / DAY);
const lastDay = Math.floor(Date.parse(all[all.length - 1].timestamp) / DAY);

// Rows for messages [s, e): a day separator where the day changes, spacing by author, and a tail
// on the last bubble of each run. Each row reads only its neighbours, so a window costs the same
// wherever it is and however long the conversation is.
function rows(s: number, e: number): Row[] {
  const out: Row[] = [];
  const n = total();
  for (let k = s; k < e; k++) {
    const m = msg(k), d = dayOf(k), newDay = k === 0 || dayOf(k - 1) !== d;
    if (newDay) out.push({ ...blank, id: `d-${d}`, kind: 'day', gap: 10, day: d });
    const r = toRow(m, at(k));
    r.gap = newDay ? 4 : msg(k - 1).author !== m.author ? 8 : 2;
    r.tail = k === n - 1 || dayOf(k + 1) !== d || msg(k + 1).author !== m.author;
    out.push(r);
  }
  return out;
}

// cursor "" is the newest window (the transcript's end); otherwise the index of its first message.
function feed(cursor: string): Result<'feed'> {
  const n = total();
  const s = cursor === '' ? Math.max(0, n - TAIL) : Math.min(Math.max(0, Number(cursor)), Math.max(0, n - WINDOW));
  const e = cursor === '' ? n : Math.min(n, s + WINDOW);
  // An older window always has a later side: past its end is the newest window, live.
  const later = s + STEP + WINDOW >= n ? '' : String(s + STEP);
  return { rows: rows(s, e), earlier: String(Math.max(0, s - STEP)), later, hasEarlier: s > 0, hasLater: cursor !== '', lastDay };
}

let nextId = 100001, pool = 0;
let incomingTexts: string[] | undefined;
// `now` is the epoch, `offset` the zone's minutes east: the message lands at the wall-clock time,
// moved back by the same whole days the view moves the stored ones forward.
function push(author: string, text: string, now: number, offset: number) {
  const wall = now + offset * 60000;
  const shift = (Math.floor(wall / DAY) - 1 - lastDay) * DAY;
  live.push({ m: { id: nextId++, author, timestamp: '', type: 'text', text }, at: wall - shift });
  return { n: live.length };
}

const sources: Sources = {
  feed: ([cursor]) => feed(cursor),
  incoming: ([now, offset]) => {
    incomingTexts ??= all.filter((m) => m.author === 'them' && m.type === 'text').map((m) => m.text!);
    return push('them', incomingTexts[pool++ % incomingTexts.length], now, offset);
  },
  sendMessage: ([text, now, offset]) => push('me', text, now, offset),
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
