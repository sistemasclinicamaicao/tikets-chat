type GlobalRoleFilter = '' | 'admin' | 'auditor' | 'none';
type ActiveFilter = '' | 'true' | 'false';

type Props = {
  searchQ: string;
  onSearchChange: (value: string) => void;
  globalRoleFilter: GlobalRoleFilter;
  onGlobalRoleFilterChange: (value: GlobalRoleFilter) => void;
  activeFilter: ActiveFilter;
  onActiveFilterChange: (value: ActiveFilter) => void;
  onSyncFromGth?: () => void;
  syncingFromGth?: boolean;
};

export type { GlobalRoleFilter as SettingsSystemUsersGlobalRoleFilter };
export type { ActiveFilter as SettingsSystemUsersActiveFilter };

export function SettingsSystemUsersToolbar({
  searchQ,
  onSearchChange,
  globalRoleFilter,
  onGlobalRoleFilterChange,
  activeFilter,
  onActiveFilterChange,
  onSyncFromGth,
  syncingFromGth = false,
}: Props) {
  return (
    <div className="settings-system-users__toolbar">
      <div className="settings-system-users__search">
        <div className="inventory-toolbar__search-wrap">
          <span className="inventory-toolbar__search-icon" aria-hidden>
            <i className="ti ti-search" aria-hidden="true" />
          </span>
          <input
            type="search"
            className="inventory-toolbar__search"
            placeholder="Buscar nombre, cédula o correo…"
            value={searchQ}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            aria-label="Buscar usuarios"
          />
        </div>
      </div>

      <label className="settings-system-users__filter">
        <span>Rol global</span>
        <select
          value={globalRoleFilter}
          onChange={(e) => onGlobalRoleFilterChange(e.target.value as GlobalRoleFilter)}
        >
          <option value="">Todos</option>
          <option value="admin">Administrador</option>
          <option value="auditor">Auditor</option>
          <option value="none">Sin rol global</option>
        </select>
      </label>

      <label className="settings-system-users__filter">
        <span>Estado</span>
        <select
          value={activeFilter}
          onChange={(e) => onActiveFilterChange(e.target.value as ActiveFilter)}
        >
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </label>

      {onSyncFromGth ? (
        <button
          type="button"
          className="btn btn-secondary settings-system-users__sync-gth"
          onClick={onSyncFromGth}
          disabled={syncingFromGth}
          title="Copia nombre y correo desde gth_directory (pestaña GTH)"
        >
          <i className={`ti ${syncingFromGth ? 'ti-loader' : 'ti-refresh'}`} aria-hidden="true" />{' '}
          {syncingFromGth ? 'Actualizando…' : 'Desde GTH'}
        </button>
      ) : null}
    </div>
  );
}
