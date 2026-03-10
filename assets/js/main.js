/* Tiny JS for navigation + contact form UX. */

(function(){
  const drawer = document.querySelector('[data-mobile-drawer]');
  const burger = document.querySelector('[data-burger]');
  if (burger && drawer){
    burger.addEventListener('click', () => {
      const open = drawer.getAttribute('data-open') === 'true';
      drawer.setAttribute('data-open', String(!open));
      drawer.style.display = open ? 'none' : 'block';
      burger.setAttribute('aria-expanded', String(!open));
    });
  }

  // Contact form: simple validation + fake submit.
  const form = document.querySelector('[data-contact-form]');
  const toast = document.querySelector('[data-toast]');

  function showToast(message){
    if (!toast) return;
    toast.querySelector('.msg').textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function setInvalid(el, msg){
    el.setAttribute('aria-invalid', 'true');
    el.dataset.error = msg;
    el.style.borderColor = 'rgba(239,68,68,0.9)';
    el.style.boxShadow = '0 0 0 6px rgba(239,68,68,0.12)';
  }

  function clearInvalid(el){
    el.removeAttribute('aria-invalid');
    delete el.dataset.error;
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }

  if (form){
    const name = form.querySelector('input[name="name"]');
    const email = form.querySelector('input[name="email"]');
    const purpose = form.querySelector('select[name="purpose"]');
    const message = form.querySelector('textarea[name="message"]');

    [name,email,purpose,message].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => clearInvalid(el));
      el.addEventListener('change', () => clearInvalid(el));
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      let ok = true;
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (name && name.value.trim().length < 2){ ok=false; setInvalid(name, 'Enter your full name.'); }
      if (email && !emailRe.test(email.value.trim())){ ok=false; setInvalid(email, 'Enter a valid email.'); }
      if (purpose && !purpose.value){ ok=false; setInvalid(purpose, 'Pick a purpose.'); }
      if (message && message.value.trim().length < 10){ ok=false; setInvalid(message, 'Give us a bit more detail.'); }

      if (!ok){
        showToast('Write proper message.');
        return;
      }

      // Fake "send".
      const btn = form.querySelector('button[type="submit"]');
      const prev = btn ? btn.textContent : '';
      if (btn){
        btn.disabled = true;
        btn.textContent = 'Sending…';
      }

      window.setTimeout(() => {
        if (btn){
          btn.disabled = false;
          btn.textContent = prev;
        }
        form.reset();
        showToast('Message queued (pretend). Maybe we will do back-end:).');
      }, 900);
    });
  }
})();
