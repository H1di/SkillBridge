(function () {
  const toast = document.querySelector('[data-toast]');
  const LOCAL_SERVER_ORIGINS = new Set(['http://127.0.0.1:8000', 'http://localhost:8000']);
  const isLocalHost =
    window.location.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const preferredServerOrigin =
    window.location.hostname === 'localhost' ? 'http://localhost:8000' : 'http://127.0.0.1:8000';
  const needsServerBridge =
    window.location.protocol === 'file:' ||
    (window.location.protocol.startsWith('http') &&
      isLocalHost &&
      !LOCAL_SERVER_ORIGINS.has(window.location.origin));
  const CONTENT_FONT_SCALE = 1.0285;
  const FONT_SCALE_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'IMG', 'VIDEO', 'CANVAS', 'BR', 'HR', 'SOURCE', 'PICTURE']);
  const FONT_SCALE_TEXT_TAGS = new Set([
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'P',
    'A',
    'BUTTON',
    'LABEL',
    'LI',
    'SPAN',
    'STRONG',
    'EM',
    'SMALL',
    'BLOCKQUOTE',
    'TD',
    'TH',
    'FIGCAPTION',
    'SUMMARY',
    'LEGEND',
    'DT',
    'DD',
    'INPUT',
    'TEXTAREA',
    'SELECT',
    'OPTION',
  ]);
  const state = {
    user: null,
    workAreas: [],
    backendReady: !needsServerBridge,
  };
  let fontScaleFrame = 0;

  function currentPagePath() {
    const rawPath = window.location.pathname || '/index.html';
    const pageMatch = rawPath.match(/([^/]+\.html)$/i);
    if (pageMatch) {
      return '/' + pageMatch[1];
    }
    return rawPath === '/' ? '/index.html' : rawPath;
  }

  function pageHref(path) {
    if (needsServerBridge) {
      return preferredServerOrigin + '/' + String(path || '').replace(/^\//, '');
    }
    return path;
  }

  function showRuntimeBanner(message) {
    let banner = document.querySelector('[data-runtime-banner]');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'runtime-banner';
      banner.setAttribute('data-runtime-banner', 'true');
      document.body.prepend(banner);
    }
    banner.innerHTML = message;
  }

  function checkServerBridge() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      const cleanup = () => {
        script.remove();
        delete window.__skillbridgeServerAvailable;
      };

      script.src = preferredServerOrigin + '/assets/js/server-bridge.js?ts=' + Date.now();
      script.async = true;
      script.onload = () => {
        const ok = Boolean(window.__skillbridgeServerAvailable);
        cleanup();
        resolve(ok);
      };
      script.onerror = () => {
        cleanup();
        resolve(false);
      };

      document.head.appendChild(script);
    });
  }

  async function ensureServerContext() {
    if (!needsServerBridge) {
      state.backendReady = true;
      return true;
    }

    const serverAvailable = await checkServerBridge();
    if (serverAvailable) {
      state.backendReady = true;
      window.location.replace(preferredServerOrigin + currentPagePath() + window.location.search + window.location.hash);
      return false;
    }

    state.backendReady = false;
    const targetPage = preferredServerOrigin + currentPagePath();
    showRuntimeBanner(
      [
        '<strong>SkillBridge server needed.</strong>',
        '<span>Run <code>python3 server.py</code> inside the <code>SkillBridge</code> folder, then open </span>',
        '<a href="' + escapeHtml(targetPage) + '">' + escapeHtml(targetPage) + '</a>',
        '<span> so account creation, login, profile updates, and contact requests can reach SQLite.</span>',
      ].join('')
    );
    return true;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getInitials(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    if (!parts.length) return 'SB';
    return parts.map((part) => part[0].toUpperCase()).join('');
  }

  function getShortName(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return parts.length ? parts[0] : 'Account';
  }

  function areaLabel(key) {
    const match = state.workAreas.find((item) => item.key === key);
    return match ? match.label : 'Not selected yet';
  }

  function workAreasMarkup(selectedKey) {
    return state.workAreas
      .map((item) => {
        const activeClass = item.key === selectedKey ? ' is-selected' : '';
        return [
          '<article class="work-option-card' + activeClass + '">',
          '<span class="material-symbols-outlined" aria-hidden="true">' + escapeHtml(item.icon || 'work') + '</span>',
          '<h4>' + escapeHtml(item.label) + '</h4>',
          '<p>' + escapeHtml(item.description) + '</p>',
          '</article>',
        ].join('');
      })
      .join('');
  }

  function projectTypePickerMarkup(selectedKey) {
    return state.workAreas
      .map((item) => {
        const activeClass = item.key === selectedKey ? ' is-selected' : '';
        return [
          '<button class="project-type-card' + activeClass + '" type="button" data-project-type-option="' + escapeHtml(item.key) + '">',
          '<span class="project-type-icon"><span class="material-symbols-outlined" aria-hidden="true">' + escapeHtml(item.icon || 'work') + '</span></span>',
          '<span class="project-type-copy">',
          '<strong>' + escapeHtml(item.label) + '</strong>',
          '<span>' + escapeHtml(item.description) + '</span>',
          '</span>',
          '</button>',
        ].join('');
      })
      .join('');
  }

  function studentCurrentProjectMarkup(currentProject) {
    const projectText = String(currentProject || '').trim();
    const hasProject = Boolean(projectText);

    return [
      '<div class="student-project-stack">',
      '<article class="student-project-card' + (hasProject ? '' : ' is-empty') + '">',
      '<div class="student-project-card-head">',
      '<span class="material-symbols-outlined" aria-hidden="true">' + (hasProject ? 'assignment' : 'inventory_2') + '</span>',
      '<strong>' + (hasProject ? 'Current project' : 'Project slot') + '</strong>',
      '</div>',
      hasProject
        ? '<p class="student-project-card-body">' + escapeHtml(projectText) + '</p>'
        : '<div class="student-project-empty-space" aria-hidden="true"></div>',
      '<span class="student-project-card-note">' + (hasProject ? 'Read-only for students.' : 'No project in work right now.') + '</span>',
      '</article>',
      '</div>',
    ].join('');
  }

  function projectTypeLabel(key, fallbackLabel) {
    const label = areaLabel(key);
    return label === 'Not selected yet' ? (fallbackLabel || 'General request') : label;
  }

  function businessWaitingProjectsMarkup(waitingProjects) {
    const items = Array.isArray(waitingProjects) ? waitingProjects.filter(Boolean) : [];
    if (!items.length) {
      return [
        '<div class="business-empty-sign">',
        '<span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span>',
        '<strong>No projects yet</strong>',
        '<p>Create a request first and it will appear here while it is waiting for proceeding.</p>',
        '</div>',
      ].join('');
    }

    return [
      '<div class="business-vertical-stack">',
      items
        .map((item, index) => {
          const title = item && item.title ? item.title : 'Project Request ' + String(index + 1);
          const typeLabel = projectTypeLabel(item && item.type ? item.type : '', 'Waiting for proceeding');
          const description = item && item.description ? item.description : '';
          return [
            '<article class="business-vertical-card">',
            '<div class="business-vertical-card-head">',
            '<span class="material-symbols-outlined" aria-hidden="true">pending_actions</span>',
            '<div class="business-vertical-card-meta">',
            '<strong>' + escapeHtml(title) + '</strong>',
            '<span>' + escapeHtml(typeLabel) + '</span>',
            '</div>',
            '</div>',
            '<p class="business-vertical-card-body">' + escapeHtml(description) + '</p>',
            '<span class="business-vertical-card-note">Waiting for proceeding.</span>',
            '</article>',
          ].join('');
        })
        .join(''),
      '</div>',
    ].join('');
  }

  function businessCurrentProjectsMarkup(currentProjects) {
    const items = Array.isArray(currentProjects) ? currentProjects.filter(Boolean) : [];
    if (!items.length) {
      return [
        '<div class="business-empty-sign">',
        '<span class="material-symbols-outlined" aria-hidden="true">inventory_2</span>',
        '<strong>No projects yet</strong>',
        '<p>There are no projects proceeding yet. Once a project starts, it will show here.</p>',
        '</div>',
      ].join('');
    }

    return [
      '<div class="business-vertical-stack">',
      items
        .map((item, index) => {
          return [
            '<article class="business-vertical-card">',
            '<div class="business-vertical-card-head">',
            '<span class="material-symbols-outlined" aria-hidden="true">folder_managed</span>',
            '<div class="business-vertical-card-meta">',
            '<strong>Project ' + escapeHtml(String(index + 1)) + '</strong>',
            '<span>Currently in work</span>',
            '</div>',
            '</div>',
            '<p class="business-vertical-card-body">' + escapeHtml(item) + '</p>',
            '<span class="business-vertical-card-note">Active project card.</span>',
            '</article>',
          ].join('');
        })
        .join(''),
      '</div>',
    ].join('');
  }

  function businessRequestModalMarkup() {
    return [
      '<div class="screen-modal" data-request-modal hidden>',
      '<div class="screen-modal-backdrop" data-request-modal-close></div>',
      '<div class="screen-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="business-request-modal-title">',
      '<div class="screen-modal-panel">',
      '<div class="screen-modal-head">',
      '<div>',
      '<div class="form-kicker">New Request</div>',
      '<h3 id="business-request-modal-title">Create Project Request</h3>',
      '<p>Fill this form to add a new immutable card to the waiting-for-proceeding section.</p>',
      '</div>',
      '<button class="screen-modal-close" type="button" aria-label="Close request form" data-request-modal-close><span class="material-symbols-outlined" aria-hidden="true">close</span></button>',
      '</div>',
      '<form class="inline-form" data-request-form>',
      '<div class="form-row">',
      '<div><label for="business-request-title">Project Title</label><input class="field" id="business-request-title" name="title" type="text" placeholder="Website refresh, campaign launch, UX review..." required /></div>',
      '<div><label for="business-request-type">Project Type</label><select class="field select" id="business-request-type" name="type" data-request-type-select required></select></div>',
      '</div>',
      '<div><label for="business-request-description">Project Description</label><textarea class="field" id="business-request-description" name="description" placeholder="Describe the project scope, goal, and what support you need." required></textarea></div>',
      '<div class="form-actions">',
      '<button class="btn btn-outline" type="button" data-request-modal-close>Cancel</button>',
      '<button class="btn btn-primary" type="submit">Create Request</button>',
      '</div>',
      '</form>',
      '</div>',
      '</div>',
      '</div>',
    ].join('');
  }

  function avatarMarkup(user, className) {
    const classes = className || 'auth-avatar';
    if (user && user.avatarUrl) {
      return '<span class="' + classes + '"><img src="' + escapeHtml(user.avatarUrl) + '" alt="' + escapeHtml(user.fullName) + ' avatar" /></span>';
    }
    return '<span class="' + classes + '">' + escapeHtml(getInitials(user ? user.fullName : 'SkillBridge')) + '</span>';
  }

  function showToast(message, isError) {
    if (!toast) return;
    const msg = toast.querySelector('.msg');
    if (msg) msg.textContent = message;
    toast.classList.add('show');
    toast.style.background = isError ? '#7f1d1d' : '#0b241b';
    toast.style.borderColor = isError ? 'rgba(248,113,113,0.35)' : 'rgba(19,236,164,0.25)';
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 3400);
  }

  function setInvalid(el) {
    if (!el) return;
    el.setAttribute('aria-invalid', 'true');
    el.style.borderColor = 'rgba(239,68,68,0.9)';
    el.style.boxShadow = '0 0 0 6px rgba(239,68,68,0.12)';
  }

  function clearInvalid(el) {
    if (!el) return;
    el.removeAttribute('aria-invalid');
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }

  function attachFieldValidation(fields) {
    fields.forEach((el) => {
      if (!el) return;
      el.addEventListener('input', () => clearInvalid(el));
      el.addEventListener('change', () => clearInvalid(el));
    });
  }

  async function apiRequest(url, options) {
    if (!state.backendReady) {
      throw new Error('SkillBridge server is not running. Start it with: python3 server.py');
    }

    const config = Object.assign(
      {
        method: 'GET',
        headers: {},
        credentials: 'same-origin',
      },
      options || {}
    );

    if (config.body && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }

    const response = await fetch(needsServerBridge ? preferredServerOrigin + url : url, config);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data && data.error ? data.error : 'Something went wrong.';
      throw new Error(message);
    }
    return data;
  }

  function parseProjectLines(value) {
    return String(value || '')
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function setButtonLoading(button, loadingText) {
    if (!button) return function noop() {};
    const previousHtml = button.innerHTML;
    button.disabled = true;
    button.textContent = loadingText;
    return function restore() {
      button.disabled = false;
      button.innerHTML = previousHtml;
    };
  }

  function hasDirectTextNode(element) {
    return Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()
    );
  }

  function shouldSkipFontScaling(element, topNav) {
    if (!element || !element.tagName || FONT_SCALE_SKIP_TAGS.has(element.tagName)) return true;
    if (element.closest('header.site-header, #sb-nav, [data-runtime-banner]')) return true;
    return Boolean(topNav && topNav.contains(element));
  }

  function shouldScaleFontElement(element, topNav) {
    if (shouldSkipFontScaling(element, topNav)) return false;
    if (FONT_SCALE_TEXT_TAGS.has(element.tagName)) return true;
    return hasDirectTextNode(element);
  }

  function applyContentFontScale() {
    if (!document.body) return;

    const topNav = document.querySelector('body > nav:first-of-type');
    const elements = Array.from(document.body.querySelectorAll('*')).filter((element) => shouldScaleFontElement(element, topNav));

    elements.forEach((element) => {
      if (!Object.prototype.hasOwnProperty.call(element.dataset, 'originalInlineFontSize')) {
        element.dataset.originalInlineFontSize = element.style.fontSize || '';
      } else if (element.dataset.originalInlineFontSize) {
        element.style.fontSize = element.dataset.originalInlineFontSize;
      } else {
        element.style.removeProperty('font-size');
      }
    });

    const measuredSizes = elements.map((element) => {
      const computedFontSize = parseFloat(window.getComputedStyle(element).fontSize);
      return { element, computedFontSize };
    });

    measuredSizes.forEach(({ element, computedFontSize }) => {
      if (!Number.isFinite(computedFontSize) || computedFontSize <= 0) return;
      element.style.fontSize = (computedFontSize * CONTENT_FONT_SCALE).toFixed(2) + 'px';
    });
  }

  function scheduleContentFontScale() {
    if (fontScaleFrame) {
      window.cancelAnimationFrame(fontScaleFrame);
    }
    fontScaleFrame = window.requestAnimationFrame(() => {
      fontScaleFrame = 0;
      applyContentFontScale();
    });
  }

  function setupDrawer() {
    const drawer = document.querySelector('[data-mobile-drawer]');
    const burger = document.querySelector('[data-burger]');

    if (!burger || !drawer) return;

    const setDrawerState = (open) => {
      drawer.setAttribute('data-open', String(open));
      drawer.style.display = open ? 'block' : 'none';
      burger.setAttribute('aria-expanded', String(open));
    };

    burger.addEventListener('click', () => {
      const open = drawer.getAttribute('data-open') === 'true';
      setDrawerState(!open);
    });

    drawer.addEventListener('click', (event) => {
      const logoutLink = event.target.closest('[data-drawer-logout]');
      if (logoutLink) {
        event.preventDefault();
        handleLogout();
        setDrawerState(false);
        return;
      }
      const link = event.target.closest('a');
      if (link) setDrawerState(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) {
        setDrawerState(false);
      }
    });
  }

  function populateWorkAreaSelect(select, selectedKey, placeholderText) {
    if (!select) return;
    const placeholder = placeholderText || 'Choose an area';
    const options = ['<option value="">' + escapeHtml(placeholder) + '</option>']
      .concat(
        state.workAreas.map((item) => {
          const selected = item.key === selectedKey ? ' selected' : '';
          return '<option value="' + escapeHtml(item.key) + '"' + selected + '>' + escapeHtml(item.label) + '</option>';
        })
      )
      .join('');
    select.innerHTML = options;
    if (selectedKey) select.value = selectedKey;
  }

  function setupProjectTypePicker(root, selectedKey) {
    const input = root.querySelector('[data-project-type-input]');
    const grid = root.querySelector('[data-project-type-grid]');
    if (!input || !grid) return;

    const syncSelection = () => {
      grid.querySelectorAll('[data-project-type-option]').forEach((button) => {
        const isSelected = button.getAttribute('data-project-type-option') === input.value;
        button.classList.toggle('is-selected', isSelected);
      });
    };

    input.value = selectedKey || input.value || '';
    syncSelection();

    grid.querySelectorAll('[data-project-type-option]').forEach((button) => {
      button.addEventListener('click', () => {
        input.value = button.getAttribute('data-project-type-option') || '';
        grid.classList.remove('is-invalid');
        clearInvalid(input);
        syncSelection();
      });
    });
  }

  function toggleAccountPanels(form, accountType) {
    const buttons = form.querySelectorAll('[data-account-option]');
    const input = form.querySelector('[data-account-type-input]');
    const studentPanel = form.querySelector('[data-account-panel="student"]');
    const businessPanel = form.querySelector('[data-account-panel="business"]');
    const areaField = form.querySelector('[name="areaOfWork"]');
    const companyField = form.querySelector('[name="companyName"]');

    if (input) input.value = accountType;
    buttons.forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-account-option') === accountType);
    });

    if (studentPanel) {
      const show = accountType === 'student';
      studentPanel.classList.toggle('is-hidden', !show);
      studentPanel.querySelectorAll('input, textarea, select').forEach((field) => {
        field.disabled = !show;
      });
    }

    if (businessPanel) {
      const show = accountType === 'business';
      businessPanel.classList.toggle('is-hidden', !show);
      businessPanel.querySelectorAll('input, textarea, select').forEach((field) => {
        field.disabled = !show;
      });
    }

    if (areaField) areaField.required = accountType === 'student';
    if (companyField) companyField.required = accountType === 'business';
  }

  function closeAuthMenus() {
    document.querySelectorAll('.site-auth[data-open="true"]').forEach((menu) => {
      menu.setAttribute('data-open', 'false');
      const trigger = menu.querySelector('.auth-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function buildAuthMenu(user) {
    const wrapper = document.createElement('div');
    wrapper.className = 'site-auth';
    wrapper.setAttribute('data-auth-injected', 'true');
    wrapper.setAttribute('data-open', 'false');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'auth-trigger';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');

    if (user) {
      trigger.innerHTML = [
        avatarMarkup(user, 'auth-avatar'),
        '<span class="auth-trigger-label">',
        '<span class="auth-trigger-title">' + escapeHtml(getShortName(user.fullName)) + '</span>',
        '<span class="auth-trigger-subtext">' + escapeHtml(user.accountType === 'student' ? 'Student profile' : 'Business account') + '</span>',
        '</span>',
        '<span class="material-symbols-outlined auth-trigger-caret" aria-hidden="true">expand_more</span>',
      ].join('');
    } else {
      trigger.innerHTML = [
        '<span class="auth-avatar"><span class="material-symbols-outlined" aria-hidden="true">person</span></span>',
        '<span class="auth-trigger-label">',
        '<span class="auth-trigger-title">Account</span>',
        '<span class="auth-trigger-subtext">Log in or create account</span>',
        '</span>',
        '<span class="material-symbols-outlined auth-trigger-caret" aria-hidden="true">expand_more</span>',
      ].join('');
    }

    const menu = document.createElement('div');
    menu.className = 'auth-menu';

    if (user) {
      menu.innerHTML = [
        '<div class="auth-menu-head">',
        '<strong>' + escapeHtml(user.fullName) + '</strong>',
        '<span>' + escapeHtml(user.email) + '</span>',
        '</div>',
        '<a class="auth-menu-item" href="' + escapeHtml(pageHref('profile.html')) + '"><span class="material-symbols-outlined" aria-hidden="true">account_circle</span><span>Open profile</span></a>',
        '<button type="button" data-auth-logout><span class="material-symbols-outlined" aria-hidden="true">logout</span><span>Log out</span></button>',
      ].join('');
    } else {
      menu.innerHTML = [
        '<div class="auth-menu-head">',
        '<strong>Profile Access</strong>',
        '<span>Create a profile or sign in to manage your account.</span>',
        '</div>',
        '<a class="auth-menu-item" href="' + escapeHtml(pageHref('register.html')) + '"><span class="material-symbols-outlined" aria-hidden="true">person_add</span><span>Create account</span></a>',
        '<a class="auth-menu-item" href="' + escapeHtml(pageHref('login.html')) + '"><span class="material-symbols-outlined" aria-hidden="true">login</span><span>Log in</span></a>',
      ].join('');
    }

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = wrapper.getAttribute('data-open') === 'true';
      closeAuthMenus();
      wrapper.setAttribute('data-open', String(!isOpen));
      trigger.setAttribute('aria-expanded', String(!isOpen));
    });

    menu.addEventListener('click', async (event) => {
      const logoutButton = event.target.closest('[data-auth-logout]');
      if (!logoutButton) return;
      event.preventDefault();
      await handleLogout();
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    return wrapper;
  }

  function renderClassicHeaderAuth() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) return;
    headerActions.querySelectorAll('[data-auth-injected]').forEach((node) => node.remove());
    const auth = buildAuthMenu(state.user);
    const burger = headerActions.querySelector('.burger');
    if (burger) {
      headerActions.insertBefore(auth, burger);
    } else {
      headerActions.appendChild(auth);
    }
  }

  function renderInlineNavAuth() {
    const nav = document.querySelector('#sb-nav') || document.querySelector('body > nav:first-of-type');
    if (!nav) return;

    const existingWrapper = nav.querySelector('[data-nav-right]');
    let cta = nav.querySelector('.sb-nav-cta, .nav-cta');

    if (existingWrapper) {
      const containedCta = existingWrapper.querySelector('.sb-nav-cta, .nav-cta');
      if (containedCta && !cta) cta = containedCta;
      existingWrapper.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'site-nav-right';
    wrapper.setAttribute('data-nav-right', 'true');
    if (cta) wrapper.appendChild(cta);
    wrapper.appendChild(buildAuthMenu(state.user));
    nav.appendChild(wrapper);
  }

  function renderDrawerAuth() {
    const drawer = document.querySelector('[data-mobile-drawer]');
    if (!drawer) return;
    drawer.querySelectorAll('[data-auth-drawer]').forEach((node) => node.remove());

    if (state.user) {
      const profileLink = document.createElement('a');
      profileLink.href = pageHref('profile.html');
      profileLink.className = 'drawer-auth-link';
      profileLink.setAttribute('data-auth-drawer', 'true');
      profileLink.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">account_circle</span><span>Profile</span>';

      const logoutLink = document.createElement('a');
      logoutLink.href = '#logout';
      logoutLink.className = 'drawer-auth-link';
      logoutLink.setAttribute('data-auth-drawer', 'true');
      logoutLink.setAttribute('data-drawer-logout', 'true');
      logoutLink.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">logout</span><span>Log out</span>';

      drawer.appendChild(profileLink);
      drawer.appendChild(logoutLink);
      return;
    }

    const registerLink = document.createElement('a');
    registerLink.href = pageHref('register.html');
    registerLink.className = 'drawer-auth-link';
    registerLink.setAttribute('data-auth-drawer', 'true');
    registerLink.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">person_add</span><span>Create account</span>';

    const loginLink = document.createElement('a');
    loginLink.href = pageHref('login.html');
    loginLink.className = 'drawer-auth-link';
    loginLink.setAttribute('data-auth-drawer', 'true');
    loginLink.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">login</span><span>Log in</span>';

    drawer.appendChild(registerLink);
    drawer.appendChild(loginLink);
  }

  function renderHeaders() {
    renderClassicHeaderAuth();
    renderInlineNavAuth();
    renderDrawerAuth();
  }

  async function refreshSession() {
    try {
      const data = await apiRequest('/api/me');
      state.user = data.user || null;
      state.workAreas = Array.isArray(data.workAreas) ? data.workAreas : [];
    } catch (error) {
      state.user = null;
      if (!state.workAreas.length) state.workAreas = [];
    }
  }

  function prefillContactForm() {
    const form = document.querySelector('[data-contact-form]');
    if (!form || !state.user) return;
    const name = form.querySelector('input[name="name"]');
    const email = form.querySelector('input[name="email"]');
    if (name && !name.value.trim()) name.value = state.user.fullName || '';
    if (email && !email.value.trim()) email.value = state.user.email || '';
  }

  function setupContactForm() {
    const form = document.querySelector('[data-contact-form]');
    if (!form) return;

    const name = form.querySelector('input[name="name"]');
    const email = form.querySelector('input[name="email"]');
    const purpose = form.querySelector('select[name="purpose"]');
    const message = form.querySelector('textarea[name="message"]');
    attachFieldValidation([name, email, purpose, message]);
    prefillContactForm();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      let ok = true;
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (name && name.value.trim().length < 2) {
        ok = false;
        setInvalid(name);
      }
      if (email && !emailRe.test(email.value.trim())) {
        ok = false;
        setInvalid(email);
      }
      if (purpose && !purpose.value) {
        ok = false;
        setInvalid(purpose);
      }
      if (message && message.value.trim().length < 10) {
        ok = false;
        setInvalid(message);
      }

      if (!ok) {
        showToast('Please complete the highlighted fields.', true);
        return;
      }

      const restoreButton = setButtonLoading(form.querySelector('button[type="submit"]'), 'Sending...');
      try {
        const response = await apiRequest('/api/contact', {
          method: 'POST',
          body: {
            name: name.value.trim(),
            email: email.value.trim(),
            purpose: purpose.value,
            message: message.value.trim(),
          },
        });
        form.reset();
        prefillContactForm();
        showToast(response.message || 'Your message has been recorded.');
      } catch (error) {
        showToast(error.message || 'We could not send your message.', true);
      } finally {
        restoreButton();
      }
    });
  }

  function setupRegisterForm() {
    const form = document.querySelector('[data-register-form]');
    if (!form) return;
    if (state.user) {
      window.location.replace(pageHref('profile.html'));
      return;
    }

    const accountButtons = form.querySelectorAll('[data-account-option]');
    const areaSelect = form.querySelector('[data-work-area-select]');
    populateWorkAreaSelect(areaSelect, '', 'Choose an area from the website');
    toggleAccountPanels(form, 'student');

    accountButtons.forEach((button) => {
      button.addEventListener('click', () => {
        toggleAccountPanels(form, button.getAttribute('data-account-option'));
      });
    });

    const fields = form.querySelectorAll('input, textarea, select');
    attachFieldValidation(Array.from(fields));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      let ok = true;
      const accountType = form.querySelector('[data-account-type-input]').value;
      const fullName = form.querySelector('[name="fullName"]');
      const email = form.querySelector('[name="email"]');
      const password = form.querySelector('[name="password"]');
      const avatarUrl = form.querySelector('[name="avatarUrl"]');
      const areaOfWork = form.querySelector('[name="areaOfWork"]');
      const companyName = form.querySelector('[name="companyName"]');

      if (fullName.value.trim().length < 2) {
        ok = false;
        setInvalid(fullName);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        ok = false;
        setInvalid(email);
      }
      if (password.value.trim().length < 8) {
        ok = false;
        setInvalid(password);
      }
      if (avatarUrl.value.trim() && !/^https?:\/\//.test(avatarUrl.value.trim())) {
        ok = false;
        setInvalid(avatarUrl);
      }
      if (accountType === 'student' && !areaOfWork.value) {
        ok = false;
        setInvalid(areaOfWork);
      }
      if (accountType === 'business' && companyName.value.trim().length < 2) {
        ok = false;
        setInvalid(companyName);
      }

      if (!ok) {
        showToast('Please complete the highlighted fields.', true);
        return;
      }

      const restoreButton = setButtonLoading(form.querySelector('button[type="submit"]'), 'Creating...');
      try {
        const payload = {
          accountType,
          fullName: fullName.value.trim(),
          email: email.value.trim(),
          password: password.value,
          avatarUrl: avatarUrl.value.trim(),
          areaOfWork: areaOfWork ? areaOfWork.value : '',
          currentProject: (form.querySelector('[name="currentProject"]') || { value: '' }).value.trim(),
          companyName: (form.querySelector('[name="companyName"]') || { value: '' }).value.trim(),
          projectRequest: (form.querySelector('[name="projectRequest"]') || { value: '' }).value.trim(),
          currentProjects: parseProjectLines((form.querySelector('[name="currentProjects"]') || { value: '' }).value),
        };
        const response = await apiRequest('/api/register', { method: 'POST', body: payload });
        state.user = response.user || null;
        renderHeaders();
        showToast('Account created. Opening your profile.');
        window.setTimeout(() => {
          window.location.href = pageHref('profile.html');
        }, 450);
      } catch (error) {
        showToast(error.message || 'We could not create your account.', true);
      } finally {
        restoreButton();
      }
    });
  }

  function setupLoginForm() {
    const form = document.querySelector('[data-login-form]');
    if (!form) return;
    if (state.user) {
      window.location.replace(pageHref('profile.html'));
      return;
    }

    const email = form.querySelector('[name="email"]');
    const password = form.querySelector('[name="password"]');
    attachFieldValidation([email, password]);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      let ok = true;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        ok = false;
        setInvalid(email);
      }
      if (!password.value.trim()) {
        ok = false;
        setInvalid(password);
      }
      if (!ok) {
        showToast('Please complete the highlighted fields.', true);
        return;
      }

      const restoreButton = setButtonLoading(form.querySelector('button[type="submit"]'), 'Logging in...');
      try {
        const response = await apiRequest('/api/login', {
          method: 'POST',
          body: {
            email: email.value.trim(),
            password: password.value,
          },
        });
        state.user = response.user || null;
        renderHeaders();
        showToast('Logged in. Opening your profile.');
        window.setTimeout(() => {
          window.location.href = pageHref('profile.html');
        }, 450);
      } catch (error) {
        showToast(error.message || 'We could not log you in.', true);
      } finally {
        restoreButton();
      }
    });
  }

  function studentProfileMarkup(user) {
    const currentProject = user.currentProject
      ? '<span>' + escapeHtml(user.currentProject) + '</span>'
      : '<span class="profile-placeholder">No active project assigned yet.</span>';

    return [
      '<section class="profile-grid">',
      '<article class="profile-summary-card">',
      '<div class="profile-avatar-row">',
      avatarMarkup(user, 'profile-avatar'),
      '<div class="profile-summary-meta">',
      '<h2>' + escapeHtml(user.fullName) + '</h2>',
      '<p>' + escapeHtml(user.email) + '</p>',
      '</div>',
      '</div>',
      '<div class="profile-badges">',
      '<span class="profile-badge"><span class="material-symbols-outlined" aria-hidden="true">school</span><span>Student Profile</span></span>',
      '<span class="profile-badge"><span class="material-symbols-outlined" aria-hidden="true">work_history</span><span>' + escapeHtml(areaLabel(user.areaOfWork)) + '</span></span>',
      '</div>',
      '<div class="profile-data-list">',
      '<div class="profile-data-item"><strong>Name</strong><span>' + escapeHtml(user.fullName) + '</span></div>',
      '<div class="profile-data-item"><strong>Avatar</strong><span>' + escapeHtml(user.avatarUrl || 'Using generated initials avatar') + '</span></div>',
      '<div class="profile-data-item"><strong>Request for Project</strong><span>' + escapeHtml(areaLabel(user.areaOfWork)) + '</span></div>',
      '<div class="profile-data-item"><strong>Project Currently in Work</strong>' + currentProject + '</div>',
      '</div>',
      '</article>',
      '<div class="profile-root">',
      '<article class="profile-section-card">',
      '<div class="profile-section-copy">',
      '<h3>Request for Project</h3>',
      '<p>Choose the type of project you want to work on. The icon cards use green borders so the options feel clear and visual.</p>',
      '</div>',
      '<form class="inline-form" data-profile-form data-profile-type="student">',
      '<div class="form-row">',
      '<div><label for="profile-name">Name</label><input class="field" id="profile-name" name="fullName" type="text" value="' + escapeHtml(user.fullName) + '" required /></div>',
      '<div><label for="profile-avatar">Avatar URL <span class="label-soft">Optional</span></label><input class="field" id="profile-avatar" name="avatarUrl" type="url" value="' + escapeHtml(user.avatarUrl || '') + '" placeholder="https://example.com/avatar.jpg" /></div>',
      '</div>',
      '<div class="project-type-field">',
      '<label for="profile-project-type">Types of Project</label>',
      '<input id="profile-project-type" name="areaOfWork" type="hidden" value="' + escapeHtml(user.areaOfWork || '') + '" data-project-type-input />',
      '<div class="project-type-grid" data-project-type-grid>' + projectTypePickerMarkup(user.areaOfWork) + '</div>',
      '</div>',
      '<div class="form-actions"><button class="btn btn-primary" type="submit">Save Profile</button><span class="form-status" data-profile-status></span></div>',
      '</form>',
      '</article>',
      '<article class="profile-section-card">',
      '<div class="profile-section-copy">',
      '<h3>Project Currently in Work</h3>',
      '<p>This section is read-only for students. If there is no active project yet, it stays as an empty vertical rectangle.</p>',
      '</div>',
      studentCurrentProjectMarkup(user.currentProject),
      '</article>',
      '</div>',
      '</section>',
    ].join('');
  }

  function businessProfileMarkup(user) {
    const waitingProjects = Array.isArray(user.waitingProjects) ? user.waitingProjects : [];
    const currentProjects = Array.isArray(user.currentProjects) ? user.currentProjects : [];
    const waitingCount = waitingProjects.length;
    const requestStatus = waitingCount ? String(waitingCount) + ' waiting for proceeding' : 'No waiting projects';

    return [
      '<section class="profile-grid">',
      '<article class="profile-summary-card">',
      '<div class="profile-avatar-row">',
      avatarMarkup(user, 'profile-avatar'),
      '<div class="profile-summary-meta">',
      '<h2>' + escapeHtml(user.companyName || user.fullName) + '</h2>',
      '<p>' + escapeHtml(user.email) + '</p>',
      '</div>',
      '</div>',
      '<div class="profile-badges">',
      '<span class="profile-badge"><span class="material-symbols-outlined" aria-hidden="true">apartment</span><span>Business Account</span></span>',
      '<span class="profile-badge"><span class="material-symbols-outlined" aria-hidden="true">pending_actions</span><span>' + escapeHtml(String(waitingCount)) + ' waiting</span></span>',
      '<span class="profile-badge"><span class="material-symbols-outlined" aria-hidden="true">folder</span><span>' + escapeHtml(String(currentProjects.length)) + ' project' + (currentProjects.length === 1 ? '' : 's') + ' in work</span></span>',
      '</div>',
      '<div class="profile-data-list">',
      '<div class="profile-data-item"><strong>Company Name</strong><span>' + escapeHtml(user.companyName || 'Not set yet') + '</span></div>',
      '<div class="profile-data-item"><strong>Contact Name</strong><span>' + escapeHtml(user.fullName) + '</span></div>',
      '<div class="profile-data-item"><strong>Waiting Status</strong><span>' + escapeHtml(requestStatus) + '</span></div>',
      '<div class="profile-data-item"><strong>Projects in Work</strong><span>' + escapeHtml(String(currentProjects.length)) + (currentProjects.length === 1 ? ' active project' : ' active projects') + '</span></div>',
      '</div>',
      '</article>',
      '<div class="profile-root">',
      '<article class="profile-section-card">',
      '<div class="profile-section-copy">',
      '<h3>Business Details</h3>',
      '<p>Update the core details for your business profile here.</p>',
      '</div>',
      '<form class="inline-form" data-profile-form data-profile-type="business">',
      '<div class="form-row">',
      '<div><label for="profile-contact-name">Contact Name</label><input class="field" id="profile-contact-name" name="fullName" type="text" value="' + escapeHtml(user.fullName) + '" required /></div>',
      '<div><label for="profile-company-name">Company Name</label><input class="field" id="profile-company-name" name="companyName" type="text" value="' + escapeHtml(user.companyName || '') + '" required /></div>',
      '</div>',
      '<div><label for="profile-business-avatar">Avatar URL <span class="label-soft">Optional</span></label><input class="field" id="profile-business-avatar" name="avatarUrl" type="url" value="' + escapeHtml(user.avatarUrl || '') + '" placeholder="https://example.com/logo-or-avatar.jpg" /></div>',
      '<div class="form-actions"><button class="btn btn-primary" type="submit">Save Profile</button><span class="form-status" data-profile-status></span></div>',
      '</form>',
      '</article>',
      '<article class="profile-section-card">',
      '<div class="profile-section-copy">',
      '<h3>Request for Project</h3>',
      '<p>Use the button to open a centered form and create a new request. After submission, a new card appears in the waiting section and cards cannot be edited.</p>',
      '</div>',
      '<div class="request-launch-row">',
      '<button class="btn btn-primary" type="button" data-request-modal-open aria-expanded="false">Create Project Request</button>',
      '</div>',
      '</article>',
      '<article class="profile-section-card">',
      '<div class="profile-section-copy">',
      '<h3>Projects Waiting for Proceeding</h3>',
      '<p>Every submitted request appears here as a waiting card. Cards are read-only after creation.</p>',
      '</div>',
      businessWaitingProjectsMarkup(waitingProjects),
      '</article>',
      '<article class="profile-section-card">',
      '<div class="profile-section-copy">',
      '<h3>Projects That Are Proceeding</h3>',
      '<p>Projects already in progress appear here as vertical rectangles. If there is no current work yet, the rectangle remains empty.</p>',
      '</div>',
      businessCurrentProjectsMarkup(currentProjects),
      '</article>',
      businessRequestModalMarkup(),
      '</div>',
      '</section>',
    ].join('');
  }

  function renderGuestProfile(root) {
    root.innerHTML = [
      '<section class="profile-empty-state">',
      '<article class="profile-summary-card">',
      '<div class="form-intro compact">',
      '<div class="form-kicker">Profile Access</div>',
      '<h2>Create account or log in</h2>',
      '<p>Use the account menu in the header or the quick actions below to open your SkillBridge account.</p>',
      '</div>',
      '<div class="profile-guest-highlights">',
      '<div class="profile-guest-highlight"><span class="material-symbols-outlined" aria-hidden="true">school</span><span>Students can set their work area and keep their profile details current.</span></div>',
      '<div class="profile-guest-highlight"><span class="material-symbols-outlined" aria-hidden="true">apartment</span><span>Businesses can manage company details, project requests, and active work in one place.</span></div>',
      '</div>',
      '<div class="profile-guest-actions">',
      '<a class="btn btn-primary" href="' + escapeHtml(pageHref('register.html')) + '">Create Account</a>',
      '<a class="btn btn-outline" href="' + escapeHtml(pageHref('login.html')) + '">Log In</a>',
      '</div>',
      '</article>',
      '</section>',
    ].join('');
  }

  function setupProfileForm(root) {
    const form = root.querySelector('[data-profile-form]');
    if (!form || !state.user) return;

    const areaSelect = form.querySelector('[data-profile-area]');
    if (areaSelect) {
      populateWorkAreaSelect(areaSelect, state.user.areaOfWork, 'Choose your area');
    }
    setupProjectTypePicker(form, state.user.areaOfWork);

    const status = form.querySelector('[data-profile-status]');
    const fields = form.querySelectorAll('input, textarea, select');
    attachFieldValidation(Array.from(fields));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const profileType = form.getAttribute('data-profile-type');
      let ok = true;
      const fullName = form.querySelector('[name="fullName"]');
      const avatarUrl = form.querySelector('[name="avatarUrl"]');
      const areaOfWork = form.querySelector('[name="areaOfWork"]');
      const companyName = form.querySelector('[name="companyName"]');
      const projectTypeGrid = form.querySelector('[data-project-type-grid]');

      if (fullName && fullName.value.trim().length < 2) {
        ok = false;
        setInvalid(fullName);
      }
      if (avatarUrl && avatarUrl.value.trim() && !/^https?:\/\//.test(avatarUrl.value.trim())) {
        ok = false;
        setInvalid(avatarUrl);
      }
      if (profileType === 'student' && areaOfWork && !areaOfWork.value) {
        ok = false;
        setInvalid(areaOfWork);
        if (projectTypeGrid) projectTypeGrid.classList.add('is-invalid');
      }
      if (profileType === 'business' && companyName && companyName.value.trim().length < 2) {
        ok = false;
        setInvalid(companyName);
      }

      if (!ok) {
        showToast('Please complete the highlighted fields.', true);
        return;
      }

      const payload = {
        fullName: fullName ? fullName.value.trim() : '',
        avatarUrl: avatarUrl ? avatarUrl.value.trim() : '',
      };

      if (profileType === 'student') {
        payload.areaOfWork = areaOfWork ? areaOfWork.value : '';
        const currentProjectField = form.querySelector('[name="currentProject"]');
        if (currentProjectField) {
          payload.currentProject = currentProjectField.value.trim();
        }
      } else {
        payload.companyName = (form.querySelector('[name="companyName"]') || { value: '' }).value.trim();
        const projectRequestField = form.querySelector('[name="projectRequest"]');
        const currentProjectsField = form.querySelector('[name="currentProjects"]');
        if (projectRequestField) {
          payload.projectRequest = projectRequestField.value.trim();
        }
        if (currentProjectsField) {
          payload.currentProjects = parseProjectLines(currentProjectsField.value);
        }
      }

      const restoreButton = setButtonLoading(form.querySelector('button[type="submit"]'), 'Saving...');
      try {
        const response = await apiRequest('/api/profile', {
          method: 'PATCH',
          body: payload,
        });
        state.user = response.user || state.user;
        renderHeaders();
        renderProfilePage();
        scheduleContentFontScale();
        showToast('Profile updated.');
      } catch (error) {
        if (status) status.textContent = '';
        showToast(error.message || 'We could not update your profile.', true);
      } finally {
        restoreButton();
      }
    });
  }

  function setupBusinessRequestModal(root) {
    const openButton = root.querySelector('[data-request-modal-open]');
    const modal = root.querySelector('[data-request-modal]');
    const form = root.querySelector('[data-request-form]');
    if (!openButton || !modal || !form) return;

    const titleField = form.querySelector('[name="title"]');
    const typeField = form.querySelector('[name="type"]');
    const descriptionField = form.querySelector('[name="description"]');
    const closeButtons = modal.querySelectorAll('[data-request-modal-close]');

    populateWorkAreaSelect(typeField, '', 'Choose project type');
    attachFieldValidation([titleField, typeField, descriptionField]);

    const closeModal = () => {
      modal.setAttribute('hidden', '');
      document.body.classList.remove('request-modal-open');
      openButton.setAttribute('aria-expanded', 'false');
      form.reset();
      populateWorkAreaSelect(typeField, '', 'Choose project type');
      [titleField, typeField, descriptionField].forEach(clearInvalid);
    };

    const openModal = () => {
      modal.removeAttribute('hidden');
      document.body.classList.add('request-modal-open');
      openButton.setAttribute('aria-expanded', 'true');
      if (titleField) titleField.focus();
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape' && !modal.hasAttribute('hidden')) {
        closeModal();
      }
    };

    openButton.addEventListener('click', () => {
      openModal();
    });

    document.addEventListener('keydown', handleEscape);

    closeButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        closeModal();
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      let ok = true;

      if (!titleField.value.trim() || titleField.value.trim().length < 2) {
        ok = false;
        setInvalid(titleField);
      }
      if (!typeField.value) {
        ok = false;
        setInvalid(typeField);
      }
      if (!descriptionField.value.trim() || descriptionField.value.trim().length < 10) {
        ok = false;
        setInvalid(descriptionField);
      }

      if (!ok) {
        showToast('Please complete the highlighted fields.', true);
        return;
      }

      const restoreButton = setButtonLoading(form.querySelector('button[type="submit"]'), 'Creating...');
      try {
        const response = await apiRequest('/api/business/request', {
          method: 'POST',
          body: {
            title: titleField.value.trim(),
            type: typeField.value,
            description: descriptionField.value.trim(),
          },
        });
        closeModal();
        state.user = response.user || state.user;
        renderProfilePage();
        scheduleContentFontScale();
        showToast('Project request created.');
      } catch (error) {
        showToast(error.message || 'We could not create your request.', true);
      } finally {
        restoreButton();
      }
    });
  }

  function renderProfilePage() {
    const root = document.querySelector('[data-profile-root]');
    if (!root) return;
    if (!state.user) {
      renderGuestProfile(root);
      return;
    }

    root.innerHTML = state.user.accountType === 'student' ? studentProfileMarkup(state.user) : businessProfileMarkup(state.user);
    setupBusinessRequestModal(root);
    setupProfileForm(root);
  }

  async function handleLogout() {
    try {
      await apiRequest('/api/logout', { method: 'POST', body: {} });
    } catch (error) {
      showToast(error.message || 'We could not log you out.', true);
      return;
    }
    state.user = null;
    renderHeaders();
    renderProfilePage();
    scheduleContentFontScale();
    showToast('You have been logged out.');
    if (/profile\.html$/i.test(window.location.pathname)) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-auth')) {
      closeAuthMenus();
    }
  });

  window.addEventListener('resize', scheduleContentFontScale);

  async function init() {
    const shouldContinue = await ensureServerContext();
    if (!shouldContinue) return;
    setupDrawer();
    await refreshSession();
    renderHeaders();
    setupContactForm();
    setupRegisterForm();
    setupLoginForm();
    renderProfilePage();
    scheduleContentFontScale();
  }

  init();
})();
