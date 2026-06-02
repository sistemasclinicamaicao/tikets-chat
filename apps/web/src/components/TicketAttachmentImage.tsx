import { useEffect, useState } from 'react';
import { fetchTicketAttachmentBlob } from '../lib/api';

type Props = {
  ticketId: string;
  attachmentId: string;
  alt: string;
  className?: string;
  placeholder?: string;
};

export function TicketAttachmentImage({
  ticketId,
  attachmentId,
  alt,
  className,
  placeholder = 'Cargando…',
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);

    void fetchTicketAttachmentBlob(ticketId, attachmentId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticketId, attachmentId]);

  if (failed) {
    return <span className="ticket-detail__muted">No se pudo cargar la imagen</span>;
  }
  if (!src) {
    return <span className="ticket-detail__muted">{placeholder}</span>;
  }
  return <img src={src} alt={alt} className={className} />;
}
