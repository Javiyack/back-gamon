import {
  BAR,
  OFF,
  GameRuleError,
  type CheckerMove,
  type GameResultType,
  type GameState,
  type MoveRecord,
  type Player,
} from "./types";

export interface GameOptions {
  jacoby?: boolean;
  isCrawford?: boolean;
  crawfordPlayed?: boolean;
}

interface Position {
  board: number[];
  bar: Record<Player, number>;
  off: Record<Player, number>;
}

const otherPlayer = (player: Player): Player =>
  player === "white" ? "black" : "white";

const playerSign = (player: Player): 1 | -1 =>
  player === "white" ? 1 : -1;

function assertDie(die: number): void {
  if (!Number.isInteger(die) || die < 1 || die > 6) {
    throw new RangeError(`A die must be an integer from 1 to 6; received ${die}.`);
  }
}

function assertDice(dice: readonly number[]): void {
  dice.forEach(assertDie);
}

function isBlocked(board: readonly number[], point: number, player: Player): boolean {
  return board[point] * playerSign(player) <= -2;
}

function hasCheckerOnHigherPoint(
  board: readonly number[],
  player: Player,
  point: number,
): boolean {
  if (player === "white") {
    return board
      .slice(point + 1, 6)
      .some((count) => count > 0);
  }
  return board
    .slice(18, point)
    .some((count) => count < 0);
}

function canBearOff(position: Position, player: Player): boolean {
  if (position.bar[player] > 0) return false;
  if (player === "white") {
    return position.board.slice(6).every((count) => count <= 0);
  }
  return position.board.slice(0, 18).every((count) => count >= 0);
}

function legalMovesForDie(
  position: Position,
  player: Player,
  die: number,
): CheckerMove[] {
  const sign = playerSign(player);
  const moves: CheckerMove[] = [];

  if (position.bar[player] > 0) {
    const to = player === "white" ? 24 - die : die - 1;
    if (!isBlocked(position.board, to, player)) {
      moves.push({ from: BAR, to, die });
    }
    return moves;
  }

  const bearingOff = canBearOff(position, player);
  for (let from = 0; from < 24; from += 1) {
    if (position.board[from] * sign <= 0) continue;

    const to = from + (player === "white" ? -die : die);
    if (to >= 0 && to < 24) {
      if (!isBlocked(position.board, to, player)) {
        moves.push({ from, to, die });
      }
      continue;
    }

    if (!bearingOff) continue;
    const distance = player === "white" ? from + 1 : 24 - from;
    if (
      die === distance ||
      (die > distance && !hasCheckerOnHigherPoint(position.board, player, from))
    ) {
      moves.push({ from, to: OFF, die });
    }
  }
  return moves;
}

function applyPositionMove(
  position: Position,
  player: Player,
  move: CheckerMove,
): { position: Position; hit: boolean; borneOff: boolean } {
  const sign = playerSign(player);
  const opponent = otherPlayer(player);
  const board = [...position.board];
  const bar = { ...position.bar };
  const off = { ...position.off };

  if (move.from === BAR) {
    bar[player] -= 1;
  } else {
    board[move.from] -= sign;
  }

  let hit = false;
  const borneOff = move.to === OFF;
  if (borneOff) {
    off[player] += 1;
  } else {
    if (board[move.to] * sign < 0) {
      board[move.to] = 0;
      bar[opponent] += 1;
      hit = true;
    }
    board[move.to] += sign;
  }

  return { position: { board, bar, off }, hit, borneOff };
}

function removeDie(dice: readonly number[], die: number): number[] {
  const index = dice.indexOf(die);
  return index < 0
    ? [...dice]
    : [...dice.slice(0, index), ...dice.slice(index + 1)];
}

function enumerateTurns(
  position: Position,
  player: Player,
  dice: readonly number[],
): CheckerMove[][] {
  if (dice.length === 0) return [[]];

  const continuations: CheckerMove[][] = [];
  for (const die of new Set(dice)) {
    const moves = legalMovesForDie(position, player, die);
    for (const move of moves) {
      const { position: nextPosition } = applyPositionMove(position, player, move);
      const suffixes = enumerateTurns(nextPosition, player, removeDie(dice, die));
      for (const suffix of suffixes) continuations.push([move, ...suffix]);
    }
  }

  if (continuations.length === 0) return [[]];
  const maxMoves = Math.max(...continuations.map((turn) => turn.length));
  return continuations.filter((turn) => turn.length === maxMoves);
}

function moveKey(move: CheckerMove): string {
  return `${move.from}:${move.to}:${move.die}`;
}

