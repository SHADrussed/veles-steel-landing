'use strict';

const params = new URLSearchParams(window.location.search);
const material = params.get('material')?.trim() || 'материал';
const type = params.get('type')?.trim() || '';
const gost = params.get('gost')?.trim() || '';

const materialTitle = document.querySelector('[data-material-title]');
const order = document.querySelector('#order');

if (materialTitle) {
  materialTitle.textContent = material.toLowerCase();
}

document.title = `ГОСТы и ТУ: ${material} — Велес Сталь`;

if (order) {
  const parts = [material, type && `тип: ${type}`, gost && `стандарт: ${gost}`].filter(Boolean);
  order.value = parts.join('; ');
}
