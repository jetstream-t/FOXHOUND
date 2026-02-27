const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pix')
        .setDescription('Faça uma transferência instantânea para outro soldado')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('O soldado que receberá os suprimentos')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('quantidade')
                .setDescription('Quantidade de moedas a transferir')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        const target = interaction.options.getUser('usuario');
        const amount = interaction.options.getInteger('quantidade');
        const sender = interaction.user;

        // Configurações Anti-Alt e Segurança
        const MIN_ACCOUNT_AGE_DAYS = 7;
        const DAILY_TRANSFER_LIMIT = 50000;
        const DAILY_TRANSACTION_LIMIT_COUNT = 10;
        const now = Date.now();
        const todayStr = new Date().toISOString().split('T')[0];
        
        const senderAccountAge = (now - sender.createdTimestamp) / (1000 * 60 * 60 * 24);
        const targetAccountAge = (now - target.createdTimestamp) / (1000 * 60 * 60 * 24);

        if (senderAccountAge < MIN_ACCOUNT_AGE_DAYS) {
            return interaction.reply({ 
                content: `❌ **Acesso Negado.** Sua conta não possui as credenciais de tempo necessárias para realizar transferências externas.`, 
                ephemeral: true 
            });
        }

        if (targetAccountAge < MIN_ACCOUNT_AGE_DAYS) {
            return interaction.reply({ 
                content: `❌ **Operação Abortada.** O destinatário não possui autorização de segurança para receber suprimentos via rádio.`, 
                ephemeral: true 
            });
        }

        if (target.id === sender.id) {
            return interaction.reply({ content: '❌ Negativo. Você não pode transferir suprimentos para si mesmo.', ephemeral: true });
        }

        if (target.bot) {
            return interaction.reply({ content: '❌ Negativo. Alvos cibernéticos não aceitam Foxies.', ephemeral: true });
        }

        const senderData = await db.getUser(sender.id);
        const isGodMode = senderData.hideFromRank && senderData.wallet > 900000000;

        // Verificação de Limite Diário
        let currentDailyTotal = senderData.lastTransferDate === todayStr ? senderData.dailyTransferTotal : 0;
        let currentDailyCount = senderData.lastTransferDate === todayStr ? (senderData.dailyTransferCount || 0) : 0;
        
        if (!isGodMode) {
            if (currentDailyTotal + amount > DAILY_TRANSFER_LIMIT) {
                return interaction.reply({ 
                    content: `❌ **Operação Bloqueada.** Você atingiu o volume máximo de transferências permitido pelo protocolo de segurança para o ciclo atual (R$ ${DAILY_TRANSFER_LIMIT.toLocaleString()}). Tente novamente amanhã.`, 
                    ephemeral: true 
                });
            }

            if (currentDailyCount >= DAILY_TRANSACTION_LIMIT_COUNT) {
                return interaction.reply({ 
                    content: `❌ **Limite de Transações Atingido.** Você já realizou ${DAILY_TRANSACTION_LIMIT_COUNT} transferências hoje.\n💡 **Dica Tática:** Utilize o sistema bancário (/banco) ou empréstimos (/emprestimo) para movimentações maiores.`, 
                    ephemeral: true 
                });
            }
        }

        if (senderData.wallet < amount) {
            return interaction.reply({ content: `❌ Negativo. Você possui apenas **${senderData.wallet} moedas** em mãos.`, ephemeral: true });
        }

        // Calcular taxa
        let tax = Math.max(1, Math.floor(amount * 0.01));
        if (isGodMode) tax = 0;
        const finalAmount = amount - tax;

        // Mensagem de confirmação inicial
        const confirmEmbed = new EmbedBuilder()
            .setTitle('💸 Confirmar PIX')
            .setDescription(`**${sender}** deseja transferir **${amount.toLocaleString()} moedas** para **${target}**.\n\n` +
                `📥 **O destinatário receberá:** ${finalAmount.toLocaleString()} moedas\n` +
                `💰 **Taxa:** ${tax} moedas ${isGodMode ? '(Isento)' : ''}\n\n` +
                `⚠️ **Ambos devem clicar no botão abaixo para confirmar!**\n` +
                `⏱️ Tempo limite: 2 minutos`)
            .setColor(colors.warning);

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_transfer')
                .setLabel('✅ Confirmar')
                .setStyle(ButtonStyle.Success)
        );

        const confirmMsg = await interaction.reply({
            embeds: [confirmEmbed],
            components: [confirmRow],
            fetchReply: true
        });

        // Armazenar quem confirmou
        const confirmedUsers = new Set();

        const filter = i => i.customId === 'confirm_transfer' && 
            (i.user.id === sender.id || i.user.id === target.id);

        const collector = confirmMsg.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async i => {
            if (confirmedUsers.has(i.user.id)) {
                await i.reply({ content: '⚠️ Você já confirmou esta transferência!', ephemeral: true });
                return;
            }

            confirmedUsers.add(i.user.id);

            const confirmedCount = confirmedUsers.size;
            const neededCount = 2;

            if (confirmedCount < neededCount) {
                // Atualiza a mensagem mostrando quem confirmou
                const remaining = neededCount - confirmedCount;
                const updatedEmbed = new EmbedBuilder()
                    .setTitle('💸 Confirmar Transferência')
                    .setDescription(`**${sender}** deseja transferir **${amount.toLocaleString()} moedas** para **${target}**.\n\n` +
                        `📥 **O destinatário receberá:** ${finalAmount.toLocaleString()} moedas\n` +
                        `💰 **Taxa:** ${tax} moedas ${isGodMode ? '(Isento)' : ''}\n\n` +
                        `⚠️ **Aguardando confirmação de mais ${remaining} usuário(s)...**\n` +
                        `✅ Confirmado: ${Array.from(confirmedUsers).map(id => `<@${id}>`).join(', ')}\n` +
                        `⏱️ Tempo limite: 2 minutos`)
                    .setColor(colors.warning);

                await i.update({ embeds: [updatedEmbed] });
            } else {
                // Ambos confirmaram - processar transferência
                await i.update({ 
                    content: '✅ **Transferência confirmada por ambos!** Processando...', 
                    embeds: [], 
                    components: [] 
                });

                // Verificar saldo novamente
                const freshSender = await db.getUser(sender.id);
                if (freshSender.wallet < amount) {
                    await interaction.followUp({ content: `❌ Saldo insuficiente! Transferência cancelada.`, ephemeral: true });
                    collector.stop();
                    return;
                }

                // Processar transação
                await db.updateUser(sender.id, { 
                    wallet: freshSender.wallet - amount,
                    lastTransferDate: todayStr,
                    dailyTransferTotal: currentDailyTotal + amount,
                    dailyTransferCount: currentDailyCount + 1
                });

                const targetData = await db.getUser(target.id);
                await db.updateUser(target.id, { wallet: targetData.wallet + finalAmount });
                
                if (tax > 0) {
                    await db.addToVault(tax, sender.id);
                }

                const resultEmbed = new EmbedBuilder()
                    .setTitle('✅ PIX Realizado')
                    .setDescription(`A transferência foi concluída com sucesso!\n\n` +
                        `👤 **De:** ${sender}\n` +
                        `👤 **Para:** ${target}\n` +
                        `💰 **Valor Enviado:** ${amount.toLocaleString()} moedas\n` +
                        `📥 **Valor Recebido:** ${finalAmount.toLocaleString()} moedas\n` +
                        `🛡️ **Taxa:** ${tax} moedas ${isGodMode ? '(ISENTO)' : ''}`)
                    .setColor(colors.success)
                    .setTimestamp();

                await interaction.followUp({ embeds: [resultEmbed] });
                collector.stop();
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && confirmedUsers.size < 2) {
                try {
                    await confirmMsg.edit({ 
                        content: '⏱️ Tempo esgotado! Transferência cancelada.', 
                        embeds: [], 
                        components: [] 
                    });
                } catch (e) {}
            }
        });
    }
};
