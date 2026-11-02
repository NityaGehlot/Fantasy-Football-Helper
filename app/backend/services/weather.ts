// app/backend/services/weather.ts
// Game-time weather for outdoor games (Open-Meteo's free forecast, no API key), and what it
// means for fantasy: strong wind and heavy rain or snow hurt passing and kicking and push
// teams to run more; domes and closed roofs mean no weather effect.

import fetch from "node-fetch";
import { createTtlCache, HOUR } from "../utils/ttlCache";
import type { GameState } from "./schedule";

const OPEN_METEO = process.env.OPEN_METEO_URL || "https://api.open-meteo.com/v1/forecast";
const cache = createTtlCache();

// Home stadium location. `roof` = dome or retractable roof (treated as indoors).
export const STADIUMS: Record<string, { lat: number; lon: number; roof: boolean; name: string }> = {
  ARI: { lat: 33.5276, lon: -112.2626, roof: true, name: "State Farm Stadium" },
  ATL: { lat: 33.7554, lon: -84.4008, roof: true, name: "Mercedes-Benz Stadium" },
  BAL: { lat: 39.278, lon: -76.6227, roof: false, name: "M&T Bank Stadium" },
  BUF: { lat: 42.7738, lon: -78.787, roof: false, name: "Highmark Stadium" },
  CAR: { lat: 35.2258, lon: -80.8528, roof: false, name: "Bank of America Stadium" },
  CHI: { lat: 41.8623, lon: -87.6167, roof: false, name: "Soldier Field" },
  CIN: { lat: 39.0954, lon: -84.516, roof: false, name: "Paycor Stadium" },
  CLE: { lat: 41.5061, lon: -81.6995, roof: false, name: "Huntington Bank Field" },
  DAL: { lat: 32.7473, lon: -97.0945, roof: true, name: "AT&T Stadium" },
  DEN: { lat: 39.7439, lon: -105.0201, roof: false, name: "Empower Field at Mile High" },
  DET: { lat: 42.34, lon: -83.0456, roof: true, name: "Ford Field" },
  GB: { lat: 44.5013, lon: -88.0622, roof: false, name: "Lambeau Field" },
  HOU: { lat: 29.6847, lon: -95.4107, roof: true, name: "NRG Stadium" },
  IND: { lat: 39.7601, lon: -86.1639, roof: true, name: "Lucas Oil Stadium" },
  JAX: { lat: 30.3239, lon: -81.6373, roof: false, name: "EverBank Stadium" },
  KC: { lat: 39.0489, lon: -94.4839, roof: false, name: "GEHA Field at Arrowhead Stadium" },
  LV: { lat: 36.0909, lon: -115.1833, roof: true, name: "Allegiant Stadium" },
  LAC: { lat: 33.9535, lon: -118.3392, roof: true, name: "SoFi Stadium" },
  LAR: { lat: 33.9535, lon: -118.3392, roof: true, name: "SoFi Stadium" },
  MIA: { lat: 25.958, lon: -80.2389, roof: false, name: "Hard Rock Stadium" },
  MIN: { lat: 44.9737, lon: -93.2577, roof: true, name: "U.S. Bank Stadium" },
  NE: { lat: 42.0909, lon: -71.2643, roof: false, name: "Gillette Stadium" },
  NO: { lat: 29.9511, lon: -90.0812, roof: true, name: "Caesars Superdome" },
  NYG: { lat: 40.8128, lon: -74.0742, roof: false, name: "MetLife Stadium" },
  NYJ: { lat: 40.8128, lon: -74.0742, roof: false, name: "MetLife Stadium" },
  PHI: { lat: 39.9008, lon: -75.1675, roof: false, name: "Lincoln Financial Field" },
  PIT: { lat: 40.4468, lon: -80.0158, roof: false, name: "Acrisure Stadium" },
  SF: { lat: 37.403, lon: -121.97, roof: false, name: "Levi's Stadium" },
  SEA: { lat: 47.5952, lon: -122.3316, roof: false, name: "Lumen Field" },
  TB: { lat: 27.9759, lon: -82.5033, roof: false, name: "Raymond James Stadium" },
  TEN: { lat: 36.1665, lon: -86.7713, roof: false, name: "Nissan Stadium" },
  WAS: { lat: 38.9077, lon: -76.8645, roof: false, name: "Northwest Stadium" },
};

export type GameWeather = {
  indoors: boolean;
  tempF: number | null;
  windMph: number | null;
  precipChance: number | null; // %
  precipInches: number | null;
  snowInches: number | null;
  summary: string;
};

export type WeatherEffect = { passing: number; rushing: number; kicking: number; notes: string[] };

