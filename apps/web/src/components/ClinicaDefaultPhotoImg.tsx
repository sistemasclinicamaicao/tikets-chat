import { CLINICA_DEFAULT_PHOTO_ALT, CLINICA_DEFAULT_PHOTO_URL } from '../lib/clinicaDefaultPhoto';

type ClinicaDefaultPhotoImgProps = {
  className?: string;
  alt?: string;
  title?: string;
};

/** Imagen por defecto (logo Clínica Maicao) cuando el registro no tiene foto. */
export function ClinicaDefaultPhotoImg({
  className = 'clinica-default-photo gth-onboarding-thumb',
  alt = CLINICA_DEFAULT_PHOTO_ALT,
  title,
}: ClinicaDefaultPhotoImgProps) {
  return (
    <img
      src={CLINICA_DEFAULT_PHOTO_URL}
      alt={alt}
      title={title ?? alt}
      className={className}
      loading="lazy"
      decoding="async"
    />
  );
}
