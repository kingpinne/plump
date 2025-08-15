import { useEffect, useRef, useState } from "react";
import { GameEngine, type Command, type GameState } from "@plump/game-core";
import { aiNext } from "@plump/ai-bot";

const YOU = "you";
const AI = "ai1";

export function useGame(seed = "seed-123") {
  const [engine] = useState(() => new GameEngine(seed));
  const [state, setState] = useState<GameState>(() => engine.state);
  const inited = useRef(false);
  const mounted = useRef(true);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sync = () => setState(engine.state);

  const init = () => {
    if (inited.current) return;
    inited.current = true;
    engine.dispatch({ type: "ADD_PLAYER", playerId: YOU });
    engine.dispatch({ type: "ADD_PLAYER", playerId: AI });
    engine.dispatch({ type: "START_MATCH" });
    sync();
  };

  const dispatch = (cmd: Command) => {
    engine.dispatch(cmd);
    sync();
  };

  const endTurn = () => {
    if (engine.state.turn !== YOU) return;
    dispatch({ type: "END_TURN" });
  };

  useEffect(() => {
    if (!mounted.current) return;
    if (state.phase !== "playing") return;
    if (state.turn !== AI) return;

    if (aiTimer.current) clearTimeout(aiTimer.current);
    aiTimer.current = setTimeout(() => {
      const cmd = aiNext(engine.state, AI);
      if (cmd) dispatch(cmd);
    }, 700);

    return () => { if (aiTimer.current) clearTimeout(aiTimer.current); };
  }, [state]);

  useEffect(() => () => {
    mounted.current = false;
    if (aiTimer.current) clearTimeout(aiTimer.current);
  }, []);

  const reset = () => {
    engine.reset();
    inited.current = false;
    sync();
  };

  return { state, init, endTurn, reset, YOU, AI };
}
