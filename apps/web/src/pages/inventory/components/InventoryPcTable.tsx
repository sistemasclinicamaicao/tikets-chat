import { useMemo, useState } from 'react';
import type { InventoryAssetRow } from '../../../lib/api';
import { dStr, inventoryEstadoBadgeClass, oneLine } from '../inventoryHelpers';
import {
  IconCamera,
  IconPencil,
  IconPrint,
  IconTrash,
  InventoryIconButton,
} from './InventoryIconButtons';

export type PcSortKey =
  | 'serie'
  | 'nombre'
  | 'ip'
  | 'dependencia'
  | 'usuario'
  | 'serialFab'
  | 'fecha'
  | 'marca'
  | 'mac'
  | 'estado'
  | 'responsable';

type SortDir = 'asc' | 'desc';

type Props = {
  assets: InventoryAssetRow[];
  canWrite: boolean;
  onView: (row: InventoryAssetRow) => void;
  onPrint: (row: InventoryAssetRow) => void;
  onEdit: (row: InventoryAssetRow) => void;
  onDelete: (row: InventoryAssetRow) => void;
};

function sortValue(row: InventoryAssetRow, key: PcSortKey): string {
  const d = row.details ?? {};
  switch (key) {
    case 'serie':
      return row.serialNumber ?? '';
    case 'nombre':
      return row.name ?? '';
    case 'ip':
      return oneLine(dStr(d, 'dir_ip'));
    case 'dependencia':
      return dStr(d, 'dependency_name');
    case 'usuario':
      return dStr(d, 'usuario');
    case 'serialFab':
      return row.manufacturerSerial ?? '';
    case 'fecha':
      return dStr(d, 'fecha_adquisicion');
    case 'marca':
      return dStr(d, 'marca');
    case 'mac':
      return oneLine(dStr(d, 'mac'));
    case 'estado':
      if (!row.isActive) return 'inactivo';
      return dStr(d, 'estado_actual');
    case 'responsable':
      return dStr(d, 'resp_equipo');
    default:
      return '';
  }
}

