const { paymentAmount } = require('./local-data-store.cjs');

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = value => Math.round(number(value));
const chileDay = date => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date instanceof Date ? date : new Date(date || Date.now()));

class CashRegisterStore {
  constructor({ store }) {
    this.store = store;
  }

  open({ openingCash = 0, notes = '', user }) {
    return this.store.transaction(() => {
      if (!user?.id) throw new Error('Usuario requerido para abrir caja.');
      const current = this.store.list('closures').find(item => item.status === 'ABIERTA' && item.userId === user.id);
      if (current) throw new Error(`Ya existe una caja abierta para ${user.name || 'este usuario'}.`);

      const now = new Date();
      const userPart = String(user.id).replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'USR';
      const closure = {
        id: `CJA-${chileDay(now).replace(/-/g, '')}-${userPart}-${Date.now().toString().slice(-5)}`,
        date: now.toISOString(),
        localDay: chileDay(now),
        userId: String(user.id),
        userName: String(user.name || 'Usuario'),
        userRole: user.role || 'CAJERO',
        openedAt: now.toISOString(),
        openingCash: Math.max(0, money(openingCash)),
        totalCashSales: 0,
        totalCardSales: 0,
        totalTransferSales: 0,
        totalCashExpenses: 0,
        totalExpenses: 0,
        totalExpectedCash: Math.max(0, money(openingCash)),
        declaredCash: 0,
        difference: 0,
        totalShiftSales: 0,
        salesCount: 0,
        openingNotes: String(notes || '').trim().slice(0, 300),
        status: 'ABIERTA'
      };
      this.store.put('closures', closure.id, closure);
      return { closure, snapshot: this.store.snapshot() };
    });
  }

  close({ closureId, declaredCash = 0, notes = '', user }) {
    return this.store.transaction(() => {
      const closure = this.store.get('closures', closureId);
      if (!closure || closure.status !== 'ABIERTA') throw new Error('No existe una caja abierta con ese folio.');
      if (!user?.id) throw new Error('Usuario requerido para cerrar caja.');
      const elevated = user.role === 'ADMIN' || user.role === 'SUPERVISOR';
      if (!elevated && closure.userId !== user.id) throw new Error('Este turno pertenece a otro usuario.');

      const sales = this.store.list('sales').filter(sale => sale.cashShiftId === closure.id && sale.status !== 'ANULADO');
      const purchases = this.store.list('purchases').filter(purchase => purchase.cashShiftId === closure.id && purchase.status !== 'ANULADO');
      const totalCashSales = sales.reduce((sum, sale) => sum + paymentAmount(sale, 'EFECTIVO'), 0);
      const totalCardSales = sales.reduce((sum, sale) => sum + paymentAmount(sale, 'DEBITO') + paymentAmount(sale, 'CREDITO'), 0);
      const totalTransferSales = sales.reduce((sum, sale) => sum + paymentAmount(sale, 'TRANSFERENCIA'), 0);
      const totalShiftSales = sales.reduce((sum, sale) => sum + money(sale.totalGeneral), 0);
      const totalCashExpenses = purchases
        .filter(purchase => purchase.paymentMethod === 'EFECTIVO')
        .reduce((sum, purchase) => sum + money(purchase.totalAmount), 0);
      const totalExpenses = purchases.reduce((sum, purchase) => sum + money(purchase.totalAmount), 0);
      const totalExpectedCash = Math.max(0, money(closure.openingCash) + totalCashSales - totalCashExpenses);
      const declared = Math.max(0, money(declaredCash));
      const now = new Date();

      const closed = {
        ...closure,
        date: now.toISOString(),
        closedAt: now.toISOString(),
        closedById: user.id,
        closedByName: user.name || closure.userName,
        totalCashSales,
        totalCardSales,
        totalTransferSales,
        totalCashExpenses,
        totalExpenses,
        totalExpectedCash,
        declaredCash: declared,
        difference: declared - totalExpectedCash,
        totalShiftSales,
        salesCount: sales.length,
        notes: String(notes || '').trim().slice(0, 500),
        status: 'CERRADA'
      };
      this.store.put('closures', closed.id, closed);
      return { closure: closed, snapshot: this.store.snapshot() };
    });
  }
}

module.exports = { CashRegisterStore };
