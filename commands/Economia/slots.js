const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const pets = require('../../pets.json');

const slots = ['🍒', '🍋', '🍇', '🍉', '🔔', '💎', '7️⃣'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Aposte seus Foxies no caça-níqueis (Mínimo: 50)')
        .addIntegerOption(option => 
            option.setName('valor')
                .setDescription('Valor da aposta')
                .setRequired(true)
                .setMinValue(50)
        ),

    async execute(interaction) {
        const amount = interaction.options.getInteger('valor');
        await this.playSlots(interaction, interaction.user.id, amount);
    },

    async executePrefix(message, args) {
        const amount = parseInt(args[0]);
        if (!amount || isNaN(amount)) {
            return message.reply('❌ Digite um valor válido para apostar. Ex: `f!slots 100`');
        }
        if (amount < 50) {
            return message.reply('❌ A aposta mínima é de **50 Foxies**.');
        }
        await this.playSlots(message, message.author.id, amount);
    },

    async playSlots(target, userId, amount) {
        const user = await db.getUser(userId);
        const currentStreak = user.gamblingLossStreak || 0;
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

                await confirmation.update({ content: '✅ Aposta confirmada! Girando a roleta...', embeds: [], components: [] });
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
            const newFun = Math.max(0, activePet.fun - 1);
            await db.updatePet(activePet.id, { energy: newEnergy, fun: newFun });
        }
        let rerollChance = 0;
        let petMsg = "";
        let autoWin = false;
        let lossRefund = 0;
        
        if (activePet && activePet.energy > 0) {
            const template = pets.find(p => p.id === activePet.petId);
            if (template) {
                const level = activePet.level || 1;
                const activePassives = [];
                if (level >= 1 && template.passive.n1) activePassives.push(template.passive.n1);
                if (level >= 5 && template.passive.n5) activePassives.push(template.passive.n5);
                if (level >= 10 && template.passive.n10) activePassives.push(template.passive.n10);

                for (const p of activePassives) {
                    // Coelho N1: Aumenta chance de reroll (gamble_win)
                    if (p.type === 'gamble_win') {
                        rerollChance = 0.20 + p.value; // Base 20% + Bonus
                    }

                    // Coelho N5: Reduz perda (gamble_loss_reduce)
                    if (p.type === 'gamble_loss_reduce') {
                        lossRefund = p.value;
                    }

                    // Coelho N10: Vitória Automática (gamble_auto_win)
                    if (p.type === 'gamble_auto_win') {
                        if (Math.random() < p.value) {
                            autoWin = true;
                            petMsg += `\n🐰 **${activePet.name}** manipulou a máquina! (Vitória Garantida)`;
                        }
                    }
                }
            }
        }

        // Função de sorte com peso
        const rollSlot = () => slots[Math.floor(Math.random() * slots.length)];

        if (autoWin) {
             // Força Jackpot
             slot1 = '7️⃣';
             slot2 = '7️⃣';
             slot3 = '7️⃣';
        } else if (currentStreak >= 5) {
            // Chance aumentada (Reroll se não der nada bom na primeira tentativa)
            // Tenta 1
            slot1 = rollSlot();
            slot2 = rollSlot();
            slot3 = rollSlot();

            // Se perdeu na primeira, tenta de novo com 50% de chance de forçar um par
            if (!(slot1 === slot2 && slot2 === slot3) && !(slot1 === slot2 || slot2 === slot3 || slot1 === slot3)) {
                if (Math.random() < 0.5) {
                    const guaranteed = rollSlot();
                    slot1 = guaranteed;
                    slot2 = guaranteed;
                    slot3 = rollSlot();
                }
            }
        } else {
            // Gira normalmente
            slot1 = rollSlot();
            slot2 = rollSlot();
            slot3 = rollSlot();

            // Se perdeu e tem pet, tenta de novo
            const isWin = (slot1 === slot2 && slot2 === slot3) || (slot1 === slot2 || slot2 === slot3 || slot1 === slot3);
            
            if (!isWin && rerollChance > 0 && Math.random() < rerollChance) {
                 slot1 = rollSlot();
                 slot2 = rollSlot();
                 slot3 = rollSlot();
                 
                 // Pet XP & Energy Cost
                 const energyCost = 5;
                 let currentXp = activePet.xp + 15; // Ganha XP por salvar
                 let currentLevel = activePet.level;
                 const xpNeeded = currentLevel * 100;
                 let newEnergy = Math.max(0, activePet.energy - energyCost);
                 let levelUpMsg = "";
                 const maxLevel = 10;

                 if (currentLevel < maxLevel && currentXp >= xpNeeded) {
                     currentLevel++;
                     currentXp -= xpNeeded;
                     newEnergy = 100;
                     levelUpMsg = `\n🎉 **LEVEL UP!** ${activePet.name} subiu para o Nível ${currentLevel}!`;
                     levelUpMsg += `\n✨ **Passiva Melhorada!** (+5% de eficácia)`;
                 } else if (currentLevel >= maxLevel) {
                      currentXp = Math.min(currentXp, currentLevel * 100);
                 }

                 await db.updatePet(activePet.id, { 
                     energy: newEnergy,
                     xp: currentXp,
                     level: currentLevel
                 });

                 petMsg = `\n🐰 **${activePet.name}** sentiu que não era seu dia e girou de novo!${levelUpMsg}`;
            }
        }

        // Calcula resultado
        let multiplier = 0;
        let resultMessage = '';
        let color = colors.error;
        let cashback = 0;

        // Regras de prêmio
        if (slot1 === slot2 && slot2 === slot3) {
            // Jackpot (3 iguais)
            if (slot1 === '7️⃣') multiplier = 10; // Jackpot Máximo
            else if (slot1 === '💎') multiplier = 7;
            else multiplier = 5;
            
            resultMessage = '🎉 **JACKPOT!** Você triplicou sua sorte!';
            color = colors.success;
            // Reseta streak
            await db.updateUser(userId, { gamblingLossStreak: 0 });

        } else if (slot1 === slot2 || slot2 === slot3 || slot1 === slot3) {
            // Par (2 iguais)
            multiplier = 2;
            resultMessage = '✨ **Belo par!** Você recuperou e lucrou.';
            color = colors.default; // Neutro/Bom
            // Reseta streak
            await db.updateUser(userId, { gamblingLossStreak: 0 });

        } else {
            // Perdeu
            multiplier = 0;
            resultMessage = '💸 **Você perdeu!** Tente novamente.';
            color = colors.error;
            
            // Incrementa streak
            await db.updateUser(userId, { gamblingLossStreak: currentStreak + 1 });

            // Chance de Cashback (10%)
            if (Math.random() < 0.10) {
                const managerRefund = Math.floor(amount * 0.25); // Devolve 25%
                cashback += managerRefund;
                resultMessage = '💸 **Você perdeu!** Mas o gerente ficou com pena...\n🥺 **Reembolso:** O cassino devolveu parte da aposta.';
                color = '#FFD700'; // Dourado
            }

            // Pet Refund (Coelho N5)
            if (lossRefund > 0) {
                 const petRefund = Math.floor(amount * lossRefund);
                 cashback += petRefund;
                 resultMessage += `\n🛡️ **${activePet.name}** recuperou $${petRefund} (${(lossRefund*100).toFixed(0)}%).`;
                 // Se não tinha cor dourada antes, muda agora para indicar algo positivo na perda
                 if (color === colors.error) color = '#FFD700'; 
            }
        }

        const prize = Math.floor(amount * multiplier);
        const finalPayout = prize + cashback;

        if (finalPayout > 0) {
            // Se houve cashback, devolvemos parte. Se houve prêmio, pagamos o prêmio.
            // Nota: O valor da aposta JÁ FOI deduzido antes. Então aqui é só adicionar o ganho.
            // Se prize > 0, o usuário recebe (wallet original - aposta) + prize.
            // Se cashback > 0 (e prize 0), o usuário recebe (wallet original - aposta) + cashback.
            await db.updateUser(userId, { wallet: (user.wallet - amount) + finalPayout });
        }

        // Se o usuário perdeu dinheiro (aposta > payout), a diferença vai para o cofre
        if (amount > finalPayout) {
            const lostAmount = amount - finalPayout;
            await db.addToVault(lostAmount);
        }

        const embed = new EmbedBuilder()
            .setTitle('🎰 Caça-Níqueis FOXHOUND')
            .setDescription(`
**Aposta:** ${amount.toLocaleString()} Foxies

> -----------------------
> | ${slot1} | ${slot2} | ${slot3} |
> -----------------------

${resultMessage}
${prize > 0 ? `💰 **Ganho:** +${prize.toLocaleString()} Foxies` : (cashback > 0 ? `💰 **Cashback:** +${cashback.toLocaleString()} Foxies` : '❌ **Perda:** -' + amount.toLocaleString() + ' Foxies')}${petMsg}
            `)
            .setColor(color)
            .setFooter({ text: currentStreak >= 5 ? 'A sorte sorriu para você!' : (prize > 0 ? 'Sorte de principiante?' : 'A casa sempre vence.') });

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
        if (target.isButton && target.isButton() && !target.replied && !target.deferred) {
             response = await target.update({ embeds: [embed], components: [row], fetchReply: true });
        } else if (target.replied || target.deferred) {
             response = await target.followUp({ embeds: [embed], components: [row], fetchReply: true });
        } else if (target.reply) {
             response = await target.reply({ embeds: [embed], components: [row], fetchReply: true });
        } else {
             response = await target.channel.send({ embeds: [embed], components: [row] });
        }

        // --- MISSÕES ---
        try {
            const missionSystem = require('../../systems/missionSystem');
            // Sempre conta como jogada
            await missionSystem.checkMission(userId, 'slots_play', 1, target);
            
            // Se ganhou (multiplicador > 0), conta como vitória em aposta
            if (multiplier > 0) {
                await missionSystem.checkMission(userId, 'gamble_win', 1, target);
            }
        } catch (err) {
            console.error('Erro ao atualizar missão de slots:', err);
        }

        // Collector para botões
        const collector = response.createMessageComponentCollector({
            filter: i => i.user.id === userId && ['play_again', 'double_bet'].includes(i.customId),
            time: 60000 // 1 minuto para reagir
        });

        collector.on('collect', async i => {
            collector.stop();

            // Inicia nova rodada
            if (i.customId === 'play_again') {
                await this.playSlots(i, userId, amount);
            } else if (i.customId === 'double_bet') {
                await this.playSlots(i, userId, amount * 2);
            }
        });

        return response;
    }
};
