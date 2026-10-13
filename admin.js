const authPanel = document.getElementById('auth-panel');
const dashboard = document.getElementById('dashboard');
const authForm = document.getElementById('auth-form');
const itemForm = document.getElementById('item-form');
const listingList = document.getElementById('listing-list');
const formMessage = document.getElementById('form-message');
let editingId = null;

const categoryNames = {
  'phone-sales': 'Phone sales',
  'phone-repairs': 'Phone repairs',
  'laptop-sales': 'Laptop sales',
  'laptop-repairs': 'Laptop repairs',
  gadgets: 'Gadgets & accessories',
  'phone-parts': 'Phone spare parts',
  'home-showcase': 'Homepage highlights'
};

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...options });
  } catch {
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    throw new Error(isLocal
      ? 'The local server is unavailable. Start it with start-local.bat and try again.'
      : 'The hosted admin service could not be reached. Try again, or contact the site administrator.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function showAuth() {
  authPanel.hidden = false;
  dashboard.hidden = true;
  authForm.hidden = false;
  document.getElementById('server-retry').hidden = true;
  document.getElementById('auth-password').autocomplete = 'current-password';
  document.getElementById('auth-title').textContent = 'Admin sign in';
  document.getElementById('auth-description').textContent =
    'Enter the admin password to manage the catalog.';
  document.getElementById('auth-message').textContent = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-submit').textContent = 'Sign in';
}

async function initialize() {
  document.getElementById('loading-panel').hidden = true;
  try {
    const status = await api('/api/status');
    if (!status.setup_required && status.authenticated) {
      showDashboard(status.role);
    } else if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      const session = await api('/api/local-session', { method: 'POST' });
      await showDashboard(session.role);
    } else {
      showAuth();
      if (status.setup_required) {
        document.getElementById('auth-message').textContent =
          'The admin password has not been set up yet. Add the ITECH_ADMIN_PASSWORD environment variable in Netlify, then redeploy.';
      }
    }
  } catch (error) {
    authPanel.hidden = false;
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    document.getElementById('auth-title').textContent = isLocal
      ? 'Local server is offline'
      : 'Hosted admin service is unavailable';
    document.getElementById('auth-description').textContent =
      isLocal
        ? 'Double-click start-local.bat to start or reopen the local server, then choose Try again.'
        : 'The hosted admin service could not be reached. Choose Try again in a moment.';
    document.getElementById('auth-message').textContent = error.message;
    document.getElementById('server-retry').hidden = false;
  }
}

async function showDashboard(role) {
  authPanel.hidden = true;
  dashboard.hidden = false;
  document.getElementById('session-role').textContent = role ? 'Admin session' : '';
  try {
    await refreshListings();
  } catch (error) {
    formMessage.textContent = `Signed in, but listings could not be loaded: ${error.message}`;
  }
}

async function refreshListings() {
  const items = await api('/api/admin/items');
  listingList.replaceChildren();
  document.getElementById('dashboard-count').textContent =
    `${items.length} ${items.length === 1 ? 'listing' : 'listings'}`;
  if (!items.length) {
    const message = document.createElement('p');
    message.className = 'hint';
    message.textContent = 'No managed listings yet. Add one above to publish it to the matching storefront section.';
    listingList.append(message);
    return;
  }

  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'listing';
    const image = document.createElement('img');
    image.alt = '';
    image.src = item.image || '';
    image.hidden = !item.image;
    const details = document.createElement('div');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = categoryNames[item.category] || item.category;
    const title = document.createElement('h3');
    title.textContent = item.title;
    const description = document.createElement('p');
    description.textContent = [item.price, item.model, item.visible ? '' : 'Hidden'].filter(Boolean).join(' · ');
    details.append(badge, title, description);
    const actions = document.createElement('div');
    actions.className = 'listing-actions';
    const edit = document.createElement('button');
    edit.className = 'secondary';
    edit.type = 'button';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editListing(item));
    const remove = document.createElement('button');
    remove.className = 'danger';
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteListing(item));
    actions.append(edit, remove);
    row.append(image, details, actions);
    listingList.append(row);
  }
}

