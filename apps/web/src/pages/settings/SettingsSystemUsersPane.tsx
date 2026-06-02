import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminListUsers,
  adminUpdateUserGlobalRole,
  postAdminGthSyncUsers,
  type AdminUserRow,
  type AdminUsersSummary,
} from '../../lib/api';
import { SettingsSystemUsersModal } from './components/SettingsSystemUsersModal';
import { SettingsSystemUsersHeader } from './components/SettingsSystemUsersHeader';
import { SettingsSystemUsersTable } from './components/SettingsSystemUsersTable';
import {
  SettingsSystemUsersToolbar,
  type SettingsSystemUsersActiveFilter,
  type SettingsSystemUsersGlobalRoleFilter,
} from './components/SettingsSystemUsersToolbar';
import { SettingsUsersToast } from './SettingsUsersToast';
import { settingsErrorMessage } from './settingsUtils';

type ToastState = { message: string; variant: 'success' | 'error' };
const emptyToast: ToastState = { message: '', variant: 'success' };

type Props = {
  onMessage: (s: string | null) => void;
};

const PAGE_SIZE = 30;

export function SettingsSystemUsersPane({ onMessage }: Props) {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [globalRoleFilter, setGlobalRoleFilter] = useState<SettingsSystemUsersGlobalRoleFilter>('');
  const [activeFilter, setActiveFilter] = useState<SettingsSystemUsersActiveFilter>('');
  const [data, setData] = useState<{
    items: AdminUserRow[];
    total: number;
    summary: AdminUsersSummary;
  } | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [globalRoleDraft, setGlobalRoleDraft] = useState('');
  const [listToast, setListToast] = useState<ToastState>(emptyToast);
  const [detailToast, setDetailToast] = useState<ToastState>(emptyToast);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [syncingFromGth, setSyncingFromGth] = useState(false);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, globalRoleFilter, activeFilter]);

  const listParams = useMemo(
    () => ({
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      q: searchQuery || undefined,
      global_role: globalRoleFilter || undefined,
      is_active:
        activeFilter === 'true' ? true : activeFilter === 'false' ? false : undefined,
    }),
    [page, searchQuery, globalRoleFilter, activeFilter],
  );

  const refresh = useCallback(() => {
    onMessage(null);
    setListLoading(true);
    return adminListUsers(listParams)
      .then((res) => setData(res))
      .catch((err) =>
        setListToast({
          message: settingsErrorMessage(err, 'No se pudo cargar la lista de usuarios.'),
          variant: 'error',
        }),
      )
      .finally(() => setListLoading(false));
  }, [onMessage, listParams]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (selected) {
      setGlobalRoleDraft(selected.global_role ?? '');
      setDetailToast(emptyToast);
    } else {
      setGlobalRoleDraft('');
    }
  }, [selected]);

  function syncSelectedFromList(items: AdminUserRow[]) {
    if (!selected) return;
    const updated = items.find((u) => u.id === selected.id);
    if (updated) setSelected(updated);
  }

  async function syncUsersFromGthDirectory() {
    setSyncingFromGth(true);
    setListToast(emptyToast);
    try {
      const res = await postAdminGthSyncUsers();
      setListToast({
        message: `Usuarios actualizados desde GTH: ${res.created} creado(s), ${res.updated} actualizado(s).`,
        variant: 'success',
      });
      await refresh();
    } catch (err) {
      setListToast({
        message: settingsErrorMessage(err, 'No se pudo actualizar usuarios desde GTH.'),
        variant: 'error',
      });
    } finally {
      setSyncingFromGth(false);
    }
  }

  async function saveGlobalRole() {
    if (!selected) return;
    const gr = globalRoleDraft === '' ? null : (globalRoleDraft as 'admin' | 'auditor');
    setSavingGlobal(true);
    setDetailToast(emptyToast);
    try {
      await adminUpdateUserGlobalRole(selected.id, gr);
      setDetailToast({ message: 'Rol global actualizado', variant: 'success' });
      onMessage(null);
      const fresh = await adminListUsers(listParams);
      setData(fresh);
      syncSelectedFromList(fresh.items);
    } catch (err) {
      setDetailToast({
        message: settingsErrorMessage(err, 'No se pudo actualizar el rol global.'),
        variant: 'error',
      });
    } finally {
      setSavingGlobal(false);
    }
  }

  return (
    <div className="settings-system-users">
      <SettingsSystemUsersHeader summary={data?.summary ?? null} />

      <SettingsUsersToast
        message={listToast.message}
        variant={listToast.variant}
        onDismiss={() => setListToast(emptyToast)}
      />

      <div className="settings-system-users__layout">
        <SettingsSystemUsersToolbar
          searchQ={searchInput}
          onSearchChange={setSearchInput}
          globalRoleFilter={globalRoleFilter}
          onGlobalRoleFilterChange={setGlobalRoleFilter}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
          onSyncFromGth={() => void syncUsersFromGthDirectory()}
          syncingFromGth={syncingFromGth}
        />

        <SettingsSystemUsersTable
          items={data?.items ?? []}
          loading={listLoading}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          filteredTotal={data?.total ?? 0}
          page={page}
          pageCount={pageCount}
          onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => p + 1)}
        />
      </div>

      <SettingsSystemUsersModal
        selected={selected}
        globalRoleDraft={globalRoleDraft}
        onGlobalRoleDraftChange={setGlobalRoleDraft}
        savingGlobal={savingGlobal}
        onSaveGlobalRole={() => void saveGlobalRole()}
        toastMessage={detailToast.message}
        toastVariant={detailToast.variant}
        onDismissToast={() => setDetailToast(emptyToast)}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
