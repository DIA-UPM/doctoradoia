# Publicar la web en GitHub Pages (desde la web de GitHub)

El proyecto ya incluye todo lo necesario: el flujo `.github/workflows/deploy.yml` instala las
dependencias, valida el contenido, construye la web, comprueba enlaces y la publica en GitHub Pages
cada vez que se suben cambios a la rama `main`. No hace falta subir la carpeta `dist/`: GitHub la
genera.

## 1. Crear el repositorio

1. En https://github.com → **New repository**.
2. Nombre, por ejemplo `doctoradoia` (la web quedará en `https://<usuario>.github.io/doctoradoia/`).
3. Público (GitHub Pages gratuito requiere repositorio público; con GitHub Pro/Team/Enterprise puede ser privado).
4. **No** añadas README, .gitignore ni licencia (ya existen). Pulsa **Create repository**.

## 2. Subir los archivos

**Opción A — GitHub Desktop (recomendada, sin comandos):** File → Add local repository →
`E:\Trabajo\UPM\Doctorado` → "create a repository" → Publish repository (elige el repositorio
creado o crea uno nuevo desde ahí). GitHub Desktop respeta `.gitignore`, así que no sube
`node_modules`, `.tools`, `.cache`, `dist` ni las capturas de referencia.

**Opción B — arrastrar en la web:** en el repositorio vacío, *uploading an existing file* y arrastra
el **contenido** de la carpeta del proyecto **excepto** `node_modules`, `.tools`, `.cache`, `dist`,
`test-results` y `tests/reference/*.png`. La web acepta como máximo 100 archivos por subida, así
que hazlo por carpetas (por ejemplo `public/`, luego `src/`, `data/`, `scripts/`, `schemas/`,
`tests/`, `docs/`, `.github/` y los archivos sueltos de la raíz: `package.json`,
`package-lock.json`, `README.md`, `.gitignore`, `.htmlvalidate.json`, `playwright.config.mjs`).
Las carpetas que empiezan por punto (`.github`) se pueden arrastrar igual; si el navegador
las oculta, créalas con *Add file → Create new file* escribiendo la ruta
`.github/workflows/deploy.yml` y pega su contenido.

**Opción C — línea de comandos:**
```bash
git init -b main
git add .
git commit -m "Static site"
git remote add origin https://github.com/<usuario>/doctoradoia.git
git push -u origin main
```

## 3. Activar GitHub Pages

1. Repositorio → **Settings → Pages**.
2. *Build and deployment → Source*: **GitHub Actions**.
3. Pestaña **Actions**: el flujo "Deploy to GitHub Pages" se ejecuta solo tras la subida (o pulsa
   *Run workflow*). Al terminar (≈1–2 min) la dirección aparece en Settings → Pages.

La web se construye automáticamente con la ruta `/doctoradoia/` (o el nombre del repositorio):
enlaces, imágenes, búsqueda, 404 y redirecciones funcionan bajo esa ruta.

## 4. Cambiar a un dominio propio (sin tocar código ni JSON)

1. Settings → Pages → **Custom domain**: escribe el dominio (p. ej. `doctoradoia.dia.fi.upm.es`) y guarda.
2. En el DNS del dominio:
   - subdominio (`doctoradoia.dia.fi.upm.es`): registro **CNAME** → `<usuario>.github.io`
   - dominio raíz (`ejemplo.es`): registros **A** → `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153` (y AAAA `2606:50c0:8000::153` … `2606:50c0:8003::153`).
3. Cuando GitHub verifique el DNS, marca **Enforce HTTPS**.
4. Vuelve a ejecutar el flujo (Actions → Deploy to GitHub Pages → *Run workflow*). Se construye en
   la raíz y con el dominio nuevo en canonical, og:url, hreflang y sitemaps.

Con la fuente "GitHub Actions" **no** hace falta archivo `CNAME`.

## 5. Actualizar contenidos

Edita los JSON de `data/` (en local con `npm run dev`, o directamente en la web de GitHub con el
lápiz ✏️) y guarda/sube los cambios a `main`: el flujo valida, construye y publica. Si el JSON
tiene un error, el flujo falla y muestra el archivo y el campo; la web publicada no cambia.

## Diferencias de GitHub Pages respecto a Apache/nginx

- Una sola página 404 (la española) para cualquier ruta inexistente; la 404 en inglés sólo se usa
  con Apache/nginx.
- `/language/en/` redirige a `/language/en/overview/` mediante una página HTML de redirección (no
  un 301 del servidor). El archivo `.htaccess` se ignora.
- La etiqueta `noindex, nofollow` se mantiene como en la web original: quítala de `meta.robots` en
  los JSON de página si quieres que los buscadores indexen la web.
