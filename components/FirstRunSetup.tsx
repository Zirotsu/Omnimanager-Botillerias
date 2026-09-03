import React, { useState } from 'react';
import { Building2, KeyRound, ShieldCheck, Wine } from 'lucide-react';
import type { BusinessProfile, User } from '../types';

export const FirstRunSetup: React.FC<{ onComplete: (profile: BusinessProfile, admin: User) => Promise<void> }> = ({ onComplete }) => {
  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [adminName, setAdminName] = useState('Administrador');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Ingresa el nombre comercial de la botillería.');
    if (!adminName.trim()) return setError('Ingresa el nombre del administrador.');
    if (!/^\d{4}$/.test(pin)) return setError('El PIN debe tener exactamente 4 números.');
    setBusy(true); setError('');
    try {
      await onComplete(
        { name: name.trim(), rut: rut.trim(), address: '', phone: '', email: '' },
        { id: `usr-admin-${Date.now()}`, name: adminName.trim(), role: 'ADMIN', pin, active: true }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible crear la configuración inicial.');
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-xl rounded-[32px] border border-white/10 bg-slate-900 p-8 shadow-2xl space-y-7">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-300 to-indigo-500 text-slate-950 grid place-items-center"><Wine /></div>
          <div><p className="text-[10px] font-black tracking-[.25em] text-cyan-300">OMNIMANAGER</p><h1 className="text-3xl font-black">Configurar Botillería</h1></div>
        </div>
        <p className="text-sm text-slate-400 leading-6">Esta información se guardará únicamente en la base de datos local de este PC. Después podrás modificarla en Configuración.</p>
        <div className="grid gap-4">
          <label className="grid gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><span className="flex items-center gap-2"><Building2 size={15}/> Nombre comercial</span><input autoFocus className="omni-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Botillería Central" /></label>
          <label className="grid gap-2 text-xs font-black uppercase tracking-wider text-slate-400">RUT empresa / propietario<input className="omni-input" value={rut} onChange={e => setRut(e.target.value)} placeholder="Opcional por ahora" /></label>
          <label className="grid gap-2 text-xs font-black uppercase tracking-wider text-slate-400">Administrador<input className="omni-input" value={adminName} onChange={e => setAdminName(e.target.value)} /></label>
          <label className="grid gap-2 text-xs font-black uppercase tracking-wider text-slate-400"><span className="flex items-center gap-2"><KeyRound size={15}/> PIN administrador</span><input className="omni-input tracking-[.4em]" inputMode="numeric" type="password" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" /></label>
        </div>
        {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        <button disabled={busy} className="w-full rounded-2xl bg-cyan-300 text-slate-950 py-4 font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"><ShieldCheck size={18}/>{busy ? 'Guardando…' : 'Crear instalación local'}</button>
      </form>
    </main>
  );
};
