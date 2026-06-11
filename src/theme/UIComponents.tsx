/**
 * src/theme/UIComponents.tsx
 *
 * Reusable iOS-native styled components used across all screens.
 * These follow Apple's Human Interface Guidelines for visual consistency.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  ActivityIndicator,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useAppTheme } from './ThemeContext';
import { Typography, Spacing, Radius } from './theme';
import type { SymbolName } from './icons';

// ─── Icon Component ─────────────────────────────────────────────────────────────

interface IconProps {
  name: SymbolName;
  size?: number;
  color?: string;
  style?: ViewStyle;
}

/**
 * Wrapper around SymbolView that accepts our semantic icon names.
 */
export function Icon({ name, size = 20, color, style }: IconProps) {
  const { colors } = useAppTheme();
  return (
    <SymbolView
      name={name}
      tintColor={color ?? colors.textSecondary}
      size={size}
      style={style}
    />
  );
}

// ─── Grouped Section ────────────────────────────────────────────────────────────

interface GroupedSectionProps {
  header?: string;
  footer?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * iOS-style grouped inset list container with rounded corners,
 * proper inset, and optional header/footer text.
 */
export function GroupedSection({ header, footer, children, style }: GroupedSectionProps) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.sectionWrapper, style]}>
      {header && (
        <Text
          style={[
            styles.sectionHeader,
            { color: colors.textSecondary },
          ]}
        >
          {header.toUpperCase()}
        </Text>
      )}
      <View
        style={[
          styles.sectionContainer,
          {
            backgroundColor: colors.backgroundGroupedSecondary,
            borderColor: colors.cardBorder,
          },
        ]}
      >
        {children}
      </View>
      {footer && (
        <Text
          style={[
            styles.sectionFooter,
            { color: colors.textSecondary },
          ]}
        >
          {footer}
        </Text>
      )}
    </View>
  );
}

// ─── Grouped Row ────────────────────────────────────────────────────────────────

interface GroupedRowProps {
  label: string;
  /** Optional value text on the right side */
  value?: string;
  /** Optional left icon */
  icon?: SymbolName;
  /** Icon tint color override */
  iconColor?: string;
  /** Icon background color (iOS Settings style colored circle) */
  iconBackground?: string;
  /** Show chevron disclosure indicator */
  showChevron?: boolean;
  /** Custom right-side accessory */
  accessory?: React.ReactNode;
  /** Press handler */
  onPress?: () => void;
  /** Whether to show separator below */
  showSeparator?: boolean;
  /** Destructive styling (red text) */
  destructive?: boolean;
  /** Custom text color */
  textColor?: string;
}