function finishGame(
  state: GameState,
  winner: Player,
  type: GameResultType,
): GameState {
  const multiplier =
    type === "backgammon" ? 3 : type === "gammon" ? 2 : 1;
  const points =
    type !== "single" && type !== "dropped" && state.jacoby && state.cube.value === 1
      ? 1
      : state.cube.value * multiplier;
  const scores = { ...state.scores, [winner]: state.scores[winner] + points };

  return {
    ...state,
    scores,
    phase: scores[winner] >= state.targetPoints ? "matchOver" : "gameOver",
    pendingDoubleBy: null,
    remainingDice: [],
    result: { winner, type, points },
  };
}

function getResultType(state: GameState, winner: Player): "single" | "gammon" | "backgammon" {
  const loser = otherPlayer(winner);
  if (state.off[loser] > 0) return "single";
  const loserInWinnerHome = state.board.some((count, point) => {
    if (winner === "white" && point < 6) return count < 0;
    if (winner === "black" && point >= 18) return count > 0;
    return false;
  });
  return state.bar[loser] > 0 || loserInWinnerHome ? "backgammon" : "gammon";
}

export function createInitialGame(
  targetPoints = 3,
  scores: Record<Player, number> = { white: 0, black: 0 },
  options: GameOptions = {},
  gameNumber = 1,
): GameState {
  if (![1, 3, 5, 7].includes(targetPoints)) {
    throw new RangeError("A match must be played to 1, 3, 5, or 7 points.");
  }

  const board = Array<number>(24).fill(0);
  board[23] = 2;
  board[12] = 5;
  board[7] = 3;
  board[5] = 5;
  board[0] = -2;
  board[11] = -5;
  board[16] = -3;
  board[18] = -5;

  const crawfordPlayed = options.crawfordPlayed ?? false;
  const atMatchPoint =
    targetPoints > 1 &&
    (scores.white === targetPoints - 1 || scores.black === targetPoints - 1);
  const isCrawford =
    options.isCrawford ?? (!crawfordPlayed && atMatchPoint);

  return {
    board,
    bar: { white: 0, black: 0 },
    off: { white: 0, black: 0 },
    turn: "white",
    dice: null,
    remainingDice: [],
    openingRoll: null,
    cube: { value: 1, owner: "center" },
    phase: "opening",
    pendingDoubleBy: null,
    scores: { ...scores },
    targetPoints,
    gameNumber,
    turnNumber: 1,
    isCrawford,
    crawfordPlayed: crawfordPlayed || isCrawford,
    jacoby: options.jacoby ?? false,
    result: null,
    moveHistory: [],
  };
}

export function resolveOpeningRoll(
  state: GameState,
  dice: [number, number],
): GameState {
  if (state.phase !== "opening") {
    throw new GameRuleError("INVALID_PHASE", "The opening roll is not available now.");
  }
  assertDice(dice);
  const openingRoll: [number, number] = [...dice];
  if (dice[0] === dice[1]) return { ...state, openingRoll };

  const turn = dice[0] > dice[1] ? "white" : "black";
  return {
    ...state,
    turn,
    dice: openingRoll,
    openingRoll,
    remainingDice: [...dice],
    phase: "moving",
  };
}

export function rollTurn(state: GameState, dice: [number, number]): GameState {
  if (state.phase !== "turnStart") {
    throw new GameRuleError("INVALID_PHASE", "The dice can only be rolled at turn start.");
  }
  assertDice(dice);
  return {
    ...state,
    dice: [...dice],
    remainingDice: dice[0] === dice[1] ? Array(4).fill(dice[0]) : [...dice],
    phase: "moving",
  };
}

export function legalTurns(
  state: GameState,
  dice: readonly number[] = state.remainingDice,
): CheckerMove[][] {
  assertDice(dice);
  if (dice.length === 0) return [];

  const turns = enumerateTurns(
    { board: state.board, bar: state.bar, off: state.off },
    state.turn,
    dice,
  ).filter((turn) => turn.length > 0);
  if (turns.length === 0) return [];

  const maxMoves = Math.max(...turns.map((turn) => turn.length));
  let legal = turns.filter((turn) => turn.length === maxMoves);
  if (dice.length === 2 && dice[0] !== dice[1] && maxMoves === 1) {
    const higherDie = Math.max(dice[0], dice[1]);
    if (legal.some((turn) => turn[0].die === higherDie)) {
      legal = legal.filter((turn) => turn[0].die === higherDie);
    }
  }
  return legal;
}

