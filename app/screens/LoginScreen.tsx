import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
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

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetEmailHint, setResetEmailHint] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const oobCode = params.get("oobCode");

    if (mode === "resetPassword" && oobCode) {
      setIsResetMode(true);
      setResetCode(oobCode);
      setIsRegistering(false);
      setError("");
      setMessage("");

      verifyPasswordResetCode(auth, oobCode)
        .then((emailFromCode) => {
          setResetEmailHint(emailFromCode || "");
        })
        .catch(() => {
          setError("This reset link is invalid or expired. Please request a new one.");
          setIsResetMode(false);
        });
    }
  }, []);

  const handleEmailAuth = async () => {
    setError("");
    setMessage("");
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setMessage("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setMessage("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email first, then tap Forgot Password.");
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setMessage("Password reset email sent. Check your inbox and spam/junk folder.");
    } catch (err: any) {
      setError(err.message || "Could not send reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    setError("");
    setMessage("");

    if (!resetCode) {
      setError("Reset code is missing. Please open the password reset link again.");
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }

    setResetLoading(true);
    try {
      await confirmPasswordReset(auth, resetCode, newPassword);
      setMessage("Password reset successful. You can now log in with your new password.");
      setIsResetMode(false);
      setNewPassword("");
      setConfirmNewPassword("");

      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (err: any) {
      setError(err.message || "Could not reset password. Please request a new reset link.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.title}>Fantasy Football Helper</Text>
        <Text style={styles.subtitle}>
          {isResetMode
            ? "Create a new password"
            : isRegistering
            ? "Create an account"
            : "Sign in to continue"}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}

        {isResetMode && resetEmailHint ? (
          <Text style={styles.resetHint}>Resetting password for {resetEmailHint}</Text>
        ) : null}

        {isResetMode ? (
          <>
            <View style={styles.passwordWrap}>
              <TextInput
                placeholder="New Password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
                style={styles.passwordInput}
              />
              <Pressable
                style={styles.passwordToggle}
                onPress={() => setShowNewPassword((prev) => !prev)}
              >
                <Ionicons
                  name={showNewPassword ? "eye-off" : "eye"}
                  size={18}
                  color="#93c5fd"
                />
              </Pressable>
            </View>

            <View style={styles.passwordWrap}>
              <TextInput
                placeholder="Confirm New Password"
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                secureTextEntry={!showConfirmPassword}
                style={styles.passwordInput}
              />
              <Pressable
                style={styles.passwordToggle}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off" : "eye"}
                  size={18}
                  color="#93c5fd"
                />
              </Pressable>
            </View>

            <Pressable style={styles.primaryBtn} onPress={handleConfirmPasswordReset}>
              <Text style={styles.primaryText}>
                {resetLoading ? "Updating Password..." : "Update Password"}
              </Text>
            </Pressable>

            <Pressable onPress={() => setIsResetMode(false)}>
              <Text style={styles.switchText}>Back to Login</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              style={styles.input}
            />

            <View style={styles.passwordWrap}>
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
              />
              <Pressable
                style={styles.passwordToggle}
                onPress={() => setShowPassword((prev) => !prev)}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={18}
                  color="#93c5fd"
                />
              </Pressable>
            </View>

            {!isRegistering ? (
              <Pressable style={styles.forgotWrap} onPress={handleResetPassword}>
                <Text style={styles.forgotText}>
                  {resetLoading ? "Sending reset email..." : "Forgot password?"}
                </Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.primaryBtn} onPress={handleEmailAuth}>
              <Text style={styles.primaryText}>
                {isRegistering ? "Create Account" : "Login"}
              </Text>
            </Pressable>

            <Pressable style={styles.googleBtn} onPress={handleGoogleLogin}>
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>

            <Pressable onPress={() => setIsRegistering(!isRegistering)}>
              <Text style={styles.switchText}>
                {isRegistering
                  ? "Already have an account? Login"
                  : "New here? Create an account"}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center"
  },
  card: {
    width: 380,
    padding: 30,
    borderRadius: 12,
    backgroundColor: "#020617",
    boxShadow: "0px 20px 40px rgba(0,0,0,0.4)"
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#e5e7eb",
    textAlign: "center",
    marginBottom: 6
  },
  subtitle: {
    color: "#9ca3af",
    textAlign: "center",
    marginBottom: 20
  },
  input: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    padding: 12,
    color: "white",
    marginBottom: 12
  },
  passwordWrap: {
    position: "relative",
    marginBottom: 12,
  },
  passwordInput: {
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    padding: 12,
    paddingRight: 64,
    color: "white",
  },
  passwordToggle: {
    position: "absolute",
    right: 12,
    top: 12,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  primaryBtn: {
    backgroundColor: "#3b82f6",
    padding: 14,
    borderRadius: 8,
    marginTop: 6
  },
  primaryText: {
    color: "white",
    textAlign: "center",
    fontWeight: "600"
  },
  googleBtn: {
    borderWidth: 1,
    borderColor: "#475569",
    padding: 14,
    borderRadius: 8,
    marginTop: 12
  },
  googleText: {
    color: "#e5e7eb",
    textAlign: "center"
  },
  switchText: {
    color: "#93c5fd",
    textAlign: "center",
    marginTop: 16
  },
  forgotWrap: {
    alignSelf: "center",
    marginTop: -4,
    marginBottom: 6,
  },
  forgotText: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  error: {
    color: "#f87171",
    marginBottom: 10,
    textAlign: "center"
  },
  success: {
    color: "#34d399",
    marginBottom: 10,
    textAlign: "center"
  },
  resetHint: {
    color: "#cbd5e1",
    marginBottom: 12,
    textAlign: "center",
    fontSize: 13,
  }
});
