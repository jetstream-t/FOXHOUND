const { EmbedBuilder, ChannelType } = require('discord.js');
const db = require('../database');
const jobs = require('../jobs.json');

// Configurações
const CYCLE_MINUTES = 5; // Tempo para receber recompensa
const CHECK_INTERVAL = 60 * 1000; // Checar a cada 1 minuto
const DAILY_VOICE_LIMIT_MINUTES = 240; // 4 horas de ganhos diários
const MIN_MEMBERS = 2; // Mínimo de pessoas na call (incluindo o usuário)

// Anti-Abuse
const MIN_ACCOUNT_AGE_DAYS = 7; // Conta deve ter pelo menos 7 dias
const MIN_WALLET_BALANCE = 500; // Mínimo de dinheiro na carteira/banco
const MESSAGE_ACTIVITY_TIMEOUT = 30 * 60 * 1000; // Deve mandar msg a cada 30 min

// Multiplicadores por quantidade de pessoas
const SOCIAL_BONUS = {
    2: 1.0,  // Base
    3: 1.1,  // +10%
    4: 1.25, // +25%
    5: 1.5   // +50% (Max)
};

// Sessões ativas: userId -> { startTime, channelId, guildId, accumulatedMinutes, sessionEarnings, lastCheck, lastMessageTime }
const activeSessions = new Map();

/**
 * Inicializa o sistema de voz
 * @param {Client} client 
 */
function init(client) {
    console.log('🎙️ [SYSTEM] Sistema de Voz Iniciado');

    // Listener de Estado de Voz
    client.on('voiceStateUpdate', (oldState, newState) => handleVoiceUpdate(client, oldState, newState));

    // Listener de Mensagens (Proxy para "Falar")
    client.on('messageCreate', (message) => {
        if (message.author.bot) return;
        if (activeSessions.has(message.author.id)) {
            const session = activeSessions.get(message.author.id);
            // Atualiza timestamp se a mensagem for no mesmo servidor
            if (session.guildId === message.guildId) {
                session.lastMessageTime = Date.now();
            }
        }
    });

    // Loop de Verificação (A cada minuto)
    setInterval(() => processVoiceRewards(client), CHECK_INTERVAL);
}

/**
 * Lida com mudanças de estado de voz (Entrar, Sair, Mutar, Desmutar, Trocar)
 */
async function handleVoiceUpdate(client, oldState, newState) {
    const userId = newState.member.id;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    // Caso 1: Usuário SAIU da call ou foi para canal AFK
    if (!newChannel || newChannel.id === newState.guild.afkChannelId) {
        if (activeSessions.has(userId)) {
            await endSession(client, userId, oldChannel || newChannel);
        }
        return;
    }

    // Caso 2: Usuário ENTROU ou TROCOU de canal
    // Se já estava em sessão (troca), atualizamos o canal. Se não, iniciamos.
    // Verificamos se está mutado/ensurdecido
    const isMuted = newState.selfMute || newState.serverMute;
    const isDeaf = newState.selfDeaf || newState.serverDeaf;

    if (isMuted || isDeaf) {
        // Se ficou mutado/surdo, pausamos/encerramos a contagem "ativa" dessa sessão
        // Mas mantemos a sessão aberta para quando desmutar? 
        // O requisito diz: "O tempo só deve ser contabilizado enquanto... em condições ativas".
        // Para simplificar: Se mutar, paramos de contar. Se desmutar, volta a contar.
        // A lógica do processVoiceRewards vai checar o estado atual.
        // Apenas garantimos que a sessão existe se ele estiver conectado.
    }
    
    if (!activeSessions.has(userId) && !isMuted && !isDeaf) {
        startSession(userId, newChannel);
    } else if (activeSessions.has(userId)) {
        // Atualiza canal atual
        const session = activeSessions.get(userId);
        session.channelId = newChannel.id;
        
        // Se ficou mutado, podemos remover da sessão ativa ou deixar o loop filtrar.
        // Vamos deixar o loop filtrar para não ficar criando/destruindo sessões a cada mute.
        // Mas se ele sair (case 1), aí sim destroi.
    }
}

