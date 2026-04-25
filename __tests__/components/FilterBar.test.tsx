/**
 * FilterBar component tests.
 *
 * Tests rendering of category filter buttons, active state highlighting,
 * onFilter callback, and the "All" option.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { FilterBar } from '@/components/FilterBar'

describe('FilterBar', () => {
  it('renders the "All" filter chip', () => {
    render(<FilterBar activeFilter={null} onFilterChange={jest.fn()} />)
    // t('feed.filterAll') returns the key
    expect(screen.getByText('feed.filterAll')).toBeTruthy()
  })

  it('renders all category filter buttons', () => {
    render(<FilterBar activeFilter={null} onFilterChange={jest.fn()} />)
    // Each category calls t(cat.label) which returns the key
    expect(screen.getByText('categories.ilmaista')).toBeTruthy()
    expect(screen.getByText('categories.tarvitsen')).toBeTruthy()
    expect(screen.getByText('categories.tarjoan')).toBeTruthy()
    expect(screen.getByText('categories.tapahtuma')).toBeTruthy()
    expect(screen.getByText('categories.lainaa')).toBeTruthy()
  })

  it('highlights active filter via accessibilityState', () => {
    render(<FilterBar activeFilter="ilmaista" onFilterChange={jest.fn()} />)
    // The active chip has accessibilityState={{ selected: true }}
    const activeTab = screen.getByRole('tab', { name: 'categories.ilmaista' })
    expect(activeTab.props.accessibilityState).toEqual({ selected: true })
  })

  it('"All" is active when activeFilter is null', () => {
    render(<FilterBar activeFilter={null} onFilterChange={jest.fn()} />)
    const allTab = screen.getByRole('tab', { name: 'feed.filterAll' })
    expect(allTab.props.accessibilityState).toEqual({ selected: true })
  })

  it('"All" is not active when a category is selected', () => {
    render(<FilterBar activeFilter="tarvitsen" onFilterChange={jest.fn()} />)
    const allTab = screen.getByRole('tab', { name: 'feed.filterAll' })
    expect(allTab.props.accessibilityState).toEqual({ selected: false })
  })

  it('calls onFilterChange with category type when chip is pressed', () => {
    const onFilterChange = jest.fn()
    render(<FilterBar activeFilter={null} onFilterChange={onFilterChange} />)
    fireEvent.press(screen.getByText('categories.ilmaista'))
    expect(onFilterChange).toHaveBeenCalledWith('ilmaista')
  })

  it('calls onFilterChange with null when "All" is pressed', () => {
    const onFilterChange = jest.fn()
    render(<FilterBar activeFilter="ilmaista" onFilterChange={onFilterChange} />)
    fireEvent.press(screen.getByText('feed.filterAll'))
    expect(onFilterChange).toHaveBeenCalledWith(null)
  })

  it('toggles off active filter when same category is pressed again', () => {
    const onFilterChange = jest.fn()
    render(<FilterBar activeFilter="tarjoan" onFilterChange={onFilterChange} />)
    fireEvent.press(screen.getByText('categories.tarjoan'))
    // When already active, pressing it again sends null (toggle off)
    expect(onFilterChange).toHaveBeenCalledWith(null)
  })

  it('total number of chips = "All" + number of visible categories', () => {
    render(<FilterBar activeFilter={null} onFilterChange={jest.fn()} />)
    // All tabs: All + ilmaista + tarvitsen + tarjoan + tapahtuma + lainaa = 6
    const allTabs = screen.getAllByRole('tab')
    expect(allTabs.length).toBe(6)
  })
})
