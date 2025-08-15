// packages/game-core/src/protocol.ts
import type { Card } from "./cards";

// --- Game flow phases ---
export type Phase = "Lobby" | "Dealing" | "Trick" | "Scoring" | "RoundEnd";

// --- Core entities ---
export type Player = { id: string };

export type TrickPlay = {
  playerId: string;
  card: Card;
};

// --- Commands (from UI/clients) ---
export type Command =
  | { type: "ADD_PLAYER"; playerId: string }
  | { type: "START_GAME"; handSizes: number[]; turnSeconds: number }
  | { type: "PLAY_CARD"; playerId: string; card: Card }
  | { type: "TICK" }
  | { type: "NEXT_TURN" }
  | { type: "NEXT_HAND" }; // advance after Scoring

// --- Optional events (if you later add event sourcing) ---
export type Event =
  | { type: "PLAYER_ADDED"; playerId: string }
  | { type: "GAME_STARTED" }
  | { type: "CARD_PLAYED"; playerId: string; card: Card }
  | { type: "TURN_TIMEOUT"; playerId: string };

// --- Game state ---
export type GameState = {
  version: number;
  phase: Phase;
  players: Player[];
  turn: string | null;          // playerId whose turn it is
  rngSeed: string;

  // timers/config
  turnSeconds: number;          // per-turn budget (seconds)
  timer: number | null;         // current countdown (seconds)
  handSizes: number[];          // e.g. [5,4,3,2,1,2,3,4,5]

  // round progression
  roundIndex: number;           // index into handSizes
  leadIndex: number;            // which player leads the next hand
  scores: Record<string, number>; // cumulative tricks over hands

  // per-hand state (populated after START_GAME / each NEXT_HAND)
  deck?: Card[];
  hands?: Record<string, Card[]>; // playerId -> cards in hand
  trick?: {
    leader: string;               // playerId who led the current trick
    plays: TrickPlay[];           // cards played this trick (in order)
  };
  tableWins?: Record<string, number>; // playerId -> tricks won this hand
};
