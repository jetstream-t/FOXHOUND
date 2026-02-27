const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');

// Armazena o estado dos jogos ativos em memória
// Key: MessageID, Value: GameState
const activeGames = new Map();

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
// Mapeamento de valor numérico para comparação (2=2, ..., J=11, Q=12, K=13, A=14)
const getCardValue = (card) => {
    const v = card.slice(0, -2); // Remove o naipe (últimos 2 chars pq emojis podem ter variação, mas aqui é fixo)
    // Melhor: pegar o índice em VALUES
    // O display é "2♠️", "10♥️"
    // Vamos guardar o objeto da carta com valor numérico direto no estado
    return 0; 
};

// Gera uma carta aleatória (garantindo que não seja igual a anterior se excludeValue for fornecido)
const generateCard = (excludeValue = null) => {
    let card;
    do {
        const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
        const valueIndex = Math.floor(Math.random() * VALUES.length);
        const valueStr = VALUES[valueIndex];
        const numericValue = valueIndex + 2; // 2..14
        
        card = {
            display: `${valueStr}${suit}`,
            value: numericValue,
            raw: valueStr
        };
    } while (excludeValue !== null && card.value === excludeValue);
    
    return card;
};

// Calcula multiplicadores baseados na carta atual
const calculateMultipliers = (currentValue) => {
    // Total de cartas possíveis (excluindo a atual, pois não pode repetir)
    const totalOutcomes = 12;
    
    // Lower: Cartas menores que currentValue
    // Ex: Se 8, menores são 2,3,4,5,6,7 (6 cartas)
    const lowerCount = currentValue - 2;
    
    // Higher: Cartas maiores que currentValue
    // Ex: Se 8, maiores são 9,10,11,12,13,14 (6 cartas)
    const higherCount = 14 - currentValue;
    
    const houseEdge = 0.96; // 4% de margem da casa
    
    let lowMult = 0;
    if (lowerCount > 0) {
        const prob = lowerCount / totalOutcomes;
        lowMult = (1 / prob) * houseEdge;
    }
    
    let highMult = 0;
    if (higherCount > 0) {
        const prob = higherCount / totalOutcomes;
        highMult = (1 / prob) * houseEdge;
    }
    
    // Novas Opções (Probabilidades Fixas devido à remoção completa do rank atual)
    // Red/Black: 50% -> 1.92x
    // Same Suit: 25% -> 3.84x
    const colorMult = 1.92;
    const suitMult = 3.84;

    return {
        low: parseFloat(lowMult.toFixed(2)),
        high: parseFloat(highMult.toFixed(2)),
        probLow: (lowerCount/totalOutcomes * 100).toFixed(0),
        probHigh: (higherCount/totalOutcomes * 100).toFixed(0),
        color: colorMult,
        suit: suitMult,
        probColor: 50,
        probSuit: 25
    };
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hilo')
        .setDescription('Jogo High-Low: Adivinhe se a próxima carta será maior ou menor.')
        .addIntegerOption(option =>
            option.setName('valor')
                .setDescription('Valor da aposta inicial')
                .setRequired(true)
                .setMinValue(50)
                .setMaxValue(100000)),

    async execute(interaction) {
        const bet = interaction.options.getInteger('valor');
        await this.playHilo(interaction, interaction.user.id, bet);
    },

    async executePrefix(message, args) {
        const amount = parseInt(args[0]);
        if (!amount || isNaN(amount)) {
            return message.reply('❌ Digite um valor válido para apostar. Ex: `f!hilo 100`');
        }
        if (amount < 50) {
            return message.reply('❌ A aposta mínima é de **50 Foxies**.');
        }
        await this.playHilo(message, message.author.id, amount);
    },

    async playHilo(target, userId, bet) {
        const user = await db.getUser(userId);
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        // Reset diário de apostas se mudou o dia
        if (user.lastGambleDate !== today) {
            await db.updateUser(userId, { dailyGambles: 0, lastGambleDate: today });
            user.dailyGambles = 0;
        }

        // Limite de 20 apostas por dia
        if (user.dailyGambles >= 20) {
            const msg = `🛑 **Limite Diário Atingido!**\nSeu pet está exausto de tantas emoções. Volte amanhã para mais apostas.\n\n*Apostas hoje: ${user.dailyGambles}/20*`;
            return target.reply ? target.reply({ content: msg, ephemeral: true }) : target.channel.send(msg);
        }

        if (user.wallet < bet) {
            const msg = `❌ Você não tem **${bet.toLocaleString()} Foxies** na carteira. Saldo atual: **${user.wallet.toLocaleString()}**.`;
            return target.reply ? target.reply({ content: msg, ephemeral: true }) : target.channel.send(msg);
        }

        // --- CONFIRMAÇÃO DE ALTO VALOR ---
        if (bet >= 50000) {
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Aposta de Alto Risco')
                .setDescription(`Você está prestes a apostar **${bet.toLocaleString()} Foxies** no Hi-Lo.\nTem certeza que deseja continuar?`)
                .setColor(colors.warning);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_hilo').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_hilo').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            );

            let confirmMsg;
            if (target.commandName) {
                 confirmMsg = await target.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true, fetchReply: true });
            } else {
                 confirmMsg = await target.reply({ embeds: [confirmEmbed], components: [confirmRow] });
            }

            try {
                const confirmation = await confirmMsg.awaitMessageComponent({
                    filter: i => i.user.id === userId && ['confirm_hilo', 'cancel_hilo'].includes(i.customId),
                    time: 30000
                });

                if (confirmation.customId === 'cancel_hilo') {
                    await confirmation.update({ content: '❌ Aposta cancelada.', embeds: [], components: [] });
                    return;
                }

                await confirmation.update({ content: '✅ Aposta confirmada! Embaralhando...', embeds: [], components: [] });
            } catch (e) {
                if (target.commandName) await target.editReply({ content: '⏱️ Tempo esgotado. Aposta cancelada.', embeds: [], components: [] });
                else await confirmMsg.edit({ content: '⏱️ Tempo esgotado. Aposta cancelada.', embeds: [], components: [] });
                return;
            }
        }

        // Deduz a aposta inicial
        await db.updateUser(userId, { 
            wallet: user.wallet - bet,
            dailyGambles: (user.dailyGambles || 0) + 1,
            lastGambleDate: today
        });

        // Consumo de Energia do Pet (2% por aposta)
        const activePet = await db.getActivePet(userId);
        if (activePet) {
            const newEnergy = Math.max(0, activePet.energy - 2);
            await db.updatePet(activePet.id, { energy: newEnergy });
        }

        // --- MISSÃO: JOGAR HILO ---
        try {
            const missionSystem = require('../../systems/missionSystem');
            await missionSystem.checkMission(userId, 'hilo_play', 1, target);
        } catch (e) { console.error(e); }

        // Estado inicial do jogo
        // Garante que a primeira carta não seja 2 nem Ás (14), pois travaria o jogo sem chance de empate
        let firstCard;
        do {
            firstCard = generateCard();
        } while (firstCard.value === 2 || firstCard.value === 14);

        const mults = calculateMultipliers(firstCard.value);
        
        const gameState = {
            userId: userId,
            bet: bet,
            currentPot: bet,
            currentCard: firstCard,
            round: 1,
            history: [firstCard.display]
        };

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle('🃏 High-Low (5 Opções)')
            .setDescription(`Adivinhe a próxima carta!\n\n` +
                `Carta Atual: **${firstCard.display}**\n` +
                `Pote Atual: **$${bet.toLocaleString()}**`)
            .addFields(
                { name: 'Probabilidades (Valor)', value: `🔼 Maior: ${mults.probHigh}%\n🔽 Menor: ${mults.probLow}%`, inline: true },
                { name: 'Multiplicadores', value: `🔼 ${mults.high}x\n🔽 ${mults.low}x`, inline: true },
                { name: 'Outras Opções', value: `🔴 Vermelho: 1.92x (50%)\n⚫ Preto: 1.92x (50%)\n♣️ Mesmo Naipe: 3.84x (25%)`, inline: false }
            )
            .setFooter({ text: 'Ás é a maior carta (14)' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`hilo_high_${userId}`).setLabel(`Maior (${mults.high}x)`).setStyle(ButtonStyle.Primary).setDisabled(mults.high <= 1.0), 
            new ButtonBuilder().setCustomId(`hilo_low_${userId}`).setLabel(`Menor (${mults.low}x)`).setStyle(ButtonStyle.Primary).setDisabled(mults.low <= 1.0),
            new ButtonBuilder().setCustomId(`hilo_cashout_${userId}`).setLabel('Parar e Receber').setStyle(ButtonStyle.Success).setEmoji('💰').setDisabled(true) 
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`hilo_red_${userId}`).setLabel(`Vermelho (1.92x)`).setStyle(ButtonStyle.Secondary).setEmoji('🔴'),
            new ButtonBuilder().setCustomId(`hilo_black_${userId}`).setLabel(`Preto (1.92x)`).setStyle(ButtonStyle.Secondary).setEmoji('⚫'),
            new ButtonBuilder().setCustomId(`hilo_suit_${userId}`).setLabel(`Mesmo Naipe (3.84x)`).setStyle(ButtonStyle.Secondary).setEmoji('♣️')
        );

        let reply;
        if (target.isButton && target.isButton() && !target.replied && !target.deferred) {
            reply = await target.update({ embeds: [embed], components: [row1, row2], fetchReply: true });
        } else if (target.replied || target.deferred) {
            reply = await target.followUp({ embeds: [embed], components: [row1, row2], fetchReply: true });
        } else if (target.reply) {
            reply = await target.reply({ embeds: [embed], components: [row1, row2], fetchReply: true });
        } else {
            reply = await target.channel.send({ embeds: [embed], components: [row1, row2] });
        }
        
        activeGames.set(reply.id, gameState);
    },

    async handleButton(interaction) {
        const { customId, message, user } = interaction;
        const parts = customId.split('_'); // hilo, action, userId, amount(optional)
        const action = parts[1];
        const ownerId = parts[2];

        if (user.id !== ownerId) {
            return interaction.reply({ content: '❌ Esse jogo não é seu.', ephemeral: true });
        }

        // --- PLAY AGAIN / DOUBLE ---
        if (action === 'again' || action === 'double') {
            const amount = parseInt(parts[3]);
            if (!amount || isNaN(amount)) {
                 return interaction.reply({ content: '❌ Erro ao recuperar valor da aposta.', ephemeral: true });
            }

            // Desativa botões da mensagem anterior
            // const disabledRow = new ActionRowBuilder().addComponents(
            //    new ButtonBuilder().setCustomId('hilo_again_disabled').setLabel('🔄 Jogar Novamente').setStyle(ButtonStyle.Primary).setDisabled(true),
            //    new ButtonBuilder().setCustomId('hilo_double_disabled').setLabel('💰 2x Aposta').setStyle(ButtonStyle.Success).setDisabled(true)
            // );
            // await interaction.update({ components: [disabledRow] });

            if (action === 'again') {
                await this.playHilo(interaction, user.id, amount);
            } else {
                await this.playHilo(interaction, user.id, amount * 2);
            }
            return;
        }

        const game = activeGames.get(message.id);
        if (!game) {
            return interaction.update({ content: '❌ Jogo expirado ou finalizado.', embeds: [], components: [] });
        }

        // --- CASHOUT ---
        if (action === 'cashout') {
            // Cashout Tax de 5%
            const cashoutTax = Math.floor(game.currentPot * 0.05);
            const finalAmount = Math.floor(game.currentPot) - cashoutTax;
            
            await db.addMoney(user.id, finalAmount);
            activeGames.delete(message.id);

            const embed = new EmbedBuilder()
                .setColor(colors.success)
                .setTitle('💰 High-Low: Saque Realizado!')
                .setDescription(`Você parou no momento certo!\n\n` +
                    `Pote Total: **$${Math.floor(game.currentPot).toLocaleString()}**\n` +
                    `Taxa (5%): **-$${cashoutTax.toLocaleString()}**\n` +
                    `Valor Recebido: **$${finalAmount.toLocaleString()}**\n\n` +
                    `Histórico: ${game.history.join(' → ')}`)
                .setFooter({ text: 'O dinheiro foi adicionado à sua carteira.' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`hilo_again_${user.id}_${game.bet}`)
                    .setLabel('🔄 Jogar Novamente')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`hilo_double_${user.id}_${game.bet}`)
                    .setLabel('💰 2x Aposta')
                    .setStyle(ButtonStyle.Success)
            );

            return interaction.update({ embeds: [embed], components: [row] });
        }

        // --- JOGADA (HIGH ou LOW ou RED ou BLACK ou SUIT) ---
        // Agora passamos a carta atual para garantir que a próxima não seja igual
        const nextCard = generateCard(game.currentCard.value);
        const oldCard = game.currentCard;
        
        let won = false;
        let multiplierUsed = 0;
        const mults = calculateMultipliers(oldCard.value);

        if (action === 'high') {
            if (nextCard.value > oldCard.value) {
                won = true;
                multiplierUsed = mults.high;
            }
        } else if (action === 'low') {
            if (nextCard.value < oldCard.value) {
                won = true;
                multiplierUsed = mults.low;
            }
        } else if (action === 'red') {
            // ♥️ ou ♦️
            if (nextCard.display.includes('♥️') || nextCard.display.includes('♦️')) {
                won = true;
                multiplierUsed = mults.color;
            }
        } else if (action === 'black') {
            // ♠️ ou ♣️
            if (nextCard.display.includes('♠️') || nextCard.display.includes('♣️')) {
                won = true;
                multiplierUsed = mults.color;
            }
        } else if (action === 'suit') {
            // Mesmo naipe da anterior
            const getSuit = (c) => {
                if (c.display.includes('♠️')) return '♠️';
                if (c.display.includes('♥️')) return '♥️';
                if (c.display.includes('♦️')) return '♦️';
                if (c.display.includes('♣️')) return '♣️';
                return '';
            };
            
            if (getSuit(nextCard) === getSuit(oldCard)) {
                won = true;
                multiplierUsed = mults.suit;
            }
        }

        // Adiciona ao histórico
        game.history.push(nextCard.display);
        if (game.history.length > 8) game.history.shift();

        if (won) {
            // Vitória
            const newPot = Math.floor(game.currentPot * multiplierUsed);
            game.currentPot = newPot;
            game.currentCard = nextCard;
            game.round++;

            // --- ENERGIA POR CARTA (2% por jogada) ---
            const activePet = await db.getActivePet(user.id);
            if (activePet) {
                const newEnergy = Math.max(0, activePet.energy - 2);
                await db.updatePet(activePet.id, { energy: newEnergy });
            }

            // --- PROFIT CAP (10x a aposta inicial) ---
            const maxProfit = game.bet * 10;
            const reachedCap = newPot >= maxProfit;

            const newMults = calculateMultipliers(nextCard.value);

            let description = `✅ **ACERTOU!** A carta era **${nextCard.display}**.\n\n` +
                `Pote Acumulado: **$${newPot.toLocaleString()}**\n` +
                `Histórico: ${game.history.join(' → ')}`;

            if (reachedCap) {
                description += `\n\n🏆 **TETO ATINGIDO!** Você atingiu o limite máximo de ${maxProfit.toLocaleString()} Foxies (10x a aposta).\nO saque será realizado automaticamente!`;
            }

            if (newMults.high <= 1.0 && newMults.low <= 1.0) {
                description += `\n\n⚠️ **Sem saída!** Você chegou num extremo (2 ou Ás). Obrigatório Cashout.`;
            }

            const embed = new EmbedBuilder()
                .setColor(colors.default) // Continua o jogo
                .setTitle(`🃏 High-Low: Rodada ${game.round}`)
                .setDescription(description)
                .addFields(
                    { name: 'Probabilidades', value: `🔼 Maior: ${newMults.probHigh}%\n🔽 Menor: ${newMults.probLow}%`, inline: true },
                    { name: 'Multiplicadores', value: `🔼 ${newMults.high}x\n🔽 ${newMults.low}x`, inline: true }
                )
                .setFooter({ text: 'Continue ou pare agora.' });

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`hilo_high_${user.id}`).setLabel(`Maior (${newMults.high}x)`).setStyle(ButtonStyle.Primary).setDisabled(newMults.high <= 1.0),
                new ButtonBuilder().setCustomId(`hilo_low_${user.id}`).setLabel(`Menor (${newMults.low}x)`).setStyle(ButtonStyle.Primary).setDisabled(newMults.low <= 1.0),
                new ButtonBuilder().setCustomId(`hilo_cashout_${user.id}`).setLabel(`Receber $${newPot.toLocaleString()}`).setStyle(ButtonStyle.Success).setEmoji('💰')
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`hilo_red_${user.id}`).setLabel(`Vermelho (1.92x)`).setStyle(ButtonStyle.Secondary).setEmoji('🔴'),
                new ButtonBuilder().setCustomId(`hilo_black_${user.id}`).setLabel(`Preto (1.92x)`).setStyle(ButtonStyle.Secondary).setEmoji('⚫'),
                new ButtonBuilder().setCustomId(`hilo_suit_${user.id}`).setLabel(`Mesmo Naipe (3.84x)`).setStyle(ButtonStyle.Secondary).setEmoji('♣️')
            );

            await interaction.update({ embeds: [embed], components: [row1, row2] });
        } else {
            // Derrota
            activeGames.delete(message.id);
            
            const reason = "Você errou a previsão.";

            const embed = new EmbedBuilder()
                .setColor(colors.error)
                .setTitle('❌ High-Low: Fim de Jogo')
                .setDescription(`🚫 **${reason}**\n\n` +
                    `Carta Anterior: **${oldCard.display}**\n` +
                    `Carta Sorteada: **${nextCard.display}**\n\n` +
                    `Você perdeu tudo que estava no pote.\n` +
                    `Histórico: ${game.history.join(' → ')}`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`hilo_again_${user.id}_${game.bet}`)
                    .setLabel('🔄 Jogar Novamente')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`hilo_double_${user.id}_${game.bet}`)
                    .setLabel('💰 2x Aposta')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.update({ embeds: [embed], components: [row] });
        }
    }
};