/** What the weather does to each part of the game (-2 .. +1). */
export function weatherEffect(w: GameWeather | null): WeatherEffect {
  const effect: WeatherEffect = { passing: 0, rushing: 0, kicking: 0, notes: [] };
  if (!w || w.indoors) return effect;
  const wind = w.windMph ?? 0;
  if (wind >= 20) {
    effect.passing -= 2;
    effect.kicking -= 2;
    effect.rushing += 1;
    effect.notes.push(`wind around ${Math.round(wind)} mph makes deep passes and long field goals much harder, so teams run more`);
  } else if (wind >= 15) {
    effect.passing -= 1;
    effect.kicking -= 1;
    effect.notes.push(`wind around ${Math.round(wind)} mph hurts deep passing and long field goals a little`);
  }
  const snow = w.snowInches ?? 0;
  const rain = w.precipInches ?? 0;
  const likely = (w.precipChance ?? 0) >= 50;
  if (snow >= 0.5 && likely) {
    effect.passing -= 1;
    effect.kicking -= 1;
    effect.rushing += 0.5;
    effect.notes.push("snow is expected, which slows passing games and makes footing and kicking harder");
  } else if (rain >= 0.1 && likely) {
    effect.passing -= 1;
    effect.kicking -= 0.5;
    effect.notes.push("steady rain is expected, which leads to more drops, fumbles and running plays");
  }
  if (w.tempF !== null && w.tempF <= 20) {
    effect.passing -= 0.5;
    effect.kicking -= 0.5;
    effect.notes.push(`it will be about ${Math.round(w.tempF)}°F, and very cold weather lowers passing and kicking a little`);
  }
  effect.passing = Math.max(-2, effect.passing);
  effect.kicking = Math.max(-2, effect.kicking);
  return effect;
}

/** How weather changes one position's outlook (QB/WR/TE follow passing, RB rushing, K kicking). */
export function weatherForPosition(position: string, effect: WeatherEffect): number {
  const p = String(position).toUpperCase();
  if (p === "QB" || p === "WR" || p === "TE") return effect.passing;
  if (p === "RB") return effect.rushing;
  if (p === "K") return effect.kicking;
  if (p === "DEF") return -effect.passing / 2; // bad passing weather tends to help defenses
  return 0;
}

const nearestHour = (times: string[], iso: string) => {
  const target = Date.parse(iso);
  let best = 0;
  times.forEach((t, i) => {
    if (Math.abs(Date.parse(`${t}Z`) - target) < Math.abs(Date.parse(`${times[best]}Z`) - target)) best = i;
  });
  return best;
};

/** Weather at kickoff for a game, or null when it can't be known (neutral site, too far out). */
export async function getGameWeather(game: GameState | undefined | null): Promise<GameWeather | null> {
  if (!game?.kickoff) return null;
  const host = game.homeTeam || (game.homeAway === "home" ? game.team : game.opponent);
  const stadium = STADIUMS[host];
  const indoors = game.indoor ?? stadium?.roof ?? false;
  if (indoors) return { indoors: true, tempF: null, windMph: null, precipChance: null, precipInches: null, snowInches: null, summary: "Indoors (dome or roof), so weather won't matter." };
  if (!stadium || game.neutralSite) return null;

  const day = game.kickoff.slice(0, 10);
  const daysOut = (Date.parse(game.kickoff) - Date.now()) / 86_400_000;
  if (daysOut > 15 || daysOut < -1) return null;

  return cache.get(`wx:${host}:${game.kickoff}`, 3 * HOUR, async () => {
    const url =
      `${OPEN_METEO}?latitude=${stadium.lat}&longitude=${stadium.lon}` +
      `&hourly=temperature_2m,precipitation_probability,precipitation,snowfall,wind_speed_10m` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=UTC` +
      `&start_date=${day}&end_date=${day}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather unavailable (${res.status})`);
    const data = (await res.json()) as any;
    const h = data?.hourly;
    if (!Array.isArray(h?.time) || h.time.length === 0) return null;
    // Average the three hours of the game, starting at kickoff.
    const start = nearestHour(h.time, game.kickoff!);
    const span = [start, start + 1, start + 2].filter(i => i < h.time.length);
    const avg = (key: string) => {
      const vals = span.map(i => Number(h[key]?.[i])).filter(Number.isFinite);
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    };
    const sum = (key: string) => {
      const vals = span.map(i => Number(h[key]?.[i])).filter(Number.isFinite);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100 : null;
    };
    const w: GameWeather = {
      indoors: false,
      tempF: avg("temperature_2m"),
      windMph: avg("wind_speed_10m"),
      precipChance: avg("precipitation_probability"),
      precipInches: sum("precipitation"),
      snowInches: sum("snowfall"),
      summary: "",
    };
    w.summary = `${w.tempF ?? "?"}°F, wind ${w.windMph ?? "?"} mph, ${w.precipChance ?? 0}% chance of rain/snow at ${stadium.name}`;
    return w;
  }).catch(() => null);
}
