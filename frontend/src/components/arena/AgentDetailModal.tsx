import { useEffect, useState } from 'react';
import * as api from '../../api/arena';
import type { Agent } from '../../types/arena';

interface AgentDetailModalProps {
  agent: Agent;
  onClose: () => void;
}

export function AgentDetailModal({ agent, onClose }: AgentDetailModalProps) {
  const [fullAgent, setFullAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAgent() {
      try {
        const data = await api.getAgent(agent.id);
        setFullAgent(data);
      } catch (error) {
        console.error('Failed to fetch agent details:', error);
        setFullAgent(agent);
      } finally {
        setLoading(false);
      }
    }
    fetchAgent();
  }, [agent.id]);

  const displayAgent = fullAgent || agent;
  const positions = displayAgent.positions || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content modal-content-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b-2 border-qn-black flex items-center justify-between">
          <h2 className="text-lg font-bold uppercase tracking-tight">
            Agent Details
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border-2 border-qn-black hover:bg-qn-gray-100 transition-colors"
            aria-label="Close modal"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>

        {/* Agent Info */}
        <div className="p-4 border-b-2 border-qn-black">
          <div className="flex items-center gap-4">
            <img
              src={displayAgent.avatarUrl || generateAvatar(displayAgent.walletAddress)}
              alt={displayAgent.name}
              className="w-16 h-16 border-2 border-qn-black"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold truncate">{displayAgent.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-qn-gray-500 font-mono">
                  {truncateAddress(displayAgent.walletAddress)}
                </span>
                <button
                  onClick={() => copyToClipboard(displayAgent.walletAddress)}
                  className="text-xs text-qn-gray-400 hover:text-qn-black transition-colors"
                  title="Copy address"
                >
                  [copy]
                </button>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-qn-gray-200">
            <div>
              <div className="text-xs text-qn-gray-500 font-mono uppercase">Total PnL</div>
              <div className={`text-lg font-mono font-bold ${getPnlClass(displayAgent.totalPnl)}`}>
                {displayAgent.totalPnl >= 0 ? '+' : ''}${displayAgent.totalPnl.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-qn-gray-500 font-mono uppercase">Return</div>
              <div className={`text-lg font-mono font-bold ${getPnlClass(displayAgent.totalReturn)}`}>
                {displayAgent.totalReturn >= 0 ? '+' : ''}{displayAgent.totalReturn.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-qn-gray-500 font-mono uppercase">Registered</div>
              <div className="text-lg font-mono">
                {formatDate(displayAgent.registeredAt)}
              </div>
            </div>
          </div>
        </div>

        {/* Positions */}
        <div className="p-4">
          <h4 className="text-sm font-bold uppercase tracking-tight text-qn-gray-500 mb-3">
            Positions ({positions.length})
          </h4>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="spinner" />
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-qn-gray-500 font-mono text-sm">No positions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="arena-table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th className="text-center">Side</th>
                    <th className="text-right">Balance</th>
                    <th className="text-right">Entry</th>
                    <th className="text-right">Current</th>
                    <th className="text-right">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr key={position.id}>
                      <td>
                        <span className="font-mono text-sm">{position.marketTicker}</span>
                      </td>
                      <td className="text-center">
                        <span className={`badge ${position.side === 'YES' ? 'badge-yes' : 'badge-no'}`}>
                          {position.side}
                        </span>
                      </td>
                      <td className="text-right font-mono">
                        {position.balance.toFixed(2)}
                      </td>
                      <td className="text-right font-mono">
                        {(position.entryPrice * 100).toFixed(0)}¢
                      </td>
                      <td className="text-right font-mono">
                        {(position.currentPrice * 100).toFixed(0)}¢
                      </td>
                      <td className={`text-right font-mono ${getPnlClass(position.pnl)}`}>
                        {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-qn-black bg-qn-gray-50">
          <a
            href={`https://solscan.io/account/${displayAgent.walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-mono text-qn-gray-500 hover:text-qn-black transition-colors"
          >
            View on Solscan →
          </a>
        </div>
      </div>
    </div>
  );
}

function generateAvatar(address: string): string {
  return `https://www.gravatar.com/avatar/${address.slice(0, 32)}?d=identicon&s=200`;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getPnlClass(value: number): string {
  if (value > 0) return 'pnl-positive';
  if (value < 0) return 'pnl-negative';
  return '';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(console.error);
}
