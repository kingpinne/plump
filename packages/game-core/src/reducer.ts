// packages/game-core/src/reducer.ts
import { step } from "./engine";
import type { Command, GameState } from "./protocol";

export function initialState(seed: string): GameState {
  return {
    version: 1,
    phase: "Lobby",
    players: [],
    turn: null,
    rngSeed: seed,
    turnSeconds: 0,
    timer: null,
    handSizes: [],
    roundIndex: 0,
    leadIndex: 0,
    scores: {},
  };
}

export function applyCommand(state: GameState, cmd: Command) {
  return { state: step(state, cmd) };
}
