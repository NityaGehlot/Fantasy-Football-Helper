import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset
} from "firebase/auth";
import { auth } from "../services/firebase";
import {
  friendlyAuthError,
  isValidEmail,
  passwordChecks,
  passwordStrength,
  isAcceptablePassword,
} from "../services/authHelpers";

// signin / register: normal login. forgot: ask for email. sent: "check your inbox".
// reset: opened from the email link (?mode=resetPassword&oobCode=...). done: password changed.
type View_ = "signin" | "register" | "forgot" | "sent" | "reset" | "done";

const RESEND_COOLDOWN_SECONDS = 60;
const STRENGTH_LABELS = ["", "Weak", "Okay", "Strong"];
const STRENGTH_COLORS = ["#334155", "#f87171", "#fbbf24", "#34d399"];

function PasswordField({
  value,
  onChangeText,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  onSubmit?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.inputWrap}>
      <Ionicons name="lock-closed-outline" size={16} color="#64748b" style={styles.inputIcon} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        style={[styles.input, { paddingRight: 44 }]}
        onSubmitEditing={onSubmit}
      />
      <Pressable
        style={styles.eyeBtn}
        onPress={() => setVisible(v => !v)}
        accessibilityLabel={visible ? "Hide password" : "Show password"}
      >
        <Ionicons name={visible ? "eye-off" : "eye"} size={18} color="#93c5fd" />
      </Pressable>
    </View>
  );
}

