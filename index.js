require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// ===============================
// MEMORY MONITORING - Monitoramento de memória
// ===============================
const MAX_MEMORY_MB = 800; // Limite seguro (800MB de 1GB disponível)
let memoryCheckInterval;

function getMemoryUsageMB() {
  const used = process.memoryUsage();
  return {
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    rss: Math.round(used.rss / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024)
  };
}

function startMemoryMonitor() {
  console.log('📊 [MEMORY] Monitor de memória iniciado.');
  
  // Verifica memória a cada 30 segundos
  memoryCheckInterval = setInterval(() => {
    const mem = getMemoryUsageMB();
    console.log(`📊 [MEMORY] Heap: ${mem.heapUsed}MB/${mem.heapTotal}MB | RSS: ${mem.rss}MB | Ext: ${mem.external}MB`);
    
    // Se memória heap exceder o limite, força garbage collection e alerta
    if (mem.heapUsed > MAX_MEMORY_MB) {
      console.warn(`⚠️ [MEMORY] Alerta: Uso de memória alto (${mem.heapUsed}MB). Forçando coleta de lixo...`);
      
      // Força garbage collection se disponível (flag --expose-gc)
      if (global.gc) {
        global.gc();
        console.log('🧹 [MEMORY] Garbage collection executado.');
      }
      
      // Se ainda estiver muito alto após gc, tenta limpar caches do Discord.js
      // Nota: Isso pode afetar a performance temporariamente
    }
  }, 30000);
}

function stopMemoryMonitor() {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
  }
}

// ===============================
// ANTI-CRASH - Impede o bot de cair
// ===============================
process.on('unhandledRejection', (reason, promise) => {
  console.error('🛑 [ANTI-CRASH] Rejeição não tratada:', reason);
  const mem = getMemoryUsageMB();
  console.error(`📊 [MEMORY] Memória no momento do erro: ${mem.heapUsed}MB`);
});

process.on('uncaughtException', (err, origin) => {
  console.error('🛑 [ANTI-CRASH] Exceção não capturada:', err);
  const mem = getMemoryUsageMB();
  console.error(`📊 [MEMORY] Memória no momento do erro: ${mem.heapUsed}MB`);
  
  // Se for erro crítico de memória, sai com código de erro para permitir restart
  if (err.message && err.message.includes('JavaScript heap out of memory')) {
    console.error('💀 [CRITICAL] Memória esgotada! Encerrando processo...');
    stopMemoryMonitor();
    process.exit(1);
  }
});

// Inicia monitoramento de memória
startMemoryMonitor();

// ===============================
// AUTO-INSTALAÇÃO E AUTO-DEPLOY
// ===============================
if (!fs.existsSync('./node_modules')) {
  console.log('📦 Node modules não encontrados. Instalando dependências...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependências instaladas com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao instalar dependências:', err);
  }
}

// Alerta sobre envio de banco de dados
if (fs.existsSync('./database.sqlite')) {
  console.warn('⚠️ [AVISO] Arquivo "database.sqlite" detectado na raiz!');
  console.warn('⚠️ Se você enviou este arquivo do seu PC, você pode ter sobrescrito os dados da hospedagem.');
  console.warn('⚠️ Recomenda-se usar a pasta "data/" para o banco de dados e ignorá-la no upload.');
}

// Executar deploy de comandos automaticamente ao iniciar
try {
  // Detecta se está na hospedagem MonkeyBytes (Pterodactyl usa P_SERVER_UUID)
  const isHosting = process.env.P_SERVER_UUID || process.env.PORT || process.env.NODE_ENV === 'production';
  
  if (isHosting) {
    console.log('🚀 [MONKEYBYTES] Detectado ambiente de hospedagem. Iniciando Deploy Global...');
    require('./deploy-commands-global.js');
  } else {
    console.log('🧪 [LOCAL] Detectado ambiente de desenvolvimento. Iniciando Deploy Local...');
    require('./deploy-commands.js');
  }
} catch (err) {
  console.error('❌ Erro no auto-deploy:', err);
}

