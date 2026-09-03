import React, { useMemo, useState } from 'react';
import { FileCode2, PackagePlus, ReceiptText, Search, Trash2 } from 'lucide-react';
import type { Product, Purchase, User } from '../types';
import { useOmniStore } from '../store';
import { formatCLP, formatDate, generateId, getCurrentLocalDate, normalizeCode } from '../utils';

interface DteLine { code: string; codeType: string; name: string; quantity: number; unitCost: number; lineTotal: number; }
interface DteDraft { supplier: string; supplierRut: string; folio: string; total: number; lines: DteLine[]; }

const localElements = (root: ParentNode, name: string) => Array.from(root.querySelectorAll('*')).filter(element => element.localName === name);
const firstText = (root: ParentNode, name: string) => localElements(root,name)[0]?.textContent?.trim() || '';
const numeric = (value: string) => { const parsed = Number(String(value||'').replace(/\s/g,'').replace(',','.')); return Number.isFinite(parsed)?parsed:0; };

const parseDte = (xml: string): DteDraft => {
  const document = new DOMParser().parseFromString(xml,'application/xml');
  if(document.querySelector('parsererror')) throw new Error('El XML no es un DTE válido.');
  const lines = localElements(document,'Detalle').map(detail=>{
    const codeNode=localElements(detail,'CdgItem')[0];
    const codeType=codeNode?firstText(codeNode,'TpoCodigo'):'';
    const code=codeNode?firstText(codeNode,'VlrCodigo'):'';
    const quantity=Math.max(0,numeric(firstText(detail,'QtyItem'))||1);
    const lineTotal=Math.max(0,Math.round(numeric(firstText(detail,'MontoItem'))));
    const unitCost=Math.max(0,Math.round(numeric(firstText(detail,'PrcItem'))||(lineTotal/quantity)));
    return {code,codeType,name:firstText(detail,'NmbItem')||firstText(detail,'DscItem'),quantity,unitCost,lineTotal};
  }).filter(line=>line.name&&line.quantity>0);
  if(!lines.length) throw new Error('El DTE no contiene líneas de productos reconocibles.');
  return {supplier:firstText(document,'RznSoc')||firstText(document,'RznSocEmisor')||'Proveedor',supplierRut:firstText(document,'RUTEmisor'),folio:firstText(document,'Folio'),total:Math.max(0,Math.round(numeric(firstText(document,'MntTotal')))),lines};
};

