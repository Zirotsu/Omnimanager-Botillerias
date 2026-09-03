import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Copy, KeyRound, ShieldCheck, Wine } from 'lucide-react';
import { OmniStoreProvider, useOmniStore } from './store';
import { FirstRunSetup } from './components/FirstRunSetup';
import { UserLogin } from './components/UserLogin';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Sales } from './components/Sales';
import { Purchases } from './components/Purchases';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import type { User, ViewState } from './types';

const AuthorizedApp: React.FC<{ license: OmniLicenseStatus }> = ({ license }) => {
  const store = useOmniStore();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('sales');

  useEffect(() => {
    if (!currentUser || !store.snapshot) return;
    const refreshed = store.snapshot.users.find(user => user.id === currentUser.id && user.active !== false) || null;
    if (!refreshed) setCurrentUser(null);
    else if (JSON.stringify(refreshed) !== JSON.stringify(currentUser)) setCurrentUser(refreshed);
  }, [store.snapshot?.users, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const elevated = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERVISOR';
    if (!elevated && ['purchases', 'reports', 'settings'].includes(view)) setView('sales');
  }, [currentUser, view]);

  if (!store.ready) return <div className="boot-screen">Abriendo base de datos local…</div>;
  if (store.error) return <div className="boot-screen"><div className="error-box max-w-xl">{store.error}</div></div>;
  if (!store.snapshot) return <div className="boot-screen">No fue posible cargar la instalación local.</div>;

  if (!store.snapshot.users.length) {
    return <FirstRunSetup onComplete={async (profile, admin) => {
      await store.saveProfile(profile);
      await store.saveUser(admin);
      setCurrentUser(admin);
      setView('sales');
    }} />;
  }

  if (!currentUser) {
    return <UserLogin users={store.snapshot.users} businessName={store.snapshot.profile.name} onLogin={user => {
      setCurrentUser(user);
      setView('sales');
    }} />;
  }

  const remaining = license.mode === 'demo' && license.remainingMs
    ? Math.max(1, Math.ceil(license.remainingMs / 86_400_000))
    : null;

  const content = (() => {
    switch (view) {
      case 'dashboard': return <Dashboard />;
      case 'inventory': return <Inventory currentUser={currentUser} />;
      case 'sales': return <Sales currentUser={currentUser} />;
      case 'purchases': return <Purchases currentUser={currentUser} />;
      case 'reports': return <Reports currentUser={currentUser} />;
      case 'settings': return <Settings currentUser={currentUser} onCurrentUserChanged={setCurrentUser} />;
      default: return <Sales currentUser={currentUser} />;
    }
  })();

  return <div className="min-h-screen bg-slate-100 text-slate-900 flex">
    <Sidebar active={view} onChange={setView} currentUser={currentUser} businessName={store.snapshot.profile.name || 'Mi Botillería'} onLogout={() => { setCurrentUser(null); setView('sales'); }} />
    <div className="min-w-0 flex-1 flex flex-col min-h-screen">
      <header className="h-16 shrink-0 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
        <div className="min-w-0"><p className="text-[10px] uppercase tracking-[.16em] font-black text-slate-400">Sesión local</p><p className="font-black truncate">{currentUser.name} · {currentUser.role === 'CAJERO' ? 'Vendedor / Cajero' : currentUser.role === 'SUPERVISOR' ? 'Supervisor' : 'Administrador'}</p></div>
        <div className="license-pill"><CheckCircle2 size={15}/>{license.mode === 'demo' ? `Demo · ${remaining} día${remaining === 1 ? '' : 's'}` : `${license.plan === 'annual' ? 'Anual' : 'Mensual'} · activa`}</div>
      </header>
      <main className="flex-1 p-5 md:p-7 xl:p-9 overflow-x-hidden">{content}</main>
    </div>
  </div>;
};

const App: React.FC = () => {
  const [license, setLicense] = useState<OmniLicenseStatus | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const status = await window.omniStandalone.license.getStatus();
    setLicense(status);
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
    try { setLicense(await window.omniStandalone.license.startDemo()); }
    catch (error) { setError(error instanceof Error ? error.message : 'No fue posible iniciar la demo.'); }
    finally { setBusy(false); }
  };

  const activate = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = licenseKey.trim();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      setLicense(await window.omniStandalone.license.activate(token));
      setLicenseKey('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'La licencia no pudo ser validada.');
    } finally { setBusy(false); }
  };

  if (!license) return <div className="boot-screen">Iniciando OmniManager Botillerías…</div>;

  if (license.status !== 'active') {
    return <main className="license-screen">
      <section className="license-card">
        <div className="brand-mark"><Wine size={28}/></div>
        <div className="eyebrow">OMNIMANAGER</div>
        <h1>Botillerías</h1>
        <p className="lead">Gestión para Windows con base de datos local. La operación diaria funciona sin conexión a Internet.</p>
        <div className="installation-box"><div><span>Código de este PC</span><strong>{license.installationId}</strong></div><button type="button" title="Copiar código del PC" onClick={() => navigator.clipboard.writeText(license.installationId)}><Copy size={17}/></button></div>
        {license.status === 'demo_available' && <button className="demo-button" disabled={busy} onClick={startDemo}><Clock3 size={18}/>Iniciar demo de 7 días</button>}
        {license.status === 'expired' && <div className="notice warning"><Clock3 size={18}/><span>{license.message || 'La licencia ha vencido.'}</span></div>}
        {license.status === 'blocked' && <div className="notice danger"><ShieldCheck size={18}/><span>{license.message || 'La licencia local está bloqueada.'}</span></div>}
        <div className="divider"><span>LICENCIA COMERCIAL</span></div>
        <form onSubmit={activate}><label htmlFor="license-key">Clave de licencia</label><div className="license-input"><KeyRound size={18}/><input id="license-key" value={licenseKey} onChange={event => setLicenseKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Pega aquí la licencia mensual o anual"/></div><button className="activate-button" type="submit" disabled={busy || !licenseKey.trim()}><ShieldCheck size={18}/>{busy ? 'Validando…' : 'Activar OmniManager'}</button></form>
        {error && <div className="error-box">{error}</div>}
        <footer>OmniManager Botillerías · Consultoría Helix SpA</footer>
      </section>
    </main>;
  }

  return <OmniStoreProvider><AuthorizedApp license={license}/></OmniStoreProvider>;
};

export default App;
