import { useCallback, useState, type ReactNode } from 'react';

function readSectionOpen(storageKey: string, defaultOpen: boolean): boolean {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return defaultOpen;
    return raw === '1' || raw === 'true';
  } catch {
    return defaultOpen;
  }
}

function persistSectionOpen(storageKey: string, open: boolean) {
  try {
    localStorage.setItem(storageKey, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

type Props = {
  title: string;
  storageKey: string;
  count: number;
  unreadCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Contenido entre cabecera y lista (p. ej. formulario nuevo grupo). */
  beforeList?: ReactNode;
};

export function ChatChannelSection({
  title,
  storageKey,
  count,
  unreadCount = 0,
  defaultOpen = true,
  children,
  beforeList,
}: Props) {
  const [open, setOpen] = useState(() => readSectionOpen(storageKey, defaultOpen));

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      persistSectionOpen(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const sectionId = `chat-section-${storageKey.replace(/[^a-z0-9.-]/gi, '-')}`;

  return (
    <section className={`chat-channel-group ${open ? 'chat-channel-group--open' : 'chat-channel-group--collapsed'}`}>
      <div className="chat-channel-group__head">
        <button
          type="button"
          className="chat-channel-group__toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={sectionId}
        >
          <i
            className={`ti ${open ? 'ti-chevron-down' : 'ti-chevron-right'} chat-channel-group__chevron`}
            aria-hidden="true"
          />
          <span className="chat-channel-group__label chat-channel-group__label--in-head">{title}</span>
        </button>
        <span className="chat-channel-group__badges">
          {unreadCount > 0 ? (
            <span className="chat-channel-group__unread-badge" aria-label={`${unreadCount} sin leer`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
          <span className="chat-channel-group__count-badge" aria-label={`${count} conversaciones`}>
            {count}
          </span>
        </span>
      </div>
      {open ? (
        <div id={sectionId} className="chat-channel-group__body">
          {beforeList}
          {children}
        </div>
      ) : null}
    </section>
  );
}
