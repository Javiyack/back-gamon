import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Crown,
  Dice5,
  Download,
  Flag,
  History,
  Home,
  Languages,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Trophy,
  UserRound,
  Wifi,
  X,
} from "lucide-react";
import BackgammonBoard from "./components/BackgammonBoard";
import {
  aiShouldTakeDouble,
  chooseAiTurn,
} from "./game/ai";
import {
  applyMove,
  canDouble,
  createInitialGame,
  dropDouble,
  endTurn,
  legalMoves,
  nextGame,
  offerDouble,
  resolveOpeningRoll,
  resignGame,
  rollTurn,
  takeDouble,
} from "./game/engine";
import {
  BAR,
  OFF,
  type AiLevel,
  type GameResultType,
  type GameState,
  type MoveRecord,
  type Player,
} from "./game/types";
import { messages, type Language } from "./i18n";

type Screen = "home" | "game" | "history" | "rules";

interface LocalStats {
  elo: number;
  gamesPlayed: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
}

interface GameRecord {
  id: string;
  playedAt: string;
  winner: Player;
  result: GameResultType;
  points: number;
  aiLevel: AiLevel;
  targetPoints: number;
  moveHistory: MoveRecord[];
}

const STATS_KEY = "pip.backgammon.stats.v1";
const HISTORY_KEY = "pip.backgammon.history.v1";
const LANGUAGE_KEY = "pip.backgammon.language.v1";
const CONTRAST_KEY = "pip.backgammon.contrast.v1";
const DICE_ANIMATION_DURATION = 900;
const LEVEL_RATING: Record<AiLevel, number> = {
  beginner: 1200,
  intermediate: 1500,
  expert: 1800,
};
const DEFAULT_STATS: LocalStats = {
  elo: 1500,
  gamesPlayed: 0,
  wins: 0,
  currentStreak: 0,
  bestStreak: 0,
};

function shouldReduceMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStats(): LocalStats {
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return DEFAULT_STATS;
    const value: unknown = JSON.parse(raw);
    if (
      isRecord(value) &&
      typeof value.elo === "number" &&
      typeof value.gamesPlayed === "number" &&
      typeof value.wins === "number" &&
      typeof value.currentStreak === "number" &&
      typeof value.bestStreak === "number"
    ) {
      return {
        elo: value.elo,
        gamesPlayed: value.gamesPlayed,
        wins: value.wins,
        currentStreak: value.currentStreak,
        bestStreak: value.bestStreak,
      };
    }
    console.warn("Saved backgammon stats are invalid; using fresh local stats.");
  } catch (error) {
    console.error("Could not read local backgammon stats.", error);
  }
  return DEFAULT_STATS;
}

function isGameRecord(value: unknown): value is GameRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.playedAt === "string" &&
    (value.winner === "white" || value.winner === "black") &&
    (value.result === "single" ||
      value.result === "gammon" ||
      value.result === "backgammon" ||
      value.result === "dropped") &&
    typeof value.points === "number" &&
    (value.aiLevel === "beginner" ||
      value.aiLevel === "intermediate" ||
      value.aiLevel === "expert") &&
    typeof value.targetPoints === "number" &&
    Array.isArray(value.moveHistory)
  );
}

function readHistory(): GameRecord[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value) && value.every(isGameRecord)) return value;
    console.warn("Saved backgammon history is invalid; starting with an empty history.");
  } catch (error) {
    console.error("Could not read local backgammon history.", error);
  }
  return [];
}

function readLanguage(): Language {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "es";
  } catch (error) {
    console.error("Could not read the saved language preference.", error);
    return "es";
  }
}

function readContrast(): boolean {
  try {
    return window.localStorage.getItem(CONTRAST_KEY) === "true";
  } catch (error) {
    console.error("Could not read the saved contrast preference.", error);
    return false;
  }
}

function saveLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Could not save local backgammon data for ${key}.`, error);
  }
}

function createMatchId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `match-${Date.now()}`;
}

function rollSecureDie(): number {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Web Crypto is unavailable.");
  }
  const values = new Uint32Array(1);
  const range = 0x1_0000_0000;
  const limit = Math.floor(range / 6) * 6;
  do {
    cryptoApi.getRandomValues(values);
  } while (values[0] >= limit);
  return (values[0] % 6) + 1;
}

function rollSecurePair(): [number, number] {
  return [rollSecureDie(), rollSecureDie()];
}

function pointLabel(point: number, language: Language): string {
  const copy = messages[language];
  if (point === BAR) return copy.bar;
  if (point === OFF) return copy.off;
  return String(point + 1);
}

function resultText(result: GameResultType, language: Language): string {
  const copy = messages[language];
  switch (result) {
    case "gammon":
      return copy.gammon;
    case "backgammon":
      return copy.backgammon;
    case "dropped":
      return copy.dropped;
    default:
      return copy.single;
  }
}

function formatMove(move: MoveRecord, language: Language): string {
  const copy = messages[language];
  const from = pointLabel(move.from, language);
  const to = pointLabel(move.to, language);
  const action = move.hit
    ? copy.hit
    : move.borneOff
      ? copy.borneOff
      : copy.moved;
  const player =
    move.player === "white"
      ? copy.guest
      : language === "es" ? "Pip IA" : "Pip AI";
  return `${player}: ${from} → ${to} · ${move.die} (${action})`;
}

function DieFace({
  value,
  rolling,
  rollIndex,
  diceLabel,
  rollingLabel,
}: {
  value: number | null;
  rolling: boolean;
  rollIndex: number;
  diceLabel: string;
  rollingLabel: string;
}) {
  const [rollingValue, setRollingValue] = useState(rollIndex === 0 ? 1 : 4);
  const reduceMotion = shouldReduceMotion();
  const positions: Record<number, string[]> = {
    1: ["center"],
    2: ["top-left", "bottom-right"],
    3: ["top-left", "center", "bottom-right"],
    4: ["top-left", "top-right", "bottom-left", "bottom-right"],
    5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
    6: [
      "top-left",
      "top-right",
      "middle-left",
      "middle-right",
      "bottom-left",
      "bottom-right",
    ],
  };
  useEffect(() => {
    if (!rolling || reduceMotion) return;
    setRollingValue(rollIndex === 0 ? 1 : 4);
    const timer = window.setInterval(() => {
      setRollingValue((previous) => (previous === 6 ? 1 : previous + 1));
    }, 75);
    return () => window.clearInterval(timer);
  }, [reduceMotion, rollIndex, rolling]);

  const faceValue = rolling && !reduceMotion ? rollingValue : value;
  return (
    <span
      className={`die-face${faceValue === null ? " die-face--empty" : ""}${rolling ? ` die-face--rolling die-face--rolling-${rollIndex + 1}` : faceValue === null ? "" : " die-face--landed"}`}
      role="img"
      aria-label={rolling ? rollingLabel : faceValue === null ? "—" : `${diceLabel} ${faceValue}`}
    >
      {faceValue !== null &&
        positions[faceValue].map((position) => (
          <span className={`die-pip die-pip--${position}`} key={position} />
        ))}
    </span>
  );
}

function MiniBoard() {
  return (
    <div className="mini-board" aria-hidden="true">
      <div className="mini-board__row mini-board__row--top">
        {Array.from({ length: 8 }, (_, index) => (
          <span
            className={`mini-point mini-point--${index % 2 === 0 ? "light" : "dark"}`}
            key={`top-${index}`}
          />
        ))}
      </div>
      <div className="mini-board__bar" />
      <div className="mini-board__row mini-board__row--bottom">
        {Array.from({ length: 8 }, (_, index) => (
          <span
            className={`mini-point mini-point--${index % 2 === 0 ? "dark" : "light"}`}
            key={`bottom-${index}`}
          />
        ))}
      </div>
      <span className="mini-checker mini-checker--one" />
      <span className="mini-checker mini-checker--two" />
      <span className="mini-checker mini-checker--three" />
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState<Language>(readLanguage);
  const [highContrast, setHighContrast] = useState(readContrast);
  const [screen, setScreen] = useState<Screen>("home");
  const [level, setLevel] = useState<AiLevel>("intermediate");
  const [matchTarget, setMatchTarget] = useState(3);
  const [jacoby, setJacoby] = useState(false);
  const [stats, setStats] = useState<LocalStats>(readStats);
  const [history, setHistory] = useState<GameRecord[]>(readHistory);
  const [game, setGame] = useState<GameState>(() => createInitialGame());
  const [matchId, setMatchId] = useState(createMatchId);
  const [selectedFrom, setSelectedFrom] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [showResign, setShowResign] = useState(false);
  const [diceRolling, setDiceRolling] = useState(false);
  const gameRef = useRef(game);
  const diceAnimationTimer = useRef<number | null>(null);
  const savedGames = useRef(new Set<string>());
  const copy = messages[language];

  const startDiceAnimation = useCallback(() => {
    if (diceAnimationTimer.current !== null) {
      window.clearTimeout(diceAnimationTimer.current);
    }
    setDiceRolling(true);
    diceAnimationTimer.current = window.setTimeout(() => {
      diceAnimationTimer.current = null;
      setDiceRolling(false);
    }, shouldReduceMotion() ? 0 : DICE_ANIMATION_DURATION);
  }, []);

  const cancelDiceAnimation = useCallback(() => {
    if (diceAnimationTimer.current !== null) {
      window.clearTimeout(diceAnimationTimer.current);
      diceAnimationTimer.current = null;
    }
    setDiceRolling(false);
  }, []);

  const allLegalMoves = useMemo(() => legalMoves(game), [game]);
  const playerMoves = game.turn === "white" ? allLegalMoves : [];
  const selectablePoints = useMemo(
    () => new Set(playerMoves.map((move) => move.from)),
    [playerMoves],
  );
  const destinations = useMemo(
    () =>
      new Set(
        selectedFrom === null
          ? []
          : playerMoves
              .filter((move) => move.from === selectedFrom)
              .map((move) => move.to),
      ),
    [playerMoves, selectedFrom],
  );

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(
    () => () => {
      if (diceAnimationTimer.current !== null) {
        window.clearTimeout(diceAnimationTimer.current);
      }
    },
    [],
  );

  useEffect(() => saveLocal(STATS_KEY, stats), [stats]);
  useEffect(() => saveLocal(HISTORY_KEY, history.slice(0, 100)), [history]);
  useEffect(() => saveLocal(LANGUAGE_KEY, language), [language]);
  useEffect(() => saveLocal(CONTRAST_KEY, highContrast), [highContrast]);

  useEffect(() => {
    if (
      (game.phase !== "gameOver" && game.phase !== "matchOver") ||
      !game.result
    ) {
      return;
    }
    const recordId = `${matchId}-${game.gameNumber}`;
    if (savedGames.current.has(recordId)) return;
    savedGames.current.add(recordId);

    const record: GameRecord = {
      id: recordId,
      playedAt: new Date().toISOString(),
      winner: game.result.winner,
      result: game.result.type,
      points: game.result.points,
      aiLevel: level,
      targetPoints: game.targetPoints,
      moveHistory: game.moveHistory,
    };
    setHistory((previous) => [record, ...previous].slice(0, 100));
    setStats((previous) => {
      const won = game.result?.winner === "white";
      const expected = 1 / (1 + 10 ** ((LEVEL_RATING[level] - previous.elo) / 400));
      const updatedStreak = won ? previous.currentStreak + 1 : 0;
      return {
        elo: Math.max(100, Math.round(previous.elo + 32 * ((won ? 1 : 0) - expected))),
        gamesPlayed: previous.gamesPlayed + 1,
        wins: previous.wins + (won ? 1 : 0),
        currentStreak: updatedStreak,
        bestStreak: Math.max(previous.bestStreak, updatedStreak),
      };
    });
  }, [game, level, matchId]);

  useEffect(() => {
    if (screen !== "game" || diceRolling) return;
    let timer: number | undefined;

    if (game.phase === "doubleOffered" && game.pendingDoubleBy === "white") {
      timer = window.setTimeout(() => {
        const current = gameRef.current;
        if (current.phase !== "doubleOffered" || !current.pendingDoubleBy) return;
        const accepted = aiShouldTakeDouble(current, level);
        setGame(
          accepted
            ? takeDouble(current, "black")
            : dropDouble(current, "black"),
        );
        setNotice(accepted ? copy.doubleAccepted : copy.dropped);
      }, 900);
    } else if (game.phase === "turnStart" && game.turn === "black") {
      timer = window.setTimeout(() => {
        const current = gameRef.current;
        if (current.phase !== "turnStart" || current.turn !== "black") return;
        try {
          const next = rollTurn(current, rollSecurePair());
          startDiceAnimation();
          setGame(next);
        } catch (error) {
          console.error("The AI could not roll the dice.", error);
          setNotice(copy.diceUnavailable);
        }
      }, 650);
    } else if (
      game.phase === "moving" &&
      game.turn === "black" &&
      allLegalMoves.length > 0
    ) {
      timer = window.setTimeout(() => {
        const current = gameRef.current;
        if (current.phase !== "moving" || current.turn !== "black") return;
        try {
          const move = chooseAiTurn(current, level)[0];
          if (move) setGame(applyMove(current, move));
        } catch (error) {
          console.error("The AI could not make a legal move.", error);
          setNotice(copy.illegalMove);
        }
      }, 520);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [allLegalMoves, copy, diceRolling, game, level, screen, startDiceAnimation]);

  useEffect(() => {
    if (screen !== "game" || diceRolling || game.phase !== "moving") return;
    if (game.remainingDice.length > 0 && allLegalMoves.length > 0) return;

    const turn = game.turn;
    const turnNumber = game.turnNumber;
    const wait = game.remainingDice.length > 0 ? 1400 : 420;
    const timer = window.setTimeout(() => {
      const current = gameRef.current;
      if (
        current.phase !== "moving" ||
        current.turn !== turn ||
        current.turnNumber !== turnNumber
      ) {
        return;
      }
      try {
        setGame(endTurn(current));
        if (current.remainingDice.length > 0) setNotice(copy.noMoves);
      } catch (error) {
        console.error("Could not finish the turn.", error);
      }
    }, wait);
    return () => window.clearTimeout(timer);
  }, [allLegalMoves.length, copy, diceRolling, game, screen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function startNewMatch(): void {
    cancelDiceAnimation();
    setGame(createInitialGame(matchTarget, { white: 0, black: 0 }, { jacoby }));
    setMatchId(createMatchId());
    setSelectedFrom(null);
    setNotice("");
    setScreen("game");
  }

  function handleRoll(): void {
    if (diceRolling) return;
    try {
      if (game.phase === "opening") {
        const next = resolveOpeningRoll(game, rollSecurePair());
        startDiceAnimation();
        setGame(next);
        setNotice(
          next.phase === "opening"
            ? copy.tieRoll
            : next.turn === "white"
              ? copy.openingWon
              : copy.openingLost,
        );
      } else if (game.phase === "turnStart" && game.turn === "white") {
        const next = rollTurn(game, rollSecurePair());
        startDiceAnimation();
        setGame(next);
        setNotice("");
      }
      setSelectedFrom(null);
    } catch (error) {
      console.error("Could not roll the dice.", error);
      setNotice(copy.diceUnavailable);
    }
  }

  function handlePointClick(point: number): void {
    if (diceRolling || game.phase !== "moving" || game.turn !== "white") return;
    if (point === selectedFrom) {
      setSelectedFrom(null);
      return;
    }
    const move = allLegalMoves.find(
      (candidate) => candidate.from === selectedFrom && candidate.to === point,
    );
    if (selectedFrom !== null && move) {
      try {
        setGame(applyMove(game, move));
        setSelectedFrom(null);
        setNotice("");
      } catch (error) {
        console.error("Could not apply the selected move.", error);
        setNotice(copy.illegalMove);
      }
      return;
    }
    if (selectablePoints.has(point)) {
      setSelectedFrom(point);
    } else {
      setSelectedFrom(null);
    }
  }

  function handleBearOff(): void {
    if (selectedFrom === null) return;
    const move = allLegalMoves.find(
      (candidate) => candidate.from === selectedFrom && candidate.to === OFF,
    );
    if (move) handlePointClick(OFF);
  }

  function handleNextGame(): void {
    try {
      cancelDiceAnimation();
      setGame(nextGame(game));
      setSelectedFrom(null);
      setNotice("");
    } catch (error) {
      console.error("Could not start the next game.", error);
    }
  }

  function handleResign(): void {
    try {
      cancelDiceAnimation();
      setGame(resignGame(game, "white"));
      setShowResign(false);
      setSelectedFrom(null);
    } catch (error) {
      console.error("Could not resign the game.", error);
    }
  }

  function exportLocalData(): void {
    const blob = new Blob(
      [JSON.stringify({ stats, history }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pip-backgammon-data.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const navItems = [
    { id: "home" as const, label: copy.home, icon: Home },
    { id: "history" as const, label: copy.history, icon: History },
    { id: "rules" as const, label: copy.guide, icon: BookOpen },
  ];
  const heading =
    screen === "home"
      ? copy.home
      : screen === "game"
        ? copy.play
        : screen === "history"
          ? copy.history
          : copy.guide;
  const winRate =
    stats.gamesPlayed === 0
      ? 0
      : Math.round((stats.wins / stats.gamesPlayed) * 100);
  const shownRecords = history.slice(0, 4);
  const activeDice = game.dice ?? game.openingRoll;
  const aiTurn = game.turn === "black";
  const humanCanRoll =
    !diceRolling &&
    (game.phase === "opening" ||
      (game.phase === "turnStart" && game.turn === "white"));
  const gameIsOver = game.phase === "gameOver" || game.phase === "matchOver";
  const statusTitle =
    diceRolling
      ? copy.diceRolling
      : game.phase === "opening"
      ? copy.openingRoll
      : game.phase === "doubleOffered"
        ? game.pendingDoubleBy === "white"
          ? copy.waiting
          : copy.aiOffered
        : game.phase === "turnStart" && aiTurn
          ? copy.aiRolling
          : game.phase === "moving" && aiTurn
            ? copy.aiMoving
            : copy.yourTurn;
  const statusDescription =
    diceRolling
      ? copy.diceRollingHint
      : game.phase === "opening"
      ? game.openingRoll !== null &&
        game.openingRoll[0] === game.openingRoll[1]
        ? copy.tieRoll
        : copy.rollPrompt
      : game.phase === "doubleOffered"
        ? game.pendingDoubleBy === "white"
          ? copy.offerWaiting
          : copy.aiOffered
        : game.phase === "turnStart" && !aiTurn
          ? copy.rollPrompt
          : game.phase === "moving" && !aiTurn
            ? allLegalMoves.length === 0
              ? copy.noMoves
              : selectedFrom === null
                ? copy.selectChecker
                : copy.movePrompt
            : copy.aiMoving;
  const currentScreenLabel = heading.toUpperCase();

  return (
    <div className={`app-shell${highContrast ? " app-shell--contrast" : ""}`}>
      <aside className="sidebar">
        <button className="brand-lockup" type="button" onClick={() => setScreen("home")}>
          <span className="brand-mark">
            <Dice5 size={22} strokeWidth={2.2} />
          </span>
          <span className="brand-copy">
            <strong>pip</strong>
            <small>{copy.tagline}</small>
          </span>
        </button>

        <div className="sidebar-section-label">{copy.home}</div>
        <nav className="side-nav" aria-label={language === "es" ? "Navegación principal" : "Main navigation"}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-link${screen === item.id ? " nav-link--active" : ""}`}
                key={item.id}
                type="button"
                aria-label={item.label}
                onClick={() => setScreen(item.id)}
                aria-current={screen === item.id ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
                {screen === item.id && <span className="nav-link__active-dot" />}
              </button>
            );
          })}
          <button className="nav-link nav-link--disabled" type="button" aria-label={copy.online} title={copy.comingSoon} disabled>
            <Trophy size={18} strokeWidth={1.8} />
            <span>{copy.online}</span>
            <span className="nav-soon-dot" title={copy.comingSoon} />
          </button>
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <div className="sidebar-note__icon">
            <ShieldCheck size={17} />
          </div>
          <div>
            <strong>{copy.localData}</strong>
            <span>{copy.localSession}</span>
          </div>
        </div>
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            <UserRound size={18} />
          </div>
          <div className="sidebar-user__copy">
            <strong>{copy.guest}</strong>
            <span>{copy.localSession}</span>
          </div>
          <span className="sidebar-user__status" />
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-crumb">
            <span>PIP</span>
            <ChevronRight size={14} />
            <strong>{currentScreenLabel}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-pill">
              <span className="local-pill__dot" />
              {copy.localOnly}
            </span>
            <button
              className="topbar-action"
              type="button"
              onClick={() => setLanguage((current) => current === "es" ? "en" : "es")}
              aria-label={language === "es" ? "Switch to English" : "Cambiar a español"}
              title={language === "es" ? "English" : "Español"}
            >
              <Languages size={17} />
              <span>{language.toUpperCase()}</span>
            </button>
            <button
              className={`topbar-action${highContrast ? " topbar-action--selected" : ""}`}
              type="button"
              onClick={() => setHighContrast((current) => !current)}
              aria-pressed={highContrast}
              aria-label={language === "es" ? "Alternar alto contraste" : "Toggle high contrast"}
              title={language === "es" ? "Alto contraste" : "High contrast"}
            >
              <Sun size={17} />
            </button>
            <div className="topbar-avatar" aria-label={copy.guest}>
              <UserRound size={17} />
            </div>
          </div>
        </header>

        <main className="main-content">
          {screen === "home" && (
            <div className="home-page page-enter">
              <div className="page-intro">
                <div>
                  <p className="eyebrow">{copy.greeting}</p>
                  <h1>{language === "es" ? "Buenas partidas, " : "Good games, "}<em>{language === "es" ? "buenas decisiones." : "better decisions."}</em></h1>
                </div>
                <span className="today-label">
                  <Clock3 size={14} />
                  {new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  }).format(new Date())}
                </span>
              </div>

              <section className="hero-panel">
                <div className="hero-copy">
                  <span className="hero-kicker">
                    <Sparkles size={14} />
                    {copy.practice}
                  </span>
                  <h2>
                    {copy.heroTitle}
                    <br />
                    <em>{copy.heroAccent}</em>
                  </h2>
                  <p>{copy.heroDescription}</p>
                  <button className="button button--light" type="button" onClick={startNewMatch}>
                    <Play size={16} fill="currentColor" />
                    {copy.startGame}
                    <ArrowRight size={17} />
                  </button>
                  <div className="hero-footnote">
                    <ShieldCheck size={14} />
                    {copy.localPracticeHint}
                  </div>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="hero-art__halo" />
                  <div className="hero-art__badge hero-art__badge--top">
                    <span>24</span>
                    <small>{language === "es" ? "PUNTOS" : "POINTS"}</small>
                  </div>
                  <MiniBoard />
                  <div className="hero-art__badge hero-art__badge--bottom">
                    <span>✦</span>
                    <small>PIP CLUB</small>
                  </div>
                  <span className="hero-art__spark hero-art__spark--one">✳</span>
                  <span className="hero-art__spark hero-art__spark--two">·</span>
                </div>
              </section>

              <div className="home-grid">
                <section className="setup-card">
                  <div className="section-heading">
                    <div className="section-heading__icon">
                      <Target size={18} />
                    </div>
                    <div>
                      <h2>{copy.setupTitle}</h2>
                      <p>{copy.setupDescription}</p>
                    </div>
                  </div>

                  <div className="form-group">
                    <div className="form-label-row">
                      <span className="form-label">{copy.chooseLevel}</span>
                      <span className="form-label-caption">
                        <Sparkles size={13} />
                        {copy.vsAi}
                      </span>
                    </div>
                    <div className="level-options" role="radiogroup" aria-label={copy.chooseLevel}>
                      {(["beginner", "intermediate", "expert"] as AiLevel[]).map((option) => (
                        <button
                          className={`level-option${level === option ? " level-option--selected" : ""}`}
                          type="button"
                          key={option}
                          role="radio"
                          aria-checked={level === option}
                          onClick={() => setLevel(option)}
                        >
                          <span className={`level-option__mark level-option__mark--${option}`}>
                            {option === "beginner" ? "I" : option === "intermediate" ? "II" : "III"}
                          </span>
                          <strong>{copy[option]}</strong>
                          <small>
                            {option === "beginner"
                              ? copy.beginnerHint
                              : option === "intermediate"
                                ? copy.intermediateHint
                                : copy.expertHint}
                          </small>
                          {level === option && <Check className="level-option__check" size={15} />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="setup-card__bottom">
                    <div className="match-length">
                      <span className="form-label">{copy.matchLength}</span>
                      <div className="point-options" role="group" aria-label={copy.matchLength}>
                        {[1, 3, 5, 7].map((points) => (
                          <button
                            className={matchTarget === points ? "point-option point-option--selected" : "point-option"}
                            type="button"
                            key={points}
                            aria-pressed={matchTarget === points}
                            onClick={() => setMatchTarget(points)}
                          >
                            {points}
                          </button>
                        ))}
                        <span className="point-options__label">
                          {matchTarget === 1 ? copy.point : copy.points}
                        </span>
                      </div>
                    </div>
                    <button
                      className={`switch-row${jacoby ? " switch-row--active" : ""}`}
                      type="button"
                      role="switch"
                      aria-checked={jacoby}
                      onClick={() => setJacoby((current) => !current)}
                    >
                      <span className="switch-row__copy">
                        <strong>{copy.jacoby}</strong>
                        <small>{copy.jacobyHint}</small>
                      </span>
                      <span className="toggle-switch"><span /></span>
                    </button>
                  </div>
                </section>

                <aside className="home-aside">
                  <section className="rating-card">
                    <div className="rating-card__top">
                      <div>
                        <span className="eyebrow eyebrow--muted">{copy.yourProgress}</span>
                        <h2>{copy.localRating}</h2>
                      </div>
                      <span className="rating-card__icon"><Award size={18} /></span>
                    </div>
                    <div className="rating-value">{stats.elo}<span> ELO</span></div>
                    <div className="rating-card__bar"><span style={{ width: `${Math.min(100, Math.max(14, ((stats.elo - 1000) / 1000) * 100))}%` }} /></div>
                    <div className="rating-stats">
                      <div>
                        <strong>{stats.gamesPlayed}</strong>
                        <span>{copy.gamesPlayed}</span>
                      </div>
                      <div>
                        <strong>{winRate}%</strong>
                        <span>{copy.winRate}</span>
                      </div>
                      <div>
                        <strong>{stats.bestStreak}</strong>
                        <span>{language === "es" ? "Mejor racha" : "Best streak"}</span>
                      </div>
                    </div>
                    <span className="rating-disclaimer">{copy.localElo}</span>
                  </section>

                  <section className="online-card">
                    <div className="online-card__icon"><Wifi size={18} /></div>
                    <div className="online-card__body">
                      <div className="online-card__topline">
                        <h3>{copy.onlineTitle}</h3>
                        <span>{copy.comingSoon}</span>
                      </div>
                      <p>{copy.onlineDescription}</p>
                    </div>
                    <div className="online-card__footer">
                      <span className="online-status-dot" />
                      {copy.onlineStatus}
                    </div>
                  </section>
                </aside>
              </div>

              <section className="recent-section">
                <div className="section-heading section-heading--compact">
                  <div>
                    <span className="eyebrow eyebrow--muted">{copy.localSession}</span>
                    <h2>{copy.recentGames}</h2>
                  </div>
                  <button className="text-button" type="button" onClick={() => setScreen("history")}>
                    {copy.seeHistory}
                    <ChevronRight size={16} />
                  </button>
                </div>
                {shownRecords.length === 0 ? (
                  <div className="empty-recent">
                    <div className="empty-recent__icon"><Dice5 size={20} /></div>
                    <div>
                      <strong>{copy.noGames}</strong>
                      <p>{copy.noGamesHint}</p>
                    </div>
                    <button className="text-button" type="button" onClick={startNewMatch}>
                      {copy.startFirst}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="recent-list">
                    {shownRecords.map((record) => (
                      <div className="recent-row" key={record.id}>
                        <span className={`recent-result-dot${record.winner === "white" ? " recent-result-dot--win" : ""}`} />
                        <div className="recent-row__title">
                          <strong>{record.winner === "white" ? copy.gameWon : copy.gameLost}</strong>
                          <span>{resultText(record.result, language)} · {copy[record.aiLevel]}</span>
                        </div>
                        <span className="recent-row__score">
                          {record.winner === "white" ? `+${record.points}` : `−${record.points}`}
                        </span>
                        <time>{new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short" }).format(new Date(record.playedAt))}</time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {screen === "game" && (
            <div className="game-page page-enter">
              <div className="game-page__toolbar">
                <button className="back-link" type="button" onClick={() => setScreen("home")}>
                  <ArrowLeft size={16} />
                  {copy.home}
                </button>
                <span className="game-mode-label">
                  <span className="game-mode-label__dot" />
                  {copy.practice}
                  <span className="game-mode-label__separator">/</span>
                  {copy.vsAi}
                </span>
                <button className="resign-button" type="button" onClick={() => setShowResign(true)} disabled={gameIsOver}>
                  <Flag size={15} />
                  {copy.resign}
                </button>
              </div>

              <div className="game-layout">
                <section className="table-section">
                  <div className="match-player-row">
                    <div className={`player-chip player-chip--black${aiTurn ? " player-chip--active" : ""}`}>
                      <span className="player-chip__avatar player-chip__avatar--black"><Sparkles size={18} /></span>
                      <span className="player-chip__copy">
                        <strong>Pip AI</strong>
                        <small>{copy[level]} · {language === "es" ? "Negras" : "Black"}</small>
                      </span>
                      {aiTurn && <span className="player-chip__turn">{language === "es" ? "JUEGA" : "TO MOVE"}</span>}
                    </div>
                    <div className="match-score-block" aria-label={`${game.scores.black} a ${game.scores.white}, ${copy.target} ${game.targetPoints}`}>
                      <span className="match-score-block__caption">{copy.score}</span>
                      <strong>{game.scores.black}<i>:</i>{game.scores.white}</strong>
                      <small>{copy.target} {game.targetPoints} {game.targetPoints === 1 ? copy.point : copy.points}</small>
                    </div>
                    <div className={`player-chip player-chip--white${!aiTurn ? " player-chip--active" : ""}`}>
                      {!aiTurn && <span className="player-chip__turn">{language === "es" ? "JUEGAS" : "YOUR TURN"}</span>}
                      <span className="player-chip__copy player-chip__copy--right">
                        <strong>{copy.guest}</strong>
                        <small>{language === "es" ? "Blancas" : "White"}</small>
                      </span>
                      <span className="player-chip__avatar player-chip__avatar--white"><UserRound size={18} /></span>
                    </div>
                  </div>

                  <div className="board-card">
                    <div className="board-card__header">
                      <div>
                        <span className="eyebrow eyebrow--muted">{copy.practice}</span>
                        <h2>{copy.vsAi}</h2>
                      </div>
                      <div className="board-meta">
                        <span className="cube-pill">
                          <span className="cube-pill__icon"><Dice5 size={13} /></span>
                          {copy.cube} <strong>×{game.cube.value}</strong>
                        </span>
                        {game.isCrawford && <span className="crawford-pill">CRAWFORD</span>}
                      </div>
                    </div>
                    <BackgammonBoard
                      game={game}
                      language={language}
                      interactive={screen === "game" && !diceRolling && game.phase === "moving" && game.turn === "white"}
                      selectablePoints={selectablePoints}
                      destinations={destinations}
                      selectedFrom={selectedFrom}
                      onPointClick={handlePointClick}
                      onBearOff={handleBearOff}
                    />
                    <div className="board-card__foot">
                      <span className="board-legend">
                        <span className="board-legend__checker board-legend__checker--white" />
                        {copy.guest}
                      </span>
                      <span className="board-instruction">
                        {diceRolling
                          ? copy.diceRollingHint
                          : game.phase === "moving" && game.turn === "white"
                          ? selectedFrom === null
                            ? copy.selectChecker
                            : copy.movePrompt
                          : game.phase === "opening"
                            ? copy.openingRoll
                            : copy.rollPrompt}
                      </span>
                      <span className="board-legend board-legend--right">
                        <span className="board-legend__checker board-legend__checker--black" />
                        Pip AI
                      </span>
                    </div>
                  </div>
                </section>

                <aside className="game-panel">
                  <section className="turn-card" aria-live="polite">
                    <div className="turn-card__top">
                      <div className={`turn-card__pulse${aiTurn && !gameIsOver ? " turn-card__pulse--ai" : ""}`}>
                        {game.phase === "opening" ? <Dice5 size={18} /> : aiTurn ? <Sparkles size={18} /> : <UserRound size={18} />}
                      </div>
                      <div>
                        <span className="eyebrow eyebrow--muted">{game.phase === "opening" ? copy.openingRoll : copy.dice}</span>
                        <h2>{statusTitle}</h2>
                      </div>
                    </div>
                    <p className="turn-card__description">{statusDescription}</p>

                    <div
                      className={`dice-display${diceRolling ? " dice-display--rolling" : ""}`}
                      aria-label={copy.dice}
                      aria-busy={diceRolling}
                    >
                      <DieFace
                        value={activeDice?.[0] ?? null}
                        rolling={diceRolling}
                        rollIndex={0}
                        diceLabel={copy.dice}
                        rollingLabel={copy.diceRolling}
                      />
                      <DieFace
                        value={activeDice?.[1] ?? null}
                        rolling={diceRolling}
                        rollIndex={1}
                        diceLabel={copy.dice}
                        rollingLabel={copy.diceRolling}
                      />
                      {activeDice && !diceRolling && activeDice[0] === activeDice[1] && game.phase === "moving" && (
                        <span className="double-badge">×4</span>
                      )}
                    </div>
                    <div className="dice-caption">
                      {diceRolling
                        ? copy.diceRolling
                        : game.phase === "moving" && game.remainingDice.length > 0
                        ? `${game.remainingDice.length} ${language === "es" ? "movimientos disponibles" : "moves remaining"}`
                        : game.phase === "moving"
                          ? copy.waiting
                          : copy.dice}
                    </div>

                    {humanCanRoll && (
                      <button className="button button--primary turn-action" type="button" onClick={handleRoll}>
                        <Dice5 size={17} />
                        {game.phase === "opening" ? copy.rollToStart : copy.roll}
                        <ArrowRight size={16} />
                      </button>
                    )}
                    {game.phase === "turnStart" && canDouble(game, "white") && (
                      <button
                        className="button button--outline turn-action turn-action--secondary"
                        type="button"
                        onClick={() => {
                          try {
                            setGame(offerDouble(game, "white"));
                            setNotice("");
                          } catch (error) {
                            console.error("Could not offer a double.", error);
                          }
                        }}
                      >
                        <RotateCcw size={16} />
                        {copy.double}
                      </button>
                    )}
                    {game.phase === "doubleOffered" && game.pendingDoubleBy === "black" && (
                      <div className="double-response">
                        <button className="button button--primary" type="button" onClick={() => setGame(takeDouble(game, "white"))}>
                          <Check size={16} />
                          {copy.take}
                        </button>
                        <button className="button button--outline" type="button" onClick={() => setGame(dropDouble(game, "white"))}>
                          {copy.drop}
                        </button>
                      </div>
                    )}
                    {game.isCrawford && game.phase === "turnStart" && (
                      <div className="crawford-note"><ShieldCheck size={14} />{copy.crawford}</div>
                    )}
                    <div className="turn-card__divider" />
                    <div className="turn-card__subrow">
                      <span>{copy.cube}</span>
                      <strong>×{game.cube.value}{game.cube.owner !== "center" ? ` · ${game.cube.owner === "white" ? copy.guest : "Pip AI"}` : ""}</strong>
                    </div>
                    <div className="turn-card__subrow">
                      <span>{copy.matchLength}</span>
                      <strong>{game.targetPoints} {game.targetPoints === 1 ? copy.point : copy.points}</strong>
                    </div>
                  </section>

                  <section className="move-card">
                    <div className="move-card__heading">
                      <div>
                        <span className="eyebrow eyebrow--muted">{language === "es" ? "PARTIDA" : "GAME"} {game.gameNumber}</span>
                        <h3>{copy.moves}</h3>
                      </div>
                      <span className="move-card__count">{game.moveHistory.length}</span>
                    </div>
                    {game.moveHistory.length === 0 ? (
                      <div className="move-empty">
                        <div className="move-empty__icon"><BarChart3 size={17} /></div>
                        <p>{copy.noMovesYet}</p>
                      </div>
                    ) : (
                      <ol className="move-list">
                        {game.moveHistory.slice(-6).reverse().map((move, index) => (
                          <li key={`${move.turnNumber}-${move.player}-${move.from}-${move.to}-${move.die}-${index}`}>
                            <span className={`move-list__side${move.player === "white" ? " move-list__side--white" : ""}`} />
                            <span className="move-list__description">{formatMove(move, language)}</span>
                            <span className="move-list__die">{move.die}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>

                  <div className="fairness-note">
                    <ShieldCheck size={17} />
                    <span>
                      <strong>{copy.fairness}</strong>
                      <small>{language === "es" ? "Web Crypto · modo local" : "Web Crypto · local mode"}</small>
                    </span>
                  </div>
                  {notice && <div className="game-notice" role="status">{notice}</div>}
                </aside>
              </div>

              {gameIsOver && game.result && (
                <div className="dialog-backdrop">
                  <section className="result-dialog" role="dialog" aria-modal="true" aria-labelledby="result-title">
                    <button className="dialog-close" type="button" onClick={() => setScreen("home")} aria-label={copy.backHome}>
                      <X size={18} />
                    </button>
                    <span className="result-dialog__icon"><Crown size={24} /></span>
                    <span className="eyebrow eyebrow--muted">{game.phase === "matchOver" ? copy.matchOver : copy.gameOver}</span>
                    <h2 id="result-title">
                      {game.phase === "matchOver"
                        ? game.result.winner === "white" ? copy.matchWon : copy.matchLost
                        : game.result.winner === "white" ? copy.gameWon : copy.gameLost}
                    </h2>
                    <p>
                      {resultText(game.result.type, language)} · {game.result.points} {copy.awarded}{" "}
                      {game.result.winner === "white" ? copy.guest : "Pip AI"}.
                    </p>
                    <div className="result-score">
                      <span>{game.scores.black}</span>
                      <i>:</i>
                      <span>{game.scores.white}</span>
                      <small>{copy.target} {game.targetPoints}</small>
                    </div>
                    <div className="result-dialog__actions">
                      {game.phase === "gameOver" ? (
                        <button className="button button--primary" type="button" onClick={handleNextGame}>
                          <Play size={16} />
                          {copy.nextGame}
                        </button>
                      ) : (
                        <button className="button button--primary" type="button" onClick={startNewMatch}>
                          <RotateCcw size={16} />
                          {copy.newMatch}
                        </button>
                      )}
                      <button className="button button--outline" type="button" onClick={() => setScreen("home")}>
                        {copy.backHome}
                      </button>
                    </div>
                  </section>
                </div>
              )}

              {showResign && (
                <div className="dialog-backdrop">
                  <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="resign-title">
                    <button className="dialog-close" type="button" onClick={() => setShowResign(false)} aria-label={copy.cancel}>
                      <X size={18} />
                    </button>
                    <span className="confirm-dialog__icon"><Flag size={20} /></span>
                    <h2 id="resign-title">{copy.resignTitle}</h2>
                    <p>{copy.resignDescription}</p>
                    <div className="result-dialog__actions">
                      <button className="button button--danger" type="button" onClick={handleResign}>{copy.confirm}</button>
                      <button className="button button--outline" type="button" onClick={() => setShowResign(false)}>{copy.cancel}</button>
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}

          {screen === "history" && (
            <div className="history-page page-enter">
              <div className="page-intro page-intro--history">
                <div>
                  <p className="eyebrow">{copy.localSession}</p>
                  <h1>{copy.historyTitle}<em>.</em></h1>
                  <p className="page-intro__description">{copy.historyDescription}</p>
                </div>
                <button className="button button--outline" type="button" onClick={exportLocalData}>
                  <Download size={16} />
                  {copy.exportData}
                </button>
              </div>
              <section className="history-card">
                <div className="history-card__heading">
                  <div className="history-card__title">
                    <span className="section-heading__icon"><History size={17} /></span>
                    <div>
                      <h2>{copy.recentGames}</h2>
                      <p>{history.length} {copy.gamesPlayed.toLowerCase()}</p>
                    </div>
                  </div>
                  <div className="history-columns">
                    <span>{copy.result}</span>
                    <span>{copy.date}</span>
                  </div>
                </div>
                {history.length === 0 ? (
                  <div className="history-empty">
                    <span className="history-empty__icon"><Dice5 size={22} /></span>
                    <strong>{copy.noGames}</strong>
                    <p>{copy.emptyHistory}</p>
                    <button className="button button--primary" type="button" onClick={startNewMatch}>
                      <Play size={16} />
                      {copy.startFirst}
                    </button>
                  </div>
                ) : (
                  <div className="history-table">
                    {history.map((record) => (
                      <article className="history-row" key={record.id}>
                        <span className={`history-row__avatar${record.winner === "white" ? " history-row__avatar--win" : ""}`}>
                          {record.winner === "white" ? <Trophy size={17} /> : <UserRound size={17} />}
                        </span>
                        <div className="history-row__main">
                          <strong>{record.winner === "white" ? copy.gameWon : copy.gameLost}</strong>
                          <span>{copy.vsAi} · {copy[record.aiLevel]} · {record.moveHistory.length} {copy.moves.toLowerCase()}</span>
                        </div>
                        <div className="history-row__result">
                          <strong>{resultText(record.result, language)}</strong>
                          <span>{record.winner === "white" ? `+${record.points}` : `−${record.points}`} {copy.points}</span>
                        </div>
                        <time>
                          {new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(record.playedAt))}
                        </time>
                        <ChevronRight className="history-row__chevron" size={17} />
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <div className="privacy-card">
                <span><ShieldCheck size={18} /></span>
                <div>
                  <strong>{copy.localData}</strong>
                  <p>{copy.localDataText}</p>
                </div>
                <button className="text-button" type="button" onClick={exportLocalData}>
                  {copy.exportData}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {screen === "rules" && (
            <div className="rules-page page-enter">
              <div className="page-intro page-intro--rules">
                <div>
                  <p className="eyebrow">{copy.guide}</p>
                  <h1>{copy.guideTitle}<em>.</em></h1>
                  <p className="page-intro__description">{copy.guideDescription}</p>
                </div>
                <span className="rules-intro-icon"><BookOpen size={24} /></span>
              </div>
              <div className="rules-grid">
                {[
                  { icon: Target, title: copy.objective, description: copy.objectiveText, number: "01" },
                  { icon: Dice5, title: copy.movement, description: copy.movementText, number: "02" },
                  { icon: ShieldCheck, title: copy.blocked, description: copy.blockedText, number: "03" },
                  { icon: Sparkles, title: copy.hitting, description: copy.hittingText, number: "04" },
                  { icon: RotateCcw, title: copy.reentry, description: copy.reentryText, number: "05" },
                  { icon: ArrowRight, title: copy.bearingOff, description: copy.bearingOffText, number: "06" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <article className="rule-card" key={item.number}>
                      <div className="rule-card__top">
                        <span className="rule-card__icon"><Icon size={19} /></span>
                        <span className="rule-card__number">{item.number}</span>
                      </div>
                      <h2>{item.title}</h2>
                      <p>{item.description}</p>
                    </article>
                  );
                })}
              </div>
              <div className="rules-bottom-grid">
                <article className="rule-note rule-note--highlight">
                  <span className="rule-note__icon"><Dice5 size={18} /></span>
                  <div>
                    <strong>{copy.cube}</strong>
                    <p>{copy.cubeText}</p>
                  </div>
                </article>
                <article className="rule-note">
                  <span className="rule-note__icon"><ShieldCheck size={18} /></span>
                  <div>
                    <strong>{copy.fairness}</strong>
                    <p>{copy.fairnessText}</p>
                  </div>
                </article>
              </div>
              <div className="accessibility-note">
                <span className="accessibility-note__icon"><Sparkles size={17} /></span>
                <div>
                  <strong>{copy.keyboard}</strong>
                  <p>{copy.keyboardText}</p>
                </div>
                <button
                  className={`contrast-action${highContrast ? " contrast-action--active" : ""}`}
                  type="button"
                  aria-pressed={highContrast}
                  onClick={() => setHighContrast((current) => !current)}
                >
                  <Sun size={15} />
                  {language === "es" ? "Alto contraste" : "High contrast"}
                </button>
              </div>
            </div>
          )}
        </main>

        <footer className="app-footer">
          <span>© PIP CLUB</span>
          <span>{copy.allRights}</span>
          <span className="footer-local"><span /> {copy.localOnly}</span>
        </footer>
      </div>
    </div>
  );
}
