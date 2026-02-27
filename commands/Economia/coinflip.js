const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const pets = require('../../pets.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Aposte em Cara ou Coroa (Mínimo: 50)')
        .addStringOption(option =>
            option.setName('lado')
                .setDescription('Escolha Cara ou Coroa')
                .setRequired(true)
                .addChoices(
                    { name: 'Cara', value: 'cara' },
                    { name: 'Coroa', value: 'coroa' }
                )
        )
        .addIntegerOption(option => 
            option.setName('valor')
                .setDescription('Valor da aposta')
                .setRequired(true)
                .setMinValue(50)
        ),

    async execute(interaction) {
        const side = interaction.options.getString('lado');
        const amount = interaction.options.getInteger('valor');
        await this.playCoinflip(interaction, interaction.user.id, side, amount);
    },

    async executePrefix(message, args) {
        // f!coinflip <lado> <valor>
        const side = args[0]?.toLowerCase();
        const amount = parseInt(args[1]);

        if (!side || (side !== 'cara' && side !== 'coroa')) {
            return message.reply('❌ Uso correto: `f!coinflip <cara/coroa> <valor>`');
        }

        if (!amount || isNaN(amount)) {
            return message.reply('❌ Digite um valor válido para apostar.');
        }

        if (amount < 50) {
            return message.reply('❌ A aposta mínima é de **50 Foxies**.');
        }

        await this.playCoinflip(message, message.author.id, side, amount);
    },

    async playCoinflip(target, userId, choice, amount) {
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

        if (user.wallet < amount) {
            const msg = `❌ Você não tem **${amount.toLocaleString()} Foxies** na carteira. Saldo atual: **${user.wallet.toLocaleString()}**.`;
            return target.reply ? target.reply({ content: msg, ephemeral: true }) : target.channel.send(msg);
        }

        // --- CONFIRMAÇÃO DE ALTO VALOR ---
        if (amount >= 50000) {
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Aposta de Alto Risco')
                .setDescription(`Você está prestes a apostar **${amount.toLocaleString()} Foxies**.\nTem certeza que deseja continuar?`)
                .setColor(colors.warning);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_bet').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_bet').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            );

            let response;
            if (target.commandName) { // Interaction
                 response = await target.reply({ embeds: [confirmEmbed], components: [row], fetchReply: true, ephemeral: true });
            } else { // Message
                 response = await target.reply({ embeds: [confirmEmbed], components: [row] });
            }

            try {
                const confirmation = await response.awaitMessageComponent({
                    filter: i => i.user.id === userId && ['confirm_bet', 'cancel_bet'].includes(i.customId),
                    time: 30000
                });

                if (confirmation.customId === 'cancel_bet') {
                    await confirmation.update({ content: '❌ Aposta cancelada.', embeds: [], components: [] });
                    return;
                }

                await confirmation.update({ content: '✅ Aposta confirmada! Girando a moeda...', embeds: [], components: [] });
            } catch (e) {
                if (target.commandName) await target.editReply({ content: '⏱️ Tempo esgotado.', embeds: [], components: [] });
                else await response.edit({ content: '⏱️ Tempo esgotado.', embeds: [], components: [] });
                return;
            }
        }

        // Deduz a aposta e incrementa contador
        await db.updateUser(userId, { 
            wallet: user.wallet - amount,
            dailyGambles: (user.dailyGambles || 0) + 1,
            lastGambleDate: today
        });

        // Consumo de Energia do Pet (2% por aposta)
        const activePet = await db.getActivePet(userId);
        if (activePet) {
            const newEnergy = Math.max(0, activePet.energy - 2);
            const newFun = Math.max(0, activePet.fun - 1); // Perde um pouco de diversão por aposta
            await db.updatePet(activePet.id, { energy: newEnergy, fun: newFun });
        }

        // Gira a moeda

        // Check Pet Passives (Coelho de Presságio)
        // const activePet = await db.getActivePet(userId); // Já declarado acima
        let winChance = 0.5; // Base 50%
        let petMsg = "";
        let refund = 0;
        let autoWin = false;

        if (activePet && activePet.energy > 0) {
            const template = pets.find(p => p.id === activePet.petId);
            if (template) {
                const level = activePet.level || 1;
                const activePassives = [];
                if (level >= 1 && template.passive.n1) activePassives.push(template.passive.n1);
                if (level >= 5 && template.passive.n5) activePassives.push(template.passive.n5);
                if (level >= 10 && template.passive.n10) activePassives.push(template.passive.n10);

                for (const p of activePassives) {
                    // N1: Aumenta chance de vitória
                    if (p.type === 'gamble_win') {
                        winChance += p.value; // ex: 0.08 (8%)
                        petMsg += `\n🐰 **${activePet.name}** aumentou sua sorte (+${(p.value * 100).toFixed(0)}%)!`;
                    }

                    // N5: Reduz perdas (Reembolso)
                    if (p.type === 'gamble_loss_reduce') {
                        refund = p.value; // ex: 0.10 (10%)
                    }

                    // N10: Chance de Vitória Automática
                    if (p.type === 'gamble_auto_win') {
                        if (Math.random() < p.value) {
                            autoWin = true;
                            petMsg += `\n✨ **${activePet.name}** previu o futuro! (Vitória Garantida)`;
                        }
                    }
                }

                // Processar XP e Level Up do Pet (Apostas gastam pouca energia)
                const energyCost = 2;
                let currentXp = activePet.xp + 5; // XP fixo por aposta
                let currentLevel = activePet.level || 1;
                const xpNeeded = currentLevel * 100;
                let newEnergy = Math.max(0, activePet.energy - energyCost);
                
                if (currentLevel < 10 && currentXp >= xpNeeded) {
                    currentLevel++;
                    currentXp -= xpNeeded;
                    newEnergy = 100;
                    petMsg += `\n🎉 **LEVEL UP!** ${activePet.name} subiu para o Nível ${currentLevel}!`;
                } else if (currentLevel >= 10) {
                    currentXp = Math.min(currentXp, currentLevel * 100);
                }

                await db.updatePet(activePet.id, { 
                    energy: newEnergy,
                    xp: currentXp,
                    level: currentLevel
                });
            }
        }

        // Lógica de Vitória
        let isWin = false;
        if (autoWin) {
            isWin = true;
        } else {
             // Sorteio Normal
             isWin = Math.random() < winChance;
        }

        const result = isWin ? choice : (choice === 'cara' ? 'coroa' : 'cara'); // Força o resultado visual bater com a vitória/derrota
        const win = choice === result; // Redundante mas seguro
        
        // Calcular prêmio ou perda
        let finalChange = 0;
        let prize = 0;
        let multiplier = 0;

        if (win) {
            // Multiplicadores Variáveis (Ex: 1.1x, 1.2x, 3.0x)
            const multiplierOptions = [
                { value: 1.1, weight: 15 }, // Baixo retorno
                { value: 1.2, weight: 15 },
                { value: 1.5, weight: 20 },
                { value: 2.0, weight: 40 }, // Padrão (Dobro)
                { value: 3.0, weight: 10 }  // Jackpot (Triplo)
            ];

            const totalWeight = multiplierOptions.reduce((acc, opt) => acc + opt.weight, 0);
            let random = Math.random() * totalWeight;
            
            for (const option of multiplierOptions) {
                if (random < option.weight) {
                    multiplier = option.value;
                    break;
                }
                random -= option.weight;
            }
            
            if (multiplier === 0) multiplier = 2.0; // Fallback

            prize = Math.floor(amount * multiplier);
            finalChange = prize;

            // Se ganhou, não tem reembolso, mas tem lucro
            // Atualiza carteira: Tinha X, apostou Y (ficou X-Y). Ganhou Prize. Fica (X-Y) + Prize.
            await db.updateUser(userId, { 
                wallet: (user.wallet - amount) + prize,
                gamblingLossStreak: 0 
            });
        } else {
            // Perdeu
            // Se tiver reembolso (N5)
            if (refund > 0) {
                const refundAmount = Math.floor(amount * refund);
                await db.updateUser(userId, { 
                    wallet: (user.wallet - amount) + refundAmount, // Devolve parte
                    gamblingLossStreak: (user.gamblingLossStreak || 0) + 1
                });
                
                // O resto vai para o cofre
                const lostAmount = amount - refundAmount;
                if (lostAmount > 0) await db.addToVault(lostAmount);

                petMsg += `\n🛡️ **${activePet.name}** recuperou **${refundAmount} Foxies** da aposta perdida.`;
            } else {
                // Perda total
                 await db.updateUser(userId, { 
                    gamblingLossStreak: (user.gamblingLossStreak || 0) + 1
                });
                
                // Tudo para o cofre
                await db.addToVault(amount);
            }
        }

        // Emojis
        const coinEmoji = result === 'cara' ? '🪙 (Cara)' : '👑 (Coroa)';
        const statusEmoji = win ? '✅' : '❌';
        const color = win ? colors.success : colors.error;

        const embed = new EmbedBuilder()
            .setTitle(`${statusEmoji} Cara ou Coroa`)
            .setDescription(`
**Aposta:** ${amount.toLocaleString()} Foxies em **${choice.toUpperCase()}**
**Resultado:** ${coinEmoji}

${win ? `🎉 **Você Venceu!** (x${multiplier.toFixed(1)})\nRecebeu **${prize.toLocaleString()} Foxies**.` : `💸 **Você Perdeu!** A moeda caiu do outro lado.`}${petMsg}
            `)
            .setColor(color)
            .setFooter({ text: win ? 'Parabéns!' : 'Tente novamente.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('play_again')
                .setLabel('🔄 Jogar Novamente')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('double_bet')
                .setLabel('💰 2x Aposta')
                .setStyle(ButtonStyle.Success)
        );

        let response;
        // Se target é botão e ainda não foi respondido -> update (edita a mensagem original)
        if (target.isButton && target.isButton() && !target.replied && !target.deferred) {
             response = await target.update({ embeds: [embed], components: [row], fetchReply: true });
        } 
        // Se target é interação já respondida/deferida -> followUp
        else if (target.replied || target.deferred) {
             response = await target.followUp({ embeds: [embed], components: [row], fetchReply: true });
        } 
        // Se target é interação nova (comando) -> reply
        else if (target.reply) {
             response = await target.reply({ embeds: [embed], components: [row], fetchReply: true });
        } 
        // Se target é mensagem (comando prefixo) -> channel.send
        else {
             response = await target.channel.send({ embeds: [embed], components: [row] });
        }

        // --- MISSÕES ---
        if (win) {
            try {
                const missionSystem = require('../../systems/missionSystem');
                await missionSystem.checkMission(userId, 'gamble_win', 1, target);
                await missionSystem.checkMission(userId, 'coinflip_win', 1, target);
            } catch (err) {
                console.error('Erro ao atualizar missão de coinflip:', err);
            }
        }
        
        // Collector para botões
        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === userId && ['play_again', 'double_bet'].includes(i.customId),
            time: 60000 // 1 minuto para reagir
        });

        collector.on('collect', async i => {
            collector.stop(); // Para evitar duplicação de eventos

            // Inicia nova rodada
            if (i.customId === 'play_again') {
                await this.playCoinflip(i, userId, choice, amount); 
            } else if (i.customId === 'double_bet') {
                await this.playCoinflip(i, userId, choice, amount * 2);
            }
        });

        return response;
    }
};
