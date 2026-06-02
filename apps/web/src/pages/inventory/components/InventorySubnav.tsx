import { NavLink } from 'react-router-dom';
import { DEPARTMENTS_BASE } from '../../departments/departmentExperience';
import { inventoryPcBdHojaDeVidaPath } from '../inventoryHelpers';

type Props = { departmentId: string };

export function InventorySubnav({ departmentId }: Props) {
  const base = `${DEPARTMENTS_BASE}/${departmentId}`;
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inventory-tab${isActive ? ' inventory-tab--active' : ''}`;

  return (
    <nav className="inventory-subnav" aria-label="Secciones inventario">
      <div className="inventory-tablist" role="tablist">
        <NavLink to={inventoryPcBdHojaDeVidaPath(departmentId)} className={tabClass}>
          PC
        </NavLink>
        <NavLink to={`${base}/hoja-de-vida/impresoras`} className={tabClass}>
          Impresoras
        </NavLink>
        <NavLink to={`${base}/hoja-de-vida/redes`} className={tabClass}>
          Redes
        </NavLink>
        <NavLink to={`${base}/hoja-de-vida/otros-equipos`} className={tabClass}>
          Otros
        </NavLink>
        <NavLink to={`${base}/mantenimientos`} className={tabClass}>
          Mantenimientos
        </NavLink>
        <NavLink to={`${base}/dar-bajas`} className={tabClass}>
          Dar bajas
        </NavLink>
        <NavLink to={DEPARTMENTS_BASE} className={tabClass}>
          Departamentos
        </NavLink>
      </div>
    </nav>
  );
}
