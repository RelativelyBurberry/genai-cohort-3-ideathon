import React from 'react';
import { getMoodDescriptor } from '../../utils/journal';
import type {
  ConstellationPoint,
  ConstellationViewModel,
} from '../../intelligence/moodConstellation/constellationLayout';
import {
  CONSTELLATION_VIEW_HEIGHT,
  CONSTELLATION_VIEW_WIDTH,
} from '../../intelligence/moodConstellation/constellationLayout';

/**
 * MoodConstellationSvg — presentational SVG layer.
 *
 * Rendering only: it receives an already-computed deterministic view model
 * and never touches data loading. All visible/announced text is built from
 * SAFE metadata (date, mood label, connection count) — never journal
 * content or titles.
 */

export function formatConstellationDate(timestamp: number): string {
  if (!timestamp) return 'Unknown date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp);
}

interface MoodConstellationSvgProps {
  viewModel: ConstellationViewModel;
  showConnections: boolean;
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onOpenEntry: (entryId: string) => void;
}

export const MoodConstellationSvg: React.FC<MoodConstellationSvgProps> = ({
  viewModel,
  showConnections,
  activeId,
  onActivate,
  onOpenEntry,
}) => {
  const { points, connections, connectedCounts } = viewModel;
  const pointById = new Map<string, ConstellationPoint>(
    points.map((point) => [point.entryId, point] as const)
  );

  return (
    <svg
      viewBox={`0 0 ${CONSTELLATION_VIEW_WIDTH} ${CONSTELLATION_VIEW_HEIGHT}`}
      role="img"
      aria-label="A constellation of reflections arranged chronologically by mood"
      onMouseLeave={() => onActivate(null)}
    >
      <defs>
        <radialGradient id="constellationGlow">
          <stop stopColor="#f7e8d2" stopOpacity=".34" />
          <stop offset="1" stopColor="#f7e8d2" stopOpacity="0" />
        </radialGradient>
        <filter id="starGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={CONSTELLATION_VIEW_WIDTH} height={CONSTELLATION_VIEW_HEIGHT} fill="url(#constellationGlow)" />

      <text x="92" y="600" className="time-edge">
        EARLIER
      </text>
      <text x="1110" y="600" textAnchor="end" className="time-edge">
        RECENT
      </text>

      {showConnections &&
        connections.map((connection) => {
          const source = pointById.get(connection.sourceId);
          const target = pointById.get(connection.targetId);
          if (!source || !target) return null;
          const isActive =
            activeId === connection.sourceId || activeId === connection.targetId;
          return (
            <line
              key={`${connection.sourceId}-${connection.targetId}`}
              className={`constellation-line ${isActive ? 'is-active' : ''}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              strokeWidth={connection.weight === 2 ? 1.4 : 1}
            />
          );
        })}

      {points.map((point) => {
        const isActive = activeId === point.entryId;
        const connectedCount = connectedCounts[point.entryId] ?? 0;
        const moodLabel = getMoodDescriptor(point.mood).label;
        const label = `Reflection from ${formatConstellationDate(point.timestamp)}, ${moodLabel} mood${
          connectedCount > 0 ? `, connected to ${connectedCount} reflections` : ''
        }`;
        return (
          <g
            key={point.entryId}
            className={`constellation-star ${isActive ? 'is-active' : ''}`}
            tabIndex={0}
            role="button"
            aria-label={label}
            onMouseEnter={() => onActivate(point.entryId)}
            onFocus={() => onActivate(point.entryId)}
            onBlur={() => onActivate(null)}
            onClick={() => onOpenEntry(point.entryId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenEntry(point.entryId);
              }
            }}
          >
            <circle cx={point.x} cy={point.y} r={point.radius * 3.2} fill={point.color} opacity=".09" />
            <circle cx={point.x} cy={point.y} r={point.radius} fill={point.color} filter="url(#starGlow)" />
            <circle
              cx={point.x - point.radius * 0.25}
              cy={point.y - point.radius * 0.25}
              r={Math.max(1.2, point.radius * 0.18)}
              fill="#fffaf4"
              opacity=".8"
            />
          </g>
        );
      })}
    </svg>
  );
};