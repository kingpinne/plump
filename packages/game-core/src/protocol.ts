// --- Game flow phases ---
export type Phase = "Lobby" | "Dealing" | "Trick" | "Scoring" | "RoundEnd";

// --- Commands sent from clients/UI ---
export type Command =
  | { type: "ADD_PLAYER"; playerId: string }
  | { type: "START_GAME"; handSizes: number[]; turnSeconds: number }
  | { type: "PLAY_CARD"; playerId: string; card: string }
  | { type: "TICK" }
  | { type: "NEXT_TURN" };

// --- Events (optional: if you later implement event sourcing) ---
export type Event =
  | { type: "PLAYER_ADDED"; playerId: string }
  | { type: "GAME_STARTED" }
  | { type: "CARD_PLAYED"; playerId: string; card: string }
  | { type: "TURN_TIMEOUT"; playerId: string };

// --- Shared types ---
export type Player = { id: string };

export type GameState = {
  version: number;
  phase: Phase;
  players: Player[];
  turn: string | null;
  rngSeed: string;
  turnSeconds: number;
  timer: number | null;
  handSizes: number[];
};
