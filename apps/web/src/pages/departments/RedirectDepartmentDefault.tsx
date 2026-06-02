import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { getTicketDepartments } from '../../lib/api';
import { DEPARTMENTS_BASE, departmentDefaultPath } from './departmentExperience';

export function RedirectDepartmentDefault() {
  const { departmentId = '' } = useParams<{ departmentId: string }>();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!departmentId) {
      setTarget(DEPARTMENTS_BASE);
      return;
    }
    void getTicketDepartments()
      .then((depts) => {
        const dept = depts.find((d) => d.id === departmentId);
        setTarget(dept ? departmentDefaultPath(dept.id, dept.name) : DEPARTMENTS_BASE);
      })
      .catch(() => setTarget(DEPARTMENTS_BASE));
  }, [departmentId]);

  if (!target) {
    return <p>Cargando…</p>;
  }
  return <Navigate to={target} replace />;
}
