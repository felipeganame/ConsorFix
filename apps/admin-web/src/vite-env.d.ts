/// <reference types="vite/client" />

// Hace visible `import.meta.env` para tsc. Vite lo inyecta en tiempo de build,
// pero sin esta referencia el compilador no conoce el tipo y `import.meta.env.DEV`
// —que es lo que deja las credenciales del seed fuera del bundle de producción—
// no compila.
