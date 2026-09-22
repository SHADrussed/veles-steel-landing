'use strict';

const calculator = document.querySelector('#calculator-form');
const order = document.querySelector('#order');
const materialLink = document.querySelector('[data-material-link]');

if (calculator && order) {
  const names = { category: 'Категория', product: 'Материал/Товар', type: 'Тип', gost: 'ГОСТ', tonnes: 'Тонны', area: 'Кв. метры', quantity: 'Кол-во шт.', width: 'Ширина, м', length: 'Длина, м' };
  const numeric = new Set(['tonnes', 'area', 'quantity', 'width', 'length']);
  function update() {
    const product = calculator.elements.namedItem('product').value.trim();
    const type = calculator.elements.namedItem('type').value.trim();
    document.querySelector('[data-product-name]').textContent = [product, type].filter(Boolean).join(' ') || 'Материал';

    if (materialLink) {
      const gost = calculator.elements.namedItem('gost').value.trim();
      const materialUrl = new URL('material.html', window.location.href);
      if (product) materialUrl.searchParams.set('material', product);
      if (type) materialUrl.searchParams.set('type', type);
      if (gost) materialUrl.searchParams.set('gost', gost);
      materialLink.href = materialUrl.href;
    }

    order.value = Object.entries(names).map(([key, label]) => {
      const value = calculator.elements.namedItem(key).value.trim();
      return value && (!numeric.has(key) || Number(value) > 0) ? `${label}: ${value}` : '';
    }).filter(Boolean).join('; ').slice(0, 500);
  }
  calculator.addEventListener('input', update);
  calculator.addEventListener('change', update);
  update();
}
