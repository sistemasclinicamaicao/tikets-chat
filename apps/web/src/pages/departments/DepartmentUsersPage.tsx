import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  ApiError,
  canManageDepartmentUsers,
  getCurrentUserProfile,
  getTicketDepartments,
  listDepartmentUsers,
  removeDepartmentUser,
  searchDepartmentUsers,
  upsertDepartmentUser,
  type CurrentUserProfile,
  type DepartmentUserMember,
  type DepartmentUserSearchHit,
  type TicketDepartmentOption,
} from '../../lib/api';
import { computeMemberStats } from '../../lib/userRolesUi';
import { DEPARTMENTS_BASE } from './departmentExperience';
import { DepartmentUsersAddPanel } from './components/DepartmentUsersAddPanel';
import { DepartmentUsersHeader } from './components/DepartmentUsersHeader';
import { DepartmentUsersMembersTable } from './components/DepartmentUsersMembersTable';
import {
  DepartmentUsersTabs,
  type DepartmentUsersTabId,
} from './components/DepartmentUsersTabs';

type ToastState = { message: string; variant: 'success' | 'error' };
const emptyToast: ToastState = { message: '', variant: 'success' };

export function DepartmentUsersPage() {
  const { departmentId = '' } = useParams<{ departmentId: string }>();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [departments, setDepartments] = useState<TicketDepartmentOption[]>([]);
  const [members, setMembers] = useState<DepartmentUserMember[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [addToast, setAddToast] = useState<ToastState>(emptyToast);
  const [membersToast, setMembersToast] = useState<ToastState>(emptyToast);
  const [searchQ, setSearchQ] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHits, setSearchHits] = useState<DepartmentUserSearchHit[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [addRole, setAddRole] = useState<string>('tecnico_area');
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DepartmentUsersTabId>('members');

  const department = useMemo(
    () => departments.find((d) => d.id === departmentId) ?? null,
    [departments, departmentId],
  );

  const canManage = profile ? canManageDepartmentUsers(profile, departmentId) : false;
  const stats = useMemo(() => computeMemberStats(members), [members]);

  const refreshMembers = useCallback(() => {
    if (!departmentId || !canManage) return Promise.resolve();
    setMembersLoading(true);
    return listDepartmentUsers(departmentId)
      .then((res) => setMembers(res.items))
      .catch((e) =>
        setMembersToast({
          message: e instanceof ApiError ? e.message : 'No se pudo cargar la lista de miembros',
          variant: 'error',
        }),
      )
      .finally(() => setMembersLoading(false));
  }, [canManage, departmentId]);

  useEffect(() => {
    void Promise.all([getCurrentUserProfile(), getTicketDepartments()])
      .then(([p, d]) => {
        setProfile(p);
        setDepartments(d);
      })
      .catch((e) =>
        setPageError(e instanceof ApiError ? e.message : 'No se pudieron cargar los datos'),
      )
      .finally(() => setPageLoading(false));
  }, []);

  useEffect(() => {
    if (!profile || !canManage) return;
    void refreshMembers();
  }, [profile, canManage, refreshMembers]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchQuery(searchQ.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (!departmentId || !canManage) return;
    if (searchQuery.length < 2) {
      setSearchHits([]);
      setSearchDone(false);
      setSearchBusy(false);
      return;
    }

    let cancelled = false;
    setSearchBusy(true);
    setSearchDone(false);
    setAddToast(emptyToast);

    void searchDepartmentUsers(departmentId, searchQuery)
      .then((res) => {
        if (cancelled) return;
        setSearchHits(res.items);
        setSearchDone(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setSearchHits([]);
        setSearchDone(true);
        setAddToast({
          message: err instanceof ApiError ? err.message : 'No se pudo buscar usuarios',
          variant: 'error',
        });
      })
      .finally(() => {
        if (!cancelled) setSearchBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, departmentId, searchQuery]);

  async function onChangeRole(member: DepartmentUserMember, role: string) {
    if (!departmentId || role === member.role) return;
    setRowBusy(member.user_id);
    setMembersToast(emptyToast);
    try {
      await upsertDepartmentUser(departmentId, member.user_id, role);
      setMembersToast({ message: 'Rol actualizado', variant: 'success' });
      await refreshMembers();
    } catch (err) {
      setMembersToast({
        message: err instanceof ApiError ? err.message : 'No se pudo actualizar el rol',
        variant: 'error',
      });
    } finally {
      setRowBusy(null);
    }
  }

  async function onConfirmRemove(member: DepartmentUserMember) {
    if (!departmentId) return;
    setRowBusy(member.user_id);
    setMembersToast(emptyToast);
    try {
      await removeDepartmentUser(departmentId, member.user_id);
      setConfirmRemoveId(null);
      setMembersToast({ message: 'Usuario quitado del departamento', variant: 'success' });
      await refreshMembers();
    } catch (err) {
      setMembersToast({
        message: err instanceof ApiError ? err.message : 'No se pudo quitar al usuario',
        variant: 'error',
      });
    } finally {
      setRowBusy(null);
    }
  }

  async function onAddUser(hit: DepartmentUserSearchHit) {
    if (!departmentId) return;
    setRowBusy(hit.user_id);
    setAddToast(emptyToast);
    try {
      await upsertDepartmentUser(departmentId, hit.user_id, addRole);
      setAddToast({
        message: hit.in_department ? 'Rol actualizado' : 'Usuario agregado al departamento',
        variant: 'success',
      });
      setSearchHits((prev) =>
        prev.map((h) =>
          h.user_id === hit.user_id
            ? { ...h, in_department: true, current_role: addRole }
            : h,
        ),
      );
      await refreshMembers();
      setActiveTab('members');
    } catch (err) {
      setAddToast({
        message: err instanceof ApiError ? err.message : 'No se pudo agregar al usuario',
        variant: 'error',
      });
    } finally {
      setRowBusy(null);
    }
  }

  if (!pageLoading && profile && !canManage) {
    return <Navigate to={DEPARTMENTS_BASE} replace />;
  }

  return (
    <section className="inventory-page dept-users-page">
      {pageLoading ? (
        <div className="dept-users-page-loading">
          <span className="inventory-spinner" aria-hidden="true" />
          <span>Cargando…</span>
        </div>
      ) : null}

      {!pageLoading && canManage ? (
        <>
          <DepartmentUsersHeader
            departmentName={department?.name ?? ''}
            stats={stats}
          />

          {pageError ? (
            <div className="dept-users-toast dept-users-toast--error" role="alert">
              {pageError}
            </div>
          ) : null}

          <DepartmentUsersTabs
            active={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'members', label: 'Miembros', count: stats.total },
              { id: 'add', label: 'Agregar miembro' },
            ]}
          />

          <div className="dept-users-page__body">
            {activeTab === 'members' ? (
              <DepartmentUsersMembersTable
              members={members}
              loading={membersLoading}
              rowBusy={rowBusy}
              confirmRemoveId={confirmRemoveId}
              toastMessage={membersToast.message}
              toastVariant={membersToast.variant}
              onDismissToast={() => setMembersToast(emptyToast)}
              onChangeRole={(member, role) => void onChangeRole(member, role)}
              onRequestRemove={(member) => setConfirmRemoveId(member.user_id)}
              onConfirmRemove={(member) => void onConfirmRemove(member)}
              onCancelRemove={() => setConfirmRemoveId(null)}
              showHead={false}
            />
            ) : (
              <DepartmentUsersAddPanel
              searchQ={searchQ}
              onSearchChange={(value) => {
                setSearchQ(value);
                if (value.trim().length < 2) setAddToast(emptyToast);
              }}
              addRole={addRole}
              onAddRoleChange={setAddRole}
              searchBusy={searchBusy}
              searchDone={searchDone}
              searchHits={searchHits}
              rowBusy={rowBusy}
              toastMessage={addToast.message}
              toastVariant={addToast.variant}
              onDismissToast={() => setAddToast(emptyToast)}
              onAddUser={(hit) => void onAddUser(hit)}
              showHead={false}
            />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
