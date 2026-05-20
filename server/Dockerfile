# Imagen base: Node.js 20 slim (más liviana que la estándar)
FROM node:20-slim

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar archivos de dependencias primero (cacheo eficiente)
COPY package*.json ./

# Instalar dependencias en modo producción
RUN npm install --omit=dev

# Copiar el resto del código
COPY . .

# Cloud Run inyecta PORT como variable de entorno
ENV PORT=8080
EXPOSE 8080

# Comando de arranque
CMD ["node", "server.js"]
