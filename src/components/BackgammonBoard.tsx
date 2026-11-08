import { BAR, OFF, type GameState } from "../game/types";
import type { Language, TranslationKey } from "../i18n";
import { messages } from "../i18n";

interface BackgammonBoardProps {
  game: GameState;
  language: Language;
  interactive: boolean;
  selectablePoints: Set<number>;
  destinations: Set<number>;
  selectedFrom: number | null;
  onPointClick: (point: number) => void;
  onBearOff: () => void;
}

const BOARD_WIDTH = 898;
const BOARD_HEIGHT = 590;
const MARGIN = 28;
const POINT_WIDTH = 64;
const BAR_WIDTH = 74;
const TOP_BASE = 28;
const TOP_TIP = 260;
const BOTTOM_TIP = 330;
const BOTTOM_BASE = 562;

function pointX(column: number): number {
  return column < 6
    ? MARGIN + column * POINT_WIDTH
    : MARGIN + POINT_WIDTH * 6 + BAR_WIDTH + (column - 6) * POINT_WIDTH;
}

function Checker({
  player,
  x,
  y,
  label,
}: {
  player: "white" | "black";
  x: number;
  y: number;
  label?: string;
}) {
  return (
    <g className={`checker checker--${player}`} aria-hidden="true">
      <circle cx={x} cy={y} r="13.5" />
      <circle className="checker-inner" cx={x} cy={y} r="9.5" />
      {label && (
        <text className="checker-count" x={x} y={y + 4}>
          {label}
        </text>
      )}
    </g>
  );
}

function t(language: Language, key: TranslationKey): string {
  return messages[language][key];
}

