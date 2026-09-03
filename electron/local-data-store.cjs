const { DatabaseSync } = require('node:sqlite');

const COLLECTIONS = ['products', 'sales', 'purchases', 'promotions', 'users', 'closures'];
const PROFILE_PATH = 'profile/business';
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = value => Math.round(number(value));

const cleanId = value => {
  const id = String(value || '').trim();
  if (!id || id.length > 160 || !/^[a-zA-Z0-9_.:-]+$/.test(id)) throw new Error('Identificador local inválido.');
  return id;
};

const cleanCollection = value => {
  const collection = String(value || '').trim();
  if (!COLLECTIONS.includes(collection)) throw new Error('Colección local no permitida.');
  return collection;
};

const paymentAmount = (sale, method) => {
  if (!sale || sale.status === 'ANULADO') return 0;
  if (sale.paymentMethod === method) return money(sale.totalGeneral);
  if (sale.paymentMethod !== 'COMBINADO' || !Array.isArray(sale.paymentBreakdown)) return 0;
  return sale.paymentBreakdown
    .filter(item => item && item.method === method)
    .reduce((sum, item) => sum + money(item.amount), 0);
};

class LocalDataStore {
  constructor({ databasePath }) {
    this.databasePath = databasePath;
    this.db = new DatabaseSync(databasePath, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS omni_documents (
        path TEXT PRIMARY KEY,
        parent TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_omni_documents_parent ON omni_documents(parent);
    `);
    this.getStmt = this.db.prepare('SELECT data FROM omni_documents WHERE path = ?');
    this.listStmt = this.db.prepare('SELECT id, data FROM omni_documents WHERE parent = ? ORDER BY updated_at DESC, id ASC');
    this.putStmt = this.db.prepare(`
      INSERT INTO omni_documents(path,parent,id,data,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(path) DO UPDATE SET parent=excluded.parent,id=excluded.id,data=excluded.data,updated_at=excluded.updated_at
    `);
    this.deleteStmt = this.db.prepare('DELETE FROM omni_documents WHERE path = ?');
    this.deleteParentStmt = this.db.prepare('DELETE FROM omni_documents WHERE parent = ?');
  }

  transaction(work) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  getDocument(path) {
    const row = this.getStmt.get(String(path));
    if (!row) return null;
    return JSON.parse(row.data);
  }

  putDocument(path, parent, id, data) {
    this.putStmt.run(String(path), String(parent), String(id), JSON.stringify(data), Date.now());
    return clone(data);
  }

  list(collection) {
    const parent = cleanCollection(collection);
    return this.listStmt.all(parent).map(row => JSON.parse(row.data));
  }

  get(collection, id) {
    const parent = cleanCollection(collection);
    const entityId = cleanId(id);
    return this.getDocument(`${parent}/${entityId}`);
  }

  put(collection, id, data) {
    const parent = cleanCollection(collection);
    const entityId = cleanId(id);
    return this.putDocument(`${parent}/${entityId}`, parent, entityId, { ...clone(data), id: entityId });
  }

  remove(collection, id) {
    const parent = cleanCollection(collection);
    const entityId = cleanId(id);
    this.deleteStmt.run(`${parent}/${entityId}`);
    return { ok: true };
  }

  getProfile() {
    return this.getDocument(PROFILE_PATH) || { name: 'Mi Botillería', rut: '', address: '', phone: '', email: '' };
  }

  saveProfile(profile) {
    const data = {
      name: String(profile?.name || 'Mi Botillería').trim(),
      rut: String(profile?.rut || '').trim(),
      address: String(profile?.address || '').trim(),
      phone: String(profile?.phone || '').trim(),
      email: String(profile?.email || '').trim()
    };
    return this.putDocument(PROFILE_PATH, 'profile', 'business', data);
  }

  snapshot() {
    return {
      schemaVersion: 2,
      profile: this.getProfile(),
      products: this.list('products'),
      sales: this.list('sales'),
      purchases: this.list('purchases'),
      promotions: this.list('promotions'),
      users: this.list('users'),
      cashClosures: this.list('closures')
    };
  }

  replaceSnapshot(source) {
    const snapshot = source && typeof source === 'object' ? source : {};
    return this.transaction(() => {
      for (const collection of COLLECTIONS) this.deleteParentStmt.run(collection);
      for (const collection of COLLECTIONS) {
        const key = collection === 'closures' ? 'cashClosures' : collection;
        for (const item of Array.isArray(snapshot[key]) ? snapshot[key] : []) {
          if (item?.id) this.put(collection, item.id, item);
        }
      }
      if (snapshot.profile) this.saveProfile(snapshot.profile);
      return this.snapshot();
    });
  }

  importProducts(items) {
    return this.transaction(() => {
      let imported = 0;
      for (const raw of Array.isArray(items) ? items : []) {
        if (!raw?.id) continue;
        const current = this.get('products', raw.id);
        const next = current ? { ...current, ...clone(raw), id: current.id, stock: current.stock } : clone(raw);
        next.stock = Math.max(0, number(next.stock));
        next.costPrice = Math.max(0, money(next.costPrice));
        next.salePrice = Math.max(0, money(next.salePrice));
        this.put('products', next.id, next);
        imported += 1;
      }
      return { imported, products: this.list('products') };
    });
  }

  importBarcodes(mappings) {
    return this.transaction(() => {
      let updated = 0;
      for (const mapping of Array.isArray(mappings) ? mappings : []) {
        const product = this.get('products', mapping?.productId);
        if (!product) continue;
        const barcode = String(mapping?.barcode || '').trim();
        if (barcode) product.barcode = barcode;
        const aliases = Array.isArray(mapping?.aliases) ? mapping.aliases : [];
        if (aliases.length) {
          const existing = Array.isArray(product.supplierCodes) ? product.supplierCodes : [];
          const known = new Set(existing.map(item => String(item?.code || '').trim()).filter(Boolean));
          for (const alias of aliases) {
            const code = String(alias || '').trim();
            if (code && !known.has(code)) {
              existing.push({ code });
              known.add(code);
            }
          }
          product.supplierCodes = existing;
        }
        this.put('products', product.id, product);
        updated += 1;
      }
      return { updated, products: this.list('products') };
    });
  }

  adjustStock({ productId, quantity, note = '', user = null }) {
    return this.transaction(() => {
      const product = this.get('products', productId);
      if (!product) throw new Error('Producto no encontrado.');
      const delta = Math.round(number(quantity));
      if (!delta) throw new Error('El ajuste debe ser distinto de cero.');
      const previousStock = Math.round(number(product.stock));
      const nextStock = previousStock + delta;
      if (nextStock < 0) throw new Error(`Stock insuficiente. Stock actual: ${previousStock}.`);
      product.stock = nextStock;
      this.put('products', product.id, product);
      const movementId = `mov-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      this.putDocument(`stockMovements/${movementId}`, 'stockMovements', movementId, {
        id: movementId,
        productId: product.id,
        previousStock,
        delta,
        newStock: nextStock,
        note: String(note || '').slice(0, 180),
        userId: user?.id || '',
        userName: user?.name || '',
        createdAt: new Date().toISOString()
      });
      return { product };
    });
  }

  commitSale({ sale, deductions = [] }) {
    return this.transaction(() => {
      if (!sale?.id) throw new Error('La venta no tiene folio.');
      if (this.get('sales', sale.id)) throw new Error('La venta ya fue registrada.');
      for (const deduction of Array.isArray(deductions) ? deductions : []) {
        const product = this.get('products', deduction?.productId);
        if (!product) throw new Error('Uno de los productos ya no existe.');
        const quantity = Math.max(0, Math.round(number(deduction?.quantity)));
        if (!quantity) continue;
        const stock = Math.round(number(product.stock));
        if (stock < quantity) throw new Error(`Stock insuficiente para ${product.name}. Disponible: ${stock}.`);
        product.stock = stock - quantity;
        this.put('products', product.id, product);
      }
      const saved = { ...clone(sale), status: sale.status || 'PAGADO' };
      this.put('sales', saved.id, saved);
      return { sale: saved, snapshot: this.snapshot() };
    });
  }

  voidSale(saleId) {
    return this.transaction(() => {
      const sale = this.get('sales', saleId);
      if (!sale) throw new Error('Venta no encontrada.');
      if (sale.status === 'ANULADO') return { sale, snapshot: this.snapshot() };
      for (const item of Array.isArray(sale.items) ? sale.items : []) {
        const product = this.get('products', item?.productId);
        if (!product) continue;
        product.stock = Math.max(0, number(product.stock) + Math.max(0, number(item.quantity)));
        this.put('products', product.id, product);
      }
      sale.status = 'ANULADO';
      sale.voidedAt = new Date().toISOString();
      this.put('sales', sale.id, sale);
      return { sale, snapshot: this.snapshot() };
    });
  }

  commitPurchase({ purchase, newProducts = [], productMappings = [] }) {
    return this.transaction(() => {
      if (!purchase?.id) throw new Error('La compra no tiene identificador.');
      if (this.get('purchases', purchase.id)) throw new Error('La compra ya fue registrada.');
      for (const newProduct of Array.isArray(newProducts) ? newProducts : []) {
        if (!newProduct?.id) continue;
        if (this.get('products', newProduct.id)) throw new Error(`El producto ${newProduct.name || newProduct.id} ya existe.`);
        this.put('products', newProduct.id, { ...clone(newProduct), stock: Math.max(0, number(newProduct.stock)) });
      }
      for (const mapping of Array.isArray(productMappings) ? productMappings : []) {
        const product = this.get('products', mapping?.productId);
        if (!product) continue;
        if (String(mapping?.barcode || '').trim()) product.barcode = String(mapping.barcode).trim();
        if (String(mapping?.code || '').trim()) {
          const existing = Array.isArray(product.supplierCodes) ? product.supplierCodes : [];
          const code = String(mapping.code).trim();
          if (!existing.some(item => String(item?.code || '').trim() === code)) {
            existing.push({ supplierRut: mapping?.supplierRut || undefined, supplierName: mapping?.supplierName || undefined, code });
          }
          product.supplierCodes = existing;
        }
        this.put('products', product.id, product);
      }
      for (const item of Array.isArray(purchase.items) ? purchase.items : []) {
        const product = this.get('products', item?.productId);
        if (!product) throw new Error('Uno de los productos de la compra no existe.');
        product.stock = Math.max(0, number(product.stock) + Math.max(0, number(item.quantity)));
        if (number(item.cost) > 0) product.costPrice = money(item.cost);
        this.put('products', product.id, product);
      }
      const saved = { ...clone(purchase), status: purchase.status || 'VIGENTE' };
      this.put('purchases', saved.id, saved);
      return { purchase: saved, snapshot: this.snapshot() };
    });
  }

  voidPurchase(purchaseId) {
    return this.transaction(() => {
      const purchase = this.get('purchases', purchaseId);
      if (!purchase) throw new Error('Compra o gasto no encontrado.');
      if (purchase.status === 'ANULADO') return { purchase, snapshot: this.snapshot() };
      if (purchase.type === 'INVENTARIO') {
        for (const item of Array.isArray(purchase.items) ? purchase.items : []) {
          const product = this.get('products', item?.productId);
          if (!product) continue;
          const quantity = Math.max(0, number(item.quantity));
          if (number(product.stock) < quantity) throw new Error(`No se puede revertir ${product.name}: el stock actual es menor a la reposición.`);
          product.stock = number(product.stock) - quantity;
          this.put('products', product.id, product);
        }
      }
      purchase.status = 'ANULADO';
      purchase.voidedAt = new Date().toISOString();
      this.put('purchases', purchase.id, purchase);
      return { purchase, snapshot: this.snapshot() };
    });
  }

  close() {
    try { this.db.close(); } catch {}
  }
}

module.exports = { LocalDataStore, paymentAmount };
