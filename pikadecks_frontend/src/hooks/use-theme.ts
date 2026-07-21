/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { colors } from '@/constants/theme';

export function useTheme() {
  // The `colors` constant doesn't have a light/dark mode map anymore, it's just a flat object.
  return colors;
}
