import { FormEvent, lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Link, useSearchParams } from 'react-router-dom';
import {
  addGroupMember,
  createDmChannel,
  fetchAttachmentBlob,
  forwardChannelAttachments,
  createGroupChannel,
  getChannelMessages,
  getChatChannels,
  getChatPresence,
  getChatUsers,
  getGroupMembers,
  getChatAttachmentIconKind,
  getChatAttachmentPreviewKind,
  leaveGroupChannel,
  markChannelRead,
  removeGroupMember,
  sendChannelMessage,
  sendChannelMessageWithFile,
  softDeleteChatConversation,
} from '../lib/api';
import { authGet } from '../lib/authStorage';
import { ensureRealtimeConnected, subscribeRealtimeStatus } from '../lib/chatRealtime';
import {
  getChatSoundProfile,
  getDesktopNotificationPermission,
  isChatSoundEnabled,
  notifyDesktopIfBackground,
  persistChatSoundEnabled,
  persistChatSoundProfile,
  playChatNudgeBuzz,
  playIncomingChatAlert,
  requestDesktopNotificationPermission,
  triggerNudgeDeviceVibrate,
  type ChatSoundProfile,
} from '../lib/chatMessageAlerts';
import type { ChatAttachment, ChatMessage, GroupMember } from '../lib/api';
import type { EmojiClickData, Theme } from 'emoji-picker-react';

const LazyEmojiPicker = lazy(() => import('emoji-picker-react'));

const MESSAGES_PAGE_SIZE = 50;

type Channel = Awaited<ReturnType<typeof getChatChannels>>[number];
type Message = ChatMessage;
type ChatUser = Awaited<ReturnType<typeof getChatUsers>>[number];
type ForwardTarget = { kind: 'channel' | 'user'; id: string };

/** Tipo título sutíl si el dato viene en mayúsculas (típico en datos maestros). */
function formatDisplayName(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const hasLetter = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(s);
  if (hasLetter && s === s.toUpperCase()) {
    return s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ');
  }
  return s;
}

/** Texto comparable para búsqueda: sin acentos, minúsculas, espacios colapsados. */
function normalizeForSearch(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Coincidencias con nombre incompleto: subcadena en el nombre completo,
 * o varias palabras (cada token debe aparecer como prefijo de alguna palabra o como subcadena).
 * Documento y correo: subcadena normalizada.
 */
function matchesPersonInviteSearch(user: ChatUser, queryRaw: string): boolean {
  const q = normalizeForSearch(queryRaw);
  if (!q) return true;
  const idNorm = normalizeForSearch(user.employeeId);
  const emailNorm = normalizeForSearch(user.email ?? '');
  if (idNorm.includes(q) || emailNorm.includes(q)) return true;

  const nameNorm = normalizeForSearch(user.name);
  if (nameNorm.includes(q)) return true;

  const tokens = q.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length <= 1) {
    return false;
  }
  const words = nameNorm.split(/\s+/).filter(Boolean);
  return tokens.every((t) => words.some((w) => w.startsWith(t) || w.includes(t)) || nameNorm.includes(t));
}

function sortChannelsByActivity(list: Channel[]): Channel[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.last_message?.created_at ?? a.updated_at).getTime();
    const tb = new Date(b.last_message?.created_at ?? b.updated_at).getTime();
    return tb - ta;
  });
}

function formatShortTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** Fecha corta + hora para cabecera de burbuja de mensaje. */
function formatMessageTimestamp(iso: string) {
  const d = new Date(iso);
  const datePart = d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

/** Compara si dos ISO timestamps caen en el mismo día calendario local. */
function isSameLocalDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Etiqueta de separador de fecha: "Hoy", "Ayer" o "lun, 14 may". */
function formatDateDividerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(iso, now.toISOString())) return 'Hoy';
  if (isSameLocalDay(iso, yesterday.toISOString())) return 'Ayer';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Hash determinista para asignar color de avatar (paleta --color-avatar-1..8). */
function avatarColorFor(seed: string): string {
  const colors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Iniciales (1 o 2 letras) a partir de un nombre. */
function getNameInitials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Lee el tema actual del documento; usado por emoji-picker. */
function getCurrentDocumentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Mapeo de getChatAttachmentIconKind() → ícono Tabler outline. */
function tablerIconForAttachmentKind(kind: string): string {
  switch (kind) {
    case 'pdf':
      return 'ti-file-type-pdf';
    case 'doc':
      return 'ti-file-type-doc';
    case 'xls':
      return 'ti-file-type-xls';
    case 'zip':
      return 'ti-file-zip';
    case 'audio':
      return 'ti-music';
    default:
      return 'ti-file';
  }
}

function formatFileSize(n: number) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const CHAT_FILE_LIMITS_MB = {
  image: 10,
  video: 100,
  file: 25,
} as const;

const CHAT_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
]);

const CLIPBOARD_FILE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

