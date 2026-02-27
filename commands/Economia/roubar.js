const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const pets = require('../../pets.json');
const eventSystem = require('../../systems/eventSystem');

const ROB_PHRASES = {
    normal: [
        "Você passou a mão leve na carteira dele e saiu assobiando.",
        "Um descuido da vítima, um lucro para você.",
        "Rápido e rasteiro, como um gato no telhado.",
        "A vítima estava distraída olhando o celular. Perdeu.",
        "Você fingiu esbarrar nele e levou o que deu.",
        "Aproveitou a multidão e fez a boa.",
        "Não foi muito, mas já paga o lanche.",
        "Um furto simples, sem testemunhas.",
        "Você viu a oportunidade e não desperdiçou.",
        "A vítima nem percebeu que ficou mais leve.",
        "Mãos ágeis, bolsos cheios.",
        "Saiu de fininho com o dinheiro.",
        "O crime compensa... às vezes.",
        "Mais um dia, mais um roubo.",
        "A vítima vai demorar pra perceber.",
        "Você agiu nas sombras e lucrou.",
        "Poderia ser mais, mas tá valendo.",
        "Dinheiro fácil, vida difícil.",
        "A vítima bobeou, você dançou.",
        "Um clássico furto de carteira."
    ],
    critical: [
        "QUE ROUBO! Você limpou os bolsos dele com maestria!",
        "A vítima vai chorar no banho depois dessa!",
        "Você encontrou o esconderijo secreto de grana dele!",
        "Um golpe de mestre! O lucro foi insano!",
        "Você praticamente depenou a vítima!",
        "Isso não foi um roubo, foi uma humilhação!",
        "Sorte grande! A carteira estava recheada!",
        "Você levou uma bolada para casa!",
        "A vítima vai precisar de um empréstimo depois dessa.",
        "Você agiu como um profissional de elite!",
        "Ninguém viu, ninguém ouviu, e você lucrou muito!",
        "A vítima estava carregando o pagamento do mês!",
        "Você fez a limpa em grande estilo!",
        "Um roubo lendário para os livros de história!",
        "A carteira dele estava pedindo para ser roubada.",
        "Você acertou o jackpot do crime!",
        "A vítima ficou tonta de tão rápido que foi!",
        "Lucro máximo com esforço mínimo!",
        "Você operou um milagre do crime!",
        "A vítima vai ter pesadelos com você!"
    ],
    exclusive: [
        "JACKPOT! Você levou TUDO (até o limite permitido)!",
        "A vítima ficou ZERADA (ou quase)!",
        "Um roubo perfeito! Nada sobrou para contar história.",
        "Você é o pesadelo da economia local!",
        "A vítima foi à falência em segundos!",
        "Você sugou cada centavo disponível!",
        "Isso é um assalto ou mágica? Sumiu tudo!",
        "A vítima agora é oficialmente pobre.",
        "Você não deixou nem o dinheiro do ônibus!",
        "Limpeza total! O cofre está vazio.",
        "A vítima foi resetada financeiramente!",
        "Você destruiu o patrimônio dele!",
        "Nem as moedas do fundo do bolso sobraram!",
        "Você é uma lenda viva do crime!",
        "A vítima vai precisar de doações urgentes.",
        "Um roubo absoluto! Sem erros!",
        "Você quebrou a banca da vítima!",
        "A vítima não tem mais onde cair morta.",
        "Você levou a alma financeira dele!",
        "Game Over para a carteira da vítima!"
    ]
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roubar')
        .setDescription('Tente roubar suprimentos de outro usuário (Risco vs Recompensa)')
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('A vítima do roubo')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        await this.handleRob(interaction, interaction.user, interaction.options.getUser('usuario'));
    },

    async executePrefix(message, args) {
        const target = message.mentions.users.first();
        if (!target) return message.reply('❌ Você precisa mencionar um usuário para tentar roubar.');
        await this.handleRob(message, message.author, target);
    },

    async handleRob(context, robberUser, victimUser) {
        // Validações básicas
        if (robberUser.id === victimUser.id) {
            return this.reply(context, '❌ Você não pode roubar a si mesmo, soldado.');
        }
        if (victimUser.bot) {
            return this.reply(context, '❌ Bots são blindados contra roubos.');
        }

        const robber = await db.getUser(robberUser.id);
        const victim = await db.getUser(victimUser.id);
        const now = Date.now();
        const inventory = await db.getInventory(robberUser.id);

        // --- BUFFS DE DARK WEB (Consumíveis) ---
        let darkWebBonus = 0;
        let protectionBreak = false;
        let safeEscape = false;
        
        if (robber.darkWebInventory) {
            if (robber.darkWebInventory.get('crowbar') > 0) {
                darkWebBonus = 0.10; // +10% chance
                // Consumir item
                robber.darkWebInventory.set('crowbar', robber.darkWebInventory.get('crowbar') - 1);
            }
            if (robber.darkWebInventory.get('mask') > 0) {
                safeEscape = true; // Chance de escapar
                // Consome apenas se falhar (lógica abaixo)
            }
        }
        
        // --- BUFFS DE PET (PREPARAÇÃO) ---
        const robberPet = await db.getActivePet(robberUser.id);
        const victimPet = await db.getActivePet(victimUser.id);
        
        // Helper para pegar passivas ativas
        const getActivePassives = (pet) => {
             if (!pet || pet.energy <= 0) return [];
             const template = pets.find(p => p.id === pet.petId);
             if (!template) return [];
             const level = pet.level || 1;
             const passives = [];
             if (level >= 1 && template.passive.n1) passives.push(template.passive.n1);
             if (level >= 5 && template.passive.n5) passives.push(template.passive.n5);
             if (level >= 10 && template.passive.n10) passives.push(template.passive.n10);
             return passives;
        };

        const robberPassives = getActivePassives(robberPet);
        const victimPassives = getActivePassives(victimPet);

        // Helper para Level Up
        const processPetXp = async (pet, xpGain, energyCost, funCost = 0) => {
            if (!pet) return { leveledUp: false, msg: "" };

            // Verificar imunidade de evento (Semana da Saúde)
            const activeEvent = await eventSystem.getWeeklyEvent();
            if (activeEvent && eventSystem.getEventMultiplier(activeEvent, 'pet_decay_immunity', false)) {
                energyCost = 0;
            }

            let newXp = (pet.xp || 0) + xpGain;
            let newLevel = pet.level || 1;
            let newEnergy = Math.max(0, pet.energy - energyCost);
            let newFun = Math.max(0, (pet.fun || 100) - funCost);

            const xpNeeded = newLevel * 100;
            let leveledUp = false;
            let msg = "";

            if (newLevel < 10 && newXp >= xpNeeded) {
                newLevel++;
                newXp -= xpNeeded;
                newEnergy = 100; // Refill on level up
                newFun = 100;    // Refill fun on level up
                leveledUp = true;
                msg = `\n🎉 **LEVEL UP!** ${pet.name} subiu para o **Nível ${newLevel}**!`;
            } else if (newLevel >= 10) {
                newXp = Math.min(newXp, newLevel * 100);
            }

            await db.updatePet(pet.id, { energy: newEnergy, fun: newFun, xp: newXp, level: newLevel });
            return { leveledUp, msg };
        };

        // Verificar status "Suspeito" ou "Procurado"
        if (robber.suspiciousUntil > now) {
            const timeLeft = Math.ceil((robber.suspiciousUntil - now) / 60000);
            return this.reply(context, `🚫 **Acesso Negado.** Você está marcado como **Suspeito** e sob vigilância. Aguarde **${timeLeft} minutos** até a poeira baixar.`);
        }
        if (robber.wantedUntil > now) {
            const remaining = robber.wantedUntil - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / 60000);
            return this.reply(context, `🚫 **ALERTA MÁXIMO.** Você é um criminoso **Procurado** (${hours}h ${minutes}m restantes). Seus ativos estão congelados e ações bloqueadas.`);
        }

        // Verificar se a vítima tem proteção ativa (Alarme Pessoal)
        if (victim.robDefenseUntil > now) {
             return this.reply(context, `🛡️ **Alvo Protegido.** O sistema de segurança da vítima detectou sua intrusão e bloqueou o acesso.`);
        }

        // --- CONFIRMAÇÃO DE ALTO RISCO (Para usuários ricos) ---
        // A multa pode chegar a 10% da carteira. Se 10% >= 50.000 (Carteira >= 500.000), pedir confirmação.
        if (robber.wallet >= 500000) {
            const potentialFine = Math.floor(robber.wallet * 0.10);
            
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');
            const confirmEmbed = new EmbedBuilder()
                .setTitle('⚠️ Risco de Multa Elevada')
                .setDescription(`Você possui **${robber.wallet.toLocaleString()} Foxies** na carteira.\n` +
                    `Se o roubo falhar, a multa pode chegar a **${potentialFine.toLocaleString()} Foxies** (10%).\n\n` +
                    `Deseja correr o risco?`)
                .setColor(colors.warning);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_rob').setLabel('Confirmar Roubo').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_rob').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            );

            let confirmMsg;
            // Check if context is an interaction (has editReply)
            const isInteraction = typeof context.editReply === 'function';

            if (isInteraction) {
                if (context.deferred || context.replied) {
                    confirmMsg = await context.editReply({ embeds: [confirmEmbed], components: [confirmRow] });
                } else {
                    confirmMsg = await context.reply({ embeds: [confirmEmbed], components: [confirmRow], fetchReply: true });
                }
            } else {
                confirmMsg = await context.channel.send({ embeds: [confirmEmbed], components: [confirmRow] });
            }

            try {
                const confirmation = await confirmMsg.awaitMessageComponent({
                    filter: i => i.user.id === robberUser.id && ['confirm_rob', 'cancel_rob'].includes(i.customId),
                    time: 30000
                });

                if (confirmation.customId === 'cancel_rob') {
                    await confirmation.update({ content: '❌ Operação cancelada.', embeds: [], components: [] });
                    return;
                }

                await confirmation.update({ content: '✅ Arriscando tudo... Iniciando operação!', embeds: [], components: [] });
            } catch (e) {
                if (isInteraction) {
                    await context.editReply({ content: '⏱️ Tempo esgotado. Operação cancelada.', embeds: [], components: [] });
                } else {
                    await confirmMsg.edit({ content: '⏱️ Tempo esgotado. Operação cancelada.', embeds: [], components: [] });
                }
                return;
            }
        }

        // --- DEFESA DA VÍTIMA (PETS & ITENS) ---
        
        // 1. Pet: Bloqueio Total (Urso Bastilha N10, Pastor de Defesa N10, Cobra N10)
        for (const p of victimPassives) {
            if (['rob_block_chance', 'rob_block_total', 'rob_loss_prevent'].includes(p.type)) {
                if (Math.random() < p.value) {
                    await processPetXp(victimPet, 20, 10);
                    return this.reply(context, `🛡️ **BLOQUEIO!** O pet **${victimPet.name}** da vítima impediu o assalto completamente!`);
                }
            }
            // Camaleão Fantasma N10 / N5 / N1
            if (p.type === 'rob_invisible' || p.type === 'target_reduce') {
                 if (Math.random() < p.value) {
                     await processPetXp(victimPet, 15, 5);
                     return this.reply(context, `🦎 **Alvo Desaparecido!** O pet **${victimPet.name}** camuflou a vítima. Você não encontrou nada.`);
                 }
            }
            if (p.type === 'rob_avoid_loss') {
                if (Math.random() < p.value) {
                    await processPetXp(victimPet, 15, 5);
                    return this.reply(context, `🦎 **Evasão Tática!** O pet **${victimPet.name}** ajudou a vítima a esconder os suprimentos a tempo.`);
                }
            }
        }

        // 2. Colete à Prova de Balas (Ferramenta)
        const victimInventory = await db.getInventory(victimUser.id);
        if (victimInventory['colete_balas'] > 0) {
            if (Math.random() < 0.50) {
                return this.reply(context, `🛡️ **Blindagem Ativa.** O alvo está usando um **Colete à Prova de Balas** e repeliu seu ataque!`);
            }
        }

        // Verificar se a vítima tem dinheiro suficiente
        if (victim.wallet < 200) {
            return this.reply(context, '❌ O alvo não possui suprimentos suficientes para valer o risco (Mínimo: 200 Foxies).');
        }

        // Verificar se o ladrão tem dinheiro para pagar a multa
        const minRobBalance = 500;
        if (robber.wallet < minRobBalance) {
            return this.reply(context, `❌ Você precisa de pelo menos **${minRobBalance} Foxies** na carteira para cobrir uma possível fuga ou suborno caso falhe.`);
        }

        // --- CÁLCULO DE CHANCE ---
        let successChance = 20; // Base 20%
        let chanceMsg = "";

        // Dark Web Bonus
        if (darkWebBonus > 0) {
            successChance += (darkWebBonus * 100);
            chanceMsg += `\n🔨 **Pé de Cabra:** +${(darkWebBonus * 100).toFixed(0)}% chance.`;
        }

        // Buffs Temporários
        if (robber.robBuffUntil > now) successChance += 5; 
        if (robber.luckBuffExpires > now) successChance += (robber.luckBuffValue || 0);
        
        // Buffs de Pet (Ladrão)
        for (const p of robberPassives) {
            if (['rob_success', 'all_stats'].includes(p.type)) {
                const bonus = p.value * 100;
                successChance += bonus;
                chanceMsg += `\n🐕 **${robberPet.name}:** +${bonus.toFixed(0)}% chance.`;
            }
            
            // Modo Foco (Cão de Guerra Cibernético N10)
            if (p.type === 'focus_mode') {
                 if (Math.random() < p.value) {
                     successChance += 20;
                     chanceMsg += `\n🦿 **Modo Foco:** Mira Estabilizada (+20% chance).`;
                 }
            }
        }

        // Buffs de Pet (Vítima - Defesa)
        for (const p of victimPassives) {
            if (['rob_defense', 'all_stats', 'rob_defense_strong'].includes(p.type)) {
                const malus = p.value * 100;
                successChance -= malus;
                chanceMsg += `\n🛡️ **Pet da Vítima:** -${malus.toFixed(0)}% chance.`;
            }
        }

        // Itens do Ladrão (BUFFS ATIVOS)
        
        if (robberUser.buffRobSuccessExpires && now < robberUser.buffRobSuccessExpires) {
            const buffVal = (robberUser.buffRobSuccess || 0.15) * 100;
            successChance += buffVal;
            chanceMsg += `\n🛠️ **Buff Ativo:** +${buffVal.toFixed(0)}% chance.`;
        } else if (robberUser.buffRobSuccessExpires) {
             // Expirou, limpar
             robberUser.buffRobSuccess = 0;
             robberUser.buffRobSuccessExpires = 0;
             await db.updateUser(robberUser.userId, { buffRobSuccess: 0, buffRobSuccessExpires: 0 });
        }

        if (robberUser.buffRobStealthExpires && now < robberUser.buffRobStealthExpires) {
             const buffVal = (robberUser.buffRobStealth || 0.25) * 100;
             successChance += buffVal;
             chanceMsg += `\n🥷 **Buff Ativo:** +${buffVal.toFixed(0)}% chance (Stealth).`;
        } else if (robberUser.buffRobStealthExpires) {
             robberUser.buffRobStealth = 0;
             robberUser.buffRobStealthExpires = 0;
             await db.updateUser(robberUser.userId, { buffRobStealth: 0, buffRobStealthExpires: 0 });
        }
        
        // --- EVENTO GLOBAL (Chance de Sucesso) ---
        const activeEvent = await eventSystem.getWeeklyEvent();
        const eventSuccessBoost = eventSystem.getEventMultiplier(activeEvent, 'crime_success_boost', 0);
        if (eventSuccessBoost !== 0) {
            const boost = eventSuccessBoost * 100;
            successChance += boost;
            const emoji = boost > 0 ? '🍀' : '🐈‍⬛';
            chanceMsg += `\n${emoji} **Evento Global (${activeEvent.name}):** ${boost > 0 ? '+' : ''}${boost}% chance.`;
        }

        // Limites
        successChance = Math.max(5, Math.min(95, successChance));

        const roll = Math.random() * 100;
        
        // Chance Crítica/Exclusiva
        let critChance = 0;
        let exclusiveChance = 0.5; // 0.5% base

        // Pet Crítico (Raposa N5)
        for (const p of robberPassives) {
            if (p.type === 'rob_crit') critChance += (p.value * 100);
        }

        const isExclusive = roll < exclusiveChance;
        const isCrit = roll < (successChance * (critChance/100)); // Crítico dentro do sucesso? Ou chance separada?
        // Vamos considerar Crítico como um sucesso que rouba mais.
        const isSuccess = roll < successChance || isExclusive;

        // --- MISSÃO: TENTATIVA DE ROUBO ---
        try {
            const missionSystem = require('../../systems/missionSystem');
            await missionSystem.checkMission(robberUser.id, 'rob_attempt', 1, context);
        } catch (e) { console.error(e); }

        if (isSuccess) {
            // SUCESSO
            let amountStolen;
            let successType = "Normal";
            
            if (isExclusive) {
                amountStolen = victim.wallet; // TUDO (será limitado pelo cap)
                successType = "EXCLUSIVO";
            } else {
                // Roubo parcial (10% a 40%)
                let minPct = 10;
                let maxPct = 40;
                
                // Se for crítico, aumenta a porcentagem roubada
                if (isCrit || (Math.random() * 100 < critChance)) {
                    minPct = 40;
                    maxPct = 70;
                    successType = "CRÍTICO";
                }

                const percent = Math.floor(Math.random() * (maxPct - minPct)) + minPct;
                let finalAmount = Math.floor(victim.wallet * (percent / 100));

                // Bônus de Itens
                if (inventory['dispositivo_hack'] > 0) finalAmount = Math.floor(finalAmount * 1.10);
                if (inventory['traje_furtivo'] > 0) finalAmount = Math.floor(finalAmount * 1.15);

                amountStolen = finalAmount;
            }

            // --- CAP MÁXIMO (25k) ---
            const MAX_ROB_CAP = 25000;
            if (amountStolen > MAX_ROB_CAP) {
                amountStolen = MAX_ROB_CAP;
                // Adiciona um pequeno texto sobre o cap se for atingido? Talvez não precise poluir.
            }

            // Selecionar frase aleatória
            let flavorText = "";
            if (successType === "EXCLUSIVO") {
                flavorText = ROB_PHRASES.exclusive[Math.floor(Math.random() * ROB_PHRASES.exclusive.length)];
            } else if (successType === "CRÍTICO") {
                flavorText = ROB_PHRASES.critical[Math.floor(Math.random() * ROB_PHRASES.critical.length)];
            } else {
                flavorText = ROB_PHRASES.normal[Math.floor(Math.random() * ROB_PHRASES.normal.length)];
            }
            
            // Pet da Vítima: Reduzir Perda (Cobra de Guarda N1, Urso Bastilha N1)
            for (const p of victimPassives) {
                if (p.type === 'rob_loss_reduce') {
                    const reduceAmount = Math.floor(amountStolen * p.value);
                    amountStolen -= reduceAmount;
                    chanceMsg += `\n🛡️ **${victimPet.name}:** Protegeu ${reduceAmount} Foxies (-${(p.value*100).toFixed(0)}% perda).`;
                }
            }

            // Pet da Vítima: Recuperar Dinheiro (Cobra de Guarda N5, Urso Bastilha N5)
            let recovered = 0;
            for (const p of victimPassives) {
                if (['rob_recover_money', 'rob_return_money'].includes(p.type)) {
                    if (Math.random() < p.value) {
                        const recoverPct = 0.30; // Recupera 30%
                        recovered = Math.floor(amountStolen * recoverPct);
                        amountStolen -= recovered;
                        chanceMsg += `\n🐍 **Pet da Vítima:** Recuperou ${recovered} Foxies na fuga!`;
                    }
                }
            }

            // Raposa Estrategista N10 (Roubar Item)
            let stolenItemName = null;
            for (const p of robberPassives) {
                if (p.type === 'rob_steal_item' && Math.random() < p.value) {
                    const victimInv = await db.getInventory(victimUser.id);
                    const victimItems = Object.keys(victimInv).filter(id => victimInv[id] > 0);
                    
                    if (victimItems.length > 0) {
                        const itemId = victimItems[Math.floor(Math.random() * victimItems.length)];
                        await db.removeItem(victimUser.id, itemId, 1);
                        await db.addItem(robberUser.id, itemId, 1);
                        
                        // Encontrar nome do item
                        const allItems = require('../../items.json');
                        const itemObj = allItems.find(i => i.id === itemId);
                        stolenItemName = itemObj ? itemObj.name : itemId;
                        
                        chanceMsg += `\n🦊 **Raposa Estrategista:** Roubou 1x **${stolenItemName}** da vítima!`;
                    }
                }
            }

            // Atualizar saldos
            robber.wallet += amountStolen;
            victim.wallet -= amountStolen; // Vítima perde o original (sem o recuperado, que na verdade nunca saiu)
            // Espera, se recuperou, o ladrão leva menos, e a vítima perde menos.
            // A lógica acima: amountStolen já foi reduzido.
            // Então victim.wallet -= amountStolen está correto.

            await db.updateUser(robberUser.id, { 
                wallet: robber.wallet,
                consecutiveRobFailures: 0 // Reset failures on success
            });
            await db.updateUser(victimUser.id, { wallet: victim.wallet });

            // XP Pets
            if (robberPet) await processPetXp(robberPet, 15, 5);
            if (victimPet) await processPetXp(victimPet, 10, 5);

            // Gato Sombra N5 (Reduz suspeita) - Não implementado campo de suspeita variável, mas reduz chance de procurado.
            // Gato Sombra N10 (Não gerar procurado)
            let preventWanted = false;
            for (const p of robberPassives) {
                if (p.type === 'rob_no_wanted' && Math.random() < p.value) preventWanted = true;
            }

            // Chance de ficar Procurado (20%)
            if (!preventWanted && !isExclusive && Math.random() < 0.20) {
                 robber.wantedUntil = Date.now() + (1 * 60 * 60 * 1000); // 1 hora
                 chanceMsg += "\n🚔 **ALERTA:** Você foi identificado e agora está **PROCURADO**!";
                 await db.updateUser(robberUser.id, { wantedUntil: robber.wantedUntil });
            } else if (!preventWanted) {
                 // Suspeito (padrão)
                 robber.suspiciousUntil = Date.now() + (8 * 60 * 1000); // 8 minutos
                 await db.updateUser(robberUser.id, { suspiciousUntil: robber.suspiciousUntil });
            }

            const embed = new EmbedBuilder()
                .setTitle(isExclusive ? '🚨 ROUBO EXCLUSIVO 🚨' : (successType === "CRÍTICO" ? '💥 ROUBO CRÍTICO' : '🔫 Roubo Bem-Sucedido'))
                .setDescription(`Você roubou **${amountStolen} Foxies** de <@${victimUser.id}>!\n` +
                    `*${flavorText}*\n` +
                    chanceMsg +
                    `\n🎲 Chance: **${successChance.toFixed(1)}%**`)
                .setColor(colors.success)
                .setTimestamp();

            await this.reply(context, { embeds: [embed] });

            // --- MISSÕES ---
            try {
                // Missão de roubo removida
            // const missionSystem = require('../../systems/missionSystem');
            // await missionSystem.checkMission(robberUser.id, 'rob_success', 1);
            } catch (err) {
                console.error('Erro ao atualizar missão de roubo:', err);
            }

            try {
                const victimEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Alerta de Segurança')
                    .setDescription(`Você foi roubado por <@${robberUser.id}>!\nPerda: **$${amountStolen}**.` + (recovered > 0 ? `\nSeu pet recuperou **$${recovered}**!` : ''))
                    .setColor(colors.error)
                    .setTimestamp();
                await victimUser.send({ embeds: [victimEmbed] });
            } catch (e) {}

        } else {
            // FALHA

            // Dark Web Item: Máscara de Palhaço
            if (safeEscape) {
                // Consumir item
                robber.darkWebInventory.set('mask', robber.darkWebInventory.get('mask') - 1);
                
                // 50% de chance de funcionar
                if (Math.random() < 0.50) {
                    await db.updateUser(robberUser.id, { 
                        darkWebInventory: robber.darkWebInventory
                    });
                    
                    return this.reply(context, `🤡 **MÁSCARA DE PALHAÇO:** O roubo falhou, mas você desapareceu na multidão sem deixar rastros! Nenhuma penalidade aplicada.`);
                } else {
                    await this.reply(context, `🤡 **A Máscara Falhou!** A polícia te identificou mesmo mascarado.`);
                    // Continua para penalidade normal...
                }
            }

            let fineMsg = "";
            const finePercent = Math.floor(Math.random() * 6) + 5;
            let fine = Math.max(500, Math.floor(robber.wallet * (finePercent / 100)));

            // Pet do Ladrão: Reduzir Perda/Penalidade (Lobo de Investida N5, Mini Metal Gear N1)
            for (const p of robberPassives) {
                if (['rob_fail_penalty', 'penalty_reduce'].includes(p.type)) {
                    const reduction = p.value;
                    fine = Math.floor(fine * (1 - reduction));
                    fineMsg += `\n🐕 **${robberPet.name}:** Reduziu a multa em ${(reduction*100).toFixed(0)}%.`;
                }
                // Lobo N10 / Mini Metal Gear N5 (Sem prisão/multa?)
                if (p.type === 'rob_no_jail' || p.type === 'jail_ignore') {
                    if (Math.random() < p.value) {
                        fine = 0;
                        fineMsg += `\n💨 **Fuga Perfeita:** Você escapou sem pagar multa!`;
                    }
                }
            }

            if (fine > 0) {
                robber.wallet -= fine;
                await db.addToVault(fine);
                fineMsg += `\n💸 **Multa:** Você perdeu **$${fine}** na fuga.`;
            }

            // Penalidade por falhas consecutivas
            let consecutiveFailures = (robber.consecutiveRobFailures || 0) + 1;
            let failureMsg = "";
            let newWantedUntil = robber.wantedUntil;

            if (consecutiveFailures >= 3) {
                // Aplicar penalidade de 36 horas (Procurado)
                const penaltyTime = 36 * 60 * 60 * 1000;
                newWantedUntil = Date.now() + penaltyTime;
                consecutiveFailures = 0; // Resetar após aplicar a penalidade máxima
                
                failureMsg = `\n\n🚨 **ALERTA DE SEGURANÇA:**\nDevido a múltiplas tentativas de roubo falhas, você foi classificado como **Inimigo Público**!\nVocê está **PROCURADO** por **36 horas** e seus bens foram congelados.`;
            } else {
                failureMsg = `\n⚠️ **Aviso:** Falhas consecutivas (${consecutiveFailures}/3) podem levar a uma penalidade severa.`;
            }

            // Buff de Máscara de Pano (50% chance de evitar procurado/consequência)
            const now = Date.now();
            if (robberUser.buffReduceWantedExpires && now < robberUser.buffReduceWantedExpires) {
                 const avoidChance = robberUser.buffReduceWantedChance || 0.50;
                 if (Math.random() < avoidChance) {
                     // Evitou a penalidade
                     consecutiveFailures = Math.max(0, consecutiveFailures - 1); // Não aumenta contador
                     if (newWantedUntil > robberUser.wantedUntil) newWantedUntil = robberUser.wantedUntil; // Cancela aumento de procurado
                     failureMsg = `\n😷 **Máscara de Pano:** Você conseguiu despistar as autoridades! Nenhuma penalidade aplicada.`;
                 } else {
                     failureMsg += `\n(A máscara falhou desta vez)`;
                 }
            } else if (robberUser.buffReduceWantedExpires) {
                 robberUser.buffReduceWantedChance = 0;
                 robberUser.buffReduceWantedExpires = 0;
                 await db.updateUser(robberUser.id, { buffReduceWantedChance: 0, buffReduceWantedExpires: 0 });
            }

            await db.updateUser(robberUser.id, { 
                wallet: robber.wallet,
                consecutiveRobFailures: consecutiveFailures,
                wantedUntil: newWantedUntil
            });

            if (robberPet) await processPetXp(robberPet, 5, 5, 10);

            const embed = new EmbedBuilder()
                .setTitle('❌ Falha na Operação')
                .setDescription(`Você falhou ao tentar roubar <@${victimUser.id}>.` +
                    chanceMsg + fineMsg + failureMsg +
                    `\n🎲 Chance: **${successChance.toFixed(1)}%**`)
                .setColor(colors.error);
            
            await this.reply(context, { embeds: [embed] });
        }
    },

    async reply(context, content) {
        const payload = typeof content === 'string' ? { content } : content;
        if (context.deferred || context.replied) {
            return await context.editReply(payload);
        } else if (context.reply) {
            return await context.reply(payload);
        } else {
            return await context.channel.send(payload);
        }
    }
};
