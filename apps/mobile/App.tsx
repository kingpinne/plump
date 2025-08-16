// apps/mobile/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
} from "react-native";

import {
  initialState as coreInitialState,
  applyCommand as coreApplyCommand,
} from "../../packages/game-core/src/reducer";

// --- Types, intentionally loose for app ergonomics ---
type Player = { id: string; kind?: "human" | "bot" };
type CoreGameState = {
  version: number;
  phase?: "Lobby" | "Bidding" | "Trick" | "Scoring" | "RoundEnd";
  players: Player[];
  turn: string | null;
  rngSeed?: string;
  turnSeconds?: number;
  timer?: number | null;
  handSizes?: number[];
  roundIndex?: number;
  leadIndex?: number;
  scores?: Record<string, number>;
  bids?: Record<string, number | undefined>;
  trump?: "NT" | "♠" | "♥" | "♦" | "♣";
  scoring?: { exactBonus: number; missMode: "zero" | "wins" };
  deck?: string[];
  hands?: Record<string, string[]>;
  trick?: { leader: string; plays: { playerId: string; card: string }[] };
  tableWins?: Record<string, number>;
};

// --- Helpers ----------------------------------------------------------------
function normalizeState<T extends object>(maybe: any): T {
  if (maybe && typeof maybe === "object") {
    if ("state" in maybe && maybe.state) return maybe.state as T;
    return maybe as T;
  }
  throw new Error("initialState() returned undefined/null");
}
const RANKS = ["A","K","Q","J","10","9","8","7","6","5","4","3","2"];
const rankIndex = (card: string) => RANKS.indexOf(card.slice(0, card.length - 1));
const suitOf = (card: string) => card.slice(-1);
const sumBids = (b: Record<string, number | undefined> | undefined) =>
  Object.values(b ?? {}).reduce((a, v) => a + (typeof v === "number" ? v : 0), 0);

const nextAfter = (id: string, players: Player[]) => {
  const idx = Math.max(0, players.findIndex(p => p.id === id));
  return players[(idx + 1) % players.length]?.id;
};

const currentHandSize = (state: CoreGameState | null) => {
  if (!state?.handSizes) return 0;
  const idx = state.roundIndex ?? 0;
  return state.handSizes[idx] ?? 0;
};

// --- Small UI primitives ----------------------------------------------------
function Chip(props: { label: string; onPress?: () => void; active?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={!props.onPress || props.disabled}
      style={[
        styles.chip,
        props.active && styles.chipActive,
        props.danger && styles.chipDanger,
        (props.disabled || !props.onPress) && styles.chipDisabled,
      ]}
    >
      <Text style={[styles.chipText, props.active && styles.chipTextActive]}>{props.label}</Text>
    </Pressable>
  );
}
function Section(props: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!props.defaultOpen);
  return (
    <View style={styles.section}>
      <Pressable onPress={() => setOpen(!open)} style={styles.sectionHeader}>
        <Text style={styles.h2}>{props.title}</Text>
        <Text style={styles.disclosure}>{open ? "▾" : "▸"}</Text>
      </Pressable>
      {open && <View style={{ paddingTop: 6 }}>{props.children}</View>}
    </View>
  );
}

