import { usePresentationAvatarPhoto } from '../hooks/usePresentationAvatarPhoto';
import { CLINICA_DEFAULT_PHOTO_URL } from '../lib/clinicaDefaultPhoto';

type MessengerLoginAvatarProps = {
  name: string;
  seed: string;
  employeeId?: string;
  size?: 'lg' | 'sm';
  selected?: boolean;
  className?: string;
  title?: string;
};

const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#f9ab00',
  '#22c55e',
  '#14b8a6',
  '#0b5394',
  '#073763',
  '#ec4899',
];

export function avatarColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function MessengerLoginAvatar({
  name,
  seed,
  employeeId,
  size = 'lg',
  selected = false,
  className = '',
  title,
}: MessengerLoginAvatarProps) {
  const initials = initialsFromName(name);
  const bg = avatarColorFor(seed);
  const photoSrc = usePresentationAvatarPhoto(employeeId);
  const hasEmployeeId = Boolean(employeeId?.trim());
  const displaySrc = photoSrc ?? (hasEmployeeId ? CLINICA_DEFAULT_PHOTO_URL : null);
  const isInstitutionalLogo = !photoSrc && hasEmployeeId;

  const classNames = `messenger-login__avatar messenger-login__avatar--${size}${
    selected ? ' messenger-login__avatar--selected' : ''
  }${displaySrc ? ' messenger-login__avatar--photo' : ''}${
    isInstitutionalLogo ? ' messenger-login__avatar--institutional' : ''
  }${className ? ` ${className}` : ''}`;

  return (
    <span
      className={classNames}
      style={displaySrc ? undefined : { background: bg, color: '#fff' }}
      title={title ?? name}
      aria-hidden={title ? undefined : true}
    >
      {displaySrc ? (
        <img
          src={displaySrc}
          alt=""
          className={`messenger-login__avatar-img${
            isInstitutionalLogo ? ' messenger-login__avatar-img--logo' : ''
          }`}
          aria-hidden="true"
        />
      ) : (
        initials
      )}
    </span>
  );
}
