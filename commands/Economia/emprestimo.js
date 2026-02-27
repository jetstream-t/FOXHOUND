const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, StringSelectMenuBuilder, UserSelectMenuBuilder } = require('discord.js');
const { User, GlobalConfig } = require('../../database');
let colors;
try {
    colors = require('../../colors.json');
} catch (e) {
    colors = {
        default: "#1B4D3E",
        success: "#2ECC71",
        warning: "#F1C40F",
        error: "#8B0000",
        info: "#3498DB",
        danger: "#E74C3C",
        gold: "#FFD700"
    };
}
const crypto = require('crypto');

// Polyfill para randomUUID em ambientes antigos (Node < 15.6.0)
if (!crypto.randomUUID) {
    crypto.randomUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };
}

// Mapas temporários para gerenciar estados de negociação
const activeLoanRequests = new Map(); // Key: borrowerId_lenderId, Value: { amount, interest, deadline, ... }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('emprestimo')
        .setDescription('Painel do sistema de empréstimos.'),

    async execute(interaction) {
        const user = interaction.user;
        const userDoc = await User.findOne({ userId: user.id });

        if (!userDoc) return interaction.reply({ content: '❌ Você não possui registro no banco.', flags: 64 });

        // Verificar dívida ativa (Banco ou Players)
        const loan = userDoc.loan || {};
        const isBankLoan = loan.amount > 0 && !loan.lenderId;
        const isPlayerLoan = loan.active;
        const hasDebt = isBankLoan || isPlayerLoan;

        let debtStatus = 'Nenhuma';
        let debtAmount = '-';

        if (hasDebt) {
            if (isBankLoan) {
                debtStatus = loan.isDirty ? '🔴 VENCIDA (Banco)' : '🟢 EM DIA (Banco)';
                debtAmount = `R$ ${loan.amount.toLocaleString('pt-BR')}`;
            } else {
                debtStatus = loan.status === 'overdue' ? '🔴 VENCIDA' : '🟢 EM DIA';
                debtAmount = `R$ ${(loan.totalToPay - loan.amountPaid).toLocaleString('pt-BR')}`;
            }
        }

        // Verificar devedores (pessoas que devem a este usuário)
        // Isso pode ser custoso se houver muitos usuários, mas por enquanto vamos fazer uma busca simples
        // Precisamos buscar usuários onde loan.lenderId == user.id e loan.active == true
        // Como loan é subdocumento, a query é 'loan.lenderId': user.id
        const debtors = await User.find({ 'loan.lenderId': user.id, 'loan.active': true });
        const debtorsCount = debtors.length;
        const totalReceivable = debtors.reduce((acc, doc) => acc + (doc.loan.totalToPay - doc.loan.amountPaid), 0);

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle('🏦 Gestão de Empréstimos')
            .setDescription(`Gerencie suas dívidas e cobranças em um só lugar.`)
            .addFields(
                { name: '📊 Score de Crédito', value: `**${userDoc.creditScore}**`, inline: true },
                { name: '📉 Minha Dívida', value: `**${debtStatus}**\n${debtAmount}`, inline: true },
                { name: '💰 A Receber', value: `**${debtorsCount} devedores**\nR$ ${totalReceivable.toLocaleString('pt-BR')}`, inline: true }
            )
            .setFooter({ text: 'Use os botões abaixo para navegar.' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('loan_status')
                    .setLabel('Minha Dívida')
                    .setStyle(hasDebt ? (userDoc.loan.status === 'overdue' ? ButtonStyle.Danger : ButtonStyle.Primary) : ButtonStyle.Secondary)
                    .setEmoji('📜')
                    .setDisabled(!hasDebt),
                new ButtonBuilder()
                    .setCustomId('loan_debtors')
                    .setLabel('Cobrar / Perdoar')
                    .setStyle(debtorsCount > 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setEmoji('💸')
                    .setDisabled(debtorsCount === 0),
                new ButtonBuilder()
                    .setCustomId('loan_history')
                    .setLabel('Histórico')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📅'),
                new ButtonBuilder()
                    .setCustomId('loan_request_start')
                    .setLabel('Pedir Empréstimo')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🤝')
            );

        await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    },

    async handleButton(interaction) {
        const { customId } = interaction;
        const userDoc = await User.findOne({ userId: interaction.user.id });

        if (customId === 'loan_status') {
            await this.showStatus(interaction, userDoc);
        } else if (customId === 'loan_debtors') {
            await this.showDebtorsMenu(interaction);
        } else if (customId === 'loan_history') {
            await this.showHistory(interaction, userDoc);
        } else if (customId === 'loan_request_start') {
             await this.showLenderSelection(interaction);
        } else if (customId === 'loan_pay_full') {
            if (!userDoc.loan || !userDoc.loan.active) return interaction.reply({ content: '❌ Nenhuma dívida ativa.', flags: 64 });
            const remaining = userDoc.loan.totalToPay - userDoc.loan.amountPaid;
            await this.processPayment(interaction, userDoc, remaining);
        } else if (customId === 'loan_pay_installment') {
            if (!userDoc.loan || !userDoc.loan.active) return interaction.reply({ content: '❌ Nenhuma dívida ativa.', flags: 64 });
            if (!userDoc.loan.installments || userDoc.loan.installments <= 0) return interaction.reply({ content: '❌ Este empréstimo não é parcelado.', flags: 64 });
            
            const installmentValue = Math.ceil(userDoc.loan.totalToPay / userDoc.loan.installments);
            const remaining = userDoc.loan.totalToPay - userDoc.loan.amountPaid;
            const amountToPay = Math.min(installmentValue, remaining); // Não pagar mais que o restante
            
            await this.processPayment(interaction, userDoc, amountToPay, true);
        } else if (customId === 'loan_pay_partial') {
            await this.showPayPartialModal(interaction);
        } else if (customId.startsWith('loan_remind_')) {
            const debtorId = customId.split('_')[2];
            await this.remindDebtorButton(interaction, debtorId);
        } else if (customId.startsWith('loan_forgive_')) {
            const debtorId = customId.split('_')[2];
            await this.forgiveLoanButton(interaction, debtorId);
        } else if (customId.startsWith('loan_define_terms_')) {
            const requestId = customId.replace('loan_define_terms_', '');
            await this.handleLoanDefineTerms(interaction, requestId);
        } else if (customId.startsWith('loan_agree_')) {
            const requestId = customId.replace('loan_agree_', '');
            await this.processLoanAccept(interaction, requestId);
        } else if (customId.startsWith('loan_refuse_')) {
            const requestId = customId.replace('loan_refuse_', '');
            activeLoanRequests.delete(requestId);
            await interaction.update({ content: '❌ Proposta recusada.', components: [] });
        } else if (customId.startsWith('loan_reject_')) {
             // Lender rejected initial request
             const requestId = customId.replace('loan_reject_', '');
             const request = activeLoanRequests.get(requestId);
             if (request) {
                 const borrower = await interaction.client.users.fetch(request.borrowerId).catch(() => null);
                 if (borrower) borrower.send(`❌ **${interaction.user.username}** recusou sua solicitação de empréstimo.`);
                 activeLoanRequests.delete(requestId);
             }
             await interaction.update({ content: '❌ Solicitação recusada.', components: [] });
        }
    },

    async handleSelect(interaction) {
        const { customId, values } = interaction;

        if (customId === 'loan_select_debtor') {
            const debtorId = values[0];
            await this.showDebtorActions(interaction, debtorId);
        } else if (customId === 'loan_select_lender') {
            const lenderId = values[0];
            await this.handleLoanRequestButton(interaction, lenderId);
        }
    },

    async showLenderSelection(interaction) {
        const row = new ActionRowBuilder()
            .addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('loan_select_lender')
                    .setPlaceholder('Selecione o Agiota')
                    .setMaxValues(1)
            );

        await interaction.reply({ content: '🔍 **Quem será o seu credor?** Selecione o usuário abaixo.', components: [row], flags: 64 });
    },

    async showDebtorsMenu(interaction) {
        const user = interaction.user;
        const debtors = await User.find({ 'loan.lenderId': user.id, 'loan.active': true });

        if (debtors.length === 0) {
            return interaction.reply({ content: '✅ Você não tem valores a receber.', flags: 64 });
        }

        const options = [];
        for (const debtor of debtors) {
            let debtorName = debtor.userId;
            try {
                const u = await interaction.client.users.fetch(debtor.userId);
                debtorName = u.username;
            } catch (e) {}

            options.push({
                label: debtorName,
                description: `Deve R$ ${(debtor.loan.totalToPay - debtor.loan.amountPaid).toLocaleString('pt-BR')}`,
                value: debtor.userId
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('loan_select_debtor')
                    .setPlaceholder('Selecione um devedor para gerenciar')
                    .addOptions(options.slice(0, 25)) // Limite do Discord
            );

        await interaction.update({ embeds: [], components: [row], content: '📋 **Seus Devedores:**' });
    },

    async showDebtorActions(interaction, debtorId) {
        const debtorDoc = await User.findOne({ userId: debtorId });
        if (!debtorDoc || !debtorDoc.loan || !debtorDoc.loan.active) {
            return interaction.update({ content: '❌ Este usuário não possui mais dívidas ativas com você.', embeds: [], components: [] });
        }

        const debtorUser = await interaction.client.users.fetch(debtorId).catch(() => ({ username: 'Desconhecido' }));
        const loan = debtorDoc.loan;
        const isOverdue = loan.status === 'overdue';

        let statusText = isOverdue ? '**ATRASADO**' : 'Em dia';
        if (loan.installments && loan.installments > 0) {
            statusText += `\n📦 Parcelas: ${loan.installmentsPaid}/${loan.installments}`;
        }

        const embed = new EmbedBuilder()
            .setColor(isOverdue ? colors.danger : colors.info)
            .setTitle(`💸 Gerenciar Dívida: ${debtorUser.username}`)
            .addFields(
                { name: '💰 Valor a Receber', value: `R$ ${(loan.totalToPay - loan.amountPaid).toLocaleString('pt-BR')}`, inline: true },
                { name: '📅 Vencimento', value: `<t:${Math.floor(loan.deadline / 1000)}:R>`, inline: true },
                { name: '📊 Status', value: statusText, inline: true }
            );

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`loan_remind_${debtorId}`)
                    .setLabel('Cobrar (Enviar DM)')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📢'),
                new ButtonBuilder()
                    .setCustomId(`loan_forgive_${debtorId}`)
                    .setLabel('Perdoar Dívida')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🤝')
            );
        
        const backRow = new ActionRowBuilder()
             .addComponents(
                 new ButtonBuilder()
                     .setCustomId('loan_debtors') // Volta para lista
                     .setLabel('Voltar')
                     .setStyle(ButtonStyle.Secondary)
             );

        await interaction.update({ embeds: [embed], components: [row, backRow], content: null });
    },

    async remindDebtorButton(interaction, debtorId) {
        const lenderDoc = await User.findOne({ userId: interaction.user.id });
        const borrowerDoc = await User.findOne({ userId: debtorId });

        if (!borrowerDoc || !borrowerDoc.loan || !borrowerDoc.loan.active || borrowerDoc.loan.lenderId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Este usuário não te deve nada.', flags: 64 });
        }

        try {
            const targetUser = await interaction.client.users.fetch(debtorId);
            const loan = borrowerDoc.loan;
            let msg = `⚠️ **COBRANÇA**\n<@${interaction.user.id}> está lembrando você de pagar seu empréstimo!\nValor: R$ ${(loan.totalToPay - loan.amountPaid).toLocaleString('pt-BR')}\nVencimento: <t:${Math.floor(loan.deadline / 1000)}:R>`;
            
            if (loan.installments && loan.installments > 0) {
                msg += `\n📦 Parcelas: ${loan.installmentsPaid}/${loan.installments}`;
            }

            await targetUser.send(msg);
            await interaction.reply({ content: `✅ Cobrança enviada para **${targetUser.username}**.`, flags: 64 });
        } catch (e) {
            await interaction.reply({ content: `❌ Não foi possível enviar DM para o usuário (DM fechada?).`, flags: 64 });
        }
    },

    async forgiveLoanButton(interaction, debtorId) {
        const lenderDoc = await User.findOne({ userId: interaction.user.id });
        const borrowerDoc = await User.findOne({ userId: debtorId });

        if (!borrowerDoc || !borrowerDoc.loan || !borrowerDoc.loan.active || borrowerDoc.loan.lenderId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Este usuário não te deve nada.', flags: 64 });
        }

        borrowerDoc.loan = { active: false };
        await borrowerDoc.save();

        // Atualizar histórico do lender
        const historyItem = lenderDoc.loanHistory.find(h => h.id === borrowerDoc.loan.id);
        if (historyItem) historyItem.status = 'forgiven';
        await lenderDoc.save();

        const targetUser = await interaction.client.users.fetch(debtorId).catch(() => null);
        
        await interaction.update({ content: `✅ Você perdoou a dívida. Que alma caridosa!`, embeds: [], components: [] });
        
        if (targetUser) {
            try {
                await targetUser.send(`🎉 **Boas Notícias!**\n<@${interaction.user.id}> perdoou sua dívida! Você está livre.`);
            } catch (e) {}
        }
    },

    async showHistory(interaction, userDoc) {
        if (!userDoc.loanHistory || userDoc.loanHistory.length === 0) {
            return interaction.reply({ content: '📜 Nenhum histórico de empréstimos encontrado.', flags: 64 });
        }

        const history = userDoc.loanHistory.slice(-5).reverse(); // Últimos 5
        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle('📜 Histórico de Empréstimos (Últimos 5)')
            .setDescription(history.map(h => {
                const date = new Date(h.date).toLocaleDateString('pt-BR');
                const role = h.role === 'lender' ? 'Emprestou' : 'Pegou';
                const statusMap = { 'active': 'Ativo', 'paid': 'Pago', 'overdue': 'Atrasado', 'forgiven': 'Perdoado' };
                return `• **${role}**: R$ ${h.amount.toLocaleString('pt-BR')} (${statusMap[h.status] || h.status}) em ${date}`;
            }).join('\n'));

        await interaction.reply({ embeds: [embed], flags: 64 });
    },

    async handleLoanRequestButton(interaction, targetUserId) {
        const borrower = interaction.user;
        const lenderId = targetUserId;

        // Validações Iniciais
        if (borrower.id === lenderId) {
            return interaction.reply({ content: '❌ Você não pode pedir empréstimo para si mesmo.', flags: 64 });
        }

        const borrowerDoc = await User.findOne({ userId: borrower.id });
        const lenderDoc = await User.findOne({ userId: lenderId });

        if (!lenderDoc) {
            return interaction.reply({ content: '❌ O usuário alvo não tem conta no banco.', flags: 64 });
        }

        // Verifica se já tem empréstimo ativo
        if (borrowerDoc.loan && borrowerDoc.loan.active) {
            return interaction.reply({ content: '❌ Você já possui um empréstimo ativo! Pague-o antes de pedir outro.', flags: 64 });
        }
        
        // Verifica se tem nome sujo
        if (borrowerDoc.loan && borrowerDoc.loan.status === 'overdue') {
            return interaction.reply({ content: '❌ Seu nome está sujo na praça! Pague suas dívidas atrasadas primeiro.', flags: 64 });
        }

        // Score Mínimo
        if (borrowerDoc.creditScore < 300) {
             return interaction.reply({ content: '❌ Seu Score de Crédito é muito baixo para pedir empréstimos.', flags: 64 });
        }

        // Modal de Solicitação
        const modal = new ModalBuilder()
            .setCustomId(`loan_modal_${lenderId}`)
            .setTitle('Solicitação de Empréstimo');

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel("Valor do Empréstimo (R$)")
            .setPlaceholder("Ex: 5000")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));

        await interaction.showModal(modal);
    },

    // Processa o Modal (Mutuário solicitou valor)
    async handleLoanModal(interaction, lenderId) {
        const amount = parseInt(interaction.fields.getTextInputValue('amount'));

        // Validações
        if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ Valor inválido.', flags: 64 });

        const lenderUser = await interaction.client.users.fetch(lenderId);
        
        // Armazena solicitação inicial
        const requestId = `${interaction.user.id}_${lenderId}`;
        activeLoanRequests.set(requestId, {
            borrowerId: interaction.user.id,
            lenderId: lenderId,
            amount,
            status: 'pending_terms',
            timestamp: Date.now()
        });

        // Envia solicitação para o Agiota
        const embed = new EmbedBuilder()
            .setColor(colors.warning)
            .setTitle('📑 Solicitação de Empréstimo')
            .setDescription(`**${interaction.user.username}** está pedindo dinheiro emprestado.`)
            .addFields(
                { name: '💰 Valor Solicitado', value: `R$ ${amount.toLocaleString('pt-BR')}`, inline: true }
            )
            .setFooter({ text: 'Defina os juros e o prazo para continuar.' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`loan_define_terms_${requestId}`)
                    .setLabel('Definir Termos')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`loan_reject_${requestId}`)
                    .setLabel('Recusar')
                    .setStyle(ButtonStyle.Danger)
            );

        // Tenta enviar DM para o lender
        try {
            await lenderUser.send({ embeds: [embed], components: [row] });
            await interaction.reply({ content: `✅ Solicitação de **R$ ${amount.toLocaleString('pt-BR')}** enviada para **${lenderUser.username}**! Aguarde ele definir os termos.`, flags: 64 });
        } catch (e) {
            return interaction.reply({ content: `❌ Não foi possível enviar a solicitação para **${lenderUser.username}** (DM fechada?).`, flags: 64 });
        }
    },

    // Agiota clica em "Definir Termos"
    async handleLoanDefineTerms(interaction, requestId) {
        if (interaction.replied || interaction.deferred) return;

        const request = activeLoanRequests.get(requestId);
        if (!request) return interaction.reply({ content: '❌ Solicitação expirada.', flags: 64 });

        const modal = new ModalBuilder()
            .setCustomId(`loan_terms_modal_${requestId}`)
            .setTitle('Definir Termos do Empréstimo');

        const interestInput = new TextInputBuilder()
            .setCustomId('interest')
            .setLabel("Juros (%)")
            .setPlaceholder("0-100")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const daysInput = new TextInputBuilder()
            .setCustomId('days')
            .setLabel("Prazo (dias)")
            .setPlaceholder("1-7")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const installmentsInput = new TextInputBuilder()
            .setCustomId('installments')
            .setLabel("Parcelas (0-8)")
            .setPlaceholder("0 para pagamento único")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(interestInput),
            new ActionRowBuilder().addComponents(daysInput),
            new ActionRowBuilder().addComponents(installmentsInput)
        );

        await interaction.showModal(modal);
    },

    // Agiota enviou o modal com os termos
    async handleLoanTermsModal(interaction, requestId) {
        const request = activeLoanRequests.get(requestId);
        if (!request) return interaction.reply({ content: '❌ Solicitação expirada.', flags: 64 });

        const interest = parseInt(interaction.fields.getTextInputValue('interest'));
        const days = parseInt(interaction.fields.getTextInputValue('days'));
        const installments = parseInt(interaction.fields.getTextInputValue('installments'));

        if (isNaN(interest) || interest < 0 || interest > 100) return interaction.reply({ content: '❌ Juros inválidos (0-100%).', flags: 64 });
        if (isNaN(days) || days < 1 || days > 7) return interaction.reply({ content: '❌ Prazo inválido (1-7 dias).', flags: 64 });
        if (isNaN(installments) || installments < 0 || installments > 8) return interaction.reply({ content: '❌ Número de parcelas inválido (0-8).', flags: 64 });

        const totalToPay = Math.floor(request.amount * (1 + interest / 100));
        
        // Atualiza solicitação
        request.interest = interest;
        request.days = days;
        request.installments = installments;
        request.totalToPay = totalToPay;
        request.status = 'pending_acceptance';
        activeLoanRequests.set(requestId, request);

        // Notificar Borrower com a proposta final
        try {
            const borrower = await interaction.client.users.fetch(request.borrowerId);
            const lender = interaction.user;

            const paymentInfo = installments > 0 
                ? `${installments}x de R$ ${(Math.ceil(totalToPay / installments)).toLocaleString('pt-BR')}`
                : 'Pagamento Único';

            const embed = new EmbedBuilder()
                .setColor(colors.info)
                .setTitle('📑 Proposta de Empréstimo Recebida')
                .setDescription(`**${lender.username}** aceitou emprestar o valor, mas com as seguintes condições:`)
                .addFields(
                    { name: '💰 Valor Recebido', value: `R$ ${request.amount.toLocaleString('pt-BR')}`, inline: true },
                    { name: '📈 Juros', value: `${interest}%`, inline: true },
                    { name: '💵 Total a Pagar', value: `R$ ${totalToPay.toLocaleString('pt-BR')}`, inline: true },
                    { name: '📅 Prazo', value: `${days} dias`, inline: true },
                    { name: '📦 Parcelas', value: paymentInfo, inline: true }
                )
                .setFooter({ text: 'Você aceita essas condições?' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`loan_agree_${requestId}`)
                        .setLabel('Aceitar e Pegar Dinheiro')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`loan_refuse_${requestId}`)
                        .setLabel('Recusar')
                        .setStyle(ButtonStyle.Danger)
                );

            await borrower.send({ embeds: [embed], components: [row] });
            await interaction.update({ content: `✅ Proposta enviada para **${borrower.username}**! Aguardando aceite.`, components: [] });
        } catch (e) {
            await interaction.reply({ content: '❌ Não foi possível enviar a proposta para o usuário (DM fechada?).', flags: 64 });
        }
    },

    async processLoanAccept(interaction, requestId) {
        // Prevent double processing
        if (activeLoanRequests.has(requestId + '_processing')) return;
        
        const request = activeLoanRequests.get(requestId);
        if (!request) {
            return interaction.update({ content: '❌ Esta proposta expirou ou não existe mais.', components: [] }).catch(() => {});
        }

        // Mark as processing
        activeLoanRequests.set(requestId + '_processing', true);

        const { borrowerId, lenderId, amount, days, interest, totalToPay, installments } = request;

        try {
            // Verificar fundos do Agiota
            const lenderDoc = await User.findOne({ userId: lenderId });
            const borrowerDoc = await User.findOne({ userId: borrowerId });

            if (!lenderDoc || !borrowerDoc) {
                activeLoanRequests.delete(requestId + '_processing');
                return interaction.update({ content: '❌ Erro ao encontrar usuários no banco de dados.', components: [] });
            }

            if (lenderDoc.wallet < amount && lenderDoc.bank < amount) {
                activeLoanRequests.delete(requestId + '_processing');
                return interaction.update({ content: '❌ O credor não tem dinheiro suficiente para emprestar esse valor!', components: [] });
            }

            // Deduzir do Agiota (prioridade Carteira > Banco)
            if (lenderDoc.wallet >= amount) {
                lenderDoc.wallet -= amount;
            } else {
                lenderDoc.bank -= amount;
            }

            // Adicionar ao Borrower (Carteira)
            borrowerDoc.wallet += amount;

            // Registrar Empréstimo no Borrower
            borrowerDoc.loan = {
                active: true,
                id: crypto.randomUUID(),
                lenderId: lenderId,
                borrowerId: borrowerId,
                amount: amount,
                totalToPay: totalToPay,
                amountPaid: 0,
                deadline: Date.now() + (days * 24 * 60 * 60 * 1000),
                interestRate: interest,
                status: 'active',
                lastInterestDate: Date.now(),
                installments: installments || 0,
                installmentsPaid: 0
            };

            // Registrar histórico
            borrowerDoc.loanHistory.push({
                id: borrowerDoc.loan.id,
                role: 'borrower',
                amount: amount,
                status: 'active',
                date: Date.now()
            });

            lenderDoc.loanHistory.push({
                id: borrowerDoc.loan.id,
                role: 'lender',
                amount: amount,
                status: 'active',
                targetId: borrowerId,
                date: Date.now()
            });

            await lenderDoc.save();
            await borrowerDoc.save();

            activeLoanRequests.delete(requestId);
            activeLoanRequests.delete(requestId + '_processing');

            // Atualizar mensagem do Borrower
            await interaction.update({ 
                content: `✅ **Empréstimo Aceito!**\n💰 +R$ ${amount.toLocaleString('pt-BR')} adicionados à sua carteira.\n📅 Vencimento: <t:${Math.floor(borrowerDoc.loan.deadline / 1000)}:R>`, 
                components: [], 
                embeds: [] 
            });

            // Notificar Lender
            try {
                const lenderUser = await interaction.client.users.fetch(lenderId);
                await lenderUser.send(`✅ **Empréstimo Aprovado!**\n<@${borrowerId}> aceitou sua proposta.\n💸 Você enviou R$ ${amount.toLocaleString('pt-BR')}.\n📅 Receberá R$ ${totalToPay.toLocaleString('pt-BR')} em até ${days} dias.`);
            } catch (e) {
                // Ignorar se DM fechada
            }

        } catch (err) {
            console.error(err);
            activeLoanRequests.delete(requestId + '_processing');
            if (!interaction.replied) {
                await interaction.reply({ content: '❌ Ocorreu um erro ao processar o empréstimo.', flags: 64 });
            }
        }
    },

    async showStatus(interaction, userDoc) {
        const loan = userDoc.loan || {};
        const isBankLoan = loan.amount > 0 && !loan.lenderId;
        const isPlayerLoan = loan.active;

        if (!isBankLoan && !isPlayerLoan) {
            return interaction.reply({ content: '✅ Você não tem empréstimos ativos no momento.', flags: 64 });
        }

        const now = Date.now();
        let isOverdue = false;
        let lenderName = 'Desconhecido';
        let amountOriginal = 0;
        let amountTotal = 0;
        let amountPaid = 0;
        let deadline = 0;
        let statusText = '';
        
        if (isBankLoan) {
            isOverdue = loan.isDirty || (loan.dueDate < now && loan.amount > 0);
            lenderName = '🏦 Banco Central (Global Vault)';
            amountOriginal = loan.originalAmount || loan.amount;
            amountTotal = loan.amount; // Dívida atual
            amountPaid = 0; 
            deadline = loan.dueDate;
            statusText = isOverdue ? '**ATRASADO**' : 'Em dia';
        } else {
            isOverdue = loan.status === 'overdue' || loan.deadline < now;
            const lender = await interaction.client.users.fetch(loan.lenderId).catch(() => ({ username: 'Desconhecido' }));
            lenderName = lender.username;
            amountOriginal = loan.amount;
            amountTotal = loan.totalToPay;
            amountPaid = loan.amountPaid;
            deadline = loan.deadline;
            statusText = isOverdue ? '**ATRASADO**' : 'Em dia';
            if (loan.installments && loan.installments > 0) {
                statusText += `\n📦 Parcelas: ${loan.installmentsPaid}/${loan.installments}`;
                statusText += `\nValor Parc.: R$ ${(Math.ceil(loan.totalToPay / loan.installments)).toLocaleString('pt-BR')}`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(isOverdue ? colors.danger : colors.info)
            .setTitle('📑 Status do Empréstimo')
            .addFields(
                { name: '👤 Credor', value: lenderName, inline: true },
                { name: '💰 Valor Original', value: `R$ ${amountOriginal.toLocaleString('pt-BR')}`, inline: true },
                { name: '💵 Total a Pagar', value: `R$ ${amountTotal.toLocaleString('pt-BR')}`, inline: true },
                { name: '📉 Pago', value: `R$ ${amountPaid.toLocaleString('pt-BR')}`, inline: true },
                { name: '📅 Vencimento', value: `<t:${Math.floor(deadline / 1000)}:R>`, inline: true },
                { name: '📊 Status', value: statusText, inline: true }
            );

        if (isOverdue) {
            embed.setDescription('⚠️ **ATENÇÃO:** Seu empréstimo está vencido! Juros diários e multas estão sendo aplicados. Seu Score de Crédito está sendo afetado.');
        }

        const row = new ActionRowBuilder();

        if (isPlayerLoan && loan.installments && loan.installments > 0 && loan.installmentsPaid < loan.installments) {
            const installmentValue = Math.ceil(loan.totalToPay / loan.installments);
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('loan_pay_installment')
                    .setLabel(`Pagar Parcela (R$ ${installmentValue.toLocaleString('pt-BR')})`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📦')
            );
        }

        row.addComponents(
            new ButtonBuilder()
                .setCustomId('loan_pay_partial')
                .setLabel('Abater Valor')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('💸'),
            new ButtonBuilder()
                .setCustomId('loan_pay_full')
                .setLabel('Quitar Tudo')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰')
        );

        if (interaction.replied || interaction.deferred) {
             await interaction.followUp({ embeds: [embed], components: [row], flags: 64 });
        } else {
             await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
        }
    },

    async payLoan(interaction, userDoc) {
        if (!userDoc.loan || !userDoc.loan.active) {
            return interaction.reply({ content: '✅ Você não tem dívidas para pagar.', flags: 64 });
        }

        const remaining = userDoc.loan.totalToPay - userDoc.loan.amountPaid;
        await this.processPayment(interaction, userDoc, remaining);
    },

    async processPayment(interaction, userDoc, amount, isInstallment = false) {
        if (userDoc.wallet < amount && userDoc.bank < amount) {
            const msg = `❌ Você precisa de R$ ${amount.toLocaleString('pt-BR')} para quitar essa dívida.`;
            if (interaction.replied || interaction.deferred) return interaction.followUp({ content: msg, flags: 64 });
            return interaction.reply({ content: msg, flags: 64 });
        }

        const loan = userDoc.loan;
        const isBankLoan = loan && loan.amount > 0 && !loan.lenderId;

        // Deduzir do pagador
        let paidSource = '';
        if (userDoc.wallet >= amount) {
            userDoc.wallet -= amount;
            paidSource = 'Carteira';
        } else {
            userDoc.bank -= amount;
            paidSource = 'Banco';
        }

        let isPaidOff = false;
        let responseContent = '';

        if (isBankLoan) {
            // Pagamento de Empréstimo Bancário
            try {
                await GlobalConfig.findOneAndUpdate(
                    { key: 'global_vault' },
                    { $inc: { value: amount } },
                    { upsert: true }
                );
            } catch (e) { console.error(e); }

            userDoc.loan.amount -= amount;
            if (userDoc.loan.amount <= 0) {
                userDoc.loan.amount = 0;
                userDoc.loan.isDirty = false;
                userDoc.loan.dueDate = 0;
                isPaidOff = true;
            }

            // Score update for bank loan
            const scoreBoost = isPaidOff ? 50 : 5;
            userDoc.creditScore = Math.min(1000, (userDoc.creditScore || 500) + scoreBoost);

            responseContent = isPaidOff 
                ? `✅ **Dívida Bancária Paga!**\nVocê quitou seu empréstimo de R$ ${amount.toLocaleString('pt-BR')} usando saldo da ${paidSource}.\nSeu Score de Crédito aumentou!`
                : `✅ **Pagamento Realizado!**\nVocê abateu R$ ${amount.toLocaleString('pt-BR')} da sua dívida bancária.\nRestam R$ ${userDoc.loan.amount.toLocaleString('pt-BR')}.`;

        } else {
            const lenderId = userDoc.loan.lenderId;
            const lenderDoc = await User.findOne({ userId: lenderId });

            // Atualizar valores do empréstimo
            userDoc.loan.amountPaid += amount;
            if (isInstallment) {
                userDoc.loan.installmentsPaid = (userDoc.loan.installmentsPaid || 0) + 1;
            }

            // Verificar se quitou
            isPaidOff = userDoc.loan.amountPaid >= userDoc.loan.totalToPay || 
                              (userDoc.loan.installments > 0 && userDoc.loan.installmentsPaid >= userDoc.loan.installments);

            // Pagar ao credor
            if (lenderDoc) {
                lenderDoc.bank += amount; // Vai direto pro banco
                // Atualizar histórico do credor se quitado
                if (isPaidOff) {
                    const historyItem = lenderDoc.loanHistory.find(h => h.id === userDoc.loan.id);
                    if (historyItem) historyItem.status = 'paid';
                }
                await lenderDoc.save();

                try {
                    const lenderUser = await interaction.client.users.fetch(lenderId);
                    let msg = `💰 **Pagamento Recebido!**\n<@${userDoc.userId}> pagou R$ ${amount.toLocaleString('pt-BR')} referente ao empréstimo.`;
                    if (isInstallment && !isPaidOff) {
                        msg += `\n📦 Parcela ${userDoc.loan.installmentsPaid}/${userDoc.loan.installments}`;
                    } else if (isPaidOff) {
                        msg += `\n✅ O empréstimo foi totalmente quitado!`;
                    }
                    lenderUser.send(msg);
                } catch (e) {}
            }

            if (isPaidOff) {
                // Limpar dívida
                userDoc.loan.active = false;
                userDoc.loan.status = 'paid';
                
                // Aumentar Score significativamente
                userDoc.creditScore = Math.min(1000, userDoc.creditScore + 50);

                // Atualizar histórico
                const historyItem = userDoc.loanHistory.find(h => h.id === userDoc.loan.id);
                if (historyItem) historyItem.status = 'paid';
                else userDoc.loanHistory.push({ role: 'borrower', amount: userDoc.loan.totalToPay, status: 'paid', date: Date.now() });

                responseContent = `✅ **Dívida Paga!**\nVocê quitou seu empréstimo de R$ ${amount.toLocaleString('pt-BR')}. Seu Score de Crédito aumentou!`;
            } else {
                // Pagamento Parcial
                // Aumentar Score levemente por bom comportamento
                userDoc.creditScore = Math.min(1000, userDoc.creditScore + 5);
                
                responseContent = `✅ **Pagamento Realizado!**\nVocê pagou R$ ${amount.toLocaleString('pt-BR')}.`;
                if (isInstallment) {
                    responseContent += `\n📦 Parcela ${userDoc.loan.installmentsPaid}/${userDoc.loan.installments} paga.`;
                }
                responseContent += `\nRestam R$ ${(userDoc.loan.totalToPay - userDoc.loan.amountPaid).toLocaleString('pt-BR')}.`;
            }
        }

        // Marcar modificação no subdocumento loan, pois o Mongoose às vezes não detecta mudanças profundas
        userDoc.markModified('loan');
        await userDoc.save();

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: responseContent, flags: 64 });
        } else {
            await interaction.update({ content: responseContent, components: [], embeds: [] });
        }
    },
    
    async remindDebtor(interaction, lenderDoc) {
        const targetUser = interaction.options.getUser('usuario');
        const borrowerDoc = await User.findOne({ userId: targetUser.id });

        if (!borrowerDoc || !borrowerDoc.loan || !borrowerDoc.loan.active || borrowerDoc.loan.lenderId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Este usuário não te deve nada ou não tem empréstimo ativo com você.', flags: 64 });
        }

        try {
            const loan = borrowerDoc.loan;
            let msg = `⚠️ **COBRANÇA**\n<@${interaction.user.id}> está lembrando você de pagar seu empréstimo!\nValor: R$ ${(loan.totalToPay - loan.amountPaid).toLocaleString('pt-BR')}\nVencimento: <t:${Math.floor(loan.deadline / 1000)}:R>`;
            
            if (loan.installments && loan.installments > 0) {
                msg += `\n📦 Parcelas: ${loan.installmentsPaid}/${loan.installments}`;
            }

            await targetUser.send(msg);
            await interaction.reply({ content: `✅ Cobrança enviada para **${targetUser.username}**.`, flags: 64 });
        } catch (e) {
            await interaction.reply({ content: `❌ Não foi possível enviar DM para **${targetUser.username}**.`, flags: 64 });
        }
    },

    async forgiveLoan(interaction, lenderDoc) {
        const targetUser = interaction.options.getUser('usuario');
        const borrowerDoc = await User.findOne({ userId: targetUser.id });

        if (!borrowerDoc || !borrowerDoc.loan || !borrowerDoc.loan.active || borrowerDoc.loan.lenderId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Este usuário não te deve nada.', flags: 64 });
        }

        borrowerDoc.loan = { active: false };
        await borrowerDoc.save();

        // Atualizar histórico do lender
        const historyItem = lenderDoc.loanHistory.find(h => h.id === borrowerDoc.loan.id);
        if (historyItem) historyItem.status = 'forgiven';
        await lenderDoc.save();

        await interaction.reply({ content: `✅ Você perdoou a dívida de **${targetUser.username}**. Que alma caridosa!` });
        try {
            await targetUser.send(`🎉 **Boas Notícias!**\n<@${interaction.user.id}> perdoou sua dívida! Você está livre.`);
        } catch (e) {}
    },

    async handleLoanPayPartialModal(interaction) {
        const amountStr = interaction.fields.getTextInputValue('amount');
        const amount = parseInt(amountStr.replace(/\D/g, '')); // Remove non-digits

        if (isNaN(amount) || amount <= 0) {
            return interaction.reply({ content: '❌ Valor inválido.', flags: 64 });
        }

        const userDoc = await User.findOne({ userId: interaction.user.id });
        if (!userDoc || !userDoc.loan || !userDoc.loan.active) {
            return interaction.reply({ content: '❌ Nenhuma dívida ativa encontrada.', flags: 64 });
        }

        const remaining = userDoc.loan.totalToPay - userDoc.loan.amountPaid;
        const finalAmount = Math.min(amount, remaining);

        await this.processPayment(interaction, userDoc, finalAmount, false);
    },

    async showPayPartialModal(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('loan_pay_partial_modal')
            .setTitle('Abater Dívida');

        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel("Valor a Pagar (R$)")
            .setPlaceholder("Ex: 1000")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await interaction.showModal(modal);
    }
};
