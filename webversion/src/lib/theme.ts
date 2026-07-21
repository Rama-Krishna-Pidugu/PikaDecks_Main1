export const TINTS = [
  "#EEF2FF", // Soft Indigo
  "#FFF7ED", // Soft Orange
  "#ECFEFF", // Soft Cyan
  "#FFF1F2", // Soft Rose
  "#F0FDF4", // Soft Green
  "#FEFCE8"  // Soft Yellow
];

export const EMOJIS = ["📚", "🧬", "🏛️", "⚛️", "🌍", "🎨", "🔬", "💡", "🩺", "💻", "⚖️", "🌌"];

export function getDeckTint(index: number): string {
  return TINTS[index % TINTS.length];
}

export function getDeckEmoji(index: number): string {
  return EMOJIS[index % EMOJIS.length];
}

export const colors = {
  background: "#FBF8F2",
  foreground: "#2A241D",
  card: "#FFFFFF",
  primary: "#5B4FE6",
  brand: "#F4B98A",
  border: "#EAE5DA",
  success: "#3DBC8C",
  warning: "#E5B14F",
  danger: "#E5544C",
};
