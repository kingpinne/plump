// packages/game-core/src/fsm.ts
import type { Phase } from "./types";
import type { Command } from "./protocol";

/** Which commands are allowed in which phase (coarse-grained) */
export const AllowedByPhase: Record<Phase, Command["type"][]> = {
  lobby: ["ADD_PLAYER", "START_MATCH"],
  playing: [
    "END_TURN",
    // Future trick-taking commands (inactive until we implement rules):
    "START_ROUND", "PLACE_BID", "PLAY_CARD", "COMPLETE_TRICK", "TALLY_SCORE",
  ],
  ended: [],
};

/** Guard helper: is this command allowed in the current phase? */
export function isCommandAllowed(phase: Phase, cmdType: Command["type"]): boolean {
  return AllowedByPhase[phase]?.includes(cmdType) ?? false;
}
