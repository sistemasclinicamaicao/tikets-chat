import type { ReactNode } from 'react';

type SettingsSectionCardProps = {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SettingsSectionCard({ title, description, children, className }: SettingsSectionCardProps) {
  return (
    <section className={`settings-section-card${className ? ` ${className}` : ''}`}>
      <header className="settings-section-card__head">
        <h2 className="settings-section-card__title">{title}</h2>
        {description ? <p className="settings-muted settings-section-card__desc">{description}</p> : null}
      </header>
      <div className="settings-section-card__body">{children}</div>
    </section>
  );
}
