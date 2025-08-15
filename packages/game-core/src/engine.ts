// packages/game-core/src/engine.ts
import type { GameState, Command } from "./protocol";
import { fullDeck, shuffle, suitOf, rankIndex, type Card } from "./cards";

// ---- Helpers ---------------------------------------------------------------

function rotateTurn(state: GameState): GameState {
  if (!state.turn || state.players.length === 0) return state;
  const idx = Math.max(0, state.players.findIndex(p => p.id === state.turn));
  const next = state.players[(idx + 1) % state.players.length]?.id ?? state.players[0].id;
  return { ...state, turn: next, timer: state.turnSeconds };
}

function nextAfter(playerId: string, players: { id: string }[]): string {
  const idx = Math.max(0, players.findIndex(p => p.id === playerId));
  return players[(idx + 1) % players.length].id;
}

function currentHandSize(state: GameState): number {
  return state.handSizes[0] ?? 0;
}

function deal(state: GameState): GameState {
  const n = currentHandSize(state);
  const players = state.players;
  const deck = shuffle(fullDeck(), state.rngSeed);
  const hands: Record<string, Card[]> = {};
  let pos = 0;
  for (const p of players) {
    hands[p.id] = deck.slice(pos, pos + n);
    pos += n;
  }
  return {
    ...state,
    deck,
    hands,
    trick: undefined,
    tableWins: Object.fromEntries(players.map(p => [p.id, 0])),
  };
}

function legalToPlay(state: GameState, playerId: string, card: Card): boolean {
  const hand = state.hands?.[playerId] ?? [];
  if (!hand.includes(card)) return false;
  if (!state.trick || state.trick.plays.length === 0) return true;
  const leadSuit = suitOf(state.trick.plays[0].card);
  const hasLead = hand.some(c => suitOf(c) === leadSuit);
  return !hasLead || suitOf(card) === leadSuit;
}

function pickTrickWinner(plays: { playerId: string; card: Card }[]): string {
  const leadSuit = suitOf(plays[0].card);
  const leadPlays = plays.filter(p => suitOf(p.card) === leadSuit);
  // Highest rank among lead suit; lower rankIndex() = higher rank because RANKS starts at A
  let best = leadPlays[0];
  for (let i = 1; i < leadPlays.length; i++) {
    if (rankIndex(leadPlays[i].card) < rankIndex(best.card)) best = leadPlays[i];
  }
  return best.playerId;
}

function playCard(state: GameState, playerId: string, card: Card): GameState {
  if (state.phase !== "Trick" || !state.hands) return state;
  if (state.turn !== playerId) return state;
  if (!legalToPlay(state, playerId, card)) return state;

  // remove from hand
  const hand = state.hands[playerId].slice();
  hand.splice(hand.indexOf(card), 1);
  const hands = { ...state.hands, [playerId]: hand };

  // add to trick
  const trick = state.trick ?? { leader: playerId, plays: [] };
  const plays = trick.plays.concat({ playerId, card });

  // if trick complete → score it
  if (plays.length === state.players.length) {
    const winner = pickTrickWinner(plays);
    const tableWins = { ...(state.tableWins ?? {}) };
    tableWins[winner] = (tableWins[winner] ?? 0) + 1;
    const nextTurn = winner;

    // any cards left in any hand?
    const anyLeft = Object.values(hands).some(h => h.length > 0);
    if (!anyLeft) {
      // end of hand → go to Scoring
      return {
        ...state,
        hands,
        trick: undefined,
        tableWins,
        turn: nextTurn,
        phase: "Scoring",
        timer: null,
      };
    }

    return {
      ...state,
      hands,
      trick: undefined,
      tableWins,
      turn: nextTurn,
      timer: state.turnSeconds,
    };
  }

  // otherwise continue trick → next player
  const next = nextAfter(playerId, state.players);
  return {
    ...state,
    hands,
    trick: { leader: trick.leader, plays },
    turn: next,
    timer: state.turnSeconds,
  };
}

// ---- Main reducer-style step ----------------------------------------------

export function step(state: GameState, cmd: Command): GameState {
  switch (cmd.type) {
    case "ADD_PLAYER": {
      if (state.phase !== "Lobby") return state;
      if (state.players.some(p => p.id === cmd.playerId)) return state;
      return { ...state, players: [...state.players, { id: cmd.playerId }] };
    }

    case "START_GAME": {
      if (state.phase !== "Lobby" || state.players.length < 2) return state;
      // IMPORTANT: set config BEFORE dealing so currentHandSize() is correct
      const seeded: GameState = {
        ...state,
        handSizes: cmd.handSizes,
        turnSeconds: cmd.turnSeconds,
      };
      const dealt = deal(seeded);
      return {
        ...dealt,
        phase: "Trick",
        timer: cmd.turnSeconds,
        turn: dealt.players[0]?.id ?? null, // first player leads
      };
    }

    case "PLAY_CARD": {
      return playCard(state, cmd.playerId, cmd.card);
    }

    case "TICK": {
      if (state.phase !== "Trick") return state;
      const t = (state.timer ?? 0) - 1;
      if (t > 0) return { ...state, timer: t };
      // timeout → for now, just rotate (placeholder for auto-play)
      return rotateTurn(state);
    }

    case "NEXT_TURN": {
      return rotateTurn(state);
    }

    default:
      return state;
  }
}