export default function BackgammonBoard({
  game,
  language,
  interactive,
  selectablePoints,
  destinations,
  selectedFrom,
  onPointClick,
  onBearOff,
}: BackgammonBoardProps) {
  const hasBearOffMove =
    interactive && selectedFrom !== null && destinations.has(OFF);

  const pointGroups = Array.from({ length: 24 }, (_, point) => {
    const top = point >= 12;
    const column = top ? point - 12 : 11 - point;
    const x = pointX(column);
    const pointNumber = point + 1;
    const count = game.board[point];
    const player = count > 0 ? "white" : count < 0 ? "black" : null;
    const stackCount = Math.abs(count);
    const isSelectable = selectablePoints.has(point);
    const isDestination = destinations.has(point);
    const isSelected = selectedFrom === point;
    const enabled = interactive && (isSelectable || isDestination);
    const baseY = top ? TOP_BASE : BOTTOM_BASE;
    const tipY = top ? TOP_TIP : BOTTOM_TIP;
    const numberY = top ? 295 : 319;
    const fill = pointNumber % 2 === 0
      ? "url(#boardLight)"
      : "url(#boardAccent)";
    const pointLabel = `${t(language, "point")} ${pointNumber}`;
    const checkerColor =
      player === "white"
        ? language === "es" ? "blancas" : "white"
        : language === "es" ? "negras" : "black";
    const checkerLabel =
      stackCount > 0
        ? `, ${stackCount} ${checkerColor}`
        : "";

    return (
      <g
        className={`board-point${isSelectable ? " board-point--selectable" : ""}${isDestination ? " board-point--destination" : ""}${isSelected ? " board-point--selected" : ""}`}
        key={point}
        role="button"
        tabIndex={enabled ? 0 : -1}
        aria-label={`${pointLabel}${checkerLabel}${isDestination ? ", destino legal" : ""}`}
        aria-disabled={!enabled}
        aria-pressed={isSelected}
        onClick={() => enabled && onPointClick(point)}
        onKeyDown={(event) => {
          if (enabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onPointClick(point);
          }
        }}
      >
        <polygon
          className="point-triangle"
          points={`${x},${baseY} ${x + POINT_WIDTH},${baseY} ${x + POINT_WIDTH / 2},${tipY}`}
          fill={fill}
        />
        {(isDestination || isSelected) && (
          <polygon
            className="point-highlight"
            points={`${x + 3},${baseY + (top ? 3 : -3)} ${x + POINT_WIDTH - 3},${baseY + (top ? 3 : -3)} ${x + POINT_WIDTH / 2},${tipY + (top ? -4 : 4)}`}
          />
        )}
        {player &&
          Array.from({ length: Math.min(stackCount, 5) }, (_, index) => {
            const y = top
              ? TOP_BASE + 18 + index * 31
              : BOTTOM_BASE - 18 - index * 31;
            const displayedCount =
              index === Math.min(stackCount, 5) - 1 && stackCount > 5
                ? String(stackCount)
                : undefined;
            return (
              <Checker
                key={`${point}-${index}`}
                player={player}
                x={x + POINT_WIDTH / 2}
                y={y}
                label={displayedCount}
              />
            );
          })}
        <text className="point-number" x={x + POINT_WIDTH / 2} y={numberY}>
          {pointNumber}
        </text>
      </g>
    );
  });

  const barX = MARGIN + POINT_WIDTH * 6;
  const whiteBarCount = Math.min(game.bar.white, 5);
  const blackBarCount = Math.min(game.bar.black, 5);

  return (
    <div className="board-wrap">
      <svg
        className="backgammon-board"
        viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
        role="group"
        aria-label={language === "es" ? "Tablero de backgammon" : "Backgammon board"}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="boardWood" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#c58a60" />
            <stop offset="48%" stopColor="#a96643" />
            <stop offset="100%" stopColor="#875038" />
          </linearGradient>
          <linearGradient id="boardLight" x1="0" x2="0.8" y1="0" y2="1">
            <stop offset="0%" stopColor="#f4e7ca" />
            <stop offset="100%" stopColor="#ddc8a4" />
          </linearGradient>
          <linearGradient id="boardAccent" x1="0" x2="0.8" y1="0" y2="1">
            <stop offset="0%" stopColor="#d27856" />
            <stop offset="100%" stopColor="#ad573f" />
          </linearGradient>
          <linearGradient id="barWood" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#7b402f" />
            <stop offset="50%" stopColor="#6d382b" />
            <stop offset="100%" stopColor="#874a35" />
          </linearGradient>
        </defs>
        <rect
          className="board-frame"
          x="5"
          y="5"
          width={BOARD_WIDTH - 10}
          height={BOARD_HEIGHT - 10}
          rx="19"
          fill="url(#boardWood)"
        />
        <rect
          className="board-felt"
          x="16"
          y="16"
          width={BOARD_WIDTH - 32}
          height={BOARD_HEIGHT - 32}
          rx="12"
          fill="#bd835a"
        />
        <rect
          x={barX}
          y={TOP_BASE}
          width={BAR_WIDTH}
          height={BOTTOM_BASE - TOP_BASE}
          rx="5"
          fill="url(#barWood)"
        />
        {pointGroups}
        <line
          className="board-midline"
          x1={MARGIN}
          x2={BOARD_WIDTH - MARGIN}
          y1="307"
          y2="307"
        />
        <g
          className={`bar-zone${selectedFrom === BAR ? " bar-zone--selected" : ""}${selectablePoints.has(BAR) ? " bar-zone--selectable" : ""}`}
          role="button"
          tabIndex={interactive && selectablePoints.has(BAR) ? 0 : -1}
          aria-label={`${t(language, "bar")}: ${game.bar.white} blancas, ${game.bar.black} negras`}
          aria-disabled={!interactive || !selectablePoints.has(BAR)}
          aria-pressed={selectedFrom === BAR}
          onClick={() => interactive && selectablePoints.has(BAR) && onPointClick(BAR)}
          onKeyDown={(event) => {
            if (
              interactive &&
              selectablePoints.has(BAR) &&
              (event.key === "Enter" || event.key === " ")
            ) {
              event.preventDefault();
              onPointClick(BAR);
            }
          }}
        >
          <rect
            className="bar-zone__hit-area"
            x={barX}
            y={TOP_BASE}
            width={BAR_WIDTH}
            height={BOTTOM_BASE - TOP_BASE}
            aria-hidden="true"
          />
          {Array.from({ length: whiteBarCount }, (_, index) => (
            <Checker
              key={`white-bar-${index}`}
              player="white"
              x={barX + BAR_WIDTH / 2}
              y={267 - index * 27}
              label={index === whiteBarCount - 1 && game.bar.white > 5 ? String(game.bar.white) : undefined}
            />
          ))}
          {Array.from({ length: blackBarCount }, (_, index) => (
            <Checker
              key={`black-bar-${index}`}
              player="black"
              x={barX + BAR_WIDTH / 2}
              y={323 + index * 27}
              label={index === blackBarCount - 1 && game.bar.black > 5 ? String(game.bar.black) : undefined}
            />
          ))}
        </g>
        <text className="board-home-label board-home-label--white" x={BOARD_WIDTH - 28} y="291">
          {t(language, "off")}
        </text>
        <text className="board-home-label board-home-label--black" x="28" y="291">
          {t(language, "off")}
        </text>
      </svg>
      <div className="board-footer">
        <span className="board-count">
          <span className="board-count__checker board-count__checker--white" />
          {t(language, "off")} <strong>{game.off.white}</strong>
        </span>
        <span className="board-count board-count--bar">
          <span>{t(language, "bar")}</span>
          <strong>{game.bar.white + game.bar.black}</strong>
        </span>
        <span className="board-count board-count--right">
          <span className="board-count__checker board-count__checker--black" />
          {t(language, "off")} <strong>{game.off.black}</strong>
        </span>
      </div>
      {hasBearOffMove && (
        <button className="bear-off-action" type="button" onClick={onBearOff}>
          <span className="bear-off-action__icon">↗</span>
          <span>
            <strong>{t(language, "bearOff")}</strong>
            <small>{t(language, "bearOffHint")}</small>
          </span>
        </button>
      )}
    </div>
  );
}
