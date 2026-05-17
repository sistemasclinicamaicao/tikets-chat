type MessengerLoginAvatarProps = {
  name: string;
  seed: string;
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
  size = 'lg',
  selected = false,
  className = '',
  title,
}: MessengerLoginAvatarProps) {
  const initials = initialsFromName(name);
  const bg = avatarColorFor(seed);

  return (
    <span
      className={`messenger-login__avatar messenger-login__avatar--${size}${
        selected ? ' messenger-login__avatar--selected' : ''
      }${className ? ` ${className}` : ''}`}
      style={{ background: bg, color: '#fff' }}
      title={title ?? name}
      aria-hidden={title ? undefined : true}
    >
      {initials}
    </span>
  );
}
