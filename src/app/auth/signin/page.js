'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function SignInPage() {
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setLoading(true);
    await signIn('google', { callbackUrl: '/' });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'radial-gradient(ellipse 80% 60% at 50% -10%,#153828 0%,#081a13 60%)',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '20px',
        padding: '3rem 2.5rem',
        maxWidth: '420px',
        width: '100%',
        textAlign: 'center',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Logo */}
        <img src="/logo.png" alt="Logo" style={{ height: '70px', width: 'auto', objectFit: 'contain', margin: '0 auto 1.25rem', filter: 'invert(1)', mixBlendMode: 'screen', display: 'block' }} />
        <div style={{
          fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-.02em',
          background: 'linear-gradient(135deg,#e2c9a3,#c5a880)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: '.35rem',
        }}>Bootaleyzee Cup</div>
        <p style={{ color: '#9ab8ac', fontSize: '.9rem', marginBottom: '2.5rem', lineHeight: 1.6 }}>
          Tournament Manager &mdash; Double Elimination, Best of 3
        </p>

        {/* Google sign-in button */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: '100%',
            padding: '.9rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '.75rem',
            background: loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '10px',
            color: '#f0f4ff',
            fontSize: '1rem',
            fontWeight: 700,
            fontFamily: 'Inter, system-ui, sans-serif',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all .18s',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(249,115,22,0.1)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
        >
          {loading ? (
            <span style={{ opacity: .6 }}>Signing in…</span>
          ) : (
            <>
              {/* Google G icon */}
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <p style={{ marginTop: '2rem', fontSize: '.78rem', color: '#475569', lineHeight: 1.5 }}>
          Sign in to manage your volleyball tournament.<br />
          Your data syncs across all devices.
        </p>
      </div>
    </div>
  );
}
