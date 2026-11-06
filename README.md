<p align="center">
  <img src="src/lib/assets/favicon.svg" alt="Anotapp Logo" width="128" />
</p>

<h1 align="center">Anotapp</h1>

<p align="center">
  Gestor de portapapeles visual y organizado para escritorio construido con Tauri y Svelte.
</p>

<p align="center">
  <a href="https://github.com/PaoloESAN/anotapp/releases/latest/download/Anotapp.exe">
    <img src="https://img.shields.io/badge/Download-Windows-blue?style=for-the-badge" alt="Download Anotapp" />
  </a>
  <a href="https://anotapp-web.vercel.app/lite">
    <img src="https://img.shields.io/badge/Versi%C3%B3n_lite-WEB-orange?style=for-the-badge" alt="Anotapp Lite" />
  </a>
</p>

---

## Descripción

Anotapp es una herramienta que captura automáticamente el historial del portapapeles y los presenta como tarjetas interactivas en un lienzo infinito. Permite organizar extractos de texto, imágenes y archivos de forma visual a través de múltiples mesas de trabajo, conectando tus dispositivos móviles y de escritorio para una experiencia fluida.

Además, cuenta con una **Versión Web Lite** unificada y totalmente responsive, accesible desde cualquier navegador tanto en escritorio como en dispositivos móviles. Esta versión permite interactuar con el lienzo o ver las tarjetas en un feed optimizado para móviles, enviar notas de texto, fotos tomadas con la cámara y archivos adjuntos sincronizados bidireccionalmente en tiempo real mediante un servidor WebSocket de alto rendimiento en Elysia v2.

## Capturas de pantalla

<p align="center">
  <img src="screenshots/screenshot1.png" alt="Vista principal" width="800" />
</p>

## Caracteristicas

- **Captura automática:** Monitorización nativa del portapapeles en tiempo real (texto e imágenes) mediante eventos del sistema operativo, sin polling.
- **Mesas de trabajo (Workspaces):** Organiza tus notas en múltiples áreas de trabajo con navegación fluida y arrastre de tarjetas entre mesas.
- **Vincular dispositivos:** Conecta tu PC y smartphone escaneando un código QR para compartir contenido instantáneamente a través de salas seguras con código de 6 caracteres.
- **Compartir y descargar archivos:** Sube fotos de la cámara o galería y archivos genéricos desde tu teléfono y descárgalos nativamente en tu computadora.
- **Sincronización robusta:** Conexión persistente mediante WebSocket con Elysia v2, funcionando sin interrupciones entre diferentes redes WiFi y datos móviles.
- **Respaldo de datos:** Exporta e importa todas tus mesas de trabajo y notas en un archivo seguro para no perder nunca tu información.
- **Extracción de texto (OCR):** Extrae texto de las imágenes de tu portapapeles con un solo clic.
- **Gestión interactiva:** Tarjetas que se pueden arrastrar, redimensionar y organizar libremente. Menús contextuales globales (clic derecho) para acciones rápidas.
- **Personalización de interfaz:** Nuevo panel de configuración por pestañas. Soporte para temas claro/oscuro, colores primarios, y fondos de lienzo (cuadrícula, puntos, ondas o imágenes personalizadas).
- **Persistencia local:** Todos tus elementos y configuraciones se guardan automáticamente de forma local.

## Tecnologias utilizadas

- [Tauri v2](https://v2.tauri.app/)
- [Svelte 5](https://svelte.dev/)
- [Elysia v2](https://elysiajs.com/) & [Bun](https://bun.sh/) (Servidor de sincronización WebSocket y subida de archivos)
- [TailwindCSS](https://tailwindcss.com/)
- [Shadcn Svelte](https://www.shadcn-svelte.com/)
- [Lucide Icons](https://lucide.dev/)
- [tauri-plugin-clipboard](https://github.com/CrossCopy/tauri-plugin-clipboard)

## Instalacion y Desarrollo

Para ejecutar este proyecto de forma local, **asegúrate de tener instalado Rust y Node.js.**

1. Clonar el repositorio:
```bash
git clone https://github.com/PaoloESAN/Anotapp.git
```

2. Instalar las dependencias (el proyecto usa pnpm):
```bash
pnpm install
```

3. Ejecutar en modo desarrollo:
```bash
pnpm tauri dev
```

## Licencia

Este proyecto esta bajo la Licencia MIT.
