import React, { useMemo, useRef, useState } from 'react';
import { Banknote, Barcode, ChevronDown, ChevronUp, Minus, Plus, Printer, Search, ShoppingCart, Trash2, Vault, XCircle } from 'lucide-react';
import type { CashClosure, PaidPaymentMethod, Product, Sale, SaleItem, User } from '../types';
import { useOmniStore } from '../store';
import { calculateIVA, formatCLP, formatDate, getCurrentLocalDate, normalizeCode } from '../utils';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] || char));

const promotionDiscount = (cart: SaleItem[], products: Product[], promotions: any[]) => {
  let discount = 0;
  for (const promo of promotions.filter(p => p.active)) {
    if (promo.type === 'PERCENT_DISCOUNT') {
      const item = cart.find(row => row.productId === promo.productId);
      if (item) discount += item.total * Math.max(0, Number(promo.discountPercent || 0)) / 100;
    } else if (promo.type === 'QTY_DISCOUNT') {
      const item = cart.find(row => row.productId === promo.productId);
      const buy = Math.max(1, Number(promo.buyQtyValue || 1));
      const pay = Math.max(0, Math.min(buy, Number(promo.payQtyValue || buy)));
      if (item) discount += Math.floor(item.quantity / buy) * (buy - pay) * item.unitPrice;
    } else if (promo.type === 'COMBO' && Array.isArray(promo.comboProducts) && promo.comboProducts.length && Number(promo.comboPrice) >= 0) {
      const possible = promo.comboProducts.map((required: any) => {
        const row = cart.find(item => item.productId === required.productId);
        return Math.floor(Number(row?.quantity || 0) / Math.max(1, Number(required.quantity || 1)));
      });
      const count = Math.max(0, Math.min(...possible));
      const normal = promo.comboProducts.reduce((sum: number, required: any) => {
        const product = products.find(item => item.id === required.productId);
        return sum + Number(product?.salePrice || 0) * Math.max(1, Number(required.quantity || 1));
      }, 0);
      discount += count * Math.max(0, normal - Number(promo.comboPrice || 0));
    }
  }
  return Math.max(0, Math.round(discount));
};

const saleReceipt = (sale: Sale, businessName: string) => {
  const rows = sale.items.map(item => `<tr><td>${esc(item.productName)}<div class="small muted">${item.quantity} × ${esc(formatCLP(item.unitPrice))}</div></td><td>${esc(formatCLP(item.total))}</td></tr>`).join('');
  return `<div class="center"><h1>${esc(businessName || 'OmniManager Botillerías')}</h1><div class="muted">Comprobante de venta</div></div><div class="line"></div><div class="row"><b>Folio</b><span>${esc(sale.id)}</span></div><div class="row"><b>Fecha</b><span>${esc(formatDate(sale.date))}</span></div><div class="row"><b>Cajero</b><span>${esc(sale.cashierName || '')}</span></div><div class="row"><b>Pago</b><span>${esc(sale.paymentMethod)}</span></div><div class="line"></div><table><tbody>${rows}</tbody></table><div class="line"></div><div class="row"><span>Neto</span><span>${esc(formatCLP(sale.totalNeto))}</span></div><div class="row"><span>IVA 19%</span><span>${esc(formatCLP(sale.totalIVA))}</span></div><div class="row total"><span>TOTAL</span><span>${esc(formatCLP(sale.totalGeneral))}</span></div>${sale.paymentMethod === 'EFECTIVO' ? `<div class="row"><span>Recibido</span><span>${esc(formatCLP(sale.cashReceived || 0))}</span></div><div class="row"><span>Vuelto</span><span>${esc(formatCLP(sale.cashChange || 0))}</span></div>` : ''}<div class="line"></div><div class="center small muted">OmniManager Botillerías · Consultoría Helix SpA</div>`;
};