function triggerBrowserDownload(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadChatAttachment(attachment: Pick<ChatAttachment, 'id' | 'originalName'>) {
  const blob = await fetchAttachmentBlob(attachment.id);
  const url = URL.createObjectURL(blob);
  try {
    triggerBrowserDownload(url, attachment.originalName);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function normalizeClipboardFile(file: File) {
  if (file.name.trim()) return file;
  const ext = CLIPBOARD_FILE_EXTENSIONS[file.type] ?? 'bin';
  const safeStamp = new Date().toISOString().replace(/[:.]/g, '-');
  return new File([file], `pegado-${safeStamp}.${ext}`, {
    type: file.type || 'application/octet-stream',
    lastModified: Date.now(),
  });
}

function validateChatFile(file: File): string | null {
  const mime = file.type.toLowerCase();
  if (!CHAT_ALLOWED_MIME.has(mime)) {
    return 'Tipo de archivo no permitido.';
  }
  const kind = getChatAttachmentPreviewKind(mime);
  const maxMb = kind === 'image' ? CHAT_FILE_LIMITS_MB.image : kind === 'video' ? CHAT_FILE_LIMITS_MB.video : CHAT_FILE_LIMITS_MB.file;
  if (file.size > maxMb * 1024 * 1024) {
    return `Archivo muy grande. Máximo ${maxMb} MB.`;
  }
  return null;
}

function ChatAttachmentView({
  attachment,
  onPreviewImage,
}: {
  attachment: ChatAttachment;
  onPreviewImage?: (attachment: ChatAttachment) => void;
}) {
  const previewKind = getChatAttachmentPreviewKind(attachment.mimeType);
  const iconKind = getChatAttachmentIconKind(attachment.mimeType, attachment.originalName);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ensureObjectUrl() {
    if (objectUrl) return objectUrl;
    setLoading(true);
    try {
      const blob = await fetchAttachmentBlob(attachment.id);
      const next = URL.createObjectURL(blob);
      setObjectUrl(next);
      return next;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (previewKind !== 'image' && previewKind !== 'video' && previewKind !== 'audio') return;
    void ensureObjectUrl().catch(() => undefined);
  }, [attachment.id, previewKind]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  async function openDownload() {
    try {
      if (objectUrl) {
        triggerBrowserDownload(objectUrl, attachment.originalName);
        return;
      }
      await downloadChatAttachment(attachment);
    } catch {
      /* ignore */
    }
  }

  const meta = [formatFileSize(attachment.sizeBytes), attachment.mimeType].filter(Boolean).join(' · ');

  if (previewKind === 'image') {
    return (
      <article className="chat-attachment-card chat-attachment-card--media">
        <button
          type="button"
          className="chat-attachment-preview-btn"
          onClick={() => onPreviewImage?.(attachment)}
          aria-label={`Abrir vista previa de ${attachment.originalName}`}
        >
          {objectUrl ? (
            <img className="chat-attachment-preview chat-attachment-preview--image" src={objectUrl} alt={attachment.originalName} loading="lazy" />
          ) : (
            <div className="chat-attachment-preview-placeholder">{loading ? 'Cargando imagen…' : 'Imagen'}</div>
          )}
        </button>
        <div className="chat-attachment-card__body">
          <span className="chat-attachment-card__name" title={attachment.originalName}>{attachment.originalName}</span>
          <span className="chat-attachment-meta">{meta}</span>
          <button type="button" className="chat-attachment-download" onClick={() => void openDownload()}>
            <i className="ti ti-download" aria-hidden="true" />
            <span>Descargar</span>
          </button>
        </div>
      </article>
    );
  }

  if (previewKind === 'video') {
    return (
      <article className="chat-attachment-card chat-attachment-card--media">
        {objectUrl ? (
          <video className="chat-attachment-preview chat-attachment-preview--video" controls preload="metadata" src={objectUrl} />
        ) : (
          <div className="chat-attachment-preview-placeholder">{loading ? 'Cargando video…' : 'Video'}</div>
        )}
        <div className="chat-attachment-card__body">
          <span className="chat-attachment-card__name" title={attachment.originalName}>{attachment.originalName}</span>
          <span className="chat-attachment-meta">{meta}</span>
          <button type="button" className="chat-attachment-download" onClick={() => void openDownload()}>
            <i className="ti ti-download" aria-hidden="true" />
            <span>Descargar</span>
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="chat-attachment-card">
      <span className={`chat-attachment-thumb chat-attachment-thumb--${iconKind}`} aria-hidden="true">
        <i className={`ti ${tablerIconForAttachmentKind(iconKind)}`} aria-hidden="true" />
      </span>
      <div className="chat-attachment-card__body">
        <span className="chat-attachment-card__name" title={attachment.originalName}>{attachment.originalName}</span>
        <span className="chat-attachment-meta">{meta}</span>
      </div>
      <button type="button" className="chat-attachment-download" onClick={() => void openDownload()}>
        <i className="ti ti-download" aria-hidden="true" />
        <span>Descargar</span>
      </button>
    </article>
  );
}

type MessageActionMenuProps = {
  message: Message;
  onCopyText: () => void;
  onDownloadAttachments: () => void;
  onForwardAttachments: () => void;
};

function MessageActionMenu({
  message,
  onCopyText,
  onDownloadAttachments,
  onForwardAttachments,
}: MessageActionMenuProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const hasText = Boolean(message.body?.trim());
  const hasAttachments = (message.attachments?.length ?? 0) > 0;

  useEffect(() => {
    function onPointerDown(ev: PointerEvent) {
      const el = menuRef.current;
      if (!el?.open) return;
      const t = ev.target;
      if (t instanceof Node && el.contains(t)) return;
      el.open = false;
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  if (!hasText && !hasAttachments) return null;

  function closeMenu() {
    const el = menuRef.current;
    if (el) el.open = false;
  }

  return (
    <details
      ref={menuRef}
      className="chat-message-menu"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) {
          document.querySelectorAll('.chat-message-menu[open]').forEach((node) => {
            if (node !== menuRef.current) node.removeAttribute('open');
          });
        }
      }}
    >
      <summary className="chat-message-menu__trigger" aria-label="Opciones del mensaje">
        <i className="ti ti-dots" aria-hidden="true" />
      </summary>
      <ul className="chat-message-menu__list" role="menu">
        {hasText ? (
          <li role="none">
            <button
              type="button"
              className="chat-channel-menu__item"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onCopyText();
              }}
            >
              Copiar texto
            </button>
          </li>
        ) : null}
        {hasAttachments ? (
          <li role="none">
            <button
              type="button"
              className="chat-channel-menu__item"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onDownloadAttachments();
              }}
            >
              Descargar adjuntos
            </button>
          </li>
        ) : null}
        {hasAttachments ? (
          <li role="none">
            <button
              type="button"
              className="chat-channel-menu__item"
              role="menuitem"
              onClick={() => {
                closeMenu();
                onForwardAttachments();
              }}
            >
              Reenviar
            </button>
          </li>
        ) : null}
      </ul>
    </details>
  );
}

function maskEmail(email: string | null | undefined) {
  if (!email) return null;
  const [u, dom] = email.split('@');
  if (!dom) return '···';
  const left = u.length <= 2 ? '·' : `${u.slice(0, 2)}···`;
  return `${left}@${dom}`;
}

function previewText(body: string | null, author: string) {
  const who = formatDisplayName(author);
  const t = (body ?? '').trim();
  if (!t) return `${who}: Mensaje sin contenido`;
  const short = t.length > 120 ? `${t.slice(0, 120)}…` : t;
  return `${who}: ${short}`;
}

function lastMessagePreview(msg: Pick<Message, 'body' | 'attachments' | 'messageType'>) {
  if (msg.messageType === 'nudge') return '🔔 Zumbido';
  const body = (msg.body ?? '').trim();
  const atts = msg.attachments ?? [];
  if (atts.length > 0) {
    const label = atts[0]?.originalName?.trim() || 'archivo';
    if (body) return `${body} · 📎 ${label}`;
    return `📎 ${label}`;
  }
  return body || 'Mensaje sin contenido';
}

function channelLastMessagePreview(msg: NonNullable<Channel['last_message']>) {
  if (msg.message_type === 'nudge') return '🔔 Zumbido';
  const body = (msg.body ?? '').trim();
  const attachmentCount = Number(msg.attachment_count ?? 0);
  const attachmentName = (msg.attachment_name ?? '').trim() || 'archivo';
  if (attachmentCount > 0) {
    if (body) return `${body} · 📎 ${attachmentName}`;
    return `📎 ${attachmentName}`;
  }
  return body || 'Mensaje sin contenido';
}

type ChannelListRowProps = {
  channel: Channel;
  isActive: boolean;
  isArchived: boolean;
  isMuted: boolean;
  onSelect: () => void;
  onMarkRead: (channelId: string) => void;
  onSync: (channelId: string) => void;
  onToggleArchive: (channelId: string, nextArchived: boolean) => void;
  onToggleMute: (channelId: string, nextMuted: boolean) => void;
  onSoftDelete: (channelId: string) => void;
  onLeaveGroup: (channelId: string) => void;
};

function ChannelListRow({
  channel,
  isActive,
  isArchived,
  isMuted,
  onSelect,
  onMarkRead,
  onSync,
  onToggleArchive,
  onToggleMute,
  onSoftDelete,
  onLeaveGroup,
}: ChannelListRowProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  function closeMenu() {
    const el = menuRef.current;
    if (el) el.open = false;
  }

  useEffect(() => {
    function onPointerDown(ev: PointerEvent) {
      const el = menuRef.current;
      if (!el?.open) return;
      const t = ev.target;
      if (t instanceof Node && el.contains(t)) return;
      el.open = false;
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  const displayName = formatDisplayName(channel.name);
  return (
    <div
      className={`chat-channel-row-wrap${isActive ? ' chat-channel-row-wrap--active' : ''}${isArchived ? ' chat-channel-row-wrap--archived' : ''}`}
    >
      <button type="button" className="chat-channel-row" onClick={onSelect}>
        <span
          className="chat-channel-row__avatar"
          style={{ background: avatarColorFor(channel.id) }}
          aria-hidden="true"
        >
          {getNameInitials(displayName)}
        </span>
        <div className="chat-channel-row__main">
          <div className="chat-channel-row__top">
            <span className="chat-channel-row__name-block">
              <span className="chat-channel-row__name">{displayName}</span>
              {isArchived ? (
                <span className="chat-channel-archived-pill" title="Archivada en este dispositivo">
                  Archivado
                </span>
              ) : null}
              {isMuted ? (
                <span className="chat-channel-muted-pill" title="Sin sonido, toasts ni notificaciones de escritorio para este chat">
                  Silenciada
                </span>
              ) : null}
              {channel.channel_type === 'group' && channel.my_role === 'admin' ? (
                <span className="chat-group-admin-badge" title="Administrador del grupo">
                  Admin
                </span>
              ) : null}
            </span>
            {channel.last_message ? (
              <time className="chat-channel-row__time" dateTime={channel.last_message.created_at}>
                {formatShortTime(channel.last_message.created_at)}
              </time>
            ) : null}
          </div>
          <div className="chat-channel-row__bottom">
            <span className="chat-channel-row__preview">
              {channel.last_message
                ? previewText(
                    channelLastMessagePreview(channel.last_message),
                    channel.last_message.author_name,
                  )
                : 'Sin mensajes'}
            </span>
            {channel.unread_count > 0 ? <span className="chat-unread">{channel.unread_count}</span> : null}
          </div>
        </div>
      </button>
      <details
        ref={menuRef}
        className="chat-channel-menu"
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open) {
            document.querySelectorAll('.chat-channel-menu[open]').forEach((node) => {
              if (node !== menuRef.current) node.removeAttribute('open');
            });
          }
        }}
      >
        <summary
          className="chat-channel-menu__trigger"
          aria-label="Opciones del chat"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <i className="ti ti-dots" aria-hidden="true" />
        </summary>
        <ul className="chat-channel-menu__list" role="menu">
          <li role="none">
            <button
              type="button"
              className="chat-channel-menu__item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                void onMarkRead(channel.id);
              }}
            >
              Marcar como leído
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              className="chat-channel-menu__item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                void onSync(channel.id);
              }}
            >
              Actualizar
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              className="chat-channel-menu__item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onToggleArchive(channel.id, !isArchived);
              }}
            >
              {isArchived ? 'Desarchivar conversación' : 'Archivar conversación'}
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              className="chat-channel-menu__item"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onToggleMute(channel.id, !isMuted);
              }}
            >
              {isMuted ? 'Activar alertas de esta conversación' : 'Silenciar esta conversación'}
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              className="chat-channel-menu__item chat-channel-menu__item--danger"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onSoftDelete(channel.id);
              }}
            >
              Eliminar conversación
            </button>
          </li>
          {channel.channel_type === 'ticket' && channel.ticket_id ? (
            <li role="none">
              <Link
                className="chat-channel-menu__item"
                to={`/tickets/${channel.ticket_id}`}
                onClick={() => {
                  closeMenu();
                }}
              >
                Ver ticket
              </Link>
            </li>
          ) : null}
          {channel.channel_type === 'group' ? (
            <li role="none">
              <button
                type="button"
                className="chat-channel-menu__item chat-channel-menu__item--danger"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  closeMenu();
                  onLeaveGroup(channel.id);
                }}
              >
                Salir del grupo
              </button>
            </li>
          ) : null}
        </ul>
      </details>
    </div>
  );
}

