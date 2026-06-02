import { useEffect, useState } from 'react';
import { ClinicaDefaultPhotoImg } from './ClinicaDefaultPhotoImg';
import { fetchGthComunicacionesPhotoBlob } from '../lib/api';

type Props = {
  departmentId: string;
  recordId: string;
  alt: string;
  className?: string;
  refreshKey?: string | number;
};

export function GthComunicacionesRecordPhoto({
  departmentId,
  recordId,
  alt,
  className,
  refreshKey = 0,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);

    void fetchGthComunicacionesPhotoBlob(departmentId, recordId)
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
  }, [departmentId, recordId, refreshKey]);

  if (failed) {
    return <ClinicaDefaultPhotoImg className={className ?? 'clinica-default-photo'} alt={alt} />;
  }
  if (!src) {
    return (
      <span className="gth-record-photo-cell__placeholder" aria-hidden="true">
        <i className="ti ti-loader" />
      </span>
    );
  }
  return <img src={src} alt={alt} className={className} />;
}
