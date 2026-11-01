// app/services/authHelpers.ts
// Plain-English auth errors and password checks for the login / reset screens.

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': "That email address doesn't look right. Check for typos.",
  'auth/missing-email': 'Enter your email address.',
  'auth/user-not-found': 'No account uses that email. Check the spelling or create an account.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': "Can't reach the server. Check your internet connection.",
  'auth/email-already-in-use': 'An account already exists for that email. Try signing in instead.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/expired-action-code': 'This reset link has expired. Request a new one.',
  'auth/invalid-action-code': 'This reset link is invalid or was already used. Request a new one.',
  'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
  'auth/cancelled-popup-request': 'Google sign-in was closed before it finished.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in popup. Allow popups and try again.',
};

export function friendlyAuthError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = String((err as any)?.code ?? '');
  if (MESSAGES[code]) return MESSAGES[code];
  // Firebase messages look like "Firebase: Error (auth/xyz)." — pull the code out if present.
  const match = String((err as any)?.message ?? '').match(/\((auth\/[a-z-]+)\)/);
  return (match && MESSAGES[match[1]]) || fallback;
}

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export type PasswordCheck = { label: string; ok: boolean };

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Upper and lower case letters', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'At least one number', ok: /\d/.test(password) },
  ];
}

// 0 = empty, 1 = weak, 2 = okay, 3 = strong
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  const passed = passwordChecks(password).filter(c => c.ok).length + (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
  if (password.length < 8 || passed <= 1) return 1;
  return passed >= 3 ? 3 : 2;
}

// A new password is accepted once it's 8+ characters; the other checks are guidance.
export const isAcceptablePassword = (password: string) => password.length >= 8;
