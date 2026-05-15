import { Link } from 'react-router-dom';

type Props = {
  departmentId: string;
  searchInput: string;
  onSearchChange: (v: string) => void;
  includeInactive: boolean;
  onIncludeInactiveChange: (v: boolean) => void;
  onExport: () => void;
  canWrite: boolean;
  onCreate: () => void;
  /** Listado PC: exportación compacta «Excel»; resto de categorías: texto largo. */
  variant?: 'default' | 'listado-pc';
};

export function InventoryToolbar({
  departmentId,
  searchInput,
  onSearchChange,
  includeInactive,
  onIncludeInactiveChange,
  onExport,
  canWrite,
  onCreate,
  variant = 'default',
}: Props) {
  const isListadoPc = variant === 'listado-pc';

  return (
    <div
      className={`inventory-toolbar${isListadoPc ? ' inventory-toolbar--listado-pc' : ''}`}
      aria-label="Acciones del listado"
    >
      <div className="inventory-toolbar__search-wrap">
        <span className="inventory-toolbar__search-icon" aria-hidden>
          <i className="ti ti-search" aria-hidden="true" />
        </span>
        <input
          type="search"
          className="inventory-toolbar__search"
          placeholder={
            isListadoPc
              ? 'código, nombre, IP, dependencia…'
              : 'Buscar (código, nombre, IP, dependencia…)'
          }
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Buscar en inventario"
        />
      </div>
      <div className="inventory-toolbar__filters">
        <label className="inventory-toolbar__check">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => onIncludeInactiveChange(e.target.checked)}
          />
          Incluir dados de baja
        </label>
      </div>
      <div className="inventory-toolbar__actions">
        {isListadoPc ? (
          <button type="button" className="inventory-btn-excel" onClick={onExport}>
            Excel
          </button>
        ) : (
          <button type="button" className="inventory-btn-excel" onClick={onExport}>
            Exportar Excel (CSV)
          </button>
        )}
        {canWrite ? (
          <button type="button" className="inventory-btn inventory-btn--primary" onClick={onCreate}>
            Registrar equipo
          </button>
        ) : null}
        <Link className="inventory-btn inventory-btn--cta" to={`/inventario/${departmentId}/mantenimientos`}>
          Registrar mantenimiento
        </Link>
      </div>
    </div>
  );
}
