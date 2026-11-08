export type Player = "white" | "black";
export type CubeOwner = Player | "center";
export type GamePhase =
  | "opening"
  | "turnStart"
  | "moving"
  | "doubleOffered"
  | "gameOver"
  | "matchOver";
export type GameResultType = "single" | "gammon" | "backgammon" | "dropped";
export type AiLevel = "beginner" | "intermediate" | "expert";

export const BAR = -1;
export const OFF = 24;

export interface CheckerMove {
  from: number;
  to: number;
  die: number;
}

export interface GameResult {
  winner: Player;
  type: GameResultType;
  points: number;
}

export interface MoveRecord extends CheckerMove {
  player: Player;
  turnNumber: number;
  hit: boolean;
  borneOff: boolean;
}

export interface GameState {
  board: number[];
  bar: Record<Player, number>;
  off: Record<Player, number>;
  turn: Player;
  dice: [number, number] | null;
  remainingDice: number[];
  openingRoll: [number, number] | null;
  cube: { value: number; owner: CubeOwner };
  phase: GamePhase;
  pendingDoubleBy: Player | null;
  scores: Record<Player, number>;
  targetPoints: number;
  gameNumber: number;
  turnNumber: number;
  isCrawford: boolean;
  crawfordPlayed: boolean;
  jacoby: boolean;
  result: GameResult | null;
  moveHistory: MoveRecord[];
}

export class GameRuleError extends Error {
  constructor(
    public readonly code: "ILLEGAL_MOVE" | "INVALID_PHASE" | "CUBE_NOT_ALLOWED",
    message: string,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}
