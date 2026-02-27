const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const eventSystem = require('../../systems/eventSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('assaltar-banco')
        .setDescription('Tentativa de assalto ao cofre global (EXTREMO RISCO)'),

    async execute(interaction) {
        await this.handleHeist(interaction, interaction.user);
    },

    async executePrefix(message, args) {
        await this.handleHeist(message, message.author);
    },

    async handleHeist(context, user) {
        const userData = await db.getUser(user.id);
        const guildConfig = await db.getGuildConfig(context.guildId || context.guild.id);
        const now = Date.now();
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        
        // 1. Verificar Status "Procurado"
        if (userData.wantedUntil > now) {
            const remaining = userData.wantedUntil - now;
            const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
            const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / 60000);
            return this.reply(context, `🚫 **ALERTA DE SEGURANÇA MÁXIMA.**\nVocê é um criminoso PROCURADO nível 5. Todas as suas operações estão bloqueadas por mais **${days}d ${hours}h ${minutes}m**.`);
        }

        // 2. Cooldown Pessoal (1 semana)
        if (now - userData.lastBankRob < oneWeek) {
            const timeLeft = oneWeek - (now - userData.lastBankRob);
            const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
            const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            return this.reply(context, `⏳ **Planejamento em andamento.** A segurança do banco está reforçada. Aguarde **${days} dias e ${hours} horas** para tentar novamente.`);
        }

        // 3. Cooldown Global (todos os servidores)
        const globalConfig = await db.getGlobalConfig('bank_heist_cooldown') || {};
        
        if (globalConfig.lastAttempt && globalConfig.lastAttempt > now) {
            const remaining = globalConfig.lastAttempt - now;
            const hours = Math.floor(remaining / (60 * 60 * 1000));
            const minutes = Math.floor((remaining % (60 * 60 * 1000)) / 60000);
            
            const reason = globalConfig.lastResult === 'success' ? 'APÓS ASSALTO BEM-SUCEDIDO' : 'APÓS FALHA RECENTE';
            return this.reply(context, `🚓 **ALERTA GLOBAL - ${reason}**\n\nA segurança nacional foi acionada em todos os servidores. Nenhuma tentativa de assalto é permitida por **${hours}h ${minutes}m**.\n\n🌍 **Bloqueio Global Ativo**`);
        }

        // 4. Custo de Entrada (Equipamento)
        const heistCost = 5000;
        if (userData.wallet < heistCost) {
            return this.reply(context, `❌ **Falta de Equipamento.** Você precisa de **${heistCost} Foxies** para comprar explosivos, máscaras e veículos de fuga.`);
        }

        // --- CONFIRMAÇÃO DE RISCO EXTREMO ---
        const confirmEmbed = new EmbedBuilder()
            .setTitle('🚨 CONFIRMAÇÃO DE OPERAÇÃO DE ALTO RISCO 🚨')
            .setDescription(`Você está prestes a iniciar um **Assalto ao Banco Central**.\n\n` +
                `💸 **Custo Inicial:** ${heistCost} Foxies (Não reembolsável)\n` +
                `⚠️ **Risco:** EXTREMO (< 1% de chance de sucesso)\n` +
                `📉 **Falha:** Perda massiva de dinheiro na carteira e no banco, além de status PROCURADO.\n` +
                `⏳ **Cooldown Pessoal:** 1 semana (após tentativa)\n` +
                `🌍 **Cooldown Global:** 30min (se falhar) ou 18h (se sucesso)\n\n` +
                `**Deseja prosseguir com a operação?**`)
            .setColor(colors.error)
            .setFooter({ text: 'Esta ação é irreversível após a confirmação. Responda em 30 segundos.' });

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_heist')
                .setLabel('CONFIRMAR ASSALTO')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔫'),
            new ButtonBuilder()
                .setCustomId('cancel_heist')
                .setLabel('ABORTAR MISSÃO')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛡️')
        );

        const replyMethod = context.reply ? context.reply.bind(context) : context.channel.send.bind(context.channel);
        // Usar fetchReply: true para slash commands e guardar a mensagem para prefix commands
        const response = await replyMethod({
            embeds: [confirmEmbed],
            components: [confirmRow],
            fetchReply: true
        });

        // Para comandos de prefixo, response é a mensagem. Para slash, response é a mensagem também (com fetchReply)
        // Se for slash command e não retornou mensagem (algumas versões do djs), tentar fetchReply separado se necessário, mas fetchReply: true resolve.
        
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30000
        });

        collector.on('collect', async i => {
            if (i.user.id !== user.id) {
                return i.reply({ content: '❌ Esta operação não é para você.', ephemeral: true });
            }

            if (i.customId === 'cancel_heist') {
                await i.update({
                    content: '🛡️ **Operação abortada.** Melhor prevenir do que remediar.',
                    embeds: [],
                    components: []
                });
                return;
            }

            if (i.customId === 'confirm_heist') {
                // Desativar botões
                await i.update({
                    content: '🔫 **Iniciando operação...** Que Deus tenha piedade de nós.',
                    components: []
                });
                
                // Executar lógica do assalto
                await this.processHeist(context, user, i);
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('confirm_heist').setLabel('Tempo Esgotado').setStyle(ButtonStyle.Danger).setDisabled(true),
                    new ButtonBuilder().setCustomId('cancel_heist').setLabel('Abortado').setStyle(ButtonStyle.Secondary).setDisabled(true)
                );
                
                // Tentar editar a mensagem original se possível
                try {
                    if (context.editReply) {
                        await context.editReply({ components: [disabledRow] });
                    } else if (response.edit) {
                        await response.edit({ components: [disabledRow] });
                    }
                } catch (e) {
                    // Mensagem pode ter sido deletada
                }
            }
        });
    },

    async processHeist(context, user, interaction) {
        try {
            // Recarregar dados para garantir consistência após confirmação
            const userData = await db.getUser(user.id);
            const guildConfig = await db.getGuildConfig(context.guildId || context.guild.id);
            const now = Date.now();
            const heistCost = 5000;

            // Cobrar custo
            userData.wallet -= heistCost;
            await db.addToVault(heistCost);
        
        // 5. Chance de Sucesso (< 1%)
        // Base: 0.8%
        let successChance = 0.8; 
        let petMsg = "";
        let penaltyReduction = 0;
        let avoidWanted = false;
        let lossReduction = 0;

        // --- BÔNUS DE PET ---
        const activePet = await db.getActivePet(user.id);
        
        // --- EVENTO GLOBAL (Chance de Sucesso) ---
        const activeEvent = await eventSystem.getWeeklyEvent();
        const eventSuccessBoost = eventSystem.getEventMultiplier(activeEvent, 'crime_success_boost', 0);
        const isEnergyImmune = eventSystem.getEventMultiplier(activeEvent, 'pet_decay_immunity', false);

        if (eventSuccessBoost !== 0) {
            // No assalto ao banco, o boost é muito poderoso, então aplicamos apenas 10% da força do boost normal de crimes
            // Ex: Se o evento dá +50% em roubar, aqui dá +5%
            const boost = (eventSuccessBoost * 100) * 0.1; 
            successChance += boost;
            // Emoji discreto
        }

        if (activePet && activePet.energy > 0) {
            const template = require('../../pets.json').find(p => p.id === activePet.petId);
            if (template) {
                const level = activePet.level || 1;
                const activePassives = [];
                if (level >= 1 && template.passive.n1) activePassives.push(template.passive.n1);
                if (level >= 5 && template.passive.n5) activePassives.push(template.passive.n5);
                if (level >= 10 && template.passive.n10) activePassives.push(template.passive.n10);

                for (const p of activePassives) {
                    // Aumentar chance de sucesso (Escalado em 10% da força original para balancear)
                    if (p.type === 'rob_success') {
                        const boost = p.value * 0.10; // Ex: 10% vira 1% extra
                        successChance += (boost * 100); // 0.8 + 1.0 = 1.8%
                        // Não vamos anunciar para manter o suspense, ou anunciamos no final se ganhar
                    }

                    // Redução de Penalidade (Multa/Tempo)
                    if (['rob_fail_penalty', 'penalty_reduce'].includes(p.type)) {
                        penaltyReduction += p.value; // Acumula %
                    }
                    
                    // Redução de Perda Financeira
                    if (p.type === 'rob_loss_reduce') {
                        lossReduction += p.value;
                    }

                    // Evitar Prisão/Procurado
                    if (['jail_ignore', 'rob_no_jail'].includes(p.type)) {
                        if (Math.random() < p.value) {
                            avoidWanted = true;
                            petMsg += `\n🐕 **${activePet.name}** garantiu uma rota de fuga limpa! (Sem Status Procurado)`;
                        }
                    }
                }
            }
        }

        const roll = Math.random() * 100;
        const isSuccess = roll < successChance;

        userData.lastBankRob = now;
        guildConfig.lastBankRob = now;
        await db.updateGuildConfig(context.guildId || context.guild.id, { lastBankRob: now });

        // Aplicar cooldown global baseado no resultado
        const globalCooldown = isSuccess ? 18 * 60 * 60 * 1000 : 30 * 60 * 1000; // 18h sucesso, 30min falha
        await db.saveGlobalConfig('bank_heist_cooldown', {
            lastAttempt: now + globalCooldown,
            lastResult: isSuccess ? 'success' : 'failure',
            timestamp: now
        });

        if (isSuccess) {
            // SUCESSO
            const vaultAmount = await db.getVault();
            // Rouba entre 2% e 5% do cofre global
            const stealPercent = (Math.random() * 0.03) + 0.02; 
            const stolenAmount = Math.floor(vaultAmount * stealPercent);

            // Atualizar cofre
            const newVault = Math.floor(vaultAmount - stolenAmount);
            await db.saveGlobalConfig('global_vault', newVault);

            // Atualizar usuário
            userData.wallet += stolenAmount;
            // Limpar ficha (opcional, ou aumentar wanted? Vamos deixar ele curtir o dinheiro)
            await userData.save();
            
            // XP para o Pet (Grande feito merece grande XP)
            if (activePet) {
                 await db.updatePet(activePet.id, { 
                     xp: (activePet.xp || 0) + 100, 
                     energy: Math.max(0, activePet.energy - (isEnergyImmune ? 0 : 20)) 
                 });
            }

            const embed = new EmbedBuilder()
                .setTitle('💰 O ASSALTO DO SÉCULO 💰')
                .setDescription(`**MISSÃO CUMPRIDA!**\n\nVocê invadiu o cofre da Reserva Federal e escapou com **${stolenAmount} moedas**!\n` +
                    `A economia global está em choque. Você é uma lenda viva.${petMsg}\n\n` +
                    `🌍 **ALERTA GLOBAL:** Segurança nacional acionada! Nenhuma tentativa permitida por **18 horas** em todos os servidores.`)
                .setColor('#FFD700') // Gold
                .setImage('https://media.giphy.com/media/l0Ex6kAKAoFRsFpgk/giphy.gif') // GIF de dinheiro (opcional)
                .setTimestamp();

            await this.reply(context, { embeds: [embed] });

            // Tentar anunciar globalmente (nos canais de log configurados)
            await this.broadcastHeist(context.client, user, stolenAmount);

        } else {
            // FALHA
            // Perda massiva: Perde tudo na carteira
            // Aplicar redução de perda (lossReduction) na carteira?
            // Original: Perde TUDO. Com lossReduction 0.35 (35%), perde 65%.
            const walletLossPct = Math.max(0, 1 - lossReduction);
            const lostWallet = Math.floor(userData.wallet * walletLossPct); // Quanto sobra? Não, lostWallet é o que perdeu? 
            // Vamos simplificar: userData.wallet = userData.wallet * lossReduction (o que salvou)
            // Se lossReduction = 0.35, salva 35%.
            
            const savedWallet = Math.floor(userData.wallet * lossReduction);
            const lostAmount = userData.wallet - savedWallet;
            userData.wallet = savedWallet;
            
            // Enviar valor perdido para o cofre
            if (lostAmount > 0) await db.addToVault(lostAmount, user.id);
            
            let bankMsg = '🏦 **Bloqueio de Bens:** 50% do seu banco foi congelado.';
            // Multa adicional do banco (se tiver)
            if (userData.bank > 0) {
                if (userData.bankProtectionUntil > now) {
                     bankMsg = '🏦 **Bloqueio de Bens:** 🛡️ PROTEGIDO pelo Software de Criptografia.';
                } else {
                    // Redução da multa bancária também
                    const finePct = Math.max(0.1, 0.5 - (penaltyReduction * 0.5)); // Reduz a % de multa
                    const bankFine = Math.floor(userData.bank * finePct); 
                    userData.bank -= bankFine;
                    
                    // Enviar multa para o cofre
                    if (bankFine > 0) await db.addToVault(bankFine, user.id);

                    if (penaltyReduction > 0) bankMsg += ` (Reduzido para ${Math.round(finePct*100)}%)`;
                }
            } else {
                bankMsg = '🏦 **Bloqueio de Bens:** Saldo bancário zerado, nada a congelar.';
            }

            // Status "Procurado" (1 a 3 dias)
            let wantedDays = Math.floor(Math.random() * 3) + 1;
            if (avoidWanted) wantedDays = 0;
            
            if (wantedDays > 0) {
                userData.wantedUntil = now + (wantedDays * 24 * 60 * 60 * 1000);
            }

            // Penalidade de Trabalho (+12h acumuladas)
            let penaltyMinutes = 12 * 60;
            
            // Verificar Licença de Porte (Advogado)
            if (userData.jailReductionUntil > now) {
                penaltyMinutes = Math.floor(penaltyMinutes / 2);
            }
            
            // Aplicar redução de penalidade do Pet
            if (penaltyReduction > 0) {
                penaltyMinutes = Math.floor(penaltyMinutes * (1 - penaltyReduction));
            }
            
            userData.workPenalty = (userData.workPenalty || 0) + penaltyMinutes;

            await userData.save();
            
            // XP Pet na falha (Menor)
            if (activePet) {
                 await db.updatePet(activePet.id, { 
                     xp: (activePet.xp || 0) + 25, 
                     energy: Math.max(0, activePet.energy - (isEnergyImmune ? 0 : 10)),
                     fun: Math.max(0, activePet.fun - 15) // Estresse alto
                 });
            }

            // Dicas de mitigação
            let tips = [];
            if (userData.bankProtectionUntil <= now) tips.push("💡 **Dica:** O **Software de Criptografia** protegeria seu banco.");
            if (userData.jailReductionUntil <= now) tips.push("💡 **Dica:** Um **Advogado** reduziria a pena de prisão em 50%.");
            const tipMsg = tips.length > 0 ? `\n\n${tips.join('\n')}` : '';
            
            if (lossReduction > 0) petMsg += `\n🛡️ **${activePet.name}** salvou ${savedWallet.toLocaleString()} Foxies da apreensão.`;
            if (penaltyReduction > 0) petMsg += `\n🐕 **${activePet.name}** negociou uma pena menor (-${(penaltyReduction*100).toFixed(0)}%).`;

            const embed = new EmbedBuilder()
                .setTitle('🚨 ASSALTO FRACASSADO - PRESO 🚨')
                .setDescription(`A SWAT cercou o prédio. Você foi capturado.\n\n` +
                    `💸 **Apreensão:** ${savedWallet > 0 ? `Sobrou ${savedWallet} Foxies na carteira.` : 'Todo seu dinheiro em mãos foi confiscado.'}\n` +
                    `${bankMsg}\n` +
                    (wantedDays > 0 ? `👮 **Sentença:** Você está **PROCURADO** por **${wantedDays} dias**.\n` : `👮 **Sentença:** Você escapou da ficha criminal graças ao seu pet!\n`) +
                    `🛠️ **Trabalhos Forçados:** +${(penaltyMinutes/60).toFixed(1)} horas de penalidade em trabalhos.` +
                    petMsg +
                    tipMsg +
                    `\n\n🌍 **ALERTA GLOBAL:** Segurança reforçada! Nenhuma tentativa permitida por **30 minutos** em todos os servidores.`)
                .setColor(colors.error)
                .setThumbnail('https://media.giphy.com/media/P2xf5nPyu5WP6/giphy.gif') // GIF de prisão
                .setTimestamp();

            await this.reply(context, { embeds: [embed] });
        }
        } catch (error) {
            console.error('Erro no processHeist:', error);
            await this.reply(context, { 
                content: '❌ **Erro crítico no sistema de assalto.** O sistema foi corrompido durante a operação.',
                ephemeral: true 
            });
        }
    },

    async broadcastHeist(client, user, amount) {
        const embed = new EmbedBuilder()
            .setTitle('🌍 NOTÍCIA URGENTE: ASSALTO AO BANCO CENTRAL')
            .setDescription(`Um assalto histórico acaba de ocorrer!\n\n` +
                `👺 **Criminoso:** ${user.tag}\n` +
                `💰 **Valor Roubado:** ${amount} Foxies\n` +
                `A FOXHOUND está mobilizando todas as unidades para investigar.`)
            .setColor('#FF0000')
            .setTimestamp();

        // Enviar para todos os servidores
        const guilds = client.guilds.cache;
        let successCount = 0;
        let failCount = 0;

        for (const [guildId, guild] of guilds) {
            try {
                const config = await db.getGuildConfig(guildId);
                // Prioridade: Canal do último comando > Canal de Logs > Canal de Sistema > Primeiro canal de texto
                let channelId = config?.lastCommandChannelId || config?.logsChannel;
                let channel = null;

                if (channelId) {
                    channel = guild.channels.cache.get(channelId);
                }

                if (!channel) {
                     channel = guild.systemChannel || guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks']));
                }

                if (channel) {
                    await channel.send({ embeds: [embed] });
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                failCount++;
                console.error(`Erro ao enviar notificação global de assalto para guild ${guildId}:`, err);
            }
        }

        console.log(`🌍 [BROADCAST] Assalto global enviado: ${successCount} servidores, ${failCount} falhas`);
    },

    async reply(context, content) {
        // Verificação segura para Interações (Slash, Buttons, etc)
        if (context.isRepliable && context.isRepliable()) {
            const options = typeof content === 'string' ? { content, ephemeral: false } : content;
            if (context.replied || context.deferred) {
                return context.followUp(options);
            }
            return context.reply(options);
        }
        
        // Fallback para Mensagens (Prefix)
        if (context.reply) {
             return context.reply(typeof content === 'string' ? { content, ephemeral: false } : content);
        }
        return context.channel.send(content);
    }
};