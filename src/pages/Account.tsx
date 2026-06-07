import React, { useState } from 'react';
import { User as UserIcon, Mail, Calendar, KeyRound, LogOut, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/orchid/Navbar';
import Footer from '@/components/orchid/Footer';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import SavedComparisons from '@/components/orchid/SavedComparisons';

/**
 * Protected /account page.
 *
 * Shows the signed-in user's profile, lets them update their password,
 * and sign out. Wrapped in <ProtectedRoute> so unauthenticated visitors
 * get the lockout screen + Sign In modal.
 */
const AccountInner: React.FC = () => {
  const { user, signOut, updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const displayName =
    (user?.user_metadata && (user.user_metadata as Record<string, unknown>).display_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Continuum member';

  const createdAt = user?.created_at ? new Date(user.created_at) : null;

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const res = await updatePassword(newPassword);
    setBusy(false);
    if (!res.ok) setError(res.error || 'Could not update password.');
    else {
      setNotice('Password updated.');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <Navbar />
      <main className="pt-28 pb-24 px-6 lg:px-10">
        <div className="max-w-3xl mx-auto">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
            CONTINUUM · MEMBER ACCOUNT
          </div>
          <h1 className="font-display text-[2.6rem] leading-tight text-ink">Your account</h1>
          <p className="mt-2 font-body text-[15px] text-charcoal/75 max-w-prose">
            Manage your Orchid Continuum profile, update your password, and sign out from this device.
          </p>

          {/* Profile card */}
          <section className="mt-10 rounded-sm border border-quiet bg-warm-white p-6 lg:p-7">
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-full bg-[#1f3d2b] text-[#faf7f2] flex items-center justify-center font-display text-xl shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-[1.4rem] text-ink truncate">{displayName}</div>
                <div className="mt-1 font-mono text-[11px] tracking-[0.12em] text-charcoal/70 inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> {user?.email}
                </div>
                {createdAt && (
                  <div className="mt-1 font-mono text-[11px] tracking-[0.12em] text-charcoal/55 inline-flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> joined {createdAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
              <button
                onClick={() => signOut()}
                className="hidden sm:inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-2 rounded-full border border-quiet text-charcoal/80 hover:text-forest hover:border-forest transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </section>

          {/* Password card */}
          <section className="mt-6 rounded-sm border border-quiet bg-warm-white p-6 lg:p-7">
            <div className="flex items-center gap-2 mb-1 text-forest">
              <KeyRound className="h-4 w-4" />
              <h2 className="font-display text-[1.3rem] text-ink">Change password</h2>
            </div>
            <p className="font-body text-[14px] text-charcoal/70 max-w-prose">
              Choose a new password (at least 8 characters). You will stay signed in on this device.
            </p>

            <form onSubmit={submitPassword} className="mt-5 space-y-4 max-w-sm">
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/70">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="mt-1.5 w-full rounded-sm border border-quiet bg-cream px-3 py-2.5 font-body text-[15px] text-ink focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest/40"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/70">Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="mt-1.5 w-full rounded-sm border border-quiet bg-cream px-3 py-2.5 font-body text-[15px] text-ink focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest/40"
                />
              </label>

              {error && (
                <div className="flex items-start gap-2 rounded-sm border border-[#b94a48]/30 bg-[#fdf3f2] px-3 py-2 text-[13px] text-[#7a2a28] font-body">
                  <AlertCircle className="h-4 w-4 mt-[2px] shrink-0" /><span>{error}</span>
                </div>
              )}
              {notice && (
                <div className="flex items-start gap-2 rounded-sm border border-forest/25 bg-[#f0f5ef] px-3 py-2 text-[13px] text-forest font-body">
                  <CheckCircle2 className="h-4 w-4 mt-[2px] shrink-0" /><span>{notice}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="font-mono text-[11px] tracking-[0.2em] uppercase px-5 py-2.5 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-colors disabled:opacity-60 inline-flex items-center gap-2"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </button>
            </form>
          </section>

          {/* Saved genus comparisons */}
          <SavedComparisons />


          {/* Mobile sign out */}
          <div className="sm:hidden mt-6">
            <button
              onClick={() => signOut()}
              className="w-full inline-flex items-center justify-center gap-2 font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-3 rounded-full border border-quiet text-charcoal/80 hover:text-forest hover:border-forest transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>

          <div className="mt-12 flex items-center gap-3 text-charcoal/50">
            <UserIcon className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase">CONTINUUM · {user?.id?.slice(0, 8)}</span>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

const Account: React.FC = () => (
  <ProtectedRoute
    title="Sign in to view your account"
    description="Your Orchid Continuum profile, password, and member preferences live behind authentication."
  >
    <AccountInner />
  </ProtectedRoute>
);

export default Account;
