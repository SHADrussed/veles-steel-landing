'use strict';

const catalogData = {
  nonferrous: {
    title: 'Цветной металлопрокат',
    filters: [
      'Все',
      'Цветные металлы и сплавы',
      'Сварочные материалы и флюсы',
      'Порошки, смеси и металлоиды',
    ],
    products: [
      { name: 'Лист', group: 'Цветные металлы и сплавы' },
      { name: 'Цветные металлы и сплавы', group: 'Цветные металлы и сплавы' },
      { name: 'Сварочные материалы и флюсы', group: 'Сварочные материалы и флюсы' },
      { name: 'Порошки, смеси и металлоиды', group: 'Порошки, смеси и металлоиды' },
      { name: 'Нержавеющие стали', group: 'Цветные металлы и сплавы' },
      { name: 'Коррозионные стали', group: 'Цветные металлы и сплавы' },
      { name: 'Инструментальные стали', group: 'Цветные металлы и сплавы' },
      { name: 'Полуфабрикаты', group: 'Цветные металлы и сплавы' },
      { name: 'Прочий металлопрокат', group: 'Цветные металлы и сплавы' },
    ],
  },

  black: {
    title: 'Чёрный металлопрокат',
    filters: [
      'Все',
      'Фасонный прокат',
      'Сортовой прокат',
      'Трубный прокат',
      'Металлические изделия',
    ],
    products: [
      { name: 'Фасонный прокат', group: 'Фасонный прокат' },
      { name: 'Сортовой прокат', group: 'Сортовой прокат' },
      { name: 'Трубный прокат', group: 'Трубный прокат' },
      { name: 'Металлические изделия', group: 'Металлические изделия' },
      { name: 'Квадрат', group: 'Сортовой прокат' },
      { name: 'Полоса', group: 'Сортовой прокат' },
    ],
  },

  pipes: {
    title: 'Трубопроводная арматура',
    filters: ['Все', 'Запорная арматура', 'Соединительные детали', 'Фланцы'],
    products: [
      { name: 'Задвижки', group: 'Запорная арматура' },
      { name: 'Вентили', group: 'Запорная арматура' },
      { name: 'Затворы', group: 'Запорная арматура' },
      { name: 'Краны шаровые', group: 'Запорная арматура' },
      { name: 'Фланцы', group: 'Фланцы' },
      { name: 'Отводы', group: 'Соединительные детали' },
      { name: 'Тройники', group: 'Соединительные детали' },
      { name: 'Переходы', group: 'Соединительные детали' },
    ],
  },

  chemical: {
    title: 'Химическая продукция',
    filters: ['Все'],
    products: [
      { name: 'Промышленная химия', group: 'Все' },
      { name: 'Реактивная химия', group: 'Все' },
      { name: 'Нефтяная химия', group: 'Все' },
      { name: 'Пищевая химия', group: 'Все' },
    ],
  },
};

const categoryOrder = ['nonferrous', 'black', 'pipes', 'chemical'];

const categoryLabels = {
  nonferrous: 'Цветной металлопрокат',
  black: 'Чёрный металлопрокат',
  pipes: 'Трубопроводная арматура',
  chemical: 'Химическая продукция',
};

const tabsRoot = document.querySelector('[data-catalog-tabs]');
const subtabsRoot = document.querySelector('[data-catalog-subtabs]');
const cardsRoot = document.querySelector('[data-catalog-cards]');
const title = document.querySelector('[data-catalog-title]');

const params = new URLSearchParams(window.location.search);
let activeCategory = params.get('category');

if (!catalogData[activeCategory]) {
  activeCategory = 'nonferrous';
}

let activeFilter = 'Все';

function updateUrl(category) {
  const next = new URL(window.location.href);
  next.searchParams.set('category', category);
  next.searchParams.delete('product');
  window.history.replaceState({}, '', next);
}

function createCategoryTabs() {
  tabsRoot.innerHTML = '';

  categoryOrder.forEach((key) => {
    const link = document.createElement('a');
    link.className = 'catalog-tab';
    link.href = `catalog.html?category=${key}`;
    link.textContent = categoryLabels[key];
    link.setAttribute('aria-current', String(key === activeCategory));

    link.addEventListener('click', (event) => {
      event.preventDefault();
      activeCategory = key;
      activeFilter = 'Все';
      updateUrl(key);
      render();
    });

    tabsRoot.append(link);
  });
}

function createSubtabs(category) {
  subtabsRoot.innerHTML = '';

  category.filters.forEach((filter) => {
    const button = document.createElement('button');
    button.className = 'catalog-subtab';
    button.type = 'button';
    button.textContent = filter;
    button.setAttribute('aria-pressed', String(filter === activeFilter));

    button.addEventListener('click', () => {
      activeFilter = filter;
      renderSubtabsAndCards();
    });

    subtabsRoot.append(button);
  });
}

function createCard(product) {
  const article = document.createElement('article');
  article.className = 'catalog-card';

  const heading = document.createElement('h2');
  heading.textContent = product.name;

  const meta = document.createElement('p');
  meta.className = 'catalog-card__meta';
  meta.textContent = '278635 моделей';

  const action = document.createElement('a');
  action.className = 'catalog-card__action';
  action.href = '#request';
  action.textContent = 'Уточнить наличие';
  action.addEventListener('click', () => {
    const order = document.querySelector('#order');
    if (order) {
      order.value = product.name;
    }
  });

  article.append(heading, meta, action);
  return article;
}

function createCards(category) {
  cardsRoot.innerHTML = '';

  const products = activeFilter === 'Все'
    ? category.products
    : category.products.filter((product) => product.group === activeFilter);

  if (!products.length) {
    const empty = document.createElement('p');
    empty.className = 'catalog-empty';
    empty.textContent = 'Для этой подкатегории карточки пока не добавлены.';
    cardsRoot.append(empty);
    return;
  }

  products.forEach((product) => cardsRoot.append(createCard(product)));
}

function renderSubtabsAndCards() {
  const category = catalogData[activeCategory];
  createSubtabs(category);
  createCards(category);
}

function render() {
  const category = catalogData[activeCategory];
  title.textContent = category.title;
  document.title = `${category.title} — Велес Сталь`;
  createCategoryTabs();
  renderSubtabsAndCards();
}

render();

window.addEventListener('popstate', () => {
  const next = new URLSearchParams(window.location.search).get('category');
  activeCategory = catalogData[next] ? next : 'nonferrous';
  activeFilter = 'Все';
  render();
});
