import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createTicket, getMyTickets, getTicketDepartments } from '../lib/api';
import type { TicketDepartmentOption } from '../lib/api';
import { ensureRealtimeConnected, getSharedChatSocket, subscribeRealtimeStatus } from '../lib/chatRealtime';
import { subscribeTicketRealtime } from '../lib/ticketRealtime';

type Ticket = Awaited<ReturnType<typeof getMyTickets>>[number];

export function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [departments, setDepartments] = useState<TicketDepartmentOption[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  const selectedDept = useMemo(
    () => departments.find((d) => d.id === departmentId),
    [departments, departmentId],
  );

  async function loadData() {
    const [t, d] = await Promise.all([getMyTickets(), getTicketDepartments()]);
    setTickets(t);
    setDepartments(d);
    setDepartmentId((prev) => prev || (d[0]?.id ?? ''));
  }

  useEffect(() => {
    loadData().catch(() => setError('No se pudieron cargar tickets'));
  }, []);

  useEffect(() => {
    const off = subscribeRealtimeStatus((s) => setLive(s === 'live'));
    return off;
  }, []);

  useEffect(() => {
    void ensureRealtimeConnected('TicketsPage');
    const socket = getSharedChatSocket();
    return subscribeTicketRealtime(socket, () => {
      void getMyTickets()
        .then(setTickets)
        .catch(() => undefined);
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!departmentId) return;
    setLoading(true);
    setError('');
    try {
      await createTicket({ departmentId });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el ticket');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      {live ? (
        <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Lista actualizada en tiempo real
        </p>
      ) : null}
      <form className="module-card" onSubmit={onSubmit}>
        <h2>Nuevo ticket</h2>
        <p className="text-secondary" style={{ fontSize: '0.9rem', marginTop: 0 }}>
          Elija el área a la que va dirigida su solicitud. La prioridad y el asunto se asignan
          automáticamente; si el área tiene plantilla propia, quedará vinculada al ticket. Si la
          plantilla exige campos obligatorios, el administrador debe dejarlos opcionales o ampliar
          este formulario.
        </p>
        <label htmlFor="ticket-dept">Departamento</label>
        <select
          id="ticket-dept"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          required
        >
          {departments.length === 0 ? (
            <option value="">— No hay departamentos disponibles —</option>
          ) : (
            departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))
          )}
        </select>
        {selectedDept?.createTicketTemplate ? (
          <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
            <strong>Plantilla del área:</strong> {selectedDept.createTicketTemplate.name}
          </p>
        ) : selectedDept ? (
          <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
            Este departamento no tiene plantilla de solicitud configurada; se creará un ticket
            estándar.
          </p>
        ) : null}
        {selectedDept?.assetInventoryCodeExample ? (
          <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
            Los equipos del área se registran con códigos como{' '}
            <strong>{selectedDept.assetInventoryCodeExample}</strong>
            {selectedDept.assetInventoryCodePattern
              ? ' (el número de serie del activo debe cumplir el formato definido por el administrador).'
              : '.'}
          </p>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={loading || !departmentId || departments.length === 0}>
          {loading ? 'Guardando…' : 'Crear ticket'}
        </button>
      </form>

      <div className="modules-grid">
        {tickets.map((ticket) => (
          <article key={ticket.id} className="module-card">
            <h2>{ticket.ticketNumberFormatted ?? ticket.ticketNumber}</h2>
            <p>{ticket.subject}</p>
            <p>
              {ticket.status.name ?? ticket.status.label} · {ticket.priority.name ?? ticket.priority.label}
            </p>
            <Link to={`/tickets/${ticket.id}`}>Ver detalle</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
