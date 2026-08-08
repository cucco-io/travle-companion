/**
 * src/theme/theme.ts
 *
 * Centralized design tokens inspired by Apple Human Interface Guidelines.
 * All colors use iOS system semantics so the app feels native on both themes.
 */

// ─── Color Tokens ───────────────────────────────────────────────────────────────

export interface ThemeColors {
  // Backgrounds
  background: string;
  backgroundElevated: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  backgroundGrouped: string;
  backgroundGroupedSecondary: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textQuaternary: string;

  // Tints & Accents
  tint: string;
  tintSecondary: string;
  destructive: string;
  success: string;
  warning: string;

  // UI Elements
  separator: string;
  separatorOpaque: string;
  fill: string;
  fillSecondary: string;
  fillTertiary: string;
  cardBackground: string;
  cardBorder: string;

  // Tab Bar
  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;

  // Interactive
  buttonPrimary: string;
  buttonPrimaryText: string;
  buttonSecondary: string;
  buttonSecondaryText: string;
}

export const LightColors: ThemeColors = {
  // Backgrounds
  background: '#F2F2F7',
  backgroundElevated: '#FFFFFF',
  backgroundSecondary: '#F2F2F7',
  backgroundTertiary: '#FFFFFF',
  backgroundGrouped: '#F2F2F7',
  backgroundGroupedSecondary: '#FFFFFF',

  // Text
  textPrimary: '#000000',
  textSecondary: 'rgba(60,60,67,0.6)',
  textTertiary: 'rgba(60,60,67,0.3)',
  textQuaternary: 'rgba(60,60,67,0.18)',

  // Tints
  tint: '#007AFF',
  tintSecondary: '#5856D6',
  destructive: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',

  // UI Elements
  separator: 'rgba(60,60,67,0.29)',
  separatorOpaque: '#C6C6C8',
  fill: 'rgba(120,120,128,0.2)',
  fillSecondary: 'rgba(120,120,128,0.16)',
  fillTertiary: 'rgba(120,120,128,0.12)',
  cardBackground: '#FFFFFF',
  cardBorder: 'rgba(0,0,0,0.04)',

  // Tab Bar
  tabBarBackground: 'rgba(249,249,249,0.94)',
  tabBarBorder: 'rgba(0,0,0,0.3)',
  tabBarActive: '#007AFF',
  tabBarInactive: '#999999',

  // Interactive
  buttonPrimary: '#007AFF',
  buttonPrimaryText: '#FFFFFF',
  buttonSecondary: 'rgba(120,120,128,0.12)',
  buttonSecondaryText: '#007AFF',
};

export const DarkColors: ThemeColors = {
  // Backgrounds
  background: '#000000',
  backgroundElevated: '#1C1C1E',
  backgroundSecondary: '#1C1C1E',
  backgroundTertiary: '#2C2C2E',
  backgroundGrouped: '#000000',
  backgroundGroupedSecondary: '#1C1C1E',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(235,235,245,0.6)',
  textTertiary: 'rgba(235,235,245,0.3)',
  textQuaternary: 'rgba(235,235,245,0.18)',

  // Tints
  tint: '#0A84FF',
  tintSecondary: '#5E5CE6',
  destructive: '#FF453A',
  success: '#30D158',
  warning: '#FF9F0A',

  // UI Elements
  separator: 'rgba(84,84,88,0.65)',
  separatorOpaque: '#38383A',
  fill: 'rgba(120,120,128,0.36)',
  fillSecondary: 'rgba(120,120,128,0.32)',
  fillTertiary: 'rgba(120,120,128,0.24)',
  cardBackground: '#1C1C1E',
  cardBorder: 'rgba(255,255,255,0.08)',

  // Tab Bar
  tabBarBackground: 'rgba(30,30,30,0.94)',
  tabBarBorder: 'rgba(255,255,255,0.15)',
  tabBarActive: '#0A84FF',
  tabBarInactive: '#8E8E93',

  // Interactive
  buttonPrimary: '#0A84FF',
  buttonPrimaryText: '#FFFFFF',
  buttonSecondary: 'rgba(120,120,128,0.32)',
  buttonSecondaryText: '#0A84FF',
};

// ─── Typography Scale (Apple HIG) ───────────────────────────────────────────────

export const Typography = {
  largeTitle: {
    fontSize: 34,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    lineHeight: 41,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: 0.36,
    lineHeight: 34,
  },
  title2: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: 0.35,
    lineHeight: 28,
  },
  title3: {
    fontSize: 20,
    fontWeight: '600' as const,
    letterSpacing: 0.38,
    lineHeight: 25,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: -0.41,
    lineHeight: 22,
  },
  body: {
    fontSize: 17,
    fontWeight: '400' as const,
    letterSpacing: -0.41,
    lineHeight: 22,
  },
  callout: {
    fontSize: 16,
    fontWeight: '400' as const,
    letterSpacing: -0.32,
    lineHeight: 21,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400' as const,
    letterSpacing: -0.24,
    lineHeight: 20,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400' as const,
    letterSpacing: -0.08,
    lineHeight: 18,
  },
  caption1: {
    fontSize: 12,
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 16,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400' as const,
    letterSpacing: 0.07,
    lineHeight: 13,
  },
} as const;

// ─── Spacing Scale ──────────────────────────────────────────────────────────────

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────────

export const Radius = {
  sm: 6,
  md: 10,
  lg: 13,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;
