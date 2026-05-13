/**
 * Origen del API (sin barra final). Ej.: `http://localhost:3030` o `https://api.empresa.com`.
 * En `npm run dev`, si no defines `VITE_API_ORIGIN`, se usa ruta relativa `/api/v1` (proxy en `vite.config.ts` → :3030).
 */
function resolveApiOrigin() {
  const envOrigin = (import.meta.env.VITE_API_ORIGIN ?? '').trim();
  if (envOrigin) return envOrigin.replace(/\/$/, '');
  if (import.meta.env.DEV) {
    return '';
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3030`;
  }
  return 'http://localhost:3030';
}

const API_ORIGIN = resolveApiOrigin();
export const API_BASE = API_ORIGIN === '' ? '/api/v1' : `${API_ORIGIN}/api/v1`;
/** Mismo host que la página en dev (WebSocket vía proxy de Vite). */
export const SOCKET_BASE =
  API_ORIGIN === ''
    ? typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:5173'
    : API_ORIGIN;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rawMessage?: string | string[],
  ) {
    super(message);
  }
}

type RefreshResponse = {
  access_token: string;
  refresh_token: string;
};

type RequestOtpResponse = {
  success: boolean;
  employee_id: string;
  employee_name: string;
  expires_at: string;
  masked_email: string;
  /** Usuario exento de OTP por correo; usar `bypass_verify_code` en verify-otp para cerrar sesión. */
  otp_bypass?: boolean;
  bypass_verify_code?: string;
};

export type DepartmentRoleEntry = {
  department_id: string;
  role: string;
};

type VerifyOtpResponse = {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    employee_id: string;
    name: string;
    email?: string | null;
    global_role: string | null;
    department_roles: DepartmentRoleEntry[];
  };
};

export type CurrentUserProfile = {
  id: string;
  employee_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  dependency_name: string | null;
  labor_type: string | null;
  is_active: boolean;
  global_role: string | null;
  department_roles: DepartmentRoleEntry[];
};

const KNOWN_GLOBAL_ROLES = new Set(['admin', 'auditor']);

/** Canonifica rol global (trim + minúsculas para valores conocidos). */
export function normalizeGlobalRole(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = typeof value === 'string' ? value.trim() : String(value).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (KNOWN_GLOBAL_ROLES.has(lower)) return lower;
  return s;
}

export function isGlobalAdminRole(role: string | null | undefined): boolean {
  return normalizeGlobalRole(role) === 'admin';
}

/** Normaliza /auth/me ante snake_case, camelCase o arrays ausentes (evita crashes en la UI). */
export function coerceCurrentUserProfile(raw: unknown): CurrentUserProfile {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('Respuesta de perfil inválida', 500);
  }
  const p = raw as Record<string, unknown>;
  const deptSrc = p.department_roles ?? p.departmentRoles;
  let department_roles: DepartmentRoleEntry[] = [];
  if (Array.isArray(deptSrc)) {
    department_roles = deptSrc
      .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
      .map((r) => ({
        department_id: String(r.department_id ?? r.departmentId ?? ''),
        role: String(r.role ?? ''),
      }))
      .filter((r) => r.department_id.length > 0 && r.role.length > 0);
  }

  const id = p.id != null ? String(p.id) : '';
  const name = p.name != null ? String(p.name) : '';
  const employee_id =
    p.employee_id != null
      ? String(p.employee_id)
      : p.employeeId != null
        ? String(p.employeeId)
        : '';
  if (!id || !name) {
    throw new ApiError('Respuesta de perfil incompleta', 500);
  }

  const gr = p.global_role ?? p.globalRole;
  const global_role = normalizeGlobalRole(
    gr == null || gr === '' ? null : typeof gr === 'string' ? gr : String(gr),
  );

  return {
    id,
    employee_id: employee_id || '—',
    name,
    email: p.email == null || p.email === '' ? null : String(p.email),
    phone: p.phone == null || p.phone === '' ? null : String(p.phone),
    job_title:
      (p.job_title ?? p.jobTitle) == null || (p.job_title ?? p.jobTitle) === ''
        ? null
        : String(p.job_title ?? p.jobTitle),
    dependency_name:
      (p.dependency_name ?? p.dependencyName) == null ||
      (p.dependency_name ?? p.dependencyName) === ''
        ? null
        : String(p.dependency_name ?? p.dependencyName),
    labor_type:
      (p.labor_type ?? p.laborType) == null || (p.labor_type ?? p.laborType) === ''
        ? null
        : String(p.labor_type ?? p.laborType),
    is_active: Boolean(p.is_active ?? p.isActive ?? true),
    global_role,
    department_roles,
  };
}

/** Persiste roles tras /auth/me para gating de UI (la API sigue siendo la autoridad). */
export function persistUserRolesFromProfile(profile: CurrentUserProfile) {
  localStorage.setItem('user_global_role', normalizeGlobalRole(profile.global_role) ?? '');
  try {
    localStorage.setItem('user_department_roles', JSON.stringify(profile.department_roles ?? []));
  } catch {
    /* ignore */
  }
}

export function readStoredGlobalRole(): string | null {
  const v = localStorage.getItem('user_global_role');
  return v === null || v === '' ? null : v;
}

export function isStoredGlobalAdmin(): boolean {
  return isGlobalAdminRole(readStoredGlobalRole());
}

/** Perfil mínimo cuando verify-otp trae roles pero /auth/me falla. */
export function currentUserProfileFromVerifyUser(user: VerifyOtpResponse['user']): CurrentUserProfile {
  return coerceCurrentUserProfile({
    id: user.id,
    employee_id: user.employee_id,
    name: user.name,
    email: user.email ?? null,
    phone: null,
    job_title: null,
    dependency_name: null,
    labor_type: null,
    is_active: true,
    global_role: user.global_role,
    department_roles: user.department_roles ?? [],
  });
}

type TicketStatus = { id: string; code: string; name: string; label?: string };
type TicketPriority = { id: string; code: string; name: string; label?: string };
/** Departamentos para alta de ticket (incluye plantilla de creación si existe). */
export type TicketDepartmentOption = {
  id: string;
  name: string;
  description?: string | null;
  assetInventoryCodeExample?: string | null;
  assetInventoryCodePattern?: string | null;
  createTicketTemplate?: { id: string; name: string } | null;
};

/** Listado / tarjetas (GET /tickets/my, etc.). */
export type TicketSummary = {
  id: string;
  ticketNumber: string;
  ticketNumberFormatted?: string;
  subject: string;
  description?: string | null;
  createdAt: string;
  status: TicketStatus;
  priority: TicketPriority;
  department: { id: string; name: string };
};

export type TicketDetailUser = {
  id: string;
  firstName: string;
  lastName: string;
};

export type TicketDetail = {
  id: string;
  ticketNumber: string;
  ticketNumberFormatted?: string;
  subject: string;
  description?: string | null;
  channel?: string;
  createdAt: string;
  updatedAt?: string;
  reportedAt?: string;
  assignedAt?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  slaDueAt?: string | null;
  slaBreach?: boolean;
  closureSummary?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  department: { id: string; name: string };
  template?: { id: string; name: string } | null;
  requester: TicketDetailUser;
  assignee: TicketDetailUser | null;
  asset?: {
    id: string;
    name: string;
    serialNumber: string | null;
    qrCode: string | null;
  } | null;
  events: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    notes?: string | null;
    actor: TicketDetailUser | null;
    oldValueJson?: Record<string, unknown>;
    newValueJson?: Record<string, unknown>;
  }>;
  comments: Array<{
    id: string;
    content: string;
    commentType: string;
    createdAt: string;
    user: TicketDetailUser;
  }>;
  formValues: Array<{
    id: string;
    valueJson: unknown;
    field: { fieldKey: string; fieldLabel: string; fieldType: string };
  }>;
  attachments: Array<{
    id: string;
    attachmentRole: string;
    url: string;
    attachment: {
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    };
  }>;
};
type ChatChannel = {
  id: string;
  name: string;
  ticket_id: string | null;
  channel_type: 'ticket' | 'dm' | 'group';
  my_role?: 'admin' | 'member' | null;
  unread_count: number;
  updated_at: string;
  last_message: {
    body: string | null;
    message_type?: string;
    created_at: string;
    author_name: string;
  } | null;
};
export type GroupMember = {
  user_id: string;
  name: string;
  employee_id: string;
  role: string | null;
};
export type ChatAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export type ChatAttachmentPreviewKind = 'image' | 'video' | 'audio' | 'file';

export type ChatAttachmentDownload = {
  url: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  preview_kind: ChatAttachmentPreviewKind;
};

export function getChatAttachmentPreviewKind(mimeType: string): ChatAttachmentPreviewKind {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export function getChatAttachmentIconKind(mimeType: string, fileName: string) {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'doc';
  if (mime.includes('excel') || mime.includes('spreadsheet') || name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return 'xls';
  }
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || /\.(zip|rar|7z)$/i.test(name)) {
    return 'zip';
  }
  if (mime.startsWith('audio/')) return 'audio';
  return 'generic';
}

export type ChatMessage = {
  id: string;
  body: string | null;
  messageType?: string;
  createdAt: string;
  user: { id: string; name: string; employeeId: string };
  attachments: ChatAttachment[];
};

export type MessagesPage = {
  messages: ChatMessage[];
  has_more: boolean;
};
type ChatUser = {
  id: string;
  employeeId: string;
  name: string;
  email?: string | null;
};

function getAuthHeaders() {
  const token = localStorage.getItem('access_token');
  return token ? ({ Authorization: `Bearer ${token}` } as Record<string, string>) : {};
}

let refreshPromise: Promise<string | null> | null = null;

function clearSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_name');
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_employee_id');
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_global_role');
  localStorage.removeItem('user_department_roles');
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

export async function refreshAccessToken(opts?: { silent?: boolean }): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  const currentRefresh = localStorage.getItem('refresh_token');
  if (!currentRefresh) return null;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: currentRefresh }),
      });
      if (!response.ok) return null;

      const data = (await response.json()) as RefreshResponse;
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      if (!opts?.silent) {
        window.dispatchEvent(new CustomEvent('auth:token-refreshed'));
      }
      return data.access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function readJwtExpUnix(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (b64.length % 4)) % 4;
    b64 += '='.repeat(padLen);
    const payload = JSON.parse(atob(b64)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Si el access JWT está vencido o cerca, refresca antes del próximo request (menos 401 en red). */
async function refreshAccessIfExpiredOrNear(leewaySeconds = 90): Promise<void> {
  const access = localStorage.getItem('access_token');
  const refresh = localStorage.getItem('refresh_token');
  if (!access || !refresh) return;
  const exp = readJwtExpUnix(access);
  if (exp == null) return;
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp > nowSec + leewaySeconds) return;
  await refreshAccessToken({ silent: true });
}

export async function authFetch(path: string, init: RequestInit, retry = true): Promise<Response> {
  if (!path.startsWith('/auth/')) {
    await refreshAccessIfExpiredOrNear(90);
  }
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('access_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor. Verifica la red o VITE_API_ORIGIN.',
      0,
    );
  }
  if (response.status === 401) {
    if (retry && !path.startsWith('/auth/')) {
      const newAccess = await refreshAccessToken();
      if (newAccess) return authFetch(path, init, false);
    }
    clearSession();
  }
  return response;
}

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
  retry = true,
  signal?: AbortSignal,
): Promise<T> {
  if (!path.startsWith('/auth/')) {
    await refreshAccessIfExpiredOrNear(90);
  }
  let response: Response;
  const headers: Record<string, string> = { ...getAuthHeaders() } as Record<string, string>;
  if (method !== 'GET' && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(
      'No se pudo conectar con el servidor. Verifica la red o VITE_API_ORIGIN.',
      0,
    );
  }

  if (response.status === 401) {
    if (retry && !path.startsWith('/auth/')) {
      const newAccess = await refreshAccessToken();
      if (newAccess) return request<T>(path, method, body, false, signal);
    }
    clearSession();
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new ApiError(message ?? 'Request failed', response.status, data.message);
  }

  const raw = await response.text();
  if (!raw?.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export function requestOtp(employee_id: string) {
  return request<RequestOtpResponse>('/auth/request-otp', 'POST', { employee_id });
}

export function verifyOtp(employee_id: string, otp_code: string) {
  return request<VerifyOtpResponse>('/auth/verify-otp', 'POST', { employee_id, otp_code });
}

export function getCurrentUserProfile() {
  return request<unknown>('/auth/me', 'GET').then(coerceCurrentUserProfile);
}

let validateSessionInflight: Promise<void> | null = null;

/**
 * Validación inicial al cargar la app: una sola petición en vuelo (React Strict Mode duplica efectos)
 * y refresh preventivo si el access JWT ya venció pero el refresh sigue válido.
 */
export function validateSessionForApp(): Promise<void> {
  if (!localStorage.getItem('access_token')) {
    return Promise.resolve();
  }
  if (validateSessionInflight) {
    return validateSessionInflight;
  }
  validateSessionInflight = (async () => {
    await refreshAccessIfExpiredOrNear(90);
    await getCurrentUserProfile();
  })()
    .catch(() => undefined)
    .finally(() => {
      validateSessionInflight = null;
    });
  return validateSessionInflight;
}

export function getTicketStatuses() {
  return request<TicketStatus[]>('/tickets/statuses', 'GET');
}

export function getTicketPriorities() {
  return request<TicketPriority[]>('/tickets/priorities', 'GET');
}

export function getTicketDepartments() {
  return request<TicketDepartmentOption[]>('/tickets/departments', 'GET');
}

export function getMyTickets() {
  return request<TicketSummary[]>('/tickets/my', 'GET');
}

export function getTicketById(ticketId: string) {
  return request<TicketDetail | null>(`/tickets/${ticketId}`, 'GET');
}

export function createTicket(payload: {
  departmentId: string;
  subject?: string;
  description?: string;
  priorityId?: string;
  templateId?: string;
  formValues?: Array<{ templateFieldId: string; value: unknown }>;
}) {
  return request<TicketDetail>('/tickets', 'POST', payload);
}

export function updateTicket(
  ticketId: string,
  body: { subject?: string; description?: string; priorityId?: string; assetId?: string },
) {
  return request<unknown>(`/tickets/${ticketId}`, 'PATCH', body);
}

export function addTicketComment(
  ticketId: string,
  body: { content: string; commentType?: 'public' | 'internal' },
) {
  return request<{
    id: string;
    content: string;
    commentType: string;
    createdAt: string;
    user: TicketDetailUser;
  }>(`/tickets/${ticketId}/comments`, 'POST', body);
}

export function changeTicketStatus(
  ticketId: string,
  body: { toStatusCode: string; comment?: string; checklistDone?: boolean },
) {
  return request<TicketDetail>(`/tickets/${ticketId}/change-status`, 'POST', body);
}

export function closeTicketApi(
  ticketId: string,
  body: { closureSummary: string; comment?: string; checklistDone?: boolean },
) {
  return request<TicketDetail>(`/tickets/${ticketId}/close`, 'POST', body);
}

export function assignTicketApi(ticketId: string, body: { assignedTo: string; notes?: string }) {
  return request<TicketDetail>(`/tickets/${ticketId}/assign`, 'POST', body);
}

export function getChatChannels() {
  return request<ChatChannel[]>('/chat/channels', 'GET');
}

export function getChatUsers() {
  return request<ChatUser[]>('/chat/users', 'GET');
}

export function getChatPresence() {
  return request<string[]>('/chat/presence', 'GET');
}

export function createDmChannel(userId: string) {
  return request<{ id: string; name?: string | null }>(`/chat/dm/${userId}`, 'POST');
}

export function createGroupChannel(name: string, member_user_ids: string[] = []) {
  return request<{ id: string }>('/chat/groups', 'POST', { name, member_user_ids });
}

export function getGroupMembers(channelId: string) {
  return request<GroupMember[]>(`/chat/channels/${channelId}/members`, 'GET');
}

export function addGroupMember(channelId: string, userId: string) {
  return request<{ ok: boolean }>(`/chat/channels/${channelId}/members`, 'POST', { user_id: userId });
}

export function removeGroupMember(channelId: string, targetUserId: string) {
  return request<{ ok: boolean }>(`/chat/channels/${channelId}/members/${targetUserId}`, 'DELETE');
}

export function leaveGroupChannel(channelId: string) {
  return request<{ ok: boolean }>(`/chat/channels/${channelId}/leave`, 'POST');
}

/** Oculta la conversación para el usuario (borrado lógico; datos persisten para auditoría). */
export async function softDeleteChatConversation(channelId: string) {
  try {
    return await request<{ ok: boolean }>(`/chat/channels/${channelId}/hide`, 'POST');
  } catch (e) {
    // APIs antiguas o dist sin POST .../hide → DELETE channels/:id (misma semántica).
    if (e instanceof ApiError && e.status === 404) {
      return request<{ ok: boolean }>(`/chat/channels/${channelId}`, 'DELETE');
    }
    throw e;
  }
}

export function getChannelMessages(channelId: string, opts?: { limit?: number; before?: string }) {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.before) q.set('before', opts.before);
  const qs = q.toString();
  return request<MessagesPage>(`/chat/channels/${channelId}/messages${qs ? `?${qs}` : ''}`, 'GET');
}

export function sendChannelMessage(channelId: string, body: string, opts?: { messageType?: 'nudge' }) {
  const payload: { body: string; message_type?: 'nudge' } = { body };
  if (opts?.messageType === 'nudge') {
    payload.message_type = 'nudge';
    payload.body = '';
  }
  return request<ChatMessage>(`/chat/channels/${channelId}/messages`, 'POST', payload);
}

export async function sendChannelMessageWithFile(channelId: string, body: string, file: File) {
  const form = new FormData();
  const t = body.trim();
  if (t) form.append('body', t);
  form.append('file', file);
  // #region agent log
  console.log('DEBUG_CHAT_UPLOAD_START', {
    runId: 'upload-debug-v2',
    hypothesisId: 'H5',
    channelId,
    bodyLength: t.length,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  });
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7274/ingest/59bdcc31-fe05-46ac-a0ca-d7ce2215562f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de3583'},body:JSON.stringify({sessionId:'de3583',runId:'upload-debug-v2',hypothesisId:'H1',location:'apps/web/src/lib/api.ts:sendChannelMessageWithFile:request',message:'chat upload request start',data:{channelId,bodyLength:t.length,fileName:file.name,fileSize:file.size,fileType:file.type},timestamp:Date.now()})}).catch((error)=>{console.warn('DEBUG_CHAT_UPLOAD_LOG_FAIL',{runId:'upload-debug-v2',hypothesisId:'H5',stage:'request',error:String(error)})});
  // #endregion
  const response = await authFetch(`/chat/channels/${channelId}/messages/with-file`, {
    method: 'POST',
    body: form,
  });
  // #region agent log
  console.log('DEBUG_CHAT_UPLOAD_RESPONSE', {
    runId: 'upload-debug-v2',
    hypothesisId: 'H6',
    channelId,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type'),
  });
  // #endregion
  // #region agent log
  fetch('http://127.0.0.1:7274/ingest/59bdcc31-fe05-46ac-a0ca-d7ce2215562f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'de3583'},body:JSON.stringify({sessionId:'de3583',runId:'upload-debug-v2',hypothesisId:'H4',location:'apps/web/src/lib/api.ts:sendChannelMessageWithFile:response',message:'chat upload response received',data:{channelId,status:response.status,ok:response.ok,contentType:response.headers.get('content-type')},timestamp:Date.now()})}).catch((error)=>{console.warn('DEBUG_CHAT_UPLOAD_LOG_FAIL',{runId:'upload-debug-v2',hypothesisId:'H5',stage:'response',error:String(error)})});
  // #endregion
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new ApiError(message ?? 'Request failed', response.status, data.message);
  }
  return (await response.json()) as ChatMessage;
}

export function forwardChannelAttachments(
  channelId: string,
  attachmentIds: string[],
  body?: string,
) {
  return request<ChatMessage>(`/chat/channels/${channelId}/messages/forward-attachments`, 'POST', {
    attachment_ids: attachmentIds,
    body: body ?? '',
  });
}

export function getAttachmentDownloadUrl(attachmentId: string) {
  return request<ChatAttachmentDownload>(
    `/chat/attachments/${attachmentId}/download-url`,
    'GET',
  );
}

export async function fetchAttachmentBlob(attachmentId: string) {
  const response = await authFetch(`/chat/attachments/${attachmentId}/content`, { method: 'GET' });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new ApiError(message ?? 'Request failed', response.status, data.message);
  }
  return response.blob();
}

export function markChannelRead(channelId: string) {
  return request<{ success: boolean }>(`/chat/channels/${channelId}/read`, 'POST');
}

export function ensureTicketChannel(ticketId: string) {
  return request<{ id: string }>(`/chat/tickets/${ticketId}/channel`, 'POST');
}

/** --- Administración / configuración (solo rol global admin en API) --- */

export type AdminDepartmentRow = {
  id: string;
  name: string;
  description: string | null;
  assetInventoryCodeExample?: string | null;
  assetInventoryCodePattern?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminTicketStatusRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  isClosed: boolean;
  isDefault: boolean;
  sortOrder: number;
};

export type AdminTicketPriorityRow = {
  id: string;
  code: string;
  name: string;
  responseMinutes: number | null;
  resolutionMinutes: number | null;
};

export type AdminRuntimeConfig = {
  api_prefix: string;
  chat_directory_user_limit_raw: string | null;
  chat_directory_user_limit_effective: number | null;
  chat_attachment_max_mb: number;
  audit_log_enabled: boolean;
  http_access_log: boolean;
  jwt_configured: boolean;
  minio_endpoint_configured: boolean;
  database_configured: boolean;
};

export type AdminUserRow = {
  id: string;
  employee_id: string;
  name: string;
  email: string | null;
  is_active: boolean;
  global_role: string | null;
  department_roles: DepartmentRoleEntry[];
};

export function adminListDepartments() {
  return request<AdminDepartmentRow[]>('/admin/catalog/departments', 'GET');
}

export function adminCreateDepartment(body: {
  name: string;
  description?: string;
  is_active?: boolean;
  asset_inventory_code_example?: string | null;
  asset_inventory_code_pattern?: string | null;
}) {
  return request<AdminDepartmentRow>('/admin/catalog/departments', 'POST', body);
}

export function adminUpdateDepartment(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    is_active?: boolean;
    asset_inventory_code_example?: string | null;
    asset_inventory_code_pattern?: string | null;
  },
) {
  return request<AdminDepartmentRow>(`/admin/catalog/departments/${id}`, 'PATCH', body);
}

export function adminListTicketStatuses() {
  return request<AdminTicketStatusRow[]>('/admin/catalog/ticket-statuses', 'GET');
}

export function adminCreateTicketStatus(body: Record<string, unknown>) {
  return request<AdminTicketStatusRow>('/admin/catalog/ticket-statuses', 'POST', body);
}

export function adminUpdateTicketStatus(id: string, body: Record<string, unknown>) {
  return request<AdminTicketStatusRow>(`/admin/catalog/ticket-statuses/${id}`, 'PATCH', body);
}

export function adminDeleteTicketStatus(id: string) {
  return request<{ ok: boolean }>(`/admin/catalog/ticket-statuses/${id}`, 'DELETE');
}

export function adminListTicketPriorities() {
  return request<AdminTicketPriorityRow[]>('/admin/catalog/ticket-priorities', 'GET');
}

export function adminCreateTicketPriority(body: Record<string, unknown>) {
  return request<AdminTicketPriorityRow>('/admin/catalog/ticket-priorities', 'POST', body);
}

export function adminUpdateTicketPriority(id: string, body: Record<string, unknown>) {
  return request<AdminTicketPriorityRow>(`/admin/catalog/ticket-priorities/${id}`, 'PATCH', body);
}

export function adminDeleteTicketPriority(id: string) {
  return request<{ ok: boolean }>(`/admin/catalog/ticket-priorities/${id}`, 'DELETE');
}

export type AdminWorkflowRow = {
  id: string;
  departmentId: string;
  name: string;
  isActive: boolean;
  department?: { id: string; name: string };
  transitions: Array<{
    id: string;
    workflowId: string;
    fromStatusId: string;
    toStatusId: string;
    requiresComment: boolean;
    requiresResolution: boolean;
    requiresChecklist: boolean;
    requiresSupervisorApproval: boolean;
    fromStatus?: { id: string; code: string; name: string };
    toStatus?: { id: string; code: string; name: string };
  }>;
};

export function adminListWorkflows() {
  return request<AdminWorkflowRow[]>('/admin/workflows', 'GET');
}

export function adminCreateWorkflow(body: { department_id: string; name: string; is_active?: boolean }) {
  return request<AdminWorkflowRow>('/admin/workflows', 'POST', body);
}

export function adminUpdateWorkflow(workflowId: string, body: { name?: string; is_active?: boolean }) {
  return request<AdminWorkflowRow>(`/admin/workflows/${workflowId}`, 'PATCH', body);
}

export function adminCreateWorkflowTransition(workflowId: string, body: Record<string, unknown>) {
  return request<unknown>(`/admin/workflows/${workflowId}/transitions`, 'POST', body);
}

export function adminUpdateWorkflowTransition(transitionId: string, body: Record<string, unknown>) {
  return request<unknown>(`/admin/workflows/transitions/${transitionId}`, 'PATCH', body);
}

export function adminDeleteWorkflowTransition(transitionId: string) {
  return request<{ ok: boolean }>(`/admin/workflows/transitions/${transitionId}`, 'DELETE');
}

export type AdminTemplateRow = {
  id: string;
  departmentId: string;
  name: string;
  usageType: string;
  isActive: boolean;
  department?: { id: string; name: string };
  fields: Array<{
    id: string;
    templateId: string;
    fieldKey: string;
    fieldLabel: string;
    fieldType: string;
    isRequired: boolean;
    configJson: unknown;
  }>;
};

export function adminListTemplates() {
  return request<AdminTemplateRow[]>('/admin/templates', 'GET');
}

export function adminCreateTemplate(body: {
  department_id: string;
  name: string;
  usage_type: string;
  is_active?: boolean;
}) {
  return request<AdminTemplateRow>('/admin/templates', 'POST', body);
}

export function adminUpdateTemplate(templateId: string, body: Record<string, unknown>) {
  return request<AdminTemplateRow>(`/admin/templates/${templateId}`, 'PATCH', body);
}

export function adminCreateTemplateField(templateId: string, body: Record<string, unknown>) {
  return request<unknown>(`/admin/templates/${templateId}/fields`, 'POST', body);
}

export function adminUpdateTemplateField(fieldId: string, body: Record<string, unknown>) {
  return request<unknown>(`/admin/templates/fields/${fieldId}`, 'PATCH', body);
}

export function adminDeleteTemplateField(fieldId: string) {
  return request<{ ok: boolean }>(`/admin/templates/fields/${fieldId}`, 'DELETE');
}

export function adminGetRuntimeConfig() {
  return request<AdminRuntimeConfig>('/admin/runtime-config', 'GET');
}

export type AdminIntegrationRow = {
  id: string;
  name: string;
  base_url: string;
  auth_type: 'none' | 'bearer' | 'api_key' | 'basic' | string;
  notes: string | null;
  is_active: boolean;
  has_credentials: boolean;
  created_at: string;
  updated_at: string;
  /** Campos detectados en el último sondeo JSON (objetos en array u objeto raíz). */
  available_fields: string[];
  /** Incluir (1) o excluir (0) cada campo en la vista filtrada del probe. */
  response_field_mask: Record<string, number>;
};

export type AdminIntegrationProbeResult = {
  ok: boolean;
  status: number;
  status_text: string;
  error?: string;
  available_fields?: string[];
  data?: unknown;
  filtered?: unknown;
  body_truncated?: boolean;
  non_json_preview?: string;
};

export function adminListIntegrations() {
  return request<AdminIntegrationRow[]>('/admin/integrations', 'GET');
}

export function adminCreateIntegration(body: Record<string, unknown>) {
  return request<AdminIntegrationRow>('/admin/integrations', 'POST', body);
}

export function adminUpdateIntegration(id: string, body: Record<string, unknown>) {
  return request<AdminIntegrationRow>(`/admin/integrations/${id}`, 'PATCH', body);
}

export function adminDeleteIntegration(id: string) {
  return request<{ ok: boolean }>(`/admin/integrations/${id}`, 'DELETE');
}

export function adminProbeIntegration(id: string) {
  return request<AdminIntegrationProbeResult>(`/admin/integrations/${id}/probe`, 'POST');
}

export function adminListUsers(opts?: { skip?: number; take?: number }) {
  const q = new URLSearchParams();
  if (opts?.skip != null) q.set('skip', String(opts.skip));
  if (opts?.take != null) q.set('take', String(opts.take));
  const qs = q.toString();
  return request<{ items: AdminUserRow[]; total: number; skip: number; take: number }>(
    `/admin/users${qs ? `?${qs}` : ''}`,
    'GET',
  );
}

export function adminUpdateUserGlobalRole(userId: string, global_role: 'admin' | 'auditor' | null) {
  return request<{ ok: boolean }>(`/admin/users/${userId}/global-role`, 'PATCH', { global_role });
}

export function adminSetUserDepartmentRoles(userId: string, roles: DepartmentRoleEntry[]) {
  return request<{ ok: boolean }>(`/admin/users/${userId}/department-roles`, 'PUT', {
    roles: roles.map((r) => ({ department_id: r.department_id, role: r.role })),
  });
}

/** Usuario puede ver el módulo de inventario (admin, auditor o rol de área técnico/supervisor). */
export function canWriteInventoryForDepartment(
  profile: CurrentUserProfile | null,
  departmentId: string,
): boolean {
  if (!profile) return false;
  if (normalizeGlobalRole(profile.global_role) === 'auditor') return false;
  if (isGlobalAdminRole(profile.global_role)) return true;
  return (profile.department_roles ?? []).some(
    (r) =>
      r.department_id === departmentId &&
      (r.role === 'supervisor' || r.role === 'tecnico_area'),
  );
}

export function canAccessInventoryUi(): boolean {
  if (isStoredGlobalAdmin()) return true;
  const gr = readStoredGlobalRole();
  if (gr === 'auditor') return true;
  try {
    const raw = localStorage.getItem('user_department_roles');
    const roles = raw ? (JSON.parse(raw) as DepartmentRoleEntry[]) : [];
    return roles.some((r) => r.role === 'supervisor' || r.role === 'tecnico_area');
  } catch {
    return false;
  }
}

export function filterDepartmentsForInventory(
  profile: CurrentUserProfile,
  allDepts: TicketDepartmentOption[],
): TicketDepartmentOption[] {
  if (isGlobalAdminRole(profile.global_role) || normalizeGlobalRole(profile.global_role) === 'auditor') {
    return allDepts;
  }
  const allowed = new Set(
    (profile.department_roles ?? [])
      .filter((r) => r.role === 'supervisor' || r.role === 'tecnico_area')
      .map((r) => r.department_id),
  );
  return allDepts.filter((d) => allowed.has(d.id));
}

export type InventoryDependencyOption = {
  id: string;
  legacyId: number;
  name: string;
};

export type InventoryLifecycleEntry = {
  id: string;
  performedAt: string;
  entryType: string;
  sourceType: string;
  sourceId: string;
  summary: string;
  performedBy: string;
  performedByName: string;
};

export type InventoryAssetRow = {
  id: string;
  departmentId: string;
  equipmentCategory: string;
  name: string;
  serialNumber: string | null;
  manufacturerSerial: string | null;
  details: Record<string, unknown>;
  qrCode: string | null;
  isActive: boolean;
  legacyMysqlId: number | null;
  photoStorageKey: string | null;
  createdAt: string;
  updatedAt: string;
  /** Presente en `GET /inventory/assets/:id` (detalle e impresión hoja de vida). */
  lifecycle?: InventoryLifecycleEntry[];
};

export type InventoryListResponse = {
  data: InventoryAssetRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function listInventoryDependencies(departmentId: string) {
  return request<InventoryDependencyOption[]>(
    `/inventory/departments/${departmentId}/dependencies`,
    'GET',
  );
}

export type InventoryExternalPcRow = Record<string, unknown>;

export type InventoryExternalPcResponse = {
  integration: { id: string; name: string };
  http: { ok: boolean; status: number; status_text: string };
  rows: InventoryExternalPcRow[];
  body_truncated?: boolean;
  non_json_preview?: string;
  error?: string;
  available_fields?: string[];
};

/** GET a la integración activa con el nombre indicado (por defecto `api-bd.sistemas` en el servidor). */
export function getInventoryExternalPc(
  departmentId: string,
  opts?: { integrationName?: string; signal?: AbortSignal },
) {
  const q = new URLSearchParams();
  if (opts?.integrationName?.trim()) q.set('name', opts.integrationName.trim());
  const qs = q.toString();
  return request<InventoryExternalPcResponse>(
    `/inventory/departments/${departmentId}/external-pc${qs ? `?${qs}` : ''}`,
    'GET',
    undefined,
    true,
    opts?.signal,
  );
}

/** Filas en la tabla PostgreSQL `hoja_de_vida` (import desde integración). */
export type InventoryHojaDeVidaListResponse = {
  integration: { id: string; name: string };
  http: { ok: boolean; status: number; status_text: string };
  rows: InventoryExternalPcRow[];
  total_stored: number;
  page: number;
  limit: number;
  total_pages: number;
  last_synced_at: string | null;
  source: 'internal';
};

export type InventoryHojaDeVidaSyncResponse = {
  ok: boolean;
  imported: number;
  integration: { id: string; name: string };
  http: { ok: boolean; status: number; status_text: string };
  error?: string;
};

export function getInventoryHojaDeVida(
  departmentId: string,
  opts?: { integrationName?: string; page?: number; limit?: number; signal?: AbortSignal },
) {
  const q = new URLSearchParams();
  if (opts?.integrationName?.trim()) q.set('name', opts.integrationName.trim());
  if (opts?.page != null) q.set('page', String(opts.page));
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  const qs = q.toString();
  return request<InventoryHojaDeVidaListResponse>(
    `/inventory/departments/${departmentId}/hoja-de-vida${qs ? `?${qs}` : ''}`,
    'GET',
    undefined,
    true,
    opts?.signal,
  );
}

/** Reemplaza las filas de `hoja_de_vida` del departamento con un GET a la integración (misma fuente que external-pc). */
export function postInventoryHojaDeVidaSync(
  departmentId: string,
  opts?: { integrationName?: string; signal?: AbortSignal },
) {
  const q = new URLSearchParams();
  if (opts?.integrationName?.trim()) q.set('name', opts.integrationName.trim());
  const qs = q.toString();
  return request<InventoryHojaDeVidaSyncResponse>(
    `/inventory/departments/${departmentId}/hoja-de-vida/sync${qs ? `?${qs}` : ''}`,
    'POST',
    undefined,
    true,
    opts?.signal,
  );
}

export function listInventoryAssets(
  departmentId: string,
  params: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
    includeInactive?: boolean;
    signal?: AbortSignal;
  },
) {
  const q = new URLSearchParams();
  if (params.category) q.set('category', params.category);
  if (params.search?.trim()) q.set('search', params.search.trim());
  if (params.page != null) q.set('page', String(params.page));
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.includeInactive) q.set('includeInactive', 'true');
  const qs = q.toString();
  const { signal } = params;
  return request<InventoryListResponse>(
    `/inventory/departments/${departmentId}/assets${qs ? `?${qs}` : ''}`,
    'GET',
    undefined,
    true,
    signal,
  );
}

export function getInventoryAsset(assetId: string) {
  return request<InventoryAssetRow>(`/inventory/assets/${assetId}`, 'GET');
}

export function listInventoryAssetLifecycle(assetId: string, signal?: AbortSignal) {
  return request<InventoryLifecycleEntry[]>(
    `/inventory/assets/${assetId}/lifecycle`,
    'GET',
    undefined,
    true,
    signal,
  );
}

export function createInventoryAsset(
  departmentId: string,
  body: {
    equipmentCategory: string;
    name: string;
    serialNumber?: string | null;
    manufacturerSerial?: string | null;
    qrCode?: string | null;
    details?: Record<string, unknown>;
    isActive?: boolean;
  },
) {
  return request<InventoryAssetRow>(`/inventory/departments/${departmentId}/assets`, 'POST', body);
}

export function updateInventoryAsset(
  assetId: string,
  body: {
    equipmentCategory?: string;
    name?: string;
    serialNumber?: string | null;
    manufacturerSerial?: string | null;
    qrCode?: string | null;
    details?: Record<string, unknown>;
    isActive?: boolean;
  },
) {
  return request<InventoryAssetRow>(`/inventory/assets/${assetId}`, 'PATCH', body);
}

export function softDeleteInventoryAsset(assetId: string) {
  return request<InventoryAssetRow>(`/inventory/assets/${assetId}`, 'DELETE');
}

export function getInventoryAssetPhotoUrl(assetId: string) {
  return request<{ photoUrl: string | null }>(`/inventory/assets/${assetId}/photo`, 'GET');
}

export async function uploadInventoryAssetPhoto(assetId: string, file: File) {
  const post = () => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${API_BASE}/inventory/assets/${assetId}/photo`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: fd,
    });
  };
  let response = await post();
  if (response.status === 401) {
    const newAccess = await refreshAccessToken();
    if (newAccess) response = await post();
    else clearSession();
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new ApiError(message ?? 'Error al subir imagen', response.status, data.message);
  }
  return response.json() as Promise<{ photoUrl: string; photoStorageKey: string }>;
}

/** Descarga CSV de inventario (respuesta binaria). */
export async function downloadInventoryExport(
  departmentId: string,
  params: { category?: string; search?: string; includeInactive?: boolean },
): Promise<Blob> {
  const q = new URLSearchParams();
  if (params.category) q.set('category', params.category);
  if (params.search?.trim()) q.set('search', params.search.trim());
  if (params.includeInactive) q.set('includeInactive', 'true');
  const qs = q.toString();
  const path = `/inventory/departments/${departmentId}/assets/export${qs ? `?${qs}` : ''}`;
  const response = await authFetch(path, { method: 'GET' });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join('; ') : data.message;
    throw new ApiError(message ?? 'Error al exportar', response.status, data.message);
  }
  return response.blob();
}
