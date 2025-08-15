// packages/game-core/src/engine.ts
import type { Command, Event } from "./protocol";
import { applyCommand, initialState, replay } from "./reducer";
import type { GameState } from "./types";

export class GameEngine {
  private _state: GameState;
  private _log: Event[] = [];

  constructor(seed = "dev-seed", existingLog?: Event[]) {
    this._state = existingLog ? replay(seed, existingLog) : initialState(seed);
    if (existingLog) this._log = [...existingLog];
  }

  get state(): GameState {
    return this._state;
  }

  get log(): Event[] {
    return [...this._log];
  }

  /** Apply a command, append produced events to the log */
  dispatch(cmd: Command) {
    const { state, events } = applyCommand(this._state, cmd);
    this._state = state;
    if (events.length) this._log.push(...events);
    return events;
  }

  /** Reset the match but keep the same seed */
  reset() {
    this._state = initialState(this._state.seed);
    this._log = [];
  }
}
