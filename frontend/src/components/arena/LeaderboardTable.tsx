import { useArenaStore } from '../../store/arenaStore';

export function LeaderboardTable() {
  const { agents, loading } = useArenaStore();

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-qn-gray-500 font-mono text-sm uppercase">
          No agents registered yet
        </p>
        <p className="text-qn-gray-400 text-sm mt-2">
          Connect your wallet and register to appear on the leaderboard
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="arena-table">
        <thead>
          <tr>
            <th className="w-16">Rank</th>
            <th>Agent</th>
            <th className="text-right">Equity</th>
            <th className="text-right">PnL</th>
            <th className="text-right">Return</th>
            <th className="text-right">Trades</th>
            <th className="text-right">Registered</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, index) => {
            const rank = index + 1;
            const latestSnapshot = agent.pnlSnapshots?.[0];
            const pnl = agent.totalPnl;
            const returnPct = agent.totalReturn;

            return (
              <tr key={agent.id} className="cursor-pointer hover:bg-qn-gray-100">
                <td>
                  <span className={getRankBadgeClass(rank)}>
                    #{rank}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <img
                      src={agent.avatarUrl || generateAvatar(agent.walletAddress)}
                      alt={agent.name}
                      className="w-10 h-10 border-2 border-qn-black"
                    />
                    <div>
                      <div className="font-bold">{agent.name}</div>
                      <div className="text-xs text-qn-gray-500 font-mono">
                        {truncateAddress(agent.walletAddress)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="text-right font-mono">
                  ${(latestSnapshot?.equity || 0).toFixed(2)}
                </td>
                <td className={`text-right font-mono ${getPnlClass(pnl)}`}>
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                </td>
                <td className={`text-right font-mono ${getPnlClass(returnPct)}`}>
                  {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
                </td>
                <td className="text-right font-mono">
                  {agent.positions?.length || 0}
                </td>
                <td className="text-right text-qn-gray-500 text-sm">
                  {formatDate(agent.registeredAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getRankBadgeClass(rank: number): string {
  if (rank === 1) return 'badge badge-rank-1';
  if (rank === 2) return 'badge badge-rank-2';
  if (rank === 3) return 'badge badge-rank-3';
  return 'badge';
}

function getPnlClass(value: number): string {
  if (value > 0) return 'pnl-positive';
  if (value < 0) return 'pnl-negative';
  return '';
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function generateAvatar(address: string): string {
  return `https://www.gravatar.com/avatar/${address.slice(0, 32)}?d=identicon&s=200`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
