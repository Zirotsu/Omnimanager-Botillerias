import React from 'react';
import { AlertTriangle, Banknote, Boxes, ReceiptText, TrendingUp } from 'lucide-react';
import { useOmniStore } from '../store';
import { formatCLP } from '../utils';

export const Dashboard: React.FC = () => {
  const { snapshot } = useOmniStore();
  if (!snapshot) return null;
  const activeSales = snapshot.sales.filter(sale => sale.status !== 'ANULADO');
  const totalSales = activeSales.reduce((sum, sale) => sum + Number(sale.totalGeneral || 0), 0);
  const margin = activeSales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + (Number(item.unitPrice || 0) - Number(item.unitCost || 0)) * Number(item.quantity || 0), 0), 0);
  const lowStock = snapshot.products.filter(product => Number(product.stock || 0) <= Number(product.minStock || 0));
  const units = snapshot.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  const lastSales = activeSales.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0,6);
  const cards = [
    { label: 'Ventas acumuladas', value: formatCLP(totalSales), icon: Banknote },
    { label: 'Margen estimado', value: formatCLP(margin), icon: TrendingUp },
    { label: 'Unidades en stock', value: units.toLocaleString('es-CL'), icon: Boxes },
    { label: 'Stock crítico', value: String(lowStock.length), icon: AlertTriangle }
  ];

  return <div className="space-y-8">
    <div><p className="text-xs font-black tracking-[.18em] text-cyan-600 uppercase">Operación local</p><h1 className="text-4xl font-black tracking-tight text-slate-950">Resumen del negocio</h1><p className="text-slate-500 mt-2">Todo lo que ves aquí proviene de la base de datos SQLite de este PC.</p></div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(({label,value,icon:Icon}) => <div key={label} className="omni-card p-6"><div className="flex justify-between items-start"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="text-2xl font-black text-slate-950 mt-2">{value}</p></div><div className="w-11 h-11 rounded-2xl bg-slate-950 text-cyan-300 grid place-items-center"><Icon size={20}/></div></div></div>)}</div>
    <div className="grid lg:grid-cols-3 gap-6">
      <section className="omni-card lg:col-span-2 overflow-hidden"><div className="p-6 border-b border-slate-100 flex items-center gap-3"><ReceiptText size={20}/><h2 className="font-black">Últimas ventas</h2></div><div className="divide-y divide-slate-100">{lastSales.length ? lastSales.map(sale => <div key={sale.id} className="p-5 flex justify-between gap-4"><div><p className="font-black text-slate-900">{sale.id}</p><p className="text-xs text-slate-400 mt-1">{sale.cashierName || 'Sin usuario'} · {new Date(sale.date).toLocaleString('es-CL')}</p></div><strong>{formatCLP(sale.totalGeneral)}</strong></div>) : <p className="p-8 text-slate-400 text-sm">Todavía no hay ventas registradas.</p>}</div></section>
      <section className="omni-card overflow-hidden"><div className="p-6 border-b border-slate-100"><h2 className="font-black">Stock crítico</h2></div><div className="divide-y divide-slate-100 max-h-96 overflow-auto">{lowStock.length ? lowStock.slice(0,10).map(product => <div key={product.id} className="p-4 flex justify-between gap-3"><div className="min-w-0"><p className="font-bold truncate">{product.name}</p><p className="text-xs text-slate-400">{product.sku}</p></div><span className="font-black text-amber-600">{product.stock}</span></div>) : <p className="p-8 text-slate-400 text-sm">Sin productos bajo mínimo.</p>}</div></section>
    </div>
  </div>;
};