function SortableTh({
  label,
  title: titleAttr,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  /** Texto completo al pasar el ratón (encabezado corto para ahorrar ancho). */
  title?: string;
  sortKey: PcSortKey;
  activeKey: PcSortKey;
  dir: SortDir;
  onSort: (k: PcSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      scope="col"
      title={titleAttr ?? label}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="inventory-sort-th" onClick={() => onSort(sortKey)}>
        <span className="inventory-sort-th__label">{label}</span>
        <span className="inventory-sort-th__icons" aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}

export function InventoryPcTable({ assets, canWrite, onView, onPrint, onEdit, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<PcSortKey>('serie');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function toggleSort(key: PcSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...assets].sort((a, b) => {
      const va = sortValue(a, sortKey).toLowerCase();
      const vb = sortValue(b, sortKey).toLowerCase();
      const c = va.localeCompare(vb, 'es', { numeric: true, sensitivity: 'base' });
      return c * mult;
    });
  }, [assets, sortKey, sortDir]);

  return (
    <table className="settings-table inventory-table inventory-table--listado-pc">
      <colgroup>
        <col className="inventory-col--tool" />
        <col className="inventory-col--tool" />
        <col className="inventory-col--tool" />
        <col className="inventory-col--tool" />
        <col className="inventory-col--serie" />
        <col className="inventory-col--nombre" />
        <col className="inventory-col--ip" />
        <col className="inventory-col--dep" />
        <col className="inventory-col--user" />
        <col className="inventory-col--serial" />
        <col className="inventory-col--fecha" />
        <col className="inventory-col--marca" />
        <col className="inventory-col--mac" />
        <col className="inventory-col--estado" />
        <col className="inventory-col--resp" />
      </colgroup>
      <thead>
        <tr>
          <th className="inventory-th-tool" scope="col" title="Ver ficha / detalle">
            <span className="inventory-th-tool__hint" aria-hidden>
              <IconCamera />
            </span>
            <span className="visually-hidden">Ver ficha</span>
          </th>
          <th className="inventory-th-tool" scope="col" title="Imprimir">
            <span className="inventory-th-tool__hint" aria-hidden>
              <IconPrint />
            </span>
            <span className="visually-hidden">Imprimir</span>
          </th>
          <th className="inventory-th-tool" scope="col" title="Editar">
            <span className="inventory-th-tool__hint" aria-hidden>
              <IconPencil />
            </span>
            <span className="visually-hidden">Editar</span>
          </th>
          <th className="inventory-th-tool inventory-th-tool--danger" scope="col" title="Dar de baja">
            <span className="inventory-th-tool__hint" aria-hidden>
              <IconTrash />
            </span>
            <span className="visually-hidden">Baja</span>
          </th>
          <SortableTh
            label="Nº serie"
            title="Número de serie (código inventario)"
            sortKey="serie"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Equipo"
            title="Nombre del computador"
            sortKey="nombre"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="IP"
            title="Dirección IP"
            sortKey="ip"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Depend."
            title="Dependencia"
            sortKey="dependencia"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Usuario"
            sortKey="usuario"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Serial fab."
            title="Serial de fabricante"
            sortKey="serialFab"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="F. adquis."
            title="Fecha de adquisición"
            sortKey="fecha"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Marca"
            sortKey="marca"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="MAC"
            sortKey="mac"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Estado"
            sortKey="estado"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Responsable"
            title="Responsable del equipo"
            sortKey="responsable"
            activeKey={sortKey}
            dir={sortDir}
            onSort={toggleSort}
          />
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => {
          const d = row.details;
          const estado = dStr(d, 'estado_actual');
          const ip = oneLine(dStr(d, 'dir_ip'));
          const mac = oneLine(dStr(d, 'mac'));
          return (
            <tr key={row.id} className={!row.isActive ? 'inventory-row--inactive' : undefined}>
              <td className="inventory-td-tool">
                <InventoryIconButton label="Ver ficha del equipo" onClick={() => onView(row)}>
                  <IconCamera />
                </InventoryIconButton>
              </td>
              <td className="inventory-td-tool">
                <InventoryIconButton label="Imprimir" onClick={() => onPrint(row)}>
                  <IconPrint />
                </InventoryIconButton>
              </td>
              <td className="inventory-td-tool">
                {canWrite ? (
                  <InventoryIconButton label="Editar" onClick={() => onEdit(row)}>
                    <IconPencil />
                  </InventoryIconButton>
                ) : (
                  <span className="inventory-td-tool--empty">—</span>
                )}
              </td>
              <td className="inventory-td-tool">
                {canWrite ? (
                  <InventoryIconButton
                    label="Dar de baja"
                    variant="danger"
                    onClick={() => onDelete(row)}
                  >
                    <IconTrash />
                  </InventoryIconButton>
                ) : (
                  <span className="inventory-td-tool--empty">—</span>
                )}
              </td>
              <td
                className="inventory-td-mono inventory-td-clip"
                title={row.serialNumber ?? undefined}
              >
                {row.serialNumber ?? '—'}
              </td>
              <td className="inventory-td-wrap">{row.name}</td>
              <td className="inventory-td-mono inventory-td-clip" title={ip || undefined}>
                {ip || '—'}
              </td>
              <td className="inventory-td-wrap">{dStr(d, 'dependency_name')}</td>
              <td className="inventory-td-clip" title={dStr(d, 'usuario') || undefined}>
                {dStr(d, 'usuario')}
              </td>
              <td className="inventory-td-clip" title={row.manufacturerSerial ?? undefined}>
                {row.manufacturerSerial ?? '—'}
              </td>
              <td className="inventory-td-mono inventory-td-clip">{dStr(d, 'fecha_adquisicion')}</td>
              <td className="inventory-td-clip">{dStr(d, 'marca')}</td>
              <td className="inventory-td-mono inventory-td-mac" title={mac || undefined}>
                {mac || '—'}
              </td>
              <td className="inventory-td-estado">
                {!row.isActive ? (
                  <span className="inventory-estado-text inventory-estado-text--inactive">INACTIVO</span>
                ) : estado ? (
                  <span className={inventoryEstadoBadgeClass(estado)}>{estado}</span>
                ) : (
                  <span className="inventory-badge inventory-badge--muted">—</span>
                )}
              </td>
              <td className="inventory-td-wrap">{dStr(d, 'resp_equipo')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
