/**
 * Toast component tests.
 *
 * Tests the ToastProvider/useToast system for showing
 * success, error, and info messages with auto-dismiss.
 */

import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react-native'
import { Text, View } from 'react-native'
import { ToastProvider, useToast } from '@/components/Toast'

// Helper component that exposes the toast.show function
function ToastTrigger({ type, message, duration }: { type?: 'success' | 'error' | 'info'; message: string; duration?: number }) {
  const toast = useToast()
  React.useEffect(() => {
    toast.show({ message, type, duration })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <Text>trigger</Text>
}

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows message text', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Saved successfully" type="success" />
      </ToastProvider>,
    )
    expect(screen.getByText('Saved successfully')).toBeTruthy()
  })

  it('renders with success type and shows Check icon', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Done" type="success" />
      </ToastProvider>,
    )
    expect(screen.getByText('Done')).toBeTruthy()
    // Success type renders a Check icon
    expect(screen.getByTestId('lucide-Check')).toBeTruthy()
  })

  it('renders with error type and shows AlertCircle icon', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Something went wrong" type="error" />
      </ToastProvider>,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    // Error type renders an AlertCircle icon
    expect(screen.getByTestId('lucide-AlertCircle')).toBeTruthy()
  })

  it('renders with info type and shows Info icon', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="New update available" type="info" />
      </ToastProvider>,
    )
    expect(screen.getByText('New update available')).toBeTruthy()
    // Info type renders an Info icon
    expect(screen.getByTestId('lucide-Info')).toBeTruthy()
  })

  it('defaults to success type when no type specified', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Default type toast" />
      </ToastProvider>,
    )
    expect(screen.getByText('Default type toast')).toBeTruthy()
  })

  it('auto-dismisses after default timeout (3000ms)', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Will disappear" type="success" />
      </ToastProvider>,
    )
    expect(screen.getByText('Will disappear')).toBeTruthy()

    // Advance past the 3000ms timeout
    act(() => {
      jest.advanceTimersByTime(3100)
    })

    // After timeout + exit animation (reduceMotion is true, so instant)
    expect(screen.queryByText('Will disappear')).toBeNull()
  })

  it('auto-dismisses after custom duration', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Quick toast" type="info" duration={1000} />
      </ToastProvider>,
    )
    expect(screen.getByText('Quick toast')).toBeTruthy()

    act(() => {
      jest.advanceTimersByTime(1100)
    })

    expect(screen.queryByText('Quick toast')).toBeNull()
  })

  it('does not dismiss before timeout', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Still here" type="success" duration={5000} />
      </ToastProvider>,
    )

    act(() => {
      jest.advanceTimersByTime(2000)
    })

    // Should still be visible after 2s when duration is 5s
    expect(screen.getByText('Still here')).toBeTruthy()
  })

  it('useToast returns no-op when used outside provider', () => {
    // useToast has a fallback: { show: () => {} } when no provider
    function Standalone() {
      const toast = useToast()
      React.useEffect(() => {
        // This should not throw
        toast.show({ message: 'no-op', type: 'info' })
      }, []) // eslint-disable-line react-hooks/exhaustive-deps
      return <Text>standalone</Text>
    }

    // Should not crash
    render(<Standalone />)
    expect(screen.getByText('standalone')).toBeTruthy()
  })

  it('renders close button', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Closable" type="success" />
      </ToastProvider>,
    )
    const closeBtn = screen.getByLabelText('common.close')
    expect(closeBtn).toBeTruthy()
  })

  // ── Hardened tests ──

  it('close button dismisses toast immediately', () => {
    render(
      <ToastProvider>
        <ToastTrigger message="Dismiss me" type="success" />
      </ToastProvider>,
    )

    expect(screen.getByText('Dismiss me')).toBeTruthy()

    act(() => {
      fireEvent.press(screen.getByLabelText('common.close'))
      // Advance past exit animation
      jest.advanceTimersByTime(500)
    })

    expect(screen.queryByText('Dismiss me')).toBeNull()
  })

  it('second toast replaces first toast', () => {
    function MultiToast() {
      const toast = useToast()
      React.useEffect(() => {
        toast.show({ message: 'First', type: 'info' })
        // Show second immediately after
        toast.show({ message: 'Second', type: 'success' })
      }, []) // eslint-disable-line react-hooks/exhaustive-deps
      return <Text>multi</Text>
    }

    render(
      <ToastProvider>
        <MultiToast />
      </ToastProvider>,
    )

    // The latest toast should be visible
    expect(screen.getByText('Second')).toBeTruthy()
  })

  it('does not crash with empty message', () => {
    expect(() => {
      render(
        <ToastProvider>
          <ToastTrigger message="" type="info" />
        </ToastProvider>,
      )
    }).not.toThrow()
  })

  it('does not crash with very long message', () => {
    const longMsg = 'X'.repeat(1000)
    expect(() => {
      render(
        <ToastProvider>
          <ToastTrigger message={longMsg} type="error" />
        </ToastProvider>,
      )
    }).not.toThrow()
  })
})
