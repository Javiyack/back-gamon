import { describe, expect, it } from "vitest";
import {
  applyMove,
  canDouble,
  createInitialGame,
  dropDouble,
  endTurn,
  legalMoves,
  legalTurns,
  nextGame,
  offerDouble,
  resolveOpeningRoll,
  rollTurn,
  takeDouble,
} from "./engine";
import { BAR, OFF, GameRuleError, type GameState, type Player } from "./types";

function movingState(
  overrides: Partial<GameState> = {},
): GameState {
  return {
    ...createInitialGame(3),
    phase: "moving",
    turn: "white",
    dice: [1, 2],
    remainingDice: [1, 2],
    ...overrides,
  };
}

function emptyBoard(): number[] {
  return Array<number>(24).fill(0);
}

function totalCheckers(state: GameState, player: Player): number {
  const sign = player === "white" ? 1 : -1;
  return (
    state.bar[player] +
    state.off[player] +
    state.board.reduce((sum, count) => sum + Math.max(0, count * sign), 0)
  );
}

describe("backgammon rules engine", () => {
  it("creates the standard starting position with 15 checkers per player", () => {
    const state = createInitialGame();

    expect(state.board).toHaveLength(24);
    expect(state.board[23]).toBe(2);
    expect(state.board[12]).toBe(5);
    expect(state.board[7]).toBe(3);
    expect(state.board[5]).toBe(5);
    expect(state.board[0]).toBe(-2);
    expect(state.board[11]).toBe(-5);
    expect(state.board[16]).toBe(-3);
    expect(state.board[18]).toBe(-5);
    expect(totalCheckers(state, "white")).toBe(15);
    expect(totalCheckers(state, "black")).toBe(15);
  });

  it("uses both dice whenever a two-move turn is possible", () => {
    const board = emptyBoard();
    board[10] = 2;
    const turns = legalTurns(
      movingState({ board, remainingDice: [1, 2], dice: [1, 2] }),
    );

    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((turn) => turn.length === 2)).toBe(true);
    expect(turns.every((turn) => new Set(turn.map((move) => move.die)).size === 2)).toBe(true);
  });

  it("plays the higher die when only one of two dice can be used", () => {
    const board = emptyBoard();
    board[0] = 1;
    const state = movingState({
      board,
      off: { white: 14, black: 15 },
      remainingDice: [5, 6],
      dice: [5, 6],
    });

    expect(legalTurns(state)).toEqual([[{ from: 0, to: OFF, die: 6 }]]);
  });

  it("grants four moves for doubles", () => {
    const board = emptyBoard();
    board[12] = 4;
    const state = movingState({
      board,
      dice: [2, 2],
      remainingDice: [2, 2, 2, 2],
    });

    expect(legalTurns(state).every((turn) => turn.length === 4)).toBe(true);
  });

  it("requires re-entry from the bar before moving checkers on the board", () => {
    const board = emptyBoard();
    board[10] = 1;
    board[23] = -1;
    const state = movingState({
      board,
      bar: { white: 1, black: 0 },
      remainingDice: [1, 6],
      dice: [1, 6],
    });

    expect(legalMoves(state).length).toBeGreaterThan(0);
    expect(legalMoves(state).every((move) => move.from === BAR)).toBe(true);

    const next = applyMove(state, { from: BAR, to: 23, die: 1 });
    expect(next.bar.white).toBe(0);
    expect(next.bar.black).toBe(1);
    expect(next.board[23]).toBe(1);
  });

  it("allows black checkers to re-enter from the bar and hit a blot", () => {
    const board = emptyBoard();
    board[0] = 1;
    const state = movingState({
      board,
      turn: "black",
      bar: { white: 0, black: 1 },
      remainingDice: [1],
    });

    expect(legalMoves(state)).toContainEqual({ from: BAR, to: 0, die: 1 });
    const next = applyMove(state, { from: BAR, to: 0, die: 1 });
    expect(next.bar.black).toBe(0);
    expect(next.bar.white).toBe(1);
    expect(next.board[0]).toBe(-1);
  });

  it("rejects a move onto a point blocked by two opposing checkers", () => {
    const board = emptyBoard();
    board[10] = 1;
    board[9] = -2;
    const state = movingState({ board, remainingDice: [1], dice: [1, 2] });

    expect(() => applyMove(state, { from: 10, to: 9, die: 1 })).toThrow(GameRuleError);
    expect(legalMoves(state).some((move) => move.to === 9)).toBe(false);
  });

  it("blocks an oversized bear-off when a checker is on a higher point", () => {
    const board = emptyBoard();
    board[0] = 1;
    board[2] = 1;
    const state = movingState({
      board,
      off: { white: 13, black: 15 },
      remainingDice: [2],
      dice: [2, 5],
    });
    const moves = legalMoves(state);

    expect(moves.some((move) => move.from === 0)).toBe(false);
    expect(moves.every((move) => move.from === 2 && move.to === 0)).toBe(true);
  });

  it("allows an oversized bear-off when no checker remains on a higher point", () => {
    const board = emptyBoard();
    board[0] = 1;
    const state = movingState({
      board,
      off: { white: 14, black: 15 },
      remainingDice: [5],
      dice: [5, 6],
    });

    expect(legalMoves(state)).toContainEqual({ from: 0, to: OFF, die: 5 });
  });

  it("resolves opening rolls and repeats ties", () => {
    const opening = createInitialGame();
    const tied = resolveOpeningRoll(opening, [4, 4]);
    expect(tied.phase).toBe("opening");
    expect(tied.openingRoll).toEqual([4, 4]);

    const resolved = resolveOpeningRoll(tied, [6, 2]);
    expect(resolved.phase).toBe("moving");
    expect(resolved.turn).toBe("white");
    expect(resolved.remainingDice).toEqual([6, 2]);
  });

  it("moves the turn on when no legal dice remain", () => {
    const board = emptyBoard();
    const state = movingState({
      board,
      remainingDice: [1, 2],
      dice: [1, 2],
    });

    const next = endTurn(state);
    expect(next.phase).toBe("turnStart");
    expect(next.turn).toBe("black");
    expect(next.turnNumber).toBe(state.turnNumber + 1);
  });

  it("enforces Crawford and transfers cube ownership after a take", () => {
    const crawford = createInitialGame(3, { white: 2, black: 0 });
    expect(crawford.isCrawford).toBe(true);
    expect(canDouble(crawford)).toBe(false);

    const start = { ...createInitialGame(3), phase: "turnStart" as const };
    const offered = offerDouble(start, "white");
    const taken = takeDouble(offered, "black");
    expect(taken.cube).toEqual({ value: 2, owner: "black" });
    expect(taken.turn).toBe("white");
    expect(taken.phase).toBe("turnStart");
  });

  it("awards the current cube value when a double is dropped", () => {
    const start = { ...createInitialGame(3), phase: "turnStart" as const };
    const offered = offerDouble(start, "white");
    const dropped = dropDouble(offered, "black");

    expect(dropped.result).toEqual({ winner: "white", type: "dropped", points: 1 });
    expect(dropped.scores.white).toBe(1);
    expect(dropped.phase).toBe("gameOver");
  });

  it("scores a gammon as a single point under Jacoby until the cube is turned", () => {
    const board = emptyBoard();
    board[0] = 1;
    board[10] = -15;
    const state = movingState({
      board,
      off: { white: 14, black: 0 },
      remainingDice: [1],
      dice: [1, 2],
      jacoby: true,
    });
    const finished = applyMove(state, { from: 0, to: OFF, die: 1 });

    expect(finished.result).toEqual({ winner: "white", type: "gammon", points: 1 });
  });

  it("ends a match immediately when the target score is reached", () => {
    const board = emptyBoard();
    board[0] = 1;
    board[10] = -14;
    const state = movingState({
      board,
      off: { white: 14, black: 1 },
      remainingDice: [1],
      dice: [1, 2],
      targetPoints: 1,
    });
    const finished = applyMove(state, { from: 0, to: OFF, die: 1 });

    expect(finished.result).toEqual({ winner: "white", type: "single", points: 1 });
    expect(finished.phase).toBe("matchOver");
    expect(finished.scores.white).toBe(1);
  });

  it("preserves checker totals and never mixes colors during a seeded game", () => {
    let seed = 0x5eed1234;
    const randomInt = (maximum: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % maximum;
    };
    const randomRoll = (): [number, number] => [
      randomInt(6) + 1,
      randomInt(6) + 1,
    ];
    let state = createInitialGame(7);

    for (let action = 0; action < 500; action += 1) {
      if (state.phase === "opening") {
        state = resolveOpeningRoll(state, randomRoll());
      } else if (state.phase === "turnStart") {
        state = rollTurn(state, randomRoll());
      } else if (state.phase === "moving") {
        const moves = legalMoves(state);
        state = moves.length === 0
          ? endTurn(state)
          : applyMove(state, moves[randomInt(moves.length)]);
      } else if (state.phase === "gameOver") {
        state = nextGame(state);
      } else {
        break;
      }

      expect(totalCheckers(state, "white")).toBe(15);
      expect(totalCheckers(state, "black")).toBe(15);
      expect(
        state.board.every((count) => Number.isInteger(count) && Math.abs(count) <= 15),
      ).toBe(true);
      expect(state.bar.white).toBeGreaterThanOrEqual(0);
      expect(state.bar.black).toBeGreaterThanOrEqual(0);
      expect(state.off.white).toBeGreaterThanOrEqual(0);
      expect(state.off.black).toBeGreaterThanOrEqual(0);
    }
  });
});
