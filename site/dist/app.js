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
  let sending = false;
  let submitted = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending || submitted) return;
    for (const name of ['name', 'phone', 'email', 'order']) {
      const input = form.elements.namedItem(name);
      input.value = input.value.trim();
    }
    const phone = form.elements.namedItem('phone');
    const digits = phone.value.replace(/\D/g, '');
    phone.setCustomValidity(!/^\+?[0-9 ()-]+$/.test(phone.value) || digits.length < 10 || digits.length > 15
      ? 'Укажите номер телефона: от 10 до 15 цифр.' : '');
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    const label = button.textContent;
    const payload = Object.fromEntries(['name', 'phone', 'email', 'order', 'note'].map(name => [name, form.elements.namedItem(name).value]));
    payload.source = location.pathname.split('/').pop()?.replace('.html', '') || 'landing';
    sending = true;
    button.disabled = true;
    button.textContent = 'Отправляем…';
    form.setAttribute('aria-busy', 'true');
    status.hidden = false;
    status.textContent = 'Отправляем заявку…';
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error('Lead not acknowledged');
      submitted = true;
      status.textContent = 'Заявка принята. Мы свяжемся с вами.';
    } catch {
      status.textContent = 'Не удалось подтвердить приём заявки. Данные сохранены в форме. Попробуйте позже или свяжитесь с нами. При повторной отправке возможен дубль.';
    } finally {
      sending = false;
      form.removeAttribute('aria-busy');
      button.disabled = submitted;
      button.textContent = submitted ? 'Заявка принята' : label;
    }
  });
  form.elements.namedItem('phone').addEventListener('input', (event) => event.target.setCustomValidity(''));
  form.addEventListener('input', () => {
    if (sending) return;
    if (submitted) {
      submitted = false;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = false;
      button.textContent = 'Отправить';
    }
    status.hidden = true;
  });
}
