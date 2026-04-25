/**
 * EmptyState component tests.
 *
 * Tests rendering of title, description, icon, action button,
 * and the filled variant styling.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { View, Text } from 'react-native'
import { EmptyState } from '@/components/EmptyState'

const MockIcon = () => <View testID="empty-state-icon"><Text>icon</Text></View>

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState icon={<MockIcon />} title="No posts found" />)
    expect(screen.getByText('No posts found')).toBeTruthy()
  })

  it('renders description when provided', () => {
    render(
      <EmptyState
        icon={<MockIcon />}
        title="No posts"
        description="Try adjusting your filters"
      />,
    )
    expect(screen.getByText('Try adjusting your filters')).toBeTruthy()
  })

  it('does not render description when not provided', () => {
    render(<EmptyState icon={<MockIcon />} title="No posts" />)
    expect(screen.queryByText('Try adjusting your filters')).toBeNull()
  })

  it('renders icon', () => {
    render(<EmptyState icon={<MockIcon />} title="Empty" />)
    expect(screen.getByTestId('empty-state-icon')).toBeTruthy()
  })

  it('shows action button when actionLabel is provided', () => {
    const onAction = jest.fn()
    render(
      <EmptyState
        icon={<MockIcon />}
        title="No posts"
        actionLabel="Create Post"
        onAction={onAction}
      />,
    )
    expect(screen.getByText('Create Post')).toBeTruthy()
  })

  it('calls onAction when action button is pressed', () => {
    const onAction = jest.fn()
    render(
      <EmptyState
        icon={<MockIcon />}
        title="No posts"
        actionLabel="Create Post"
        onAction={onAction}
      />,
    )
    fireEvent.press(screen.getByRole('button'))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('hides action button when no actionLabel', () => {
    render(<EmptyState icon={<MockIcon />} title="No posts" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('hides action button when actionLabel provided but no onAction', () => {
    // The component requires both actionLabel AND onAction to render button
    render(
      <EmptyState
        icon={<MockIcon />}
        title="No posts"
        actionLabel="Create"
      />,
    )
    expect(screen.queryByText('Create')).toBeNull()
  })

  it('renders with filled variant styling', () => {
    const onAction = jest.fn()
    render(
      <EmptyState
        icon={<MockIcon />}
        title="Empty"
        actionLabel="Add Item"
        onAction={onAction}
        actionVariant="filled"
      />,
    )
    // Verify the button renders — the filled variant applies background color
    expect(screen.getByText('Add Item')).toBeTruthy()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('renders actionIcon inside the button when provided', () => {
    const ActionIcon = () => <View testID="action-icon" />
    const onAction = jest.fn()
    render(
      <EmptyState
        icon={<MockIcon />}
        title="Empty"
        actionLabel="Create"
        onAction={onAction}
        actionIcon={<ActionIcon />}
      />,
    )
    expect(screen.getByTestId('action-icon')).toBeTruthy()
  })

  // ── Hardened tests ──

  it('onAction is called exactly once per press (no double-fire)', () => {
    const onAction = jest.fn()
    render(
      <EmptyState
        icon={<MockIcon />}
        title="Empty"
        actionLabel="Go"
        onAction={onAction}
      />,
    )
    const button = screen.getByRole('button')
    fireEvent.press(button)
    fireEvent.press(button)
    expect(onAction).toHaveBeenCalledTimes(2)
  })

  it('does not render onAction handler as visible text', () => {
    const onAction = jest.fn()
    render(
      <EmptyState
        icon={<MockIcon />}
        title="Empty"
        actionLabel="Go"
        onAction={onAction}
      />,
    )
    // Function toString should never leak into UI
    expect(screen.queryByText(/function/i)).toBeNull()
    expect(screen.queryByText(/\(\) =>/)).toBeNull()
  })

  it('handles very long title without crash', () => {
    const longTitle = 'A'.repeat(500)
    render(<EmptyState icon={<MockIcon />} title={longTitle} />)
    expect(screen.getByText(longTitle)).toBeTruthy()
  })

  it('handles special characters in title', () => {
    render(<EmptyState icon={<MockIcon />} title="Ei löytynyt <tuloksia> & 'yritä' uudelleen" />)
    expect(screen.getByText("Ei löytynyt <tuloksia> & 'yritä' uudelleen")).toBeTruthy()
  })
})