const { Client, GatewayIntentBits, Collection, Events, Partials, Options } = require('discord.js');
const express = require('express');
const db = require('./database'); // Importar banco de dados

// ===============================
// CONFIGURAÇÕES DE CACHE (Variáveis de Ambiente)
// ===============================
const CACHE_SIZES = {
  members: parseInt(process.env.CACHE_MEMBERS) || 200,
  messages: parseInt(process.env.CACHE_MESSAGES) || 50,
  channels: parseInt(process.env.CACHE_CHANNELS) || 100,
  default: parseInt(process.env.CACHE_DEFAULT) || 100
};

console.log(`⚙️ [CACHE] Configurações: Membros=${CACHE_SIZES.members}, Mensagens=${CACHE_SIZES.messages}, Canais=${CACHE_SIZES.channels}`);

const app = express();
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('/', (req, res) => res.send('Bot online!'));
function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`✅ Servidor web rodando na porta ${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  A porta ${port} está em uso, tentando a porta ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('❌ Erro ao iniciar o servidor web:', err);
    }
  });
}

const PORT = process.env.PORT || 3000;
startServer(Number(PORT));

// Handlers
const interactionHandler = require('./handlers/interactionHandler');
const { handleMemberAdd, handleMemberRemove } = require('./handlers/memberHandler');
const { handlePartnership } = require('./handlers/partnershipHandler');

// Variável client declarada aqui para uso nos event handlers
let client;

client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
  // Limites de cache configuráveis via variáveis de ambiente
  makeCache: Options.cacheWithLimits({
    GuildMemberManager: { maxSize: CACHE_SIZES.members },
    MessageManager: { maxSize: CACHE_SIZES.messages },
    ChannelManager: { maxSize: CACHE_SIZES.channels },
    UserManager: { maxSize: CACHE_SIZES.default },
    PresenceManager: { maxSize: CACHE_SIZES.default }
  }),
  sweepers: {
    messages: {
      interval: 300,
      lifetime: 600,
    },
    users: {
      interval: 600,
      filter: () => user => user.bot && user.id !== client.user.id,
    },
  },
});

// Importar sistema de Pets
let petSystem;
try {
  petSystem = require('./systems/petSystem');
} catch (err) {
  console.error('❌ Falha ao carregar petSystem:', err);
}

// Importar sistema de Voz
let voiceSystem;
try {
  voiceSystem = require('./systems/voiceSystem');
} catch (err) {
  console.error('❌ Falha ao carregar voiceSystem:', err);
}

client.commands = new Collection();

// ===============================
// Carregar comandos recursivamente
// ===============================
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder);
  const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = path.join(folderPath, file);
    try {
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        // Adicionar categoria ao comando
        command.category = folder;
        client.commands.set(command.data.name, command);
        console.log(`✅ Comando carregado: ${command.data.name} [${folder}]`);
      } else {
        console.warn(`⚠️ [AVISO] O comando em ${filePath} está faltando a propriedade "data" ou "execute".`);
      }
    } catch (err) {
      console.error(`❌ [ERRO] Falha ao carregar comando ${file}:`, err);
    }
  }
}

// Carregar scheduler
require('./scheduler')(client);

client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);

  // Iniciar serviços de background
  if (petSystem) petSystem.startPetScheduler(client);
  if (voiceSystem) voiceSystem.init(client);
  
  // Rotação de Status e Atividades
  const { ActivityType } = require('discord.js');

  let statusIndex = 0;

  const updateStatus = async () => {
    // Calcular totais
    const totalGuilds = client.guilds.cache.size;
    const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const totalCommands = await db.getGlobalCommandCount();

    // Verifica se há um status personalizado definido pelo God Mode
    const customStatus = await db.getGlobalConfig('custom_bot_status');

    if (customStatus) {
        // Substituir variáveis
        const formattedStatus = customStatus
            .replace(/{users}/g, totalUsers)
            .replace(/{guilds}/g, totalGuilds)
            .replace(/{commands}/g, totalCommands);

        client.user.setPresence({
            activities: [{ name: formattedStatus, type: ActivityType.Custom }],
            status: 'online',
        });
        return;
    }

    const activities = [
      { name: `Trabalhando em ${totalGuilds} servers`, type: ActivityType.Playing }, 
      { name: `Total de ${totalUsers} usuários`, type: ActivityType.Watching },
      { name: `Já executei ${totalCommands} comandos!`, type: ActivityType.Custom } // Usando Custom para diferenciar
    ];

    const currentActivity = activities[statusIndex % activities.length];

    // ActivityType.Custom não é suportado diretamente em setPresence para bots da mesma forma que usuários
    // Vamos usar Playing ou Watching para garantir compatibilidade
    const type = currentActivity.type === ActivityType.Custom ? ActivityType.Playing : currentActivity.type;

    client.user.setPresence({
      activities: [{ name: currentActivity.name, type: type }],
      status: 'online',
    });

    statusIndex++;
  };

  // Executar imediatamente e depois a cada 15 segundos
  updateStatus();
  setInterval(updateStatus, 15 * 1000);
  
  // Detecção de múltiplas instâncias
  const now = Date.now().toString();
  try {
    await db.saveGlobalConfig('last_instance_start', now);
    
    setTimeout(async () => {
      try {
        const lastStart = await db.getGlobalConfig('last_instance_start');
        if (lastStart && lastStart !== now) {
          console.error('🚨 [ALERTA] Múltiplas instâncias detectadas! Outra instância do bot foi iniciada após esta.');
          console.error('🚨 Isso causará erros "Unknown Interaction" e duplicação de eventos.');
          console.error('🚨 Recomendo reiniciar o bot no painel da hospedagem.');
        }
      } catch (err) {
        // Ignorar erro se o DB não estiver conectado
      }
    }, 10000);
  } catch (err) {
    console.warn('⚠️ Não foi possível verificar múltiplas instâncias (Banco de dados desconectado).');
  }
});

// Debugger de Rate Limit
client.on('debug', info => {
  if (info.includes('429')) {
    console.warn('⚠️ [DEBUG] Possível Rate Limit detectado:', info);
  }
});

client.rest.on('rateLimited', (info) => {
  console.warn(`🛑 [RATE LIMIT] Bloqueado!
    - Tempo: ${info.timeout}ms
    - Limite: ${info.limit}
    - Rota: ${info.route}
    - Global: ${info.global}`);
});

// ===============================
// Eventos
// ===============================

// Interações (Slash, Buttons, Menus, Modals, Autocomplete)
client.on(Events.InteractionCreate, async interaction => {
  await interactionHandler(interaction);
});

// Importar sistema de Missões
const missionSystem = require('./systems/missionSystem');

// Comandos de Prefixo
client.on(Events.MessageCreate, async message => {
  // Ignora bots
  if (message.author.bot) return;

  // Sistema de Parcerias (Verifica toda mensagem)
  try {
      await handlePartnership(message);
  } catch (err) {
      console.error('Erro no handler de parcerias:', err);
  }
  
  // Atualiza missão de mensagens
  // Randomly update to avoid database spam? No, user needs accurate count.
  // We can use a cache or just update every message. MongoDB handles it fine.
  // But to be safe, maybe only update if not a command?
  // The user requirement is "Give 50 messages today". Commands count? Usually yes.
  if (message.guild) {
      missionSystem.checkMission(message.author.id, 'message', 1, message).catch(err => {});
  }
  
  const prefix = process.env.PREFIX || 'f!';
  
  // Log de debug para ver se o bot está recebendo QUALQUER mensagem
  // console.log(`[DEBUG] Mensagem recebida: "${message.content}"`);

  if (!message.content.startsWith(prefix)) return;

  console.log(`💬 Comando de prefixo detectado: ${message.content}`);

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  
  if (!command) {
    console.log(`⚠️ Comando "${commandName}" não encontrado.`);
    return;
  }

  try {
    if (command.executePrefix) {
      // Incrementa contador global de comandos
      await db.incrementGlobalCommandCount();
      
      console.log(`🚀 Executando prefixo para: ${commandName}`);
      await command.executePrefix(message, args);
    } else {
      console.log(`ℹ️ Comando "${commandName}" existe mas não tem executePrefix.`);
      // Tentar responder, mas capturar erro se não tiver permissão
      try {
        await message.reply(`Este comando só funciona via slash (/). Tente usar \`/${commandName}\`.`);
      } catch (err) {
        console.warn(`⚠️ Não foi possível responder ao comando ${commandName} (sem permissão?): ${err.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ Erro ao executar prefixo ${commandName}:`, error);
    // Tentar avisar o usuário sobre o erro
    try {
        await message.reply('Ocorreu um erro ao executar este comando.');
    } catch (replyError) {
        console.error('❌ Falha ao enviar mensagem de erro:', replyError.message);
    }
  }
});

