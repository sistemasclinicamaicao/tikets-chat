import { Link, useParams } from 'react-router-dom';

type InventoryPlaceholderPageProps = {
  title: string;
  description: string;
};

export function InventoryPlaceholderPage({ title, description }: InventoryPlaceholderPageProps) {
  const { departmentId } = useParams<{ departmentId: string }>();
  const back = departmentId
    ? `/inventario/${departmentId}/hoja-de-vida/pc/bd-hoja-de-vida`
    : '/inventario';

  return (
    <section className="module-card">
      <h2>{title}</h2>
      <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>{description}</p>
      <p>
        <Link to={back}>Volver al inventario</Link>
      </p>
    </section>
  );
}
