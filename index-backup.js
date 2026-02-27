require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ===============================
// ANTI-CRASH OTIMIZADO
// ===============================
process.on('unhandledRejection', (reason, promise) => {
  console.error('🛑 [ANTI-CRASH] Rejeição não tratada:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error('🛑 [ANTI-CRASH] Exceção não capturada:', err);
});

// Sinais de graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 [SHUTDOWN] Recebido SIGTERM, encerrando...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 [SHUTDOWN] Recebido SIGINT, encerrando...');
  process.exit(0);
});

// Monitoramento de memória leve (a cada 2 minutos)
setInterval(() => {
  const memUsage = process.memoryUsage();
  const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  
  if (usedMB > 400) { // Reduzido de 500MB
    console.warn(`⚠️ [MEMORY] Alto uso de memória: ${usedMB}MB`);
    
    if (usedMB > 600 && global.gc) {
      global.gc();
    }
  }
}, 120000); // Aumentado de 30s para 2min

// ===============================
// AUTO-INSTALAÇÃO
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
}

// Deploy automático otimizado
try {
  const isHosting = process.env.P_SERVER_UUID || process.env.PORT || process.env.NODE_ENV === 'production';
  
  if (isHosting) {
    console.log('🚀 [MONKEYBYTES] Ambiente de hospedagem detectado. Deploy Global...');
    require('./deploy-commands-global.js');
  } else {
    console.log('🧪 [LOCAL] Ambiente de desenvolvimento. Deploy Local...');
    require('./deploy-commands.js');
  }
} catch (err) {
  console.error('❌ Erro no auto-deploy:', err);
}

const { Client, GatewayIntentBits, Collection, Events, Partials } = require('discord.js');
const express = require('express');
const db = require('./database');

const app = express();
app.get('/', (req, res) => res.send('Bot online!'));

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`✅ Servidor web rodando na porta ${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Porta ${port} em uso, tentando ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('❌ Erro ao iniciar servidor web:', err);
    }
  });
}

const PORT = process.env.PORT || 3000;
startServer(Number(PORT));

// Handlers
const interactionHandler = require('./handlers/interactionHandler');
const { handleMemberAdd, handleMemberRemove } = require('./handlers/memberHandler');
const { handlePartnership } = require('./handlers/partnershipHandler');

const client = new Client({
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
});

// Cache para sistemas opcionais
let petSystem, voiceSystem, activeStateManager;

// Carregar sistemas com tratamento de erro
try {
  petSystem = require('./systems/petSystem');
} catch (err) {
  console.warn('⚠️ [SYSTEM] petSystem não disponível:', err.message);
}

try {
  voiceSystem = require('./systems/voiceSystem');
} catch (err) {
  console.warn('⚠️ [SYSTEM] voiceSystem não disponível:', err.message);
}

try {
  activeStateManager = require('./systems/activeStateManager-improved');
  console.log('✅ [SYSTEM] ActiveStateManager melhorado carregado');
} catch (err) {
  try {
    activeStateManager = require('./systems/activeStateManager');
    console.log('⚠️ [SYSTEM] ActiveStateManager original carregado');
  } catch (err2) {
    console.warn('⚠️ [SYSTEM] ActiveStateManager não disponível:', err2.message);
  }
}

client.commands = new Collection();

// Cache para comandos carregados
const commandCache = new Map();

// Carregar comandos com cache
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const command = require(`./commands/${file}`);
    if ('data' in command) {
      client.commands.set(command.data.name, command);
      commandCache.set(file, command);
    } else if ('executePrefix' in command) {
      client.commands.set(file.slice(0, -3), command);
      commandCache.set(file, command);
    }
  } catch (error) {
    console.error(`❌ Erro ao carregar comando ${file}:`, error);
  }
}

console.log(`📚 [COMMANDS] ${client.commands.size} comandos carregados`);

// Handler de mensagens otimizado
const messageCache = new Map();
const MESSAGE_COOLDOWN = 1000; // 1 segundo

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Verificar permissões básicas
  if (message.guild && !message.channel.permissionsFor(message.guild.members.me).has('SendMessages')) {
    return;
  }

  // Rate limiting para processamento de mensagens
  const userId = message.author.id;
  const now = Date.now();
  
  if (messageCache.has(userId)) {
    const lastTime = messageCache.get(userId);
    if (now - lastTime < MESSAGE_COOLDOWN) {
      return; // Ignorar mensagens muito rápidas
    }
  }
  
  messageCache.set(userId, now);
  
  // Limpar cache antigo
  setTimeout(() => messageCache.delete(userId), 5000);

  const prefix = 'f!';
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  try {
    const command = client.commands.get(commandName);
    if (!command) {
      try {
        await message.reply(`Este comando só funciona via slash (/). Tente usar \`/${commandName}\`.`);
      } catch (err) {
        console.warn(`⚠️ Sem permissão para responder ao comando ${commandName}: ${err.message}`);
      }
      return;
    }

    if (command.executePrefix) {
      await command.executePrefix(message, args);
    }
  } catch (error) {
    console.error(`❌ Erro ao executar prefixo ${commandName}:`, error);
    try {
      await message.reply('Ocorreu um erro ao executar este comando.');
    } catch (replyError) {
      console.error('❌ Falha ao enviar mensagem de erro:', replyError.message);
    }
  }
});

