import type { InventoryAssetRow } from '../../../lib/api';
import { dStr, oneLine } from '../inventoryHelpers';
import { IconEye, IconPencil, IconTrash, InventoryIconButton } from './InventoryIconButtons';

type Props = {
  assets: InventoryAssetRow[];
  apiCategory: string;
  canWrite: boolean;
  onView: (row: InventoryAssetRow) => void;
  onEdit: (row: InventoryAssetRow) => void;
  onDelete: (row: InventoryAssetRow) => void;
};

function detailSummary(row: InventoryAssetRow, category: string): string {
  const d = row.details ?? {};
  const parts: string[] = [];
  if (category === 'printer') {
    const ip = dStr(d, 'ip');
    const u = dStr(d, 'ubicacion');
    if (u) parts.push(`Ubic.: ${u}`);
    if (ip) parts.push(`IP: ${ip}`);
  } else if (category === 'network') {
    const t = dStr(d, 'tipo');
    const ip = oneLine(dStr(d, 'ip_gestion'));
    if (t) parts.push(`Tipo: ${t}`);
    if (ip) parts.push(`IP gest.: ${ip}`);
  } else {
    const t = dStr(d, 'tipo_libre');
    if (t) parts.push(`Tipo: ${t}`);
  }
  const marca = dStr(d, 'marca');
  const modelo = dStr(d, 'modelo');
  if (marca || modelo) parts.push([marca, modelo].filter(Boolean).join(' '));
  const estado = dStr(d, 'estado');
  const resp = dStr(d, 'responsable');
  if (estado) parts.push(`Estado: ${estado}`);
  if (resp) parts.push(`Resp.: ${resp}`);
  const mac = oneLine(dStr(d, 'mac'));
  if (mac) parts.push(`MAC: ${mac}`);
  return parts.length ? parts.join(' · ') : '—';
}

export function InventoryGenericTable({
  assets,
  apiCategory,
  canWrite,
  onView,
  onEdit,
  onDelete,
}: Props) {
  return (
    <table className="settings-table inventory-table">
      <thead>
        <tr>
          <th>Código</th>
          <th>Nombre</th>
          <th>Serial fab.</th>
          <th>Resumen</th>
          <th>Activo</th>
          <th className="inventory-th-actions">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((row) => (
          <tr key={row.id} className={!row.isActive ? 'inventory-row--inactive' : undefined}>
            <td>
              <span className="inventory-code-cell">
                {row.serialNumber ?? '—'}
                {!row.isActive ? (
                  <span className="inventory-badge inventory-badge--inactive" title="Dado de baja">
                    Baja
                  </span>
                ) : null}
              </span>
            </td>
            <td>{row.name}</td>
            <td>{row.manufacturerSerial ?? '—'}</td>
            <td className="inventory-summary-cell">{detailSummary(row, apiCategory)}</td>
            <td>{row.isActive ? 'Sí' : 'No'}</td>
            <td className="inventory-actions">
              <div className="inventory-actions__group">
                <InventoryIconButton label="Ver detalle" onClick={() => onView(row)}>
                  <IconEye />
                </InventoryIconButton>
                {canWrite ? (
                  <>
                    <InventoryIconButton label="Editar" onClick={() => onEdit(row)}>
                      <IconPencil />
                    </InventoryIconButton>
                    <InventoryIconButton
                      label="Dar de baja"
                      variant="danger"
                      onClick={() => onDelete(row)}
                    >
                      <IconTrash />
                    </InventoryIconButton>
                  </>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
