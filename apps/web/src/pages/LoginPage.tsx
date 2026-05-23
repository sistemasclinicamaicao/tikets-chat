import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessengerLoginAvatar } from '../components/MessengerLoginAvatar';
import {
  API_BASE,
  ApiError,
  currentUserProfileFromVerifyUser,
  describeApiError,
  getCurrentUserProfile,
  persistUserRolesFromProfile,
  requestOtp,
  verifyOtp,
} from '../lib/api';
import { persistNewLoginSession } from '../lib/authStorage';
import { resolveClientDeviceName } from '../lib/clientDevice';
import {
  loadRememberedLoginAccounts,
  RememberedLoginAccount,
  upsertRememberedLoginAccount,
} from '../lib/loginRememberedAccounts';

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
  const [rememberedAccounts, setRememberedAccounts] = useState<RememberedLoginAccount[]>([]);
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    const accounts = loadRememberedLoginAccounts();
    setRememberedAccounts(accounts);
    if (accounts.length > 0) {
      setEmployeeId((prev) => (prev.trim() ? prev : accounts[0].employeeId));
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let cancelled = false;
    fetch(`${API_BASE}/health`, { method: 'GET' })
      .then((r) => {
        if (!cancelled) setApiReachable(r.ok);
      })
      .catch(() => {
        if (!cancelled) setApiReachable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedEmployeeId = employeeId.trim();

  const selectedRemembered = useMemo(
    () => rememberedAccounts.find((a) => a.employeeId === trimmedEmployeeId) ?? null,
    [rememberedAccounts, trimmedEmployeeId],
  );

  const displayName =
    step === 'verify' && employeeName
      ? employeeName
      : selectedRemembered?.name ?? '';

  const displaySeed =
    step === 'verify' && employeeName
      ? employeeName
      : selectedRemembered?.employeeId ?? '';

  const verifyMeta = useMemo(() => {
    const parts: string[] = [];
    if (sentToEmail) parts.push(`Código enviado a ${sentToEmail}`);
    if (expiresAt) {
      parts.push(`Válido hasta ${new Date(expiresAt).toLocaleTimeString()}`);
    }
    return parts.join(' · ');
  }, [sentToEmail, expiresAt]);

  function rememberAccount(id: string, name: string) {
    upsertRememberedLoginAccount(id, name);
    setRememberedAccounts(loadRememberedLoginAccounts());
  }

  function useAnotherAccount() {
    setEmployeeId('');
    setError('');
  }

  async function completeLoginAfterVerify(
    result: Awaited<ReturnType<typeof verifyOtp>>,
    deviceName: string,
  ) {
    rememberAccount(result.user.employee_id, result.user.name);
    persistNewLoginSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      device_name: result.device_name ?? deviceName,
      user: result.user,
    });
    try {
      const profile = await getCurrentUserProfile();
      persistUserRolesFromProfile(profile);
      rememberAccount(profile.employee_id, profile.name);
    } catch {
      persistUserRolesFromProfile(currentUserProfileFromVerifyUser(result.user));
    }
    onAuthenticated();
    navigate('/chat', { replace: true });
  }

  async function onRequestOtp(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await requestOtp(trimmedEmployeeId);
      rememberAccount(result.employee_id, result.employee_name);
      if (result.otp_bypass && result.bypass_verify_code) {
        const deviceName = await resolveClientDeviceName();
        const verified = await verifyOtp(trimmedEmployeeId, result.bypass_verify_code, deviceName);
        await completeLoginAfterVerify(verified, deviceName);
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
        setError(describeApiError(err, 'No se pudo solicitar OTP'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setError('');
    setLoading(true);
    try {
      const result = await requestOtp(trimmedEmployeeId);
      rememberAccount(result.employee_id, result.employee_name);
      setExpiresAt(result.expires_at);
      setSentToEmail(result.masked_email);
      setEmployeeName(result.employee_name);
    } catch (err) {
      setError(describeApiError(err, 'No se pudo reenviar OTP'));
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const deviceName = await resolveClientDeviceName();
      const result = await verifyOtp(trimmedEmployeeId, otpCode.trim(), deviceName);
      await completeLoginAfterVerify(result, deviceName);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('El OTP es inválido o expiró. Solicita uno nuevo.');
      } else {
        setError(describeApiError(err, 'No se pudo verificar OTP'));
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

  const submitLabel =
    loading ? 'Procesando...' : step === 'request' ? 'Continuar' : 'Ingresar';

  const showMainAvatar = Boolean(displayName);

  return (
    <main className="messenger-login">
      <div className="messenger-login__panel">
        <header className="messenger-login__brand">
          <span className="messenger-login__brand-lead">Inicia sesión en</span>
          <span className="messenger-login__brand-name">Chat Tickets</span>
        </header>

        <div className="messenger-login__layout">
          <aside className="messenger-login__aside">
            {showMainAvatar ? (
              <MessengerLoginAvatar
                name={displayName}
                seed={displaySeed}
                size="lg"
                selected
              />
            ) : (
              <span
                className="messenger-login__avatar messenger-login__avatar--lg messenger-login__avatar--placeholder"
                aria-hidden
              >
                <i className="ti ti-user" aria-hidden="true" />
              </span>
            )}

            {displayName ? (
              <p className="messenger-login__persona" title={displayName}>
                {step === 'verify' ? (
                  <span className="messenger-login__persona-lead">Iniciar sesión como</span>
                ) : null}
                <span className="messenger-login__persona-name">{displayName}</span>
              </p>
            ) : null}

            {step === 'request' && selectedRemembered ? (
              <button
                type="button"
                className="messenger-login__link messenger-login__switch-account"
                onClick={useAnotherAccount}
                disabled={loading}
              >
                Otra cuenta
              </button>
            ) : null}
          </aside>

          <section className="messenger-login__form-wrap">
            <form
              className="messenger-login__form"
              onSubmit={step === 'request' ? onRequestOtp : onVerifyOtp}
            >
              <label className="messenger-login__label" htmlFor="employee-id">
                Cédula o documento
              </label>
              <input
                id="employee-id"
                className="messenger-login__field"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="Ingresa tu cédula o documento"
                disabled={loading || step === 'verify'}
                autoComplete="username"
              />

              {step === 'verify' ? (
                <>
                  <label className="messenger-login__label" htmlFor="otp-code">
                    Código OTP
                  </label>
                  <input
                    id="otp-code"
                    className="messenger-login__field"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6 dígitos"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    disabled={loading}
                  />
                  {verifyMeta ? (
                    <p className="messenger-login__meta">{verifyMeta}</p>
                  ) : null}
                </>
              ) : null}

              {apiReachable === false && !error ? (
                <p className="messenger-login__meta messenger-login__meta--warn">
                  No hay conexión con el API ({API_BASE}). Inicia el backend en el puerto 3030.
                </p>
              ) : null}
              {error ? <p className="error messenger-login__error">{error}</p> : null}

              <div className="messenger-login__actions">
                <button type="submit" className="messenger-login__btn" disabled={loading}>
                  {submitLabel}
                </button>
                {step === 'verify' ? (
                  <button
                    type="button"
                    className="messenger-login__btn messenger-login__btn--secondary"
                    onClick={resetStep}
                    disabled={loading}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>

              {step === 'verify' ? (
                <div className="messenger-login__links">
                  <button
                    type="button"
                    className="messenger-login__link"
                    onClick={resendOtp}
                    disabled={loading}
                  >
                    Reenviar código
                  </button>
                  <span className="messenger-login__link-sep" aria-hidden>
                    ·
                  </span>
                  <button
                    type="button"
                    className="messenger-login__link"
                    onClick={resetStep}
                    disabled={loading}
                  >
                    Cambiar usuario
                  </button>
                </div>
              ) : null}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