// Handler de parcerias otimizado
const partnershipCache = new Map();
const PARTNERSHIP_COOLDOWN = 5000; // 5 segundos

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const guildId = message.guild?.id;
  if (!guildId) return;
  
  const now = Date.now();
  const lastCheck = partnershipCache.get(guildId) || 0;
  
  if (now - lastCheck < PARTNERSHIP_COOLDOWN) {
    return; // Limitar verificações no mesmo servidor
  }
  
  partnershipCache.set(guildId, now);
  
  // Limpar cache antigo
  setTimeout(() => partnershipCache.delete(guildId), 30000);
  
  try {
    await handlePartnership(message);
  } catch (error) {
    console.error('❌ Erro no handler de parcerias:', error);
  }
});

// Cache para eventos de membro
const memberCache = new Map();
const MEMBER_COOLDOWN = 5000; // 5 segundos

client.on(Events.GuildMemberAdd, async member => {
  const cacheKey = `${member.guild.id}-${member.id}`;
  const now = Date.now();
  
  if (memberCache.has(cacheKey)) return;
  
  memberCache.set(cacheKey, now);
  setTimeout(() => memberCache.delete(cacheKey), MEMBER_COOLDOWN);

  try {
    await handleMemberAdd(member);
  } catch (error) {
    console.error('Erro ao processar GuildMemberAdd:', error);
  }
});

client.on(Events.GuildMemberRemove, async member => {
  const cacheKey = `${member.guild.id}-${member.id}`;
  const now = Date.now();
  
  if (memberCache.has(cacheKey)) return;
  
  memberCache.set(cacheKey, now);
  setTimeout(() => memberCache.delete(cacheKey), MEMBER_COOLDOWN);

  try {
    await handleMemberRemove(member);
  } catch (error) {
    console.error('Erro ao processar GuildMemberRemove:', error);
  }
});

// Handler de interações otimizado
client.on(Events.InteractionCreate, async interaction => {
  try {
    await interactionHandler(interaction);
  } catch (error) {
    console.error('❌ Erro no handler de interação:', error);
    
    try {
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ 
          content: '❌ Ocorreu um erro ao processar esta interação.', 
          ephemeral: true 
        });
      }
    } catch (replyError) {
      console.error('❌ Não foi possível responder sobre o erro:', replyError.message);
    }
  }
});

// Cache para status
let statusCache = {
  lastUpdate: 0,
  totalGuilds: 0,
  totalUsers: 0,
  totalCommands: 0,
  customStatus: null,
  lastStatusCheck: 0
};

