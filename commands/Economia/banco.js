const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');

const jobs = require('../../jobs.json');

// Helper para pegar o limite do banco baseado no emprego
function getBankLimit(jobId) {
    const job = jobs.find(j => j.id === jobId) || jobs[0]; // Default: Desempregado
    return job.bankLimit || 5000;
}

// Helper para calcular limite de crédito
function getCreditLimit(user) {
    if (user.loan && user.loan.isDirty) return 0; // Nome sujo não tem crédito
    
    const bankLimit = getBankLimit(user.jobId);
    const netWorth = user.wallet + user.bank;
    const scoreMultiplier = (user.creditScore || 500) / 500; // 500 = 1x, 1000 = 2x
    
    // Limite = (30% do Limite do Banco + 10% do Patrimônio) * Multiplicador de Score
    let limit = ((bankLimit * 0.3) + (netWorth * 0.1)) * scoreMultiplier;
    
    return Math.floor(limit);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banco')
        .setDescription('Acesse o sistema bancário tático'),

    async execute(interaction) {
        const user = await db.getUser(interaction.user.id);
        const bankLimit = getBankLimit(user.jobId);
        const bankPercentage = Math.min(100, (user.bank / bankLimit) * 100).toFixed(1);
        
        let extraDesc = "";
        if (user.nextDepositUnlimited) {
            extraDesc = "\n🔓 **Protocolo Bancário Ativo:** Próximo depósito sem limite!";
        }

        const embed = new EmbedBuilder()
            .setTitle('🏦 Terminal Bancário Tático')
            .setDescription(`Seja bem-vindo ao sistema de armazenamento seguro.\n\n` +
                `💵 **Suprimentos em Mãos:** \`${user.wallet.toLocaleString()} Foxies\`\n` +
                `🏛️ **Reserva Estratégica:** \`${user.bank.toLocaleString()} / ${bankLimit.toLocaleString()} Foxies\`\n` +
                `📊 **Capacidade:** \`${bankPercentage}%\`` +
                extraDesc + `\n\n` +
                `*Atenção: Operações de saque possuem taxa de 2% para o cofre.*`)
            .setColor(colors.default);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('deposit_btn')
                    .setLabel('Depositar')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📥'),
                new ButtonBuilder()
                    .setCustomId('withdraw_btn')
                    .setLabel('Sacar')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('📤'),
                new ButtonBuilder()
                    .setCustomId('loan_menu_btn')
                    .setLabel('Empréstimo')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💸')
            );

        const response = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true,
            ephemeral: true
        });

        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Negativo. Você não tem autorização para operar este terminal.', ephemeral: true });
            }

            if (i.customId === 'loan_menu_btn') {
                const userData = await db.getUser(interaction.user.id);
                const loan = userData.loan || { amount: 0, isDirty: false, dueDate: 0 };
                const creditLimit = getCreditLimit(userData);
                
                // Verificar se dívida venceu (Verificação Preguiçosa)
                const now = Date.now();
                if (loan.amount > 0 && loan.dueDate < now && !loan.isDirty) {
                    loan.isDirty = true;
                    await db.updateUser(interaction.user.id, { 'loan.isDirty': true });
                }

                let status = "✅ Limpo";
                let blockReason = null;
                
                if (loan.isDirty) status = "❌ Sujo (Inadimplente)";
                else if (loan.amount > 0) status = "⚠️ Possui Dívida Ativa";

                // Verificação de Antecedentes Criminais (Penas)
                if (userData.wantedUntil > now) {
                    const remaining = userData.wantedUntil - now;
                    const hours = Math.floor(remaining / (1000 * 60 * 60));
                    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / 60000);
                    status = `🚫 Procurado (${hours}h ${minutes}m)`;
                    blockReason = "Cidadão procurado não tem acesso a crédito.";
                } else if (userData.workPenalty > 0) { 
                    status = `⛓️ Pena Ativa (${userData.workPenalty} trabalhos)`;
                    blockReason = "Presidiários não podem contrair empréstimos.";
                } else if (userData.robFailStreak >= 3) {
                     status = "⚠️ Alto Risco (Histórico Recente)";
                     // Não bloqueia totalmente, mas avisa? Ou bloqueia? O usuário pediu "qualquer tipo de pena".
                     // Vamos focar em wantedUntil e workPenalty (que costuma ser prisão em alguns sistemas, ou cooldown de trabalho falho).
                     // Se workPenalty for apenas cooldown de trabalho, talvez não seja "pena" judicial.
                     // Mas assumindo a lore, workPenalty muitas vezes vem de falha no crime.
                }

                const vaultBalance = await db.getVault();

                const loanEmbed = new EmbedBuilder()
                    .setTitle('💸 Sistema de Crédito & Empréstimos')
                    .setDescription(`Bem-vindo ao departamento de crédito. Aqui você pode solicitar fundos emergenciais.\n\n` +
                        `📊 **Score de Crédito:** \`${userData.creditScore || 500}\`\n` +
                        `📜 **Status do Nome:** ${status}\n\n` +
                        `💰 **Limite Aprovado:** \`${blockReason ? 0 : creditLimit.toLocaleString()} Foxies\`\n` +
                        `📉 **Dívida Atual:** \`${loan.amount.toLocaleString()} Foxies\`\n` +
                        (loan.amount > 0 ? `🗓️ **Vencimento:** <t:${Math.floor(loan.dueDate / 1000)}:R>\n` : "") +
                        `\n*Taxa de Juros: 10% fixo. Prazo: 7 dias.*\n` +
                        `*Fundo de Reserva Global Disponível: ${vaultBalance.toLocaleString()} Foxies*` +
                        (blockReason ? `\n\n🔴 **ACESSO NEGADO:** ${blockReason}` : ""))
                    .setColor(loan.isDirty || blockReason ? colors.error : colors.default);

                const loanRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('loan_request_btn').setLabel('Solicitar Empréstimo').setStyle(ButtonStyle.Success).setDisabled(loan.amount > 0 || loan.isDirty || !!blockReason),
                    new ButtonBuilder().setCustomId('loan_pay_btn').setLabel('Pagar Dívida').setStyle(ButtonStyle.Primary).setDisabled(loan.amount <= 0),
                    new ButtonBuilder().setCustomId('bank_back_btn').setLabel('Voltar').setStyle(ButtonStyle.Secondary)
                );

                await i.update({ embeds: [loanEmbed], components: [loanRow] });
                return;
            }

            if (i.customId === 'bank_back_btn') {
                await i.update({ embeds: [embed], components: [row] });
                return;
            }

            if (i.customId === 'loan_request_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('loan_request_modal')
                    .setTitle('💸 Solicitar Empréstimo');

                const amountInput = new TextInputBuilder()
                    .setCustomId('amount')
                    .setLabel('Valor Desejado')
                    .setPlaceholder(`Máximo: ${getCreditLimit(await db.getUser(i.user.id))}`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                await i.showModal(modal);
                
                const submitted = await i.awaitModalSubmit({
                    time: 60000,
                    filter: m => m.customId === 'loan_request_modal' && m.user.id === i.user.id,
                }).catch(() => null);

                if (submitted) {
                    const amount = parseInt(submitted.fields.getTextInputValue('amount'));
                    const userData = await db.getUser(submitted.user.id);
                    const limit = getCreditLimit(userData);

                    if (isNaN(amount) || amount <= 0) return submitted.reply({ content: '❌ Valor inválido.', ephemeral: true });
                    if (amount > limit) return submitted.reply({ content: `❌ Crédito negado. Seu limite é **${limit.toLocaleString()}**.`, ephemeral: true });
                    if (userData.loan && userData.loan.amount > 0) return submitted.reply({ content: '❌ Você já possui um empréstimo ativo.', ephemeral: true });

                    // Tenta remover do cofre global
                    const vaultSuccess = await db.removeFromVault(amount);
                    if (!vaultSuccess) return submitted.reply({ content: '❌ O Fundo de Reserva Global está sem Foxies suficientes para este empréstimo no momento.', ephemeral: true });

                    const interest = Math.ceil(amount * 0.10);
                    const totalDue = amount + interest;
                    const dueDate = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 dias

                    await db.updateUser(submitted.user.id, {
                        bank: userData.bank + amount,
                        loan: {
                            amount: totalDue,
                            originalAmount: amount,
                            dueDate: dueDate,
                            interestRate: 0.10,
                            isDirty: false
                        }
                    });

                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Empréstimo Aprovado')
                        .setDescription(`Recebemos sua solicitação e liberamos **${amount.toLocaleString()} Foxies** na sua conta bancária.\n\n` +
                            `🏦 **Origem:** Fundo de Reserva Global\n` +
                            `📉 **Total a Pagar:** ${totalDue.toLocaleString()}\n` +
                            `🗓️ **Vencimento:** <t:${Math.floor(dueDate / 1000)}:F>`)
                        .setColor(colors.success);

                    await submitted.reply({ embeds: [successEmbed], ephemeral: true });
                }
                return;
            }

            if (i.customId === 'loan_pay_btn') {
                const userData = await db.getUser(i.user.id);
                const loan = userData.loan;
                
                if (!loan || loan.amount <= 0) return i.reply({ content: '❌ Você não tem dívidas.', ephemeral: true });

                const totalToPay = loan.amount;
                // Tenta pagar com wallet primeiro, depois bank
                let paid = false;
                let method = "";

                if (userData.wallet >= totalToPay) {
                    await db.updateUser(i.user.id, {
                        wallet: userData.wallet - totalToPay,
                        'loan.amount': 0,
                        'loan.isDirty': false,
                        creditScore: Math.min(1000, (userData.creditScore || 500) + 10) // +10 Score
                    });
                    paid = true;
                    method = "Carteira";
                } else if (userData.bank >= totalToPay) {
                    await db.updateUser(i.user.id, {
                        bank: userData.bank - totalToPay,
                        'loan.amount': 0,
                        'loan.isDirty': false,
                        creditScore: Math.min(1000, (userData.creditScore || 500) + 10)
                    });
                    paid = true;
                    method = "Banco";
                } else {
                    return i.reply({ content: `❌ Fundos insuficientes. Você precisa de **${totalToPay.toLocaleString()}** na carteira ou no banco.`, ephemeral: true });
                }

                if (paid) {
                    // Devolve o valor total (principal + juros) para o cofre global
                    await db.addToVault(totalToPay, i.user.id);

                    await i.reply({ 
                        embeds: [new EmbedBuilder()
                            .setTitle('✅ Dívida Quitada')
                            .setDescription(`Você pagou **${totalToPay.toLocaleString()}** usando seu saldo do **${method}**.\n` +
                                `O valor foi retornado ao Fundo de Reserva Global.\n` +
                                `Seu nome está limpo e seu Score aumentou!`)
                            .setColor(colors.success)
                        ],
                        ephemeral: true
                    });
                }
                return;
            }

            const isDeposit = i.customId === 'deposit_btn';
            
            const modal = new ModalBuilder()
                .setCustomId(isDeposit ? 'deposit_modal' : 'withdraw_modal')
                .setTitle(isDeposit ? '📥 Efetuar Depósito' : '📤 Efetuar Saque');

            const amountInput = new TextInputBuilder()
                .setCustomId('amount')
                .setLabel(isDeposit ? 'Quanto deseja depositar?' : 'Quanto deseja sacar?')
                .setPlaceholder('Digite um valor ou "tudo"')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(20);

            const firstActionRow = new ActionRowBuilder().addComponents(amountInput);
            modal.addComponents(firstActionRow);

            await i.showModal(modal);

            const submitted = await i.awaitModalSubmit({
                time: 60000,
                filter: m => m.customId === (isDeposit ? 'deposit_modal' : 'withdraw_modal') && m.user.id === i.user.id,
            }).catch(() => null);

            if (submitted) {
                const amountRaw = submitted.fields.getTextInputValue('amount').toLowerCase();
                const userData = await db.getUser(submitted.user.id);
                const bankLimit = getBankLimit(userData.jobId);
                const isGodMode = userData.hideFromRank && userData.wallet > 900000000;
                let amount;

                if (amountRaw === 'tudo') {
                    if (isDeposit) {
                         if (userData.nextDepositUnlimited || isGodMode) {
                             amount = userData.wallet; // Pode depositar tudo sem limite
                         } else {
                             const spaceAvailable = bankLimit - userData.bank;
                             if (spaceAvailable <= 0) {
                                 return submitted.reply({ content: '❌ Seu banco já está cheio! Evolua sua patente para guardar mais.', ephemeral: true });
                             }
                             amount = Math.min(userData.wallet, spaceAvailable);
                         }
                    } else {
                         amount = userData.bank;
                    }
                } else {
                    amount = parseInt(amountRaw);
                }

                if (isNaN(amount) || amount <= 0) {
                    return submitted.reply({ content: '❌ Erro no processamento. Insira um valor numérico válido ou "tudo".', ephemeral: true });
                }

                const pets = require('../../pets.json');
                const activePet = await db.getActivePet(interaction.user.id);

                if (isDeposit) {
                    if (userData.wallet < amount) {
                        return submitted.reply({ content: `❌ Negativo. Você não possui **${amount} Foxies** em seus suprimentos atuais.`, ephemeral: true });
                    }
                    
                    // Verifica limite APENAS se não tiver o buff e não for God Mode
                    if (!userData.nextDepositUnlimited && !isGodMode) {
                        if (userData.bank + amount > bankLimit) {
                             const spaceAvailable = bankLimit - userData.bank;
                             return submitted.reply({ content: `❌ Capacidade Excedida. Você só pode guardar mais **${spaceAvailable.toLocaleString()} Foxies** no banco.`, ephemeral: true });
                        }
                    }

                    // Prepara updates
                    const updates = {
                        wallet: userData.wallet - amount,
                        bank: userData.bank + amount
                    };

                    // Consome o buff se existir
                    let buffMsg = "";
                    if (userData.nextDepositUnlimited) {
                        updates.nextDepositUnlimited = false;
                        buffMsg = "\n🔓 **Protocolo Bancário Utilizado!** Limite ignorado nesta transação.";
                    }

                    await db.updateUser(submitted.user.id, updates);

                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Operação Concluída')
                        .setDescription(`Você transferiu **${amount} Foxies** para a reserva estratégica.` + buffMsg)
                        .setColor(colors.success);

                    await submitted.reply({ embeds: [successEmbed], ephemeral: true });
                } else {
                    if (userData.bank < amount) {
                        return submitted.reply({ content: `❌ Negativo. Sua reserva estratégica possui apenas **${userData.bank} Foxies**.`, ephemeral: true });
                    }

                    // --- CONFIRMAÇÃO DE ALTO VALOR (>= 50.000) ---
                    if (amount >= 50000) {
                        const confirmEmbed = new EmbedBuilder()
                            .setTitle('⚠️ Confirmação de Saque Elevado')
                            .setDescription(`Você solicitou um saque de **${amount.toLocaleString()} Foxies**.\nDeseja confirmar esta operação?`)
                            .setColor(colors.warning);

                        const confirmRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('confirm_withdraw_high').setLabel('Confirmar Saque').setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId('cancel_withdraw_high').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
                        );

                        const confirmMsg = await submitted.reply({
                            embeds: [confirmEmbed],
                            components: [confirmRow],
                            ephemeral: true,
                            fetchReply: true
                        });

                        try {
                            const confirmation = await confirmMsg.awaitMessageComponent({
                                filter: i => i.user.id === submitted.user.id && ['confirm_withdraw_high', 'cancel_withdraw_high'].includes(i.customId),
                                time: 30000
                            });

                            if (confirmation.customId === 'cancel_withdraw_high') {
                                await confirmation.update({ content: '❌ Operação de saque cancelada.', embeds: [], components: [] });
                                return;
                            }

                            // Se confirmou, atualiza a interação para evitar "Unknown interaction" depois
                            await confirmation.deferUpdate(); 
                            // Continua o fluxo normal (mas agora usando editReply no submitted ou followUp)
                            // Como já respondemos (submitted.reply), precisamos usar editReply ou deleteReply + followUp.
                            // Mas o código abaixo usa 'submitted.reply' novamente? Não, o código original usava 'submitted.reply' no final?
                            // Vamos ver o código original.
                            
                            // O código original faz:
                            // ... calculos ...
                            // await submitted.reply({ embeds: [successEmbed] });
                            
                            // Como já usamos submitted.reply para a confirmação, precisamos mudar para submitted.editReply ou followUp.
                            // Vamos ajustar o código abaixo para usar 'followUp' ou 'editReply' se já tiver respondido.
                        } catch (e) {
                            await submitted.editReply({ content: '❌ Tempo esgotado. Saque cancelado.', embeds: [], components: [] });
                            return;
                        }
                    }

                    // isGodMode já foi declarado no início do bloco
                let taxRate = 0.02; // 2% base
                let taxDesc = "";
                
                if (isGodMode) {
                    taxRate = 0;
                    taxDesc = "\n🛡️ **Isenção Tática:** Taxa anulada (Protocolo Fantasma).";
                }

                // Verificar passivas de redução de taxa
                if (!isGodMode && activePet && activePet.energy > 0) {
                        const template = pets.find(p => p.id === activePet.petId);
                        if (template) {
                            const level = activePet.level || 1;
                            const activePassives = [];
                            if (level >= 1 && template.passive.n1) activePassives.push(template.passive.n1);
                            if (level >= 5 && template.passive.n5) activePassives.push(template.passive.n5);
                            if (level >= 10 && template.passive.n10) activePassives.push(template.passive.n10);

                            for (const p of activePassives) {
                                // Porco Guardião N5: Reduz taxa de saque
                                if (p.type === 'bank_fee_reduce') {
                                    // Reduz a taxa em X% (ex: 10% de 2% = 0.2% a menos)
                                    // taxRate = 0.02 * (1 - 0.10) = 0.018
                                    taxRate = taxRate * (1 - p.value);
                                    taxDesc += `\n🐷 **${activePet.name}** reduziu a taxa em ${(p.value * 100).toFixed(0)}%!`;
                                }
                                
                                // Cão de Guerra Cibernético N5: Bônus leve (Redução extra de taxa)
                                if (p.type === 'bank_bonus_light') {
                                    // Vamos interpretar como 5% de redução da taxa também, acumulativo
                                    taxRate = taxRate * (1 - p.value); 
                                    taxDesc += `\n🦿 **${activePet.name}** otimizou a transação (-${(p.value * 100).toFixed(0)}% taxa).`;
                                }
                            }
                        }
                    }
                    
                    if (taxRate < 0) taxRate = 0;

                    const tax = Math.floor(amount * taxRate);
                    const finalAmount = amount - tax;

                    await db.updateUser(submitted.user.id, {
                        wallet: userData.wallet + finalAmount,
                        bank: userData.bank - amount
                    });

                    if (tax > 0) {
                    await db.addToVault(tax, submitted.user.id);
                }

                    const withdrawEmbed = new EmbedBuilder()
                        .setTitle('📤 Saque Efetuado')
                        .setDescription(`Você retirou **${finalAmount} Foxies** da reserva.\n` +
                            `Uma taxa de **${tax} Foxies** foi recolhida para o cofre de guerra.` + taxDesc)
                        .setColor(colors.success);

                    if (submitted.replied || submitted.deferred) {
                        await submitted.editReply({ embeds: [withdrawEmbed], components: [] });
                    } else {
                        await submitted.reply({ embeds: [withdrawEmbed] });
                    }
                }
                
                const updatedUser = await db.getUser(interaction.user.id);
                const updatedBankLimit = getBankLimit(updatedUser.jobId);
                const updatedPercentage = Math.min(100, (updatedUser.bank / updatedBankLimit) * 100).toFixed(1);

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('🏦 Terminal Bancário Tático')
                    .setDescription(`Seja bem-vindo ao sistema de armazenamento seguro da FOXHOUND.\n\n` +
                        `💵 **Suprimentos em Mãos:** \`${updatedUser.wallet.toLocaleString()} Foxies\`\n` +
                        `🏛️ **Reserva Estratégica:** \`${updatedUser.bank.toLocaleString()} / ${updatedBankLimit.toLocaleString()} Foxies\`\n` +
                        `📊 **Capacidade:** \`${updatedPercentage}%\`\n\n` +
                        `*Atenção: Operações de saque possuem taxa de 2% para o cofre de guerra.*`)
                    .setColor(colors.default);
                
                await interaction.editReply({ embeds: [updatedEmbed] }).catch(() => {});
            }
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => {});
        });
    },

    async executePrefix(message, args) {
        // Verificar permissões básicas de envio de mensagem antes de tudo
        if (message.guild && !message.channel.permissionsFor(message.guild.members.me).has('SendMessages')) {
             console.warn(`[PERMISSÃO] Sem permissão de enviar mensagens no canal ${message.channel.name} (${message.channel.id})`);
             return; // Não pode fazer nada
        }

        const sub = args[0]?.toLowerCase();
        const amountRaw = args[1]?.toLowerCase();
        
        try {
            const userData = await db.getUser(message.author.id);
            const bankLimit = getBankLimit(userData.jobId);
            const bankPercentage = Math.min(100, (userData.bank / bankLimit) * 100).toFixed(1);

            if (!sub || !['depositar', 'sacar', 'dep', 'saq'].includes(sub)) {
                let extraDesc = "";
                if (userData.nextDepositUnlimited) {
                    extraDesc = "\n🔓 **Protocolo Bancário Ativo:** Próximo depósito sem limite!";
                }

                const embed = new EmbedBuilder()
                    .setTitle('🏦 Terminal Bancário Tático')
                    .setDescription(`💵 **Suprimentos em Mãos:** \`${userData.wallet.toLocaleString()} Foxies\`\n` +
                        `🏛️ **Reserva Estratégica:** \`${userData.bank.toLocaleString()} / ${bankLimit.toLocaleString()} Foxies\`\n` +
                        `📊 **Capacidade:** \`${bankPercentage}%\`` + 
                        extraDesc + `\n\n` +
                        `Use \`f!banco depositar <valor>\` ou \`f!banco sacar <valor>\`.\n` +
                        `*Dica: Você pode usar "tudo" como parâmetro.*`)
                    .setColor(colors.default);
                
                return message.reply({ embeds: [embed] }).catch(err => console.error("Erro ao responder banco:", err.message));
            }

            if (!amountRaw) return message.reply(`❌ Soldado, especifique o valor da operação. Ex: \`f!banco ${sub} 100\``).catch(() => {});

            let amount;
            const isDeposit = ['depositar', 'dep'].includes(sub);

            if (amountRaw === 'tudo') {
                if (isDeposit) {
                     if (userData.nextDepositUnlimited) {
                         amount = userData.wallet;
                     } else {
                         const spaceAvailable = bankLimit - userData.bank;
                         if (spaceAvailable <= 0) return message.reply('❌ Seu banco já está cheio!').catch(() => {});
                         amount = Math.min(userData.wallet, spaceAvailable);
                     }
                } else {
                     amount = userData.bank;
                }
            } else {
                amount = parseInt(amountRaw);
            }

            if (isNaN(amount) || amount <= 0) return message.reply('❌ Valor de suprimentos inválido.').catch(() => {});

            if (isDeposit) {
                if (userData.wallet < amount) return message.reply(`❌ Negativo. Suprimentos insuficientes na carteira.`).catch(() => {});
                
                if (!userData.nextDepositUnlimited) {
                    if (userData.bank + amount > bankLimit) {
                         const spaceAvailable = bankLimit - userData.bank;
                         return message.reply(`❌ Capacidade Excedida. Espaço livre: **${spaceAvailable.toLocaleString()} Foxies**.`).catch(() => {});
                    }
                }

                const updates = {
                    wallet: userData.wallet - amount,
                    bank: userData.bank + amount
                };
                
                let buffMsg = "";
                if (userData.nextDepositUnlimited) {
                    updates.nextDepositUnlimited = false;
                    buffMsg = " (Protocolo Bancário utilizado: Limite ignorado)";
                }

                await db.updateUser(message.author.id, updates);
                message.reply(`✅ Operação concluída. **${amount} Foxies** enviadas para a reserva${buffMsg}.`).catch(() => {});
            } else {
                if (userData.bank < amount) return message.reply(`❌ Negativo. Reserva estratégica insuficiente.`).catch(() => {});
                
                const isGodMode = userData.hideFromRank && userData.wallet > 900000000;
                let tax = Math.floor(amount * 0.02);
                if (isGodMode) tax = 0;

                const finalAmount = amount - tax;
                await db.updateUser(message.author.id, {
                    wallet: userData.wallet + finalAmount,
                    bank: userData.bank - amount
                });
                if (tax > 0) await db.addToVault(tax, message.author.id);
                message.reply(`📤 Saque efetuado. **${finalAmount} Foxies** em mãos (Taxa de guerra: ${tax}${isGodMode ? ' [ISENTO]' : ''}).`).catch(() => {});
            }
        } catch (error) {
            console.error("Erro ao executar banco prefix:", error);
            message.reply("❌ Ocorreu um erro ao processar sua transação.").catch(() => {});
        }
    }
};
