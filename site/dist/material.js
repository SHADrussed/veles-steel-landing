'use strict';

const params = new URLSearchParams(window.location.search);
const material = params.get('material')?.trim() || 'Материал';
const type = params.get('type')?.trim() || '—';
const gost = params.get('gost')?.trim() || 'Стандарт уточняется';

const title = document.querySelector('[data-material-title]');
const name = document.querySelector('[data-material-name]');
const typeNode = document.querySelector('[data-material-type]');
const list = document.querySelector('[data-standard-list]');
const order = document.querySelector('#order');

if (title) title.textContent = material.toLowerCase();
if (name) name.textContent = material;
if (typeNode) typeNode.textContent = type;
document.title = `ГОСТы и ТУ: ${material} — Велес Сталь`;

const standards = gost
  .split(/[;,]+/)
  .map((item) => item.trim())
  .filter(Boolean)
  .map((name) => ({
    name,
    note: 'Стандарт, выбранный в калькуляторе.',
  }));

if (!standards.length) {
  standards.push({
    name: 'Стандарт уточняется',
    note: 'Оставьте заявку, чтобы уточнить применимый ГОСТ или ТУ.',
  });
}

if (list) {
  list.innerHTML = '';

  standards.forEach((standard) => {
    const article = document.createElement('article');
    article.className = 'material-standard';

    const copy = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = standard.name;
    const note = document.createElement('p');
    note.textContent = standard.note;
    copy.append(heading, note);

    const link = document.createElement('a');
    link.href = '#request';
    link.textContent = 'Уточнить документ';
    link.addEventListener('click', () => {
      if (order) {
        order.value = `${material}; тип: ${type}; стандарт: ${standard.name}`;
      }
    });

    article.append(copy, link);
    list.append(article);
  });
}

if (order) {
  order.value = `${material}; тип: ${type}; стандарт: ${gost}`;
}
