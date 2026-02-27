const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const items = require('../../items.json');
const pets = require('../../pets.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventario')
        .setDescription('Mostra seus itens e equipamentos'),

    async execute(interaction) {
        await this.showInventory(interaction, interaction.user.id);
    },

    async executePrefix(message, args) {
        await this.showInventory(message, message.author.id);
    },

    async showInventory(target, userId) {
        const inventory = await db.getInventory(userId);
        const itemIds = Object.keys(inventory);

        const embed = new EmbedBuilder()
            .setTitle('🎒 Mochila de Equipamentos')
            .setColor(colors.default)
            .setTimestamp();

        if (itemIds.length === 0) {
            embed.setDescription('Sua mochila está vazia, soldado. Vá até a `/loja` para se equipar.');
            if (target.reply) {
                return await target.reply({ embeds: [embed] });
            } else {
                return await target.channel.send({ embeds: [embed] });
            }
        }

        const fields = itemIds.map(id => {
            const item = items.find(i => i.id === id);
            const count = inventory[id];
            
            if (!item) return null;

            return {
                name: `${item.name} (x${count})`,
                value: `📝 ${item.description}\n🆔 \`${item.id}\``,
                inline: false
            };
        }).filter(Boolean);

        embed.addFields(fields);

        // Criar menu de seleção para usar itens
        const usableItems = itemIds
            .map(id => items.find(i => i.id === id))
            .filter(i => i && i.usable);

        let components = [];

        if (usableItems.length > 0) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('use_item')
                .setPlaceholder('Selecione um item para usar')
                .addOptions(
                    usableItems.map(item => ({
                        label: item.name,
                        description: item.description.substring(0, 100),
                        value: item.id,
                        emoji: '🛠️'
                    })).slice(0, 25) // Limite do Discord
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);
            components.push(row);
        }

        let msg;
        if (target.reply) {
            msg = await target.reply({ embeds: [embed], components: components, fetchReply: true, ephemeral: true });
        } else {
            msg = await target.channel.send({ embeds: [embed], components: components });
        }

        if (usableItems.length > 0) {
            const collector = msg.createMessageComponentCollector({ 
                componentType: ComponentType.StringSelect, 
                time: 60000 
            });

            collector.on('collect', async i => {
                if (i.user.id !== userId) {
                    return i.reply({ content: '❌ Apenas o dono do inventário pode usar itens.', ephemeral: true });
                }

                const itemId = i.values[0];
                await this.useItem(i, userId, itemId);
            });

            collector.on('end', () => {
                if (msg.editable) {
                    msg.edit({ components: [] }).catch(() => {});
                }
            });
        }
    },

    async useItem(target, userId, itemId) {
        const item = items.find(i => i.id === itemId);
        
        if (!item) {
            const msg = '❌ Item não encontrado ou não existe.';
            return target.reply({ content: msg, ephemeral: true });
        }

        if (!item.usable) {
            const msg = '❌ Este item não pode ser usado (apenas colecionável ou passivo).';
            return target.reply({ content: msg, ephemeral: true });
        }

        const user = await db.getUser(userId);
        const inventory = await db.getInventory(userId);
        const count = inventory[itemId] || 0;

        if (count <= 0) {
            const msg = `❌ Você não possui **${item.name}** no inventário.`;
            return target.reply({ content: msg, ephemeral: true });
        }

        // Aplica o efeito
        let effectMsg = '';
        let success = true;
        let handledReply = false;
        const now = Date.now();
        let updates = {};

        // Helper para cooldown
        const getWorkCooldown = () => {
            const base = 30 * 60 * 1000;
            const penalty = (user.workPenalty || 0) * 60 * 1000;
            return base + penalty;
        };

        // --- SWITCH DE EFEITOS ---
        switch (item.effect) {
            // CONSUMÍVEIS
            case 'reduce_work_cooldown_40': { // Ração de Turno
                const totalCd = getWorkCooldown();
                const passed = now - user.lastWork;
                const remaining = totalCd - passed;
                
                if (remaining <= 0) {
                    effectMsg = '❌ Você já pode trabalhar! Guarde a ração para depois.';
                    success = false;
                } else {
                    const reduction = remaining * 0.40;
                    updates.lastWork = user.lastWork - reduction;
                    effectMsg = '✅ Ração de Turno consumida! Cooldown reduzido em 40%.';
                }
                break;
            }
            case 'remove_work_penalty_50': { // Energético Sintético
                if ((user.workPenalty || 0) <= 0) {
                    effectMsg = '❌ Você não tem penalidade de trabalho para curar.';
                    success = false;
                } else {
                    updates.workPenalty = Math.max(0, Math.floor(user.workPenalty * 0.5));
                    effectMsg = '✅ Energético consumido! Penalidade reduzida em 50%.';
                }
                break;
            }
            case 'remove_work_penalty_100': { // Habeas Corpus
                if ((user.workPenalty || 0) <= 0) {
                    effectMsg = '❌ Você não tem penalidade de trabalho (trabalho comunitário) para remover.';
                    success = false;
                } else {
                    updates.workPenalty = 0;
                    effectMsg = '✅ Habeas Corpus deferido! Você está livre de todas as penalidades de trabalho.';
                }
                break;
            }
            case 'remove_all_suspicion': { // Kit de Limpeza Digital
                if ((user.wantedUntil || 0) > now) {
                    effectMsg = '❌ Você está **PROCURADO**! O Kit de Limpeza Digital não funciona nessa situação. Use uma **Identidade Falsa**.';
                    success = false;
                } else if ((user.suspiciousUntil || 0) <= now) {
                    effectMsg = '❌ Você não está sob suspeita no momento.';
                    success = false;
                } else {
                    updates.suspiciousUntil = 0;
                    effectMsg = '✅ Rastros apagados! Toda a suspeita foi removida.';
                }
                break;
            }
            case 'reduce_work_cooldown_100': { // Café Refinado
                const totalCd = getWorkCooldown();
                const passed = now - user.lastWork;
                const remaining = totalCd - passed;
                
                if (remaining <= 0) {
                    effectMsg = '❌ Você já pode trabalhar!';
                    success = false;
                } else {
                    updates.lastWork = 0; // Zera cooldown
                    effectMsg = '✅ Café Refinado tomado! Cooldown de trabalho ZERADO! ⚡';
                }
                break;
            }
            case 'add_work_multiplier_20_1h': { // Chip de Otimização
                updates.workMultiplier = 1.20;
                updates.workMultiplierExpires = now + (60 * 60 * 1000); // 1 hora
                effectMsg = '✅ Chip instalado! +20% de ganhos em trabalho por 1 hora.';
                break;
            }
            case 'remove_wanted_status': { // Identidade Falsa
                if ((user.wantedUntil || 0) <= now) {
                    effectMsg = '❌ Você não está sendo procurado.';
                    success = false;
                } else {
                    updates.wantedUntil = 0;
                    effectMsg = '✅ Identidade Falsa ativada! Você não é mais procurado.';
                }
                break;
            }
            case 'add_xp_buff_50_2h': { // Manual de Eficiência
                updates.xpBuffMultiplier = 1.50;
                updates.xpBuffExpires = now + (2 * 60 * 60 * 1000); // 2 horas
                effectMsg = '✅ Manual lido! +50% de XP em trabalhos por 2 horas.';
                break;
            }
            case 'add_luck_buff_10_30m': { // Amuleto da Sorte
                updates.luckBuffValue = 10; // +10%
                updates.luckBuffExpires = now + (30 * 60 * 1000); // 30 min
                effectMsg = '✅ Amuleto equipado! +10% de sorte em drops e roubos por 30 minutos.';
                break;
            }
            case 'immune_wanted_30m': { // Inibidor de Sinal
                updates.stealthBuffExpires = now + (30 * 60 * 1000); // 30 min
                effectMsg = '✅ Inibidor ativado! Você está imune ao status Procurado por 30 minutos.';
                break;
            }
            case 'bank_limit_bypass_once': { // Protocolo Bancário
                updates.nextDepositUnlimited = true;
                effectMsg = '✅ Protocolo aceito! O próximo depósito não terá limite máximo.';
                break;
            }
            case 'job_change_protection_once': { // Ordem Oficial
                updates.jobProtection = true;
                effectMsg = '✅ Ordem Oficial registrada! Sua próxima troca de emprego não terá penalidades.';
                break;
            }

            // --- NOVOS BUFFS (Itens transformados em consumíveis) ---
            case 'buff_reduce_wanted_chance_50_1h': { // Máscara de Pano
                updates.buffReduceWantedChance = 0.50;
                updates.buffReduceWantedExpires = now + (60 * 60 * 1000); // 1 hora
                effectMsg = '✅ Máscara equipada! 50% de chance de evitar ser procurado por 1 hora.';
                break;
            }
            case 'buff_rob_success_15_30m': { // Kit de Gazuas
                updates.buffRobSuccess = 0.15;
                updates.buffRobSuccessExpires = now + (30 * 60 * 1000); // 30 min
                effectMsg = '✅ Kit de Gazuas preparado! +15% de chance de roubo por 30 minutos.';
                break;
            }
            case 'buff_increase_item_drop_1h': { // Luvas de Ouro
                updates.buffItemDrop = 0.10; // Valor arbitrário de 10%
                updates.buffItemDropExpires = now + (60 * 60 * 1000); // 1 hora
                effectMsg = '✅ Luvas de Ouro calçadas! Maior chance de drops por 1 hora.';
                break;
            }
            case 'buff_rob_stealth_1h': { // Dispositivo de Camuflagem
                // Vamos usar o mesmo buff do Inibidor mas com efeito diferente no código do roubo?
                // Ou criar um novo campo específico. Vamos criar um novo.
                updates.buffRobStealth = 0.25; // +25% chance
                updates.buffRobStealthExpires = now + (60 * 60 * 1000); // 1 hora
                effectMsg = '✅ Camuflagem ativa! +25% de chance de sucesso em roubos por 1 hora.';
                break;
            }
            case 'buff_work_cooldown_reduce_5m_2h': { // Cartão VIP
                updates.buffWorkCooldownReduce = 5; // 5 minutos
                updates.buffWorkCooldownReduceExpires = now + (2 * 60 * 60 * 1000); // 2 horas
                effectMsg = '✅ Acesso VIP liberado! -5 minutos de cooldown de trabalho por 2 horas.';
                break;
            }
            case 'unlock_terminal_permanent': { // Terminal Portátil
                // Como era "tool" e agora é consumível, vamos salvar uma flag permanente
                if (user.hasPortableTerminal) {
                    effectMsg = '❌ Você já possui o Terminal desbloqueado.';
                    success = false;
                } else {
                    updates.hasPortableTerminal = true;
                    effectMsg = '✅ Terminal Portátil ativado! Acesso permanente desbloqueado.';
                }
                break;
            }
            case 'buff_rob_defense_2h': { // Colete
                updates.buffRobDefense = 0.50; // 50% chance
                updates.buffRobDefenseExpires = now + (2 * 60 * 60 * 1000); // 2 horas
                effectMsg = '✅ Colete ajustado! Proteção contra roubos ativa por 2 horas.';
                break;
            }

            // --- DESPERTADOR ---
            case 'alarm_clock_toggle': {
                const isCurrentlyEnabled = user.alarmClockEnabled || false;
                
                if (isCurrentlyEnabled) {
                    // Desativar o alarme - não remove o item do inventário pois é permanente e reutilizável!
                    effectMsg = `⏰ **Despertador Desativado!**\n\nVocê desativou as notificações de cooldown de trabalho.\nPara reativar, use este comando novamente quando quiser ser notificado no canal atual ou último canal usado em /trabalhar.\n\n*Nota: O item permanece no seu inventário.*`;
                    
                    await db.updateUser(userId, { 
                        alarmClockEnabled: false,
                        alarmClockChannelId: null,
                        alarmClockGuildId: null 
                    });
                    
                    // Não remove o item do inventário pois é permanente
                    if (target.reply) {
                        await target.reply({ content: effectMsg, ephemeral: true });
                    } else {
                        await target.channel.send(effectMsg);
                    }
                    
                    return; 
                } else {
                    let guildIdToSave = user.alarmClockGuildId || null;
                    let channelIdToSave = user.alarmClockChannelId || null;

                    if (target.guild && target.channel) {
                        guildIdToSave = target.guild.id;
                        channelIdToSave = target.channel.id;

                        const lastEconomyConfig = await db.getGuildConfig(guildIdToSave);
                        if (lastEconomyConfig && lastEconomyConfig.lastCommandChannelId) {
                            channelIdToSave = lastEconomyConfig.lastCommandChannelId;
                        }
                    }

                    updates.alarmClockEnabled = true;
                    updates.alarmClockGuildId = guildIdToSave;
                    updates.alarmClockChannelId = channelIdToSave;
                    updates.alarmClockActivatedAt = Date.now();

                    effectMsg = `⏰ **Despertador Ativado!** ✅\n\nVocê será notificado quando seu cooldown de trabalho terminar (incluindo penas).\n\n📍 Canal configurado: ${channelIdToSave ? `<#${channelIdToSave}>` : 'Não detectado'}\n\nPara desativar, use este item novamente em qualquer momento.\n\n*Nota: O item permanece no seu inventário.*`;

                    if (!channelIdToSave && !user.alarmClockChannelId) {
                        effectMsg += `\n⚠️ Não foi possível detectar um canal válido. Notificações não funcionarão até você usar /trabalhar novamente em um canal de economia.`;
                    }
                    
                    // Não remove o item do inventário pois é permanente - forzamos success = false mas com updates aplicados
                    success = false;
                    
                    // Aplica as atualizações mas não remove o item
                    if (Object.keys(updates).length > 0) {
                        await db.updateUser(userId, updates);
                    }
                    
                    if (target.reply) {
                        await target.reply({ content: effectMsg, ephemeral: true });
                    } else {
                        await target.channel.send(effectMsg);
                    }
                    
                    return;
                }
            }
            
            // Itens Colecionáveis que viraram consumíveis apenas para "registrar" na coleção (opcional)
            // Mas o usuário pediu "todos consumíveis". Para colecionáveis puros, talvez dar um efeito visual?
            case 'show_playtime':
            case 'permanent_work_buff': {
                // Esses itens têm efeitos permanentes ou passivos.
                // Veículo: Dá +2% permanente.
                if (item.id === 'veiculo_operacoes') {
                     if (user.permanentWorkMultiplier) {
                         effectMsg = '❌ Você já ativou este veículo.';
                         success = false;
                     } else {
                         updates.permanentWorkMultiplier = 1.02;
                         effectMsg = '✅ Veículo registrado na garagem! +2% de ganhos permanentes.';
                     }
                } else if (item.id === 'relogio_bolso') {
                     if (user.hasWatch) {
                         effectMsg = '❌ Você já equipou o relógio.';
                         success = false;
                     } else {
                         updates.hasWatch = true;
                         effectMsg = '✅ Relógio de Bolso equipado! O tempo agora joga a seu favor.';
                     }
                } else {
                    effectMsg = `✨ Você admirou seu **${item.name}**. É realmente valioso!`;
                    success = false; // Não consome itens caríssimos de coleção sem efeito
                }
                break;
            }

            // ITENS DE PET (Ração, Brinquedos, Ovos)
            case 'pet_feed_20':
            case 'pet_feed_50_xp_10': {
                const activePet = await db.getActivePet(user.id);
                if (!activePet) {
                    effectMsg = '❌ Você não tem um pet ativo para alimentar.';
                    success = false;
                } else if (activePet.energy >= 100) {
                    effectMsg = `❌ **${activePet.name}** já está de barriga cheia!`;
                    success = false;
                } else {
                    const energyGain = item.effect === 'pet_feed_50_xp_10' ? 50 : 20;
                    const xpGain = item.effect === 'pet_feed_50_xp_10' ? 10 : 0;
                    
                    let newEnergy = Math.min(100, activePet.energy + energyGain);
                    let newXp = activePet.xp + xpGain;
                    
                    // Atualiza Pet
                    await db.updatePet(activePet.id, { energy: newEnergy, xp: newXp });
                    
                    // Verifica Level Up se ganhou XP
                    if (xpGain > 0) {
                         // Lógica simplificada de check level (idealmente deveria estar numa função compartilhada)
                         const currentLevel = activePet.level || 1;
                         const xpNeeded = currentLevel * 100;
                         if (newXp >= xpNeeded && currentLevel < 10) {
                             await db.updatePet(activePet.id, { level: currentLevel + 1, xp: newXp - xpNeeded, energy: 100, fun: 100 });
                             effectMsg = `🍖 **Nham!** ${activePet.name} recuperou energia e subiu para o **Nível ${currentLevel + 1}**!`;
                         } else {
                             effectMsg = `🍖 **Nham!** ${activePet.name} recuperou energia e ganhou XP.`;
                         }
                    } else {
                        effectMsg = `🍖 **Nham!** ${activePet.name} recuperou ${energyGain} de energia.`;
                    }
                }
                break;
            }

            case 'pet_fun_20':
            case 'pet_fun_50_xp_15': {
                const activePet = await db.getActivePet(user.id);
                if (!activePet) {
                    effectMsg = '❌ Você não tem um pet ativo para brincar.';
                    success = false;
                } else if (activePet.fun >= 100) {
                    effectMsg = `❌ **${activePet.name}** já está super feliz!`;
                    success = false;
                } else {
                    const funGain = item.effect === 'pet_fun_50_xp_15' ? 50 : 20;
                    const xpGain = item.effect === 'pet_fun_50_xp_15' ? 15 : 0;
                    
                    let newFun = Math.min(100, (activePet.fun || 0) + funGain);
                    let newXp = activePet.xp + xpGain;

                    await db.updatePet(activePet.id, { fun: newFun, xp: newXp });

                    if (xpGain > 0) {
                         const currentLevel = activePet.level || 1;
                         const xpNeeded = currentLevel * 100;
                         if (newXp >= xpNeeded && currentLevel < 10) {
                             await db.updatePet(activePet.id, { level: currentLevel + 1, xp: newXp - xpNeeded, energy: 100, fun: 100 });
                             effectMsg = `🎾 **Ihuu!** ${activePet.name} se divertiu e subiu para o **Nível ${currentLevel + 1}**!`;
                         } else {
                             effectMsg = `🎾 **Ihuu!** ${activePet.name} adorou a brincadeira e ganhou XP.`;
                         }
                    } else {
                        effectMsg = `🎾 **Ihuu!** ${activePet.name} recuperou ${funGain} de diversão.`;
                    }
                }
                break;
            }

            case 'hatch_egg_common':
            case 'hatch_egg_rare':
            case 'hatch_egg_legendary': {
                // Animação de suspense (PÚBLICA)
                if (target.reply) {
                    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                    // Responde publicamente (sem ephemeral: true)
                    await target.reply({ content: `🥚 **${item.name}**: Aquecendo na incubadora...` });
                    await wait(1500);
                    await target.editReply({ content: `🐣 **${item.name}**: Começou a rachar!` });
                    await wait(1500);
                    await target.editReply({ content: `✨ **${item.name}**: Uma luz brilhante surge...` });
                    await wait(1000);
                    handledReply = true;
                }

                // Lógica de chocar ovo
                const petSystem = require('../../systems/petSystem');
                const eggType = item.effect.replace('hatch_egg_', ''); // common, rare, legendary
                
                // Simula o drop de um pet
                const newPet = await petSystem.hatchEgg(user.id, eggType);
                
                if (newPet) {
                    effectMsg = `🎉 **NASCIMENTO!**\nO ovo rachou e você obteve um **${newPet.name}** (${newPet.rarity})!`;
                } else {
                    effectMsg = `🥚 O ovo não chocou... (Algo deu errado no sistema de pets).`;
                    success = false; // Não consome se falhar o sistema
                }
                break;
            }

            // LOOTBOXES
            case 'lootbox_common':
            case 'lootbox_uncommon':
            case 'lootbox_rare':
            case 'lootbox_exclusive': {
                // Animação de suspense (PÚBLICA)
                if (target.reply) {
                    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                    // Responde publicamente (sem ephemeral: true)
                    await target.reply({ content: `📦 **${item.name}**: Quebrando o lacre...` });
                    await wait(1500);
                    await target.editReply({ content: `🔐 **${item.name}**: Forçando a fechadura...` });
                    await wait(1500);
                    await target.editReply({ content: `🔓 **${item.name}**: A tampa abriu! Verificando conteúdo...` });
                    await wait(1000);
                    handledReply = true;
                }

                const result = await this.openLootbox(item, userId);
                effectMsg = result.msg;
                if (result.updates) Object.assign(updates, result.updates);
                break;
            }

            default: {
                effectMsg = '❌ Efeito do item não implementado ou desconhecido.';
                success = false;
                break;
            }
        }

        if (success) {
            // Remove o item usado
            await db.removeItem(userId, itemId, 1);
            
            // Aplica atualizações no usuário
            if (Object.keys(updates).length > 0) {
                await db.updateUser(userId, updates);
            }

            if (target.reply) {
                if (handledReply) {
                    await target.editReply({ content: effectMsg });
                } else {
                    await target.reply({ content: effectMsg, ephemeral: true });
                }
            } else {
                // Fallback para mensagens normais (não deve ocorrer com o fluxo atual de inventário)
                await target.channel.send(effectMsg);
            }
        } else {
            if (target.reply && !handledReply) {
                await target.reply({ content: effectMsg, ephemeral: true });
            }
        }
    },

    async openLootbox(item, userId) {
        // Lógica de Lootbox
        const rarity = item.rarity; // comum, incomum, raro, exclusivo
        let rewards = [];
        let updates = {};

        const random = Math.random() * 100;
        let moneyReward = 0;

        // --- BÔNUS DE PET (Mercador de Campanha N5) ---
        const activePet = await db.getActivePet(userId);
        if (activePet && activePet.energy > 0) {
            const template = pets.find(p => p.id === activePet.petId);
            if (template) {
                const level = activePet.level || 1;
                // Mercador de Campanha N5: Chance de item extra em lootbox
                if (level >= 5 && template.passive.n5 && template.passive.n5.type === 'lootbox_extra') {
                    if (Math.random() < template.passive.n5.value) {
                         // Item Extra (Comum ou Incomum)
                         const bonusPool = items.filter(i => (i.rarity === 'comum' || i.rarity === 'incomum') && i.type !== 'lootbox');
                         if (bonusPool.length > 0) {
                             const bonusItem = bonusPool[Math.floor(Math.random() * bonusPool.length)];
                             await db.addItem(userId, bonusItem.id, 1);
                             rewards.push(`🎁 **Bônus de Pet:** 1x ${bonusItem.name}`);
                         }
                    }
                }
            }
        }

        // Configuração de drops baseada na raridade da caixa
        if (rarity === 'comum') { // Caixa de Suprimentos
            // 60% chance de dinheiro (500-1500)
            // 30% chance de item comum
            // 10% chance de item incomum
            if (random < 60) {
                moneyReward = Math.floor(Math.random() * 1000) + 500;
            } else if (random < 90) {
                // Drop item comum
                const commonItems = items.filter(i => i.rarity === 'comum' && i.type !== 'lootbox');
                if (commonItems.length > 0) {
                    const rewardItem = commonItems[Math.floor(Math.random() * commonItems.length)];
                    await db.addItem(userId, rewardItem.id, 1);
                    rewards.push(`1x ${rewardItem.name}`);
                }
            } else {
                // Drop item incomum
                const uncommonItems = items.filter(i => i.rarity === 'incomum' && i.type !== 'lootbox');
                if (uncommonItems.length > 0) {
                    const rewardItem = uncommonItems[Math.floor(Math.random() * uncommonItems.length)];
                    await db.addItem(userId, rewardItem.id, 1);
                    rewards.push(`1x ${rewardItem.name}`);
                }
            }
        } else if (rarity === 'raro') { // Cofre Trancado
            // 40% dinheiro (5000-15000)
            // 40% item incomum
            // 20% item raro
            if (random < 40) {
                moneyReward = Math.floor(Math.random() * 10000) + 5000;
            } else if (random < 80) {
                 const uncommonItems = items.filter(i => i.rarity === 'incomum' && i.type !== 'lootbox');
                if (uncommonItems.length > 0) {
                    const rewardItem = uncommonItems[Math.floor(Math.random() * uncommonItems.length)];
                    await db.addItem(userId, rewardItem.id, 1);
                    rewards.push(`1x ${rewardItem.name}`);
                }
            } else {
                 const rareItems = items.filter(i => i.rarity === 'raro' && i.type !== 'lootbox');
                if (rareItems.length > 0) {
                    const rewardItem = rareItems[Math.floor(Math.random() * rareItems.length)];
                    await db.addItem(userId, rewardItem.id, 1);
                    rewards.push(`1x ${rewardItem.name}`);
                }
            }
        } else if (rarity === 'exclusivo') { // Maleta Executiva
             // 30% dinheiro (20000-50000)
             // 70% item raro
             if (random < 30) {
                 moneyReward = Math.floor(Math.random() * 30000) + 20000;
             } else {
                 const rareItems = items.filter(i => i.rarity === 'raro' && i.type !== 'lootbox');
                 if (rareItems.length > 0) {
                     const rewardItem = rareItems[Math.floor(Math.random() * rareItems.length)];
                     await db.addItem(userId, rewardItem.id, 1);
                     rewards.push(`1x ${rewardItem.name}`);
                 }
             }
        }

        if (moneyReward > 0) {
            const user = await db.getUser(userId);
            updates.wallet = user.wallet + moneyReward;
            rewards.push(`💰 $${moneyReward}`);
        }

        if (rewards.length === 0) rewards.push("💨 Nada... A caixa estava vazia (Azar!)");

        return {
            success: true,
            msg: `📦 **${item.name} Aberta!**\nVocê encontrou:\n${rewards.join('\n')}`,
            updates: updates
        };
    }
};
