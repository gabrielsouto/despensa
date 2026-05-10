const db = (() => {
  const DB_NAME = "despensa";
  const DB_VERSION = 1;
  const STORE = "produtos";

  function abrirDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
          store.createIndex("barcode", "barcode", { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function salvarProduto(produto) {
    const conn = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const agora = Date.now();
      const req = store.add({ ...produto, createdAt: agora, updatedAt: agora });
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function listarProdutos() {
    const conn = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function buscarProduto(id) {
    const conn = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(id);
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function buscarPorCodigo(barcode) {
    const conn = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const index = store.index("barcode");
      const req = index.get(barcode);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function atualizarProduto(produto) {
    const conn = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.put({ ...produto, updatedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function removerProduto(id) {
    const conn = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  return { salvarProduto, listarProdutos, buscarProduto, buscarPorCodigo, atualizarProduto, removerProduto };
})();