export function legalMoves(state: GameState): CheckerMove[] {
  if (state.phase !== "moving") return [];
  const unique = new Map<string, CheckerMove>();
  for (const turn of legalTurns(state)) {
    const move = turn[0];
    unique.set(moveKey(move), move);
  }
  return [...unique.values()];
}

export function applyMove(state: GameState, move: CheckerMove): GameState {
  if (state.phase !== "moving") {
    throw new GameRuleError("INVALID_PHASE", "A checker can only move during a turn.");
  }
  const legalMove = legalMoves(state).find(
    (candidate) => moveKey(candidate) === moveKey(move),
  );
  if (!legalMove) {
    throw new GameRuleError("ILLEGAL_MOVE", "That checker move is not legal.");
  }

  const { position, hit, borneOff } = applyPositionMove(
    { board: state.board, bar: state.bar, off: state.off },
    state.turn,
    legalMove,
  );
  const record: MoveRecord = {
    ...legalMove,
    player: state.turn,
    turnNumber: state.turnNumber,
    hit,
    borneOff,
  };
  const next: GameState = {
    ...state,
    ...position,
    remainingDice: removeDie(state.remainingDice, legalMove.die),
    moveHistory: [...state.moveHistory, record],
  };

  if (position.off[state.turn] === 15) {
    return finishGame(next, state.turn, getResultType(next, state.turn));
  }
  return next;
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== "moving") {
    throw new GameRuleError("INVALID_PHASE", "There is no active turn to end.");
  }
  if (state.remainingDice.length > 0 && legalMoves(state).length > 0) {
    throw new GameRuleError("INVALID_PHASE", "All available dice must be played first.");
  }
  return {
    ...state,
    turn: otherPlayer(state.turn),
    phase: "turnStart",
    dice: null,
    remainingDice: [],
    openingRoll: null,
    turnNumber: state.turnNumber + 1,
  };
}

export function nextGame(state: GameState): GameState {
  if (state.phase !== "gameOver") {
    throw new GameRuleError("INVALID_PHASE", "A new game can only start after a game ends.");
  }
  return createInitialGame(
    state.targetPoints,
    state.scores,
    { jacoby: state.jacoby, crawfordPlayed: state.crawfordPlayed },
    state.gameNumber + 1,
  );
}

export function canDouble(state: GameState, player: Player = state.turn): boolean {
  return (
    state.phase === "turnStart" &&
    player === state.turn &&
    !state.isCrawford &&
    state.cube.value < 64 &&
    (state.cube.owner === "center" || state.cube.owner === player)
  );
}

export function offerDouble(state: GameState, player: Player = state.turn): GameState {
  if (!canDouble(state, player)) {
    throw new GameRuleError("CUBE_NOT_ALLOWED", "The doubling cube is not available.");
  }
  return { ...state, phase: "doubleOffered", pendingDoubleBy: player };
}

export function takeDouble(state: GameState, player: Player): GameState {
  if (state.phase !== "doubleOffered" || !state.pendingDoubleBy) {
    throw new GameRuleError("CUBE_NOT_ALLOWED", "There is no double to accept.");
  }
  if (player !== otherPlayer(state.pendingDoubleBy)) {
    throw new GameRuleError("CUBE_NOT_ALLOWED", "Only the opponent can accept the double.");
  }
  return {
    ...state,
    cube: { value: state.cube.value * 2, owner: player },
    phase: "turnStart",
    pendingDoubleBy: null,
  };
}

export function dropDouble(state: GameState, player: Player): GameState {
  if (state.phase !== "doubleOffered" || !state.pendingDoubleBy) {
    throw new GameRuleError("CUBE_NOT_ALLOWED", "There is no double to decline.");
  }
  if (player !== otherPlayer(state.pendingDoubleBy)) {
    throw new GameRuleError("CUBE_NOT_ALLOWED", "Only the opponent can decline the double.");
  }
  return finishGame(state, state.pendingDoubleBy, "dropped");
}

export function resignGame(
  state: GameState,
  player: Player,
  level: "single" | "gammon" | "backgammon" = "single",
): GameState {
  if (state.phase === "gameOver" || state.phase === "matchOver") {
    throw new GameRuleError("INVALID_PHASE", "This game has already ended.");
  }
  return finishGame(state, otherPlayer(player), level);
}

export function getPlayerAtPoint(state: GameState, point: number): Player | null {
  const count = state.board[point];
  if (count > 0) return "white";
  if (count < 0) return "black";
  return null;
}

export function playerName(player: Player): string {
  return player === "white" ? "Blancas" : "Negras";
}

export function pointNumber(point: number): number {
  return point + 1;
}
