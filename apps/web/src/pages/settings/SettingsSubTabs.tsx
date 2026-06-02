export type SettingsSubTabItem<T extends string> = {
  id: T;
  label: string;
  disabled?: boolean;
};

type SettingsSubTabsProps<T extends string> = {
  tabs: readonly SettingsSubTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
};

export function SettingsSubTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  className,
}: SettingsSubTabsProps<T>) {
  return (
    <div className={className ?? 'settings-tab-row'} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          disabled={tab.disabled}
          className={`settings-tab${active === tab.id ? ' settings-tab--active' : ''}${tab.disabled ? ' settings-tab--disabled' : ''}`}
          onClick={() => {
            if (tab.disabled) return;
            onChange(tab.id);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
