import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Copy, Database, KeyRound, ShieldCheck, Wine } from 'lucide-react';

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
};

const App: React.FC = () => {
  const [license, setLicense] = useState<OmniLicenseStatus | null>(null);
  const [database, setDatabase] = useState<OmniDatabaseInfo | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const status = await window.omniStandalone.license.getStatus();
    setLicense(status);
    if (status.status === 'active') {
      setDatabase(await window.omniStandalone.database.getInfo());
    }
  };

  useEffect(() => {
    refresh().catch(error => setError(error instanceof Error ? error.message : 'No fue posible iniciar OmniManager.'));
  }, []);

  const remaining = useMemo(() => {
    if (!license?.remainingMs) return '';
    const hours = Math.max(0, Math.ceil(license.remainingMs / 3_600_000));
    const days = Math.floor(hours / 24);
    const remainder = hours % 24;
    return days > 0 ? `${days} día${days === 1 ? '' : 's'} y ${remainder} h` : `${hours} h`;
  }, [license?.remainingMs]);

  const startDemo = async () => {
    setBusy(true);
    setError('');
    try {
      setLicense(await window.omniStandalone.license.startDemo());
      setDatabase(await window.omniStandalone.database.getInfo());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No fue posible iniciar la demo.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = licenseKey.trim();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      setLicense(await window.omniStandalone.license.activate(token));
      setDatabase(await window.omniStandalone.database.getInfo());
      setLicenseKey('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'La licencia no pudo ser validada.');
    } finally {
      setBusy(false);
    }
  };

  if (!license) {
    return <div className="boot-screen">Iniciando OmniManager Botillerías…</div>;
  }

  if (license.status !== 'active') {
    return (
      <main className="license-screen">
        <section className="license-card">
          <div className="brand-mark"><Wine size={28} /></div>
          <div className="eyebrow">OMNIMANAGER</div>
          <h1>Botillerías</h1>
          <p className="lead">Gestión local para Windows. La operación del negocio permanece en este PC.</p>

          <div className="installation-box">
            <div>
              <span>Código de este PC</span>
              <strong>{license.installationId}</strong>
            </div>
            <button
              type="button"
              title="Copiar código del PC"
              onClick={() => navigator.clipboard.writeText(license.installationId)}
            >
              <Copy size={17} />
            </button>
          </div>

          {license.status === 'demo_available' && (
            <button className="demo-button" disabled={busy} onClick={startDemo}>
              <Clock3 size={18} /> Iniciar demo de 7 días
            </button>
          )}

          {license.status === 'expired' && (
            <div className="notice warning">
              <Clock3 size={18} />
              <span>{license.message || 'La licencia ha vencido.'}</span>
            </div>
          )}

          {license.status === 'blocked' && (
            <div className="notice danger">
              <ShieldCheck size={18} />
              <span>{license.message || 'La licencia local está bloqueada.'}</span>
            </div>
          )}

          <div className="divider"><span>LICENCIA COMERCIAL</span></div>

          <form onSubmit={activate}>
            <label htmlFor="license-key">Clave de licencia</label>
            <div className="license-input">
              <KeyRound size={18} />
              <input
                id="license-key"
                value={licenseKey}
                onChange={event => setLicenseKey(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Pega aquí la licencia mensual o anual"
              />
            </div>
            <button className="activate-button" type="submit" disabled={busy || !licenseKey.trim()}>
              <ShieldCheck size={18} /> {busy ? 'Validando…' : 'Activar OmniManager'}
            </button>
          </form>

          {error && <div className="error-box">{error}</div>}

          <footer>OmniManager Botillerías · Consultoría Helix SpA</footer>
        </section>
      </main>
    );
  }

  return (
    <main className="authorized-screen">
      <header className="authorized-header">
        <div>
          <div className="eyebrow">OMNIMANAGER</div>
          <h1>Botillerías</h1>
        </div>
        <div className="license-pill">
          <CheckCircle2 size={17} />
          {license.mode === 'demo' ? `Demo activa · ${remaining}` : `${license.plan === 'annual' ? 'Anual' : 'Mensual'} · activa`}
        </div>
      </header>

      <section className="foundation-panel">
        <div className="foundation-icon"><Database size={30} /></div>
        <div>
          <h2>Base standalone activa</h2>
          <p>Licencia y base de datos local inicializadas correctamente. Esta rama es la fundación sobre la que se incorporan los módulos operativos de OmniManager.</p>
          {database && (
            <div className="database-grid">
              <span><b>SQLite</b>{database.integrity === 'ok' ? 'Integridad OK' : database.integrity}</span>
              <span><b>Datos</b>{database.documents} documentos</span>
              <span><b>Migraciones</b>{database.migrations}</span>
              <span><b>Vencimiento</b>{formatDate(license.expiresAt) || 'Demo/local'}</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default App;
