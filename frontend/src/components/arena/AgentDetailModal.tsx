import { useEffect, useState } from 'react';
import * as api from '../../api/arena';
import type { Agent, TokenHolding } from '../../types/arena';

interface AgentDetailModalProps {
  agent: Agent;
  onClose: () => void;
}

export function AgentDetailModal({ agent, onClose }: AgentDetailModalProps) {
  const [fullAgent, setFullAgent] = useState<Agent | null>(null);
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHoldings, setLoadingHoldings] = useState(true);

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

  useEffect(() => {
    async function fetchTokenHoldings() {
      try {
        const data = await api.getAgentWalletValue(agent.walletAddress);
        setTokenHoldings(data.breakdown || []);
      } catch (error) {
        console.error('Failed to fetch token holdings:', error);
        setTokenHoldings([]);
      } finally {
        setLoadingHoldings(false);
      }
    }
    fetchTokenHoldings();
  }, [agent.walletAddress]);

  const displayAgent = fullAgent || agent;

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

        {/* Wallet Summary */}
        <div className="p-4">
          <h4 className="text-sm font-bold uppercase tracking-tight text-qn-gray-500 mb-3">
            Wallet Value
          </h4>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="spinner" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border-2 border-qn-black bg-qn-gray-50">
                <div className="text-xs text-qn-gray-500 font-mono uppercase">Starting Value</div>
                <div className="text-2xl font-mono font-bold">
                  ${(displayAgent.initialEquity || 0).toFixed(2)}
                </div>
                <div className="text-xs text-qn-gray-400 mt-1">
                  When registered
                </div>
              </div>
              <div className="p-4 border-2 border-qn-black bg-qn-gray-50">
                <div className="text-xs text-qn-gray-500 font-mono uppercase">Current Value</div>
                <div className="text-2xl font-mono font-bold">
                  ${(displayAgent.currentEquity || displayAgent.pnlSnapshots?.[0]?.equity || 0).toFixed(2)}
                </div>
                <div className="text-xs text-qn-gray-400 mt-1">
                  USDC Balance
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Token Holdings */}
        <div className="p-4 border-t-2 border-qn-black">
          <h4 className="text-sm font-bold uppercase tracking-tight text-qn-gray-500 mb-3">
            Token Holdings
          </h4>

          {loadingHoldings ? (
            <div className="flex justify-center py-4">
              <div className="spinner" />
            </div>
          ) : tokenHoldings.length === 0 ? (
            <p className="text-sm text-qn-gray-400 font-mono">No tokens found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-qn-gray-200">
                    <th className="text-left py-2 font-mono text-xs text-qn-gray-500 uppercase">Token</th>
                    <th className="text-right py-2 font-mono text-xs text-qn-gray-500 uppercase">Balance</th>
                    <th className="text-right py-2 font-mono text-xs text-qn-gray-500 uppercase">Price</th>
                    <th className="text-right py-2 font-mono text-xs text-qn-gray-500 uppercase">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {tokenHoldings.map((token) => (
                    <tr key={token.mint} className="border-b border-qn-gray-100">
                      <td className="py-2">
                        <span className="font-mono text-sm font-medium">{token.symbol}</span>
                      </td>
                      <td className="text-right py-2 font-mono">{formatBalance(token.balance)}</td>
                      <td className="text-right py-2 font-mono">${formatPrice(token.price)}</td>
                      <td className="text-right py-2 font-mono font-medium">${token.value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-qn-black">
                    <td colSpan={3} className="py-2 text-right font-mono text-xs text-qn-gray-500 uppercase">Total</td>
                    <td className="text-right py-2 font-mono font-bold">
                      ${tokenHoldings.reduce((sum, t) => sum + t.value, 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
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

function formatBalance(balance: number): string {
  if (balance >= 1000000) return (balance / 1000000).toFixed(2) + 'M';
  if (balance >= 1000) return (balance / 1000).toFixed(2) + 'K';
  if (balance >= 1) return balance.toFixed(2);
  if (balance >= 0.0001) return balance.toFixed(4);
  return balance.toExponential(2);
}

function formatPrice(price: number): string {
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.0001) return price.toFixed(4);
  if (price > 0) return price.toExponential(2);
  return '0.00';
}
