import prepared from './data/rows.json';

export type Message = {
  id: number;
  author: 'me' | 'them';
  type: 'text' | 'photo' | 'voice';
  text?: string;
  photo?: string;
  duration?: number;
};

/** `day` is a UTC day index in data space; the label adds SHIFT_DAYS at render time. */
export type DayRow = { kind: 'day'; key: string; day: number };
export type MsgRow = {
  kind: 'msg';
  key: string;
  m: Message;
  day: number;
  time: string; // "HH:MM"
  first: boolean; // first of a same-author group -> bigger top gap
  tail: boolean; // last of a same-author group -> bubble tail
};
export type Row = DayRow | MsgRow;

const DAY = 86_400_000;
const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

// "Wall clock" ms: data timestamps are read as local wall time (UTC getters), and "now"
// is converted into the same space, so day maths never touches timezones.
const wallNow = () => Date.now() - new Date().getTimezoneOffset() * 60_000;
const todayIdx = () => Math.floor(wallNow() / DAY);

/**
 * Every row ever: the 10,000 prepared at build time (scripts/build-rows.mjs) + live ones.
 * Append-only (one push per arrival); the list only ever sees a bounded slice of it.
 */
export const ALL: Row[] = (prepared as unknown as { rows: Row[] }).rows;
const incoming = (prepared as unknown as { incoming: number[] }).incoming;

// ponytail: the data ends 2025-08-15; shift whole days so the last message is today,
// otherwise "Aujourd'hui"/"Hier" would never show. Only this offset is computed at launch.
const SHIFT_DAYS = todayIdx() - ALL[ALL.length - 1].day;

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const WD_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Label for a data-space day index. */
export function dayLabel(dataDay: number): string {
  const day = dataDay + SHIFT_DAYS;
  const diff = todayIdx() - day;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  const d = new Date(day * DAY);
  if (diff < 7) return cap(WEEKDAYS[d.getUTCDay()]);
  const base = `${cap(WD_SHORT[d.getUTCDay()])} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === new Date(wallNow()).getUTCFullYear() ? base : `${base} ${d.getUTCFullYear()}`;
}

let nextId = Number((ALL[ALL.length - 1] as MsgRow).m.id) + 1;

/** O(1): pushes a message sent/received now onto ALL (plus a day row if the day changed). */
export function pushNow(author: Message['author'], text: string) {
  const wall = wallNow();
  const day = Math.floor(wall / DAY) - SHIFT_DAYS;
  const last = ALL[ALL.length - 1];
  let first = true;
  if (last.day !== day) {
    ALL.push({ kind: 'day', key: 'd' + day, day });
  } else if (last.kind === 'msg' && last.m.author === author) {
    first = false;
    ALL[ALL.length - 1] = { ...last, tail: false }; // new object so the list re-renders it
  }
  const d = new Date(wall);
  ALL.push({
    kind: 'msg',
    key: '' + nextId,
    m: { id: nextId++, author, type: 'text', text },
    day,
    time: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()),
    first,
    tail: true,
  });
}

export const randomIncoming = () => (ALL[incoming[(Math.random() * incoming.length) | 0]] as MsgRow).m.text!;

// ---- window over ALL that the list renders: [lo, hi) ----
export const INITIAL = 200; // rows mounted at launch
export const PAGE = 200; // rows added per onStartReached / onEndReached
export const MAX = 600; // window cap: an arrival or a page load never touches more than this

export type Win = { lo: number; hi: number };
export const initialWin = (): Win => ({ lo: Math.max(0, ALL.length - INITIAL), hi: ALL.length });
export const atLive = (w: Win) => w.hi === ALL.length;

/** After a push: a window that was showing the live end follows it, otherwise it doesn't move. */
export function followArrival(w: Win, prevLen: number, nearEnd: boolean): Win {
  if (w.hi !== prevLen) return w; // reading history: the arrival is not in the list, zero list work
  const hi = ALL.length;
  if (hi - w.lo <= MAX + PAGE) return { lo: w.lo, hi };
  // window full: at the bottom, trim old rows far above in one chunk (MVCP keeps the view still);
  // reading higher up, detach from the live end instead (onEndReached brings arrivals back later)
  return nearEnd ? { lo: hi - MAX, hi } : w;
}

export function pageUp(w: Win): Win {
  if (w.lo === 0) return w;
  const lo = Math.max(0, w.lo - PAGE);
  return { lo, hi: Math.min(w.hi, lo + MAX) }; // drop rows far below the viewport
}

export function pageDown(w: Win): Win {
  if (w.hi === ALL.length) return w;
  const hi = Math.min(ALL.length, w.hi + PAGE);
  return { lo: Math.max(w.lo, hi - MAX), hi }; // drop rows far above the viewport
}
