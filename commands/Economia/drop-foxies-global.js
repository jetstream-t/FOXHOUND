const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');

// Mapa de drops globais ativos (Key: MessageID, Value: DropState)
const activeGlobalDrops = new Map();

// Gerar ID único para cada drop global
let globalDropCounter = 0;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('drop-foxies-global')
        .setDescription('[DONO] Inicia um drop de Foxies em TODOS os servidores')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addIntegerOption(option =>
            option.setName('quantia')
                .setDescription('Quantia total de Foxies a ser dropada')
                .setRequired(true)
                .setMinValue(1)
        )
        .addIntegerOption(option =>
            option.setName('vencedores')
                .setDescription('Número máximo de vencedores')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('duracao')
                .setDescription('Duração do drop (ex: 30s, 1m, 1h)')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('cargo')
                .setDescription('Cargo específico para notificar (opcional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        // Verificar se é o dono do bot
        const OWNER_ID = process.env.OWNER_ID;
        if (!OWNER_ID || interaction.user.id !== OWNER_ID) {
            return interaction.reply({ 
                content: '❌ Este comando é apenas para o dono do bot!', 
                ephemeral: true 
            });
        }

        const amount = interaction.options.getInteger('quantia');
        const maxWinners = interaction.options.getInteger('vencedores');
        const durationStr = interaction.options.getString('duracao');
        const mentionRole = interaction.options.getRole('cargo');

        // Parse Duration
        const timeMultiplier = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 };
        const match = durationStr.match(/^(\d+)(s|m|h)$/);
        
        if (!match) {
            return interaction.reply({ 
                content: '❌ Formato de duração inválido! Use: `30s`, `1m`, `1h`.', 
                ephemeral: true 
            });
        }

        const duration = parseInt(match[1]) * timeMultiplier[match[2]];

        if (duration < 10000) {
            return interaction.reply({ 
                content: '❌ A duração mínima é de 10 segundos!', 
                ephemeral: true 
            });
        }
        
        if (duration > 24 * 60 * 60 * 1000) {
            return interaction.reply({ 
                content: '❌ A duração máxima é de 24 horas!', 
                ephemeral: true 
            });
        }

        if (amount < maxWinners) {
            return interaction.reply({
                content: `❌ A quantia de Foxies (${amount}) deve ser maior ou igual ao número de vencedores (${maxWinners})!`,
                ephemeral: true
            });
        }

        // Verificar saldo do dono
        const user = await db.getUser(interaction.user.id);
        if (user.wallet < amount) {
            return interaction.reply({
                content: `❌ Você não tem Foxies suficientes na carteira! Você precisa de **${amount} Foxies**.`,
                ephemeral: true
            });
        }

        // Deduz o saldo
        await db.addMoney(interaction.user.id, -amount);

        // Confirmação inicial
        await interaction.reply({ 
            content: `✅ Drop GLOBAL de **${amount} Foxies** iniciado! Enviando para todos os servidores...`, 
            ephemeral: true 
        });

        // Criar ID único para este drop global
        const globalDropId = `global_${Date.now()}_${++globalDropCounter}`;
        const endTime = Date.now() + duration;

        // Criar mensagem de embed
        const embed = new EmbedBuilder()
            .setTitle('🎉 DROP GLOBAL DE FOXIES! 🎉')
            .setDescription(`Um drop de **${amount} Foxies** foi iniciado por ${interaction.user}!\n\n👥 **Vencedores:** ${maxWinners}\n⏳ **Termina em:** <t:${Math.floor(endTime / 1000)}:R>\n\n🌍 **Este é um drop GLOBAL!**`)
            .setColor(colors.gold || '#FFD700')
            .setTimestamp(endTime)
            .setFooter({ text: 'Clique no botão abaixo para participar!' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`join_drop_global_${globalDropId}`)
                    .setLabel('Participar')
                    .setEmoji('💰')
                    .setStyle(ButtonStyle.Success)
            );

        // ARREMENDADO: Agora só menciona se um cargo for especificado
        // NUNCA usa @everyone por padrão
        const mentionContent = mentionRole ? `${mentionRole}` : '';

        // Guardar estado do drop global
        const globalDropState = {
            id: globalDropId,
            ownerId: interaction.user.id,
            ownerName: interaction.user.username,
            amount: amount,
            maxWinners: maxWinners,
            participants: new Set(),
            endTime: endTime,
            durationStr: durationStr,
            sentMessages: [] // Armazena info das mensagens enviadas
        };

        // Obter todos os servidores e seus canais
        const guildConfigs = await db.GuildConfig.find({});
        
        let serversCount = 0;
        let channelsFound = 0;

        for (const config of guildConfigs) {
            if (!config.guildId) continue;
            
            // Tentar encontrar o canal do último comando
            const channelId = config.lastCommandChannelId || config.economyLogChannel || config.logsChannel;
            
            if (!channelId) continue;

            const guild = interaction.client.guilds.cache.get(config.guildId);
            if (!guild) continue;

            const channel = guild.channels.cache.get(channelId);
            if (!channel) continue;

            try {
                const message = await channel.send({ 
                    content: mentionContent,
                    embeds: [embed], 
                    components: [row] 
                });
                
                // Armazenar referência da mensagem para atualizar depois
                globalDropState.sentMessages.push({
                    messageId: message.id,
                    channelId: channel.id,
                    guildId: config.guildId
                });
                
                // Registrar no map com o ID da mensagem
                activeGlobalDrops.set(message.id, globalDropState);
                
                channelsFound++;
            } catch (e) {
                console.log(`[DROP GLOBAL] Erro ao enviar para ${guild.name}: ${e.message}`);
            }
            serversCount++;
        }

        // Também enviar no servidor onde o comando foi executado
        if (interaction.guildId) {
            const config = await db.GuildConfig.findOne({ guildId: interaction.guildId });
            const channelId = config?.lastCommandChannelId || config?.economyLogChannel;
            
            if (channelId && interaction.guild) {
                const channel = interaction.guild.channels.cache.get(channelId);
                if (channel) {
                    try {
                        const message = await channel.send({ 
                            content: mentionContent,
                            embeds: [embed], 
                            components: [row] 
                        });
                        
                        globalDropState.sentMessages.push({
                            messageId: message.id,
                            channelId: channel.id,
                            guildId: interaction.guildId
                        });
                        
                        activeGlobalDrops.set(message.id, globalDropState);
                        channelsFound++;
                    } catch (e) {
                        console.log(`[DROP GLOBAL] Erro ao enviar no servidor original: ${e.message}`);
                    }
                }
            }
        }

        // Enviar resultado
        await interaction.followUp({ 
            content: `📢 Drop global enviado!\n\n📊 **Servidores processados:** ${serversCount}\n✅ **Mensagens enviadas:** ${channelsFound}\n💰 **Valor:** ${amount.toLocaleString()} Foxies\n⏱️ **Duração:** ${durationStr}`, 
            ephemeral: true 
        });

        // Timeout para finalizar o drop
        setTimeout(async () => {
            const drop = activeGlobalDrops.get(globalDropState.sentMessages[0]?.messageId);
            if (!drop) return;

            const participantsArray = Array.from(drop.participants);

            if (participantsArray.length === 0) {
                // Refund
                await db.addMoney(drop.ownerId, drop.amount);
                
                const refundEmbed = new EmbedBuilder()
                    .setTitle('❌ Drop Global Cancelado')
                    .setDescription('Ninguém participou do drop. Os Foxies foram devolvidos ao host.')
                    .setColor(colors.error || '#FF0000');

                // Atualizar todas as mensagens
                for (const msgInfo of drop.sentMessages) {
                    try {
                        const guild = interaction.client.guilds.cache.get(msgInfo.guildId);
                        if (!guild) continue;
                        const channel = guild.channels.cache.get(msgInfo.channelId);
                        if (!channel) continue;
                        const message = await channel.messages.fetch(msgInfo.messageId);
                        if (message) {
                            await message.edit({ embeds: [refundEmbed], components: [] });
                        }
                    } catch (e) {
                        console.log('[DROP GLOBAL] Erro ao editar mensagem de cancelamento:', e);
                    }
                }

                // Remover do map
                for (const msgInfo of drop.sentMessages) {
                    activeGlobalDrops.delete(msgInfo.messageId);
                }
                return;
            }

            // Pick Winners
            const shuffled = participantsArray.sort(() => 0.5 - Math.random());
            const winners = shuffled.slice(0, drop.maxWinners);
            const prizePerWinner = Math.floor(drop.amount / winners.length);

            // Distribute prizes
            const winnerNames = [];
            for (const winnerId of winners) {
                await db.addMoney(winnerId, prizePerWinner);
                winnerNames.push(`<@${winnerId}>`);
            }

            // Announce
            const resultEmbed = new EmbedBuilder()
                .setTitle('🎉 Drop Global Encerrado! 🎉')
                .setDescription(`O drop de **${drop.amount} Foxies** acabou!\n\n🏆 **Vencedores:**\n${winnerNames.join('\n')}\n\n💰 **Prêmio:** ${prizePerWinner} Foxies para cada!`)
                .setColor(colors.success || '#00FF00')
                .setFooter({ text: `Total de participantes: ${participantsArray.length}` });

            // Atualizar todas as mensagens
            for (const msgInfo of drop.sentMessages) {
                try {
                    const guild = interaction.client.guilds.cache.get(msgInfo.guildId);
                    if (!guild) continue;
                    const channel = guild.channels.cache.get(msgInfo.channelId);
                    if (!channel) continue;
                    const message = await channel.messages.fetch(msgInfo.messageId);
                    if (message) {
                        await message.edit({ embeds: [resultEmbed], components: [] });
                    }
                } catch (e) {
                    console.log('[DROP GLOBAL] Erro ao editar mensagem final:', e);
                }
            }

            // Remover do map
            for (const msgInfo of drop.sentMessages) {
                activeGlobalDrops.delete(msgInfo.messageId);
            }
        }, duration);
    },

    async handleDropGlobalButton(interaction) {
        const { customId, message, user } = interaction;
        
        // Extrair o ID do drop do customId
        const parts = customId.split('_');
        if (parts.length < 4 || parts[0] !== 'join' || parts[1] !== 'drop' || parts[2] !== 'global') {
            return interaction.reply({ 
                content: '❌ ID de drop inválido!', 
                ephemeral: true 
            });
        }

        const dropId = parts.slice(3).join('_');
        
        // Buscar o drop pelo ID da mensagem atual
        const drop = activeGlobalDrops.get(message.id);
        
        if (!drop) {
            return interaction.reply({ 
                content: '❌ Este drop global já expirou ou não existe mais!', 
                ephemeral: true 
            });
        }

        // Verificar se o drop ainda está ativo
        if (Date.now() > drop.endTime) {
            return interaction.reply({ 
                content: '❌ Este drop global já acabou!', 
                ephemeral: true 
            });
        }

        // Verificar se é o criador
        if (user.id === drop.ownerId) {
            return interaction.reply({ 
                content: '❌ O criador do drop não pode participar!', 
                ephemeral: true 
            });
        }

        // Verificar se já está participando
        if (drop.participants.has(user.id)) {
            return interaction.reply({ 
                content: '✅ Você já está participando deste drop global!', 
                ephemeral: true 
            });
        }

        // Adicionar aos participantes
        drop.participants.add(user.id);
        
        await interaction.reply({ 
            content: '✅ Você entrou no drop global! Boa sorte!', 
            ephemeral: true 
        });
    }
};
