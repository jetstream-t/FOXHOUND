const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const { User } = require('../../database'); // Import User model for atomic updates
const colors = require('../../colors.json');
const jobs = require('../../jobs.json');
const items = require('../../items.json');
const pets = require('../../pets.json');
const { checkPetStatus } = require('../../systems/petSystem');
const eventSystem = require('../../systems/eventSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trabalhar')
        .setDescription('Realize seu trabalho diário para ganhar Foxies')
        .addStringOption(option =>
            option.setName('modo')
                .setDescription('Escolha o modo de trabalho')
                .setRequired(false)
                .addChoices(
                    { name: 'Normal (Seguro)', value: 'normal' },
                    { name: 'Hora Extra (Arriscado)', value: 'risky' }
                )),

    async execute(interaction) {
        // Atualiza o último canal de economia usado
        await db.updateLastEconomyChannel(interaction.guild.id, interaction.channel.id);

        const mode = interaction.options.getString('modo');
        // Se modo não foi escolhido, não passamos nada para que o handleWork mostre o menu
        if (!mode) {
             await this.handleWork(interaction, interaction.user, null);
        } else {
             // Se escolheu modo, chama processWork direto
             await this.processWork(interaction, interaction.user, mode);
        }
    },

    async executePrefix(message, args) {
        const mode = args[0] ? (['arriscado', 'risky', 'extra'].includes(args[0].toLowerCase()) ? 'risky' : 'normal') : null;
        if (!mode) {
            await this.handleWork(message, message.author, null);
        } else {
            await this.processWork(message, message.author, mode);
        }
    },

    async handleWork(context, user, mode = null) {
        // Se já tem modo, não deveria estar aqui, mas redireciona por segurança
        if (mode) return this.processWork(context, user, mode);

        // Buscar dados do usuário
        let userData = await db.getUser(user.id);
        const now = Date.now();
        const baseCooldown = 30 * 60 * 1000; // 30 minutos
        
        // --- CÁLCULO DE COOLDOWN ---
        let cooldownReduction = 0;
        
        // Recuperar dados necessários para cálculo de cooldown
        const inventory = await db.getInventory(user.id);
        let activePet = await db.getActivePet(user.id);
        const activeEvent = await eventSystem.getWeeklyEvent();

        // 0. Evento Global - Cooldown
        const eventCooldownMult = eventSystem.getEventMultiplier(activeEvent, 'work_cooldown_mult');
        let effectiveBaseCooldown = baseCooldown * eventCooldownMult;

        // Atualiza status do pet (Lazy Update)
        if (activePet) {
            const updatedPet = await checkPetStatus(activePet, user, context.client);
            if (!updatedPet) activePet = null; // Pet morreu
            else activePet = updatedPet;
        }

        // 1. Buff de Pet (Passivas Escalonadas N1, N5, N10)
        if (activePet && activePet.energy > 0) {
            const petTemplate = pets.find(p => p.id === activePet.petId);
            if (petTemplate) {
                const level = activePet.level || 1;
                const activePassives = [];
                if (level >= 1 && petTemplate.passive.n1) activePassives.push(petTemplate.passive.n1);
                if (level >= 5 && petTemplate.passive.n5) activePassives.push(petTemplate.passive.n5);
                if (level >= 10 && petTemplate.passive.n10) activePassives.push(petTemplate.passive.n10);

                for (const p of activePassives) {
                    if (['work_cooldown', 'cooldown_work', 'all_stats'].includes(p.type)) {
                        cooldownReduction += effectiveBaseCooldown * p.value;
                    }
                    if (['cooldown_reduce_chance', 'cooldown_skip'].includes(p.type)) {
                        if (Math.random() < p.value) {
                            const skipPercent = p.type === 'cooldown_skip' ? 0.30 : 0.25;
                            cooldownReduction += effectiveBaseCooldown * skipPercent;
                        }
                    }
                    if (p.type === 'operation_mode' && Math.random() < 0.10) cooldownReduction = effectiveBaseCooldown;
                    if (p.type === 'anomaly' && Math.random() < 0.05 && Math.random() < 0.33) cooldownReduction = effectiveBaseCooldown;
                }
            }
        }

        if (inventory['cartao_acesso_vip'] > 0) cooldownReduction += 5 * 60 * 1000;
        
        // Novo Buff Consumível: Cartão VIP (Reduz 5 min por 2h)
        if (userData.buffWorkCooldownReduceExpires && now < userData.buffWorkCooldownReduceExpires) {
             const buffMinutes = userData.buffWorkCooldownReduce || 5;
             cooldownReduction += buffMinutes * 60 * 1000;
        } else if (userData.buffWorkCooldownReduceExpires) {
             // Limpar expirado
             userData.buffWorkCooldownReduce = 0;
             userData.buffWorkCooldownReduceExpires = 0;
             await db.updateUser(user.id, { buffWorkCooldownReduce: 0, buffWorkCooldownReduceExpires: 0 });
        }

        if (userData.workCooldownReduction > 0) {
            cooldownReduction += effectiveBaseCooldown * userData.workCooldownReduction;
        }

        const penalty = (userData.workPenalty || 0) * 60 * 1000;
        const totalCooldown = Math.max(0, effectiveBaseCooldown - cooldownReduction) + penalty;

        if (now - (userData.lastWork || 0) < totalCooldown) {
            const timeLeft = totalCooldown - (now - userData.lastWork);
            const minutes = Math.floor(timeLeft / (60 * 1000));
            const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
            
            let msg = `❌ **Negativo, soldado.** Você está em exaustão técnica. Poderá retornar ao campo em **${minutes}m e ${seconds}s**.`;
            if (penalty > 0) msg += `\n⚠️ Inclui **${userData.workPenalty} min** de penalidade.`;
            
            return context.reply ? context.reply({ content: msg, flags: MessageFlags.Ephemeral }) : context.channel.send(msg);
        }

        // --- MENU DE SELEÇÃO DE MODO ---
        const jobId = userData.jobId || 'desempregado';
        const job = jobs.find(j => j.id === jobId) || jobs[0];

        const embed = new EmbedBuilder()
            .setTitle(`💼 Hora do Trabalho: ${job.name}`)
            .setDescription(`Seu turno de trabalho está disponível. Escolha sua abordagem para hoje.\n\n💰 **Salário Base Estimado:** ${job.salary[0]} - ${job.salary[1]} Foxies`)
            .setColor(colors.default)
            .addFields(
                { 
                    name: '🟢 Turno Normal (Seguro)', 
                    value: 'Recebe o salário base garantido.\nSem riscos, sem surpresas.', 
                    inline: false 
                },
                { 
                    name: '🔴 Hora Extra (Arriscado)', 
                    value: `Tente a sorte por um pagamento maior!\n• **60% Chance:** Sucesso (1.5x - 2.0x)\n• **10% Chance:** Crítico (3.0x)\n• **30% Chance:** Falha (Recebe $0)`, 
                    inline: false 
                }
            )
            .setFooter({ text: "Escolha com sabedoria. Você tem 30 segundos." });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('work_normal').setLabel('Trabalho Normal').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('work_risky').setLabel('Hora Extra').setStyle(ButtonStyle.Danger).setEmoji('🔴')
            );

        let reply;
        if (context.reply) {
            reply = await context.reply({ embeds: [embed], components: [row], fetchReply: true });
        } else {
            reply = await context.channel.send({ embeds: [embed], components: [row] });
        }

        const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

        collector.on('collect', async i => {
            if (i.user.id !== user.id) return i.reply({ content: '❌ Sai pra lá, esse turno não é seu!', ephemeral: true });
            
            // Determina o modo baseado no botão clicado
            const selectedMode = i.customId === 'work_normal' ? 'normal' : 'risky';
            
            // IMPORTANTE: Defer o update para evitar "Interaction failed" ou timeout
            // Isso diz ao Discord que recebemos o clique e vamos processar
            try {
                await i.deferUpdate(); 
            } catch (e) {
                // Se já foi respondido ou deferido, ignora
            }
            
            // Chama o processamento passando a interação do botão para que ele possa editar a mensagem original
            await this.processWork(context, user, selectedMode, i); 
            
            collector.stop('user_selected');
        });

        collector.on('end', (collected, reason) => {
            if (reason !== 'user_selected') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
                );
                // Tenta editar a mensagem para desabilitar botões se expirou
                if (context.editReply) {
                    context.editReply({ components: [disabledRow] }).catch(() => {});
                } else if (reply && reply.editable) {
                    reply.edit({ components: [disabledRow] }).catch(() => {});
                }
            }
        });
    },

    async processWork(context, user, mode, buttonInteraction = null) {
        const now = Date.now();
        // Recarregar dados para garantir consistência
        let userData = await db.getUser(user.id);
        
        // --- VALIDAR COOLDOWN (Segurança Extra) ---
        const baseCooldown = 30 * 60 * 1000;
        let cooldownReduction = 0;
        const inventory = await db.getInventory(user.id);
        let activePet = await db.getActivePet(user.id);
        const activeEvent = await eventSystem.getWeeklyEvent();
        
        const eventCooldownMult = eventSystem.getEventMultiplier(activeEvent, 'work_cooldown_mult');
        let effectiveBaseCooldown = baseCooldown * eventCooldownMult;

        // Atualiza status do pet
        if (activePet) {
            const updatedPet = await checkPetStatus(activePet, user, context.client);
            if (!updatedPet) activePet = null;
            else activePet = updatedPet;
        }

        if (activePet && activePet.energy > 0) {
            const petTemplate = pets.find(p => p.id === activePet.petId);
            if (petTemplate) {
                const level = activePet.level || 1;
                const activePassives = [];
                if (level >= 1 && petTemplate.passive.n1) activePassives.push(petTemplate.passive.n1);
                if (level >= 5 && petTemplate.passive.n5) activePassives.push(petTemplate.passive.n5);
                if (level >= 10 && petTemplate.passive.n10) activePassives.push(petTemplate.passive.n10);
                
                for (const p of activePassives) {
                    if (['work_cooldown', 'cooldown_work', 'all_stats'].includes(p.type)) cooldownReduction += effectiveBaseCooldown * p.value;
                    if (['cooldown_reduce_chance', 'cooldown_skip'].includes(p.type)) {
                         if (Math.random() < p.value) cooldownReduction += effectiveBaseCooldown * (p.type === 'cooldown_skip' ? 0.30 : 0.25);
                    }
                    if (p.type === 'operation_mode' && Math.random() < 0.10) cooldownReduction = effectiveBaseCooldown;
                    if (p.type === 'anomaly' && Math.random() < 0.05 && Math.random() < 0.33) cooldownReduction = effectiveBaseCooldown;
                }
            }
        }
        if (inventory['cartao_acesso_vip'] > 0) cooldownReduction += 5 * 60 * 1000;
        if (userData.workCooldownReduction > 0) cooldownReduction += effectiveBaseCooldown * userData.workCooldownReduction;
        
        const penalty = (userData.workPenalty || 0) * 60 * 1000;
        const totalCooldown = Math.max(0, effectiveBaseCooldown - cooldownReduction) + penalty;

        if (now - (userData.lastWork || 0) < totalCooldown) {
             const timeLeft = totalCooldown - (now - userData.lastWork);
             const minutes = Math.floor(timeLeft / (60 * 1000));
             const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
             const msg = `❌ **Calma lá!** Você já trabalhou recentemente. Aguarde **${minutes}m ${seconds}s**.`;
             if (buttonInteraction) return buttonInteraction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
             return context.reply ? context.reply({ content: msg, flags: MessageFlags.Ephemeral }) : context.channel.send(msg);
        }

        // Identificar emprego
        const jobId = userData.jobId || 'desempregado';
        const job = jobs.find(j => j.id === jobId) || jobs[0];

        // Calcular Salário Base
        let amount = Math.floor(Math.random() * (job.salary[1] - job.salary[0] + 1)) + job.salary[0];
        let description = "";
        let color = colors.success;
        let bonusDesc = "";
        let unlockMsg = "";
        let eventRare = false;
        let finalWorkPenalty = userData.workPenalty || 0;

        // --- LÓGICA DE RISCO ---
        if (mode === 'risky') {
            const isWanted = userData.wantedUntil > now;
            let failChance = 0.30;
            
            if (isWanted) {
                failChance = 0.50;
                description = `⚠️ **ALERTA:** Você está **PROCURADO**! O risco de ser pego é muito maior.\n`;
            }

            const riskRoll = Math.random();
            
            if (riskRoll < failChance) { 
                // Falha
                const failPhrases = [
                    "Você tentou fazer hora extra mas acabou dormindo no serviço.",
                    "Seu chefe te pegou procrastinando na hora extra.",
                    "Você cometeu um erro grave e não foi pago pelo turno extra.",
                    "A exaustão bateu e você foi mandado para casa mais cedo."
                ];
                
                let failMsg = failPhrases[Math.floor(Math.random() * failPhrases.length)];
                let extraPenalty = 0;

                if (isWanted) {
                    failMsg = "🚓 **A POLÍCIA TE ENCONTROU!**\nVocê foi identificado no trabalho devido ao seu status de **Procurado**. Teve que fugir às pressas!";
                    extraPenalty = 15;
                    finalWorkPenalty += extraPenalty;
                }

                description = `❌ **Falha na Hora Extra!**\n${failMsg}\nVocê não ganhou nada desta vez.`;
                if (extraPenalty > 0) description += `\n⚠️ **Penalidade:** +${extraPenalty} minutos de cooldown.`;
                
                amount = 0;
                color = colors.error;
            } else if (riskRoll < 0.90) { 
                // 60% Sucesso
                const multiplier = (Math.random() * 0.5) + 1.5;
                amount = Math.floor(amount * multiplier);
                description = `🔥 **Hora Extra Produtiva!**\nVocê trabalhou duro e garantiu um pagamento turbinado!`;
                bonusDesc += `\n🔴 **Risco:** Bônus de Hora Extra (+${Math.round((multiplier - 1) * 100)}%)`;
            } else {
                // 10% Crítico
                amount = amount * 3;
                description = `🚀 **DESEMPENHO LENDÁRIO!**\nSeu chefe ficou impressionado com sua dedicação insana!`;
                bonusDesc += `\n🔴 **Risco:** CRÍTICO! Pagamento Triplicado!`;
                color = colors.gold || '#FFD700';
            }
        } else {
            // Normal
            if (job.phrases && job.phrases.length > 0) {
                const randomPhrase = job.phrases[Math.floor(Math.random() * job.phrases.length)];
                description = randomPhrase.replace('{gain}', `**$${amount.toLocaleString()}**`);
            } else {
                description = `Você completou seu turno com sucesso.`;
            }
        }

        // Se falhou no arriscado, encerra aqui (mas aplica cooldown)
        if (amount === 0) {
            // Atomic Update para Falha
            await User.findOneAndUpdate(
                { userId: user.id, lastWork: userData.lastWork },
                { 
                    $set: { 
                        lastWork: now, 
                        workCooldownReduction: 0,
                        workPenalty: finalWorkPenalty
                    } 
                }
            );
            
            const embed = new EmbedBuilder()
                .setTitle(`💼 Relatório de Trabalho: ${job.name}`)
                .setDescription(description)
                .setColor(color)
                .setFooter({ text: "Tente novamente mais tarde. Ousadia tem seu preço." });

            if (buttonInteraction) {
                await buttonInteraction.editReply({ embeds: [embed], components: [] });
            } else if (context.reply) {
                await context.reply({ embeds: [embed] });
            } else {
                await context.channel.send({ embeds: [embed] });
            }
            return;
        }

        // --- EVENTOS RAROS (1% Chance) ---
        if (Math.random() < 0.01) {
            eventRare = true;
            const events = [
                { name: "Carteira Perdida", text: "Você achou uma carteira recheada no caminho!", bonus: 500 },
                { name: "Gorjeta do CEO", text: "O dono da empresa gostou do seu estilo!", bonus: 1000 },
                { name: "Dia de Sorte", text: "Você encontrou dinheiro esquecido no caixa!", bonus: 300 }
            ];
            const evt = events[Math.floor(Math.random() * events.length)];
            amount += evt.bonus;
            bonusDesc += `\n✨ **EVENTO RARO:** ${evt.text} (+${evt.bonus} Foxies)`;
            color = colors.gold || '#FFD700';
        }

        // --- CÁLCULO DE BÔNUS DE PETS E ITENS ---
        if (activePet && activePet.energy > 0) {
            const petTemplate = pets.find(p => p.id === activePet.petId);
            if (petTemplate) {
                const level = activePet.level || 1;
                const activePassives = [];
                if (level >= 1 && petTemplate.passive.n1) activePassives.push(petTemplate.passive.n1);
                if (level >= 5 && petTemplate.passive.n5) activePassives.push(petTemplate.passive.n5);
                if (level >= 10 && petTemplate.passive.n10) activePassives.push(petTemplate.passive.n10);

                for (const p of activePassives) {
                    if (['work_money', 'all_stats'].includes(p.type)) {
                        const bonus = Math.floor(amount * p.value);
                        amount += bonus;
                        bonusDesc += `\n🐾 **${activePet.name}:** +${bonus} Foxies (${(p.value * 100).toFixed(0)}%).`;
                    }
                    if (['work_extra_coins', 'work_high_bonus', 'work_treasure'].includes(p.type)) {
                         if (Math.random() < p.value) {
                             const multiplier = p.type === 'work_treasure' ? 2.0 : 0.5;
                             const extra = Math.floor(amount * multiplier);
                             amount += extra;
                             bonusDesc += `\n💰 **${activePet.name}:** Bônus encontrado (+${extra} Foxies)!`;
                         }
                    }
                    if (['work_double'].includes(p.type) && Math.random() < p.value) {
                        amount *= 2;
                        bonusDesc += `\n🎰 **${activePet.name}:** 2x Recompensa!`;
                    }
                    if (p.type === 'work_item_chance' && Math.random() < p.value) {
                        amount += 250;
                        bonusDesc += `\n📦 **${activePet.name}:** Item vendido (+250 Foxies)!`;
                    }
                    if (p.type === 'night_bonus') {
                        const h = new Date().getHours();
                        if (h >= 20 || h <= 6) {
                            amount += Math.floor(amount * p.value);
                            bonusDesc += `\n🦉 **${activePet.name}:** Adicional Noturno!`;
                        }
                    }
                }
            }

            // Atualizar XP Pet
            let xpGain = 5;
            if (userData.xpBuffExpires && now < userData.xpBuffExpires) xpGain = Math.floor(xpGain * (userData.xpBuffMultiplier || 1));
            
            let newEnergy = Math.max(0, activePet.energy - 2);
            let newFun = Math.max(0, (activePet.fun || 100) - 5);
            let currentXp = (activePet.xp || 0) + xpGain;
            let currentLevel = activePet.level || 1;
            const xpNeeded = currentLevel * 100;
            const maxLevel = 10;

            if (currentLevel < maxLevel && currentXp >= xpNeeded) {
                currentLevel++;
                currentXp -= xpNeeded;
                newEnergy = 100;
                newFun = 100;
                bonusDesc += `\n🎉 **LEVEL UP!** ${activePet.name} subiu para o **Nível ${currentLevel}**!`;
            } else if (currentLevel >= maxLevel) {
                currentXp = Math.min(currentXp, currentLevel * 100);
            }

            await db.updatePet(activePet.id, { 
                energy: newEnergy,
                fun: newFun,
                xp: currentXp,
                level: currentLevel
            });
        }

        // Itens e Consumíveis (BUFFS ATIVOS)
        if (inventory['veiculo_operacoes'] > 0 || (userData.permanentWorkMultiplier && userData.permanentWorkMultiplier > 1)) {
            amount = Math.floor(amount * 1.02);
            bonusDesc += `\n🏎️ **Veículo Tático:** +2%`;
        }
        
        // Chip de Otimização
        if (userData.workMultiplierExpires && now < userData.workMultiplierExpires) {
            const mult = userData.workMultiplier || 1;
            if (mult > 1) {
                amount = Math.floor(amount * mult);
                bonusDesc += `\n💾 **Chip:** +${Math.round((mult - 1) * 100)}%`;
            }
        } else if (userData.workMultiplierExpires > 0) {
            userData.workMultiplier = 1;
            userData.workMultiplierExpires = 0;
        }

        // Luvas de Ouro (Buff de Drop) - Lógica de Drop está mais abaixo, mas vamos aplicar aqui se for o caso
        // ... (Verificar se implementa drop aqui ou em outro lugar)
        // A lógica de drop original estava dentro de Evento Global. Vamos expandir.
        
        let extraDropChance = 0;
        if (userData.buffItemDropExpires && now < userData.buffItemDropExpires) {
             extraDropChance += (userData.buffItemDrop || 0.10);
             bonusDesc += `\n🧤 **Luvas de Ouro:** Chance de drop aumentada!`;
        } else if (userData.buffItemDropExpires) {
             userData.buffItemDrop = 0;
             userData.buffItemDropExpires = 0;
        }

        // --- EVENTO GLOBAL (Bônus Final) ---
        const eventMoneyMult = eventSystem.getEventMultiplier(activeEvent, 'work_money_mult');
        if (eventMoneyMult !== 1.0) {
            const oldAmount = amount;
            amount = Math.floor(amount * eventMoneyMult);
            const diff = amount - oldAmount;
            const emoji = eventMoneyMult > 1 ? '📈' : '📉';
            bonusDesc += `\n${emoji} **Evento Global (${activeEvent.name}):** ${eventMoneyMult > 1 ? '+' : ''}${diff} moedas`;
        }
        
        // --- EVENTO GLOBAL (Item Drop) ---
        const eventDropChance = eventSystem.getEventMultiplier(activeEvent, 'work_item_drop_chance', 0);
        const finalDropChance = eventDropChance + extraDropChance;

        if (finalDropChance > 0 && Math.random() < finalDropChance) {
            const dropItem = items.find(i => i.id === 'caixa_suprimentos') || { id: 'dinheiro_extra', name: 'Bônus Extra' };
            if (dropItem.id === 'dinheiro_extra') {
                amount += 500;
                bonusDesc += `\n🎁 **Evento Global:** Você encontrou um bônus extra! (+500)`;
            } else {
                await db.addItem(user.id, dropItem.id, 1);
                bonusDesc += `\n🎁 **Evento Global:** Você encontrou **${dropItem.name}**!`;
            }
        }

        // --- TAXA DE GUILDA ---
        const guildTaxResult = await db.applyGuildTax(user.id, amount);
        amount = guildTaxResult.finalAmount;
        
        let guildTaxMsg = "";
        if (guildTaxResult.tax > 0) {
            const destination = guildTaxResult.taxDestination === 'guild' ? 'Cofre da Guilda' : 'Cofre Global';
            guildTaxMsg = `\n🏰 **Taxa da Guilda [${guildTaxResult.guildTag}]:** ${guildTaxResult.tax} Foxies (${guildTaxResult.taxRate}%) → ${destination}`;
        }

        // Salvar Tudo (ATOMIC UPDATE)
        let newPenalty = finalWorkPenalty;
        if (newPenalty > 0) newPenalty -= 1;
        const newTotalWorks = (userData.totalWorks || 0) + 1;

        const updateResult = await User.findOneAndUpdate(
            { userId: user.id, lastWork: userData.lastWork }, // Optimistic Lock
            { 
                $inc: { wallet: amount },
                $set: { 
                    lastWork: now, 
                    workCooldownReduction: 0, 
                    workPenalty: newPenalty,
                    totalWorks: newTotalWorks,
                    workMultiplier: userData.workMultiplier,
                    workMultiplierExpires: userData.workMultiplierExpires
                }
            },
            { returnDocument: 'after' }
        );

        if (!updateResult) {
            const msg = `❌ **Ação Bloqueada:** Você já trabalhou agora mesmo. Acalme-se!`;
            if (buttonInteraction) return buttonInteraction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
            return context.channel.send(msg);
        }

        // Verificar Promoção
        const unlockedJob = jobs.find(j => j.minWorks === newTotalWorks);
        if (unlockedJob) {
            unlockMsg = `🎉 **PROMOÇÃO!** Você desbloqueou: **${unlockedJob.name}**! Use \`/emprego\`.`;
        }

        // Construir Embed Final
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`💼 Relatório: ${job.name}`)
            .setDescription(description)
            .addFields(
                { name: '💰 Pagamento', value: `**$${amount.toLocaleString()}**`, inline: true },
                { name: '🔨 Exp', value: `**${newTotalWorks}**`, inline: true }
            );

        if (bonusDesc) embed.addFields({ name: '📈 Bônus', value: bonusDesc, inline: false });
        if (guildTaxMsg) embed.addFields({ name: '💸 Deduções', value: guildTaxMsg, inline: false });
        if (unlockMsg) embed.addFields({ name: '🌟 Nova Oportunidade', value: unlockMsg, inline: false });

        const tips = ["Use /loja para melhorar.", "Pets aumentam seus ganhos.", "O banco é seu amigo."];
        embed.setFooter({ text: tips[Math.floor(Math.random() * tips.length)] });

        if (buttonInteraction) {
            await buttonInteraction.editReply({ embeds: [embed], components: [] });
        } else if (context.reply) {
            await context.reply({ embeds: [embed] });
        } else {
            await context.channel.send({ embeds: [embed] });
        }

        // Missões
        try {
            const missionSystem = require('../../systems/missionSystem');
            await missionSystem.checkMission(user.id, 'work', 1, context);
        } catch (err) {
            console.error('Erro missão work:', err);
        }
    }
};