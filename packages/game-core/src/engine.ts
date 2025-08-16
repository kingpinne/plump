// packages/game-core/src/engine.ts
import type { GameState, Command, Trump, ScoringConfig, Player } from "./protocol";
import { fullDeck, shuffle, suitOf, rankIndex, type Card } from "./cards";

const MAX_PLAYERS = 7;

// ---- Helpers ---------------------------------------------------------------

function currentHandSize(state: GameState): number {
  return state.handSizes[state.roundIndex] ?? 0;
}

function nextAfter(playerId: string, players: { id: string }[]): string {
  const idx = Math.max(0, players.findIndex(p => p.id === playerId));
  return players[(idx + 1) % players.length].id;
}

function rotateTurn(state: GameState): GameState {
  if (!state.turn || state.players.length === 0) return state;
  const next = nextAfter(state.turn, state.players);
  return { ...state, turn: next, timer: state.turnSeconds };
}

function sumBids(bids: Record<string, number | undefined>): number {
  return Object.values(bids).reduce((acc, v) => acc + (typeof v === "number" ? v : 0), 0);
}

function deal(state: GameState): GameState {
  const n = currentHandSize(state);
  const deck = shuffle(fullDeck(), state.rngSeed);
  const hands: Record<string, Card[]> = {};
  let pos = 0;
  for (const p of state.players) {
    hands[p.id] = deck.slice(pos, pos + n);
    pos += n;
  }
  return {
    ...state,
    deck,
    hands,
    trick: undefined,
    tableWins: Object.fromEntries(state.players.map(p => [p.id, 0])),
  };
}

