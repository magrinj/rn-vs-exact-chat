import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { photos } from './data/photos';
import { waves } from './data/waves';
import { dayLabel, type DayRow, type MsgRow, type Row } from './chat';

// Pre-rendered @3x from the former react-native-svg paths (scripts/build-rows.mjs):
// one bitmap view per element instead of an Svg + Path pair rasterised on every mount.
const IMG = {
  tailOut: require('./data/ui/tail-out.png'),
  tailIn: require('./data/ui/tail-in.png'),
  ticks: require('./data/ui/ticks-read.png'),
  ticksWhite: require('./data/ui/ticks-white.png'),
  play: require('./data/ui/play.png'),
};

export const C = {
  wallpaper: '#EFEAE2',
  out: '#D9FDD3',
  in: '#FFFFFF',
  meta: '#667781',
  tick: '#53BDEB',
  text: '#111B21',
  bar: '#F6F6F6',
  green: '#25D366',
};

// Fixed geometry, mirrored in fixedSize() so Legend List never has to measure these rows.
const DAY_H = 40;
const VOICE_H = 54;
const PHOTO_W = 260;
const PHOTO_PAD = 3;
const IMG_W = PHOTO_W - PHOTO_PAD * 2;
const gap = (r: MsgRow) => (r.first ? 8 : 2);
const imgH = (photo: string) => Math.round(Math.min(Math.max(IMG_W / photos[photo].ratio, 160), 340));

export const itemType = (r: Row) => (r.kind === 'day' ? 'day' : r.m.type + (r.m.text ? 't' : ''));

export function fixedSize(r: Row): number | undefined {
  if (r.kind === 'day') return DAY_H;
  if (r.m.type === 'voice') return gap(r) + VOICE_H;
  if (r.m.type === 'photo' && !r.m.text) return gap(r) + imgH(r.m.photo!) + PHOTO_PAD * 2;
  return undefined; // text and captioned photos are measured
}

const Tail = ({ me }: { me: boolean }) => (
  <Image source={me ? IMG.tailOut : IMG.tailIn} style={[s.tail, me ? s.tailMe : s.tailThem]} transition={0} />
);

const Ticks = ({ white }: { white?: boolean }) => <Image source={white ? IMG.ticksWhite : IMG.ticks} style={s.ticks} transition={0} />;

function Meta({ r, light }: { r: MsgRow; light?: boolean }) {
  const me = r.m.author === 'me';
  return (
    <View style={[s.meta, light && s.metaLight]}>
      <Text style={[s.time, light && s.timeLight]}>{r.time}</Text>
      {me && <Ticks white={light} />}
    </View>
  );
}

// Transparent copy of the meta at the end of the text: reserves room so the timestamp
// sits inside the bubble on the last line, wrapping to its own line only when needed.
const Spacer = ({ r }: { r: MsgRow }) => (
  <Text style={s.spacer}>{'  ' + r.time + (r.m.author === 'me' ? '     ' : '')}</Text>
);

const fmtDur = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function Bubble({ r }: { r: MsgRow }) {
  const { m } = r;
  const me = m.author === 'me';
  const bubble = [s.bubble, me ? s.out : s.in, r.tail && (me ? s.tailCornerMe : s.tailCornerThem)];

  if (m.type === 'voice') {
    return (
      <View style={[bubble, s.voice]}>
        <Image source={IMG.play} style={s.play} transition={0} />
        <View style={s.wave}>
          <Image source={waves[m.id]} style={s.waveImg} recyclingKey={r.key} transition={0} />
          <Text style={s.dur}>{fmtDur(m.duration!)}</Text>
        </View>
        <Meta r={r} />
        {r.tail && <Tail me={me} />}
      </View>
    );
  }

  if (m.type === 'photo') {
    const h = imgH(m.photo!);
    return (
      <View style={[bubble, s.photoBubble]}>
        <Image source={photos[m.photo!].src} style={{ width: IMG_W, height: h, borderRadius: 14 }} contentFit="cover" recyclingKey={r.key} transition={0} />
        {m.text ? (
          <Text style={s.caption}>
            {m.text}
            <Spacer r={r} />
          </Text>
        ) : null}
        <Meta r={r} light={!m.text} />
        {r.tail && <Tail me={me} />}
      </View>
    );
  }

  return (
    <View style={[bubble, s.textBubble]}>
      <Text style={s.text}>
        {m.text}
        <Spacer r={r} />
      </Text>
      <Meta r={r} />
      {r.tail && <Tail me={me} />}
    </View>
  );
}

function Day({ r }: { r: DayRow }) {
  return (
    <View style={s.day}>
      <View style={s.pill}>
        <Text style={s.pillText}>{dayLabel(r.day)}</Text>
      </View>
    </View>
  );
}

export const ChatRow = memo(function ChatRow({ item }: { item: Row }) {
  if (item.kind === 'day') return <Day r={item} />;
  return (
    <View style={[s.row, { paddingTop: gap(item) }, item.m.author === 'me' ? s.rowMe : s.rowThem]}>
      <Bubble r={item} />
    </View>
  );
});

const s = StyleSheet.create({
  row: { paddingHorizontal: 16 },
  rowMe: { alignItems: 'flex-end', paddingLeft: 60 },
  rowThem: { alignItems: 'flex-start', paddingRight: 60 },
  bubble: { borderRadius: 18, maxWidth: '100%' },
  out: { backgroundColor: C.out },
  in: { backgroundColor: C.in },
  tailCornerMe: { borderBottomRightRadius: 4 },
  tailCornerThem: { borderBottomLeftRadius: 4 },
  tail: { position: 'absolute', bottom: 0 },
  tailMe: { right: -6, width: 10, height: 16 },
  tailThem: { left: -6, width: 10, height: 16 }, // mirrored at build time
  ticks: { width: 16, height: 11 },
  play: { width: 20, height: 22 },
  waveImg: { width: 150, height: 24 },
  textBubble: { paddingHorizontal: 11, paddingTop: 6, paddingBottom: 7 },
  text: { fontSize: 17, lineHeight: 22, color: C.text },
  spacer: { fontSize: 11, color: 'transparent' },
  meta: { position: 'absolute', right: 9, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaLight: { right: 10, bottom: 8 },
  time: { fontSize: 11, color: C.meta, fontVariant: ['tabular-nums'] },
  timeLight: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  photoBubble: { padding: PHOTO_PAD, width: PHOTO_W },
  caption: { fontSize: 17, lineHeight: 22, color: C.text, paddingHorizontal: 8, paddingTop: 5, paddingBottom: 4 },
  voice: { height: VOICE_H, width: 250, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, gap: 12 },
  wave: { height: VOICE_H, paddingTop: 9 },
  dur: { fontSize: 11, color: C.meta, marginTop: 2, fontVariant: ['tabular-nums'] },
  day: { height: DAY_H, alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 10, height: 24, justifyContent: 'center' },
  pillText: { fontSize: 12.5, fontWeight: '500', color: '#54656F' },
});
