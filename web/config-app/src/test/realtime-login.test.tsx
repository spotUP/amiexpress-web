/**
 * The socket has to appear when the sysop logs in.
 *
 * RealtimeProvider is mounted above the login screen, so on a fresh sign-in
 * its effect had already run - with no token - and set status 'offline'. Its
 * dependencies were a module singleton and a useCallback, both stable, so it
 * never ran again. Logging in wrote authToken and told nobody.
 *
 * The result, for a whole session until someone happened to press F5: no
 * socket at all. No bbs:event, so the Activity feed never moved past its
 * seeded rows. No operator:page, so a caller paging the sysop raised no toast
 * and no header badge - the thing the provider was written for. And every
 * realtime-backed query pinned to the DEGRADED poll rate, hammering the board
 * three times a second precisely because it believed it was offline.
 *
 * It looked fine on a reload, or on any return visit with a stored token,
 * which is why nobody caught it.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** Every io() call this render made. */
const connections: Array<Record<string, unknown>> = [];

vi.mock('socket.io-client', () => ({
  io: (origin: string, opts: Record<string, unknown>) => {
    connections.push({ origin, ...opts });
    return {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      close: vi.fn(),
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(),
      io: { on: vi.fn(), off: vi.fn() },
    };
  },
}));

/** Drives the auth state the provider reads. */
let authed = false;
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: authed }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

// The real showWarning is a useCallback, so it is STABLE across renders -
// which is exactly why the effect never re-ran. A mock handing back a fresh
// object each render would make the dependency change on its own and hide the
// bug this file exists to catch.
vi.mock('../contexts/NotificationContext', () => {
  const notifications = {
    showWarning: () => {},
    showError: () => {},
    showSuccess: () => {},
    showInfo: () => {},
  };
  return { useNotification: () => notifications };
});

import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { queryClient } from '../lib/query-client';

function renderProvider() {
  return render(
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <div>ready</div>
      </RealtimeProvider>
    </QueryClientProvider>
  );
}

describe('the realtime socket and signing in', () => {
  beforeEach(() => {
    connections.length = 0;
    authed = false;
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('opens no socket while nobody is signed in', () => {
    renderProvider();
    expect(connections).toHaveLength(0);
  });

  it('opens one when the sysop signs in, without a reload', async () => {
    const { rerender } = renderProvider();
    expect(connections).toHaveLength(0);

    // What logging in actually does: the token is stored and auth state flips.
    localStorage.setItem('authToken', 'a-real-token');
    authed = true;

    rerender(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <div>ready</div>
        </RealtimeProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(connections).toHaveLength(1));
  });

  it('asks for an admin socket, and sends the token', async () => {
    localStorage.setItem('authToken', 'a-real-token');
    authed = true;
    renderProvider();

    await waitFor(() => expect(connections).toHaveLength(1));

    // adminOnly is what keeps the admin from being handed a BBS node; the
    // server still decides, from secLevel on the session.
    expect((connections[0].query as Record<string, string>).adminOnly).toBe('true');
    expect((connections[0].auth as Record<string, string>).token).toBe('a-real-token');
  });
});