function editListing(item) {
  editingId = item.id;
  document.getElementById('editor-title').textContent = 'Edit listing';
  document.getElementById('category').value = item.category;
  document.getElementById('title').value = item.title;
  document.getElementById('description').value = item.description;
  document.getElementById('price').value = item.price;
  document.getElementById('model').value = item.model;
  document.getElementById('part-category').value = item.part_category;
  document.getElementById('target').value = item.target;
  document.getElementById('stock').value = item.stock;
  document.getElementById('visible').checked = Boolean(item.visible);
  document.getElementById('image-file').value = '';
  itemForm.dataset.image = item.image;
  syncEditorForCategory();
  document.getElementById('cancel-edit').hidden = false;
  document.getElementById('save-button').textContent = 'Update listing';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncEditorForCategory() {
  const section = document.getElementById('category').value;
  const partCategoryField = document.getElementById('part-category').closest('label');
  const targetField = document.getElementById('target').closest('label');
  const target = document.getElementById('target');

  if (section === 'phone-parts') {
    partCategoryField.hidden = false;
    target.value = 'phones';
  } else {
    partCategoryField.hidden = true;
    if (section === 'phone-sales') target.value = 'phones';
    else if (section === 'phone-repairs') target.value = 'repairs';
    else if (section === 'laptop-sales' || section === 'laptop-repairs') target.value = 'laptops';
    else if (section === 'gadgets') target.value = 'gadgets';
    else target.value = 'phones';
  }

  if (targetField) {
    targetField.hidden = section === 'home-showcase';
  }
}

function resetEditor() {
  editingId = null;
  itemForm.reset();
  itemForm.dataset.image = '';
  document.getElementById('visible').checked = true;
  document.getElementById('part-category').value = 'Accessories';
  document.getElementById('target').value = 'phones';
  syncEditorForCategory();
  document.getElementById('editor-title').textContent = 'Add a listing';
  document.getElementById('cancel-edit').hidden = true;
  document.getElementById('save-button').textContent = 'Save listing';
  formMessage.textContent = '';
  formMessage.className = '';
}

document.getElementById('category').addEventListener('change', syncEditorForCategory);

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.getElementById('auth-message');
  const submit = document.getElementById('auth-submit');
  submit.disabled = true;
  submit.textContent = 'Signing in…';
  message.textContent = '';
  try {
    const credentials = {
      password: document.getElementById('auth-password').value
    };
    await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    await showDashboard('admin');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Sign in';
  }
});

document.getElementById('server-retry').addEventListener('click', initialize);
async function uploadImage(file) {
  const upload = new FormData();
  upload.append('image', file);
  const result = await api('/api/upload', { method: 'POST', body: upload });
  return result.image;
}

itemForm.addEventListener('submit', async event => {
  event.preventDefault();
  formMessage.textContent = '';
  formMessage.className = '';
  const saveButton = document.getElementById('save-button');
  saveButton.disabled = true;
  try {
    let image = itemForm.dataset.image || '';
    const file = document.getElementById('image-file').files[0];
    if (file) {
      image = await uploadImage(file);
    }
    const listing = {
      category: document.getElementById('category').value,
      title: document.getElementById('title').value,
      description: document.getElementById('description').value,
      price: document.getElementById('price').value,
      model: document.getElementById('model').value,
      part_category: document.getElementById('part-category').value,
      target: document.getElementById('target').value,
      stock: document.getElementById('stock').value,
      image,
      visible: document.getElementById('visible').checked
    };
    await api(editingId ? `/api/items/${editingId}` : '/api/items', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(listing)
    });
    resetEditor();
    formMessage.textContent = 'Listing saved. It is now available in its storefront section.';
    formMessage.className = 'success';
    await refreshListings();
  } catch (error) {
    formMessage.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById('cancel-edit').addEventListener('click', resetEditor);
document.getElementById('logout').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
    showAuth();
  } catch (error) {
    window.alert(error.message);
  }
});

syncEditorForCategory();

async function deleteListing(item) {
  if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
  try {
    await api(`/api/items/${item.id}`, { method: 'DELETE' });
    await refreshListings();
  } catch (error) {
    window.alert(error.message);
  }
}

initialize();
