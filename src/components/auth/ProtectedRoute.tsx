import React, { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from './AuthModal';

/**
 * Gates a page behind an authenticated session.
 *
 * While the AuthProvider is still hydrating we render a quiet loading
 * state instead of bouncing the user. Unauthenticated visitors see a
 * botanical "members-only" notice with a Sign In CTA that opens the
 * AuthModal in-place — no redirect, so the deep link is preserved.
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode; title?: string; description?: string }> = ({
  children,
  title = 'Members-only area',
  description = 'Sign in to your Orchid Continuum account to access this section.',
}) => {
  const { user, loading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex items-center gap-3 text-charcoal/60 font-mono text-[11px] tracking-[0.2em] uppercase">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking session…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <div className="min-h-screen bg-cream flex items-center justify-center px-6 py-24">
          <div className="max-w-md w-full text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-forest/30 bg-warm-white text-forest mb-5">
              <Lock className="h-6 w-6" />
            </div>
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
              RESTRICTED · CONTINUUM MEMBERS
            </div>
            <h1 className="font-display text-[2.1rem] leading-tight text-ink">{title}</h1>
            <p className="mt-3 font-body text-[15px] text-charcoal/80 leading-relaxed">
              {description}
            </p>
            <button
              onClick={() => setShowAuth(true)}
              className="mt-7 font-mono text-[11px] tracking-[0.2em] uppercase px-6 py-3 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-colors"
            >
              Sign in to continue
            </button>
          </div>
        </div>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialMode="signin" />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