// Evento ready otimizado
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot online como ${client.user.tag}`);

  // Iniciar serviços de background
  if (petSystem) petSystem.startPetScheduler(client);
  if (voiceSystem) voiceSystem.init(client);
  
  // Inicializar ActiveStateManager com timeout
  if (activeStateManager) {
    try {
      console.log('🔄 [INIT] Inicializando ActiveStateManager...');
      const initPromise = activeStateManager.initialize();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 15000) // Reduzido para 15s
      );
      
      await Promise.race([initPromise, timeoutPromise]);
      console.log('✅ [INIT] ActiveStateManager inicializado');
      
      // Limpeza automática otimizada (a cada 10 minutos)
      setInterval(async () => {
        try {
          await activeStateManager.cleanupExpired();
        } catch (err) {
          console.error('❌ Erro na limpeza:', err);
        }
      }, 10 * 60 * 1000);
    } catch (err) {
      console.error('❌ Erro na inicialização do ActiveStateManager:', err);
    }
  }
  
  // Carregar scheduler
require('./scheduler')(client);
  
  // Sistema de status otimizado
  const { ActivityType } = require('discord.js');
  let statusIndex = 0;

  const updateStatus = async () => {
    try {
      const now = Date.now();
      
      // Atualizar cache a cada 5 minutos em vez de toda vez
      if (now - statusCache.lastUpdate > 5 * 60 * 1000) {
        statusCache.totalGuilds = client.guilds.cache.size;
        statusCache.totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        
        // Buscar comandos só se necessário
        if (now - statusCache.lastStatusCheck > 10 * 60 * 1000) {
          try {
            statusCache.totalCommands = await db.getGlobalCommandCount();
            statusCache.customStatus = await db.getGlobalConfig('custom_bot_status');
            statusCache.lastStatusCheck = now;
          } catch (err) {
            console.warn('⚠️ Erro ao buscar status do banco:', err.message);
          }
        }
        
        statusCache.lastUpdate = now;
      }

      if (statusCache.customStatus) {
        const formattedStatus = statusCache.customStatus
          .replace(/{users}/g, statusCache.totalUsers)
          .replace(/{guilds}/g, statusCache.totalGuilds)
          .replace(/{commands}/g, statusCache.totalCommands);

        client.user.setPresence({
          activities: [{ name: formattedStatus, type: ActivityType.Custom }],
          status: 'online',
        });
        return;
      }

      const activities = [
        { name: `Trabalhando em ${statusCache.totalGuilds} servers`, type: ActivityType.Playing }, 
        { name: `Total de ${statusCache.totalUsers} usuários`, type: ActivityType.Watching },
        { name: `f!ajuda`, type: ActivityType.Playing },
        { name: 'FoxHound Bot', type: ActivityType.Playing }
      ];
      
      const activity = activities[statusIndex % activities.length];
      client.user.setActivity(activity);
      statusIndex++;
    } catch (err) {
      console.error('❌ Erro ao atualizar status:', err);
    }
  };

  // Status update a cada 2 minutos (aumentado de 15 segundos)
  updateStatus();
  setInterval(updateStatus, 2 * 60 * 1000);
  
  // Detecção de múltiplas instâncias (leve)
  const now = Date.now().toString();
  try {
    await db.saveGlobalConfig('last_instance_start', now);
    
    setTimeout(async () => {
      try {
        const lastStart = await db.getGlobalConfig('last_instance_start');
        if (lastStart && lastStart !== now) {
          console.warn('⚠️ [INSTANCE] Detectada múltiplas instâncias! Isso pode causar problemas.');
        }
      } catch (err) {
        console.warn('⚠️ Erro ao verificar múltiplas instâncias:', err);
      }
    }, 5000);
  } catch (err) {
    console.warn('⚠️ Erro ao salvar timestamp de instância:', err);
  }
});

// Eventos leves
client.on(Events.GuildCreate, async guild => {
  try {
    console.log(`🌟 [GUILD] Entrou no servidor: ${guild.name} (ID: ${guild.id})`);
  } catch (err) {
    console.error('❌ Erro ao processar GuildCreate:', err);
  }
});

client.on(Events.GuildDelete, async guild => {
  try {
    console.log(`👋 [GUILD] Saiu do servidor: ${guild.name} (ID: ${guild.id})`);
  } catch (err) {
    console.error('❌ Erro ao processar GuildDelete:', err);
  }
});

// Login com tratamento robusto
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ [LOGIN] Falha ao iniciar o bot:', err.message);
  
  if (err.message.includes('Invalid token')) {
    console.error('🚨 [LOGIN] Token do Discord inválido! Verifique o DISCORD_TOKEN no .env');
  } else if (err.message.includes('Privileged intents')) {
    console.error('🚨 [LOGIN] Intents privilegiados não configurados!');
  } else if (err.message.includes('Gateway')) {
    console.error('🚨 [LOGIN] Erro de conexão com o Gateway!');
  }
  
  process.exit(1);
});
