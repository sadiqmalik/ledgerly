import { createContext, useContext } from 'react';

// The books list plus actions to reload it and to switch books.
export const BooksContext = createContext({ books: [], reloadBooks: async () => {}, selectBook: () => {} });
export const useBooks = () => useContext(BooksContext);
