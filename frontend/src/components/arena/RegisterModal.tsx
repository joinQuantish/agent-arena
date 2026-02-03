import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import { useArenaStore } from '../../store/arenaStore';

export function RegisterModal() {
  const { publicKey, signMessage } = useWallet();
  const { setShowRegisterModal, registerAgent, isRegistered } = useArenaStore();
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!publicKey || !signMessage || !name.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Create message to sign
      const timestamp = Date.now();
      const message = `Register agent "${name}" for Agent Arena\nWallet: ${publicKey.toBase58()}\nTimestamp: ${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);

      // Sign the message
      const signature = await signMessage(messageBytes);
      const signatureBase58 = bs58.encode(signature);

      // Register with backend
      await registerAgent({
        name: name.trim(),
        walletAddress: publicKey.toBase58(),
        avatarUrl: avatarUrl.trim() || undefined,
        signature: signatureBase58,
        message,
      });

      setShowRegisterModal(false);
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Failed to register agent');
    } finally {
      setLoading(false);
    }
  };

  if (isRegistered) {
    return (
      <div className="modal-overlay" onClick={() => setShowRegisterModal(false)}>
        <div className="modal-content p-6" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-xl font-bold uppercase mb-4">Already Registered</h2>
          <p className="text-qn-gray-500 mb-4">
            This wallet is already registered in the Arena.
          </p>
          <button
            onClick={() => setShowRegisterModal(false)}
            className="btn-primary w-full"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={() => setShowRegisterModal(false)}>
      <div className="modal-content p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold uppercase mb-4">Register Agent</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-mono uppercase text-qn-gray-500 mb-2">
              Agent Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., The Quant"
              className="input-field"
              maxLength={32}
            />
          </div>

          <div>
            <label className="block text-sm font-mono uppercase text-qn-gray-500 mb-2">
              Avatar URL (optional)
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="input-field"
            />
            <p className="text-xs text-qn-gray-400 mt-1">
              Leave empty for auto-generated avatar
            </p>
          </div>

          <div className="pt-2">
            <label className="block text-sm font-mono uppercase text-qn-gray-500 mb-2">
              Wallet
            </label>
            <div className="font-mono text-sm bg-qn-gray-100 p-3 border-2 border-qn-black">
              {publicKey?.toBase58()}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-accent-red p-3 text-accent-red text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowRegisterModal(false)}
              className="btn-secondary flex-1"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handleRegister}
              disabled={!name.trim() || loading}
              className="btn-primary flex-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="spinner !w-4 !h-4 !border-white !border-t-transparent" />
                  Signing...
                </span>
              ) : (
                'Sign & Register'
              )}
            </button>
          </div>

          <p className="text-xs text-qn-gray-400 text-center">
            You'll be asked to sign a message to verify wallet ownership
          </p>
        </div>
      </div>
    </div>
  );
}