// --- App --------------------------------------------------------------------
export default function App() {
  const [state, setState] = useState<CoreGameState | null>(null);
  const [autoTick, setAutoTick] = useState(true);
  const [botsOn, setBotsOn] = useState(true);
  const botTimer = useRef<any>(null); // <-- single declaration

  const initialState = useMemo(() => coreInitialState, []);
  const applyCommand = useMemo(() => coreApplyCommand, []);

  const boot = () => {
    const raw = initialState?.("seed-123");
    const s = normalizeState<CoreGameState>(raw);
    setState(s);
  };

  useEffect(() => { boot(); }, []);

  // Auto-tick during Trick
  useEffect(() => {
    if (!state || state.phase !== "Trick" || !autoTick) return;
    const id = setInterval(() => {
      const result = applyCommand(state, { type: "TICK" } as any);
      const next = "state" in (result || {}) ? (result as any).state : normalizeState<CoreGameState>(result);
      setState(next);
    }, 1000);
    return () => clearInterval(id);
  }, [state?.phase, state?.timer, autoTick]);

  const run = (cmd: any) => {
    if (!state) return;
    const result = applyCommand(state, cmd);
    const next = "state" in (result || {}) ? (result as any).state : normalizeState<CoreGameState>(result);
    setState(next);
  };

  // --- Player management (single human) ------------------------------------
  const hasHuman = !!state?.players?.some(p => p.kind === "human");
  const seats = state?.players?.length ?? 0;
  const capacity = 7;

  const nextBotId = () => {
    for (let i = 1; i <= 7; i++) {
      const id = `bot${i}`;
      if (!state?.players?.some(p => p.id === id)) return id;
    }
    return `bot${Math.floor(1000 + Math.random()*9000)}`;
  };

  const addYou = () => {
    if (hasHuman || seats >= capacity) return;
    run({ type: "ADD_PLAYER", playerId: "you", kind: "human" });
  };
  const addBot = () => {
    if (seats >= capacity) return;
    run({ type: "ADD_PLAYER", playerId: nextBotId(), kind: "bot" });
  };
  const addThreeBots = () => { addBot(); addBot(); addBot(); };
  const removePlayer = (id: string) => run({ type: "REMOVE_PLAYER", playerId: id });

  // --- Game controls --------------------------------------------------------
  const onStartGame = () =>
    run({
      type: "START_GAME",
      handSizes: [1, 2, 3, 4, 5, 4, 3, 2, 1], // includes 1-card opener
      turnSeconds: 10,
      scoring: { exactBonus: 10, missMode: "zero" },
    });
  const onNextTurn = () => run({ type: "NEXT_TURN" });
  const onNextHand = () => run({ type: "NEXT_HAND" });
  const onBid = (amount: number) => {
    if (!state || !state.turn) return;
    run({ type: "PLACE_BID", playerId: state.turn, bid: amount });
  };
  const setTrumpCmd = (t: string) => run({ type: "SET_TRUMP", trump: t });
  const playCardCmd = (card: string) => {
    if (!state || !state.turn) return;
    run({ type: "PLAY_CARD", playerId: state.turn, card });
  };

  // --- Bot logic (UI-side helper; engine stays deterministic) ---------------
  const estimateBid = (hand: string[], trump: CoreGameState["trump"]) => {
    let score = 0;
    for (const c of hand) {
      const r = c.slice(0, c.length - 1);
      if (r === "A") score += 1;
      else if (r === "K") score += 0.6;
      else if (r === "Q") score += 0.3;
      if (trump && trump !== "NT" && suitOf(c) === trump) score += 0.4;
    }
    const n = hand.length;
    let bid = Math.max(0, Math.min(n, Math.round(score)));
    return bid;
  };
  const legalCards = (hand: string[], trick: CoreGameState["trick"]) => {
    if (!trick || !trick.plays.length) return hand.slice();
    const lead = suitOf(trick.plays[0].card);
    const follow = hand.filter(c => suitOf(c) === lead);
    return follow.length ? follow : hand.slice();
  };
  const chooseBotCard = (hand: string[], trick: CoreGameState["trick"]) => {
    const legals = legalCards(hand, trick);
    let worst = legals[0];
    for (let i = 1; i < legals.length; i++) {
      if (rankIndex(legals[i]) > rankIndex(worst)) worst = legals[i];
    }
    return worst;
  };

  // Fire bot actions with a small delay so UI is readable
  useEffect(() => {
    if (!state || !botsOn) return;
    if (!state.turn) return;
    const actor = state.players.find(p => p.id === state.turn);
    if (!actor || actor.kind !== "bot") return;

    clearTimeout(botTimer.current);
    botTimer.current = setTimeout(() => {
      if (!state || state.turn !== actor.id) return;
      if (state.phase === "Bidding") {
        const hand = state.hands?.[actor.id] ?? [];
        const max = currentHandSize(state);
        const total = sumBids(state.bids);
        let bid = estimateBid(hand, state.trump);
        const leaderId = state.players[state.leadIndex ?? 0]?.id;
        const lastBidder = leaderId && nextAfter(actor.id, state.players) === leaderId;
        if (lastBidder && total + bid === max) {
          if (bid > 0) bid -= 1; else if (bid < max) bid += 1;
        }
        run({ type: "PLACE_BID", playerId: actor.id, bid });
      } else if (state.phase === "Trick") {
        const hand = state.hands?.[actor.id] ?? [];
        if (hand.length === 0) return;
        run({ type: "PLAY_CARD", playerId: actor.id, card: chooseBotCard(hand, state.trick) });
      }
    }, 300);
    return () => clearTimeout(botTimer.current);
  }, [state?.phase, state?.turn, state?.hands, state?.bids, botsOn]);

  // --- Derived UI info ------------------------------------------------------
  const handN = currentHandSize(state);
  const leaderId = state?.players?.[state?.leadIndex ?? 0]?.id;
  const isBidding = state?.phase === "Bidding";
  const isLastBidder = isBidding && state?.turn && leaderId && nextAfter(state.turn, state.players) === leaderId;
  const forbidden = isLastBidder ? handN - sumBids(state?.bids) : null;
  const yourHand = state?.turn ? state?.hands?.[state.turn] ?? [] : [];
  const biddingRange = Array.from({ length: handN + 1 }, (_, i) => i).filter(
    (n) => !(forbidden != null && n === forbidden)
  );

  // --- Render ----------------------------------------------------------------
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><Text style={styles.h1}>Plump (Single Player Dev)</Text></View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Summary */}
        <View style={styles.cardRow}>
          <Chip label={`Phase: ${state?.phase ?? "—"}`} />
          <Chip label={`Turn: ${state?.turn ?? "—"}`} />
          <Chip label={`Timer: ${state?.timer ?? "—"}`} />
        </View>
        <View style={styles.cardRow}>
          <Chip label={`Players: ${state?.players?.length ?? 0}/7`} />
          <Chip label={`Hand: ${handN}`} />
          <Chip label={`Trump: ${state?.trump ?? "NT"}`} />
        </View>
        <View style={styles.cardRow}>
          <View style={styles.switchRow}><Text>Auto tick</Text><Switch value={autoTick} onValueChange={setAutoTick} /></View>
          <View style={styles.switchRow}><Text>Bots auto</Text><Switch value={botsOn} onValueChange={setBotsOn} /></View>
        </View>

        {/* Lobby controls (single human + bots) */}
        {state?.phase === "Lobby" && (
          <>
            <View style={styles.cardRow}>
              <Chip label="Add YOU" onPress={addYou} disabled={hasHuman} active={!hasHuman} />
              <Chip label="Add bot" onPress={addBot} disabled={seats >= capacity} />
              <Chip label="Add +3 bots" onPress={addThreeBots} disabled={seats >= capacity} />
              <Chip label="Start game" onPress={onStartGame} active />
            </View>
            <Section title="Players" defaultOpen>
              <View style={styles.cardRowWrap}>
                {(state?.players ?? []).map((p) => (
                  <View key={p.id} style={{ flexDirection: "row", alignItems: "center", marginRight: 8, marginBottom: 8 }}>
                    <Chip label={`${p.kind === "bot" ? "🤖" : "🧑"} ${p.id}`} />
                    <Pressable onPress={() => removePlayer(p.id)} style={styles.removeBtn}>
                      <Text style={styles.removeBtnText}>✖</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </Section>
          </>
        )}

        {/* Bidding */}
        {state?.phase === "Bidding" && (
          <Section title="Bidding" defaultOpen>
            <Text style={{ marginBottom: 6 }}>
              It’s <Text style={styles.bold}>{state?.turn}</Text> to bid. Max = {handN}
            </Text>
            {isLastBidder && <Text style={{ color: "#a00", marginBottom: 6 }}>Forbidden: {String(forbidden)}</Text>}
            <View style={styles.cardRowWrap}>
              {biddingRange.map((n) => (
                <Chip key={n} label={`Bid ${n}`} onPress={() => onBid(n)} />
              ))}
            </View>

            <Text style={{ marginTop: 8, marginBottom: 6 }}>Trump:</Text>
            <View style={styles.cardRowWrap}>
              {["NT", "♠", "♥", "♦", "♣"].map((t) => (
                <Chip key={t} label={t} onPress={() => setTrumpCmd(t)} active={state?.trump === t} />
              ))}
            </View>
          </Section>
        )}

        {/* Trick play */}
        {state?.phase === "Trick" && (
          <Section title="Play" defaultOpen>
            <Text style={{ marginBottom: 6 }}>Current: {state?.turn}</Text>
            <View style={styles.cardRowWrap}>
              {yourHand.map((c) => (
                <Chip key={c} label={c} onPress={() => playCardCmd(c)} />
              ))}
            </View>
            <View style={[styles.cardRow, { marginTop: 8 }]}>
              <Chip label="Next turn" onPress={onNextTurn} />
            </View>
            {state?.trick && (
              <>
                <Text style={{ marginTop: 10, marginBottom: 6 }}>Table:</Text>
                <View style={styles.cardRowWrap}>
                  {state.trick.plays.map((pl, i) => (
                    <Chip key={i} label={`${pl.playerId} → ${pl.card}`} />
                  ))}
                </View>
              </>
            )}
          </Section>
        )}

        {state?.phase === "Scoring" && (
          <View style={styles.cardRow}><Chip label="Next hand" onPress={onNextHand} active /></View>
        )}

        {state?.phase === "RoundEnd" && (
          <View style={styles.cardRow}><Chip label="New game" onPress={boot} active /></View>
        )}

        {/* Debug info */}
        <Section title="Scores" defaultOpen={false}>
          {state?.players?.map((p) => (
            <Text key={p.id}>• {p.id}: {state?.scores?.[p.id] ?? 0}</Text>
          ))}
        </Section>
        <Section title="Bids" defaultOpen={false}>
          {state?.players?.map((p) => (
            <Text key={p.id}>• {p.id}: {state?.bids?.[p.id] ?? "—"}</Text>
          ))}
        </Section>
        <Section title="Hands (all)" defaultOpen={false}>
          {state?.hands &&
            Object.entries(state.hands).map(([pid, cards]) => (
              <Text key={pid}>• {pid}: {cards.join(", ")}</Text>
            ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Styles -----------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "white" },
  header: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  h1: { fontSize: 20, fontWeight: "700", color: "black" },
  body: { padding: 12, gap: 12 },
  h2: { fontSize: 16, fontWeight: "600" },
  bold: { fontWeight: "700" },

  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f1f1f1",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e1e1e1",
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: "#1b72ff20", borderColor: "#1b72ff70" },
  chipDanger: { backgroundColor: "#ffefef", borderColor: "#f1b1b1" },
  chipDisabled: { opacity: 0.6 },
  chipText: { fontSize: 14, color: "#222" },
  chipTextActive: { fontWeight: "700" },

  cardRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 4 },
  cardRowWrap: { flexDirection: "row", flexWrap: "wrap" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginRight: 12 },

  section: {
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#ececec",
    borderRadius: 10,
    padding: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  disclosure: { color: "#666" },

  removeBtn: {
    marginLeft: 4,
    backgroundColor: "#ffecec",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f3b7b7",
  },
  removeBtnText: { color: "#a00", fontWeight: "700" },
});