export function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const channelQueryParam = searchParams.get('channel') ?? '';
  const [mobilePanel, setMobilePanel] = useState<'channels' | 'messages' | 'people'>('channels');
  const [showPeoplePanel, setShowPeoplePanel] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const channelsRef = useRef<Channel[]>([]);
  const [messageToasts, setMessageToasts] = useState<
    { id: string; channelId: string; title: string; body: string }[]
  >([]);
  const [chatSoundEnabled, setChatSoundEnabled] = useState(() =>
    typeof window !== 'undefined' ? isChatSoundEnabled() : true,
  );
  const chatSoundEnabledRef = useRef(chatSoundEnabled);
  const [notifPermission, setNotifPermission] = useState<'unsupported' | NotificationPermission>(() =>
    getDesktopNotificationPermission(),
  );
  const [soundProfile, setSoundProfile] = useState<ChatSoundProfile>(() =>
    typeof window !== 'undefined' ? getChatSoundProfile() : 'classic',
  );
  const [users, setUsers] = useState<ChatUser[]>([]);
  /** Búsqueda en panel Canales: canales y atajos de personas. */
  const [chatSearch, setChatSearch] = useState('');
  /** Filtro solo en la columna Personas (visible en móvil al abrir esa pestaña). */
  const [peoplePanelSearch, setPeoplePanelSearch] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [activeChannelId, setActiveChannelId] = useState('');
  /** Para deshacer un cambio de chat (p. ej. clic por error). */
  const [previousChannelId, setPreviousChannelId] = useState<string | null>(null);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [composerHint, setComposerHint] = useState('');
  const [wsState, setWsState] = useState<'connecting' | 'live' | 'offline'>('offline');
  const [refreshing, setRefreshing] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteQuery, setInviteQuery] = useState('');
  const [archivedChannelIds, setArchivedChannelIds] = useState<string[]>([]);
  const [mutedChannelIds, setMutedChannelIds] = useState<string[]>([]);
  const mutedChannelIdsRef = useRef<string[]>([]);
  /** Instancia Socket.IO (también en `socketRef` para handlers sin dependencias obsoletas). */
  const [socket, setSocket] = useState<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const chatRootRef = useRef<HTMLElement>(null);
  const typingClearTimerRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const groupMembersDialogRef = useRef<HTMLDialogElement>(null);
  const createGroupInputRef = useRef<HTMLInputElement>(null);
  const activeChannelIdRef = useRef('');
  const socketRef = useRef<Socket | null>(null);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilePreviewUrl, setPendingFilePreviewUrl] = useState<string | null>(null);
  const [forwardSourceMessage, setForwardSourceMessage] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<ForwardTarget | null>(null);
  const [forwardQuery, setForwardQuery] = useState('');
  const [forwarding, setForwarding] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState<string | null>(null);
  const [previewAttachmentLoading, setPreviewAttachmentLoading] = useState(false);
  const [previewAttachmentError, setPreviewAttachmentError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composerSelStartRef = useRef(0);
  const composerSelEndRef = useRef(0);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const typingLastEmitRef = useRef(0);
  const messagesRef = useRef<Message[]>([]);
  const loadingOlderRef = useRef(false);
  const hasMoreOlderRef = useRef(false);
  const loadMessagesSeqRef = useRef(0);
  const loadedChannelIdRef = useRef('');
  const forwardDialogRef = useRef<HTMLDialogElement>(null);
  const previewDialogRef = useRef<HTMLDialogElement>(null);

  const currentUserId = authGet('user_id') ?? '';

  function flashComposerHint(message: string, ms = 4000) {
    setComposerHint(message);
    window.setTimeout(() => setComposerHint(''), ms);
  }

  function applyPendingFileSelection(file: File | null) {
    if (!file) {
      setPendingFile(null);
      return true;
    }
    const validation = validateChatFile(file);
    if (validation) {
      setPendingFile(null);
      flashComposerHint(validation, 5000);
      return false;
    }
    setComposerHint('');
    setPendingFile(file);
    return true;
  }

  function emitSyncRooms() {
    socketRef.current?.emit('chat:sync-rooms');
  }

  /** Mantiene `?channel=` alineado con la selección para que loadChannels no restaure un id viejo desde la URL. */
  function syncChannelInUrl(channelId: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (channelId) next.set('channel', channelId);
        else next.delete('channel');
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chat_archived_channel_ids');
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      const safe = ids.filter((v): v is string => typeof v === 'string');
      setArchivedChannelIds(safe);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('chat_archived_channel_ids', JSON.stringify(archivedChannelIds));
    } catch {
      /* ignore */
    }
  }, [archivedChannelIds]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chat_muted_channel_ids');
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      const safe = ids.filter((v): v is string => typeof v === 'string');
      setMutedChannelIds(safe);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('chat_muted_channel_ids', JSON.stringify(mutedChannelIds));
    } catch {
      /* ignore */
    }
  }, [mutedChannelIds]);

  useEffect(() => {
    mutedChannelIdsRef.current = mutedChannelIds;
  }, [mutedChannelIds]);

  useEffect(() => {
    chatSoundEnabledRef.current = chatSoundEnabled;
  }, [chatSoundEnabled]);

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!createGroupOpen) return;
    const t = window.setTimeout(() => createGroupInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [createGroupOpen]);

  function openGroupMembersDialog() {
    groupMembersDialogRef.current?.showModal();
  }

  function closeGroupMembersDialog() {
    groupMembersDialogRef.current?.close();
  }

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 899px)');
    function sync() {
      setIsNarrowViewport(mq.matches);
    }
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** Selección explícita desde la lista o al abrir un DM/grupo. Guarda el chat actual como “anterior”. */
  function activateChannelForUser(nextId: string) {
    if (!nextId) return;
    if (nextId === activeChannelId) {
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches) {
        setMobilePanel('messages');
      }
      return;
    }
    // Actualiza de inmediato el ref para evitar carreras entre render y eventos socket.
    activeChannelIdRef.current = nextId;
    if (activeChannelId) setPreviousChannelId(activeChannelId);
    setActiveChannelId(nextId);
    syncChannelInUrl(nextId);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches) {
      setMobilePanel('messages');
    }
  }

  function goBackInThread() {
    const hadPrevious =
      Boolean(previousChannelId) && channels.some((c) => c.id === previousChannelId);
    if (hadPrevious && previousChannelId) {
      const cur = activeChannelId;
      setActiveChannelId(previousChannelId);
      syncChannelInUrl(previousChannelId);
      setPreviousChannelId(cur && cur !== previousChannelId ? cur : null);
      return;
    }
    setPreviousChannelId(null);
    if (isNarrowViewport) setMobilePanel('channels');
  }

  async function loadChannels(selectRequested = true) {
    const data = await getChatChannels();
    setChannels(sortChannelsByActivity(data));
    emitSyncRooms();
    if (!selectRequested) return;
    const requested = searchParams.get('channel');
    if (requested && data.some((item) => item.id === requested)) {
      setActiveChannelId(requested);
    } else if (!activeChannelIdRef.current && data.length > 0) {
      const pick = data[0].id;
      setActiveChannelId(pick);
      syncChannelInUrl(pick);
    }
  }

  async function loadUsers() {
    const [allUsers, presence] = await Promise.all([getChatUsers(), getChatPresence()]);
    setUsers(allUsers);
    setOnlineUserIds(presence);
  }

  async function loadMessages(channelId: string) {
    const seq = ++loadMessagesSeqRef.current;
    stickToBottomRef.current = true;
    setTypingUserId(null);
    setPendingFile(null);
    const { messages: rows, has_more } = await getChannelMessages(channelId, { limit: MESSAGES_PAGE_SIZE });
    if (activeChannelIdRef.current !== channelId || loadMessagesSeqRef.current !== seq) {
      return;
    }
    loadedChannelIdRef.current = channelId;
    setMessages(rows.map(normalizeMessage));
    setHasMoreOlder(has_more);
    hasMoreOlderRef.current = has_more;
  }

  function normalizeMessage(m: Message): Message {
    const raw = m as unknown as { message_type?: string };
    const messageType = m.messageType ?? raw.message_type ?? 'text';
    return { ...m, attachments: m.attachments ?? [], messageType };
  }

  async function loadOlderMessages() {
    const channelId = activeChannelIdRef.current;
    if (!channelId || loadingOlderRef.current || !hasMoreOlderRef.current) return;
    const firstId = messagesRef.current[0]?.id;
    if (!firstId) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = messagesScrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    stickToBottomRef.current = false;
    try {
      const { messages: older, has_more } = await getChannelMessages(channelId, {
        limit: MESSAGES_PAGE_SIZE,
        before: firstId,
      });
      if (activeChannelIdRef.current !== channelId) return;
      const normalized = older.map(normalizeMessage);
      setMessages((prev) => {
        const existing = new Set(prev.map((x) => x.id));
        const merged = normalized.filter((x) => !existing.has(x.id));
        return [...merged, ...prev];
      });
      setHasMoreOlder(has_more);
      hasMoreOlderRef.current = has_more;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
    requestAnimationFrame(() => {
      const box = messagesScrollRef.current;
      if (!box || activeChannelIdRef.current !== channelId) return;
      const newHeight = box.scrollHeight;
      box.scrollTop = prevTop + (newHeight - prevHeight);
    });
  }

  function onMessagesScroll() {
    const el = messagesScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const nearBottom = scrollHeight - scrollTop - clientHeight < 80;
    stickToBottomRef.current = nearBottom;
    if (
      scrollTop < 64 &&
      hasMoreOlderRef.current &&
      !loadingOlderRef.current &&
      messagesRef.current.length > 0
    ) {
      void loadOlderMessages();
    }
  }

  function emitTyping(typing: boolean) {
    const ch = activeChannelIdRef.current;
    if (!ch || !socketRef.current?.connected) return;
    socketRef.current.emit('chat:typing', { channel_id: ch, typing });
  }

  function triggerChatNudgeShake() {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const el = chatRootRef.current;
    if (!el) return;
    el.classList.remove('chat-app--nudge-shake');
    void el.offsetWidth;
    el.classList.add('chat-app--nudge-shake');
    window.setTimeout(() => {
      el.classList.remove('chat-app--nudge-shake');
    }, 1750);
  }

  function fireLocalNudgeFeedback() {
    playChatNudgeBuzz();
    triggerNudgeDeviceVibrate();
    triggerChatNudgeShake();
  }

  function sendNudge() {
    const ch = activeChannelIdRef.current;
    if (!ch) return;
    setComposerHint('');
    if (socketRef.current?.connected) {
      socketRef.current.emit(
        'chat:send',
        { channel_id: ch, body: '', message_type: 'nudge' },
        (ack: { ok?: boolean; error?: string } | undefined) => {
          if (ack?.ok === false && ack?.error === 'rate_limited') {
            setComposerHint('Espera unos segundos entre zumbidos.');
            window.setTimeout(() => setComposerHint(''), 4000);
            return;
          }
          fireLocalNudgeFeedback();
        },
      );
    } else {
      void (async () => {
        try {
          const msg = normalizeMessage(await sendChannelMessage(ch, '', { messageType: 'nudge' }));
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          await markChannelRead(ch);
          setChannels((prev) =>
            sortChannelsByActivity(
              prev.map((row) =>
                row.id === ch
                  ? {
                      ...row,
                      last_message: {
                        body: msg.body ?? '',
                        message_type: msg.messageType ?? 'nudge',
                        created_at: msg.createdAt,
                        author_name: msg.user.name,
                      },
                      updated_at: msg.createdAt,
                      unread_count: 0,
                    }
                  : row,
              ),
            ),
          );
          fireLocalNudgeFeedback();
        } catch {
          setComposerHint('No se pudo enviar el zumbido.');
          window.setTimeout(() => setComposerHint(''), 4000);
        }
      })();
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([loadChannels(false), loadUsers()]);
      const id = activeChannelIdRef.current;
      if (id) await loadMessages(id);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadChannels().catch(() => undefined);
    loadUsers().catch(() => undefined);
  }, [channelQueryParam]);

  useEffect(() => {
    if (previousChannelId && !channels.some((c) => c.id === previousChannelId)) {
      setPreviousChannelId(null);
    }
  }, [channels, previousChannelId]);

  useEffect(() => {
    void ensureRealtimeConnected('ChatPage.mount');
    const unsubscribe = subscribeRealtimeStatus((status, shared) => {
      setWsState(status);
      socketRef.current = shared;
      setSocket(shared);
    });
    return () => {
      window.clearTimeout(typingClearTimerRef.current);
      unsubscribe();
      socketRef.current = null;
      setSocket(null);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    function onMessage(payload: { channel_id: string; message: Message }) {
      const active = activeChannelIdRef.current;
      const msg = normalizeMessage(payload.message);
      if (payload.channel_id === active && payload.channel_id === loadedChannelIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      setChannels((prev) => {
        if (!prev.some((ch) => ch.id === payload.channel_id)) {
          void getChatChannels()
            .then((data) => {
              setChannels(sortChannelsByActivity(data));
              queueMicrotask(() => {
                socketRef.current?.emit('chat:sync-rooms');
              });
            })
            .catch(() => undefined);
          return prev;
        }
        return sortChannelsByActivity(
          prev.map((ch) => {
            if (ch.id !== payload.channel_id) return ch;
            const isViewing = payload.channel_id === active;
            return {
              ...ch,
              last_message: {
                body: msg.body ?? '',
                message_type: msg.messageType ?? 'text',
                created_at: msg.createdAt,
                author_name: msg.user.name,
              },
              updated_at: msg.createdAt,
              unread_count: isViewing ? ch.unread_count : ch.unread_count + 1,
            };
          }),
        );
      });

      const me = authGet('user_id') ?? '';
      if (msg.user.id !== me) {
        const channelMuted = mutedChannelIdsRef.current.includes(payload.channel_id);
        const isNudge = msg.messageType === 'nudge';

        if (isNudge) {
          if (!channelMuted) {
            fireLocalNudgeFeedback();
            const chRowNudge = channelsRef.current.find((c) => c.id === payload.channel_id);
            const titleNudge = formatDisplayName(chRowNudge?.name) || 'Chat';
            if (document.visibilityState === 'hidden') {
              notifyDesktopIfBackground(titleNudge, '🔔 Zumbido', { forceSilent: true });
            }
            if (payload.channel_id !== active) {
              setMessageToasts((prev) => {
                if (prev.some((t) => t.id === msg.id)) return prev;
                window.setTimeout(() => {
                  setMessageToasts((p) => p.filter((t) => t.id !== msg.id));
                }, 6000);
                return [...prev, { id: msg.id, channelId: payload.channel_id, title: titleNudge, body: '🔔 Zumbido' }];
              });
            }
          }
        } else {
          const chRow = channelsRef.current.find((c) => c.id === payload.channel_id);
          const bodyLower = (msg.body ?? '').toLowerCase();
          const uname = (authGet('user_name') ?? '').trim();
          const mention =
            uname.length >= 3 && bodyLower.includes('@') && bodyLower.includes(uname.toLowerCase());
          const alertKind = chRow?.channel_type === 'dm' ? 'dm' : mention ? 'mention' : 'default';
          if (!channelMuted) {
            playIncomingChatAlert(alertKind);
          }
          const title = formatDisplayName(chRow?.name) || 'Chat';
          const bodyText = lastMessagePreview(msg);
          if (!channelMuted && payload.channel_id !== active) {
            setMessageToasts((prev) => {
              if (prev.some((t) => t.id === msg.id)) return prev;
              window.setTimeout(() => {
                setMessageToasts((p) => p.filter((t) => t.id !== msg.id));
              }, 6000);
              return [...prev, { id: msg.id, channelId: payload.channel_id, title, body: bodyText }];
            });
          }
          if (!channelMuted) {
            notifyDesktopIfBackground(title, bodyText, { forceSilent: chatSoundEnabledRef.current });
          }
        }
      }
    }

    function onPresence(payload: { online_user_ids: string[] }) {
      setOnlineUserIds(payload.online_user_ids || []);
    }

    function onTyping(payload: { channel_id: string; user_id: string; typing: boolean }) {
      const active = activeChannelIdRef.current;
      const me = authGet('user_id');
      if (payload.channel_id !== active || payload.user_id === me) return;
      if (payload.typing) {
        setTypingUserId(payload.user_id);
        window.clearTimeout(typingClearTimerRef.current);
        typingClearTimerRef.current = window.setTimeout(() => setTypingUserId(null), 4000);
      } else {
        setTypingUserId((cur) => (cur === payload.user_id ? null : cur));
      }
    }

    socket.on('chat:message', onMessage);
    socket.on('chat:presence', onPresence);
    socket.on('chat:typing', onTyping);
    socket.emit('chat:sync-rooms');

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:presence', onPresence);
      socket.off('chat:typing', onTyping);
    };
  }, [socket]);

  useEffect(() => {
    function onVisibility() {
      setNotifPermission(getDesktopNotificationPermission());
      if (document.visibilityState !== 'visible') return;
      if (!authGet('access_token')) return;
      socketRef.current?.emit('chat:sync-rooms');
      void Promise.all([getChatUsers(), getChatPresence()])
        .then(([allUsers, presence]) => {
          setUsers(allUsers);
          setOnlineUserIds(presence);
        })
        .catch(() => undefined);
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  /** Re-suscribe salas Socket.IO con la membresía actual (DM/grupos/tickets) para no perder mensajes en tiempo real. */
  useEffect(() => {
    const t = window.setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('chat:sync-rooms');
      }
    }, 45_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!activeChannelId) return;
    // Limpia el hilo al cambiar de canal para no mezclar mensajes por carreras asíncronas.
    loadedChannelIdRef.current = '';
    setMessages([]);
    setHasMoreOlder(false);
    hasMoreOlderRef.current = false;
    setTypingUserId(null);
    loadMessages(activeChannelId)
      .then(() => markChannelRead(activeChannelId))
      .then(() =>
        setChannels((prev) =>
          prev.map((ch) => (ch.id === activeChannelId ? { ...ch, unread_count: 0 } : ch)),
        ),
      )
      .then(() => loadChannels(false))
      .catch(() => undefined);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches) {
      setMobilePanel('messages');
    }
  }, [activeChannelId]);

  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChannelId]);

  const activeChannel = channels.find((item) => item.id === activeChannelId);

  const dmPeerOnline = useMemo(() => {
    if (!activeChannel || activeChannel.channel_type !== 'dm' || !activeChannel.dm_peer_user_id) {
      return null;
    }
    return onlineUserIds.includes(activeChannel.dm_peer_user_id);
  }, [activeChannel, onlineUserIds]);

  useEffect(() => {
    if (!activeChannelId || activeChannel?.channel_type !== 'group') {
      setGroupMembers([]);
      setInviteUserId('');
      setInviteQuery('');
      return;
    }
    let cancelled = false;
    setGroupMembersLoading(true);
    getGroupMembers(activeChannelId)
      .then((rows) => {
        if (!cancelled) setGroupMembers(rows);
      })
      .catch(() => {
        if (!cancelled) setGroupMembers([]);
      })
      .finally(() => {
        if (!cancelled) setGroupMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeChannelId, activeChannel?.channel_type]);

  useEffect(() => {
    groupMembersDialogRef.current?.close();
  }, [activeChannelId]);

  useEffect(() => {
    const dialog = forwardDialogRef.current;
    if (!dialog) return;
    if (forwardSourceMessage) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
  }, [forwardSourceMessage]);

  useEffect(() => {
    const dialog = previewDialogRef.current;
    if (!dialog) return;
    if (previewAttachment) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
  }, [previewAttachment]);

  useEffect(() => {
    if (!previewAttachment) {
      setPreviewAttachmentUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewAttachmentLoading(false);
      setPreviewAttachmentError('');
      return;
    }

    let cancelled = false;
    let nextUrl: string | null = null;
    setPreviewAttachmentUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewAttachmentLoading(true);
    setPreviewAttachmentError('');

    void (async () => {
      try {
        const blob = await fetchAttachmentBlob(previewAttachment.id);
        if (cancelled) return;
        nextUrl = URL.createObjectURL(blob);
        setPreviewAttachmentUrl(nextUrl);
      } catch {
        if (!cancelled) {
          setPreviewAttachmentError('No se pudo cargar la imagen.');
        }
      } finally {
        if (!cancelled) {
          setPreviewAttachmentLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [previewAttachment]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function onPointerDown(e: PointerEvent) {
      const pop = emojiPopoverRef.current;
      const btn = emojiButtonRef.current;
      const t = e.target;
      if (t instanceof Node && pop?.contains(t)) return;
      if (t instanceof Node && btn?.contains(t)) return;
      setEmojiPickerOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setEmojiPickerOpen(false);
      composerTextareaRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!pendingFile) {
      setPendingFilePreviewUrl(null);
      return;
    }
    const kind = getChatAttachmentPreviewKind(pendingFile.type || 'application/octet-stream');
    if (kind !== 'image' && kind !== 'video') {
      setPendingFilePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  async function onSend(event?: FormEvent) {
    event?.preventDefault();
    if (!activeChannelId) return;
    const body = text.trim();
    if (!body && !pendingFile) return;

    emitTyping(false);
    window.clearTimeout(typingClearTimerRef.current);

    const fileToSend = pendingFile;
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    const updateChannelPreview = (msg: Message) => {
      setChannels((prev) =>
        sortChannelsByActivity(
          prev.map((ch) =>
            ch.id === activeChannelId
              ? {
                  ...ch,
                  last_message: {
                    body: msg.body ?? '',
                    message_type: msg.messageType ?? 'text',
                    created_at: msg.createdAt,
                    author_name: msg.user.name,
                  },
                  updated_at: msg.createdAt,
                  unread_count: 0,
                }
              : ch,
          ),
        ),
      );
    };

    if (fileToSend) {
      try {
        const msg = normalizeMessage(await sendChannelMessageWithFile(activeChannelId, body, fileToSend));
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        await markChannelRead(activeChannelId);
        updateChannelPreview(msg);
      } catch (e) {
        setPendingFile(fileToSend);
        const message = e instanceof Error ? e.message : 'No se pudo subir el archivo.';
        flashComposerHint(message, 5000);
        return;
      }
    } else if (socketRef.current?.connected) {
      socketRef.current.emit('chat:send', { channel_id: activeChannelId, body });
    } else {
      const msg = normalizeMessage(await sendChannelMessage(activeChannelId, body));
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      await markChannelRead(activeChannelId);
      updateChannelPreview(msg);
    }
    setText('');
  }

  function syncComposerSelection(el: HTMLTextAreaElement) {
    composerSelStartRef.current = el.selectionStart;
    composerSelEndRef.current = el.selectionEnd;
  }

  function insertComposerText(insertedText: string) {
    const ta = composerTextareaRef.current;
    let start = composerSelStartRef.current;
    let end = composerSelEndRef.current;
    if (ta && ta === document.activeElement) {
      start = ta.selectionStart;
      end = ta.selectionEnd;
    }
    const nextPos = start + insertedText.length;
    setText((prev) => prev.slice(0, start) + insertedText + prev.slice(end));
    composerSelStartRef.current = nextPos;
    composerSelEndRef.current = nextPos;
    requestAnimationFrame(() => {
      const el = composerTextareaRef.current;
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(nextPos, nextPos);
      } catch {
        /* ignore */
      }
    });
  }

  function insertEmoji(emoji: string) {
    insertComposerText(emoji);
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  }

  function onComposerPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const clipboard = e.clipboardData;
    const pastedFile =
      Array.from(clipboard.items)
        .find((item) => item.kind === 'file')
        ?.getAsFile() ?? clipboard.files?.[0] ?? null;
    if (!pastedFile) return;

    e.preventDefault();
    const normalizedFile = normalizeClipboardFile(pastedFile);
    const pastedText = clipboard.getData('text/plain');
    if (pastedText) {
      insertComposerText(pastedText);
    }
    if (!applyPendingFileSelection(normalizedFile)) return;
    flashComposerHint(`Archivo listo para enviar: ${normalizedFile.name}`);
  }

  function onComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    syncComposerSelection(e.target);
    setText(e.target.value);
    const ch = activeChannelIdRef.current;
    if (!ch || !socketRef.current?.connected) return;
    const now = Date.now();
    if (now - typingLastEmitRef.current > 2500) {
      typingLastEmitRef.current = now;
      socketRef.current.emit('chat:typing', { channel_id: ch, typing: true });
    }
  }

  async function openDm(userId: string) {
    const dm = await createDmChannel(userId);
    const fresh = await getChatChannels();
    setChannels(sortChannelsByActivity(fresh));
    emitSyncRooms();
    activateChannelForUser(dm.id);
  }

  async function onCreateGroup() {
    const name = newGroupName.trim();
    if (name.length < 2) return;
    try {
      const ch = await createGroupChannel(name);
      setNewGroupName('');
      setCreateGroupOpen(false);
      const fresh = await getChatChannels();
      setChannels(sortChannelsByActivity(fresh));
      emitSyncRooms();
      activateChannelForUser(ch.id);
    } catch {
      /* ignore */
    }
  }

  async function onInviteGroupMember() {
    if (!activeChannelId || !inviteUserId) return;
    try {
      await addGroupMember(activeChannelId, inviteUserId);
      setInviteUserId('');
      setInviteQuery('');
      const rows = await getGroupMembers(activeChannelId);
      setGroupMembers(rows);
      emitSyncRooms();
    } catch {
      /* ignore */
    }
  }

  async function onRemoveGroupMember(targetUserId: string) {
    if (!activeChannelId) return;
    try {
      await removeGroupMember(activeChannelId, targetUserId);
      const rows = await getGroupMembers(activeChannelId);
      setGroupMembers(rows);
      await loadChannels(false);
      emitSyncRooms();
      if (targetUserId === currentUserId) {
        setActiveChannelId('');
        syncChannelInUrl(null);
        setPreviousChannelId(null);
        setMessages([]);
      }
    } catch {
      /* ignore */
    }
  }

  async function leaveGroupFromList(channelId: string) {
    if (!window.confirm('¿Salir de este grupo? No verás más este chat en tu lista.')) return;
    try {
      await leaveGroupChannel(channelId);
      await loadChannels(false);
      emitSyncRooms();
      if (activeChannelIdRef.current === channelId) {
        setActiveChannelId('');
        syncChannelInUrl(null);
        setPreviousChannelId(null);
        setMessages([]);
      }
    } catch {
      /* ignore */
    }
  }

  async function softDeleteFromList(channelId: string) {
    if (!window.confirm('¿Confirmar eliminación de esta conversación?')) return;
    try {
      await softDeleteChatConversation(channelId);
      setArchivedChannelIds((prev) => prev.filter((id) => id !== channelId));
      setChannels((prev) => sortChannelsByActivity(prev.filter((c) => c.id !== channelId)));
      if (activeChannelIdRef.current === channelId) {
        setActiveChannelId('');
        syncChannelInUrl(null);
        setPreviousChannelId(null);
        setMessages([]);
      }
      await loadChannels(false);
      emitSyncRooms();
    } catch {
      void loadChannels(false).catch(() => undefined);
    }
  }

  async function adminMarkChannelRead(channelId: string) {
    try {
      await markChannelRead(channelId);
      setChannels((prev) =>
        sortChannelsByActivity(
          prev.map((ch) => (ch.id === channelId ? { ...ch, unread_count: 0 } : ch)),
        ),
      );
      await loadChannels(false);
    } catch {
      /* ignore */
    }
  }

  async function adminSyncChannel(channelId: string) {
    try {
      await loadChannels(false);
      if (activeChannelIdRef.current === channelId) {
        await loadMessages(channelId);
      }
      emitSyncRooms();
    } catch {
      /* ignore */
    }
  }

  function setChannelArchived(channelId: string, nextArchived: boolean) {
    setArchivedChannelIds((prev) => {
      if (nextArchived) {
        if (prev.includes(channelId)) return prev;
        return [...prev, channelId];
      }
      return prev.filter((id) => id !== channelId);
    });
    if (nextArchived && activeChannelIdRef.current === channelId) {
      setActiveChannelId('');
      syncChannelInUrl(null);
      setPreviousChannelId(null);
      setMessages([]);
    }
  }

  function setChannelMuted(channelId: string, nextMuted: boolean) {
    setMutedChannelIds((prev) => {
      if (nextMuted) {
        if (prev.includes(channelId)) return prev;
        return [...prev, channelId];
      }
      return prev.filter((id) => id !== channelId);
    });
  }

  async function copyMessageText(message: Message) {
    const body = (message.body ?? '').trim();
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      flashComposerHint('Texto copiado.');
    } catch {
      flashComposerHint('No se pudo copiar el texto.');
    }
  }

  async function downloadMessageAttachments(message: Message) {
    const attachments = message.attachments ?? [];
    if (attachments.length === 0) return;
    try {
      for (const attachment of attachments) {
        await downloadChatAttachment(attachment);
      }
      flashComposerHint(
        attachments.length === 1 ? 'Adjunto descargado.' : `${attachments.length} adjuntos descargados.`,
      );
    } catch {
      flashComposerHint('No se pudieron descargar los adjuntos.');
    }
  }

  function closeForwardDialog() {
    const dialog = forwardDialogRef.current;
    if (dialog?.open) dialog.close();
    setForwardSourceMessage(null);
    setForwardTarget(null);
    setForwardQuery('');
    setForwarding(false);
  }

  function openForwardDialog(message: Message) {
    if (!message.attachments?.length) return;
    setForwardSourceMessage(message);
    setForwardTarget(null);
    setForwardQuery('');
  }

  function closePreviewDialog() {
    const dialog = previewDialogRef.current;
    if (dialog?.open) dialog.close();
    setPreviewAttachment(null);
    setPreviewAttachmentError('');
    setPreviewAttachmentLoading(false);
  }

  function openPreviewDialog(attachment: ChatAttachment) {
    if (getChatAttachmentPreviewKind(attachment.mimeType) !== 'image') return;
    setPreviewAttachment(attachment);
  }

  async function submitForwardAttachments() {
    if (!forwardSourceMessage || !forwardTarget) return;
    try {
      setForwarding(true);
      let targetChannelId = forwardTarget.id;
      if (forwardTarget.kind === 'user') {
        const dm = await createDmChannel(forwardTarget.id);
        targetChannelId = dm.id;
      }
      const forwarded = normalizeMessage(
        await forwardChannelAttachments(
          targetChannelId,
          forwardSourceMessage.attachments.map((attachment) => attachment.id),
          forwardSourceMessage.body ?? '',
        ),
      );
      if (targetChannelId === activeChannelIdRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === forwarded.id) ? prev : [...prev, forwarded]));
      }
      if (forwardTarget.kind === 'user') {
        void loadChannels(false).catch(() => undefined);
      }
      flashComposerHint('Adjunto reenviado.');
      closeForwardDialog();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo reenviar el adjunto.';
      flashComposerHint(message, 5000);
      setForwarding(false);
    }
  }

  const chatSearchNorm = chatSearch.trim().toLowerCase();
  const filteredChannels = channels.filter((channel) =>
    `${channel.channel_type} ${channel.name} ${channel.last_message?.body ?? ''} ${channel.last_message?.author_name ?? ''}`
      .toLowerCase()
      .includes(chatSearchNorm),
  );
  const forwardQueryNorm = normalizeForSearch(forwardQuery);
  const forwardCandidateChannels = channels.filter((channel) => {
    if (!forwardQueryNorm) return true;
    return normalizeForSearch(
      `${channel.name} ${channel.channel_type} ${channel.last_message?.body ?? ''} ${channel.last_message?.author_name ?? ''}`,
    ).includes(forwardQueryNorm);
  });
  /** Sin búsqueda: ocultar archivados locales. Con búsqueda: mostrar coincidencias aunque estén archivados. */
  const activeChannels =
    chatSearchNorm.length > 0
      ? filteredChannels
      : filteredChannels.filter((c) => !archivedChannelIds.includes(c.id));
  const ticketChannels = activeChannels.filter((c) => c.channel_type === 'ticket');
  const dmChannels = activeChannels.filter((c) => c.channel_type === 'dm');
  const groupChannels = activeChannels.filter((c) => c.channel_type === 'group');

  const sortedPeople = [...users].sort((a, b) => {
    const ao = onlineUserIds.includes(a.id) ? 1 : 0;
    const bo = onlineUserIds.includes(b.id) ? 1 : 0;
    if (bo !== ao) return bo - ao;
    return a.name.localeCompare(b.name);
  });
  const forwardCandidateUsers = sortedPeople
    .filter((user) => user.id !== currentUserId)
    .filter((user) => matchesPersonInviteSearch(user, forwardQuery))
    .slice(0, forwardQueryNorm ? 16 : 8);

  const filteredPeople = sortedPeople.filter((u) => {
    const q = chatSearchNorm;
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.employeeId.toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    );
  });
  const peoplePanelListFiltered = sortedPeople.filter((u) => matchesPersonInviteSearch(u, peoplePanelSearch));
  const quickPeopleResults = filteredPeople.filter((u) => u.id !== currentUserId).slice(0, 8);

  const onlineCount = users.filter((u) => onlineUserIds.includes(u.id)).length;
  const meInPresence = Boolean(currentUserId) && onlineUserIds.includes(currentUserId);
  const realtimeBadgeState =
    wsState === 'live' ? (meInPresence ? 'live' : 'offline') : wsState === 'connecting' ? 'connecting' : 'offline';
  const realtimeBadgeTitle =
    wsState === 'connecting'
      ? 'Conectando tiempo real…'
      : realtimeBadgeState === 'live'
        ? 'Tiempo real activo y presencia confirmada'
        : 'Sin presencia activa';
  const groupAdminCount = groupMembers.filter((m) => m.role === 'admin').length;
  const inviteCandidates = users.filter((u) => !groupMembers.some((m) => m.user_id === u.id));
  const filteredInviteCandidates = inviteCandidates
    .filter((u) => matchesPersonInviteSearch(u, inviteQuery))
    .slice(0, 10);
  const canGoBackToPreviousChat =
    Boolean(previousChannelId) && channels.some((c) => c.id === previousChannelId);
  const showThreadBack = Boolean(activeChannelId) && (canGoBackToPreviousChat || isNarrowViewport);
  const previousChatName = previousChannelId
    ? channels.find((c) => c.id === previousChannelId)?.name
    : undefined;

  return (
    <section
      ref={chatRootRef}
      className={`chat-app ${showPeoplePanel ? '' : 'chat-app--people-hidden'}`}
      aria-label="Chat"
    >
      <div className="chat-mobile-tabs">
        <button
          type="button"
          className={mobilePanel === 'channels' ? 'chat-tab chat-tab--active' : 'chat-tab'}
          onClick={() => setMobilePanel('channels')}
        >
          Canales
        </button>
        <button
          type="button"
          className={mobilePanel === 'messages' ? 'chat-tab chat-tab--active' : 'chat-tab'}
          onClick={() => setMobilePanel('messages')}
        >
          Conversación
        </button>
        <button
          type="button"
          className={mobilePanel === 'people' ? 'chat-tab chat-tab--active' : 'chat-tab'}
          onClick={() => setMobilePanel('people')}
        >
          Personas
        </button>
      </div>

      <aside
        className={`chat-panel chat-panel--channels ${mobilePanel === 'channels' ? 'chat-panel--show-mobile' : 'chat-panel--hide-mobile'}`}
      >
        <header className="chat-panel__head">
          <h2 className="chat-panel__title">Canales</h2>
          <div className="chat-panel__head-actions">
            <button
              type="button"
              className="chat-icon-btn"
              title={createGroupOpen ? 'Cerrar formulario de nuevo grupo' : 'Nuevo grupo'}
              aria-label={createGroupOpen ? 'Cerrar formulario de nuevo grupo' : 'Nuevo grupo'}
              aria-expanded={createGroupOpen}
              onClick={() => {
                setCreateGroupOpen((open) => {
                  if (open) setNewGroupName('');
                  return !open;
                });
              }}
            >
              <i
                className={`ti ${createGroupOpen ? 'ti-x' : 'ti-users-plus'}`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="chat-icon-btn"
              onClick={() => setShowPeoplePanel((prev) => !prev)}
              title={showPeoplePanel ? 'Ocultar columna Personas' : 'Mostrar columna Personas'}
              aria-label={showPeoplePanel ? 'Ocultar columna Personas' : 'Mostrar columna Personas'}
              aria-expanded={showPeoplePanel}
            >
              <i
                className={`ti ${showPeoplePanel ? 'ti-layout-sidebar-right-collapse' : 'ti-users'}`}
                aria-hidden="true"
              />
            </button>
            <button type="button" className="chat-icon-btn" onClick={() => refreshAll()} disabled={refreshing}>
              <i
                className={`ti ${refreshing ? 'ti-loader-2' : 'ti-refresh'}`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className="chat-icon-btn"
              title={chatSoundEnabled ? 'Silenciar sonido al recibir mensajes' : 'Activar sonido al recibir mensajes'}
              aria-label={chatSoundEnabled ? 'Silenciar sonido de mensajes' : 'Activar sonido de mensajes'}
              aria-pressed={chatSoundEnabled}
              onClick={() => {
                setChatSoundEnabled((prev) => {
                  const next = !prev;
                  persistChatSoundEnabled(next);
                  return next;
                });
              }}
            >
              <i
                className={`ti ${chatSoundEnabled ? 'ti-volume' : 'ti-volume-off'}`}
                aria-hidden="true"
              />
            </button>
            {notifPermission === 'default' ? (
              <button
                type="button"
                className="chat-icon-btn"
                title="Activar avisos del sistema cuando el chat está en segundo plano (navegador o APK)"
                aria-label="Activar avisos del sistema"
                onClick={() => {
                  void requestDesktopNotificationPermission().then((p) => {
                    if (p !== 'unsupported') setNotifPermission(p);
                  });
                }}
              >
                <i className="ti ti-bell-ringing" aria-hidden="true" />
              </button>
            ) : null}
            {notifPermission === 'denied' ? (
              <span
                className="chat-icon-btn chat-icon-btn--disabled"
                title="Avisos del sistema bloqueados en el navegador"
                aria-label="Avisos del sistema no disponibles"
                role="status"
              >
                <i className="ti ti-bell-off" aria-hidden="true" />
              </span>
            ) : null}
            <select
              className="chat-sound-profile-select"
              value={soundProfile}
              onChange={(e) => {
                const v = e.target.value as ChatSoundProfile;
                persistChatSoundProfile(v);
                setSoundProfile(v);
              }}
              aria-label="Timbre de alertas de mensaje"
              title="Timbre de alertas (clásico, suave o ritmado)"
            >
              <option value="classic">Timbre clásico</option>
              <option value="zen">Timbre suave</option>
              <option value="pulse">Timbre ritmado</option>
            </select>
          </div>
        </header>
        <div className="chat-app__search">
          <input
            className="chat-input chat-input--global-search"
            value={chatSearch}
            onChange={(e) => setChatSearch(e.target.value)}
            placeholder="Buscar canales o personas… (incluye archivados)"
            aria-label="Buscar en canales y personas"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>

        {chatSearch.trim() ? (
          <section className="chat-channel-group">
            <div className="chat-channel-group__head">
              <h3 className="chat-channel-group__label chat-channel-group__label--in-head">Personas (iniciar chat)</h3>
              <span className="chat-channel-group__count-badge" aria-label={`${quickPeopleResults.length} resultados de personas`}>
                {quickPeopleResults.length}
              </span>
            </div>
            <div className="chat-channel-list">
              {quickPeopleResults.length === 0 ? (
                <p className="chat-empty-hint">Sin personas para iniciar chat con este filtro.</p>
              ) : (
                quickPeopleResults.map((user) => {
                  const online = onlineUserIds.includes(user.id);
                  const personName = formatDisplayName(user.name);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className="chat-channel-person-result"
                      onClick={() => void openDm(user.id)}
                      title={`Iniciar chat con ${personName}`}
                    >
                      <span
                        className="chat-person__avatar"
                        style={{ background: avatarColorFor(user.id) }}
                        aria-hidden="true"
                      >
                        {getNameInitials(personName)}
                        <span
                          className={`chat-person__presence chat-person__presence--${online ? 'online' : 'offline'}`}
                          aria-hidden
                        />
                      </span>
                      <span className="chat-channel-person-result__main">
                        <span className="chat-channel-person-result__name">{personName}</span>
                      </span>
                      <span className="chat-channel-person-result__cta">Nuevo chat</span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        <div className="chat-channel-groups">
          <section className="chat-channel-group">
            <div className="chat-channel-group__head">
              <h3 className="chat-channel-group__label chat-channel-group__label--in-head">Tickets (prioridad)</h3>
              <span className="chat-channel-group__count-badge" aria-label={`${ticketChannels.length} chats de ticket`}>
                {ticketChannels.length}
              </span>
            </div>
            {ticketChannels.length > 0 ? (
              <div className="chat-channel-list">
                {ticketChannels.map((channel) => (
                  <ChannelListRow
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    isArchived={archivedChannelIds.includes(channel.id)}
                    isMuted={mutedChannelIds.includes(channel.id)}
                    onSelect={() => activateChannelForUser(channel.id)}
                    onMarkRead={(id) => void adminMarkChannelRead(id)}
                    onSync={(id) => void adminSyncChannel(id)}
                    onToggleArchive={(id, next) => setChannelArchived(id, next)}
                    onToggleMute={(id, next) => setChannelMuted(id, next)}
                    onSoftDelete={(id) => void softDeleteFromList(id)}
                    onLeaveGroup={(id) => void leaveGroupFromList(id)}
                  />
                ))}
              </div>
            ) : null}
          </section>

          <section className="chat-channel-group">
            <h3 className="chat-channel-group__label">Mensajes directos (punto a punto)</h3>
            {createGroupOpen ? (
              <div className="chat-new-group">
                <input
                  ref={createGroupInputRef}
                  className="chat-input chat-input--inline"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void onCreateGroup();
                    }
                  }}
                  placeholder="Nombre del grupo…"
                  maxLength={120}
                  aria-label="Nombre del nuevo grupo"
                />
                <button
                  type="button"
                  className="chat-new-group__btn chat-new-group__btn--secondary"
                  onClick={() => void onCreateGroup()}
                >
                  Crear
                </button>
              </div>
            ) : null}
            <div className="chat-channel-list">
              {dmChannels.length === 0 ? (
                <p className="chat-empty-hint">Sin conversaciones directas.</p>
              ) : (
                dmChannels.map((channel) => (
                  <ChannelListRow
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    isArchived={archivedChannelIds.includes(channel.id)}
                    isMuted={mutedChannelIds.includes(channel.id)}
                    onSelect={() => activateChannelForUser(channel.id)}
                    onMarkRead={(id) => void adminMarkChannelRead(id)}
                    onSync={(id) => void adminSyncChannel(id)}
                    onToggleArchive={(id, next) => setChannelArchived(id, next)}
                    onToggleMute={(id, next) => setChannelMuted(id, next)}
                    onSoftDelete={(id) => void softDeleteFromList(id)}
                    onLeaveGroup={(id) => void leaveGroupFromList(id)}
                  />
                ))
              )}
            </div>
          </section>

          <section className="chat-channel-group">
            <div className="chat-channel-group__head">
              <h3 className="chat-channel-group__label chat-channel-group__label--in-head">Grupos</h3>
              <span className="chat-channel-group__count-badge" aria-label={`${groupChannels.length} chats de grupo`}>
                {groupChannels.length}
              </span>
            </div>
            <div className="chat-channel-list">
              {groupChannels.length === 0 ? (
                <p className="chat-empty-hint">Sin conversaciones de grupo.</p>
              ) : (
                groupChannels.map((channel) => (
                  <ChannelListRow
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    isArchived={archivedChannelIds.includes(channel.id)}
                    isMuted={mutedChannelIds.includes(channel.id)}
                    onSelect={() => activateChannelForUser(channel.id)}
                    onMarkRead={(id) => void adminMarkChannelRead(id)}
                    onSync={(id) => void adminSyncChannel(id)}
                    onToggleArchive={(id, next) => setChannelArchived(id, next)}
                    onToggleMute={(id, next) => setChannelMuted(id, next)}
                    onSoftDelete={(id) => void softDeleteFromList(id)}
                    onLeaveGroup={(id) => void leaveGroupFromList(id)}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </aside>

      <div
        className={`chat-panel chat-panel--thread ${mobilePanel === 'messages' ? 'chat-panel--show-mobile' : 'chat-panel--hide-mobile'}`}
      >
        <header className="chat-thread-head">
          <div className="chat-thread-head__main">
            <div className="chat-thread-head__title-row">
              {showThreadBack ? (
                <button
                  type="button"
                  className="chat-thread-back"
                  onClick={() => goBackInThread()}
                  title={
                    canGoBackToPreviousChat
                      ? previousChatName
                        ? `Volver a ${previousChatName}`
                        : 'Volver al chat anterior'
                      : 'Volver a canales'
                  }
                  aria-label={
                    canGoBackToPreviousChat
                      ? previousChatName
                        ? `Volver a ${previousChatName}`
                        : 'Volver al chat anterior'
                      : 'Volver a la lista de canales'
                  }
                >
                  <i className="ti ti-arrow-left" aria-hidden="true" />
                </button>
              ) : null}
              <h2 className="chat-thread-head__title">
                {activeChannel ? formatDisplayName(activeChannel.name) : 'Selecciona un canal'}
              </h2>
              {dmPeerOnline !== null ? (
                <span
                  className={`chat-thread-head__dm-presence chat-thread-head__dm-presence--${dmPeerOnline ? 'online' : 'offline'}`}
                  title={dmPeerOnline ? 'Contacto conectado' : 'Contacto desconectado'}
                  aria-label={dmPeerOnline ? 'Contacto activo' : 'Contacto inactivo'}
                  role="status"
                />
              ) : null}
              <span
                className={`chat-live-dot chat-live-dot--${realtimeBadgeState}`}
                title={realtimeBadgeTitle}
              />
              {activeChannel && realtimeBadgeState === 'live' ? (
                <span
                  className={`chat-presence-pill${dmPeerOnline === false ? ' chat-presence-pill--inactive-peer' : ''}`}
                  title={
                    dmPeerOnline !== null
                      ? dmPeerOnline
                        ? 'El contacto aparece conectado'
                        : 'El contacto aparece desconectado'
                      : 'Tiempo real activo'
                  }
                >
                  <span className="presence-dot" aria-hidden="true" />
                  {dmPeerOnline !== null
                    ? dmPeerOnline
                      ? 'Contacto activo'
                      : 'Contacto inactivo'
                    : 'En línea'}
                </span>
              ) : null}
            </div>
            {activeChannel ? (
              <>
                <p className="chat-thread-head__meta">
                  <span
                    className="chat-pill"
                    title={
                      activeChannel.channel_type === 'dm'
                        ? 'Directo'
                        : activeChannel.channel_type === 'group'
                          ? 'Grupo'
                          : 'Ticket'
                    }
                    aria-label={
                      activeChannel.channel_type === 'dm'
                        ? 'Directo'
                        : activeChannel.channel_type === 'group'
                          ? 'Grupo'
                          : 'Ticket'
                    }
                  >
                    <i
                      className={`ti ${
                        activeChannel.channel_type === 'dm'
                          ? 'ti-arrows-left-right'
                          : activeChannel.channel_type === 'group'
                            ? 'ti-users'
                            : 'ti-ticket'
                      }`}
                      aria-hidden="true"
                    />
                  </span>
                  {activeChannel.channel_type === 'group' && activeChannel.my_role === 'admin' ? (
                    <span className="chat-pill chat-pill--admin" title="Administrador" aria-label="Administrador">
                      <i className="ti ti-star" aria-hidden="true" />
                    </span>
                  ) : null}
                  {mutedChannelIds.includes(activeChannel.id) ? (
                    <>
                      <span
                        className="chat-pill chat-pill--muted"
                        title="Sin sonido, avisos en pantalla ni notificación de escritorio para este chat"
                      >
                        Silenciada
                      </span>
                      <button
                        type="button"
                        className="chat-ghost-btn chat-header-symbol-btn"
                        title="Activar alertas"
                        aria-label="Activar alertas"
                        onClick={() => setChannelMuted(activeChannel.id, false)}
                      >
                        <i className="ti ti-bell" aria-hidden="true" />
                      </button>
                    </>
                  ) : null}
                  {activeChannel.ticket_id ? (
                    <Link className="chat-link chat-header-symbol-link" to={`/tickets/${activeChannel.ticket_id}`} title="Abrir ticket" aria-label="Abrir ticket">
                      <i className="ti ti-external-link" aria-hidden="true" />
                    </Link>
                  ) : null}
                </p>
                {activeChannel.channel_type === 'group' ? (
                  <>
                    <span className="chat-group-compact__count">
                      {groupMembersLoading ? 'Cargando…' : `${groupMembers.length} miembros`}
                    </span>
                    <button
                      type="button"
                      className="chat-ghost-btn chat-group-compact__btn chat-header-symbol-btn"
                      title={activeChannel.my_role === 'admin' ? 'Gestionar miembros' : 'Ver miembros'}
                      aria-label={activeChannel.my_role === 'admin' ? 'Gestionar miembros' : 'Ver miembros'}
                      onClick={() => openGroupMembersDialog()}
                    >
                      <i className="ti ti-users" aria-hidden="true" />
                    </button>
                  </>
                ) : null}
                {typingUserId && typingUserId !== currentUserId ? (
                  <p className="chat-typing-hint" aria-live="polite">
                    <em>
                      {formatDisplayName(
                        users.find((u) => u.id === typingUserId)?.name ??
                          groupMembers.find((m) => m.user_id === typingUserId)?.name ??
                          'Alguien',
                      )}
                    </em>{' '}
                    está escribiendo…
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
          {activeChannel ? (
            <div className="chat-thread-actions">
              <button
                type="button"
                className="chat-ghost-btn chat-header-symbol-btn"
                title="Actualizar mensajes"
                aria-label="Actualizar mensajes"
                onClick={() => void loadMessages(activeChannel.id)}
              >
                <i className="ti ti-refresh" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </header>

        {activeChannel?.channel_type === 'group' ? (
          <dialog
            ref={groupMembersDialogRef}
            className="chat-group-dialog"
            aria-labelledby="chat-group-dialog-title"
            onClose={() => {
              setInviteQuery('');
              setInviteUserId('');
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeGroupMembersDialog();
            }}
          >
            <div className="chat-group-dialog__inner">
              <header className="chat-group-dialog__head">
                <h3 id="chat-group-dialog-title" className="chat-group-dialog__title">
                  {formatDisplayName(activeChannel.name)}
                </h3>
                <p className="chat-group-dialog__sub">
                  {groupMembersLoading ? 'Cargando miembros…' : `${groupMembers.length} miembros`}
                </p>
              </header>
              <div className="chat-group-dialog__body">
                <div className="chat-group-manage chat-group-manage--in-dialog">
                  {activeChannel.my_role === 'admin' ? (
                    <div className="chat-group-manage__invite">
                      <div className="chat-group-manage__search-wrap">
                        <input
                          className="chat-group-manage__search"
                          value={inviteQuery}
                          onChange={(e) => {
                            setInviteQuery(e.target.value);
                            if (!e.target.value.trim()) setInviteUserId('');
                          }}
                          placeholder="Escribe nombre, documento o correo…"
                          aria-label="Buscar persona para agregar al grupo"
                        />
                        {filteredInviteCandidates.length > 0 && inviteQuery.trim() ? (
                          <ul className="chat-group-manage__search-results">
                            {filteredInviteCandidates.map((u) => (
                              <li key={u.id}>
                                <button
                                  type="button"
                                  className="chat-group-manage__search-item"
                                  onClick={() => {
                                    setInviteUserId(u.id);
                                    setInviteQuery(`${formatDisplayName(u.name)} · ${u.employeeId}`);
                                  }}
                                >
                                  <span>{formatDisplayName(u.name)}</span>
                                  <small>{u.employeeId}</small>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="chat-ghost-btn"
                        onClick={() => void onInviteGroupMember()}
                        disabled={!inviteUserId}
                      >
                        Agregar
                      </button>
                    </div>
                  ) : null}
                  <ul className="chat-group-manage__list">
                    {groupMembers.map((m) => {
                      const canRemove =
                        activeChannel.my_role === 'admin' &&
                        (m.user_id !== currentUserId || groupAdminCount > 1);
                      return (
                        <li key={m.user_id} className="chat-group-manage__row">
                          <span className="chat-group-manage__member">
                            <span className="chat-group-manage__member-name">{formatDisplayName(m.name)}</span>
                            <span className="chat-group-manage__member-id">{m.employee_id}</span>
                          </span>
                          {m.role === 'admin' ? (
                            <span className="chat-group-manage__role">Administrador</span>
                          ) : (
                            <span className="chat-group-manage__role chat-group-manage__role--muted">Miembro</span>
                          )}
                          {canRemove ? (
                            <button
                              type="button"
                              className="chat-group-manage__remove"
                              onClick={() => void onRemoveGroupMember(m.user_id)}
                            >
                              Quitar
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
              <footer className="chat-group-dialog__foot">
                <form method="dialog">
                  <button type="submit" className="chat-ghost-btn chat-group-dialog__close-btn">
                    Cerrar
                  </button>
                </form>
              </footer>
            </div>
          </dialog>
        ) : null}

        {forwardSourceMessage ? (
          <dialog
            ref={forwardDialogRef}
            className="chat-group-dialog chat-forward-dialog"
            aria-labelledby="chat-forward-dialog-title"
            onClose={closeForwardDialog}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeForwardDialog();
            }}
          >
            <div className="chat-group-dialog__inner">
              <header className="chat-group-dialog__head">
                <h3 id="chat-forward-dialog-title" className="chat-group-dialog__title">
                  Reenviar adjunto
                </h3>
                <p className="chat-group-dialog__sub">
                  {forwardSourceMessage.attachments.length} adjunto
                  {forwardSourceMessage.attachments.length === 1 ? '' : 's'}
                </p>
              </header>
              <div className="chat-group-dialog__body">
                <div className="chat-group-manage chat-group-manage--in-dialog">
                  <p className="chat-group-manage__summary">
                    Selecciona un chat existente o busca una persona del directorio para reenviar el archivo sin duplicarlo en almacenamiento.
                  </p>
                  <div className="chat-forward-dialog__source">
                    <strong>{formatDisplayName(forwardSourceMessage.user.name)}</strong>
                    <span>{forwardSourceMessage.attachments.map((attachment) => attachment.originalName).join(', ')}</span>
                  </div>
                  <input
                    className="chat-group-manage__search"
                    value={forwardQuery}
                    onChange={(e) => setForwardQuery(e.target.value)}
                    placeholder="Buscar chat o persona…"
                    aria-label="Buscar chat o persona para reenviar adjunto"
                  />
                  <div className="chat-forward-dialog__sections">
                    {forwardCandidateChannels.length > 0 ? (
                      <section className="chat-forward-dialog__section">
                        <h4 className="chat-forward-dialog__section-title">Chats existentes</h4>
                        <ul className="chat-group-manage__list chat-forward-dialog__list">
                          {forwardCandidateChannels.map((channel) => (
                            <li key={channel.id}>
                              <button
                                type="button"
                                className={`chat-forward-dialog__target${
                                  forwardTarget?.kind === 'channel' && forwardTarget.id === channel.id
                                    ? ' chat-forward-dialog__target--selected'
                                    : ''
                                }`}
                                onClick={() => setForwardTarget({ kind: 'channel', id: channel.id })}
                              >
                                <span className="chat-forward-dialog__target-title-row">
                                  <span>{formatDisplayName(channel.name)}</span>
                                  <span className="chat-forward-dialog__badge">Chat</span>
                                </span>
                                <small>
                                  {channel.channel_type === 'dm'
                                    ? 'Conversación directa'
                                    : channel.channel_type === 'group'
                                      ? 'Grupo'
                                      : 'Ticket'}
                                </small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {forwardCandidateUsers.length > 0 ? (
                      <section className="chat-forward-dialog__section">
                        <h4 className="chat-forward-dialog__section-title">Personas</h4>
                        <ul className="chat-group-manage__list chat-forward-dialog__list">
                          {forwardCandidateUsers.map((user) => (
                            <li key={user.id}>
                              <button
                                type="button"
                                className={`chat-forward-dialog__target chat-forward-dialog__target--user${
                                  forwardTarget?.kind === 'user' && forwardTarget.id === user.id
                                    ? ' chat-forward-dialog__target--selected'
                                    : ''
                                }`}
                                onClick={() => setForwardTarget({ kind: 'user', id: user.id })}
                              >
                                <span className="chat-forward-dialog__target-title-row">
                                  <span>{formatDisplayName(user.name)}</span>
                                  <span className="chat-forward-dialog__badge chat-forward-dialog__badge--user">Persona</span>
                                </span>
                                <small>
                                  {user.employeeId}
                                  {user.email ? ` · ${maskEmail(user.email)}` : ''}
                                </small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                    {forwardCandidateChannels.length === 0 && forwardCandidateUsers.length === 0 ? (
                      <p className="chat-forward-dialog__empty">No hay chats ni personas que coincidan con la búsqueda.</p>
                    ) : null}
                  </div>
                </div>
              </div>
              <footer className="chat-group-dialog__foot">
                <button type="button" className="chat-ghost-btn chat-group-dialog__close-btn" onClick={closeForwardDialog}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="chat-ghost-btn"
                  disabled={!forwardTarget || forwarding}
                  onClick={() => void submitForwardAttachments()}
                >
                  {forwarding ? 'Reenviando…' : 'Reenviar'}
                </button>
              </footer>
            </div>
          </dialog>
        ) : null}

        {previewAttachment ? (
          <dialog
            ref={previewDialogRef}
            className="chat-image-viewer"
            aria-labelledby="chat-image-viewer-title"
            onClose={closePreviewDialog}
            onClick={(e) => {
              if (e.target === e.currentTarget) closePreviewDialog();
            }}
          >
            <div className="chat-image-viewer__inner">
              <header className="chat-image-viewer__head">
                <div className="chat-image-viewer__meta">
                  <h3 id="chat-image-viewer-title" className="chat-image-viewer__title">
                    {previewAttachment.originalName}
                  </h3>
                  <p className="chat-image-viewer__sub">
                    {formatFileSize(previewAttachment.sizeBytes)} · {previewAttachment.mimeType}
                  </p>
                </div>
                <button type="button" className="chat-ghost-btn chat-image-viewer__close" onClick={closePreviewDialog}>
                  Cerrar
                </button>
              </header>
              <div className="chat-image-viewer__body">
                {previewAttachmentLoading ? (
                  <p className="chat-image-viewer__status">Cargando imagen…</p>
                ) : previewAttachmentError ? (
                  <p className="chat-image-viewer__status">{previewAttachmentError}</p>
                ) : previewAttachmentUrl ? (
                  <img className="chat-image-viewer__media" src={previewAttachmentUrl} alt={previewAttachment.originalName} />
                ) : null}
              </div>
            </div>
          </dialog>
        ) : null}

        <div
          ref={messagesScrollRef}
          className="chat-messages"
          role="log"
          aria-live="polite"
          onScroll={onMessagesScroll}
        >
          {loadingOlder ? <p className="chat-load-older">Cargando mensajes anteriores…</p> : null}
          {!activeChannelId ? (
            <p className="chat-empty-hint chat-empty-hint--center">Elige un canal a la izquierda o una persona a la derecha.</p>
          ) : messages.length === 0 ? (
            <p className="chat-empty-hint chat-empty-hint--center">Aún no hay mensajes.</p>
          ) : (
            (() => {
              let lastDayIso: string | null = null;
              return messages.map((message) => {
                const mine = Boolean(currentUserId && String(message.user.id) === String(currentUserId));
                const atts = message.attachments ?? [];
                const showDateDivider =
                  !lastDayIso || !isSameLocalDay(lastDayIso, message.createdAt);
                lastDayIso = message.createdAt;
                return (
                  <div
                    key={message.id}
                    className={`chat-message-group ${mine ? 'chat-message-group--mine' : 'chat-message-group--theirs'}`}
                  >
                    {showDateDivider ? (
                      <div className="chat-date-divider" role="separator">
                        <span>{formatDateDividerLabel(message.createdAt)}</span>
                      </div>
                    ) : null}
                    <article
                      className={mine ? 'chat-bubble chat-bubble--mine' : 'chat-bubble chat-bubble--theirs'}
                    >
                      <header className="chat-bubble__head">
                        <span className="chat-bubble__author">{formatDisplayName(message.user.name)}</span>
                        <div className="chat-bubble__head-actions">
                          <time className="chat-bubble__time" dateTime={message.createdAt}>
                            {formatMessageTimestamp(message.createdAt)}
                          </time>
                          <MessageActionMenu
                            message={message}
                            onCopyText={() => void copyMessageText(message)}
                            onDownloadAttachments={() => void downloadMessageAttachments(message)}
                            onForwardAttachments={() => openForwardDialog(message)}
                          />
                        </div>
                      </header>
                      {atts.length > 0 ? (
                        <ul className="chat-attachments">
                          {atts.map((att) => (
                            <li key={att.id} className="chat-attachments__item">
                              <ChatAttachmentView attachment={att} onPreviewImage={openPreviewDialog} />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {message.messageType === 'nudge' ? (
                        <p className="chat-bubble__nudge" role="status">
                          {mine ? '📣 Enviaste un zumbido' : '🔔 Zumbido — te llamó la atención'}
                        </p>
                      ) : message.body ? (
                        <p className="chat-bubble__body">{message.body}</p>
                      ) : atts.length > 0 ? null : (
                        <p className="chat-bubble__body">Mensaje sin contenido</p>
                      )}
                    </article>
                  </div>
                );
              });
            })()
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-composer" onSubmit={onSend}>
          {composerHint ? <p className="chat-composer-hint">{composerHint}</p> : null}
          <input
            ref={fileInputRef}
            type="file"
            className="chat-composer-file-input"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              applyPendingFileSelection(f);
              e.target.value = '';
            }}
          />
          <div className="chat-composer-shell">
            <button
              type="button"
              className="chat-attach-btn chat-composer-icon-btn"
              aria-label="Adjuntar archivo"
              title="Adjuntar archivo"
              disabled={!activeChannelId}
              onClick={() => fileInputRef.current?.click()}
            >
              <i className="ti ti-paperclip" aria-hidden="true" />
            </button>
            <div className="chat-emoji-anchor">
              <button
                type="button"
                ref={emojiButtonRef}
                className="chat-attach-btn chat-composer-icon-btn"
                aria-label="Insertar emoji"
                title="Insertar emoji"
                aria-haspopup="dialog"
                aria-expanded={emojiPickerOpen}
                aria-controls={emojiPickerOpen ? 'chat-emoji-picker-popover' : undefined}
                disabled={!activeChannelId}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => setEmojiPickerOpen((open) => !open)}
              >
                <i className="ti ti-mood-smile" aria-hidden="true" />
              </button>
              {emojiPickerOpen ? (
                <div
                  ref={emojiPopoverRef}
                  id="chat-emoji-picker-popover"
                  className="chat-emoji-popover"
                  role="dialog"
                  aria-label="Selector de emoji"
                >
                  <Suspense
                    fallback={<div className="chat-emoji-popover__loading">Cargando emojis…</div>}
                  >
                    <LazyEmojiPicker
                      theme={getCurrentDocumentTheme() as Theme}
                      lazyLoadEmojis
                      skinTonesDisabled
                      onEmojiClick={(data: EmojiClickData) => {
                        insertEmoji(data.emoji);
                        setEmojiPickerOpen(false);
                      }}
                    />
                  </Suspense>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="chat-attach-btn chat-composer-icon-btn"
              aria-label="Enviar zumbido"
              title="Zumbido: avisa con sonido y sacudida (como Messenger clásico). Máx. 1 cada 15 s."
              disabled={!activeChannelId}
              onClick={() => sendNudge()}
            >
              <i className="ti ti-bell" aria-hidden="true" />
            </button>
            <textarea
              ref={composerTextareaRef}
              className="chat-textarea chat-composer__grow"
              value={text}
              onChange={onComposerChange}
              onBlur={(e) => {
                syncComposerSelection(e.currentTarget);
                emitTyping(false);
              }}
              onSelect={(e) => syncComposerSelection(e.currentTarget)}
              onKeyUp={(e) => syncComposerSelection(e.currentTarget)}
              onClick={(e) => syncComposerSelection(e.currentTarget)}
              onKeyDown={onComposerKeyDown}
              onPaste={onComposerPaste}
              placeholder="Escribe un mensaje · Enter envía · Shift+Enter nueva línea"
              rows={3}
              disabled={!activeChannelId}
              aria-label="Mensaje"
            />
          </div>
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!activeChannelId || (!text.trim() && !pendingFile)}
            aria-label="Enviar mensaje"
            title="Enviar mensaje"
          >
            <i className="ti ti-send" aria-hidden="true" />
            <span>Enviar</span>
          </button>
          {pendingFile ? (
            <div className="chat-pending-file">
              {pendingFilePreviewUrl ? (
                getChatAttachmentPreviewKind(pendingFile.type) === 'video' ? (
                  <video className="chat-pending-file__preview" src={pendingFilePreviewUrl} muted preload="metadata" />
                ) : (
                  <img className="chat-pending-file__preview" src={pendingFilePreviewUrl} alt="" />
                )
              ) : (
                <span
                  className={`chat-pending-file__icon chat-attachment-thumb--${getChatAttachmentIconKind(
                    pendingFile.type,
                    pendingFile.name,
                  )}`}
                  aria-hidden="true"
                >
                  <i
                    className={`ti ${tablerIconForAttachmentKind(
                      getChatAttachmentIconKind(pendingFile.type, pendingFile.name),
                    )}`}
                    aria-hidden="true"
                  />
                </span>
              )}
              <span className="chat-pending-file__name" title={pendingFile.name}>
                {pendingFile.name}
                <small>{formatFileSize(pendingFile.size)}</small>
              </span>
              <button
                type="button"
                className="chat-pending-file__clear"
                aria-label="Quitar archivo"
                onClick={() => {
                  applyPendingFileSelection(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                Quitar
              </button>
            </div>
          ) : null}
        </form>
      </div>

      <aside
        className={`chat-panel chat-panel--people ${mobilePanel === 'people' ? 'chat-panel--show-mobile' : 'chat-panel--hide-mobile'}`}
      >
        <header className="chat-panel__head">
          <div>
            <h2 className="chat-panel__title">Personas</h2>
            <p className="chat-panel__sub">
              {onlineCount} en línea · {users.length} en total
            </p>
          </div>
          <button type="button" className="chat-icon-btn" onClick={() => loadUsers().catch(() => undefined)} aria-label="Actualizar personas" title="Actualizar personas">
            <i className="ti ti-refresh" aria-hidden="true" />
          </button>
        </header>
        <div className="chat-people-search">
          <i className="ti ti-search chat-people-search__icon" aria-hidden="true" />
          <input
            className="chat-input chat-input--people-search"
            type="search"
            value={peoplePanelSearch}
            onChange={(e) => setPeoplePanelSearch(e.target.value)}
            placeholder="Buscar por nombre, correo o documento…"
            aria-label="Buscar en la lista de personas"
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
        {peoplePanelListFiltered.length === 0 ? (
          <p className="chat-empty-hint chat-people-list__hint">
            {peoplePanelSearch.trim()
              ? 'Nadie coincide con este filtro.'
              : 'No hay personas en la lista.'}
          </p>
        ) : (
        <ul className="chat-people-list">
          {peoplePanelListFiltered.map((user) => {
            const online = onlineUserIds.includes(user.id);
            const personName = formatDisplayName(user.name);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  className="chat-person"
                  title={`${personName} · ${online ? 'En línea' : 'Desconectado'}`}
                  aria-label={`${personName}. ${online ? 'En línea' : 'Desconectado'}`}
                  onClick={() => void openDm(user.id)}
                >
                  <span
                    className="chat-person__avatar"
                    style={{ background: avatarColorFor(user.id) }}
                    aria-hidden="true"
                  >
                    {getNameInitials(personName)}
                    <span
                      className={`chat-person__presence chat-person__presence--${online ? 'online' : 'offline'}`}
                      aria-hidden
                    />
                  </span>
                  <span className="chat-person__body">
                    <span className="chat-person__name-row">
                      <span className="chat-person__name">{personName}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        )}
      </aside>

      <div className="chat-toast-stack" aria-live="polite">
        {messageToasts
          .filter((toast) => !mutedChannelIds.includes(toast.channelId))
          .map((toast) => (
          <button
            key={toast.id}
            type="button"
            className="chat-toast"
            onClick={() => {
              setMessageToasts((p) => p.filter((t) => t.id !== toast.id));
              activateChannelForUser(toast.channelId);
            }}
          >
            <span className="chat-toast__title">{toast.title}</span>
            <span className="chat-toast__body">{toast.body}</span>
            <span className="chat-toast__hint">Clic para abrir</span>
          </button>
        ))}
      </div>
    </section>
  );
}
