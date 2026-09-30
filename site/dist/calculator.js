'use strict';

const calculator = document.querySelector('#calculator-form');
const order = document.querySelector('#order');

if (calculator && order) {
  // Supply confirmed prices here (or via window.VELES_PRICE_TABLE) before launch.
  // The project currently contains no approved price list, so empty data is intentional.
  const priceTable = window.VELES_PRICE_TABLE || {};
  const names = { category: 'Категория', product: 'Материал/Товар', type: 'Тип', gost: 'ГОСТ', tonnes: 'Тонны', area: 'Кв. метры', quantity: 'Кол-во шт.', width: 'Ширина, м', length: 'Длина, м' };
  const numeric = new Set(['tonnes', 'area', 'quantity', 'width', 'length']);
  const priceResult = document.querySelector('[data-price-result]');
  const priceNote = document.querySelector('[data-price-note]');
  const summary = document.querySelector('[data-calculation-summary]');

  function number(name) {
    const raw = calculator.elements.namedItem(name)?.value.replace(',', '.');
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function priceFor(product, category) {
    return priceTable[`${category}:${product}`] || priceTable[product] || null;
  }

  function getMeasure() {
    const tonnes = number('tonnes');
    const area = number('area');
    const quantity = number('quantity');
    const width = number('width');
    const length = number('length');

    if (tonnes) return { amount: tonnes, unit: 'т', label: `${tonnes} т` };
    if (area) return { amount: area, unit: 'м²', label: `${area} м²` };
    if (quantity && width && length) {
      const calculatedArea = quantity * width * length;
      return { amount: calculatedArea, unit: 'м²', label: `${quantity} шт. × ${width} × ${length} м = ${calculatedArea} м²` };
    }
    if (quantity) return { amount: quantity, unit: 'шт.', label: `${quantity} шт.` };
    return null;
  }

  function money(value) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
  }

  function update() {
    const product = calculator.elements.namedItem('product').value.trim();
    const type = calculator.elements.namedItem('type').value.trim();
    const category = calculator.elements.namedItem('category').value.trim();
    const measure = getMeasure();
    const price = priceFor(product, category);
    const unitPrice = price && Number(price.amount);
    const canCalculate = measure && price && price.unit === measure.unit && Number.isFinite(unitPrice) && unitPrice > 0;

    document.querySelector('[data-product-name]').textContent = [product, type].filter(Boolean).join(' ') || 'Материал';
    summary.textContent = measure ? `Объём заказа: ${measure.label}` : 'Укажите количество или размер заказа';
    priceResult.textContent = canCalculate ? `${money(measure.amount * unitPrice)} ₽` : 'Цена уточняется';
    priceNote.textContent = canCalculate
      ? `Расчёт: ${money(unitPrice)} ₽/${measure.unit}. Итог зависит от подтверждённого прайса и условий поставки.`
      : 'Прайс-лист не подключён: точную стоимость нельзя показать без подтверждённых цен.';
    priceNote.hidden = Boolean(canCalculate);

    order.value = Object.entries(names).map(([key, label]) => {
      const value = calculator.elements.namedItem(key).value.trim();
      return value && (!numeric.has(key) || Number(value.replace(',', '.')) > 0) ? `${label}: ${value}` : '';
    }).filter(Boolean).join('; ').slice(0, 500);
  }

  calculator.addEventListener('input', update);
  calculator.addEventListener('change', update);
  update();
}
