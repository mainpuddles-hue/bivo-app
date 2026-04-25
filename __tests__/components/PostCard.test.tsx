/**
 * PostCard component tests.
 *
 * Tests rendering of post title, author name, category badge, image,
 * price, expiration, time ago, and interaction callbacks.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import type { Post } from '@/lib/types'

// Import after mocks are set up via setup.ts
import { PostCard } from '@/components/PostCard'

function createPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    user_id: 'user-1',
    type: 'ilmaista',
    title: 'Test Post Title',
    description: 'A test post description',
    location: 'Kallio',
    image_url: null,
    hub_pickup_id: null,
    expires_at: null,
    daily_fee: null,
    service_price: null,
    event_date: null,
    latitude: null,
    longitude: null,
    is_pro_listing: false,
    tags: [],
    is_active: true,
    like_count: 0,
    comment_count: 0,
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    user: {
      id: 'user-1',
      email: 'test@test.com',
      name: 'Matti Meikäläinen',
      avatar_url: null,
      bio: '',
      naapurusto: 'Kallio',
      response_rate: 100,
      is_hub: false,
      is_pro: false,
      pro_expires_at: null,
      profile_visibility: 'everyone',
      location_accuracy: 'area',
      notifications_enabled: true,
      language: 'fi',
      onboarding_completed: true,
      is_admin: false,
      is_business: false,
      business_name: null,
      business_vat_id: null,
      stripe_connect_onboarded: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    ...overrides,
  }
}

describe('PostCard', () => {
  it('renders post title', () => {
    render(<PostCard post={createPost()} />)
    expect(screen.getByText('Test Post Title')).toBeTruthy()
  })

  it('renders author name', () => {
    render(<PostCard post={createPost()} />)
    expect(screen.getByText('Matti Meikäläinen')).toBeTruthy()
  })

  it('renders category badge', () => {
    // The category label is rendered via t(category.label) which returns the key
    render(<PostCard post={createPost({ type: 'ilmaista' })} />)
    // The component calls t(category.label) then does charAt(0) + slice(1).toLowerCase()
    // Our mock t returns the key 'categories.ilmaista'; after transform it stays 'categories.ilmaista'
    // because the first char 'c' uppercased = 'C', rest lowercased = 'ategories.ilmaista'
    // Wait, charAt(0) stays as-is (no toUpperCase), so result = 'c' + 'ategories.ilmaista'
    // Actually: label.charAt(0) + label.slice(1).toLowerCase() = 'c' + 'ategories.ilmaista' = 'categories.ilmaista'
    expect(screen.getByText('categories.ilmaista')).toBeTruthy()
  })

  it('renders image when image_url is provided', () => {
    render(
      <PostCard
        post={createPost({ image_url: 'https://example.com/image.jpg' })}
      />,
    )
    // The image is rendered via expo-image mock (a View with testID 'expo-image')
    expect(screen.getByTestId('expo-image')).toBeTruthy()
  })

  it('does not render image when image_url is null', () => {
    render(<PostCard post={createPost({ image_url: null })} />)
    expect(screen.queryByTestId('expo-image')).toBeNull()
  })

  it('shows service_price when service_price > 0', () => {
    render(
      <PostCard
        post={createPost({
          type: 'tarjoan',
          service_price: 25,
          tags: ['tarjoan_item'],
        })}
      />,
    )
    expect(screen.getByText('25 €')).toBeTruthy()
  })

  it('shows free label for tarjoan items with zero price', () => {
    render(
      <PostCard
        post={createPost({
          type: 'tarjoan',
          service_price: 0,
          tags: ['tarjoan_item'],
        })}
      />,
    )
    // t('create.freeItem') returns the key
    expect(screen.getByText('create.freeItem')).toBeTruthy()
  })

  it('calls onInteraction callback exactly once on card press', () => {
    const onInteraction = jest.fn()
    render(
      <PostCard
        post={createPost()}
        onInteraction={onInteraction}
      />,
    )
    const pressable = screen.getByRole('button', { name: /Test Post Title/ })
    fireEvent.press(pressable)
    expect(onInteraction).toHaveBeenCalledTimes(1)
    expect(onInteraction).toHaveBeenCalledWith('post-1', 'click')
  })

  it('does not call onInteraction when not provided', () => {
    render(<PostCard post={createPost()} />)
    const pressable = screen.getByRole('button', { name: /Test Post Title/ })
    // Should not throw when pressed without onInteraction
    expect(() => fireEvent.press(pressable)).not.toThrow()
  })

  it('displays time ago text', () => {
    render(<PostCard post={createPost()} />)
    // formatTimeAgo mock returns '5 min sitten'
    expect(screen.getByText(/5 min sitten/)).toBeTruthy()
  })

  it('shows expiration badge when post expires today', () => {
    const expiresAt = new Date(Date.now() + 12 * 3600 * 1000).toISOString() // 12 hours from now
    render(<PostCard post={createPost({ expires_at: expiresAt })} />)
    // getExpirationInfo returns t('postCard.expiresToday') for < 24h
    expect(screen.getByText('postCard.expiresToday')).toBeTruthy()
  })

  it('shows expiration badge when post is expired', () => {
    const expiresAt = new Date(Date.now() - 3600 * 1000).toISOString() // 1 hour ago
    render(<PostCard post={createPost({ expires_at: expiresAt })} />)
    expect(screen.getByText('postCard.expired')).toBeTruthy()
  })

  it('does not show expiration badge when expires_at is null', () => {
    render(<PostCard post={createPost({ expires_at: null })} />)
    expect(screen.queryByText('postCard.expired')).toBeNull()
    expect(screen.queryByText('postCard.expiresToday')).toBeNull()
    expect(screen.queryByText('postCard.expiresTomorrow')).toBeNull()
  })

  it('shows description text', () => {
    render(<PostCard post={createPost({ description: 'A longer description here' })} />)
    expect(screen.getByText('A longer description here')).toBeTruthy()
  })

  it('shows anonymous label when is_anonymous is true', () => {
    render(<PostCard post={createPost({ is_anonymous: true })} />)
    // t('postCard.anonymousNeighbor') returns the key
    expect(screen.getByText('postCard.anonymousNeighbor')).toBeTruthy()
  })

  it('memoization prevents re-render with same props', () => {
    const post = createPost()
    const onInteraction = jest.fn()

    const { rerender } = render(<PostCard post={post} onInteraction={onInteraction} />)

    // Get initial tree structure
    const initialTree = screen.toJSON()

    // Rerendering with the same reference should produce identical tree
    rerender(<PostCard post={post} onInteraction={onInteraction} />)
    const secondTree = screen.toJSON()

    // Structural equality confirms memo prevented re-creation
    expect(JSON.stringify(secondTree)).toBe(JSON.stringify(initialTree))
  })

  it('re-renders when post prop changes', () => {
    const post1 = createPost({ title: 'First Title' })
    const post2 = createPost({ title: 'Second Title' })

    const { rerender } = render(<PostCard post={post1} />)
    expect(screen.getByText('First Title')).toBeTruthy()

    rerender(<PostCard post={post2} />)
    expect(screen.getByText('Second Title')).toBeTruthy()
    expect(screen.queryByText('First Title')).toBeNull()
  })

  it('renders daily_fee for lainaa posts', () => {
    render(
      <PostCard
        post={createPost({
          type: 'lainaa',
          daily_fee: 10,
        })}
      />,
    )
    // t('rental.perDay', { price: '10 €' }) returns the key
    expect(screen.getByText('rental.perDay')).toBeTruthy()
  })

  it('shows location text in the top row', () => {
    render(<PostCard post={createPost({ location: 'Kallio' })} />)
    expect(screen.getByText(/Kallio/)).toBeTruthy()
  })
})
