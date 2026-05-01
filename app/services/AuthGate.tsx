import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "./firebase";
import { AUTH_ENABLED } from "./config";
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

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
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
