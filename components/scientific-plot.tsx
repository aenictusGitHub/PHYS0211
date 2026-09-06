'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Math as Formula } from '@/components/math';

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
function formatTick(value: number, interval: number) {
  if (Math.abs(value) < 1e-9) return '0';
  if (Number.isInteger(value)) return String(value);
  const digits = interval < 0.1 ? 3 : interval < 1 ? 2 : 1;
  return value.toFixed(digits).replace(/\.?0+$/, '');
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
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: WIDTH, height: 440 });
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const textScale = WIDTH / size.width;
  const HEIGHT = WIDTH * size.height / size.width;
  const MARGIN = {
    left: Math.max(72, 54 * textScale), right: Math.max(24, 14 * textScale),
    top: Math.max(26, 18 * textScale), bottom: Math.max(60, 48 * textScale),
  };
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
    <div className="scientific-plot-frame" ref={frameRef}>
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

      <g className="axis-layer" aria-hidden="true" style={{ '--plot-tick-scale': textScale } as React.CSSProperties}>
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
              y={MARGIN.top + innerHeight + 21 * textScale}
              textAnchor="middle"
            >
              {formatTick(tick, Math.abs(resolvedXTicks[1] - resolvedXTicks[0]))}
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
              x={MARGIN.left - 9 * textScale}
              y={mapY(tick) + 4 * textScale}
              textAnchor="end"
            >
              {formatTick(tick, Math.abs(resolvedYTicks[1] - resolvedYTicks[0]))}
            </text>
          </g>
        ))}

      </g>

      </svg>

      <div className="plot-guide-labels" aria-hidden="true">
        {verticalLines.map((line, index) => {
          if (!line.label) return null;
          const guideX = mapX(line.value);
          const onRight = guideX > MARGIN.left + innerWidth / 2;

          return (
            <div
              key={`vertical-label-${index}`}
              className={`plot-guide-label${onRight ? ' is-end' : ''}`}
              style={{ left: `${(guideX / WIDTH) * 100}%`, top: `${(MARGIN.top / HEIGHT) * 100}%` }}
            ><Formula>{line.label}</Formula></div>
          );
        })}
        {horizontalLines.map((line, index) =>
          line.label ? (
            <div
              key={`horizontal-label-${index}`}
              className="plot-guide-label is-horizontal"
              style={{ right: `${(MARGIN.right / WIDTH) * 100}%`, top: `${(mapY(line.value) / HEIGHT) * 100}%` }}
            ><Formula>{line.label}</Formula></div>
          ) : null,
        )}
      </div>

      <div
        className="plot-axis-label is-x"
        style={{
          left: `${((MARGIN.left + innerWidth / 2) / WIDTH) * 100}%`,
          top: `${((HEIGHT - 10 * textScale) / HEIGHT) * 100}%`,
        }}
        aria-hidden="true"
      >
        <Formula>{xLabel}</Formula>
      </div>
      <div
        className="plot-axis-label is-y"
        style={{
          left: `${(12 * textScale / WIDTH) * 100}%`,
          top: `${((MARGIN.top + innerHeight / 2) / HEIGHT) * 100}%`,
        }}
        aria-hidden="true"
      >
        <Formula>{yLabel}</Formula>
      </div>
    </div>
  );
}
