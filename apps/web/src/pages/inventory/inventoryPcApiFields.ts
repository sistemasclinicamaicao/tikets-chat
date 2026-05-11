/**
 * Columnas de la vista Inventario → PC (API), alineadas al JSON del servicio externo.
 * Orden fijo indicado por negocio; el siguiente paso será rellenar filas desde la integración.
 */
export const INVENTORY_PC_API_FIELDS = [
  'id_pc',
  'num_serie',
  'nom_compu',
  'dir_ip',
  'id_dependencia',
  'usuario',
  'seriall',
  'fecha_adquisicion',
  'marca',
  'modelo',
  'procesador',
  'tp_almacenamiento',
  'tam_disco',
  'tarjeta_grafica',
  'fecha_instalacion',
  'tp_ram',
  'ram',
  'monitor',
  'sis_operativo',
  'vers_sistema',
  'desc_programa',
  'remoto',
  'estado_actual',
  'motivo_inactividad',
  'resp_equipo',
  'comentario',
  'licencia_of',
  'fecha_instalacion_lic',
  'imagen',
  'mac',
  'fech_crea',
  'fech_modi',
  'fech_elim',
  'est',
  'id_users',
] as const;

export type InventoryPcApiField = (typeof INVENTORY_PC_API_FIELDS)[number];
