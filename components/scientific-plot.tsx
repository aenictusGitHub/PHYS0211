'use client';

import { useId } from 'react';

export type PlotPoint = { x: number; y: number };

export type PlotSeries = {
  values: PlotPoint[];
  tone?: 'accent' | 'teal' | 'ink' | 'muted';
  width?: number;
  dashed?: boolean;
  fillTo?: number;
  fillOpacity?: number;
};

export type GuideLine = {
  value: number;
  label?: string;
  tone?: 'accent' | 'teal' | 'ink' | 'muted';
  dashed?: boolean;
  width?: number;
};

export type PlotBand = {
  from: number;
  to: number;
  tone?: 'accent' | 'teal' | 'ink' | 'muted';
  fadeToward?: 'left' | 'right';
  opacity?: number;
};

type ScientificPlotProps = {
  ariaLabel: string;
  xDomain: [number, number];
  yDomain: [number, number];
  xLabel: string;
  yLabel: string;
  series: PlotSeries[];
  verticalLines?: GuideLine[];
  horizontalLines?: GuideLine[];
  bands?: PlotBand[];
  xTicks?: number[];
  yTicks?: number[];
};

const WIDTH = 780;
const HEIGHT = 420;
const MARGIN = { left: 72, right: 34, top: 30, bottom: 62 };

function formatTick(value: number) {
  if (Math.abs(value) < 1e-9) return '0';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, '');
}

