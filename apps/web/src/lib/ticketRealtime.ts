import type { Socket } from 'socket.io-client';

export const TICKET_REALTIME_EVENTS = [
  'ticket:created',
  'ticket:status_changed',
  'ticket:closed',
  'ticket:comment',
] as const;

export type TicketRealtimeEventName = (typeof TICKET_REALTIME_EVENTS)[number];

export type TicketRealtimePayload = {
  ticketId?: string;
  ticketNumber?: string;
  to?: string;
  commentId?: string;
};

/** Registra listeners de ciclo de vida de tickets sobre el socket compartido; devuelve cleanup. */
export function subscribeTicketRealtime(
  socket: Socket | null | undefined,
  handler: (event: TicketRealtimeEventName, payload: TicketRealtimePayload) => void,
): () => void {
  if (!socket) return () => undefined;

  const fns: Array<{ ev: TicketRealtimeEventName; fn: (p: TicketRealtimePayload) => void }> =
    TICKET_REALTIME_EVENTS.map((ev) => ({
      ev,
      fn: (raw: TicketRealtimePayload) => handler(ev, raw ?? {}),
    }));

  for (const { ev, fn } of fns) {
    socket.on(ev, fn);
  }
  return () => {
    for (const { ev, fn } of fns) {
      socket.off(ev, fn);
    }
  };
}
