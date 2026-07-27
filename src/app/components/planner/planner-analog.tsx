import React, { useMemo, useState, useEffect, useRef } from "react";
import type { Snapshot } from "../../bindings";
import { LIFE_AREAS } from "../../utils";
import type { PlannerDay } from "../../planner/planner-model";
import { PLANNER_BLOCK_KINDS } from "../../constants";
import { Briefcase, Heart, Users, DollarSign, Gamepad2, CircleDot } from "lucide-react";

type PlannerAnalogProps = {
  snapshot: Snapshot;
  now: number;
  anchor: number;
  days: PlannerDay[];
  onRecord: (anchorDay: number, range: { start: number; end: number }, listId?: string) => void;
  onEdit: (id: string) => void;
  onEditActual: (id: string) => void;
  onStart: (id: string) => void;
};

type ActiveArea = {
  key: string;
  label: string;
  color: string;
  lists: string[]; // List IDs
  priority: number;
};

// SVG configuration (Scaled down for split view)
const SVG_SIZE = 800;
const CENTER = SVG_SIZE / 2;
const BASE_RADIUS = 162;
const RING_THICKNESS = 24;
const RING_GAP = 8;
const CLOCK_RADIUS = 150;

export function PlannerAnalog({ snapshot, now, anchor, days, onRecord, onEdit, onEditActual, onStart }: PlannerAnalogProps) {
  // Extract and sort active life areas
  const activeAreas = useMemo(() => {
    const priorities = new Map((snapshot.lifeAreaPriorities || []).map((p) => [p.areaKey, p.priorityRank]));
    const areasMap = new Map<string, ActiveArea>();

    snapshot.lists.forEach((list) => {
      if (list.lifeArea) {
        if (!areasMap.has(list.lifeArea)) {
          const areaDef = LIFE_AREAS.find((a) => a.key === list.lifeArea);
          if (areaDef) {
            areasMap.set(list.lifeArea, {
              key: areaDef.key,
              label: areaDef.label,
              color: areaDef.color,
              lists: [],
              priority: priorities.get(list.lifeArea) ?? 999,
            });
          }
        }
        areasMap.get(list.lifeArea)?.lists.push(list.id);
      }
    });

    return Array.from(areasMap.values()).sort((a, b) => a.priority - b.priority);
  }, [snapshot.lists, snapshot.lifeAreaPriorities]);

  // We only look at the first day since analog clock typically represents 1 day
  const day = days[0];

  // Drag interaction state
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<{ areaKey: string; startAngle: number; endAngle: number } | null>(null);
  const [hoverState, setHoverState] = useState<{ taskId: string; x: number; y: number } | null>(null);

  const getAngleFromEvent = (event: React.PointerEvent) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    // Angle in degrees, 0 at top (12 o'clock), clockwise
    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return angle;
  };

  const handlePointerDown = (event: React.PointerEvent, areaKey: string) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const angle = getAngleFromEvent(event);
    setDragState({ areaKey, startAngle: angle, endAngle: angle });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragState) return;
    const angle = getAngleFromEvent(event);
    setDragState({ ...dragState, endAngle: angle });
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!dragState) return;
    event.currentTarget.releasePointerCapture(event.pointerId);

    // Calculate time from angles
    let { startAngle, endAngle } = dragState;
    if (startAngle > endAngle && startAngle - endAngle > 180) {
      endAngle += 360;
    } else if (endAngle > startAngle && endAngle - startAngle > 180) {
      startAngle += 360;
    }
    
    const minAngle = Math.min(startAngle, endAngle);
    const maxAngle = Math.max(startAngle, endAngle);
    
    // Snap to 1 minute (0.25 degrees)
    const snapMinutes = 1;
    const minMinute = Math.round((minAngle / 360) * 1440 / snapMinutes) * snapMinutes;
    const maxMinute = Math.round((maxAngle / 360) * 1440 / snapMinutes) * snapMinutes;

    if (maxMinute > minMinute && day) {
      const dayStart = day.start;
      const startMs = dayStart + minMinute * 60000;
      const endMs = dayStart + maxMinute * 60000;
      const area = activeAreas.find((a) => a.key === dragState.areaKey);
      onRecord(dayStart, { start: startMs, end: endMs }, area?.lists[0]);
    }
    
    setDragState(null);
  };

  // Smooth animation for second hand
  const [smoothNow, setSmoothNow] = useState(now);
  useEffect(() => {
    let frameId: number;
    const update = () => {
      setSmoothNow(Date.now());
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const d = new Date(smoothNow);
  const hours = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  const hourAngle = (hours / 24) * 360;
  
  // Create arcs
  const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, radius, startAngle);
    const end = polarToCartesian(x, y, radius, endAngle);
    let diff = endAngle - startAngle;
    if (diff < 0) diff += 360;
    const largeArcFlag = diff <= 180 ? "0" : "1";
    return [
      "M", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
    ].join(" ");
  };

  const describeTextArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    let diff = endAngle - startAngle;
    if (diff < 0) diff += 360;
    const midAngle = (startAngle + diff / 2) % 360;
    
    if (midAngle > 90 && midAngle < 270) {
      // Bottom half: draw counter-clockwise so text is upright
      const start = polarToCartesian(x, y, radius, endAngle);
      const end = polarToCartesian(x, y, radius, startAngle);
      const largeArcFlag = diff <= 180 ? "0" : "1";
      return [
        "M", start.x, start.y,
        "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
      ].join(" ");
    } else {
      // Top half: draw clockwise
      return describeArc(x, y, radius, startAngle, endAngle);
    }
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

// Add helper to get icon
const AreaIcon = ({ areaKey, size, color }: { areaKey: string; size: number; color: string }) => {
  switch (areaKey) {
    case "career": return <Briefcase size={size} color={color} />;
    case "health": return <Heart size={size} color={color} />;
    case "relationships": return <Users size={size} color={color} />;
    case "finance": return <DollarSign size={size} color={color} />;
    case "recreation": return <Gamepad2 size={size} color={color} />;
    default: return <CircleDot size={size} color={color} />;
  }
};

  // Helper to render arcs
  const renderArcs = (radius: number, area: ActiveArea, isAvailability: boolean) => {
    if (!day) return null;
    const dayStart = day.start;
    const dayEnd = day.start + 24 * 3600 * 1000;
    
    // Find blocks matching this area's lists
    const matchedBlocks = day.blocks.filter((b) => {
      if (!b.listId || !area.lists.includes(b.listId)) return false;
      const isBlockAvailability = b.kind === PLANNER_BLOCK_KINDS.availability;
      return isAvailability ? isBlockAvailability : !isBlockAvailability;
    });

    return matchedBlocks.map((block) => {
      // Clamp to day boundaries
      const startMs = Math.max(dayStart, block.start);
      const endMs = Math.min(dayEnd, block.end);
      if (startMs >= endMs) return null;

      const startMin = (startMs - dayStart) / 60000;
      const endMin = (endMs - dayStart) / 60000;
      
      const startAngle = (startMin / 1440) * 360;
      const endAngle = (endMin / 1440) * 360;
      
      const isActual = block.kind === PLANNER_BLOCK_KINDS.actual || block.kind === PLANNER_BLOCK_KINDS.live;
      const isAvail = block.kind === PLANNER_BLOCK_KINDS.availability;

      const pathId = `arc-${block.id}`;
      let diff = endAngle - startAngle;
      if (diff < 0) diff += 360;
      const arcLength = (diff / 360) * 2 * Math.PI * radius;
      
      const maxChars = Math.floor(arcLength / 6);
      let label = block.label;
      if (label.length > maxChars) {
        label = label.slice(0, Math.max(0, maxChars - 2)) + "..";
      }

      const isHovered = hoverState?.taskId === block.id;

      return (
        <g key={block.id}>
          <path
            d={describeArc(CENTER, CENTER, radius, startAngle, endAngle)}
            fill="none"
            stroke={area.color}
            strokeWidth={isHovered ? RING_THICKNESS + 8 : RING_THICKNESS - 2}
            opacity={isActual ? 1 : isAvail ? 0.3 : 0.7}
            strokeLinecap="butt"
            style={{ 
              cursor: isAvail ? 'default' : 'pointer',
              transition: 'stroke-width 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (block.kind === PLANNER_BLOCK_KINDS.planned) {
                onEdit(block.id);
              } else {
                onEditActual(block.id);
              }
            }}
            onPointerEnter={(e) => {
              setHoverState({ taskId: block.id, x: e.clientX, y: e.clientY });
            }}
            onPointerMove={(e) => {
              if (hoverState?.taskId === block.id) {
                setHoverState({ taskId: block.id, x: e.clientX, y: e.clientY });
              }
            }}
            onPointerLeave={() => {
              setHoverState(null);
            }}
          />
          {arcLength > 20 && (
            <>
              <path id={pathId} d={describeTextArc(CENTER, CENTER, radius, startAngle, endAngle)} fill="none" stroke="none" />
              <text fill="#fff" fontSize="11" fontWeight="500" style={{ pointerEvents: 'none' }}>
                <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle" dominantBaseline="central">
                  {label}
                </textPath>
              </text>
            </>
          )}
        </g>
      );
    });
  };

  return (
    <div className="planner-analog-container">
      <div className="planner-analog-clock-section">
        <svg
          ref={svgRef}
          viewBox={`180 180 440 440`}
          className="planner-analog-svg"
        >
        {/* Availability Track (Inner) and Task Track (Outer) */}
        {(() => {
          const availRadius = BASE_RADIUS;
          const taskRadius = BASE_RADIUS + RING_THICKNESS + RING_GAP;
          const defaultArea = activeAreas[0];
          
          return (
            <g>
              {/* Background Tracks */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={availRadius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth={RING_THICKNESS}
                style={{ pointerEvents: "none" }}
              />
              <circle
                cx={CENTER}
                cy={CENTER}
                r={taskRadius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth={RING_THICKNESS}
                style={{ cursor: "crosshair", touchAction: "none" }}
                onPointerDown={(e) => defaultArea && handlePointerDown(e, defaultArea.key)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
              
              {/* Render Availability (Inner Ring) */}
              {activeAreas.map(area => (
                <React.Fragment key={`avail-${area.key}`}>
                  {renderArcs(availRadius, area, true)}
                </React.Fragment>
              ))}

              {/* Render Tasks (Outer Ring) */}
              {activeAreas.map(area => (
                <React.Fragment key={`tasks-${area.key}`}>
                  {renderArcs(taskRadius, area, false)}
                </React.Fragment>
              ))}

              {/* Drag Indicator */}
              {dragState && (() => {
                const area = activeAreas.find(a => a.key === dragState.areaKey) || defaultArea;
                let sA = dragState.startAngle;
                let eA = dragState.endAngle;
                if (sA > eA && sA - eA > 180) eA += 360;
                else if (eA > sA && eA - sA > 180) sA += 360;
                const min = Math.min(sA, eA) % 360;
                let max = Math.max(sA, eA) % 360;
                if (max < min) max += 360;
                
                return (
                  <path
                    d={describeArc(CENTER, CENTER, taskRadius, min, max)}
                    fill="none"
                    stroke={area?.color || "#fff"}
                    strokeWidth={RING_THICKNESS}
                    opacity={0.8}
                    strokeLinecap="butt"
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })()}
            </g>
          );
        })()}

        {/* 24-hour Clock Face */}
        <circle cx={CENTER} cy={CENTER} r={CLOCK_RADIUS} fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="2" />
        
        {/* Clock Ticks and Numbers */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * 360;
          const isPrimary = i % 6 === 0;
          const outerRadius = CLOCK_RADIUS;
          const innerRadius = CLOCK_RADIUS - (isPrimary ? 12 : 6);
          const outer = polarToCartesian(CENTER, CENTER, outerRadius, angle);
          const inner = polarToCartesian(CENTER, CENTER, innerRadius, angle);
          
          const textPos = polarToCartesian(CENTER, CENTER, CLOCK_RADIUS - 26, angle);
          
          return (
            <g key={`hour-${i}`}>
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(255, 255, 255, 0.4)" strokeWidth={isPrimary ? 2 : 1} />
              <text x={textPos.x} y={textPos.y + 4} fill={isPrimary ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.6)"} fontSize="12" textAnchor="middle" fontWeight={isPrimary ? "bold" : "normal"}>
                {i}
              </text>
            </g>
          );
        })}

        {/* Minute Ticks */}
        {Array.from({ length: 60 }).map((_, i) => {
          const angle = (i / 60) * 360;
          const isFiveMin = i % 5 === 0;
          const outerRadius = CLOCK_RADIUS;
          const innerRadius = CLOCK_RADIUS - (isFiveMin ? 6 : 3);
          const outer = polarToCartesian(CENTER, CENTER, outerRadius, angle);
          const inner = polarToCartesian(CENTER, CENTER, innerRadius, angle);
          
          return (
            <line key={`min-${i}`} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="rgba(255, 255, 255, 0.2)" strokeWidth={1} />
          );
        })}
        
        {/* Hour Hand */}
        <line
          x1={CENTER}
          y1={CENTER}
          x2={polarToCartesian(CENTER, CENTER, CLOCK_RADIUS - 40, hourAngle).x}
          y2={polarToCartesian(CENTER, CENTER, CLOCK_RADIUS - 40, hourAngle).y}
          stroke="#fff"
          strokeWidth="6"
          strokeLinecap="round"
        />
        
        {/* Minute Hand */}
        <line
          x1={CENTER}
          y1={CENTER}
          x2={polarToCartesian(CENTER, CENTER, CLOCK_RADIUS - 20, (d.getMinutes() / 60) * 360).x}
          y2={polarToCartesian(CENTER, CENTER, CLOCK_RADIUS - 20, (d.getMinutes() / 60) * 360).y}
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Second Hand (Mechanical Sweep) */}
        <line
          x1={CENTER}
          y1={CENTER}
          x2={polarToCartesian(CENTER, CENTER, CLOCK_RADIUS - 5, (d.getSeconds() + d.getMilliseconds() / 1000) / 60 * 360).x}
          y2={polarToCartesian(CENTER, CENTER, CLOCK_RADIUS - 5, (d.getSeconds() + d.getMilliseconds() / 1000) / 60 * 360).y}
          stroke="#e8115b"
          strokeWidth="2"
          strokeLinecap="round"
        />
        
        {/* Center Dot */}
        <circle cx={CENTER} cy={CENTER} r="8" fill="#e8115b" />
        <circle cx={CENTER} cy={CENTER} r="3" fill="#fff" />
      </svg>
      </div>

      {hoverState && (
        <div style={{
          position: 'fixed',
          left: hoverState.x + 16,
          top: hoverState.y + 16,
          backgroundColor: 'rgba(20, 20, 20, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '12px 16px',
          borderRadius: '8px',
          color: '#fff',
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {(() => {
            const block = day?.blocks.find(b => b.id === hoverState.taskId);
            if (!block) return null;
            return (
              <>
                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{block.label}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                  {new Date(block.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(block.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
