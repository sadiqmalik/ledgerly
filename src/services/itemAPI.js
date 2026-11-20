import { api } from './dataAPI';

// Item tracker calls (book-scoped), on the shared API client.
const itemAPI = {
  getItems: async bookId => (await api.get(`/books/${bookId}/items`)).data,
  createItem: async (bookId, body) => (await api.post(`/books/${bookId}/items`, body)).data,
  updateItem: async (bookId, id, body) => (await api.put(`/books/${bookId}/items/${id}`, body)).data,
  deleteItem: async (bookId, id) => (await api.delete(`/books/${bookId}/items/${id}`)).data,
  getLocations: async bookId => (await api.get(`/books/${bookId}/item-locations`)).data,
  createLocation: async (bookId, body) => (await api.post(`/books/${bookId}/item-locations`, body)).data,
  updateLocation: async (bookId, id, body) => (await api.put(`/books/${bookId}/item-locations/${id}`, body)).data,
  deleteLocation: async (bookId, id) => (await api.delete(`/books/${bookId}/item-locations/${id}`)).data,
};

export default itemAPI;
