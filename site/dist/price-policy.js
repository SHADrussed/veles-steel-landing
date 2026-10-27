// Only explicitly approved, exact product/grade/standard/unit tariffs may be used.
// No density, unit conversion, inferred area or quantity precedence is assumed.
export const approvedTariffs = Object.freeze([]);
export function quote(parameters, tariffs = approvedTariffs) {
  const measures = [['tonnes', 'т'], ['area', 'м²'], ['quantity', 'шт.']]
    .map(([field, unit]) => ({amount:Number(parameters[field]), unit}))
    .filter(m => Number.isFinite(m.amount) && m.amount > 0);
  if (measures.length !== 1) return null;
  const measure = measures[0];
  if (measure.unit === 'шт.' && !Number.isInteger(measure.amount)) return null;
  const matches = tariffs.filter(t => t.approved === true && t.source
    && ['category', 'product', 'type', 'gost'].every(key => t[key] === parameters[key])
    && t.unit === measure.unit && Number.isFinite(t.amount) && t.amount > 0);
  if (matches.length !== 1) return null;
  const total = matches[0].amount * measure.amount;
  return Number.isFinite(total) ? {total, unit:measure.unit, unitPrice:matches[0].amount} : null;
}
