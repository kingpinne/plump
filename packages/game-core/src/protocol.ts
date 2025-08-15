// packages/game-core/src/protocol.ts
export type Command = { type: string; payload?: unknown };
export type Event = { type: string; payload?: unknown };

export type CommandSchema = unknown;
export type EventSchema = unknown;

export interface Protocol {
  name: string;
  version: string;
  commands?: Record<string, CommandSchema>;
  events?: Record<string, EventSchema>;
}

// 👇 Viktigt: exportera en VÄRDE-variabel som kan användas av koden
export const protocol: Protocol = {
  name: "plump",
  version: "0.1.0",
  commands: {},
  events: {},
};

// (valfritt) default-export om någon importerar default
export default protocol;
