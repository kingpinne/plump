import { makeRng } from "./rng";
import { Protocol, CommandSchema, EventSchema, type Command, type Event } from "./protocol";
import type { GameState } from "./types";
import { isCommandAllowed } from "./fsm";

export function initialState(seed = "dev-seed"): GameState {
  return {
    seed,
    protocolVersion: Protocol.version,
    phase: "lobby",
    players: [],
    turn: null,
    turnIndex: -1,
    eventCount: 0,
    round: 0,
  };
}

/** Validate at two levels:
 *  1) shape (zod schema)
 *  2) phase/flow (fsm)
 */
export function validate(state: GameState, cmd: unknown): string | null {
  const parsed = CommandSchema.safeParse(cmd);
  if (!parsed.success) return "Invalid command shape.";
  const c = parsed.data;

  // FSM gate
  if (!isCommandAllowed(state.phase, c.type)) {
    return `Command ${c.type} not allowed in phase ${state.phase}.`;
  }

  // Extra constraints
  switch (c.type) {
    case "ADD_PLAYER":
      if (state.players.includes(c.playerId)) return "Player already added.";
      return null;
    case "START_MATCH":
      if (state.players.length < 2) return "Need at least 2 players.";
      return null;
    case "END_TURN":
      if (state.turnIndex < 0 || !state.turn) return "No current turn.";
      return null;
    default:
      // For placeholders we don't enforce extra rules yet
      return null;
  }
}

/** Decide: Command -> Events (pure, no side effects) */
export function decide(state: GameState, cmd: Command): Event[] {
  const err = validate(state, cmd);
  if (err) throw new Error(err);

  switch (cmd.type) {
    case "ADD_PLAYER":
      return [{ type: "PLAYER_ADDED", playerId: cmd.playerId }];

    case "START_MATCH": {
      const rng = makeRng(state.seed);
      const idx = Math.floor(rng() * state.players.length) % state.players.length;
      const firstPlayer = state.players[idx];
      return [{ type: "MATCH_STARTED", firstPlayer }];
    }

    case "END_TURN": {
      const nextIndex = (state.turnIndex + 1) % state.players.length;
      const nextPlayer = state.players[nextIndex];
      return [{ type: "TURN_ENDED", nextPlayer }];
    }

    // Placeholders: emit no-ops until we implement rules
    case "START_ROUND":
      return [{ type: "ROUND_STARTED", round: cmd.round }];
    case "PLACE_BID":
      return [{ type: "BID_PLACED", playerId: state.turn!, value: cmd.value }];
    case "PLAY_CARD":
      return [{ type: "CARD_PLAYED", playerId: state.turn!, card: cmd.card }];
    case "COMPLETE_TRICK":
      return [{ type: "TRICK_COMPLETED", winnerId: state.turn!, trickIndex: 0 }];
    case "TALLY_SCORE":
      return [{ type: "SCORED", playerId: state.turn!, delta: 0 }];
  }
}

/** Evolve: apply Event to GameState (pure) */
export function evolve(state: GameState, ev: Event): GameState {
  const parsed = EventSchema.safeParse(ev);
  if (!parsed.success) throw new Error("Invalid event shape.");
  const e = parsed.data;

  switch (e.type) {
    case "PLAYER_ADDED":
      return { ...state, players: [...state.players, e.playerId], eventCount: state.eventCount + 1 };
    case "MATCH_STARTED": {
      const turnIndex = state.players.indexOf(e.firstPlayer);
      return {
        ...state,
        phase: "playing",
        turn: e.firstPlayer,
        turnIndex,
        eventCount: state.eventCount + 1,
      };
    }
    case "TURN_ENDED":
      return {
        ...state,
        turn: e.nextPlayer,
        turnIndex: state.players.indexOf(e.nextPlayer),
        eventCount: state.eventCount + 1,
      };

    // Placeholders: update counters/round modestly; we’ll flesh out later
    case "ROUND_STARTED":
      return { ...state, round: e.round, eventCount: state.eventCount + 1 };
    case "BID_PLACED":
    case "CARD_PLAYED":
    case "TRICK_COMPLETED":
    case "SCORED":
      return { ...state, eventCount: state.eventCount + 1 };

    default: {
      // exhaustive check
      return state;
    }
  }
}

/** Helper: apply a Command to produce Events and the next State */
export function applyCommand(state: GameState, cmd: Command): { state: GameState; events: Event[] } {
  const events = decide(state, cmd);
  let next = state;
  for (const ev of events) next = evolve(next, ev);
  return { state: next, events };
}

/** Replay: build state from an event log (useful later for server/multiplayer) */
export function replay(seed: string, events: Event[]): GameState {
  let s = initialState(seed);
  for (const ev of events) s = evolve(s, ev);
  return s;
}
