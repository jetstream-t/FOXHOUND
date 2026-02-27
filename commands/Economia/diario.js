const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const pets = require('../../pets.json');
const { checkPetStatus } = require('../../systems/petSystem');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('diario')
        .setDescription('Resgate seus suprimentos diário da base'),

    async execute(interaction) {
        await this.handleDaily(interaction, interaction.user);
    },

    async executePrefix(message, args) {
        await this.handleDaily(message, message.author);
    },

    async handleDaily(context, user) {
        const userData = await db.getUser(user.id);
        
        // Sistema de tempo com dayjs e fuso horário de Brasília
        const now = dayjs().tz('America/Sao_Paulo');
        const lastDaily = userData.lastDaily ? dayjs(userData.lastDaily).tz('America/Sao_Paulo') : null;
        
        // Helper de resposta
        const reply = async (content) => {
            if (context.replied || context.deferred) {
                return context.followUp(content);
            }
            if (context.commandName) { // Interaction
                return context.reply({ ...content, ephemeral: true });
            }
            return context.reply(content);
        };

        // Verifica se já pegou hoje (reset às 00:00 BRT)
        if (lastDaily && now.isSame(lastDaily, 'day')) {
            // Calcula tempo até próxima meia-noite BRT
            const nextReset = now.endOf('day').add(1, 'millisecond');
            const timeLeft = nextReset.diff(now);
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
            
            const msg = `❌ Você já pegou seus suprimentos hoje! Volte em **${hours}h e ${minutes}m** (às 00:00).`;
            
            if (context.commandName) { // Interaction
                 return context.reply({ content: msg, ephemeral: true });
            } else {
                 return context.reply(msg);
            }
        }

        let streak = userData.dailyStreak || 0;
        let streakMsg = "";
        
        // Lógica de Streak com janela de tolerância (24h a 48h)
        if (!lastDaily || userData.lastDaily === 0) {
            // Primeiro dia
            streak = 1;
            streakMsg = "\n👋 **Bem-vindo à base!** Primeiro dia de serviço registrado.";
        } else {
            const hoursSinceLastDaily = now.diff(lastDaily, 'hour');
            
            if (hoursSinceLastDaily >= 24 && hoursSinceLastDaily <= 48) {
                // Mantém streak (dentro da janela de tolerância)
                streak = (userData.dailyStreak || 1) + 1;
                streakMsg = `\n🔥 **Sequência:** ${streak} dias!`;
            } else if (hoursSinceLastDaily < 24) {
                // Mesmo dia (já verificado acima) ou muito cedo
                streak = userData.dailyStreak || 1;
                streakMsg = `\n🔥 **Sequência:** ${streak} dias!`;
            } else {
                // Perdeu streak (mais de 48h)
                streak = 1;
                streakMsg = "\n⚠️ **Sequência perdida!** Você ficou muito tempo sem comparecer e voltou para o Dia 1.";
            }
        }

        // Base 500 + Bônus de Streak (50 por dia, max 500 extra)
        const baseAmount = 500;
        const streakBonus = Math.min((streak - 1) * 50, 500);
        let totalAmount = baseAmount + streakBonus;

        if (streakBonus > 0) streakMsg += ` (+${streakBonus} bônus)`;

        // --- SISTEMA DE PET ---
        let activePet = await db.getActivePet(user.id);
        let petMsg = "";
        
        // Atualiza status do pet antes de calcular bônus
        if (activePet) {
            const updatedPet = await checkPetStatus(activePet, user, context.client);
            if (!updatedPet) {
                // Pet morreu :(
                activePet = null;
                petMsg = "\n💀 **Seu pet morreu antes de poder ajudar...** Verifique seus DMs ou o canal de logs.";
            } else {
                activePet = updatedPet;
            }
        }
        
        let petBonus = 0;

        if (activePet) {
            // 1. Ganho de XP e Gasto de Energia
            const xpGain = 20; // Fixo por dia
            const energyCost = 5;

            // Verificar se tem energia para dar bônus
            if (activePet.energy > 0) {
                // Bônus de Companheiro: 10% fixo por ter pet ativo + energia
                petBonus = Math.floor(totalAmount * 0.10);
                
                // Verificar passivas escalonadas (N1, N5, N10)
                const template = pets.find(p => p.id === activePet.petId);
                if (template) {
                    const level = activePet.level || 1;
                    const activePassives = [];
                    if (level >= 1 && template.passive.n1) activePassives.push(template.passive.n1);
                    if (level >= 5 && template.passive.n5) activePassives.push(template.passive.n5);
                    if (level >= 10 && template.passive.n10) activePassives.push(template.passive.n10);

                    // Processar passivas de DIÁRIO
                    for (const p of activePassives) {
                        // Hamster Incansável N1: Renda passiva diária
                        if (p.type === 'passive_income') {
                            const income = p.value || 100;
                            petBonus += income;
                            petMsg += `\n🐹 **${activePet.name}** gerou +${income} Foxies de renda passiva!`;
                        }
                        
                        // Hamster Incansável N5: Chance de moedas extras
                        if (p.type === 'login_bonus') {
                            if (Math.random() < p.value) { // login_bonus value is chance? No, value is 0.10 (10% chance?) or amount?
                                // pets.json: "value": 0.10, "desc": "Chance de gerar moedas extras ao logar"
                                // Usually value is the chance.
                                // Let's assume value is chance, and amount is fixed or % of total.
                                const extra = Math.floor(totalAmount * 0.5); // 50% extra
                                petBonus += extra;
                                petMsg += `\n🐹 **${activePet.name}** encontrou um estoque escondido (+${extra} moedas)!`;
                            }
                        }

                        // Hamster Incansável N10: Chance de item comum
                        if (p.type === 'login_item') {
                            if (Math.random() < p.value) {
                                const commonItems = require('../../items.json').filter(i => i.rarity === 'comum');
                                if (commonItems.length > 0) {
                                    const item = commonItems[Math.floor(Math.random() * commonItems.length)];
                                    await db.addItem(user.id, item.id, 1);
                                    petMsg += `\n🎁 **${activePet.name}** encontrou um item: **${item.name}**!`;
                                }
                            }
                        }

                        // Andarilho Cósmico N5: Chance de item raro
                        if (p.type === 'login_rare_item') {
                            if (Math.random() < p.value) {
                                const rareItems = require('../../items.json').filter(i => i.rarity === 'raro');
                                if (rareItems.length > 0) {
                                    const item = rareItems[Math.floor(Math.random() * rareItems.length)];
                                    await db.addItem(user.id, item.id, 1);
                                    petMsg += `\n🌠 **${activePet.name}** trouxe um presente das estrelas: **${item.name}**!`;
                                }
                            }
                        }

                        // Porco Guardião N10: Chance de juros extras diários
                        if (p.type === 'bank_extra_interest') {
                            if (Math.random() < p.value) {
                                const interest = Math.floor(userData.bank * 0.01); // 1% do banco
                                const cappedInterest = Math.min(interest, 5000); // Cap de 5k
                                if (cappedInterest > 0) {
                                    await db.updateUser(user.id, { bank: userData.bank + cappedInterest });
                                    petMsg += `\n🐷 **${activePet.name}** gerou **${cappedInterest} Foxies** de juros extras!`;
                                }
                            }
                        }

                        // Porco Guardião N1: Juros Diários (Bônus Leve)
                        if (p.type === 'bank_interest') {
                            const interestRate = p.value || 0.005; // 0.5%
                            const interest = Math.floor(userData.bank * interestRate);
                            const cappedInterest = Math.min(interest, 2500); // Cap de 2.5k
                            
                            if (cappedInterest > 0) {
                                await db.updateUser(user.id, { bank: userData.bank + cappedInterest });
                                petMsg += `\n🐷 **${activePet.name}** rendeu **${cappedInterest} Foxies** de juros bancários.`;
                            }
                        }

                        // Cão de Guerra Cibernético N5: Bônus adicional leve no banco
                        if (p.type === 'bank_bonus_light') {
                            const interestRate = p.value || 0.003; // 0.3%
                            const interest = Math.floor(userData.bank * interestRate);
                            const cappedInterest = Math.min(interest, 1500); // Cap de 1.5k

                            if (cappedInterest > 0) {
                                await db.updateUser(user.id, { bank: userData.bank + cappedInterest });
                                petMsg += `\n🦿 **${activePet.name}** processou **${cappedInterest} Foxies** de dividendos táticos.`;
                            }
                        }
                        
                        // Pombo de Campo N5: Chance de reduzir cooldown do diário
                        if (p.type === 'daily_cooldown_reduce') {
                            if (Math.random() < p.value) {
                                // Reduz 1 hora do lastDaily, efetivamente adiantando o próximo
                                // A lógica de update no final usa 'now'. Vamos ajustar lá.
                                petMsg += `\n🐦 **${activePet.name}** adiantou seu próximo suprimento em 1 hora!`;
                            }
                        }

                        // Bônus Global (Legacy/Cão de Guerra)
                        if (p.type === 'all_stats') {
                             const extraBonus = Math.floor(totalAmount * p.value);
                             petBonus += extraBonus;
                        }
                    }
                }

                totalAmount += petBonus;
                if (!petMsg.includes("gerou") && !petMsg.includes("encontrou") && petBonus > 0) {
                     petMsg += `\n🐕 **${activePet.name}** ajudou a carregar **${petBonus} Foxies** extras!`;
                }
            } else {
                petMsg = `\n🐕 **${activePet.name}** está muito cansado para ajudar (0 energia).`;
            }

            // Processar XP e Level Up
            let newXp = activePet.xp + xpGain;
            let newLevel = activePet.level || 1;
            let newEnergy = Math.max(0, activePet.energy - energyCost);
            const xpNeeded = newLevel * 100;

            if (newLevel < 10 && newXp >= xpNeeded) {
                newLevel++;
                newXp -= xpNeeded;
                newEnergy = 100; // Refill
                petMsg += `\n🎉 **LEVEL UP!** ${activePet.name} subiu para o **Nível ${newLevel}**!`;
            } else if (newLevel >= 10) {
                newXp = Math.min(newXp, newLevel * 100);
            }

            await db.updatePet(activePet.id, {
                xp: newXp,
                level: newLevel,
                energy: newEnergy
            });
            
            petMsg += ` (+${xpGain} XP)`;
        }
        
        // Calcular novo lastDaily (timestamp atual)
        const newLastDaily = now.valueOf();
        
        /* Lógica de Cooldown do Pombo desativada para sistema de reset fixo às 00:00
           (Reduzir 1h não permite pegar novamente se o reset é meia-noite)
        if (petMsg.includes("adiantou seu próximo suprimento")) {
            newLastDaily = now.getTime() - (60 * 60 * 1000);
        }
        */

        await db.updateUser(user.id, {
            wallet: userData.wallet + totalAmount,
            lastDaily: newLastDaily,
            dailyStreak: streak
        });

        // --- MISSÕES ---
        try {
            const missionSystem = require('../../systems/missionSystem');
            await missionSystem.checkMission(user.id, 'daily_claim', 1, context);
        } catch (err) {
            console.error('Erro ao atualizar missão de diário:', err);
        }

        const embed = new EmbedBuilder()
            .setTitle('📦 Suprimentos Recebidos')
            .setDescription(`Aqui está o seu pagamento diário de **${totalAmount} Foxies**.\n` + 
                          `(Base: ${baseAmount} | Bônus Streak: ${streakBonus})${streakMsg}${petMsg}\n\n` + 
                          `Não gaste tudo em um só lugar, soldado.`)
            .setColor(colors.success)
            .setFooter({ text: `Volte amanhã para aumentar sua sequência!` });

        await reply({ embeds: [embed] });
    }
};
