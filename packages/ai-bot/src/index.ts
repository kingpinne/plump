import type { Command, GameState } from "@plump/game-core";

/** Minimal AI: if it's my turn, end turn (placeholder until real rules) */
export function aiNext(state: GameState, myId: string): Command | null {
  if (state.phase !== "playing") return null;
  if (state.turn !== myId) return null;
  return { type: "END_TURN" };
}