const closureReceipt = (closure: CashClosure, businessName: string) => `<div class="center"><h1>${esc(businessName || 'OmniManager Botillerías')}</h1><div class="muted">Cierre de caja</div></div><div class="line"></div><div class="row"><b>Folio</b><span>${esc(closure.id)}</span></div><div class="row"><b>Responsable</b><span>${esc(closure.userName)}</span></div><div class="row"><b>Apertura</b><span>${esc(closure.openedAt ? formatDate(closure.openedAt) : '')}</span></div><div class="row"><b>Cierre</b><span>${esc(closure.closedAt ? formatDate(closure.closedAt) : '')}</span></div><div class="line"></div><div class="row"><span>Fondo inicial</span><span>${esc(formatCLP(closure.openingCash))}</span></div><div class="row"><span>Ventas efectivo</span><span>${esc(formatCLP(closure.totalCashSales))}</span></div><div class="row"><span>Débito/crédito</span><span>${esc(formatCLP(closure.totalCardSales))}</span></div><div class="row"><span>Transferencias</span><span>${esc(formatCLP(closure.totalTransferSales))}</span></div><div class="row"><span>Gastos efectivo</span><span>-${esc(formatCLP(closure.totalCashExpenses || 0))}</span></div><div class="line"></div><div class="row"><b>Efectivo esperado</b><b>${esc(formatCLP(closure.totalExpectedCash))}</b></div><div class="row"><span>Efectivo contado</span><span>${esc(formatCLP(closure.declaredCash))}</span></div><div class="row total"><span>Diferencia</span><span>${esc(formatCLP(closure.difference))}</span></div><div class="line"></div><div class="row"><b>Total vendido</b><b>${esc(formatCLP(closure.totalShiftSales))}</b></div><div class="row"><span>Boletas</span><span>${closure.salesCount}</span></div>`;

