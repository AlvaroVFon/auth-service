# Progreso del Proyecto - Auth Service

## ✅ Hecho
- **Configuración Base**:
  - Estructura de carpetas (`src/config`, `src/users`, `src/health`).
  - Configuración de variables de entorno con `process.loadEnvFile`.
  - Conexión a MongoDB con Mongoose y gestión de cierres limpios.
  - Middlewares globales (JSON, URLencoded).
  - Rutas de salud (`/health`).
- **Testing (Unitario)**:
  - Setup de tests con `node:test` y `tsx`.
  - Globalización de `describe`, `test`, `assert`.
  - Fixtures para usuarios sincronizados con el esquema de Mongoose.
  - Tests unitarios para configuración de entorno y creación de usuarios.
  - Patrón de ejecución de tests corregido en `package.json`.
- **Calidad de Código**:
  - Configuración básica de ESLint (soporte para Node.js y TypeScript).
  - Configuración de Prettier.
  - `.gitignore` y `.prettierignore` configurados.

## ⏳ Pendiente
- **Git Hooks & Workflow**:
  - [ ] Configurar **Commitizen** para mensajes de commit estandarizados.
  - [ ] Configurar **Husky** para ejecutar Lint y Prettier antes de cada commit.
- **Testing (Avanzado)**:
  - [ ] Configurar y desarrollar tests **e2e** (API completa).
  - [ ] Añadir reportes de cobertura (coverage).
- **Core Business**:
  - [ ] Implementar registro de usuarios.
  - [ ] Implementar login y generación de JWT.
  - [ ] Hash de contraseñas (bcrypt).
