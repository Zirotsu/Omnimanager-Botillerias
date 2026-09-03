import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { BusinessProfile, CashClosure, OmniSnapshot, Product, Promotion, Purchase, Sale, User } from './types';

interface OmniStoreValue {
  snapshot: OmniSnapshot | null;
  ready: boolean;
  error: string;
  refresh(): Promise<OmniSnapshot>;
  saveProfile(profile: BusinessProfile): Promise<void>;
  saveProduct(product: Product): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  adjustStock(productId: string, quantity: number, note: string, user?: User | null): Promise<Product>;
  importProducts(products: Product[]): Promise<void>;
  importBarcodes(mappings: unknown[]): Promise<void>;
  savePromotion(promotion: Promotion): Promise<void>;
  deletePromotion(id: string): Promise<void>;
  saveUser(user: User): Promise<void>;
  deleteUser(id: string): Promise<void>;
  commitSale(sale: Sale, deductions: Array<{ productId: string; quantity: number }>): Promise<Sale>;
  voidSale(id: string): Promise<void>;
  commitPurchase(purchase: Purchase, options?: { newProducts?: Product[]; productMappings?: unknown[] }): Promise<Purchase>;
  voidPurchase(id: string): Promise<void>;
  openCash(openingCash: number, notes: string, user: User): Promise<CashClosure>;
  closeCash(closureId: string, declaredCash: number, notes: string, user: User): Promise<CashClosure>;
  backup(label?: string): Promise<string>;
  restore(snapshot: OmniSnapshot): Promise<void>;
}

const OmniStoreContext = createContext<OmniStoreValue | null>(null);

export const OmniStoreProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<OmniSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const next = await window.omniStandalone.database.snapshot();
    setSnapshot(next);
    setError('');
    return next;
  }, []);

  useEffect(() => {
    refresh()
      .catch(err => setError(err instanceof Error ? err.message : 'No fue posible leer la base de datos local.'))
      .finally(() => setReady(true));
  }, [refresh]);

  const saveProfile = useCallback(async (profile: BusinessProfile) => {
    await window.omniStandalone.database.saveProfile(profile);
    setSnapshot(previous => previous ? { ...previous, profile } : previous);
  }, []);

  const saveProduct = useCallback(async (product: Product) => {
    await window.omniStandalone.database.put('products', product.id, product);
    await refresh();
  }, [refresh]);

  const deleteProduct = useCallback(async (id: string) => {
    await window.omniStandalone.database.remove('products', id);
    await refresh();
  }, [refresh]);

  const adjustStock = useCallback(async (productId: string, quantity: number, note: string, user?: User | null) => {
    const result = await window.omniStandalone.database.adjustStock({ productId, quantity, note, user });
    await refresh();
    return result.product as Product;
  }, [refresh]);

  const importProducts = useCallback(async (products: Product[]) => {
    await window.omniStandalone.database.importProducts(products);
    await refresh();
  }, [refresh]);

  const importBarcodes = useCallback(async (mappings: unknown[]) => {
    await window.omniStandalone.database.importBarcodes(mappings);
    await refresh();
  }, [refresh]);

  const savePromotion = useCallback(async (promotion: Promotion) => {
    await window.omniStandalone.database.put('promotions', promotion.id, promotion);
    await refresh();
  }, [refresh]);

  const deletePromotion = useCallback(async (id: string) => {
    await window.omniStandalone.database.remove('promotions', id);
    await refresh();
  }, [refresh]);

  const saveUser = useCallback(async (user: User) => {
    await window.omniStandalone.database.put('users', user.id, user);
    await refresh();
  }, [refresh]);

  const deleteUser = useCallback(async (id: string) => {
    await window.omniStandalone.database.remove('users', id);
    await refresh();
  }, [refresh]);

  const commitSale = useCallback(async (sale: Sale, deductions: Array<{ productId: string; quantity: number }>) => {
    const result = await window.omniStandalone.database.commitSale({ sale, deductions });
    setSnapshot(result.snapshot);
    return result.sale as Sale;
  }, []);

  const voidSale = useCallback(async (id: string) => {
    const result = await window.omniStandalone.database.voidSale(id);
    setSnapshot(result.snapshot);
  }, []);

  const commitPurchase = useCallback(async (purchase: Purchase, options?: { newProducts?: Product[]; productMappings?: unknown[] }) => {
    const result = await window.omniStandalone.database.commitPurchase({ purchase, ...(options || {}) });
    setSnapshot(result.snapshot);
    return result.purchase as Purchase;
  }, []);

  const voidPurchase = useCallback(async (id: string) => {
    const result = await window.omniStandalone.database.voidPurchase(id);
    setSnapshot(result.snapshot);
  }, []);

  const openCash = useCallback(async (openingCash: number, notes: string, user: User) => {
    const result = await window.omniStandalone.database.openCash({ openingCash, notes, user });
    setSnapshot(result.snapshot);
    return result.closure as CashClosure;
  }, []);

  const closeCash = useCallback(async (closureId: string, declaredCash: number, notes: string, user: User) => {
    const result = await window.omniStandalone.database.closeCash({ closureId, declaredCash, notes, user });
    setSnapshot(result.snapshot);
    return result.closure as CashClosure;
  }, []);

  const backup = useCallback((label = 'manual') => window.omniStandalone.database.backup(label), []);

  const restore = useCallback(async (next: OmniSnapshot) => {
    const restored = await window.omniStandalone.database.replaceSnapshot(next);
    setSnapshot(restored);
  }, []);

  const value = useMemo<OmniStoreValue>(() => ({
    snapshot, ready, error, refresh, saveProfile, saveProduct, deleteProduct, adjustStock, importProducts,
    importBarcodes, savePromotion, deletePromotion, saveUser, deleteUser, commitSale, voidSale,
    commitPurchase, voidPurchase, openCash, closeCash, backup, restore
  }), [snapshot, ready, error, refresh, saveProfile, saveProduct, deleteProduct, adjustStock, importProducts,
    importBarcodes, savePromotion, deletePromotion, saveUser, deleteUser, commitSale, voidSale,
    commitPurchase, voidPurchase, openCash, closeCash, backup, restore]);

  return <OmniStoreContext.Provider value={value}>{children}</OmniStoreContext.Provider>;
};

export const useOmniStore = () => {
  const value = useContext(OmniStoreContext);
  if (!value) throw new Error('OmniStore debe usarse dentro de OmniStoreProvider.');
  return value;
};
