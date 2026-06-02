type TabId = 'members' | 'add';

type TabItem = {
  id: TabId;
  label: string;
  count?: number;
};

type Props = {
  tabs: readonly TabItem[];
  active: TabId;
  onChange: (id: TabId) => void;
};

export function DepartmentUsersTabs({ tabs, active, onChange }: Props) {
  return (
    <div className="dept-users-tabs" role="tablist" aria-label="Gestión del departamento">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`dept-users-tab${active === tab.id ? ' dept-users-tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count != null ? (
            <span className="dept-users-tabs__count">{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export type { TabId as DepartmentUsersTabId };
