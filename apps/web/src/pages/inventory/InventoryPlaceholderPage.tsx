import { Link, useParams } from 'react-router-dom';
import { DEPARTMENTS_BASE } from '../departments/departmentExperience';
import { inventoryPcBdHojaDeVidaPath } from './inventoryHelpers';

type InventoryPlaceholderPageProps = {
  title: string;
  description: string;
};

export function InventoryPlaceholderPage({ title, description }: InventoryPlaceholderPageProps) {
  const { departmentId } = useParams<{ departmentId: string }>();
  const back = departmentId ? inventoryPcBdHojaDeVidaPath(departmentId) : DEPARTMENTS_BASE;

  return (
    <section className="module-card">
      <h2>{title}</h2>
      <p className="text-secondary" style={{ fontSize: '0.9rem' }}>
        {description}
      </p>
      <p>
        <Link to={back}>Volver al departamento</Link>
      </p>
    </section>
  );
}