export const Purchases: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const { snapshot, commitPurchase, voidPurchase } = useOmniStore();
  const [tab,setTab]=useState<'expense'|'restock'|'dte'>('expense');
  const [supplier,setSupplier]=useState('');
  const [description,setDescription]=useState('');
  const [amount,setAmount]=useState('');
  const [payment,setPayment]=useState<NonNullable<Purchase['paymentMethod']>>('TRANSFERENCIA');
  const [productQuery,setProductQuery]=useState('');
  const [productId,setProductId]=useState('');
  const [quantity,setQuantity]=useState('');
  const [dte,setDte]=useState<DteDraft|null>(null);
  const [dteMappings,setDteMappings]=useState<Record<number,string>>({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const elevated=currentUser.role==='ADMIN'||currentUser.role==='SUPERVISOR';
  const products=snapshot?.products||[];
  const purchases=(snapshot?.purchases||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const closures=snapshot?.cashClosures||[];
  const activeShift=closures.find(closure=>closure.status==='ABIERTA'&&closure.userId===currentUser.id)||null;

  const matches=useMemo(()=>{const q=productQuery.trim().toLowerCase();return q?products.filter(product=>[product.name,product.sku,product.barcode,product.compatibility].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,10):[];},[products,productQuery]);
  const selected=products.find(p=>p.id===productId)||null;

  const reset=()=>{setSupplier('');setDescription('');setAmount('');setProductQuery('');setProductId('');setQuantity('');setDte(null);setDteMappings({});};

  const submitManual=async(event:React.FormEvent)=>{
    event.preventDefault(); if(!supplier.trim())return setMessage('Ingresa el proveedor o concepto.');
    const total=Math.round(Number(amount||0)); if(total<=0)return setMessage('Ingresa un monto mayor que cero.');
    if(payment==='EFECTIVO'&&!activeShift)return setMessage('Para registrar un gasto en efectivo debes tener caja abierta.');
    const isRestock=tab==='restock';
    if(isRestock&&(!selected||Number(quantity)<=0))return setMessage('Selecciona producto y cantidad para reponer.');
    const purchase:Purchase={id:`CMP-${Date.now()}`,date:new Date().toISOString(),localDay:getCurrentLocalDate(),supplier:supplier.trim(),description:isRestock?`Reposición: ${selected?.name}`:description.trim()||supplier.trim(),totalAmount:total,type:isRestock?'INVENTARIO':'GASTOS',status:'VIGENTE',paymentMethod:payment,cashShiftId:payment==='EFECTIVO'?activeShift?.id:undefined,items:isRestock&&selected?[{productId:selected.id,quantity:Number(quantity),cost:Math.round(total/Number(quantity))}]:undefined};
    setBusy(true);setMessage('');try{await commitPurchase(purchase);setMessage('Compra/gasto registrado correctamente.');reset();}catch(error){setMessage(error instanceof Error?error.message:'No fue posible registrar la compra.');}finally{setBusy(false);}
  };

  const loadDte=async(file?:File)=>{if(!file)return;setMessage('');try{const draft=parseDte(await file.text());setDte(draft);setSupplier(draft.supplier);setAmount(String(draft.total||draft.lines.reduce((sum,line)=>sum+line.lineTotal,0)));const mappings:Record<number,string>={};draft.lines.forEach((line,index)=>{const code=normalizeCode(line.code);const found=products.find(product=>[product.sku,product.barcode,...(product.supplierCodes||[]).map(item=>item.code)].some(value=>normalizeCode(value)===code))||products.find(product=>product.name.toLowerCase()===line.name.toLowerCase());if(found)mappings[index]=found.id;});setDteMappings(mappings);}catch(error){setMessage(error instanceof Error?error.message:'No fue posible leer el DTE.');}};

  const submitDte=async()=>{
    if(!dte)return; if(payment==='EFECTIVO'&&!activeShift)return setMessage('Para pagar la factura en efectivo debes tener caja abierta.');
    const missing=dte.lines.findIndex((_,index)=>!dteMappings[index]);if(missing>=0)return setMessage(`Asocia la línea ${missing+1}: ${dte.lines[missing].name}. Los productos nuevos se crean primero desde Inventario.`);
    const total=Math.round(Number(amount||dte.total||0));
    const purchase:Purchase={id:`DTE-${dte.folio||Date.now()}-${Date.now().toString().slice(-5)}`,date:new Date().toISOString(),localDay:getCurrentLocalDate(),supplier:dte.supplier,description:`Factura DTE ${dte.folio||'sin folio'} · ${dte.lines.length} líneas`,totalAmount:total,type:'INVENTARIO',status:'VIGENTE',paymentMethod:payment,cashShiftId:payment==='EFECTIVO'?activeShift?.id:undefined,items:dte.lines.map((line,index)=>({productId:dteMappings[index],quantity:line.quantity,cost:line.unitCost}))};
    const productMappings=dte.lines.filter(line=>line.code).map((line,index)=>({productId:dteMappings[index],supplierRut:dte.supplierRut,supplierName:dte.supplier,code:line.code,barcode:/EAN|GTIN|UPC|BARR/i.test(line.codeType)?line.code:''}));
    setBusy(true);setMessage('');try{await commitPurchase(purchase,{productMappings});setMessage('Factura DTE registrada y stock actualizado.');reset();}catch(error){setMessage(error instanceof Error?error.message:'No fue posible registrar el DTE.');}finally{setBusy(false);}
  };

  if(!elevated)return <div className="omni-card p-8"><h1 className="page-title">Compras</h1><p className="page-subtitle mt-2">Esta sección está disponible para administrador y supervisor.</p></div>;

  return <div className="space-y-7"><div><p className="eyebrow-ui">Abastecimiento local</p><h1 className="page-title">Compras y gastos</h1><p className="page-subtitle">Reposición, egresos y factura electrónica XML DTE. Sin lectura de documentos mediante IA.</p></div>{message&&<div className="notice-ui">{message}</div>}
    <div className="grid xl:grid-cols-[430px_1fr] gap-6"><section className="omni-card overflow-hidden h-fit"><div className="grid grid-cols-3 border-b border-slate-100"><button className={`purchase-tab ${tab==='expense'?'active':''}`} onClick={()=>setTab('expense')}>Gasto</button><button className={`purchase-tab ${tab==='restock'?'active':''}`} onClick={()=>setTab('restock')}>Reposición</button><button className={`purchase-tab ${tab==='dte'?'active':''}`} onClick={()=>setTab('dte')}>DTE XML</button></div>
      {tab!=='dte'?<form onSubmit={submitManual} className="p-6 space-y-4"><label className="field-label">Proveedor / concepto<input className="omni-input light" value={supplier} onChange={e=>setSupplier(e.target.value)}/></label>{tab==='expense'?<label className="field-label">Detalle<input className="omni-input light" value={description} onChange={e=>setDescription(e.target.value)}/></label>:<><label className="field-label">Buscar producto<div className="relative"><Search size={15} className="absolute left-3 top-4 text-slate-400"/><input className="omni-input light pl-9" value={productQuery} onChange={e=>{setProductQuery(e.target.value);setProductId('');}}/></div></label>{matches.length>0&&!productId&&<div className="border border-slate-200 rounded-2xl overflow-hidden">{matches.map(product=><button type="button" key={product.id} onClick={()=>{setProductId(product.id);setProductQuery(product.name);}} className="w-full text-left p-3 border-b last:border-0 hover:bg-slate-50"><b>{product.name}</b><span className="text-xs text-slate-400 ml-2">stock {product.stock}</span></button>)}</div>}<label className="field-label">Cantidad<input className="omni-input light" type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label></>}
      <label className="field-label">Monto total<input className="omni-input light" type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="field-label">Medio de pago<select className="omni-input light" value={payment} onChange={e=>setPayment(e.target.value as NonNullable<Purchase['paymentMethod']>)}><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option></select></label><button disabled={busy} className="btn-primary w-full justify-center"><PackagePlus size={17}/>Registrar</button></form>:<div className="p-6 space-y-4"><label className="border-2 border-dashed border-slate-200 hover:border-cyan-300 rounded-3xl p-7 grid place-items-center text-center cursor-pointer"><FileCode2 size={30} className="text-cyan-600"/><b className="mt-3">Seleccionar XML DTE</b><span className="text-xs text-slate-400 mt-1">Se procesa completamente en este PC.</span><input type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={e=>loadDte(e.target.files?.[0])}/></label>{dte&&<><div className="rounded-2xl bg-slate-50 p-4 text-sm"><b>{dte.supplier}</b><div className="text-slate-500">RUT {dte.supplierRut||'—'} · Folio {dte.folio||'—'} · {formatCLP(dte.total)}</div></div><div className="space-y-3 max-h-80 overflow-auto">{dte.lines.map((line,index)=><div key={index} className="border border-slate-200 rounded-2xl p-3"><p className="font-bold text-sm">{line.name}</p><p className="text-xs text-slate-400">{line.quantity} × {formatCLP(line.unitCost)} · código {line.code||'—'}</p><select className="omni-input light mt-2" value={dteMappings[index]||''} onChange={e=>setDteMappings({...dteMappings,[index]:e.target.value})}><option value="">Asociar producto…</option>{products.map(product=><option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></div>)}</div><label className="field-label">Medio de pago<select className="omni-input light" value={payment} onChange={e=>setPayment(e.target.value as NonNullable<Purchase['paymentMethod']>)}><option value="TRANSFERENCIA">Transferencia</option><option value="EFECTIVO">Efectivo</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option></select></label><button disabled={busy} onClick={submitDte} className="btn-primary w-full justify-center">Registrar DTE y sumar stock</button></>}</div>}
    </section><section className="omni-card overflow-hidden"><div className="p-5 border-b border-slate-100 flex items-center gap-2"><ReceiptText size={18}/><h2 className="font-black">Historial de egresos y compras</h2></div><div className="overflow-auto"><table className="omni-table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Detalle</th><th>Pago</th><th>Estado</th><th>Total</th><th></th></tr></thead><tbody>{purchases.map(purchase=><tr key={purchase.id}><td>{formatDate(purchase.date)}</td><td className="font-bold">{purchase.supplier}</td><td>{purchase.description}</td><td>{purchase.paymentMethod||'—'}</td><td><span className={`stock-pill ${purchase.status==='ANULADO'?'low':''}`}>{purchase.status||'VIGENTE'}</span></td><td className="font-black">{formatCLP(purchase.totalAmount)}</td><td>{purchase.status!=='ANULADO'&&currentUser.role==='ADMIN'&&<button className="icon-btn danger" onClick={()=>confirm('¿Anular este registro? Si agregó inventario, el stock será revertido.')&&voidPurchase(purchase.id).catch(error=>setMessage(error.message))}><Trash2 size={15}/></button>}</td></tr>)}</tbody></table></div></section></div>
  </div>;
};
