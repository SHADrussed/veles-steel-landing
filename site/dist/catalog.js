'use strict';

const catalogData = {
  nonferrous: {
    title: 'Цветной металлопрокат',
    filters: [
      'Цветные металлы и сплавы',
      'Сварочные материалы и флюсы',
      'Порошки, смеси и металлоиды',
    ],
    products: [
      { name: 'Лист', group: 'Цветные металлы и сплавы', slug: 'sheet' },
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
    title: 'Черный металлопрокат',
    filters: [
      'Листовой прокат',
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
      { name: 'Листовой прокат', group: 'Листовой прокат' },
      { name: 'Квадрат', group: 'Сортовой прокат' },
    ],
  },

  pipes: {
    title: 'Трубопроводная арматура',
    filters: ['Запорная арматура', 'Соединительные детали', 'Фланцы'],
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
    filters: [],
    products: [
      { name: 'Промышленная химия', group: 'Все' },
      { name: 'Реактивная химия', group: 'Все' },
      { name: 'Нефтяная химия', group: 'Все' },
      { name: 'Пищевая химия', group: 'Все' },
    ],
  },
};

const productTables = {
  'nonferrous:sheet': {
    title: 'Лист',
    columns: ['Марка', 'Размер, мм', 'Цена, руб/кг', 'Контакт'],
    rows: [
      ['А5м, н', '0,5-10,0', 'По запросу'],
      ['А5М (рулон)', '0,5-10,0', 'По запросу'],
      ['А5М (рулон)', '0,5', 'По запросу'],
      ['А5м, н', '0,5', 'По запросу'],
      ['А5м, н', '0,8-1,0', 'По запросу'],
      ['А5М (рулон)', '0,8-1,0', 'По запросу'],
      ['А5М (рулон)', '0,5-10,0', 'По запросу'],
      ['А5М (рулон)', '0,5-10,0', 'По запросу'],
      ['А5М (рулон)', '0,5-10,0', 'По запросу'],
      ['А5м, н', '0,5', 'По запросу'],
      ['А5м, н', '0,5', 'По запросу'],
      ['А5м, н', '0,8-1,0', 'По запросу'],
    ],
  },
};

const categoryOrder = ['nonferrous', 'black', 'pipes', 'chemical'];

const categoryLabels = {
  nonferrous: 'Цветной металлопрокат',
  black: 'Черный металлопрокат',
  pipes: 'Трубопроводная арматура',
  chemical: 'Химическая продукция',
};

const tabsRoot = document.querySelector('[data-catalog-tabs]');
const subtabsRoot = document.querySelector('[data-catalog-subtabs]');
const cardsRoot = document.querySelector('[data-catalog-cards]');
const title = document.querySelector('[data-catalog-title]');

function readState() {
  const params = new URLSearchParams(window.location.search);
  const category = catalogData[params.get('category')] ? params.get('category') : 'nonferrous';
  const product = params.get('product');
  return { category, product };
}

let { category: activeCategory, product: activeProduct } = readState();
let activeFilter = null;

function setUrl({ category = activeCategory, product = null }) {
  const next = new URL(window.location.href);
  next.searchParams.set('category', category);

  if (product) {
    next.searchParams.set('product', product);
  } else {
    next.searchParams.delete('product');
  }

  window.history.pushState({}, '', next);
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
      activeProduct = null;
      activeFilter = null;
      setUrl({ category: key });
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

      if (activeProduct) {
        activeProduct = null;
        setUrl({ category: activeCategory });
      }

      render();
    });

    subtabsRoot.append(button);
  });
}

function openProduct(product) {
  if (!product.slug) {
    const order = document.querySelector('#order');
    if (order) order.value = product.name;
    document.querySelector('#request')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  activeProduct = product.slug;
  setUrl({ category: activeCategory, product: activeProduct });
  render();
  document.querySelector('.catalog-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function createCard(product) {
  const article = document.createElement('article');
  article.className = 'catalog-card';

  const activateCard = () => openProduct(product);

  article.addEventListener('click', (event) => {
    if (event.target.closest('.catalog-card__action')) return;
    activateCard();
  });

  const heading = document.createElement('h2');
  heading.textContent = product.name;

  const meta = document.createElement('p');
  meta.className = 'catalog-card__meta';
  meta.textContent = '278635 моделей';

  const action = document.createElement('button');
  action.className = 'catalog-card__action';
  action.type = 'button';
  action.textContent = 'Уточнить наличие';
  action.addEventListener('click', activateCard);

  article.append(heading, meta, action);
  return article;
}

function createCards(category) {
  cardsRoot.className = 'catalog-cards';
  cardsRoot.innerHTML = '';

  const products = !activeFilter
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

function createProductTable() {
  const tableData = productTables[`${activeCategory}:${activeProduct}`];

  if (!tableData) {
    activeProduct = null;
    setUrl({ category: activeCategory });
    render();
    return;
  }

  title.textContent = catalogData[activeCategory].title;
  createSubtabs(catalogData[activeCategory]);
  cardsRoot.className = 'catalog-product-view';
  cardsRoot.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'catalog-product-toolbar';

  const back = document.createElement('button');
  back.className = 'catalog-back';
  back.type = 'button';
  back.textContent = '← Назад к каталогу';
  back.addEventListener('click', () => {
    activeProduct = null;
    activeFilter = null;
    setUrl({ category: activeCategory });
    render();
  });

  const productTitle = document.createElement('h2');
  productTitle.className = 'catalog-product-title';
  productTitle.textContent = tableData.title;

  toolbar.append(back, productTitle);

  const scroll = document.createElement('div');
  scroll.className = 'catalog-table-scroll';

  const table = document.createElement('table');
  table.className = 'catalog-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  tableData.columns.forEach((column) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = column;
    headRow.append(th);
  });

  thead.append(headRow);

  const tbody = document.createElement('tbody');

  tableData.rows.forEach((row) => {
    const tr = document.createElement('tr');

    row.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    });

    const contactCell = document.createElement('td');
    const contact = document.createElement('a');
    contact.className = 'catalog-table__contact';
    contact.href = '#request';
    contact.textContent = 'Уточнить';

    contact.addEventListener('click', () => {
      const order = document.querySelector('#order');
      if (order) {
        order.value = `${tableData.title}: ${row[0]}, ${row[1]}`;
      }
    });

    contactCell.append(contact);
    tr.append(contactCell);
    tbody.append(tr);
  });

  table.append(thead, tbody);
  scroll.append(table);
  cardsRoot.append(toolbar, scroll);
}

function renderSubtabsAndCards() {
  const category = catalogData[activeCategory];
  createSubtabs(category);
  createCards(category);
}

function render() {
  const category = catalogData[activeCategory];
  document.body.classList.toggle('is-product-view', Boolean(activeProduct));
  createCategoryTabs();

  if (activeProduct) {
    document.title = `${category.title}: товар — Велес Сталь`;
    createProductTable();
    return;
  }

  title.textContent = category.title;
  document.title = `${category.title} — Велес Сталь`;
  renderSubtabsAndCards();
}

render();

window.addEventListener('popstate', () => {
  const state = readState();
  activeCategory = state.category;
  activeProduct = state.product;
  activeFilter = null;
  render();
});
