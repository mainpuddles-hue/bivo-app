/**
 * SettingsUI component tests.
 *
 * Tests SettingsRow, SettingsGroup, and SettingsSectionLabel
 * rendering, interaction, and toggle switch behavior.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { View, Text } from 'react-native'
import { SettingsRow, SettingsGroup, SettingsSectionLabel } from '@/components/SettingsUI'
import type { ThemeColors } from '@/lib/theme'

const mockColors: ThemeColors = {
  primary: '#1A1D1F',
  accent: '#ABD9DB',
  accentBg: '#E8F4F5',
  secondary: '#FF9500',
  background: '#F5F6F7',
  foreground: '#1A1D1F',
  card: '#FFFFFF',
  cardElevated: '#FAFAFB',
  border: '#E8EAEC',
  muted: '#EEF0F2',
  mutedForeground: '#535A60',
  tertiaryForeground: '#848B93',
  destructive: '#C44536',
  pro: '#F59E0B',
  success: '#2D7A4F',
  info: '#3B82F6',
  purple: '#7C5CBF',
  purpleMuted: '#F4F0FF',
  primaryForeground: '#FFFFFF',
  surfaceTinted: 'rgba(26,29,31,0.04)',
  warmTint: '#F0EEE9',
  onInkMuted: '#B8BCC0',
  borderStrong: '#C8CBCE',
  danger: '#C44536',
  successBg: '#E6EFEA',
  disabledForeground: '#D4D4D1',
  trustTier1: '#9CA3AF',
  trustTier2: '#3B82F6',
  trustTier3: '#2D7A4F',
}

const MockIcon = () => <View testID="settings-icon"><Text>icon</Text></View>

describe('SettingsRow', () => {
  it('renders label text', () => {
    render(<SettingsRow label="Language" colors={mockColors} />)
    expect(screen.getByText('Language')).toBeTruthy()
  })

  it('renders icon when provided', () => {
    render(<SettingsRow label="Language" icon={<MockIcon />} colors={mockColors} />)
    expect(screen.getByTestId('settings-icon')).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(<SettingsRow label="Language" onPress={onPress} colors={mockColors} />)
    fireEvent.press(screen.getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders as non-pressable when no onPress', () => {
    render(<SettingsRow label="Info" colors={mockColors} />)
    // Without onPress and without switch, it should be a plain View, not a button
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders toggle switch when switchValue is provided', () => {
    const onSwitchChange = jest.fn()
    render(
      <SettingsRow
        label="Notifications"
        switchValue={true}
        onSwitchChange={onSwitchChange}
        colors={mockColors}
      />,
    )
    // Switch component is rendered with the value
    const switchEl = screen.getByRole('switch')
    expect(switchEl).toBeTruthy()
  })

  it('switch calls onSwitchChange when toggled', () => {
    const onSwitchChange = jest.fn()
    render(
      <SettingsRow
        label="Notifications"
        switchValue={false}
        onSwitchChange={onSwitchChange}
        colors={mockColors}
      />,
    )
    const switchEl = screen.getByRole('switch')
    fireEvent(switchEl, 'valueChange', true)
    expect(onSwitchChange).toHaveBeenCalledWith(true)
  })

  it('renders meta text when provided', () => {
    render(
      <SettingsRow label="Account" meta="Premium until 2025" colors={mockColors} />,
    )
    expect(screen.getByText('Premium until 2025')).toBeTruthy()
  })

  it('renders value text when provided', () => {
    render(
      <SettingsRow label="Language" value="Suomi" colors={mockColors} />,
    )
    expect(screen.getByText('Suomi')).toBeTruthy()
  })

  it('applies danger color when danger prop is true', () => {
    render(
      <SettingsRow label="Delete Account" danger colors={mockColors} />,
    )
    // The label should be rendered — we just verify it doesn't crash
    expect(screen.getByText('Delete Account')).toBeTruthy()
  })

  it('uses custom accessibilityLabel when provided', () => {
    const onPress = jest.fn()
    render(
      <SettingsRow
        label="Language"
        accessibilityLabel="Change language setting"
        onPress={onPress}
        colors={mockColors}
      />,
    )
    expect(screen.getByLabelText('Change language setting')).toBeTruthy()
  })
})

describe('SettingsGroup', () => {
  it('renders children', () => {
    render(
      <SettingsGroup colors={mockColors}>
        <SettingsRow label="Option A" colors={mockColors} />
        <SettingsRow label="Option B" colors={mockColors} />
      </SettingsGroup>,
    )
    expect(screen.getByText('Option A')).toBeTruthy()
    expect(screen.getByText('Option B')).toBeTruthy()
  })

  it('renders label when provided', () => {
    render(
      <SettingsGroup label="General" colors={mockColors}>
        <SettingsRow label="Option A" colors={mockColors} />
      </SettingsGroup>,
    )
    expect(screen.getByText('General')).toBeTruthy()
  })

  it('does not render label when not provided', () => {
    render(
      <SettingsGroup colors={mockColors}>
        <SettingsRow label="Option A" colors={mockColors} />
      </SettingsGroup>,
    )
    // Only the option text should be present, no group label
    expect(screen.queryByText('General')).toBeNull()
  })

  it('filters out falsy children', () => {
    render(
      <SettingsGroup colors={mockColors}>
        <SettingsRow label="Visible" colors={mockColors} />
        {null}
        {false}
      </SettingsGroup>,
    )
    expect(screen.getByText('Visible')).toBeTruthy()
  })
})

describe('SettingsSectionLabel', () => {
  it('renders text', () => {
    render(<SettingsSectionLabel colors={mockColors}>Account</SettingsSectionLabel>)
    expect(screen.getByText('Account')).toBeTruthy()
  })
})
