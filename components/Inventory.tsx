import React, { useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { Barcode, Boxes, FileSpreadsheet, Pencil, Plus, Search, Tag, Trash2, Upload, Warehouse } from 'lucide-react';
import { CATEGORIES, type Product, type Promotion, type User } from '../types';
import { useOmniStore } from '../store';
import { formatCLP, generateId, normalizeCode } from '../utils';

const header = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const get = (row: Record<string, unknown>, keys: string[]) => {
  const entries = Object.entries(row).map(([key,value]) => [header(key), value] as const);
  for (const key of keys.map(header)) {
    const exact = entries.find(([name]) => name === key);
    if (exact && String(exact[1] ?? '').trim()) return exact[1];
  }
  for (const key of keys.map(header)) {
    const partial = entries.find(([name]) => name.includes(key) || key.includes(name));
    if (partial && String(partial[1] ?? '').trim()) return partial[1];
  }
  return undefined;
};
const num = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = String(value ?? '').trim().replace(/[$\sA-Za-z]/g, '');
  if (!text) return 0;
  if (text.includes('.') && text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  else text = text.replace(',', '.');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

const emptyProduct = (): Product => ({ id: generateId(), sku: '', barcode: '', name: '', category: CATEGORIES[0], compatibility: '', costPrice: 0, salePrice: 0, stock: 0, minStock: 5 });

export const Inventory: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const { snapshot, saveProduct, deleteProduct, adjustStock, importProducts, savePromotion, deletePromotion } = useOmniStore();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'products'|'promotions'>('products');
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const elevated = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERVISOR';
  const products = snapshot?.products || [];
  const promotions = snapshot?.promotions || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(product => [product.name, product.sku, product.barcode, product.category, product.compatibility, ...(product.supplierCodes || []).map(code => code.code)].some(value => String(value || '').toLowerCase().includes(q)));
  }, [products, query]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (!editing.name.trim() || !editing.sku.trim()) return setMessage('Nombre y SKU son obligatorios.');
    const duplicate = products.find(product => product.id !== editing.id && normalizeCode(product.sku) === normalizeCode(editing.sku));
    if (duplicate) return setMessage(`El SKU ${editing.sku} ya pertenece a ${duplicate.name}.`);
    setBusy(true); setMessage('');
    try {
      await saveProduct({ ...editing, sku: editing.sku.trim(), barcode: editing.barcode?.trim() || undefined, name: editing.name.trim(), stock: Math.max(0, Number(editing.stock || 0)), minStock: Math.max(0, Number(editing.minStock || 0)), costPrice: Math.max(0, Math.round(Number(editing.costPrice || 0))), salePrice: Math.max(0, Math.round(Number(editing.salePrice || 0))) });
      setEditing(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible guardar el producto.'); }
    finally { setBusy(false); }
  };

  const doAdjust = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!adjusting) return;
    const qty = Math.round(Number(adjustQty));
    if (!qty) return setMessage('Ingresa un ajuste distinto de cero. Puedes usar negativos para descontar.');
    setBusy(true); setMessage('');
    try { await adjustStock(adjusting.id, qty, 'Ajuste manual desde Inventario', currentUser); setAdjusting(null); setAdjustQty(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible ajustar el stock.'); }
    finally { setBusy(false); }
  };

  const parseRows = async (file: File): Promise<Record<string, unknown>[]> => {
    if (/\.csv$/i.test(file.name) || file.type.includes('csv')) {
      const parsed = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: true });
      return parsed.data;
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, column) => { headers[column] = cell.text.trim(); });
    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const data: Record<string, unknown> = {};
      headers.forEach((name, column) => { if (name) data[name] = row.getCell(column).text; });
      if (Object.values(data).some(value => String(value || '').trim())) rows.push(data);
    });
    return rows;
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage('');
    try {
      const rows = await parseRows(file);
      const imported: Product[] = [];
      for (const row of rows) {
        const name = String(get(row, ['nombre','producto','descripcion','item','articulo']) || '').trim();
        if (!name) continue;
        const sku = String(get(row, ['sku','codigo interno','codigo','cod','id']) || '').trim() || `AUTO-${generateId().slice(0,8).toUpperCase()}`;
        const barcode = String(get(row, ['codigo de barras','barcode','ean','ean13','upc','gtin']) || '').trim();
        const existing = products.find(product => normalizeCode(product.sku) === normalizeCode(sku) || (barcode && normalizeCode(product.barcode) === normalizeCode(barcode)));
        imported.push({
          id: existing?.id || generateId(),
          sku,
          barcode: barcode || existing?.barcode,
          name,
          category: String(get(row, ['categoria','rubro','familia','grupo']) || existing?.category || 'Otros y Varios'),
          compatibility: String(get(row, ['marca','proveedor','fabricante']) || existing?.compatibility || ''),
          costPrice: Math.max(0, num(get(row, ['costo','precio costo','costo unitario'])) || existing?.costPrice || 0),
          salePrice: Math.max(0, num(get(row, ['precio','precio venta','pvp','valor'])) || existing?.salePrice || 0),
          stock: existing ? existing.stock : Math.max(0, num(get(row, ['stock','cantidad','existencias','unidades']))),
          minStock: Math.max(0, num(get(row, ['minimo','stock minimo','min stock'])) || existing?.minStock || 5),
          supplierCodes: existing?.supplierCodes || []
        });
      }
      if (!imported.length) throw new Error('No encontré filas con nombre de producto.');
      await importProducts(imported);
      setMessage(`${imported.length} productos procesados desde ${file.name}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No fue posible importar el archivo.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const createPromotion = async () => {
    if (!elevated || !products.length) return;
    const product = products[0];
    const promotion: Promotion = { id: generateId(), name: `Promo ${product.name}`, productId: product.id, type: 'PERCENT_DISCOUNT', buyQtyValue: 1, payQtyValue: 1, discountPercent: 10, active: true };
    await savePromotion(promotion);
  };

  return <div className="space-y-7">
    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4"><div><p className="eyebrow-ui">Catálogo local</p><h1 className="page-title">Inventario</h1><p className="page-subtitle">Productos, códigos de barra, costos, precios, stock mínimo y promociones.</p></div><div className="flex flex-wrap gap-2">{elevated && <><input ref={fileRef} className="hidden" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={e => importFile(e.target.files?.[0])}/><button className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={17}/>Importar Excel/CSV</button><button className="btn-primary" onClick={() => setEditing(emptyProduct())}><Plus size={17}/>Producto</button></>}</div></div>
    {message && <div className="notice-ui">{message}</div>}
    <div className="flex gap-2 border-b border-slate-200"><button className={`tab-ui ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}><Boxes size={16}/>Productos</button><button className={`tab-ui ${tab === 'promotions' ? 'active' : ''}`} onClick={() => setTab('promotions')}><Tag size={16}/>Promociones</button></div>

    {tab === 'products' ? <>
      <div className="omni-card p-4 flex items-center gap-3"><Search size={18} className="text-slate-400"/><input className="w-full outline-none text-sm" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por producto, SKU, barra, marca o código de proveedor…"/><span className="text-xs text-slate-400">{filtered.length}</span></div>
      <div className="omni-card overflow-hidden"><div className="overflow-auto"><table className="omni-table"><thead><tr><th>Producto</th><th>SKU / Barra</th><th>Categoría</th><th>Costo</th><th>Venta</th><th>Stock</th><th></th></tr></thead><tbody>{filtered.map(product => <tr key={product.id}><td><div className="font-black text-slate-900">{product.name}</div><div className="text-xs text-slate-400">{product.compatibility || 'Sin marca/proveedor'}</div></td><td><div className="font-mono text-xs">{product.sku}</div><div className="font-mono text-[10px] text-slate-400 flex items-center gap-1"><Barcode size={11}/>{product.barcode || 'Sin barra'}</div></td><td>{product.category}</td><td>{formatCLP(product.costPrice)}</td><td className="font-black">{formatCLP(product.salePrice)}</td><td><span className={`stock-pill ${product.stock <= product.minStock ? 'low' : ''}`}>{product.stock}</span><div className="text-[10px] text-slate-400 mt-1">mín. {product.minStock}</div></td><td><div className="flex justify-end gap-1">{elevated && <><button className="icon-btn" title="Ajustar stock" onClick={() => { setAdjusting(product); setAdjustQty(''); }}><Warehouse size={16}/></button><button className="icon-btn" title="Editar" onClick={() => setEditing({...product})}><Pencil size={16}/></button><button className="icon-btn danger" title="Eliminar" onClick={() => confirm(`¿Eliminar ${product.name}?`) && deleteProduct(product.id).catch(error => setMessage(error.message))}><Trash2 size={16}/></button></>}</div></td></tr>)}</tbody></table></div></div>
    </> : <div className="space-y-4"><div className="flex justify-between"><p className="text-sm text-slate-500">Promociones aplicables automáticamente en el POS.</p>{elevated && <button className="btn-primary" onClick={createPromotion}><Plus size={16}/>Nueva base</button>}</div><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{promotions.map(promo => <div key={promo.id} className="omni-card p-5"><div className="flex justify-between"><div><p className="font-black">{promo.name}</p><p className="text-xs text-slate-400 mt-1">{promo.type === 'PERCENT_DISCOUNT' ? `${promo.discountPercent || 0}% descuento` : promo.type === 'QTY_DISCOUNT' ? `${promo.buyQtyValue}x${promo.payQtyValue}` : `Combo ${formatCLP(promo.comboPrice || 0)}`}</p></div><span className={`stock-pill ${promo.active ? '' : 'low'}`}>{promo.active ? 'Activa' : 'Inactiva'}</span></div>{elevated && <div className="flex gap-2 mt-4"><button className="btn-secondary text-xs" onClick={() => savePromotion({...promo, active: !promo.active})}>{promo.active ? 'Desactivar' : 'Activar'}</button><button className="icon-btn danger" onClick={() => deletePromotion(promo.id)}><Trash2 size={15}/></button></div>}</div>)}</div></div>}

    {editing && <div className="modal-backdrop"><form onSubmit={save} className="modal-card max-w-3xl"><div className="flex justify-between items-center"><h2 className="text-2xl font-black">{products.some(p=>p.id===editing.id) ? 'Editar producto' : 'Nuevo producto'}</h2><button type="button" onClick={() => setEditing(null)}>✕</button></div><div className="grid md:grid-cols-2 gap-4 mt-6"><label className="field-label">Nombre<input className="omni-input light" value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label><label className="field-label">SKU<input className="omni-input light" value={editing.sku} onChange={e=>setEditing({...editing,sku:e.target.value})}/></label><label className="field-label">Código de barras<input className="omni-input light" value={editing.barcode || ''} onChange={e=>setEditing({...editing,barcode:e.target.value})}/></label><label className="field-label">Categoría<select className="omni-input light" value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label className="field-label">Marca / proveedor<input className="omni-input light" value={editing.compatibility} onChange={e=>setEditing({...editing,compatibility:e.target.value})}/></label><label className="field-label">Stock mínimo<input className="omni-input light" type="number" min="0" value={editing.minStock} onChange={e=>setEditing({...editing,minStock:Number(e.target.value)})}/></label><label className="field-label">Costo<input className="omni-input light" type="number" min="0" value={editing.costPrice} onChange={e=>setEditing({...editing,costPrice:Number(e.target.value)})}/></label><label className="field-label">Precio venta<input className="omni-input light" type="number" min="0" value={editing.salePrice} onChange={e=>setEditing({...editing,salePrice:Number(e.target.value)})}/></label>{!products.some(p=>p.id===editing.id) && <label className="field-label">Stock inicial<input className="omni-input light" type="number" min="0" value={editing.stock} onChange={e=>setEditing({...editing,stock:Number(e.target.value)})}/></label>}</div><button disabled={busy} className="btn-primary w-full justify-center mt-6">Guardar producto</button></form></div>}
    {adjusting && <div className="modal-backdrop"><form onSubmit={doAdjust} className="modal-card max-w-md"><h2 className="text-xl font-black">Ajustar stock</h2><p className="text-sm text-slate-500 mt-2">{adjusting.name} · actual {adjusting.stock}</p><label className="field-label mt-5">Variación<input autoFocus className="omni-input light" type="number" value={adjustQty} onChange={e=>setAdjustQty(e.target.value)} placeholder="Ej: 12 o -3"/></label><div className="flex gap-2 mt-6"><button type="button" className="btn-secondary flex-1 justify-center" onClick={()=>setAdjusting(null)}>Cancelar</button><button className="btn-primary flex-1 justify-center">Aplicar</button></div></form></div>}
  </div>;
};
