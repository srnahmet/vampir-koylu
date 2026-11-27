import { activeRoles, roles, type Role } from "../domain";

export type DemoSeat = { name: string; role: Role };
export const demoNames = ["Deniz", "Ece", "Arda", "Selin", "Mert", "Duru", "Can", "İpek", "Bora", "Ada", "Emre", "Sema", "Efe", "Elif", "Ozan", "Nehir"];
export const demoCast: Role[] = ["vampire", "vampire", "doctor", "wizard", "shaman", "hunter", "mayor", "gunslinger", "jester", "fanatic", "vampire_cub", "villager"];

export function validateDemo(seats: DemoSeat[]): string | null {
  if (seats.length < 4 || seats.length > 16) return "Demo için 4–16 oyuncu seç.";
  if (seats.some(p => !p.name.trim() || p.name.trim().length > 20)) return "İsimler 1–20 karakter olmalı.";
  if (seats.some(p => !activeRoles.includes(p.role))) return "Oynanabilir bir rol seç.";
  const adults = seats.filter(p => ["vampire", "alpha_vampire"].includes(p.role)).length;
  if (adults < 1 || adults > 2) return "Bir veya iki yetişkin vampir seç (Alfa dahil).";
  if (adults === 2 && seats.length < 6) return "İki vampir için en az 6 oyuncu gerekli.";
  if (seats.every(p => ["vampire", "alpha_vampire", "vampire_cub"].includes(p.role))) return "Köyde vampir takımı dışında oyuncular da olmalı.";
  for (const role of activeRoles.filter(r => !["vampire", "villager"].includes(r))) {
    if (seats.filter(p => p.role === role).length > 1) return `${roles[role].name} rolünden en fazla bir oyuncu seç.`;
    const minimum = ["wizard", "alpha_vampire"].includes(role) ? 8 : role === "fanatic" ? 6 : 4;
    if (seats.some(p => p.role === role) && seats.length < minimum) return `${roles[role].name} için en az ${minimum} oyuncu gerekli.`;
  }
  return null;
}