function startSession(userId, channel) {
    activeSessions.set(userId, {
        startTime: Date.now(),
        channelId: channel.id,
        guildId: channel.guild.id,
        accumulatedMinutes: 0,
        sessionEarnings: 0,
        lastCheck: Date.now(),
        lastMessageTime: Date.now() // Assume que começou falando ou tem um crédito inicial
    });
}

async function endSession(client, userId, channel) {
    const session = activeSessions.get(userId);
    if (!session) return;

    // Finaliza sessão
    activeSessions.delete(userId);

    // Se ganhou algo, avisa
    if (session.sessionEarnings > 0) {
        try {
            const guild = client.guilds.cache.get(session.guildId);
            if (!guild) return;

            // Busca configuração para saber onde mandar msg
            // Tenta mandar no canal de voz (se for texto também) ou no último canal usado
            // O requisito pede: "ultimo comando de economia usado"
            const guildConfig = await db.getGuildConfig(session.guildId);
            let targetChannelId = guildConfig?.lastCommandChannelId || guildConfig?.economyLogChannel;
            
            // Se não tiver config, tenta o canal de sistema do servidor ou o próprio canal de voz se permitir texto
            if (!targetChannelId && channel && channel.type === ChannelType.GuildVoice) {
               // Canais de voz hoje em dia têm chat de texto, mas o ID é o mesmo.
               targetChannelId = channel.id; 
            }

            if (targetChannelId) {
                const targetChannel = guild.channels.cache.get(targetChannelId);
                if (targetChannel && targetChannel.isTextBased()) {
                    await targetChannel.send(`🎙️ <@${userId}> encerrou sua chamada. Ganho total: **${session.sessionEarnings.toLocaleString()} Foxies**.`);
                }
            }
        } catch (err) {
            console.error(`Erro ao finalizar sessão de voz para ${userId}:`, err);
        }
    }
}

/**
 * Loop principal de verificação e recompensas
 */
async function processVoiceRewards(client) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    for (const [userId, session] of activeSessions) {
        try {
            const guild = client.guilds.cache.get(session.guildId);
            if (!guild) {
                activeSessions.delete(userId);
                continue;
            }

            const member = guild.members.cache.get(userId);
            if (!member || !member.voice.channel) {
                // Usuário não está mais em voz (falha no evento de saida?)
                await endSession(client, userId, null);
                continue;
            }

            const channel = member.voice.channel;
            
            // Verificações de Elegibilidade
            const isMuted = member.voice.selfMute || member.voice.serverMute;
            const isDeaf = member.voice.selfDeaf || member.voice.serverDeaf;
            const isAfk = channel.id === guild.afkChannelId;
            const memberCount = channel.members.filter(m => !m.user.bot).size; // Ignora bots
            
            // Anti-Abuse: Tempo sem falar (digitar)
            const timeSinceLastMessage = Date.now() - (session.lastMessageTime || 0);
            const isSilentTooLong = timeSinceLastMessage > MESSAGE_ACTIVITY_TIMEOUT;

            if (isMuted || isDeaf || isAfk || memberCount < MIN_MEMBERS || isSilentTooLong) {
                // Não conta tempo, mas mantém sessão aberta (pode ser momentâneo)
                // Se estiver muito tempo silêncio, talvez valha avisar?
                continue;
            }

            // Anti-Abuse: Idade da Conta
            const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS) continue;

            // Anti-Abuse: Saldo Mínimo (Necessário ler DB, mas para otimizar, fazemos na hora do pagamento ou aqui)
            // Como lemos DB no pagamento, vamos deixar acumular tempo mas checar saldo no pagamento para economizar reads.
            // Mas o usuário pode ficar confuso se não ganhar nada.
            // Vamos checar no pagamento e se falhar, zerar o tempo acumulado sem pagar.

            // Conta +1 minuto
            session.accumulatedMinutes++;

            // Salva estatísticas no banco (minutos totais)
            // Para evitar spam de DB, poderíamos salvar só no final, mas o requisito pede segurança.
            // Vamos salvar no ciclo de pagamento.

            // Checa Ciclo de Pagamento (5 minutos)
            if (session.accumulatedMinutes >= CYCLE_MINUTES) {
                await payReward(client, userId, member, memberCount, today);
                session.accumulatedMinutes = 0; // Reseta ciclo
            }

        } catch (err) {
            console.error(`Erro ao processar voz para ${userId}:`, err);
            activeSessions.delete(userId);
        }
    }
}

