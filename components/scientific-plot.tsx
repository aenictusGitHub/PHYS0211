'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Math as Formula } from '@/components/math';
import { revealFraction } from '@/lib/plot-geometry';

export type PlotPoint = { x: number; y: number };
export type PlotMarker = PlotPoint & { tone?: 'accent' | 'teal' | 'ink' | 'muted'; radius?: number };

export type PlotSeries = {
  values: PlotPoint[];
  tone?: 'accent' | 'teal' | 'ink' | 'muted';
  width?: number;
  dashed?: boolean;
  fillTo?: number;
  fillOpacity?: number;
  opacity?: number;
  /** Reveal this series only up to the plot's progressX coordinate. */
  progressive?: boolean;
};

export type GuideLine = {
  value: number;
  label?: string;
  tone?: 'accent' | 'teal' | 'ink' | 'muted';
  dashed?: boolean;
  width?: number;
  /** Restrict a horizontal level to the physical interval (e.g. inside a box). */
  xRange?: readonly [number, number];
  labelAbove?: boolean;
  /** Place horizontal annotations in a reserved gutter, clear of the curves. */
  labelOutside?: boolean;
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
  progressX?: number;
  markers?: PlotMarker[];
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
  progressX,
  markers = [],
}: ScientificPlotProps) {
  const clipId = `plot-${useId().replaceAll(':', '')}`;
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: WIDTH, height: 440, labelFont: 18 });
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        const labelFont = parseFloat(window.getComputedStyle(frame).fontSize) || 18;
        setSize(current => current.width === width && current.height === height && current.labelFont === labelFont ? current : { width, height, labelFont });
      }
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const textScale = WIDTH / size.width;
  const tickFont = size.labelFont * .85;
  const HEIGHT = WIDTH * size.height / size.width;
  const MARGIN = {
    left: Math.max(72, (size.labelFont * 1.4 + tickFont * 2.6 + 10) * textScale),
    right: Math.max(24, (horizontalLines.some(line => line.label && line.labelOutside) ? size.labelFont * 2.3 + 18 : 14) * textScale),
    top: Math.max(26, (verticalLines.some(line => line.label && line.labelAbove) ? size.labelFont * 1.3 + 10 : 18) * textScale),
    bottom: Math.max(60, (size.labelFont * 1.4 + tickFont + 20) * textScale),
  };
  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const mapX = (x: number) =>
    MARGIN.left +
    ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * innerWidth;
  const mapY = (y: number) =>
    MARGIN.top +
    (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerHeight;

  // Long mean-value histories are static while only the time cursor moves.
  // Retain their geometry across animation frames, but rebuild after a resize.
  const seriesGeometry = useMemo(() => {
    const x = (value: number) => MARGIN.left + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * innerWidth;
    const y = (value: number) => MARGIN.top + (1 - (value - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerHeight;
    return series.map(line => {
      const points = line.values.map(point => `${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`).join(' ');
      const fillPoints = line.fillTo === undefined || line.values.length === 0 ? ''
        : `${x(line.values[0].x)},${y(line.fillTo)} ${points} ${x(line.values.at(-1)!.x)},${y(line.fillTo)}`;
      return { points, fillPoints };
    });
  }, [series, xDomain[0], xDomain[1], yDomain[0], yDomain[1], MARGIN.left, MARGIN.top, innerWidth, innerHeight]);

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
    <div className="scientific-plot-frame" ref={frameRef} style={{ '--plot-tick-size': `${tickFont}px` } as React.CSSProperties}>
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
        {progressX !== undefined ? <clipPath id={`${clipId}-progress`} clipPathUnits="userSpaceOnUse">
          <rect x={MARGIN.left} y={MARGIN.top} width={innerWidth * revealFraction(progressX, xDomain)} height={innerHeight} />
        </clipPath> : null}
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
            x1={line.xRange ? mapX(line.xRange[0]) : MARGIN.left}
            x2={line.xRange ? mapX(line.xRange[1]) : MARGIN.left + innerWidth}
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
          const { points, fillPoints } = seriesGeometry[index];

          return (
            <g key={`series-${index}`} clipPath={line.progressive && progressX !== undefined ? `url(#${clipId}-progress)` : undefined}>
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
                style={{ strokeWidth: line.width ?? 2.6, strokeOpacity: line.opacity ?? 1 }}
              />
            </g>
          );
        })}
        {markers.map((point, index) => <circle key={`marker-${index}`} cx={mapX(point.x)} cy={mapY(point.y)}
          r={(point.radius ?? 3) * textScale} fill={toneColor[point.tone ?? 'accent']} />)}
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
              y={MARGIN.top + innerHeight + (tickFont + 7) * textScale}
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
              y={mapY(tick) + tickFont * .3 * textScale}
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
              className={`plot-guide-label${onRight ? ' is-end' : ''}${line.labelAbove ? ' is-above' : ''}`}
              style={{ left: `${(guideX / WIDTH) * 100}%`, top: `${(MARGIN.top / HEIGHT) * 100}%` }}
            ><Formula>{line.label}</Formula></div>
          );
        })}
        {horizontalLines.map((line, index) =>
          line.label ? (
            <div
              key={`horizontal-label-${index}`}
              className={`plot-guide-label is-horizontal${line.labelOutside ? ' is-outside' : ''}`}
              style={{
                ...(line.labelOutside
                  ? { left: `${((MARGIN.left + innerWidth) / WIDTH) * 100}%` }
                  : { right: `${((line.xRange ? WIDTH - mapX(line.xRange[1]) : MARGIN.right) / WIDTH) * 100}%` }),
                top: `${(mapY(line.value) / HEIGHT) * 100}%`,
              }}
            ><Formula>{line.label}</Formula></div>
          ) : null,
        )}
      </div>

      <div
        className="plot-axis-label is-x"
        style={{
          left: `${((MARGIN.left + innerWidth / 2) / WIDTH) * 100}%`,
          top: `${((HEIGHT - (size.labelFont * .65 + 3) * textScale) / HEIGHT) * 100}%`,
        }}
        aria-hidden="true"
      >
        <Formula>{xLabel}</Formula>
      </div>
      <div
        className="plot-axis-label is-y"
        style={{
          left: `${((size.labelFont * .65 + 3) * textScale / WIDTH) * 100}%`,
          top: `${((MARGIN.top + innerHeight / 2) / HEIGHT) * 100}%`,
        }}
        aria-hidden="true"
      >
        <Formula>{yLabel}</Formula>
      </div>
    </div>
  );
}
