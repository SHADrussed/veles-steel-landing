'use strict';

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');

function closeMenu(returnFocus = false) {
  if (!menuToggle || !navigation) return;
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Открыть меню');
  navigation.classList.remove('is-open');
  if (returnFocus) menuToggle.focus();
}

menuToggle?.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  navigation.classList.toggle('is-open', open);
});
navigation?.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') closeMenu(true);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.header')) closeMenu();
});
window.matchMedia('(min-width: 1101px)').addEventListener('change', (event) => {
  if (event.matches) closeMenu();
});

const form = document.querySelector('#request-form');
const status = document.querySelector('#form-status');
if (form && status) {
  try {
    const preparedOrder = sessionStorage.getItem('veles-calculator-request');
    if (preparedOrder) {
      form.elements.namedItem('order').value = preparedOrder;
      sessionStorage.removeItem('veles-calculator-request');
    }
  } catch {
    // The form still works when browser storage is unavailable.
  }
  // This preview never transmits contact details or claims a submitted request.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const digits = form.elements.namedItem('phone').value.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      form.elements.namedItem('phone').setCustomValidity('Укажите номер телефона: от 10 до 15 цифр.');
      form.elements.namedItem('phone').reportValidity();
      return;
    }
    status.hidden = false;
    status.textContent = 'Форма заполнена. Это демонстрация вёрстки: заявка не отправлена, данные остаются только на этой странице.';
  });
  form.elements.namedItem('phone').addEventListener('input', (event) => event.target.setCustomValidity(''));
  form.addEventListener('input', () => { status.hidden = true; });
}
