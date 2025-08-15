// packages/game-core/src/types.ts
export type PlayerId = string;

/** Keep a simple phase set now; we can expand to bidding/trick/scoring later */
export type Phase =
  | "lobby"
  | "playing"   // placeholder umbrella phase for now
  | "ended";

export interface GameState {
  seed: string;
  protocolVersion: string;
  phase: Phase;
  players: PlayerId[];
  turn: PlayerId | null;
  turnIndex: number;   // index within players
  eventCount: number;  // simple counter for debugging
  round: number;       // placeholder for future round-based logic
}
