import React, { useMemo, useState } from 'react';
import { Banknote, CalendarDays, Download, PackageCheck, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';
import type { PaidPaymentMethod, User } from '../types';
import { useOmniStore } from '../store';
import { formatCLP, formatDate, getCurrentLocalDate } from '../utils';

const paymentAmount = (sale: any, method: PaidPaymentMethod) => {
  if (sale.status === 'ANULADO') return 0;
  if (sale.paymentMethod === method) return Number(sale.totalGeneral || 0);
  if (sale.paymentMethod !== 'COMBINADO' || !Array.isArray(sale.paymentBreakdown)) return 0;
  return sale.paymentBreakdown.filter((item: any) => item.method === method).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const Reports: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const { snapshot } = useOmniStore();
  const today = getCurrentLocalDate();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const elevated = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERVISOR';

  const data = useMemo(() => {
    if (!snapshot) return null;
    const inRange = (day: string) => (!from || day >= from) && (!to || day <= to);
    const sales = snapshot.sales.filter(sale => inRange(sale.localDay || sale.date.slice(0, 10)));
    const purchases = snapshot.purchases.filter(purchase => inRange(purchase.localDay || purchase.date.slice(0, 10)));
    const closures = snapshot.cashClosures.filter(closure => inRange(closure.localDay || closure.date.slice(0, 10)));
    const activeSales = sales.filter(sale => sale.status !== 'ANULADO');
    const paidSales = activeSales.filter(sale => sale.status === 'PAGADO');
    const pendingSales = activeSales.filter(sale => sale.status === 'PENDIENTE');
    const activePurchases = purchases.filter(purchase => purchase.status !== 'ANULADO');
    const totalSales = activeSales.reduce((sum, sale) => sum + Number(sale.totalGeneral || 0), 0);
    const paidTotal = paidSales.reduce((sum, sale) => sum + Number(sale.totalGeneral || 0), 0);
    const pendingTotal = pendingSales.reduce((sum, sale) => sum + Number(sale.totalGeneral || 0), 0);
    const expenses = activePurchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
    const estimatedMargin = activeSales.reduce((sum, sale) => sum + (sale.items || []).reduce((rowSum, item) => rowSum + (Number(item.unitPrice || 0) - Number(item.unitCost || 0)) * Number(item.quantity || 0), 0), 0);
    const paymentTotals = (['EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA'] as PaidPaymentMethod[]).map(method => ({ method, amount: paidSales.reduce((sum, sale) => sum + paymentAmount(sale, method), 0) }));
    const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    activeSales.forEach(sale => (sale.items || []).forEach(item => {
      const current = productMap.get(item.productId) || { name: item.productName, quantity: 0, revenue: 0 };
      current.quantity += Number(item.quantity || 0);
      current.revenue += Number(item.total || 0);
      productMap.set(item.productId, current);
    }));
    const topProducts = Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    return { sales, purchases, closures, activeSales, totalSales, paidTotal, pendingTotal, expenses, estimatedMargin, paymentTotals, topProducts };
  }, [snapshot, from, to]);

  if (!elevated) return <div className="omni-card p-8"><h1 className="page-title">Informes</h1><p className="page-subtitle mt-2">Disponible para administrador y supervisor.</p></div>;
  if (!data) return null;

  const exportCsv = () => {
    const rows = [
      ['Folio', 'Fecha', 'Cajero', 'Estado', 'Pago', 'Total'],
      ...data.sales.map(sale => [sale.id, sale.date, sale.cashierName || '', sale.status, sale.paymentMethod, sale.totalGeneral])
    ];
    const content = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `OmniManager-Ventas-${from || 'inicio'}-${to || 'hoy'}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const cards = [
    { label: 'Ventas', value: formatCLP(data.totalSales), icon: Banknote },
    { label: 'Cobrado', value: formatCLP(data.paidTotal), icon: WalletCards },
    { label: 'Pendiente', value: formatCLP(data.pendingTotal), icon: ReceiptText },
    { label: 'Margen estimado', value: formatCLP(data.estimatedMargin), icon: TrendingUp },
    { label: 'Compras / gastos', value: formatCLP(data.expenses), icon: PackageCheck }
  ];

  return <div className="space-y-7">
    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
      <div><p className="eyebrow-ui">Analítica local</p><h1 className="page-title">Informes</h1><p className="page-subtitle">Ventas, medios de pago, productos y cierres, calculados desde este PC.</p></div>
      <button className="btn-secondary" onClick={exportCsv}><Download size={17}/>Exportar ventas CSV</button>
    </div>
    <div className="omni-card p-5 flex flex-wrap items-end gap-4"><div className="flex items-center gap-2 text-slate-500 mr-2"><CalendarDays size={18}/><span className="text-xs font-black uppercase tracking-wider">Período</span></div><label className="field-label">Desde<input className="omni-input light" type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label className="field-label">Hasta<input className="omni-input light" type="date" value={to} onChange={e => setTo(e.target.value)}/></label></div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">{cards.map(({ label, value, icon: Icon }) => <div className="omni-card p-5" key={label}><Icon size={19} className="text-cyan-600"/><p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-4">{label}</p><p className="text-xl font-black text-slate-950 mt-1">{value}</p></div>)}</div>
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="omni-card overflow-hidden"><div className="p-5 border-b border-slate-100"><h2 className="font-black">Medios de pago</h2></div><div className="divide-y divide-slate-100">{data.paymentTotals.map(item => <div key={item.method} className="p-4 flex justify-between"><span className="font-bold text-slate-600">{item.method}</span><strong>{formatCLP(item.amount)}</strong></div>)}</div></section>
      <section className="omni-card overflow-hidden"><div className="p-5 border-b border-slate-100"><h2 className="font-black">Productos más vendidos</h2></div><div className="divide-y divide-slate-100">{data.topProducts.length ? data.topProducts.map((product, index) => <div key={`${product.name}-${index}`} className="p-4 flex justify-between gap-3"><div className="min-w-0"><b className="truncate block">{product.name}</b><span className="text-xs text-slate-400">{product.quantity} unidades</span></div><strong>{formatCLP(product.revenue)}</strong></div>) : <p className="p-7 text-sm text-slate-400">Sin ventas en el período.</p>}</div></section>
    </div>
    <section className="omni-card overflow-hidden"><div className="p-5 border-b border-slate-100"><h2 className="font-black">Cierres de caja</h2></div><div className="overflow-auto"><table className="omni-table"><thead><tr><th>Turno</th><th>Usuario</th><th>Fecha</th><th>Estado</th><th>Ventas</th><th>Esperado</th><th>Diferencia</th></tr></thead><tbody>{data.closures.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(closure => <tr key={closure.id}><td className="font-mono text-xs">{closure.id}</td><td>{closure.userName}</td><td>{formatDate(closure.date)}</td><td><span className="stock-pill">{closure.status}</span></td><td className="font-black">{formatCLP(closure.totalShiftSales)}</td><td>{formatCLP(closure.totalExpectedCash)}</td><td className={closure.difference === 0 ? '' : closure.difference > 0 ? 'text-emerald-600 font-black' : 'text-red-600 font-black'}>{formatCLP(closure.difference)}</td></tr>)}</tbody></table></div></section>
  </div>;
};
