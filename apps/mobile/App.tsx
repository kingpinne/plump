// apps/mobile/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Button,
  ScrollView,
  StyleSheet,
  Platform,
  Switch,
} from "react-native";

import {
  initialState as coreInitialState,
  applyCommand as coreApplyCommand,
} from "../../packages/game-core/src/reducer";

type CoreGameState = {
  version: number;
  phase?: string;
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
  trump?: string;
  scoring?: { exactBonus: number; missMode: "zero" | "wins" };
  deck?: string[];
  hands?: Record<string, string[]>;
  trick?: { leader: string; plays: { playerId: string; card: string }[] };
  tableWins?: Record<string, number>;
};

function normalizeState<T extends object>(maybe: any): T {
  if (maybe && typeof maybe === "object") {
    if ("state" in maybe && maybe.state) return maybe.state as T;
    return maybe as T;
  }
  throw new Error("initialState() returned undefined/null");
}

export default function App() {
  const [state, setState] = useState<CoreGameState | null>(null);
  const [rawInit, setRawInit] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoTick, setAutoTick] = useState(true);

  const initialState = useMemo(() => coreInitialState, []);
  const applyCommand = useMemo(() => coreApplyCommand, []);

  const boot = () => {
    try {
      const raw = initialState?.("seed-123");
      setRawInit(raw);
      const s = normalizeState<CoreGameState>(raw);
      setState(s);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
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

  // Handlers
  const onAddPlayer = () => run({ type: "ADD_PLAYER", playerId: "you" });
  const onAddBot = () => run({ type: "ADD_PLAYER", playerId: "bot" });
  const onStartGame = () => run({
    type: "START_GAME",
    handSizes: [5, 4, 3],
    turnSeconds: 10,
    scoring: { exactBonus: 10, missMode: "zero" }, // change to "wins" if you like
  });
  const onNextTurn = () => run({ type: "NEXT_TURN" });
  const onNextHand = () => run({ type: "NEXT_HAND" });
  const onTick = () => run({ type: "TICK" });

  const onBid = (amount: number) => {
    if (!state || !state.turn) return;
    run({ type: "PLACE_BID", playerId: state.turn, bid: amount });
  };
  const setTrump = (t: string) => run({ type: "SET_TRUMP", trump: t });

  const playFirstLegal = () => {
    if (!state || !state.turn) return;
    const hand = state.hands?.[state.turn];
    if (!hand || hand.length === 0) return;

    const trick = state.trick;
    let card = hand[0];
    if (trick?.plays?.length) {
      const leadSuit = trick.plays[0].card.slice(-1);
      const follow = hand.find(c => c.endsWith(leadSuit));
      card = follow ?? card;
    }
    run({ type: "PLAY_CARD", playerId: state.turn, card });
  };

  const currentHandSize = () => {
    if (!state?.handSizes) return 0;
    const idx = state.roundIndex ?? 0;
    return state.handSizes[idx] ?? 0;
  };

  // Helpers for UI hints
  const leaderId = state?.players?.[state?.leadIndex ?? 0]?.id;
  const isBidding = state?.phase === "Bidding";
  const isLastBidder =
    isBidding &&
    state?.turn &&
    leaderId &&
    nextAfter(state.turn, state.players) === leaderId;

  const totalPlaced = sumBids(state?.bids ?? {});
  const forbidden = isLastBidder ? (currentHandSize() - totalPlaced) : null;

  function sumBids(bids: Record<string, number | undefined>): number {
    return Object.values(bids).reduce((acc, v) => acc + (typeof v === "number" ? v : 0), 0);
  }
  function nextAfter(id: string, players: { id: string }[]) {
    const idx = Math.max(0, players.findIndex(p => p.id === id));
    return players[(idx + 1) % players.length].id;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.h1}>Plump (Dev)</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        {error && (
          <View style={styles.boxError}>
            <Text style={styles.h2}>Startup error</Text>
            <Text style={styles.code}>{error}</Text>
            <View style={styles.btn}><Button title="Retry boot" onPress={boot} /></View>
          </View>
        )}

        <View style={styles.box}>
          <Text style={styles.h2}>Game State</Text>
          {state ? (
            <>
              <Text>version: {String(state.version)}</Text>
              <Text>phase: {String(state.phase ?? "—")}</Text>
              <Text>roundIndex: {String(state.roundIndex)}</Text>
              <Text>current hand size: {String(currentHandSize())}</Text>
              <Text>leadIndex: {String(state.leadIndex)}</Text>
              <Text>turn: {String(state.turn)}</Text>
              <Text>timer: {String(state.timer)}</Text>
              <Text>trump: {String(state.trump)}</Text>
              <Text>scoring: exactBonus={state.scoring?.exactBonus} missMode={state.scoring?.missMode}</Text>

              <Text style={{ marginTop: 6 }}>players ({state.players?.length ?? 0}):</Text>
              {(state.players ?? []).map((p, i) => (
                <Text key={i}>• {p.id}</Text>
              ))}

              {!!state.bids && (
                <>
                  <Text style={{ marginTop: 6 }}>bids:</Text>
                  {state.players.map(p => (
                    <Text key={p.id}>• {p.id}: {state.bids?.[p.id] ?? "—"}</Text>
                  ))}
                </>
              )}

              {state.scores && Object.keys(state.scores).length > 0 && (
                <>
                  <Text style={{ marginTop: 6 }}>scores (cumulative):</Text>
                  {Object.entries(state.scores).map(([pid, n]) => (
                    <Text key={pid}>• {pid}: {n}</Text>
                  ))}
                </>
              )}

              {state.tableWins && (
                <>
                  <Text style={{ marginTop: 6 }}>tableWins (this hand):</Text>
                  {Object.entries(state.tableWins).map(([pid, n]) => (
                    <Text key={pid}>• {pid}: {n}</Text>
                  ))}
                </>
              )}

              {state.trick && (
                <>
                  <Text style={{ marginTop: 6 }}>trick:</Text>
                  <Text>leader: {state.trick.leader}</Text>
                  <Text>plays:</Text>
                  {state.trick.plays.map((pl, i) => (
                    <Text key={i}>• {pl.playerId} → {pl.card}</Text>
                  ))}
                </>
              )}

              {state.hands && (
                <>
                  <Text style={{ marginTop: 6 }}>hands:</Text>
                  {Object.entries(state.hands).map(([pid, cards]) => (
                    <Text key={pid}>• {pid}: {cards.join(", ")}</Text>
                  ))}
                </>
              )}
            </>
          ) : (
            <Text>Initializing…</Text>
          )}
        </View>

        {/* Settings */}
        <View style={styles.box}>
          <Text style={styles.h2}>Settings</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text>Auto tick</Text>
            <Switch value={autoTick} onValueChange={setAutoTick} />
          </View>
        </View>

        {/* Actions */}
        <View style={styles.row}>
          <View style={styles.btn}><Button title="Add player 'you'" onPress={onAddPlayer} /></View>
          <View style={styles.btn}><Button title="Add bot" onPress={onAddBot} /></View>
        </View>

        <View style={styles.row}>
          <View style={styles.btn}><Button title="Start Game" onPress={onStartGame} /></View>
          <View style={styles.btn}><Button title="Next turn" onPress={onNextTurn} /></View>
        </View>

        {/* Bidding controls */}
        <View style={styles.box}>
          <Text style={styles.h2}>Bidding</Text>
          <Text>It is {String(state?.turn)}'s bid. Max = {currentHandSize()}</Text>
          {isLastBidder && (
            <Text style={{ color: "#a00", marginBottom: 6 }}>
              Forbidden for last bidder: {String(forbidden)}
            </Text>
          )}
          <View style={styles.row}>
            <View style={styles.btn}><Button title="Bid 0" onPress={() => onBid(0)} /></View>
            <View style={styles.btn}><Button title="Bid 1" onPress={() => onBid(1)} /></View>
            <View style={styles.btn}><Button title={`Bid ${currentHandSize()}`} onPress={() => onBid(currentHandSize())} /></View>
          </View>

          <Text style={{ marginTop: 8 }}>Trump:</Text>
          <View style={styles.row}>
            <View style={styles.btn}><Button title="NT" onPress={() => setTrump("NT")} /></View>
            <View style={styles.btn}><Button title="♠" onPress={() => setTrump("♠")} /></View>
            <View style={styles.btn}><Button title="♥" onPress={() => setTrump("♥")} /></View>
            <View style={styles.btn}><Button title="♦" onPress={() => setTrump("♦")} /></View>
            <View style={styles.btn}><Button title="♣" onPress={() => setTrump("♣")} /></View>
          </View>
        </View>

        {/* Trick actions */}
        <View style={styles.row}>
          <View style={styles.btn}><Button title="Play first legal" onPress={playFirstLegal} /></View>
          <View style={styles.btn}><Button title="Tick (-1s)" onPress={onTick} /></View>
        </View>

        <View style={styles.row}>
          <View style={styles.btn}><Button title="Next hand (after Scoring)" onPress={onNextHand} /></View>
          <View style={styles.btn}><Button title="New game" onPress={boot} /></View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "white" },
  header: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd" },
  h1: { fontSize: 20, fontWeight: "700", color: "black" },
  scroll: { flex: 1 },
  body: { padding: 16 },
  box: {
    backgroundColor: "#f6f6f6",
    borderWidth: 1,
    borderColor: "#e1e1e1",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12
  },
  boxError: { backgroundColor: "#fff3f3", borderWidth: 1, borderColor: "#f1c0c0", padding: 12, borderRadius: 8, marginBottom: 12 },
  h2: { fontSize: 16, fontWeight: "600", marginBottom: 6 },
  code: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as any, fontSize: 12, color: "#333" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" },
  btn: { flexGrow: 1, minWidth: 120, marginBottom: 8 },
});
