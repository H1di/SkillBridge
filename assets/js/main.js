
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

  const form = document.querySelector('[data-contact-form]');
  const toast = document.querySelector('[data-toast]');

  function showToast(message){
    if (!toast) return;
    toast.querySelector('.msg').textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function setInvalid(el){
    el.setAttribute('aria-invalid', 'true');
    el.style.borderColor = 'rgba(239,68,68,0.9)';
    el.style.boxShadow = '0 0 0 6px rgba(239,68,68,0.12)';
  }

  function clearInvalid(el){
    el.removeAttribute('aria-invalid');
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

      if (name && name.value.trim().length < 2){ ok=false; setInvalid(name); }
      if (email && !emailRe.test(email.value.trim())){ ok=false; setInvalid(email); }
      if (purpose && !purpose.value){ ok=false; setInvalid(purpose); }
      if (message && message.value.trim().length < 10){ ok=false; setInvalid(message); }

      if (!ok){
        showToast('Please complete the highlighted fields.');
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      const prev = btn ? btn.innerHTML : '';
      if (btn){ btn.disabled = true; btn.textContent = 'Sending…'; }

      window.setTimeout(() => {
        if (btn){ btn.disabled = false; btn.innerHTML = prev; }
        form.reset();
        showToast('Your message has been recorded in this demo form.');
      }, 900);
    });
  }
})();
