import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addTicketComment,
  adminListUsers,
  assignTicketApi,
  changeTicketStatus,
  closeTicketApi,
  type CurrentUserProfile,
  getChatUsers,
  getCurrentUserProfile,
  getTicketById,
  getTicketPriorities,
  getTicketStatuses,
  ensureTicketChannel,
  isGlobalAdminRole,
  normalizeGlobalRole,
  updateTicket,
  downloadTicketAttachment,
  type TicketDetail,
  type TicketDetailUser,
} from '../lib/api';
import { ensureRealtimeConnected, getSharedChatSocket, subscribeRealtimeStatus } from '../lib/chatRealtime';
import { subscribeTicketRealtime } from '../lib/ticketRealtime';

function displayName(u: TicketDetailUser) {
  const t = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return t || '—';
}

function roleInDept(profile: CurrentUserProfile | null, departmentId: string): string | null {
  const r = profile?.department_roles?.find((d) => d.department_id === departmentId);
  return r?.role ?? null;
}

function formatJsonValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function eventTypeLabel(t: string): string {
  const map: Record<string, string> = {
    CREATED: 'Creado',
    ASSIGNED: 'Asignado',
    UNASSIGNED: 'Desasignado',
    STATUS_CHANGED: 'Cambio de estado',
    PRIORITY_CHANGED: 'Cambio de prioridad',
    COMMENTED: 'Comentario',
    ATTACHMENT_ADDED: 'Adjunto',
    CLOSED: 'Cerrado',
    REOPENED: 'Reabierto',
    SLA_BREACHED: 'Incumplimiento SLA',
    ESCALATED: 'Escalado',
  };
  return map[t] ?? t;
}

type AssignOption = { id: string; name: string; employee_id?: string };