async function payReward(client, userId, member, memberCount, today) {
    const user = await db.getUser(userId);

    // Reset diário se mudou o dia
    if (user.lastVoiceDate !== today) {
        await db.updateUser(userId, { 
            dailyVoiceTime: 0, 
            voiceEarningsToday: 0, 
            lastVoiceDate: today 
        });
        user.dailyVoiceTime = 0;
        user.voiceEarningsToday = 0;
    }

    // Verifica limite diário
    if (user.dailyVoiceTime >= DAILY_VOICE_LIMIT_MINUTES) {
        return; 
    }

    // Anti-Abuse: Saldo Mínimo
    const totalBalance = (user.wallet || 0) + (user.bank || 0);
    if (totalBalance < MIN_WALLET_BALANCE) {
        return; // Pobre demais para farmar (evita alts zeradas)
    }

    // Calcula Salário Base
    const job = jobs.find(j => j.id === user.jobId) || jobs[0];
    const avgSalary = (job.salary[0] + job.salary[1]) / 2;
    let baseReward = avgSalary / 6;

    // Diminishing Returns: Rende menos a cada hora
    // Hora 1: 100%, Hora 2: 80%, Hora 3: 60%, Hora 4: 40%
    const hoursPlayed = Math.floor((user.dailyVoiceTime || 0) / 60);
    const diminishingMultiplier = Math.max(0.2, 1.0 - (hoursPlayed * 0.2)); // Minimo 20%
    
    baseReward = baseReward * diminishingMultiplier;

    // Aplica Bônus Social
    // Limita contagem de pessoas a 5+
    const countForBonus = Math.min(memberCount, 5);
    const multiplier = SOCIAL_BONUS[countForBonus] || 1.0;
    
    const finalReward = Math.floor(baseReward * multiplier);

    if (finalReward <= 0) return;

    // Atualiza Banco de Dados
    await db.updateUser(userId, {
        wallet: user.wallet + finalReward,
        dailyVoiceTime: (user.dailyVoiceTime || 0) + CYCLE_MINUTES,
        totalVoiceTime: (user.totalVoiceTime || 0) + CYCLE_MINUTES,
        voiceEarningsToday: (user.voiceEarningsToday || 0) + finalReward
    });

    // Atualiza sessão local
    const session = activeSessions.get(userId);
    if (session) {
        session.sessionEarnings += finalReward;
    }

    // Notificação Curta
    // "Sempre que o usuário receber a recompensa, o bot pode enviar uma mensagem curta"
    // Idealmente ephemeral para não spammar, mas ephemeral precisa de interaction.
    // Vamos mandar no canal de texto do canal de voz se houver, ou no lastCommandChannel.
    // Para não spammar DEMAIS, talvez mandar apenas um "tick" ou reação? 
    // O usuário pediu "mensagem curta informando o ganho".
    
    // Vamos tentar mandar no canal de texto vinculado ao canal de voz (chat de voz)
    try {
        const voiceChannel = member.voice.channel;
        if (voiceChannel) {
             // Tenta enviar no chat do canal de voz (feature nova do Discord)
             // voiceChannel.send é possível se for GuildVoice
             await voiceChannel.send({ 
                 content: `💰 <@${userId}> recebeu **${finalReward} Foxies** por atividade em voz! (${memberCount} pessoas conectadas)`,
                 allowedMentions: { parse: [] } // Não pinda o usuário pra não ser chato
             });
        }
    } catch (e) {
        // Se falhar (permissão ou canal antigo), ignora silenciosamente para não quebrar o loop
    }
}

module.exports = { init };
