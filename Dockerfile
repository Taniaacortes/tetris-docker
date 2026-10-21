# Imagen ligera de Nginx basada en Alpine Linux
FROM nginx:1.27-alpine

LABEL description="Juego Tetris web servido con Nginx"

# Reemplazar la configuración por defecto de Nginx
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos del juego
COPY app/ /usr/share/nginx/html/

EXPOSE 80

# Verifica que el servidor responde
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ > /dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
