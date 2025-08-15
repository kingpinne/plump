// packages/game-core/src/protocol.ts
import { z } from "zod";
import type { Card } from "./cards";

/** Protocol versioning to allow future rule changes without breaking clients */
export const Protocol = {
  version: "0.1.0",
} as const;

/** Command schema (network-suitable, extend as we add real rules) */
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ADD_PLAYER"), playerId: z.string().min(1) }),
  z.object({ type: z.literal("START_MATCH") }),
  z.object({ type: z.literal("END_TURN") }),

  // Placeholders for trick-taking flow (we'll implement later):
  z.object({ type: z.literal("START_ROUND"), round: z.number().int().nonnegative() }),
  z.object({ type: z.literal("PLACE_BID"), value: z.number().int().min(0) }),
  z.object({ type: z.literal("PLAY_CARD"), card: z.string().min(1) }),
  z.object({ type: z.literal("COMPLETE_TRICK") }),
  z.object({ type: z.literal("TALLY_SCORE") }),
]);

/** Event schema (what actually happened, server-authoritative in multiplayer) */
export const EventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLAYER_ADDED"), playerId: z.string() }),
  z.object({ type: z.literal("MATCH_STARTED"), firstPlayer: z.string() }),
  z.object({ type: z.literal("TURN_ENDED"), nextPlayer: z.string() }),

  // Placeholders aligned with commands above:
  z.object({ type: z.literal("ROUND_STARTED"), round: z.number().int().nonnegative() }),
  z.object({ type: z.literal("BID_PLACED"), playerId: z.string(), value: z.number().int().min(0) }),
  z.object({ type: z.literal("CARD_PLAYED"), playerId: z.string(), card: z.string() }),
  z.object({ type: z.literal("TRICK_COMPLETED"), winnerId: z.string(), trickIndex: z.number().int().min(0) }),
  z.object({ type: z.literal("SCORED"), playerId: z.string(), delta: z.number().int() }),
]);

export type Command = z.infer<typeof CommandSchema>;
export type Event = z.infer<typeof EventSchema>;
export type TrickPlay = { playerId: string; card: Card };

export type GameState = {
  version: number;
  phase: Phase;
  players: { id: string }[];
  turn: string | null;
  rngSeed: string;
  turnSeconds: number;
  timer: number | null;
  handSizes: number[];

 // NEW:
 deck?: Card[];
 hands?: Record<string, Card[]>;
 trick?: { leader: string; plays: TrickPlay[] }; // current trick
 tableWins?: Record<string, number>;             // tricks won per player (round scoring)
};
