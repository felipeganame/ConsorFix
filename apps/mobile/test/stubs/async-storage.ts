/** AsyncStorage en memoria. Misma API que la real para lo que usa la app. */
const store = new Map<string, string>();

export default {
  async getItem(k: string): Promise<string | null> {
    return store.has(k) ? store.get(k)! : null;
  },
  async setItem(k: string, v: string): Promise<void> {
    store.set(k, v);
  },
  async removeItem(k: string): Promise<void> {
    store.delete(k);
  },
  /** Solo para los tests: deja el almacenamiento limpio entre casos. */
  __reset(): void {
    store.clear();
  },
};
