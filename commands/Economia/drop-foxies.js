const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');

// Mapa de drops ativos (Key: MessageID, Value: DropState)
const activeDrops = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('drop-foxies')
        .setDescription('Inicia um evento de drop de Foxies em um canal específico')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
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
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('O canal onde o drop vai acontecer')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
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
        // Verificar se é administrador OU dono do servidor
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isServerOwner = interaction.guild.ownerId === interaction.user.id;
        
        if (!isAdmin && !isServerOwner) {
            return interaction.reply({ 
                content: '❌ Você não tem permissão para usar este comando! Apenas administradores ou o dono do servidor podem usar.', 
                ephemeral: true 
            });
        }

        const amount = interaction.options.getInteger('quantia');
        const maxWinners = interaction.options.getInteger('vencedores');
        const channel = interaction.options.getChannel('canal');
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

        if (duration < 10000) { // Mínimo 10 segundos
            return interaction.reply({ 
                content: '❌ A duração mínima é de 10 segundos!', 
                ephemeral: true 
            });
        }
        
        if (duration > 24 * 60 * 60 * 1000) { // Máximo 24 horas
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

        // Check Permissions/Balance
        const user = await db.getUser(interaction.user.id);
        if (user.wallet < amount) {
            return interaction.reply({
                content: `❌ Você não tem Foxies suficientes na carteira! Você precisa de **${amount} Foxies**.`,
                ephemeral: true
            });
        }

        // Deduct balance immediately
        await db.addMoney(interaction.user.id, -amount);

        // Confirm to user
        await interaction.reply({ 
            content: `✅ Drop de **${amount} Foxies** agendado para o canal ${channel} com duração de **${durationStr}**!${mentionRole ? ` Notificando: ${mentionRole}` : ''}`, 
            ephemeral: true 
        });

        // Create Drop Message
        const embed = new EmbedBuilder()
            .setTitle('🎉 DROP DE FOXIES! 🎉')
            .setDescription(`Um drop de **${amount} Foxies** foi iniciado por ${interaction.user}!\n\n👥 **Vencedores:** ${maxWinners}\n⏳ **Termina em:** <t:${Math.floor((Date.now() + duration) / 1000)}:R>`)
            .setColor(colors.gold || '#FFD700')
            .setTimestamp(Date.now() + duration)
            .setFooter({ text: 'Clique no botão abaixo para participar!' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join_drop')
                    .setLabel('Participar')
                    .setEmoji('💰')
                    .setStyle(ButtonStyle.Success)
            );

        // Mention role if specified
        const mentionContent = mentionRole ? `${mentionRole}` : '';
        const dropMessage = await channel.send({ 
            content: mentionContent,
            embeds: [embed], 
            components: [row] 
        });

        // Guardar o estado do drop no Map global
        const dropState = {
            messageId: dropMessage.id,
            channelId: channel.id,
            ownerId: interaction.user.id,
            ownerName: interaction.user.username,
            amount: amount,
            maxWinners: maxWinners,
            participants: new Set(),
            endTime: Date.now() + duration,
            message: dropMessage
        };

        activeDrops.set(dropMessage.id, dropState);

        // Timeout para finalizar o drop
        setTimeout(async () => {
            const drop = activeDrops.get(dropMessage.id);
            if (!drop) return;

            const participantsArray = Array.from(drop.participants);

            if (participantsArray.length === 0) {
                // Refund
                await db.addMoney(drop.ownerId, drop.amount);
                const refundEmbed = new EmbedBuilder()
                    .setTitle('❌ Drop Cancelado')
                    .setDescription('Ninguém participou do drop. Os Foxies foram devolvidos ao host.')
                    .setColor(colors.error || '#FF0000');
                
                try {
                    await drop.message.edit({ embeds: [refundEmbed], components: [] });
                } catch (e) {}
                
                activeDrops.delete(dropMessage.id);
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
                .setTitle('🎉 Drop Encerrado! 🎉')
                .setDescription(`O drop de **${drop.amount} Foxies** acabou!\n\n🏆 **Vencedores:**\n${winnerNames.join('\n')}\n\n💰 **Prêmio:** ${prizePerWinner} Foxies para cada!`)
                .setColor(colors.success || '#00FF00')
                .setFooter({ text: `Total de participantes: ${participantsArray.length}` });

            try {
                await drop.message.edit({ embeds: [resultEmbed], components: [] });
                // Tag winners in a new message
                await channel.send(`Parabéns aos vencedores: ${winnerNames.join(', ')}!`);
            } catch (e) {
                console.log('[DROP] Erro ao editar mensagem final:', e);
            }
            
            activeDrops.delete(dropMessage.id);
        }, duration);
    },

    async handleDropButton(interaction) {
        const { customId, message, user } = interaction;
        
        if (customId !== 'join_drop') return;
        
        const drop = activeDrops.get(message.id);
        
        if (!drop) {
            return interaction.reply({ 
                content: '❌ Este drop já expirou ou não existe mais!', 
                ephemeral: true 
            });
        }

        // Verificar se o drop ainda está ativo
        if (Date.now() > drop.endTime) {
            return interaction.reply({ 
                content: '❌ Este drop já acabou!', 
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
                content: '✅ Você já está participando deste drop!', 
                ephemeral: true 
            });
        }

        // Adicionar aos participantes
        drop.participants.add(user.id);
        
        await interaction.reply({ 
            content: '✅ Você entrou no drop! Boa sorte!', 
            ephemeral: true 
        });
    }
};