export function ScientificPlot({
  ariaLabel,
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  series,
  verticalLines = [],
  horizontalLines = [],
  bands = [],
  xTicks,
  yTicks,
}: ScientificPlotProps) {
  const clipId = `plot-${useId().replaceAll(':', '')}`;
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const mapX = (x: number) =>
    MARGIN.left +
    ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerWidth;
  const mapY = (y: number) =>
    MARGIN.top +
    (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerHeight;

  const resolvedXTicks =
    xTicks ??
    Array.from({ length: 5 }, (_, index) =>
      xDomain[0] + (index * (xDomain[1] - xDomain[0])) / 4,
    );
  const resolvedYTicks =
    yTicks ??
    Array.from({ length: 5 }, (_, index) =>
      yDomain[0] + (index * (yDomain[1] - yDomain[0])) / 4,
    );
  const toneColor = {
    accent: 'var(--accent)',
    teal: 'var(--teal)',
    ink: 'var(--foreground)',
    muted: 'var(--muted-foreground)',
  };

  return (
    <svg
      className="scientific-plot"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <clipPath id={clipId}>
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={innerWidth}
            height={innerHeight}
          />
        </clipPath>
        {series.map((line, index) =>
          line.fillTo === undefined ? null : (
            <linearGradient
              key={`series-gradient-${index}`}
              id={`${clipId}-series-gradient-${index}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={toneColor[line.tone ?? 'accent']}
                stopOpacity={Math.min(0.82, (line.fillOpacity ?? 0.18) * 2.7)}
              />
              <stop
                offset="72%"
                stopColor={toneColor[line.tone ?? 'accent']}
                stopOpacity={(line.fillOpacity ?? 0.18) * 0.42}
              />
              <stop
                offset="100%"
                stopColor={toneColor[line.tone ?? 'accent']}
                stopOpacity="0.02"
              />
            </linearGradient>
          ),
        )}
        {bands.map((band, index) => (
          <linearGradient
            key={`band-gradient-${index}`}
            id={`${clipId}-band-gradient-${index}`}
            x1={band.fadeToward === 'left' ? '1' : '0'}
            x2={band.fadeToward === 'left' ? '0' : '1'}
            y1="0"
            y2="0"
          >
            <stop
              offset="0%"
              stopColor={toneColor[band.tone ?? 'ink']}
              stopOpacity={band.opacity ?? 0.18}
            />
            <stop
              offset="100%"
              stopColor={toneColor[band.tone ?? 'ink']}
              stopOpacity="0.015"
            />
          </linearGradient>
        ))}
      </defs>

      <g className="plot-grid" aria-hidden="true">
        {resolvedXTicks.map((tick) => (
          <line
            key={`x-grid-${tick}`}
            x1={mapX(tick)}
            x2={mapX(tick)}
            y1={MARGIN.top}
            y2={MARGIN.top + innerHeight}
          />
        ))}
        {resolvedYTicks.map((tick) => (
          <line
            key={`y-grid-${tick}`}
            x1={MARGIN.left}
            x2={MARGIN.left + innerWidth}
            y1={mapY(tick)}
            y2={mapY(tick)}
          />
        ))}
      </g>

      <g clipPath={`url(#${clipId})`}>
        {bands.map((band, index) => (
          <rect
            key={`band-${index}`}
            x={mapX(Math.min(band.from, band.to))}
            y={MARGIN.top}
            width={Math.abs(mapX(band.to) - mapX(band.from))}
            height={innerHeight}
            fill={`url(#${clipId}-band-gradient-${index})`}
          />
        ))}
        {horizontalLines.map((line, index) => (
          <line
            key={`horizontal-${index}`}
            className={`guide guide-${line.tone ?? 'muted'}${line.dashed === false ? '' : ' is-dashed'}`}
            x1={MARGIN.left}
            x2={MARGIN.left + innerWidth}
            y1={mapY(line.value)}
            y2={mapY(line.value)}
            style={{ strokeWidth: line.width ?? 1.2 }}
          />
        ))}
        {verticalLines.map((line, index) => (
          <line
            key={`vertical-${index}`}
            className={`guide guide-${line.tone ?? 'muted'}${line.dashed === false ? '' : ' is-dashed'}`}
            x1={mapX(line.value)}
            x2={mapX(line.value)}
            y1={MARGIN.top}
            y2={MARGIN.top + innerHeight}
            style={{ strokeWidth: line.width ?? 1.2 }}
          />
        ))}

        {series.map((line, index) => {
          const points = line.values
            .map((point) => `${mapX(point.x).toFixed(2)},${mapY(point.y).toFixed(2)}`)
            .join(' ');
          const fillPoints =
            line.fillTo === undefined || line.values.length === 0
              ? ''
              : `${mapX(line.values[0].x)},${mapY(line.fillTo)} ${points} ${mapX(line.values.at(-1)?.x ?? line.values[0].x)},${mapY(line.fillTo)}`;

          return (
            <g key={`series-${index}`}>
              {fillPoints ? (
                <polygon
                  className={`series-fill series-${line.tone ?? 'accent'}`}
                  points={fillPoints}
                  fill={`url(#${clipId}-series-gradient-${index})`}
                />
              ) : null}
              <polyline
                className={`series-line series-${line.tone ?? 'accent'}${line.dashed ? ' is-dashed' : ''}`}
                points={points}
                style={{ strokeWidth: line.width ?? 2.6 }}
              />
            </g>
          );
        })}
      </g>

      <g className="axis-layer" aria-hidden="true">
        <line
          x1={MARGIN.left}
          x2={MARGIN.left + innerWidth}
          y1={MARGIN.top + innerHeight}
          y2={MARGIN.top + innerHeight}
        />
        <line
          x1={MARGIN.left}
          x2={MARGIN.left}
          y1={MARGIN.top}
          y2={MARGIN.top + innerHeight}
        />

        {resolvedXTicks.map((tick) => (
          <g key={`x-tick-${tick}`}>
            <line
              x1={mapX(tick)}
              x2={mapX(tick)}
              y1={MARGIN.top + innerHeight}
              y2={MARGIN.top + innerHeight + 6}
            />
            <text
              x={mapX(tick)}
              y={MARGIN.top + innerHeight + 24}
              textAnchor="middle"
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}

        {resolvedYTicks.map((tick) => (
          <g key={`y-tick-${tick}`}>
            <line
              x1={MARGIN.left - 6}
              x2={MARGIN.left}
              y1={mapY(tick)}
              y2={mapY(tick)}
            />
            <text
              x={MARGIN.left - 12}
              y={mapY(tick) + 4}
              textAnchor="end"
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}

        <text
          className="axis-label"
          x={MARGIN.left + innerWidth / 2}
          y={HEIGHT - 10}
          textAnchor="middle"
        >
          {xLabel}
        </text>
        <text
          className="axis-label"
          x="18"
          y={MARGIN.top + innerHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 18 ${MARGIN.top + innerHeight / 2})`}
        >
          {yLabel}
        </text>
      </g>

      <g className="guide-labels" aria-hidden="true">
        {verticalLines.map((line, index) =>
          line.label ? (
            <text
              key={`vertical-label-${index}`}
              x={mapX(line.value) + 7}
              y={MARGIN.top + 17}
            >
              {line.label}
            </text>
          ) : null,
        )}
        {horizontalLines.map((line, index) =>
          line.label ? (
            <text
              key={`horizontal-label-${index}`}
              x={MARGIN.left + innerWidth - 7}
              y={mapY(line.value) - 7}
              textAnchor="end"
            >
              {line.label}
            </text>
          ) : null,
        )}
      </g>
    </svg>
  );
}
