import { NavLink } from 'react-router-dom';
import { inventoryPcBdHojaDeVidaPath } from '../inventoryHelpers';

type Props = { departmentId: string };

export function InventoryPcSubnav({ departmentId }: Props) {
  const toBd = inventoryPcBdHojaDeVidaPath(departmentId);
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inventory-tab${isActive ? ' inventory-tab--active' : ''}`;

  return (
    <nav className="inventory-pc-subnav" aria-label="Vistas dentro de PC">
      <div className="inventory-tablist inventory-tablist--nested" role="tablist">
        <NavLink to={toBd} className={tabClass} end>
          BD HOJA DE VIDA
        </NavLink>
      </div>
    </nav>
  );
}
