import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  currentUserProfileFromVerifyUser,
  getCurrentUserProfile,
  persistUserRolesFromProfile,
  requestOtp,
  verifyOtp,
} from '../lib/api';

type LoginPageProps = {
  onAuthenticated: () => void;
};

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const navigate = useNavigate();
  const [employeeId, setEmployeeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [sentToEmail, setSentToEmail] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function completeLoginAfterVerify(result: Awaited<ReturnType<typeof verifyOtp>>) {
    localStorage.setItem('access_token', result.access_token);
    localStorage.setItem('refresh_token', result.refresh_token);
    localStorage.setItem('user_name', result.user.name);
    localStorage.setItem('user_id', result.user.id);
    localStorage.setItem('user_employee_id', result.user.employee_id);
    if (result.user.email != null && result.user.email !== '') {
      localStorage.setItem('user_email', result.user.email);
    } else {
      localStorage.removeItem('user_email');
    }
    try {
      const profile = await getCurrentUserProfile();
      persistUserRolesFromProfile(profile);
    } catch {
      persistUserRolesFromProfile(currentUserProfileFromVerifyUser(result.user));
    }
    onAuthenticated();
    navigate('/', { replace: true });
  }

  async function onRequestOtp(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await requestOtp(employeeId.trim());
      if (result.otp_bypass && result.bypass_verify_code) {
        const verified = await verifyOtp(employeeId.trim(), result.bypass_verify_code);
        await completeLoginAfterVerify(verified);
        return;
      }
      setStep('verify');
      setExpiresAt(result.expires_at);
      setSentToEmail(result.masked_email);
      setEmployeeName(result.employee_name);
    } catch (err) {
      if (err instanceof ApiError && (err.message.includes('USER_NOT_FOUND') || err.status === 404)) {
        setError('No encontramos ese usuario. Verifica cédula/documento o employee_id.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo solicitar OTP');
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setError('');
    setLoading(true);
    try {
      const result = await requestOtp(employeeId.trim());
      setExpiresAt(result.expires_at);
      setSentToEmail(result.masked_email);
      setEmployeeName(result.employee_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar OTP');
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await verifyOtp(employeeId.trim(), otpCode.trim());
      await completeLoginAfterVerify(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('El OTP es inválido o expiró. Solicita uno nuevo.');
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo verificar OTP');
      }
    } finally {
      setLoading(false);
    }
  }

  function resetStep() {
    setStep('request');
    setOtpCode('');
    setExpiresAt('');
    setSentToEmail('');
    setEmployeeName('');
    setError('');
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Chat Tickets</h1>
        <p>Ingreso por OTP (como flujo original)</p>
        <form onSubmit={step === 'request' ? onRequestOtp : onVerifyOtp}>
          <label htmlFor="employee-id">Cédula o documento (listado oficial de empleados)</label>
          <input
            id="employee-id"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            placeholder="Ingresa tu cédula o documento"
            disabled={loading || step === 'verify'}
          />

          {step === 'verify' && (
            <>
              <label htmlFor="otp-code">Codigo OTP</label>
              <input
                id="otp-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="6 digitos"
                maxLength={6}
                disabled={loading}
              />
              {expiresAt ? (
                <p className="hint">
                  OTP vigente hasta: {new Date(expiresAt).toLocaleTimeString()}
                </p>
              ) : null}
              {sentToEmail ? <p className="hint">Codigo enviado a: {sentToEmail}</p> : null}
              {employeeName ? <p className="hint">Empleado: {employeeName}</p> : null}
            </>
          )}

          {error ? <p className="error">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? 'Procesando...' : step === 'request' ? 'Solicitar OTP' : 'Ingresar'}
          </button>
          {step === 'verify' ? (
            <div className="inline-actions">
              <button type="button" className="secondary-btn" onClick={resendOtp} disabled={loading}>
                Reenviar OTP
              </button>
              <button type="button" className="secondary-btn" onClick={resetStep} disabled={loading}>
                Cambiar usuario
              </button>
            </div>
          ) : null}
        </form>
      </section>
    </main>
  );
}
