const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../../database');
const colors = require('../../colors.json');
const jobs = require('../../jobs.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('emprego')
        .setDescription('Veja a lista de empregos ou entre em uma nova carreira'),

    async execute(interaction) {
        await this.handleJobSystem(interaction, interaction.user);
    },

    async executePrefix(message, args) {
        await this.handleJobSystem(message, message.author);
    },

    async handleJobSystem(context, user) {
        let userData = await db.getUser(user.id);
        
        // FIX: Garantir que inventário seja tratado como Map ou Objeto corretamente
        const inventoryCheck = userData.inventory instanceof Map ? userData.inventory : new Map(Object.entries(userData.inventory || {}));
        
        // Exceção para Trabalho Comunitário (Penalidade)
        // Se o usuário tiver penalidade a cumprir, mostra o status MAS permite ver a lista
        let showOnlyList = false;
        if (userData.workPenalty > 0) {
            const embed = new EmbedBuilder()
                .setTitle('👮 Situação Penal: Trabalho Comunitário')
                .setDescription(`Você possui pendências com a justiça e não pode mudar de emprego.\n\n⚖️ **Pena Restante:** ${userData.workPenalty} turnos de serviço.\n⚠️ **Impacto:** +${userData.workPenalty} min no cooldown de cada trabalho.\n\n**Você pode visualizar a lista de empregos abaixo, mas não pode alterar seu cargo atual.**\n\nUtilize o comando \`/trabalhar\` para reduzir sua pena.`)
                .setColor(colors.error);
            
            // Mostra a lista de empregos mesmo com penalidade
            showOnlyList = true;
            
            // Continua para mostrar a lista após este embed
            const response = context.reply ? 
                await context.reply({ embeds: [embed], fetchReply: true }) :
                await context.channel.send({ embeds: [embed] });
        }

        const currentJob = jobs.find(j => j.id === (userData.jobId || 'desempregado'));
        const totalWorks = userData.totalWorks || 0;

        const embed = new EmbedBuilder()
            .setTitle('💼 Agência de Empregos')
            .setDescription(`Seu emprego atual: **${currentJob.name}**\nTrabalhos totais realizados: \`${totalWorks}\`\n\nEscolha um emprego na lista abaixo para ver os requisitos e salário.`)
            .setColor(colors.default)
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('job_select')
            .setPlaceholder('Selecione um emprego para ver detalhes');

        // Adicionar os 20 empregos ao menu
        jobs.forEach(job => {
            // Requisito de Terminal Portátil REMOVIDO
            // Agora todos os empregos são acessíveis apenas com experiência
            
            let isUnlocked = totalWorks >= job.minWorks;

            selectMenu.addOptions({
                label: job.name,
                description: `Req: ${job.minWorks} trabalhos | Salário: ${job.salary[0]}-${job.salary[1]}`,
                value: job.id,
                emoji: isUnlocked ? '✅' : '🔒'
            });
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);

        let response;
        if (showOnlyList) {
            // Se já respondeu com a mensagem de penalidade, edita a mensagem para adicionar a lista
            response = await context.channel.send({ embeds: [embed], components: [row] });
        } else {
            // Resposta normal (primeira interação)
            response = context.reply ? 
                await context.reply({ embeds: [embed], components: [row], fetchReply: true }) :
                await context.channel.send({ embeds: [embed], components: [row] });
        }

        const filter = i => i.customId === 'job_select' && i.user.id === user.id;
        const collector = response.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            const selectedJobId = i.values[0];
            const selectedJob = jobs.find(j => j.id === selectedJobId);
            // FIX: Re-validar inventário dentro do collector
            const inventoryMap = userData.inventory instanceof Map ? userData.inventory : new Map(Object.entries(userData.inventory || {}));
            
            let isUnlocked = totalWorks >= selectedJob.minWorks;

            const detailEmbed = new EmbedBuilder()
                .setTitle(`💼 Detalhes: ${selectedJob.name}`)
                .setColor(isUnlocked ? colors.success : colors.error)
                .addFields(
                    { name: '📋 Requisito', value: `\`${selectedJob.minWorks}\` trabalhos realizados`, inline: true },
                    { name: '💰 Salário Estimado', value: `\`${selectedJob.salary[0]} - ${selectedJob.salary[1]}\` Foxies`, inline: true },
                    { name: '📊 Status', value: isUnlocked ? '🔓 Desbloqueado' : '🔒 Bloqueado', inline: true }
                );

            const buttons = new ActionRowBuilder();
            
            if (isUnlocked && selectedJob.id !== userData.jobId && !showOnlyList) {
                // ... (code continues)
                // Verificar penalidade de troca
                const hasProtection = userData.jobProtection;
                const penaltyPercent = 20; // 20% de perda de progresso
                const penaltyAmount = Math.floor(totalWorks * (penaltyPercent / 100));
                
                let warningMsg = "";
                if (userData.jobId !== 'desempregado') {
                    if (hasProtection) {
                        warningMsg = "\n\n🛡️ **Ordem Oficial Ativa:** Você pode trocar de emprego sem perder progresso.";
                    } else {
                        warningMsg = `\n\n⚠️ **Atenção:** Trocar de carreira custará **${penaltyPercent}% da sua experiência** (${penaltyAmount} trabalhos removidos).\nUse uma **Ordem Oficial** para evitar isso.`;
                    }
                }

                detailEmbed.setDescription('Você atende aos requisitos para este emprego!' + warningMsg);
                const confirmButton = new ButtonBuilder()
                    .setCustomId(`confirm_job_${selectedJob.id}`)
                    .setLabel('Aceitar Oferta')
                    .setStyle(hasProtection || userData.jobId === 'desempregado' ? ButtonStyle.Success : ButtonStyle.Danger);
                buttons.addComponents(confirmButton);
            } else if (selectedJob.id === userData.jobId) {
                detailEmbed.setDescription('Você já está neste emprego.');
            } else if (!isUnlocked) {
                detailEmbed.setDescription(`Você ainda não tem experiência suficiente para este cargo. Faltam \`${selectedJob.minWorks - totalWorks}\` trabalhos.`);
            } else if (showOnlyList) {
                detailEmbed.setDescription('🚫 **Você não pode mudar de emprego enquanto cumpre trabalho comunitário.**\n\nUtilize `/trabalhar` para cumprir sua pena e poder mudar de cargo.');
            }

            await i.update({ embeds: [detailEmbed], components: buttons.components.length > 0 ? [buttons] : [] });

            if (buttons.components.length > 0) {
                const buttonFilter = btn => btn.customId === `confirm_job_${selectedJob.id}` && btn.user.id === user.id;
                const buttonCollector = i.message.createMessageComponentCollector({ filter: buttonFilter, time: 30000, max: 1 });

                buttonCollector.on('collect', async btn => {
                    // Re-verificar proteção
                    const userNow = await db.getUser(user.id);
                    
                    let transferMsg = "";
                    let updates = {};
                    
                    if (userNow.jobId && userNow.jobId !== 'desempregado') {
                        if (userNow.jobProtection) {
                            updates.jobProtection = false; // Consome o item/buff
                            transferMsg = "\n🛡️ **Ordem Oficial utilizada:** Nenhuma experiência foi perdida na transferência.";
                        } else {
                            const penalty = Math.floor(userNow.totalWorks * 0.20);
                            updates.totalWorks = Math.max(0, userNow.totalWorks - penalty);
                            transferMsg = `\n📉 **Mudança de Carreira:** Você perdeu **${penalty}** pontos de experiência profissional.`;
                        }
                    }

                    updates.jobId = selectedJob.id;
                    await db.updateUser(user.id, updates);

                    const successEmbed = new EmbedBuilder()
                        .setTitle('✅ Novo Emprego!')
                        .setDescription(`Parabéns! Você agora trabalha como **${selectedJob.name}**.\nSuas novas ferramentas e uniformes já foram entregues.${transferMsg}`)
                        .setColor(colors.success)
                        .setTimestamp();

                    await btn.update({ embeds: [successEmbed], components: [] });
                });
            }
        });
    }
};
