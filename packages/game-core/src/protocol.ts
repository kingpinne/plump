// packages/game-core/src/protocol.ts
import type { Card, Suit } from "./cards";

// --- Game flow phases ---
export type Phase = "Lobby" | "Bidding" | "Trick" | "Scoring" | "RoundEnd";

// --- Core entities ---
export type PlayerKind = "human" | "bot";
export type Player = { id: string; kind: PlayerKind };

export type TrickPlay = {
  playerId: string;
  card: Card;
};

// --- Trump ---
export type Trump = Suit | "NT";

// --- Scoring config ---
export type MissMode = "zero" | "wins"; // default "zero": 0 pts on a miss; "wins": award tricks won
export type ScoringConfig = {
  exactBonus: number; // bonus when bid is exact (default 10)
  missMode: MissMode;
};

// --- Commands (from UI/clients) ---
export type Command =
  | { type: "ADD_PLAYER"; playerId: string; kind?: PlayerKind } // kind defaults to "human"
  | { type: "START_GAME"; handSizes: number[]; turnSeconds: number; scoring?: Partial<ScoringConfig> }
  | { type: "PLACE_BID"; playerId: string; bid: number }
  | { type: "SET_TRUMP"; trump: Trump }
  | { type: "PLAY_CARD"; playerId: string; card: Card }
  | { type: "TICK" }
  | { type: "NEXT_TURN" }
  | { type: "NEXT_HAND" }; // advance after Scoring

// --- Game state ---
export type GameState = {
  version: number;
  phase: Phase;
  players: Player[];
  turn: string | null;             // playerId whose turn it is
  rngSeed: string;

  // timers/config
  turnSeconds: number;             // per-turn budget (seconds)
  timer: number | null;            // current countdown (seconds)
  handSizes: number[];             // e.g. [5,4,3,2,1,2,3,4,5]
  scoring: ScoringConfig;

  // round progression
  roundIndex: number;              // index into handSizes
  leadIndex: number;               // which player leads each new hand
  scores: Record<string, number>;  // cumulative points over hands

  // bidding
  bids: Record<string, number | undefined>;
  trump: Trump;

  // per-hand state
  deck?: Card[];
  hands?: Record<string, Card[]>;  // playerId -> cards in hand
  trick?: {
    leader: string;                // playerId who led the current trick
    plays: TrickPlay[];            // cards played this trick (in order)
  };
  tableWins?: Record<string, number>; // playerId -> tricks won this hand
};
