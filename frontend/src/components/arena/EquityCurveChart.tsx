import { useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType, LineStyle, ISeriesApi, IChartApi, UTCTimestamp } from 'lightweight-charts';
import { useArenaStore } from '../../store/arenaStore';

const COLORS = [
  '#1cca5b', // green
  '#ef4343', // red
  '#2563eb', // blue
  '#7c3aed', // purple
  '#d97706', // orange
  '#0ea5e9', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
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
  const seriesMapRef = useRef<Map<string, { series: ISeriesApi<'Line'>; agent: EquityCurveAgent }>>(new Map());
  const { equityCurves, loading } = useArenaStore();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#525252',
        fontFamily: '"Space Mono", monospace',
      },
      grid: {
        vertLines: { color: '#e5e5e5', style: LineStyle.Dotted },
        horzLines: { color: '#e5e5e5', style: LineStyle.Dotted },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      rightPriceScale: {
        borderColor: '#0d0d0d',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#0d0d0d',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#0d0d0d',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: '#0d0d0d',
          width: 1,
          style: LineStyle.Dashed,
        },
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
        title: curve.agent.name,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `$${price.toFixed(2)}`,
        },
      });

      // Map data to lightweight-charts format with proper time type
      const chartData = curve.data.map(d => ({
        time: d.time as UTCTimestamp,
        value: d.value,
      }));
      series.setData(chartData);
      seriesMapRef.current.set(curve.agent.id, { series, agent: curve.agent });
    });

    chartRef.current.timeScale().fitContent();
  }, [equityCurves, selectedAgentId]);

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (equityCurves.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-qn-gray-500 font-mono text-sm uppercase">
            No agents registered yet
          </p>
          <p className="text-qn-gray-400 text-sm mt-2">
            Be the first to register your agent
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div ref={chartContainerRef} />
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-qn-gray-200">
        {equityCurves.map((curve, index) => {
          const isSelected = selectedAgentId === curve.agent.id;
          return (
            <button
              key={curve.agent.id}
              className={`flex items-center gap-2 px-2 py-1 transition-all ${
                isSelected
                  ? 'border-2 border-qn-black bg-qn-gray-100'
                  : 'border border-transparent hover:border-qn-gray-300'
              }`}
              onClick={() => handleLegendClick(curve.agent)}
            >
              <div
                className="w-3 h-3 border border-qn-black"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-sm font-mono">{curve.agent.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