function startHand(state: GameState): GameState {
  const dealt = deal(state);
  const leader = dealt.players[dealt.leadIndex]?.id ?? dealt.players[0]?.id ?? null;
  return {
    ...dealt,
    phase: "Bidding",
    timer: null,                   // no countdown in bidding (for now)
    turn: leader,
    bids: Object.create(null),
    trump: "NT",
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

function pickTrickWinner(plays: { playerId: string; card: Card }[], trump: Trump): string {
  if (trump !== "NT") {
    const trumpPlays = plays.filter(p => suitOf(p.card) === trump);
    if (trumpPlays.length) {
      let best = trumpPlays[0];
      for (let i = 1; i < trumpPlays.length; i++) {
        if (rankIndex(trumpPlays[i].card) < rankIndex(best.card)) best = trumpPlays[i];
      }
      return best.playerId;
    }
  }
  const leadSuit = suitOf(plays[0].card);
  const leadPlays = plays.filter(p => suitOf(p.card) === leadSuit);
  let best = leadPlays[0];
  for (let i = 1; i < leadPlays.length; i++) {
    if (rankIndex(leadPlays[i].card) < rankIndex(best.card)) best = leadPlays[i];
  }
  return best.playerId;
}

// --- Auto-play (lowest legal card) -----------------------------------------
function chooseAutoCard(state: GameState, playerId: string): Card | null {
  const hand = state.hands?.[playerId] ?? [];
  if (hand.length === 0) return null;

  const plays = state.trick?.plays ?? [];
  const leadSuit = plays.length ? suitOf(plays[0].card) : null;

  const legal = hand.filter(c => legalToPlay(state, playerId, c));
  if (legal.length === 0) return null;

  const pool = leadSuit ? legal.filter(c => suitOf(c) === leadSuit) : legal;
  const list = pool.length ? pool : legal;

  let worst = list[0];
  for (let i = 1; i < list.length; i++) {
    if (rankIndex(list[i]) > rankIndex(worst)) worst = list[i]; // larger index = lower rank
  }
  return worst;
}

function autoPlay(state: GameState): GameState {
  if (!state.turn) return state;
  const card = chooseAutoCard(state, state.turn);
  if (!card) return rotateTurn(state);
  return playCard(state, state.turn, card);
}

// --- Bidding (includes forbidden-sum rule) ----------------------------------
function placeBid(state: GameState, playerId: string, bid: number): GameState {
  if (state.phase !== "Bidding") return state;
  if (state.turn !== playerId) return state;
  const max = currentHandSize(state);
  if (bid < 0 || bid > max) return state;

  const leaderId = state.players[state.leadIndex]?.id ?? null;
  const isLastBidder = leaderId != null && nextAfter(playerId, state.players) === leaderId;

  const currentSum = sumBids(state.bids);
  const proposedSum = currentSum + bid;

  // Forbidden-sum: last bidder cannot make total equal to hand size.
  if (isLastBidder && proposedSum === max) {
    return state; // reject bid
  }

  const bids = { ...state.bids, [playerId]: bid };
  const biddingDone = state.players.every(p => typeof bids[p.id] === "number");

  if (biddingDone) {
    // Move into Trick; leader keeps the lead for the first trick
    return {
      ...state,
      bids,
      phase: "Trick",
      trick: undefined,
      timer: state.turnSeconds,
      turn: state.players[state.leadIndex]?.id ?? state.turn,
    };
  }

  // Next bidder
  const next = nextAfter(playerId, state.players);
  return { ...state, bids, turn: next };
}

function setTrump(state: GameState, trump: Trump): GameState {
  if (state.phase !== "Bidding") return state;
  return { ...state, trump };
}

// --- Trick play -------------------------------------------------------------
function playCard(state: GameState, playerId: string, card: Card): GameState {
  if (state.phase !== "Trick" || !state.hands) return state;
  if (state.turn !== playerId) return state;
  if (!legalToPlay(state, playerId, card)) return state;

  const hand = state.hands[playerId].slice();
  hand.splice(hand.indexOf(card), 1);
  const hands = { ...state.hands, [playerId]: hand };

  const trick = state.trick ?? { leader: playerId, plays: [] };
  const plays = trick.plays.concat({ playerId, card });

  if (plays.length === state.players.length) {
    const winner = pickTrickWinner(plays, state.trump);
    const tableWins = { ...(state.tableWins ?? {}) };
    tableWins[winner] = (tableWins[winner] ?? 0) + 1;

    const anyLeft = Object.values(hands).some(h => h.length > 0);
    if (!anyLeft) {
      return {
        ...state,
        hands,
        trick: undefined,
        tableWins,
        turn: winner, // last-trick winner (info only)
        phase: "Scoring",
        timer: null,
      };
    }

    return {
      ...state,
      hands,
      trick: undefined,
      tableWins,
      turn: winner,
      timer: state.turnSeconds,
    };
  }

  const next = nextAfter(playerId, state.players);
  return {
    ...state,
    hands,
    trick: { leader: trick.leader, plays },
    turn: next,
    timer: state.turnSeconds,
  };
}

// ---- Scoring ---------------------------------------------------------------
function scoreHand(state: GameState): Record<string, number> {
  const scores = { ...state.scores };
  const cfg = state.scoring;
  for (const p of state.players) {
    const pid = p.id;
    const tricks = state.tableWins?.[pid] ?? 0;
    const bid = state.bids?.[pid] ?? 0;
    if (tricks === bid) {
      scores[pid] = (scores[pid] ?? 0) + cfg.exactBonus + bid;
    } else {
      if (cfg.missMode === "wins") {
        scores[pid] = (scores[pid] ?? 0) + tricks;
      } // else "zero" → no points
    }
  }
  return scores;
}

// ---- Main reducer-style step ----------------------------------------------
export function step(state: GameState, cmd: Command): GameState {
  switch (cmd.type) {
    case "ADD_PLAYER": {
      if (state.players.length >= MAX_PLAYERS) return state;
      if (state.phase !== "Lobby") return state;
      if (state.players.some(p => p.id === cmd.playerId)) return state;
      const newPlayer: Player = { id: cmd.playerId, kind: cmd.kind ?? "human" };
      return { ...state, players: [...state.players, newPlayer] };
    }

    case "START_GAME": {
      if (state.phase !== "Lobby" || state.players.length < 2) return state;
      const defaults: ScoringConfig = { exactBonus: 10, missMode: "zero" };
      const scoring: ScoringConfig = {
        exactBonus: cmd.scoring?.exactBonus ?? defaults.exactBonus,
        missMode: (cmd.scoring?.missMode ?? defaults.missMode),
      };
      const seeded: GameState = {
        ...state,
        handSizes: cmd.handSizes,
        turnSeconds: cmd.turnSeconds,
        roundIndex: 0,
        leadIndex: 0,
        scores: Object.fromEntries(state.players.map(p => [p.id, 0])),
        bids: {},
        trump: "NT",
        scoring,
      };
      return startHand(seeded);
    }

    case "PLACE_BID": {
      return placeBid(state, cmd.playerId, cmd.bid);
    }

    case "SET_TRUMP": {
      return setTrump(state, cmd.trump);
    }

    case "PLAY_CARD": {
      return playCard(state, cmd.playerId, cmd.card);
    }

    case "TICK": {
      if (state.phase !== "Trick") return state;
      const t = (state.timer ?? 0) - 1;
      if (t > 0) return { ...state, timer: t };
      return autoPlay(state); // timer expired → auto-play
    }

    case "NEXT_TURN": {
      return rotateTurn(state);
    }

    case "NEXT_HAND": {
      if (state.phase !== "Scoring") return state;

      const scores = scoreHand(state);

      const nextRound = state.roundIndex + 1;
      if (nextRound >= state.handSizes.length) {
        return {
          ...state,
          scores,
          phase: "RoundEnd",
          timer: null,
          hands: undefined,
          trick: undefined,
          tableWins: undefined,
          bids: {},
        };
      }

      const leadIndex = (state.leadIndex + 1) % state.players.length;
      const progressed: GameState = {
        ...state,
        scores,
        roundIndex: nextRound,
        leadIndex,
        bids: {},
        trump: "NT",
      };
      return startHand(progressed);
    }

    default:
      return state;
  }
}
