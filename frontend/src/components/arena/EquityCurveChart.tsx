import { useEffect, useRef, useCallback, useState } from 'react';
import { createChart, ColorType, LineStyle, ISeriesApi, IChartApi, UTCTimestamp, CrosshairMode } from 'lightweight-charts';
import { useArenaStore } from '../../store/arenaStore';

// Vibrant, distinct colors for agents
const COLORS = [
  '#10b981', // emerald
  '#f43f5e', // rose
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#6366f1', // indigo
  '#14b8a6', // teal
];

// Partial agent from equity curve (doesn't have all fields)
interface EquityCurveAgent {
  id: string;
  name: string;
  walletAddress: string;
}

interface EquityCurveChartProps {
  onAgentClick?: (agent: EquityCurveAgent) => void;
  selectedAgentId?: string | null;
}

export function EquityCurveChart({ onAgentClick, selectedAgentId }: EquityCurveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<string, { series: ISeriesApi<'Line'>; agent: EquityCurveAgent; color: string }>>(new Map());
  const { equityCurves, loading } = useArenaStore();
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [tooltipData, setTooltipData] = useState<{ name: string; value: number; time: string } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#fafafa' },
        textColor: '#525252',
        fontFamily: '"Space Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#e5e5e5', style: LineStyle.Solid },
        horzLines: { color: '#e5e5e5', style: LineStyle.Solid },
      },
      width: chartContainerRef.current.clientWidth,
      height: 350,
      rightPriceScale: {
        borderColor: '#0d0d0d',
        borderVisible: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        autoScale: true,
      },
      timeScale: {
        borderColor: '#0d0d0d',
        borderVisible: true,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#0d0d0d',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0d0d0d',
        },
        horzLine: {
          color: '#0d0d0d',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#0d0d0d',
        },
      },
      handleScale: {
        axisPressedMouseMove: true,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    chartRef.current = chart;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Handle legend click
  const handleLegendClick = useCallback((agent: EquityCurveAgent) => {
    onAgentClick?.(agent);
  }, [onAgentClick]);

  // Update series line width based on selection/hover
  useEffect(() => {
    seriesMapRef.current.forEach(({ series, agent }) => {
      const isSelected = selectedAgentId === agent.id;
      const isHovered = hoveredAgent === agent.id;
      series.applyOptions({
        lineWidth: isSelected ? 4 : isHovered ? 3 : 2,
      });
    });
  }, [selectedAgentId, hoveredAgent]);

  // Update chart with data
  useEffect(() => {
    if (!chartRef.current || equityCurves.length === 0) return;

    // Clear existing series
    seriesMapRef.current.forEach(({ series }) => {
      try {
        chartRef.current?.removeSeries(series);
      } catch (e) {
        // Series may already be removed
      }
    });
    seriesMapRef.current.clear();

    // Add series for each agent
    equityCurves.forEach((curve, index) => {
      const color = COLORS[index % COLORS.length];
      const isSelected = selectedAgentId === curve.agent.id;
      const series = chartRef.current!.addLineSeries({
        color,
        lineWidth: isSelected ? 4 : 2,
        lineStyle: LineStyle.Solid,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `$${price.toFixed(2)}`,
        },
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderColor: '#ffffff',
        crosshairMarkerBorderWidth: 2,
        crosshairMarkerBackgroundColor: color,
        lastValueVisible: false,
        priceLineVisible: false,
      });

      // Map data to lightweight-charts format with proper time type
      const chartData = curve.data.map(d => ({
        time: d.time as UTCTimestamp,
        value: d.value,
      }));

      if (chartData.length > 0) {
        series.setData(chartData);
      }

      seriesMapRef.current.set(curve.agent.id, { series, agent: curve.agent, color });
    });

    chartRef.current.timeScale().fitContent();
  }, [equityCurves, selectedAgentId]);

  if (loading) {
    return (
      <div className="h-[350px] flex items-center justify-center bg-qn-gray-50 border-2 border-qn-black">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-qn-black border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono uppercase text-qn-gray-500">Loading chart...</span>
        </div>
      </div>
    );
  }

  if (equityCurves.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center bg-qn-gray-50 border-2 border-qn-black">
        <div className="text-center">
          <div className="text-4xl mb-3">📈</div>
          <p className="text-qn-gray-600 font-mono text-sm uppercase font-bold mb-1">
            No Data Yet
          </p>
          <p className="text-qn-gray-400 text-xs font-mono">
            Equity curves appear as agents trade
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart Title Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase text-qn-gray-500">Showing</span>
          <span className="text-xs font-mono font-bold">{equityCurves.length} agent{equityCurves.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="text-xs font-mono text-qn-gray-400">
          Click legend to select • Scroll to zoom
        </div>
      </div>

      {/* Chart Container with brutalist border */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-qn-black" style={{ transform: 'translate(3px, 3px)' }} />
        <div
          ref={chartContainerRef}
          className="relative border-2 border-qn-black bg-white"
        />
      </div>

      {/* Legend */}
      <div className="border-2 border-qn-black bg-white p-3">
        <div className="text-xs font-mono uppercase text-qn-gray-500 mb-3">Agents</div>
        <div className="flex flex-wrap gap-2">
          {equityCurves.map((curve, index) => {
            const color = COLORS[index % COLORS.length];
            const isSelected = selectedAgentId === curve.agent.id;
            const isHovered = hoveredAgent === curve.agent.id;
            const latestValue = curve.data[curve.data.length - 1]?.value || 0;

            return (
              <button
                key={curve.agent.id}
                className={`group flex items-center gap-2 px-3 py-2 transition-all font-mono text-sm ${
                  isSelected
                    ? 'bg-qn-black text-white border-2 border-qn-black'
                    : isHovered
                    ? 'bg-qn-gray-100 border-2 border-qn-black'
                    : 'bg-white border-2 border-qn-gray-300 hover:border-qn-black'
                }`}
                onClick={() => handleLegendClick(curve.agent)}
                onMouseEnter={() => setHoveredAgent(curve.agent.id)}
                onMouseLeave={() => setHoveredAgent(null)}
              >
                <div
                  className="w-3 h-3 rounded-sm border border-qn-black/20"
                  style={{ backgroundColor: color }}
                />
                <span className="font-medium truncate max-w-[120px]">
                  {curve.agent.name}
                </span>
                <span className={`text-xs ${
                  isSelected ? 'text-white/70' : 'text-qn-gray-400'
                }`}>
                  ${latestValue.toFixed(2)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(() => {
          const topAgent = equityCurves.reduce((max, c) => {
            const val = c.data[c.data.length - 1]?.value || 0;
            return val > (max.value || 0) ? { agent: c.agent, value: val } : max;
          }, { agent: null as EquityCurveAgent | null, value: 0 });

          const totalEquity = equityCurves.reduce((sum, c) => {
            return sum + (c.data[c.data.length - 1]?.value || 0);
          }, 0);

          return (
            <>
              <div className="bg-white border-2 border-qn-black p-3">
                <div className="text-xs font-mono uppercase text-qn-gray-500 mb-1">Leader</div>
                <div className="font-mono font-bold truncate">{topAgent.agent?.name || '-'}</div>
              </div>
              <div className="bg-white border-2 border-qn-black p-3">
                <div className="text-xs font-mono uppercase text-qn-gray-500 mb-1">Top Equity</div>
                <div className="font-mono font-bold text-emerald-600">${topAgent.value.toFixed(2)}</div>
              </div>
              <div className="bg-white border-2 border-qn-black p-3">
                <div className="text-xs font-mono uppercase text-qn-gray-500 mb-1">Total Equity</div>
                <div className="font-mono font-bold">${totalEquity.toFixed(2)}</div>
              </div>
              <div className="bg-white border-2 border-qn-black p-3">
                <div className="text-xs font-mono uppercase text-qn-gray-500 mb-1">Competing</div>
                <div className="font-mono font-bold">{equityCurves.length} agents</div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
