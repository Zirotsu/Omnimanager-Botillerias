import React, { useState } from 'react';
import { KeyRound, LockKeyhole, Store, UserRound } from 'lucide-react';
import type { User } from '../types';

export const UserLogin: React.FC<{
  users: User[];
  businessName: string;
  onLogin: (user: User) => void;
}> = ({ users, businessName, onLogin }) => {
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const verify = (candidate: string) => {
    if (!selected) return;
    if (candidate === selected.pin) onLogin(selected);
    else { setError('PIN incorrecto.'); setPin(''); }
  };

  const push = (digit: string) => {
    if (!selected || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next); setError('');
    if (next.length === 4) verify(next);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 md:p-10 flex flex-col">
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-cyan-300 text-slate-950 grid place-items-center"><Store size={22}/></div><div><p className="text-[10px] tracking-[.25em] text-cyan-300 font-black">OMNIMANAGER BOTILLERÍAS</p><h1 className="font-black text-xl">{businessName || 'Mi Botillería'}</h1></div></div>
        <span className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-widest font-black text-emerald-300"><LockKeyhole size={14}/> Datos locales</span>
      </header>

      <section className="max-w-6xl w-full mx-auto my-auto py-10">
        {!selected ? <>
          <div className="mb-8"><h2 className="text-3xl md:text-4xl font-black">Selecciona tu usuario</h2><p className="text-slate-400 mt-2">Cada vendedor entra con su PIN y trabaja con su propio turno de caja.</p></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {users.filter(user => user.active !== false).map(user => <button key={user.id} onClick={() => { setSelected(user); setPin(''); setError(''); }} className="text-left rounded-[28px] border border-white/10 bg-slate-900 hover:border-cyan-300/60 p-6 transition min-h-48">
              <div className="w-14 h-14 rounded-2xl bg-white/10 grid place-items-center mb-6"><UserRound size={26}/></div>
              <h3 className="font-black text-lg truncate">{user.name}</h3><p className="text-xs text-slate-500 mt-1">{user.role === 'ADMIN' ? 'Administrador' : user.role === 'SUPERVISOR' ? 'Supervisor' : 'Vendedor / Cajero'}</p>
            </button>)}
          </div>
        </> : <div className="max-w-sm mx-auto text-center">
          <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-white mb-6">← Cambiar usuario</button>
          <div className="w-20 h-20 rounded-3xl bg-cyan-300 text-slate-950 grid place-items-center mx-auto"><KeyRound size={34}/></div>
          <h2 className="text-2xl font-black mt-5">{selected.name}</h2><p className="text-slate-500 text-sm mt-1">Ingresa tu PIN de 4 dígitos</p>
          <div className="flex justify-center gap-3 my-6">{[0,1,2,3].map(i => <span key={i} className={`w-3 h-3 rounded-full ${pin.length > i ? 'bg-cyan-300' : 'bg-slate-700'}`} />)}</div>
          {error && <p className="text-red-300 text-sm mb-4">{error}</p>}
          <div className="grid grid-cols-3 gap-3">{['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(key => <button key={key} onClick={() => key === 'C' ? setPin('') : key === '⌫' ? setPin(value => value.slice(0,-1)) : push(key)} className="h-16 rounded-2xl bg-slate-900 border border-white/10 font-black text-xl hover:bg-slate-800">{key}</button>)}</div>
        </div>}
      </section>
    </main>
  );
};
