const db = require('../database');
const colors = require('../colors.json');
const { EmbedBuilder } = require('discord.js');

const INACTIVITY_LIMIT_DAYS = 60;
const WARNING_DAYS_BEFORE = 3;

// Conversão para milissegundos
const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVITY_LIMIT_MS = INACTIVITY_LIMIT_DAYS * DAY_MS;
const WARNING_THRESHOLD_MS = (INACTIVITY_LIMIT_DAYS - WARNING_DAYS_BEFORE) * DAY_MS;

async function checkInactivity(client) {
    console.log('💤 [INACTIVITY] Verificando usuários inativos...');
    const now = Date.now();
    
    // Busca usuários que têm saldo > 0 (wallet ou bank) e atividade antiga
    // Otimização: buscar apenas usuários com dinheiro
    // Nota: lastEconomyActivity pode ser undefined em usuários antigos, assumir que são ativos ou inativos?
    // Decisão: Se undefined, vamos assumir que são ativos (updated na próxima interação) ou ignorar por segurança.
    // Melhor: Se undefined, não vamos mexer agora para evitar wipe acidental.
    // Mas no database.js eu coloquei default: Date.now(), então novos/migrados terão data.
    
    // Buscar todos os usuários com dinheiro
    const users = await db.User.find({
        $or: [{ wallet: { $gt: 0 } }, { bank: { $gt: 0 } }]
    });

    let warningsSent = 0;
    let wipedUsers = 0;

    for (const user of users) {
        // Se lastEconomyActivity não existir, assume que é ativo (padrão do schema é Date.now() mas para docs antigos pode faltar)
        // Se faltar, vamos atualizar para agora para evitar wipe injusto
        if (!user.lastEconomyActivity) {
            await db.updateUser(user.userId, { lastEconomyActivity: now });
            continue;
        }

        const timeInactive = now - user.lastEconomyActivity;

        // 1. Verificar Limite de Wipe (60 dias)
        if (timeInactive >= INACTIVITY_LIMIT_MS) {
            await wipeUser(client, user);
            wipedUsers++;
            continue;
        }

        // 2. Verificar Aviso (57 dias)
        if (timeInactive >= WARNING_THRESHOLD_MS && !user.inactivityWarningSent) {
            await sendWarning(client, user);
            warningsSent++;
        }
    }

    if (warningsSent > 0 || wipedUsers > 0) {
        console.log(`💤 [INACTIVITY] Check concluído. Avisos: ${warningsSent}, Wipes: ${wipedUsers}`);
    }
}

async function sendWarning(client, user) {
    const daysLeft = INACTIVITY_LIMIT_DAYS - Math.floor((Date.now() - user.lastEconomyActivity) / DAY_MS);
    
    const embed = new EmbedBuilder()
        .setTitle('⚠️ Aviso de Inatividade Financeira')
        .setDescription(`Olá! Notamos que você não utiliza o sistema de economia do Foxhound há quase 2 meses.\n\n` +
            `**Sua carteira e banco serão zerados em ${daysLeft} dias** se você não realizar nenhuma transação.\n\n` +
            `📉 **Saldo Atual:** $${(user.wallet + user.bank).toLocaleString()}\n\n` +
            `👉 **Para evitar isso:** Basta usar qualquer comando de economia (ex: \`/saldo\`, \`/trabalhar\`, \`/daily\`) ou gastar/ganhar dinheiro.`)
        .setColor(colors.warning)
        .setTimestamp();

    try {
        // Tentar DM
        const discordUser = await client.users.fetch(user.userId);
        if (discordUser) {
            await discordUser.send({ embeds: [embed] });
            await db.updateUser(user.userId, { inactivityWarningSent: true });
            console.log(`Checking Warning for ${user.userId}: DM Sent.`);
            return;
        }
    } catch (err) {
        // DM Fechada ou erro
        console.log(`Checking Warning for ${user.userId}: DM Failed (${err.message}). Trying Guilds...`);
    }

    // Fallback: Tentar enviar em um servidor mútuo
    // Isso é custoso e intrusivo, vamos tentar apenas se encontrar um canal adequado.
    // Estratégia: Iterar guilds do client, ver se user está lá.
    // Enviar no canal de sistema ou primeiro canal de texto visível.
    
    try {
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const member = await guild.members.fetch(user.userId).catch(() => null);
                if (member) {
                    // Tenta achar canal de 'geral', 'chat', 'economia' ou systemChannel
                    let targetChannel = guild.systemChannel;
                    
                    if (!targetChannel) {
                        targetChannel = guild.channels.cache.find(c => 
                            c.type === 0 && // Text Channel
                            c.permissionsFor(guild.members.me).has('SendMessages') &&
                            (c.name.includes('geral') || c.name.includes('chat') || c.name.includes('eco'))
                        );
                    }

                    // Se ainda não achou, pega o primeiro que der
                    if (!targetChannel) {
                         targetChannel = guild.channels.cache.find(c => 
                            c.type === 0 && 
                            c.permissionsFor(guild.members.me).has('SendMessages')
                        );
                    }

                    if (targetChannel) {
                        await targetChannel.send({ 
                            content: `<@${user.userId}>`,
                            embeds: [embed] 
                        });
                        await db.updateUser(user.userId, { inactivityWarningSent: true });
                        console.log(`Checking Warning for ${user.userId}: Guild Message Sent in ${guild.name}.`);
                        return; // Enviou em um, tá bom.
                    }
                }
            } catch (e) {
                continue;
            }
        }
    } catch (e) {
        console.error('Erro ao tentar contatar usuário em guilds:', e);
    }
}

async function wipeUser(client, user) {
    const totalLost = (user.wallet || 0) + (user.bank || 0);
    
    await db.updateUser(user.userId, {
        wallet: 0,
        bank: 0,
        lastEconomyActivity: Date.now(), // Reseta timer (embora esteja sem dinheiro)
        inactivityWarningSent: false
    });

    // Adiciona ao cofre global o dinheiro esquecido?
    // "O dinheiro se perdeu no sistema" -> Vai pro cofre
    await db.addToVault(totalLost);

    const embed = new EmbedBuilder()
        .setTitle('💸 Fundos Zerados por Inatividade')
        .setDescription(`Devido à inatividade superior a ${INACTIVITY_LIMIT_DAYS} dias, seus fundos foram zerados.\n\n` +
            `💰 **Valor Perdido:** $${totalLost.toLocaleString()}\n\n` +
            `O dinheiro foi recolhido pelo Banco Central (Cofre Global).`)
        .setColor(colors.error)
        .setTimestamp();

    try {
        const discordUser = await client.users.fetch(user.userId);
        if (discordUser) await discordUser.send({ embeds: [embed] });
    } catch (e) {
        // Falha silenciosa no wipe
    }
    
    console.log(`💤 [INACTIVITY] Wiped user ${user.userId}. Amount: ${totalLost}`);
}

module.exports = { checkInactivity };
