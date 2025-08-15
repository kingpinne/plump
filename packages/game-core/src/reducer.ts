// packages/game-core/src/reducer.ts

// --- Types ---
export type Player = { id: string };

export type GameState = {
  version: number;
  players: Player[];
  turn: string | null;
  rngSeed: string;
};

// Commands your UI uses right now
export type Command =
  | { type: "ADD_PLAYER"; playerId: string }
  | { type: "NEXT_TURN" };

// --- Initial state ---
export function initialState(seed: string): GameState {
  return {
    version: 1,
    players: [],
    turn: null,
    rngSeed: seed,
  };
}

// --- Apply a command ---
// Returns a wrapper { state } since your App.tsx expects applyCommand(...).state
export function applyCommand(state: GameState, cmd: Command): { state: GameState } {
  switch (cmd.type) {
    case "ADD_PLAYER": {
      // avoid dups
      if (state.players.some(p => p.id === cmd.playerId)) {
        return { state };
      }
      const players = [...state.players, { id: cmd.playerId }];
      const turn = state.turn ?? cmd.playerId; // first player gets the turn
      return { state: { ...state, players, turn } };
    }
    case "NEXT_TURN": {
      if (state.players.length === 0) return { state };
      const idx = Math.max(0, state.players.findIndex(p => p.id === state.turn));
      const next = state.players[(idx + 1) % state.players.length]?.id ?? state.players[0].id;
      return { state: { ...state, turn: next } };
    }
    default:
      return { state };
  }
}
