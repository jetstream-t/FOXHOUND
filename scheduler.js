const db = require('./database');
const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');

module.exports = (client) => {
    console.log('⚡ [SCHEDULER] Sistema de agendamento iniciado.');

    // Tarefa diária - reset de missões
    cron.schedule('0 0 * * *', async () => {
        try {
            console.log('📋 [SCHEDULER] Reset diário de missões');
            // Lógica de reset de missões diárias aqui
        } catch (error) {
            console.error('❌ [SCHEDULER] Erro no reset diário:', error);
        }
    });

    // Tarefa horária - verificação de cooldowns
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('⏰ [SCHEDULER] Verificação horária');
            // Lógica de verificação horária aqui
        } catch (error) {
            console.error('❌ [SCHEDULER] Erro na verificação horária:', error);
        }
    });

    // Tarefa semanal - evento semanal
    cron.schedule('0 0 * * 0', async () => {
        try {
            console.log('🎉 [SCHEDULER] Evento semanal');
            // Lógica de evento semanal aqui
        } catch (error) {
            console.error('❌ [SCHEDULER] Erro no evento semanal:', error);
        }
    });

    // Tarefa a cada 5 minutos - verificação de alarmes
    cron.schedule('*/5 * * * *', async () => {
        try {
            console.log('⏰ [SCHEDULER] Verificação de alarmes');

            // Buscar usuários com alarme ativado
            const usersWithAlarms = await db.User.find({
                alarmClockEnabled: true,
                alarmClockChannelId: { $exists: true, $ne: null },
                alarmClockGuildId: { $exists: true, $ne: null }
            });

            console.log(`⏰ [SCHEDULER] Verificando ${usersWithAlarms.length} usuários com alarme ativado`);

            for (const user of usersWithAlarms) {
                try {
                    // Verificar se o cooldown de trabalho terminou
                    const now = Date.now();
                    const lastWork = user.lastWork || 0;
                    const workCooldown = 30 * 60 * 1000; // 30 minutos base
                    const workPenalty = (user.workPenalty || 0) * 60 * 1000; // Penas adicionais
                    const totalCooldown = workCooldown + workPenalty;

                    // Se ainda está em cooldown, pular
                    if (now - lastWork < totalCooldown) {
                        continue;
                    }

                    // Verificar se já foi notificado recentemente (evitar spam)
                    const lastNotification = user.alarmClockActivatedAt || 0;
                    const cooldownEndedAt = lastWork + totalCooldown;

                    // Só notificar se o cooldown terminou há menos de 10 minutos
                    // e não foi notificado ainda para este ciclo
                    if (now - cooldownEndedAt > 10 * 60 * 1000 || lastNotification >= cooldownEndedAt) {
                        continue;
                    }

                    // Buscar o canal para enviar a notificação
                    const guild = client.guilds.cache.get(user.alarmClockGuildId);
                    if (!guild) {
                        console.warn(`⚠️ [ALARM] Guild ${user.alarmClockGuildId} não encontrada para usuário ${user.userId}`);
                        continue;
                    }

                    const channel = guild.channels.cache.get(user.alarmClockChannelId);
                    if (!channel) {
                        console.warn(`⚠️ [ALARM] Canal ${user.alarmClockChannelId} não encontrado para usuário ${user.userId}`);
                        continue;
                    }

                    // Verificar permissões do bot no canal
                    if (!channel.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
                        console.warn(`⚠️ [ALARM] Sem permissões para enviar mensagens no canal ${channel.id}`);
                        continue;
                    }

                    // Enviar notificação
                    const embed = {
                        title: '⏰ Despertador - Cooldown Terminou!',
                        description: `Seu cooldown de trabalho terminou! Você pode trabalhar novamente.\n\n💼 **Próximo trabalho disponível agora!**`,
                        color: 0x00D26A,
                        footer: {
                            text: `Notificação automática para ${user.userId}`
                        },
                        timestamp: new Date()
                    };

                    await channel.send({ embeds: [embed] });

                    // Atualizar timestamp da última notificação
                    await db.updateUser(user.userId, {
                        alarmClockActivatedAt: now
                    });

                    console.log(`✅ [ALARM] Notificação enviada para ${user.userId} no canal ${channel.id}`);

                } catch (userError) {
                    console.error(`❌ [ALARM] Erro ao processar alarme para usuário ${user.userId}:`, userError);
                }
            }

        } catch (error) {
            console.error('❌ [SCHEDULER] Erro na verificação de alarmes:', error);
        }
    });
};
