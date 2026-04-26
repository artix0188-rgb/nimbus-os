# 📟 Proyecto Nimbus-OS

Nimbus-OS es un sistema operativo táctico e inmersivo construido en Discord.js, diseñado para la gestión y moderación de servidores de simulación de rol (Roleplay) de supervivencia. 

El bot actúa como una PDA (Asistente Personal Digital) para los jugadores, gestionando sus signos vitales, inventario físico, hostilidades en el entorno y sistemas de defunción, manteniendo un registro estricto en canales de auditoría.

## ⚙️ Características Principales

* **🏥 Sistema Biométrico y de Supervivencia:** Monitoreo en tiempo real de HP (Puntos de Vida), Hambre, Sed, Radiación y estados alterados (sangrado, toxicidad). Desgaste automático por tiempo e interacciones.
* **🎒 Gestión Táctica de Suministros:** Inventario limitado por el atributo de 'Fuerza' del operador y la capacidad volumétrica de su mochila. Incluye recarga balística, consumo de objetos y equipamiento modular (cabeza, torso, armas, etc.).
* **⚔️ Motor de Combate (Canvas):** Resoluciones tácticas de enfrentamientos PvE/PvP calculadas algorítmicamente (Destreza, Temple). Generación de un tablero visual dinámico (Tokens) para representar el campo de batalla.
* **🦴 Interacción con el Entorno (Looting):** Posibilidad de descartar (`/tirar`) y buscar (`/rebuscar`) suministros en el sector. Sistema de saqueo de cuerpos para operadores caídos en combate (`/saquear`).
* **🤖 Integración con Tupperbox:** Comandos dedicados (`/registrarproxy`, `/borrarproxy`, `/narracion`) para vincular personajes secundarios (Proxies) al ecosistema de supervivencia de Nimbus-OS.
* **🔒 Auditoría Administrativa:** Registro centralizado y seguro de todas las acciones críticas (creación de perfiles, inyección de items, muertes, alteraciones de stats) en un canal de logs reservado para el Staff.

## 🛠️ Tecnologías Utilizadas

* **Runtime:** Node.js
* **Librería principal:** Discord.js (v14)
* **Generación de Imágenes:** Canvas (API 2D)
* **Almacenamiento:** Sistema de base de datos local basado en JSON (Estructura clave-valor).

## 🚀 Instalación y Despliegue

1. **Clonar el repositorio:**
   \`\`\`bash
   git clone https://github.com/tu-usuario/nimbus-os.git
   cd nimbus-os
   \`\`\`

2. **Instalar dependencias:**
   \`\`\`bash
   npm install
   \`\`\`

3. **Configuración del entorno:**
   Crea un archivo \`.env\` en la raíz del proyecto con las siguientes variables:

   \`\`\`env
   # Credenciales del Bot
   TOKEN=tu_token_de_discord_aqui
   CLIENT_ID=id_de_la_aplicacion
   GUILD_ID=id_del_servidor_de_pruebas (Opcional)

   # Permisos y Moderación
   OWNER_ID=id_del_creador
   AUTHORIZED_IDS=id1,id2,id3
   NARRATOR_ROLES=id_rol_narrador1,id_rol_narrador2

   # Canales del Sistema
   RP_CATEGORY_ID=id_de_categoria_roleplay
   LOG_CHANNEL_ID=id_del_canal_de_auditoria
   DEATHS_CHANNEL_ID=id_del_canal_publico_de_muertes

   # Configuración de Supervivencia
   HUNGER_DECAY=1
   THIRST_DECAY=1.5
   CRITICAL_HEALTH_DRAIN=5
   \`\`\`

4. **Inicialización:**
   \`\`\`bash
   npm start
   \`\`\`

## 📁 Estructura del Código

* `/commands`: Definición y lógica de los comandos Slash (API de Discord).
* `/handlers`: Controladores de interacciones secundarias (Botones, Menús desplegables, Formularios Modales y motor de hambre).
* `/services`: Lógica de negocio núcleo (Inventario, Perfiles, Combate, Muertes, Gestión de base de datos).
* `/utils`: Herramientas misceláneas (Logger centralizado, diccionarios de estados).
* `/data`: Almacenamiento local (Catálogo maestro de items y base de datos de usuarios).

---
*Nimbus-OS — Operando en la Zona. Que la ceniza te acoja.*