// Entrada de Membro
const welcomeCache = new Set();
client.on(Events.GuildMemberAdd, async member => {
  // Evitar duplicação em curto intervalo (5 segundos)
  const cacheKey = `${member.guild.id}-${member.id}`;
  if (welcomeCache.has(cacheKey)) return;
  welcomeCache.add(cacheKey);
  setTimeout(() => welcomeCache.delete(cacheKey), 5000);

  try {
    await handleMemberAdd(member);
  } catch (error) {
    console.error('Erro ao processar GuildMemberAdd:', error);
  }
});

// Saída de Membro
const leaveCache = new Set();
client.on(Events.GuildMemberRemove, async member => {
  // Evitar duplicação em curto intervalo (5 segundos)
  const cacheKey = `${member.guild.id}-${member.id}`;
  if (leaveCache.has(cacheKey)) return;
  leaveCache.add(cacheKey);
  setTimeout(() => leaveCache.delete(cacheKey), 5000);

  try {
    await handleMemberRemove(member);
  } catch (error) {
    console.error('Erro ao processar GuildMemberRemove:', error);
  }
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ [LOGIN] Falha ao iniciar o bot:', err.message);
  console.error('⚠️ Verifique se o DISCORD_TOKEN está correto no arquivo .env ou no painel da hospedagem.');
});

// ===============================
// GRACEFUL SHutdown - Encerramento graceful (deve ser após client ser definido)
// ===============================
process.on('SIGINT', async () => {
    console.log('📴 [SHUTDOWN] Recebido SIGINT, encerrando graciosamente...');
    stopMemoryMonitor();
    
    if (mongoose.connection.readyState === 1) {
        console.log('🔌 [SHUTDOWN] Fechando conexão com MongoDB...');
        await mongoose.connection.close();
    }
    
    console.log('👋 [SHUTDOWN] Encerrando cliente Discord...');
    if (client && client.isReady()) {
        await client.destroy();
    }
    
    console.log('✅ [SHUTDOWN] Processo encerrado.');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('📴 [SHUTDOWN] Recebido SIGTERM, encerrando graciosamente...');
    stopMemoryMonitor();
    
    if (mongoose.connection.readyState === 1) {
        console.log('🔌 [SHUTDOWN] Fechando conexão com MongoDB...');
        await mongoose.connection.close();
    }
    
    console.log('👋 [SHUTDOWN] Encerrando cliente Discord...');
    if (client && client.isReady()) {
        await client.destroy();
    }
    
    console.log('✅ [SHUTDOWN] Processo encerrado.');
    process.exit(0);
});
