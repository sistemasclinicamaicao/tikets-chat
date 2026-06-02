import { DEPARTMENTS_BASE, departmentAltasGthPath, isComunicacionesDepartment } from '../departments/departmentExperience';

/** Subpestaña bajo PC: datos desde integración BD (API). */
export const INVENTORY_PC_BD_SUBPATH = 'pc/bd-hoja-de-vida' as const;

export { DEPARTMENTS_BASE, departmentAltasGthPath, isComunicacionesDepartment };

export function inventoryPcBdHojaDeVidaPath(departmentId: string) {
  return `${DEPARTMENTS_BASE}/${departmentId}/hoja-de-vida/${INVENTORY_PC_BD_SUBPATH}`;
}

/** @deprecated Use departmentAltasGthPath */
export function inventoryComunicacionesGthPath(departmentId: string) {
  return departmentAltasGthPath(departmentId);
}

export const SLUG_TO_CATEGORY: Record<string, string> = {
  pc: 'pc',
  impresoras: 'printer',
  redes: 'network',
  'otros-equipos': 'other',
};

export const CATEGORY_TITLE: Record<string, string> = {
  pc: 'Equipos PC',
  printer: 'Impresoras',
  network: 'Equipos de red',
  other: 'Otros equipos',
};

export function dStr(d: Record<string, unknown>, key: string): string {
  const v = d[key];
  if (v == null) return '';
  return String(v);
}

/** Colapsa saltos y espacios (p. ej. MAC o IP pegadas en varias líneas desde legado). */
export function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export type PcDetailForm = {
  dir_ip: string;
  dependency_id: string;
  dependency_name: string;
  usuario: string;
  fecha_adquisicion: string;
  marca: string;
  modelo: string;
  procesador: string;
  tp_almacenamiento: string;
  tam_disco: string;
  tarjeta_grafica: string;
  fecha_instalacion: string;
  tp_ram: string;
  ram: string;
  monitor: string;
  sis_operativo: string;
  vers_sistema: string;
  desc_programa: string;
  remoto: string;
  estado_actual: string;
  motivo_inactividad: string;
  resp_equipo: string;
  comentario: string;
  licencia_of: string;
  fecha_instalacion_lic: string;
  image_url: string;
  mac: string;
};

export function emptyPcForm(): PcDetailForm {
  return {
    dir_ip: '',
    dependency_id: '',
    dependency_name: '',
    usuario: '',
    fecha_adquisicion: '',
    marca: '',
    modelo: '',
    procesador: '',
    tp_almacenamiento: '',
    tam_disco: '',
    tarjeta_grafica: '',
    fecha_instalacion: '',
    tp_ram: '',
    ram: '',
    monitor: '',
    sis_operativo: '',
    vers_sistema: '',
    desc_programa: '',
    remoto: '',
    estado_actual: '',
    motivo_inactividad: '',
    resp_equipo: '',
    comentario: '',
    licencia_of: '',
    fecha_instalacion_lic: '',
    image_url: '',
    mac: '',
  };
}

export function pcFormFromDetails(details: Record<string, unknown>): PcDetailForm {
  const f = emptyPcForm();
  (Object.keys(f) as (keyof PcDetailForm)[]).forEach((k) => {
    const v = details[k];
    f[k] = v == null ? '' : String(v);
  });
  return f;
}

export function pcFormToDetails(f: PcDetailForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  (Object.entries(f) as [keyof PcDetailForm, string][]).forEach(([k, v]) => {
    const t = v.trim();
    if (k === 'dependency_id') {
      if (t) out.dependency_id = Number(t);
      else out.dependency_id = null;
      return;
    }
    out[k] = t || null;
  });
  return out;
}

/** Convierte fechas legado dd/mm/aaaa (o yyyy-mm-dd) a valor de <input type="date">. */
export function legacyDateToInputValue(s: string): string {
  const t = s.trim();
  if (!t) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return '';
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

/** Clase CSS para badge de estado operativo (insensible a mayúsculas). */
export function inventoryEstadoBadgeClass(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return 'inventory-badge inventory-badge--muted';
  if (['BUENO', 'ÓPTIMO', 'OPTIMO', 'ACTIVO', 'OPERATIVO', 'OK'].some((x) => s.includes(x)))
    return 'inventory-badge inventory-badge--success';
  if (['MALO', 'DEFECTUOSO', 'DAÑADO', 'CRÍTICO', 'CRITICO', 'FALLA'].some((x) => s.includes(x)))
    return 'inventory-badge inventory-badge--danger';
  if (['MANTENIMIENTO', 'REPARACIÓN', 'REPARACION', 'PENDIENTE'].some((x) => s.includes(x)))
    return 'inventory-badge inventory-badge--warning';
  return 'inventory-badge inventory-badge--neutral';
}
