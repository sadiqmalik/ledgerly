import axios from 'axios';
import config from '../config';

const api = axios.create({
  baseURL: config.API_URL,
  headers: { 'Content-Type': 'application/json' }
});

// A 401 from any data route means the session has ended. The sign-in routes are excluded,
// because a 401 there just means the password was wrong.
api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !url.includes('/auth/')) {
      window.dispatchEvent(new Event('ledger:unauthorized'));
    }
    // A 403 may mean the account's pages changed; the auth context refreshes /auth/me.
    if (status === 403 && !url.includes('/auth/')) window.dispatchEvent(new Event('ledger:forbidden'));
    return Promise.reject(error);
  }
);

const dataAPI = {
  // Sign-in and account
  getMe: async () => (await api.get('/auth/me')).data.account,
  login: async (email, password) => (await api.post('/auth/login', { email, password })).data.account,
  loginWithCode: async code => (await api.post('/auth/access-code', { code })).data.account,
  logout: async () => { await api.post('/auth/logout', {}); },
  changePassword: async (current, next) => (await api.post('/auth/password', { current, new: next })).data,

  // Access codes (super administrators). The plaintext code is only in the create response.
  listAccessCodes: async () => (await api.get('/admin/access-codes')).data.accessCodes,
  createAccessCode: async (name, bookIds, code = '', resources) =>
    (await api.post('/admin/access-codes', { name, bookIds, code, ...(resources ? { resources } : {}) })).data.accessCode,
  setAccessCodeResources: async (id, resources) =>
    (await api.put(`/admin/access-codes/${encodeURIComponent(id)}/resources`, { resources })).data.accessCode,
  resetAccessCode: async (id, code = '') =>
    (await api.post(`/admin/access-codes/${encodeURIComponent(id)}/reset`, { code })).data.accessCode,
  revokeAccessCode: async id => (await api.post(`/admin/access-codes/${encodeURIComponent(id)}/revoke`, {})).data.accessCode,
  deleteAccessCode: async id => (await api.delete(`/admin/access-codes/${encodeURIComponent(id)}`)).data.deleted,

  // Books the signed-in account can access
  getBooks: async () => (await api.get('/books')).data,

  // Ledger data (book-scoped). Amounts are integer minor units.
  getSummary: async bookId => (await api.get(`/books/${bookId}/summary`)).data,
  getEntries: async (bookId, params = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
    return (await api.get(`/books/${bookId}/entries`, { params: clean })).data;
  },
  createEntry: async (bookId, body) => (await api.post(`/books/${bookId}/entries`, body)).data,
  updateEntry: async (bookId, id, body) => (await api.put(`/books/${bookId}/entries/${id}`, body)).data,
  deleteEntry: async (bookId, id) => (await api.delete(`/books/${bookId}/entries/${id}`)).data,
  bulkEntries: async (bookId, body) => (await api.post(`/books/${bookId}/entries/bulk`, body)).data,
  refundEntry: async (bookId, id, body) => (await api.post(`/books/${bookId}/entries/${id}/refund`, body)).data,
  createTransfer: async (bookId, body) => (await api.post(`/books/${bookId}/transfers`, body)).data,
  getFunds: async bookId => (await api.get(`/books/${bookId}/funds`)).data,
  getCategories: async bookId => (await api.get(`/books/${bookId}/categories`)).data,
  getParties: async bookId => (await api.get(`/books/${bookId}/parties`)).data,
};

export { api };
export default dataAPI;
