# Neon Tetris con Docker

Aplicación web del juego **Tetris** (HTML5 Canvas + CSS + JavaScript) servida con **Nginx** dentro de un contenedor **Docker**, orquestado con **Docker Compose** y desarrollado en **Visual Studio Code**.

## Estructura

```
TetrisconDocker/
├── app/                  # Código del juego
│   ├── index.html
│   ├── css/styles.css
│   └── js/tetris.js
├── nginx/default.conf    # Configuración del servidor web
├── Dockerfile            # Construcción de la imagen
├── docker-compose.yml    # Orquestación del servicio
├── .dockerignore
└── .vscode/              # Tareas y extensiones recomendadas
```

## Cómo ejecutar

1. Abrir la carpeta en VS Code y tener **Docker Desktop** encendido.
2. En la terminal:

   ```bash
   docker compose up -d --build
   ```

   (o en VS Code: `Ctrl+Shift+B` → *Docker: levantar Tetris*)
3. Abrir <http://localhost:8080>
4. Para detener: `docker compose down`

## Controles

| Tecla | Acción |
|---|---|
| ← → | Mover |
| ↑ / X | Rotar |
| Z | Rotar inverso |
| ↓ | Bajada suave |
| Espacio | Caída instantánea |
| C | Guardar pieza |
| P / Esc | Pausa |
| M | Activar/desactivar sonido |

## Personalización

- Tema **neón / synthwave** con rejilla animada de fondo y título animado.
- Bloques con degradado, brillo y resplandor.
- **Pieza fantasma**, **pieza guardada** y **3 siguientes piezas**.
- Animación de destello y **partículas** al eliminar líneas; vibración al soltar.
- Mensajes flotantes (¡DOBLE!, ¡TETRIS!, NIVEL N).
- **Efectos de sonido** generados con Web Audio API.
- **Récord** guardado en el navegador.
- Niveles con velocidad creciente y sistema "bolsa de 7".
- Diseño **responsivo** con botones táctiles para celular.
