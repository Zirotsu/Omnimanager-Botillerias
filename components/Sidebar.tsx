import React from 'react';
import { Boxes, ChartNoAxesCombined, Gauge, LogOut, PackagePlus, Settings, ShoppingCart, Store, UserRound } from 'lucide-react';
import type { User, ViewState } from '../types';

const items: Array<{ id: ViewState; label: string; icon: React.ComponentType<{ size?: number }> ; elevated?: boolean }> = [
  { id: 'dashboard', label: 'Resumen', icon: Gauge },
  { id: 'sales', label: 'Ventas / POS', icon: ShoppingCart },
  { id: 'inventory', label: 'Inventario', icon: Boxes },
  { id: 'purchases', label: 'Compras', icon: PackagePlus, elevated: true },
  { id: 'reports', label: 'Informes', icon: ChartNoAxesCombined, elevated: true },
  { id: 'settings', label: 'Configuración', icon: Settings, elevated: true }
];

export const Sidebar: React.FC<{
  active: ViewState;
  onChange: (view: ViewState) => void;
  currentUser: User;
  businessName: string;
  onLogout: () => void;
}> = ({ active, onChange, currentUser, businessName, onLogout }) => {
  const elevated = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERVISOR';
  return <aside className="w-64 shrink-0 bg-slate-950 text-white min-h-screen p-4 flex flex-col border-r border-white/10">
    <div className="flex items-center gap-3 px-3 py-4 mb-4"><div className="w-10 h-10 rounded-xl bg-cyan-300 text-slate-950 grid place-items-center"><Store size={20}/></div><div className="min-w-0"><p className="text-[9px] font-black tracking-[.2em] text-cyan-300">OMNIMANAGER</p><p className="font-black truncate text-sm">{businessName}</p></div></div>
    <nav className="space-y-1">{items.filter(item => !item.elevated || elevated).map(item => { const Icon = item.icon; const selected = active === item.id; return <button key={item.id} onClick={() => onChange(item.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold transition ${selected ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}><Icon size={18}/>{item.label}</button>; })}</nav>
    <div className="mt-auto pt-4 border-t border-white/10">
      <div className="px-3 py-3 flex items-center gap-3"><UserRound size={18} className="text-cyan-300"/><div className="min-w-0"><p className="text-sm font-black truncate">{currentUser.name}</p><p className="text-[10px] uppercase text-slate-500">{currentUser.role}</p></div></div>
      <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold text-slate-400 hover:bg-white/5 hover:text-white"><LogOut size={18}/>Cambiar usuario</button>
    </div>
  </aside>;
};
