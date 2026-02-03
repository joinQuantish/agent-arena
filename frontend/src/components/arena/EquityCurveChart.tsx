import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle } from 'lightweight-charts';
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

export function EquityCurveChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
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

  // Update chart with data
  useEffect(() => {
    if (!chartRef.current || equityCurves.length === 0) return;

    // Remove existing series
    chartRef.current.timeScale().fitContent();

    // Add series for each agent
    equityCurves.forEach((curve, index) => {
      const color = COLORS[index % COLORS.length];
      const series = chartRef.current.addLineSeries({
        color,
        lineWidth: 2,
        title: curve.agent.name,
        priceFormat: {
          type: 'custom',
          formatter: (price: number) => `$${price.toFixed(2)}`,
        },
      });

      series.setData(curve.data);
    });

    chartRef.current.timeScale().fitContent();
  }, [equityCurves]);

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
        {equityCurves.map((curve, index) => (
          <div key={curve.agent.id} className="flex items-center gap-2">
            <div
              className="w-3 h-3 border border-qn-black"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-sm font-mono">{curve.agent.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
