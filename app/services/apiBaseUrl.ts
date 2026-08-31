const DEFAULT_API_URL = "http://127.0.0.1:4000";

export function getApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_API_URL ||
    process.env.VITE_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
}