function EmailField({ value, onChangeText, onSubmit }: { value: string; onChangeText: (v: string) => void; onSubmit?: () => void }) {
  return (
    <View style={styles.inputWrap}>
      <Ionicons name="mail-outline" size={16} color="#64748b" style={styles.inputIcon} />
      <TextInput
        placeholder="Email"
        placeholderTextColor="#64748b"
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={styles.input}
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

function PrimaryButton({ label, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={onPress} disabled={loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

export default function LoginScreen() {
  const [view, setView] = useState<View_>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const go = (next: View_) => {
    setError("");
    setView(next);
  };

  // Opened from the reset email link
  useEffect(() => {
    if (typeof window === "undefined" || !window.location) return;
    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get("oobCode");
    if (params.get("mode") !== "resetPassword" || !oobCode) return;

    setResetCode(oobCode);
    setView("reset");
    verifyPasswordResetCode(auth, oobCode)
      .then(emailFromCode => setEmail(emailFromCode || ""))
      .catch(err => {
        setView("forgot");
        setError(friendlyAuthError(err, "This reset link is invalid or expired. Request a new one below."));
      });
  }, []);

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const run = async (fn: () => Promise<void>, fallback?: string) => {
    setError("");
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(friendlyAuthError(err, fallback));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = () => {
    if (!isValidEmail(email)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    if (view === "register" && !isAcceptablePassword(password)) {
      return setError("Use at least 8 characters for your password.");
    }
    run(async () => {
      if (view === "register") await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
    });
  };

  const handleGoogleLogin = () => run(async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  });

  const sendResetEmail = () => {
    if (!isValidEmail(email)) return setError("Enter the email you signed up with.");
    run(async () => {
      await sendPasswordResetEmail(auth, email.trim());
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setView("sent");
    }, "Couldn't send the reset email. Please try again.");
  };

  const handleConfirmPasswordReset = () => {
    if (!isAcceptablePassword(newPassword)) return setError("Use at least 8 characters for your new password.");
    if (newPassword !== confirmNewPassword) return setError("The two passwords don't match.");
    run(async () => {
      await confirmPasswordReset(auth, resetCode, newPassword);
      setNewPassword("");
      setConfirmNewPassword("");
      setPassword("");
      if (typeof window !== "undefined" && window.history) {
        window.history.replaceState({}, "", window.location.pathname);
      }
      setView("done");
    }, "Couldn't update your password. Request a new reset link.");
  };

  const strength = passwordStrength(newPassword);

  const titles: Record<View_, [string, string]> = {
    signin: ["Welcome back", "Sign in to manage your fantasy team"],
    register: ["Create your account", "Track your Sleeper leagues and get AI advice"],
    forgot: ["Reset your password", "Enter your account email and we'll send you a reset link."],
    sent: ["Check your email", ""],
    reset: ["Choose a new password", email ? `For ${email}` : "Pick something you haven't used before."],
    done: ["Password updated", "You can now sign in with your new password."],
  };
  const [title, subtitle] = titles[view];

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.logo}>
          <Ionicons
            name={view === "sent" ? "mail-open-outline" : view === "done" ? "checkmark-circle-outline" : view === "signin" || view === "register" ? "american-football" : "key-outline"}
            size={26}
            color="#93c5fd"
          />
        </View>
        <Text style={styles.brand}>Fantasy Football Helper</Text>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#fca5a5" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {(view === "signin" || view === "register") && (
          <>
            <EmailField value={email} onChangeText={setEmail} />
            <PasswordField value={password} onChangeText={setPassword} placeholder="Password" onSubmit={handleEmailAuth} />

            {view === "signin" && (
              <Pressable style={styles.forgotWrap} onPress={() => go("forgot")}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </Pressable>
            )}

            <PrimaryButton label={view === "register" ? "Create account" : "Sign in"} onPress={handleEmailAuth} loading={loading} />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable style={styles.googleBtn} onPress={handleGoogleLogin} disabled={loading}>
              <Ionicons name="logo-google" size={16} color="#e5e7eb" />
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>

            <Pressable onPress={() => go(view === "register" ? "signin" : "register")}>
              <Text style={styles.switchText}>
                {view === "register" ? "Already have an account? " : "New here? "}
                <Text style={styles.linkText}>{view === "register" ? "Sign in" : "Create an account"}</Text>
              </Text>
            </Pressable>
          </>
        )}

        {view === "forgot" && (
          <>
            <EmailField value={email} onChangeText={setEmail} onSubmit={sendResetEmail} />
            <PrimaryButton label="Send reset link" onPress={sendResetEmail} loading={loading} />
            <Pressable onPress={() => go("signin")} style={styles.backRow}>
              <Ionicons name="arrow-back" size={14} color="#93c5fd" />
              <Text style={styles.linkText}>Back to sign in</Text>
            </Pressable>
          </>
        )}

        {view === "sent" && (
          <>
            <Text style={styles.body}>
              If an account exists for <Text style={styles.bold}>{email.trim()}</Text>, a password reset link is on its way.
            </Text>
            <View style={styles.tips}>
              <Text style={styles.tip}>• The email comes from Firebase (noreply@…firebaseapp.com).</Text>
              <Text style={styles.tip}>• Check your spam or promotions folder if you don't see it.</Text>
              <Text style={styles.tip}>• The link works once and expires after about an hour.</Text>
            </View>
            <PrimaryButton
              label={cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
              onPress={() => (cooldown > 0 ? undefined : sendResetEmail())}
              loading={loading}
            />
            <Pressable onPress={() => go("forgot")}>
              <Text style={styles.switchText}>Wrong email? <Text style={styles.linkText}>Change it</Text></Text>
            </Pressable>
            <Pressable onPress={() => go("signin")} style={styles.backRow}>
              <Ionicons name="arrow-back" size={14} color="#93c5fd" />
              <Text style={styles.linkText}>Back to sign in</Text>
            </Pressable>
          </>
        )}

        {view === "reset" && (
          <>
            <PasswordField value={newPassword} onChangeText={setNewPassword} placeholder="New password" />
            {newPassword.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <View style={styles.strengthTrack}>
                  {[1, 2, 3].map(i => (
                    <View key={i} style={[styles.strengthSeg, { backgroundColor: strength >= i ? STRENGTH_COLORS[strength] : "#1e293b" }]} />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: STRENGTH_COLORS[strength] }]}>{STRENGTH_LABELS[strength]}</Text>
                {passwordChecks(newPassword).map(c => (
                  <View key={c.label} style={styles.checkRow}>
                    <Ionicons name={c.ok ? "checkmark-circle" : "ellipse-outline"} size={14} color={c.ok ? "#34d399" : "#64748b"} />
                    <Text style={[styles.checkText, c.ok && { color: "#cbd5e1" }]}>{c.label}</Text>
                  </View>
                ))}
              </View>
            )}
            <PasswordField
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              placeholder="Confirm new password"
              onSubmit={handleConfirmPasswordReset}
            />
            {confirmNewPassword.length > 0 && confirmNewPassword !== newPassword && (
              <Text style={styles.mismatch}>Passwords don't match yet</Text>
            )}
            <PrimaryButton label="Update password" onPress={handleConfirmPasswordReset} loading={loading} />
            <Pressable onPress={() => go("signin")} style={styles.backRow}>
              <Ionicons name="arrow-back" size={14} color="#93c5fd" />
              <Text style={styles.linkText}>Back to sign in</Text>
            </Pressable>
          </>
        )}

        {view === "done" && <PrimaryButton label="Sign in" onPress={() => go("signin")} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    padding: 28,
    borderRadius: 16,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#1e293b",
    boxShadow: "0px 20px 40px rgba(0,0,0,0.4)",
  },
  logo: {
    alignSelf: "center",
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  brand: { color: "#64748b", textAlign: "center", fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  title: { fontSize: 24, fontWeight: "800", color: "#e5e7eb", textAlign: "center", marginTop: 6 },
  subtitle: { color: "#9ca3af", textAlign: "center", marginTop: 6, marginBottom: 4, lineHeight: 20 },
  body: { color: "#cbd5e1", textAlign: "center", lineHeight: 21, marginTop: 8 },
  bold: { fontWeight: "700", color: "#e5e7eb" },
  tips: { backgroundColor: "#0f172a", borderRadius: 10, padding: 12, marginVertical: 16, gap: 4 },
  tip: { color: "#94a3b8", fontSize: 13, lineHeight: 19 },
  inputWrap: { position: "relative", marginTop: 12, justifyContent: "center" },
  inputIcon: { position: "absolute", left: 12, zIndex: 1 },
  input: {
    backgroundColor: "#0b1222",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 10,
    paddingVertical: 12,
    paddingLeft: 36,
    paddingRight: 12,
    color: "white",
    fontSize: 15,
  },
  eyeBtn: { position: "absolute", right: 10, padding: 4 },
  forgotWrap: { alignSelf: "flex-end", marginTop: 8 },
  linkText: { color: "#93c5fd", fontWeight: "600", fontSize: 13 },
  primaryBtn: {
    backgroundColor: "#3b82f6",
    padding: 14,
    borderRadius: 10,
    marginTop: 16,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primaryText: { color: "white", fontWeight: "700", fontSize: 15 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginTop: 18, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#1e293b" },
  dividerText: { color: "#64748b", fontSize: 12 },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#475569",
    padding: 13,
    borderRadius: 10,
    marginTop: 14,
  },
  googleText: { color: "#e5e7eb", fontWeight: "600" },
  switchText: { color: "#9ca3af", textAlign: "center", marginTop: 18, fontSize: 13 },
  backRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(248,113,113,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
  },
  errorText: { color: "#fecaca", flex: 1, fontSize: 13, lineHeight: 18 },
  strengthTrack: { flexDirection: "row", gap: 4, marginTop: 8 },
  strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: "700", marginTop: 4, marginBottom: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  checkText: { color: "#64748b", fontSize: 12 },
  mismatch: { color: "#fbbf24", fontSize: 12, marginTop: 6 },
});
