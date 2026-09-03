export const formatCLP = (value: number) => new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', maximumFractionDigits: 0
}).format(Number(value || 0));

export const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const calculateIVA = (gross: number) => {
  const total = Math.max(0, Math.round(Number(gross || 0)));
  const neto = Math.round(total / 1.19);
  return { neto, iva: total - neto, total };
};

export const formatDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
};

export const getCurrentLocalDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

export const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
