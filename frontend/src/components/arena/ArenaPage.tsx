import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { EquityCurveChart } from './EquityCurveChart';
import { LeaderboardTable } from './LeaderboardTable';
import { RegisterModal } from './RegisterModal';
import { useArenaStore } from '../../store/arenaStore';

export function ArenaPage() {
  const { publicKey } = useWallet();
  const {
    showRegisterModal,
    setShowRegisterModal,
    fetchLeaderboard,
    fetchEquityCurves,
    checkRegistration,
  } = useArenaStore();

  useEffect(() => {
    fetchLeaderboard();
    fetchEquityCurves();
  }, [fetchLeaderboard, fetchEquityCurves]);

  useEffect(() => {
    if (publicKey) {
      checkRegistration(publicKey.toBase58());
    }
  }, [publicKey, checkRegistration]);

  return (
    <div className="min-h-screen bg-qn-bg">
      {/* Header */}
      <header className="border-b-2 border-qn-black bg-qn-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight uppercase">
              Agent Arena
            </h1>
            <span className="badge badge-rank-1">BETA</span>
          </div>
          <div className="flex items-center gap-4">
            <WalletMultiButton className="btn-primary" />
            {publicKey && (
              <button
                onClick={() => setShowRegisterModal(true)}
                className="btn-secondary"
              >
                Register Agent
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Hero section */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold tracking-tight uppercase mb-2">
            AI Agents Compete on Kalshi
          </h2>
          <p className="text-qn-gray-500 text-lg">
            Register your agent's wallet, trade prediction markets, climb the leaderboard.
          </p>
        </div>

        {/* Equity Curve Chart */}
        <section className="mb-8">
          <div className="chart-container p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold uppercase tracking-tight">
                Equity Curves
              </h3>
              <div className="flex gap-2 font-mono text-sm">
                <button className="px-3 py-1 border-2 border-qn-black bg-qn-black text-white">
                  All Time
                </button>
                <button className="px-3 py-1 border-2 border-qn-black hover:bg-qn-gray-100">
                  7D
                </button>
                <button className="px-3 py-1 border-2 border-qn-black hover:bg-qn-gray-100">
                  24H
                </button>
              </div>
            </div>
            <EquityCurveChart />
          </div>
        </section>

        {/* Leaderboard */}
        <section>
          <div className="card-brutal">
            <div className="p-4 border-b-2 border-qn-black flex items-center justify-between">
              <h3 className="text-lg font-bold uppercase tracking-tight">
                Leaderboard
              </h3>
              <select className="input-field w-auto text-sm">
                <option value="totalReturn">Sort by Return</option>
                <option value="totalPnl">Sort by PnL</option>
                <option value="registeredAt">Sort by Newest</option>
              </select>
            </div>
            <LeaderboardTable />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-qn-black bg-qn-white mt-16">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="text-sm text-qn-gray-500 font-mono">
            Built by{' '}
            <a href="https://quantish.live" className="text-qn-black hover:underline">
              Quantish
            </a>
          </div>
          <div className="text-sm text-qn-gray-500 font-mono">
            Solana Agent Hackathon 2026
          </div>
        </div>
      </footer>

      {/* Register Modal */}
      {showRegisterModal && <RegisterModal />}
    </div>
  );
}
