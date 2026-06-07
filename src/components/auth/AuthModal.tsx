import React, { useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Botanical-journal Sign In / Sign Up / Reset modal.
 *
 * Three modes — toggled via the footer links:
 *   - 'signin'   email + password
 *   - 'signup'   display name + email + password
 *   - 'reset'    email only, sends reset link
 *
 * Closes itself on successful sign-in / sign-up (with session).
 * Stays open with a confirmation message when email confirmation
 * is required or a reset email was sent.
 */

type Mode = 'signin' | 'signup' | 'reset';

interface Props {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}

const AuthModal: React.FC<Props> = ({ open, onClose, initialMode = 'signin' }) => {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reset transient state whenever the modal opens or mode changes.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setNotice(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [mode]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      if (mode === 'signin') {
        const res = await signIn(email.trim(), password);
        if (!res.ok) setError(res.error || 'Could not sign in.');
        else onClose();
      } else if (mode === 'signup') {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.');
          return;
        }
        const res = await signUp(email.trim(), password, displayName.trim() || undefined);
        if (!res.ok) setError(res.error || 'Could not sign up.');
        else if (res.needsConfirmation) {
          setNotice('Check your inbox to confirm your email, then sign in.');
        } else {
          onClose();
        }
      } else {
        const res = await resetPassword(email.trim());
        if (!res.ok) setError(res.error || 'Could not send reset email.');
        else setNotice('If an account exists for that address, a reset link is on its way.');
      }
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'signin' ? 'Sign in' :
    mode === 'signup' ? 'Create an account' :
    'Reset password';

  const eyebrow =
    mode === 'signin' ? 'WELCOME BACK' :
    mode === 'signup' ? 'JOIN THE CONTINUUM' :
    'PASSWORD RECOVERY';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#1c1a17]/55 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="relative w-full max-w-md rounded-sm bg-[#faf7f2] border border-quiet shadow-[0_40px_80px_-32px_rgba(28,26,23,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top rule + close */}
        <div className="flex items-center justify-between border-b border-quiet px-6 py-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold">{eyebrow}</div>
            <h2 id="auth-modal-title" className="font-display text-[1.6rem] text-ink leading-tight mt-0.5">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-charcoal/60 hover:text-ink transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {mode === 'signup' && (
            <Field
              label="Display name"
              type="text"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="name"
              placeholder="Your display name"

            />
          )}

          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
            placeholder="you@orchidcontinuum.org"
          />

          {mode !== 'reset' && (
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              placeholder="••••••••"
            />
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-sm border border-[#b94a48]/30 bg-[#fdf3f2] px-3 py-2 text-[13px] text-[#7a2a28] font-body">
              <AlertCircle className="h-4 w-4 mt-[2px] shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="flex items-start gap-2 rounded-sm border border-forest/25 bg-[#f0f5ef] px-3 py-2 text-[13px] text-forest font-body">
              <CheckCircle2 className="h-4 w-4 mt-[2px] shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-3 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>

          {/* Mode toggles */}
          <div className="pt-2 border-t border-quiet flex flex-col items-center gap-1.5 text-[13px] font-body text-charcoal/80">
            {mode === 'signin' && (
              <>
                <button type="button" onClick={() => setMode('reset')} className="hover:text-forest underline-offset-2 hover:underline">
                  Forgot your password?
                </button>
                <div>
                  New here?{' '}
                  <button type="button" onClick={() => setMode('signup')} className="text-forest hover:underline">
                    Create an account
                  </button>
                </div>
              </>
            )}
            {mode === 'signup' && (
              <div>
                Already have an account?{' '}
                <button type="button" onClick={() => setMode('signin')} className="text-forest hover:underline">
                  Sign in
                </button>
              </div>
            )}
            {mode === 'reset' && (
              <button type="button" onClick={() => setMode('signin')} className="text-forest hover:underline">
                Back to sign in
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}> = ({ label, type, value, onChange, autoComplete, placeholder, required }) => (
  <label className="block">
    <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-charcoal/70">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      placeholder={placeholder}
      required={required}
      className="mt-1.5 w-full rounded-sm border border-quiet bg-warm-white px-3 py-2.5 font-body text-[15px] text-ink placeholder:text-charcoal/35 focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest/40 transition-colors"
    />
  </label>
);

export default AuthModal;
