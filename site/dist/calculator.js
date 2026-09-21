'use strict';

const calculator = document.querySelector('#calculator-form');

if (calculator) {
  const fields = ['product', 'material', 'size', 'length', 'quantity'];
  const defaults = {
    product: 'Не выбрана',
    material: 'Не указан',
    size: 'Не указаны',
    length: 'Не указана',
    quantity: 'Не указано',
  };

  function valueOf(name) {
    return calculator.elements.namedItem(name).value.trim();
  }

  function updateSummary() {
    for (const name of fields) {
      const target = document.querySelector(`[data-summary="${name}"]`);
      const value = valueOf(name);
      target.textContent = value
        ? value + (name === 'length' ? ' м' : name === 'quantity' ? ' шт.' : '')
        : defaults[name];
    }
  }

  function saveRequest() {
    const lines = [
      ['Продукция', valueOf('product')],
      ['Материал', valueOf('material')],
      ['Профиль и размеры', valueOf('size')],
      ['Длина', valueOf('length') ? `${valueOf('length')} м` : ''],
      ['Количество', valueOf('quantity') ? `${valueOf('quantity')} шт.` : ''],
      ['Условия', valueOf('comment')],
    ];
    const request = lines.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('; ');
    try {
      sessionStorage.setItem('veles-calculator-request', request.slice(0, 500));
    } catch {
      // Browser storage may be disabled; the destination form remains available.
    }
  }

  calculator.addEventListener('input', updateSummary);
  calculator.addEventListener('change', updateSummary);
  calculator.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!calculator.reportValidity()) return;
    saveRequest();
    window.location.href = 'index.html#request';
  });
  document.querySelector('.calculator-summary > a').addEventListener('click', saveRequest);
  updateSummary();
}
