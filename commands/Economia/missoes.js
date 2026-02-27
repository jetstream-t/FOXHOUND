const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database');
const missionSystem = require('../../systems/missionSystem');
const colors = require('../../colors.json');
const items = require('../../items.json');
const petItems = require('../../pet_items.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('missoes')
        .setDescription('Veja suas missões diárias e resgate recompensas'),

    async execute(interaction) {
        await this.showMissions(interaction);
    },

    async executePrefix(message, args) {
        await this.showMissions(message);
    },

    async showMissions(context) {
        const user = context.user || context.author;
        
        // Garante que as missões existam
        await missionSystem.checkMission(user.id, 'check_only', 0, context);
        
        const userData = await db.getUser(user.id);
        const missions = userData.dailyMissions;

        if (!missions || !missions.tasks || missions.tasks.length === 0) {
            return context.reply({ content: '❌ Erro ao carregar missões. Tente novamente em alguns segundos.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(colors.default)
            .setTitle(`📜 Missões Diárias - ${missions.date}`)
            .setDescription('Complete os desafios abaixo para ganhar recompensas valiosas!')
            .setFooter({ text: 'As missões resetam todo dia à meia-noite.' });

        const row = new ActionRowBuilder();
        let hasClaimable = false;

        missions.tasks.forEach((task, index) => {
            const status = task.claimed ? '✅ Resgatado' : (task.completed ? '🎉 **PRONTO**' : '⏳ Em andamento');
            const progressPercent = Math.min(100, Math.floor((task.progress / task.goal) * 100));
            const bar = this.progressBar(task.progress, task.goal);
            
            let rewardText = `💰 $${task.rewardValue}`;
            if (task.rewardType === 'item') {
                const item = items.find(i => i.id === task.rewardValue) || petItems.find(i => i.id === task.rewardValue);
                const itemName = item ? item.name : task.rewardValue;
                rewardText = `🎒 ${itemName}`;
            }

            embed.addFields({
                name: `${index + 1}. ${task.description}`,
                value: `**Progresso:** ${task.progress}/${task.goal} (${progressPercent}%)\n${bar}\n**Recompensa:** ${rewardText}\n**Status:** ${status}`,
                inline: false
            });

            if (task.completed && !task.claimed) {
                hasClaimable = true;
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`mission_claim_${task.id}`)
                        .setLabel(`Resgatar Missão ${index + 1}`)
                        .setStyle(ButtonStyle.Success)
                );
            }
        });

        if (!hasClaimable) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('mission_check')
                    .setLabel('Atualizar')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
        }

        const payload = { embeds: [embed], components: [row] };
        if (context.reply) {
            await context.reply({ ...payload, ephemeral: true });
        } else {
            await context.channel.send(payload);
        }
    },

    async handleButton(interaction) {
        const { customId, user } = interaction;
        
        if (!customId.startsWith('mission_claim_')) return;
        
        const missionId = customId.replace('mission_claim_', '');
        const userData = await db.getUser(user.id);
        const missions = userData.dailyMissions;
        
        const taskIndex = missions.tasks.findIndex(t => t.id === missionId);
        if (taskIndex === -1) {
            return interaction.reply({ content: '❌ Missão não encontrada.', ephemeral: true });
        }
        
        const task = missions.tasks[taskIndex];
        if (task.claimed) {
            return interaction.reply({ content: '❌ Você já resgatou essa missão.', ephemeral: true });
        }
        if (!task.completed) {
            return interaction.reply({ content: '❌ Missão ainda não completada.', ephemeral: true });
        }
        
        // Processar recompensa
        if (task.rewardType === 'money') {
            await db.addMoney(user.id, task.rewardValue);
        } else if (task.rewardType === 'item') {
            await db.addItem(user.id, task.rewardValue, 1);
        }
        
        // Marcar como resgatado
        task.claimed = true;
        
        // Salvar (atualiza o objeto inteiro)
        // Precisamos atualizar o array no banco
        missions.tasks[taskIndex] = task;
        await db.updateUser(user.id, { dailyMissions: missions });
        
        // Atualizar a mensagem original
        let rewardMsg = `$${task.rewardValue}`;
        if (task.rewardType === 'item') {
            const item = items.find(i => i.id === task.rewardValue) || petItems.find(i => i.id === task.rewardValue);
            rewardMsg = `1x ${item ? item.name : task.rewardValue}`;
        }
        
        await interaction.update({ content: `✅ **Recompensa resgatada!** Você recebeu: ${rewardMsg}`, components: [] });
        
        // Re-enviar o painel atualizado (opcional, mas bom UX)
        // await this.showMissions(interaction); // Pode dar erro de "interaction already replied" se não for cuidado.
        // Melhor deixar o usuário usar o comando de novo ou editar a mensagem.
        // O update acima já remove os botões, o que é um bom feedback.
    },

    progressBar(current, total, size = 10) {
        const percentage = Math.min(1, Math.max(0, current / total));
        const progress = Math.round(size * percentage);
        const empty = size - progress;
        return '🟩'.repeat(progress) + '⬜'.repeat(empty);
    }
};