export const Sales: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const { snapshot, commitSale, voidSale, openCash, closeCash } = useOmniStore();
  const products = snapshot?.products || [];
  const sales = snapshot?.sales || [];
  const closures = snapshot?.cashClosures || [];
  const promotions = snapshot?.promotions || [];
  const [tab, setTab] = useState<'pos'|'history'>('pos');
  const [query, setQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [payment, setPayment] = useState<Sale['paymentMethod']>('EFECTIVO');
  const [cashReceived, setCashReceived] = useState('');
  const [combined, setCombined] = useState<Record<PaidPaymentMethod,string>>({EFECTIVO:'',DEBITO:'',CREDITO:'',TRANSFERENCIA:''});
  const [clientName, setClientName] = useState('');
  const [status, setStatus] = useState<'PAGADO'|'PENDIENTE'>('PAGADO');
  const [cashModal, setCashModal] = useState<'open'|'close'|null>(null);
  const [openingCash, setOpeningCash] = useState('30000');
  const [declaredCash, setDeclaredCash] = useState('');
  const [cashNotes, setCashNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const elevated = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERVISOR';
  const activeShift = closures.find(closure => closure.status === 'ABIERTA' && closure.userId === currentUser.id) || null;

  const visibleSales = useMemo(() => sales.filter(sale => elevated || sale.cashierId === currentUser.id).sort((a,b)=>b.date.localeCompare(a.date)), [sales,elevated,currentUser.id]);
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? products.filter(product => [product.name,product.sku,product.barcode,product.compatibility].some(v=>String(v||'').toLowerCase().includes(q))) : products).filter(product=>product.stock>0).slice(0,50);
  },[products,query]);

  const addProduct = (product: Product) => {
    setCart(previous => {
      const found = previous.find(item=>item.productId===product.id);
      const currentQty = found?.quantity || 0;
      if (currentQty >= product.stock) { setMessage(`No hay más stock disponible de ${product.name}.`); return previous; }
      if (found) return previous.map(item=>item.productId===product.id ? {...item,quantity:item.quantity+1,total:(item.quantity+1)*item.unitPrice}:item);
      return [...previous,{productId:product.id,sku:product.sku,productName:product.name,quantity:1,unitPrice:product.salePrice,total:product.salePrice,unitCost:product.costPrice}];
    });
    setMessage('');
  };

  const changeQty = (productId: string, delta: number) => setCart(previous => previous.flatMap(item => {
    if (item.productId !== productId) return [item];
    const product = products.find(p=>p.id===productId);
    const next = item.quantity + delta;
    if (next <= 0) return [];
    if (product && next > product.stock) { setMessage(`Stock máximo de ${product.name}: ${product.stock}.`); return [item]; }
    return [{...item,quantity:next,total:next*item.unitPrice}];
  }));

  const scan = (event: React.FormEvent) => {
    event.preventDefault();
    const code = normalizeCode(barcode);
    if (!code) return;
    const product = products.find(item => [item.barcode,item.sku,...(item.supplierCodes||[]).map(alias=>alias.code)].some(value=>normalizeCode(value)===code));
    if (!product) setMessage(`Código ${barcode.trim()} no encontrado.`);
    else if (product.stock <= 0) setMessage(`${product.name} está sin stock.`);
    else addProduct(product);
    setBarcode(''); barcodeRef.current?.focus();
  };

  const gross = cart.reduce((sum,item)=>sum+item.total,0);
  const discount = promotionDiscount(cart, products, promotions);
  const total = Math.max(0, gross-discount);
  const tax = calculateIVA(total);
  const combinedTotal = Object.values(combined).reduce((sum,value)=>sum+Number(value||0),0);

  const checkout = async () => {
    if (!activeShift) return setMessage('Debes abrir caja antes de registrar ventas.');
    if (!cart.length) return setMessage('El carrito está vacío.');
    if (status === 'PAGADO' && payment === 'EFECTIVO' && Number(cashReceived||0) < total) return setMessage('El efectivo recibido es menor al total.');
    if (status === 'PAGADO' && payment === 'COMBINADO' && Math.abs(combinedTotal-total) > 1) return setMessage(`El pago combinado debe sumar ${formatCLP(total)}.`);
    setBusy(true); setMessage('');
    try {
      const now = new Date();
      const finalPayment = status === 'PENDIENTE' ? 'PENDIENTE' : payment;
      const breakdown = finalPayment === 'COMBINADO' ? (Object.entries(combined).map(([method,amount])=>({method:method as PaidPaymentMethod,amount:Math.round(Number(amount||0))})).filter(item=>item.amount>0)) : undefined;
      const sale: Sale = {
        id:`BOL-${getCurrentLocalDate().replace(/-/g,'')}-${Date.now().toString().slice(-6)}`,
        date:now.toISOString(),localDay:getCurrentLocalDate(),status,
        cashierId:currentUser.id,cashierName:currentUser.name,cashShiftId:activeShift.id,
        clientName:clientName.trim()||'Cliente General',clientRut:'',clientPhone:'',clientEmail:'',items:cart,
        paymentMethod:finalPayment,paymentBreakdown:breakdown,
        cashReceived:finalPayment==='EFECTIVO'?Math.round(Number(cashReceived||0)):undefined,
        cashChange:finalPayment==='EFECTIVO'?Math.max(0,Math.round(Number(cashReceived||0)-total)):undefined,
        totalNeto:tax.neto,totalIVA:tax.iva,totalGeneral:tax.total
      };
      const saved = await commitSale(sale,cart.map(item=>({productId:item.productId,quantity:item.quantity})));
      setCart([]);setClientName('');setCashReceived('');setCombined({EFECTIVO:'',DEBITO:'',CREDITO:'',TRANSFERENCIA:''});setStatus('PAGADO');setPayment('EFECTIVO');
      setMessage(`${saved.id} registrada correctamente.`);
      await window.omniStandalone.print.html({title:`Boleta ${saved.id}`,html:saleReceipt(saved,snapshot?.profile.name||'OmniManager Botillerías')}).catch(()=>{});
    } catch(error){setMessage(error instanceof Error?error.message:'No fue posible registrar la venta.');}
    finally{setBusy(false);}
  };

  const openRegister = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); try { await openCash(Number(openingCash||0),cashNotes,currentUser); setCashModal(null);setCashNotes('');setMessage('Caja abierta correctamente.'); } catch(error){setMessage(error instanceof Error?error.message:'No fue posible abrir caja.');} finally{setBusy(false);} };
  const closeRegister = async (event: React.FormEvent) => { event.preventDefault(); if(!activeShift)return; setBusy(true); try { const closed=await closeCash(activeShift.id,Number(declaredCash||0),cashNotes,currentUser); setCashModal(null);setCashNotes('');setDeclaredCash('');setMessage('Caja cerrada correctamente.'); await window.omniStandalone.print.html({title:`Cierre ${closed.id}`,html:closureReceipt(closed,snapshot?.profile.name||'OmniManager Botillerías')}).catch(()=>{}); } catch(error){setMessage(error instanceof Error?error.message:'No fue posible cerrar caja.');} finally{setBusy(false);} };

  const canVoid = (sale: Sale) => sale.status !== 'ANULADO' && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPERVISOR' || sale.cashierId === currentUser.id);

  return <div className="space-y-6">
    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4"><div><p className="eyebrow-ui">Punto de venta</p><h1 className="page-title">Ventas</h1><p className="page-subtitle">Escáner, caja por usuario, pagos combinados e impresión térmica.</p></div><div className="flex gap-2">{activeShift ? <><span className="cash-open-badge"><Vault size={15}/>Caja abierta · {formatCLP(activeShift.openingCash)}</span><button className="btn-secondary" onClick={()=>setCashModal('close')}>Cerrar caja</button></> : <button className="btn-primary" onClick={()=>setCashModal('open')}><Vault size={17}/>Abrir caja</button>}</div></div>
    {message && <div className="notice-ui">{message}</div>}
    <div className="flex gap-2 border-b border-slate-200"><button className={`tab-ui ${tab==='pos'?'active':''}`} onClick={()=>setTab('pos')}><ShoppingCart size={16}/>POS</button><button className={`tab-ui ${tab==='history'?'active':''}`} onClick={()=>setTab('history')}>Historial</button></div>

    {tab==='pos'?<div className="grid xl:grid-cols-[1fr_430px] gap-6">
      <section className="space-y-4">
        <form onSubmit={scan} className="omni-card p-4 flex items-center gap-3 border-2 border-cyan-200"><Barcode className="text-cyan-600"/><input ref={barcodeRef} className="w-full outline-none font-mono" value={barcode} onChange={e=>setBarcode(e.target.value)} placeholder="Escanea código y presiona Enter…"/></form>
        <div className="omni-card p-4 flex items-center gap-3"><Search size={18} className="text-slate-400"/><input className="w-full outline-none" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar producto…"/></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{filteredProducts.map(product=><button key={product.id} onClick={()=>addProduct(product)} className="omni-card p-4 text-left hover:border-cyan-300 border transition"><p className="font-black text-slate-900 line-clamp-2">{product.name}</p><p className="text-xs text-slate-400 font-mono mt-1">{product.sku}</p><div className="flex justify-between items-end mt-4"><strong>{formatCLP(product.salePrice)}</strong><span className={`stock-pill ${product.stock<=product.minStock?'low':''}`}>{product.stock} un.</span></div></button>)}</div>
      </section>
      <aside className="omni-card overflow-hidden h-fit xl:sticky xl:top-6"><div className="p-5 border-b border-slate-100 flex justify-between"><h2 className="font-black flex gap-2 items-center"><ShoppingCart size={18}/>Carrito</h2><span className="text-xs text-slate-400">{cart.reduce((s,i)=>s+i.quantity,0)} items</span></div><div className="max-h-[350px] overflow-auto divide-y divide-slate-100">{cart.length?cart.map(item=><div key={item.productId} className="p-4"><div className="flex justify-between gap-3"><div className="min-w-0"><p className="font-bold truncate">{item.productName}</p><p className="text-xs text-slate-400">{formatCLP(item.unitPrice)}</p></div><strong>{formatCLP(item.total)}</strong></div><div className="flex items-center gap-2 mt-3"><button className="icon-btn" onClick={()=>changeQty(item.productId,-1)}><Minus size={14}/></button><span className="font-black min-w-8 text-center">{item.quantity}</span><button className="icon-btn" onClick={()=>changeQty(item.productId,1)}><Plus size={14}/></button><button className="icon-btn danger ml-auto" onClick={()=>setCart(c=>c.filter(row=>row.productId!==item.productId))}><Trash2 size={14}/></button></div></div>):<p className="p-8 text-center text-slate-400 text-sm">Escanea o selecciona productos.</p>}</div>
        <div className="p-5 bg-slate-50 space-y-3"><label className="field-label">Cliente<input className="omni-input light" value={clientName} onChange={e=>setClientName(e.target.value)} placeholder="Cliente General"/></label><div className="grid grid-cols-2 gap-2"><button className={`choice-btn ${status==='PAGADO'?'active':''}`} onClick={()=>setStatus('PAGADO')}>Pagado</button><button className={`choice-btn ${status==='PENDIENTE'?'active':''}`} onClick={()=>setStatus('PENDIENTE')}>Pendiente</button></div>{status==='PAGADO'&&<><label className="field-label">Medio de pago<select className="omni-input light" value={payment} onChange={e=>setPayment(e.target.value as Sale['paymentMethod'])}><option value="EFECTIVO">Efectivo</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option><option value="TRANSFERENCIA">Transferencia</option><option value="COMBINADO">Combinado</option></select></label>{payment==='EFECTIVO'&&<label className="field-label">Efectivo recibido<input className="omni-input light" type="number" value={cashReceived} onChange={e=>setCashReceived(e.target.value)} placeholder={String(total)}/></label>}{payment==='COMBINADO'&&<div className="grid grid-cols-2 gap-2">{(['EFECTIVO','DEBITO','CREDITO','TRANSFERENCIA'] as PaidPaymentMethod[]).map(method=><label key={method} className="text-[10px] font-black text-slate-500">{method}<input className="omni-input light mt-1" type="number" value={combined[method]} onChange={e=>setCombined({...combined,[method]:e.target.value})}/></label>)}</div>}</>}
        <div className="border-t border-slate-200 pt-3 space-y-1"><div className="flex justify-between text-sm"><span>Subtotal</span><span>{formatCLP(gross)}</span></div>{discount>0&&<div className="flex justify-between text-sm text-emerald-600"><span>Promociones</span><span>-{formatCLP(discount)}</span></div>}<div className="flex justify-between text-2xl font-black pt-2"><span>Total</span><span>{formatCLP(total)}</span></div>{payment==='EFECTIVO'&&Number(cashReceived)>0&&<div className="flex justify-between text-sm font-bold text-cyan-700"><span>Vuelto</span><span>{formatCLP(Math.max(0,Number(cashReceived)-total))}</span></div>}</div><button disabled={busy||!activeShift} className="btn-primary w-full justify-center py-4" onClick={checkout}><Banknote size={18}/>{activeShift?'Cobrar venta':'Abre caja para vender'}</button></div></aside>
    </div>:<div className="omni-card overflow-hidden"><div className="overflow-auto"><table className="omni-table"><thead><tr><th>Folio</th><th>Fecha</th><th>Cajero</th><th>Pago</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>{visibleSales.map(sale=><tr key={sale.id}><td className="font-mono text-xs">{sale.id}</td><td>{formatDate(sale.date)}</td><td>{sale.cashierName}</td><td>{sale.paymentMethod}</td><td><span className={`stock-pill ${sale.status==='ANULADO'?'low':''}`}>{sale.status}</span></td><td className="font-black">{formatCLP(sale.totalGeneral)}</td><td><div className="flex justify-end gap-1"><button className="icon-btn" onClick={()=>window.omniStandalone.print.html({title:`Boleta ${sale.id}`,html:saleReceipt(sale,snapshot?.profile.name||'OmniManager Botillerías')}).catch(error=>setMessage(error.message))}><Printer size={15}/></button>{canVoid(sale)&&<button className="icon-btn danger" onClick={()=>confirm(`¿Anular ${sale.id}? El stock será repuesto.`)&&voidSale(sale.id).catch(error=>setMessage(error.message))}><XCircle size={15}/></button>}</div></td></tr>)}</tbody></table></div></div>}

    {cashModal&&<div className="modal-backdrop"><form onSubmit={cashModal==='open'?openRegister:closeRegister} className="modal-card max-w-md"><h2 className="text-2xl font-black">{cashModal==='open'?'Apertura de caja':'Cierre de caja'}</h2><p className="text-sm text-slate-500 mt-2">Usuario: {currentUser.name}</p>{cashModal==='open'?<label className="field-label mt-5">Fondo inicial<input autoFocus className="omni-input light" type="number" min="0" value={openingCash} onChange={e=>setOpeningCash(e.target.value)}/></label>:<label className="field-label mt-5">Efectivo contado<input autoFocus className="omni-input light" type="number" min="0" value={declaredCash} onChange={e=>setDeclaredCash(e.target.value)}/></label>}<label className="field-label mt-4">Notas<textarea className="omni-input light min-h-24" value={cashNotes} onChange={e=>setCashNotes(e.target.value)}/></label><div className="flex gap-2 mt-6"><button type="button" className="btn-secondary flex-1 justify-center" onClick={()=>setCashModal(null)}>Cancelar</button><button disabled={busy} className="btn-primary flex-1 justify-center">{cashModal==='open'?'Abrir':'Cerrar e imprimir'}</button></div></form></div>}
  </div>;
};
