/** Pestañas de Configuración (compartido entre sidebar y `SettingsPage`). */
export type SettingsTabId =
  | 'account'
  | 'general'
  | 'tickets'
  | 'workflows'
  | 'templates'
  | 'chat'
  | 'inventory_pc'
  | 'system'
  | 'integrations'
  | 'users';

export const SETTINGS_TAB_GROUPS: {
  groupId: string;
  label: string;
  tabs: readonly (readonly [SettingsTabId, string])[];
}[] = [
  { groupId: 'cuenta', label: 'Cuenta', tabs: [['account', 'Mi cuenta']] },
  {
    groupId: 'catalogos',
    label: 'Tickets y catálogos',
    tabs: [
      ['general', 'General'],
      ['tickets', 'Tickets'],
      ['workflows', 'Flujos'],
      ['templates', 'Plantillas'],
      ['chat', 'Chat'],
      ['inventory_pc', 'Inventario PC'],
    ],
  },
  {
    groupId: 'plataforma',
    label: 'Plataforma',
    tabs: [
      ['system', 'Sistema'],
      ['integrations', 'Integraciones API'],
      ['users', 'Usuarios'],
    ],
  },
];

export const ALL_SETTINGS_TAB_IDS: SettingsTabId[] = SETTINGS_TAB_GROUPS.flatMap((g) =>
  g.tabs.map(([id]) => id),
);

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'general';

export function isValidSettingsTab(value: string | null): value is SettingsTabId {
  return value != null && ALL_SETTINGS_TAB_IDS.includes(value as SettingsTabId);
}