export function TicketDetailPage() {
  const { ticketId = '' } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [statuses, setStatuses] = useState<Awaited<ReturnType<typeof getTicketStatuses>>>([]);
  const [priorities, setPriorities] = useState<Awaited<ReturnType<typeof getTicketPriorities>>>([]);
  const [assignOptions, setAssignOptions] = useState<AssignOption[]>([]);
  const [live, setLive] = useState(false);

  const [editSubject, setEditSubject] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);

  const [statusCode, setStatusCode] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [statusChecklist, setStatusChecklist] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const [closureSummary, setClosureSummary] = useState('');
  const [closureComment, setClosureComment] = useState('');
  const [closureBusy, setClosureBusy] = useState(false);

  const [assignUserId, setAssignUserId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);

  const [priorityId, setPriorityId] = useState('');
  const [priorityBusy, setPriorityBusy] = useState(false);

  const refreshTicket = useCallback(async () => {
    if (!ticketId) return;
    const data = await getTicketById(ticketId);
    if (!data) {
      setError('Ticket no encontrado');
      setTicket(null);
      return;
    }
    setTicket(data);
    setError('');
    setEditSubject(data.subject);
    setEditDescription(data.description ?? '');
    setPriorityId(data.priority.id);
  }, [ticketId]);

  useEffect(() => {
    void getCurrentUserProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    refreshTicket().catch(() => setError('No se pudo cargar el ticket'));
  }, [refreshTicket]);

  useEffect(() => {
    Promise.all([getTicketStatuses(), getTicketPriorities()])
      .then(([st, pr]) => {
        setStatuses(st);
        setPriorities(pr);
      })
      .catch(() => undefined);
  }, []);

  const deptRole = ticket && profile ? roleInDept(profile, ticket.department.id) : null;
  const isAdmin = isGlobalAdminRole(profile?.global_role);
  const isAuditor = normalizeGlobalRole(profile?.global_role) === 'auditor';
  const isRequester = Boolean(ticket && profile && ticket.requester.id === profile.id);
  const isAdminOrSup = isAdmin || deptRole === 'supervisor';
  const assignedToSelf = Boolean(ticket?.assignee && profile && ticket.assignee.id === profile.id);

  const isTerminalStatus = Boolean(
    ticket?.status.code && ['cerrado', 'cancelado'].includes(ticket.status.code),
  );

  const canEditSubjectDesc =
    !isAuditor &&
    ticket &&
    profile &&
    (isAdminOrSup || (isRequester && !ticket.assignee));

  const canChangePriority = !isAuditor && ticket && (isAdmin || deptRole === 'supervisor');

  const canAssign = !isAuditor && ticket && (isAdmin || deptRole === 'supervisor') && !isTerminalStatus;

  const canChangeStatus =
    !isAuditor &&
    ticket &&
    !isTerminalStatus &&
    (isAdmin ||
      deptRole === 'supervisor' ||
      (deptRole === 'tecnico_area' && assignedToSelf));

  const canClose =
    !isAuditor &&
    ticket &&
    !isTerminalStatus &&
    (isAdmin || deptRole === 'supervisor' || (deptRole === 'tecnico_area' && assignedToSelf));

  const canComment = !isAuditor && ticket && !isTerminalStatus;
  const canInternalComment =
    canComment && (isAdmin || deptRole === 'supervisor' || deptRole === 'tecnico_area');

  useEffect(() => {
    if (!ticket || !canAssign) {
      setAssignOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (isGlobalAdminRole(profile?.global_role)) {
          const r = await adminListUsers({ take: 200 });
          if (cancelled) return;
          const techs = r.items.filter((u) =>
            u.department_roles.some(
              (dr) => dr.department_id === ticket.department.id && dr.role === 'tecnico_area',
            ),
          );
          setAssignOptions(
            techs.map((u) => ({ id: u.id, name: u.name, employee_id: u.employee_id })),
          );
          return;
        }
      } catch {
        /* supervisor u otros: directorio de chat */
      }
      try {
        const users = await getChatUsers();
        if (cancelled) return;
        setAssignOptions(users.map((u) => ({ id: u.id, name: u.name, employee_id: u.employeeId })));
      } catch {
        if (!cancelled) setAssignOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket, canAssign, profile?.global_role, ticket?.department.id]);

  const timeline = useMemo(() => {
    if (!ticket) return [];
    const ev = ticket.events.map((e) => ({
      kind: 'event' as const,
      id: e.id,
      createdAt: e.createdAt,
      eventType: e.eventType,
      actor: e.actor,
      notes: e.notes,
      oldValueJson: e.oldValueJson,
      newValueJson: e.newValueJson,
    }));
    const cm = ticket.comments.map((c) => ({
      kind: 'comment' as const,
      id: c.id,
      createdAt: c.createdAt,
      content: c.content,
      commentType: c.commentType,
      user: c.user,
    }));
    return [...ev, ...cm].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [ticket]);

  useEffect(() => {
    const offStatus = subscribeRealtimeStatus((s) => setLive(s === 'live'));
    return offStatus;
  }, []);

  useEffect(() => {
    void ensureRealtimeConnected('TicketDetailPage');
    const socket = getSharedChatSocket();
    const unsub = subscribeTicketRealtime(socket, (_ev, payload) => {
      if (payload.ticketId && ticketId && payload.ticketId === ticketId) {
        void refreshTicket();
      }
    });
    return unsub;
  }, [ticketId, refreshTicket]);

  async function openChat() {
    if (!ticket) return;
    const channel = await ensureTicketChannel(ticket.id);
    navigate(`/chat?channel=${channel.id}`);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !canEditSubjectDesc) return;
    setSavingEdit(true);
    setActionError('');
    try {
      await updateTicket(ticket.id, { subject: editSubject.trim(), description: editDescription.trim() || undefined });
      await refreshTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSavingEdit(false);
    }
  }

  async function onSavePriority(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !canChangePriority || !priorityId) return;
    setPriorityBusy(true);
    setActionError('');
    try {
      await updateTicket(ticket.id, { priorityId });
      await refreshTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cambiar la prioridad');
    } finally {
      setPriorityBusy(false);
    }
  }

  async function onAddComment(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !canComment || !commentBody.trim()) return;
    setCommentBusy(true);
    setActionError('');
    try {
      await addTicketComment(ticket.id, {
        content: commentBody.trim(),
        commentType: commentInternal && canInternalComment ? 'internal' : 'public',
      });
      setCommentBody('');
      await refreshTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo añadir el comentario');
    } finally {
      setCommentBusy(false);
    }
  }

  async function onChangeStatus(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !canChangeStatus || !statusCode) return;
    setStatusBusy(true);
    setActionError('');
    try {
      await changeTicketStatus(ticket.id, {
        toStatusCode: statusCode,
        comment: statusComment.trim() || undefined,
        checklistDone: statusChecklist || undefined,
      });
      setStatusComment('');
      setStatusChecklist(false);
      await refreshTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cambiar el estado');
    } finally {
      setStatusBusy(false);
    }
  }

  async function onClose(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !canClose || closureSummary.trim().length < 30) return;
    setClosureBusy(true);
    setActionError('');
    try {
      await closeTicketApi(ticket.id, {
        closureSummary: closureSummary.trim(),
        comment: closureComment.trim() || undefined,
      });
      setClosureSummary('');
      setClosureComment('');
      await refreshTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo cerrar el ticket');
    } finally {
      setClosureBusy(false);
    }
  }

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!ticket || !canAssign || !assignUserId) return;
    setAssignBusy(true);
    setActionError('');
    try {
      await assignTicketApi(ticket.id, {
        assignedTo: assignUserId,
        notes: assignNotes.trim() || undefined,
      });
      setAssignNotes('');
      await refreshTicket();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo asignar');
    } finally {
      setAssignBusy(false);
    }
  }

  if (error && !ticket) {
    return (
      <section className="module-card">
        <p className="error">{error}</p>
        <Link to="/tickets">Volver</Link>
      </section>
    );
  }

  if (!ticket) {
    return <section className="module-card">Cargando ticket...</section>;
  }

  const statusLabel = ticket.status.name ?? ticket.status.label ?? ticket.status.code ?? '';
  const priorityLabel = ticket.priority.name ?? ticket.priority.label ?? '';

  return (
    <section className="ticket-detail">
      {live ? (
        <p className="ticket-live-hint">Actualizado en vivo</p>
      ) : null}

      <div className="module-card ticket-detail__header-card">
        <header className="ticket-detail__masthead">
          <div>
            <h2>{ticket.ticketNumberFormatted ?? `TK-${ticket.ticketNumber}`}</h2>
            <p className="ticket-detail__summary">
              {ticket.department.name} · {statusLabel} · {priorityLabel}
            </p>
          </div>
          <div className="section-nav ticket-detail__masthead-nav">
            <button type="button" onClick={() => void openChat()}>
              Abrir chat del ticket
            </button>
            <Link to="/tickets">Volver</Link>
          </div>
        </header>

        {actionError ? <p className="error">{actionError}</p> : null}

        <dl className="ticket-detail__meta-grid">
          <div className="ticket-detail__meta-item">
            <dt>Solicitante</dt>
            <dd>{displayName(ticket.requester)}</dd>
          </div>
          <div className="ticket-detail__meta-item">
            <dt>Asignado a</dt>
            <dd>{ticket.assignee ? displayName(ticket.assignee) : '—'}</dd>
          </div>
          {ticket.template ? (
            <div className="ticket-detail__meta-item">
              <dt>Plantilla</dt>
              <dd>{ticket.template.name}</dd>
            </div>
          ) : null}
          {ticket.asset ? (
            <div className="ticket-detail__meta-item">
              <dt>Activo</dt>
              <dd>
                {ticket.asset.name}
                {ticket.asset.serialNumber ? ` · S/N ${ticket.asset.serialNumber}` : ''}
              </dd>
            </div>
          ) : null}
          {ticket.slaDueAt ? (
            <div className="ticket-detail__meta-item">
              <dt>SLA objetivo</dt>
              <dd>
                {new Date(ticket.slaDueAt).toLocaleString()}
                {ticket.slaBreach ? ' (incumplido)' : ''}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="ticket-detail__layout">
        <div className="ticket-detail__main">
          {canEditSubjectDesc ? (
            <form className="module-card ticket-detail__panel" onSubmit={onSaveEdit}>
              <h3>Asunto y descripción</h3>
              <label>Asunto</label>
              <input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
              <label>Descripción</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
              />
              <button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Guardando…' : 'Guardar'}
              </button>
            </form>
          ) : (
            <div className="module-card ticket-detail__panel">
              <p>
                <strong>Asunto:</strong> {ticket.subject}
              </p>
              <p>
                <strong>Descripción:</strong> {ticket.description || 'Sin descripción'}
              </p>
            </div>
          )}

          {ticket.formValues.length > 0 ? (
            <div className="module-card ticket-detail__panel">
              <h3>Campos de plantilla</h3>
              <ul className="ticket-detail__list">
                {ticket.formValues.map((fv) => (
                  <li key={fv.id}>
                    <strong>{fv.field.fieldLabel}</strong> ({fv.field.fieldType}):{' '}
                    {formatJsonValue(fv.valueJson)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {ticket.attachments.length > 0 ? (
            <div className="module-card ticket-detail__panel">
              <h3>Adjuntos</h3>
              <ul className="ticket-detail__list">
                {ticket.attachments.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="ticket-detail__link-btn"
                      onClick={() =>
                        void downloadTicketAttachment(
                          ticket.id,
                          a.attachment.id,
                          a.attachment.originalName,
                        ).catch(() => setActionError('No se pudo descargar el adjunto'))
                      }
                    >
                      {a.attachment.originalName}
                    </button>{' '}
                    <span className="ticket-detail__muted">
                      ({a.attachment.mimeType}, {Math.round(a.attachment.sizeBytes / 1024)} KB)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="module-card ticket-detail__panel">
            <h3>Línea de tiempo</h3>
            <ul className="ticket-detail__timeline">
              {timeline.map((row) =>
                row.kind === 'event' ? (
                  <li key={`e-${row.id}`} className="ticket-detail__timeline-event">
                    <div className="ticket-detail__timeline-meta">
                      {new Date(row.createdAt).toLocaleString()}
                      {row.actor ? ` · ${displayName(row.actor)}` : ''}
                    </div>
                    <div>
                      <strong>{eventTypeLabel(row.eventType)}</strong>
                      {row.notes ? ` — ${row.notes}` : ''}
                    </div>
                    {row.oldValueJson && Object.keys(row.oldValueJson).length > 0 ? (
                      <pre className="ticket-detail__timeline-json">
                        {JSON.stringify({ from: row.oldValueJson, to: row.newValueJson }, null, 2)}
                      </pre>
                    ) : null}
                  </li>
                ) : (
                  <li key={`c-${row.id}`} className="ticket-detail__timeline-comment">
                    <div className="ticket-detail__timeline-meta">
                      {new Date(row.createdAt).toLocaleString()} · {displayName(row.user)} ·{' '}
                      {row.commentType === 'internal' ? 'Interno' : 'Público'}
                    </div>
                    <div>{row.content}</div>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>

        <aside className="ticket-detail__aside module-card">
          <h3 className="ticket-detail__aside-title">Acciones</h3>

          {canChangePriority ? (
            <form className="ticket-detail__action-block" onSubmit={onSavePriority}>
              <h4>Prioridad</h4>
              <select value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.label}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={priorityBusy}>
                {priorityBusy ? 'Aplicando…' : 'Cambiar prioridad'}
              </button>
            </form>
          ) : null}

          {canAssign ? (
            <form className="ticket-detail__action-block" onSubmit={onAssign}>
              <h4>Asignar técnico</h4>
              <p className="ticket-detail__action-hint">
                Debe ser técnico del departamento; la API valida la membresía.
              </p>
              <label>Técnico</label>
              <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)}>
                <option value="">— Elegir —</option>
                {assignOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.employee_id ? ` (${u.employee_id})` : ''}
                  </option>
                ))}
              </select>
              <label>Notas (opcional)</label>
              <input value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} />
              <button type="submit" disabled={assignBusy}>
                {assignBusy ? 'Asignando…' : 'Asignar'}
              </button>
            </form>
          ) : null}

          {canChangeStatus ? (
            <form className="ticket-detail__action-block" onSubmit={onChangeStatus}>
              <h4>Cambiar estado</h4>
              <label>Nuevo estado</label>
              <select value={statusCode} onChange={(e) => setStatusCode(e.target.value)}>
                <option value="">— Elegir —</option>
                {statuses
                  .filter((s) => s.code && s.code !== ticket.status.code)
                  .map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.name ?? s.label}
                    </option>
                  ))}
              </select>
              <label>Comentario interno (opcional)</label>
              <input value={statusComment} onChange={(e) => setStatusComment(e.target.value)} />
              <label className="ticket-detail__checkbox-label">
                <input
                  type="checkbox"
                  checked={statusChecklist}
                  onChange={(e) => setStatusChecklist(e.target.checked)}
                />
                Lista de verificación completada (si aplica)
              </label>
              <button type="submit" disabled={statusBusy || !statusCode}>
                {statusBusy ? 'Aplicando…' : 'Cambiar estado'}
              </button>
            </form>
          ) : null}

          {canClose ? (
            <form className="ticket-detail__action-block" onSubmit={onClose}>
              <h4>Cerrar ticket</h4>
              <label>Resumen de cierre (mín. 30 caracteres)</label>
              <textarea
                value={closureSummary}
                onChange={(e) => setClosureSummary(e.target.value)}
                rows={3}
                minLength={30}
              />
              <label>Comentario público (opcional)</label>
              <input value={closureComment} onChange={(e) => setClosureComment(e.target.value)} />
              <button type="submit" disabled={closureBusy || closureSummary.trim().length < 30}>
                {closureBusy ? 'Cerrando…' : 'Cerrar'}
              </button>
            </form>
          ) : null}

          {canComment ? (
            <form className="ticket-detail__action-block" onSubmit={onAddComment}>
              <h4>Nuevo comentario</h4>
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={3}
                placeholder="Escribe el comentario…"
              />
              {canInternalComment ? (
                <label className="ticket-detail__checkbox-label">
                  <input
                    type="checkbox"
                    checked={commentInternal}
                    onChange={(e) => setCommentInternal(e.target.checked)}
                  />
                  Comentario interno (equipo)
                </label>
              ) : null}
              <button type="submit" disabled={commentBusy || !commentBody.trim()}>
                {commentBusy ? 'Enviando…' : 'Publicar'}
              </button>
            </form>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
