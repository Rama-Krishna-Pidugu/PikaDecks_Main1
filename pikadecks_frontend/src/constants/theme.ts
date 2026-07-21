// Pika design tokens (converted from OKLCH to hex)
export const colors = {
  background: '#FBF8F2',
  foreground: '#2A241D',
  card: '#FFFFFF',
  cardForeground: '#2A241D',
  primary: '#5B4FE6',
  primaryForeground: '#FCFCFE',
  secondary: '#F4EFE6',
  secondaryForeground: '#4A4136',
  muted: '#F2EEE5',
  mutedForeground: '#867E70',
  accent: '#5B4FE6',
  accentForeground: '#FCFCFE',
  border: '#EAE5DA',
  input: '#EAE5DA',
  ring: '#5B4FE6',

  // Brand (warm peach)
  brand: '#F4B98A',
  brandForeground: '#4A2F1E',
  brandSoft: '#FAE4CD',

  // Status
  success: '#3DBC8C',
  warning: '#E5B14F',
  danger: '#E5544C',

  // Tints for deck emoji bg
  blue100: '#DBEAFE',
  orange100: '#FFEDD5',
  cyan100: '#CFFAFE',
  rose100: '#FFE4E6',

  orange500: '#F97316',
  orange400: '#FB923C',
};

export const shadows = {
  soft: {
    shadowColor: '#E58B4C',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  pop: {
    shadowColor: '#E58B4C',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  full: 9999,
};

export const fonts = {
  display: 'System', // would be Outfit
  sans: 'System', // would be Inter
};
