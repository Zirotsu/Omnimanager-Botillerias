import React, { useEffect, useRef, useState } from 'react';
import { Database, Download, HardDrive, KeyRound, Plus, Save, ShieldCheck, Trash2, Upload, UserRoundCog } from 'lucide-react';
import type { BusinessProfile, OmniSnapshot, User, UserRole } from '../types';
import { useOmniStore } from '../store';

export const Settings: React.FC<{ currentUser: User; onCurrentUserChanged?: (user: User) => void }> = ({ currentUser, onCurrentUserChanged }) => {
  const { snapshot, saveProfile, saveUser, deleteUser, backup, restore } = useOmniStore();
  const [profile, setProfile] = useState<BusinessProfile>(snapshot?.profile || { name: '', rut: '', address: '', phone: '', email: '' });
  const [newName, setNewName] = useState('');
  const [newRut, setNewRut] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('CAJERO');
  const [newPin, setNewPin] = useState('');
  const [installationId, setInstallationId] = useState('');
  const [licenseStatus, setLicenseStatus] = useState<OmniLicenseStatus | null>(null);
  const [databaseInfo, setDatabaseInfo] = useState<OmniDatabaseInfo | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);
  const users = snapshot?.users || [];
  const isAdmin = currentUser.role === 'ADMIN';

  useEffect(() => { if (snapshot?.profile) setProfile(snapshot.profile); }, [snapshot?.profile]);
  useEffect(() => {
    Promise.all([
      window.omniStandalone.license.getInstallationId(),
      window.omniStandalone.license.getStatus(),
      window.omniStandalone.database.getInfo()
    ]).then(([id, status, info]) => { setInstallationId(id); setLicenseStatus(status); setDatabaseInfo(info); }).catch(() => {});
  }, []);

  const saveBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    try { await saveProfile(profile); setMessage('Datos de la botillería guardados.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible guardar la configuración.'); }
    finally { setBusy(false); }
  };

  const addUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;
    if (!newName.trim()) return setMessage('Ingresa el nombre del usuario.');
    if (!/^\d{4}$/.test(newPin)) return setMessage('El PIN debe tener exactamente 4 dígitos.');
    const user: User = { id: `usr-${Date.now()}`, name: newName.trim(), rut: newRut.trim(), role: newRole, pin: newPin, active: true };
    setBusy(true); setMessage('');
    try { await saveUser(user); setNewName(''); setNewRut(''); setNewPin(''); setNewRole('CAJERO'); setMessage('Usuario creado.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible crear el usuario.'); }
    finally { setBusy(false); }
  };

  const toggleUser = async (user: User) => {
    if (!isAdmin) return;
    if (user.id === currentUser.id && user.active !== false) return setMessage('No puedes desactivar el usuario con el que estás trabajando.');
    await saveUser({ ...user, active: user.active === false });
  };

  const removeUser = async (user: User) => {
    if (!isAdmin || user.id === currentUser.id) return;
    const admins = users.filter(item => item.role === 'ADMIN' && item.active !== false);
    if (user.role === 'ADMIN' && admins.length <= 1) return setMessage('Debe quedar al menos un administrador activo.');
    if (!confirm(`¿Eliminar a ${user.name}?`)) return;
    await deleteUser(user.id);
  };

  const exportJson = () => {
    if (!snapshot) return;
    const content = JSON.stringify(snapshot, null, 2);
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `OmniManager-Respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const restoreJson = async (file?: File) => {
    if (!file) return;
    if (!confirm('Restaurar reemplazará productos, ventas, compras, usuarios, promociones y cierres actuales. Se creará primero una copia SQLite automática. ¿Continuar?')) return;
    setBusy(true); setMessage('');
    try {
      const parsed = JSON.parse(await file.text()) as OmniSnapshot;
      if (!parsed || !Array.isArray(parsed.products) || !Array.isArray(parsed.sales) || !Array.isArray(parsed.users)) throw new Error('El archivo no parece ser un respaldo de OmniManager.');
      await restore(parsed);
      setMessage('Respaldo restaurado correctamente. Si cambió tu usuario, vuelve a iniciar sesión.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible restaurar el respaldo.'); }
    finally { setBusy(false); if (restoreRef.current) restoreRef.current.value = ''; }
  };

  const createDatabaseBackup = async () => {
    setBusy(true); setMessage('');
    try { const path = await backup('manual'); setMessage(`Copia SQLite creada en: ${path}`); setDatabaseInfo(await window.omniStandalone.database.getInfo()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible crear el respaldo.'); }
    finally { setBusy(false); }
  };

  return <div className="space-y-7">
    <div><p className="eyebrow-ui">Sistema local</p><h1 className="page-title">Configuración</h1><p className="page-subtitle">Empresa, personal, licenciamiento y respaldos. Sin configuración de nube ni IA.</p></div>
    {message && <div className="notice-ui break-words">{message}</div>}
    <div className="grid xl:grid-cols-2 gap-6">
      <form onSubmit={saveBusiness} className="omni-card p-6 space-y-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-cyan-100 text-cyan-700 grid place-items-center"><Save size={20}/></div><div><h2 className="font-black text-lg">Datos de la botillería</h2><p className="text-xs text-slate-400">Se guardan solamente en este PC.</p></div></div><div className="grid sm:grid-cols-2 gap-4"><label className="field-label sm:col-span-2">Nombre comercial<input className="omni-input light" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })}/></label><label className="field-label">RUT<input className="omni-input light" value={profile.rut} onChange={e => setProfile({ ...profile, rut: e.target.value })}/></label><label className="field-label">Teléfono<input className="omni-input light" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })}/></label><label className="field-label sm:col-span-2">Dirección<input className="omni-input light" value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })}/></label><label className="field-label sm:col-span-2">Correo<input className="omni-input light" type="email" value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })}/></label></div><button disabled={busy} className="btn-primary"><Save size={17}/>Guardar cambios</button></form>

      <section className="omni-card p-6 space-y-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 grid place-items-center"><ShieldCheck size={20}/></div><div><h2 className="font-black text-lg">Licencia e instalación</h2><p className="text-xs text-slate-400">Identidad local de este equipo.</p></div></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Código del PC</p><p className="font-mono font-black mt-1 break-all">{installationId || 'Cargando…'}</p></div><div className="grid sm:grid-cols-2 gap-3"><div className="rounded-2xl border border-slate-200 p-4"><span className="text-[10px] font-black uppercase text-slate-400">Estado</span><p className="font-black mt-1">{licenseStatus?.status === 'active' ? 'Activa' : licenseStatus?.status || '—'}</p></div><div className="rounded-2xl border border-slate-200 p-4"><span className="text-[10px] font-black uppercase text-slate-400">Plan</span><p className="font-black mt-1">{licenseStatus?.mode === 'demo' ? 'Demo 7 días' : licenseStatus?.plan === 'annual' ? 'Anual' : licenseStatus?.plan === 'monthly' ? 'Mensual' : '—'}</p></div></div>{licenseStatus?.expiresAt && <p className="text-xs text-slate-500">Vence: {new Date(licenseStatus.expiresAt).toLocaleString('es-CL')}</p>}</section>
    </div>

    <section className="omni-card p-6 space-y-5"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-slate-950 text-cyan-300 grid place-items-center"><UserRoundCog size={20}/></div><div><h2 className="font-black text-lg">Usuarios y cajeros</h2><p className="text-xs text-slate-400">Administrador, supervisor y vendedor/cajero.</p></div></div><span className="text-xs font-black text-slate-400">{users.length} usuarios</span></div>{isAdmin && <form onSubmit={addUser} className="grid md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] gap-3 rounded-3xl bg-slate-50 p-4"><input className="omni-input light" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre"/><input className="omni-input light" value={newRut} onChange={e => setNewRut(e.target.value)} placeholder="RUT opcional"/><select className="omni-input light" value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}><option value="CAJERO">Vendedor / Cajero</option><option value="SUPERVISOR">Supervisor</option><option value="ADMIN">Administrador</option></select><div className="relative"><KeyRound size={14} className="absolute left-3 top-4 text-slate-400"/><input className="omni-input light pl-9" type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN"/></div><button disabled={busy} className="btn-primary justify-center"><Plus size={17}/></button></form>}<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{users.map(user => <div key={user.id} className="rounded-3xl border border-slate-200 p-4 flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-slate-100 grid place-items-center font-black">{user.name.slice(0,2).toUpperCase()}</div><div className="min-w-0 flex-1"><b className="truncate block">{user.name}</b><span className="text-[10px] uppercase tracking-wider font-black text-slate-400">{user.role} · {user.active === false ? 'Inactivo' : 'Activo'}</span></div>{isAdmin && <div className="flex gap-1"><button className="icon-btn" title={user.active === false ? 'Activar' : 'Desactivar'} onClick={() => toggleUser(user)} type="button"><ShieldCheck size={15}/></button>{user.id !== currentUser.id && <button className="icon-btn danger" type="button" onClick={() => removeUser(user)}><Trash2 size={15}/></button>}</div>}</div>)}</div></section>

    <section className="omni-card p-6 space-y-5"><div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 grid place-items-center"><Database size={20}/></div><div><h2 className="font-black text-lg">Base de datos y respaldos</h2><p className="text-xs text-slate-400">SQLite local + respaldo JSON portable.</p></div></div><div className="grid md:grid-cols-3 gap-3"><div className="rounded-2xl bg-slate-50 p-4"><span className="text-[10px] uppercase font-black text-slate-400">Integridad</span><p className="font-black mt-1">{databaseInfo?.integrity || '—'}</p></div><div className="rounded-2xl bg-slate-50 p-4"><span className="text-[10px] uppercase font-black text-slate-400">Registros</span><p className="font-black mt-1">{databaseInfo?.documents ?? '—'}</p></div><div className="rounded-2xl bg-slate-50 p-4 min-w-0"><span className="text-[10px] uppercase font-black text-slate-400">Archivo SQLite</span><p className="font-mono text-xs mt-1 truncate" title={databaseInfo?.path}>{databaseInfo?.path || '—'}</p></div></div><div className="flex flex-wrap gap-2"><button disabled={busy} className="btn-primary" onClick={createDatabaseBackup}><HardDrive size={17}/>Copia SQLite</button><button className="btn-secondary" onClick={exportJson}><Download size={17}/>Exportar JSON</button><input ref={restoreRef} type="file" className="hidden" accept="application/json,.json" onChange={e => restoreJson(e.target.files?.[0])}/><button className="btn-secondary" onClick={() => restoreRef.current?.click()}><Upload size={17}/>Restaurar JSON</button></div></section>
  </div>;
};
