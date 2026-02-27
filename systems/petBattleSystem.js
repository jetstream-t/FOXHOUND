const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');
const pets = require('../pets.json');
const colors = require('../colors.json');
const petSystem = require('./petSystem');

// --- CONFIGURAÇÃO DE STATUS ---
const RARITY_MULT = {
    'comum': 1.0,
    'incomum': 1.2,
    'raro': 1.5,
    'épico': 2.0,
    'lendário': 3.0
};

// Status Base Padrão
const DEFAULT_STATS = { hp: 100, atk: 15, def: 5, spd: 10 };

// Overrides específicos por Pet
const PET_STATS = {
    'cao_sentinela': { hp: 110, atk: 15, def: 10, spd: 10 },
    'gato_sombra':   { hp: 80,  atk: 22, def: 5,  spd: 20 },
    'rato_engenhoso':{ hp: 70,  atk: 12, def: 5,  spd: 25 },
    'pombo_campo':   { hp: 60,  atk: 10, def: 2,  spd: 30 },
    'peixe_guardiao':{ hp: 90,  atk: 10, def: 15, spd: 5 },
    'hamster_incansavel': { hp: 80, atk: 15, def: 5, spd: 20 },
    'aguia_vigia':   { hp: 90,  atk: 25, def: 5,  spd: 18 },
    'pastor_defesa': { hp: 130, atk: 12, def: 20, spd: 8 },
    'cobra_guarda':  { hp: 90,  atk: 28, def: 2,  spd: 15 },
    'urso_blindado': { hp: 160, atk: 18, def: 25, spd: 5 },
    'fenix_solar':   { hp: 120, atk: 30, def: 10, spd: 15 }
};

const activeBattles = new Map();

