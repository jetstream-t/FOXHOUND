const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    ComponentType
} = require('discord.js');
const db = require('../../database');
const items = require('../../items.json');
const { runDailyExport } = require('../../systems/dailyExport');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('godmode')
        .setDescription('Painel de Controle do Dono (Restrito)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // 🔒 VERIFICAÇÃO DE SEGURANÇA MÁXIMA
        const OWNER_ID = process.env.OWNER_ID;

        if (!OWNER_ID) {
            return interaction.reply({
                content: `⚠️ **Configuração Pendente!**\n\nDefina \`OWNER_ID=${interaction.user.id}\` no arquivo .env.`,
                ephemeral: true
            });
        }

        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                content: '⛔ Você não tem permissão para usar este painel.',
                ephemeral: true
            });
        }

        await this.showPanel(interaction);
    },

    async showPanel(interaction) {
        const user = interaction.user;
        const userData = await db.getUser(user.id);
        const isGodModeOn = userData.hideFromRank && userData.wallet > 900000000;

        const embed = new EmbedBuilder()
            .setTitle('⚡ Painel God Mode')
            .setColor(isGodModeOn ? '#00FF00' : '#FF0000')
            .setDescription(`Painel de controle administrativo de **${user.username}**`)
            .addFields(
                { name: '💰 Carteira', value: `\`${userData.wallet.toLocaleString()}\``, inline: true },
                { name: '🛡️ Status God Mode', value: isGodModeOn ? '✅ ATIVADO' : '❌ DESATIVADO', inline: true },
                { name: '👥 Usuários Totais', value: `\`Carregando...\``, inline: true }
            )
            .setFooter({ text: '⚠️ Use com responsabilidade. Poder absoluto corrompe absolutamente.' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('godmode_toggle')
                .setLabel(isGodModeOn ? 'Desativar God Mode' : 'Ativar God Mode')
                .setStyle(isGodModeOn ? ButtonStyle.Danger : ButtonStyle.Success)
                .setEmoji(isGodModeOn ? '🔴' : '🟢'),
            new ButtonBuilder()
                .setCustomId('godmode_manage_user_ask')
                .setLabel('Gerenciar Usuário')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId('godmode_pay_all')
                .setLabel('Pagar Todos')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('💸'),
            new ButtonBuilder()
                .setCustomId('godmode_export')
                .setLabel('Exportar CSV')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📈')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('godmode_broadcast')
                .setLabel('Mensagem Global')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📢'),
            new ButtonBuilder()
                .setCustomId('godmode_refresh')
                .setLabel('Atualizar')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId('godmode_status')
                .setLabel('Definir Status Bot')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎮'),
            new ButtonBuilder()
                .setCustomId('godmode_stats')
                .setLabel('Estatísticas')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📊'),
            new ButtonBuilder()
                .setCustomId('godmode_audit')
                .setLabel('Auditoria')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🛡️')
        );

        const payload = { embeds: [embed], components: [row1, row2], ephemeral: true };

        if (interaction.isButton() || interaction.isModalSubmit()) {
            await interaction.update(payload);
        } else {
            await interaction.reply(payload);
        }
    },

    async handleButton(interaction) {
        const { customId } = interaction;
        const OWNER_ID = process.env.OWNER_ID;

        if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '⛔ Sem permissão.', ephemeral: true });

        // --- PAINEL PRINCIPAL ---
        if (customId === 'godmode_refresh') {
            return this.showPanel(interaction);
        }

        if (customId === 'godmode_toggle') {
            try {
                const userData = await db.getUser(interaction.user.id);
                const isGodModeOn = userData.hideFromRank && userData.wallet > 900000000;

                if (isGodModeOn) {
                    // Desativar - Restaurar backup
                    const updates = { hideFromRank: false };
                    if (userData.godmodeBackup && userData.godmodeBackup.wallet) {
                        updates.wallet = userData.godmodeBackup.wallet;
                        updates.bank = userData.godmodeBackup.bank;
                    } else {
                        updates.wallet = 0;
                        updates.bank = 0;
                    }
                    await db.updateUser(interaction.user.id, updates);
                } else {
                    // Ativar - Salvar backup e definir dinheiro infinito
                    const updates = {
                        hideFromRank: true,
                        wallet: 999999999999,
                        godmodeBackup: {
                            wallet: userData.wallet,
                            bank: userData.bank
                        }
                    };
                    await db.updateUser(interaction.user.id, updates);
                }
                
                // Atualiza o painel diretamente
                return this.showPanel(interaction);
            } catch (error) {
                console.error('Erro ao toggle God Mode:', error);
                return interaction.followUp({ content: '❌ Erro ao processar God Mode: ' + error.message, ephemeral: true });
            }
        }

        if (customId === 'godmode_pay_all') {
            const modal = new ModalBuilder()
                .setCustomId('godmode_modal_pay_all')
                .setTitle('Pagar TODOS os Usuários');
            const amountInput = new TextInputBuilder()
                .setCustomId('amount')
                .setLabel('Quantidade por usuário')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 1000')
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
            return interaction.showModal(modal);
        }

        if (customId === 'godmode_broadcast') {
            const modal = new ModalBuilder()
                .setCustomId('godmode_modal_broadcast')
                .setTitle('Enviar Mensagem Global');
            const msgInput = new TextInputBuilder()
                .setCustomId('message')
                .setLabel('Mensagem')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
            return interaction.showModal(modal);
        }

        if (customId === 'godmode_status') {
            const modal = new ModalBuilder()
                .setCustomId('godmode_modal_status')
                .setTitle('Definir Status do Bot');
            const statusInput = new TextInputBuilder()
                .setCustomId('status_text')
                .setLabel('Texto do Status')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(statusInput));
            return interaction.showModal(modal);
        }

        if (customId === 'godmode_stats') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const totalUsers = await db.User.countDocuments();

                const economyStats = await db.User.aggregate([
                    {
                        $group: {
                            _id: null,
                            totalWallet: { $sum: "$wallet" },
                            totalBank: { $sum: "$bank" },
                            avgWallet: { $avg: "$wallet" }
                        }
                    }
                ]);
                
                const totalMoney = (economyStats[0]?.totalWallet || 0) + (economyStats[0]?.totalBank || 0);
                const avgMoney = economyStats[0]?.avgWallet || 0;

                const itemStats = await db.User.aggregate([
                    { $unwind: "$purchaseHistory" },
                    { $group: { _id: "$purchaseHistory.item", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]);

                let mostPurchased = "Nenhum";
                let leastPurchased = "Nenhum";
                
                if (itemStats.length > 0) {
                    const most = itemStats[0];
                    const least = itemStats[itemStats.length - 1];
                    
                    const getItemName = (id) => {
                        const item = items.find(i => i.id === id);
                        return item ? `${item.emoji || ''} ${item.name}` : id;
                    };

                    mostPurchased = `${getItemName(most._id)} (${most.count})`;
                    leastPurchased = `${getItemName(least._id)} (${least.count})`;
                }

                const totalPets = await db.Pet.countDocuments();

                const richest = await db.User.findOne().sort({ bank: -1 }).limit(1);
                const richestUser = richest ? `<@${richest.userId}>` : "Ninguém";

                const statsEmbed = new EmbedBuilder()
                    .setTitle('📊 Estatísticas Globais do Bot')
                    .setColor('#0099FF')
                    .addFields(
                        { name: '👥 Usuários Registrados', value: `${totalUsers}`, inline: true },
                        { name: '🐾 Pets Adotados', value: `${totalPets}`, inline: true },
                        { name: '\u200b', value: '\u200b', inline: true },
                        { name: '💰 Economia Total', value: `\`${totalMoney.toLocaleString()}\``, inline: true },
                        { name: '💵 Média por Usuário', value: `\`${Math.floor(avgMoney).toLocaleString()}\``, inline: true },
                        { name: '💎 Usuário Mais Rico', value: `${richestUser}`, inline: true },
                        { name: '📦 Item Mais Comprado', value: `${mostPurchased}`, inline: true },
                        { name: '🕸️ Item Menos Comprado', value: `${leastPurchased}`, inline: true }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [statsEmbed] });

            } catch (error) {
                console.error('Erro ao gerar estatísticas:', error);
                await interaction.editReply({ content: '❌ Erro ao gerar estatísticas.' });
            }
            return;
        }

        if (customId === 'godmode_export') {
            await interaction.deferReply({ ephemeral: true });
            const result = await runDailyExport(interaction.client, true);
            return interaction.editReply({ 
                content: result.success ? `✅ **Sucesso!** ${result.message}` : `❌ **Erro:** ${result.message}` 
            });
        }

        if (customId === 'godmode_audit') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const negativeUsers = await db.User.find({
                    $or: [
                        { wallet: { $lt: 0 } },
                        { bank: { $lt: 0 } }
                    ]
                }).limit(10);

                const suspiciousRich = await db.User.find({
                    $and: [
                        { hideFromRank: false },
                        {
                            $or: [
                                { wallet: { $gt: 100000000 } },
                                { bank: { $gt: 100000000 } }
                            ]
                        }
                    ]
                }).sort({ bank: -1 }).limit(10);

                const now = Date.now();
                const futureTime = now + (60 * 60 * 1000);
                const timeTravelers = await db.User.find({
                    $or: [
                        { lastWork: { $gt: futureTime } },
                        { lastDaily: { $gt: futureTime } },
                        { lastRob: { $gt: futureTime } }
                    ]
                }).limit(10);

                const topUsers = await db.User.find().sort({ lastInteraction: -1 }).limit(50);
                const suspiciousInventory = [];

                for (const u of topUsers) {
                    if (u.inventory) {
                        for (const [itemId, qty] of u.inventory) {
                            if (qty > 1000 && itemId !== 'milho') {
                                suspiciousInventory.push({ userId: u.userId, item: itemId, qty });
                                if (suspiciousInventory.length >= 5) break;
                            }
                        }
                    }
                    if (suspiciousInventory.length >= 5) break;
                }

                const auditEmbed = new EmbedBuilder()
                    .setTitle('🛡️ Relatório de Auditoria de Segurança')
                    .setColor('#FF4500')
                    .setTimestamp();

                if (negativeUsers.length > 0) {
                    const list = negativeUsers.map(u => `<@${u.userId}> (W: ${u.wallet}, B: ${u.bank})`).join('\n');
                    auditEmbed.addFields({ name: '⚠️ Saldos Negativos (Bug)', value: list });
                } else {
                    auditEmbed.addFields({ name: '✅ Saldos Negativos', value: 'Nenhum encontrado.', inline: true });
                }

                if (suspiciousRich.length > 0) {
                    const list = suspiciousRich.map(u => `<@${u.userId}> (Total: ${(u.wallet + u.bank).toLocaleString()})`).join('\n');
                    auditEmbed.addFields({ name: '💰 Riqueza Extrema (>100M)', value: list });
                } else {
                    auditEmbed.addFields({ name: '✅ Riqueza Extrema', value: 'Nenhum suspeito.', inline: true });
                }

                if (timeTravelers.length > 0) {
                    const list = timeTravelers.map(u => `<@${u.userId}>`).join('\n');
                    auditEmbed.addFields({ name: '⏳ Viajantes do Tempo', value: list });
                } else {
                    auditEmbed.addFields({ name: '✅ Cooldowns', value: 'Tudo normal.', inline: true });
                }

                if (suspiciousInventory.length > 0) {
                    const list = suspiciousInventory.map(i => `<@${i.userId}>: ${i.qty}x ${i.item}`).join('\n');
                    auditEmbed.addFields({ name: '📦 Inventários Suspeitos (>1000)', value: list });
                } else {
                    auditEmbed.addFields({ name: '✅ Inventários', value: 'Tudo normal.', inline: true });
                }

                await interaction.editReply({ embeds: [auditEmbed] });

            } catch (error) {
                console.error('Erro na auditoria:', error);
                await interaction.editReply({ content: '❌ Erro ao realizar auditoria.' });
            }
            return;
        }

        if (customId === 'godmode_manage_user_ask') {
            const modal = new ModalBuilder()
                .setCustomId('godmode_modal_userid')
                .setTitle('Gerenciar Usuário');
            const idInput = new TextInputBuilder()
                .setCustomId('target_id')
                .setLabel('ID do Usuário')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Cole o ID do Discord aqui')
                .setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(idInput));
            return interaction.showModal(modal);
        }

        if (customId.startsWith('godmode_act_')) {
            const parts = customId.split('_');
            const action = parts[2];
            const targetId = parts[3];

            if (action === 'back') {
                return this.showPanel(interaction);
            }

            if (action === 'penalty') {
                const modal = new ModalBuilder()
                    .setCustomId(`godmode_modal_penalty_${targetId}`)
                    .setTitle('Aplicar/Remover Pena');
                
                const typeInput = new TextInputBuilder()
                    .setCustomId('type')
                    .setLabel('Tipo (work/ban)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('work = Trabalho Forçado | ban = Banir')
                    .setValue('work')
                    .setRequired(true);

                const durationInput = new TextInputBuilder()
                    .setCustomId('duration')
                    .setLabel('Duração (minutos) ou 0 p/ remover')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: 60 para 1 hora. 0 remove a pena.')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(typeInput),
                    new ActionRowBuilder().addComponents(durationInput)
                );
                return interaction.showModal(modal);
            }

            if (action === 'economy') {
                const modal = new ModalBuilder()
                    .setCustomId(`godmode_modal_economy_${targetId}`)
                    .setTitle('Editar Economia');
                
                const walletInput = new TextInputBuilder()
                    .setCustomId('wallet')
                    .setLabel('Definir Carteira')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const bankInput = new TextInputBuilder()
                    .setCustomId('bank')
                    .setLabel('Definir Banco')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(walletInput),
                    new ActionRowBuilder().addComponents(bankInput)
                );
                return interaction.showModal(modal);
            }

            if (action === 'item') {
                const modal = new ModalBuilder()
                    .setCustomId(`godmode_modal_item_${targetId}`)
                    .setTitle('Dar/Remover Item');
                
                const itemInput = new TextInputBuilder()
                    .setCustomId('item_id')
                    .setLabel('ID do Item')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Ex: picareta_ferro')
                    .setRequired(true);

                const amountInput = new TextInputBuilder()
                    .setCustomId('amount')
                    .setLabel('Quantidade (Negativo para remover)')
                    .setStyle(TextInputStyle.Short)
                    .setValue('1')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(itemInput),
                    new ActionRowBuilder().addComponents(amountInput)
                );
                return interaction.showModal(modal);
            }

            if (action === 'dm') {
                const modal = new ModalBuilder()
                    .setCustomId(`godmode_modal_dm_${targetId}`)
                    .setTitle('Enviar Mensagem Privada');
                
                const msgInput = new TextInputBuilder()
                    .setCustomId('message')
                    .setLabel('Mensagem')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Digite a mensagem para o usuário...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
                return interaction.showModal(modal);
            }

            if (action === 'refresh') {
                return this.showUserPanel(interaction, targetId);
            }
        }
    },

    async handleModal(interaction) {
        const { customId, fields } = interaction;

        if (customId === 'godmode_modal_userid') {
            const targetId = fields.getTextInputValue('target_id');
            await this.showUserPanel(interaction, targetId);
            return;
        }

        if (customId.startsWith('godmode_modal_penalty_')) {
            const targetId = customId.split('_')[3];
            const type = fields.getTextInputValue('type').toLowerCase();
            const duration = parseInt(fields.getTextInputValue('duration'));

            if (isNaN(duration)) return interaction.reply({ content: '❌ Duração inválida.', ephemeral: true });

            const updates = {};
            let msg = "";

            if (type === 'work' || type === 'trabalho') {
                updates.workPenalty = duration;
                msg = duration > 0 
                    ? `⛓️ **Pena Aplicada:** ${duration} minutos de trabalhos forçados.`
                    : `🕊️ **Liberdade:** Pena de trabalho removida.`;
            } else if (type === 'ban') {
                updates.blacklisted = duration > 0;
                msg = duration > 0 ? `🚫 **BANIDO:** Usuário bloqueado do bot.` : `✅ **DESBANIDO:** Acesso restaurado.`;
            } else {
                return interaction.reply({ content: '❌ Tipo desconhecido. Use "work" ou "ban".', ephemeral: true });
            }

            await db.updateUser(targetId, updates);
            await interaction.reply({ content: `✅ Ação realizada com sucesso no ID \`${targetId}\`!\n${msg}`, ephemeral: true });
        }

        if (customId.startsWith('godmode_modal_economy_')) {
            const targetId = customId.split('_')[3];
            const walletRaw = fields.getTextInputValue('wallet');
            const bankRaw = fields.getTextInputValue('bank');
            const updates = {};

            if (walletRaw) updates.wallet = parseInt(walletRaw);
            if (bankRaw) updates.bank = parseInt(bankRaw);

            if (Object.keys(updates).length > 0) {
                await db.updateUser(targetId, updates);
                await interaction.reply({ content: `✅ Economia atualizada para ID \`${targetId}\`.`, ephemeral: true });
            } else {
                await interaction.reply({ content: '⚠️ Nenhuma alteração feita.', ephemeral: true });
            }
        }

        if (customId.startsWith('godmode_modal_item_')) {
            const targetId = customId.split('_')[3];
            const itemId = fields.getTextInputValue('item_id');
            const amount = parseInt(fields.getTextInputValue('amount'));

            if (isNaN(amount)) return interaction.reply({ content: '❌ Quantidade inválida.', ephemeral: true });

            const item = items.find(i => i.id === itemId);
            if (!item) return interaction.reply({ content: '❌ Item não encontrado na database.', ephemeral: true });

            if (amount > 0) {
                await db.addItem(targetId, itemId, amount);
                await interaction.reply({ content: `✅ Adicionado **${amount}x ${item.name}** para <@${targetId}>.`, ephemeral: true });
            } else {
                await db.removeItem(targetId, itemId, Math.abs(amount));
                await interaction.reply({ content: `✅ Removido **${Math.abs(amount)}x ${item.name}** de <@${targetId}>.`, ephemeral: true });
            }
        }

        if (customId.startsWith('godmode_modal_dm_')) {
            const targetId = customId.split('_')[3];
            const message = fields.getTextInputValue('message');

            try {
                const user = await interaction.client.users.fetch(targetId);
                const embed = new EmbedBuilder()
                    .setTitle('📢 Mensagem da Administração')
                    .setDescription(message)
                    .setColor('#FF0000')
                    .setFooter({ text: 'Esta é uma mensagem oficial do sistema.' })
                    .setTimestamp();

                await user.send({ embeds: [embed] });
                await interaction.reply({ content: `✅ Mensagem enviada com sucesso para **${user.tag}** (<@${targetId}>).`, ephemeral: true });
            } catch (error) {
                console.error('Erro ao enviar DM:', error);
                await interaction.reply({ content: `❌ Não foi possível enviar a DM. O usuário pode ter DMs fechadas ou o ID é inválido.\nErro: ${error.message}`, ephemeral: true });
            }
        }

        if (customId === 'godmode_modal_pay_all') {
            const amount = parseInt(fields.getTextInputValue('amount'));
            if (isNaN(amount)) return interaction.reply({ content: '❌ Valor inválido.', ephemeral: true });

            await db.User.updateMany({}, { $inc: { wallet: amount } });
            
            await interaction.reply({ content: `✅ **Sucesso!** Enviado $${amount} para TODOS os usuários registrados.`, ephemeral: true });
        }

        if (customId === 'godmode_modal_broadcast') {
            const msg = fields.getTextInputValue('message');
            
            const guilds = await db.GuildConfig.find({ economyLogChannel: { $ne: null } });
            let count = 0;

            const embed = new EmbedBuilder()
                .setTitle('📢 Mensagem do Desenvolvedor')
                .setDescription(msg)
                .setColor('#FFD700')
                .setTimestamp();

            await interaction.reply({ content: '🚀 Iniciando transmissão global...', ephemeral: true });

            for (const guildConfig of guilds) {
                try {
                    const channel = await interaction.client.channels.fetch(guildConfig.economyLogChannel).catch(() => null);
                    if (channel) {
                        await channel.send({ embeds: [embed] });
                        count++;
                    }
                } catch (e) {
                    console.error(`Erro ao enviar broadcast para guild ${guildConfig.guildId}:`, e);
                }
            }

            await interaction.editReply({ content: `✅ Transmissão concluída! Mensagem enviada para **${count}** servidores.` });
        }

        if (customId === 'godmode_modal_status') {
            const statusText = fields.getTextInputValue('status_text');
            
            if (statusText.toLowerCase() === 'reset' || statusText.toLowerCase() === 'default') {
                await db.saveGlobalConfig('custom_bot_status', null);
                return interaction.reply({ content: '✅ Status do bot resetado para o padrão (rotação automática).', ephemeral: true });
            }

            await db.saveGlobalConfig('custom_bot_status', statusText);
            
            const totalGuilds = interaction.client.guilds.cache.size;
            const totalUsers = interaction.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
            const totalCommands = await db.getGlobalCommandCount();

            const formattedStatus = statusText
                .replace(/{users}/g, totalUsers)
                .replace(/{guilds}/g, totalGuilds)
                .replace(/{commands}/g, totalCommands);

            interaction.client.user.setActivity(formattedStatus);
            
            await interaction.reply({ 
                content: `✅ Status personalizado definido!\n\n**Texto:** \`${statusText}\`\n**Visualização:** \`${formattedStatus}\`\n\n💡 **Variáveis disponíveis:**\n- \`{users}\`: Total de usuários\n- \`{guilds}\`: Total de servidores\n- \`{commands}\`: Comandos executados\n\n*Para voltar ao padrão, digite "reset".*`, 
                ephemeral: true 
            });
        }
    },

    async showUserPanel(interaction, targetId) {
        const targetUser = await db.getUser(targetId);
        const discordUser = await interaction.client.users.fetch(targetId).catch(() => null);
        const username = discordUser ? discordUser.tag : 'Usuário Desconhecido/Saiu';

        const embed = new EmbedBuilder()
            .setTitle(`🛠️ Gestão: ${username}`)
            .setDescription(`ID: \`${targetId}\``)
            .addFields(
                { name: '💰 Carteira', value: `$${targetUser.wallet.toLocaleString()}`, inline: true },
                { name: '🏦 Banco', value: `$${targetUser.bank.toLocaleString()}`, inline: true },
                { name: '⚖️ Pena (Trabalho)', value: targetUser.workPenalty > 0 ? `🚫 ${targetUser.workPenalty} min` : '✅ Nenhuma', inline: true },
                { name: '🔫 Procurado', value: targetUser.wantedUntil > Date.now() ? '🚨 SIM' : '✅ NÃO', inline: true },
                { name: '🚫 Banido', value: targetUser.blacklisted ? '⛔ SIM' : '✅ NÃO', inline: true }
            )
            .setColor('#FFA500');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`godmode_act_penalty_${targetId}`)
                .setLabel('Dar/Tirar Pena')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⚖️'),
            new ButtonBuilder()
                .setCustomId(`godmode_act_economy_${targetId}`)
                .setLabel('Editar Economia')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰'),
            new ButtonBuilder()
                .setCustomId(`godmode_act_item_${targetId}`)
                .setLabel('Dar/Tirar Item')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎒')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`godmode_act_refresh_${targetId}`)
                .setLabel('Atualizar')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId(`godmode_act_back_${targetId}`)
                .setLabel('Voltar ao Painel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
        );

        const payload = { embeds: [embed], components: [row1, row2], ephemeral: true };

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(payload);
        } else {
            await interaction.update(payload);
        }
    }
};
