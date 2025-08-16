// apps/mobile/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  Switch,
  Pressable,
} from "react-native";

import {
  initialState as coreInitialState,
  applyCommand as coreApplyCommand,
} from "../../packages/game-core/src/reducer";

// --- Types kept loose so this file stays ergonomic while core evolves ---
type CoreGameState = {
  version: number;
  phase?: "Lobby" | "Bidding" | "Trick" | "Scoring" | "RoundEnd";
  players: { id: string }[];
  turn: string | null;
  rngSeed?: string;
  turnSeconds?: number;
  timer?: number | null;
  handSizes?: number[];
  roundIndex?: number;
  leadIndex?: number;
  scores?: Record<string, number>;
  bids?: Record<string, number | undefined>;
  trump?: string; // "NT" | "♠" | "♥" | "♦" | "♣"
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

function sumBids(bids: Record<string, number | undefined> | undefined) {
  if (!bids) return 0;
  return Object.values(bids).reduce((a, v) => a + (typeof v === "number" ? v : 0), 0);
}

function nextAfter(id: string, players: { id: string }[]) {
  const idx = Math.max(0, players.findIndex((p) => p.id === id));
  return players[(idx + 1) % players.length]?.id;
}

function currentHandSize(state: CoreGameState | null) {
  if (!state?.handSizes) return 0;
  const idx = state.roundIndex ?? 0;
  return state.handSizes[idx] ?? 0;
}

// --- Small UI primitives ----------------------------------------------------
function Chip(props: { label: string; onPress?: () => void; active?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={!props.onPress}
      style={[
        styles.chip,
        props.active && styles.chipActive,
        props.danger && styles.chipDanger,
        !props.onPress && styles.chipDisabled,
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
  const [error, setError] = useState<string | null>(null);
  const [autoTick, setAutoTick] = useState(true);

  const initialState = useMemo(() => coreInitialState, []);
  const applyCommand = useMemo(() => coreApplyCommand, []);

  const boot = () => {
    try {
      const raw = initialState?.("seed-123");
      const s = normalizeState<CoreGameState>(raw);
      setState(s);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  useEffect(() => {
    boot();
  }, []);

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

  // Handlers
  const onAddPlayer = () => run({ type: "ADD_PLAYER", playerId: "you" });
  const onAddBot = () => run({ type: "ADD_PLAYER", playerId: "bot" });
  const onStartGame = () =>
    run({
      type: "START_GAME",
      handSizes: [5, 4, 3],
      turnSeconds: 10,
      scoring: { exactBonus: 10, missMode: "zero" },
    });
  const onNextTurn = () => run({ type: "NEXT_TURN" });
  const onNextHand = () => run({ type: "NEXT_HAND" });
  const onTick = () => run({ type: "TICK" });

  const onBid = (amount: number) => {
    if (!state || !state.turn) return;
    run({ type: "PLACE_BID", playerId: state.turn, bid: amount });
  };
  const setTrumpCmd = (t: string) => run({ type: "SET_TRUMP", trump: t });

  const playCard = (card: string) => {
    if (!state || !state.turn) return;
    run({ type: "PLAY_CARD", playerId: state.turn, card });
  };

  // Derived UI info
  const handN = currentHandSize(state);
  const leaderId = state?.players?.[state?.leadIndex ?? 0]?.id;
  const isBidding = state?.phase === "Bidding";
  const isLastBidder = isBidding && state?.turn && leaderId && nextAfter(state.turn, state.players) === leaderId;
  const forbidden = isLastBidder ? handN - sumBids(state?.bids) : null;

  const yourHand = state?.turn ? state?.hands?.[state.turn] ?? [] : [];
  const biddingRange = Array.from({ length: handN + 1 }, (_, i) => i).filter(
    (n) => !(forbidden != null && n === forbidden)
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.h1}>Plump (Dev)</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Error */}
        {error && (
          <Section title="Startup error" defaultOpen>
            <Text style={styles.code}>{error}</Text>
            <View style={styles.row}><Chip label="Retry boot" onPress={boot} /></View>
          </Section>
        )}

        {/* Summary bar */}
        <View style={styles.cardRow}>
          <Chip label={`Phase: ${state?.phase ?? "—"}`} />
          <Chip label={`Turn: ${state?.turn ?? "—"}`} />
          <Chip label={`Timer: ${state?.timer ?? "—"}`} />
        </View>
        <View style={styles.cardRow}>
          <Chip label={`Hand: ${handN}`} />
          <Chip label={`Trump: ${state?.trump ?? "NT"}`} />
          <View style={styles.switchRow}>
            <Text>Auto tick</Text>
            <Switch value={autoTick} onValueChange={setAutoTick} />
          </View>
        </View>

        {/* Phase-aware controls */}
        {state?.phase === "Lobby" && (
          <View style={styles.cardRow}>
            <Chip label="Add player 'you'" onPress={onAddPlayer} />
            <Chip label="Add bot" onPress={onAddBot} />
            <Chip label="Start game" onPress={onStartGame} active />
          </View>
        )}

        {state?.phase === "Bidding" && (
          <>
            <Section title="Bidding" defaultOpen>
              <Text style={{ marginBottom: 6 }}>
                It’s <Text style={styles.bold}>{state?.turn}</Text> to bid. Max = {handN}
              </Text>
              {isLastBidder && (
                <Text style={{ color: "#a00", marginBottom: 6 }}>Forbidden bid: {String(forbidden)}</Text>
              )}
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
          </>
        )}

        {state?.phase === "Trick" && (
          <>
            <Section title="Play" defaultOpen>
              <Text style={{ marginBottom: 6 }}>
                Your hand ({state?.turn ?? "—"}):
              </Text>
              <View style={styles.cardRowWrap}>
                {yourHand.map((c) => (
                  <Chip key={c} label={c} onPress={() => playCard(c)} />
                ))}
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

              <View style={[styles.cardRow, { marginTop: 10 }]}>
                <Chip label="Tick (-1s)" onPress={onTick} />
                <Chip label="Next turn" onPress={onNextTurn} />
              </View>
            </Section>
          </>
        )}

        {state?.phase === "Scoring" && (
          <View style={styles.cardRow}>
            <Chip label="Next hand" onPress={onNextHand} active />
          </View>
        )}

        {state?.phase === "RoundEnd" && (
          <View style={styles.cardRow}>
            <Chip label="New game" onPress={boot} active />
          </View>
        )}

        {/* Compact debug info (collapsible) */}
        <Section title="Players" defaultOpen>
          <View style={styles.cardRowWrap}>
            {(state?.players ?? []).map((p) => (
              <Chip key={p.id} label={p.id} active={p.id === state?.turn} />
            ))}
          </View>
        </Section>

        <Section title="Bids" defaultOpen={false}>
          {state?.players?.map((p) => (
            <Text key={p.id}>• {p.id}: {state?.bids?.[p.id] ?? "—"}</Text>
          ))}
        </Section>

        <Section title="Scores" defaultOpen={false}>
          {state?.players?.map((p) => (
            <Text key={p.id}>• {p.id}: {state?.scores?.[p.id] ?? 0}</Text>
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

  // Chips / compact buttons
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
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 8 },

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

  code: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as any,
    fontSize: 12,
    color: "#333",
  },
});