export function GroupedRow({
  label,
  value,
  icon,
  iconColor,
  iconBackground,
  showChevron,
  accessory,
  onPress,
  showSeparator = true,
  destructive,
  textColor,
}: GroupedRowProps) {
  const { colors } = useAppTheme();

  const labelColor = destructive
    ? colors.destructive
    : textColor ?? colors.textPrimary;

  const content = (
    <View
      style={[
        styles.rowContainer,
        showSeparator && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.separator,
        },
      ]}
    >
      {icon && (
        <View
          style={[
            styles.rowIconContainer,
            iconBackground
              ? { backgroundColor: iconBackground }
              : { backgroundColor: 'transparent' },
          ]}
        >
          <SymbolView
            name={icon}
            tintColor={iconBackground ? '#FFFFFF' : (iconColor ?? colors.tint)}
            size={iconBackground ? 16 : 20}
          />
        </View>
      )}
      <View style={styles.rowContent}>
        <Text
          style={[
            Typography.body,
            { color: labelColor, flex: 1 },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {value && (
          <Text
            style={[
              Typography.body,
              { color: colors.textSecondary, marginLeft: Spacing.sm },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        )}
        {accessory}
        {showChevron && (
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            tintColor={colors.textQuaternary}
            size={14}
            style={{ marginLeft: Spacing.sm }}
          />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.5} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// ─── Segmented Control ──────────────────────────────────────────────────────────

interface SegmentedControlProps {
  segments: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  style?: ViewStyle;
}

/**
 * iOS-native style segmented control.
 */
export function SegmentedControl({
  segments,
  selectedIndex,
  onSelect,
  style,
}: SegmentedControlProps) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.segmentedContainer,
        { backgroundColor: colors.fill },
        style,
      ]}
    >
      {segments.map((label, index) => {
        const isSelected = index === selectedIndex;
        return (
          <TouchableOpacity
            key={label}
            activeOpacity={0.6}
            onPress={() => onSelect(index)}
            style={[
              styles.segmentedItem,
              isSelected && [
                styles.segmentedItemActive,
                {
                  backgroundColor: colors.backgroundElevated,
                  shadowColor: '#000',
                },
              ],
            ]}
          >
            <Text
              style={[
                Typography.subheadline,
                {
                  fontWeight: isSelected ? '600' : '400',
                  color: isSelected
                    ? colors.textPrimary
                    : colors.textSecondary,
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Buttons ────────────────────────────────────────────────────────────────────

interface ButtonProps {
  title: string;
  onPress: () => void;
  icon?: SymbolName;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/** Full-width rounded primary action button */
export function PrimaryButton({ title, onPress, icon, disabled, loading, style }: ButtonProps) {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.primaryButton,
        { backgroundColor: colors.buttonPrimary },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.buttonPrimaryText} />
      ) : (
        <View style={styles.buttonContent}>
          {icon && (
            <SymbolView
              name={icon}
              tintColor={colors.buttonPrimaryText}
              size={18}
              style={{ marginRight: Spacing.sm }}
            />
          )}
          <Text
            style={[
              Typography.headline,
              { color: colors.buttonPrimaryText },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/** Secondary outlined/tinted button */
export function SecondaryButton({ title, onPress, icon, disabled, loading, style }: ButtonProps) {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.secondaryButton,
        { backgroundColor: colors.buttonSecondary },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.buttonSecondaryText} />
      ) : (
        <View style={styles.buttonContent}>
          {icon && (
            <SymbolView
              name={icon}
              tintColor={colors.buttonSecondaryText}
              size={18}
              style={{ marginRight: Spacing.sm }}
            />
          )}
          <Text
            style={[
              Typography.headline,
              { color: colors.buttonSecondaryText },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/** Destructive action button */
export function DestructiveButton({ title, onPress, icon, disabled, loading, style }: ButtonProps) {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.6}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.secondaryButton,
        { backgroundColor: 'transparent' },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.destructive} />
      ) : (
        <View style={styles.buttonContent}>
          {icon && (
            <SymbolView
              name={icon}
              tintColor={colors.destructive}
              size={18}
              style={{ marginRight: Spacing.sm }}
            />
          )}
          <Text
            style={[
              Typography.headline,
              { color: colors.destructive },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────────────

interface BadgeProps {
  label: string;
  color: string;
  backgroundColor: string;
  style?: ViewStyle;
}

export function Badge({ label, color, backgroundColor, style }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor }, style]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Section
  sectionWrapper: {
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },
  sectionHeader: {
    ...Typography.footnote,
    marginLeft: Spacing.base,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: -0.08,
  },
  sectionContainer: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionFooter: {
    ...Typography.footnote,
    marginLeft: Spacing.base,
    marginTop: Spacing.sm,
  },

  // Row
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingLeft: Spacing.base,
  },
  rowIconContainer: {
    width: 29,
    height: 29,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.base,
    paddingVertical: Spacing.md,
  },

  // Segmented Control
  segmentedContainer: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    padding: 2,
  },
  segmentedItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm + 1,
  },
  segmentedItemActive: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },

  // Buttons
  primaryButton: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Badge
  badge: {
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    ...Typography.caption2,
    fontWeight: '600',
  },
});
