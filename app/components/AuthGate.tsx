import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../services/firebase";
import { createUserIfNotExists } from "../services/userService";
import { AUTH_ENABLED } from "../services/config";
import { View, ActivityIndicator } from "react-native";
import LoginScreen from "../screens/LoginScreen";


export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!AUTH_ENABLED) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        try {
          await createUserIfNotExists(firebaseUser.uid, firebaseUser.email ?? null);
        } catch (err) {
          console.error("Failed to ensure user document:", err);
        }
      }
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // 🚪 Auth disabled → skip login
  if (!AUTH_ENABLED) {
    return <>{children}</>;
  }

  // 🔐 Auth enabled but not logged in → block app
  if (!user) {
    return <LoginScreen />;
    }


  return <>{children}</>;
}