module.exports = {
    calculateStats(pet) {
        // pet é o objeto do banco de dados (PetSchema)
        const petTemplate = pets.find(p => p.id === pet.petId) || { rarity: 'comum' };
        
        const base = PET_STATS[pet.petId] || DEFAULT_STATS;
        const mult = RARITY_MULT[petTemplate.rarity] || 1.0;
        const level = pet.level || 1;

        // Fórmula: Base + (Level * Scale) * RarityMult
        return {
            maxHp: Math.floor(((base.hp * 3) + (level * 30)) * mult), // HP Triplicado para batalhas mais longas
            atk: Math.floor((base.atk + (level * 2)) * mult),
            def: Math.floor((base.def + (level * 1)) * mult),
            spd: Math.floor((base.spd + (level * 0.5)) * mult),
            name: pet.name,
            currentHp: Math.floor(((base.hp * 3) + (level * 30)) * mult),
            originalName: pet.name,
            level: level,
            rarity: petTemplate.rarity
        };
    },

    async startDuelRequest(interaction, targetUserId) {
        try {
            // Verifica se já não foi respondida (segurança)
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const challengerId = interaction.user.id;
            
            if (challengerId === targetUserId) {
                return interaction.followUp({ content: '❌ Você não pode duelar consigo mesmo!', ephemeral: true });
            }

            // Verificação de Limite Diário (Desafiante)
            const challengerUser = await db.getUser(challengerId);
            
            // Data em BRT
            const now = new Date();
            const [day, month, year] = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/');
            const today = `${year}-${month}-${day}`;
            
            if (challengerUser.dailyBattles.date !== today) {
                challengerUser.dailyBattles.date = today;
                challengerUser.dailyBattles.count = 0;
                await challengerUser.save();
            }

            if (challengerUser.dailyBattles.count >= 5) {
                return interaction.followUp({ content: `❌ Você já atingiu o limite de **5 batalhas diárias** hoje! Tente novamente amanhã.`, ephemeral: true });
            }

            const challengerPet = await db.getActivePet(challengerId);
            const targetPet = await db.getActivePet(targetUserId);

            if (!challengerPet) return interaction.followUp({ content: '❌ Você precisa de um pet equipado para duelar!', ephemeral: true });
            if (!targetPet) return interaction.followUp({ content: '❌ O oponente não tem um pet equipado!', ephemeral: true });

            if (challengerPet.energy < 20) return interaction.followUp({ content: '❌ Seu pet está muito cansado (min 20% energia).', ephemeral: true });
            if (targetPet.energy < 20) return interaction.followUp({ content: '❌ O pet do oponente está muito cansado.', ephemeral: true });

            // Verificar permissões do canal antes de enviar
            if (!interaction.channel) {
                 return interaction.followUp({ content: '❌ Não é possível iniciar duelos neste contexto (sem canal acessível).', ephemeral: true });
            }

            // PERGUNTA SOBRE APOSTA (MODAL)
            // Como não podemos abrir modal em interação deferred/replied, enviamos uma mensagem com botão para definir aposta
            // Mas espera, o startDuelRequest é chamado de um select menu ou botão, e já demos deferUpdate.
            // Então não podemos abrir modal agora.
            // Vamos mudar o fluxo:
            // 1. O usuário clica em "Duelar" e escolhe o oponente.
            // 2. O bot pergunta "Quer apostar dinheiro?" (Botões: Sim / Não)
            // 3. Se Sim -> Abre Modal de valor -> Envia desafio
            // 4. Se Não -> Envia desafio direto (aposta 0)
            
            // Para simplificar e evitar o problema do modal em deferred, vamos enviar uma mensagem ephemeral com botões de aposta rápida ou customizada?
            // Não, o modal é melhor. Mas como já demos deferUpdate, o modal falharia.
            // SOLUÇÃO: Não dar deferUpdate no pet.js antes de chamar aqui?
            // O pet.js chama startDuelRequest.
            
            // Vamos enviar uma mensagem efêmera perguntando o valor da aposta.
            // Como é efêmera, só o desafiante vê.
            
            const betEmbed = new EmbedBuilder()
                .setColor(colors.default)
                .setTitle('💰 Aposta da Rinha')
                .setDescription('Deseja apostar dinheiro nesta batalha?')
                .setFooter({ text: 'Selecione uma opção abaixo' });

            const betRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_bet_0_${targetUserId}`).setLabel('Sem Aposta (Amistoso)').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`pet_bet_100_${targetUserId}`).setLabel('Apostar 100').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pet_bet_1000_${targetUserId}`).setLabel('Apostar 1.000').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`pet_bet_custom_${targetUserId}`).setLabel('Outro Valor...').setStyle(ButtonStyle.Primary)
            );

            await interaction.followUp({ embeds: [betEmbed], components: [betRow], ephemeral: true });
            
            // O fluxo continua no handleDuelInteraction quando ele clicar no botão de aposta
            
        } catch (error) {
            console.error('Erro em startDuelRequest:', error);
            // ...
        }
    },

    // Novo método para processar a escolha da aposta e efetivamente enviar o desafio
    async processDuelBet(interaction, targetUserId, betAmount) {
         try {
            const challengerId = interaction.user.id;
            
            // Validação de Saldo se tiver aposta
            if (betAmount > 0) {
                const user = await db.getUser(challengerId);
                if (user.wallet < betAmount) {
                    return interaction.reply({ content: `❌ Você não tem **$${betAmount}** na carteira para apostar!`, ephemeral: true });
                }
            }

            const challengerPet = await db.getActivePet(challengerId);
            const targetPet = await db.getActivePet(targetUserId);
            
            // Re-validações básicas (caso tenha passado tempo)
            if (!challengerPet || !targetPet) return interaction.reply({ content: '❌ Erro nos pets.', ephemeral: true });

            const battleId = `battle_${challengerId}_${targetUserId}_${Date.now()}`;
            
            activeBattles.set(battleId, {
                challenger: challengerId,
                target: targetUserId,
                cPetData: challengerPet, 
                tPetData: targetPet,     
                status: 'pending',
                bet: betAmount // Nova propriedade
            });

            const embed = new EmbedBuilder()
                .setColor(colors.warning)
                .setTitle('⚔️ Desafio de Pets!')
                .setDescription(`<@${challengerId}> desafiou <@${targetUserId}> para uma rinha de pets!\n\n**${challengerPet.name}** vs **${targetPet.name}**\n\n💰 **Aposta:** ${betAmount > 0 ? `**$${betAmount.toLocaleString()}**` : 'Nenhuma'}\n⚠️ **Aviso:** O perdedor perde energia e tem **10% de chance de MORRER** permanentemente!`)
                .setFooter({ text: 'Custo: 20 Energia | Recompensa: XP' + (betAmount > 0 ? ' + Aposta' : '') });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pet_duel_accept_${battleId}`).setLabel(`Aceitar ${betAmount > 0 ? `(-$${betAmount})` : ''}`).setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
                new ButtonBuilder().setCustomId(`pet_duel_deny_${battleId}`).setLabel('Fugir').setStyle(ButtonStyle.Secondary).setEmoji('🏃')
            );

            await interaction.channel.send({ 
                content: `<@${targetUserId}>`, 
                embeds: [embed], 
                components: [row] 
            });

            await interaction.reply({ content: `✅ **Desafio enviado com aposta de $${betAmount}!**`, ephemeral: true });

         } catch (error) {
             console.error('Erro em processDuelBet:', error);
             await interaction.reply({ content: '❌ Erro ao processar aposta.', ephemeral: true }).catch(() => {});
         }
    },

    async handleDuelInteraction(interaction) {
        const customId = interaction.customId;
        const action = customId.startsWith('pet_duel_accept_') ? 'accept' : 'deny';
        const battleId = customId.replace(`pet_duel_${action}_`, '');

        const battle = activeBattles.get(battleId);
        if (!battle) return interaction.reply({ content: '❌ Este desafio expirou.', ephemeral: true });

        // Previne cliques duplos ou condições de corrida
        if (battle.processing) return interaction.reply({ content: '⏳ Processando...', ephemeral: true });
        
        if (interaction.user.id !== battle.target) {
            return interaction.reply({ content: '❌ Apenas o desafiado pode aceitar!', ephemeral: true });
        }

        if (action === 'deny') {
            activeBattles.delete(battleId);
            return interaction.update({ content: `🏃 <@${interaction.user.id}> fugiu do desafio!`, embeds: [], components: [] });
        }

        // Marca como processando para evitar race conditions
        battle.processing = true;

        try {
            // ACEITOU!
            // Verificação Final de Limites Diários
            const user1 = await db.getUser(battle.challenger);
            const user2 = await db.getUser(battle.target);
            
            // Data em BRT
            const now = new Date();
            const [day, month, year] = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/');
            const today = `${year}-${month}-${day}`;

            // Atualiza/Reseta Desafiante
            if (user1.dailyBattles.date !== today) {
                user1.dailyBattles.date = today;
                user1.dailyBattles.count = 0;
            }
            // Atualiza/Reseta Desafiado
            if (user2.dailyBattles.date !== today) {
                user2.dailyBattles.date = today;
                user2.dailyBattles.count = 0;
            }

            if (user1.dailyBattles.count >= 3) {
                activeBattles.delete(battleId);
                return interaction.update({ content: `❌ O desafiante <@${user1.userId}> atingiu o limite de batalhas hoje!`, embeds: [], components: [] });
            }

            if (user2.dailyBattles.count >= 3) {
                activeBattles.delete(battleId);
                return interaction.update({ content: `❌ Você atingiu seu limite de **3 batalhas diárias** hoje!`, embeds: [], components: [] });
            }

            // VERIFICAÇÃO DE APOSTA (NOVA)
            if (battle.bet && battle.bet > 0) {
                if (user1.wallet < battle.bet) {
                    activeBattles.delete(battleId);
                    return interaction.update({ content: `❌ O desafiante não tem saldo suficiente para a aposta de **$${battle.bet}**!`, embeds: [], components: [] });
                }
                if (user2.wallet < battle.bet) {
                    activeBattles.delete(battleId);
                    return interaction.update({ content: `❌ Você não tem saldo suficiente para cobrir a aposta de **$${battle.bet}**!`, embeds: [], components: [] });
                }

                // Deduz a aposta de ambos (SEGURA NO COFRE ATÉ O FIM)
                await db.addMoney(battle.challenger, -battle.bet);
                await db.addMoney(battle.target, -battle.bet);
                
                // Marca que o dinheiro foi deduzido para permitir reembolso em caso de erro
                battle.moneyDeducted = true;
            }

            // Incrementa contadores
            user1.dailyBattles.count++;
            user2.dailyBattles.count++;
            await user1.save();
            await user2.save();

            const p1Db = await db.getActivePet(battle.challenger);
            const p2Db = await db.getActivePet(battle.target);

            if (!p1Db || !p2Db) {
                // REEMBOLSO EM CASO DE ERRO
                if (battle.moneyDeducted) {
                    await db.addMoney(battle.challenger, battle.bet);
                    await db.addMoney(battle.target, battle.bet);
                }
                activeBattles.delete(battleId);
                return interaction.update({ content: '❌ Um dos pets não existe mais. Aposta devolvida.', components: [] });
            }

            // Deduzir energia
            p1Db.energy = Math.max(0, p1Db.energy - 20);
            p2Db.energy = Math.max(0, p2Db.energy - 20);
            await p1Db.save();
            await p2Db.save();

            const p1Stats = this.calculateStats(p1Db);
            const p2Stats = this.calculateStats(p2Db);

            const combatState = {
                p1: { ...p1Stats, id: battle.challenger, dbId: p1Db.id, user: battle.challenger },
                p2: { ...p2Stats, id: battle.target, dbId: p2Db.id, user: battle.target },
                logs: [],
                turn: 1
            };

            // Iniciativa
            combatState.current = p1Stats.spd >= p2Stats.spd ? combatState.p1 : combatState.p2;
            combatState.opponent = combatState.current === combatState.p1 ? combatState.p2 : combatState.p1;

            await interaction.update({ content: '⚔️ **A BATALHA COMEÇOU!**', embeds: [this.renderBattleEmbed(combatState)], components: [] });

            this.runBattleLoop(interaction, combatState);

        } catch (error) {
            console.error('Erro em handleDuelInteraction:', error);
            // REEMBOLSO DE SEGURANÇA
            if (battle && battle.moneyDeducted) {
                await db.addMoney(battle.challenger, battle.bet);
                await db.addMoney(battle.target, battle.bet);
                console.log(`[PET DUEL] Reembolso de segurança efetuado para batalha ${battleId}`);
            }
            activeBattles.delete(battleId);
            if (!interaction.replied) {
                return interaction.reply({ content: '❌ Ocorreu um erro ao iniciar a batalha. Aposta devolvida.', ephemeral: true }).catch(() => {});
            }
        }
    },

    renderBattleEmbed(state) {
        const p1 = state.p1;
        const p2 = state.p2;

        const bar = (curr, max) => {
            const total = 10;
            const progress = Math.max(0, Math.min(total, Math.ceil((curr / max) * total)));
            return '█'.repeat(progress) + '░'.repeat(total - progress);
        };

        const lastLogs = state.logs.slice(-5).join('\n');

        return new EmbedBuilder()
            .setColor(colors.danger)
            .setTitle(`🥊 Rinha: ${p1.name} vs ${p2.name}`)
            .setDescription(`
**${p1.name}** (HP: ${p1.currentHp}/${p1.maxHp})
\`[${bar(p1.currentHp, p1.maxHp)}]\`

🆚

**${p2.name}** (HP: ${p2.currentHp}/${p2.maxHp})
\`[${bar(p2.currentHp, p2.maxHp)}]\`

📜 **Histórico de Combate:**
${lastLogs || '*Os pets estão se encarando...*'}
            `);
    },

    async runBattleLoop(interaction, state) {
        const interval = setInterval(async () => {
            const attacker = state.current;
            const defender = state.opponent;

            // Esquiva
            const dodgeChance = 0.05 + (Math.max(0, defender.spd - attacker.spd) * 0.01);
            let damage = 0;
            let log = '';

            if (Math.random() < dodgeChance) {
                log = `💨 **${defender.name}** desviou do ataque de **${attacker.name}**!`;
            } else {
                const isCrit = Math.random() < 0.10;
                const critMult = isCrit ? 1.5 : 1.0;

                const rawDmg = (attacker.atk * (0.8 + Math.random() * 0.4)) * critMult;
                const mitigation = defender.def * 0.3;
                damage = Math.floor(Math.max(1, rawDmg - mitigation));

                defender.currentHp -= damage;
                if (defender.currentHp < 0) defender.currentHp = 0;

                const icon = isCrit ? '💥 **CRÍTICO!**' : '👊';
                log = `${icon} **${attacker.name}** causou **${damage}** de dano em **${defender.name}**!`;
            }

            state.logs.push(log);

            if (defender.currentHp <= 0) {
                clearInterval(interval);
                state.winner = attacker;
                state.loser = defender;
                await this.finishBattle(interaction, state);
                return;
            }

            // Troca turno
            const temp = state.current;
            state.current = state.opponent;
            state.opponent = temp;
            state.turn++;

            try {
                await interaction.editReply({ embeds: [this.renderBattleEmbed(state)] });
            } catch (e) {
                clearInterval(interval);
            }

        }, 2500); // 2.5s por turno para dar tempo de ler
    },

    async finishBattle(interaction, state) {
        const winner = state.winner;
        const loser = state.loser;

        // Recompensas
        const xpGain = 50 + Math.floor(Math.random() * 50); // 50-100 XP
        const winnerPet = await db.getPet(winner.dbId);
        let levelUpMsg = '';
        let betMsg = '';

        // Pagamento da Aposta
        if (state.bet && state.bet > 0) {
            const totalPrize = state.bet * 2;
            await db.addMoney(winner.user, totalPrize);
            betMsg = `\n💰 **APOSTA:** <@${winner.user}> faturou **$${totalPrize.toLocaleString()}**!`;
        }
        
        if (winnerPet) {
            winnerPet.xp += xpGain;
            winnerPet.battlesWon = (winnerPet.battlesWon || 0) + 1;
            
            if (winnerPet.xp >= winnerPet.level * 100) {
                winnerPet.xp -= winnerPet.level * 100;
                winnerPet.level++;
                levelUpMsg = `\n🆙 **LEVEL UP!** ${winner.name} subiu para o nível ${winnerPet.level}!`;
            }
            await winnerPet.save();
        }

        // Punição (Morte 10%)
        const deathChance = 0.10;
        const isDead = Math.random() < deathChance;
        let deathMsg = '';
        let finalEmbedColor = colors.gold;

        if (isDead) {
            // Buscar pet e user completos para o funeral
            const fullLoserPet = await db.getPet(loser.dbId);
            const fullLoserUser = await db.getUser(loser.user);

            if (fullLoserPet && fullLoserUser) {
                // Chama o sistema de funeral (remove o pet e notifica no canal)
                // Usando o nome do pet vencedor na mensagem de morte
                await petSystem.handlePetDeath(fullLoserPet, fullLoserUser, interaction.client, `Caiu em combate contra ${winner.name} (Dono: <@${winner.user}>)`);
                
                deathMsg = `\n💀 **FATALIDADE!**\n**${loser.name}** não resistiu aos ferimentos graves e faleceu. F.\nUm funeral militar foi realizado.`;
                finalEmbedColor = colors.danger;
            } else {
                // Fallback se algo der errado na busca
                await db.deletePet(loser.dbId);
                deathMsg = `\n💀 **FATALIDADE!**\n**${loser.name}** faleceu.`;
                finalEmbedColor = colors.danger;
            }
            
            // Notificar dono do pet morto na DM se possível
            try {
                const loserUser = await interaction.client.users.fetch(loser.user);
                await loserUser.send(`💀 **Seu pet morreu em combate!**\nInfelizmente, **${loser.name}** faleceu durante a rinha contra o pet de <@${winner.user}>.`);
            } catch (e) {}

        } else {
            const loserPet = await db.getPet(loser.dbId);
            if (loserPet) {
                loserPet.xp += 10; // XP de consolação
                await loserPet.save();
            }
            deathMsg = `\n🤕 **${loser.name}** foi nocauteado, mas passa bem.\nGanhou +10 XP de consolação.`;
        }

        const embed = new EmbedBuilder()
            .setColor(finalEmbedColor)
            .setTitle(`🏆 Vitória de ${winner.name}!`)
            .setDescription(`
A batalha acabou após ${state.turn} turnos!

👑 **Vencedor:** <@${winner.user}>
📈 **Ganho:** +${xpGain} XP ${levelUpMsg}
${betMsg}

🏳️ **Perdedor:** <@${loser.user}>
${deathMsg}
            `);

        await interaction.editReply({ embeds: [embed], components: [] });
    }
};