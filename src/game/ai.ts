import { applyMove, legalTurns } from "./engine";
import type { AiLevel, GameState, Player } from "./types";

const opponent = (player: Player): Player =>
  player === "white" ? "black" : "white";
const sign = (player: Player): 1 | -1 => (player === "white" ? 1 : -1);

function pipCount(state: GameState, player: Player): number {
  let total = state.bar[player] * 25;
  for (let point = 0; point < 24; point += 1) {
    const checkers = state.board[point] * sign(player);
    if (checkers > 0) {
      total += checkers * (player === "white" ? point + 1 : 24 - point);
    }
  }
  return total;
}

function isInHomeBoard(player: Player, point: number): boolean {
  return player === "white" ? point < 6 : point >= 18;
}

function isInOpponentHome(player: Player, point: number): boolean {
  return player === "white" ? point >= 18 : point < 6;
}

function canOpponentHit(state: GameState, player: Player, point: number): boolean {
  const other = opponent(player);
  const otherSign = sign(other);
  const direction = other === "white" ? -1 : 1;

  if (state.bar[other] > 0) {
    for (let die = 1; die <= 6; die += 1) {
      const entryPoint = other === "white" ? 24 - die : die - 1;
      if (entryPoint === point) return true;
    }
    return false;
  }

  for (let die = 1; die <= 6; die += 1) {
    const from = point - direction * die;
    if (
      from >= 0 &&
      from < 24 &&
      state.board[from] * otherSign > 0
    ) {
      return true;
    }
  }
  return false;
}

function positionValue(state: GameState, player: Player, riskWeight: number): number {
  const other = opponent(player);
  let value =
    state.off[player] * 24 -
    state.bar[player] * 26 +
    state.bar[other] * 19 -
    pipCount(state, player) * 0.12;

  for (let point = 0; point < 24; point += 1) {
    const ownCount = state.board[point] * sign(player);
    if (ownCount >= 2) {
      value += 3.3;
      if (isInHomeBoard(player, point)) value += 2.5;
      if (isInOpponentHome(player, point)) value += 1.5;
    } else if (ownCount === 1 && canOpponentHit(state, player, point)) {
      value -= riskWeight;
    }
  }
  return value;
}

function evaluate(state: GameState, player: Player, riskWeight: number): number {
  return (
    positionValue(state, player, riskWeight) -
    positionValue(state, opponent(player), riskWeight)
  );
}

export function chooseAiTurn(
  state: GameState,
  level: AiLevel,
  random: () => number = Math.random,
): ReturnType<typeof legalTurns>[number] {
  const turns = legalTurns(state);
  if (turns.length === 0) return [];
  if (level === "beginner") {
    return turns[Math.floor(random() * turns.length)];
  }

  const riskWeight = level === "expert" ? 5.2 : 2.8;
  const scored = turns.map((turn) => {
    let simulated = state;
    for (const move of turn) simulated = applyMove(simulated, move);
    return {
      turn,
      score: evaluate(simulated, state.turn, riskWeight) + random() * 0.04,
    };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0].turn;
}

export function aiShouldTakeDouble(state: GameState, level: AiLevel): boolean {
  if (!state.pendingDoubleBy) return false;
  const player = opponent(state.pendingDoubleBy);
  const score = evaluate(state, player, level === "expert" ? 5.2 : 2.8);
  return score >= (level === "beginner" ? -10 : level === "intermediate" ? -16 : -24);
}
