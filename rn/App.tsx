import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Settings, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardGestureArea, KeyboardProvider, KeyboardStickyView } from 'react-native-keyboard-controller';
import { KeyboardAwareLegendList } from '@legendapp/list/keyboard';
import type { LegendListRef } from '@legendapp/list/react-native';
import { ALL, atLive, followArrival, initialWin, pageDown, pageUp, pushNow, randomIncoming, type Row, type Win } from './src/chat';
import { C, ChatRow, fixedSize, itemType } from './src/Row';
import { photos } from './src/data/photos';

const Icon = ({ name, size = 24, color = '#000' }: { name: SFSymbol; size?: number; color?: string }) => (
  <SymbolView name={name} size={size} tintColor={color} weight="regular" style={{ width: size + 4, height: size + 4 }} />
);

const renderItem = ({ item }: { item: Row }) => <ChatRow item={item} />;
const keyExtractor = (r: Row) => r.key;
const getFixedItemSize = (r: Row) => fixedSize(r);

// Launch-argument driver (`devicectl device process launch <bundle> -bench top|up|type|send|scroll`),
// read once from NSUserDefaults. Inert without the argument; used only to film the proofs on device.
const BENCH = Settings.get('bench') as string | undefined;

function Header() {
  const { top } = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: top }]}>
      <View style={s.headerRow}>
        <Icon name="chevron.left" size={22} />
        <Text style={s.unread}>12</Text>
        <Image source={photos['photo_12.jpg'].src} style={s.avatar} />
        <View style={s.headerTitle}>
          <Text style={s.name} numberOfLines={1}>Camille</Text>
          <Text style={s.status}>en ligne</Text>
        </View>
        <Icon name="video" size={24} />
        <View style={{ width: 22 }} />
        <Icon name="phone" size={21} />
      </View>
    </View>
  );
}

function Composer({ onSend }: { onSend: (t: string) => void }) {
  const { bottom } = useSafeAreaInsets();
  const [text, setText] = useState('');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const send = () => {
    const t = text.trim();
    if (t) onSend(t);
    setText('');
  };
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (BENCH !== 'type' && BENCH !== 'send') return;
    const a = setTimeout(() => {
      input.current?.focus();
      setText('Parfait, on se retrouve à 19h 👍');
    }, 2500);
    const b = BENCH === 'send' ? setTimeout(() => sendRef.current(), 6000) : undefined;
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);
  return (
    <View style={[s.composer, { paddingBottom: Math.max(bottom, 8) }]}>
      <Icon name="plus" size={24} />
      <View style={s.inputWrap}>
        <TextInput ref={input} style={s.input} value={text} onChangeText={setText} multiline placeholder="" />
        <Icon name="face.smiling" size={20} color="#3C3C43" />
      </View>
      {text ? (
        <Pressable onPress={send} style={s.send} hitSlop={8} accessibilityLabel="Envoyer">
          <SymbolView name="paperplane.fill" size={16} tintColor="#FFF" style={{ width: 18, height: 18 }} />
        </Pressable>
      ) : (
        <>
          <Icon name="camera" size={22} />
          <Icon name="mic" size={22} />
        </>
      )}
    </View>
  );
}

function Chat() {
  const listRef = useRef<LegendListRef>(null);
  const { bottom } = useSafeAreaInsets();
  const [win, setWin] = useState<Win>(initialWin);
  // Bounded slice of ALL: an arrival costs O(window), never O(history).
  const data = useMemo(() => ALL.slice(win.lo, win.hi), [win]);

  useEffect(() => {
    const t = setInterval(() => {
      const prevLen = ALL.length;
      pushNow('them', randomIncoming());
      const nearEnd = listRef.current?.getState().isNearEnd ?? true;
      setWin((w) => followArrival(w, prevLen, nearEnd)); // same object -> no render, no list work
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const onSend = useCallback((text: string) => {
    const prevLen = ALL.length;
    pushNow('me', text);
    setWin((w) => (w.hi === prevLen ? followArrival(w, prevLen, true) : initialWin()));
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const onStartReached = useCallback(() => setWin(pageUp), []);
  const onEndReached = useCallback(() => setWin(pageDown), []);

  useEffect(() => {
    if (BENCH === 'top') {
      // keep jumping to the top of the window; onStartReached pages older rows in until message 1
      const t = setInterval(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), 300);
      return () => clearInterval(t);
    }
    if (BENCH === 'up') {
      // read slightly above the bottom while messages keep arriving below
      const t = setTimeout(() => {
        const st = listRef.current?.getState();
        if (st) listRef.current?.scrollToOffset({ offset: st.scroll - 1200, animated: false });
      }, 2500);
      return () => clearTimeout(t);
    }
    if (BENCH === 'scroll') {
      // steady animated scroll up, for hitch traces
      const t = setInterval(() => {
        const st = listRef.current?.getState();
        if (st) listRef.current?.scrollToOffset({ offset: Math.max(0, st.scroll - 1400), animated: true });
      }, 450);
      return () => clearInterval(t);
    }
  }, []);

  const listProps = {
    ref: listRef,
    style: s.list,
    contentContainerStyle: s.content,
    data,
    renderItem,
    keyExtractor,
    getItemType: itemType,
    getFixedItemSize,
    estimatedItemSize: 89, // measured mean row height (text 65, photo 269, voice 58, day 40)
    recycleItems: true,
    alignItemsAtEnd: true,
    initialScrollAtEnd: true,
    // only follow the end when the window holds the live end, else appended pages would chain-scroll
    maintainScrollAtEnd: atLive(win),
    maintainVisibleContentPosition: true,
    onStartReached,
    onEndReached,
    onStartReachedThreshold: 1,
    onEndReachedThreshold: 1,
    keyboardDismissMode: 'interactive' as const,
  };


  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <Header />
      <KeyboardGestureArea interpolator="ios" offset={60} style={s.flex}>
        <KeyboardAwareLegendList {...listProps} keyboardOffset={bottom} />
      </KeyboardGestureArea>
      <KeyboardStickyView offset={{ closed: 0, opened: bottom }}>
        <Composer onSend={onSend} />
      </KeyboardStickyView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <Chat />
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.wallpaper },
  list: { flex: 1, backgroundColor: C.wallpaper },
  content: { paddingBottom: 8 },
  header: { backgroundColor: C.bar, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8' },
  headerRow: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  unread: { fontSize: 17, marginLeft: 2, marginRight: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  headerTitle: { flex: 1, marginLeft: 10 },
  name: { fontSize: 17, fontWeight: '600', color: '#000' },
  status: { fontSize: 12.5, color: '#8E8E93', marginTop: 1 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingTop: 7, backgroundColor: C.bar, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C6C6C8' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', minHeight: 36, borderRadius: 18, backgroundColor: '#FFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#C6C6C8', paddingLeft: 12, paddingRight: 6, paddingBottom: 4 },
  input: { flex: 1, fontSize: 17, maxHeight: 120, paddingTop: 7, paddingBottom: 3 },
  send: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
